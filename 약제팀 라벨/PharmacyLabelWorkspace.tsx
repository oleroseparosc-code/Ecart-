import { ChevronDown, FileDown, Printer, Save, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { fluidLabelTone, formatFluidLabelName } from "../src/appLogic";
import { PharmacyDrugMaster } from "./PharmacyDrugMaster";
import { PharmacyCabinetLabelCanvas } from "./PharmacyCabinetLabelCanvas";
import { PharmacyAutoFitLabelContent } from "./PharmacyAutoFitLabelContent";
import {
  getHospitalDrugControlledCategory,
  matchesHospitalDrugLabel,
  stripHospitalDrugControlledPrefix,
  type HospitalDrugLabelRow,
} from "./hospitalDrugLabels";
import {
  A3_PAPER, A4_PAPER, CABINET_CATEGORIES, DRUG_CATEGORIES, WARNING_OPTIONS,
  PHARMACY_CATEGORY_GROUP_NAMES, categoryForGroupedRow, groupPharmacyLabelsForPaper,
  resolvePharmacyLabelDraft, rowMatchesCategory, rowMatchesCategoryGroup, sizesForCategory,
  extractHex, formatPharmacyExpiry,
  mergeDoseHighlightStyles, splitDoseText, splitNutritionDoseParts, splitNutritionDoseText, splitStyledPharmacyTitle,
  type PharmacyLabelCategory, type PharmacyLabelDraft, type PharmacyLabelFamily, type PharmacySavedLabel,
  type PharmacyTitleStyle,
  type PharmacyHighCostRoute,
  type PharmacyCategoryGroupName,
} from "./pharmacyLabelStudio";

type Props = {
  rows: HospitalDrugLabelRow[];
  savedLabels: PharmacySavedLabel[];
  isLoading: boolean;
  onBack: () => void;
  onSaveLabel: (draft: PharmacyLabelDraft) => Promise<string>;
  onSaveLabels: (drafts: PharmacyLabelDraft[]) => Promise<string>;
  onPrint: (labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") => void;
  onHospitalDrugWorkbookUpload: (file: File) => Promise<string>;
  onSaveMaster: (row: HospitalDrugLabelRow) => Promise<string>;
  onSaveManyMaster: (rows: HospitalDrugLabelRow[]) => Promise<string>;
  onDeleteMaster: (row: HospitalDrugLabelRow) => Promise<string>;
  onBulkSaveMaster: (rows: HospitalDrugLabelRow[]) => Promise<string>;
  onBulkDeleteMaster: (codes: string[]) => Promise<string>;
  standalone?: boolean;
};

function isLabelMarked(value?: string) {
  return value?.trim().toUpperCase() === "Y";
}

type PharmacyDisplayItem = { key: string; row: HospitalDrugLabelRow; displayName: string };

export function PharmacyLabelWorkspace({ rows, savedLabels, isLoading, onBack, onSaveLabel, onSaveLabels, onPrint, onHospitalDrugWorkbookUpload, onSaveMaster, onSaveManyMaster, onDeleteMaster, onBulkSaveMaster, onBulkDeleteMaster, standalone = false }: Props) {
  const [family, setFamily] = useState<PharmacyLabelFamily>("drug");
  const [activeTab, setActiveTab] = useState<PharmacyLabelFamily | "master">("drug");
  const [category, setCategory] = useState<PharmacyLabelCategory>("원병");
  const [categoryGroup, setCategoryGroup] = useState<PharmacyCategoryGroupName | "">("");
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
  const [titleSelection, setTitleSelection] = useState({ start: 0, end: 0 });
  const [selectedTitleFontSize, setSelectedTitleFontSize] = useState(30);
  const [selectedTitleFontSizeChanged, setSelectedTitleFontSizeChanged] = useState(false);
  const [selectedTitleColor, setSelectedTitleColor] = useState("#111827");
  const [selectedTitleColorChanged, setSelectedTitleColorChanged] = useState(false);
  const [selectedTitleBackgroundColor, setSelectedTitleBackgroundColor] = useState("#ffffff");
  const [selectedTitleBackgroundMode, setSelectedTitleBackgroundMode] = useState<"unchanged" | "none" | "color">("unchanged");
  const [selectedTitleBold, setSelectedTitleBold] = useState(false);
  const [selectedTitleBoldChanged, setSelectedTitleBoldChanged] = useState(false);
  const [selectedTitleTransform, setSelectedTitleTransform] = useState<"none" | "uppercase" | "lowercase">("none");
  const [selectedTitleTransformChanged, setSelectedTitleTransformChanged] = useState(false);
  const [stagedLabels, setStagedLabels] = useState<PharmacyLabelDraft[]>([]);
  const [stagedLabelIds, setStagedLabelIds] = useState<string[]>([]);
  const titleEditorRef = useRef<HTMLTextAreaElement>(null);

  function categoryForRow(row: HospitalDrugLabelRow) {
    if (family === "drug" && row.highCost) return "고가약";
    return categoryGroup ? categoryForGroupedRow(row, categoryGroup, family) : category;
  }

  const baseCategoryRows = useMemo(
    () => rows.filter((row) => (categoryGroup
      ? rowMatchesCategoryGroup(row, categoryGroup, family)
      : rowMatchesCategory(row, category, highCostRoute, family)) && matchesHospitalDrugLabel(row, query)),
    [category, categoryGroup, family, highCostRoute, query, rows],
  );
  const categoryRows = useMemo(() => baseCategoryRows.filter((row) => {
    if (accessoryFilter === "측면라벨") return categoryForRow(row) === "입원산제" ? Boolean(row.inpatientPowderPtp) : Boolean(row.sideLabel || [row.sideLabel1T, row.sideLabelHalfT, row.sideLabelQuarterT].some(isLabelMarked));
    if (accessoryFilter === "유색 측면라벨") return isLabelMarked(row.coloredSideLabel);
    if (accessoryFilter === "병뚜껑") return Boolean(row.regularCapLabel || isLabelMarked(row.capLabel));
    if (accessoryFilter === "유색 병뚜껑") return Boolean(row.coloredCapLabel || (isLabelMarked(row.capLabel) && extractHex(row.capBackground)));
    return true;
  }), [accessoryFilter, baseCategoryRows, category, categoryGroup, family]);
  const categoryItems = useMemo<PharmacyDisplayItem[]>(() => categoryRows.map((row) => ({ key: row.code, row, displayName: row.name })), [categoryRows]);
  const activeItem = categoryItems.find((item) => item.key === activeCode) ?? categoryItems[0];
  const activeRow = activeItem?.row;
  const activeCategory = activeRow ? categoryForRow(activeRow) : category;
  useEffect(() => {
    if (!activeRow) { setDraft(undefined); return; }
    setActiveCode(activeItem?.key ?? activeRow.code);
    const next = resolvePharmacyLabelDraft(activeRow, savedLabels, activeCategory, family);
    if (accessoryFilter === "병뚜껑" || accessoryFilter === "유색 병뚜껑") {
      next.accessory = accessoryFilter;
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "10x27") ?? next.size;
      next.backgroundColor = accessoryFilter === "유색 병뚜껑" ? extractHex(activeRow.coloredSideBackground) || extractHex(activeRow.capBackground) || "#ffffff" : "#ffffff";
    } else if (accessoryFilter === "유색 측면라벨") {
      next.accessory = "유색 측면라벨";
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? next.size;
      next.backgroundColor = extractHex(activeRow.coloredSideBackground) || "#ffffff";
    } else if (accessoryFilter === "측면라벨") {
      next.accessory = "측면라벨";
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "23x102") ?? next.size;
    }
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
  }, [accessoryFilter, activeCategory, activeItem?.key, activeRow?.code, category, family, savedLabels]);

  const selectedDrafts = useMemo(
    () => categoryItems.filter((item) => selectedCodes.includes(item.key)).map((item) => {
      const row = item.row;
      if (activeItem?.key === item.key && draft?.code === row.code) return draft;
      const rowCategory = categoryForRow(row);
      return resolvePharmacyLabelDraft(row, savedLabels, rowCategory, family);
    }),
    [activeItem?.key, categoryItems, selectedCodes, draft, savedLabels, family],
  );
  const pages = groupPharmacyLabelsForPaper(selectedDrafts, paper === "A4" ? A4_PAPER : A3_PAPER);
  const allSelected = categoryItems.length > 0 && categoryItems.every((item) => selectedCodes.includes(item.key));
  const categoryGroups = family === "drug" ? DRUG_CATEGORIES : CABINET_CATEGORIES;
  const isCapLabel = draft?.accessory === "병뚜껑" || draft?.accessory === "유색 병뚜껑";
  const isColoredCapLabel = draft?.accessory === "유색 병뚜껑";
  const isColoredSideLabel = draft?.accessory === "유색 측면라벨";
  const isSideLabel = draft?.accessory === "측면라벨" || isColoredSideLabel;
  const isAmpouleHolder = draft?.accessory === "앰플꽂이"
    || activeRow?.ampouleHolder?.trim().toUpperCase() === "Y";
  const hasCustomOuterBorderColor = Boolean(draft?.style.outerBorderPx && draft.style.outerBorderColor.toLowerCase() !== "#111827");
  const displayCategory = draft?.category ?? activeCategory;
  const isExternalShelfLabel = ["외용제", "외용점안제", "팩제", "시럽"].includes(displayCategory) && draft?.size.presetKey === "13.5x105";
  const sizeOptions = family === "cabinet" && draft
    ? [draft.size]
    : sizesForCategory(displayCategory, activeRow).filter((size) =>
        !["원병", "입원산제"].includes(displayCategory) ? true : isCapLabel ? ["10x27", "15x30"].includes(size.presetKey) : !["10x27", "15x30"].includes(size.presetKey),
      );
  const hasDoseHighlight = draft?.warnings.some((warning) => warning === "용량주의" || warning === "용량확인") ?? false;
  const hasCautionWarning = draft?.warnings.some((warning) =>
    ["위해의약품", "용량주의", "용량확인", "유사발음", "유사모양", "이름주의", "고위험의약품"].includes(warning)
      || warning.includes("반드시 희석 후 사용"),
  ) ?? false;
  const hasFrozenWarning = draft?.warnings.includes("냉동") ?? false;
  const hasColdWarning = (draft?.warnings.includes("냉장") ?? false) || hasFrozenWarning;
  const coldWarningText = hasFrozenWarning ? "냉동" : "냉장";
  const hasLightWarning = draft?.warnings.includes("차광") ?? false;
  const cautionWarnings = draft?.warnings.filter((warning) => !["냉장", "냉동", "차광"].includes(warning)) ?? [];
  const sideCautionWarnings = draft?.warnings.filter((warning) => ["위해의약품", "용량주의", "유사발음", "유사모양", "이름주의", "용량확인"].includes(warning)) ?? [];
  const externalCautionWarnings = draft?.warnings.filter((warning) => ["위해의약품", "용량주의", "용량확인", "유사발음", "유사모양", "이름주의"].includes(warning)) ?? [];
  const hasNameConfusion = draft?.warnings.some((warning) => ["유사발음", "이름주의"].includes(warning)) ?? false;
  const externalStorageText = hasLightWarning ? "차광" : hasColdWarning ? coldWarningText : "";
  const externalHasFlags = externalCautionWarnings.length > 0 || Boolean(externalStorageText);
  const isInjectionLabel = ["앰플", "바이알", "냉장주사"].includes(displayCategory);
  const isAmpouleVial = ["앰플", "바이알"].includes(displayCategory);
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
  const isCompactSyrupLabel = displayCategory === "시럽" && draft?.size.presetKey === "15x90";
  const isGeneralFluidLabel = displayCategory === "일반수액";
  const hasCustomGeneralFluidTextColor = isGeneralFluidLabel && Boolean(draft?.style.fontColor) && draft?.style.fontColor.toLowerCase() !== "#111827";

  function patch(patchValue: Partial<PharmacyLabelDraft>) {
    setDraft((current) => current ? { ...current, ...patchValue } : current);
  }
  function setCategoryAndReset(next: PharmacyLabelCategory) {
    setCategory(next); setCategoryGroup(""); setSelectedCodes([]); setActiveCode(""); setAccessoryFilter("");
  }
  function setCategoryGroupAndReset(next: PharmacyCategoryGroupName) {
    setCategoryGroup(next); setSelectedCodes([]); setActiveCode(""); setAccessoryFilter("");
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
    "--pharmacy-label-border-color": draft.style.outerBorderColor,
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
  const titleParts = displayCategory === "영양수액" ? splitNutritionDoseText(displayTitle) : splitDoseText(displayTitle);
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
    const titleStyles = mergeDoseHighlightStyles(title, draft?.titleStyles ?? [], hasDoseHighlight);
    if (!titleStyles.length) return title;
    return splitStyledPharmacyTitle(title, titleStyles).map((part, index) => <span className={part.style?.backgroundColor && part.style.backgroundColor !== "transparent" ? "pharmacy-editable-title-highlight" : undefined} key={`${index}-${part.text}`} style={{
      color: part.style?.color,
      "--pharmacy-title-highlight-background": part.style?.backgroundColor,
      fontSize: part.style?.fontSizePt ? `${part.style.fontSizePt}pt` : undefined,
      fontWeight: part.style?.fontWeight,
    } as CSSProperties}>{part.text}</span>);
  }

  function applyTitleStyle(style: { fontSizePt?: number; color?: string; backgroundColor?: string; fontWeight?: number; textTransform?: "none" | "uppercase" | "lowercase" }) {
    if (!draft || titleSelection.end <= titleSelection.start) return;
    if (Object.keys(style).length === 0) return;
    const existingStyles = draft.titleStyles ?? [];
    const points = [...new Set([
      0,
      draft.printable.title.length,
      titleSelection.start,
      titleSelection.end,
      ...existingStyles.flatMap((existing) => [existing.start, existing.end]),
    ])].sort((a, b) => a - b);
    const titleStyles = points.slice(0, -1).flatMap((start, index) => {
      const end = points[index + 1];
      const existing = existingStyles
        .filter((item) => item.start <= start && item.end >= end)
        .reduce<PharmacyTitleStyle>((result, item) => ({ ...result, ...item }), { start, end });
      const nextStyle = start >= titleSelection.start && end <= titleSelection.end
        ? { ...existing, ...style }
        : existing;
      const { start: _start, end: _end, ...properties } = nextStyle;
      return Object.keys(properties).length ? [{ start, end, ...properties }] : [];
    });
    patch({ titleStyles });
  }

  function chooseAccessory(value: PharmacyLabelDraft["accessory"]) {
    if (!draft || !value) return;
    const next: Partial<PharmacyLabelDraft> = { accessory: value };
    if (value === "병뚜껑" || value === "유색 병뚜껑") {
      next.size = sizesForCategory("원병", activeRow).find((size) => size.presetKey === "10x27") ?? draft.size;
      next.backgroundColor = value === "유색 병뚜껑"
        ? extractHex(activeRow?.coloredSideBackground) || extractHex(activeRow?.capBackground) || "#ffffff"
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
    const seed = resolvePharmacyLabelDraft(seedRow, savedLabels, activeCategory, family);
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

  function stageNewLabel() {
    if (!draft?.code.trim() || !draft.printable.title.trim()) {
      setSaveStatus("임시저장하려면 약품코드와 상용약품명을 입력해 주십시오.");
      return;
    }
    const staged = { ...draft, id: `pharmacy-label-new-${draft.code.trim()}-${Date.now()}` };
    const replacedId = stagedLabels.find((item) => item.code.toLowerCase() === staged.code.toLowerCase())?.id;
    setStagedLabels((current) => [...current.filter((item) => item.code.toLowerCase() !== staged.code.toLowerCase()), staged]);
    setStagedLabelIds((current) => [...current.filter((id) => id !== replacedId), staged.id]);
    startNewLabel();
    setSaveStatus(`${draft.printable.title} 라벨을 임시저장했습니다.`);
  }

  async function saveSelectedStagedLabels() {
    const selected = stagedLabels.filter((label) => stagedLabelIds.includes(label.id));
    if (selected.length === 0) {
      setSaveStatus("약제팀 라벨에 저장할 임시 항목을 선택해 주십시오.");
      return;
    }
    try {
      setSaveStatus(`${selected.length}개 라벨을 일괄 저장하는 중입니다.`);
      const message = await onSaveLabels(selected);
      const savedIds = new Set(selected.map((label) => label.id));
      setStagedLabels((current) => current.filter((label) => !savedIds.has(label.id)));
      setStagedLabelIds((current) => current.filter((id) => !savedIds.has(id)));
      setSaveStatus(message);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "임시 라벨을 일괄 저장하지 못했습니다.");
    }
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
      activeRow.hazardous ? "위해의약품" : "",
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
      `최종 라벨 크기: ${draft.size.heightMm} × ${draft.size.widthMm} mm`,
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
        <button className={activeTab === "cabinet" ? "active" : ""} onClick={() => { setActiveTab("cabinet"); setFamily("cabinet"); }}>약품장 라벨</button>
        <button className={activeTab === "master" ? "active" : ""} onClick={() => setActiveTab("master")}>약품 마스터</button>
        {activeTab !== "master" && <button className="pharmacy-collapse-button" onClick={() => setDetailsOpen((value) => !value)}>상세 선택 <ChevronDown size={16}/></button>}
      </div>
      {activeTab !== "master" && detailsOpen && <div className="pharmacy-category-groups">{categoryGroups.map((group, index) =>
        <div className="pharmacy-category-block" key={index}>
          <div className="pharmacy-category-row">
            {PHARMACY_CATEGORY_GROUP_NAMES[index] && <button type="button" className={`pharmacy-major-category ${categoryGroup === PHARMACY_CATEGORY_GROUP_NAMES[index] ? "active" : ""}`} onClick={() => setCategoryGroupAndReset(PHARMACY_CATEGORY_GROUP_NAMES[index])}>{PHARMACY_CATEGORY_GROUP_NAMES[index]}</button>}
            {group.map((item) =>
            <button key={item} className={!categoryGroup && category === item ? "active" : ""} onClick={() => setCategoryAndReset(item)}>{item}</button>)}
          </div>
          {family === "drug" && index === 0 && !categoryGroup && ["원병", "PTP", "입원산제"].includes(category) && <div className="pharmacy-filter-dashboard" aria-label="부착 라벨 표시 약품">
            <div className="pharmacy-filter-group">
              <strong>라벨 유형</strong>
              <div>{(["", "측면라벨", "유색 측면라벨", "병뚜껑", "유색 병뚜껑"] as const).map((value) => <button key={value || "전체"} className={accessoryFilter === value ? "active" : ""} onClick={() => { setAccessoryFilter(value); setSelectedCodes([]); setActiveCode(""); }}>{value || "전체"}</button>)}</div>
            </div>
          </div>}
        </div>)}
        {!categoryGroup && category === "고가약" && <div className="pharmacy-high-cost-routes" aria-label="고가약 투여 경로">
          <strong>고가약 구분</strong>
          {(["주사", "경구"] as const).map((route) => <button key={route} className={highCostRoute === route ? "active" : ""} onClick={() => { setHighCostRoute(route); setSelectedCodes([]); setActiveCode(""); }}>{route}</button>)}
        </div>}
      </div>}
    </section>

    {activeTab === "master"
      ? <PharmacyDrugMaster rows={rows} isLoading={isLoading} onSave={onSaveMaster} onSaveMany={onSaveManyMaster} onDelete={onDeleteMaster} onBulkSave={onBulkSaveMaster} onBulkDelete={onBulkDeleteMaster}/>
      : <section className="pharmacy-studio-workspace">
      <aside className="pharmacy-drug-list">
        <div className="pharmacy-panel-head"><div><h2>{categoryGroup || category} 약품 리스트</h2><p>{categoryItems.length.toLocaleString("ko-KR")}개</p></div><span className="badge gray">선택 {selectedCodes.length}</span></div>
        <label className="pharmacy-list-search"><Search size={16}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="현재 약품 리스트 검색"/></label>
        <div className="pharmacy-selection-actions"><label className="pharmacy-select-all"><input type="checkbox" checked={allSelected} onChange={() => setSelectedCodes(allSelected ? [] : categoryItems.map((item) => item.key))}/>전체 선택</label><button type="button" onClick={() => setSelectedCodes([])}>선택 해제</button></div>
        <div className="pharmacy-drug-list-scroll">
          {isLoading && <span className="empty">약품 데이터를 불러오는 중입니다.</span>}
          {!isLoading && categoryItems.length === 0 && <span className="empty">해당 분류의 원내보유약품이 없습니다.</span>}
          {categoryItems.map((item) => <label key={item.key} className={`pharmacy-drug-row ${item.key === activeItem?.key ? "selected" : ""}`}>
            <input type="checkbox" checked={selectedCodes.includes(item.key)} onChange={() => setSelectedCodes((prev) => prev.includes(item.key) ? prev.filter((code) => code !== item.key) : [...prev, item.key])}/>
            <button type="button" onClick={() => { setActiveCode(item.key); setSelectedCodes((previous) => previous.includes(item.key) ? previous : [...previous, item.key]); }}><strong>{item.displayName}</strong><small>{item.row.koreanName} · {item.row.code} · {item.row.strength}</small>{categoryForRow(item.row) === "입원산제" && (item.row.doseCaution || item.row.doseCheck) && <em className="pharmacy-list-dose-warning">{[item.row.doseCaution ? "용량주의" : "", item.row.doseCheck ? "용량확인" : ""].filter(Boolean).join(" · ")}</em>}</button>
          </label>)}
        </div>
      </aside>

      {family === "cabinet"
        ? categoryGroup
          ? <section className="pharmacy-cabinet-canvas-panel"><div className="pharmacy-panel-head"><div><h2>{categoryGroup} 통합 검색</h2><p>왼쪽에서 세부 분류를 선택하면 해당 약품장 편집 캔버스가 열립니다.</p></div></div></section>
          : <PharmacyCabinetLabelCanvas category={category} rows={categoryRows} onPrint={onPrint}/>
        : <>
      <section className="pharmacy-label-canvas-panel">
        <div className="pharmacy-panel-head"><div><h2>라벨 편집 캔버스</h2><p>선택한 라벨을 편집한 뒤 최종본으로 저장합니다.</p></div></div>
        <div className="pharmacy-edit-modes"><button className={editMode === "edit" ? "active" : ""} onClick={() => setEditMode("edit")}>선택 라벨 수정</button><button className={editMode === "new" ? "active" : ""} onClick={startNewLabel}>새 라벨 만들기</button>{draft && <div className="pharmacy-inline-border-choice"><span>테두리</span><button className={draft.style.outerBorderPx > 0 ? "active" : ""} onClick={() => patch({ style: {...draft.style, outerBorderPx: displayCategory === "고가약" || activeRow?.border ? 5 : 0.5} })}>있음</button><button className={draft.style.outerBorderPx <= 0 ? "active" : ""} onClick={() => patch({ style: {...draft.style, outerBorderPx: 0} })}>없음</button></div>}</div>
        {editMode === "new" && draft && <div className="pharmacy-new-label-fields">
          <input placeholder="상용약품명" value={draft.printable.title} onChange={(e) => patch({ printable: {...draft.printable, title: e.target.value} })}/>
          <input placeholder="한글약품명" value={draft.printable.koreanName} onChange={(e) => patch({ printable: {...draft.printable, koreanName: e.target.value} })}/>
          <input placeholder="약품코드" value={draft.code} onChange={(e) => patch({ code: e.target.value })}/><input placeholder="물품코드" value={draft.itemCode} onChange={(e) => patch({ itemCode: e.target.value })}/>
          <input placeholder="약품 위치" value={draft.location} onChange={(e) => patch({ location: e.target.value })}/>
          <input placeholder="ATC 번호" value={draft.atc} onChange={(e) => patch({ atc: e.target.value })}/>
        </div>}
        <div className="pharmacy-label-canvas">{draft ? <article className={`pharmacy-print-label label-size-${draft.size.presetKey} ${displayCategory === "항암제" ? "anticancer" : ""} ${displayCategory === "마약/향정" ? "controlled-drug-label" : ""} ${displayCategory === "고가약" ? "high-cost" : ""} ${hasCustomOuterBorderColor ? "custom-outer-border" : ""} ${hasCustomGeneralFluidTextColor ? "custom-general-fluid-text-color" : ""} ${storageOnlyClass} ${storageToneClass} ${isCapLabel ? "cap-label" : ""} ${isColoredCapLabel ? "colored-cap-label" : ""} ${isSideLabel ? "side-label" : ""} ${isExternalShelfLabel ? "external-shelf-label" : ""} ${displayCategory === "시럽" ? "syrup-label" : ""} ${displayCategory === "영양수액" ? "nutrition-fluid-label" : ""} ${isGeneralFluidLabel ? `general-fluid-label fluid-tone-${generalFluidTone}` : ""} ${isInjectionLabel ? "injection-label" : ""} ${isHeparinLabel ? "heparin-label" : ""} ${isAmpouleHolder ? "has-ampoule-holder" : ""} ${!showTopBanner ? "no-top-banner no-warning" : ""}`} style={labelStyle}>
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
          </div> : displayCategory === "마약/향정" ? <div className="pharmacy-controlled-label-form">
            <div className="pharmacy-controlled-label-top">고위험의약품{hasDoseHighlight ? " / 용량확인" : ""}</div>
            <strong className={titleSizeClass}>{hasDoseHighlight && controlledTitleParts.dose
              ? <>{controlledTitleParts.before}<mark className="dose-highlight">{controlledTitleParts.dose}</mark>{controlledTitleParts.after}</>
              : controlledTitle}</strong>
            <div className="pharmacy-controlled-label-footer">{controlledCategory ?? "마약/향정"}{hasColdWarning ? ` / ${coldWarningText}` : ""}</div>
          </div> : displayCategory === "영양수액" ? <div className={`pharmacy-nutrition-label ${nutritionHasFlags ? "with-flags" : "name-only"} ${hasLightWarning ? "with-light" : ""}`}>
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
            <span>{[draft.printable.topBanner, displayCategory !== "항암제" ? cautionWarnings.join(" · ") : "", !hasCautionWarning && hasLightWarning ? (isAmpouleVial ? "차광보관" : "차광") : "", !hasCautionWarning && !hasLightWarning && hasColdWarning ? `${coldWarningText}보관` : ""].filter(Boolean).join(" · ")}</span>
            {hasCautionWarning && hasLightWarning && <b className="pharmacy-storage-badge light">차광</b>}
            {hasCautionWarning && hasColdWarning && <b className="pharmacy-storage-badge cold">{coldWarningText}</b>}
          </div>}
          {!hasCautionWarning && hasColdWarning && hasLightWarning && <b className="pharmacy-storage-circle cold">{coldWarningText}</b>}
          <div className="pharmacy-label-main"><PharmacyAutoFitLabelContent fitKey={`${draft.size.presetKey}|${draft.style.outerBorderPx}|${draft.printable.title}|${draft.printable.koreanName}|${draft.warnings.join("|")}|${JSON.stringify(draft.titleStyles ?? [])}`}><strong className={`${titleSizeClass} ${hasNameConfusion && ["외용제", "외용점안제", "팩제"].includes(displayCategory) ? "confusion-name" : ""}`}>
            {renderEditableTitle(renderedDisplayTitle)}
          </strong>
            {!isCapLabel && !isExternalShelfLabel && !isCompactSyrupLabel && !isGeneralFluidLabel && <span>{draft.printable.koreanName}</span>}
            {isCapLabel && draft.doseUnit && draft.doseUnit !== "1T" && <b>{draft.doseUnit}</b>}
            </PharmacyAutoFitLabelContent>
            {!isCapLabel && !isExternalShelfLabel && draft.atc && <small className="pharmacy-label-atc">ATC {draft.atc}</small>}
            {!isCapLabel && !isExternalShelfLabel && draft.location && <small className="pharmacy-label-location">{draft.location}</small>}
            {!isExternalShelfLabel && draft.printable.reconstitution && <em>{draft.printable.reconstitution}</em>}</div>
          {isAmpouleHolder && <div className="pharmacy-ampoule-holder">앰플꽂이</div>}
          {!isExternalShelfLabel && (draft.printable.footer.enabled || draft.warnings.includes("위해의약품")) && <footer className={displayCategory === "항암제" ? "anticancer-footer" : isHeparinLabel ? "heparin-footer" : ""}>{draft.warnings.includes("위해의약품") ? "<캅셀개봉. 분쇄 금지>" : displayCategory === "항암제" ? "항암제" : draft.printable.footer.text}</footer>}
          </>}
        </article> : <span className="empty">표시할 라벨이 없습니다.</span>}</div>
        <section className="pharmacy-condition-dashboard">
          <div><h3>주의·보관 조건</h3><div className="pharmacy-warning-editor">{WARNING_OPTIONS.map((warning) => <label className={draft?.warnings.includes(warning) ? "checked" : ""} key={warning}><input type="checkbox" checked={draft?.warnings.includes(warning) ?? false} onChange={() => toggleWarning(warning)}/><span>{warning}</span></label>)}</div></div>
          {draft && <div><h3>약품유형</h3><div className="pharmacy-type-editor">{[...new Set(rows.map((row) => row.drugType).filter((type) => type && !["36", "99", "종료예정"].includes(type.trim())))].map((type) => <label className={draft.drugTypes.includes(type) ? "checked" : ""} key={type}><input type="checkbox" checked={draft.drugTypes.includes(type)} onChange={() => patch({ drugTypes: draft.drugTypes.includes(type) ? draft.drugTypes.filter((v) => v !== type) : [...draft.drugTypes, type] })}/><span>{type}</span></label>)}</div></div>}
        </section>
        {stagedLabels.length > 0 && <section className="pharmacy-staged-labels">
          <div><h3>새 약품라벨 임시저장</h3><p>저장할 항목을 체크한 뒤 한 번에 약제팀 라벨에 반영합니다.</p></div>
          <div>{stagedLabels.map((label) => <label key={label.id}>
            <input type="checkbox" checked={stagedLabelIds.includes(label.id)} onChange={() => setStagedLabelIds((current) => current.includes(label.id) ? current.filter((id) => id !== label.id) : [...current, label.id])}/>
            <span><strong>{label.printable.title}</strong><small>{label.code} · {label.category} · {label.location || "위치 미입력"}</small></span>
          </label>)}</div>
          <button type="button" className="print-button" disabled={stagedLabelIds.length === 0} onClick={() => void saveSelectedStagedLabels()}>선택 항목 약제팀 라벨에 일괄 저장</button>
        </section>}
        {saveStatus && <div className="pharmacy-canvas-status">{saveStatus}</div>}
        <div className="pharmacy-save-row"><span>{selectedDrafts.length ? `${pages.length}페이지 미리보기` : "출력할 약품을 선택하십시오."}</span><div className="pharmacy-paper-mini"><button type="button" className={paper === "A4" ? "active" : ""} onClick={() => setPaper("A4")}>A4</button><button type="button" className={paper === "A3" ? "active" : ""} onClick={() => setPaper("A3")}>A3</button></div><button type="button" className="secondary-button" disabled={!selectedDrafts.length} onClick={() => onPrint(selectedDrafts, paper)}><FileDown size={16}/>PDF 미리보기</button><button type="button" className="secondary-button" disabled={!selectedDrafts.length} onClick={() => onPrint(selectedDrafts, paper)}><Printer size={16}/>전체 출력</button>{editMode === "new" && <button type="button" className="secondary-button" disabled={!draft} onClick={stageNewLabel}>임시저장</button>}<button type="button" className="print-button" disabled={!draft} onClick={() => void confirmAndSave()}><Save size={16}/>수정라벨 저장</button></div>
      </section>

      <aside className="pharmacy-tool-panel">
        <details open><summary>크기 설정</summary><div className="pharmacy-tool-body pharmacy-size-grid">{sizeOptions.map((size) => <button key={size.presetKey} className={`pharmacy-size-preset ${draft?.size.presetKey === size.presetKey ? "active" : ""}`} onClick={() => patch({ size })}>{size.heightMm} × {size.widthMm} mm</button>)}</div></details>
        {["원병", "PTP", "입원산제"].includes(displayCategory) && <details open><summary>정제·부착 위치</summary><div className="pharmacy-tool-body pharmacy-choice-grid">{["0.25T", "0.5T", "1T"].map((value) => <button key={value} className={draft?.doseUnit === value ? "active" : ""} onClick={() => patch({ doseUnit: value as PharmacyLabelDraft["doseUnit"] })}>{value}</button>)}{["측면라벨", ...(isLabelMarked(activeRow?.coloredSideLabel) ? ["유색 측면라벨"] : []), "병뚜껑", ...(activeRow?.coloredCapLabel || (isLabelMarked(activeRow?.capLabel) && extractHex(activeRow?.capBackground)) ? ["유색 병뚜껑"] : [])].map((value) => <button key={value} className={draft?.accessory === value ? "active" : ""} onClick={() => chooseAccessory(value as PharmacyLabelDraft["accessory"])}>{value}</button>)}</div></details>}
        <details open><summary>테두리 설정</summary><div className="pharmacy-tool-body"><label><input type="checkbox" checked={(draft?.style.outerBorderPx ?? 0) > 0} onChange={(e) => draft && patch({ style: {...draft.style, outerBorderPx: e.target.checked ? displayCategory === "고가약" || activeRow?.border ? 5 : 0.5 : 0} })}/>테두리 있음</label><label>테두리 두께<input type="range" min="0.5" max="5" step="0.5" value={Math.max(0.5, draft?.style.outerBorderPx ?? 0.5)} disabled={(draft?.style.outerBorderPx ?? 0) <= 0} onChange={(e) => draft && patch({style:{...draft.style,outerBorderPx:Number(e.target.value)}})}/><b>{draft?.style.outerBorderPx ?? 0}mm</b></label><input type="color" value={draft?.style.outerBorderColor ?? "#111827"} onChange={(e) => draft && patch({style: {...draft.style, outerBorderColor: e.target.value}})}/></div></details>
        <details open><summary>표시 내용</summary><div className="pharmacy-tool-body">
          <label>상용약품명<textarea ref={titleEditorRef} value={draft?.printable.title ?? ""} onSelect={(e) => { const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; if (end > start) setTitleSelection({ start, end }); }} onChange={(e) => draft && patch({ printable: { ...draft.printable, title: e.target.value }, titleStyles: [] })}/></label>
          {isGeneralFluidLabel && draft && <label>전체 글자 색상<input type="color" value={draft.style.fontColor} onChange={(e) => patch({ style: { ...draft.style, fontColor: e.target.value } })}/></label>}
          <div className="pharmacy-title-style-dashboard"><strong>약품명 부분 편집</strong><small>{titleSelection.end > titleSelection.start ? `"${draft?.printable.title.slice(titleSelection.start, titleSelection.end)}" 선택됨` : "위 약품명에서 편집할 부분을 드래그하여 선택하십시오."}</small>
            <div className="pharmacy-title-style-control"><label>글자 크기<input type="number" min="6" max="48" value={selectedTitleFontSize} onChange={(e) => { setSelectedTitleFontSize(Number(e.target.value)); setSelectedTitleFontSizeChanged(true); }}/></label><label>글자 색상<input type="color" value={selectedTitleColor} onChange={(e) => { setSelectedTitleColor(e.target.value); setSelectedTitleColorChanged(true); }}/></label><label>배경색<input type="color" value={selectedTitleBackgroundColor} disabled={selectedTitleBackgroundMode === "none"} onChange={(e) => { setSelectedTitleBackgroundColor(e.target.value); setSelectedTitleBackgroundMode("color"); }}/></label><label><input type="checkbox" checked={selectedTitleBackgroundMode === "none"} onChange={(e) => setSelectedTitleBackgroundMode(e.target.checked ? "none" : "unchanged")}/>배경색 없음</label></div>
            <div className="pharmacy-title-style-control"><label><input type="checkbox" checked={selectedTitleBold} onChange={(e) => { setSelectedTitleBold(e.target.checked); setSelectedTitleBoldChanged(true); }}/>굵게</label><label><input type="radio" name="title-case" checked={selectedTitleTransform === "uppercase"} onChange={() => { setSelectedTitleTransform("uppercase"); setSelectedTitleTransformChanged(true); }}/>대문자</label><label><input type="radio" name="title-case" checked={selectedTitleTransform === "lowercase"} onChange={() => { setSelectedTitleTransform("lowercase"); setSelectedTitleTransformChanged(true); }}/>소문자</label><label><input type="radio" name="title-case" checked={selectedTitleTransform === "none"} onChange={() => { setSelectedTitleTransform("none"); setSelectedTitleTransformChanged(true); }}/>원문</label><button type="button" onClick={() => { applyTitleStyle({ ...(selectedTitleFontSizeChanged ? { fontSizePt: selectedTitleFontSize } : {}), ...(selectedTitleColorChanged ? { color: selectedTitleColor } : {}), ...(selectedTitleBackgroundMode === "none" ? { backgroundColor: "transparent" } : selectedTitleBackgroundMode === "color" ? { backgroundColor: selectedTitleBackgroundColor } : {}), ...(selectedTitleBoldChanged ? { fontWeight: selectedTitleBold ? 1000 : 400 } : {}), ...(selectedTitleTransformChanged ? { textTransform: selectedTitleTransform } : {}) }); }}>선택 부분 수정 적용</button><button type="button" onClick={() => draft && patch({ titleStyles: [] })}>부분 서식 초기화</button></div>
          </div>
          <label>한글약품명<input value={draft?.printable.koreanName ?? ""} onChange={(e) => draft && patch({ printable: { ...draft.printable, koreanName: e.target.value } })}/></label><label>용량<input value={draft?.printable.strength ?? ""} onChange={(e) => draft && patch({ printable: { ...draft.printable, strength: e.target.value } })}/></label><label>약품 위치<input value={draft?.location ?? ""} onChange={(e) => patch({ location: e.target.value })}/></label><label>ATC 번호<input value={draft?.atc ?? ""} onChange={(e) => patch({ atc: e.target.value })}/></label>{displayCategory === "항암제" && <label>재구성·용해액(WI/NS)<input value={draft?.printable.reconstitution ?? ""} onChange={(e) => draft && patch({ printable: { ...draft.printable, reconstitution: e.target.value } })}/></label>}
        </div></details>
      </aside>
      </>}
    </section>}
  </main>;
}
