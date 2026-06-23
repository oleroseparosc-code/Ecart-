import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const npxCommand = isWindows ? "npx.cmd" : "npx";
const children = [];

function spawnLogged(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true,
  });
  children.push(child);

  const handleData = (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text.replace(/^/gm, `[${label}] `));
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      const baseUrl = match[0].replace(/\/$/, "");
      console.log("");
      console.log("Public app URL:");
      console.log(`${baseUrl}/Ecart-/`);
      console.log("");
      console.log("Keep this terminal open while using the app from another network.");
    }
  };

  child.stdout.on("data", handleData);
  child.stderr.on("data", handleData);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  return child;
}

function stopAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

spawnLogged("vite", npmCommand, ["run", "dev"]);
setTimeout(() => {
  spawnLogged("tunnel", npxCommand, ["cloudflared", "tunnel", "--url", "http://localhost:5173"]);
}, 1200);
