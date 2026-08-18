import { describe, expect, it } from "vitest";
import {
  A4_PAPER,
  DRUG_CATEGORIES,
  categoryForGroupedRow,
  createPharmacyLabelDraft,
  formatPharmacyExpiry,
  groupPharmacyLabelsForPaper,
  mergeDoseHighlightStyles,
  planPharmacyLabelsForPaper,
  rowMatchesCategory,
  rowMatchesCategoryGroup,
  resolvePharmacyLabelDraft,
  savePharmacyLabelDraft,
  sizesForCategory,
  splitDoseText,
  splitNutritionDoseParts,
  splitNutritionDoseText,
  splitStyledPharmacyTitle,
  threeTierDoseUnitsForCategory,
} from "./pharmacyLabelStudio";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { buildCabinetLocationDraft } from "./pharmacyCabinetLabels";

const row: HospitalDrugLabelRow = {
  code: "XTEST",
  itemCode: "8800000000000",
  name: "Test drug 10mg inj",
  koreanName: "테스트주",
  strength: "10 mg",
  drugType: "바이알",
  highCost: false,
  spec: "1 via",
  package: "1 via",
  storage: "냉장",
  lightProtected: true,
  inHospital: true,
  oralAnticancer: false,
  similarLook: false,
  similarSound: false,
  doseCaution: true,
  doseCheck: false,
  highRisk: true,
  highRiskCategory: "고농도 전해질",
  atc: "",
  nameCaution: false,
  border: true,
  borderColor: "#d92d20",
};

describe("pharmacy label studio rules", () => {
  it("formats Excel expiry serial numbers as calendar dates", () => {
    expect(formatPharmacyExpiry("47046")).toBe("2028-10-20");
    expect(formatPharmacyExpiry("2027-01-31 00:00:00")).toBe("2027-01-31");
  });

  it("filters by workbook drug type", () => {
    expect(rowMatchesCategory(row, "바이알")).toBe(true);
    expect(rowMatchesCategory(row, "PTP")).toBe(false);
    expect(rowMatchesCategory({ ...row, code: "XACETATE", drugType: "제로관리약", storage: "실온" }, "냉장주사")).toBe(true);
    expect(rowMatchesCategory({ ...row, code: "XVACCINE", drugType: "백신", storage: "냉장" }, "냉장주사", "주사", "cabinet")).toBe(true);
    const vaccine = { ...row, code: "XVACCINE", drugType: "백신", storage: "냉장", pharmacyLabelTypes: [] };
    expect(rowMatchesCategory(vaccine, "백신")).toBe(true);
    expect(rowMatchesCategory(vaccine, "냉장주사")).toBe(true);
    expect(DRUG_CATEGORIES[2]).toContain("백신");
  });

  it("uses independently checked pharmacy label subtypes for drug and cabinet lists", () => {
    const multiType = { ...row, drugType: "원병", pharmacyLabelTypes: ["원병", "PTP", "ATC"] };
    expect(rowMatchesCategory(multiType, "원병", "주사", "cabinet")).toBe(true);
    expect(rowMatchesCategory(multiType, "PTP", "주사", "cabinet")).toBe(true);
    expect(rowMatchesCategory(multiType, "ATC", "주사", "cabinet")).toBe(true);
    expect(rowMatchesCategory({ ...multiType, pharmacyLabelTypes: [] }, "원병", "주사", "cabinet")).toBe(false);
  });

  it("splits high-cost drugs into injection and oral choices", () => {
    expect(rowMatchesCategory({ ...row, highCost: true }, "고가약", "주사")).toBe(true);
    expect(rowMatchesCategory({ ...row, highCost: true }, "고가약", "경구")).toBe(false);
    expect(rowMatchesCategory({ ...row, highCost: true, drugType: "원병" }, "고가약", "경구")).toBe(true);
    expect(rowMatchesCategory({ ...row, highCost: true, drugType: "원병" }, "경구 고가약", "주사", "cabinet")).toBe(true);
    expect(rowMatchesCategory({ ...row, highCost: true, drugType: "바이알" }, "경구 고가약", "주사", "cabinet")).toBe(false);
  });

  it("uses the workbook ampoule-holder flag as the default ampoule label accessory", () => {
    expect(createPharmacyLabelDraft({ ...row, drugType: "앰플", ampouleHolder: "Y" }, "앰플", "drug").accessory).toBe("앰플꽂이");
    expect(createPharmacyLabelDraft({ ...row, drugType: "앰플", ampouleHolder: "N" }, "앰플", "drug").accessory).toBeUndefined();
  });

  it("applies the workbook ampoule-holder flag to existing saved ampoule labels", () => {
    const saved = savePharmacyLabelDraft({
      ...createPharmacyLabelDraft({ ...row, drugType: "앰플", ampouleHolder: "N" }, "앰플", "drug"),
      accessory: undefined,
    });
    expect(resolvePharmacyLabelDraft({ ...row, drugType: "앰플", ampouleHolder: "Y" }, [saved], "앰플", "drug").accessory).toBe("앰플꽂이");
  });

  it("combines original-bottle and PTP rows for colored and side-label cabinet categories", () => {
    const original = { ...row, drugType: "원병", coloredSideLabel: "Y", sideLabel: true, sideLabelHalfT: "Y", sideLabelQuarterT: "Y" };
    const ptp = { ...row, drugType: "PTP", sideLabel: true, sideLabel1T: "Y" };
    const coloredWithoutSplitDose = { ...row, drugType: "원병", coloredSideLabel: "Y" };
    expect(threeTierDoseUnitsForCategory(original, "유색라벨")).toEqual(["0.5T", "0.25T"]);
    expect(threeTierDoseUnitsForCategory(original, "측면라벨")).toEqual(["0.5T", "0.25T"]);
    expect(threeTierDoseUnitsForCategory(ptp, "측면라벨")).toEqual(["1T"]);
    expect(threeTierDoseUnitsForCategory(coloredWithoutSplitDose, "유색라벨")).toEqual(["1T"]);
    expect(threeTierDoseUnitsForCategory({ ...ptp, sideLabel1T: "", labelDose1T: true }, "측면라벨")).toEqual([]);
    expect(rowMatchesCategory(original, "유색라벨", "경구", "cabinet")).toBe(true);
    expect(rowMatchesCategory(ptp, "측면라벨", "경구", "cabinet")).toBe(true);
  });

  it("keeps high-cost drugs in dosage-form lists while prioritizing grouped high-cost labels", () => {
    const highCostSyrup = { ...row, drugType: "시럽", highCost: true };
    expect(rowMatchesCategory(highCostSyrup, "시럽", "경구", "drug")).toBe(true);
    expect(rowMatchesCategory(highCostSyrup, "시럽", "경구", "cabinet")).toBe(true);
    expect(rowMatchesCategory(highCostSyrup, "고가약", "경구", "drug")).toBe(true);
    expect(rowMatchesCategoryGroup(highCostSyrup, "외용", "drug")).toBe(true);
    expect(categoryForGroupedRow(highCostSyrup, "외용", "drug")).toBe("고가약");
    expect(rowMatchesCategory({ ...row, drugType: "PTP", highCost: true }, "PTP", "경구", "cabinet")).toBe(true);
  });

  it("limits bordered vial labels to bordered sizes", () => {
    expect(sizesForCategory("바이알", row).every((size) => size.heightMm > 40)).toBe(true);
  });

  it("uses 43×80mm for vial labels and upgrades legacy vial sizes", () => {
    expect(sizesForCategory("바이알", { ...row, border: false }).map((size) => size.presetKey)).toEqual(["43x80", "47x80", "52x80", "47x90"]);
    for (const legacySize of [
      { presetKey: "40x80", widthMm: 80, heightMm: 40 },
      { presetKey: "42x80", widthMm: 80, heightMm: 42 },
    ]) {
      const saved = savePharmacyLabelDraft({ ...createPharmacyLabelDraft(row, "바이알", "drug"), size: legacySize });
      expect(resolvePharmacyLabelDraft(row, [saved], "바이알", "drug").size).toEqual({ presetKey: "43x80", widthMm: 80, heightMm: 43 });
    }
  });

  it("uses corrected high-cost label sizes and upgrades saved sizes", () => {
    expect(sizesForCategory("고가약", row).map((size) => size.presetKey)).toEqual(["43x80", "50x80"]);
    for (const [legacySize, expectedSize] of [
      [{ presetKey: "40x80", widthMm: 80, heightMm: 40 }, { presetKey: "43x80", widthMm: 80, heightMm: 43 }],
      [{ presetKey: "55x80", widthMm: 80, heightMm: 55 }, { presetKey: "50x80", widthMm: 80, heightMm: 50 }],
    ]) {
      const saved = savePharmacyLabelDraft({ ...createPharmacyLabelDraft({ ...row, highCost: true }, "고가약", "drug"), size: legacySize });
      expect(resolvePharmacyLabelDraft({ ...row, highCost: true }, [saved], "고가약", "drug").size).toEqual(expectedSize);
    }
  });

  it("uses corrected side and cap dimensions", () => {
    expect(sizesForCategory("원병", row).map((size) => size.presetKey)).toEqual(
      expect.arrayContaining(["23x102", "10x27", "15x30"]),
    );
  });

  it("provides both syrup label dimensions", () => {
    expect(sizesForCategory("시럽", row).map((size) => size.presetKey)).toEqual(["48x94", "15x90"]);
  });

  it("splits selected common-name text into independently styled segments", () => {
    expect(splitStyledPharmacyTitle("Propess vaginal", [{ start: 0, end: 7, color: "#ff0000", fontWeight: 1000, textTransform: "uppercase" }])).toEqual([
      { text: "PROPESS", style: expect.objectContaining({ color: "#ff0000", fontWeight: 1000, textTransform: "uppercase" }) },
      { text: " vaginal", style: undefined },
    ]);
  });

  it("keeps partial title formatting while applying a dose-warning highlight", () => {
    const styles = mergeDoseHighlightStyles("Test 20mg inj", [{ start: 0, end: 13, fontSizePt: 30, color: "#155eef", backgroundColor: "#dcfce7" }], true);
    const dose = splitStyledPharmacyTitle("Test 20mg inj", styles).find((part) => part.text === "20");
    expect(dose?.style).toEqual(expect.objectContaining({ fontSizePt: 30, color: "#d92d20", backgroundColor: "#fff200" }));
  });

  it("highlights only the numeric dose inside the common name", () => {
    expect(splitDoseText("Synagis 100mg/ml inj")).toEqual({
      before: "Synagis ",
      dose: "100",
      after: "mg/ml inj",
    });
  });

  it("highlights the final nutrition-fluid volume and adds the designated Ntense dose check", () => {
    expect(splitNutritionDoseText("SMOFlipid 20% 500ml inj")).toEqual({
      before: "SMOFlipid 20% ",
      dose: "500",
      after: "ml inj",
    });
    const ntense = createPharmacyLabelDraft({
      ...row,
      name: "Ntense central 1518mL inj",
      drugType: "영양수액",
      doseCaution: false,
      doseCheck: false,
    }, "영양수액", "drug");
    expect(ntense.warnings).toContain("용량확인");
  });

  it("highlights every concentration and volume number in Citopcin nutrition labels", () => {
    expect(splitNutritionDoseParts("CITOPCIN 400mg/200ml inj").filter((part) => part.highlighted).map((part) => part.text)).toEqual(["400", "200"]);
    expect(splitNutritionDoseParts("Citopcin 200mg/100ml inj").filter((part) => part.highlighted).map((part) => part.text)).toEqual(["200", "100"]);
  });

  it("refreshes workbook-only image and expiry while keeping saved right-panel values", () => {
    const saved = savePharmacyLabelDraft({
      ...createPharmacyLabelDraft(row, "바이알", "drug"),
      imagePath: "old.png",
      itemCode: "EDITED-ITEM",
      location: "EDITED-LOCATION",
      atc: "EDITED-ATC",
      expiry: "2025-01-01",
      size: { presetKey: "47x80", widthMm: 80, heightMm: 47 },
      doseUnit: "0.5T",
      accessory: "측면라벨",
      titleStyles: [{ start: 0, end: 4, fontSizePt: 31, color: "#22c55e" }],
      style: {
        ...createPharmacyLabelDraft(row, "바이알", "drug").style,
        outerBorderPx: 0,
        outerBorderColor: "#22c55e",
      },
    });
    const resolved = resolvePharmacyLabelDraft({
      ...row,
      itemCode: "WORKBOOK-ITEM",
      location: "WORKBOOK-LOCATION",
      imagePath: "pharmacy-drug-images/new.png",
      imageSourceUrl: "https://www.health.kr/new",
      atc: "191",
      expiry: "2027-12-31",
    }, [saved], "바이알", "drug");
    expect(resolved.imagePath).toBe("pharmacy-drug-images/new.png");
    expect(resolved.expiry).toBe("2027-12-31");
    expect(resolved.itemCode).toBe("EDITED-ITEM");
    expect(resolved.location).toBe("EDITED-LOCATION");
    expect(resolved.atc).toBe("EDITED-ATC");
    expect(resolved.size).toEqual(saved.size);
    expect(resolved.doseUnit).toBe("0.5T");
    expect(resolved.accessory).toBe("측면라벨");
    expect(resolved.titleStyles).toEqual(saved.titleStyles);
    expect(resolved.style.outerBorderPx).toBe(0);
    expect(resolved.style.outerBorderColor).toBe("#22c55e");
  });

  it("keeps manually saved border colors as the final default", () => {
    const saved = savePharmacyLabelDraft({
      ...createPharmacyLabelDraft(row, "바이알", "drug"),
      style: {
        ...createPharmacyLabelDraft(row, "바이알", "drug").style,
        outerBorderColor: "#22C55E",
      },
    });
    const resolved = resolvePharmacyLabelDraft({ ...row, borderColor: "#D92D20" }, [saved], "바이알", "drug");
    expect(resolved.style.outerBorderColor).toBe("#22C55E");
  });

  it("uses the latest saved copy for the same drug label", () => {
    const base = createPharmacyLabelDraft(row, "바이알", "drug");
    const older = savePharmacyLabelDraft({
      ...base,
      printable: { ...base.printable, title: "이전 라벨" },
    }, new Date("2026-08-10T00:00:00.000Z"));
    const latest = savePharmacyLabelDraft({
      ...older,
      id: "latest-copy",
      printable: { ...older.printable, title: "수정 라벨" },
    }, new Date("2026-08-10T00:00:00.000Z"));
    expect(resolvePharmacyLabelDraft({ ...row, code: row.code.toLowerCase() }, [older, latest], base.category, base.labelFamily).printable.title).toBe("수정 라벨");
  });

  it("refreshes a saved label with the current shared master warnings", () => {
    const currentMasterRow = {
      ...row,
      storage: "실온",
      lightProtected: false,
      doseCaution: false,
      doseCheck: true,
      highRisk: false,
    };
    const saved = savePharmacyLabelDraft({
      ...createPharmacyLabelDraft(currentMasterRow, "바이알", "drug"),
      warnings: ["유사발음"],
    });
    const resolved = resolvePharmacyLabelDraft(currentMasterRow, [saved], "바이알", "drug");
    expect(resolved.warnings).toEqual(["용량확인"]);
    expect(resolved.printable.warning).toBe("용량확인");
  });

  it("keeps the mandatory dilution phrase on every size even when a saved label omitted it", () => {
    const dilutionRow = { ...row, code: "XACETATE" };
    const created = createPharmacyLabelDraft(dilutionRow, "바이알", "drug");
    expect(created.warnings).toContain("<반드시 희석 후 사용>");

    const saved = savePharmacyLabelDraft({
      ...created,
      warnings: ["고위험의약품"],
      size: { presetKey: "47x80", widthMm: 80, heightMm: 47 },
      style: { ...created.style, fontColor: "#123456", fontSizePt: 23 },
    });
    const resolved = resolvePharmacyLabelDraft(dilutionRow, [saved], "바이알", "drug");
    expect(resolved.warnings).toContain("<반드시 희석 후 사용>");
    expect(resolved.printable.warning).toContain("<반드시 희석 후 사용>");
    expect(resolved.size).toEqual(saved.size);
    expect(resolved.style.fontColor).toBe("#123456");
    expect(resolved.style.fontSizePt).toBe(23);
  });

  it("creates high-risk warning and footer content", () => {
    const draft = createPharmacyLabelDraft(row, "바이알", "drug");
    expect(draft.printable.warning).toContain("고위험의약품");
    expect(draft.printable.footer.text).toBe("고농도 전해질");
  });

  it("applies cabinet-list sheet details to cabinet label drafts", () => {
    const draft = createPharmacyLabelDraft({
      ...row,
      cabinetOralInjection: true,
      cabinetOralInjectionInfo: {
        source: "경구 주사 리스트",
        atc: "88",
        warning: "PTP",
        expiry: "2027-05-31",
        location: "A",
      },
    }, "원병", "cabinet");

    expect(draft.atc).toBe("88");
    expect(draft.expiry).toBe("2027-05-31");
    expect(draft.location).toBe("A");
    expect(draft.warnings).toContain("PTP");
  });

  it("uses a 0.5mm default border while preserving designated and high-cost 5mm borders", () => {
    expect(createPharmacyLabelDraft({ ...row, border: false, borderColor: "" }, "원병", "drug").style.outerBorderPx).toBe(0.5);
    expect(createPharmacyLabelDraft(row, "바이알", "drug").style.outerBorderPx).toBe(5);
    expect(createPharmacyLabelDraft({ ...row, border: false, highCost: true }, "고가약", "drug").style.outerBorderPx).toBe(5);
    const colorDesignated = createPharmacyLabelDraft({ ...row, border: false, borderColor: "기호 #15A7E6" }, "바이알", "drug");
    expect(colorDesignated.style.outerBorderPx).toBe(5);
    expect(colorDesignated.style.outerBorderColor).toBe("#15A7E6");
  });

  it("groups labels for batch print", () => {
    const draft = createPharmacyLabelDraft(row, "바이알", "drug");
    expect(groupPharmacyLabelsForPaper(Array.from({ length: 30 }, () => draft), A4_PAPER).length).toBeGreaterThan(1);
  });

  it("economically arranges cabinet labels and splits oversized locations without cutting", () => {
    const cabinetRows = Array.from({ length: 120 }, (_, index) => ({
      ...row,
      code: `CAB-${index}`,
      name: `Cabinet ${index}`,
      drugType: "원병",
      location: "A",
    }));
    const oversized = buildCabinetLocationDraft(cabinetRows, "원병", "A");
    const layout = planPharmacyLabelsForPaper([oversized], A4_PAPER);
    expect(layout.pages.flat().length).toBeGreaterThan(1);
    expect(layout.pages.flat().every((draft) => draft.size.heightMm <= layout.paper.heightMm - layout.paper.marginMm * 2)).toBe(true);

    const smallLabels = ["A", "B", "C", "D"].map((location) => buildCabinetLocationDraft([
      { ...row, code: location, name: location, drugType: "원병", location },
    ], "원병", location));
    expect(planPharmacyLabelsForPaper(smallLabels, A4_PAPER).orientation).toBe("landscape");
  });
});
