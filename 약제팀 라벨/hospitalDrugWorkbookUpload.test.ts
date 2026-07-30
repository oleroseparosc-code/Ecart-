import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isHospitalDrugWorkbookFileName,
  mergeHospitalDrugRowsIntoPharmacyLabelMatches,
  parseHospitalDrugWorkbook,
} from "./hospitalDrugWorkbookUpload";

describe("hospital drug workbook upload", () => {
  it("accepts only the 원내보유의약품리스트 workbook name", () => {
    expect(isHospitalDrugWorkbookFileName("원내보유의약품리스트.xlsx")).toBe(true);
    expect(isHospitalDrugWorkbookFileName("원내보유의약품리스트.xlsm")).toBe(true);
    expect(isHospitalDrugWorkbookFileName("원내보유의약품리스트_약품 라벨 준비용.xlsx")).toBe(false);
    expect(isHospitalDrugWorkbookFileName("고위험의약품리스트.xlsx")).toBe(false);
  });

  it("parses the uploaded hospital drug workbook into label rows", async () => {
    const workbook = readFileSync(new URL("./원내보유의약품리스트.xlsx", import.meta.url));
    const rows = await parseHospitalDrugWorkbook(workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength));
    const abilify = rows.find((row) => row.code === "XXARPIP72");
    const lantusVial = rows.find((row) => row.code === "XIGLY10");
    const doseCheckRow = rows.find((row) => row.doseCheck && !row.doseCaution);

    expect(rows.length).toBeGreaterThan(2700);
    expect(abilify?.name).toBe("Abilify asimtufii 720mg inj");
    expect(abilify?.koreanName).toContain("아빌리파이");
    expect(abilify?.lightProtected).toBe(true);
    expect(lantusVial?.highRisk).toBe(true);
    expect(lantusVial?.storage).toBe("냉장");
    expect(doseCheckRow?.doseCheck).toBe(true);
    expect(rows.find((row) => row.code === "XAQD")?.drugType).toBe("일반수액");
    expect(rows.find((row) => row.code === "XLID2W")).toMatchObject({ eCart: true, eCartNicu: true });
    expect(rows.filter((row) => row.eCart)).toHaveLength(19);
    expect(rows.filter((row) => row.eCartNicu)).toHaveLength(29);
    expect(rows.some((row) => row.narcotic)).toBe(true);
    expect(rows.some((row) => row.psychotropic)).toBe(true);
  });

  it("updates the pharmacy label list while preserving existing match details by drug code", () => {
    const rows = mergeHospitalDrugRowsIntoPharmacyLabelMatches(
      [
        {
          code: "A.01W-T",
          name: "Atropine oph 0.01% 5mL",
          koreanName: "아트로핀",
          strength: "0.01%",
          drugType: "외용점안제",
          spec: "5mL",
          package: "",
          storage: "차광",
          lightProtected: true,
          highRisk: false,
          inHospital: true,
          similarLook: false,
          similarSound: false,
          doseCaution: false,
          doseCheck: false,
        },
      ],
      [
        {
          code: "A.01W-T",
          englishName: "old",
          koreanName: "",
          strength: "",
          spec: "",
          package: "",
          storage: "",
          lightProtected: false,
          refrigerated: false,
          doseCaution: false,
          doseCheck: false,
          similarSound: false,
          similarLook: false,
          highRisk: false,
          highCaution: false,
          anticancer: false,
          narcotic: false,
          psychotropic: false,
          highCost: false,
          nameCaution: false,
          matchedLabel: "Atropine 아트로핀",
          sourceFile: "라벨.xlsx",
          sourceLocation: "Sheet1!A1",
          matchStatus: "확정",
          matchScore: 100,
          matchReason: "기존 매칭",
          conditionSource: "차광:기존",
          reviewMemo: "확인",
        },
      ],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      code: "A.01W-T",
      englishName: "Atropine oph 0.01% 5mL",
      matchedLabel: "Atropine 아트로핀",
      sourceFile: "라벨.xlsx",
      matchStatus: "확정",
      lightProtected: true,
    });
  });

  it("uses hospital drug names and workbook warning columns when rebuilding pharmacy label rows", () => {
    const rows = mergeHospitalDrugRowsIntoPharmacyLabelMatches(
      [
        {
          code: "XESME",
          name: "Esmeron 50mg/5ml inj",
          koreanName: "에스메론주 50mg/5ml",
          strength: "50 mg",
          drugType: "바이알",
          spec: "5 ml",
          package: "1 via",
          storage: "냉장",
          lightProtected: true,
          highRisk: true,
          inHospital: true,
          similarLook: true,
          similarSound: true,
          doseCaution: true,
          doseCheck: true,
        },
      ],
      [],
    );

    expect(rows[0]).toMatchObject({
      englishName: "Esmeron 50mg/5ml inj",
      refrigerated: true,
      lightProtected: true,
      similarLook: true,
      similarSound: true,
      doseCaution: true,
      doseCheck: true,
      highRisk: true,
    });
  });
});
