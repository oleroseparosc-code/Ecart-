import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./pharmacyLabelWorkbookUpdate.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("pharmacy label workbook update", () => {
  it("writes edited warnings and border settings to a downloaded hospital workbook", () => {
    expect(source).toContain('이름주의: "이름주의"');
    expect(source).toContain('"테두리 색기호": draft.style.outerBorderColor');
    expect(source).toContain('draft.style.outerBorderPx >= 5 ? "Y" : "N"');
    expect(source).toContain("showSaveFilePicker");
    expect(source).toContain("createWritable");
    expect(source).toContain('XLSX.writeFile(workbook, "원내보유의약품리스트.xlsx"');
  });

  it("updates the current app row and local final-label repository after workbook save", () => {
    expect(appSource).toContain("savePharmacyLabelDraftToWorkbook");
    expect(appSource).toContain("savePharmacyLabelToStorage");
    expect(appSource).toContain("nameCaution: draft.warnings.includes");
    expect(appSource).toContain("borderColor: draft.style.outerBorderColor");
  });

  it("writes shared master flags and pharmacy-only label settings to workbook columns", () => {
    expect(source).toContain("saveHospitalDrugMasterRowToWorkbook");
    expect(source).toContain('"E-cart(NICU)"');
    expect(source).toContain('"유색병뚜껑"');
    expect(source).toContain('"정제용량 0.25T"');
    expect(source).toContain('"1T 3단장 뺑뺑이 PTP 측면라벨"');
    expect(source).toContain('고위험의약품분류: row.highRiskCategory ?? ""');
    expect(appSource).toContain("savePharmacyDrugMaster");
    expect(appSource).toContain("applySharedPharmacyMasterFields");
    expect(appSource).toContain("applySharedMasterToStockDrug");
    expect(appSource).toContain("effectiveStockDrugs");
    expect(appSource).toContain("effectiveNarcoticDrugs");
    expect(appSource).toContain("onSaveMaster={savePharmacyDrugMaster}");
  });
});
