import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = join(root, "비품약 현황");
const apiUrl = "https://dkuh-pharmacy-sync.drugrestaurant.chatgpt.site/api/app-state";

function koreaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function isMonthEnd({ year, month, day }) {
  return day === new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function main() {
  const date = koreaDate();
  if (process.argv.includes("--if-month-end") && !isMonthEnd(date)) {
    console.log("월말이 아니므로 앱 상태 보관본을 만들지 않습니다.");
    return;
  }

  const dateLabel = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  const backup = join(backupDir, `비품약 앱 변경 현황_${dateLabel}.json`);
  if (existsSync(backup)) {
    console.log(`이미 같은 날짜의 앱 상태 보관본이 있습니다: ${backup}`);
    return;
  }

  const response = await fetch(apiUrl, { headers: { Accept: "application/json", "Cache-Control": "no-cache" } });
  if (!response.ok) throw new Error(`공유 앱 상태를 불러오지 못했습니다 (${response.status}).`);
  const remoteState = await response.json();
  if (!remoteState?.envelope?.state) throw new Error("공유 앱 상태 형식이 올바르지 않습니다.");

  mkdirSync(backupDir, { recursive: true });
  const temporary = `${backup}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify({ capturedAt: new Date().toISOString(), source: apiUrl, ...remoteState }, null, 2)}\n`, "utf8");
    renameSync(temporary, backup);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  console.log(`앱 상태 보관본을 만들었습니다: ${backup}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
