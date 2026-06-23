import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const execFileAsync = promisify(execFile);
const rootDir = fileURLToPath(new URL(".", import.meta.url));
const appStateRelativePath = path.join("app-state", "shared-state.json");
const appStatePath = path.join(rootDir, appStateRelativePath);

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function runGit(args: string[]) {
  return execFileAsync("git", args, { cwd: rootDir, windowsHide: true });
}

class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateConflictError";
  }
}

function stateSha(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function parseSavePayload(body: string) {
  const parsed = JSON.parse(body);
  if (parsed && typeof parsed === "object" && "envelope" in parsed) {
    return {
      envelope: parsed.envelope,
      baseSha: typeof parsed.baseSha === "string" ? parsed.baseSha : undefined,
      force: parsed.force === true,
    };
  }
  return { envelope: parsed, baseSha: undefined, force: false };
}

async function saveStateAndPush(body: string) {
  const { envelope, baseSha, force } = parseSavePayload(body);
  await fs.mkdir(path.dirname(appStatePath), { recursive: true });
  try {
    const current = await fs.readFile(appStatePath, "utf8");
    const currentSha = stateSha(current);
    if (!force && (!baseSha || baseSha !== currentSha)) {
      throw new StateConflictError("App state changed on the server. Reload the latest state before saving.");
    }
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
  await fs.writeFile(appStatePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  await runGit(["add", "--", appStateRelativePath]);
  const status = await runGit(["status", "--porcelain", "--", appStateRelativePath]);
  if (status.stdout.trim()) {
    await runGit(["commit", "-m", "Sync app state", "--", appStateRelativePath]);
    await runGit(["push", "origin", "main"]);
  }
  const saved = await fs.readFile(appStatePath, "utf8");
  return { sha: stateSha(saved) };
}

function appStateSyncPlugin(): Plugin {
  let writeQueue: Promise<unknown> = Promise.resolve();
  const apiPaths = new Set(["/api/app-state", "/Ecart-/api/app-state"]);

  return {
    name: "app-state-sync",
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestPath = request.url?.split("?")[0] ?? "";
        if (!apiPaths.has(requestPath)) {
          next();
          return;
        }

        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");

        try {
          if (request.method === "GET") {
            try {
              const content = await fs.readFile(appStatePath, "utf8");
              response.end(JSON.stringify({ envelope: JSON.parse(content), sha: stateSha(content) }));
            } catch (error) {
              if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") {
                response.statusCode = 404;
                response.end(JSON.stringify({ error: "No app state saved yet" }));
                return;
              }
              throw error;
            }
            return;
          }

          if (request.method === "PUT") {
            const body = await readRequestBody(request);
            const resultPromise = writeQueue.then(() => saveStateAndPush(body));
            writeQueue = resultPromise.then(
              () => undefined,
              () => undefined,
            );
            const result = await resultPromise;
            response.end(JSON.stringify(result));
            return;
          }

          response.statusCode = 405;
          response.end(JSON.stringify({ error: "Method not allowed" }));
        } catch (error) {
          response.statusCode = 500;
          if (error instanceof StateConflictError) {
            response.statusCode = 409;
          }
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : "App state sync failed",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), appStateSyncPlugin()],
  base: "/Ecart-/",
  server: {
    allowedHosts: [".trycloudflare.com"],
  },
});
