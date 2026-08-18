import { describe, expect, it } from "vitest";
import type { StockAllocation, StockDrug } from "./types";
import {
  applyCanonicalDrugNames,
  buildMasterRows,
  deleteAllocation,
  deleteMasterDrug,
  filterMasterRowsByKind,
  filterMasterRowsWithStock,
  mergeGeneratedRooms,
  mergeGeneratedStockDrugs,
  reconcileGeneratedAllocations,
  type MasterRow,
  sortStockDrugsByName,
  updateAllocationQuantity,
} from "./inventoryState";

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

  it("applies canonical drug names by code while keeping custom drugs unchanged", () => {
    const next = applyCanonicalDrugNames(
      [
        { ...drugs[0], productName: "Old stock name", genericName: "Old generic" },
        { ...drugs[1], code: "XCUSTOM", productName: "Custom ward stock" },
      ],
      [{ code: "XAAA", productName: "Actilyse 20mg/20ml inj", genericName: "Alteplase" }],
    );

    expect(next.find((drug) => drug.code === "XAAA")?.productName).toBe("Actilyse 20mg/20ml inj");
    expect(next.find((drug) => drug.code === "XAAA")?.genericName).toBe("Alteplase");
    expect(next.find((drug) => drug.code === "XCUSTOM")?.productName).toBe("Custom ward stock");
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

  it("can hide master rows whose total quantity is zero without removing the drug from master data", () => {
    const rows = buildMasterRows([...drugs, { ...drugs[0], code: "XZERO", productName: "Zero stock inj" }], allocations);

    expect(rows.some((row) => row.code === "XZERO")).toBe(true);
    expect(filterMasterRowsWithStock(rows).map((row) => row.code)).not.toContain("XZERO");
  });

  it("filters master rows by selected stock, psychotropic, and narcotic categories", () => {
    const rows: MasterRow[] = [
      { ...drugs[0], masterKind: "stock", totalQuantity: 1, roomDetails: [] },
      { ...drugs[0], code: "XPSY", masterKind: "psychotropic", totalQuantity: 1, roomDetails: [] },
      { ...drugs[0], code: "XNAR", masterKind: "narcotic", totalQuantity: 1, roomDetails: [] },
    ];

    expect(filterMasterRowsByKind(rows, { stock: true, psychotropic: false, narcotic: true }).map((row) => row.code)).toEqual([
      "XAAA",
      "XNAR",
    ]);
  });

  it("keeps stock and narcotic room allocations in separate holding lists", () => {
    const stockRows = buildMasterRows(drugs, [{ roomId: "42W", drugCode: "XAAA", requiredQty: 2 }]);
    const narcoticRows = buildMasterRows(
      [{ ...drugs[1], code: "XNAR", productName: "Narcotic inj" }],
      [{ roomId: "ER", drugCode: "XNAR", requiredQty: 4 }],
      () => "narcotic",
    );
    const allRows = [...stockRows, ...narcoticRows];

    expect(stockRows.map((row) => row.code)).not.toContain("XNAR");
    expect(narcoticRows.map((row) => row.code)).not.toContain("XAAA");
    expect(allRows.find((row) => row.code === "XAAA")?.masterKind).toBe("stock");
    expect(allRows.find((row) => row.code === "XNAR")?.masterKind).toBe("narcotic");
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

  it("deletes one master drug and only its allocations", () => {
    const next = deleteMasterDrug(drugs, allocations, "XAAA");

    expect(next.drugs.map((drug) => drug.code)).toEqual(["XBBB"]);
    expect(next.allocations).toEqual([{ roomId: "42W", drugCode: "XBBB", requiredQty: 1 }]);
  });

  it("keeps saved room edits while adding new generated rooms such as DSR", () => {
    const savedRooms = [
      {
        id: "DREMM",
        label: "DREMM",
        sourceColumn: "DREMM",
        sourceSheet: "점검",
        sourceUpdatedAt: "26.06.18",
        allocationCount: 10,
        totalQuantity: 12,
      },
    ];
    const generatedRooms = [
      { ...savedRooms[0], allocationCount: 9, totalQuantity: 11 },
      {
        id: "DSR",
        label: "DSR",
        sourceColumn: "DSR",
        sourceSheet: "점검",
        sourceUpdatedAt: "26.06.18",
        allocationCount: 0,
        totalQuantity: 0,
      },
    ];

    expect(mergeGeneratedRooms(savedRooms, generatedRooms).map((room) => [room.id, room.allocationCount])).toEqual([
      ["DREMM", 10],
      ["DSR", 0],
    ]);
  });

  it("restores generated source drugs missing from saved master state", () => {
    const generated = [
      { ...drugs[0], code: "XREMIMA2", productName: "Byfavo 20mg inj" },
      { ...drugs[1], code: "XSUFEN50", productName: "Sufental 50mcg/ml inj" },
    ];
    const saved = [{ ...drugs[0], code: "XCUSTOM", productName: "Custom controlled drug" }];

    expect(mergeGeneratedStockDrugs(saved, generated).map((drug) => drug.code).sort()).toEqual(["XCUSTOM", "XREMIMA2", "XSUFEN50"]);
  });

  it("keeps generated source quantities ahead of stale saved allocation quantities", () => {
    const generatedRooms = [{ id: "DREMM" }, { id: "ER" }];
    const generatedDrugs = [{ code: "XMIDA5" }, { code: "XFEN50" }];
    const savedAllocations = [
      { roomId: "DREMM", drugCode: "XMIDA5", requiredQty: 10 },
      { roomId: "DREMM", drugCode: "XFEN50", requiredQty: 15 },
      { roomId: "ER", drugCode: "XMIDA5", requiredQty: 7 },
      { roomId: "CUSTOM", drugCode: "XMIDA5", requiredQty: 2 },
      { roomId: "DREMM", drugCode: "XCUSTOM", requiredQty: 3 },
    ];
    const generatedAllocations = [
      { roomId: "DREMM", drugCode: "XMIDA5", requiredQty: 5 },
      { roomId: "DREMM", drugCode: "XFEN50", requiredQty: 10 },
    ];

    expect(reconcileGeneratedAllocations(savedAllocations, generatedAllocations, generatedRooms, generatedDrugs)).toEqual([
      { roomId: "ER", drugCode: "XMIDA5", requiredQty: 7 },
      { roomId: "CUSTOM", drugCode: "XMIDA5", requiredQty: 2 },
      { roomId: "DREMM", drugCode: "XCUSTOM", requiredQty: 3 },
      { roomId: "DREMM", drugCode: "XMIDA5", requiredQty: 5 },
      { roomId: "DREMM", drugCode: "XFEN50", requiredQty: 10 },
    ]);
  });
});
