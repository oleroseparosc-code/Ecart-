import * as XLSX from "xlsx";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";

const ITEM_CODE_HEADERS = ["물품코드", "상품코드", "품목코드", "바코드"];
const EXPIRY_HEADERS = ["유효기간", "사용기한", "유효기한", "만료일자", "유효기간일자"];
const LATEST_EXPIRY_HEADER = "최신 유효기간";

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function dateKey(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const text = compact(value).replace(/[./]/g, "-");
  const match = /^(20\d{2})-?(\d{1,2})-?(\d{1,2})/.exec(text);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

function findHeaderRow(rows: unknown[][]) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 30); rowIndex += 1) {
    const headers = rows[rowIndex].map(compact);
    const itemIndex = headers.findIndex((value) => ITEM_CODE_HEADERS.includes(value));
    const expiryIndex = headers.findIndex((value) => EXPIRY_HEADERS.includes(value));
    if (itemIndex >= 0 && expiryIndex >= 0) return { rowIndex, itemIndex, expiryIndex };
  }
  throw new Error("유효기간 파일에서 물품코드와 유효기간 열을 찾을 수 없습니다.");
}

export async function applyExpirationWorkbook(
  expirationFile: File,
  hospitalWorkbookUrl: string,
  rows: HospitalDrugLabelRow[],
) {
  if (!/^동국대학교일산병원_매출_날짜/i.test(expirationFile.name)) {
    throw new Error("동국대학교일산병원_매출_날짜로 시작하는 엑셀 파일만 선택할 수 있습니다.");
  }

  const expirationWorkbook = XLSX.read(await expirationFile.arrayBuffer(), { type: "array", cellDates: true });
  const earliestByItemCode = new Map<string, string>();
  for (const sheetName of expirationWorkbook.SheetNames) {
    const values = XLSX.utils.sheet_to_json<unknown[]>(expirationWorkbook.Sheets[sheetName], { header: 1, raw: true });
    let header;
    try { header = findHeaderRow(values); } catch { continue; }
    for (const row of values.slice(header.rowIndex + 1)) {
      const itemCode = compact(row[header.itemIndex]);
      const expiry = dateKey(row[header.expiryIndex]);
      if (!itemCode || !expiry) continue;
      const previous = earliestByItemCode.get(itemCode);
      if (!previous || expiry < previous) earliestByItemCode.set(itemCode, expiry);
    }
  }
  if (earliestByItemCode.size === 0) throw new Error("유효기간 파일에서 갱신할 날짜를 찾지 못했습니다.");

  const sourceResponse = await fetch(hospitalWorkbookUrl);
  if (!sourceResponse.ok) throw new Error("원내보유의약품리스트 원본을 불러오지 못했습니다.");
  const hospitalWorkbook = XLSX.read(await sourceResponse.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = hospitalWorkbook.Sheets[hospitalWorkbook.SheetNames[0]];
  const values = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (values[0] ?? []).map(compact);
  const itemIndex = headers.indexOf("물품코드");
  const expiryIndex = headers.indexOf("유효기간");
  if (itemIndex < 0 || expiryIndex < 0) throw new Error("원내보유의약품리스트의 물품코드 또는 유효기간 열을 찾지 못했습니다.");

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  let latestExpiryIndex = headers.indexOf(LATEST_EXPIRY_HEADER);
  if (latestExpiryIndex < 0) {
    latestExpiryIndex = expiryIndex + 1;
    for (let rowIndex = range.e.r; rowIndex >= 0; rowIndex -= 1) {
      for (let columnIndex = range.e.c; columnIndex >= latestExpiryIndex; columnIndex -= 1) {
        const from = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        const to = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex + 1 });
        if (sheet[from]) sheet[to] = sheet[from];
        else delete sheet[to];
      }
      delete sheet[XLSX.utils.encode_cell({ r: rowIndex, c: latestExpiryIndex })];
    }
    range.e.c += 1;
    sheet["!ref"] = XLSX.utils.encode_range(range);
    sheet[XLSX.utils.encode_cell({ r: 0, c: latestExpiryIndex })] = { t: "s", v: LATEST_EXPIRY_HEADER };
  }

  let updatedCount = 0;
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const expiry = earliestByItemCode.get(compact(values[rowIndex]?.[itemIndex]));
    if (!expiry) continue;
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: latestExpiryIndex });
    sheet[cellAddress] = { t: "d", v: new Date(`${expiry}T00:00:00`), z: "yyyy-mm-dd" };
    updatedCount += 1;
  }
  XLSX.writeFile(hospitalWorkbook, "원내보유의약품리스트.xlsx", { compression: true });

  const updatedRows = rows.map((row) => ({ ...row, expiry: earliestByItemCode.get(compact(row.itemCode)) ?? row.expiry }));
  return { updatedRows, updatedCount, sourceCount: earliestByItemCode.size };
}
