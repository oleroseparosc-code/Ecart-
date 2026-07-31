import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the pharmacy sync service and removes starter metadata", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../dist/server/index.js", import.meta.url)),
  ]);
  assert.match(page, /약품 마스터 클라우드 동기화/);
  assert.match(page, /정상 운영 중/);
  assert.match(layout, /title: "약품 마스터 클라우드 동기화"/);
  assert.doesNotMatch(`${page}\n${layout}`, /codex-preview|react-loading-skeleton/);
});

test("contains durable app-state and workbook storage routes", async () => {
  const [page, layout, packageJson, appStateRoute, workbookRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/app-state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pharmacy-label-workbook/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /정상 운영 중/);
  assert.match(layout, /lang="ko"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(appStateRoute, /pharmacyAdditionalRows/);
  assert.match(appStateRoute, /mergeByKey/);
  assert.match(workbookRoute, /BUCKET\.put/);
});
