import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");
const appStatePath = path.resolve("app-state", "shared-state.json");
const routes = ["viewer", "pharmacy-viewer", "pharmacy-label-editor", "narcotic-viewer"];
const assetVersion = "20260810b";

export function versionAssetLinks(html, version = assetVersion) {
  return html.replace(/(src|href)="(\/Ecart-\/assets\/[^"?]+\.(?:js|css))"/g, `$1="$2?v=${version}"`);
}

async function main() {
  await stat(indexPath);
  await stat(appStatePath);

  await writeFile(indexPath, versionAssetLinks(await readFile(indexPath, "utf8")), "utf8");

  for (const route of routes) {
    const routeDir = path.join(distDir, route);
    await mkdir(routeDir, { recursive: true });
    await copyFile(indexPath, path.join(routeDir, "index.html"));
  }

  const appStateDistDir = path.join(distDir, "app-state");
  await mkdir(appStateDistDir, { recursive: true });
  await copyFile(appStatePath, path.join(appStateDistDir, "shared-state.json"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
