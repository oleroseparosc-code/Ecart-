import { describe, expect, it } from "vitest";
import type { StockAllocation, StockDrug } from "./types";
import { buildMasterRows, deleteAllocation, sortStockDrugsByName, updateAllocationQuantity } from "./inventoryState";

const drugs: StockDrug[] = [
  {
    code: "XAAA",
    genericName: "Alpha",
    productName: "Alpha inj",
    spec: "1V",
    storage: "실온보관",
    note: "",
    warning: "",
    storageType: "ROOM",
  },
  {
    code: "XBBB",
    genericName: "Beta",
    productName: "Beta inj",
    spec: "1A",
    storage: "냉장보관(2-8℃)",
    note: "",
    warning: "고위험의약품",
    storageType: "REFRIGERATED",
  },
];

const allocations: StockAllocation[] = [
  { roomId: "42W", drugCode: "XAAA", requiredQty: 2 },
  { roomId: "61W", drugCode: "XAAA", requiredQty: 3 },
  { roomId: "42W", drugCode: "XBBB", requiredQty: 1 },
];

describe("inventory allocation state", () => {
  it("sorts drug lists alphabetically by display name without mutating the source list", () => {
    const unsorted: StockDrug[] = [
      { ...drugs[0], code: "Z001", productName: "Zofran inj" },
      { ...drugs[0], code: "A010", productName: "Abilify tab" },
      { ...drugs[0], code: "B020", productName: "Bisoprolol tab" },
    ];

    const sorted = sortStockDrugsByName(unsorted);

    expect(sorted.map((drug) => drug.productName)).toEqual(["Abilify tab", "Bisoprolol tab", "Zofran inj"]);
    expect(unsorted.map((drug) => drug.productName)).toEqual(["Zofran inj", "Abilify tab", "Bisoprolol tab"]);
  });

  it("keeps master rows alphabetically sorted by drug name", () => {
    const unorderedByCode: StockDrug[] = [
      { ...drugs[0], code: "Z001", productName: "Abilify tab" },
      { ...drugs[0], code: "A010", productName: "Zofran inj" },
      { ...drugs[0], code: "B020", productName: "Bisoprolol tab" },
    ];

    const rows = buildMasterRows(unorderedByCode, []);

    expect(rows.map((row) => row.productName)).toEqual(["Abilify tab", "Bisoprolol tab", "Zofran inj"]);
  });

  it("recalculates master totals and room details from current allocations", () => {
    const rows = buildMasterRows(drugs, allocations);
    const alpha = rows.find((row) => row.code === "XAAA");

    expect(alpha?.totalQuantity).toBe(5);
    expect(alpha?.roomDetails).toEqual([
      { roomId: "42W", requiredQty: 2 },
      { roomId: "61W", requiredQty: 3 },
    ]);
  });

  it("updates a room quantity and immediately changes the master summary", () => {
    const next = updateAllocationQuantity(allocations, "42W", "XAAA", 7);
    const rows = buildMasterRows(drugs, next);
    const alpha = rows.find((row) => row.code === "XAAA");

    expect(alpha?.totalQuantity).toBe(10);
    expect(alpha?.roomDetails).toContainEqual({ roomId: "42W", requiredQty: 7 });
  });

  it("deletes a room allocation and removes it from the master summary", () => {
    const next = deleteAllocation(allocations, "61W", "XAAA");
    const rows = buildMasterRows(drugs, next);
    const alpha = rows.find((row) => row.code === "XAAA");

    expect(alpha?.totalQuantity).toBe(2);
    expect(alpha?.roomDetails).toEqual([{ roomId: "42W", requiredQty: 2 }]);
  });
});
