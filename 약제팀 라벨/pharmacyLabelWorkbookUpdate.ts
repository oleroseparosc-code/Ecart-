import * as XLSX from "xlsx";
import { buildPharmacyLabelWorkbookApiUrl } from "../src/serverSync";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import type { PharmacyLabelDraft, PharmacySavedLabel } from "./pharmacyLabelStudio";

const WARNING_HEADERS: Record<string, string> = {
  용량주의: "용량주의",
  유사발음: "유사발음",
  유사모양: "유사모양",
  고위험의약품: "고위험의약품",
  이름주의: "이름주의",
  용량확인: "용량확인",
};
const LABEL_SETTINGS_HEADER = "약제팀 라벨 설정";
const FINAL_LABEL_SETTINGS_HEADER = "약제팀 최종 라벨 설정";
const FINAL_LABEL_SIZE_HEADER = "최종 라벨 크기";

function compact(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

const MASTER_BOOLEAN_HEADERS = [
  "고가약", "위해의약품", "고위험의약품", "유사모양", "유사발음", "용량주의", "용량확인", "이름주의",
  "용해액 필요", "니들 필요",
  "마약", "향정", "항암제", "E-cart", "E-cart(NICU)", "측면라벨", "유색측면라벨",
  "병뚜껑", "유색병뚜껑", "정제용량 1T", "정제용량 0.5T", "정제용량 0.25T",
] as const;
const MASTER_EXTRA_HEADERS = [...MASTER_BOOLEAN_HEADERS, "약제팀 라벨 세부유형", "위치", "앰플꽂이"] as const;

function yes(value: boolean | undefined) {
  return value ? "Y" : "N";
}

function isPublishedViewer() {
  return typeof window !== "undefined" && window.location.hostname.endsWith(".github.io");
}

function cloudSaveError(error: unknown) {
  const detail = error instanceof Error ? ` ${error.message}` : "";
  return new Error(`클라우드 저장에 실패했습니다. 네트워크 연결을 확인한 후 다시 저장해 주십시오.${detail}`);
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

export async function savePharmacyLabelDraftsToWorkbook(drafts: readonly PharmacyLabelDraft[], workbookUrl: string) {
  if (drafts.length === 0) throw new Error("저장할 약품 라벨이 없습니다.");
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
  ensureColumns(sheet, headers, index, ["약제팀 라벨 세부유형", "테두리", "테두리 색기호", FINAL_LABEL_SIZE_HEADER, LABEL_SETTINGS_HEADER, FINAL_LABEL_SETTINGS_HEADER]);
  const codeIndex = index.get("약품코드");
  if (codeIndex == null) throw new Error("원내보유의약품리스트에서 약품코드 열을 찾지 못했습니다.");
  let appendedCount = 0;
  for (const draft of drafts) {
    const existingRowIndex = rows.findIndex((row, position) => position > 0 && compact(row[codeIndex]) === compact(draft.code));
    const rowIndex = existingRowIndex >= 0 ? existingRowIndex : rows.length + appendedCount++;
    const updates: Record<string, unknown> = {
      약품코드: draft.code,
      물품코드: draft.itemCode,
      상용약품명: draft.printable.title,
      한글약품명: draft.printable.koreanName,
      함량: draft.printable.strength,
      위치: draft.location,
      ATC: draft.atc,
      약품유형: draft.drugTypes[0] ?? "",
      "약제팀 라벨 세부유형": draft.drugTypes.join(", "),
      보관법: draft.warnings.includes("냉동") ? "냉동" : draft.warnings.includes("냉장") ? "냉장" : "",
      원내보유: "Y",
      유효기간: draft.expiry,
      테두리: draft.style.outerBorderPx > 0 ? "Y" : "N",
      "테두리 색기호": draft.style.outerBorderColor,
      [FINAL_LABEL_SIZE_HEADER]: `${draft.size.heightMm} × ${draft.size.widthMm} mm`,
      [LABEL_SETTINGS_HEADER]: JSON.stringify({
        labelFamily: draft.labelFamily,
        category: draft.category,
        size: draft.size,
        printable: draft.printable,
        warnings: draft.warnings,
        drugTypes: draft.drugTypes,
        accessory: draft.accessory,
        doseUnit: draft.doseUnit,
        backgroundColor: draft.backgroundColor,
        style: draft.style,
        titleStyles: draft.titleStyles,
        savedAt: draft.savedAt ?? new Date().toISOString(),
      }),
      [FINAL_LABEL_SETTINGS_HEADER]: JSON.stringify({
        version: 1,
        savedAt: draft.savedAt ?? new Date().toISOString(),
        draft: {
          labelFamily: draft.labelFamily,
          category: draft.category,
          size: draft.size,
          printable: draft.printable,
          warnings: draft.warnings,
          drugTypes: draft.drugTypes,
          accessory: draft.accessory,
          doseUnit: draft.doseUnit,
          backgroundColor: draft.backgroundColor,
          style: draft.style,
          titleStyles: draft.titleStyles,
          savedAt: draft.savedAt ?? new Date().toISOString(),
        },
      }),
    };
    for (const [warning, header] of Object.entries(WARNING_HEADERS)) {
      updates[header] = draft.warnings.includes(warning) ? "Y" : "N";
    }
    if (existingRowIndex < 0) {
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
      range.e.r = Math.max(range.e.r, rowIndex);
      sheet["!ref"] = XLSX.utils.encode_range(range);
    }
    setRowValues(sheet, index, rowIndex, updates);
  }
  const workbookData = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true });
  try {
    const serverResponse = await fetch(buildPharmacyLabelWorkbookApiUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: workbookData,
    });
    if (serverResponse.ok) {
      const restored = await loadSavedPharmacyLabelsFromWorkbook(workbookUrl);
      const notPersisted = drafts.find((draft) => {
        const saved = restored.find((label) =>
          label.code.trim().toUpperCase() === draft.code.trim().toUpperCase()
          && label.category === draft.category
          && label.labelFamily === draft.labelFamily,
        );
        return !saved
          || JSON.stringify(saved.style) !== JSON.stringify(draft.style)
          || JSON.stringify(saved.titleStyles ?? []) !== JSON.stringify(draft.titleStyles ?? [])
          || JSON.stringify(saved.printable) !== JSON.stringify(draft.printable)
          || JSON.stringify(saved.size) !== JSON.stringify(draft.size);
      });
      if (notPersisted) {
        throw new Error(`[${notPersisted.code}] 최종 라벨 설정이 엑셀에 확인되지 않았습니다. 저장이 완료되지 않았습니다.`);
      }
      return "server" as const;
    }
    if (serverResponse.status !== 404 && serverResponse.status !== 405) {
      throw new Error(`약제팀 라벨 원본 서버 저장 실패 (${serverResponse.status})`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("서버 저장 실패")) throw error;
    if (isPublishedViewer()) throw cloudSaveError(error);
  }
  if (isPublishedViewer()) throw cloudSaveError(undefined);
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

async function loadPharmacyWorkbook(workbookUrl: string) {
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
  return XLSX.read(await response.arrayBuffer(), { type: "array", cellDates: true });
}

export async function loadSavedPharmacyLabelsFromWorkbook(workbookUrl: string): Promise<PharmacySavedLabel[]> {
  const workbook = await loadPharmacyWorkbook(workbookUrl);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").replace(/\n/g, " ").trim());
  const codeIndex = headers.indexOf("약품코드");
  const settingsIndex = headers.indexOf(FINAL_LABEL_SETTINGS_HEADER) >= 0
    ? headers.indexOf(FINAL_LABEL_SETTINGS_HEADER)
    : headers.indexOf(LABEL_SETTINGS_HEADER);
  if (codeIndex < 0 || settingsIndex < 0) return [];

  return rows.slice(1).flatMap((row) => {
    const code = String(row[codeIndex] ?? "").trim();
    const rawSettings = String(row[settingsIndex] ?? "").trim();
    if (!code || !rawSettings) return [];
    try {
      const parsed = JSON.parse(rawSettings) as Partial<PharmacyLabelDraft> & { draft?: Partial<PharmacyLabelDraft> };
      const saved = parsed.draft ?? parsed;
      if (
        (saved.labelFamily !== "drug" && saved.labelFamily !== "cabinet")
        || !saved.category
        || !saved.size
        || !saved.printable
        || !saved.style
      ) return [];
      return [{
        ...saved,
        id: saved.id || `pharmacy-label-${saved.labelFamily}-${saved.category}-${code}`,
        code,
        itemCode: saved.itemCode ?? "",
        location: saved.location ?? "",
        atc: saved.atc ?? "",
        expiry: saved.expiry ?? "",
        imagePath: saved.imagePath ?? "",
        imageSourceUrl: saved.imageSourceUrl ?? "",
        backgroundColor: saved.backgroundColor ?? "#ffffff",
        warnings: Array.isArray(saved.warnings) ? saved.warnings : [],
        drugTypes: Array.isArray(saved.drugTypes) ? saved.drugTypes : [],
        sourceType: "manual" as const,
        savedAt: saved.savedAt || new Date().toISOString(),
      } as PharmacySavedLabel];
    } catch {
      return [];
    }
  });
}

async function persistPharmacyWorkbook(workbook: XLSX.WorkBook) {
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
    if (isPublishedViewer()) throw cloudSaveError(error);
  }
  if (isPublishedViewer()) throw cloudSaveError(undefined);
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

function upsertHospitalDrugMasterRow(sheet: XLSX.WorkSheet, row: HospitalDrugLabelRow, originalCode = row.code) {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").replace(/\n/g, " ").trim());
  const index = new Map(headers.map((header, position) => [header, position]));
  ensureColumns(sheet, headers, index, MASTER_EXTRA_HEADERS);
  const codeIndex = index.get("약품코드");
  if (codeIndex == null) throw new Error("원내보유의약품리스트에서 약품코드 열을 찾지 못했습니다.");
  const existingRowIndex = rows.findIndex((sourceRow, position) => position > 0 && compact(sourceRow[codeIndex]).toUpperCase() === compact(originalCode).toUpperCase());
  const rowIndex = existingRowIndex >= 0 ? existingRowIndex : rows.length;
  const sideLabel1T = Boolean(row.sideLabel && row.labelDose1T);
  const sideLabelHalfT = Boolean(row.sideLabel && row.labelDoseHalfT);
  const sideLabelQuarterT = Boolean(row.sideLabel && row.labelDoseQuarterT);
  const anyCapLabel = Boolean(row.regularCapLabel || row.coloredCapLabel);
  const updates: Record<string, unknown> = {
    약품코드: row.code, 물품코드: row.itemCode ?? "", 상용약품명: row.name, 한글약품명: row.koreanName,
    함량: row.strength, 약품유형: row.drugType,
    "약제팀 라벨 세부유형": row.pharmacyLabelTypes?.length ? row.pharmacyLabelTypes.join(", ") : "없음",
    위치: row.location ?? "", 앰플꽂이: row.ampouleHolder ?? "", 원내보유: yes(row.inHospital), 보관법: row.storage,
    차광필요: row.lightProtected ? "차광" : "", 고가약: yes(row.highCost), 위해의약품: yes(row.hazardous), 고위험의약품: yes(row.highRisk),
    고위험의약품분류: row.highRiskCategory ?? "", 유사모양: yes(row.similarLook), 유사발음: yes(row.similarSound),
    용량주의: yes(row.doseCaution), 용량확인: yes(row.doseCheck), 이름주의: yes(row.nameCaution), 마약: yes(row.narcotic),
    "용해액 필요": yes(row.needsDiluent), "니들 필요": yes(row.needsNeedle),
    향정: yes(row.psychotropic), 항암제: yes(row.anticancer), "E-cart": yes(row.eCart), "E-cart(NICU)": yes(row.eCartNicu),
    측면라벨: yes(row.sideLabel), 유색측면라벨: yes(isLabelMarked(row.coloredSideLabel)), 병뚜껑: yes(row.regularCapLabel),
    유색병뚜껑: yes(row.coloredCapLabel), "정제용량 1T": yes(row.labelDose1T), "정제용량 0.5T": yes(row.labelDoseHalfT),
    "정제용량 0.25T": yes(row.labelDoseQuarterT), "1T 3단장 뺑뺑이 PTP 측면라벨": yes(sideLabel1T),
    "0.5T 3단장 뺑뺑이 병 측면라벨": yes(sideLabelHalfT), "0.25T 3단장 뺑뺑이 병 측면라벨": yes(sideLabelQuarterT),
    "3단장 유색 반티통 측면라벨": yes(isLabelMarked(row.coloredSideLabel)), "3단장 유색 반티통 병뚜껑": yes(anyCapLabel),
  };
  if (existingRowIndex < 0) {
    const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
    range.e.r = Math.max(range.e.r, rowIndex);
    sheet["!ref"] = XLSX.utils.encode_range(range);
  }
  setRowValues(sheet, index, rowIndex, updates);
}

export async function saveHospitalDrugMasterRowToWorkbook(row: HospitalDrugLabelRow, workbookUrl: string, originalCode = row.code) {
  const workbook = await loadPharmacyWorkbook(workbookUrl);
  upsertHospitalDrugMasterRow(workbook.Sheets[workbook.SheetNames[0]], row, originalCode);
  return persistPharmacyWorkbook(workbook);
}

export async function saveHospitalDrugMasterRowsToWorkbook(rows: HospitalDrugLabelRow[], workbookUrl: string) {
  const workbook = await loadPharmacyWorkbook(workbookUrl);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  for (const row of rows) upsertHospitalDrugMasterRow(sheet, row);
  return persistPharmacyWorkbook(workbook);
}

function deleteWorksheetRow(sheet: XLSX.WorkSheet, rowIndex: number) {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
  for (let row = rowIndex; row < range.e.r; row += 1) {
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const targetAddress = XLSX.utils.encode_cell({ r: row, c: column });
      const sourceAddress = XLSX.utils.encode_cell({ r: row + 1, c: column });
      const sourceCell = sheet[sourceAddress];
      if (sourceCell) sheet[targetAddress] = { ...sourceCell };
      else delete sheet[targetAddress];
    }
  }
  for (let column = range.s.c; column <= range.e.c; column += 1) delete sheet[XLSX.utils.encode_cell({ r: range.e.r, c: column })];
  if (sheet["!rows"]) sheet["!rows"]?.splice(rowIndex, 1);
  range.e.r = Math.max(range.s.r, range.e.r - 1);
  sheet["!ref"] = XLSX.utils.encode_range(range);
}

function deleteHospitalDrugRows(workbook: XLSX.WorkBook, codes: string[]) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true });
  const headers = (rows[0] ?? []).map((value) => String(value ?? "").replace(/\n/g, " ").trim());
  const codeIndex = headers.indexOf("약품코드");
  if (codeIndex < 0) throw new Error("원내보유의약품리스트에서 약품코드 열을 찾지 못했습니다.");
  const requestedCodes = new Set(codes.map((code) => compact(code).toUpperCase()).filter(Boolean));
  const foundCodes = new Set<string>();
  const rowIndices = rows.flatMap((sourceRow, position) => {
    if (position === 0) return [];
    const code = compact(sourceRow[codeIndex]).toUpperCase();
    if (!requestedCodes.has(code)) return [];
    foundCodes.add(code);
    return [position];
  });
  for (const rowIndex of rowIndices.sort((left, right) => right - left)) deleteWorksheetRow(sheet, rowIndex);
  return {
    deletedCount: rowIndices.length,
    missingCodes: [...requestedCodes].filter((code) => !foundCodes.has(code)),
  };
}

export async function deleteHospitalDrugMasterRowFromWorkbook(code: string, workbookUrl: string) {
  const workbook = await loadPharmacyWorkbook(workbookUrl);
  const result = deleteHospitalDrugRows(workbook, [code]);
  if (result.deletedCount === 0) throw new Error(`[${code}] 약품을 원내보유의약품리스트에서 찾지 못했습니다.`);
  return persistPharmacyWorkbook(workbook);
}

export async function deleteHospitalDrugMasterRowsFromWorkbook(codes: string[], workbookUrl: string) {
  const workbook = await loadPharmacyWorkbook(workbookUrl);
  const result = deleteHospitalDrugRows(workbook, codes);
  const saveMode = result.deletedCount > 0 ? await persistPharmacyWorkbook(workbook) : "server" as const;
  return { ...result, saveMode };
}

function isLabelMarked(value?: string) {
  return value?.trim().toUpperCase() === "Y";
}
