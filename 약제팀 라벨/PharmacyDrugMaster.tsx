import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { FileDown, Search, Trash2, Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { matchesHospitalDrugLabel, type HospitalDrugLabelRow } from "./hospitalDrugLabels";

type Props = {
  rows: HospitalDrugLabelRow[];
  isLoading: boolean;
  onSave: (row: HospitalDrugLabelRow, originalCode?: string) => Promise<string>;
  onSaveMany: (rows: HospitalDrugLabelRow[]) => Promise<string>;
  onDelete: (row: HospitalDrugLabelRow) => Promise<string>;
  onBulkSave: (rows: HospitalDrugLabelRow[]) => Promise<string>;
  onBulkDelete: (codes: string[]) => Promise<string>;
};

type NewDrugFields = {
  code: string;
  itemCode: string;
  name: string;
  koreanName: string;
  strength: string;
  location: string;
  drugType: "경구" | "주사" | "외용" | "일반수액";
};

type SharedFlagKey =
  | "highRisk" | "similarLook" | "similarSound" | "doseCaution" | "doseCheck" | "nameCaution"
  | "lightProtected" | "highCost" | "hazardous" | "narcotic" | "psychotropic" | "anticancer" | "eCart" | "eCartNicu";

const EMPTY_NEW_DRUG: NewDrugFields = {
  code: "",
  itemCode: "",
  name: "",
  koreanName: "",
  strength: "",
  location: "",
  drugType: "경구",
};
const MASTER_DRUG_GROUPS = ["경구", "주사", "외용", "일반수액"] as const;
const BULK_UPLOAD_HEADERS = ["약품코드", "물품코드", "상용약품명", "한글약품명", "함량", "의약품 분류"] as const;
const ROUTE_GROUPS = {
  경구: ["원병", "PTP", "ATC", "입원산제"],
  외용: ["외용제", "외용점안제", "팩제", "시럽"],
  주사: ["앰플", "바이알", "냉장주사", "영양수액", "일반수액"],
} as const;

const SHARED_FLAGS: { key: SharedFlagKey; label: string }[] = [
  { key: "highRisk", label: "고위험의약품" },
  { key: "similarLook", label: "유사모양" },
  { key: "similarSound", label: "유사발음" },
  { key: "doseCaution", label: "용량주의" },
  { key: "doseCheck", label: "용량확인" },
  { key: "nameCaution", label: "이름주의" },
  { key: "lightProtected", label: "차광" },
  { key: "highCost", label: "고가약" },
  { key: "hazardous", label: "위해의약품" },
  { key: "narcotic", label: "마약" },
  { key: "psychotropic", label: "향정" },
  { key: "anticancer", label: "항암제" },
  { key: "eCart", label: "E-cart" },
  { key: "eCartNicu", label: "E-cart(NICU)" },
];

const MASTER_LISTS = [
  ...SHARED_FLAGS.slice(0, 6),
  { key: "lightProtected" as const, label: "차광" },
  { key: "refrigerated" as const, label: "냉장" },
  ...SHARED_FLAGS.slice(7),
];

function marked(value?: string) {
  return value?.trim().toUpperCase() === "Y";
}

function isRefrigerated(row: HospitalDrugLabelRow) {
  const storage = row.storage.replace(/\s+/g, "");
  return !storage.includes("냉장보관하지") && (storage.includes("냉장") || /2[-~～]8/.test(storage));
}

function setRefrigerated(storage: string, checked: boolean) {
  const withoutCold = storage.replace(/냉장(?:보관)?/g, "").replace(/\s{2,}/g, " ").trim();
  return checked ? [withoutCold, "냉장"].filter(Boolean).join(" ") : withoutCold;
}

function routeForType(drugType: string) {
  if (drugType in ROUTE_GROUPS) return drugType as keyof typeof ROUTE_GROUPS;
  return (Object.entries(ROUTE_GROUPS).find(([, types]) => (types as readonly string[]).includes(drugType))?.[0] ?? "경구") as keyof typeof ROUTE_GROUPS;
}

function subtypeForType(drugType: string) {
  const route = routeForType(drugType);
  return (ROUTE_GROUPS[route] as readonly string[]).includes(drugType) ? drugType : ROUTE_GROUPS[route][0];
}

export function normalizePharmacyLabelMasterRow(row: HospitalDrugLabelRow): HospitalDrugLabelRow {
  return {
    ...row,
    drugType: subtypeForType(row.drugType),
    pharmacyLabelTypes: pharmacyLabelTypesForRow(row),
    inHospital: true,
  };
}

function pharmacyLabelTypesForRow(row: HospitalDrugLabelRow) {
  if (row.pharmacyLabelTypes) return row.pharmacyLabelTypes;
  const types = [subtypeForType(row.drugType)];
  if (row.atc) types.push("ATC");
  if (row.ptpOpened) types.push("PTP");
  if (row.inpatientPowderPtp) types.push("입원산제");
  return [...new Set(types)];
}

function createNewMasterRow(fields: NewDrugFields): HospitalDrugLabelRow {
  return {
    code: fields.code.trim(),
    itemCode: fields.itemCode.trim(),
    name: fields.name.trim(),
    koreanName: fields.koreanName.trim(),
    strength: fields.strength.trim(),
    location: fields.location.trim(),
    drugType: fields.drugType,
    spec: fields.strength.trim(),
    package: "",
    storage: "",
    lightProtected: false,
    inHospital: true,
    similarLook: false,
    similarSound: false,
    doseCaution: false,
    doseCheck: false,
    highRisk: false,
    nameCaution: false,
    highCost: false,
    hazardous: false,
    narcotic: false,
    psychotropic: false,
    anticancer: false,
    eCart: false,
    eCartNicu: false,
    sideLabel: false,
    labelDose1T: false,
    labelDoseHalfT: false,
    labelDoseQuarterT: false,
    coloredSideLabel: "N",
    capLabel: "N",
    regularCapLabel: false,
    coloredCapLabel: false,
  };
}

function parseBulkUpload(fileData: ArrayBuffer, action: "register" | "delete") {
  const workbook = XLSX.read(fileData, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const sourceRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
  const headers = (sourceRows[0] ?? []).map((value) => String(value ?? "").replace(/\s+/g, " ").trim());
  const requiredHeaders = action === "register" ? [...BULK_UPLOAD_HEADERS] : ["약품코드"];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) throw new Error(`필수 열이 없습니다: ${missingHeaders.join(", ")}`);
  const column = (name: string) => headers.indexOf(name);
  const rows = sourceRows.slice(1).map((sourceRow, index) => ({
    rowNumber: index + 2,
    code: String(sourceRow[column("약품코드")] ?? "").trim(),
    itemCode: String(sourceRow[column("물품코드")] ?? "").trim(),
    name: String(sourceRow[column("상용약품명")] ?? "").trim(),
    koreanName: String(sourceRow[column("한글약품명")] ?? "").trim(),
    strength: String(sourceRow[column("함량")] ?? "").trim(),
    drugType: String(sourceRow[column("의약품 분류")] ?? "").trim(),
  })).filter((row) => row.code);
  if (rows.length === 0) throw new Error("등록 또는 삭제할 약품코드가 없습니다.");
  const duplicateCode = rows.find((row, index) => rows.findIndex((candidate) => candidate.code.toUpperCase() === row.code.toUpperCase()) !== index);
  if (duplicateCode) throw new Error(`${duplicateCode.rowNumber}행의 약품코드가 파일 안에서 중복되었습니다: ${duplicateCode.code}`);
  if (action === "register") {
    for (const row of rows) {
      if (!row.name) throw new Error(`${row.rowNumber}행의 상용약품명이 비어 있습니다.`);
      if (!(MASTER_DRUG_GROUPS as readonly string[]).includes(row.drugType)) {
        throw new Error(`${row.rowNumber}행의 의약품 분류는 경구, 주사, 외용, 일반수액 중 하나여야 합니다.`);
      }
    }
  }
  return rows;
}

function editableFieldsFromRow(row: HospitalDrugLabelRow): NewDrugFields {
  const drugType = row.drugType === "일반수액"
    ? row.drugType
    : routeForType(row.drugType);
  return {
    code: row.code,
    itemCode: row.itemCode ?? "",
    name: row.name,
    koreanName: row.koreanName,
    strength: row.strength,
    location: row.location ?? "",
    drugType,
  };
}

function masterListMatches(row: HospitalDrugLabelRow, key: (typeof MASTER_LISTS)[number]["key"]) {
  if (key === "refrigerated") return isRefrigerated(row);
  return Boolean(row[key]);
}

function compactCategory(value?: string) {
  return value?.replace(/\s+/g, "") ?? "";
}

function isInjectableDrug(row: HospitalDrugLabelRow) {
  return ["주사", "앰플", "바이알", "냉장주사", "영양수액", "일반수액"].includes(row.drugType)
    || /(?:inj|injection|vial|amp|ampoule|prefilled|syringe|주사)/i.test(`${row.name} ${row.koreanName}`);
}

function isControlledHighRisk(row: HospitalDrugLabelRow) {
  return Boolean(row.narcotic || row.psychotropic)
    && (compactCategory(row.highRiskCategory) === "중등도진정의약품" || isInjectableDrug(row));
}

function isPriorityHighRisk(row: HospitalDrugLabelRow) {
  const category = compactCategory(row.highRiskCategory);
  return row.highRisk && category !== "중등도진정의약품" && category !== "주사용항암제";
}

export function PharmacyDrugMaster({ rows, isLoading, onSave, onSaveMany, onDelete, onBulkSave, onBulkDelete }: Props) {
  const [workingRows, setWorkingRows] = useState(rows);
  const [sharedQuery, setSharedQuery] = useState("");
  const [labelQuery, setLabelQuery] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [labelCode, setLabelCode] = useState("");
  const [newShared, setNewShared] = useState<NewDrugFields>(EMPTY_NEW_DRUG);
  const [editingOriginalCode, setEditingOriginalCode] = useState("");
  const [sharedStatus, setSharedStatus] = useState("");
  const [labelStatus, setLabelStatus] = useState("");
  const [labelBatchCodes, setLabelBatchCodes] = useState<string[]>([]);
  const [listKey, setListKey] = useState<(typeof MASTER_LISTS)[number]["key"]>("highRisk");

  useEffect(() => setWorkingRows(rows), [rows]);

  const sharedMatches = useMemo(
    () => workingRows.filter((row) => matchesHospitalDrugLabel(row, sharedQuery)).slice(0, 12),
    [sharedQuery, workingRows],
  );
  const labelMatches = useMemo(
    () => workingRows.filter((row) => matchesHospitalDrugLabel(row, labelQuery)).slice(0, 12),
    [labelQuery, workingRows],
  );
  const sharedRow = workingRows.find((row) => row.code === sharedCode) ?? sharedMatches[0];
  const labelRow = workingRows.find((row) => row.code === labelCode) ?? labelMatches[0];
  const selectedList = MASTER_LISTS.find((item) => item.key === listKey) ?? MASTER_LISTS[0];
  const listRows = workingRows
    .filter((row) => row.inHospital && masterListMatches(row, listKey))
    .sort((left, right) => {
      if (listKey === "highRisk") {
        const priorityDifference = Number(isPriorityHighRisk(right)) - Number(isPriorityHighRisk(left));
        if (priorityDifference) return priorityDifference;
        const categoryDifference = compactCategory(left.highRiskCategory).localeCompare(compactCategory(right.highRiskCategory), "ko");
        if (categoryDifference) return categoryDifference;
      }
      return left.name.localeCompare(right.name, "ko");
    });

  function patchRow(code: string, patch: Partial<HospitalDrugLabelRow>) {
    setWorkingRows((current) => current.map((row) => row.code === code ? { ...row, ...patch } : row));
  }

  function toggleSharedFlag(row: HospitalDrugLabelRow, key: SharedFlagKey) {
    const checked = !row[key];
    const patch: Partial<HospitalDrugLabelRow> = { [key]: checked };
    const category = compactCategory(row.highRiskCategory);
    const nextRow = { ...row, [key]: checked };
    if (checked && (key === "narcotic" || key === "psychotropic") && isControlledHighRisk(nextRow)) {
      patch.highRisk = true;
      patch.highRiskCategory = row.highRiskCategory?.trim() || "중등도진정의약품";
    }
    if (key === "highRisk" && !checked && isControlledHighRisk(row)) {
      patch.highRisk = true;
    }
    if (checked && key === "anticancer" && (category === "주사용항암제" || isInjectableDrug(row))) {
      patch.highRisk = true;
      patch.highRiskCategory = row.highRiskCategory?.trim() || "주사용 항암제";
    }
    patchRow(row.code, patch);
  }

  async function saveRow(row: HospitalDrugLabelRow | undefined, setStatus: (value: string) => void, originalCode?: string) {
    if (!row) return false;
    setStatus("저장 중...");
    try {
      setStatus(await onSave(row, originalCode));
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "약품 마스터를 저장하지 못했습니다.");
      return false;
    }
  }

  async function saveSelectedLabelRows() {
    const selectedRows = workingRows
      .filter((row) => labelBatchCodes.includes(row.code))
      .map(normalizePharmacyLabelMasterRow);
    if (selectedRows.length === 0) return;
    setLabelStatus("선택 항목 일괄 저장 중...");
    try {
      setLabelStatus(await onSaveMany(selectedRows));
      setLabelBatchCodes([]);
    } catch (error) {
      setLabelStatus(error instanceof Error ? error.message : "선택 항목을 일괄 저장하지 못했습니다.");
    }
  }

  async function registerNew(
    fields: NewDrugFields,
    setFields: (value: NewDrugFields) => void,
    setCode: (value: string) => void,
    setStatus: (value: string) => void,
    onRegistered?: (row: HospitalDrugLabelRow) => void,
  ) {
    if (!fields.code.trim() || !fields.name.trim()) {
      setStatus("약품코드와 상용약품명을 입력해 주십시오.");
      return;
    }
    if (workingRows.some((row) => row.code.toLowerCase() === fields.code.trim().toLowerCase())) {
      setStatus("이미 등록된 약품코드입니다. 검색 결과에서 해당 약품을 선택해 주십시오.");
      return;
    }
    const next = createNewMasterRow(fields);
    setWorkingRows((current) => [...current, next]);
    setCode(next.code);
    onRegistered?.(next);
    setFields(EMPTY_NEW_DRUG);
    setEditingOriginalCode("");
    await saveRow(next, setStatus);
  }

  async function updateExisting(fields: NewDrugFields) {
    const existing = workingRows.find((row) => row.code.toLowerCase() === editingOriginalCode.toLowerCase());
    if (!existing) {
      setSharedStatus("수정할 기존 약품을 먼저 검색하여 선택해 주십시오.");
      return;
    }
    const nextCode = fields.code.trim();
    if (!nextCode || !fields.name.trim()) {
      setSharedStatus("약품코드와 상용약품명을 입력해 주십시오.");
      return;
    }
    if (workingRows.some((row) => row.code.toLowerCase() === nextCode.toLowerCase() && row.code !== existing.code)) {
      setSharedStatus("변경할 약품코드가 다른 약품에 이미 등록되어 있습니다.");
      return;
    }
    const next: HospitalDrugLabelRow = {
      ...existing,
      code: nextCode,
      itemCode: fields.itemCode.trim(),
      name: fields.name.trim(),
      koreanName: fields.koreanName.trim(),
      strength: fields.strength.trim(),
      location: fields.location.trim(),
      spec: fields.strength.trim() || existing.spec,
    };
    setWorkingRows((current) => current.map((row) => row.code === existing.code ? next : row));
    setSharedCode(next.code);
    setLabelCode(next.code);
    setSharedQuery(next.name);
    setLabelQuery(next.name);
    if (await saveRow(next, setSharedStatus, existing.code)) setEditingOriginalCode(next.code);
  }

  async function deleteExisting(row: HospitalDrugLabelRow | undefined) {
    if (!row) return;
    if (!window.confirm(`[${row.code}] ${row.name} 약품을 삭제하시겠습니까?\n\n원내보유의약품리스트 엑셀과 약품 라벨, 약품 목록, 병동 비품 관련 화면에서 모두 삭제됩니다.`)) return;
    setSharedStatus("삭제 중...");
    try {
      const message = await onDelete(row);
      setWorkingRows((current) => current.filter((currentRow) => currentRow.code.toUpperCase() !== row.code.toUpperCase()));
      setSharedCode("");
      setLabelCode("");
      setEditingOriginalCode("");
      setNewShared(EMPTY_NEW_DRUG);
      setSharedStatus(message);
    } catch (error) {
      setSharedStatus(error instanceof Error ? error.message : "약품을 삭제하지 못했습니다.");
    }
  }

  function downloadBulkTemplate() {
    const workbook = XLSX.utils.book_new();
    const uploadSheet = XLSX.utils.aoa_to_sheet([[...BULK_UPLOAD_HEADERS]]);
    uploadSheet["!cols"] = [{ wch: 18 }, { wch: 18 }, { wch: 34 }, { wch: 28 }, { wch: 18 }, { wch: 16 }];
    const guideSheet = XLSX.utils.aoa_to_sheet([
      ["작업", "입력 기준"],
      ["일괄 등록", "6개 열을 모두 유지하고 약품코드, 상용약품명, 의약품 분류를 반드시 입력합니다."],
      ["일괄 삭제", "약품코드만 입력하면 되며 나머지 열은 비워도 됩니다."],
      ["의약품 분류", "경구, 주사, 외용, 일반수액 중 하나를 입력합니다."],
    ]);
    XLSX.utils.book_append_sheet(workbook, uploadSheet, "약품 일괄 작업");
    XLSX.utils.book_append_sheet(workbook, guideSheet, "작성 안내");
    XLSX.writeFile(workbook, "약품마스터_일괄등록삭제_양식.xlsx", { compression: true });
  }

  async function uploadBulkFile(event: ChangeEvent<HTMLInputElement>, action: "register" | "delete") {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setSharedStatus(action === "register" ? "일괄 등록 중..." : "일괄 삭제 중...");
    try {
      const uploadedRows = parseBulkUpload(await file.arrayBuffer(), action);
      if (action === "register") {
        const existing = uploadedRows.find((row) => workingRows.some((current) => current.code.toUpperCase() === row.code.toUpperCase()));
        if (existing) throw new Error(`이미 등록된 약품코드입니다: ${existing.code}`);
        const masterRows = uploadedRows.map((row) => createNewMasterRow({
          code: row.code,
          itemCode: row.itemCode,
          name: row.name,
          koreanName: row.koreanName,
          strength: row.strength,
          location: "",
          drugType: row.drugType as NewDrugFields["drugType"],
        }));
        const message = await onBulkSave(masterRows);
        setWorkingRows((current) => [...current, ...masterRows]);
        setSharedStatus(message);
        return;
      }
      const codes = uploadedRows.map((row) => row.code);
      if (!window.confirm(`${codes.length}개 약품을 일괄 삭제하시겠습니까?\n\n원내보유의약품리스트 엑셀과 전체 관련 화면에서 삭제됩니다.`)) {
        setSharedStatus("일괄 삭제를 취소했습니다.");
        return;
      }
      const message = await onBulkDelete(codes);
      const deletedCodes = new Set(codes.map((code) => code.toUpperCase()));
      setWorkingRows((current) => current.filter((row) => !deletedCodes.has(row.code.toUpperCase())));
      setSharedCode("");
      setLabelCode("");
      setEditingOriginalCode("");
      setSharedStatus(message);
    } catch (error) {
      setSharedStatus(error instanceof Error ? error.message : "엑셀 일괄 작업을 처리하지 못했습니다.");
    }
  }

  function renderSearchResults(
    matches: HospitalDrugLabelRow[],
    selectedCode: string,
    setCode: (code: string) => void,
    batchCodes?: string[],
    onToggleBatch?: (code: string) => void,
  ) {
    return <div className="pharmacy-master-search-results">
      {isLoading && <span className="empty">약품 데이터를 불러오는 중입니다.</span>}
      {!isLoading && matches.length === 0 && <span className="empty">검색된 약품이 없습니다.</span>}
      {matches.map((row) => <div className={`pharmacy-master-search-row ${row.code === selectedCode ? "active" : ""}`} key={row.code}>
        {onToggleBatch && <label className={`pharmacy-master-row-check ${batchCodes?.includes(row.code) ? "checked" : ""}`}>
          <input type="checkbox" checked={batchCodes?.includes(row.code) ?? false} onChange={() => onToggleBatch(row.code)}/>
          <span>{row.name} 일괄 저장 선택</span>
        </label>}
        <button type="button" onClick={() => setCode(row.code)}>
          <strong>{row.name}</strong><small>{row.koreanName || "-"} · {row.code}</small>
        </button>
      </div>)}
    </div>;
  }

  function renderNewRegistration(
    title: string,
    fields: NewDrugFields,
    setFields: (value: NewDrugFields) => void,
    onRegister: () => void,
    selectedRow?: HospitalDrugLabelRow,
  ) {
    const field = (key: keyof NewDrugFields, placeholder: string) =>
      <input value={fields[key]} placeholder={placeholder} onChange={(event) => setFields({ ...fields, [key]: event.target.value })}/>;
    return <details className="pharmacy-master-new-drug">
      <summary>{title}</summary>
      <div>
        {field("code", "약품코드 *")}
        {field("itemCode", "물품코드")}
        {field("name", "상용약품명 *")}
        {field("koreanName", "한글약품명")}
        {field("strength", "함량")}
        {field("location", "약품장 위치")}
        <label className="pharmacy-master-new-type">의약품 분류
          <select value={fields.drugType} onChange={(event) => setFields({ ...fields, drugType: event.target.value as NewDrugFields["drugType"] })}>
            {MASTER_DRUG_GROUPS.map((group) => <option key={group}>{group}</option>)}
          </select>
        </label>
        <div className="pharmacy-master-bulk-actions">
          <button type="button" className="secondary-button" onClick={onRegister}>신규 등록 후 선택</button>
          <button
            type="button"
            className="secondary-button"
            disabled={!selectedRow}
            onClick={() => {
              if (!selectedRow) return;
              setFields(editableFieldsFromRow(selectedRow));
              setEditingOriginalCode(selectedRow.code);
            }}
          >
            선택 약품 불러오기
          </button>
          <button type="button" className="secondary-button" disabled={!editingOriginalCode} onClick={() => void updateExisting(fields)}>수정 저장</button>
          <button type="button" className="secondary-button danger-light" disabled={!selectedRow} onClick={() => void deleteExisting(selectedRow)}>
            <Trash2 size={15}/>선택 약품 삭제
          </button>
          <label className="secondary-button"><Upload size={15}/>엑셀 일괄 등록<input className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => void uploadBulkFile(event, "register")}/></label>
          <label className="secondary-button danger-light"><Upload size={15}/>엑셀 일괄 삭제<input className="hidden-file-input" type="file" accept=".xlsx,.xls" onChange={(event) => void uploadBulkFile(event, "delete")}/></label>
          <button type="button" className="secondary-button pharmacy-master-template-download" onClick={downloadBulkTemplate}><FileDown size={15}/>일괄 작업 양식 다운로드</button>
        </div>
      </div>
    </details>;
  }

  function toggleLabelType(row: HospitalDrugLabelRow, type: "all" | "side" | "coloredSide" | "cap" | "coloredCap") {
    const allChecked = Boolean(row.sideLabel && marked(row.coloredSideLabel) && row.regularCapLabel && row.coloredCapLabel);
    if (type === "all") {
      const checked = !allChecked;
      patchRow(row.code, {
        sideLabel: checked,
        coloredSideLabel: checked ? "Y" : "N",
        regularCapLabel: checked,
        coloredCapLabel: checked,
        capLabel: checked ? "Y" : "N",
        ...(checked && !row.labelDose1T && !row.labelDoseHalfT && !row.labelDoseQuarterT ? { labelDose1T: true } : {}),
      });
      return;
    }
    if (type === "side") {
      patchRow(row.code, {
        sideLabel: !row.sideLabel,
        ...(!row.sideLabel && !row.labelDose1T && !row.labelDoseHalfT && !row.labelDoseQuarterT ? { labelDose1T: true } : {}),
      });
    }
    if (type === "coloredSide") patchRow(row.code, { coloredSideLabel: marked(row.coloredSideLabel) ? "N" : "Y" });
    if (type === "cap") patchRow(row.code, { regularCapLabel: !row.regularCapLabel, capLabel: !row.regularCapLabel || row.coloredCapLabel ? "Y" : "N" });
    if (type === "coloredCap") patchRow(row.code, { coloredCapLabel: !row.coloredCapLabel, capLabel: row.regularCapLabel || !row.coloredCapLabel ? "Y" : "N" });
  }

  return <section className="pharmacy-master-grid">
    <article className="pharmacy-master-column">
      <header><p>전사 공통 기준</p><h2>주의·보관·관리 분류</h2><span>병동 라벨, 비치의약품 및 E-cart 라벨에 함께 적용됩니다.</span></header>
      <label className="pharmacy-list-search"><Search size={16}/><input value={sharedQuery} onChange={(event) => setSharedQuery(event.target.value)} placeholder="약품코드·약품명 검색"/></label>
      {renderSearchResults(sharedMatches, sharedRow?.code ?? "", setSharedCode)}
      {renderNewRegistration("신규 약품 등록·수정", newShared, setNewShared, () => void registerNew(
        newShared,
        setNewShared,
        setSharedCode,
        setSharedStatus,
        (row) => {
          setLabelCode(row.code);
          setLabelQuery(row.code);
        },
      ), workingRows.find((row) => row.code === sharedCode))}
      {sharedRow && <div className="pharmacy-master-editor">
        <div className="pharmacy-master-selected"><strong>{sharedRow.name}</strong><small>{sharedRow.code} · {sharedRow.koreanName || "-"}</small></div>
        <div className="pharmacy-master-check-grid">
          {SHARED_FLAGS.map((flag) => <label key={flag.key} className={sharedRow[flag.key] ? "checked" : ""}>
            <input type="checkbox" checked={Boolean(sharedRow[flag.key])} onChange={() => toggleSharedFlag(sharedRow, flag.key)}/><span>{flag.label}</span>
          </label>)}
          <label className={isRefrigerated(sharedRow) ? "checked" : ""}>
            <input type="checkbox" checked={isRefrigerated(sharedRow)} onChange={(event) => patchRow(sharedRow.code, { storage: setRefrigerated(sharedRow.storage, event.target.checked) })}/><span>냉장</span>
          </label>
        </div>
        <button type="button" className="print-button pharmacy-master-save" onClick={() => void saveRow(sharedRow, setSharedStatus)}>저장 및 전체 적용</button>
        {sharedStatus && <p className="pharmacy-master-status">{sharedStatus}</p>}
      </div>}
    </article>

    <article className="pharmacy-master-column">
      <header><p>약제팀 라벨 전용</p><h2>제형·라벨 유형 설정</h2><span>이 영역의 변경은 병동 비치의약품과 E-cart 목록에 영향을 주지 않습니다.</span></header>
      <label className="pharmacy-list-search"><Search size={16}/><input value={labelQuery} onChange={(event) => setLabelQuery(event.target.value)} placeholder="약품코드·약품명 검색"/></label>
      <div className="pharmacy-master-list-batch-toolbar">
        <label><input type="checkbox" checked={labelMatches.length > 0 && labelMatches.every((row) => labelBatchCodes.includes(row.code))} onChange={() => {
          const visibleCodes = labelMatches.map((row) => row.code);
          const allVisibleSelected = visibleCodes.length > 0 && visibleCodes.every((code) => labelBatchCodes.includes(code));
          setLabelBatchCodes((current) => allVisibleSelected
            ? current.filter((code) => !visibleCodes.includes(code))
            : [...new Set([...current, ...visibleCodes])]);
        }}/><span>현재 검색 결과 전체 선택</span></label>
        <b>선택 {labelBatchCodes.length.toLocaleString("ko-KR")}개</b>
      </div>
      {renderSearchResults(labelMatches, labelRow?.code ?? "", setLabelCode, labelBatchCodes, (code) => setLabelBatchCodes((current) => current.includes(code) ? current.filter((value) => value !== code) : [...current, code]))}
      {labelRow && <div className="pharmacy-master-editor">
        <div className="pharmacy-master-selected"><strong>{labelRow.name}</strong><small>{labelRow.code} · {labelRow.koreanName || "-"}</small></div>
        <div className="pharmacy-master-selects">
          <label>대분류<select value={routeForType(labelRow.drugType)} onChange={(event) => {
            const route = event.target.value as keyof typeof ROUTE_GROUPS;
            patchRow(labelRow.code, { drugType: ROUTE_GROUPS[route][0], pharmacyLabelTypes: [ROUTE_GROUPS[route][0]] });
          }}>{Object.keys(ROUTE_GROUPS).map((route) => <option key={route}>{route}</option>)}</select></label>
          <div className="pharmacy-master-subtype-field"><span>세부 유형</span><div className="pharmacy-master-check-grid">
            {ROUTE_GROUPS[routeForType(labelRow.drugType)].map((type) => {
              const selectedTypes = pharmacyLabelTypesForRow(labelRow);
              return <label key={type} className={selectedTypes.includes(type) ? "checked" : ""}>
                <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => patchRow(labelRow.code, {
                  pharmacyLabelTypes: selectedTypes.includes(type) ? selectedTypes.filter((value) => value !== type) : [...selectedTypes, type],
                })}/><span>{type}</span>
              </label>;
            })}
          </div></div>
          {pharmacyLabelTypesForRow(labelRow).includes("앰플") && <div className="pharmacy-master-subtype-field"><span>앰플 라벨</span><div className="pharmacy-master-check-grid">
            <label className={marked(labelRow.ampouleHolder) ? "checked" : ""}>
              <input type="checkbox" checked={marked(labelRow.ampouleHolder)} onChange={() => patchRow(labelRow.code, { ampouleHolder: marked(labelRow.ampouleHolder) ? "N" : "Y" })}/><span>앰플꽂이</span>
            </label>
          </div></div>}
          <label>약품장 위치<input value={labelRow.location ?? ""} onChange={(event) => patchRow(labelRow.code, { location: event.target.value })} placeholder="예: 가LU-1"/></label>
        </div>
        {pharmacyLabelTypesForRow(labelRow).some((type) => ["원병", "PTP"].includes(type)) && <>
          <h3>라벨 유형</h3>
          <div className="pharmacy-master-check-grid">
            {[
              { type: "all" as const, label: "전체", checked: Boolean(labelRow.sideLabel && marked(labelRow.coloredSideLabel) && labelRow.regularCapLabel && labelRow.coloredCapLabel) },
              { type: "side" as const, label: "측면라벨", checked: Boolean(labelRow.sideLabel) },
              { type: "coloredSide" as const, label: "유색측면라벨", checked: marked(labelRow.coloredSideLabel) },
              { type: "cap" as const, label: "병뚜껑", checked: Boolean(labelRow.regularCapLabel) },
              { type: "coloredCap" as const, label: "유색 병뚜껑", checked: Boolean(labelRow.coloredCapLabel) },
            ].map((option) => <label key={option.type} className={option.checked ? "checked" : ""}>
              <input type="checkbox" checked={option.checked} onChange={() => toggleLabelType(labelRow, option.type)}/><span>{option.label}</span>
            </label>)}
          </div>
          <h3>정제 용량</h3>
          <div className="pharmacy-master-check-grid">
            {[
              { key: "labelDose1T" as const, label: "1T" },
              { key: "labelDoseHalfT" as const, label: "0.5T" },
              { key: "labelDoseQuarterT" as const, label: "0.25T" },
            ].map((option) => <label key={option.key} className={labelRow[option.key] ? "checked" : ""}>
              <input type="checkbox" checked={Boolean(labelRow[option.key])} onChange={() => patchRow(labelRow.code, { [option.key]: !labelRow[option.key] })}/><span>{option.label}</span>
            </label>)}
          </div>
        </>}
        {(routeForType(labelRow.drugType) === "주사" || pharmacyLabelTypesForRow(labelRow).some((type) => (ROUTE_GROUPS.주사 as readonly string[]).includes(type))) && <div className="pharmacy-master-subtype-field">
          <h3>주사 준비물</h3>
          <div className="pharmacy-master-check-grid">
            {[
              { key: "needsDiluent" as const, label: "<용해액 필요>" },
              { key: "needsNeedle" as const, label: "<니들 필요>" },
            ].map((option) => <label key={option.key} className={labelRow[option.key] ? "checked" : ""}>
              <input type="checkbox" checked={Boolean(labelRow[option.key])} onChange={() => patchRow(labelRow.code, { [option.key]: !labelRow[option.key] })}/><span>{option.label}</span>
            </label>)}
          </div>
        </div>}
        <button type="button" className="print-button pharmacy-master-save" onClick={() => void saveRow(normalizePharmacyLabelMasterRow(labelRow), setLabelStatus)}>약제팀 라벨에 저장</button>
        <div className="pharmacy-master-batch-save">
          <span>일괄 저장 선택 {labelBatchCodes.length.toLocaleString("ko-KR")}개</span>
          <button type="button" className="print-button" disabled={labelBatchCodes.length === 0} onClick={() => void saveSelectedLabelRows()}>선택 항목 약제팀 라벨에 일괄 저장</button>
        </div>
        {labelStatus && <p className="pharmacy-master-status">{labelStatus}</p>}
      </div>}
    </article>

    <article className="pharmacy-master-column pharmacy-master-lists">
      <header><p>실시간 대상 목록</p><h2>의약품 분류 리스트</h2><span>선택 분류: {selectedList.label} · 왼쪽 분류 변경 사항이 즉시 반영됩니다.</span></header>
      <div className="pharmacy-master-list-tabs">
        {MASTER_LISTS.map((item) => {
          const count = workingRows.filter((row) => row.inHospital && masterListMatches(row, item.key)).length;
          return <button type="button" key={item.key} className={listKey === item.key ? "active" : ""} onClick={() => setListKey(item.key)}>{item.label}<b>{count}</b></button>;
        })}
      </div>
      <div className="pharmacy-master-live-list">
        {listRows.length === 0 && <span className="empty">해당 분류의 약품이 없습니다.</span>}
        {listRows.map((row) => <button
          type="button"
          key={row.code}
          className={listKey === "highRisk" && isPriorityHighRisk(row) ? "high-risk-priority" : ""}
          onClick={() => { setSharedCode(row.code); setSharedQuery(row.code); }}
        >
          <strong>{row.name}</strong>
          <small>{row.koreanName || "-"} · {row.code}</small>
          {listKey === "highRisk" && <em>{row.highRiskCategory || "기타 고위험의약품"}</em>}
        </button>)}
      </div>
    </article>
  </section>;
}
