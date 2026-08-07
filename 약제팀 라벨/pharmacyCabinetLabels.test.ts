import { describe, expect, it } from "vitest";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { arrangeThreeTierEntriesByAlphabetColumns, buildCabinetFullListDrafts, buildCabinetLocationDraft, buildThreeTierEntries, buildThreeTierPositionDraft, cabinetReference, formatCabinetAtcNumber, listCabinetLocations } from "./pharmacyCabinetLabels";

function row(name: string, location: string, patch: Partial<HospitalDrugLabelRow> = {}): HospitalDrugLabelRow {
  return {
    code: name,
    name,
    koreanName: `${name} 한글명`,
    strength: "",
    drugType: "원병",
    spec: "",
    package: "",
    storage: "",
    lightProtected: false,
    inHospital: true,
    similarLook: false,
    similarSound: false,
    doseCaution: false,
    doseCheck: false,
    highRisk: false,
    location,
    ...patch,
  };
}

describe("pharmacy cabinet label rules", () => {
  it("lists locations and sorts every location group in descending alphabetic order", () => {
    const rows = [row("Alpha", "가-1"), row("Charlie", "가-1/나-2"), row("Bravo", "가-1")];
    expect(listCabinetLocations(rows)).toEqual(["가-1", "나-2"]);
    const draft = buildCabinetLocationDraft(rows, "원병", "가-1");
    expect(draft.cabinetLayout?.entries.map((entry) => entry.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(draft.size).toEqual({ presetKey: "cabinet-location", widthMm: 120, heightMm: 15 });
  });

  it("adds one blank 5mm row after two-drug rows", () => {
    expect(buildCabinetLocationDraft([row("A", "A"), row("B", "A"), row("C", "A")], "PTP", "A").size.heightMm).toBe(15);
    expect(buildCabinetLocationDraft([row("A", "A"), row("B", "A")], "PTP", "A").size.heightMm).toBe(10);
  });

  it("builds exactly two ATC pages in ATC-number ascending order with expiry data", () => {
    const drafts = buildCabinetFullListDrafts([
      row("B", "A", { atc: "ATC20", expiry: "2027-01-31", doseCaution: true, highCost: true }),
      row("A", "B", { atc: "3", oralAnticancer: true }),
      row("C", "C", { atc: "100", hazardous: true }),
    ], "ATC");
    expect(drafts).toHaveLength(2);
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).map((entry) => entry.atc)).toEqual(["3", "20", "100"]);
    expect(formatCabinetAtcNumber("ATC 191")).toBe("191");
    expect(drafts[0].size).toEqual({ presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 });
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).find((entry) => entry.name === "B")).toMatchObject({
      atc: "20",
      expiry: "2027-01-31",
      reference: "용량주의 · 고가약",
    });
  });

  it("builds the oral high-cost classification as one list with workbook locations", () => {
    const drafts = buildCabinetFullListDrafts([
      row("Premium regular shelf", "B", { highCost: true }),
      row("Premium dedicated shelf", "고-1", { highCost: true }),
    ], "경구 고가약");
    expect(drafts).toHaveLength(1);
    expect(drafts[0].cabinetLayout?.title).toBe("경구 고가약 전체 리스트");
    expect(drafts[0].cabinetLayout?.entries.map((entry) => [entry.name, entry.location])).toEqual([
      ["Premium dedicated shelf", "고-1"],
      ["Premium regular shelf", "B"],
    ]);
  });

  it("builds 43 by 3mm three-tier cells in two columns and keeps dose variants distinct", () => {
    const draft = buildThreeTierPositionDraft([
      { code: "A::0.5T", name: "Alpha", koreanName: "", reference: "", location: "", atc: "", expiry: "", doseUnit: "0.5T" },
      { code: "A::0.25T", name: "Alpha", koreanName: "", reference: "", location: "", atc: "", expiry: "", doseUnit: "0.25T" },
      { code: "B::1T", name: "Bravo", koreanName: "", reference: "", location: "", atc: "", expiry: "", doseUnit: "1T" },
    ], "측면라벨");
    expect(draft.size).toEqual({ presetKey: "three-tier-position", widthMm: 86, heightMm: 6 });
    expect(draft.cabinetLayout?.entries.map((entry) => [entry.name, entry.doseUnit])).toEqual([["Alpha", "0.5T"], ["Alpha", "0.25T"], ["Bravo", "1T"]]);
  });

  it("places each selected alphabet in its own vertical column", () => {
    const entries = [
      { code: "A1", name: "Alpha", koreanName: "", reference: "", location: "", atc: "", expiry: "" },
      { code: "A2", name: "Aster", koreanName: "", reference: "", location: "", atc: "", expiry: "" },
      { code: "B1", name: "Beta", koreanName: "", reference: "", location: "", atc: "", expiry: "" },
      { code: "B2", name: "Bravo", koreanName: "", reference: "", location: "", atc: "", expiry: "" },
      { code: "B3", name: "Byetta", koreanName: "", reference: "", location: "", atc: "", expiry: "" },
    ];
    expect(arrangeThreeTierEntriesByAlphabetColumns(entries).map((entry) => entry?.code ?? "blank")).toEqual([
      "A1", "B1", "A2", "B2", "blank", "B3",
    ]);
    expect(buildThreeTierPositionDraft(entries, "측면라벨").size.heightMm).toBe(9);
  });

  it("keeps only the oral-anticancer reference when both anticancer flags are checked", () => {
    expect(cabinetReference(row("Oral cancer", "A", { oralAnticancer: true, anticancer: true }))).toBe("경구항암제");
  });

  it("builds split-dose entries from both original-bottle and PTP source rows and marks cautions", () => {
    const entries = buildThreeTierEntries([
      row("Original", "A", { coloredSideLabel: "Y", sideLabelHalfT: "Y", doseCaution: true }),
      row("Ptp", "B", { drugType: "PTP", coloredSideLabel: "Y", sideLabelQuarterT: "Y", doseCheck: true }),
    ], "유색라벨");
    expect(entries.map((entry) => [entry.name, entry.doseUnit, entry.doseHighlighted])).toEqual([
      ["Original", "0.5T", true],
      ["Ptp", "0.25T", true],
    ]);
    expect(buildThreeTierEntries([
      row("Colored default", "C", { coloredSideLabel: "Y" }),
    ], "유색라벨").map((entry) => [entry.name, entry.doseUnit])).toEqual([["Colored default", "1T"]]);
  });

  it("adds vaccines to the refrigerated-injection cabinet under the vaccine refrigerator", () => {
    const vaccine = row("Vaccine", "", { drugType: "백신", storage: "냉장" });
    expect(listCabinetLocations([vaccine], "냉장주사")).toEqual(["백신 냉장고"]);
    expect(buildCabinetLocationDraft([vaccine], "냉장주사", "백신 냉장고").cabinetLayout?.entries.map((entry) => entry.name)).toEqual(["Vaccine"]);
  });

  it("uses one A4 page for nutrition fluids and keeps external cabinet locations", () => {
    expect(buildCabinetFullListDrafts([row("Nutrition", "N1", { drugType: "영양수액" })], "영양수액")).toHaveLength(1);
    const external = buildCabinetFullListDrafts([row("External", "", {
      drugType: "외용제",
      cabinetExternalInfo: { source: "외용제리스트", atc: "", warning: "", expiry: "", location: "E4" },
    })], "외용제");
    expect(external.flatMap((draft) => draft.cabinetLayout?.entries ?? [])[0].location).toBe("E4");
  });
});
