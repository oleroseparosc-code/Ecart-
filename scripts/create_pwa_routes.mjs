import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const appStatePath = path.resolve("app-state", "shared-state.json");
const routes = ["inventory", "viewer", "pharmacy-viewer", "pharmacy-label-editor", "pharmacy-label-editor/v2", "pharmacy-drug-locator", "narcotic-viewer"];
const assetVersion = "20260821a";
const routeInstallMetadata = {
  "pharmacy-drug-locator": {
    title: "약품 라벨 스캔",
    manifestPath: "pharmacy-drug-locator.webmanifest?v=20260814g",
    iconPath: "icons/pharmacy-drug-locator-icon-192.png?v=20260814b",
  },
  "pharmacy-label-editor": {
    title: "약제팀 라벨 편집기",
    manifestPath: "pharmacy-label-editor.webmanifest?v=20260814f",
    iconPath: "icons/pharmacy-label-editor-icon-192.png?v=20260814f",
  },
};

export function versionAssetLinks(html, version = assetVersion) {
  return html.replace(/(src|href)="(\/Ecart-\/assets\/[^"?]+\.(?:js|css))"/g, `$1="$2?v=${version}"`);
}

export function addRouteInstallMetadata(html, route) {
  const metadata = route.startsWith("pharmacy-label-editor") ? routeInstallMetadata["pharmacy-label-editor"] : routeInstallMetadata[route];
  if (!metadata) return html;

  return html
    .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/>/, `<meta name="apple-mobile-web-app-title" content="${metadata.title}" />`)
    .replace(/<title>[^<]*<\/title>/, `<title>${metadata.title}</title>`)
    .replace(
      /(\s*<script>)/,
      `\n    <link rel="manifest" href="/Ecart-/${metadata.manifestPath}" />\n    <link rel="icon" type="image/png" href="/Ecart-/${metadata.iconPath}" />\n    <link rel="apple-touch-icon" href="/Ecart-/${metadata.iconPath}" />\n$1`,
    );
}

async function main() {
  await stat(indexPath);
  await stat(appStatePath);

  await writeFile(indexPath, versionAssetLinks(await readFile(indexPath, "utf8")), "utf8");

  for (const route of routes) {
    const routeDir = path.join(distDir, route);
    await mkdir(routeDir, { recursive: true });
    await writeFile(path.join(routeDir, "index.html"), addRouteInstallMetadata(await readFile(indexPath, "utf8"), route), "utf8");
  }

  const appStateDistDir = path.join(distDir, "app-state");
  await mkdir(appStateDistDir, { recursive: true });
  await copyFile(appStatePath, path.join(appStateDistDir, "shared-state.json"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
