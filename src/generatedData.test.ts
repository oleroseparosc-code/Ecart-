import { describe, expect, it } from "vitest";
import rawInventory from "./data/inventory.generated.json";
import type { InventoryData } from "./types";
import { getInitialAppMode, getStockChecklistDefaultState, makeChecklistState } from "./App";

const inventory = rawInventory as InventoryData;

describe("generated inventory data corrections", () => {
  it("uses XNAK20 as the stock drug code for 0.9% NaKCl 20mEq/100ml", () => {
    const nakclDrugs = inventory.stock.drugs.filter((drug) => drug.productName.includes("0.9% NaKCl 20mEq/100ml"));

    expect(nakclDrugs).toHaveLength(1);
    expect(nakclDrugs[0].code).toBe("XNAK20");
    expect(inventory.stock.allocations.filter((allocation) => allocation.drugCode.includes("NaKCl"))).toHaveLength(0);
    expect(inventory.stock.allocations.filter((allocation) => allocation.drugCode === "XNAK20")).toHaveLength(2);
  });

  it("updates checklist item 4 text to '보관하고 있지 않다'", () => {
    const texts = inventory.checklist.map((item) => item.text);
    const item4 = texts.find((text) => text.includes("4. 비품이외의 잉여약"));
    expect(item4).toBe("4. 비품이외의 잉여약을 보관하고 있지 않다.");
  });

  it("keeps real checklist items while excluding only label-only rows", () => {
    const labels = inventory.checklist.map((item) => item.text.replace(/\s+/g, ""));

    expect(labels).not.toContain("양호불량");
    expect(labels).toContain("수량일치");
    expect(labels).toContain("6.연1회냉장고온도계검증여부");
    expect(labels).toContain("2-1약제팀리스트와불일치시불일치내용사유를작성해주세요.(투약,망실등등)");
    expect(labels).toContain("2-2약제팀제공비품리스트에약품목록,보관상태,수량을확인후확인자서명확인");
  });

  it("applies storage and warning corrections from pharmacy policy updates", () => {
    const byCode = new Map(inventory.stock.drugs.map((drug) => [drug.code, drug]));

    expect(byCode.get("XMVH")?.storageType).toBe("REFRIGERATED");
    expect(byCode.get("XEPIN")?.storageType).toBe("ROOM");
    expect(byCode.get("XNA40")?.warning).toContain("고위험의약품");
    expect(byCode.get("XKPHMB")?.warning).toContain("고위험의약품");
    expect(byCode.get("XMEXO")?.warning).toContain("유사모양");
    expect(byCode.get("XBPCA5W")?.warning).not.toContain("LMT");
  });

  it("uses the policy E-cart item labels for corrected emergency cart rows", () => {
    const byCode = new Map(inventory.ecart.generalItems.map((item) => [item.code, item]));

    expect(byCode.get("XNS20")?.name).toBe("N/S 20cc");
    expect(byCode.get("NITR")?.name).toBe("Nitroglycerin(SL)");
    expect(byCode.get("XCPENIR")?.name).toBe("Peniramin");
    expect(byCode.get("XADENO6")?.name).toBe("Adenocor( Adenosin )");
    expect(byCode.get("XNB84")?.dosage).toBe("20mEq/20mL/Amp");
  });

  it("stores source sheet top dates for room inventory lists", () => {
    const bySheet = new Map(inventory.stock.rooms.map((room) => [room.sourceSheet, room]));

    expect(bySheet.get("HBEF")?.sourceUpdatedAt).toBe("26.03.26");
    expect(bySheet.get("OS")?.sourceUpdatedAt).toBe("26.06.10");
    expect(bySheet.get("NR")?.sourceUpdatedAt).toBe("26.04.14");
  });

  it("defaults stock checklist items to 'good' except for note and reason rows", () => {
    const defaultChecklist = getStockChecklistDefaultState({}, "61W");
    const nonReasonItems = defaultChecklist.filter((item) => !item.text.startsWith("*") && !item.text.includes("사유"));
    const reasonItems = defaultChecklist.filter((item) => item.text.startsWith("*") || item.text.includes("사유"));

    expect(nonReasonItems.length).toBeGreaterThan(0);
    for (const item of nonReasonItems) {
      expect(item.status).toBe("good");
    }
    for (const item of reasonItems) {
      expect(item.status).toBe("");
    }
  });

  it("defaults E-cart checklist items to 'good' except for the reason row", () => {
    const ecartChecklist = makeChecklistState("ecart-general:42", ["E-cart"]);
    const nonReasonItems = ecartChecklist.filter((item) => !item.text.startsWith("*") && !item.text.includes("사유") && !item.text.startsWith("이상 시"));
    const reasonItems = ecartChecklist.filter((item) => item.text.startsWith("*") || item.text.includes("사유") || item.text.startsWith("이상 시"));

    expect(nonReasonItems.length).toBeGreaterThan(0);
    for (const item of nonReasonItems) {
      expect(item.status).toBe("good");
    }
    for (const item of reasonItems) {
      expect(item.status).toBe("");
    }
  });

  it("excludes the retired twice-weekly E-cart management log checklist row", () => {
    const generatedTexts = inventory.checklist.filter((item) => item.section === "E-cart").map((item) => item.text);
    const defaultTexts = makeChecklistState("ecart-general:42", ["E-cart"]).map((item) => item.text);

    expect(generatedTexts.some((text) => text.includes("주 2회 점검한 E-cart 관리대장"))).toBe(false);
    expect(defaultTexts.some((text) => text.includes("주 2회 점검한 E-cart 관리대장"))).toBe(false);
  });

  it("keeps the current route as admin and exposes a master viewer route", () => {
    expect(getInitialAppMode("/Ecart-/", "")).toBe("admin");
    expect(getInitialAppMode("/Ecart-/viewer", "")).toBe("master-viewer");
    expect(getInitialAppMode("/Ecart-/", "?view=master")).toBe("master-viewer");
  });
});
