import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("drug label selection UI", () => {
  it("closes the pharmacy workspace before opening the shared PDF preview modal", () => {
    expect(appSource).toContain("function printPharmacyStudioLabels");
    expect(appSource).toContain("setIsPharmacyLabelWorkspaceOpen(false)");
    expect(appSource).toContain("setShowPrintPreview(true)");
  });

  it("uses a real checkbox tied to each drug label row selection state", () => {
    expect(appSource).toContain('className="label-drug-checkbox"');
    expect(appSource).toContain('type="checkbox"');
    expect(appSource).toContain("checked={selected}");
    expect(appSource).toContain("aria-label={`${row.name} 라벨 선택`}");
  });

  it("offers a top select-all checkbox for the currently visible label rows", () => {
    expect(appSource).toContain("function toggleCurrentLabelRows(checked: boolean)");
    expect(appSource).toContain("const areCurrentLabelRowsSelected =");
    expect(appSource).toContain('className={`label-drug-list-row label-drug-select-all ${areCurrentLabelRowsSelected ? "selected" : ""}`}');
    expect(appSource).toContain('aria-label="현재 목록 전체 라벨 선택"');
    expect(appSource).toContain("onChange={(event) => toggleCurrentLabelRows(event.currentTarget.checked)}");
  });

  it("reserves a compact first column for the label selection checkbox", () => {
    expect(cssSource).toMatch(/\.label-drug-list-row\s*\{[\s\S]*grid-template-columns:\s*auto auto minmax\(0, 1fr\)/);
    expect(cssSource).toMatch(/\.label-drug-checkbox input\s*\{[\s\S]*width:\s*18px;/);
  });

  it("visually separates the select-all row from individual drug rows", () => {
    expect(cssSource).toMatch(/\.label-drug-select-all\s*\{[\s\S]*position:\s*sticky;/);
    expect(cssSource).toMatch(/\.label-drug-select-all\s*\{[\s\S]*background:\s*#fbfaf9;/);
  });

  it("routes narcotic labels to hospital controlled common names", () => {
    expect(appSource).toContain('if (labelMode === "narcotic") return hospitalControlledLabelRows;');
    expect(appSource).toContain("stripHospitalDrugControlledPrefix(row.name)");
    expect(appSource).toContain("makeHospitalControlledDrugLabelId(row)");
  });

  it("routes hospital label buttons by workbook drug type while keeping E-cart on E-cart inventory", () => {
    expect(appSource).toContain("function usesHospitalDrugListForMode(mode: DrugLabelMode)");
    expect(appSource).toContain("const hospitalStockDrugRows = useMemo(() => hospitalDrugSelectableRows.filter(isHospitalGeneralDrugLabelType),");
    expect(appSource).toContain("const hospitalStockSearchRows = useMemo(() => {");
    expect(appSource).toMatch(/const hospitalStockSearchRows = useMemo\(\(\) => \{[\s\S]*?return rows;\r?\n  \}, \[hospitalStockDrugRows, labelQuery\]\);/);
    expect(appSource).toContain('const hospitalFluidDrugRows = useMemo(() => hospitalDrugSelectableRows.filter((row) => isHospitalDrugType(row, "일반수액")),');
    expect(appSource).toContain("isHospitalControlledDrugType(row)");
    expect(appSource).toContain('if (labelMode === "stock") return hospitalStockLabelRows;');
    expect(appSource).toContain('if (labelMode === "fluid") return hospitalFluidLabelRows;');
    expect(appSource).toContain('if (labelMode === "narcotic") return hospitalControlledLabelRows;');
    expect(appSource).toContain("if (isEcartLabelKind(labelMode)) return filteredEcartLabelRows;");
    expect(appSource).toContain('return getEcartLabelItemsForMode("ecart", inventory.ecart)');
    expect(appSource).toContain('return getEcartLabelItemsForMode("ecart-nicu", inventory.ecart)');
    expect(appSource).toContain('.filter((item) => !deletedPharmacyDrugCodeSet.has(item.code.trim().toUpperCase()))');
  });

  it("uses the matched general-fluid color for E-cart label drug names", () => {
    expect(appSource).toContain('hospitalRow?.drugType === "일반수액" ? hospitalRow.fluidColor : undefined');
    expect(appSource).toContain('isEcartLabelKind(selection.mode) && fallbackRow');
    expect(appSource).toContain('const fluidTone = row.fluidTone;');
  });

  it("uses dose confirmation wording on 40x70 narcotic labels", () => {
    expect(appSource).toContain('const FORTY_NARCOTIC_DOSE_CONFIRM_LABEL = "\\uc6a9\\ub7c9\\ud655\\uc778";');
    expect(appSource).toContain("FORTY_NARCOTIC_DOSE_CONFIRM_LABEL");
    expect(appSource).toContain("row.doseCaution || row.doseCheck ? FORTY_NARCOTIC_DOSE_CONFIRM_LABEL");
    expect(appSource).toContain('labelCodeStorageBadges(row).find((badge) => badge.tone === "cold")');
  });

  it("keeps compact general light-protected labels green unless red-priority warnings take over", () => {
    expect(appSource).toContain("function shouldMoveLightProtectionToCodeBadge(row: DrugLabelData, sizeKey?: DrugLabelSizeKey)");
    expect(appSource).toContain('return (sizeKey === "10x70" || sizeKey === "15x95") && hasRedPriorityLabel(row);');
    expect(appSource).toContain('hasRedPriority ? "has-red-priority-label" : ""');
    expect(cssSource).toContain(
      ".drug-label-item.label-size-10x70:is(.label-kind-stock, .label-kind-pharmacy).light-protected-label:not(.has-red-priority-label) .drug-label-warning-flag",
    );
    expect(cssSource).toContain(
      ".drug-label-item.label-size-15x95:is(.label-kind-stock, .label-kind-pharmacy).light-protected-label:not(.has-red-priority-label) .drug-label-warning-flag",
    );
    expect(cssSource).toContain(".drug-label-code-stack .label-code-storage.light");
  });

  it("positions the mandatory dilution phrase at the right or bottom by label size", () => {
    expect(appSource).toContain('["10x70", "15x95", "55x95", "35x100"].includes(sizeKey)');
    expect(appSource).toContain('className="drug-label-mandatory-dilution"');
    expect(cssSource).toContain(
      ".drug-label-item.has-positioned-mandatory-dilution:is(.label-size-10x70, .label-size-15x95) .drug-label-mandatory-dilution",
    );
    expect(cssSource).toContain(
      ".drug-label-item.has-positioned-mandatory-dilution:is(.label-size-55x95, .label-size-35x100) .drug-label-mandatory-dilution",
    );
    expect(cssSource).toMatch(/\.drug-label-item\.has-positioned-mandatory-dilution[\s\S]*color:\s*#dc2626;[\s\S]*font-weight:\s*1000;/);
  });

  it("applies hospital label rules and readable 10x70 names to checked master labels", () => {
    expect(appSource).toContain("const hospitalDrugRowsByCode = useMemo(");
    expect(appSource).toContain("function buildMasterDrugLabelData(row: MasterRow, mode: DrugLabelMode, roomId?: string)");
    expect(appSource).toContain("hospitalDrugRowsByCode.get(row.code.toUpperCase())");
    expect(appSource).toContain("hospitalControlledDoseCautionCodes.has(hospitalRow.code)");
    expect(appSource).toContain("const selectionMode = row.masterKind === \"stock\" ? mode : \"narcotic\";");
    expect(appSource).toContain("[\"10x70\", \"15x95\"].includes(labelSize) ? labelSize : \"40x70\"");
    expect(appSource).toContain("const roomQuantity = activeMasterLabelRoomIds");
    expect(appSource).toContain("quantityOverride: roomQuantity ?? labelRow.totalQuantity ?? row.totalQuantity");
    expect(appSource).toContain('renderedKind === "stock" && (sizeKey === "10x70" || sizeKey === "15x95"');
    expect(cssSource).toContain(
      ".drug-label-item.label-size-10x70:is(.label-kind-stock, .label-kind-pharmacy) .drug-label-name-lines",
    );
    expect(cssSource).toContain(
      ".drug-label-item.label-size-15x95:is(.label-kind-stock, .label-kind-pharmacy) .drug-label-name-lines",
    );
  });

  it("keeps quantities and readable names on compact checked-master narcotic labels", () => {
    expect(appSource).toContain("renderedKind === \"narcotic\" && isCheckedMasterPrint");
    expect(appSource).toContain("renderDrugLabelName(row, renderedKind, sizeKey, entry.isCheckedMasterPrint)");
    expect(cssSource).toContain(
      ".drug-label-item.checked-master-label:is(.label-size-10x70, .label-size-15x95).label-kind-narcotic .label-quantity-circle",
    );
    expect(cssSource).toContain(
      ".drug-label-item.checked-master-label:is(.label-size-10x70, .label-size-15x95).label-kind-narcotic .label-code-storage",
    );
    expect(cssSource).toContain("grid-template-columns: 17mm minmax(0, 1fr) 20mm;");
    expect(cssSource).toContain("grid-template-columns: 22mm minmax(0, 1fr) 25mm;");
    expect(cssSource).toContain("min-width: 6.5mm;");
    expect(cssSource).toContain("min-width: 8mm;");
    expect(cssSource).toContain("font-size: 13px;");
    expect(cssSource).toContain("font-size: 16px;");
    expect(cssSource).toContain(
      ".drug-label-item.checked-master-label:is(.label-size-10x70, .label-size-15x95).label-kind-narcotic:not(:has(.label-code-storage)) .label-quantity-circle",
    );
  });

  it("prints light protection in the 40x70 controlled-drug footer", () => {
    expect(appSource).toContain('isLightProtectedLabel(row) ? "차광" : ""');
    expect(appSource).toContain("function renderNarcoticFortyFooter(row: DrugLabelData)");
    expect(cssSource).toContain(".label-kind-stock, .label-kind-pharmacy, .label-kind-narcotic");
  });
});
