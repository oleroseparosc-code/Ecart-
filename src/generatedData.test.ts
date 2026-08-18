import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import rawInventory from "./data/inventory.generated.json";
import rawHospitalDrugLabels from "../약제팀 라벨/data/hospitalDrugLabels.generated.json";
import {
  NARCOTIC_ALLOCATIONS,
  NARCOTIC_DRUGS,
  NARCOTIC_ROOMS,
  NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE,
  normalizeNarcoticDrugCode,
  narcoticCategoryOf,
} from "./narcoticData";
import type { InventoryData } from "./types";
import {
  DRUG_LABEL_SIZE_GROUPS,
  buildNarcoticFileLabelData,
  buildNarcoticMasterLabelData,
  buildStockLabelData,
  buildReportFileName,
  clearUninspectedRoomId,
  getAllEcartPrintTargets,
  getEcartLabelItemsForMode,
  getEcartDefaultState,
  cleanDrugLabelName,
  formatFluidLabelName,
  getLabelModeOptions,
  getInitialAppMode,
  getDrugLabelNameClass,
  displayRoomName,
  makeLabelPrintSelectionKey,
  matchesMaster,
  normalizeLabelCautionLabels,
  resolveMasterLabelRoomId,
  getStockRoomEcartLink,
  getStockChecklistDefaultState,
  getStockGuideClassName,
  getStockSplitParts,
  makeChecklistState,
  makeInspectionCycleResetState,
  normalizeEcartInspectionState,
  normalizeChecklistRows,
  toggleStockSplitPart,
} from "./appLogic";
import { buildMasterRows, mergeGeneratedStockDrugs, reconcileGeneratedAllocations } from "./inventoryState";
import { NARCOTIC_LABEL_ROWS } from "./narcoticLabels";

const inventory = rawInventory as InventoryData;
const hospitalDrugLabels = rawHospitalDrugLabels as Array<{ code: string; name: string; drugType: string; inHospital: boolean }>;
const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

describe("generated inventory data corrections", () => {
  it("builds requested PDF file names for bulk and single reports", () => {
    expect(buildReportFileName({ category: "stock", mode: "all-stock", date: "2026-06-24" })).toBe(
      "비품약 현황 및 일괄점검보고서_2026-06-24.pdf",
    );
    expect(buildReportFileName({ category: "ecart", mode: "all-ecart", date: "2026-06-24" })).toBe(
      "E-cart 현황 및 일괄점검보고서_2026-06-24.pdf",
    );
    expect(buildReportFileName({ category: "narcotic", mode: "all-narcotic", date: "2026-06-24" })).toBe(
      "비치마약류 현황 및 일괄점검보고서_2026-06-24.pdf",
    );
    expect(buildReportFileName({ category: "stock", mode: "drug-labels", date: "2026-06-24" })).toBe("약품라벨_2026-06-24.pdf");
    expect(buildReportFileName({ category: "stock", mode: "single", targetName: "HBEF심혈관조영실", date: "2026-06-24" })).toBe(
      "HBEF심혈관조영실_비품약 현황 및 일괄점검보고서_2026-06-24.pdf",
    );
    expect(buildReportFileName({ category: "ecart", mode: "single", targetName: "심장혈관검사실", date: "2026-06-24" })).toBe(
      "심장혈관검사실_E-cart 현황 및 일괄점검보고서_2026-06-24.pdf",
    );
  });

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

  it("uses hospital common names for stock master drug names", () => {
    const byCode = new Map(inventory.stock.drugs.map((drug) => [drug.code, drug]));

    expect(byCode.get("XTPA20")?.productName).toBe("Actilyse 20mg/20ml inj");
    expect(byCode.get("XETOM")?.productName).toBe("Etomidate lipuro 20mg/10ml inj");
    expect(byCode.get("XETOM")?.productName).not.toMatch(/^\[(마약|향정)\]/);
  });

  it("extracts hospital drug types for fluid and controlled label lists", () => {
    const inHospitalRows = hospitalDrugLabels.filter((row) => row.inHospital);
    const fluids = inHospitalRows.filter((row) => row.drugType === "일반수액");
    const controlled = inHospitalRows.filter((row) => row.drugType === "마약" || row.drugType === "향정");

    expect(hospitalDrugLabels.find((row) => row.code === "XAQD")?.drugType).toBe("일반수액");
    expect(fluids.length).toBeGreaterThanOrEqual(30);
    expect(controlled.length).toBeGreaterThanOrEqual(70);
  });

  it("uses hospital common names for narcotic stock master drug names", () => {
    const byCode = new Map(NARCOTIC_DRUGS.map((drug) => [drug.code, drug]));

    expect(byCode.get("CHR5-S")?.productName).toBe("Pocral syr 5ml/btl");
    expect(byCode.get("XLZPAM4")?.productName).toBe("ATIVAN 4mg/1ml inj");
    expect(byCode.get("XKETA5")?.productName).toBe("Ketamine HCl 500mg/10ml inj");
    expect(byCode.get("XPROPO115W")?.productName).toBe("FRESOFOL MCT 1% 150mg/15ml inj");
    expect(byCode.get("XPTS500W")?.productName).toBe("Advanz thiopental 500mg inj");
    expect(byCode.get("XSUFEN50")?.productName).toBe("Sufental 50mcg/ml inj");
    expect(byCode.get("XFEN50")?.productName).toBe("Fentanyl citrate 50mcg/ml inj");
    expect(byCode.get("XOXCON1W")?.productName).toBe("Ocodone 10mg/1ml inj");
    expect(byCode.get("XPETH50W")?.productName).toBe("Pethidine 50mg/1ml inj (HANA)");
  });

  it("uses only the narcotic check sheet codes, rooms, and quantities", () => {
    const drugCodes = new Set(NARCOTIC_DRUGS.map((drug) => drug.code));
    const roomById = new Map(NARCOTIC_ROOMS.map((room) => [room.id, room]));
    const allocationByKey = new Map(NARCOTIC_ALLOCATIONS.map((allocation) => [`${allocation.roomId}::${allocation.drugCode}`, allocation]));

    expect(drugCodes.has("XPROPO115W")).toBe(true);
    expect(drugCodes.has("XPROP1")).toBe(false);
    expect(NARCOTIC_ALLOCATIONS.some((allocation) => allocation.drugCode === "XPROP1")).toBe(false);
    expect(allocationByKey.get("GICLA::XPROPO115W")?.requiredQty).toBe(20);
    expect(allocationByKey.get("AN::XPROPO115W")?.requiredQty).toBe(50);
    expect(roomById.get("DSR")?.sourceSheet).toBe("점검");
    expect(roomById.get("RRT")?.sourceSheet).toBe("점검");
  });

  it("normalizes previous narcotic app codes to hospital drug list codes", () => {
    expect(normalizeNarcoticDrugCode("XATIV4W")).toBe("XLZPAM4");
    expect(normalizeNarcoticDrugCode("XPROP1")).toBe("XPROPO115W");
    expect(normalizeNarcoticDrugCode("XFENT50W")).toBe("XFEN50");
  });

  it("uses hospital common names while preserving E-cart dosage corrections", () => {
    const byCode = new Map(inventory.ecart.generalItems.map((item) => [item.code, item]));

    expect(byCode.get("XNS20")?.name).toBe("NS 20ml inj");
    expect(byCode.get("NITR")?.name).toBe("Nitroglycerine 0.6mg tab");
    expect(byCode.get("XCPENIR")?.name).toBe("Peniramin 4mg/2ml inj");
    expect(byCode.get("XADENO6")?.name).toBe("Adenocor 6mg/2ml inj");
    expect(byCode.get("XNB84")?.dosage).toBe("20mEq/20mL/Amp");
  });

  it("uses hospital common names for E-cart coded item names", () => {
    const byCode = new Map(inventory.ecart.generalItems.map((item) => [item.code, item]));

    expect(byCode.get("XLID2W")?.name).toBe("2% LIDOcaine 20ml inj");
    expect(byCode.get("XNS20")?.name).toBe("NS 20ml inj");
  });

  it("uses hospital common names and codes for NICU E-cart aliases", () => {
    const hospitalNamesByCode = new Map(hospitalDrugLabels.map((drug) => [drug.code, drug.name]));
    const normalSaline50 = inventory.ecart.nicuItems.find((item) => item.dosage === "50ml - Bag");
    const normalSaline500 = inventory.ecart.nicuItems.find((item) => item.dosage === "500ml - Bag");
    const dextrose500 = inventory.ecart.nicuItems.find((item) => item.id === "NICU-29");

    expect(normalSaline50).toMatchObject({ code: "XNS50C", name: "NS 50ml bag" });
    expect(normalSaline500).toMatchObject({ code: "XNS500", name: "NS 500ml bag" });
    expect(dextrose500).toMatchObject({ code: "XD5W5", name: "5% DW 500ml bag" });
    expect(inventory.ecart.nicuItems.every((item) => item.code && normalizeText(item.name) === normalizeText(hospitalNamesByCode.get(item.code) ?? ""))).toBe(
      true,
    );
  });

  it("keeps the deployed static app state stock names aligned with generated common names", () => {
    const staticState = JSON.parse(readFileSync("app-state/shared-state.json", "utf8")) as { state?: { stockDrugs?: typeof inventory.stock.drugs } };
    const generatedNamesByCode = new Map(inventory.stock.drugs.map((drug) => [drug.code, normalizeText(drug.productName)]));
    const staleNames = (staticState.state?.stockDrugs ?? [])
      .filter((drug) => generatedNamesByCode.has(drug.code) && normalizeText(drug.productName) !== generatedNamesByCode.get(drug.code))
      .map((drug) => `${drug.code}: ${drug.productName}`);

    expect(staleNames).toEqual([]);
  });

  it("restores source stock drugs and allocations when a saved app state is stale", () => {
    const staticState = JSON.parse(readFileSync("app-state/shared-state.json", "utf8")) as {
      state?: { stockAllocations?: typeof inventory.stock.allocations; stockDrugs?: typeof inventory.stock.drugs };
    };
    const restoredDrugs = mergeGeneratedStockDrugs(staticState.state?.stockDrugs ?? [], inventory.stock.drugs);
    const restoredAllocations = reconcileGeneratedAllocations(
      staticState.state?.stockAllocations ?? [],
      inventory.stock.allocations,
      inventory.stock.rooms,
      inventory.stock.drugs,
    );
    const acetphenAllocations = restoredAllocations.filter((allocation) => allocation.drugCode === "XAPH1");

    expect(restoredDrugs.some((drug) => drug.code === "XAPH1")).toBe(true);
    expect(acetphenAllocations).toHaveLength(15);
    expect(acetphenAllocations.find((allocation) => allocation.roomId === "91W")?.requiredQty).toBe(3);
  });

  it("makes pharmacy-only additions available for stock assignment with their warning flags", () => {
    const appSource = readFileSync("src/App.tsx", "utf8");

    expect(appSource).toContain("function pharmacyMasterToStockDrug(master: HospitalDrugLabelRow): StockDrug");
    expect(appSource).toContain(".map(pharmacyMasterToStockDrug)");
    expect(appSource).toContain("!isHospitalControlledDrugType(row)");
  });

  it("keeps the deployed static app state narcotic quantities aligned with generated source quantities", () => {
    const staticState = JSON.parse(readFileSync("app-state/shared-state.json", "utf8")) as {
      state?: { narcoticAllocations?: typeof NARCOTIC_ALLOCATIONS };
    };
    const generatedByKey = new Map(NARCOTIC_ALLOCATIONS.map((allocation) => [`${allocation.roomId}::${allocation.drugCode}`, allocation.requiredQty]));
    const staleQuantities = (staticState.state?.narcoticAllocations ?? [])
      .filter((allocation) => {
        const generatedQty = generatedByKey.get(`${allocation.roomId}::${allocation.drugCode}`);
        return generatedQty !== undefined && allocation.requiredQty !== generatedQty;
      })
      .map((allocation) => `${allocation.roomId}::${allocation.drugCode}: ${allocation.requiredQty}`);

    expect(staleQuantities).toEqual([]);
  });

  it("keeps the deployed static app state narcotic master aligned with generated source drugs", () => {
    const staticState = JSON.parse(readFileSync("app-state/shared-state.json", "utf8")) as {
      state?: { narcoticDrugs?: typeof NARCOTIC_DRUGS };
    };
    const staticDrugCodes = new Set((staticState.state?.narcoticDrugs ?? []).map((drug) => drug.code));
    const missingGeneratedDrugs = NARCOTIC_DRUGS.filter((drug) => !staticDrugCodes.has(drug.code)).map(
      (drug) => `${drug.code}: ${drug.productName}`,
    );

    expect(missingGeneratedDrugs).toEqual([]);
  });

  it("refreshes persisted NICU E-cart rows with generated hospital common names", () => {
    const state = normalizeEcartInspectionState({
      items: [{ id: "NICU-27", code: "", name: "Normal saline", dosage: "50ml - Bag", quantity: 1, checked: true, expiryDate: "2026-12-31" }],
      checklist: [],
    });

    expect(state.items[0]).toMatchObject({ id: "NICU-27", code: "XNS50C", name: "NS 50ml bag", checked: true, expiryDate: "2026-12-31" });
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

  it("adds the E-cart drug type and count match checklist row", () => {
    const ecartChecklist = makeChecklistState("ecart-general:42", ["E-cart"]);

    expect(ecartChecklist.map((item) => item.text)).toContain("E-cart 약물의 종류와 갯수가 규정과 동일 하다.");
  });

  it("removes the E-cart reason row directly under 2-1", () => {
    const ecartChecklist = makeChecklistState("ecart-general:42", ["E-cart"]);

    expect(ecartChecklist.map((item) => item.text)).not.toContain("이상 시 사유:");
  });

  it("builds a bulk E-cart print target list including NICU", () => {
    expect(getAllEcartPrintTargets([{ id: "AER1", label: "AER1" }]).map(({ key }) => key)).toEqual(["general:AER1", "nicu:nicu"]);
  });

  it("does not copy 42W E-cart Nitroglycerin inspection values into unsaved rooms", () => {
    const state = getEcartDefaultState(
      {
        "general:42": {
          items: [
            {
              id: "NITR",
              code: "NITR",
              name: "Nitroglycerin(SL)",
              dosage: "0.6mg/Tab",
              quantity: 3,
              checked: true,
              expiryDate: "2026-09-23",
            },
          ],
          checklist: [],
        },
      },
      "general",
      "general:CT실",
    );
    const nitroglycerin = state.items.find((item) => item.code === "NITR");

    expect(nitroglycerin?.checked).toBe(false);
    expect(nitroglycerin?.expiryDate).toBe("");
  });

  it("keeps each saved E-cart room's own Nitroglycerin inspection values", () => {
    const state = getEcartDefaultState(
      {
        "general:42": {
          items: [
            {
              id: "NITR",
              code: "NITR",
              name: "Nitroglycerin(SL)",
              dosage: "0.6mg/Tab",
              quantity: 3,
              checked: true,
              expiryDate: "2026-09-23",
            },
          ],
          checklist: [],
        },
        "general:CT실": {
          items: [
            {
              id: "NITR",
              code: "NITR",
              name: "Nitroglycerin(SL)",
              dosage: "0.6mg/Tab",
              quantity: 3,
              checked: true,
              expiryDate: "2026-06-24",
            },
          ],
          checklist: [],
        },
      },
      "general",
      "general:CT실",
    );
    const nitroglycerin = state.items.find((item) => item.code === "NITR");

    expect(nitroglycerin?.checked).toBe(true);
    expect(nitroglycerin?.expiryDate).toBe("2026-06-24");
  });

  it("excludes the retired twice-weekly E-cart management log checklist row", () => {
    const generatedTexts = inventory.checklist.filter((item) => item.section === "E-cart").map((item) => item.text);
    const defaultTexts = makeChecklistState("ecart-general:42", ["E-cart"]).map((item) => item.text);

    expect(generatedTexts.some((text) => text.includes("주 2회 점검한 E-cart 관리대장"))).toBe(false);
    expect(defaultTexts.some((text) => text.includes("주 2회 점검한 E-cart 관리대장"))).toBe(false);
  });

  it("adds monthly expiry checklist rows for stock drugs and claim drugs/fluids", () => {
    const checklist = makeChecklistState("stock-test", ["비품약", "냉장약", "청구약/ 수액"]);
    const texts = checklist.map((item) => item.text);
    const sections = checklist.map((item) => item.section);

    expect(texts).toContain("비품약 유효기간 1달에 1번 날짜로 관리한다.");
    expect(texts).toContain("청구약/ 수액의 보관 장소에 약품명 라벨링이 되어 있다.");
    expect(texts).toContain("청구약/ 수액 유효기간을 1달에 1번 관리 한다.");
    expect(sections).toContain("청구약/ 수액");
    expect(sections).not.toContain("청구약");
    expect(texts.some((text) => text.includes("청구약/ 수액품"))).toBe(false);
    expect(texts.some((text) => /청구약(?!\/\s*수액)/.test(text))).toBe(false);
  });

  it("removes old checklist numbering before new display numbering is applied", () => {
    const checklist = normalizeChecklistRows([
      { section: "비품약", text: "5. 비품약 유효기간 1달에 1번 날짜로 관리한다.", id: "a", status: "", note: "" },
      { section: "E-cart", text: "4) E-cart 약물의 종류와 갯수가 규정과 동일 하다.", id: "b", status: "", note: "" },
    ]);

    expect(checklist.map((item) => item.text)).toEqual([
      "비품약 유효기간 1달에 1번 날짜로 관리한다.",
      "E-cart 약물의 종류와 갯수가 규정과 동일 하다.",
    ]);
  });

  it("normalizes previously saved claim drug checklist rows without rewriting server state", () => {
    const checklist = getStockChecklistDefaultState(
      {
        "42W": [
          {
            id: "legacy-claim-0",
            section: "청구약",
            text: "1. 청구약 보관상태를 확인한다.",
            status: "good",
            note: "",
          },
        ],
      },
      "42W",
    );

    expect(checklist.map((item) => item.section)).toEqual(["청구약/ 수액", "청구약/ 수액"]);
    expect(checklist.map((item) => item.text)).toEqual([
      "청구약/ 수액 보관상태를 확인한다.",
      "청구약/ 수액 유효기간을 1달에 1번 관리 한다.",
    ]);
  });

  it("keeps the current route as admin and exposes a master viewer route", () => {
    expect(getInitialAppMode("/Ecart-/", "")).toBe("admin");
    expect(getInitialAppMode("/Ecart-/viewer", "")).toBe("master-viewer");
    expect(getInitialAppMode("/Ecart-/pharmacy-viewer", "")).toBe("pharmacy-viewer");
    expect(getInitialAppMode("/Ecart-/narcotic-viewer", "")).toBe("narcotic-viewer");
    expect(getInitialAppMode("/Ecart-/", "?view=master")).toBe("master-viewer");
    expect(getInitialAppMode("/Ecart-/", "?view=pharmacy")).toBe("pharmacy-viewer");
    expect(getInitialAppMode("/Ecart-/", "?view=narcotic")).toBe("narcotic-viewer");
  });

  it("shows pharmacy labels in admin, pharmacy viewer, and narcotic viewer modes", () => {
    expect(getLabelModeOptions("admin").map((option) => option.mode)).toEqual(["stock", "ecart", "ecart-nicu", "fluid", "narcotic", "pharmacy"]);
    expect(getLabelModeOptions("pharmacy-viewer").map((option) => option.mode)).toEqual(["stock", "ecart", "ecart-nicu", "fluid", "narcotic", "pharmacy"]);
    expect(getLabelModeOptions("master-viewer").map((option) => option.mode)).toEqual(["stock", "ecart", "ecart-nicu", "fluid", "narcotic"]);
    expect(getLabelModeOptions("narcotic-viewer").map((option) => option.mode)).toEqual(["stock", "ecart", "ecart-nicu", "fluid", "narcotic", "pharmacy"]);
  });

  it("keeps general and NICU E-cart label source lists separate", () => {
    expect(getEcartLabelItemsForMode("ecart", inventory.ecart)).toEqual(inventory.ecart.generalItems);
    expect(getEcartLabelItemsForMode("ecart-nicu", inventory.ecart)).toEqual(inventory.ecart.nicuItems);
    expect(getEcartLabelItemsForMode("ecart-nicu", inventory.ecart)).not.toEqual(getEcartLabelItemsForMode("ecart", inventory.ecart));
  });

  it("keeps label selections distinct by label type and selected size", () => {
    expect(makeLabelPrintSelectionKey("ecart-general-XNITR10F", "ecart", "10x70")).toBe("ecart::10x70::ecart-general-XNITR10F");
    expect(makeLabelPrintSelectionKey("fluid-XD15W", "fluid", "55x95")).toBe("fluid::55x95::fluid-XD15W");
    expect(makeLabelPrintSelectionKey("stock-XAPH1", "stock", "10x70", "42W")).toBe("stock::10x70::42W::stock-XAPH1");
    expect(makeLabelPrintSelectionKey("narcotic-XFENT100W", "narcotic", "40x70")).toBe("narcotic::40x70::narcotic-XFENT100W");
  });

  it("groups label sizes by the label output workflow shown in the print panel", () => {
    expect(DRUG_LABEL_SIZE_GROUPS).toEqual([
      {
        id: "stock-ecart",
        sizeKeys: ["10x70", "15x95"],
        outputLabel: "일반 약품 라벨 / E-cart 약품 라벨 출력\n마약 라벨 출력",
      },
      {
        id: "fluid",
        sizeKeys: ["55x95", "35x100"],
        outputLabel: "일반 수액 라벨 출력",
      },
      {
        id: "narcotic",
        sizeKeys: ["40x70"],
        outputLabel: "마약 라벨 출력",
      },
    ]);
  });

  it("deduplicates label caution text and keeps fluid label names free of container suffixes", () => {
    expect(normalizeLabelCautionLabels(["고위험의약품", "유사모양"], true)).toEqual(["유사모양", "고위험의약품"]);
    expect(formatFluidLabelName("15% DW 1L bag")).toBe("15% DW 1L");
    expect(formatFluidLabelName("NS 150ml btl")).toBe("NS 150ml");
    expect(cleanDrugLabelName("고위험의약품 NaCl 40mEq/20ml", true)).toBe("NaCl 40mEq/20ml");
  });

  it("marks refrigerated psychotropic narcotic master labels with cold storage", () => {
    const masterRows = buildMasterRows([...NARCOTIC_DRUGS], [...NARCOTIC_ALLOCATIONS], (drug) =>
      narcoticCategoryOf(drug.code) === "마약" ? "narcotic" : "psychotropic",
    );

    for (const code of ["XLZPAM2", "XLZPAM4", "XKETA5"]) {
      const row = masterRows.find((item) => item.code === code);
      expect(row).toBeDefined();
      const label = buildNarcoticMasterLabelData(row!, "향정");

      expect(label.cautionLabels).toEqual(["향정"]);
      expect(label.storageLabel).toBe("냉장");
      expect(label.storageTone).toBe("cold");
      expect(label.storage).toContain("냉장");
    }
  });

  it("marks refrigerated matched 40x70 narcotic labels with cold storage", () => {
    for (const code of ["XLZPAM2", "XLZPAM4", "XKETA5"]) {
      const row = NARCOTIC_LABEL_ROWS.find((item) => item.code === code);
      expect(row).toBeDefined();
      const label = buildNarcoticFileLabelData(row!);

      expect(label.cautionLabels).toEqual(["향정"]);
      expect(label.storageLabel).toBe("냉장");
      expect(label.storageTone).toBe("cold");
      expect(label.storage).toContain("냉장");
    }
  });

  it("uses the searched stock room quantity for master stock labels", () => {
    const acetphen = inventory.stock.drugs.find((drug) => drug.code === "XAPH1");
    const roomDetails = inventory.stock.allocations
      .filter((allocation) => allocation.drugCode === "XAPH1")
      .map((allocation) => ({ roomId: allocation.roomId, requiredQty: allocation.requiredQty }));
    const row = acetphen ? { ...acetphen, masterKind: "stock" as const, totalQuantity: 0, roomDetails } : undefined;

    expect(resolveMasterLabelRoomId("42병동", inventory.stock.rooms)).toBe("42W");
    expect(row && matchesMaster(row, "42병동")).toBe(true);
    expect(row && buildStockLabelData(row, "stock", "42W").totalQuantity).toBe(2);
    expect(row && buildStockLabelData(row, "stock").totalQuantity).toBeUndefined();
  });

  it("displays mixed Korean room names as standard English room names while keeping Korean search aliases", () => {
    const acetphen = inventory.stock.drugs.find((drug) => drug.code === "XAPH1");
    const row = acetphen
      ? {
          ...acetphen,
          masterKind: "stock" as const,
          totalQuantity: 1,
          roomDetails: [{ roomId: "HBEF심혈관조영실", requiredQty: 1 }],
        }
      : undefined;
    const narcoticWardRow = acetphen
      ? {
          ...acetphen,
          masterKind: "psychotropic" as const,
          totalQuantity: 1,
          roomDetails: [{ roomId: "42", requiredQty: 1 }],
        }
      : undefined;

    expect(displayRoomName("HBEF심혈관조영실")).toBe("HBEF");
    expect(displayRoomName("DREMM 혈관조영실")).toBe("DREMM");
    expect(displayRoomName("HPC 건강증진 센터")).toBe("HPC");
    expect(displayRoomName("INJ 외래 주사실")).toBe("INJ");
    expect(displayRoomName("PED 소아청소년과")).toBe("PED");
    expect(displayRoomName("소화기병검사실")).toBe("GICLA");
    expect(displayRoomName("분만장")).toBe("DRL");
    expect(row && matchesMaster(row, "HBEF")).toBe(true);
    expect(row && matchesMaster(row, "심혈관조영실")).toBe(true);
    expect(narcoticWardRow && matchesMaster(narcoticWardRow, "42병동")).toBe(true);
  });

  it("keeps narcotic round summary common guidance without checklist headings", () => {
    expect(NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE).not.toContain("점검 사항");
    expect(NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE).not.toContain("공통 안내");
    expect(NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE).toContain("병동으로 올라온 마약류는 인계 시 수량과 이상 유무를 확인해 주세요.");
    expect(NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE).toContain("마약류 파손 사고 및 분실 사고가 일어나지 않도록 규정에 따라 마약류를 관리 해 주세요.");
  });

  it("classifies long drug label names so large labels can wrap without clipping", () => {
    expect(getDrugLabelNameClass("Abilify asimtufii 720mg inj")).toBe("name-long");
    expect(getDrugLabelNameClass("Albumin(SK) 20% 100ml inj")).toBe("name-long");
    expect(getDrugLabelNameClass("Nitroglycerin(SL)")).toBe("");
    expect(getDrugLabelNameClass("0.9% NaKCl 40mEq/L", "fluid", "55x95")).toBe("name-long");
    expect(getDrugLabelNameClass("0.9% NaKCl 40mEq/L", "fluid", "10x70")).toBe("name-extra-long");
    expect(getDrugLabelNameClass("Fentanlyl 1500mcg/30ml (Fentanyl citrate 1500mcg)", "narcotic", "10x70")).toBe("name-extra-long");
  });

  it("clears only inspection-cycle fields when regenerating the round summary", () => {
    expect(makeInspectionCycleResetState()).toEqual({
      checkedStock: {},
      stockExpiry: {},
      stockChecklistByRoom: {},
      ecartByTarget: {},
      roundSummaryDraft: null,
      uninspectedRoomIds: [],
    });
  });

  it("clears a room's uninspected marker once stock inspection starts", () => {
    expect(clearUninspectedRoomId(["42W", "61W"], "42W")).toEqual(["61W"]);
  });

  it("resets stock guide rooms to neutral color when starting a new inspection cycle", () => {
    const resetState = makeInspectionCycleResetState();

    expect(resetState.uninspectedRoomIds).toEqual([]);
    expect(getStockGuideClassName("42W", resetState.uninspectedRoomIds, Object.keys(resetState.checkedStock))).toBe("");
  });

  it("links HBEF cardiovascular angiography room stock checklist to its E-cart screen", () => {
    expect(getStockRoomEcartLink("HBEF심혈관조영실")).toMatchObject({
      targetId: "심장혈관검사실",
      tab: "general",
    });
  });

  it("splits HBEF Isoptin and delivery room emergency stock into checkable parts", () => {
    expect(getStockSplitParts("HBEF심혈관조영실", "XVERAW", 3, "Isoptin 5mg inj(viatris)")).toEqual([1, 2]);
    expect(getStockSplitParts("DRL", "XEPIN", 2, "Epinephrine 1mg/ml inj")).toEqual([1, 1]);
    expect(getStockSplitParts("DRL", "XNALO.4", 2, "Naloxone HCl 0.4mg inj")).toEqual([1, 1]);
    expect(getStockSplitParts("42W", "XEPIN", 2, "Epinephrine 1mg/ml inj")).toBeNull();
  });

  it("checks the parent stock row after all split parts are checked", () => {
    const first = toggleStockSplitPart({}, "HBEF심혈관조영실", "XVERAW", 0, 2);
    expect(first["HBEF심혈관조영실::XVERAW"]).toBeUndefined();

    const second = toggleStockSplitPart(first, "HBEF심혈관조영실", "XVERAW", 1, 2);
    expect(second["HBEF심혈관조영실::XVERAW"]).toBe(true);
  });

  it("marks inspected stock guide rooms while keeping uninspected red state dominant", () => {
    expect(getStockGuideClassName("42W", ["42W"], ["42W"])).toBe("uninspected");
    expect(getStockGuideClassName("42W", [], ["42W"])).toBe("inspected");
    expect(getStockGuideClassName("42W", [], [])).toBe("");
  });
});
