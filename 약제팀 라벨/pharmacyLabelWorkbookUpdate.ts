import * as XLSX from "xlsx";
import { buildPharmacyLabelWorkbookApiUrl } from "../src/serverSync";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import type { PharmacyLabelDraft } from "./pharmacyLabelStudio";

const WARNING_HEADERS: Record<string, string> = {
  용량주의: "용량주의",
  유사발음: "유사발음",
  유사모양: "유사모양",
  고위험의약품: "고위험의약품",
  이름주의: "이름주의",
  용량확인: "용량확인",
};

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

const MASTER_BOOLEAN_HEADERS = [
  "고가약", "고위험의약품", "유사모양", "유사발음", "용량주의", "용량확인", "이름주의",
  "마약", "향정", "항암제", "E-cart", "E-cart(NICU)", "측면라벨", "유색측면라벨",
  "병뚜껑", "유색병뚜껑", "정제용량 1T", "정제용량 0.5T", "정제용량 0.25T",
] as const;

function yes(value: boolean | undefined) {
  return value ? "Y" : "N";
}

function ensureColumns(
  sheet: XLSX.WorkSheet,
  headers: string[],
  index: Map<string, number>,
  requiredHeaders: readonly string[],
) {
  for (const header of requiredHeaders) {
    if (index.has(header)) continue;
    const columnIndex = headers.length;
    headers.push(header);
    index.set(header, columnIndex);
    sheet[XLSX.utils.encode_cell({ r: 0, c: columnIndex })] = { t: "s", v: header };
  }
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  range.e.c = Math.max(range.e.c, headers.length - 1);
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

function setRowValues(
  sheet: XLSX.WorkSheet,
  index: Map<string, number>,
  rowIndex: number,
  updates: Record<string, unknown>,
) {
  for (const [header, value] of Object.entries(updates)) {
    const columnIndex = index.get(header);
    if (columnIndex == null) continue;
    sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })] = { t: "s", v: String(value ?? "") };
  }
}

export async function savePharmacyLabelDraftToWorkbook(draft: PharmacyLabelDraft, workbookUrl: string) {
  let response: Response | undefined;
  try {
    const serverWorkbookResponse = await fetch(buildPharmacyLabelWorkbookApiUrl());
    const contentType = serverWorkbookResponse.headers.get("content-type") ?? "";
    if (serverWorkbookResponse.ok && contentType.includes("spreadsheetml.sheet")) {
      response = serverWorkbookResponse;
    }
  } catch {
    // Use the bundled workbook when the shared sync server is unavailable.
  }
  response ??= await fetch(workbookUrl);
  if (!response.ok) throw new Error("원내보유의약품리스트 원본을 불러오지 못했습니다.");
  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").replace(/\n/g, " ").trim());
  const index = new Map(headers.map((header, position) => [header, position]));
  const codeIndex = index.get("약품코드");
  if (codeIndex == null) throw new Error("원내보유의약품리스트에서 약품코드 열을 찾지 못했습니다.");
  const existingRowIndex = rows.findIndex((row, position) => position > 0 && compact(row[codeIndex]) === compact(draft.code));
  const rowIndex = existingRowIndex >= 0 ? existingRowIndex : rows.length;

  const updates: Record<string, unknown> = {
    약품코드: draft.code,
    물품코드: draft.itemCode,
    상용약품명: draft.printable.title,
    한글약품명: draft.printable.koreanName,
    함량: draft.printable.strength,
    위치: draft.location,
    ATC: draft.atc,
    약품유형: draft.drugTypes[0] ?? "",
    보관법: draft.warnings.includes("냉동") ? "냉동" : draft.warnings.includes("냉장") ? "냉장" : "",
    원내보유: "Y",
    유효기간: draft.expiry,
    테두리: draft.style.outerBorderPx >= 5 ? "Y" : "N",
    "테두리 색기호": draft.style.outerBorderColor,
  };
  for (const [warning, header] of Object.entries(WARNING_HEADERS)) {
    updates[header] = draft.warnings.includes(warning) ? "Y" : "N";
  }
  if (existingRowIndex < 0) {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, rowIndex);
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }
  for (const [header, value] of Object.entries(updates)) {
    const columnIndex = index.get(header);
    if (columnIndex == null) continue;
    const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    sheet[address] = { t: "s", v: String(value ?? "") };
  }
  const workbookData = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
  try {
    const serverResponse = await fetch(buildPharmacyLabelWorkbookApiUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbookData,
    });
    if (serverResponse.ok) return "server" as const;
    if (serverResponse.status !== 404 && serverResponse.status !== 405) {
      throw new Error(`약제팀 라벨 원본 서버 저장 실패 (${serverResponse.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("서버 저장 실패")) throw error;
  }
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{ createWritable: () => Promise<{ write: (data: ArrayBuffer) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: "원내보유의약품리스트.xlsx",
      types: [{ description: "Excel 통합 문서", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(workbookData);
    await writable.close();
    return "file" as const;
  }
  XLSX.writeFile(workbook, "원내보유의약품리스트.xlsx", { compression: true });
  return "download" as const;
}

export async function saveHospitalDrugMasterRowToWorkbook(row: HospitalDrugLabelRow, workbookUrl: string) {
  let response: Response | undefined;
  try {
    const serverWorkbookResponse = await fetch(buildPharmacyLabelWorkbookApiUrl());
    const contentType = serverWorkbookResponse.headers.get("content-type") ?? "";
    if (serverWorkbookResponse.ok && contentType.includes("spreadsheetml.sheet")) response = serverWorkbookResponse;
  } catch {
    // Use the bundled workbook when the shared sync server is unavailable.
  }
  response ??= await fetch(workbookUrl);
  if (!response.ok) throw new Error("원내보유의약품리스트 원본을 불러오지 못했습니다.");

  const workbook = XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").replace(/\n/g, " ").trim());
  const index = new Map(headers.map((header, position) => [header, position]));
  ensureColumns(sheet, headers, index, MASTER_BOOLEAN_HEADERS);
  const codeIndex = index.get("약품코드");
  if (codeIndex == null) throw new Error("원내보유의약품리스트에서 약품코드 열을 찾지 못했습니다.");
  const existingRowIndex = rows.findIndex((sourceRow, position) => position > 0 && compact(sourceRow[codeIndex]) === compact(row.code));
  const rowIndex = existingRowIndex >= 0 ? existingRowIndex : rows.length;
  const sideLabel1T = Boolean(row.sideLabel && row.labelDose1T);
  const sideLabelHalfT = Boolean(row.sideLabel && row.labelDoseHalfT);
  const sideLabelQuarterT = Boolean(row.sideLabel && row.labelDoseQuarterT);
  const anyCapLabel = Boolean(row.regularCapLabel || row.coloredCapLabel);
  const updates: Record<string, unknown> = {
    약품코드: row.code,
    물품코드: row.itemCode ?? "",
    상용약품명: row.name,
    한글약품명: row.koreanName,
    함량: row.strength,
    약품유형: row.drugType,
    원내보유: yes(row.inHospital),
    보관법: row.storage,
    차광필요: row.lightProtected ? "차광" : "",
    고가약: yes(row.highCost),
    고위험의약품: yes(row.highRisk),
    유사모양: yes(row.similarLook),
    유사발음: yes(row.similarSound),
    용량주의: yes(row.doseCaution),
    용량확인: yes(row.doseCheck),
    이름주의: yes(row.nameCaution),
    마약: yes(row.narcotic),
    향정: yes(row.psychotropic),
    항암제: yes(row.anticancer),
    "E-cart": yes(row.eCart),
    "E-cart(NICU)": yes(row.eCartNicu),
    측면라벨: yes(row.sideLabel),
    유색측면라벨: yes(isLabelMarked(row.coloredSideLabel)),
    병뚜껑: yes(row.regularCapLabel),
    유색병뚜껑: yes(row.coloredCapLabel),
    "정제용량 1T": yes(row.labelDose1T),
    "정제용량 0.5T": yes(row.labelDoseHalfT),
    "정제용량 0.25T": yes(row.labelDoseQuarterT),
    "1T 3단장 뺑뺑이 PTP 측면라벨": yes(sideLabel1T),
    "0.5T 3단장 뺑뺑이 병 측면라벨": yes(sideLabelHalfT),
    "0.25T 3단장 뺑뺑이 병 측면라벨": yes(sideLabelQuarterT),
    "3단장 유색 반티통 측면라벨": yes(isLabelMarked(row.coloredSideLabel)),
    "3단장 유색 반티통 병뚜껑": yes(anyCapLabel),
  };
  if (existingRowIndex < 0) {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, rowIndex);
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }
  setRowValues(sheet, index, rowIndex, updates);
  const workbookData = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });

  try {
    const serverResponse = await fetch(buildPharmacyLabelWorkbookApiUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbookData,
    });
    if (serverResponse.ok) return "server" as const;
    if (serverResponse.status !== 404 && serverResponse.status !== 405) {
      throw new Error(`약제팀 라벨 원본 서버 저장 실패 (${serverResponse.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("서버 저장 실패")) throw error;
  }
  const picker = (window as unknown as {
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<{ createWritable: () => Promise<{ write: (data: ArrayBuffer) => Promise<void>; close: () => Promise<void> }> }>;
  }).showSaveFilePicker;
  if (picker) {
    const handle = await picker({
      suggestedName: "원내보유의약품리스트.xlsx",
      types: [{ description: "Excel 통합 문서", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(workbookData);
    await writable.close();
    return "file" as const;
  }
  XLSX.writeFile(workbook, "원내보유의약품리스트.xlsx", { compression: true });
  return "download" as const;
}

function isLabelMarked(value?: string) {
  return value?.trim().toUpperCase() === "Y";
}
