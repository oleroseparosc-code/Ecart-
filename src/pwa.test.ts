import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildPwaAssetUrl, getPwaMetadata, shouldReloadAfterServiceWorkerUpdate } from "./pwa";

const iconVersion = "20260720a";

function readPngSize(path: string) {
  const bytes = readFileSync(path);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readPngAlphaBounds(path: string) {
  const bytes = readFileSync(path);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`Unsupported PNG format for alpha bounds: ${path}`);
  }

  const idatChunks: Buffer[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === "IDAT") idatChunks.push(bytes.subarray(dataStart, dataEnd));
    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rows: Uint8Array[] = [];
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const current = Uint8Array.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    const previous = rows[y - 1];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous?.[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? (previous?.[x - bytesPerPixel] ?? 0) : 0;
      current[x] =
        (current[x] +
          (filterType === 1
            ? left
            : filterType === 2
              ? up
              : filterType === 3
                ? Math.floor((left + up) / 2)
                : filterType === 4
                  ? paeth(left, up, upLeft)
                  : 0)) &
        0xff;
    }
    rows.push(current);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x += 1) {
      if (row[x * bytesPerPixel + 3] <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });

  return {
    left: minX,
    top: minY,
    right: width - 1 - maxX,
    bottom: height - 1 - maxY,
  };
}

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

describe("PWA install metadata", () => {
  it("uses the Vite base path for install assets", () => {
    expect(buildPwaAssetUrl("/Ecart-/", "sw.js")).toBe("/Ecart-/sw.js");
    expect(buildPwaAssetUrl("/Ecart-/", "manifest.webmanifest")).toBe("/Ecart-/manifest.webmanifest");
  });

  it("reloads installed app windows once when a service worker update takes control", () => {
    expect(shouldReloadAfterServiceWorkerUpdate({ wasControlled: true, isReloading: false })).toBe(true);
    expect(shouldReloadAfterServiceWorkerUpdate({ wasControlled: false, isReloading: false })).toBe(false);
    expect(shouldReloadAfterServiceWorkerUpdate({ wasControlled: true, isReloading: true })).toBe(false);
  });

  it("keeps runtime sync config out of the service worker cache", () => {
    const serviceWorker = readFileSync("public/sw.js", "utf8");

    expect(serviceWorker).toContain("sync-config.json");
    expect(serviceWorker).toContain("fetch(request)");
  });

  it("uses a versioned cache name so deployed app bundles can replace stale caches", () => {
    const serviceWorker = readFileSync("public/sw.js", "utf8");

    expect(serviceWorker).toContain('CACHE_NAME = "hospital-inventory-app-v36"');
  });

  it("adds an asset version query to built CSS and JS links", async () => {
    // @ts-ignore build script is plain JavaScript.
    const { versionAssetLinks } = await import("../scripts/create_pwa_routes.mjs");
    const html = [
      '<script type="module" crossorigin src="/Ecart-/assets/index-demo.js"></script>',
      '<link rel="stylesheet" crossorigin href="/Ecart-/assets/index-demo.css">',
    ].join("\n");

    expect(versionAssetLinks(html, "20260720a")).toContain('/Ecart-/assets/index-demo.js?v=20260720a');
    expect(versionAssetLinks(html, "20260720a")).toContain('/Ecart-/assets/index-demo.css?v=20260720a');
  });

  it("selects separate install metadata for the master viewer route", () => {
    expect(getPwaMetadata("/Ecart-/").manifestPath).toBe("manifest.webmanifest");
    expect(getPwaMetadata("/Ecart-/pharmacy-drug-locator")).toEqual({
      manifestPath: "pharmacy-drug-locator.webmanifest",
      iconPath: "icons/pharmacy-drug-locator-icon-192.png",
      documentTitle: "약품 위치 찾기",
      appleTitle: "약품 위치 찾기",
      themeColor: "#E8843C",
    });
    expect(getPwaMetadata("/Ecart-/viewer")).toEqual({
      manifestPath: "viewer.webmanifest",
      iconPath: "icons/viewer-icon-192.png",
      documentTitle: "병동 약품 라벨 마스터관리",
      appleTitle: "병동 약품 라벨 마스터관리",
      themeColor: "#f97316",
    });
    expect(getPwaMetadata("/Ecart-/pharmacy-viewer")).toEqual({
      manifestPath: "pharmacy-viewer.webmanifest",
      iconPath: "icons/app-icon-192.png",
      documentTitle: "약제팀 라벨 마스터 관리",
      appleTitle: "약제팀 라벨 마스터 관리",
      themeColor: "#f97316",
    });
    expect(getPwaMetadata("/Ecart-/narcotic-viewer")).toEqual({
      manifestPath: "narcotic-viewer.webmanifest",
      iconPath: "icons/narcotic-icon-192.png",
      documentTitle: "비치마약류 관리",
      appleTitle: "비치마약류 관리",
      themeColor: "#b91c1c",
    });
  });

  it("defines an installable standalone app manifest", () => {
    const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));

    expect(manifest.name).toBe("비품점검");
    expect(manifest.short_name).toBe("비품점검");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/Ecart-/");
    expect(manifest.start_url).toBe("/Ecart-/inventory/");
    expect(manifest.scope).toBe("/Ecart-/inventory/");
    expect(manifest.background_color).toBe("#f97316");
    expect(manifest.theme_color).toBe("#f97316");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: `/Ecart-/icons/app-icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" }),
        expect.objectContaining({
          src: `/Ecart-/icons/app-icon-desktop-512.png?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
      ]),
    );
    expect(manifest.icons).not.toEqual(expect.arrayContaining([expect.objectContaining({ purpose: expect.stringContaining("maskable") })]));
    expect(manifest.icons).not.toEqual(expect.arrayContaining([expect.objectContaining({ src: expect.stringContaining("app-icon.svg") })]));
    expect(existsSync("public/icons/app-icon-192.png")).toBe(true);
    expect(existsSync("public/icons/app-icon-512.png")).toBe(true);
    expect(existsSync("public/icons/app-icon-desktop-512.png")).toBe(true);
    expect(readPngSize("public/icons/app-icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(readPngSize("public/icons/app-icon-512.png")).toEqual({ width: 512, height: 512 });
    expect(readPngSize("public/icons/app-icon-desktop-512.png")).toEqual({ width: 512, height: 512 });
    expect(readPngAlphaBounds("public/icons/app-icon-desktop-512.png")).toEqual({
      left: expect.any(Number),
      top: expect.any(Number),
      right: expect.any(Number),
      bottom: expect.any(Number),
    });
    expect(Object.values(readPngAlphaBounds("public/icons/app-icon-512.png")).every((inset) => inset >= 100)).toBe(true);
    expect(Object.values(readPngAlphaBounds("public/icons/app-icon-desktop-512.png")).every((inset) => inset >= 30)).toBe(true);
    expect(Object.values(readPngAlphaBounds("public/icons/app-icon-desktop-512.png")).every((inset) => inset < 80)).toBe(true);
  });

  it("defines a separate installable manifest for the master viewer", () => {
    const manifest = JSON.parse(readFileSync("public/viewer.webmanifest", "utf8"));

    expect(manifest.name).toBe("병동 약품 라벨 마스터관리");
    expect(manifest.short_name).toBe("병동 라벨 마스터");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/Ecart-/viewer");
    expect(manifest.start_url).toBe("/Ecart-/viewer/");
    expect(manifest.scope).toBe("/Ecart-/viewer/");
    expect(manifest.background_color).toBe("#f97316");
    expect(manifest.theme_color).toBe("#f97316");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: `/Ecart-/icons/viewer-icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" }),
        expect.objectContaining({
          src: `/Ecart-/icons/viewer-icon-desktop-512.png?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
      ]),
    );
    expect(existsSync("public/icons/viewer-icon-192.png")).toBe(true);
    expect(existsSync("public/icons/viewer-icon-desktop-512.png")).toBe(true);
    expect(readPngSize("public/icons/viewer-icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(readPngSize("public/icons/viewer-icon-desktop-512.png")).toEqual({ width: 512, height: 512 });
    expect(Object.values(readPngAlphaBounds("public/icons/viewer-icon-192.png")).every((inset) => inset > 0)).toBe(true);
    expect(Object.values(readPngAlphaBounds("public/icons/viewer-icon-desktop-512.png")).every((inset) => inset > 0)).toBe(true);
  });

  it("defines a separate installable manifest for the pharmacy label viewer", () => {
    const manifest = JSON.parse(readFileSync("public/pharmacy-viewer.webmanifest", "utf8"));

    expect(manifest.name).toBe("약제팀 라벨 마스터 관리");
    expect(manifest.short_name).toBe("약제팀 라벨 관리");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/Ecart-/pharmacy-viewer");
    expect(manifest.start_url).toBe("/Ecart-/pharmacy-viewer/");
    expect(manifest.scope).toBe("/Ecart-/pharmacy-viewer/");
    expect(manifest.background_color).toBe("#f97316");
    expect(manifest.theme_color).toBe("#f97316");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: `/Ecart-/icons/app-icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" }),
        expect.objectContaining({
          src: `/Ecart-/icons/app-icon-desktop-512.png?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
      ]),
    );
  });

  it("defines a separate installable manifest and icon set for the drug locator", () => {
    const manifest = JSON.parse(readFileSync("public/pharmacy-drug-locator.webmanifest", "utf8"));

    expect(manifest.name).toBe("약품 위치 찾기");
    expect(manifest.short_name).toBe("약품 위치 찾기");
    expect(manifest.id).toBe("/Ecart-/pharmacy-drug-locator");
    expect(manifest.start_url).toBe("/Ecart-/pharmacy-drug-locator/");
    expect(manifest.scope).toBe("/Ecart-/pharmacy-drug-locator/");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/Ecart-/icons/pharmacy-drug-locator-icon-192.png?v=20260814b", sizes: "192x192", type: "image/png", purpose: "any" }),
      expect.objectContaining({ src: "/Ecart-/icons/pharmacy-drug-locator-icon-512.png?v=20260814b", sizes: "512x512", type: "image/png", purpose: "any" }),
    ]));
    expect(readPngSize("public/icons/pharmacy-drug-locator-icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(readPngSize("public/icons/pharmacy-drug-locator-icon-512.png")).toEqual({ width: 512, height: 512 });
  });

  it("defines a separate installable manifest and icon set for the narcotic viewer", () => {
    const manifest = JSON.parse(readFileSync("public/narcotic-viewer.webmanifest", "utf8"));

    expect(manifest.name).toBe("비치마약류 관리");
    expect(manifest.short_name).toBe("비치마약류 관리");
    expect(manifest.display).toBe("standalone");
    expect(manifest.id).toBe("/Ecart-/narcotic-viewer");
    expect(manifest.start_url).toBe("/Ecart-/narcotic-viewer/");
    expect(manifest.scope).toBe("/Ecart-/narcotic-viewer/");
    expect(manifest.background_color).toBe("#b91c1c");
    expect(manifest.theme_color).toBe("#b91c1c");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: `/Ecart-/icons/narcotic-icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" }),
        expect.objectContaining({
          src: `/Ecart-/icons/narcotic-icon-desktop-512.png?v=${iconVersion}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        }),
      ]),
    );
    expect(existsSync("public/icons/narcotic-icon-192.png")).toBe(true);
    expect(existsSync("public/icons/narcotic-icon-desktop-512.png")).toBe(true);
    expect(readPngSize("public/icons/narcotic-icon-192.png")).toEqual({ width: 192, height: 192 });
    expect(readPngSize("public/icons/narcotic-icon-desktop-512.png")).toEqual({ width: 512, height: 512 });
    expect(Object.values(readPngAlphaBounds("public/icons/narcotic-icon-192.png")).every((inset) => inset > 0)).toBe(true);
    expect(Object.values(readPngAlphaBounds("public/icons/narcotic-icon-desktop-512.png")).every((inset) => inset > 0)).toBe(true);
  });

  it("uses base-prefixed desktop favicon and manifest links so viewer routes do not request nested assets", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toContain(`const assetBase = "/Ecart-/";`);
    expect(html).toContain("manifest.href = `${assetBase}${metadata.manifest}?v=${version}`;");
    expect(html).toContain("icon.href = `${assetBase}${metadata.icon}?v=${version}`;");
    expect(html).toContain("appleIcon.href = `${assetBase}${metadata.icon}?v=${version}`;");
    expect(html).toContain(`document.title = metadata.title`);
    expect(html).not.toContain(`%BASE_URL%`);
    expect(html).not.toContain(`/Ecart-/Ecart-/`);
  });
});
