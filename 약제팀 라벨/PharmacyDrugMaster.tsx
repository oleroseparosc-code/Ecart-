import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { matchesHospitalDrugLabel, type HospitalDrugLabelRow } from "./hospitalDrugLabels";

type Props = {
  rows: HospitalDrugLabelRow[];
  isLoading: boolean;
  onSave: (row: HospitalDrugLabelRow) => Promise<string>;
};

type NewDrugFields = {
  code: string;
  itemCode: string;
  name: string;
  koreanName: string;
  strength: string;
};

type SharedFlagKey =
  | "highRisk" | "similarLook" | "similarSound" | "doseCaution" | "doseCheck" | "nameCaution"
  | "lightProtected" | "highCost" | "narcotic" | "psychotropic" | "anticancer" | "eCart" | "eCartNicu";

const EMPTY_NEW_DRUG: NewDrugFields = { code: "", itemCode: "", name: "", koreanName: "", strength: "" };
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
  return (Object.entries(ROUTE_GROUPS).find(([, types]) => (types as readonly string[]).includes(drugType))?.[0] ?? "경구") as keyof typeof ROUTE_GROUPS;
}

function subtypeForType(drugType: string) {
  const route = routeForType(drugType);
  return (ROUTE_GROUPS[route] as readonly string[]).includes(drugType) ? drugType : ROUTE_GROUPS[route][0];
}

function createNewMasterRow(fields: NewDrugFields): HospitalDrugLabelRow {
  return {
    code: fields.code.trim(),
    itemCode: fields.itemCode.trim(),
    name: fields.name.trim(),
    koreanName: fields.koreanName.trim(),
    strength: fields.strength.trim(),
    drugType: "",
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

function masterListMatches(row: HospitalDrugLabelRow, key: (typeof MASTER_LISTS)[number]["key"]) {
  if (key === "refrigerated") return isRefrigerated(row);
  return Boolean(row[key]);
}

export function PharmacyDrugMaster({ rows, isLoading, onSave }: Props) {
  const [workingRows, setWorkingRows] = useState(rows);
  const [sharedQuery, setSharedQuery] = useState("");
  const [labelQuery, setLabelQuery] = useState("");
  const [sharedCode, setSharedCode] = useState("");
  const [labelCode, setLabelCode] = useState("");
  const [newShared, setNewShared] = useState<NewDrugFields>(EMPTY_NEW_DRUG);
  const [newLabel, setNewLabel] = useState<NewDrugFields>(EMPTY_NEW_DRUG);
  const [sharedStatus, setSharedStatus] = useState("");
  const [labelStatus, setLabelStatus] = useState("");
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
    .sort((left, right) => left.name.localeCompare(right.name, "ko"));

  function patchRow(code: string, patch: Partial<HospitalDrugLabelRow>) {
    setWorkingRows((current) => current.map((row) => row.code === code ? { ...row, ...patch } : row));
  }

  async function saveRow(row: HospitalDrugLabelRow | undefined, setStatus: (value: string) => void) {
    if (!row) return;
    setStatus("저장 중...");
    try {
      setStatus(await onSave(row));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "약품 마스터를 저장하지 못했습니다.");
    }
  }

  async function registerNew(
    fields: NewDrugFields,
    setFields: (value: NewDrugFields) => void,
    setCode: (value: string) => void,
    setStatus: (value: string) => void,
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
    setFields(EMPTY_NEW_DRUG);
    await saveRow(next, setStatus);
  }

  function renderSearchResults(matches: HospitalDrugLabelRow[], selectedCode: string, setCode: (code: string) => void) {
    return <div className="pharmacy-master-search-results">
      {isLoading && <span className="empty">약품 데이터를 불러오는 중입니다.</span>}
      {!isLoading && matches.length === 0 && <span className="empty">검색된 약품이 없습니다.</span>}
      {matches.map((row) => <button type="button" key={row.code} className={row.code === selectedCode ? "active" : ""} onClick={() => setCode(row.code)}>
        <strong>{row.name}</strong><small>{row.koreanName || "-"} · {row.code}</small>
      </button>)}
    </div>;
  }

  function renderNewRegistration(
    title: string,
    fields: NewDrugFields,
    setFields: (value: NewDrugFields) => void,
    onRegister: () => void,
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
        <button type="button" className="secondary-button" onClick={onRegister}>신규 등록 후 선택</button>
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
      {renderNewRegistration("신규 약품 등록", newShared, setNewShared, () => void registerNew(newShared, setNewShared, setSharedCode, setSharedStatus))}
      {sharedRow && <div className="pharmacy-master-editor">
        <div className="pharmacy-master-selected"><strong>{sharedRow.name}</strong><small>{sharedRow.code} · {sharedRow.koreanName || "-"}</small></div>
        <div className="pharmacy-master-check-grid">
          {SHARED_FLAGS.map((flag) => <label key={flag.key} className={sharedRow[flag.key] ? "checked" : ""}>
            <input type="checkbox" checked={Boolean(sharedRow[flag.key])} onChange={() => patchRow(sharedRow.code, { [flag.key]: !sharedRow[flag.key] })}/><span>{flag.label}</span>
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
      {renderSearchResults(labelMatches, labelRow?.code ?? "", setLabelCode)}
      {renderNewRegistration("신규 약품 등록", newLabel, setNewLabel, () => void registerNew(newLabel, setNewLabel, setLabelCode, setLabelStatus))}
      {labelRow && <div className="pharmacy-master-editor">
        <div className="pharmacy-master-selected"><strong>{labelRow.name}</strong><small>{labelRow.code} · {labelRow.koreanName || "-"}</small></div>
        <div className="pharmacy-master-selects">
          <label>대분류<select value={routeForType(labelRow.drugType)} onChange={(event) => {
            const route = event.target.value as keyof typeof ROUTE_GROUPS;
            patchRow(labelRow.code, { drugType: ROUTE_GROUPS[route][0] });
          }}>{Object.keys(ROUTE_GROUPS).map((route) => <option key={route}>{route}</option>)}</select></label>
          <label>세부 유형<select value={subtypeForType(labelRow.drugType)} onChange={(event) => patchRow(labelRow.code, { drugType: event.target.value })}>
            {ROUTE_GROUPS[routeForType(labelRow.drugType)].map((type) => <option key={type}>{type}</option>)}
          </select></label>
        </div>
        {["원병", "PTP"].includes(subtypeForType(labelRow.drugType)) && <>
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
        <button type="button" className="print-button pharmacy-master-save" onClick={() => void saveRow(labelRow, setLabelStatus)}>약제팀 라벨에 저장</button>
        {labelStatus && <p className="pharmacy-master-status">{labelStatus}</p>}
      </div>}
    </article>

    <article className="pharmacy-master-column pharmacy-master-lists">
      <header><p>실시간 대상 목록</p><h2>{selectedList.label} 약품</h2><span>왼쪽 분류를 바꾸면 이 목록에 즉시 반영됩니다.</span></header>
      <div className="pharmacy-master-list-tabs">
        {MASTER_LISTS.map((item) => {
          const count = workingRows.filter((row) => row.inHospital && masterListMatches(row, item.key)).length;
          return <button type="button" key={item.key} className={listKey === item.key ? "active" : ""} onClick={() => setListKey(item.key)}>{item.label}<b>{count}</b></button>;
        })}
      </div>
      <div className="pharmacy-master-live-list">
        {listRows.length === 0 && <span className="empty">해당 분류의 약품이 없습니다.</span>}
        {listRows.map((row) => <button type="button" key={row.code} onClick={() => { setSharedCode(row.code); setSharedQuery(row.code); }}>
          <strong>{row.name}</strong><small>{row.koreanName || "-"} · {row.code}</small>
        </button>)}
      </div>
    </article>
  </section>;
}
