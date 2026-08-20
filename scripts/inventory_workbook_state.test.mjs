import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeWorkbookStateIntoAppState } from "./inventory_workbook_state.mjs";

test("keeps existing room metadata while using the workbook allocation matrix", () => {
  const result = mergeWorkbookStateIntoAppState(
    {
      stockRooms: [{ id: "42W", label: "42W", floor: "4층", sourceSheet: "42" }],
      stockDrugs: [{ code: "XAPH.5", productName: "old" }],
      narcoticRooms: [],
      narcoticDrugs: [],
      narcoticDrugCategories: {},
    },
    {
      stockRooms: [{ id: "42W", label: "42W", sourceColumn: "42W", allocationCount: 1, totalQuantity: 4 }],
      stockDrugs: [{ code: "XAPH.5", productName: "0.5g Acetphen 50ml premix inj", storage: "실온" }],
      stockAllocations: [{ roomId: "42W", drugCode: "XAPH.5", requiredQty: 4 }],
      narcoticRooms: [],
      narcoticDrugs: [],
      narcoticAllocations: [],
      narcoticDrugCategories: {},
    },
  );

  assert.equal(result.stockRooms[0].floor, "4층");
  assert.equal(result.stockDrugs[0].productName, "0.5g Acetphen 50ml premix inj");
  assert.deepEqual(result.stockAllocations, [{ roomId: "42W", drugCode: "XAPH.5", requiredQty: 4 }]);
});
