import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts?: Record<string, string>;
};
const releaseScript = readFileSync(new URL("../scripts/release_app.mjs", import.meta.url), "utf8");
const publishScript = readFileSync(new URL("../scripts/publish_gh_pages.mjs", import.meta.url), "utf8");
const deployWorkflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");

describe("release workflow", () => {
  it("provides one command that validates, deploys, and backs up source remotes", () => {
    expect(packageJson.scripts?.release).toBe("node scripts/release_app.mjs");
    expect(releaseScript).toContain('run("cmd.exe", ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")])');
    expect(releaseScript).toContain('runNpm(["test"])');
    expect(releaseScript).toContain('runNpm(["run", "publish"])');
    expect(releaseScript).toContain('pushRemote("origin", branch)');
    expect(releaseScript).toContain('pushRemote("backup", branch)');
    expect(releaseScript).toContain("verifyPublicPharmacyLabelDeployment");
    expect(releaseScript).toContain("Verified public pharmacy label editor deployment");
    expect(releaseScript).toContain("publicDeployTimeoutMs = 12 * 60 * 1000");
    expect(releaseScript).toContain('GIT_TERMINAL_PROMPT: "0"');
    expect(releaseScript).toContain('"credential.helper="');
  });

  it("records the automatic release rule for future app edits", () => {
    expect(agents).toContain("After any code, data, document, or asset change");
    expect(agents).toContain("run `npm run release`");
    expect(agents).toContain("origin and backup");
  });

  it("preserves the deployed sync server config before rebuilding GitHub Pages", () => {
    const publishMain = publishScript.slice(publishScript.indexOf("async function main()"));
    expect(publishScript).toContain('for (const fileName of [".nojekyll", "sync-config.json"])');
    expect(publishScript).toContain("function commitDistChanges");
    expect(publishScript).toContain('const syncConfigFallbackPath = join(deployDir, "sync-config.json")');
    expect(publishMain.indexOf("commitDistChanges(message);")).toBeLessThan(publishMain.indexOf("const localKeep = captureDistKeepFiles();"));
    expect(publishMain.indexOf("const localKeep = captureDistKeepFiles();")).toBeLessThan(publishMain.indexOf("syncDistWithRemote(token);"));
    expect(publishMain.indexOf("syncDistWithRemote(token);")).toBeLessThan(publishMain.indexOf("const remoteKeep = captureDistKeepFiles();"));
    expect(publishMain).toContain("const keep = new Map([...localKeep, ...remoteKeep])");
    expect(publishMain.indexOf("const keep = new Map([...localKeep, ...remoteKeep])")).toBeLessThan(publishMain.indexOf('npm.cmd run build'));
    expect(deployWorkflow).toContain("Preserve sync server config");
    expect(deployWorkflow).toContain("git show origin/gh-pages:sync-config.json > dist/sync-config.json");
  });
});
