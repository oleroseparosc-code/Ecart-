import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployDir = join(root, ".deploy");
const tokenPath = join(deployDir, "github-token");
const askpassPath = join(deployDir, "git-askpass.cmd");
const publicPharmacyLabelEditorUrl = "https://donggukpharm7992-star.github.io/Ecart-/pharmacy-label-editor/";
const publicDeployTimeoutMs = 12 * 60 * 1000;
const publicDeployPollMs = 15 * 1000;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    if (result.error) throw result.error;
    const details = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} ${args.join(" ")} failed${details}`);
  }

  return result.stdout?.trim() ?? "";
}

function runNpm(args) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")]);
  }
  return run("npm", args);
}

function git(args, options = {}) {
  return run("git", args, options);
}

function sourceGitAuthArgs(argsList) {
  return ["-c", "http.sslBackend=openssl", "-c", "credential.helper=", ...argsList];
}

function readDeployToken() {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) return envToken;
  if (existsSync(tokenPath)) return readFileSync(tokenPath, "utf8").trim();
  throw new Error("No deploy token found. Run npm run publish:login once, then run npm run release.");
}

function createAskpass() {
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(
    askpassPath,
    '@echo off\r\nset "prompt=%~1"\r\nif /I "%prompt:~0,8%"=="Username" (\r\n  echo x-access-token\r\n) else (\r\n  powershell -NoProfile -Command "[Console]::Out.Write($env:GITHUB_TOKEN)"\r\n)\r\n',
  );
}

function sourceGitEnv() {
  createAskpass();
  return {
    ...process.env,
    GITHUB_TOKEN: readDeployToken(),
    GIT_ASKPASS: askpassPath,
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  };
}

function currentBranch() {
  const branch = git(["branch", "--show-current"], { capture: true });
  if (!branch) throw new Error("Cannot release from a detached HEAD.");
  return branch;
}

function hasRemote(name) {
  return git(["remote"], { capture: true })
    .split(/\r?\n/)
    .includes(name);
}

function commitSourceChanges() {
  git(["add", "-A"]);
  const status = git(["status", "--porcelain"], { capture: true });
  if (!status) {
    console.log("No source changes to commit.");
    return;
  }

  const message = process.env.RELEASE_MESSAGE?.trim() || process.env.PUBLISH_MESSAGE?.trim() || "Release app update";
  git(["commit", "-m", message]);
}

function pushRemote(remote, branch) {
  if (!hasRemote(remote)) {
    throw new Error(`Missing required git remote: ${remote}`);
  }
  git(sourceGitAuthArgs(["push", remote, branch]), { env: sourceGitEnv() });
}

function expectedPharmacyLabelAsset() {
  const indexPath = join(root, "dist", "pharmacy-label-editor", "index.html");
  const match = readFileSync(indexPath, "utf8").match(/assets\/(index-[^"']+\.js)/);
  if (!match) throw new Error("Cannot find the pharmacy label editor asset to verify the public deployment.");
  return match[1];
}

function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function verifyPublicPharmacyLabelDeployment() {
  const expectedAsset = expectedPharmacyLabelAsset();
  const deadline = Date.now() + publicDeployTimeoutMs;
  let lastAsset = "not fetched";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(publicPharmacyLabelEditorUrl, { headers: { "Cache-Control": "no-cache" } });
      const page = await response.text();
      const match = page.match(/assets\/(index-[^"']+\.js)/);
      lastAsset = match?.[1] ?? "missing";
      if (response.ok && lastAsset === expectedAsset) {
        console.log(`Verified public pharmacy label editor deployment: ${expectedAsset}`);
        return;
      }
    } catch {
      lastAsset = "unavailable";
    }
    await wait(publicDeployPollMs);
  }
  throw new Error(`GitHub Pages did not publish the latest pharmacy label editor asset within 12 minutes. Expected ${expectedAsset}; received ${lastAsset}.`);
}

async function main() {
  const branch = currentBranch();
  runNpm(["test"]);
  runNpm(["run", "publish"]);
  commitSourceChanges();
  pushRemote("origin", branch);
  pushRemote("backup", branch);
  await verifyPublicPharmacyLabelDeployment();
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
