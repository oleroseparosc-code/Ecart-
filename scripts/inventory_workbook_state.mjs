import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";

const STOCK_SHEET = "비품현황표(전체)";
const STOCK_ROOM_START_COLUMN = 6;
const NARCOTIC_ROOM_START_COLUMN = 6;

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function quantity(value) {
  const parsed = typeof value === "number" ? value : Number(text(value).replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function storageType(storage) {
  if (/냉장|냉동|2\s*[~-]\s*8\s*℃?/i.test(storage)) return "REFRIGERATED";
  if (/차광|암소|빛을\s*피/i.test(storage)) return "LIGHT_PROTECTED";
  return "ROOM";
}

function columnValues(sheet, row, startColumn, endColumn) {
  const values = [];
  for (let column = startColumn; column < endColumn; column += 1) {
    values.push({ column, value: text(sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v) });
  }
  return values;
}

function rowValue(sheet, row, column) {
  return sheet[XLSX.utils.encode_cell({ r: row, c: column })]?.v;
}

function findRow(sheet, range, column, pattern, startRow = range.s.r) {
  for (let row = startRow; row <= range.e.r; row += 1) {
    if (pattern.test(text(rowValue(sheet, row, column)))) return row;
  }
  return -1;
}

function findHeaderColumn(sheet, row, range, header) {
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    if (text(rowValue(sheet, row, column)) === header) return column;
  }
  return -1;
}

function sourceSheetForRoom(roomId) {
  const ward = roomId.replace(/W$/, "");
  return /^\d+$/.test(ward) ? ward : roomId;
}

function makeRooms(headers, sourceSheet, updatedAt) {
  return headers.map(({ value }) => ({
    id: value,
    label: value,
    sourceColumn: value,
    sourceSheet: sourceSheet(value),
    sourceUpdatedAt: updatedAt,
    allocationCount: 0,
    totalQuantity: 0,
  }));
}

function updateRoomTotals(rooms, allocations) {
  const totals = new Map(rooms.map((room) => [room.id, { allocationCount: 0, totalQuantity: 0 }]));
  for (const allocation of allocations) {
    const current = totals.get(allocation.roomId);
    if (!current) continue;
    current.allocationCount += 1;
    current.totalQuantity += allocation.requiredQty;
  }
  return rooms.map((room) => ({ ...room, ...(totals.get(room.id) ?? {}) }));
}

function parseStockState(sheet, range, updatedAt) {
  const summaryRow = findRow(sheet, range, 2, /보유비품약\s*품목수/);
  if (summaryRow < 0) throw new Error("비치약 품목수 행을 찾지 못했습니다.");
  const totalColumn = findHeaderColumn(sheet, range.s.r, range, "합계");
  if (totalColumn < 0) throw new Error("비치약 합계 열을 찾지 못했습니다.");

  const roomHeaders = columnValues(sheet, range.s.r, STOCK_ROOM_START_COLUMN, totalColumn).filter((entry) => entry.value);
  const rooms = makeRooms(roomHeaders, sourceSheetForRoom, updatedAt);
  const drugs = [];
  const allocations = [];

  for (let row = range.s.r + 1; row < summaryRow; row += 1) {
    const code = text(rowValue(sheet, row, 0));
    if (!code) continue;
    const storage = text(rowValue(sheet, row, 4));
    const warning = text(rowValue(sheet, row, 5));
    drugs.push({
      code,
      genericName: text(rowValue(sheet, row, 1)),
      productName: text(rowValue(sheet, row, 2)),
      spec: text(rowValue(sheet, row, 3)),
      storage,
      note: warning,
      warning,
      storageType: storageType(storage),
    });
    for (const room of roomHeaders) {
      const requiredQty = quantity(rowValue(sheet, row, room.column));
      if (requiredQty) allocations.push({ roomId: room.value, drugCode: code, requiredQty });
    }
  }

  return {
    drugs,
    rooms: updateRoomTotals(rooms, allocations),
    allocations,
  };
}

function parseNarcoticState(sheet, range, updatedAt) {
  const titleRow = findRow(sheet, range, 0, /병동별\s*비치\s*향정[·ㆍ\s]*마약\s*현황/);
  if (titleRow < 0) throw new Error("비치 향정·마약 현황 표를 찾지 못했습니다.");
  const headerRow = titleRow + 1;
  const totalColumn = findHeaderColumn(sheet, headerRow, range, "합계");
  if (totalColumn < 0) throw new Error("비치 향정·마약 합계 열을 찾지 못했습니다.");
  const roomHeaders = columnValues(sheet, headerRow, NARCOTIC_ROOM_START_COLUMN, totalColumn).filter((entry) => entry.value);
  const rooms = makeRooms(roomHeaders, (roomId) => "점검", updatedAt);
  const drugs = [];
  const allocations = [];
  const categories = {};

  for (let row = headerRow + 1; row <= range.e.r; row += 1) {
    const code = text(rowValue(sheet, row, 2));
    if (!code) {
      if (drugs.length > 0) break;
      continue;
    }
    const category = text(rowValue(sheet, row, 0)) || "향정";
    const productName = text(rowValue(sheet, row, 4));
    categories[code] = category;
    drugs.push({
      code,
      genericName: productName,
      productName,
      spec: "",
      storage: "",
      note: category,
      warning: category,
      storageType: "ROOM",
    });
    for (const room of roomHeaders) {
      const requiredQty = quantity(rowValue(sheet, row, room.column));
      if (requiredQty) allocations.push({ roomId: room.value, drugCode: code, requiredQty });
    }
  }

  return {
    drugs,
    rooms: updateRoomTotals(rooms, allocations),
    allocations,
    categories,
  };
}

export async function readInventoryWorkbookState(filePath) {
  const workbook = XLSX.read(await readFile(filePath), { type: "buffer", cellFormula: false, cellText: false });
  const sheet = workbook.Sheets[STOCK_SHEET];
  if (!sheet || !sheet["!ref"]) throw new Error(`${STOCK_SHEET} 시트를 찾지 못했습니다.`);
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const updatedAt = new Date().toISOString();
  const stock = parseStockState(sheet, range, updatedAt);
  const narcotic = parseNarcoticState(sheet, range, updatedAt);
  return {
    stockDrugs: stock.drugs,
    stockRooms: stock.rooms,
    stockAllocations: stock.allocations,
    narcoticDrugs: narcotic.drugs,
    narcoticRooms: narcotic.rooms,
    narcoticAllocations: narcotic.allocations,
    narcoticDrugCategories: narcotic.categories,
  };
}

function mergeDrugDetails(existingRows, workbookRows) {
  const existing = new Map((existingRows ?? []).map((row) => [String(row.code ?? ""), row]));
  return workbookRows.map((row) => ({ ...existing.get(row.code), ...row }));
}

function mergeRoomDetails(existingRows, workbookRows) {
  const existing = new Map((existingRows ?? []).map((row) => [String(row.id ?? ""), row]));
  return workbookRows.map((row) => ({ ...existing.get(row.id), ...row }));
}

export function mergeWorkbookStateIntoAppState(appState, workbookState) {
  return {
    ...appState,
    stockDrugs: mergeDrugDetails(appState.stockDrugs, workbookState.stockDrugs),
    stockRooms: mergeRoomDetails(appState.stockRooms, workbookState.stockRooms),
    stockAllocations: workbookState.stockAllocations,
    narcoticDrugs: mergeDrugDetails(appState.narcoticDrugs, workbookState.narcoticDrugs),
    narcoticRooms: mergeRoomDetails(appState.narcoticRooms, workbookState.narcoticRooms),
    narcoticAllocations: workbookState.narcoticAllocations,
    narcoticDrugCategories: { ...(appState.narcoticDrugCategories ?? {}), ...workbookState.narcoticDrugCategories },
  };
}

async function main() {
  const [command, filePath] = process.argv.slice(2);
  if (command !== "--extract" || !filePath) {
    throw new Error("사용법: node scripts/inventory_workbook_state.mjs --extract <엑셀파일경로>");
  }
  process.stdout.write(`${JSON.stringify(await readInventoryWorkbookState(filePath))}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
