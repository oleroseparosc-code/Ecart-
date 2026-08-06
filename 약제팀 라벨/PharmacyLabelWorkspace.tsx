import { ChevronDown, FileDown, Printer, Save, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { fluidLabelTone, formatFluidLabelName } from "../src/appLogic";
import { PharmacyDrugMaster } from "./PharmacyDrugMaster";
import {
  getHospitalDrugControlledCategory,
  matchesHospitalDrugLabel,
  stripHospitalDrugControlledPrefix,
  type HospitalDrugLabelRow,
} from "./hospitalDrugLabels";
import {
  A3_PAPER, A4_PAPER, CABINET_CATEGORIES, DRUG_CATEGORIES, WARNING_OPTIONS,
  groupPharmacyLabelsForPaper, resolvePharmacyLabelDraft, rowMatchesCategory, sizesForCategory,
  extractHex, formatPharmacyExpiry,
  splitDoseText, splitNutritionDoseParts, splitNutritionDoseText, splitStyledPharmacyTitle,
  type PharmacyLabelCategory, type PharmacyLabelDraft, type PharmacyLabelFamily, type PharmacySavedLabel,
  type PharmacyHighCostRoute,
} from "./pharmacyLabelStudio";

type Props = {
  rows: HospitalDrugLabelRow[];
  savedLabels: PharmacySavedLabel[];
  isLoading: boolean;
  onBack: () => void;
  onSaveLabel: (draft: PharmacyLabelDraft) => Promise<string>;
  onPrint: (labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") => void;
  onHospitalDrugWorkbookUpload: (file: File) => Promise<string>;
  onSaveMaster: (row: HospitalDrugLabelRow) => Promise<string>;
  standalone?: boolean;
};

function isLabelMarked(value?: string) {
  return value?.trim().toUpperCase() === "Y";
}

export function PharmacyLabelWorkspace({ rows, savedLabels, isLoading, onBack, onSaveLabel, onPrint, onHospitalDrugWorkbookUpload, onSaveMaster, standalone = false }: Props) {
  const [family, setFamily] = useState<PharmacyLabelFamily>("drug");
  const [activeTab, setActiveTab] = useState<PharmacyLabelFamily | "master">("drug");
  const [category, setCategory] = useState<PharmacyLabelCategory>("원병");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [activeCode, setActiveCode] = useState("");
  const [paper, setPaper] = useState<"A4" | "A3">("A4");
  const [draft, setDraft] = useState<PharmacyLabelDraft>();
  const [uploadStatus, setUploadStatus] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [editMode, setEditMode] = useState<"edit" | "new">("edit");
  const [highCostRoute, setHighCostRoute] = useState<PharmacyHighCostRoute>("주사");
  const [accessoryFilter, setAccessoryFilter] = useState<"" | "측면라벨" | "유색 측면라벨" | "병뚜껑" | "유색 병뚜껑">("");
  const [doseUnitFilter, setDoseUnitFilter] = useState<"" | "1T" | "0.5T" | "0.25T">("");
  const [titleSelection, setTitleSelection] = useState({ start: 0, end: 0 });
  const [selectedTitleFontSize, setSelectedTitleFontSize] = useState(30);
  const [selectedTitleColor, setSelectedTitleColor] = useState("#111827");
  const titleEditorRef = useRef<HTMLTextAreaElement>(null);

  const baseCategoryRows = useMemo(
    () => rows.filter((row) => rowMatchesCategory(row, category, highCostRoute, family) && matchesHospitalDrugLabel(row, query)),
    [category, family, highCostRoute, query, rows],
  );
  const categoryRows = useMemo(() => baseCategoryRows.filter((row) => {
    const matchesDoseUnit = doseUnitFilter === "1T"
      ? Boolean(row.labelDose1T ?? isLabelMarked(row.sideLabel1T))
      : doseUnitFilter === "0.5T"
        ? Boolean(row.labelDoseHalfT ?? isLabelMarked(row.sideLabelHalfT))
        : doseUnitFilter === "0.25T"
          ? Boolean(row.labelDoseQuarterT ?? isLabelMarked(row.sideLabelQuarterT))
          : true;
    if (!matchesDoseUnit) return false;
    if (accessoryFilter === "측면라벨") return category === "입원산제" ? Boolean(row.inpatientPowderPtp) : Boolean(row.sideLabel || [row.sideLabel1T, row.sideLabelHalfT, row.sideLabelQuarterT].some(isLabelMarked));
    if (accessoryFilter === "유색 측면라벨") return isLabelMarked(row.coloredSideLabel);
    if (accessoryFilter === "병뚜껑") return Boolean(row.regularCapLabel || isLabelMarked(row.capLabel));
    if (accessoryFilter === "유색 병뚜껑") return Boolean(row.coloredCapLabel || (isLabelMarked(row.capLabel) && extractHex(row.capBackground)));
    return true;
  }), [accessoryFilter, baseCategoryRows, category, doseUnitFilter]);
  const activeRow = categoryRows.find((row) => row.code === activeCode) ?? categoryRows[0];
  useEffect(() => {
    if (!activeRow) { setDraft(undefined); return; }
    setActiveCode(activeRow.code);
    const next = resolvePharmacyLabelDraft(activeRow, savedLabels, category, family);
    if (accessoryFilter === "병뚜껑" || accessoryFilter === "유색 병뚜껑") {
      next.accessory = accessoryFilter;
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "10x27") ?? next.size;
      next.backgroundColor = accessoryFilter === "유색 병뚜껑" ? extractHex(activeRow.capBackground) || "#ffffff" : "#ffffff";
    } else if (accessoryFilter === "유색 측면라벨") {
      next.accessory = "유색 측면라벨";
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? next.size;
      next.backgroundColor = extractHex(activeRow.coloredSideBackground) || "#ffffff";
    } else if (accessoryFilter === "측면라벨") {
      next.accessory = "측면라벨";
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? next.size;
    }
    if (doseUnitFilter) next.doseUnit = doseUnitFilter;
    setDraft((current) => {
      if (!current || current.id !== next.id || current.code !== next.code) return next;
      const preserveAccessory = !accessoryFilter || current.accessory === next.accessory;
      const mergedStyle = { ...next.style, ...current.style };
      return {
        ...next,
        size: preserveAccessory ? current.size : next.size,
        accessory: preserveAccessory ? current.accessory : next.accessory,
        style: mergedStyle,
      };
    });
  }, [accessoryFilter, activeRow?.code, category, doseUnitFilter, family, savedLabels]);

  const selectedDrafts = useMemo(
    () => categoryRows.filter((row) => selectedCodes.includes(row.code)).map((row) => {
      if (draft?.code === row.code) return draft;
      const next = resolvePharmacyLabelDraft(row, savedLabels, category, family);
      if (!draft) return next;
      next.size = draft.size;
      next.accessory = draft.accessory;
      next.doseUnit = draft.doseUnit;
      next.style = { ...next.style, ...draft.style };
      const workbookBorderColor = extractHex(row.borderColor);
      if (row.border || workbookBorderColor || category === "고가약") {
        next.style.outerBorderPx = 5;
        next.style.outerBorderColor = workbookBorderColor || next.style.outerBorderColor;
      }
      if (draft.accessory === "유색 측면라벨") {
        next.backgroundColor = extractHex(row.coloredSideBackground) || draft.backgroundColor;
      } else if (accessoryFilter === "유색 병뚜껑") {
        next.backgroundColor = extractHex(row.capBackground) || draft.backgroundColor;
      }
      return next;
    }),
    [accessoryFilter, categoryRows, selectedCodes, draft, savedLabels, category, family],
  );
  const pages = groupPharmacyLabelsForPaper(selectedDrafts, paper === "A4" ? A4_PAPER : A3_PAPER);
  const allSelected = categoryRows.length > 0 && categoryRows.every((row) => selectedCodes.includes(row.code));
  const categoryGroups = family === "drug" ? DRUG_CATEGORIES : CABINET_CATEGORIES;
  const isCapLabel = draft?.accessory === "병뚜껑" || draft?.accessory === "유색 병뚜껑";
  const isColoredSideLabel = draft?.accessory === "유색 측면라벨";
  const isSideLabel = draft?.accessory === "측면라벨" || isColoredSideLabel;
  const isExternalShelfLabel = ["외용제", "외용점안제", "팩제", "시럽"].includes(category) && draft?.size.presetKey === "13.5x105";
  const sizeOptions = family === "cabinet" && draft
    ? [draft.size]
    : sizesForCategory(category, activeRow).filter((size) =>
        !["원병", "입원산제"].includes(category) ? true : isCapLabel ? ["10x27", "15x30"].includes(size.presetKey) : !["10x27", "15x30"].includes(size.presetKey),
      );
  const hasDoseHighlight = draft?.warnings.some((warning) => warning === "용량주의" || warning === "용량확인") ?? false;
  const hasCautionWarning = draft?.warnings.some((warning) =>
    ["용량주의", "용량확인", "유사발음", "유사모양", "이름주의", "고위험의약품"].includes(warning)
      || warning.includes("반드시 희석 후 사용"),
  ) ?? false;
  const hasFrozenWarning = draft?.warnings.includes("냉동") ?? false;
  const hasColdWarning = (draft?.warnings.includes("냉장") ?? false) || hasFrozenWarning;
  const coldWarningText = hasFrozenWarning ? "냉동" : "냉장";
  const hasLightWarning = draft?.warnings.includes("차광") ?? false;
  const cautionWarnings = draft?.warnings.filter((warning) => !["냉장", "냉동", "차광"].includes(warning)) ?? [];
  const sideCautionWarnings = draft?.warnings.filter((warning) => ["용량주의", "유사발음", "유사모양", "이름주의", "용량확인"].includes(warning)) ?? [];
  const externalCautionWarnings = draft?.warnings.filter((warning) => ["용량주의", "용량확인", "유사발음", "유사모양", "이름주의"].includes(warning)) ?? [];
  const hasNameConfusion = draft?.warnings.some((warning) => ["유사발음", "이름주의"].includes(warning)) ?? false;
  const externalStorageText = hasLightWarning ? "차광" : hasColdWarning ? coldWarningText : "";
  const externalHasFlags = externalCautionWarnings.length > 0 || Boolean(externalStorageText);
  const isInjectionLabel = ["앰플", "바이알", "냉장주사"].includes(category);
  const isAmpouleVial = ["앰플", "바이알"].includes(category);
  const showStorageBanner = isInjectionLabel && (hasLightWarning || hasColdWarning);
  const showTopBanner = Boolean(draft?.printable.topBanner) || hasCautionWarning || showStorageBanner;
  const storageOnlyClass = !hasCautionWarning && hasColdWarning && hasLightWarning
    ? "storage-light-cold"
    : !hasCautionWarning && hasColdWarning
      ? "storage-cold"
      : !hasCautionWarning && hasLightWarning
        ? "storage-light"
        : "";
  const externalTone = hasCautionWarning ? "#d92d20" : hasColdWarning ? "#155eef" : hasLightWarning ? "#16803c" : draft?.style.outerBorderColor ?? "#111827";
  const storageToneClass = hasLightWarning ? "storage-tone-light" : hasColdWarning ? "storage-tone-cold" : "";
  const isCompactSyrupLabel = category === "시럽" && draft?.size.presetKey === "15x90";
  const isGeneralFluidLabel = category === "일반수액";

  function patch(patchValue: Partial<PharmacyLabelDraft>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }
  function setCategoryAndReset(next: PharmacyLabelCategory) {
    setCategory(next); setSelectedCodes([]); setActiveCode(""); setAccessoryFilter(""); setDoseUnitFilter("");
  }
  function toggleWarning(value: string) {
    if (!draft) return;
    const warnings = draft.warnings.includes(value) ? draft.warnings.filter((item) => item !== value) : [...draft.warnings, value];
    patch({ warnings, printable: { ...draft.printable, warning: warnings.join(" · ") } });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
    if (!file) return;
    try { setUploadStatus(await onHospitalDrugWorkbookUpload(file)); } catch (error) { setUploadStatus(error instanceof Error ? error.message : "파일을 불러오지 못했습니다."); }
  }

  const labelStyle = draft ? ({
    "--pharmacy-label-width-mm": draft.size.widthMm,
    "--pharmacy-label-height-mm": draft.size.heightMm,
    "--pharmacy-label-border": `${draft.accessory === "측면라벨" || draft.accessory === "유색 측면라벨" ? "1px solid #111827" : draft.style.outerBorderPx <= 0 ? "none" : `${draft.style.outerBorderPx}mm solid ${draft.style.outerBorderColor}`}`,
    "--pharmacy-label-border-width": draft.style.outerBorderPx <= 0 ? "0mm" : `${draft.style.outerBorderPx}mm`,
    "--pharmacy-label-font-size": `${draft.style.fontSizePt}pt`,
    "--pharmacy-label-color": draft.style.fontColor,
    "--pharmacy-label-warning": draft.style.warningColor,
    "--pharmacy-label-background": isColoredSideLabel || isCapLabel ? draft.backgroundColor : "#ffffff",
    "--pharmacy-external-tone": externalTone,
  } as CSSProperties) : undefined;
  const displayTitle = isCapLabel ? draft?.printable.title.replace(/\btab(?:let)?\b/gi, "").replace(/\s{2,}/g, " ").trim() ?? "" : draft?.printable.title ?? "";
  const renderedDisplayTitle = isGeneralFluidLabel ? formatFluidLabelName(displayTitle) : displayTitle;
  const generalFluidTone = isGeneralFluidLabel && activeRow
    ? activeRow.fluidColor || fluidLabelTone({ code: activeRow.code, genericName: activeRow.koreanName, productName: activeRow.name, spec: activeRow.strength })
    : undefined;
  const titleSizeClass = displayTitle.length > 34 ? "very-long-name" : displayTitle.length > 25 ? "long-name" : displayTitle.length > 16 ? "medium-name" : "";
  const titleParts = category === "영양수액" ? splitNutritionDoseText(displayTitle) : splitDoseText(displayTitle);
  const nutritionDoseParts = splitNutritionDoseParts(displayTitle);
  const koreanTitleParts = splitDoseText(draft?.printable.koreanName ?? "");
  const controlledCategory = activeRow ? getHospitalDrugControlledCategory(activeRow) : undefined;
  const controlledTitle = stripHospitalDrugControlledPrefix(displayTitle);
  const controlledTitleParts = splitDoseText(controlledTitle);
  const currentImagePath = activeRow?.imagePath || draft?.imagePath || "";
  const imageUrl = currentImagePath
    ? `${import.meta.env.BASE_URL}${currentImagePath.replace(/^\.?\//, "")}`
    : "";
  const nutritionHasFlags = hasCautionWarning || hasLightWarning;
  const isHeparinLabel = draft?.printable.footer.text.trim() === "헤파린";

  function renderEditableTitle(title: string) {
    if (!draft?.titleStyles?.length) return title;
    return splitStyledPharmacyTitle(title, draft.titleStyles).map((part, index) => <span key={`${index}-${part.text}`} style={{
      color: part.style?.color,
      fontSize: part.style?.fontSizePt ? `${part.style.fontSizePt}pt` : undefined,
      fontWeight: part.style?.fontWeight,
    }}>{part.text}</span>);
  }

  function applyTitleStyle(style: { fontSizePt?: number; color?: string; fontWeight?: number; textTransform?: "uppercase" | "lowercase" }) {
    if (!draft || titleSelection.end <= titleSelection.start) return;
    patch({ titleStyles: [...(draft.titleStyles ?? []), { ...titleSelection, ...style }] });
  }

  function chooseAccessory(value: PharmacyLabelDraft["accessory"]) {
    if (!draft || !value) return;
    const next: Partial<PharmacyLabelDraft> = { accessory: value };
    if (value === "병뚜껑" || value === "유색 병뚜껑") {
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "10x27") ?? draft.size;
      next.backgroundColor = value === "유색 병뚜껑"
        ? extractHex(activeRow?.capBackground) || "#ffffff"
        : "#ffffff";
    } else if (value === "유색 측면라벨") {
      setAccessoryFilter("유색 측면라벨");
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? draft.size;
      next.backgroundColor = extractHex(activeRow?.coloredSideBackground) || "#ffffff";
    } else if (value === "측면라벨") {
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? draft.size;
      next.backgroundColor = "#ffffff";
    } else {
      next.backgroundColor = "#ffffff";
    }
    patch(next);
  }

  function startNewLabel() {
    const seedRow = activeRow ?? categoryRows[0];
    if (!seedRow) {
      setSaveStatus("새 라벨의 기본 서식으로 사용할 약품이 없습니다. 먼저 약품 목록을 불러와 주세요.");
      return;
    }
    const seed = resolvePharmacyLabelDraft(seedRow, savedLabels, category, family);
    setDraft({
      ...seed,
      id: `pharmacy-label-new-${Date.now()}`,
      code: "",
      itemCode: "",
      location: "",
      atc: "",
      expiry: "",
      printable: {
        ...seed.printable,
        title: "",
        koreanName: "",
        strength: "",
        warning: "",
        topBanner: "",
        footer: { enabled: false, text: "" },
        reconstitution: "",
      },
      sourceType: "new",
      savedAt: undefined,
    });
    setEditMode("new");
    setSaveStatus("");
  }

  async function confirmAndSave() {
    if (!draft || !activeRow) return;
    const previousWarnings = new Set([
      activeRow.doseCaution ? "용량주의" : "",
      activeRow.doseCheck ? "용량확인" : "",
      activeRow.similarSound ? "유사발음" : "",
      activeRow.similarLook ? "유사모양" : "",
      activeRow.nameCaution ? "이름주의" : "",
      activeRow.highRisk ? "고위험의약품" : "",
      activeRow.lightProtected ? "차광" : "",
      activeRow.storage.includes("냉동") ? "냉동" : "",
      activeRow.storage.includes("냉장") ? "냉장" : "",
    ].filter(Boolean));
    const addedWarnings = draft.warnings.filter((warning) => !previousWarnings.has(warning));
    const removedWarnings = [...previousWarnings].filter((warning) => !draft.warnings.includes(warning));
    const changes = [
      activeRow.name !== draft.printable.title ? `상용약품명: ${activeRow.name} → ${draft.printable.title}` : "",
      activeRow.koreanName !== draft.printable.koreanName ? `한글약품명: ${activeRow.koreanName} → ${draft.printable.koreanName}` : "",
      activeRow.location !== draft.location ? `위치: ${activeRow.location || "-"} → ${draft.location || "-"}` : "",
      activeRow.atc !== draft.atc ? `ATC: ${activeRow.atc || "-"} → ${draft.atc || "-"}` : "",
      addedWarnings.length ? `주의 조건 추가: ${addedWarnings.join(", ")}` : "",
      removedWarnings.length ? `주의 조건 해제: ${removedWarnings.join(", ")}` : "",
      `테두리: ${draft.style.outerBorderPx}mm / ${draft.style.outerBorderColor}`,
    ].filter(Boolean);
    if (!window.confirm(`${draft.printable.title} 수정 내용을 저장하시겠습니까?\n\n${changes.join("\n")}\n\n확인을 누르면 최종 라벨을 저장하고 원내보유의약품리스트.xlsx 저장 위치를 확인합니다.`)) return;
    try {
      setSaveStatus("저장 중...");
      const message = await onSaveLabel(draft);
      setDraft({ ...draft, sourceType: "manual", savedAt: new Date().toISOString() });
      setSaveStatus(message);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "수정 라벨을 저장하지 못했습니다.");
    }
  }

  return <main className="pharmacy-label-studio">
    <header className="pharmacy-studio-topbar">
      <div><p>원내보유의약품리스트 기준</p><h1>약제팀 라벨 작업실</h1></div>
      <div className="pharmacy-studio-actions">
        <button
          type="button"
          className="print-button pharmacy-master-shortcut"
          aria-pressed={activeTab === "master"}
          onClick={() => setActiveTab("master")}
        >
          약품 마스터
        </button>
        <label className="print-button pharmacy-upload-button" title="동국대학교일산병원_매출_날짜 엑셀 파일"><Upload size={16}/>유효기간 파일 업데이트<input className="hidden-file-input" type="file" accept=".xlsx,.xls,.xlsm" onChange={upload}/></label>
        {uploadStatus && <span className="pharmacy-upload-status">{uploadStatus}</span>}
      </div>
    </header>

    <section className="pharmacy-category-panel">
      <div className="pharmacy-label-tabs">
        <button className={activeTab === "drug" ? "active" : ""} onClick={() => { setActiveTab("drug"); setFamily("drug"); }}>약품 라벨</button>
        {!standalone && <button className={activeTab === "cabinet" ? "active" : ""} onClick={() => { setActiveTab("cabinet"); setFamily("cabinet"); }}>약품장 라벨</button>}
        <button className={activeTab === "master" ? "active" : ""} onClick={() => setActiveTab("master")}>약품 마스터</button>
        {activeTab !== "master" && <button className="pharmacy-collapse-button" onClick={() => setDetailsOpen((value) => !value)}>상세 선택 <ChevronDown size={16}/></button>}
      </div>
      {activeTab !== "master" && detailsOpen && <div className="pharmacy-category-groups">{categoryGroups.map((group, index) =>
        <div className="pharmacy-category-block" key={index}>
          <div className="pharmacy-category-row">{group.map((item) =>
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategoryAndReset(item)}>{item}</button>)}
            {family === "cabinet" && index === 0 && ["원병", "PTP"].includes(category) && <button onClick={() => draft && patch({ accessory: "선반라벨" })}>선반라벨</button>}
          </div>
          {index === 0 && ["원병", "PTP", "입원산제"].includes(category) && <div className="pharmacy-filter-dashboard" aria-label="부착 라벨 표시 약품">
            <div className="pharmacy-filter-group">
              <strong>라벨 유형</strong>
              <div>{(["", "측면라벨", "유색 측면라벨", "병뚜껑", "유색 병뚜껑"] as const).map((value) => <button key={value || "전체"} className={accessoryFilter === value ? "active" : ""} onClick={() => { setAccessoryFilter(value); setSelectedCodes([]); setActiveCode(""); }}>{value || "전체"}</button>)}</div>
            </div>
            <div className="pharmacy-filter-group">
              <strong>정제 용량</strong>
              <div>{(["", "1T", "0.5T", "0.25T"] as const).map((value) => <button key={value || "정제전체"} className={doseUnitFilter === value ? "active" : ""} onClick={() => { setDoseUnitFilter(value); setSelectedCodes([]); setActiveCode(""); }}>{value || "전체"}</button>)}</div>
            </div>
          </div>}
        </div>)}
        {category === "고가약" && <div className="pharmacy-high-cost-routes" aria-label="고가약 투여 경로">
          <strong>고가약 구분</strong>
          {(["주사", "경구"] as const).map((route) => <button key={route} className={highCostRoute === route ? "active" : ""} onClick={() => { setHighCostRoute(route); setSelectedCodes([]); setActiveCode(""); }}>{route}</button>)}
        </div>}
      </div>}
    </section>

    {activeTab === "master"
      ? <PharmacyDrugMaster rows={rows} isLoading={isLoading} onSave={onSaveMaster}/>
      : <section className="pharmacy-studio-workspace">
      <aside className="pharmacy-drug-list">
        <div className="pharmacy-panel-head"><div><h2>{category} 약품 리스트</h2><p>{categoryRows.length.toLocaleString("ko-KR")}개</p></div><span className="badge gray">선택 {selectedCodes.length}</span></div>
        <label className="pharmacy-list-search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="현재 약품 리스트 검색"/></label>
        <div className="pharmacy-selection-actions"><label className="pharmacy-select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelectedCodes(allSelected ? [] : categoryRows.map((row) => row.code))}/>전체 선택</label><button type="button" onClick={() => setSelectedCodes([])}>선택 해제</button></div>
        <div className="pharmacy-drug-list-scroll">
          {isLoading && <span className="empty">약품 데이터를 불러오는 중입니다.</span>}
          {!isLoading && categoryRows.length === 0 && <span className="empty">해당 분류의 원내보유약품이 없습니다.</span>}
          {categoryRows.map((row) => <label key={row.code} className={`pharmacy-drug-row ${row.code === activeRow?.code ? "selected" : ""}`}>
            <input type="checkbox" checked={selectedCodes.includes(row.code)} onChange={() => setSelectedCodes((prev) => prev.includes(row.code) ? prev.filter((code) => code !== row.code) : [...prev, row.code])}/>
            <button type="button" onClick={() => { setActiveCode(row.code); setSelectedCodes((previous) => previous.includes(row.code) ? previous : [...previous, row.code]); }}><strong>{row.name}</strong><small>{row.koreanName} · {row.code} · {row.strength}</small>{category === "입원산제" && (row.doseCaution || row.doseCheck) && <em className="pharmacy-list-dose-warning">{[row.doseCaution ? "용량주의" : "", row.doseCheck ? "용량확인" : ""].filter(Boolean).join(" · ")}</em>}</button>
          </label>)}
        </div>
      </aside>

      <section className="pharmacy-label-canvas-panel">
        <div className="pharmacy-panel-head"><div><h2>라벨 편집 캔버스</h2><p>선택한 라벨을 편집한 뒤 최종본으로 저장합니다.</p></div></div>
        <div className="pharmacy-edit-modes"><button className={editMode === "edit" ? "active" : ""} onClick={() => setEditMode("edit")}>선택 라벨 수정</button><button className={editMode === "new" ? "active" : ""} onClick={startNewLabel}>새 라벨 만들기</button>{draft && <div className="pharmacy-inline-border-choice"><span>테두리</span><button className={draft.style.outerBorderPx > 0 ? "active" : ""} onClick={() => patch({ style: {...draft.style, outerBorderPx: category === "고가약" || activeRow?.border ? 5 : 0.5} })}>있음</button><button className={draft.style.outerBorderPx <= 0 ? "active" : ""} onClick={() => patch({ style: {...draft.style, outerBorderPx: 0} })}>없음</button></div>}</div>
        {editMode === "new" && draft && <div className="pharmacy-new-label-fields">
          <input placeholder="상용약품명" value={draft.printable.title} onChange={(e) => patch({ printable: {...draft.printable, title: e.target.value} })}/>
          <input placeholder="한글약품명" value={draft.printable.koreanName} onChange={(e) => patch({ printable: {...draft.printable, koreanName: e.target.value} })}/>
          <input placeholder="약품코드" value={draft.code} onChange={(e) => patch({ code: e.target.value })}/><input placeholder="물품코드" value={draft.itemCode} onChange={(e) => patch({ itemCode: e.target.value })}/>
          <input placeholder="약품 위치" value={draft.location} onChange={(e) => patch({ location: e.target.value })}/>
          <input placeholder="ATC 번호" value={draft.atc} onChange={(e) => patch({ atc: e.target.value })}/>
        </div>}
        <div className="pharmacy-label-canvas">{draft ? <article className={`pharmacy-print-label label-size-${draft.size.presetKey} ${category === "항암제" ? "anticancer" : ""} ${category === "마약/향정" ? "controlled-drug-label" : ""} ${category === "고가약" ? "high-cost" : ""} ${storageOnlyClass} ${storageToneClass} ${isCapLabel ? "cap-label" : ""} ${isSideLabel ? "side-label" : ""} ${isExternalShelfLabel ? "external-shelf-label" : ""} ${category === "시럽" ? "syrup-label" : ""} ${category === "영양수액" ? "nutrition-fluid-label" : ""} ${isGeneralFluidLabel ? `general-fluid-label fluid-tone-${generalFluidTone}` : ""} ${isInjectionLabel ? "injection-label" : ""} ${isHeparinLabel ? "heparin-label" : ""} ${!showTopBanner ? "no-top-banner no-warning" : ""}`} style={labelStyle}>
          {isSideLabel ? <div className="pharmacy-side-label-form">
            <div className="pharmacy-side-label-photo">{imageUrl
              ? <a href={draft.imageSourceUrl} target="_blank" rel="noreferrer" title="약학정보원 식별사진 검색"><img src={imageUrl} alt={`${draft.printable.koreanName} 식별사진`}/></a>
              : <a href={activeRow?.imageSourceUrl || draft.imageSourceUrl} target="_blank" rel="noreferrer">사진 미등록<br/>식별정보 확인</a>}</div>
            <div className="pharmacy-side-label-name">
              <div className="pharmacy-side-label-name-core"><strong>{hasDoseHighlight && koreanTitleParts.dose
                ? <>{koreanTitleParts.before}<mark className="dose-highlight">{koreanTitleParts.dose}</mark>{koreanTitleParts.after}</>
                : draft.printable.koreanName || draft.printable.title}</strong>
              <span>{hasDoseHighlight && titleParts.dose ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</> : draft.printable.title}</span>
              {draft.doseUnit && draft.doseUnit !== "1T" && <b>{draft.doseUnit}</b>}</div>
              {sideCautionWarnings.length > 0 && <small>{sideCautionWarnings.join(" · ")}</small>}
              {hasLightWarning && <small className="side-storage-light">차광</small>}
            </div>
            <div className="pharmacy-side-label-meta">
              <strong>{draft.atc ? `${draft.atc}번` : "-"}</strong>
              <span>유효기간</span>
              <b>{formatPharmacyExpiry(activeRow?.expiry || draft.expiry || draft.printable.footer.text) || "YYYY-MM-DD"}</b>
            </div>
          </div> : family === "cabinet" ? <div className={`pharmacy-cabinet-list-row ${draft.location ? "with-location-column" : ""}`}>
            <div><strong>{draft.printable.title}</strong>{draft.printable.koreanName && <span>{draft.printable.koreanName}</span>}</div>
            <b>{draft.warnings.filter((warning) => !["냉장", "냉동", "차광"].includes(warning)).join(" · ") || "-"}</b>
            {draft.location && <em>{draft.location}</em>}
          </div> : category === "마약/향정" ? <div className="pharmacy-controlled-label-form">
            <div className="pharmacy-controlled-label-top">고위험의약품{hasDoseHighlight ? " / 용량확인" : ""}</div>
            <strong className={titleSizeClass}>{hasDoseHighlight && controlledTitleParts.dose
              ? <>{controlledTitleParts.before}<mark className="dose-highlight">{controlledTitleParts.dose}</mark>{controlledTitleParts.after}</>
              : controlledTitle}</strong>
            <div className="pharmacy-controlled-label-footer">{controlledCategory ?? "마약/향정"}{hasColdWarning ? ` / ${coldWarningText}` : ""}</div>
          </div> : category === "영양수액" ? <div className={`pharmacy-nutrition-label ${nutritionHasFlags ? "with-flags" : "name-only"} ${hasLightWarning ? "with-light" : ""}`}>
            {nutritionHasFlags && <aside className={hasLightWarning ? "light-condition" : ""}>{hasLightWarning ? "차광" : cautionWarnings[0] ?? ""}</aside>}
            <strong className={titleSizeClass}>{hasDoseHighlight
              ? nutritionDoseParts.map((part, index) => part.highlighted ? <mark className="dose-highlight" key={index}>{part.text}</mark> : part.text)
              : draft.printable.title}</strong>
            {nutritionHasFlags && (hasLightWarning ? cautionWarnings.length > 0 : cautionWarnings.length > 1) && <aside>{(hasLightWarning ? cautionWarnings : cautionWarnings.slice(1)).join("\n")}</aside>}
          </div> : isExternalShelfLabel ? <div className={`pharmacy-external-strip ${externalHasFlags ? "" : "name-only"} ${externalCautionWarnings.length > 0 && externalStorageText ? "with-two-flags" : ""} ${hasLightWarning ? "light-storage" : hasColdWarning ? "cold-storage" : ""}`}>
            {externalHasFlags && <aside className={externalCautionWarnings.length > 0 ? "caution" : hasLightWarning ? "light" : hasColdWarning ? "cold" : ""}>{externalCautionWarnings.length > 0 ? externalCautionWarnings.join("\n") : externalStorageText}</aside>}
            <strong className={`${titleSizeClass} ${hasNameConfusion ? "confusion-name" : ""}`}>{hasDoseHighlight && titleParts.dose ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</> : displayTitle}</strong>
            {externalCautionWarnings.length > 0 && externalStorageText && <aside className={hasLightWarning ? "light" : "cold"}>{externalStorageText}</aside>}
          </div> : <>
          {!isCapLabel && !isExternalShelfLabel && showTopBanner && <div className={`pharmacy-label-top-banner ${!hasCautionWarning && hasLightWarning ? `light-only ${isAmpouleVial ? "ampoule-vial-light-only" : ""}` : !hasCautionWarning && hasColdWarning ? "cold-only" : ""}`}>
            <span>{[draft.printable.topBanner, category !== "항암제" ? cautionWarnings.join(" · ") : "", !hasCautionWarning && hasLightWarning ? (isAmpouleVial ? "차광보관" : "차광") : "", !hasCautionWarning && !hasLightWarning && hasColdWarning ? `${coldWarningText}보관` : ""].filter(Boolean).join(" · ")}</span>
            {hasCautionWarning && hasLightWarning && <b className="pharmacy-storage-badge light">차광</b>}
            {hasCautionWarning && hasColdWarning && <b className="pharmacy-storage-badge cold">{coldWarningText}</b>}
          </div>}
          {!hasCautionWarning && hasColdWarning && hasLightWarning && <b className="pharmacy-storage-circle cold">{coldWarningText}</b>}
          <div className="pharmacy-label-main"><strong className={`${titleSizeClass} ${hasNameConfusion && ["외용제", "외용점안제", "팩제"].includes(category) ? "confusion-name" : ""}`}>
            {draft.titleStyles?.length ? renderEditableTitle(renderedDisplayTitle) : hasDoseHighlight && titleParts.dose ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</> : renderedDisplayTitle}
          </strong>
            {!isCapLabel && !isExternalShelfLabel && !isCompactSyrupLabel && !isGeneralFluidLabel && <span>{draft.printable.koreanName}</span>}
            {isCapLabel && draft.doseUnit && draft.doseUnit !== "1T" && <b>{draft.doseUnit}</b>}
            {!isCapLabel && !isExternalShelfLabel && draft.atc && <small className="pharmacy-label-atc">ATC {draft.atc}</small>}
            {!isCapLabel && !isExternalShelfLabel && draft.location && <small className="pharmacy-label-location">{draft.location}</small>}
            {!isExternalShelfLabel && draft.printable.reconstitution && <em>{draft.printable.reconstitution}</em>}</div>
          {!isExternalShelfLabel && draft.printable.footer.enabled && <footer className={category === "항암제" ? "anticancer-footer" : isHeparinLabel ? "heparin-footer" : ""}>{category === "항암제" ? "항암제" : draft.printable.footer.text}</footer>}
          </>}
        </article> : <span className="empty">표시할 라벨이 없습니다.</span>}</div>
        <section className="pharmacy-condition-dashboard">
          <div><h3>주의·보관 조건</h3><div className="pharmacy-warning-editor">{WARNING_OPTIONS.map((warning) => <label className={draft?.warnings.includes(warning) ? "checked" : ""} key={warning}><input type="checkbox" checked={draft?.warnings.includes(warning) ?? false} onChange={() => toggleWarning(warning)}/><span>{warning}</span></label>)}</div></div>
          {draft && <div><h3>약품유형</h3><div className="pharmacy-type-editor">{[...new Set(rows.map((row) => row.drugType).filter((type) => type && !["36", "99", "종료예정"].includes(type.trim())))].map((type) => <label className={draft.drugTypes.includes(type) ? "checked" : ""} key={type}><input type="checkbox" checked={draft.drugTypes.includes(type)} onChange={() => patch({ drugTypes: draft.drugTypes.includes(type) ? draft.drugTypes.filter((v) => v !== type) : [...draft.drugTypes, type] })}/><span>{type}</span></label>)}</div></div>}
        </section>
        {saveStatus && <div className="pharmacy-canvas-status">{saveStatus}</div>}
        <div className="pharmacy-save-row"><span>{selectedDrafts.length ? `${pages.length}페이지 미리보기` : "출력할 약품을 선택하십시오."}</span><div className="pharmacy-paper-mini"><button type="button" className={paper === "A4" ? "active" : ""} onClick={() => setPaper("A4")}>A4</button><button type="button" className={paper === "A3" ? "active" : ""} onClick={() => setPaper("A3")}>A3</button></div><button type="button" className="secondary-button" disabled={!selectedDrafts.length} onClick={() => onPrint(selectedDrafts, paper)}><FileDown size={16}/>PDF 미리보기</button><button type="button" className="secondary-button" disabled={!selectedDrafts.length} onClick={() => onPrint(selectedDrafts, paper)}><Printer size={16}/>전체 출력</button><button type="button" className="print-button" disabled={!draft} onClick={() => void confirmAndSave()}><Save size={16}/>수정라벨 저장</button></div>
      </section>

      <aside className="pharmacy-tool-panel">
        <details open><summary>크기 설정</summary><div className="pharmacy-tool-body pharmacy-size-grid">{sizeOptions.map((size) => <button key={size.presetKey} className={`pharmacy-size-preset ${draft?.size.presetKey === size.presetKey ? "active" : ""}`} onClick={() => patch({ size })}>{size.heightMm} × {size.widthMm} mm</button>)}</div></details>
        {["원병", "PTP", "입원산제"].includes(category) && <details open><summary>정제·부착 위치</summary><div className="pharmacy-tool-body pharmacy-choice-grid">{["0.25T", "0.5T", "1T"].map((value) => <button key={value} className={draft?.doseUnit === value ? "active" : ""} onClick={() => patch({ doseUnit: value as PharmacyLabelDraft["doseUnit"] })}>{value}</button>)}{["측면라벨", ...(isLabelMarked(activeRow?.coloredSideLabel) ? ["유색 측면라벨"] : []), "병뚜껑", ...(activeRow?.coloredCapLabel || (isLabelMarked(activeRow?.capLabel) && extractHex(activeRow?.capBackground)) ? ["유색 병뚜껑"] : []), ...(family === "cabinet" ? ["선반라벨"] : [])].map((value) => <button key={value} className={draft?.accessory === value ? "active" : ""} onClick={() => chooseAccessory(value as PharmacyLabelDraft["accessory"])}>{value}</button>)}</div></details>}
        <details open><summary>테두리 설정</summary><div className="pharmacy-tool-body"><label><input type="checkbox" checked={(draft?.style.outerBorderPx ?? 0) > 0} onChange={(e) => draft && patch({ style: {...draft.style, outerBorderPx: e.target.checked ? category === "고가약" || activeRow?.border ? 5 : 0.5 : 0} })}/>테두리 있음</label><label>테두리 두께<input type="range" min="0.5" max="5" step="0.5" value={Math.max(0.5, draft?.style.outerBorderPx ?? 0.5)} disabled={(draft?.style.outerBorderPx ?? 0) <= 0} onChange={(e) => draft && patch({style:{...draft.style,outerBorderPx:Number(e.target.value)}})}/><b>{draft?.style.outerBorderPx ?? 0}mm</b></label><input type="color" value={draft?.style.outerBorderColor ?? "#111827"} onChange={(e) => draft && patch({style: {...draft.style, outerBorderColor: e.target.value}})}/></div></details>
        <details open><summary>표시 내용</summary><div className="pharmacy-tool-body"><label>상용약품명<textarea ref={titleEditorRef} value={draft?.printable.title ?? ""} onSelect={(e) => { const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; if (end > start) setTitleSelection({ start, end }); }} onChange={(e) => draft && patch({printable:{...draft.printable,title:e.target.value}, titleStyles: []})}/></label><div className="pharmacy-title-style-dashboard"><strong>약품명 부분 편집</strong><small>{titleSelection.end > titleSelection.start ? `"${draft?.printable.title.slice(titleSelection.start, titleSelection.end)}" 선택됨` : "위 약품명에서 편집할 부분을 드래그하여 선택하십시오."}</small><div className="pharmacy-title-style-control"><label>글자 크기<input type="number" min="6" max="48" value={selectedTitleFontSize} onChange={(e) => setSelectedTitleFontSize(Number(e.target.value))}/></label><button type="button" onClick={() => applyTitleStyle({ fontSizePt: selectedTitleFontSize })}>크기 적용</button></div><div className="pharmacy-title-style-control"><label>글자 색상<input type="color" value={selectedTitleColor} onChange={(e) => setSelectedTitleColor(e.target.value)}/></label><button type="button" onClick={() => applyTitleStyle({ color: selectedTitleColor })}>색상 적용</button></div><div><button type="button" onClick={() => applyTitleStyle({ fontWeight: 1000 })}>굵게</button><button type="button" onClick={() => applyTitleStyle({ textTransform: "uppercase" })}>대문자</button><button type="button" onClick={() => applyTitleStyle({ textTransform: "lowercase" })}>소문자</button><button type="button" onClick={() => draft && patch({ titleStyles: [] })}>부분 서식 초기화</button></div></div><label>한글약품명<input value={draft?.printable.koreanName ?? ""} onChange={(e) => draft && patch({printable:{...draft.printable,koreanName:e.target.value}})}/></label><label>용량<input value={draft?.printable.strength ?? ""} onChange={(e) => draft && patch({printable:{...draft.printable,strength:e.target.value}})}/></label><label>약품 위치<input value={draft?.location ?? ""} onChange={(e) => patch({location:e.target.value})}/></label><label>ATC 번호<input value={draft?.atc ?? ""} onChange={(e) => patch({atc:e.target.value})}/></label>{category === "항암제" && <label>재구성·용해액(WI/NS)<input value={draft?.printable.reconstitution ?? ""} onChange={(e) => draft && patch({printable:{...draft.printable,reconstitution:e.target.value}})}/></label>}</div></details>
      </aside>
    </section>}
  </main>;
}
