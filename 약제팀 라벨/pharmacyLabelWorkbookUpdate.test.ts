import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { saveHospitalDrugMasterRowToWorkbook } from "./pharmacyLabelWorkbookUpdate";

const source = readFileSync(new URL("./pharmacyLabelWorkbookUpdate.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

describe("pharmacy label workbook update", () => {
  it("updates the existing workbook row when its drug code and name change", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["약품코드", "상용약품명", "한글약품명", "함량", "약품유형", "원내보유"],
      ["OLD-CODE", "Old drug name", "기존약품", "1 g", "영양수액", "Y"],
    ]), "약품조회");
    const sourceData = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    let savedData: ArrayBuffer | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") {
        savedData = await new Response(init.body).arrayBuffer();
        return new Response(null, { status: 200 });
      }
      return new Response(sourceData, {
        status: 200,
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    });
    const changedRow = {
      code: "NEW-CODE",
      itemCode: "ITEM-1",
      name: "Acetphen 5g/50ml premix",
      koreanName: "아세트펜주",
      strength: "5 g/50 ml",
      drugType: "영양수액",
      spec: "5 g/50 ml",
      package: "",
      storage: "실온",
      lightProtected: false,
      inHospital: true,
      similarLook: false,
      similarSound: false,
      doseCaution: false,
      doseCheck: true,
      highRisk: false,
    } satisfies HospitalDrugLabelRow;

    try {
      await expect(saveHospitalDrugMasterRowToWorkbook(changedRow, "/source.xlsx", "OLD-CODE")).resolves.toBe("server");
      const savedWorkbook = XLSX.read(savedData, { type: "array" });
      const savedRows = XLSX.utils.sheet_to_json<unknown[]>(savedWorkbook.Sheets.약품조회, { header: 1, raw: true });
      expect(savedRows[1]?.slice(0, 5)).toEqual(["NEW-CODE", "Acetphen 5g/50ml premix", "아세트펜주", "5 g/50 ml", "영양수액"]);
      expect(savedRows).toHaveLength(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("writes edited warnings and border settings while preventing local file fallback on the published viewer", () => {
    expect(source).toContain('이름주의: "이름주의"');
    expect(source).toContain('"테두리 색기호": draft.style.outerBorderColor');
    expect(source).toContain('draft.style.outerBorderPx >= 5 ? "Y" : "N"');
    expect(source).toContain("showSaveFilePicker");
    expect(source).toContain("createWritable");
    expect(source).toContain('XLSX.writeFile(workbook, "원내보유의약품리스트.xlsx"');
    expect(source).toContain('window.location.hostname.endsWith(".github.io")');
    expect(source).toContain("클라우드 저장에 실패했습니다.");
  });

  it("updates the current app row and local final-label repository after workbook save", () => {
    expect(appSource).toContain("savePharmacyLabelDraftToWorkbook");
    expect(appSource).toContain("savePharmacyLabelToStorage");
    expect(appSource).toContain("nameCaution: draft.warnings.includes");
    expect(appSource).toContain("borderColor: draft.style.outerBorderColor");
  });

  it("writes shared master flags and pharmacy-only label settings to workbook columns", () => {
    expect(source).toContain("saveHospitalDrugMasterRowToWorkbook");
    expect(source).toContain("originalCode = row.code");
    expect(source).toContain("compact(originalCode)");
    expect(source).toContain('"E-cart(NICU)"');
    expect(source).toContain('"유색병뚜껑"');
    expect(source).toContain('"정제용량 0.25T"');
    expect(source).toContain('"1T 3단장 뺑뺑이 PTP 측면라벨"');
    expect(source).toContain('고위험의약품분류: row.highRiskCategory ?? ""');
    expect(source).toContain('용량확인: yes(row.doseCheck)');
    expect(appSource).toContain("savePharmacyDrugMaster");
    expect(appSource).toContain("saveHospitalDrugMasterRowToWorkbook(row, hospitalDrugWorkbookUrl, originalCode)");
    expect(appSource).toContain("originalCodeKey");
    expect(appSource).toContain("applySharedPharmacyMasterFields");
    expect(appSource).toContain("applySharedMasterToStockDrug");
    expect(appSource).toContain("effectiveStockDrugs");
    expect(appSource).toContain("effectiveNarcoticDrugs");
    expect(appSource).toContain("onSaveMaster={savePharmacyDrugMaster}");
    expect(appSource).toContain("setPharmacyAdditionalRows((previous) => mergePharmacyRows(");
    expect(appSource).toContain("previous.filter((current) => current.code.toUpperCase() !== originalCodeKey)");
    expect(appSource).toContain("hospitalDrugRowsByCode.get(row.code.toUpperCase()) ?? pharmacyHospitalDrugRowsByCode.get(row.code.toUpperCase())");
    expect(appSource).not.toContain("if (!existed) setPharmacyAdditionalRows");
  });
});
