import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizePharmacyLabelMasterRow } from "./PharmacyDrugMaster";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";

const workspaceSource = readFileSync(new URL("./PharmacyLabelWorkspace.tsx", import.meta.url), "utf8");
const masterSource = readFileSync(new URL("./PharmacyDrugMaster.tsx", import.meta.url), "utf8");
const cabinetSource = readFileSync(new URL("./PharmacyCabinetLabelCanvas.tsx", import.meta.url), "utf8");
const cabinetLogicSource = readFileSync(new URL("./pharmacyCabinetLabels.ts", import.meta.url), "utf8");
const studioSource = readFileSync(new URL("./pharmacyLabelStudio.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("pharmacy label workspace UI", () => {
  it("provides label, cabinet, and three-column drug master tabs", () => {
    expect(workspaceSource).toContain("약품 라벨");
    expect(workspaceSource).toContain("약품장 라벨");
    expect(workspaceSource).toContain("약품 마스터");
    expect(workspaceSource).toContain("pharmacy-master-shortcut");
    expect(workspaceSource).toContain('aria-pressed={activeTab === "master"}');
    expect(workspaceSource).toContain("PharmacyDrugMaster");
    expect(workspaceSource).toContain("상세 선택");
    expect(workspaceSource).toContain("DRUG_CATEGORIES");
    expect(workspaceSource).toContain("CABINET_CATEGORIES");
    expect(masterSource).toContain("pharmacy-master-grid");
    expect(masterSource).toContain("주의·보관·관리 분류");
    expect(masterSource).toContain("제형·라벨 유형 설정");
    expect(masterSource).toContain("실시간 대상 목록");
    expect(masterSource).toContain("의약품 분류 리스트");
  });

  it("keeps shared flags separate from pharmacy-only label settings", () => {
    expect(masterSource).toContain("저장 및 전체 적용");
    expect(masterSource).toContain("약제팀 라벨에 저장");
    expect(masterSource).toContain("병동 비치의약품과 E-cart 목록에 영향을 주지 않습니다.");
    expect(masterSource).toContain("E-cart(NICU)");
    expect(masterSource).toContain("유색측면라벨");
    expect(masterSource).toContain("labelDoseQuarterT");
    expect(masterSource).toContain('label: "0.25T"');
    expect(masterSource).toContain("신규 등록 후 선택");
    expect(masterSource).toContain("선택 약품 불러오기");
    expect(masterSource).toContain("수정 저장");
    expect(masterSource).toContain("선택 약품 삭제");
    expect(masterSource).toContain("원내보유의약품리스트 엑셀과 약품 라벨, 약품 목록, 병동 비품 관련 화면에서 모두 삭제됩니다.");
    expect(masterSource).toContain("onDelete(row)");
    expect(masterSource).toContain("엑셀 일괄 등록");
    expect(masterSource).toContain("엑셀 일괄 삭제");
    expect(masterSource).toContain("일괄 작업 양식 다운로드");
    expect(masterSource).toContain('"약품코드", "물품코드", "상용약품명", "한글약품명", "함량", "의약품 분류"');
    expect(masterSource).toContain("약품마스터_일괄등록삭제_양식.xlsx");
    expect(appSource).toContain("deletedPharmacyDrugCodes");
    expect(appSource).toContain("removePharmacyDrugsFromApp");
    expect(appSource).toContain("onBulkSaveMaster={bulkSavePharmacyDrugMasters}");
    expect(appSource).toContain("onBulkDeleteMaster={bulkDeletePharmacyDrugMasters}");
    expect(masterSource).toContain("editableFieldsFromRow");
    expect(masterSource).toContain("updateExisting");
    expect(masterSource).toContain("editingOriginalCode");
    expect(masterSource).toContain("saveRow(next, setSharedStatus, existing.code)");
    expect(masterSource.match(/\{renderNewRegistration\(/g)).toHaveLength(1);
    expect(masterSource).toContain('MASTER_DRUG_GROUPS = ["경구", "주사", "외용", "일반수액"]');
    expect(masterSource).toContain("setLabelQuery(row.code)");
  });

  it("activates saved pharmacy-label drugs and converts broad routes to visible label types", () => {
    const base = {
      code: "XTEST",
      name: "Test drug",
      koreanName: "테스트 약품",
      strength: "",
      drugType: "주사",
      spec: "",
      package: "",
      storage: "",
      lightProtected: false,
      inHospital: false,
      similarLook: false,
      similarSound: false,
      doseCaution: false,
      doseCheck: false,
      highRisk: false,
    } as HospitalDrugLabelRow;

    expect(normalizePharmacyLabelMasterRow(base)).toMatchObject({ drugType: "앰플", inHospital: true });
    expect(normalizePharmacyLabelMasterRow({ ...base, drugType: "냉장주사" })).toMatchObject({
      drugType: "냉장주사",
      inHospital: true,
    });
    expect(appSource).toContain("state.pharmacyAdditionalRows.map(normalizePharmacyLabelMasterRow)");
    expect(appSource).toContain("priorityCodes.has(right.code.toUpperCase())");
  });

  it("automates high-risk relationships and prioritizes non-sedative, non-injectable-anticancer rows", () => {
    expect(masterSource).toContain("isControlledHighRisk(nextRow)");
    expect(masterSource).toContain('patch.highRiskCategory = row.highRiskCategory?.trim() || "중등도진정의약품"');
    expect(masterSource).toContain('key === "highRisk" && !checked && isControlledHighRisk(row)');
    expect(masterSource).toContain('category === "주사용항암제" || isInjectableDrug(row)');
    expect(masterSource).toContain('patch.highRisk = true');
    expect(masterSource).toContain('"주사용 항암제"');
    expect(masterSource).toContain("isPriorityHighRisk");
    expect(masterSource).toContain('"high-risk-priority"');
  });

  it("provides selection, PDF preview, editing, and workbook upload controls", () => {
    expect(workspaceSource).toContain("전체 선택");
    expect(workspaceSource).toContain("PDF 미리보기");
    expect(workspaceSource).toContain("수정라벨 저장");
    expect(workspaceSource).toContain("새 라벨 만들기");
    expect(workspaceSource).toContain("유효기간 파일 업데이트");
    expect(workspaceSource).toContain("window.confirm");
    expect(workspaceSource).toContain("confirmAndSave");
    expect(workspaceSource).toContain('sourceType: "manual"');
    expect(workspaceSource).toContain("주의 조건 추가");
    expect(workspaceSource).toContain("테두리:");
    expect(appSource).toContain("(isPharmacyEditor || isPharmacyLabelWorkspaceOpen) && !showPrintPreview");
  });

  it("uses a dedicated cabinet canvas with location and category-specific full-list output", () => {
    expect(workspaceSource).toContain("PharmacyCabinetLabelCanvas");
    expect(cabinetSource).toContain("약품장 라벨 편집 캔버스");
    expect(cabinetSource).toContain("위치 선택");
    expect(cabinetSource).toContain("약품 1칸 5 × 60mm");
    expect(cabinetSource).toContain("알파벳 내림차순");
    expect(cabinetSource).toContain("fullListPageCount");
    expect(cabinetSource).not.toContain("entry.koreanName");
    expect(cabinetSource.indexOf('isAtc && <em>{entry.atc')).toBeLessThan(
      cabinetSource.indexOf("<div><strong>{entry.name}</strong></div>"),
    );
    expect(cabinetSource).toContain("pharmacy-atc-detail");
    expect(cabinetSource).toContain("ATC 번호를 세로 오름차순");
    expect(cabinetSource).toContain("전체 위치 한 번에 출력");
    expect(cabinetSource).not.toContain("원병 고가약 별도 리스트");
    expect(cabinetSource).toContain("경구 고가약");
    expect(cabinetSource).toContain("등록 위치를 함께 표시");
    expect(cabinetSource).toContain("blankCellCount");
    expect(cabinetSource).toContain('"원병", "PTP", "냉장주사"');
    expect(cabinetSource).toContain("A4 한 페이지의 3열 구성");
    expect(cabinetSource).toContain("약품명, 주의 분류와 약품장 위치");
  });

  it("supports multiple pharmacy-only subtypes, cabinet location, and staged batch save", () => {
    expect(masterSource).toContain("pharmacyLabelTypesForRow");
    expect(masterSource).toContain("약품장 위치");
    expect(masterSource).toContain('type="checkbox" checked={selectedTypes.includes(type)}');
    expect(workspaceSource).toContain("새 약품라벨 임시저장");
    expect(workspaceSource).toContain("선택 항목 약제팀 라벨에 일괄 저장");
    expect(masterSource).toContain("현재 검색 결과 전체 선택");
    expect(masterSource).toContain("pharmacy-master-row-check");
    expect(masterSource).toContain("labelBatchCodes, (code)");
    expect(masterSource).toContain("선택 항목 약제팀 라벨에 일괄 저장");
    expect(workspaceSource).toContain("PHARMACY_CATEGORY_GROUP_NAMES");
    expect(workspaceSource).toContain("onSaveLabels(selected)");
  });

  it("applies dose and storage conditions to the label canvas", () => {
    expect(workspaceSource).toContain("dose-highlight");
    expect(workspaceSource).toContain("pharmacy-storage-badge light");
    expect(workspaceSource).toContain("pharmacy-storage-badge cold");
    expect(workspaceSource).toContain("storageOnlyClass");
    expect(workspaceSource).toContain("no-top-banner");
    expect(workspaceSource).toContain('!showTopBanner ? "no-top-banner no-warning"');
    expect(workspaceSource).toContain('`${coldWarningText}보관`');
    expect(workspaceSource).toContain('warnings.includes("냉동")');
  });

  it("removes non-drug status values from the drug type selector", () => {
    expect(workspaceSource).toContain('!["36", "99", "종료예정"].includes(type.trim())');
  });

  it("provides colored side labels, location, and ATC editing", () => {
    expect(workspaceSource).toContain("유색 측면라벨");
    expect(workspaceSource).toContain("약품 위치");
    expect(workspaceSource).toContain("ATC 번호");
  });

  it("renders designated thick borders in millimeters", () => {
    expect(workspaceSource).toContain('`${draft.style.outerBorderPx}mm solid');
    expect(workspaceSource).toContain('"--pharmacy-label-border-width"');
    expect(workspaceSource).toContain("}mm</b>");
    expect(workspaceSource).toContain('min="0.5"');
    expect(workspaceSource).toContain('step="0.5"');
  });

  it("renders the side-label template with photo, name, ATC, and expiry sections", () => {
    expect(workspaceSource).toContain("pharmacy-side-label-form");
    expect(workspaceSource).toContain("식별사진");
    expect(workspaceSource).toContain("유효기간");
    expect(workspaceSource).toContain("23x102");
  });

  it("applies the compact external shelf rule and preserves colored side color on bottle caps", () => {
    expect(workspaceSource).toContain('isExternalShelfLabel ? "external-shelf-label"');
    expect(workspaceSource).toContain("!isCompactSyrupLabel && !isGeneralFluidLabel");
    expect(workspaceSource).toContain('value === "유색 병뚜껑"');
    expect(workspaceSource).toContain('"--pharmacy-external-tone": externalTone');
    expect(workspaceSource).toContain("pharmacy-external-strip");
    expect(workspaceSource).toContain("externalCautionWarnings");
    expect(workspaceSource).toContain("externalHasFlags");
    expect(workspaceSource).toContain('"name-only"');
    expect(workspaceSource).toContain("confusion-name");
  });

  it("supports clearing selections and partial common-name styling", () => {
    expect(workspaceSource).toContain("선택 해제");
    expect(workspaceSource).toContain("pharmacy-title-style-dashboard");
    expect(workspaceSource).toContain("splitStyledPharmacyTitle");
    expect(workspaceSource).toContain("textTransform: \"uppercase\"");
    expect(workspaceSource).toContain("textTransform: \"lowercase\"");
    expect(workspaceSource).toContain("크기 적용");
    expect(workspaceSource).toContain("색상 적용");
    expect(workspaceSource).toContain("fontWeight: 1000");
    expect(workspaceSource).toContain("if (end > start) setTitleSelection");
  });

  it("uses a dedicated non-overlapping Heparin footer", () => {
    expect(workspaceSource).toContain('isHeparinLabel ? "heparin-label"');
    expect(workspaceSource).toContain('isHeparinLabel ? "heparin-footer"');
  });

  it("filters side and cap labels and places paper controls next to output", () => {
    expect(workspaceSource).toContain("pharmacy-filter-dashboard");
    expect(workspaceSource).toContain("라벨 유형");
    expect(workspaceSource).not.toContain("분할 용량 · 복수 선택");
    expect(studioSource).toContain("sideLabelHalfT");
    expect(studioSource).toContain("coloredSideLabel");
    expect(workspaceSource).toContain("capLabel");
    expect(workspaceSource).toContain("유색 병뚜껑");
    expect(workspaceSource).not.toContain("doseUnitFilters");
    expect(studioSource).toContain("sideLabelQuarterT");
    expect(workspaceSource).not.toContain("PharmacyThreeTierLocationCanvas");
    expect(studioSource).toContain('"유색라벨", "측면라벨"');
    expect(cabinetLogicSource).toContain("buildThreeTierEntries");
    expect(cabinetSource).toContain("3단장 위치별 라벨");
    expect(cabinetSource).toContain("약품 1칸 3 × 43mm");
    expect(cabinetSource).toContain('entry.doseUnit === "1T" ? ""');
    expect(stylesSource).toContain("dose-0-5t");
    expect(stylesSource).toContain("dose-0-25t");
    expect(cabinetSource).toContain("pharmacy-three-tier-name-dose");
    expect(stylesSource).toContain("pharmacy-three-tier-name-dose");
    expect(workspaceSource).toContain("pharmacy-list-search");
    expect(workspaceSource).toContain("isLabelMarked");
    expect(workspaceSource).toContain("pharmacy-condition-dashboard");
  });

  it("supports list, nutrition, multi-selection, expiry, and border editing rules", () => {
    expect(workspaceSource).toContain("PharmacyCabinetLabelCanvas");
    expect(cabinetSource).toContain("pharmacy-cabinet-location-label");
    expect(cabinetSource).toContain("pharmacy-cabinet-full-list-row");
    expect(workspaceSource).toContain("pharmacy-nutrition-label");
    expect(workspaceSource).toContain("next.size = draft.size");
    expect(workspaceSource).toContain("formatPharmacyExpiry");
    expect(workspaceSource).toContain("pharmacy-inline-border-choice");
    expect(workspaceSource).toContain("outerBorderPx: 0");
    expect(workspaceSource).toContain("pharmacy-list-dose-warning");
    expect(workspaceSource).toContain("size: preserveAccessory ? current.size : next.size");
    expect(workspaceSource).toContain("workbookBorderColor");
    expect(workspaceSource).toContain("next.style.outerBorderColor = workbookBorderColor");
    expect(workspaceSource).toContain("nutrition-fluid-label");
    expect(workspaceSource).toContain("splitNutritionDoseParts");
    expect(workspaceSource).toContain('join("\\n")');
    expect(workspaceSource).toContain('setAccessoryFilter("유색 측면라벨")');
    expect(workspaceSource).toContain("activeRow?.imagePath || draft?.imagePath");
    expect(workspaceSource).toContain("사진 미등록");
    expect(workspaceSource).toContain("sideCautionWarnings");
    expect(workspaceSource).toContain("koreanTitleParts");
  });

  it("uses the stock-management 40x70 structure for controlled-drug labels", () => {
    expect(workspaceSource).toContain("pharmacy-controlled-label-form");
    expect(workspaceSource).toContain("고위험의약품");
    expect(workspaceSource).toContain("용량확인");
    expect(workspaceSource).toContain("controlledCategory");
  });

  it("treats the mandatory dilution phrase as a visible caution in previews and printed labels", () => {
    expect(workspaceSource).toContain('warning.includes("반드시 희석 후 사용")');
    expect(appSource).toContain('warning.includes("반드시 희석 후 사용")');
  });
});
