import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const safeDistDir = distDir.replaceAll("\\", "/");
const deployDir = join(root, ".deploy");
const tokenPath = join(deployDir, "github-token");
const askpassPath = join(deployDir, "git-askpass.cmd");
const syncConfigFallbackPath = join(deployDir, "sync-config.json");
const sourceSyncConfigPath = join(root, "public", "sync-config.json");
const clientId = "178c6fc778ccc68e1d6a";
const scope = "repo";

const args = new Set(process.argv.slice(2));

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: options.env ?? process.env,
  });

  if (result.status !== 0) {
    if (result.error) {
      throw result.error;
    }
    const details = options.capture ? `\n${result.stderr || result.stdout}` : "";
    throw new Error(`${command} ${commandArgs.join(" ")} failed${details}`);
  }

  return result.stdout?.trim() ?? "";
}

async function requestDeviceLogin() {
  const deviceResponse = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, scope }),
  });
  const device = await deviceResponse.json();

  if (!device.device_code) {
    throw new Error(`GitHub device login failed: ${JSON.stringify(device)}`);
  }

  console.log(`Open ${device.verification_uri} and enter code: ${device.user_code}`);

  const startedAt = Date.now();
  const expiresAt = startedAt + device.expires_in * 1000;
  let intervalMs = device.interval * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: device.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const token = await tokenResponse.json();

    if (token.access_token) {
      mkdirSync(deployDir, { recursive: true });
      writeFileSync(tokenPath, token.access_token.trim(), { mode: 0o600 });
      console.log("GitHub deploy login saved locally.");
      return;
    }

    if (token.error === "authorization_pending") {
      continue;
    }
    if (token.error === "slow_down") {
      intervalMs += 5000;
      continue;
    }

    throw new Error(`GitHub token request failed: ${JSON.stringify(token)}`);
  }

  throw new Error("GitHub device login expired before authorization.");
}

function readToken() {
  const envToken = process.env.GITHUB_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, "utf8").trim();
  }
  throw new Error("No deploy token found. Run npm run publish:login once, then run npm run publish.");
}

function captureDistKeepFiles() {
  const keep = new Map();
  for (const fileName of [".nojekyll", "sync-config.json"]) {
    if (fileName === "sync-config.json" && existsSync(sourceSyncConfigPath)) {
      keep.set(fileName, readFileSync(sourceSyncConfigPath));
      continue;
    }
    const filePath = join(distDir, fileName);
    if (existsSync(filePath)) {
      keep.set(fileName, readFileSync(filePath));
      continue;
    }
    const tracked = spawnSync("git", distGitArgs(["show", `HEAD:${fileName}`]), {
      cwd: distDir,
      stdio: "pipe",
    });
    if (tracked.status === 0) {
      keep.set(fileName, tracked.stdout);
    }
    if (fileName === "sync-config.json" && !keep.has(fileName) && existsSync(syncConfigFallbackPath)) {
      keep.set(fileName, readFileSync(syncConfigFallbackPath));
    }
  }
  return keep;
}

function restoreDistKeepFiles(keep) {
  for (const [fileName, content] of keep) {
    writeFileSync(join(distDir, fileName), content);
  }
}

function distGitArgs(argsList) {
  return ["-c", `safe.directory=${safeDistDir}`, ...argsList];
}

function distGitAuthArgs(argsList) {
  return [
    "-c",
    `safe.directory=${safeDistDir}`,
    "-c",
    "http.sslBackend=openssl",
    "-c",
    "credential.helper=",
    ...argsList,
  ];
}

function createAskpass() {
  mkdirSync(deployDir, { recursive: true });
  writeFileSync(
    askpassPath,
    '@echo off\r\nset "prompt=%~1"\r\nif /I "%prompt:~0,8%"=="Username" (\r\n  echo x-access-token\r\n) else (\r\n  powershell -NoProfile -Command "[Console]::Out.Write($env:GITHUB_TOKEN)"\r\n)\r\n',
  );
}

function gitAuthEnv(token) {
  createAskpass();
  return {
    ...process.env,
    GITHUB_TOKEN: token,
    GIT_ASKPASS: askpassPath,
    GIT_TERMINAL_PROMPT: "0",
  };
}

function syncDistWithRemote(token, remote = "origin") {
  const env = gitAuthEnv(token);
  run("git", distGitAuthArgs(["fetch", remote, "gh-pages"]), { cwd: distDir, env });
  run("git", distGitAuthArgs(["pull", "--rebase", remote, "gh-pages"]), { cwd: distDir, env });
}

function commitDistChanges(message) {
  run("git", distGitArgs(["add", "-A"]), { cwd: distDir });
  const status = run("git", distGitArgs(["status", "--porcelain"]), { cwd: distDir, capture: true });
  if (status) run("git", distGitArgs(["commit", "-m", message]), { cwd: distDir });
  return Boolean(status);
}

function hasDistRemote(name) {
  return run("git", distGitArgs(["remote"]), { cwd: distDir, capture: true })
    .split(/\r?\n/)
    .includes(name);
}

function pushWithToken(token) {
  const env = gitAuthEnv(token);
  syncDistWithRemote(token);
  run("git", distGitAuthArgs(["push", "origin", "gh-pages"]), { cwd: distDir, env });
  const backupUrl = run("git", ["remote", "get-url", "backup"], { capture: true });
  if (!hasDistRemote("backup")) run("git", distGitArgs(["remote", "add", "backup", backupUrl]), { cwd: distDir });
  run("git", distGitAuthArgs(["fetch", "backup", "gh-pages"]), { cwd: distDir, env });
  run("git", distGitAuthArgs(["push", "--force-with-lease", "backup", "gh-pages"]), { cwd: distDir, env });
}

async function main() {
  if (args.has("--login")) {
    await requestDeviceLogin();
    return;
  }

  const token = readToken();
  const message = process.env.PUBLISH_MESSAGE?.trim() || "Deploy app update";
  const localKeep = captureDistKeepFiles();
  run("git", distGitArgs(["reset", "--hard", "HEAD"]), { cwd: distDir });
  syncDistWithRemote(token);
  const remoteKeep = captureDistKeepFiles();
  const keep = new Map([...localKeep, ...remoteKeep]);
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "npm.cmd run build"]);
  } else {
    run("npm", ["run", "build"]);
  }
  restoreDistKeepFiles(keep);

  run("git", distGitArgs(["add", "-A"]), { cwd: distDir });
  const hasChanges = run("git", distGitArgs(["status", "--porcelain"]), { cwd: distDir, capture: true });

  if (!hasChanges) {
    console.log("No GitHub Pages changes to publish.");
    pushWithToken(token);
    return;
  }

  commitDistChanges(message);
  pushWithToken(token);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
