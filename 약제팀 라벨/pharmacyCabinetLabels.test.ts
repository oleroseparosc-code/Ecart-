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

  it("builds exactly two A4 full-list pages with caution, category, and ATC expiry fields", () => {
    const drafts = buildCabinetFullListDrafts([
      row("B", "A", { atc: "20", expiry: "2027-01-31", doseCaution: true, highCost: true }),
      row("A", "B", { oralAnticancer: true }),
      row("C", "C", { hazardous: true }),
    ], "ATC");
    expect(drafts).toHaveLength(2);
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).map((entry) => entry.name)).toEqual(["A", "B", "C"]);
    expect(drafts[0].size).toEqual({ presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 });
    expect(drafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).find((entry) => entry.name === "B")).toMatchObject({
      atc: "20",
      expiry: "2027-01-31",
      reference: "용량주의 · 고가약",
    });
  });
});
