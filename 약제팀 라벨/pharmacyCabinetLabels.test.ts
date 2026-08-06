import { describe, expect, it } from "vitest";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { buildCabinetFullListDrafts, buildCabinetLocationDraft, listCabinetLocations } from "./pharmacyCabinetLabels";

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
      row("B", "A", { atc: "20", expiry: "2027-01-31", doseCaution: true, highCost: true }),
      row("A", "B", { atc: "3", oralAnticancer: true }),
      row("C", "C", { atc: "100", hazardous: true }),
    ], "ATC");
    expect(drafts).toHaveLength(2);
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).map((entry) => entry.atc)).toEqual(["3", "20", "100"]);
    expect(drafts[0].size).toEqual({ presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 });
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).find((entry) => entry.name === "B")).toMatchObject({
      atc: "20",
      expiry: "2027-01-31",
      reference: "용량주의 · 고가약",
    });
  });

  it("separates only high-cost bottle drugs whose location starts with 고", () => {
    const rows = [
      row("Regular", "A"),
      row("Premium regular shelf", "B", { highCost: true }),
      row("Premium dedicated shelf", "고-1", { highCost: true }),
    ];
    expect(buildCabinetFullListDrafts(rows, "원병").flatMap((draft) => draft.cabinetLayout?.entries ?? []).map((entry) => entry.name)).toEqual([
      "Premium regular shelf",
      "Regular",
    ]);
    const highCostDrafts = buildCabinetFullListDrafts(rows, "원병", "high-cost");
    expect(highCostDrafts).toHaveLength(1);
    expect(highCostDrafts[0].cabinetLayout?.title).toBe("원병 고가약 리스트");
    expect(highCostDrafts[0].cabinetLayout?.entries.map((entry) => entry.name)).toEqual(["Premium dedicated shelf"]);
  });

  it("keeps high-cost drugs in PTP unless their location starts with 고", () => {
    const drafts = buildCabinetFullListDrafts([
      row("Regular PTP", "A", { drugType: "PTP" }),
      row("Premium PTP", "B", { drugType: "PTP", highCost: true }),
      row("Dedicated Premium PTP", "고-2", { drugType: "PTP", highCost: true }),
    ], "PTP");
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).map((entry) => entry.name)).toEqual(["Premium PTP", "Regular PTP"]);
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
