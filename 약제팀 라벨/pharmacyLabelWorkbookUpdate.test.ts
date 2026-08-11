import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import {
  deleteHospitalDrugMasterRowFromWorkbook,
  deleteHospitalDrugMasterRowsFromWorkbook,
  saveHospitalDrugMasterRowToWorkbook,
  saveHospitalDrugMasterRowsToWorkbook,
  loadSavedPharmacyLabelsFromWorkbook,
} from "./pharmacyLabelWorkbookUpdate";

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
      location: "A-3",
      pharmacyLabelTypes: ["영양수액", "냉장주사"],
      hazardous: true,
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
      const headers = savedRows[0] as string[];
      expect(savedRows[1]?.[headers.indexOf("위치")]).toBe("A-3");
      expect(savedRows[1]?.[headers.indexOf("약제팀 라벨 세부유형")]).toBe("영양수액, 냉장주사");
      expect(savedRows[1]?.[headers.indexOf("위해의약품")]).toBe("Y");
      expect(savedRows).toHaveLength(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("deletes the matching drug-code row from the workbook", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["약품코드", "상용약품명", "원내보유"],
      ["KEEP-1", "Keep first", "Y"],
      ["DELETE-ME", "Retired drug", "Y"],
      ["KEEP-2", "Keep last", "Y"],
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

    try {
      await expect(deleteHospitalDrugMasterRowFromWorkbook("DELETE-ME", "/source.xlsx")).resolves.toBe("server");
      const savedWorkbook = XLSX.read(savedData, { type: "array" });
      const savedRows = XLSX.utils.sheet_to_json<unknown[]>(savedWorkbook.Sheets.약품조회, { header: 1, raw: true });
      expect(savedRows).toEqual([
        ["약품코드", "상용약품명", "원내보유"],
        ["KEEP-1", "Keep first", "Y"],
        ["KEEP-2", "Keep last", "Y"],
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("registers and deletes multiple master rows with one workbook save per batch", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["약품코드", "물품코드", "상용약품명", "한글약품명", "함량", "약품유형", "원내보유"],
      ["EXISTING", "ITEM-0", "Existing", "기존", "1mg", "원병", "Y"],
    ]), "약품조회");
    let currentData = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    let putCount = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.method === "PUT") {
        currentData = await new Response(init.body).arrayBuffer();
        putCount += 1;
        return new Response(null, { status: 200 });
      }
      return new Response(currentData, {
        status: 200,
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    });
    const makeRow = (code: string, name: string): HospitalDrugLabelRow => ({
      code, itemCode: `${code}-ITEM`, name, koreanName: `${name}한글`, strength: "10mg", drugType: "원병",
      spec: "10mg", package: "", storage: "실온", lightProtected: false, inHospital: true,
      similarLook: false, similarSound: false, doseCaution: false, doseCheck: false, highRisk: false,
    });

    try {
      await expect(saveHospitalDrugMasterRowsToWorkbook([
        makeRow("BULK-1", "Bulk one"),
        makeRow("BULK-2", "Bulk two"),
      ], "/source.xlsx")).resolves.toBe("server");
      expect(putCount).toBe(1);

      const deletion = await deleteHospitalDrugMasterRowsFromWorkbook(["BULK-1", "BULK-2", "ALREADY-GONE"], "/source.xlsx");
      expect(deletion).toEqual({ deletedCount: 2, missingCodes: ["ALREADY-GONE"], saveMode: "server" });
      expect(putCount).toBe(2);
      const savedWorkbook = XLSX.read(currentData, { type: "array" });
      const savedRows = XLSX.utils.sheet_to_json<unknown[]>(savedWorkbook.Sheets.약품조회, { header: 1, raw: true });
      expect(savedRows.map((row) => row[0])).toEqual(["약품코드", "EXISTING"]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("writes edited warnings and border settings while preventing local file fallback on the published viewer", () => {
    expect(source).toContain('이름주의: "이름주의"');
    expect(source).toContain('"테두리 색기호": draft.style.outerBorderColor');
    expect(source).toContain('const FINAL_LABEL_SIZE_HEADER = "최종 라벨 크기"');
    expect(source).toContain('[FINAL_LABEL_SIZE_HEADER]: `${draft.size.heightMm} × ${draft.size.widthMm} mm`');
    expect(source).toContain('draft.style.outerBorderPx > 0 ? "Y" : "N"');
    expect(source).toContain('[LABEL_SETTINGS_HEADER]: JSON.stringify');
    expect(source).toContain('FINAL_LABEL_SETTINGS_HEADER');
    expect(source).toContain('version: 1');
    expect(source).toContain("loadSavedPharmacyLabelsFromWorkbook");
    expect(source).toContain("savedAt: draft.savedAt");
    expect(source).toContain("최종 라벨 설정이 엑셀에 확인되지 않았습니다");
    expect(source).toContain("JSON.stringify(saved.titleStyles ?? [])");
    expect(source).toContain("JSON.stringify(saved.size) !== JSON.stringify(draft.size)");
    expect(source).toContain("showSaveFilePicker");
    expect(source).toContain("createWritable");
    expect(source).toContain('XLSX.writeFile(workbook, "원내보유의약품리스트.xlsx"');
    expect(source).toContain('window.location.hostname.endsWith(".github.io")');
    expect(source).toContain("클라우드 저장에 실패했습니다.");
  });

  it("restores saved border and partial-title settings from the workbook", async () => {
    const settings = {
      labelFamily: "drug",
      category: "PTP",
      size: { presetKey: "40x80", widthMm: 80, heightMm: 40 },
      printable: { title: "Test", koreanName: "테스트", strength: "10mg", warning: "", topBanner: "", footer: { enabled: false, text: "" }, reconstitution: "" },
      style: { outerBorderPx: 0.5, outerBorderColor: "#ff69b4", textOutlinePx: 0, textOutlineColor: "#ffffff", fontFamily: "sans-serif", fontSizePt: 18, fontColor: "#111827", warningColor: "#d92d20" },
      titleStyles: [{ start: 0, end: 4, color: "#ff0000" }],
      savedAt: "2026-08-10T10:00:00.000Z",
    };
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["약품코드", "약제팀 라벨 설정"],
      ["RESTORE-1", JSON.stringify(settings)],
    ]), "약품조회");
    const sourceData = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(sourceData, {
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    }));
    try {
      const restored = await loadSavedPharmacyLabelsFromWorkbook("/source.xlsx");
      expect(restored[0]?.style.outerBorderColor).toBe("#ff69b4");
      expect(restored[0]?.titleStyles?.[0]?.color).toBe("#ff0000");
      expect(restored[0]?.size).toEqual(settings.size);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("updates the current app row and local final-label repository after workbook save", () => {
    expect(appSource).toContain("savePharmacyLabelDraftsToWorkbook");
    expect(appSource).toContain("writeSavedPharmacyLabelsToStorage");
    expect(appSource).toContain("pharmacyRowFromDraft(draft)");
    expect(appSource).toContain("setPharmacyAdditionalRows");
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
