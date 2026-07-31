import { spawnSync } from "node:child_process";

const command = process.argv[2] ?? "build";
const result = spawnSync(
  process.execPath,
  ["node_modules/vinext/dist/cli.js", command],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: ".wrangler/wrangler.log",
    },
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
