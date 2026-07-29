import { describe, expect, it } from "vitest";
import {
  buildNarcoticMasterLabelData,
  buildStockLabelData,
  canEditMasterAssignments,
  displayRoomName,
  getDoseHighlightTextParts,
  getDrugLabelFlagLabels,
  getDrugLabelNameClass,
  getGeneralDrugLabelNameLines,
  getInitialAppMode,
  getInitialMasterKindFilter,
  getInspectedRoomIdsFromCheckedItems,
  getNarcoticDoseCautionCodes,
  getNarcoticFortyLabelNameLines,
  isMasterKindFilterDisabled,
  matchesMasterRoom,
  matchesMasterSearch,
  normalizeLabelCautionLabels,
  resolveMasterLabelRoomId,
  resolveMasterLabelRoomIds,
  resolveDrugLabelPrintRow,
  shouldOpenPharmacyWorkspaceInitially,
  getStockChecklistDefaultState,
  stripControlledDrugLabelPrefix,
  EMPTY_NARCOTIC_STOCK_CODE,
  EMPTY_NARCOTIC_STOCK_LABEL,
} from "./appLogic";
import type { MasterRow } from "./inventoryState";
import type { StockRoom } from "./types";

const baseRow: MasterRow = {
  code: "XATIV2W",
  genericName: "Ativan 2mg inj",
  productName: "Ativan 2mg inj",
  spec: "2mg",
  storage: "실온보관",
  note: "",
  warning: "",
  storageType: "ROOM",
  masterKind: "psychotropic",
  totalQuantity: 1,
  roomDetails: [],
};

describe("app label logic", () => {
  it("keeps ward master viewer read-only while pharmacy master management can edit assignments", () => {
    expect(canEditMasterAssignments("master-viewer")).toBe(false);
    expect(canEditMasterAssignments("pharmacy-viewer")).toBe(true);
    expect(canEditMasterAssignments("admin")).toBe(true);
    expect(shouldOpenPharmacyWorkspaceInitially("pharmacy-viewer")).toBe(false);
    expect(shouldOpenPharmacyWorkspaceInitially("pharmacy-editor")).toBe(true);
  });

  it("recognizes the narcotic viewer route and defaults its master filter to narcotic kinds", () => {
    expect(getInitialAppMode("/Ecart-/narcotic-viewer", "")).toBe("narcotic-viewer");
    expect(getInitialAppMode("/Ecart-/", "?view=narcotic")).toBe("narcotic-viewer");
    expect(getInitialMasterKindFilter("narcotic-viewer")).toEqual({ stock: false, psychotropic: true, narcotic: true });
    expect(isMasterKindFilterDisabled("narcotic-viewer", "stock")).toBe(true);
    expect(isMasterKindFilterDisabled("narcotic-viewer", "psychotropic")).toBe(false);
    expect(isMasterKindFilterDisabled("admin", "stock")).toBe(false);
  });

  it("adds narcotic categories to stock label caution text while preserving cold storage", () => {
    const label = buildStockLabelData(baseRow, "stock");

    expect(label.cautionLabels).toEqual(["향정"]);
    expect(normalizeLabelCautionLabels(label.cautionLabels, label.highRisk)).toEqual(["향정"]);
    expect(label.storageLabel).toBe("냉장");
    expect(label.storageTone).toBe("cold");
    expect(label.storage).toContain("냉장");
    expect(getDrugLabelFlagLabels(label)).toEqual(["향정"]);
    expect(getDrugLabelFlagLabels({ ...label, cautionLabels: [], categoryLabel: "향정" })).toEqual(["향정"]);
  });

  it("uses controlled drug common names for narcotic master labels and marks repeated strengths", () => {
    const narcotic = "\ub9c8\uc57d";
    const fentanyl50: MasterRow = {
      ...baseRow,
      code: "XFEN50",
      genericName: "Fentanyl 50mcg inj",
      productName: "[\ub9c8\uc57d] Fentanyl citrate 50mcg/ml inj",
      masterKind: "narcotic",
    };
    const fentanyl500: MasterRow = {
      ...baseRow,
      code: "XFEN500",
      genericName: "Fentanyl 500mcg inj",
      productName: "[\ub9c8\uc57d] FENTANYL 500mcg/10ml inj",
      masterKind: "narcotic",
    };
    const remiva: MasterRow = {
      ...baseRow,
      code: "XREM5",
      genericName: "Remifentanil 5mg inj",
      productName: "[\ub9c8\uc57d] Remiva 5mg inj",
      masterKind: "narcotic",
    };
    const byfavo20: MasterRow = {
      ...baseRow,
      code: "XREMIMA2",
      genericName: "Byfavo 20mg/4.05ml",
      productName: "[\ud5a5\uc815]Byfavo 20mg inj",
      masterKind: "psychotropic",
    };
    const byfavo50: MasterRow = {
      ...baseRow,
      code: "XREMIMA",
      genericName: "Byfavo 50mg/10ml",
      productName: "[\ud5a5\uc815]BYFAVO 50MG inj",
      masterKind: "psychotropic",
    };

    const doseCautionCodes = getNarcoticDoseCautionCodes([fentanyl50, fentanyl500, remiva, byfavo20, byfavo50]);
    const label = buildNarcoticMasterLabelData(fentanyl50, narcotic, undefined, doseCautionCodes.has(fentanyl50.code));

    expect(stripControlledDrugLabelPrefix("[\ud5a5\uc815] Ativan 2mg/0.5ml inj")).toBe("Ativan 2mg/0.5ml inj");
    expect([...doseCautionCodes].sort()).toEqual(["XFEN50", "XFEN500", "XREMIMA", "XREMIMA2"]);
    expect(label.name).toBe("Fentanyl citrate 50mcg/ml inj");
    expect(label.cautionLabels).toEqual([narcotic]);
    expect(label.categoryLabel).toBe(narcotic);
    expect(label.doseCaution).toBe(true);
  });

  it("does not mark dose confirmation when matching drug names have different dosage forms", () => {
    const diazepamTab: MasterRow = {
      ...baseRow,
      code: "DIAZ2T",
      genericName: "Diazepam 2mg Tab",
      productName: "[\ud5a5\uc815]Diazepam 2mg Tab",
      masterKind: "psychotropic",
    };
    const diazepamInj: MasterRow = {
      ...baseRow,
      code: "XDIAZ10",
      genericName: "Diazepam 10mg/2ml inj",
      productName: "[\ud5a5\uc815]Diazepam10mg/2ml inj",
      masterKind: "psychotropic",
    };
    const ativan2: MasterRow = {
      ...baseRow,
      code: "XATIV2W",
      genericName: "Ativan 2mg inj",
      productName: "[\ud5a5\uc815]Ativan 2mg/0.5ml inj",
      masterKind: "psychotropic",
    };
    const ativan4: MasterRow = {
      ...baseRow,
      code: "XATIV4W",
      genericName: "Ativan 4mg inj",
      productName: "[\ud5a5\uc815]Ativan 4mg/1ml inj",
      masterKind: "psychotropic",
    };

    const doseCautionCodes = getNarcoticDoseCautionCodes([diazepamTab, diazepamInj, ativan2, ativan4]);

    expect(doseCautionCodes.has("DIAZ2T")).toBe(false);
    expect(doseCautionCodes.has("XDIAZ10")).toBe(false);
    expect([...doseCautionCodes].sort()).toEqual(["XATIV2W", "XATIV4W"]);
  });

  it("splits 40x70 narcotic label names into readable meaning units", () => {
    expect(getNarcoticFortyLabelNameLines("Abstral 100mcg sublingual tab")).toEqual(["Abstral 100mcg", "sublingual tab"]);
    expect(getNarcoticFortyLabelNameLines("Fentanyl citrate 50mcg/ml inj")).toEqual(["Fentanyl citrate", "50mcg/1ml"]);
    expect(getNarcoticFortyLabelNameLines("MORPHINE sulfate 30mg/2ml inj")).toEqual(["MORPHINE sulfate", "30mg/2ml"]);
  });

  it("keeps brand names and full doses on separate 40x70 narcotic label lines", () => {
    expect(getNarcoticFortyLabelNameLines("Qsymia 11.25/69mg cap")).toEqual(["Qsymia", "11.25/69mg cap"]);
    expect(getNarcoticFortyLabelNameLines("Norspan 10mcg/h Patch")).toEqual(["Norspan", "10mcg/h Patch"]);
    expect(getNarcoticFortyLabelNameLines("Stilnox 10mg tab")).toEqual(["Stilnox", "10mg tab"]);
    expect(getNarcoticFortyLabelNameLines("Medikinet 10mg retard cap")).toEqual(["Medikinet", "10mg retard cap"]);
    expect(getNarcoticFortyLabelNameLines("Targin PR 10/5mg tab")).toEqual(["Targin PR", "10/5mg tab"]);
    expect(getNarcoticFortyLabelNameLines("Fentadur 100mcg/hr patch")).toEqual(["Fentadur", "100mcg/hr patch"]);
  });

  it("splits crowded 40x70 narcotic label names before they clip in print", () => {
    expect(getNarcoticFortyLabelNameLines("tapentadol IR (Nucynta IR) 50mg tab")).toEqual([
      "tapentadol IR",
      "(Nucynta IR)",
      "50mg tab",
    ]);
    expect(getNarcoticFortyLabelNameLines("Diazepam10mg/2ml inj")).toEqual(["Diazepam", "10mg/2ml"]);
    expect(getNarcoticFortyLabelNameLines("Diazepam 10mg/2ml inj")).toEqual(["Diazepam", "10mg/2ml"]);
  });

  it("highlights only the strength number in dose-confirmation text", () => {
    expect(getDoseHighlightTextParts("50mcg/1ml")).toEqual([
      { text: "50", highlighted: true },
      { text: "mcg/1ml", highlighted: false },
    ]);
    expect(getDoseHighlightTextParts("30mg/2ml")).toEqual([
      { text: "30", highlighted: true },
      { text: "mg/2ml", highlighted: false },
    ]);
    expect(getDoseHighlightTextParts("11.25/69mg cap")).toEqual([
      { text: "11.25", highlighted: true },
      { text: "/", highlighted: false },
      { text: "69", highlighted: true },
      { text: "mg cap", highlighted: false },
    ]);
  });

  it("splits 10x70 general label names into readable name and dose units", () => {
    expect(getGeneralDrugLabelNameLines("1% Lidocaine HCl 20ml inj", "10x70")).toEqual([
      "1% Lidocaine HCl",
      "20ml inj",
    ]);
    expect(getGeneralDrugLabelNameLines("Norepinephrine bitartrate 4mg/4ml inj", "10x70")).toEqual([
      "Norepinephrine",
      "bitartrate",
      "4mg/4ml inj",
    ]);
    expect(getGeneralDrugLabelNameLines("Sodium bicarbonate 8.4% 1.68g/20ml inj.", "10x70")).toEqual([
      "Sodium bicarbonate",
      "8.4% 1.68g/20ml inj.",
    ]);
    expect(getGeneralDrugLabelNameLines("Sugammadex sodium (2ml)/200mg inj", "10x70")).toEqual([
      "Sugammadex sodium",
      "(2ml)/200mg inj",
    ]);
    expect(getGeneralDrugLabelNameLines("Ulistin 100,000 iu/2ml Inj", "10x70")).toEqual([
      "Ulistin",
      "100,000 iu/2ml Inj",
    ]);
    expect(getGeneralDrugLabelNameLines("Sodium bicarbonate 8.4% 1.68g/20ml inj.", "55x95")).toEqual([
      "Sodium bicarbonate",
      "8.4%",
      "1.68g/20ml inj.",
    ]);
    expect(getGeneralDrugLabelNameLines("Norepinephrine bitartrate 4mg/4ml inj", "55x95")).toEqual([
      "Norepinephrine",
      "bitartrate",
      "4mg/4ml inj",
    ]);
    expect(getGeneralDrugLabelNameLines("Sugammadex sodium (2ml)/200mg inj", "55x95")).toEqual([
      "Sugammadex sodium",
      "(2ml)/200mg inj",
    ]);
    expect(getDrugLabelNameClass("1% Lidocaine HCl 20ml inj", "stock", "10x70")).toBe("name-extra-long");
  });

  it("keeps room quantity and narcotic category from the selected master label row", () => {
    const roomRow = { ...baseRow, roomDetails: [{ roomId: "ER", requiredQty: 5 }] };
    const selectedLabel = buildStockLabelData(roomRow, "stock", "ER");
    const fallbackLabel = buildStockLabelData(roomRow, "stock");

    const printable = resolveDrugLabelPrintRow(
      {
        labelRow: selectedLabel,
        roomId: selectedLabel.roomId,
        quantityOverride: selectedLabel.totalQuantity,
      },
      fallbackLabel,
    );

    expect(printable?.cautionLabels).toEqual(["향정"]);
    expect(printable?.storageLabel).toBe("냉장");
    expect(printable?.totalQuantity).toBe(5);
    expect(printable?.quantityLabel).toBe("수량");
  });

  it("treats room searches as room allocation matches, not drug-name substring matches", () => {
    const ativanWithoutAn = { ...baseRow, roomDetails: [{ roomId: "ER", requiredQty: 5 }] };
    const ativanWithAn = { ...baseRow, code: "XATIV4W", productName: "Ativan 4mg inj", roomDetails: [{ roomId: "AN", requiredQty: 2 }] };

    expect(matchesMasterRoom(ativanWithoutAn, "AN")).toBe(false);
    expect(matchesMasterRoom(ativanWithAn, "AN")).toBe(true);
    expect(buildStockLabelData(ativanWithAn, "stock", "AN").totalQuantity).toBe(2);
  });

  it("limits room-name master searches to rows assigned to that room", () => {
    const psychotropicInjDrugOutsideInjRoom = { ...baseRow, roomDetails: [{ roomId: "ER", requiredQty: 5 }] };
    const stockDrugInInjRoom = {
      ...baseRow,
      code: "XEPI",
      genericName: "Epinephrine",
      productName: "Epinephrine",
      masterKind: "stock" as const,
      roomDetails: [{ roomId: "INJ", requiredQty: 2 }],
    };

    expect(matchesMasterSearch(psychotropicInjDrugOutsideInjRoom, "inj", ["INJ"])).toBe(false);
    expect(matchesMasterSearch(stockDrugInInjRoom, "inj", ["INJ"])).toBe(true);
  });

  it("treats partial room-name searches as room filters before drug-name matches", () => {
    const rooms: StockRoom[] = [
      {
        id: "외래주사실",
        label: "외래주사실",
        sourceColumn: "외래주사실",
        sourceSheet: "INJ",
        sourceUpdatedAt: "",
        allocationCount: 1,
        totalQuantity: 1,
      },
      {
        id: "INJ",
        label: "INJ",
        sourceColumn: "INJ",
        sourceSheet: "비치향정,마약현황",
        sourceUpdatedAt: "",
        allocationCount: 0,
        totalQuantity: 0,
      },
    ];
    const roomIds = resolveMasterLabelRoomIds("외래", rooms);
    const psychotropicInjDrugOutsideInjRoom = { ...baseRow, roomDetails: [{ roomId: "AN", requiredQty: 2 }] };
    const stockDrugInOutpatientInjectionRoom = {
      ...baseRow,
      code: "XEPI",
      genericName: "Epinephrine",
      productName: "Epinephrine",
      masterKind: "stock" as const,
      roomDetails: [{ roomId: "외래주사실", requiredQty: 2 }],
    };

    expect(roomIds).toEqual(["외래주사실", "INJ"]);
    expect(matchesMasterSearch(psychotropicInjDrugOutsideInjRoom, "외래", roomIds)).toBe(false);
    expect(matchesMasterSearch(stockDrugInOutpatientInjectionRoom, "외래", roomIds)).toBe(true);
  });

  it("treats HBEF Korean stock room and narcotic HBEF room as the same label room", () => {
    const rooms: StockRoom[] = [
      {
        id: "HBEF심혈관조영실",
        label: "HBEF심혈관조영실",
        sourceColumn: "HBEF심혈관조영실",
        sourceSheet: "HBEF",
        sourceUpdatedAt: "",
        allocationCount: 1,
        totalQuantity: 1,
      },
      {
        id: "HBEF",
        label: "HBEF",
        sourceColumn: "HBEF",
        sourceSheet: "HBEF",
        sourceUpdatedAt: "",
        allocationCount: 1,
        totalQuantity: 2,
      },
    ];
    const selectedRoomId = resolveMasterLabelRoomId("HBEF", rooms);
    const fresofol = {
      ...baseRow,
      code: "XPROP1",
      productName: "Fresofol MCT 1% 15ml Inj",
      genericName: "Fresofol MCT 1% 15ml Inj",
      roomDetails: [{ roomId: "HBEF", requiredQty: 2 }],
    };

    expect(selectedRoomId).toBe("HBEF심혈관조영실");
    expect(resolveMasterLabelRoomId("심혈관조영실", rooms)).toBe("HBEF심혈관조영실");
    expect(matchesMasterRoom(fresofol, selectedRoomId)).toBe(true);
    expect(buildStockLabelData(fresofol, "stock", selectedRoomId).totalQuantity).toBe(2);
  });

  it("keeps stock and narcotic rows when an English room name has separate Korean stock room aliases", () => {
    const rooms: StockRoom[] = [
      {
        id: "동서의학건진센터",
        label: "동서의학건진센터",
        sourceColumn: "동서의학건진센터",
        sourceSheet: "HPC",
        sourceUpdatedAt: "",
        allocationCount: 1,
        totalQuantity: 1,
      },
      {
        id: "HPC",
        label: "HPC",
        sourceColumn: "HPC",
        sourceSheet: "HPC",
        sourceUpdatedAt: "",
        allocationCount: 1,
        totalQuantity: 2,
      },
    ];
    const stockRow = { ...baseRow, masterKind: "stock" as const, roomDetails: [{ roomId: "동서의학건진센터", requiredQty: 1 }] };
    const narcoticRow = { ...baseRow, roomDetails: [{ roomId: "HPC", requiredQty: 2 }] };
    const selectedRoomIds = resolveMasterLabelRoomIds("HPC", rooms);

    expect(selectedRoomIds).toEqual(["동서의학건진센터", "HPC"]);
    expect(selectedRoomIds.some((roomId) => matchesMasterRoom(stockRow, roomId))).toBe(true);
    expect(selectedRoomIds.some((roomId) => matchesMasterRoom(narcoticRow, roomId))).toBe(true);
  });

  it("keeps Korean stock room rows when an English room search resolves to a narcotic room first", () => {
    const hpcStockRow = { ...baseRow, masterKind: "stock" as const, roomDetails: [{ roomId: "동서의학건진센터", requiredQty: 1 }] };
    const hpcNarcoticRow = { ...baseRow, roomDetails: [{ roomId: "HPC", requiredQty: 2 }] };
    const dremmStockRow = { ...baseRow, masterKind: "stock" as const, roomDetails: [{ roomId: "혈관조영실", requiredQty: 1 }] };
    const dremmRadiologyStockRow = { ...baseRow, masterKind: "stock" as const, roomDetails: [{ roomId: "영상의학과", requiredQty: 1 }] };
    const dremmNarcoticRow = { ...baseRow, roomDetails: [{ roomId: "DREMM", requiredQty: 2 }] };

    expect(matchesMasterSearch(hpcStockRow, "hpc", ["HPC"])).toBe(true);
    expect(matchesMasterSearch(hpcNarcoticRow, "hpc", ["HPC"])).toBe(true);
    expect(matchesMasterSearch(dremmStockRow, "dremm", ["DREMM"])).toBe(true);
    expect(matchesMasterSearch(dremmRadiologyStockRow, "dremm", ["DREMM"])).toBe(true);
    expect(matchesMasterSearch(dremmNarcoticRow, "dremm", ["DREMM"])).toBe(true);
  });

  it("recognizes GICLA room names with and without the extra 병 character", () => {
    expect(displayRoomName("소화기병검사실")).toBe("GICLA");
    expect(displayRoomName("소화기검사실")).toBe("GICLA");
  });
  it("does not copy 42W checklist edits into another stock room default checklist", () => {
    const checklist = getStockChecklistDefaultState(
      {
        "42W": [
          {
            id: "stock-42W-0",
            section: "stock",
            text: "room specific check",
            status: "bad",
            note: "42W only note",
          },
        ],
      },
      "61W",
    );

    expect(checklist.some((item) => item.note === "42W only note")).toBe(false);
    expect(checklist.some((item) => item.status === "bad" && item.note === "42W only note")).toBe(false);
  });

  it("marks an empty narcotic room inspected when the no-stock row is checked", () => {
    expect(EMPTY_NARCOTIC_STOCK_LABEL).toBe("보유약 없음");
    expect(getInspectedRoomIdsFromCheckedItems({ [`DSR::${EMPTY_NARCOTIC_STOCK_CODE}`]: true })).toEqual(["DSR"]);
  });
});
