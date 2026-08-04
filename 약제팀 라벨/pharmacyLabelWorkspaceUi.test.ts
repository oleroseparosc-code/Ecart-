import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(new URL("./PharmacyLabelWorkspace.tsx", import.meta.url), "utf8");
const masterSource = readFileSync(new URL("./PharmacyDrugMaster.tsx", import.meta.url), "utf8");
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
    expect(masterSource.match(/\{renderNewRegistration\(/g)).toHaveLength(1);
    expect(masterSource).toContain('MASTER_DRUG_GROUPS = ["경구", "주사", "외용", "일반수액"]');
    expect(masterSource).toContain("setLabelQuery(row.code)");
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
    expect(workspaceSource).toContain("정제 용량");
    expect(workspaceSource).toContain("sideLabelHalfT");
    expect(workspaceSource).toContain("coloredSideLabel");
    expect(workspaceSource).toContain("capLabel");
    expect(workspaceSource).toContain("유색 병뚜껑");
    expect(workspaceSource).toContain("doseUnitFilter");
    expect(workspaceSource).toContain("sideLabelQuarterT");
    expect(workspaceSource).toContain("pharmacy-list-search");
    expect(workspaceSource).toContain("isLabelMarked");
    expect(workspaceSource).toContain("pharmacy-condition-dashboard");
  });

  it("supports list, nutrition, multi-selection, expiry, and border editing rules", () => {
    expect(workspaceSource).toContain("pharmacy-cabinet-list-row");
    expect(workspaceSource).toContain("with-location-column");
    expect(workspaceSource).toContain("{draft.location && <em>{draft.location}</em>}");
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
