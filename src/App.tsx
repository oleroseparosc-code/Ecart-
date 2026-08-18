import {
  ClipboardCheck,
  Database,
  Download,
  FileText,
  ListChecks,
  Monitor,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Siren,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Fragment,
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PharmacyDrugLocator } from "./PharmacyDrugLocator";
import rawInventory from "./data/inventory.generated.json";
import { getPolicyCautionLabels, isHighRiskDrug, normalizeDrugWarning, type DrugRuleFields } from "./drugRules";
import { shouldApplyRemoteState, shouldMarkLocalChange, shouldPushLocalState, type RemoteStateEnvelope } from "./githubSync";
import {
  DRUG_LABEL_SIZE_GROUPS,
  EMPTY_NARCOTIC_STOCK_CODE,
  EMPTY_NARCOTIC_STOCK_LABEL,
  ROUND_SUMMARY_COMMON_GUIDANCE,
  buildReportFileName,
  buildNarcoticMasterLabelData,
  buildStockLabelData,
  cleanDrugLabelName,
  clearUninspectedRoomId,
  displayRoomName,
  ecartTargets,
  firstEcartTargetId,
  fluidLabelTone,
  formatFluidLabelName,
  formatStockLabelSpec,
  getAllEcartPrintTargets,
  getDrugLabelNameClass,
  getDrugLabelSize,
  getDrugLabelFlagLabels,
  getEcartDefaultState,
  getEcartLabelItemsForMode,
  getGeneralDrugLabelNameLines,
  getInitialAppMode,
  getInitialMasterKindFilter,
  canEditMasterAssignments,
  shouldOpenPharmacyWorkspaceInitially,
  getInspectedRoomIdsFromCheckedItems,
  getDoseHighlightTextParts,
  getNarcoticDoseCautionCodes,
  getNarcoticFortyLabelNameLines,
  isMasterKindFilterDisabled,
  getLabelModeOptions,
  getStockChecklistDefaultState,
  getStockGuideClassName,
  getStockGuideInspectionKey,
  getStockRoomEcartLink,
  labelStorageTone,
  makeChecklistState,
  makeEcartKey,
  makeInspectionCycleResetState,
  makeLabelPrintSelectionKey,
  matchesDrug,
  matchesMasterRoom,
  matchesMasterSearch,
  nicuTarget,
  normalizeChecklistRows,
  normalizeEcartInspectionState,
  normalizeEcartItem,
  normalizeLabelCautionLabels,
  removeStockDrugRecords,
  resolveDrugLabelPrintRow,
  resolveMasterLabelRoomIds,
  stockGuideSections,
  stockRoomEcartLinks,
  stockKey,
  stockSplitKey,
  toggleStockSplitPart,
  getStockSplitParts,
} from "./appLogic";
import {
  MANDATORY_DILUTION_LABEL,
  getHospitalDrugControlledCategory,
  getHospitalDrugLabelWarnings,
  getHospitalDrugStorageLabel,
  isHospitalControlledDrugType,
  isHospitalGeneralDrugLabelType,
  isHospitalDrugType,
  isSelectableHospitalDrugLabelRow,
  loadHospitalDrugLabelRows as loadWardHospitalDrugLabelRows,
  makeHospitalControlledDrugLabelId,
  makeHospitalDrugLabelId,
  matchesHospitalDrugLabel,
  shouldExcludeHospitalControlledDrugLabel,
  stripHospitalDrugControlledPrefix,
} from "../병동라벨/hospitalDrugLabels";
import {
  loadHospitalDrugLabelRows as loadPharmacyHospitalDrugLabelRows,
  type HospitalDrugLabelRow,
} from "../약제팀 라벨/hospitalDrugLabels";
import { normalizePharmacyLabelMasterRow } from "../약제팀 라벨/PharmacyDrugMaster";
import { PharmacyLabelWorkspace } from "../약제팀 라벨/PharmacyLabelWorkspace";
import { PharmacyCabinetLayoutView } from "../약제팀 라벨/PharmacyCabinetLabelCanvas";
import { PharmacyAutoFitLabelContent } from "../약제팀 라벨/PharmacyAutoFitLabelContent";
import { mergeHospitalDrugRowsIntoPharmacyLabelMatches } from "../약제팀 라벨/hospitalDrugWorkbookUpload";
import hospitalDrugWorkbookUrl from "../약제팀 라벨/원내보유의약품리스트.xlsx?url";
import { applyExpirationWorkbook } from "../약제팀 라벨/expirationWorkbookUpdate";
import {
  deleteHospitalDrugMasterRowFromWorkbook,
  deleteHospitalDrugMasterRowsFromWorkbook,
  saveHospitalDrugMasterRowToWorkbook,
  saveHospitalDrugMasterRowsToWorkbook,
  savePharmacyLabelDraftsToWorkbook,
  loadSavedPharmacyLabelsFromWorkbook,
} from "../약제팀 라벨/pharmacyLabelWorkbookUpdate";
import { loadPharmacyLabelMatchRows, type PharmacyLabelMatchRow } from "../약제팀 라벨/pharmacyLabelMatches";
import {
  A3_PAPER,
  A4_PAPER,
  planPharmacyLabelsForPaper,
  loadSavedPharmacyLabelsFromStorage,
  writeSavedPharmacyLabelsToStorage,
  formatPharmacyExpiry,
  mergeDoseHighlightStyles,
  splitDoseText,
  splitNutritionDoseParts,
  splitNutritionDoseText,
  splitStyledPharmacyTitle,
  type PharmacyLabelDraft,
  type PharmacySavedLabel,
} from "../약제팀 라벨/pharmacyLabelStudio";
import {
  buildMasterRows,
  compareStockDrugsByName,
  deleteAllocation,
  deleteMasterDrug,
  drugDisplayName,
  filterMasterRowsByKind,
  filterMasterRowsWithStock,
  applyCanonicalDrugNames,
  mergeGeneratedRooms,
  mergeGeneratedStockDrugs,
  reconcileGeneratedAllocations,
  type MasterRow,
  type MasterRowKind,
  sortStockDrugsByName,
  updateAllocationQuantity,
} from "./inventoryState";
import { MASTER_EXPORT_MIME, buildMasterExportFileName, createMasterWorkbookXlsx } from "./masterExport";
import { downloadElementAsPdf, type PdfDownloadResult } from "./reportPdf";
import { effectiveRoomUpdatedAt, formatRoomUpdatedAt, markRoomsUpdated } from "./roomUpdateDate";
import { getNarcoticFloorRows, narcoticGuideLabel } from "./narcoticGuide";
import {
  buildInspectionCycleResetRoundSummaryDraft,
  buildNarcoticRoundSummaryDraft,
  buildRoundSummaryDraft,
  materializeRoundSummaryDraft,
  refreshRoundSummaryDraftFromGenerated,
  type RoundSummaryDraft,
  type RoundSummaryRow,
} from "./roundSummary";
import { loadRuntimeSyncConfig } from "./runtimeSyncConfig";
import { configureServerSyncBaseUrl, loadServerState, saveServerState } from "./serverSync";
import { inferStorageType, isRefrigeratedDrug, storageDisplayLabel } from "./storageDisplay";
import type { ChecklistItem, EcartItem, InventoryData, StockAllocation, StockDrug, StockRoom } from "./types";
import {
  FIRST_NARCOTIC_ROOM,
  NARCOTIC_ALLOCATIONS,
  NARCOTIC_CHECKLIST,
  NARCOTIC_DRUGS,
  NARCOTIC_DRUG_CATEGORY_BY_CODE,
  NARCOTIC_FLOORS,
  NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE,
  NARCOTIC_ROOMS,
  type NarcoticCategory,
  normalizeNarcoticDrugCode,
  narcoticCategoryOf,
} from "./narcoticData";
import { buildNarcoticStateChangeSummary } from "./narcoticStateDiff";
import {
  buildNarcoticLotAssignments,
  isNarcoticLotWorkbookFileName,
  narcoticLotKey,
  readNarcoticLotWorkbook,
  type NarcoticLotValue,
} from "./narcoticLot";

const inventory = rawInventory as InventoryData;
const STORAGE_KEY = "hospital-inventory-app-state-v2";
const LOCAL_UPDATED_AT_KEY = "hospital-inventory-local-updated-at-v1";
const SYNC_CLIENT_KEY = "hospital-inventory-sync-client-v1";
const STOCK_CODE_REPLACEMENTS = new Map([["0.9% NaKCl 20mEq/100ml btl", "XNAK20"]]);
const STOCK_FIELD_CORRECTIONS = new Map<
  string,
  Partial<Pick<StockDrug, "storage" | "storageType" | "warning">>
>([
  ["XATIV2W", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XATIV4W", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XLZPAM2", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XLZPAM4", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XBPCA5W", { warning: "" }],
  ["XEPIN", { storageType: "ROOM" }],
  ["XKETA5", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XKETA5W", { storage: "냉장보관(2-8℃)", storageType: "REFRIGERATED" }],
  ["XMEXO", { warning: "유사모양" }],
  ["XMVH", { storageType: "REFRIGERATED" }],
]);

type MainCategory = "stock" | "ecart" | "narcotic";
type EcartTab = "general" | "nicu";
type CheckStatus = "" | "good" | "bad";
type PrintPreviewMode = "single" | "all-stock" | "all-ecart" | "all-narcotic" | "round-summary" | "drug-labels";
type RoundSummaryMode = "ward" | "narcotic";
type AppMode = "admin" | "master-viewer" | "pharmacy-viewer" | "pharmacy-editor" | "pharmacy-locator" | "narcotic-viewer";
type DrugLabelMode = "stock" | "ecart" | "ecart-nicu" | "fluid" | "narcotic" | "pharmacy";
type DrugLabelSizeKey = "10x70" | "15x95" | "40x70" | "55x95" | "35x100";

const MASTER_KIND_FILTER_OPTIONS: { kind: MasterRowKind; label: string }[] = [
  { kind: "stock", label: "비품" },
  { kind: "psychotropic", label: "향정" },
  { kind: "narcotic", label: "마약" },
];

type DrugLabelData = {
  id: string;
  kind: DrugLabelMode;
  code: string;
  name: string;
  spec: string;
  storageLabel: string;
  storageTone: "room" | "cold" | "light" | "ecart";
  storage: string;
  roomId?: string;
  totalQuantity?: number;
  quantityLabel?: string;
  cautionLabels: string[];
  categoryLabel?: string;
  highRisk: boolean;
  doseCaution?: boolean;
  doseCheck?: boolean;
  fluidTone?: string;
};

type LabelModeOption = {
  mode: DrugLabelMode;
  label: string;
};

type LabelPrintSelection = {
  id: string;
  mode: DrugLabelMode;
  sizeKey: DrugLabelSizeKey;
  isCheckedMasterPrint?: boolean;
  roomId?: string;
  quantityOverride?: number;
  labelRow?: DrugLabelData;
};

type PrintableDrugLabel = LabelPrintSelection & {
  row: DrugLabelData;
  copyIndex: number;
};

function labelSizeCssVars(sizeKey: DrugLabelSizeKey) {
  const size = getDrugLabelSize(sizeKey);
  return {
    "--label-width-mm": size.widthMm,
    "--label-height-mm": size.heightMm,
  } as CSSProperties;
}

const DRUG_LABEL_PAPER = { widthMm: 210, heightMm: 297 };

function planDrugLabelsForA4(labels: PrintableDrugLabel[]) {
  const pages: PrintableDrugLabel[][] = [];
  let page: PrintableDrugLabel[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const label of labels) {
    const size = getDrugLabelSize(label.sizeKey);
    if (x > 0 && x + size.widthMm > DRUG_LABEL_PAPER.widthMm) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    if (page.length > 0 && y + size.heightMm > DRUG_LABEL_PAPER.heightMm) {
      pages.push(page);
      page = [];
      x = 0;
      y = 0;
      rowHeight = 0;
    }
    page.push(label);
    x += size.widthMm;
    rowHeight = Math.max(rowHeight, size.heightMm);
  }

  if (page.length > 0) pages.push(page);
  return pages;
}

type EditableStockItem = StockAllocation & {
  drug: StockDrug;
  checked: boolean;
  expiryDate: string;
  isEmptyInventoryPlaceholder?: boolean;
};

const EMPTY_NARCOTIC_STOCK_DRUG: StockDrug = {
  code: EMPTY_NARCOTIC_STOCK_CODE,
  genericName: "",
  productName: EMPTY_NARCOTIC_STOCK_LABEL,
  spec: "",
  storage: "",
  note: "",
  warning: "",
  storageType: "ROOM",
};

function makeEmptyNarcoticStockItem(roomId: string, checked: boolean): EditableStockItem {
  return {
    roomId,
    drugCode: EMPTY_NARCOTIC_STOCK_CODE,
    requiredQty: 0,
    drug: EMPTY_NARCOTIC_STOCK_DRUG,
    checked,
    expiryDate: "",
    isEmptyInventoryPlaceholder: true,
  };
}

function isEmptyNarcoticStockItem(item: EditableStockItem) {
  return item.isEmptyInventoryPlaceholder === true;
}

type EditableEcartItem = EcartItem & {
  checked: boolean;
  expiryDate: string;
};

type ChecklistState = ChecklistItem & {
  id: string;
  status: CheckStatus;
  note: string;
};

type EcartTarget = {
  id: string;
  label: string;
};

type EcartInspectionState = {
  items: EditableEcartItem[];
  checklist: ChecklistState[];
};

type PersistedAppState = {
  stockDrugs: StockDrug[];
  stockRooms: StockRoom[];
  stockAllocations: StockAllocation[];
  narcoticRooms: StockRoom[];
  narcoticDrugs: StockDrug[];
  narcoticAllocations: StockAllocation[];
  narcoticDrugCategories: Record<string, NarcoticCategory>;
  narcoticCheckedItems: Record<string, boolean>;
  narcoticExpiry: Record<string, string>;
  narcoticChecklistByRoom: Record<string, ChecklistState[]>;
  narcoticRoundSummaryDraft: RoundSummaryDraft | null;
  uninspectedNarcoticRoomIds: string[];
  checkedStock: Record<string, boolean>;
  stockExpiry: Record<string, string>;
  stockChecklistByRoom: Record<string, ChecklistState[]>;
  ecartByTarget: Record<string, EcartInspectionState>;
  roundSummaryDraft: RoundSummaryDraft | null;
  stockRoomUpdatedAt: Record<string, string>;
  uninspectedRoomIds: string[];
  narcoticLotAssignments: Record<string, NarcoticLotValue>;
  narcoticLotFileName: string;
  pharmacyLabels: PharmacySavedLabel[];
  pharmacyAdditionalRows: HospitalDrugLabelRow[];
  deletedPharmacyDrugCodes: string[];
};

type InspectionCycleResetState = Pick<
  PersistedAppState,
  "checkedStock" | "stockExpiry" | "stockChecklistByRoom" | "ecartByTarget" | "roundSummaryDraft" | "uninspectedRoomIds"
>;

type NewDrugForm = {
  code: string;
  genericName: string;
  productName: string;
  spec: string;
  storage: string;
  warning: string;
  category: "stock" | NarcoticCategory;
};

type PdfStatus = "idle" | "generating" | "ready" | "error";
type SyncMode = "off" | "idle" | "syncing" | "synced" | "error";

type SyncStatus = {
  mode: SyncMode;
  message: string;
  lastSyncedAt?: string;
};

type PullRemoteOptions = {
  silent?: boolean;
};

type StockGuideEntry = {
  label: string;
  stockRoomId?: string;
  ecartTargetId?: string;
  ecartTab?: EcartTab;
  ecartOnly?: boolean;
};

type StockGuideSection = {
  floor: string;
  rows: StockGuideEntry[][];
};

const STOCK_FLOOR_OPTIONS = ["지하 1층", "1층", "2층", "3층", "4층", "5층 ~ 12층"] as const;
type StockFloor = (typeof STOCK_FLOOR_OPTIONS)[number];

const hiddenStockRooms = new Set(["체외순환실"]);
const initialStockRooms = inventory.stock.rooms.filter((room) => !hiddenStockRooms.has(room.id));
const initialStockAllocations = inventory.stock.allocations.filter((allocation) => !hiddenStockRooms.has(allocation.roomId));
const firstStockRoom = initialStockRooms[0]?.id ?? "";
function getNarcoticChecklistDefaultState(checklistByRoom: Record<string, ChecklistState[]>, roomId: string) {
  const existing = checklistByRoom[roomId];
  if (existing) return normalizeChecklistRows(existing);
  return NARCOTIC_CHECKLIST.map((item, index) => ({
    ...item,
    id: `narcotic-${roomId}-${index}`,
    status: "good" as CheckStatus,
    note: "",
  }));
}

function loadPersistedState(): Partial<PersistedAppState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePersistedState(JSON.parse(raw) as Partial<PersistedAppState>) : {};
  } catch {
    return {};
  }
}

function normalizeDeletedPharmacyDrugCodes(codes?: string[]) {
  return [...new Set((codes ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean))];
}

function filterDeletedDrugRows<T extends { code: string }>(rows: T[], deletedCodes: ReadonlySet<string>) {
  return rows.filter((row) => !deletedCodes.has(row.code.trim().toUpperCase()));
}

function filterDeletedPharmacyLabelRows<T extends HospitalDrugLabelRow>(rows: T[], deletedCodes: ReadonlySet<string>) {
  return rows.filter((row) => row.drugType.trim() === "백신" || !deletedCodes.has(row.code.trim().toUpperCase()));
}

function filterDeletedDrugAllocations(allocations: StockAllocation[], deletedCodes: ReadonlySet<string>) {
  return allocations.filter((allocation) => !deletedCodes.has(allocation.drugCode.trim().toUpperCase()));
}

function filterDeletedDrugRecords<T>(record: Record<string, T>, deletedCodes: ReadonlySet<string>) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => {
    const parts = key.split("::");
    const code = (parts.length > 1 ? parts[1] : parts[0]).trim().toUpperCase();
    return !deletedCodes.has(code);
  }));
}

function filterDeletedEcartItems(state: EcartInspectionState, deletedCodes: ReadonlySet<string>): EcartInspectionState {
  return { ...state, items: state.items.filter((item) => !deletedCodes.has(item.code.trim().toUpperCase())) };
}

function getSyncClientId() {
  if (typeof window === "undefined") return "server";
  const current = window.localStorage.getItem(SYNC_CLIENT_KEY);
  if (current) return current;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(SYNC_CLIENT_KEY, next);
  return next;
}

function loadLocalUpdatedAt() {
  if (typeof window === "undefined") return new Date(0).toISOString();
  const savedUpdatedAt = window.localStorage.getItem(LOCAL_UPDATED_AT_KEY);
  if (savedUpdatedAt) return savedUpdatedAt;
  return window.localStorage.getItem(STORAGE_KEY) ? new Date().toISOString() : new Date(0).toISOString();
}

function normalizeStockCode(code: string, productName = "") {
  return STOCK_CODE_REPLACEMENTS.get(code) ?? STOCK_CODE_REPLACEMENTS.get(productName) ?? code;
}

type NormalizeStockCode = (code: string, productName?: string) => string;

function normalizeStockDrug(drug: StockDrug, normalizeCode: NormalizeStockCode = normalizeStockCode): StockDrug {
  const code = normalizeCode(drug.code, drug.productName);
  const corrected = {
    ...drug,
    ...STOCK_FIELD_CORRECTIONS.get(code),
    code,
  };
  return {
    ...corrected,
    warning: normalizeDrugWarning(corrected),
  };
}

function dedupeStockDrugs(
  drugs: StockDrug[],
  canonicalDrugs: readonly StockDrug[] = [],
  normalizeCode: NormalizeStockCode = normalizeStockCode,
  includeCanonicalDrugs = false,
) {
  const byCode = new Map<string, StockDrug>();
  for (const drug of applyCanonicalDrugNames(drugs.map((item) => normalizeStockDrug(item, normalizeCode)), canonicalDrugs)) {
    byCode.set(drug.code, { ...(byCode.get(drug.code) ?? drug), ...drug });
  }
  const deduped = [...byCode.values()];
  return includeCanonicalDrugs ? mergeGeneratedStockDrugs(deduped, canonicalDrugs, normalizeCode) : sortStockDrugsByName(deduped);
}

function normalizeStockAllocations(allocations: StockAllocation[], normalizeCode: NormalizeStockCode = normalizeStockCode) {
  return reconcileGeneratedAllocations(
    allocations,
    initialStockAllocations,
    initialStockRooms,
    inventory.stock.drugs,
    normalizeCode,
  );
}

function normalizeNarcoticAllocations(allocations: StockAllocation[]) {
  return reconcileGeneratedAllocations(allocations, NARCOTIC_ALLOCATIONS, NARCOTIC_ROOMS, NARCOTIC_DRUGS, normalizeNarcoticDrugCode);
}

function normalizeRooms(rooms: StockRoom[], generatedRooms: readonly StockRoom[]) {
  return mergeGeneratedRooms(rooms, generatedRooms);
}

function normalizeStockRooms(rooms: StockRoom[]) {
  return normalizeRooms(rooms, initialStockRooms).map((room) =>
    room.id === "IMJ" && !room.floor ? { ...room, floor: "1층" } : room,
  );
}

function normalizeNarcoticRooms(rooms: StockRoom[]) {
  return normalizeRooms(rooms, NARCOTIC_ROOMS);
}

function remapStockKeyRecord<T>(record?: Record<string, T>, normalizeCode: NormalizeStockCode = normalizeStockCode) {
  if (!record) return undefined;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const [roomId, drugCode, ...suffix] = key.split("::");
    next[roomId && drugCode ? [roomId, normalizeCode(drugCode), ...suffix].join("::") : key] = value;
  }
  return next;
}

function renameStockKeyRecord<T>(record: Record<string, T>, oldCode: string, newCode: string) {
  const next = { ...record };
  for (const [key, value] of Object.entries(record)) {
    const [roomId, drugCode, ...suffix] = key.split("::");
    if (roomId && drugCode === oldCode) {
      next[[roomId, newCode, ...suffix].join("::")] = value;
      delete next[key];
    }
  }
  return next;
}

function normalizeNarcoticCategories(record?: Record<string, NarcoticCategory>) {
  return {
    ...NARCOTIC_DRUG_CATEGORY_BY_CODE,
    ...(record
      ? Object.fromEntries(Object.entries(record).map(([code, category]) => [normalizeNarcoticDrugCode(normalizeStockCode(code)), category]))
      : {}),
  };
}

function normalizePersistedState(state: Partial<PersistedAppState>): Partial<PersistedAppState> {
  const ecartByTarget = state.ecartByTarget
    ? Object.fromEntries(Object.entries(state.ecartByTarget).map(([key, value]) => [key, normalizeEcartInspectionState(value)]))
    : undefined;
  return {
    ...state,
    stockDrugs: state.stockDrugs ? dedupeStockDrugs(state.stockDrugs, inventory.stock.drugs, normalizeStockCode, true) : undefined,
    stockRooms: state.stockRooms ? normalizeStockRooms(state.stockRooms) : undefined,
    stockAllocations: state.stockAllocations ? normalizeStockAllocations(state.stockAllocations) : undefined,
    narcoticRooms: state.narcoticRooms ? normalizeNarcoticRooms(state.narcoticRooms) : undefined,
    narcoticDrugs: state.narcoticDrugs ? dedupeStockDrugs(state.narcoticDrugs, NARCOTIC_DRUGS, normalizeNarcoticDrugCode, true) : undefined,
    narcoticAllocations: state.narcoticAllocations ? normalizeNarcoticAllocations(state.narcoticAllocations) : undefined,
    narcoticDrugCategories: normalizeNarcoticCategories(state.narcoticDrugCategories),
    narcoticCheckedItems: remapStockKeyRecord(state.narcoticCheckedItems, normalizeNarcoticDrugCode),
    narcoticExpiry: remapStockKeyRecord(state.narcoticExpiry, normalizeNarcoticDrugCode),
    narcoticChecklistByRoom: state.narcoticChecklistByRoom
      ? Object.fromEntries(Object.entries(state.narcoticChecklistByRoom).map(([roomId, rows]) => [roomId, normalizeChecklistRows(rows)]))
      : undefined,
    narcoticRoundSummaryDraft: "narcoticRoundSummaryDraft" in state ? (state.narcoticRoundSummaryDraft ?? null) : undefined,
    checkedStock: remapStockKeyRecord(state.checkedStock),
    stockExpiry: remapStockKeyRecord(state.stockExpiry),
    stockChecklistByRoom: state.stockChecklistByRoom
      ? Object.fromEntries(Object.entries(state.stockChecklistByRoom).map(([roomId, rows]) => [roomId, normalizeChecklistRows(rows)]))
      : undefined,
    ecartByTarget,
    uninspectedRoomIds: Array.isArray(state.uninspectedRoomIds) ? state.uninspectedRoomIds : undefined,
    uninspectedNarcoticRoomIds: Array.isArray(state.uninspectedNarcoticRoomIds) ? state.uninspectedNarcoticRoomIds : undefined,
    narcoticLotAssignments: remapStockKeyRecord(state.narcoticLotAssignments, normalizeNarcoticDrugCode),
    pharmacyLabels: Array.isArray(state.pharmacyLabels) ? state.pharmacyLabels : undefined,
    pharmacyAdditionalRows: Array.isArray(state.pharmacyAdditionalRows)
      ? state.pharmacyAdditionalRows.map(normalizePharmacyLabelMasterRow)
      : undefined,
    deletedPharmacyDrugCodes: Array.isArray(state.deletedPharmacyDrugCodes)
      ? normalizeDeletedPharmacyDrugCodes(state.deletedPharmacyDrugCodes)
      : undefined,
  };
}

function drugTitle(drug: StockDrug) {
  return drugDisplayName(drug);
}

function splitStockItems(items: EditableStockItem[]) {
  return {
    refrigerated: items.filter((item) => isRefrigeratedDrug(item.drug)),
    roomTemperature: items.filter((item) => !isRefrigeratedDrug(item.drug)),
  };
}

function storageBadge(drug: StockDrug) {
  const label = storageDisplayLabel(drug);
  const tone = label === "냉장" ? "blue" : label === "차광" ? "amber" : "gray";
  return <span className={`badge ${tone}`}>{label}</span>;
}

function warningBadge(text: string) {
  if (!text) return <span className="empty">-</span>;
  const tone = text.includes("고위험") ? "red" : "amber";
  return <span className={`badge ${tone}`}>{text}</span>;
}

function drugRuleFieldsFromEcartItem(item: EcartItem): DrugRuleFields {
  return {
    code: item.code,
    genericName: item.name,
    productName: item.name,
    spec: item.dosage,
    warning: "",
  };
}

const FORTY_NARCOTIC_DOSE_CONFIRM_LABEL = "\uc6a9\ub7c9\ud655\uc778";

function renderDoseHighlightedText(text: string) {
  return getDoseHighlightTextParts(text).map((part, index) =>
    part.highlighted ? (
      <span className="dose-number-highlight" key={`${part.text}-${index}`}>
        {part.text}
      </span>
    ) : (
      <Fragment key={`${part.text}-${index}`}>{part.text}</Fragment>
    ),
  );
}

function renderLabelName(row: DrugLabelData, highlightDose = false) {
  const parenthetical = row.name.match(/^(.+?)(\([^()]+\))$/);
  if (!parenthetical) return highlightDose ? renderDoseHighlightedText(row.name) : row.name;
  return (
    <>
      {highlightDose ? renderDoseHighlightedText(parenthetical[1]) : parenthetical[1]}
      <span className="drug-name-parenthetical">{highlightDose ? renderDoseHighlightedText(parenthetical[2]) : parenthetical[2]}</span>
    </>
  );
}

function shouldHighlightDoseInLabel(row: DrugLabelData) {
  return row.doseCaution || row.doseCheck || labelFlagLabels(row).some((label) => /용량\s*(?:주의|확인)/.test(label));
}

function labelCodeStorageBadges(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  if (isEcartLabelKind(row.kind) || row.kind === "fluid") return [];

  const storageText = [row.storageLabel, row.storage].join(" ");
  const badges: { label: string; tone: DrugLabelData["storageTone"] }[] = [];
  if (/냉동/.test(storageText)) {
    badges.push({ label: "냉동", tone: "cold" });
  } else if (/냉장|2\s*[-~∼～]\s*8/.test(storageText)) {
    badges.push({ label: "냉장", tone: "cold" });
  } else if (row.storageTone !== "room" && row.storageLabel) {
    badges.push({ label: row.storageLabel, tone: row.storageTone });
  }

  if (shouldMoveLightProtectionToCodeBadge(row, sizeKey) && !badges.some((badge) => badge.label === "차광")) {
    badges.push({ label: "차광", tone: "light" });
  }

  return badges;
}

function renderGeneralDrugLabelName(row: DrugLabelData, sizeKey: DrugLabelSizeKey, highlightDose: boolean) {
  const lines = getGeneralDrugLabelNameLines(row.name, sizeKey);
  if (lines.length <= 1) return renderLabelName(row, highlightDose);

  return (
    <span className={`drug-label-name-lines drug-label-name-lines-${Math.min(lines.length, 5)}`}>
      {lines.map((line, index) => (
        <span className="drug-label-name-line" key={`${line}-${index}`}>
          {highlightDose ? renderDoseHighlightedText(line) : line}
        </span>
      ))}
    </span>
  );
}

function renderDrugLabelName(
  row: DrugLabelData,
  renderedKind: DrugLabelMode,
  sizeKey: DrugLabelSizeKey,
  isCheckedMasterPrint = false,
) {
  const highlightDose = shouldHighlightDoseInLabel(row);
  if (
    (renderedKind === "stock" && (sizeKey === "10x70" || sizeKey === "15x95" || sizeKey === "55x95" || sizeKey === "35x100")) ||
    (renderedKind === "pharmacy" && (sizeKey === "10x70" || sizeKey === "15x95")) ||
    (renderedKind === "narcotic" && isCheckedMasterPrint && (sizeKey === "10x70" || sizeKey === "15x95"))
  ) {
    return renderGeneralDrugLabelName(row, sizeKey, highlightDose);
  }
  return renderLabelName(row, highlightDose);
}

function renderNarcoticFortyLabelName(row: DrugLabelData) {
  const lines = getNarcoticFortyLabelNameLines(row.name);
  const lineCountClass = `drug-label-name-lines-${Math.min(lines.length, 4)}`;
  const highlightDose = shouldHighlightDoseInLabel(row);
  return (
    <span className={`drug-label-name-lines ${lineCountClass}`}>
      {lines.map((line, index) => (
        <span className="drug-label-name-line" key={`${line}-${index}`}>
          {highlightDose ? renderDoseHighlightedText(line) : line}
        </span>
      ))}
    </span>
  );
}

function renderNarcoticFortyTopline(row: DrugLabelData) {
  const label = [row.categoryLabel ?? "\ub9c8\uc57d/\ud5a5\uc815", row.doseCaution || row.doseCheck ? FORTY_NARCOTIC_DOSE_CONFIRM_LABEL : ""]
    .filter(Boolean)
    .join(" / ");
  return (
    <div className="drug-label-topline drug-label-narcotic-forty-topline">
      <span className="drug-label-warning-flag">{label}</span>
      {row.totalQuantity !== undefined ? <small className="label-quantity-circle drug-label-narcotic-forty-quantity">{row.totalQuantity}</small> : null}
    </div>
  );
}

function renderNarcoticFortyFooter(row: DrugLabelData) {
  const category = row.categoryLabel ?? "";
  const storageLabels = [
    labelCodeStorageBadges(row).find((badge) => badge.tone === "cold")?.label,
    isLightProtectedLabel(row) ? "차광" : "",
  ].filter(Boolean);
  const label = [category, ...storageLabels].filter(Boolean).join(" / ");
  return <div className="drug-label-narcotic-footer">{label}</div>;
}

function buildHospitalDrugLabelData(
  row: HospitalDrugLabelRow,
  mode: Extract<DrugLabelMode, "stock" | "fluid" | "pharmacy"> = "pharmacy",
): DrugLabelData {
  const storageLabel = getHospitalDrugStorageLabel(row);
  const cautionLabels = getHospitalDrugLabelWarnings(row);
  const highRisk = cautionLabels.some((label) => label.includes("고위험"));
  const spec = [row.strength, row.spec, row.package].filter(Boolean).join(" ");
  return {
    id: mode === "pharmacy" ? makeHospitalDrugLabelId(row) : `${mode}-hospital-${row.code}`,
    kind: mode,
    code: row.code,
    name: mode === "fluid" ? formatFluidLabelName(row.name) : cleanDrugLabelName(row.name, highRisk),
    spec: formatStockLabelSpec(spec),
    storageLabel,
    storageTone: labelStorageTone(storageLabel),
    storage: row.storage,
    cautionLabels,
    highRisk,
    doseCaution: row.doseCaution,
    doseCheck: row.doseCheck,
    fluidTone: mode === "fluid" ? row.fluidColor || fluidLabelTone({ code: row.code, genericName: row.koreanName, productName: row.name, spec }) : undefined,
  };
}

function buildHospitalControlledDrugLabelData(row: HospitalDrugLabelRow, doseCaution = false): DrugLabelData {
  const categoryLabel = getHospitalDrugControlledCategory(row);
  const storageLabel = getHospitalDrugStorageLabel(row);
  return {
    id: makeHospitalControlledDrugLabelId(row),
    kind: "narcotic",
    code: row.code,
    name: stripHospitalDrugControlledPrefix(row.name),
    spec: formatStockLabelSpec([row.strength, row.spec, row.package].filter(Boolean).join(" ")),
    storageLabel,
    storageTone: labelStorageTone(storageLabel),
    storage: row.storage,
    cautionLabels: categoryLabel ? [categoryLabel] : [],
    categoryLabel,
    highRisk: false,
    doseCaution,
    doseCheck: row.doseCheck,
  };
}

function buildEcartLabelData(
  item: EcartItem,
  totalQuantity: number,
  suffix: string,
  kind: Extract<DrugLabelMode, "ecart" | "ecart-nicu"> = "ecart",
  fluidTone?: string,
  hospitalRow?: HospitalDrugLabelRow,
): DrugLabelData {
  const fields = drugRuleFieldsFromEcartItem(item);
  return {
    id: `${kind}-${suffix}-${item.code}-${item.name}`,
    kind,
    code: item.code,
    name: item.name,
    spec: item.dosage,
    storageLabel: "E-cart",
    storageTone: "ecart",
    storage: "E-cart",
    totalQuantity,
    quantityLabel: "수량",
    cautionLabels: [...new Set([...getPolicyCautionLabels(fields), ...(hospitalRow ? getHospitalDrugLabelWarnings(hospitalRow) : [])])],
    highRisk: Boolean(hospitalRow?.highRisk) || isHighRiskDrug(fields),
    fluidTone,
  };
}

function isEcartLabelKind(kind: DrugLabelMode) {
  return kind === "ecart" || kind === "ecart-nicu";
}

function usesHospitalDrugListForMode(mode: DrugLabelMode) {
  return isEcartLabelKind(mode) || mode === "stock" || mode === "fluid" || mode === "narcotic" || mode === "pharmacy";
}

function getEcartLabelQuantity(state: EcartInspectionState, item: EcartItem) {
  const current = state.items.find((row) => row.code === item.code || row.name === item.name);
  return current?.quantity ?? item.quantity;
}

function drugCautionLabels(drug: DrugRuleFields) {
  return [...getPolicyCautionLabels(drug), isHighRiskDrug(drug) ? "고위험" : ""].filter(Boolean);
}

function labelCautionLabels(row: DrugLabelData) {
  return normalizeLabelCautionLabels(row.cautionLabels, row.highRisk);
}

function labelFlagLabels(row: DrugLabelData) {
  return getDrugLabelFlagLabels(row);
}

function isLightProtectedLabel(row: DrugLabelData) {
  return labelFlagLabels(row).some((label) => label.includes("차광"));
}

function pharmacyRowFromDraft(draft: PharmacyLabelDraft): HospitalDrugLabelRow {
  const warnings = new Set(draft.warnings);
  return {
    code: draft.code.trim(),
    itemCode: draft.itemCode.trim(),
    name: draft.printable.title,
    koreanName: draft.printable.koreanName,
    strength: draft.printable.strength,
    drugType: draft.drugTypes[0] ?? draft.category,
    pharmacyLabelTypes: draft.drugTypes,
    spec: draft.printable.strength,
    package: "",
    storage: warnings.has("냉동") ? "냉동" : warnings.has("냉장") ? "냉장" : "",
    lightProtected: warnings.has("차광"),
    inHospital: true,
    similarLook: warnings.has("유사모양"),
    similarSound: warnings.has("유사발음"),
    doseCaution: warnings.has("용량주의"),
    doseCheck: warnings.has("용량확인"),
    highRisk: warnings.has("고위험의약품"),
    hazardous: warnings.has("위해의약품"),
    highRiskCategory: warnings.has("고위험의약품") ? "고위험의약품" : "",
    atc: draft.atc,
    expiry: draft.expiry,
    location: draft.location,
    nameCaution: warnings.has("이름주의"),
    border: draft.style.outerBorderPx > 0,
    borderColor: draft.style.outerBorderColor,
    oralAnticancer: draft.category === "항암제",
  };
}

function applySharedPharmacyMasterFields(base: HospitalDrugLabelRow, master: HospitalDrugLabelRow) {
  return {
    ...base,
    name: master.name || base.name,
    koreanName: master.koreanName || base.koreanName,
    strength: master.strength || base.strength,
    storage: master.storage,
    lightProtected: master.lightProtected,
    highCost: master.highCost,
    hazardous: master.hazardous,
    narcotic: master.narcotic,
    psychotropic: master.psychotropic,
    anticancer: master.anticancer,
    eCart: master.eCart,
    eCartNicu: master.eCartNicu,
    similarLook: master.similarLook,
    similarSound: master.similarSound,
    doseCaution: master.doseCaution,
    doseCheck: master.doseCheck,
    needsDiluent: master.needsDiluent,
    needsNeedle: master.needsNeedle,
    highRisk: master.highRisk,
    nameCaution: master.nameCaution,
  };
}

function applySharedMasterToStockDrug(drug: StockDrug, master: HospitalDrugLabelRow | undefined): StockDrug {
  if (!master) return drug;
  const warning = [
    master.highRisk ? "고위험의약품" : "",
    master.hazardous ? "위해의약품" : "",
    master.similarLook ? "유사모양" : "",
    master.similarSound ? "유사발음" : "",
    master.doseCaution ? "용량주의" : "",
    master.doseCheck ? "용량확인" : "",
    master.needsDiluent ? "<용해액 필요>" : "",
    master.needsNeedle ? "<니들 필요>" : "",
    master.nameCaution ? "이름주의" : "",
    master.highCost ? "고가약" : "",
    master.narcotic ? "마약" : "",
    master.psychotropic ? "향정" : "",
    master.anticancer ? "항암제" : "",
    master.eCart ? "E-cart" : "",
    master.eCartNicu ? "E-cart(NICU)" : "",
  ].filter(Boolean).join(", ");
  const storage = master.storage || (master.lightProtected ? "차광" : "실온");
  return {
    ...drug,
    genericName: master.koreanName || drug.genericName,
    productName: master.name || drug.productName,
    spec: master.strength || drug.spec,
    storage,
    warning,
    note: warning,
    storageType: master.lightProtected ? "LIGHT_PROTECTED" : inferStorageType(storage),
  };
}

function pharmacyMasterToStockDrug(master: HospitalDrugLabelRow): StockDrug {
  const code = normalizeStockCode(master.code, master.name);
  return applySharedMasterToStockDrug(
    {
      code,
      genericName: master.koreanName,
      productName: master.name || code,
      spec: master.strength || master.spec || master.package,
      storage: master.storage || "실온",
      note: "",
      warning: "",
      storageType: inferStorageType(master.storage || "실온"),
    },
    master,
  );
}

function mergePharmacyRows(base: HospitalDrugLabelRow[], additional: HospitalDrugLabelRow[]) {
  const byCode = new Map(base.map((row) => [row.code, row]));
  for (const row of additional) {
    const sourceRow = byCode.get(row.code);
    const isSourceVaccine = sourceRow?.drugType.trim() === "백신";
    byCode.set(row.code, {
      ...(sourceRow ?? {}),
      ...row,
      ...(isSourceVaccine ? { drugType: "백신", inHospital: true } : {}),
    });
  }
  return [...byCode.values()];
}

function pharmacyRowsFromSavedLabels(labels: PharmacySavedLabel[]) {
  return labels
    .filter((label) => label.code.trim())
    .sort((left, right) => (left.savedAt ?? "").localeCompare(right.savedAt ?? ""))
    .map(pharmacyRowFromDraft);
}

function usesCompactGeneralLabelStoragePanel(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  return (sizeKey === "10x70" || sizeKey === "15x95") && (row.kind === "stock" || row.kind === "pharmacy");
}

function isStorageLabel(label: string) {
  return label.includes("차광") || label.includes("냉장") || label.includes("냉동");
}

function hasControlledCautionLabel(labels: string[]) {
  return labels.some((label) => label.includes("마약") || label.includes("향정"));
}

function labelToplineFlagLabels(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  const labels = labelFlagLabels(row);
  const usesCompactStoragePanel = usesCompactGeneralLabelStoragePanel(row, sizeKey)
    || ((sizeKey === "10x70" || sizeKey === "15x95") && row.kind === "narcotic");
  if (usesCompactStoragePanel) {
    const compactLabels = labels.filter((label) => !isStorageLabel(label));
    return hasControlledCautionLabel(compactLabels)
      ? compactLabels.filter((label) => !label.includes("고위험"))
      : compactLabels;
  }
  if (!shouldMoveLightProtectionToCodeBadge(row, sizeKey)) return labels;
  return labels.filter((label) => !label.includes("차광"));
}

function isRoundToplineCaution(label: string) {
  return label.includes("용량주의") || label.includes("유사모양") || label.includes("유사발음");
}

function isRedPriorityCaution(label: string) {
  return label.includes("고위험") || label.includes("용량확인") || label.includes("이름주의") || isRoundToplineCaution(label);
}

function hasRedPriorityLabel(row: DrugLabelData) {
  return labelFlagLabels(row).some(isRedPriorityCaution);
}

function shouldMoveLightProtectionToCodeBadge(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  if (!isLightProtectedLabel(row)) return false;
  if (row.kind === "narcotic" && (sizeKey === "10x70" || sizeKey === "15x95")) return true;
  if (usesCompactGeneralLabelStoragePanel(row, sizeKey)) return true;
  if (row.highRisk) return true;
  return (sizeKey === "10x70" || sizeKey === "15x95") && hasRedPriorityLabel(row);
}

function splitLabelToplineFlags(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  const labels = labelToplineFlagLabels(row, sizeKey);
  const splitRoundCautions = !row.highRisk && isLightProtectedLabel(row) && (sizeKey === "55x95" || sizeKey === "35x100");
  if (!splitRoundCautions) return { textLabels: labels, roundLabels: [] };
  return {
    textLabels: labels.filter((label) => !isRoundToplineCaution(label)),
    roundLabels: labels.filter(isRoundToplineCaution),
  };
}

function labelCautionBadgeClass(label: string) {
  if (label === "마약") return "narcotic-group";
  if (label === "향정") return "psychotropic";
  if (label.includes("고위험")) return "red";
  return "amber";
}

function shouldBreakCompactCautions(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  return (sizeKey === "10x70" || sizeKey === "15x95")
    && (row.kind === "stock" || row.kind === "pharmacy" || row.kind === "narcotic");
}

function renderToplineCaution(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  const { textLabels, roundLabels } = splitLabelToplineFlags(row, sizeKey);
  if (textLabels.length === 0 && roundLabels.length === 0) return <span className="drug-label-warning-spacer" />;
  const shouldBreak = shouldBreakCompactCautions(row, sizeKey) && textLabels.length > 1;
  const text = textLabels.join(" / ");
  const renderedText = shouldBreak
    ? textLabels.map((label, index) => <Fragment key={`${label}-${index}`}>{index > 0 ? <br /> : null}{label}</Fragment>)
    : text;
  if (roundLabels.length === 0) return <span className="drug-label-warning-flag">{renderedText}</span>;
  return (
    <span className="drug-label-warning-group">
      {textLabels.length > 0 ? <span className="drug-label-warning-flag">{renderedText}</span> : null}
      {roundLabels.map((label) => (
        <span className="drug-label-warning-chip" key={label}>
          {label}
        </span>
      ))}
    </span>
  );
}

function renderLabelTopline(row: DrugLabelData, sizeKey?: DrugLabelSizeKey) {
  const codeStorageBadges = labelCodeStorageBadges(row, sizeKey);
  const showEndPanel = codeStorageBadges.length > 0 || isEcartLabelKind(row.kind) || row.totalQuantity !== undefined;
  return (
    <div className="drug-label-topline">
      {renderToplineCaution(row, sizeKey)}
      {showEndPanel ? (
        <div className="drug-label-code-stack">
          <div className="drug-label-code-line">
            {codeStorageBadges.map((badge) => (
              <small className={`label-code-storage ${badge.tone}`} key={`${badge.label}-${badge.tone}`}>
                {badge.label}
              </small>
            ))}
            <strong>{row.code}</strong>
          </div>
          {isEcartLabelKind(row.kind) ? <span className="label-storage-badge ecart">E-cart</span> : null}
          {row.totalQuantity !== undefined ? <small className="label-quantity-circle">{row.totalQuantity}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function renderLabelSpec(row: DrugLabelData) {
  if (!isEcartLabelKind(row.kind) || !row.spec) return null;
  return <p>{row.spec}</p>;
}

function renderLabelBottomCaution(row: DrugLabelData) {
  const cautionText = labelFlagLabels(row).join(" / ");
  return cautionText ? <em className="drug-label-caution-bottom">{cautionText}</em> : null;
}

function updateChecklistRows(items: ChecklistState[], id: string, patch: Partial<ChecklistState>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function defaultRoundInspectionPeriod() {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

export function App() {
  const appMode = useMemo(() => getInitialAppMode(), []);
  const isViewerMode = appMode !== "admin";
  const isReadOnlyViewer = appMode === "master-viewer" || appMode === "pharmacy-viewer";
  const isPharmacyViewer = appMode === "pharmacy-viewer";
  const isPharmacyEditor = appMode === "pharmacy-editor";
  const isPharmacyLocator = appMode === "pharmacy-locator";
  const isNarcoticViewer = appMode === "narcotic-viewer";
  const canEditMaster = canEditMasterAssignments(appMode);
  const defaultNewDrugCategory: NewDrugForm["category"] = isNarcoticViewer ? "향정" : "stock";
  const persistedState = useMemo(loadPersistedState, []);
  const initialDeletedPharmacyDrugCodes = normalizeDeletedPharmacyDrugCodes(persistedState.deletedPharmacyDrugCodes);
  const initialDeletedPharmacyDrugCodeSet = new Set(initialDeletedPharmacyDrugCodes);
  const [deletedPharmacyDrugCodes, setDeletedPharmacyDrugCodes] = useState(initialDeletedPharmacyDrugCodes);
  const [mainCategory, setMainCategory] = useState<MainCategory>(isNarcoticViewer ? "narcotic" : "stock");
  const [showMaster, setShowMaster] = useState(isReadOnlyViewer);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [roundSummaryMode, setRoundSummaryMode] = useState<RoundSummaryMode>("ward");
  const [activeRoom, setActiveRoom] = useState(firstStockRoom);
  const [activeEcartTab, setActiveEcartTab] = useState<EcartTab>("general");
  const [activeEcartTargetId, setActiveEcartTargetId] = useState(firstEcartTargetId);
  const [stockDrugs, setStockDrugs] = useState<StockDrug[]>(() =>
    filterDeletedDrugRows(
      dedupeStockDrugs(persistedState.stockDrugs ?? inventory.stock.drugs, inventory.stock.drugs, normalizeStockCode, true),
      initialDeletedPharmacyDrugCodeSet,
    ),
  );
  const [stockRooms, setStockRooms] = useState<StockRoom[]>(
    (persistedState.stockRooms ?? initialStockRooms).filter((room) => !hiddenStockRooms.has(room.id)),
  );
  const [stockAllocations, setStockAllocations] = useState<StockAllocation[]>(
    filterDeletedDrugAllocations(
      (persistedState.stockAllocations ?? initialStockAllocations).filter((allocation) => !hiddenStockRooms.has(allocation.roomId)),
      initialDeletedPharmacyDrugCodeSet,
    ),
  );
  const [narcoticDrugs, setNarcoticDrugs] = useState<StockDrug[]>(() =>
    filterDeletedDrugRows(
      dedupeStockDrugs(persistedState.narcoticDrugs ?? [...NARCOTIC_DRUGS], NARCOTIC_DRUGS, normalizeNarcoticDrugCode, true),
      initialDeletedPharmacyDrugCodeSet,
    ),
  );
  const [narcoticAllocations, setNarcoticAllocations] = useState<StockAllocation[]>(() =>
    filterDeletedDrugAllocations(
      normalizeNarcoticAllocations(persistedState.narcoticAllocations ?? [...NARCOTIC_ALLOCATIONS]),
      initialDeletedPharmacyDrugCodeSet,
    ),
  );
  const [narcoticRooms, setNarcoticRooms] = useState<StockRoom[]>(() =>
    normalizeNarcoticRooms(persistedState.narcoticRooms ?? [...NARCOTIC_ROOMS]),
  );
  const [narcoticDrugCategories, setNarcoticDrugCategories] = useState<Record<string, NarcoticCategory>>(
    persistedState.narcoticDrugCategories ?? normalizeNarcoticCategories(),
  );
  const [checkedStock, setCheckedStock] = useState<Record<string, boolean>>(persistedState.checkedStock ?? {});
  const [stockExpiry, setStockExpiry] = useState<Record<string, string>>(persistedState.stockExpiry ?? {});
  const [stockChecklistByRoom, setStockChecklistByRoom] = useState<Record<string, ChecklistState[]>>(
    persistedState.stockChecklistByRoom ?? {},
  );
  const [ecartByTarget, setEcartByTarget] = useState<Record<string, EcartInspectionState>>(
    Object.fromEntries(Object.entries(persistedState.ecartByTarget ?? {}).map(([key, state]) => [
      key,
      filterDeletedEcartItems(state, initialDeletedPharmacyDrugCodeSet),
    ])),
  );
  const [roundSummaryDraft, setRoundSummaryDraft] = useState<RoundSummaryDraft | null>(
    persistedState.roundSummaryDraft ?? null,
  );
  const [narcoticRoundSummaryDraft, setNarcoticRoundSummaryDraft] = useState<RoundSummaryDraft | null>(
    persistedState.narcoticRoundSummaryDraft ?? null,
  );
  const [stockRoomUpdatedAt, setStockRoomUpdatedAt] = useState<Record<string, string>>(
    persistedState.stockRoomUpdatedAt ?? {},
  );
  const [uninspectedRoomIds, setUninspectedRoomIds] = useState<string[]>(persistedState.uninspectedRoomIds ?? []);
  const [query, setQuery] = useState("");
  const [masterQuery, setMasterQuery] = useState("");
  const [masterKindFilter, setMasterKindFilter] = useState<Record<MasterRowKind, boolean>>(() => getInitialMasterKindFilter(appMode));
  const [masterQuickPlacement, setMasterQuickPlacement] = useState<"side" | "bottom">("side");
  const [labelQuery, setLabelQuery] = useState("");
  const [labelSelectedCodes, setLabelSelectedCodes] = useState<string[]>([]);
  const [labelPrintSelections, setLabelPrintSelections] = useState<LabelPrintSelection[]>([]);
  const [labelCopies, setLabelCopies] = useState(1);
  const [labelMode, setLabelMode] = useState<DrugLabelMode>("stock");
  const [labelSize, setLabelSize] = useState<DrugLabelSizeKey>("10x70");
  const [isDrugLabelPanelOpen, setIsDrugLabelPanelOpen] = useState(false);
  const [isPharmacyLabelWorkspaceOpen, setIsPharmacyLabelWorkspaceOpen] = useState(
    shouldOpenPharmacyWorkspaceInitially(appMode),
  );
  const [hospitalDrugLabelRows, setHospitalDrugLabelRows] = useState<HospitalDrugLabelRow[]>([]);
  const [isHospitalDrugLabelsLoading, setIsHospitalDrugLabelsLoading] = useState(false);
  const [pharmacyHospitalDrugLabelRows, setPharmacyHospitalDrugLabelRows] = useState<HospitalDrugLabelRow[]>([]);
  const [pharmacyAdditionalRows, setPharmacyAdditionalRows] = useState<HospitalDrugLabelRow[]>(
    filterDeletedDrugRows(persistedState.pharmacyAdditionalRows ?? [], initialDeletedPharmacyDrugCodeSet),
  );
  const [pharmacyLabelMatchRows, setPharmacyLabelMatchRows] = useState<PharmacyLabelMatchRow[]>([]);
  const [isPharmacyLabelMatchesLoading, setIsPharmacyLabelMatchesLoading] = useState(false);
  const [savedPharmacyLabels, setSavedPharmacyLabels] = useState<PharmacySavedLabel[]>(() =>
    filterDeletedDrugRows(
      persistedState.pharmacyLabels ?? (typeof window === "undefined" ? [] : loadSavedPharmacyLabelsFromStorage(window.localStorage)),
      initialDeletedPharmacyDrugCodeSet,
    ),
  );
  const restoredWorkbookLabelSettingsRef = useRef(false);
  const deletedPharmacyDrugCodeSet = useMemo(
    () => new Set(normalizeDeletedPharmacyDrugCodes(deletedPharmacyDrugCodes)),
    [deletedPharmacyDrugCodes],
  );
  const [pharmacyPrintDrafts, setPharmacyPrintDrafts] = useState<PharmacyLabelDraft[]>([]);
  const [pharmacyPrintPaper, setPharmacyPrintPaper] = useState<"A4" | "A3">("A4");
  const [targetRooms, setTargetRooms] = useState<string[]>([]);
  const [newAssignment, setNewAssignment] = useState({ drugCode: "", count: 1 });
  const [assignmentDrugQuery, setAssignmentDrugQuery] = useState("");
  const [newDrug, setNewDrug] = useState<NewDrugForm>({
    code: "",
    genericName: "",
    productName: "",
    spec: "",
    storage: "실온보관",
    warning: "",
    category: defaultNewDrugCategory,
  });
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomFloor, setNewRoomFloor] = useState<StockFloor>("1층");
  const [renameDrugForm, setRenameDrugForm] = useState({ oldCode: "", newCode: "" });
  const [isMobileMode, setIsMobileMode] = useState(false);
  const [narcoticActiveRoom, setNarcoticActiveRoom] = useState(FIRST_NARCOTIC_ROOM);
  const [narcoticCheckedItems, setNarcoticCheckedItems] = useState<Record<string, boolean>>(persistedState.narcoticCheckedItems ?? {});
  const [narcoticExpiry, setNarcoticExpiry] = useState<Record<string, string>>(persistedState.narcoticExpiry ?? {});
  const [narcoticChecklistByRoom, setNarcoticChecklistByRoom] = useState<Record<string, ChecklistState[]>>(
    persistedState.narcoticChecklistByRoom ?? {},
  );
  const [uninspectedNarcoticRoomIds, setUninspectedNarcoticRoomIds] = useState<string[]>(
    persistedState.uninspectedNarcoticRoomIds ?? [],
  );
  const [narcoticLotAssignments, setNarcoticLotAssignments] = useState<Record<string, NarcoticLotValue>>(
    persistedState.narcoticLotAssignments ?? {},
  );
  const [narcoticExcelFileName, setNarcoticExcelFileName] = useState(persistedState.narcoticLotFileName ?? "");
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [showViewerLinks, setShowViewerLinks] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ mode: "syncing", message: "자동 저장 서버 연결 중..." });
  const [isSyncConfigReady, setIsSyncConfigReady] = useState(false);
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>("idle");
  const [pdfDownload, setPdfDownload] = useState<PdfDownloadResult | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [returnToPharmacyWorkspaceAfterPreview, setReturnToPharmacyWorkspaceAfterPreview] = useState(false);
  const [printPreviewMode, setPrintPreviewMode] = useState<PrintPreviewMode>("single");
  const reportRef = useRef<HTMLDivElement>(null);
  const printPreviewRef = useRef<HTMLDivElement>(null);
  const narcoticExcelInputRef = useRef<HTMLInputElement>(null);
  const syncClientId = useMemo(getSyncClientId, []);
  const remoteShaRef = useRef<string | undefined>(undefined);
  const syncInitializedRef = useRef(false);
  const pendingPushRef = useRef(false);
  const pullInFlightRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const didHydrateRef = useRef(false);
  const hasUnsavedLocalChangesRef = useRef(false);
  const pushTimerRef = useRef<number | undefined>(undefined);
  const localUpdatedAtRef = useRef(loadLocalUpdatedAt());
  const latestStateRef = useRef<PersistedAppState | null>(null);

  const persistedAppState = useMemo<PersistedAppState>(
    () => ({
      stockDrugs,
      stockRooms,
      stockAllocations,
      narcoticRooms,
      narcoticDrugs,
      narcoticAllocations,
      narcoticDrugCategories,
      narcoticCheckedItems,
      narcoticExpiry,
      narcoticChecklistByRoom,
      narcoticRoundSummaryDraft,
      uninspectedNarcoticRoomIds,
      checkedStock,
      stockExpiry,
      stockChecklistByRoom,
      ecartByTarget,
      roundSummaryDraft,
      stockRoomUpdatedAt,
      uninspectedRoomIds,
      narcoticLotAssignments,
      narcoticLotFileName: narcoticExcelFileName,
      pharmacyLabels: savedPharmacyLabels,
      pharmacyAdditionalRows,
      deletedPharmacyDrugCodes,
    }),
    [
      checkedStock,
      ecartByTarget,
      narcoticAllocations,
      narcoticCheckedItems,
      narcoticChecklistByRoom,
      narcoticDrugCategories,
      narcoticDrugs,
      narcoticRooms,
      narcoticRoundSummaryDraft,
      roundSummaryDraft,
      narcoticExcelFileName,
      narcoticExpiry,
      narcoticLotAssignments,
      stockAllocations,
      stockChecklistByRoom,
      stockDrugs,
      stockExpiry,
      stockRoomUpdatedAt,
      stockRooms,
      uninspectedNarcoticRoomIds,
      uninspectedRoomIds,
      savedPharmacyLabels,
      pharmacyAdditionalRows,
      deletedPharmacyDrugCodes,
    ],
  );

  function removePharmacyDrugsFromApp(codes: string[]) {
    const deletedCodes = new Set(normalizeDeletedPharmacyDrugCodes(codes));
    if (deletedCodes.size === 0) return;
    setPharmacyHospitalDrugLabelRows((previous) => filterDeletedPharmacyLabelRows(previous, deletedCodes));
    setHospitalDrugLabelRows((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setPharmacyAdditionalRows((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setPharmacyLabelMatchRows((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setPharmacyPrintDrafts((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setSavedPharmacyLabels((previous) => {
      const next = filterDeletedDrugRows(previous, deletedCodes);
      if (typeof window !== "undefined") writeSavedPharmacyLabelsToStorage(window.localStorage, next);
      return next;
    });
    setStockDrugs((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setStockAllocations((previous) => filterDeletedDrugAllocations(previous, deletedCodes));
    setNarcoticDrugs((previous) => filterDeletedDrugRows(previous, deletedCodes));
    setNarcoticAllocations((previous) => filterDeletedDrugAllocations(previous, deletedCodes));
    setNarcoticDrugCategories((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setCheckedStock((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setStockExpiry((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setNarcoticCheckedItems((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setNarcoticExpiry((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setNarcoticLotAssignments((previous) => filterDeletedDrugRecords(previous, deletedCodes));
    setEcartByTarget((previous) => Object.fromEntries(Object.entries(previous).map(([key, state]) => [
      key,
      filterDeletedEcartItems(state, deletedCodes),
    ])));
    setLabelSelectedCodes((previous) => previous.filter((code) => !deletedCodes.has(code.trim().toUpperCase())));
    setNewAssignment((previous) => deletedCodes.has(previous.drugCode.trim().toUpperCase()) ? { ...previous, drugCode: "" } : previous);
  }

  function applyPersistedAppState(nextState: Partial<PersistedAppState>) {
    const normalized = normalizePersistedState(nextState);
    applyingRemoteRef.current = true;
    if (normalized.stockDrugs) {
      setStockDrugs((previous) => dedupeStockDrugs([...previous, ...normalized.stockDrugs!], inventory.stock.drugs, normalizeStockCode, true));
    }
    if (normalized.stockRooms) {
      setStockRooms((previous) => normalizeStockRooms([...previous, ...normalized.stockRooms!]).filter((room) => !hiddenStockRooms.has(room.id)));
    }
    if (normalized.stockAllocations) {
      setStockAllocations((previous) =>
        normalizeStockAllocations([...previous, ...normalized.stockAllocations!]).filter((allocation) => !hiddenStockRooms.has(allocation.roomId)),
      );
    }
    if (normalized.narcoticRooms) setNarcoticRooms(normalizeNarcoticRooms(normalized.narcoticRooms));
    if (normalized.narcoticDrugs) setNarcoticDrugs(dedupeStockDrugs(normalized.narcoticDrugs, NARCOTIC_DRUGS, normalizeNarcoticDrugCode, true));
    if (normalized.narcoticAllocations) {
      setNarcoticAllocations(normalizeNarcoticAllocations(normalized.narcoticAllocations));
    }
    if (normalized.narcoticDrugCategories) setNarcoticDrugCategories(normalized.narcoticDrugCategories);
    if (normalized.narcoticCheckedItems) setNarcoticCheckedItems(normalized.narcoticCheckedItems);
    if (normalized.narcoticExpiry) setNarcoticExpiry(normalized.narcoticExpiry);
    if (normalized.narcoticChecklistByRoom) setNarcoticChecklistByRoom(normalized.narcoticChecklistByRoom);
    if (normalized.narcoticRoundSummaryDraft !== undefined) setNarcoticRoundSummaryDraft(normalized.narcoticRoundSummaryDraft);
    if (normalized.uninspectedNarcoticRoomIds) setUninspectedNarcoticRoomIds(normalized.uninspectedNarcoticRoomIds);
    if (normalized.checkedStock) setCheckedStock(normalized.checkedStock);
    if (normalized.stockExpiry) setStockExpiry(normalized.stockExpiry);
    if (normalized.stockChecklistByRoom) setStockChecklistByRoom(normalized.stockChecklistByRoom);
    if (normalized.ecartByTarget) setEcartByTarget(normalized.ecartByTarget);
    if ("roundSummaryDraft" in normalized) setRoundSummaryDraft(normalized.roundSummaryDraft ?? null);
    if (normalized.stockRoomUpdatedAt) setStockRoomUpdatedAt(normalized.stockRoomUpdatedAt);
    if (normalized.uninspectedRoomIds) setUninspectedRoomIds(normalized.uninspectedRoomIds);
    if (normalized.narcoticLotAssignments) setNarcoticLotAssignments(normalized.narcoticLotAssignments);
    if (typeof normalized.narcoticLotFileName === "string") setNarcoticExcelFileName(normalized.narcoticLotFileName);
    if (normalized.pharmacyLabels) {
      setSavedPharmacyLabels(normalized.pharmacyLabels);
      writeSavedPharmacyLabelsToStorage(window.localStorage, normalized.pharmacyLabels);
      setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(previous, pharmacyRowsFromSavedLabels(normalized.pharmacyLabels ?? [])));
    }
    if (normalized.pharmacyAdditionalRows) {
      setPharmacyAdditionalRows((previous) => mergePharmacyRows(previous, normalized.pharmacyAdditionalRows ?? []));
      setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(previous, normalized.pharmacyAdditionalRows ?? []));
    }
    if (normalized.deletedPharmacyDrugCodes) {
      setDeletedPharmacyDrugCodes(normalized.deletedPharmacyDrugCodes);
      removePharmacyDrugsFromApp(normalized.deletedPharmacyDrugCodes);
    }
  }

  async function refreshRuntimeSyncBaseUrl() {
    try {
      const config = await loadRuntimeSyncConfig();
      configureServerSyncBaseUrl(config?.apiBaseUrl);
    } catch (error) {
      console.warn("Runtime sync config refresh failed", error);
      configureServerSyncBaseUrl();
    }
  }

  async function pullRemoteState(forceApply = false, options: PullRemoteOptions = {}) {
    if (pullInFlightRef.current) {
      if (!options.silent) setSyncStatus({ mode: "idle", message: "이미 자동 저장 상태를 확인 중입니다." });
      return false;
    }
    pullInFlightRef.current = true;
    if (!options.silent) setSyncStatus({ mode: "syncing", message: "자동 저장 상태 확인 중..." });
    try {
      if (!options.silent) await refreshRuntimeSyncBaseUrl();
      const remote = await loadServerState<PersistedAppState>();
      syncInitializedRef.current = true;
      if (!remote) {
        setSyncStatus({ mode: "idle", message: "저장된 상태 없음. 다음 수정 시 자동 생성됩니다." });
        scheduleRemotePush();
        return false;
      }
      const previousRemoteSha = remoteShaRef.current;
      const remoteRevisionChanged = Boolean(previousRemoteSha && remote.sha && remote.sha !== previousRemoteSha);
      remoteShaRef.current = remote.sha;
      const shouldApply =
        forceApply ||
        shouldApplyRemoteState({
          remoteUpdatedAt: remote.envelope.updatedAt,
          localUpdatedAt: localUpdatedAtRef.current,
          remoteClientId: remote.envelope.clientId,
          clientId: syncClientId,
          hasUnsavedLocalChanges: hasUnsavedLocalChangesRef.current || pendingPushRef.current,
          remoteRevisionChanged,
        });
      if (shouldApply) {
        localUpdatedAtRef.current = remote.envelope.updatedAt;
        hasUnsavedLocalChangesRef.current = false;
        pendingPushRef.current = false;
        window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, remote.envelope.updatedAt);
        applyPersistedAppState(remote.envelope.state);
        setSyncStatus({ mode: "synced", message: "다른 기기 변경 반영됨", lastSyncedAt: new Date().toISOString() });
        return true;
      }
      if (
        shouldPushLocalState({
          localUpdatedAt: localUpdatedAtRef.current,
          remoteUpdatedAt: remote.envelope.updatedAt,
          hasUnsavedLocalChanges: hasUnsavedLocalChangesRef.current || pendingPushRef.current,
        })
      ) {
        setSyncStatus({ mode: "idle", message: "로컬 변경 자동 저장 대기" });
        scheduleRemotePush();
        return false;
      }
      if (!options.silent) {
        setSyncStatus({ mode: "synced", message: "최신 상태", lastSyncedAt: new Date().toISOString() });
      }
      return false;
    } finally {
      pullInFlightRef.current = false;
      if (syncInitializedRef.current && pendingPushRef.current && latestStateRef.current) {
        pendingPushRef.current = false;
        scheduleRemotePush();
      }
    }
  }

  async function pushRemoteState() {
    if (!latestStateRef.current) return;
    const updatedAt = new Date().toISOString();
    const envelope: RemoteStateEnvelope<PersistedAppState> = {
      version: 1,
      updatedAt,
      clientId: syncClientId,
      state: latestStateRef.current,
    };
    setSyncStatus({ mode: "syncing", message: "자동 저장 중..." });
    try {
      const result = await saveServerState(envelope, { baseSha: remoteShaRef.current, forceOnConflict: true });
      remoteShaRef.current = result.sha;
      localUpdatedAtRef.current = updatedAt;
      hasUnsavedLocalChangesRef.current = false;
      window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
      setSyncStatus({ mode: "synced", message: "자동 저장 완료", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "자동 저장 실패";
      setSyncStatus({ mode: "error", message });
      throw error;
    }
  }

  async function forceUploadCurrentDeviceState() {
    const currentState = persistedAppState;
    const confirmed = window.confirm(
      "이 기기에 남아 있는 현재 입력 내용을 PC/모바일 공유 상태로 덮어씁니다. 모바일에서 점검한 내용과 병동 순회점검표 내용을 PC로 옮길 때만 사용하세요.",
    );
    if (!confirmed) return;

    const updatedAt = new Date().toISOString();
    const envelope: RemoteStateEnvelope<PersistedAppState> = {
      version: 1,
      updatedAt,
      clientId: syncClientId,
      state: currentState,
    };

    setSyncStatus({ mode: "syncing", message: "이 기기 내용으로 서버 반영 중..." });
    try {
      await refreshRuntimeSyncBaseUrl();
      const result = await saveServerState(envelope, { force: true });
      remoteShaRef.current = result.sha;
      localUpdatedAtRef.current = updatedAt;
      hasUnsavedLocalChangesRef.current = false;
      pendingPushRef.current = false;
      window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
      setSyncStatus({ mode: "synced", message: "이 기기 내용으로 서버 반영 완료", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const message = error instanceof Error ? error.message : "이 기기 내용 반영 실패";
      setSyncStatus({ mode: "error", message });
    }
  }

  function mergeNarcoticInspectionFields(base: PersistedAppState, source: Partial<PersistedAppState>): PersistedAppState {
    return {
      ...base,
      narcoticRooms: source.narcoticRooms ?? base.narcoticRooms,
      narcoticDrugs: source.narcoticDrugs ?? base.narcoticDrugs,
      narcoticAllocations: source.narcoticAllocations ?? base.narcoticAllocations,
      narcoticDrugCategories: source.narcoticDrugCategories ?? base.narcoticDrugCategories,
      narcoticCheckedItems: source.narcoticCheckedItems ?? base.narcoticCheckedItems,
      narcoticExpiry: source.narcoticExpiry ?? base.narcoticExpiry,
      narcoticChecklistByRoom: source.narcoticChecklistByRoom ?? base.narcoticChecklistByRoom,
      narcoticRoundSummaryDraft:
        source.narcoticRoundSummaryDraft !== undefined ? source.narcoticRoundSummaryDraft : base.narcoticRoundSummaryDraft,
      uninspectedNarcoticRoomIds: source.uninspectedNarcoticRoomIds ?? base.uninspectedNarcoticRoomIds,
      narcoticLotAssignments: source.narcoticLotAssignments ?? base.narcoticLotAssignments,
      narcoticLotFileName: source.narcoticLotFileName ?? base.narcoticLotFileName,
    };
  }

  async function pullNarcoticInspectionStateFromServer() {
    const localState = persistedAppState;
    setSyncStatus({ mode: "syncing", message: "비치마약류 점검 내용 불러오는 중..." });
    try {
      await refreshRuntimeSyncBaseUrl();
      const remote = await loadServerState<PersistedAppState>();
      if (!remote) {
        window.alert("불러올 비치마약류 점검 내용이 없습니다. (서버에 저장된 데이터가 없습니다)");
        setSyncStatus({ mode: "idle", message: "불러올 비치마약류 점검 내용이 없습니다." });
        return;
      }
      remoteShaRef.current = remote.sha;
      const normalizedRemote = normalizePersistedState(remote.envelope.state);
      const mergedState = mergeNarcoticInspectionFields(localState, normalizedRemote);
      const changeSummary = buildNarcoticStateChangeSummary(localState, mergedState);
      if (changeSummary.length === 0) {
        const noChangesMessage = isNarcoticViewer
          ? "PC에서 새로 반영된 비치마약류 엑셀 내용이 없습니다."
          : "새로 반영할 비치마약류 뷰어 변경 내용이 없습니다.";
        window.alert(noChangesMessage);
        setSyncStatus({ mode: "idle", message: noChangesMessage });
        return;
      }
      const applyTarget = isNarcoticViewer ? "PC에서 업로드한 비치마약류 엑셀 내용을 모바일 화면에" : "비치마약류 뷰어 반영 내용을 관리자 화면에";
      const confirmed = window.confirm(
        `${applyTarget} 적용합니다.\n\n${changeSummary
          .map((line) => `- ${line}`)
          .join("\n")}\n\n이 내용을 반영할까요?`,
      );
      if (!confirmed) {
        setSyncStatus({ mode: "idle", message: "비치마약류 내용 불러오기가 취소되었습니다." });
        return;
      }
      localUpdatedAtRef.current = remote.envelope.updatedAt;
      hasUnsavedLocalChangesRef.current = false;
      pendingPushRef.current = false;
      window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, remote.envelope.updatedAt);
      applyPersistedAppState(mergedState);
      window.alert(
        isNarcoticViewer
          ? "PC에서 업로드한 비치마약류 엑셀 내용이 모바일 화면에 적용되었습니다."
          : "비치마약류 뷰어 반영 내용이 관리자 화면에 적용되었습니다.",
      );
      setSyncStatus({ mode: "synced", message: "비치마약류 점검 내용 불러오기 완료", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "비치마약류 점검 내용 불러오기 실패";
      window.alert(`불러오기 실패: ${msg}\n\n관리자 PC에서 npm run dev:public 서버가 켜져 있는지 확인해 주세요.`);
      setSyncStatus({ mode: "error", message: msg });
    }
  }

  async function saveNarcoticInspectionStateToServer() {
    const localState = persistedAppState;
    const localNarcoticState = {
      ...localState,
      narcoticRoundSummaryDraft: refreshRoundSummaryDraftFromGenerated(localState.narcoticRoundSummaryDraft, generatedNarcoticRoundSummaryDraft),
    };
    const confirmed = window.confirm(
      isNarcoticViewer
        ? "모바일에서 점검한 보유실, 약품, 체크, 3개월 미만 날짜, 체크리스트 메모, LOT, 순회점검표 내용을 관리자 PC로 올립니다."
        : "PC에서 엑셀 업로드한 비치마약류 보유실, 약품, 수량, LOT 내용을 모바일 뷰어로 보냅니다.",
    );
    if (!confirmed) return;

    setSyncStatus({ mode: "syncing", message: "관리자 PC로 반영 중..." });
    try {
      await refreshRuntimeSyncBaseUrl();
      const remote = await loadServerState<PersistedAppState>();
      const baseState = remote ? ({ ...localState, ...normalizePersistedState(remote.envelope.state) } as PersistedAppState) : localNarcoticState;
      const mergedState = mergeNarcoticInspectionFields(baseState, localNarcoticState);
      const updatedAt = new Date().toISOString();
      const envelope: RemoteStateEnvelope<PersistedAppState> = {
        version: 1,
        updatedAt,
        clientId: syncClientId,
        state: mergedState,
      };
      const result = await saveServerState(envelope, remote?.sha ? { baseSha: remote.sha, forceOnConflict: true } : { force: true });
      remoteShaRef.current = result.sha;
      localUpdatedAtRef.current = updatedAt;
      hasUnsavedLocalChangesRef.current = false;
      pendingPushRef.current = false;
      window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
      applyPersistedAppState(mergedState);
      setSyncStatus({ mode: "synced", message: "관리자 PC로 반영 완료", lastSyncedAt: new Date().toISOString() });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "관리자 PC로 반영 실패";
      window.alert(`관리자 PC로 반영 실패: ${msg}\n\n관리자 PC에서 npm run dev:public 서버가 켜져 있는지 확인해 주세요.`);
      setSyncStatus({ mode: "error", message: msg });
    }
  }

  function scheduleRemotePush() {
    if (!syncInitializedRef.current) {
      pendingPushRef.current = true;
      setSyncStatus({ mode: "idle", message: "자동 저장 준비 중... 변경 내용은 곧 저장됩니다." });
      return;
    }
    pendingPushRef.current = false;
    if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = undefined;
      void pushRemoteState().catch(() => undefined);
    }, 800);
  }

  function markImmediateLocalChange() {
    const updatedAt = new Date().toISOString();
    localUpdatedAtRef.current = updatedAt;
    hasUnsavedLocalChangesRef.current = true;
    window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
  }

  useEffect(() => {
    latestStateRef.current = persistedAppState;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedAppState));
    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      return;
    }
    if (shouldMarkLocalChange({ syncInitialized: syncInitializedRef.current, applyingRemote: applyingRemoteRef.current })) {
      const updatedAt = new Date().toISOString();
      localUpdatedAtRef.current = updatedAt;
      hasUnsavedLocalChangesRef.current = true;
      window.localStorage.setItem(LOCAL_UPDATED_AT_KEY, updatedAt);
      if (appMode === "admin" || appMode === "master-viewer" || appMode === "pharmacy-editor") {
        scheduleRemotePush();
      } else {
        setSyncStatus({ mode: "idle", message: "수정 내용은 모바일 점검 내용 PC로 올리기 버튼을 눌러 저장하세요." });
      }
    } else if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
    }
  }, [appMode, persistedAppState]);

  useEffect(() => {
    let cancelled = false;

    void loadRuntimeSyncConfig()
      .then((config) => {
        if (cancelled) return;
        configureServerSyncBaseUrl(config?.apiBaseUrl);
      })
      .catch((error) => {
        console.warn("Runtime sync config load failed", error);
        configureServerSyncBaseUrl();
      })
      .finally(() => {
        if (!cancelled) setIsSyncConfigReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isSyncConfigReady) return;
    let cancelled = false;
    syncInitializedRef.current = false;
    setSyncStatus({ mode: "syncing", message: "자동 저장 서버 연결 중..." });
    void pullRemoteState().catch((error) => {
      if (cancelled) return;
      setSyncStatus({ mode: "error", message: error instanceof Error ? error.message : "자동 저장 서버 연결 실패" });
      syncInitializedRef.current = true;
    });
    const poller = window.setInterval(() => {
      void pullRemoteState(false, { silent: true }).catch((error) => {
        setSyncStatus({ mode: "error", message: error instanceof Error ? error.message : "자동 저장 서버 연결 실패" });
      });
    }, 3500);
    return () => {
      cancelled = true;
      window.clearInterval(poller);
    };
  }, [isSyncConfigReady, syncClientId]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const needsHospitalDrugLabels = usesHospitalDrugListForMode(labelMode);
    const loadedRows = labelMode === "pharmacy" ? pharmacyHospitalDrugLabelRows : hospitalDrugLabelRows;
    if (!isDrugLabelPanelOpen || !needsHospitalDrugLabels || loadedRows.length > 0) return;
    setIsHospitalDrugLabelsLoading(true);
    const loadRows = labelMode === "pharmacy" ? loadPharmacyHospitalDrugLabelRows : loadWardHospitalDrugLabelRows;
    void loadRows()
      .then((rows) => {
        const visibleRows = labelMode === "pharmacy"
          ? filterDeletedPharmacyLabelRows(rows, deletedPharmacyDrugCodeSet)
          : filterDeletedDrugRows(rows, deletedPharmacyDrugCodeSet);
        if (labelMode === "pharmacy") {
          setPharmacyHospitalDrugLabelRows(
            mergePharmacyRows(mergePharmacyRows(visibleRows, pharmacyRowsFromSavedLabels(savedPharmacyLabels)), pharmacyAdditionalRows),
          );
        }
        else setHospitalDrugLabelRows(visibleRows);
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setIsHospitalDrugLabelsLoading(false);
      });
  }, [deletedPharmacyDrugCodeSet, hospitalDrugLabelRows.length, isDrugLabelPanelOpen, labelMode, pharmacyAdditionalRows, pharmacyHospitalDrugLabelRows.length, savedPharmacyLabels]);

  useEffect(() => {
    if (!isPharmacyLocator || pharmacyHospitalDrugLabelRows.length > 0) return;
    setIsHospitalDrugLabelsLoading(true);
    void loadPharmacyHospitalDrugLabelRows()
      .then((rows) => setPharmacyHospitalDrugLabelRows(filterDeletedPharmacyLabelRows(rows, deletedPharmacyDrugCodeSet)))
      .catch((error) => console.error(error))
      .finally(() => setIsHospitalDrugLabelsLoading(false));
  }, [deletedPharmacyDrugCodeSet, isPharmacyLocator, pharmacyHospitalDrugLabelRows.length]);

  useEffect(() => {
    if (pharmacyLabelMatchRows.length > 0 || isPharmacyLabelMatchesLoading) return;
    setIsPharmacyLabelMatchesLoading(true);
    void Promise.all([loadPharmacyLabelMatchRows(), loadPharmacyHospitalDrugLabelRows()])
      .then(([matchRows, hospitalRows]) => {
        const visibleHospitalRows = filterDeletedPharmacyLabelRows(hospitalRows, deletedPharmacyDrugCodeSet);
        setPharmacyHospitalDrugLabelRows(
          mergePharmacyRows(mergePharmacyRows(visibleHospitalRows, pharmacyRowsFromSavedLabels(savedPharmacyLabels)), pharmacyAdditionalRows),
        );
        setPharmacyLabelMatchRows(filterDeletedDrugRows(
          mergeHospitalDrugRowsIntoPharmacyLabelMatches(visibleHospitalRows, matchRows),
          deletedPharmacyDrugCodeSet,
        ));
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        setIsPharmacyLabelMatchesLoading(false);
      });
  }, [deletedPharmacyDrugCodeSet, isPharmacyLabelMatchesLoading, isPharmacyLabelWorkspaceOpen, pharmacyAdditionalRows, pharmacyLabelMatchRows.length, savedPharmacyLabels]);

  useEffect(() => {
    if (!(isPharmacyEditor || isPharmacyLabelWorkspaceOpen) || restoredWorkbookLabelSettingsRef.current) return;
    restoredWorkbookLabelSettingsRef.current = true;
    void refreshRuntimeSyncBaseUrl()
      .then(() => loadSavedPharmacyLabelsFromWorkbook(hospitalDrugWorkbookUrl))
      .then((restored) => {
        if (restored.length === 0) return;
        setSavedPharmacyLabels((previous) => {
          const restoredKeys = new Set(restored.map((label) => `${label.labelFamily}|${label.category}|${label.code.trim().toUpperCase()}`));
          const next = [...previous.filter((label) => !restoredKeys.has(`${label.labelFamily}|${label.category}|${label.code.trim().toUpperCase()}`)), ...restored];
          writeSavedPharmacyLabelsToStorage(window.localStorage, next);
          return next;
        });
        setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(previous, pharmacyRowsFromSavedLabels(restored)));
      })
      .catch((error) => console.warn("Unable to restore pharmacy label settings from workbook", error));
  }, [isPharmacyEditor, isPharmacyLabelWorkspaceOpen]);

  const syncStatusText = useMemo(() => {
    if (syncStatus.lastSyncedAt) {
      return `${syncStatus.message} · ${new Date(syncStatus.lastSyncedAt).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`;
    }
    return syncStatus.message;
  }, [syncStatus.lastSyncedAt, syncStatus.message]);

  useEffect(() => {
    return () => {
      if (pdfDownload?.url) {
        URL.revokeObjectURL(pdfDownload.url);
      }
    };
  }, [pdfDownload?.url]);

  useEffect(() => {
    const clearPrintMode = () => document.body.classList.remove("printing-preview");
    window.addEventListener("afterprint", clearPrintMode);
    return () => {
      window.removeEventListener("afterprint", clearPrintMode);
      clearPrintMode();
    };
  }, []);

  const currentStockRooms = useMemo(() => {
    const stats = new Map<string, { allocationCount: number; totalQuantity: number }>();
    for (const room of stockRooms) {
      stats.set(room.id, { allocationCount: 0, totalQuantity: 0 });
    }
    for (const allocation of stockAllocations) {
      const roomStats = stats.get(allocation.roomId);
      if (!roomStats) continue;
      roomStats.allocationCount += 1;
      roomStats.totalQuantity += allocation.requiredQty;
    }
    return stockRooms.map((room) => ({ ...room, ...(stats.get(room.id) ?? { allocationCount: 0, totalQuantity: 0 }) }));
  }, [stockAllocations, stockRooms]);

  const currentStockGuideSections = useMemo(() => {
    const registeredRoomIds = new Set(
      stockGuideSections.flatMap((section) =>
        section.rows.flatMap((row) => row.flatMap((item) => (item.stockRoomId ? [item.stockRoomId] : []))),
      ),
    );
    const extraRoomsByFloor = new Map<StockFloor, StockGuideEntry[]>();

    for (const room of currentStockRooms) {
      if (registeredRoomIds.has(room.id)) continue;
      const floor = room.floor as StockFloor | undefined;
      if (!floor || !STOCK_FLOOR_OPTIONS.includes(floor)) continue;
      const entries = extraRoomsByFloor.get(floor) ?? [];
      entries.push({ label: displayRoomName(room.label), stockRoomId: room.id });
      extraRoomsByFloor.set(floor, entries);
    }

    return stockGuideSections.map((section) => {
      const extraRooms = extraRoomsByFloor.get(section.floor as StockFloor);
      return extraRooms?.length ? { ...section, rows: [...section.rows, extraRooms] } : section;
    });
  }, [currentStockRooms]);

  const currentNarcoticRooms = useMemo(() => {
    const stats = new Map<string, { allocationCount: number; totalQuantity: number }>();
    for (const room of narcoticRooms) {
      stats.set(room.id, { allocationCount: 0, totalQuantity: 0 });
    }
    for (const allocation of narcoticAllocations) {
      const roomStats = stats.get(allocation.roomId);
      if (!roomStats) continue;
      roomStats.allocationCount += 1;
      roomStats.totalQuantity += allocation.requiredQty;
    }
    return narcoticRooms.map((room) => ({ ...room, ...(stats.get(room.id) ?? { allocationCount: 0, totalQuantity: 0 }) }));
  }, [narcoticAllocations, narcoticRooms]);

  const currentNarcoticFloors = useMemo(() => {
    const roomById = new Map(currentNarcoticRooms.map((room) => [room.id, room]));
    const groupedRoomIds = new Set(NARCOTIC_FLOORS.flatMap((floorGroup) => floorGroup.rooms.map((room) => room.id)));
    const floors = NARCOTIC_FLOORS.map((floorGroup) => ({
      ...floorGroup,
      rooms: [
        ...floorGroup.rooms.flatMap((room) => roomById.get(room.id) ?? []),
        ...currentNarcoticRooms.filter(
          (room) => !groupedRoomIds.has(room.id) && room.floor === floorGroup.floor,
        ),
      ],
    }));
    const extraRooms = currentNarcoticRooms.filter(
      (room) =>
        !groupedRoomIds.has(room.id) &&
        !NARCOTIC_FLOORS.some((floorGroup) => floorGroup.floor === room.floor),
    );
    return extraRooms.length > 0 ? [...floors, { floor: "추가 보유실", rooms: extraRooms }] : floors;
  }, [currentNarcoticRooms]);

  const inspectedStockRoomIds = useMemo(() => getInspectedRoomIdsFromCheckedItems(checkedStock), [checkedStock]);

  const inspectedNarcoticRoomIds = useMemo(() => getInspectedRoomIdsFromCheckedItems(narcoticCheckedItems), [narcoticCheckedItems]);

  const pharmacyHospitalDrugRowsByCode = useMemo(
    () => new Map(pharmacyHospitalDrugLabelRows.filter(isSelectableHospitalDrugLabelRow).map((row) => [row.code.toUpperCase(), row])),
    [pharmacyHospitalDrugLabelRows],
  );
  const effectiveStockDrugs = useMemo(() => {
    const existingCodes = new Set(stockDrugs.map((drug) => drug.code.toUpperCase()));
    const pharmacyOnlyStockDrugs = pharmacyAdditionalRows
      .filter((row) => {
        const code = normalizeStockCode(row.code, row.name).toUpperCase();
        return code && !existingCodes.has(code) && !isHospitalControlledDrugType(row);
      })
      .map(pharmacyMasterToStockDrug);
    return dedupeStockDrugs([...stockDrugs, ...pharmacyOnlyStockDrugs], inventory.stock.drugs, normalizeStockCode, true).map((drug) =>
      applySharedMasterToStockDrug(drug, pharmacyHospitalDrugRowsByCode.get(drug.code.toUpperCase())),
    );
  }, [pharmacyAdditionalRows, pharmacyHospitalDrugRowsByCode, stockDrugs]);
  const effectiveNarcoticDrugs = useMemo(
    () => narcoticDrugs.map((drug) => applySharedMasterToStockDrug(drug, pharmacyHospitalDrugRowsByCode.get(drug.code.toUpperCase()))),
    [narcoticDrugs, pharmacyHospitalDrugRowsByCode],
  );
  const drugByCode = useMemo(() => new Map(effectiveStockDrugs.map((drug) => [drug.code, drug])), [effectiveStockDrugs]);
  const narcoticDrugByCode = useMemo(() => new Map(effectiveNarcoticDrugs.map((drug) => [drug.code, drug])), [effectiveNarcoticDrugs]);
  const narcoticMasterKindByCode = useMemo(
    () =>
      new Map(
        effectiveNarcoticDrugs.map((drug) => [
          drug.code,
          (narcoticDrugCategories[drug.code] ?? narcoticCategoryOf(drug.code)) === "마약" ? "narcotic" : "psychotropic",
        ] as const),
      ),
    [effectiveNarcoticDrugs, narcoticDrugCategories],
  );
  const roomById = useMemo(() => new Map(currentStockRooms.map((room) => [room.id, room])), [currentStockRooms]);
  const narcoticRoomById = useMemo(() => new Map(currentNarcoticRooms.map((room) => [room.id, room])), [currentNarcoticRooms]);
  const activeRoomInfo = roomById.get(activeRoom) ?? currentStockRooms[0];
  const activeEcartTarget =
    activeEcartTab === "general"
      ? ecartTargets.find((target) => target.id === activeEcartTargetId) ?? ecartTargets[0]
      : nicuTarget;
  const activeEcartKey = makeEcartKey(activeEcartTab, activeEcartTarget.id);
  const activeEcartState = useMemo(() => {
    return filterDeletedEcartItems(
      getEcartDefaultState(ecartByTarget, activeEcartTab, activeEcartKey),
      deletedPharmacyDrugCodeSet,
    );
  }, [activeEcartKey, activeEcartTab, deletedPharmacyDrugCodeSet, ecartByTarget]);

  const masterRows = useMemo(
    () => {
      const kindOrder: Record<MasterRowKind, number> = { stock: 0, psychotropic: 1, narcotic: 2 };
      const rows = [
        ...buildMasterRows(effectiveStockDrugs, stockAllocations, () => "stock"),
        ...buildMasterRows(effectiveNarcoticDrugs, narcoticAllocations, (drug) => narcoticMasterKindByCode.get(drug.code) ?? "psychotropic"),
      ];
      return rows.sort((a, b) => kindOrder[a.masterKind] - kindOrder[b.masterKind] || compareStockDrugsByName(a, b));
    },
    [effectiveNarcoticDrugs, effectiveStockDrugs, narcoticAllocations, narcoticMasterKindByCode, stockAllocations],
  );
  const stockedMasterRows = useMemo(() => filterMasterRowsWithStock(masterRows), [masterRows]);
  const visibleMasterRows = useMemo(
    () => filterMasterRowsByKind(stockedMasterRows, masterKindFilter),
    [masterKindFilter, stockedMasterRows],
  );
  const activeMasterLabelRoomIds = useMemo(
    () => resolveMasterLabelRoomIds(masterQuery, [...stockRooms, ...currentNarcoticRooms]),
    [currentNarcoticRooms, masterQuery, stockRooms],
  );
  const filteredMasterRows = useMemo(
    () =>
      visibleMasterRows.filter((row) =>
        matchesMasterSearch(row, masterQuery.trim().toLowerCase(), activeMasterLabelRoomIds),
      ),
    [activeMasterLabelRoomIds, visibleMasterRows, masterQuery],
  );
  const assignmentDrugs = useMemo(
    () => sortStockDrugsByName(isNarcoticViewer ? effectiveNarcoticDrugs : [...effectiveStockDrugs, ...effectiveNarcoticDrugs]),
    [effectiveNarcoticDrugs, effectiveStockDrugs, isNarcoticViewer],
  );
  const selectedAssignmentDrug = useMemo(
    () => assignmentDrugs.find((drug) => drug.code === newAssignment.drugCode),
    [assignmentDrugs, newAssignment.drugCode],
  );
  const selectedAssignmentKind: MasterRowKind =
    selectedAssignmentDrug && narcoticMasterKindByCode.has(selectedAssignmentDrug.code)
      ? (narcoticMasterKindByCode.get(selectedAssignmentDrug.code) ?? "psychotropic")
      : "stock";
  const assignmentRoomOptions = selectedAssignmentKind === "stock" ? currentStockRooms : currentNarcoticRooms;
  const assignmentDrugMatches = useMemo(() => {
    const value = assignmentDrugQuery.trim();
    if (!value) return [];
    return assignmentDrugs.filter((drug) => matchesDrug(drug, value)).slice(0, 18);
  }, [assignmentDrugQuery, assignmentDrugs]);

  const stockItemsByRoom = useMemo(() => {
    const itemsByRoom = new Map<string, EditableStockItem[]>();
    for (const allocation of stockAllocations) {
      const drug = drugByCode.get(allocation.drugCode);
      if (!drug) continue;
      const key = stockKey(allocation.roomId, allocation.drugCode);
      const item = {
        ...allocation,
        drug,
        checked: checkedStock[key] !== undefined ? checkedStock[key] : (checkedStock[stockKey("42W", allocation.drugCode)] ?? false),
        expiryDate: stockExpiry[key] ?? "",
      };
      const roomItems = itemsByRoom.get(allocation.roomId) ?? [];
      roomItems.push(item);
      itemsByRoom.set(allocation.roomId, roomItems);
    }
    for (const roomItems of itemsByRoom.values()) {
      roomItems.sort((a, b) => compareStockDrugsByName(a.drug, b.drug));
    }
    return itemsByRoom;
  }, [checkedStock, drugByCode, stockAllocations, stockExpiry]);

  const currentStockItems = useMemo<EditableStockItem[]>(
    () => (stockItemsByRoom.get(activeRoom) ?? []).filter((item) => matchesDrug(item.drug, query)),
    [activeRoom, query, stockItemsByRoom],
  );

  const { refrigerated: refrigeratedStock, roomTemperature: roomTemperatureStock } = splitStockItems(currentStockItems);
  const currentEcartItems = activeEcartState.items.filter((item) =>
    [item.code, item.name, item.dosage].join(" ").toLowerCase().includes(query.trim().toLowerCase()),
  );
  const currentStockChecklist = useMemo(() => {
    return getStockChecklistDefaultState(stockChecklistByRoom, activeRoom);
  }, [activeRoom, stockChecklistByRoom]);

  // ── Narcotic derived data ──
  const narcoticRoomInfo = useMemo(
    () => narcoticRoomById.get(narcoticActiveRoom) ?? currentNarcoticRooms[0],
    [currentNarcoticRooms, narcoticActiveRoom, narcoticRoomById],
  );
  const narcoticItemsByRoom = useMemo(() => {
    const itemsByRoom = new Map<string, EditableStockItem[]>();
    for (const allocation of narcoticAllocations) {
      const drug = narcoticDrugByCode.get(allocation.drugCode);
      if (!drug) continue;
      const key = stockKey(allocation.roomId, allocation.drugCode);
      const item: EditableStockItem = {
        ...allocation,
        drug,
        checked: narcoticCheckedItems[key] ?? false,
        expiryDate: narcoticExpiry[key] ?? "",
      };
      const roomItems = itemsByRoom.get(allocation.roomId) ?? [];
      roomItems.push(item);
      itemsByRoom.set(allocation.roomId, roomItems);
    }
    for (const roomItems of itemsByRoom.values()) {
      roomItems.sort((a, b) => compareStockDrugsByName(a.drug, b.drug));
    }
    return itemsByRoom;
  }, [narcoticAllocations, narcoticCheckedItems, narcoticDrugByCode, narcoticExpiry]);
  const currentNarcoticItems = useMemo<EditableStockItem[]>(
    () => (narcoticItemsByRoom.get(narcoticActiveRoom) ?? []).filter((item) => matchesDrug(item.drug, query)),
    [narcoticActiveRoom, narcoticItemsByRoom, query],
  );
  const currentNarcoticChecklist = useMemo<ChecklistState[]>(() => {
    return getNarcoticChecklistDefaultState(narcoticChecklistByRoom, narcoticActiveRoom);
  }, [narcoticActiveRoom, narcoticChecklistByRoom]);

  const currentChecklist = mainCategory === "stock" ? currentStockChecklist
    : mainCategory === "narcotic" ? currentNarcoticChecklist
    : activeEcartState.checklist;

  const selectedMasterRow = filteredMasterRows[0];
  const showMasterQuickView = masterQuery.trim().length > 0;
  const labelModeOptions = useMemo(() => getLabelModeOptions(appMode), [appMode]);
  const masterLabelRoomIdForRow = (row: MasterRow) => activeMasterLabelRoomIds.find((roomId) => matchesMasterRoom(row, roomId));
  const selectedLabelRows = useMemo(
    () => filteredMasterRows.filter((row) => labelSelectedCodes.includes(row.code)),
    [filteredMasterRows, labelSelectedCodes],
  );
  const hospitalDrugSelectableRows = useMemo(
    () => hospitalDrugLabelRows
      .map((row) => {
        const master = pharmacyHospitalDrugRowsByCode.get(row.code.toUpperCase());
        return master ? applySharedPharmacyMasterFields(row, master) : row;
      })
      .filter(isSelectableHospitalDrugLabelRow),
    [hospitalDrugLabelRows, pharmacyHospitalDrugRowsByCode],
  );
  const hospitalDrugRowsByCode = useMemo(
    () => new Map(hospitalDrugSelectableRows.map((row) => [row.code.toUpperCase(), row])),
    [hospitalDrugSelectableRows],
  );
  const pharmacyHospitalDrugRowsByLabelId = useMemo(
    () => new Map([...pharmacyHospitalDrugRowsByCode.values()].map((row) => [makeHospitalDrugLabelId(row), row])),
    [pharmacyHospitalDrugRowsByCode],
  );
  const hospitalDrugSearchRows = useMemo(() => {
    if (hospitalDrugSelectableRows.length === 0) return [];
    const trimmed = labelQuery.trim().toLowerCase();
    const rows = trimmed ? hospitalDrugSelectableRows.filter((row) => matchesHospitalDrugLabel(row, trimmed)) : hospitalDrugSelectableRows;
    return rows.slice(0, 80);
  }, [hospitalDrugSelectableRows, labelQuery]);
  const hospitalStockDrugRows = useMemo(() => hospitalDrugSelectableRows.filter(isHospitalGeneralDrugLabelType), [hospitalDrugSelectableRows]);
  const hospitalStockSearchRows = useMemo(() => {
    if (hospitalStockDrugRows.length === 0) return [];
    const trimmed = labelQuery.trim().toLowerCase();
    const rows = trimmed ? hospitalStockDrugRows.filter((row) => matchesHospitalDrugLabel(row, trimmed)) : hospitalStockDrugRows;
    return rows;
  }, [hospitalStockDrugRows, labelQuery]);
  const hospitalStockLabelRows = useMemo(() => hospitalStockSearchRows.map((row) => buildHospitalDrugLabelData(row, "stock")), [hospitalStockSearchRows]);
  const allHospitalStockLabelRows = useMemo(
    () => hospitalStockDrugRows.map((row) => buildHospitalDrugLabelData(row, "stock")),
    [hospitalStockDrugRows],
  );
  const hospitalFluidDrugRows = useMemo(() => hospitalDrugSelectableRows.filter((row) => isHospitalDrugType(row, "일반수액")), [hospitalDrugSelectableRows]);
  const hospitalFluidSearchRows = useMemo(() => {
    if (hospitalFluidDrugRows.length === 0) return [];
    const trimmed = labelQuery.trim().toLowerCase();
    const rows = trimmed ? hospitalFluidDrugRows.filter((row) => matchesHospitalDrugLabel(row, trimmed)) : hospitalFluidDrugRows;
    return rows.slice(0, 80);
  }, [hospitalFluidDrugRows, labelQuery]);
  const hospitalFluidLabelRows = useMemo(() => hospitalFluidSearchRows.map((row) => buildHospitalDrugLabelData(row, "fluid")), [hospitalFluidSearchRows]);
  const allHospitalFluidLabelRows = useMemo(
    () => hospitalFluidDrugRows.map((row) => buildHospitalDrugLabelData(row, "fluid")),
    [hospitalFluidDrugRows],
  );
  const pharmacyLabelBaseRows = useMemo(() => {
    const selectableRows = pharmacyHospitalDrugLabelRows.filter(isSelectableHospitalDrugLabelRow);
    const trimmed = labelQuery.trim().toLowerCase();
    const rows = trimmed ? selectableRows.filter((row) => matchesHospitalDrugLabel(row, trimmed)) : selectableRows;
    const priorityCodes = new Set([
      ...pharmacyAdditionalRows.map((row) => row.code.toUpperCase()),
      ...savedPharmacyLabels.map((label) => label.code.toUpperCase()),
    ]);
    return [...rows]
      .sort((left, right) => Number(priorityCodes.has(right.code.toUpperCase())) - Number(priorityCodes.has(left.code.toUpperCase())))
      .slice(0, 80)
      .map((row) => buildHospitalDrugLabelData(row, "pharmacy"));
  }, [labelQuery, pharmacyAdditionalRows, pharmacyHospitalDrugLabelRows, savedPharmacyLabels]);
  const hospitalControlledDrugRows = useMemo(
    () => hospitalDrugSelectableRows.filter((row) => isHospitalControlledDrugType(row) && !shouldExcludeHospitalControlledDrugLabel(row)),
    [hospitalDrugSelectableRows],
  );
  const hospitalControlledDoseCautionCodes = useMemo(
    () =>
      getNarcoticDoseCautionCodes(
        hospitalControlledDrugRows.map((row) => ({
          code: row.code,
          genericName: stripHospitalDrugControlledPrefix(row.koreanName),
          productName: stripHospitalDrugControlledPrefix(row.name),
        })),
      ),
    [hospitalControlledDrugRows],
  );
  const allHospitalControlledLabelRows = useMemo(
    () =>
      hospitalControlledDrugRows.map((row) =>
        buildHospitalControlledDrugLabelData(row, row.doseCaution || hospitalControlledDoseCautionCodes.has(row.code)),
      ),
    [hospitalControlledDoseCautionCodes, hospitalControlledDrugRows],
  );
  const hospitalControlledLabelRows = useMemo(() => {
    if (hospitalControlledDrugRows.length === 0) return [];
    const trimmed = labelQuery.trim().toLowerCase();
    const rows = trimmed ? hospitalControlledDrugRows.filter((row) => matchesHospitalDrugLabel(row, trimmed)) : hospitalControlledDrugRows;
    return rows
      .slice(0, 80)
      .map((row) => buildHospitalControlledDrugLabelData(row, row.doseCaution || hospitalControlledDoseCautionCodes.has(row.code)));
  }, [hospitalControlledDoseCautionCodes, hospitalControlledDrugRows, labelQuery]);
  const ecartGeneralLabelRows = useMemo(() => {
    const allTargets = getAllEcartPrintTargets(ecartTargets);
    const generalTargets = allTargets.filter((entry) => entry.tab === "general");
    return getEcartLabelItemsForMode("ecart", inventory.ecart)
      .filter((item) => !deletedPharmacyDrugCodeSet.has(item.code.trim().toUpperCase()))
      .map((item, index) => {
      const setQuantity =
        generalTargets
          .map(({ tab, key }) => {
            const state = getEcartDefaultState(ecartByTarget, tab, key);
            return getEcartLabelQuantity(state, item);
          })
          .find((quantity) => quantity > 0) ?? normalizeEcartItem(item).quantity;
      const hospitalRow = hospitalDrugRowsByCode.get(item.code.toUpperCase());
      return buildEcartLabelData(item, setQuantity, `general-${index}`, "ecart", hospitalRow?.drugType === "일반수액" ? hospitalRow.fluidColor : undefined, hospitalRow);
      });
  }, [deletedPharmacyDrugCodeSet, ecartByTarget, hospitalDrugRowsByCode]);
  const ecartNicuLabelRows = useMemo(() => {
    const allTargets = getAllEcartPrintTargets(ecartTargets);
    const nicuTargets = allTargets.filter((entry) => entry.tab === "nicu");
    return getEcartLabelItemsForMode("ecart-nicu", inventory.ecart)
      .filter((item) => !deletedPharmacyDrugCodeSet.has(item.code.trim().toUpperCase()))
      .map((item, index) => {
      const setQuantity =
        nicuTargets
          .map(({ tab, key }) => {
            const state = getEcartDefaultState(ecartByTarget, tab, key);
            return getEcartLabelQuantity(state, item);
          })
          .find((quantity) => quantity > 0) ?? normalizeEcartItem(item).quantity;
      const hospitalRow = hospitalDrugRowsByCode.get(item.code.toUpperCase());
      return buildEcartLabelData(item, setQuantity, `nicu-${index}`, "ecart-nicu", hospitalRow?.drugType === "일반수액" ? hospitalRow.fluidColor : undefined, hospitalRow);
      });
  }, [deletedPharmacyDrugCodeSet, ecartByTarget, hospitalDrugRowsByCode]);
  const ecartLabelBaseRows = useMemo(() => {
    return [...ecartGeneralLabelRows, ...ecartNicuLabelRows];
  }, [ecartGeneralLabelRows, ecartNicuLabelRows]);
  const activeEcartLabelRows = useMemo(() => {
    return labelMode === "ecart-nicu" ? ecartNicuLabelRows : ecartGeneralLabelRows;
  }, [ecartGeneralLabelRows, ecartNicuLabelRows, labelMode]);
  const filteredEcartLabelRows = useMemo(() => {
    const trimmed = labelQuery.trim().toLowerCase();
    if (!trimmed) return activeEcartLabelRows;
    return activeEcartLabelRows.filter((row) => [row.code, row.name, row.spec].join(" ").toLowerCase().includes(trimmed));
  }, [activeEcartLabelRows, labelQuery]);
  const currentLabelSourceRows = useMemo<DrugLabelData[]>(() => {
    if (isEcartLabelKind(labelMode)) return filteredEcartLabelRows;
    if (labelMode === "stock") return hospitalStockLabelRows;
    if (labelMode === "fluid") return hospitalFluidLabelRows;
    if (labelMode === "narcotic") return hospitalControlledLabelRows;
    if (labelMode === "pharmacy") return pharmacyLabelBaseRows;
    return [];
  }, [
    filteredEcartLabelRows,
    hospitalFluidLabelRows,
    hospitalControlledLabelRows,
    hospitalStockLabelRows,
    labelMode,
    pharmacyLabelBaseRows,
  ]);
  const labelRowsById = useMemo(() => {
    const rows = [...allHospitalStockLabelRows, ...ecartLabelBaseRows, ...allHospitalFluidLabelRows, ...allHospitalControlledLabelRows];
    return new Map(rows.map((row) => [row.id, row]));
  }, [allHospitalControlledLabelRows, allHospitalFluidLabelRows, allHospitalStockLabelRows, ecartLabelBaseRows]);
  function buildMasterDrugLabelData(row: MasterRow, mode: DrugLabelMode, roomId?: string) {
    const masterLabel = mode === "narcotic"
      ? buildNarcoticMasterLabelData(row, row.masterKind === "narcotic" ? "마약" : "향정", roomId)
      : buildStockLabelData(row, mode, roomId);
    const hospitalRow = mode === "pharmacy"
      ? pharmacyHospitalDrugRowsByCode.get(row.code.toUpperCase())
      : hospitalDrugRowsByCode.get(row.code.toUpperCase()) ?? pharmacyHospitalDrugRowsByCode.get(row.code.toUpperCase());
    if (!hospitalRow) return masterLabel;

    const hospitalLabel = buildHospitalDrugLabelData(hospitalRow, masterLabel.kind === "pharmacy" ? "pharmacy" : "stock");
    const doseCheck = masterLabel.doseCheck || hospitalLabel.doseCheck || hospitalControlledDoseCautionCodes.has(hospitalRow.code);
    const isControlledLabel = mode === "narcotic";
    const highRisk = isControlledLabel ? false : masterLabel.highRisk || hospitalLabel.highRisk;
    return {
      ...masterLabel,
      name: cleanDrugLabelName(masterLabel.name, highRisk),
      spec: hospitalLabel.spec || masterLabel.spec,
      storageLabel: hospitalLabel.storageLabel || masterLabel.storageLabel,
      storageTone: hospitalLabel.storageLabel ? hospitalLabel.storageTone : masterLabel.storageTone,
      storage: hospitalLabel.storage || masterLabel.storage,
      cautionLabels: [...new Set([...hospitalLabel.cautionLabels, ...masterLabel.cautionLabels])].filter(
        (label) => !isControlledLabel || !label.includes("고위험"),
      ),
      highRisk,
      doseCaution: masterLabel.doseCaution || hospitalLabel.doseCaution,
      doseCheck,
    };
  }
  const labelPrintRows = useMemo<PrintableDrugLabel[]>(
    () =>
      labelPrintSelections.flatMap((selection) => {
        const fallbackRow =
          labelRowsById.get(selection.id) ??
          (selection.mode === "pharmacy"
            ? (() => {
                const hospitalRow = pharmacyHospitalDrugRowsByLabelId.get(selection.id);
                return hospitalRow ? buildHospitalDrugLabelData(hospitalRow) : undefined;
              })()
            : undefined);
        const printableRow = isEcartLabelKind(selection.mode) && fallbackRow
          ? resolveDrugLabelPrintRow({ ...selection, labelRow: fallbackRow }, fallbackRow)
          : resolveDrugLabelPrintRow(selection, fallbackRow);
        if (!printableRow) return [];
        return Array.from({ length: labelCopies }, (_, copyIndex) => ({ ...selection, row: printableRow, copyIndex }));
      }),
    [labelCopies, labelPrintSelections, labelRowsById, pharmacyHospitalDrugRowsByLabelId],
  );
  const currentModeLabelPrintRows = useMemo(
    () => labelPrintRows.filter((entry) => entry.mode === labelMode),
    [labelMode, labelPrintRows],
  );
  const selectedLabelSize = getDrugLabelSize(labelSize);
  const currentModeSelectionCount = labelPrintSelections.filter((selection) => selection.mode === labelMode).length;
  const currentLabelSelectedCount = currentLabelSourceRows.filter((row) => isLabelPrintSelected(row)).length;
  const areCurrentLabelRowsSelected = currentLabelSourceRows.length > 0 && currentLabelSelectedCount === currentLabelSourceRows.length;
  const stockTotalQuantity = useMemo(
    () => stockAllocations.reduce((sum, allocation) => sum + allocation.requiredQty, 0),
    [stockAllocations],
  );
  const currentCheckedCount =
    mainCategory === "stock"
      ? currentStockItems.filter((item) => item.checked).length
      : mainCategory === "narcotic"
        ? currentNarcoticItems.filter((item) => item.checked).length
        : currentEcartItems.filter((item) => item.checked).length;
  const currentItemCount =
    mainCategory === "stock" ? currentStockItems.length : mainCategory === "narcotic" ? currentNarcoticItems.length : currentEcartItems.length;
  const checklistDoneCount = currentChecklist.filter((item) => item.status !== "").length;
  const currentAlertCount =
    mainCategory === "stock"
      ? currentStockItems.filter((item) => item.drug.warning || item.drug.storageType !== "ROOM").length
      : mainCategory === "narcotic"
        ? currentNarcoticRooms.length
        : activeEcartTab === "general"
          ? ecartTargets.length
          : 1;
  const activeRoomEcartLink = activeRoom ? stockRoomEcartLinks.get(activeRoom) : undefined;
  const generatedRoundSummaryDraft = useMemo(() => {
    const linkedEcartKeys = new Set<string>();
    const stockRoomsForSummary = currentStockRooms.map((room) => {
      const ecartLink = stockRoomEcartLinks.get(room.id);
      let ecartChecklist: ChecklistState[] | undefined;

      if (ecartLink) {
        const key = makeEcartKey(ecartLink.tab, ecartLink.targetId);
        linkedEcartKeys.add(key);
        ecartChecklist = getEcartDefaultState(ecartByTarget, ecartLink.tab, key).checklist;
      }

      return {
        id: room.id,
        label: displayRoomName(room.label),
        stockChecklist: getStockChecklistDefaultState(stockChecklistByRoom, room.id),
        ecartChecklist,
      };
    });

    const ecartOnlyEntries = new Map<string, { id: string; label: string; tab: EcartTab }>();
    for (const section of currentStockGuideSections) {
      for (const row of section.rows) {
        for (const item of row) {
          if (!item.ecartOnly || !item.ecartTargetId) continue;
          const tab = item.ecartTab ?? "general";
          ecartOnlyEntries.set(makeEcartKey(tab, item.ecartTargetId), {
            id: item.ecartTargetId,
            label: item.label,
            tab,
          });
        }
      }
    }

    for (const target of ecartTargets) {
      const key = makeEcartKey("general", target.id);
      if (!linkedEcartKeys.has(key) && !ecartOnlyEntries.has(key)) {
        ecartOnlyEntries.set(key, { id: target.id, label: target.label, tab: "general" });
      }
    }

    const nicuKey = makeEcartKey("nicu", nicuTarget.id);
    if (!linkedEcartKeys.has(nicuKey) && !ecartOnlyEntries.has(nicuKey)) {
      ecartOnlyEntries.set(nicuKey, { id: nicuTarget.id, label: nicuTarget.label, tab: "nicu" });
    }

    return buildRoundSummaryDraft({
      inspectionPeriod: defaultRoundInspectionPeriod(),
      stockRooms: stockRoomsForSummary,
      ecartOnlyTargets: [...ecartOnlyEntries.entries()]
        .filter(([key]) => !linkedEcartKeys.has(key))
        .map(([key, target]) => ({
          id: target.id,
          label: target.label,
          checklist: getEcartDefaultState(ecartByTarget, target.tab, key).checklist,
        })),
      commonGuidance: ROUND_SUMMARY_COMMON_GUIDANCE,
    });
  }, [currentStockGuideSections, currentStockRooms, ecartByTarget, stockChecklistByRoom]);
  const generatedNarcoticRoundSummaryDraft = useMemo(() => {
    return buildNarcoticRoundSummaryDraft({
      inspectionPeriod: defaultRoundInspectionPeriod(),
      rooms: currentNarcoticRooms.map((room) => ({
        id: room.id,
        label: displayRoomName(room.label),
        inventoryItems: (narcoticItemsByRoom.get(room.id) ?? []).map((item) => ({
          code: item.drugCode,
          name: drugTitle(item.drug),
          quantity: item.requiredQty,
          checked: item.checked,
          expiryDate: item.expiryDate,
        })),
        checklist: getNarcoticChecklistDefaultState(narcoticChecklistByRoom, room.id),
      })),
      commonGuidance: NARCOTIC_ROUND_SUMMARY_COMMON_GUIDANCE,
    });
  }, [currentNarcoticRooms, narcoticChecklistByRoom, narcoticItemsByRoom]);
  const activeRoundSummaryDraft =
    roundSummaryMode === "narcotic" ? (narcoticRoundSummaryDraft ?? generatedNarcoticRoundSummaryDraft) : (roundSummaryDraft ?? generatedRoundSummaryDraft);
  const activeRoundSummaryIsNarcotic = activeRoundSummaryDraft.title === "비치마약류 순회점검표";
  const activeRoundSummaryHeaders = activeRoundSummaryIsNarcotic
    ? {
        room: "비치마약류 보유 실",
        detail: "비치마약류 보유 현황 및 점검 사항",
        description:
          "비치마약류 보유 현황 체크, 점검사항 개선필요, 입력된 사유를 중심으로 비치마약류 순회점검표 양식에 맞춰 자동 작성합니다.",
      }
    : {
        room: "병동명",
        detail: "비품 및 E-cart 약품",
        description: "개선 필요 체크와 비고/사유 입력 내용을 중심으로 병동 순회 점검표 양식에 맞춰 자동 작성합니다.",
      };

  const lastGeneratedDraftRef = useRef<RoundSummaryDraft | null>(null);
  const lastGeneratedNarcoticDraftRef = useRef<RoundSummaryDraft | null>(null);
  const pendingRoundSummaryResetRef = useRef<RoundSummaryDraft | null>(null);

  useEffect(() => {
    const pendingResetDraft = pendingRoundSummaryResetRef.current;
    if (pendingResetDraft) {
      pendingRoundSummaryResetRef.current = null;
      lastGeneratedDraftRef.current = generatedRoundSummaryDraft;
      setRoundSummaryDraft(buildInspectionCycleResetRoundSummaryDraft(pendingResetDraft, generatedRoundSummaryDraft));
      return;
    }
    if (!roundSummaryDraft) {
      lastGeneratedDraftRef.current = generatedRoundSummaryDraft;
      return;
    }
    const lastGen = lastGeneratedDraftRef.current;
    if (lastGen) {
      const updatedRows = roundSummaryDraft.rows.map((row) => {
        const genRow = generatedRoundSummaryDraft.rows.find((r) => r.id === row.id);
        const lastGenRow = lastGen.rows.find((r) => r.id === row.id);
        if (genRow && lastGenRow) {
          if (genRow.result !== lastGenRow.result || genRow.details !== lastGenRow.details) {
            return {
              ...row,
              result: genRow.result,
              details: genRow.details,
            };
          }
        }
        return row;
      });
      const hasChange = updatedRows.some((row, i) => {
        const prevRow = roundSummaryDraft.rows[i];
        return row.result !== prevRow.result || row.details !== prevRow.details;
      });
      if (hasChange) {
        setRoundSummaryDraft({
          ...roundSummaryDraft,
          rows: updatedRows,
        });
      }
    }
    lastGeneratedDraftRef.current = generatedRoundSummaryDraft;
  }, [generatedRoundSummaryDraft, roundSummaryDraft]);
  useEffect(() => {
    if (!narcoticRoundSummaryDraft) {
      lastGeneratedNarcoticDraftRef.current = generatedNarcoticRoundSummaryDraft;
      return;
    }
    const lastGen = lastGeneratedNarcoticDraftRef.current;
    if (lastGen) {
      const updatedRows = narcoticRoundSummaryDraft.rows.map((row) => {
        const genRow = generatedNarcoticRoundSummaryDraft.rows.find((r) => r.id === row.id);
        const lastGenRow = lastGen.rows.find((r) => r.id === row.id);
        if (genRow && lastGenRow && (genRow.result !== lastGenRow.result || genRow.details !== lastGenRow.details)) {
          return {
            ...row,
            result: genRow.result,
            details: genRow.details,
          };
        }
        return row;
      });
      const hasChange = updatedRows.some((row, i) => {
        const prevRow = narcoticRoundSummaryDraft.rows[i];
        return row.result !== prevRow.result || row.details !== prevRow.details;
      });
      if (hasChange) {
        setNarcoticRoundSummaryDraft({
          ...narcoticRoundSummaryDraft,
          rows: updatedRows,
        });
      }
    }
    lastGeneratedNarcoticDraftRef.current = generatedNarcoticRoundSummaryDraft;
  }, [generatedNarcoticRoundSummaryDraft, narcoticRoundSummaryDraft]);
  const summaryGrid = (
    <section className="summary-grid" aria-label="전체 요약">
      <MetricCard
        icon={<Database size={20} />}
        label="등록 비품약"
        value={stockDrugs.length.toLocaleString("ko-KR")}
        detail={`${currentStockRooms.length.toLocaleString("ko-KR")}개 보유실`}
        tone="blue"
      />
      <MetricCard
        icon={<PackagePlus size={20} />}
        label="병동 배정"
        value={stockAllocations.length.toLocaleString("ko-KR")}
        detail={`총 ${stockTotalQuantity.toLocaleString("ko-KR")}개 보유`}
        tone="indigo"
      />
      <MetricCard
        icon={<ClipboardCheck size={20} />}
        label="E-cart 품목"
        value={(inventory.summary.ecartGeneralItemCount + inventory.summary.ecartNicuItemCount).toLocaleString("ko-KR")}
        detail={`부서 ${ecartTargets.length} · NICU 1`}
        tone="green"
      />
      <MetricCard
        icon={<ListChecks size={20} />}
        label="현재 점검"
        value={`${currentCheckedCount}/${currentItemCount}`}
        detail={`체크리스트 ${checklistDoneCount}/${currentChecklist.length}`}
        tone="slate"
      />
      <MetricCard
        icon={<Siren size={20} />}
        label={mainCategory === "stock" ? "주의/특수보관" : mainCategory === "narcotic" ? "비치마약류 보유실" : "대상 부서"}
        value={currentAlertCount.toLocaleString("ko-KR")}
        detail={
          mainCategory === "stock"
            ? `냉장 ${refrigeratedStock.length}개 포함`
            : mainCategory === "narcotic"
              ? displayRoomName(narcoticRoomInfo?.label ?? narcoticActiveRoom)
              : displayRoomName(activeEcartTarget.label)
        }
        tone="amber"
      />
    </section>
  );

  function goToStockRoom(roomId: string) {
    setShowMaster(false);
    setShowRoundSummary(false);
    setMainCategory("stock");
    setActiveRoom(roomId);
  }

  function goToNarcoticRoom(roomId: string) {
    setShowMaster(false);
    setShowRoundSummary(false);
    setMainCategory("narcotic");
    setNarcoticActiveRoom(roomId);
  }

  function goToEcartTarget(targetId: string, tab: EcartTab = "general") {
    setShowMaster(false);
    setShowRoundSummary(false);
    setMainCategory("ecart");
    setActiveEcartTab(tab);
    if (tab === "general") {
      setActiveEcartTargetId(targetId);
    }
  }

  function toggleMasterView() {
    if (isReadOnlyViewer) return;
    setShowMaster((prev) => {
      const next = !prev;
      if (next) setShowRoundSummary(false);
      return next;
    });
  }

  function toggleRoundSummaryView() {
    if (isViewerMode) return;
    setShowRoundSummary((prev) => {
      const next = !prev;
      if (next) {
        setRoundSummaryMode("ward");
        setShowMaster(false);
      }
      return next;
    });
  }

  function openNarcoticRoundSummary() {
    setNarcoticRoundSummaryDraft((prev) => refreshRoundSummaryDraftFromGenerated(prev, generatedNarcoticRoundSummaryDraft));
    setRoundSummaryMode("narcotic");
    setShowMaster(false);
    setShowRoundSummary(true);
  }

  async function handleNarcoticExcelUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isNarcoticLotWorkbookFileName(file.name)) {
      window.alert("파일명이 '의약품_재고_상세_20260704' 형식인 재고 상세 Excel 파일을 업로드해 주세요.");
      event.target.value = "";
      return;
    }
    try {
      const rows = await readNarcoticLotWorkbook(file);
      const assignments = buildNarcoticLotAssignments({
        rows,
        roomIds: currentNarcoticRooms.map((room) => room.id),
        drugCodes: narcoticDrugs.map((drug) => drug.code),
        drugs: narcoticDrugs,
      });
      markImmediateLocalChange();
      setNarcoticLotAssignments(assignments);
      setNarcoticExcelFileName(file.name);
      if (rows.length === 0) {
        window.alert("업로드한 Excel 파일에서 보관소와 LOT번호 헤더를 찾지 못했습니다.");
      }
    } catch (error) {
      console.error(error);
      window.alert("Excel 파일을 읽지 못했습니다. 의약품 재고 상세 파일인지 확인해 주세요.");
    } finally {
      event.target.value = "";
    }
  }

  function openGuideEntry(item: StockGuideEntry) {
    if (item.stockRoomId && !item.ecartOnly) {
      goToStockRoom(item.stockRoomId);
      return;
    }
    if (item.ecartTargetId) {
      goToEcartTarget(item.ecartTargetId, item.ecartTab ?? "general");
    }
  }

  function markStockRoomsEdited(roomIds: string[]) {
    setStockRoomUpdatedAt((prev) => markRoomsUpdated(prev, roomIds));
  }

  function toggleUninspectedRoom(roomId: string) {
    setUninspectedRoomIds((prev) => (prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]));
  }

  function updateStockCount(roomId: string, drugCode: string, value: string) {
    const count = Number.parseInt(value, 10);
    setStockAllocations((prev) => updateAllocationQuantity(prev, roomId, drugCode, Number.isNaN(count) ? 0 : count));
    markStockRoomsEdited([roomId]);
  }

  function deleteStockItem(roomId: string, drugCode: string) {
    setStockAllocations((prev) => deleteAllocation(prev, roomId, drugCode));
    markStockRoomsEdited([roomId]);
  }

  function deleteMasterRow(row: MasterRow) {
    const confirmed = window.confirm(
      `[${row.code}] ${drugTitle(row)} 약품을 전체 비품약 마스터와 모든 보유실 배정에서 삭제할까요?`,
    );
    if (!confirmed) return;

    if (row.masterKind === "stock") {
      setStockDrugs((prev) => deleteMasterDrug(prev, [], row.code).drugs);
      setStockAllocations((prev) => deleteMasterDrug([], prev, row.code).allocations);
      setCheckedStock((prev) => removeStockDrugRecords(prev, row.code));
      setStockExpiry((prev) => removeStockDrugRecords(prev, row.code));
      markStockRoomsEdited(row.roomDetails.map((detail) => detail.roomId));
    } else {
      setNarcoticDrugs((prev) => deleteMasterDrug(prev, [], row.code).drugs);
      setNarcoticAllocations((prev) => deleteMasterDrug([], prev, row.code).allocations);
      setNarcoticCheckedItems((prev) => removeStockDrugRecords(prev, row.code));
      setNarcoticExpiry((prev) => removeStockDrugRecords(prev, row.code));
      setNarcoticLotAssignments((prev) => removeStockDrugRecords(prev, row.code));
      setNarcoticDrugCategories((prev) => {
        const next = { ...prev };
        delete next[row.code];
        return next;
      });
    }
    setNewAssignment((prev) => (prev.drugCode === row.code ? { ...prev, drugCode: "" } : prev));
    setAssignmentDrugQuery((prev) => (prev.includes(row.code) ? "" : prev));
    setRenameDrugForm((prev) => (prev.oldCode === row.code ? { oldCode: "", newCode: "" } : prev));
  }

  function addAssignment(event: FormEvent) {
    event.preventDefault();
    if (!newAssignment.drugCode || targetRooms.length === 0) return;
    const validRoomIds = new Set(assignmentRoomOptions.map((room) => room.id));
    const roomIds = targetRooms.filter((roomId) => validRoomIds.has(roomId));
    if (roomIds.length === 0) return;

    if (selectedAssignmentKind === "stock") {
      setStockAllocations((prev) => {
        let next = prev;
        for (const roomId of roomIds) {
          next = updateAllocationQuantity(next, roomId, newAssignment.drugCode, newAssignment.count);
        }
        return next;
      });
      markStockRoomsEdited(roomIds);
    } else {
      setNarcoticAllocations((prev) => {
        let next = prev;
        for (const roomId of roomIds) {
          next = updateAllocationQuantity(next, roomId, newAssignment.drugCode, newAssignment.count);
        }
        return next;
      });
    }
    setNewAssignment({ drugCode: "", count: 1 });
    setAssignmentDrugQuery("");
    setTargetRooms([]);
  }

  function addNewDrug(event: FormEvent) {
    event.preventDefault();
    const productName = newDrug.productName.trim();
    const baseCode = normalizeStockCode(newDrug.code.trim(), productName);
    const code = newDrug.category === "stock" ? baseCode : normalizeNarcoticDrugCode(baseCode);
    if (!code) return;
    const drug: StockDrug = {
      code,
      genericName: newDrug.genericName.trim(),
      productName: productName || newDrug.genericName.trim() || code,
      spec: newDrug.spec.trim(),
      storage: newDrug.storage.trim() || "실온보관",
      note: newDrug.warning.trim(),
      warning: newDrug.warning.trim(),
      storageType: inferStorageType(newDrug.storage),
    };
    if (newDrug.category === "stock") {
      setStockDrugs((prev) =>
        dedupeStockDrugs(prev.some((item) => item.code === code) ? prev.map((item) => (item.code === code ? drug : item)) : [...prev, drug]),
      );
    } else {
      setNarcoticDrugs((prev) =>
        dedupeStockDrugs(
          prev.some((item) => item.code === code) ? prev.map((item) => (item.code === code ? drug : item)) : [...prev, drug],
          NARCOTIC_DRUGS,
          normalizeNarcoticDrugCode,
        ),
      );
      setNarcoticDrugCategories((prev) => ({ ...prev, [code]: newDrug.category as NarcoticCategory }));
    }
    setNewAssignment((prev) => ({ ...prev, drugCode: code }));
    setNewDrug({ code: "", genericName: "", productName: "", spec: "", storage: "실온보관", warning: "", category: defaultNewDrugCategory });
  }

  function changeDrugCode(event: FormEvent) {
    event.preventDefault();
    const rawOldCode = normalizeStockCode(renameDrugForm.oldCode.trim());
    const rawNewCode = normalizeStockCode(renameDrugForm.newCode.trim());
    const isNarcoticDrug =
      narcoticMasterKindByCode.has(rawOldCode) || narcoticMasterKindByCode.has(normalizeNarcoticDrugCode(rawOldCode));
    const oldCode = isNarcoticDrug ? normalizeNarcoticDrugCode(rawOldCode) : rawOldCode;
    const newCode = isNarcoticDrug ? normalizeNarcoticDrugCode(rawNewCode) : rawNewCode;
    if (!oldCode || !newCode) {
      alert("기존 코드와 신규 코드를 모두 입력해 주세요.");
      return;
    }
    if (oldCode === newCode) {
      alert("기존 코드와 신규 코드가 동일합니다.");
      return;
    }
    const drugExists = assignmentDrugs.some((item) => item.code === oldCode);
    if (!drugExists) {
      alert("존재하지 않는 기존 약품 코드입니다.");
      return;
    }
    const newDrugExists = assignmentDrugs.some((item) => item.code === newCode);
    if (newDrugExists) {
      alert("이미 존재하는 신규 약품 코드입니다.");
      return;
    }

    if (isNarcoticDrug) {
      setNarcoticDrugs((prev) => sortStockDrugsByName(prev.map((item) => (item.code === oldCode ? { ...item, code: newCode } : item))));
      setNarcoticAllocations((prev) => prev.map((allocation) => (allocation.drugCode === oldCode ? { ...allocation, drugCode: newCode } : allocation)));
      setNarcoticCheckedItems((prev) => renameStockKeyRecord(prev, oldCode, newCode));
      setNarcoticExpiry((prev) => renameStockKeyRecord(prev, oldCode, newCode));
      setNarcoticLotAssignments((prev) => renameStockKeyRecord(prev, oldCode, newCode));
      setNarcoticDrugCategories((prev) => {
        const next = { ...prev, [newCode]: prev[oldCode] ?? narcoticCategoryOf(oldCode) };
        delete next[oldCode];
        return next;
      });
    } else {
      setStockDrugs((prev) => sortStockDrugsByName(prev.map((item) => (item.code === oldCode ? { ...item, code: newCode } : item))));
      setStockAllocations((prev) => prev.map((allocation) => (allocation.drugCode === oldCode ? { ...allocation, drugCode: newCode } : allocation)));
      setCheckedStock((prev) => renameStockKeyRecord(prev, oldCode, newCode));
      setStockExpiry((prev) => renameStockKeyRecord(prev, oldCode, newCode));
    }

    // Reset new assignment choice if it was selecting the old code
    setNewAssignment((prev) => {
      if (prev.drugCode === oldCode) {
        return { ...prev, drugCode: newCode };
      }
      return prev;
    });

    alert(`약품 코드가 ${oldCode}에서 ${newCode}로 변경되었습니다.`);
    setRenameDrugForm({ oldCode: "", newCode: "" });
  }

  function addNewRoom(event: FormEvent) {
    event.preventDefault();
    const id = newRoomName.trim();
    if (!id) return;
    if (isNarcoticViewer) {
      setNarcoticRooms((prev) =>
        prev.some((room) => room.id === id)
          ? prev
          : [
              ...prev,
              {
                id,
                label: id,
                floor: newRoomFloor,
                sourceColumn: id,
                sourceSheet: id,
                sourceUpdatedAt: formatRoomUpdatedAt(),
                allocationCount: 0,
                totalQuantity: 0,
              },
            ],
      );
      setTargetRooms((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setNarcoticActiveRoom(id);
      setNewRoomName("");
      return;
    }
    setStockRooms((prev) =>
      prev.some((room) => room.id === id)
        ? prev
        : [
            ...prev,
            {
              id,
              label: id,
              floor: newRoomFloor,
              sourceColumn: id,
              sourceSheet: id,
              sourceUpdatedAt: formatRoomUpdatedAt(),
              allocationCount: 0,
              totalQuantity: 0,
            },
          ],
    );
    markStockRoomsEdited([id]);
    setTargetRooms((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveRoom(id);
    setNewRoomName("");
  }

  function updateActiveEcartItems(updater: (items: EditableEcartItem[]) => EditableEcartItem[]) {
    setEcartByTarget((prev) => {
      const current = getEcartDefaultState(prev, activeEcartTab, activeEcartKey);
      return { ...prev, [activeEcartKey]: { ...current, items: updater(current.items) } };
    });
  }

  function updateEcartCount(id: string, value: string) {
    const count = Math.max(0, Number.parseInt(value, 10) || 0);
    updateActiveEcartItems((items) => items.map((item) => (item.id === id ? { ...item, quantity: count } : item)));
  }

  function deleteEcartItem(id: string) {
    updateActiveEcartItems((items) => items.filter((item) => item.id !== id));
  }

  function updateStockChecklistNoteForRoom(roomId: string, id: string, note: string) {
    setStockChecklistByRoom((prev) => {
      const current = getStockChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { note }) };
    });
  }

  function updateStockChecklistStatusForRoom(roomId: string, id: string, status: CheckStatus) {
    setStockChecklistByRoom((prev) => {
      const current = getStockChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { status }) };
    });
  }

  // ── Narcotic checklist/state helpers ──
  function updateNarcoticChecklistNote(roomId: string, id: string, note: string) {
    setNarcoticChecklistByRoom((prev) => {
      const current = getNarcoticChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { note }) };
    });
  }
  function updateNarcoticChecklistStatus(roomId: string, id: string, status: CheckStatus) {
    setNarcoticChecklistByRoom((prev) => {
      const current = getNarcoticChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { status }) };
    });
  }
  function toggleUninspectedNarcoticRoom(roomId: string) {
    setUninspectedNarcoticRoomIds((prev) => (prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId]));
  }
  function toggleNarcoticItemCheck(roomId: string, drugCode: string) {
    setUninspectedNarcoticRoomIds((ids) => clearUninspectedRoomId(ids, roomId));
    setNarcoticCheckedItems((prev) => {
      const key = stockKey(roomId, drugCode);
      return { ...prev, [key]: !prev[key] };
    });
  }
  function updateNarcoticCount(roomId: string, drugCode: string, value: string) {
    const count = Number.parseInt(value, 10);
    markImmediateLocalChange();
    setNarcoticAllocations((prev) => updateAllocationQuantity(prev, roomId, drugCode, Number.isNaN(count) ? 0 : count));
  }
  function deleteNarcoticItem(roomId: string, drugCode: string) {
    markImmediateLocalChange();
    setNarcoticAllocations((prev) => deleteAllocation(prev, roomId, drugCode));
    setNarcoticCheckedItems((prev) => {
      const next = { ...prev };
      delete next[stockKey(roomId, drugCode)];
      return next;
    });
    setNarcoticExpiry((prev) => {
      const next = { ...prev };
      delete next[stockKey(roomId, drugCode)];
      return next;
    });
    setNarcoticLotAssignments((prev) => {
      const next = { ...prev };
      delete next[stockKey(roomId, drugCode)];
      return next;
    });
  }

  function updateEcartChecklistNote(id: string, note: string) {
    setEcartByTarget((prev) => {
      const current = getEcartDefaultState(prev, activeEcartTab, activeEcartKey);
      return {
        ...prev,
        [activeEcartKey]: {
          ...current,
          checklist: updateChecklistRows(normalizeChecklistRows(current.checklist), id, { note }),
        },
      };
    });
  }

  function updateEcartChecklistStatus(id: string, status: CheckStatus) {
    setEcartByTarget((prev) => {
      const current = getEcartDefaultState(prev, activeEcartTab, activeEcartKey);
      return {
        ...prev,
        [activeEcartKey]: {
          ...current,
          checklist: updateChecklistRows(normalizeChecklistRows(current.checklist), id, { status }),
        },
      };
    });
  }

  function updateRoundSummaryDraft(patch: Partial<Omit<RoundSummaryDraft, "rows">>) {
    const generatedDraft = roundSummaryMode === "narcotic" ? generatedNarcoticRoundSummaryDraft : generatedRoundSummaryDraft;
    const setDraft = roundSummaryMode === "narcotic" ? setNarcoticRoundSummaryDraft : setRoundSummaryDraft;
    setDraft((prev) => ({
      ...(prev ?? (JSON.parse(JSON.stringify(generatedDraft)) as RoundSummaryDraft)),
      ...patch,
    }));
  }

  function updateRoundSummaryRow(rowId: string, patch: Partial<RoundSummaryRow>) {
    const generatedDraft = roundSummaryMode === "narcotic" ? generatedNarcoticRoundSummaryDraft : generatedRoundSummaryDraft;
    const setDraft = roundSummaryMode === "narcotic" ? setNarcoticRoundSummaryDraft : setRoundSummaryDraft;
    setDraft((prev) => {
      const draft = prev ?? (JSON.parse(JSON.stringify(generatedDraft)) as RoundSummaryDraft);
      return {
        ...draft,
        rows: draft.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }

  function regenerateRoundSummaryDraft() {
    if (roundSummaryMode === "narcotic") {
      setNarcoticChecklistByRoom({});
      setNarcoticRoundSummaryDraft(null);
      return;
    }
    const resetState = makeInspectionCycleResetState();
    pendingRoundSummaryResetRef.current = activeRoundSummaryDraft;
    setCheckedStock(resetState.checkedStock);
    setStockExpiry(resetState.stockExpiry);
    setStockChecklistByRoom(resetState.stockChecklistByRoom);
    setEcartByTarget(resetState.ecartByTarget);
    setRoundSummaryDraft(resetState.roundSummaryDraft);
    setUninspectedRoomIds(resetState.uninspectedRoomIds);
  }

  function openRoundSummaryPrintPreview() {
    setPrintPreviewMode("round-summary");
    setPdfStatus("idle");
    setPdfDownload(null);
    setShowPrintPreview(true);
  }

  async function downloadReport() {
    const reportElement = printPreviewMode === "drug-labels"
      ? reportRef.current
      : printPreviewRef.current ?? reportRef.current;
    if (!reportElement) return;
    const reportCategory = mainCategory === "ecart" ? "ecart" : mainCategory === "narcotic" ? "narcotic" : "stock";
    const reportTargetName =
      mainCategory === "stock"
        ? displayRoomName(activeRoomInfo?.label ?? activeRoom)
        : mainCategory === "narcotic"
          ? displayRoomName(narcoticRoomInfo?.label ?? narcoticActiveRoom)
          : displayRoomName(activeEcartTarget.label);
    const fileName = buildReportFileName({
      category: reportCategory,
      mode: showPrintPreview ? printPreviewMode : "single",
      targetName: reportTargetName,
    });
    setPdfStatus("generating");
    setPdfDownload(null);
    try {
      const pharmacyPrintLayout = printPreviewMode === "drug-labels" && pharmacyPrintDrafts.length > 0
        ? planPharmacyLabelsForPaper(pharmacyPrintDrafts, pharmacyPrintPaper === "A3" ? A3_PAPER : A4_PAPER)
        : undefined;
      const result = await downloadElementAsPdf(
        reportElement,
        fileName,
        pharmacyPrintLayout
          ? { paper: pharmacyPrintPaper, orientation: pharmacyPrintLayout.orientation, fullBleed: true }
          : printPreviewMode === "drug-labels"
            ? { paper: "A4", orientation: "portrait", fullBleed: true }
            : undefined,
      );
      setPdfDownload(result);
      setPdfStatus("ready");
    } catch (error) {
      console.error(error);
      setPdfStatus("error");
    }
  }

  function downloadMasterWorkbook() {
    const workbook = createMasterWorkbookXlsx(visibleMasterRows);
    const blob = new Blob([workbook], { type: MASTER_EXPORT_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildMasterExportFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleLabelDrug(code: string) {
    setLabelSelectedCodes((prev) => (prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]));
  }

  function isLabelPrintSelected(row: DrugLabelData, sizeKey = labelSize) {
    const key = makeLabelPrintSelectionKey(row.id, row.kind, sizeKey, row.roomId);
    return labelPrintSelections.some(
      (selection) => makeLabelPrintSelectionKey(selection.id, selection.mode, selection.sizeKey, selection.roomId) === key,
    );
  }

  function toggleLabelPrintSelection(row: DrugLabelData) {
    const key = makeLabelPrintSelectionKey(row.id, row.kind, labelSize, row.roomId);
    setLabelPrintSelections((prev) => {
      const exists = prev.some((selection) => makeLabelPrintSelectionKey(selection.id, selection.mode, selection.sizeKey, selection.roomId) === key);
      if (exists) {
        return prev.filter((selection) => makeLabelPrintSelectionKey(selection.id, selection.mode, selection.sizeKey, selection.roomId) !== key);
      }
      return [
        ...prev,
        {
          id: row.id,
          mode: row.kind,
          sizeKey: labelSize,
          roomId: row.roomId,
          quantityOverride: row.totalQuantity,
          labelRow: row,
        },
      ];
    });
  }

  function toggleCurrentLabelRows(checked: boolean) {
    const currentKeys = new Set(currentLabelSourceRows.map((row) => makeLabelPrintSelectionKey(row.id, row.kind, labelSize, row.roomId)));
    setLabelPrintSelections((prev) => {
      const otherSelections = prev.filter(
        (selection) => !currentKeys.has(makeLabelPrintSelectionKey(selection.id, selection.mode, selection.sizeKey, selection.roomId)),
      );
      if (!checked) return otherSelections;
      return [
        ...otherSelections,
        ...currentLabelSourceRows.map((row) => ({
          id: row.id,
          mode: row.kind,
          sizeKey: labelSize,
          roomId: row.roomId,
          quantityOverride: row.totalQuantity,
          labelRow: row,
        })),
      ];
    });
  }

  function clearLabelSelection() {
    setLabelPrintSelections([]);
  }

  function toggleFilteredMasterLabels(checked: boolean) {
    const codes = filteredMasterRows.map((row) => row.code);
    setLabelSelectedCodes((prev) => {
      if (!checked) return prev.filter((code) => !codes.includes(code));
      return [...new Set([...prev, ...codes])];
    });
  }

  function openDrugLabelPrintPreview() {
    if (labelPrintRows.length === 0) return;
    setPharmacyPrintDrafts([]);
    setPrintPreviewMode("drug-labels");
    setPdfStatus("idle");
    setPdfDownload(null);
    setShowPrintPreview(true);
  }

  function openSelectedMasterLabelPreview(mode: DrugLabelMode = "stock") {
    if (selectedLabelRows.length === 0) return;
    const hasControlledRows = selectedLabelRows.some((row) => row.masterKind !== "stock");
    setPharmacyPrintDrafts([]);
    setLabelMode(hasControlledRows ? "narcotic" : mode);
    setLabelPrintSelections(
      selectedLabelRows.map((row) => {
        const selectionMode = row.masterKind === "stock" ? mode : "narcotic";
        const selectionSizeKey = row.masterKind === "stock"
          ? labelSize
          : ["10x70", "15x95"].includes(labelSize) ? labelSize : "40x70";
        const roomId = masterLabelRoomIdForRow(row);
        const roomQuantity = activeMasterLabelRoomIds
          .flatMap((roomId) => row.roomDetails.filter((detail) => detail.roomId === roomId).map((detail) => detail.requiredQty))
          .find((quantity) => quantity !== undefined);
        const labelRow = buildMasterDrugLabelData(row, selectionMode, roomId);
        return {
          id: labelRow.id,
          mode: labelRow.kind,
          sizeKey: selectionSizeKey,
          isCheckedMasterPrint: true,
          roomId: roomId ?? labelRow.roomId,
          quantityOverride: roomQuantity ?? labelRow.totalQuantity ?? row.totalQuantity,
          labelRow,
        };
      }),
    );
    setIsDrugLabelPanelOpen(true);
    setPrintPreviewMode("drug-labels");
    setPdfStatus("idle");
    setPdfDownload(null);
    setShowPrintPreview(true);
  }

  async function savePharmacyStudioLabels(drafts: PharmacyLabelDraft[]) {
    if (typeof window === "undefined") return "";
    if (drafts.some((draft) => !draft.code.trim())) throw new Error("새 라벨은 약품코드를 입력해야 저장할 수 있습니다.");
    const savedAt = new Date().toISOString();
    const saved = drafts.map((draft) => ({ ...draft, sourceType: "manual" as const, savedAt }));
    const workbookSaveMode = await savePharmacyLabelDraftsToWorkbook(saved, hospitalDrugWorkbookUrl);
    setSavedPharmacyLabels((previous) => {
      const savedKeys = new Set(saved.map((label) => `${label.labelFamily}|${label.category}|${label.code.trim().toUpperCase()}`));
      const next = [...previous.filter((label) => !savedKeys.has(`${label.labelFamily}|${label.category}|${label.code.trim().toUpperCase()}`)), ...saved];
      writeSavedPharmacyLabelsToStorage(window.localStorage, next);
      return next;
    });
    const nextRows = drafts.map((draft) => {
      const existing = pharmacyHospitalDrugLabelRows.find((row) => row.code.trim().toUpperCase() === draft.code.trim().toUpperCase());
      return { ...existing, ...pharmacyRowFromDraft(draft) };
    });
    const savedCodes = new Set(nextRows.map((row) => row.code.toUpperCase()));
    setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(previous.filter((row) => !savedCodes.has(row.code.toUpperCase())), nextRows));
    setPharmacyAdditionalRows((previous) => mergePharmacyRows(previous.filter((row) => !savedCodes.has(row.code.toUpperCase())), nextRows));
    const countText = drafts.length > 1 ? `${drafts.length}개 수정 내용이 ` : "수정 내용이 ";
    return workbookSaveMode === "server"
      ? `${countText}약제팀 라벨 원본과 공유 서버에 자동 저장되었습니다.`
      : workbookSaveMode === "file"
      ? `${countText}최종 라벨과 선택한 원내보유의약품리스트.xlsx에 저장되었습니다.`
      : `${countText}최종 라벨로 저장되었으며, 갱신된 원내보유의약품리스트.xlsx가 다운로드되었습니다. 기존 파일을 이 파일로 교체해 주십시오.`;
  }

  async function savePharmacyStudioLabel(draft: PharmacyLabelDraft) {
    return savePharmacyStudioLabels([draft]);
  }

  async function savePharmacyDrugMaster(row: HospitalDrugLabelRow, originalCode = row.code) {
    if (!row.code.trim()) throw new Error("약품코드를 입력해야 저장할 수 있습니다.");
    if (!row.name.trim()) throw new Error("상용약품명을 입력해야 저장할 수 있습니다.");
    const workbookSaveMode = await saveHospitalDrugMasterRowToWorkbook(row, hospitalDrugWorkbookUrl, originalCode);
    const originalCodeKey = originalCode.toUpperCase();
    setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(
      previous.filter((current) => current.code.toUpperCase() !== originalCodeKey),
      [row],
    ));
    setHospitalDrugLabelRows((previous) => previous.map((current) =>
      current.code.toUpperCase() === originalCodeKey
        ? { ...applySharedPharmacyMasterFields(current, row), code: row.code }
        : current,
    ));
    setPharmacyAdditionalRows((previous) => mergePharmacyRows(
      previous.filter((current) => current.code.toUpperCase() !== originalCodeKey),
      [row],
    ));
    setDeletedPharmacyDrugCodes((previous) => previous.filter((code) => code !== row.code.trim().toUpperCase()));
    return workbookSaveMode === "server"
      ? "클라우드 원내보유의약품리스트에 저장되었으며 관리자와 다른 뷰어에 자동 반영됩니다."
      : workbookSaveMode === "file"
        ? "선택한 원내보유의약품리스트.xlsx와 현재 화면에 저장되었습니다."
        : "갱신된 원내보유의약품리스트.xlsx가 다운로드되었습니다. 기존 파일을 교체하면 전체 화면에 같은 기준이 적용됩니다.";
  }

  async function saveManyPharmacyDrugMasters(rows: HospitalDrugLabelRow[]) {
    if (rows.length === 0) throw new Error("일괄 저장할 약품을 선택해 주십시오.");
    const invalid = rows.find((row) => !row.code.trim() || !row.name.trim());
    if (invalid) throw new Error("약품코드와 상용약품명이 입력된 약품만 저장할 수 있습니다.");
    const workbookSaveMode = await saveHospitalDrugMasterRowsToWorkbook(rows, hospitalDrugWorkbookUrl);
    const savedCodes = new Set(rows.map((row) => row.code.trim().toUpperCase()));
    setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(
      previous.filter((current) => !savedCodes.has(current.code.toUpperCase())),
      rows,
    ));
    setHospitalDrugLabelRows((previous) => previous.map((current) => {
      const saved = rows.find((row) => row.code.toUpperCase() === current.code.toUpperCase());
      return saved ? applySharedPharmacyMasterFields(current, saved) : current;
    }));
    setPharmacyAdditionalRows((previous) => mergePharmacyRows(
      previous.filter((current) => !savedCodes.has(current.code.toUpperCase())),
      rows,
    ));
    setDeletedPharmacyDrugCodes((previous) => previous.filter((code) => !savedCodes.has(code)));
    return workbookSaveMode === "server"
      ? `${rows.length}개 약품의 약제팀 라벨 설정이 원내보유의약품리스트와 공유 서버에 일괄 저장되었습니다.`
      : workbookSaveMode === "file"
        ? `${rows.length}개 약품의 약제팀 라벨 설정이 선택한 원내보유의약품리스트.xlsx에 일괄 저장되었습니다.`
        : `${rows.length}개 약품의 약제팀 라벨 설정을 반영한 원내보유의약품리스트.xlsx가 다운로드되었습니다.`;
  }

  async function deletePharmacyDrugMaster(row: HospitalDrugLabelRow) {
    const workbookSaveMode = await deleteHospitalDrugMasterRowFromWorkbook(row.code, hospitalDrugWorkbookUrl);
    const code = row.code.trim().toUpperCase();
    setDeletedPharmacyDrugCodes((previous) => normalizeDeletedPharmacyDrugCodes([...previous, code]));
    removePharmacyDrugsFromApp([code]);
    return workbookSaveMode === "server"
      ? `[${row.code}] 약품이 원내보유의약품리스트와 전체 관련 화면에서 삭제되었습니다.`
      : workbookSaveMode === "file"
        ? `[${row.code}] 약품을 삭제한 원내보유의약품리스트.xlsx가 저장되었습니다.`
        : `[${row.code}] 약품을 삭제한 원내보유의약품리스트.xlsx가 다운로드되었습니다. 기존 파일을 교체해 주십시오.`;
  }

  async function bulkSavePharmacyDrugMasters(rows: HospitalDrugLabelRow[]) {
    const existingCodes = new Set(pharmacyHospitalDrugLabelRows.map((row) => row.code.trim().toUpperCase()));
    const duplicate = rows.find((row) => existingCodes.has(row.code.trim().toUpperCase()));
    if (duplicate) throw new Error(`이미 등록된 약품코드입니다: ${duplicate.code}`);
    const workbookSaveMode = await saveHospitalDrugMasterRowsToWorkbook(rows, hospitalDrugWorkbookUrl);
    setPharmacyHospitalDrugLabelRows((previous) => mergePharmacyRows(previous, rows));
    setPharmacyAdditionalRows((previous) => mergePharmacyRows(previous, rows));
    const registeredCodes = new Set(rows.map((row) => row.code.trim().toUpperCase()));
    setDeletedPharmacyDrugCodes((previous) => previous.filter((code) => !registeredCodes.has(code)));
    return workbookSaveMode === "server"
      ? `${rows.length}개 약품이 원내보유의약품리스트와 약품 마스터에 일괄 등록되었습니다.`
      : workbookSaveMode === "file"
        ? `${rows.length}개 약품을 일괄 등록한 원내보유의약품리스트.xlsx가 저장되었습니다.`
        : `${rows.length}개 약품을 일괄 등록한 원내보유의약품리스트.xlsx가 다운로드되었습니다.`;
  }

  async function bulkDeletePharmacyDrugMasters(codes: string[]) {
    const normalizedCodes = normalizeDeletedPharmacyDrugCodes(codes);
    const result = await deleteHospitalDrugMasterRowsFromWorkbook(normalizedCodes, hospitalDrugWorkbookUrl);
    setDeletedPharmacyDrugCodes((previous) => normalizeDeletedPharmacyDrugCodes([...previous, ...normalizedCodes]));
    removePharmacyDrugsFromApp(normalizedCodes);
    const missingMessage = result.missingCodes.length > 0 ? ` · 엑셀에 이미 없던 코드 ${result.missingCodes.length}개도 전체 화면에서 제외했습니다.` : "";
    return `${normalizedCodes.length}개 약품의 일괄 삭제를 적용했습니다.${missingMessage}`;
  }

  function printPharmacyStudioLabels(labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") {
    if (labels.length === 0) return;
    setPharmacyPrintDrafts(labels);
    setPharmacyPrintPaper(paperKey);
    setPrintPreviewMode("drug-labels");
    setPdfStatus("idle");
    setPdfDownload(null);
    setIsPharmacyLabelWorkspaceOpen(false);
    setReturnToPharmacyWorkspaceAfterPreview(true);
    setShowPrintPreview(true);
  }

  async function importHospitalDrugWorkbook(file: File) {
    const result = await applyExpirationWorkbook(file, hospitalDrugWorkbookUrl, pharmacyHospitalDrugLabelRows);
    setPharmacyHospitalDrugLabelRows(result.updatedRows);
    return `물품코드 ${result.sourceCount.toLocaleString("ko-KR")}건 중 ${result.updatedCount.toLocaleString("ko-KR")}개 약품의 가장 빠른 유효기간을 반영하고 원내보유의약품리스트.xlsx를 저장했습니다.`;
  }

  function openPrintPreview(mode: PrintPreviewMode = "single") {
    setPrintPreviewMode(mode);
    setPdfStatus("idle");
    setPdfDownload(null);
    setShowPrintPreview(true);
  }

  function closePrintPreview() {
    document.body.classList.remove("printing-preview");
    setShowPrintPreview(false);
    if (returnToPharmacyWorkspaceAfterPreview) {
      setIsPharmacyLabelWorkspaceOpen(true);
      setReturnToPharmacyWorkspaceAfterPreview(false);
    }
  }

  function printPreviewReport() {
    document.body.classList.add("printing-preview");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-preview"), 500);
  }

  function renderStockReportCard({
    targetRef,
    className = "report-card",
    room,
    items,
    checklist,
    showEcartLink = true,
  }: {
    targetRef?: RefObject<HTMLDivElement | null>;
    className?: string;
    room: StockRoom;
    items: EditableStockItem[];
    checklist: ChecklistState[];
    showEcartLink?: boolean;
  }) {
    const { refrigerated, roomTemperature } = splitStockItems(items);
    const ecartLink = stockRoomEcartLinks.get(room.id);
    const roomUpdatedAt = effectiveRoomUpdatedAt(room, stockRoomUpdatedAt);

    return (
      <section ref={targetRef} className={className}>
        <div className="report-title">
          <div className="report-title-row">
            <h2>{`( ${displayRoomName(room.label)} ) 병동 비품약 점검 체크리스트`}</h2>
            {showEcartLink && ecartLink && (
              <button className="header-link-button" onClick={() => goToEcartTarget(ecartLink.targetId, ecartLink.tab)}>
                E_Cart
              </button>
            )}
          </div>
          <span>점검 일자: {new Date().toLocaleDateString("ko-KR")}</span>
        </div>

        <div className="report-section-title with-meta stock-inventory-title">
          <span>
            <Database size={18} />
            약품 보유 현황
          </span>
          <small>마지막 수정일: {roomUpdatedAt || "미기재"}</small>
        </div>
        <StockReportTable
          refrigerated={refrigerated}
          roomTemperature={roomTemperature}
          checkedStock={checkedStock}
          onCheck={(roomId, drugCode) => {
            setUninspectedRoomIds((ids) => clearUninspectedRoomId(ids, roomId));
            setCheckedStock((prev) => {
              const key = stockKey(roomId, drugCode);
              const currentVal = prev[key] !== undefined ? prev[key] : (prev[stockKey("42W", drugCode)] ?? false);
              return { ...prev, [key]: !currentVal };
            });
          }}
          onSplitCheck={(roomId, drugCode, partIndex, partCount) => {
            setUninspectedRoomIds((ids) => clearUninspectedRoomId(ids, roomId));
            setCheckedStock((prev) => toggleStockSplitPart(prev, roomId, drugCode, partIndex, partCount));
          }}
          onExpiry={(roomId, drugCode, value) => setStockExpiry((prev) => ({ ...prev, [stockKey(roomId, drugCode)]: value }))}
          onCount={updateStockCount}
          onDelete={deleteStockItem}
        />

        <ChecklistTable
          items={checklist}
          onNote={(id, note) => updateStockChecklistNoteForRoom(room.id, id, note)}
          onStatus={(id, status) => updateStockChecklistStatusForRoom(room.id, id, status)}
        />
      </section>
    );
  }

  function renderEcartReportCard({
    targetRef,
    className = "report-card",
    target = activeEcartTarget,
    items = currentEcartItems,
    checklist = activeEcartState.checklist,
    editable = true,
  }: {
    targetRef?: RefObject<HTMLDivElement | null>;
    className?: string;
    target?: EcartTarget;
    items?: EditableEcartItem[];
    checklist?: ChecklistState[];
    editable?: boolean;
  }) {
    const noop = () => undefined;

    return (
      <section ref={targetRef} className={className}>
        <div className="report-title">
          <div className="report-title-row">
            <h2>{`( ${displayRoomName(target.label)} ) 응급카트 점검 체크리스트`}</h2>
          </div>
          <span>점검 일자: {new Date().toLocaleDateString("ko-KR")}</span>
        </div>

        <div className="report-section-title">
          <Database size={18} />
          약품 보유 현황
        </div>
        <EcartReportTable
          items={items}
          onCheck={
            editable
              ? (id) => updateActiveEcartItems((rows) => rows.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))
              : noop
          }
          onExpiry={(id, expiryDate) =>
            editable
              ? updateActiveEcartItems((rows) => rows.map((item) => (item.id === id ? { ...item, expiryDate } : item)))
              : undefined
          }
          onCount={editable ? updateEcartCount : noop}
          onDelete={editable ? deleteEcartItem : noop}
        />

        <ChecklistTable
          items={checklist}
          onNote={editable ? updateEcartChecklistNote : noop}
          onStatus={editable ? updateEcartChecklistStatus : noop}
        />
      </section>
    );
  }

  function renderNarcoticLotCells(item: EditableStockItem) {
    const lot = narcoticLotAssignments[narcoticLotKey(item.roomId, item.drugCode)];
    return (
      <>
        <td className="lot-cell">{lot?.roomLot || "-"}</td>
        <td className="lot-cell">{lot?.pharmacyLot || "-"}</td>
      </>
    );
  }

  function renderNarcoticReportCard({
    targetRef,
    className = "report-card",
    room = narcoticRoomInfo,
    items = currentNarcoticItems,
    checklist = currentNarcoticChecklist,
  }: {
    targetRef?: RefObject<HTMLDivElement | null>;
    className?: string;
    room?: StockRoom;
    items?: EditableStockItem[];
    checklist?: ChecklistState[];
  }) {
    const roomHasAssignedItems = (narcoticItemsByRoom.get(room.id)?.length ?? items.length) > 0;
    const displayItems =
      items.length === 0 && !roomHasAssignedItems
        ? [makeEmptyNarcoticStockItem(room.id, narcoticCheckedItems[stockKey(room.id, EMPTY_NARCOTIC_STOCK_CODE)] ?? false)]
        : items;
    const emptyInventoryItems = displayItems.filter(isEmptyNarcoticStockItem);
    const realItems = displayItems.filter((item) => !isEmptyNarcoticStockItem(item));
    const psychotropicItems = realItems.filter((item) => (narcoticDrugCategories[item.drugCode] ?? narcoticCategoryOf(item.drugCode)) === "향정");
    const narcoticItems = realItems.filter((item) => (narcoticDrugCategories[item.drugCode] ?? narcoticCategoryOf(item.drugCode)) === "마약");

    return (
      <section ref={targetRef} className={className}>
        <div className="report-title">
          <div className="report-title-row">
            <h2>{`( ${displayRoomName(room.label)} ) 비치 마약류 점검 체크리스트`}</h2>
          </div>
          <span>점검 일자: {new Date().toLocaleDateString("ko-KR")}</span>
        </div>

        <div className="report-section-title with-meta stock-inventory-title">
          <span>
            <Database size={18} />
            비치 마약류 보유 현황
          </span>
        </div>
        <div className="table-wrap bordered inspection-table-wrap stock-inventory-wrap">
          <table className="data-table inspection-table narcotic-inventory-table">
            <thead>
              <tr>
                <th>점검</th>
                <th>코드</th>
                <th>약품명</th>
                <th>수량</th>
                <th>실별 LOT</th>
                <th>조제실 LOT</th>
                <th>3개월 미만</th>
                <th>삭제</th>
              </tr>
            </thead>
            <tbody>
              {emptyInventoryItems.map((item) => (
                <tr key={`${item.roomId}-${item.drugCode}`} className="item-row psychotropic empty-narcotic-stock-row">
                  <td className="check-cell">
                    <input type="checkbox" checked={item.checked} onChange={() => toggleNarcoticItemCheck(item.roomId, item.drugCode)} />
                  </td>
                  <td className="code">-</td>
                  <td>
                    <strong>{EMPTY_NARCOTIC_STOCK_LABEL}</strong>
                  </td>
                  <td>-</td>
                  <td className="lot-cell">-</td>
                  <td className="lot-cell">-</td>
                  <td>-</td>
                  <td>-</td>
                </tr>
              ))}
              {psychotropicItems.length > 0 && (
                <GroupRows
                  label="향정신성의약품"
                  tone="psychotropic"
                  items={psychotropicItems}
                  checkedStock={narcoticCheckedItems}
                  onCheck={toggleNarcoticItemCheck}
                  onSplitCheck={() => {}}
                  onExpiry={(roomId, drugCode, value) => setNarcoticExpiry((prev) => ({ ...prev, [stockKey(roomId, drugCode)]: value }))}
                  onCount={updateNarcoticCount}
                  onDelete={deleteNarcoticItem}
                  renderExtraCells={renderNarcoticLotCells}
                />
              )}
              {narcoticItems.length > 0 && (
                <GroupRows
                  label="마약류"
                  tone="narcotic-group"
                  items={narcoticItems}
                  checkedStock={narcoticCheckedItems}
                  onCheck={toggleNarcoticItemCheck}
                  onSplitCheck={() => {}}
                  onExpiry={(roomId, drugCode, value) => setNarcoticExpiry((prev) => ({ ...prev, [stockKey(roomId, drugCode)]: value }))}
                  onCount={updateNarcoticCount}
                  onDelete={deleteNarcoticItem}
                  renderExtraCells={renderNarcoticLotCells}
                />
              )}
              {emptyInventoryItems.length === 0 && psychotropicItems.length === 0 && narcoticItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-row">
                    이 실에 배정된 마약류가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <ChecklistTable
          items={checklist}
          onNote={(id, note) => updateNarcoticChecklistNote(room.id, id, note)}
          onStatus={(id, status) => updateNarcoticChecklistStatus(room.id, id, status)}
        />
      </section>
    );
  }

  function renderReportCard(targetRef: RefObject<HTMLDivElement | null>, className = "report-card") {
    if (mainCategory === "stock") {
      return renderStockReportCard({
        targetRef,
        className,
        room: activeRoomInfo,
        items: currentStockItems,
        checklist: currentStockChecklist,
      });
    }
    if (mainCategory === "narcotic") {
      return renderNarcoticReportCard({ targetRef, className });
    }
    return renderEcartReportCard({ targetRef, className });
  }

  function renderBulkStockReports() {
    return (
      <div ref={printPreviewRef} className="bulk-report-stack">
        {currentStockRooms.map((room) => (
          <div key={room.id} className="bulk-report-page">
            {renderStockReportCard({
              className: "report-card print-preview-report",
              room,
              items: stockItemsByRoom.get(room.id) ?? [],
              checklist: getStockChecklistDefaultState(stockChecklistByRoom, room.id),
              showEcartLink: false,
            })}
          </div>
        ))}
      </div>
    );
  }

  function renderBulkNarcoticReports() {
    return (
      <div ref={printPreviewRef} className="bulk-report-stack">
        {currentNarcoticRooms.map((room) => (
          <div key={room.id} className="bulk-report-page">
            {renderNarcoticReportCard({
              className: "report-card print-preview-report",
              room,
              items: narcoticItemsByRoom.get(room.id) ?? [],
              checklist: getNarcoticChecklistDefaultState(narcoticChecklistByRoom, room.id),
            })}
          </div>
        ))}
      </div>
    );
  }

  function renderBulkEcartReports() {
    return (
      <div ref={printPreviewRef} className="bulk-report-stack">
        {getAllEcartPrintTargets(ecartTargets).map(({ tab, target, key }) => {
          const state = filterDeletedEcartItems(getEcartDefaultState(ecartByTarget, tab, key), deletedPharmacyDrugCodeSet);
          return (
            <div key={key} className="bulk-report-page">
              {renderEcartReportCard({
                className: "report-card print-preview-report",
                target,
                items: state.items,
                checklist: state.checklist,
                editable: false,
              })}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDrugLabelArticle(entry: PrintableDrugLabel, key: string) {
    const { row, sizeKey } = entry;
    const savedGeneralFluidLabel = savedPharmacyLabels.find((label) =>
      label.labelFamily === "drug"
      && label.category === "일반수액"
      && label.code.trim().toUpperCase() === row.code.trim().toUpperCase(),
    );
    const savedGeneralFluidTextColor = savedGeneralFluidLabel?.style.fontColor?.trim();
    const hasSavedGeneralFluidTextColor = Boolean(savedGeneralFluidTextColor && savedGeneralFluidTextColor.toLowerCase() !== "#111827");
    const flagLabels = labelFlagLabels(row);
    const hasPositionedMandatoryDilution = flagLabels.includes(MANDATORY_DILUTION_LABEL)
      && ["10x70", "15x95", "55x95", "35x100"].includes(sizeKey);
    const toplineRow = hasPositionedMandatoryDilution
      ? { ...row, cautionLabels: row.cautionLabels.filter((label) => label !== MANDATORY_DILUTION_LABEL) }
      : row;
    const toplineFlagLabels = labelFlagLabels(toplineRow);
    const isLightProtected = isLightProtectedLabel(row);
    const hasRedPriority = hasRedPriorityLabel(row);
    const hasControlledCaution = hasControlledCautionLabel(toplineFlagLabels);
    const renderedKind = isEcartLabelKind(row.kind) ? "ecart" : row.kind;
    const fluidTone = row.fluidTone;
    const nameClass = getDrugLabelNameClass(row.name, renderedKind, sizeKey);
    const isNarcoticFortyLabel = renderedKind === "narcotic" && sizeKey === "40x70";
    const hasDoseWarningLabel = shouldHighlightDoseInLabel(row);
    const className = [
      "drug-label-item",
      "print-label",
      `label-size-${sizeKey}`,
      `label-kind-${renderedKind}`,
      entry.isCheckedMasterPrint ? "checked-master-label" : "",
      nameClass,
      fluidTone ? "fluid-label" : "",
      fluidTone ? `fluid-tone-${fluidTone}` : "",
      hasSavedGeneralFluidTextColor ? "saved-general-fluid-text-color" : "",
      row.highRisk ? "high-risk-label" : "",
      isLightProtected ? "light-protected-label" : "",
      hasRedPriority ? "has-red-priority-label" : "",
      hasControlledCaution ? "has-controlled-caution-label" : "",
      hasControlledCaution && usesCompactGeneralLabelStoragePanel(row, sizeKey) ? "compact-controlled-caution-label" : "",
      flagLabels.length > 0 ? "has-caution-label" : "",
      row.doseCaution ? "has-dose-caution" : "",
      hasDoseWarningLabel ? "has-dose-warning-label" : "",
      hasPositionedMandatoryDilution ? "has-positioned-mandatory-dilution" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <article className={className} style={{ ...labelSizeCssVars(sizeKey), "--saved-general-fluid-text-color": savedGeneralFluidTextColor } as CSSProperties} key={key}>
        {isNarcoticFortyLabel ? renderNarcoticFortyTopline(row) : renderLabelTopline(toplineRow, sizeKey)}
        <h3 className={fluidTone ? `fluid-name ${fluidTone}` : undefined}>
          {isNarcoticFortyLabel
            ? renderNarcoticFortyLabelName(row)
            : renderDrugLabelName(row, renderedKind, sizeKey, entry.isCheckedMasterPrint)}
        </h3>
        {isNarcoticFortyLabel ? renderNarcoticFortyFooter(row) : renderLabelSpec(row)}
        {hasPositionedMandatoryDilution ? (
          <strong className="drug-label-mandatory-dilution">{MANDATORY_DILUTION_LABEL}</strong>
        ) : null}
      </article>
    );
  }

  function renderPharmacyPrintDraftArticle(draft: PharmacyLabelDraft, key: string) {
    const isSideLabel = draft.accessory === "측면라벨" || draft.accessory === "유색 측면라벨";
    const isCapLabel = draft.accessory === "병뚜껑" || draft.accessory === "유색 병뚜껑";
    const isExternalShelfLabel = ["외용제", "외용점안제", "팩제", "시럽"].includes(draft.category) && draft.size.presetKey === "13.5x105";
    const hasDoseHighlight = draft.warnings.some((warning) => warning === "용량주의" || warning === "용량확인");
    const hasCautionWarning = draft.warnings.some((warning) =>
      ["위해의약품", "용량주의", "용량확인", "유사발음", "유사모양", "이름주의", "고위험의약품"].includes(warning)
        || warning.includes("반드시 희석 후 사용"),
    );
    const hasFrozenWarning = draft.warnings.includes("냉동");
    const hasColdWarning = draft.warnings.includes("냉장") || hasFrozenWarning;
    const coldWarningText = hasFrozenWarning ? "냉동" : "냉장";
    const hasLightWarning = draft.warnings.includes("차광");
    const cautionWarnings = draft.warnings.filter((warning) => !["냉장", "냉동", "차광"].includes(warning));
    const sideCautionWarnings = draft.warnings.filter((warning) => ["위해의약품", "용량주의", "유사발음", "유사모양", "이름주의", "용량확인"].includes(warning));
    const externalCautionWarnings = draft.warnings.filter((warning) => ["위해의약품", "용량주의", "용량확인", "유사발음", "유사모양", "이름주의"].includes(warning));
    const hasNameConfusion = draft.warnings.some((warning) => ["유사발음", "이름주의"].includes(warning));
    const externalStorageText = hasLightWarning ? "차광" : hasColdWarning ? coldWarningText : "";
    const externalHasFlags = externalCautionWarnings.length > 0 || Boolean(externalStorageText);
    const isInjectionLabel = ["앰플", "바이알", "냉장주사"].includes(draft.category);
    const isAmpouleVial = ["앰플", "바이알"].includes(draft.category);
    const isAmpouleHolder = draft.accessory === "앰플꽂이";
    const showStorageBanner = isInjectionLabel && (hasLightWarning || hasColdWarning);
    const showTopBanner = Boolean(draft.printable.topBanner) || hasCautionWarning || showStorageBanner;
    const displayTitle = isCapLabel
      ? draft.printable.title.replace(/\btab(?:let)?\b/gi, "").replace(/\s{2,}/g, " ").trim()
      : draft.printable.title;
    const titleParts = draft.category === "영양수액" ? splitNutritionDoseText(displayTitle) : splitDoseText(displayTitle);
    const nutritionDoseParts = splitNutritionDoseParts(displayTitle);
    const koreanTitleParts = splitDoseText(draft.printable.koreanName);
    const controlledCategory = draft.drugTypes.includes("마약")
      ? "마약"
      : draft.drugTypes.includes("향정")
        ? "향정"
        : /^\s*\[(마약|향정)\]/.exec(draft.printable.title)?.[1] ?? "마약/향정";
    const controlledTitle = stripHospitalDrugControlledPrefix(displayTitle);
    const controlledTitleParts = splitDoseText(controlledTitle);
    const imageUrl = draft.imagePath
      ? `${import.meta.env.BASE_URL}${draft.imagePath.replace(/^\.?\//, "")}`
      : "";
    const storageOnlyClass = !hasCautionWarning && hasColdWarning && hasLightWarning
      ? "storage-light-cold"
      : !hasCautionWarning && hasColdWarning
        ? "storage-cold"
        : !hasCautionWarning && hasLightWarning
          ? "storage-light"
          : "";
    const externalTone = hasCautionWarning ? "#d92d20" : hasColdWarning ? "#155eef" : hasLightWarning ? "#16803c" : draft.style.outerBorderColor;
    const titleSizeClass = displayTitle.length > 34 ? "very-long-name" : displayTitle.length > 25 ? "long-name" : displayTitle.length > 16 ? "medium-name" : "";
    const storageToneClass = hasLightWarning ? "storage-tone-light" : hasColdWarning ? "storage-tone-cold" : "";
    const isCompactSyrupLabel = draft.category === "시럽" && draft.size.presetKey === "15x90";
    const isGeneralFluidLabel = draft.category === "일반수액";
    const renderedDisplayTitle = isGeneralFluidLabel ? formatFluidLabelName(displayTitle) : displayTitle;
    const generalFluidTone = isGeneralFluidLabel
      ? fluidLabelTone({ code: draft.code, genericName: draft.printable.koreanName, productName: draft.printable.title, spec: draft.printable.strength })
      : undefined;
    const isHeparinLabel = draft.printable.footer.text.trim() === "헤파린";
    const hasCustomOuterBorderColor = draft.style.outerBorderPx > 0 && draft.style.outerBorderColor.toLowerCase() !== "#111827";
    const styledTitleStyles = mergeDoseHighlightStyles(renderedDisplayTitle, draft.titleStyles ?? [], hasDoseHighlight);
    const styledTitle = styledTitleStyles.length
      ? splitStyledPharmacyTitle(renderedDisplayTitle, styledTitleStyles).map((part, index) => <span className={part.style?.backgroundColor && part.style.backgroundColor !== "transparent" ? "pharmacy-editable-title-highlight" : undefined} key={`${index}-${part.text}`} style={{
        color: part.style?.color,
        "--pharmacy-title-highlight-background": part.style?.backgroundColor,
          fontSize: part.style?.fontSizePt ? `${part.style.fontSizePt}pt` : undefined,
          fontWeight: part.style?.fontWeight,
        } as CSSProperties}>{part.text}</span>)
      : null;
    const style = {
      "--pharmacy-label-width-mm": draft.size.widthMm,
      "--pharmacy-label-height-mm": draft.size.heightMm,
      "--pharmacy-label-border": isSideLabel
        ? "1px solid #111827"
        : draft.style.outerBorderPx <= 0
          ? "none"
          : `${draft.style.outerBorderPx}mm solid ${draft.style.outerBorderColor}`,
      "--pharmacy-label-border-width": draft.style.outerBorderPx <= 0 ? "0mm" : `${draft.style.outerBorderPx}mm`,
      "--pharmacy-label-border-color": draft.style.outerBorderColor,
      "--pharmacy-label-font-size": `${draft.style.fontSizePt}pt`,
      "--pharmacy-label-color": draft.style.fontColor,
      "--pharmacy-label-warning": draft.style.warningColor,
      "--pharmacy-label-font-family": draft.style.fontFamily,
      "--pharmacy-label-outline-color": draft.style.textOutlineColor,
      "--pharmacy-label-outline-px": `${draft.style.textOutlinePx}px`,
      "--pharmacy-label-background": draft.accessory === "유색 측면라벨" || draft.accessory === "유색 병뚜껑" ? draft.backgroundColor : "#ffffff",
      "--pharmacy-external-tone": externalTone,
    } as CSSProperties;

    return (
      <article className={`pharmacy-print-label print-label label-size-${draft.size.presetKey} ${draft.category === "항암제" ? "anticancer" : ""} ${draft.category === "고가약" ? "high-cost" : ""} ${draft.category === "마약/향정" ? "controlled-drug-label" : ""} ${hasCustomOuterBorderColor ? "custom-outer-border" : ""} ${storageOnlyClass} ${storageToneClass} ${isCapLabel ? "cap-label" : ""} ${isSideLabel ? "side-label" : ""} ${isExternalShelfLabel ? "external-shelf-label" : ""} ${draft.category === "시럽" ? "syrup-label" : ""} ${draft.category === "영양수액" ? "nutrition-fluid-label" : ""} ${isGeneralFluidLabel ? `general-fluid-label fluid-tone-${generalFluidTone}` : ""} ${isInjectionLabel ? "injection-label" : ""} ${isHeparinLabel ? "heparin-label" : ""} ${isAmpouleHolder ? "has-ampoule-holder" : ""} ${!showTopBanner ? "no-top-banner no-warning" : ""}`} style={style} key={key}>
        {draft.cabinetLayout ? <PharmacyCabinetLayoutView layout={draft.cabinetLayout}/> : isSideLabel ? <div className="pharmacy-side-label-form">
          <div className="pharmacy-side-label-photo">{imageUrl
            ? <img src={imageUrl} alt={`${draft.printable.koreanName} 식별사진`}/>
            : <span>사진 미등록</span>}</div>
          <div className="pharmacy-side-label-name">
            <div className="pharmacy-side-label-name-core"><strong>{hasDoseHighlight && koreanTitleParts.dose
              ? <>{koreanTitleParts.before}<mark className="dose-highlight">{koreanTitleParts.dose}</mark>{koreanTitleParts.after}</>
              : draft.printable.koreanName || draft.printable.title}</strong>
            <span>{hasDoseHighlight && titleParts.dose ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</> : draft.printable.title}</span>
            {draft.doseUnit && draft.doseUnit !== "1T" ? <b>{draft.doseUnit}</b> : null}</div>
            {sideCautionWarnings.length > 0 ? <small>{sideCautionWarnings.join(" · ")}</small> : null}
            {hasLightWarning ? <small className="side-storage-light">차광</small> : null}
          </div>
          <div className="pharmacy-side-label-meta">
            <strong>{draft.atc ? `${draft.atc}번` : "-"}</strong>
            <span>유효기간</span>
            <b>{formatPharmacyExpiry(draft.expiry) || "YYYY-MM-DD"}</b>
          </div>
        </div> : draft.labelFamily === "cabinet" ? <div className={`pharmacy-cabinet-list-row ${draft.location ? "with-location-column" : ""}`}>
          <div><strong>{draft.printable.title}</strong>{draft.printable.koreanName ? <span>{draft.printable.koreanName}</span> : null}</div>
          <b>{draft.warnings.filter((warning) => !["냉장", "냉동", "차광"].includes(warning)).join(" · ") || "-"}</b>
          {draft.location ? <em>{draft.location}</em> : null}
        </div> : draft.category === "마약/향정" ? <div className="pharmacy-controlled-label-form">
          <div className="pharmacy-controlled-label-top">고위험의약품{hasDoseHighlight ? " / 용량확인" : ""}</div>
          <strong className={titleSizeClass}>{hasDoseHighlight && controlledTitleParts.dose
            ? <>{controlledTitleParts.before}<mark className="dose-highlight">{controlledTitleParts.dose}</mark>{controlledTitleParts.after}</>
            : controlledTitle}</strong>
          <div className="pharmacy-controlled-label-footer">{controlledCategory}{hasColdWarning ? ` / ${coldWarningText}` : ""}</div>
        </div> : draft.category === "영양수액" ? <div className={`pharmacy-nutrition-label ${hasCautionWarning || hasLightWarning ? "with-flags" : "name-only"} ${hasLightWarning ? "with-light" : ""}`}>
          {(hasCautionWarning || hasLightWarning) ? <aside className={hasLightWarning ? "light-condition" : ""}>{hasLightWarning ? "차광" : cautionWarnings[0] ?? ""}</aside> : null}
          <strong className={titleSizeClass}>{hasDoseHighlight
            ? nutritionDoseParts.map((part, index) => part.highlighted ? <mark className="dose-highlight" key={index}>{part.text}</mark> : part.text)
            : draft.printable.title}</strong>
          {(hasLightWarning ? cautionWarnings.length > 0 : cautionWarnings.length > 1) ? <aside>{(hasLightWarning ? cautionWarnings : cautionWarnings.slice(1)).join("\n")}</aside> : null}
        </div> : isExternalShelfLabel ? <div className={`pharmacy-external-strip ${externalHasFlags ? "" : "name-only"} ${externalCautionWarnings.length > 0 && externalStorageText ? "with-two-flags" : ""} ${hasLightWarning ? "light-storage" : hasColdWarning ? "cold-storage" : ""}`}>
          {externalHasFlags ? <aside className={externalCautionWarnings.length > 0 ? "caution" : hasLightWarning ? "light" : hasColdWarning ? "cold" : ""}>{externalCautionWarnings.length > 0 ? externalCautionWarnings.join("\n") : externalStorageText}</aside> : null}
          <strong className={`${titleSizeClass} ${hasNameConfusion ? "confusion-name" : ""}`}>{hasDoseHighlight && titleParts.dose ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</> : displayTitle}</strong>
          {externalCautionWarnings.length > 0 && externalStorageText ? <aside className={hasLightWarning ? "light" : "cold"}>{externalStorageText}</aside> : null}
        </div> : <>
        {!isCapLabel && !isExternalShelfLabel && showTopBanner ? <div className={`pharmacy-label-top-banner ${!hasCautionWarning && hasLightWarning ? `light-only ${isAmpouleVial ? "ampoule-vial-light-only" : ""}` : !hasCautionWarning && hasColdWarning ? "cold-only" : ""}`}>
          <span>{[draft.printable.topBanner, draft.category !== "항암제" ? cautionWarnings.join(" · ") : "", !hasCautionWarning && hasLightWarning ? (isAmpouleVial ? "차광보관" : "차광") : "", !hasCautionWarning && !hasLightWarning && hasColdWarning ? `${coldWarningText}보관` : ""].filter(Boolean).join(" · ")}</span>
          {hasCautionWarning && hasLightWarning ? <b className="pharmacy-storage-badge light">차광</b> : null}
          {hasCautionWarning && hasColdWarning ? <b className="pharmacy-storage-badge cold">{coldWarningText}</b> : null}
        </div> : null}
        {!hasCautionWarning && hasColdWarning && hasLightWarning ? <b className="pharmacy-storage-circle cold">{coldWarningText}</b> : null}
        <div className="pharmacy-label-main">
          <PharmacyAutoFitLabelContent fitKey={`${draft.size.presetKey}|${draft.style.outerBorderPx}|${draft.printable.title}|${draft.printable.koreanName}|${draft.warnings.join("|")}|${JSON.stringify(draft.titleStyles ?? [])}`}>
          <strong className={`${titleSizeClass} ${hasNameConfusion && ["외용제", "외용점안제", "팩제"].includes(draft.category) ? "confusion-name" : ""}`}>{styledTitle ?? (hasDoseHighlight && titleParts.dose
            ? <>{titleParts.before}<mark className="dose-highlight">{titleParts.dose}</mark>{titleParts.after}</>
            : renderedDisplayTitle)}</strong>
          {!isCapLabel && !isExternalShelfLabel && !isCompactSyrupLabel && !isGeneralFluidLabel ? <span>{draft.printable.koreanName}</span> : null}
          {isCapLabel && draft.doseUnit && draft.doseUnit !== "1T" ? <b>{draft.doseUnit}</b> : null}
          </PharmacyAutoFitLabelContent>
          {!isCapLabel && !isExternalShelfLabel && draft.atc ? <small className="pharmacy-label-atc">ATC {draft.atc}</small> : null}
          {!isCapLabel && !isExternalShelfLabel && draft.location ? <small className="pharmacy-label-location">{draft.location}</small> : null}
        </div>
        {isAmpouleHolder ? <div className="pharmacy-ampoule-holder">앰플꽂이</div> : null}
        {!isExternalShelfLabel && (draft.printable.footer.enabled || draft.warnings.includes("위해의약품")) ? <footer className={draft.category === "항암제" ? "anticancer-footer" : isHeparinLabel ? "heparin-footer" : ""}>{draft.warnings.includes("위해의약품") ? "<캅셀개봉. 분쇄 금지>" : draft.category === "항암제" ? "항암제" : draft.printable.footer.text}</footer> : null}
        </>}
      </article>
    );
  }

  function renderDrugLabelSheet(targetRef?: RefObject<HTMLDivElement | null>, className = "drug-label-sheet", previewLimit?: number) {
    const pharmacyDrafts = previewLimit ? pharmacyPrintDrafts.slice(0, previewLimit) : pharmacyPrintDrafts;
    if (pharmacyDrafts.length > 0) {
      const layout = planPharmacyLabelsForPaper(pharmacyDrafts, pharmacyPrintPaper === "A3" ? A3_PAPER : A4_PAPER);
      const { paper, pages } = layout;
      return (
        <section ref={targetRef} className={`${className} pharmacy-print-pages`}>
          {pages.map((page, pageIndex) => (
            <div
              className="bulk-report-page pharmacy-print-page"
              key={`${paper.key}-${pageIndex}`}
              style={{
                "--pharmacy-paper-width-mm": paper.widthMm,
                "--pharmacy-paper-height-mm": paper.heightMm,
                "--pharmacy-paper-margin-mm": paper.marginMm,
              } as CSSProperties}
            >
              <div className="drug-label-print-grid mixed-label-grid pharmacy-paper-label-grid">
                {page.map((draft, index) => renderPharmacyPrintDraftArticle(draft, `${draft.id}-${draft.savedAt ?? "draft"}-${index}`))}
              </div>
            </div>
          ))}
        </section>
      );
    }
    const printableLabels = previewLimit ? labelPrintRows.slice(0, previewLimit) : labelPrintRows;
    const pages = planDrugLabelsForA4(printableLabels);
    return (
      <section ref={targetRef} className={`${className} mixed-label-sheet drug-label-print-pages`}>
        {pages.map((page, pageIndex) => (
          <div className="bulk-report-page drug-label-print-page" key={`drug-label-page-${pageIndex}`}>
            <div className="drug-label-print-grid mixed-label-grid drug-label-page-grid">
              {page.map((entry, index) => renderDrugLabelArticle(entry, `${entry.id}-${entry.sizeKey}-${entry.copyIndex}-${index}`))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  function renderRoundSummaryReport(targetRef?: RefObject<HTMLDivElement | null>, className = "round-summary-report") {
    const draft = activeRoundSummaryDraft;

    return (
      <section ref={targetRef} className={className}>
        <div className="round-summary-title">
          <h2>{draft.title}</h2>
          <p>점검일 : {draft.inspectionPeriod}</p>
        </div>
        <div className="table-wrap bordered">
          <table className="data-table round-summary-table">
            <thead>
              <tr>
                <th>{activeRoundSummaryHeaders.room}</th>
                <th>점검결과</th>
                <th>{activeRoundSummaryHeaders.detail}</th>
              </tr>
            </thead>
            <tbody>
              {draft.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.roomName}</td>
                  <td>{row.result}</td>
                  <td className="summary-detail-cell">{row.details || "적합"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="round-summary-guidance">{draft.commonGuidance}</div>
        {draft.closingNote && <p className="round-summary-closing">{draft.closingNote}</p>}
      </section>
    );
  }

  function renderRoundSummaryEditor() {
    const draft = activeRoundSummaryDraft;

    return (
      <section className="round-summary-stack">
        <section className="card round-summary-editor">
          <div className="card-head">
            <div>
              <h2>{draft.title}</h2>
              <p>{activeRoundSummaryHeaders.description}</p>
            </div>
            <div className="toolbar-actions">
              <button className="secondary-button" onClick={regenerateRoundSummaryDraft}>
                <FileText size={16} />
                자동 작성 다시 생성
              </button>
              <button className="print-button" onClick={openRoundSummaryPrintPreview}>
                <Printer size={16} />
                미리보기/인쇄
              </button>
            </div>
          </div>

          <div className="round-summary-form">
            <label className="round-summary-period">
              점검일
              <input
                value={draft.inspectionPeriod}
                onChange={(event) => updateRoundSummaryDraft({ inspectionPeriod: event.target.value })}
              />
            </label>

            <div className="table-wrap bordered">
              <table className="data-table round-summary-table editable">
                <thead>
                  <tr>
                    <th>{activeRoundSummaryHeaders.room}</th>
                    <th>점검결과</th>
                    <th>{activeRoundSummaryHeaders.detail}</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input value={row.roomName} onChange={(event) => updateRoundSummaryRow(row.id, { roomName: event.target.value })} />
                      </td>
                      <td>
                        <input value={row.result} onChange={(event) => updateRoundSummaryRow(row.id, { result: event.target.value })} />
                      </td>
                      <td>
                        <textarea
                          value={row.details}
                          onChange={(event) => updateRoundSummaryRow(row.id, { details: event.target.value })}
                          rows={row.details.includes("\n") ? 3 : 2}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="round-summary-guidance-editor">
              {activeRoundSummaryIsNarcotic ? "안내 문구" : "공통 안내"}
              <textarea
                value={draft.commonGuidance}
                onChange={(event) => updateRoundSummaryDraft({ commonGuidance: event.target.value })}
                rows={8}
              />
            </label>
            <label className="round-summary-guidance-editor">
              마무리 문구
              <input value={draft.closingNote} onChange={(event) => updateRoundSummaryDraft({ closingNote: event.target.value })} />
            </label>
          </div>
        </section>
      </section>
    );
  }

  if (isPharmacyLocator) {
    return <PharmacyDrugLocator rows={pharmacyHospitalDrugLabelRows} isLoading={isHospitalDrugLabelsLoading} />;
  }

  if ((isPharmacyEditor || isPharmacyLabelWorkspaceOpen) && !showPrintPreview) {
    return (
      <PharmacyLabelWorkspace
        rows={pharmacyHospitalDrugLabelRows}
        savedLabels={savedPharmacyLabels}
        isLoading={isPharmacyLabelMatchesLoading}
        onBack={() => {
          if (!isPharmacyEditor) setIsPharmacyLabelWorkspaceOpen(false);
        }}
        onSaveLabel={savePharmacyStudioLabel}
        onSaveLabels={savePharmacyStudioLabels}
        onPrint={printPharmacyStudioLabels}
        onHospitalDrugWorkbookUpload={importHospitalDrugWorkbook}
        onSaveMaster={savePharmacyDrugMaster}
        onSaveManyMaster={saveManyPharmacyDrugMasters}
        onDeleteMaster={deletePharmacyDrugMaster}
        onBulkSaveMaster={bulkSavePharmacyDrugMasters}
        onBulkDeleteMaster={bulkDeletePharmacyDrugMasters}
        standalone={isPharmacyEditor}
      />
    );
  }

  const headerEyebrow = isPharmacyViewer
    ? "약제팀 뷰어"
    : isNarcoticViewer
      ? "마약 담당자 뷰어"
      : isViewerMode
        ? "뷰어 전용"
        : "병동 비품약 & E-cart 점검";
  const headerTitle = isPharmacyViewer
    ? "약제팀 라벨 마스터 관리"
    : isNarcoticViewer
      ? showMaster
        ? "병동 약품 라벨 마스터관리"
        : "비치마약류 관리"
      : isViewerMode
        ? "전체 비품약 마스터 관리"
        : "비품관리 현황판";

  return (
    <div className={`app-page ${isMobileMode ? "mobile-mode" : ""} ${isViewerMode ? "viewer-mode" : ""}`}>
      <header className="app-header">
        <div>
          <p>{headerEyebrow}</p>
          <h1>{headerTitle}</h1>
        </div>
        {!isReadOnlyViewer && (
          <div className="header-actions">
            {!isViewerMode && (
              <>
                <button className={`admin-toggle ${showRoundSummary ? "danger" : ""}`} onClick={toggleRoundSummaryView}>
                  <FileText size={18} />
                  {showRoundSummary ? "점검 현황판으로 돌아가기" : "병동 순회 점검표"}
                </button>
                <button className={`admin-toggle ${isMobileMode ? "active" : ""}`} onClick={() => setIsMobileMode(!isMobileMode)}>
                  {isMobileMode ? <Monitor size={18} /> : <Smartphone size={18} />}
                  {isMobileMode ? "PC 화면 보기" : "모바일 화면 보기"}
                </button>
                <button className={`admin-toggle sync ${syncStatus.mode}`} onClick={() => setShowSyncSettings((prev) => !prev)}>
                  <RefreshCw size={18} />
                  자동 저장 상태
                </button>
                <button className={`admin-toggle ${showViewerLinks ? "active" : ""}`} onClick={() => setShowViewerLinks((prev) => !prev)}>
                  <Monitor size={18} />
                  뷰어관리
                </button>
              </>
            )}
            <button className={`admin-toggle ${showMaster ? "danger" : ""}`} onClick={toggleMasterView}>
              <Database size={18} />
              {showMaster ? (isNarcoticViewer ? "비치마약류 관리로 돌아가기" : "점검 현황판으로 돌아가기") : "전체 비품약 마스터 관리"}
            </button>
          </div>
        )}
      </header>

      {!isViewerMode && showViewerLinks && (
        <section className="viewer-links-panel">
          <div className="viewer-link-list">
            <div className="viewer-link-item">
              <a href="https://donggukpharm7992-star.github.io/Ecart-/narcotic-viewer/" target="_blank" rel="noreferrer">
                비치마약류 관리
              </a>
              <code>https://donggukpharm7992-star.github.io/Ecart-/narcotic-viewer/</code>
            </div>
            <div className="viewer-link-item">
              <a href="https://donggukpharm7992-star.github.io/Ecart-/viewer/" target="_blank" rel="noreferrer">
                병동 약품 라벨 마스터관리
              </a>
              <code>https://donggukpharm7992-star.github.io/Ecart-/viewer/</code>
            </div>
            <div className="viewer-link-item">
              <a href="https://donggukpharm7992-star.github.io/Ecart-/pharmacy-viewer/" target="_blank" rel="noreferrer">
                비치약품 배정 및 코드 관리
              </a>
              <code>https://donggukpharm7992-star.github.io/Ecart-/pharmacy-viewer/</code>
            </div>
            <div className="viewer-link-item">
              <a href="https://donggukpharm7992-star.github.io/Ecart-/pharmacy-label-editor/" target="_blank" rel="noreferrer">
                약제팀 라벨 편집 전용
              </a>
              <code>https://donggukpharm7992-star.github.io/Ecart-/pharmacy-label-editor/</code>
            </div>
            <div className="viewer-link-item">
              <a href="https://donggukpharm7992-star.github.io/pharmacy-drug-locator/" target="_blank" rel="noreferrer">
                약제팀 약품 위치 찾기
              </a>
              <code>https://donggukpharm7992-star.github.io/pharmacy-drug-locator/</code>
            </div>
          </div>
          <div className="viewer-link-help">
            <strong>외부 링크 반영 준비</strong>
            <p>
              외부 장소나 휴대폰에서 뷰어 수정 내용을 관리자 PC로 보내려면 관리자 PC 앱 폴더의 <code>start-dev-public.cmd</code>를 실행하거나,
              명령창에서 <code>npm run dev:public</code>을 실행해 둡니다.
            </p>
            <p>실행 창을 닫으면 외부 링크 반영이 중단됩니다. 마약 뷰어에서 수정한 뒤에는 마약 뷰어의 관리자 PC로 반영, 관리자 모드의 뷰어 반영 내용 받기를 순서대로 누릅니다.</p>
          </div>
        </section>
      )}

      {!isViewerMode && showSyncSettings && (
        <section className="sync-panel">
          <div className="sync-panel-content">
            <div>
              <strong>GitHub 자동 저장</strong>
              <p>
                PC에서 실행 중인 앱 서버가 <code>app-state/shared-state.json</code>을 자동 저장하고 GitHub로 push합니다.
                PC와 핸드폰은 같은 PC 서버 주소로 접속하면 같은 내용을 봅니다.
              </p>
            </div>
            <div className="sync-panel-actions">
              <button type="button" onClick={() => void pullRemoteState(true)}>
                저장된 내용 PC로 반영
              </button>
              <button type="button" className="danger" onClick={() => void forceUploadCurrentDeviceState()}>
                현재 기기 내용으로 서버 덮어쓰기
              </button>
            </div>
          </div>
          <div className={`sync-status ${syncStatus.mode}`}>{syncStatusText}</div>
        </section>
      )}

      {!isReadOnlyViewer && !showMaster && !showRoundSummary && (
        <div className="primary-tabs">
          <button className={`narcotic-order ${mainCategory === "narcotic" ? "active narcotic" : ""}`} onClick={() => setMainCategory("narcotic")}>
            비치마약류 관리
          </button>
          {!isNarcoticViewer && (
            <>
              <button className={mainCategory === "stock" ? "active stock" : ""} onClick={() => setMainCategory("stock")}>
                비품약 관리
              </button>
              <button className={mainCategory === "ecart" ? "active ecart" : ""} onClick={() => setMainCategory("ecart")}>
                응급카트 E-cart 관리
              </button>
            </>
          )}
        </div>
      )}

      <main className="app-content">
        {showRoundSummary ? (
          renderRoundSummaryEditor()
        ) : showMaster ? (
          <section className="master-stack">
            {canEditMaster && (
            <section className="card">
              <div className="card-head">
                <div>
                  <h2>신규/기존 약품 보유실 배정</h2>
                  <p>약품코드와 보유실을 선택하면 마스터의 보유실별 수량과 합계가 즉시 갱신됩니다.</p>
                </div>
                <PackagePlus size={24} />
              </div>
              <form className="assignment-form" onSubmit={addAssignment}>
                <div className="drug-picker">
                  <label>
                    약품 검색
                    <input
                      value={assignmentDrugQuery}
                      onChange={(event) => setAssignmentDrugQuery(event.target.value)}
                      placeholder="약품명, 코드, 성분명 검색"
                    />
                  </label>
                  {selectedAssignmentDrug && (
                    <div className="selected-drug-pill">
                      선택됨: <strong>{selectedAssignmentDrug.code}</strong> · {drugTitle(selectedAssignmentDrug)}
                      {selectedAssignmentKind === "psychotropic" && <span className="badge psychotropic">향정</span>}
                      {selectedAssignmentKind === "narcotic" && <span className="badge narcotic-group">마약</span>}
                    </div>
                  )}
                  {assignmentDrugQuery.trim() && (
                    <div className="drug-search-results">
                      {assignmentDrugMatches.length === 0 ? (
                        <span className="empty">검색 결과 없음</span>
                      ) : (
                        assignmentDrugMatches.map((drug) => (
                          <button
                            type="button"
                            key={drug.code}
                            className={newAssignment.drugCode === drug.code ? "selected" : ""}
                            onClick={() => {
                              setNewAssignment((prev) => ({ ...prev, drugCode: drug.code }));
                              setAssignmentDrugQuery(`${drug.code} ${drugTitle(drug)}`);
                            }}
                          >
                            <strong>{drug.code}</strong>
                            <span>{drugTitle(drug)}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <label>
                  수량
                  <input
                    type="number"
                    min={1}
                    value={newAssignment.count}
                    onChange={(event) =>
                      setNewAssignment((prev) => ({ ...prev, count: Math.max(1, Number.parseInt(event.target.value, 10) || 1) }))
                    }
                  />
                </label>
                <div className="room-picker">
                  <div>
                    <strong>반영할 보유실</strong>
                    <button type="button" onClick={() => setTargetRooms(assignmentRoomOptions.map((room) => room.id))}>
                      전체 선택
                    </button>
                  </div>
                  <div className="room-chip-grid">
                    {assignmentRoomOptions.map((room) => (
                      <label key={room.id} className={targetRooms.includes(room.id) ? "selected" : ""}>
                        <input
                          type="checkbox"
                          checked={targetRooms.includes(room.id)}
                          onChange={() =>
                            setTargetRooms((prev) =>
                              prev.includes(room.id) ? prev.filter((id) => id !== room.id) : [...prev, room.id],
                            )
                          }
                        />
                        {displayRoomName(room.label)}
                      </label>
                    ))}
                  </div>
                </div>
                <button type="submit" className="submit-button">
                  선택 보유실에 반영
                </button>
              </form>

              <div className="master-add-grid">
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <form className="add-panel" onSubmit={addNewDrug}>
                    <div>
                      <h3>신규코드 의약품 추가</h3>
                      <p>추가 후 바로 위 보유실 배정에서 선택할 수 있습니다.</p>
                    </div>
                    <div className="add-form-grid">
                      <label>
                        약품코드
                        <input value={newDrug.code} onChange={(event) => setNewDrug((prev) => ({ ...prev, code: event.target.value }))} />
                      </label>
                      <label>
                        상품명
                        <input
                          value={newDrug.productName}
                          onChange={(event) => setNewDrug((prev) => ({ ...prev, productName: event.target.value }))}
                        />
                      </label>
                      <label>
                        일반명
                        <input
                          value={newDrug.genericName}
                          onChange={(event) => setNewDrug((prev) => ({ ...prev, genericName: event.target.value }))}
                        />
                      </label>
                      <label>
                        규격
                        <input value={newDrug.spec} onChange={(event) => setNewDrug((prev) => ({ ...prev, spec: event.target.value }))} />
                      </label>
                      <label>
                        보관조건
                        <input
                          value={newDrug.storage}
                          onChange={(event) => setNewDrug((prev) => ({ ...prev, storage: event.target.value }))}
                        />
                      </label>
                      <label>
                        관리구분
                        <select
                          value={newDrug.category}
                          onChange={(event) => setNewDrug((prev) => ({ ...prev, category: event.target.value as NewDrugForm["category"] }))}
                        >
                          {!isNarcoticViewer && <option value="stock">일반 의약품</option>}
                          <option value="향정">향정신성의약품</option>
                          <option value="마약">마약류</option>
                        </select>
                      </label>
                      <label>
                        주의사항
                        <input
                          value={newDrug.warning}
                          onChange={(event) => setNewDrug((prev) => ({ ...prev, warning: event.target.value }))}
                        />
                      </label>
                    </div>
                    <button className="secondary-button" type="submit">
                      <Plus size={16} />
                      신규 약품 등록
                    </button>
                  </form>

                  <form className="add-panel" onSubmit={changeDrugCode}>
                    <div>
                      <h3>의약품 코드 변경</h3>
                      <p>기존 약품의 모든 정보(명칭, 규격, 보유실 배정 등)를 유지하고 코드만 변경합니다.</p>
                    </div>
                    <div className="add-form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                      <label>
                        기존 의약품 선택
                        <select
                          value={renameDrugForm.oldCode}
                          onChange={(event) => setRenameDrugForm((prev) => ({ ...prev, oldCode: event.target.value }))}
                        >
                          <option value="">-- 약품 선택 --</option>
                          {assignmentDrugs.map((drug) => (
                            <option key={drug.code} value={drug.code}>
                              [{drug.code}] {drug.productName} {drug.spec ? `(${drug.spec})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        신규 약품코드
                        <input
                          value={renameDrugForm.newCode}
                          onChange={(event) => setRenameDrugForm((prev) => ({ ...prev, newCode: event.target.value }))}
                          placeholder="변경할 신규 코드 입력"
                        />
                      </label>
                    </div>
                    <button
                      className="secondary-button"
                      type="submit"
                      style={{ backgroundColor: "var(--brand-brown)", borderColor: "var(--brand-brown)" }}
                    >
                      <RefreshCw size={16} />
                      코드 변경 실행
                    </button>
                  </form>
                </div>

                <form className="add-panel compact" onSubmit={addNewRoom}>
                  <div>
                    <h3>신규 보유실 추가</h3>
                    <p>추가된 보유실은 {isNarcoticViewer ? "비치마약류 관리 화면과 마스터" : "비품약 관리 탭과 마스터"}에 함께 생성됩니다.</p>
                  </div>
                  <label>
                    보유실명
                    <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} />
                  </label>
                  <fieldset className="room-floor-field">
                    <legend>위치</legend>
                    <div className="segmented-buttons">
                      {STOCK_FLOOR_OPTIONS.map((floor) => (
                        <button
                          key={floor}
                          type="button"
                          className={newRoomFloor === floor ? "active" : ""}
                          aria-pressed={newRoomFloor === floor}
                          onClick={() => setNewRoomFloor(floor)}
                        >
                          {floor}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <button className="secondary-button" type="submit">
                    <Plus size={16} />
                    보유실 추가
                  </button>
                </form>
              </div>
            </section>
            )}

            <section className="card drug-label-card">
              <div className="card-head">
                <div>
                  <h2>약품 라벨 출력</h2>
                  <p>원하는 라벨의 형태와 크기를 선택 한 후 하단 리스트에서 약품을 선택하면 라벨 미리보기 후 인쇄 할 수 있습니다.</p>
                </div>
                <button
                  type="button"
                  className="secondary-button label-panel-toggle"
                  aria-expanded={isDrugLabelPanelOpen}
                  onClick={() => setIsDrugLabelPanelOpen((prev) => {
                    const next = !prev;
                    if (next) {
                      setLabelMode("stock");
                      setLabelSize("10x70");
                    }
                    return next;
                  })}
                >
                  <Printer size={16} />
                  {isDrugLabelPanelOpen ? "라벨 출력 접기" : "라벨 출력 열기"}
                </button>
              </div>
              {isDrugLabelPanelOpen && (
                <div className="drug-label-tools">
                  <div className="label-mode-row">
                    <div className="segmented-buttons" aria-label="라벨 종류 선택">
                    {labelModeOptions.map((option) => (
                      <button
                        type="button"
                        key={option.mode}
                        className={[labelMode === option.mode ? "active" : "", option.mode === "narcotic" ? "danger" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => {
                          if (option.mode === "pharmacy") {
                            setLabelMode("pharmacy");
                            setIsPharmacyLabelWorkspaceOpen(true);
                            return;
                          }
                          if (option.mode === "narcotic" && !["10x70", "15x95", "40x70"].includes(labelSize)) {
                            setLabelSize("10x70");
                          }
                          setLabelMode(option.mode);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <div className="label-size-groups" aria-label="라벨 크기 선택">
                    {DRUG_LABEL_SIZE_GROUPS.map((group) => (
                      <div className="label-size-group" key={group.id}>
                        <div className="segmented-buttons label-size-buttons">
                          {group.sizeKeys.map((sizeKey) => {
                            const size = getDrugLabelSize(sizeKey);
                            return (
                              <button
                                type="button"
                                key={size.key}
                                className={labelSize === size.key ? "active" : ""}
                                onClick={() => {
                                  setLabelSize(size.key);
                                  if (group.id === "narcotic") setLabelMode("narcotic");
                                }}
                              >
                                {size.label}
                              </button>
                            );
                          })}
                        </div>
                        <span className="label-size-output-label">{group.outputLabel}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="drug-label-controls">
                  <SearchBox value={labelQuery} onChange={setLabelQuery} placeholder="라벨 출력할 약품 검색" />
                  <label className="label-copy-field">
                    출력 매수
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={labelCopies}
                      onChange={(event) =>
                        setLabelCopies(Math.min(20, Math.max(1, Number.parseInt(event.target.value, 10) || 1)))
                      }
                    />
                  </label>
                  <button type="button" className="secondary-button" onClick={clearLabelSelection}>
                    선택 해제
                  </button>
                  <button type="button" className="print-button" onClick={openDrugLabelPrintPreview} disabled={labelPrintRows.length === 0}>
                    <Printer size={16} />
                    라벨 인쇄 미리보기
                  </button>
                </div>

                <div className="drug-label-layout">
                  <div className="label-drug-list" aria-label="라벨 출력 약품 선택">
                    {usesHospitalDrugListForMode(labelMode) && isHospitalDrugLabelsLoading ? (
                      <span className="empty">라벨 데이터를 불러오는 중입니다.</span>
                    ) : currentLabelSourceRows.length === 0 ? (
                      <span className="empty">검색 결과가 없습니다.</span>
                    ) : (
                      <>
                        <label className={`label-drug-list-row label-drug-select-all ${areCurrentLabelRowsSelected ? "selected" : ""}`}>
                          <span className="label-drug-checkbox">
                            <input
                              type="checkbox"
                              checked={areCurrentLabelRowsSelected}
                              onChange={(event) => toggleCurrentLabelRows(event.currentTarget.checked)}
                              aria-label="현재 목록 전체 라벨 선택"
                            />
                          </span>
                          <strong>전체</strong>
                          <span>현재 목록 전체 선택</span>
                          <span className="label-list-cautions">
                            선택 {currentLabelSelectedCount.toLocaleString("ko-KR")} / {currentLabelSourceRows.length.toLocaleString("ko-KR")}종
                          </span>
                          <span className="badge gray">{selectedLabelSize.label}</span>
                        </label>
                        {currentLabelSourceRows.map((row) => {
                          const cautionLabels = labelCautionLabels(row);
                          const selected = isLabelPrintSelected(row);
                          return (
                            <label
                              key={row.id}
                              className={`label-drug-list-row ${selected ? "selected" : ""}`}
                            >
                              <span className="label-drug-checkbox">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleLabelPrintSelection(row)}
                                  aria-label={`${row.name} 라벨 선택`}
                                />
                              </span>
                              <strong>{row.code}</strong>
                              <span>{row.name}</span>
                              <span className="label-list-cautions" aria-label="주의 표시">
                                {cautionLabels.length === 0 ? (
                                  <span className="empty">-</span>
                                ) : (
                                  cautionLabels.map((label) => (
                                    <span key={label} className={`badge ${labelCautionBadgeClass(label)}`}>
                                      {label}
                                    </span>
                                  ))
                                )}
                              </span>
                              {isEcartLabelKind(row.kind) ? (
                                <span className="badge gray">수량 {row.totalQuantity}</span>
                              ) : row.kind === "fluid" ? (
                                <span className={`fluid-list-tone ${row.fluidTone ?? "blue"}`}>수액</span>
                              ) : row.storageLabel ? (
                                <span className={`label-storage-badge ${row.storageTone}`}>{row.storageLabel}</span>
                              ) : (
                                <span className="empty">-</span>
                              )}
                            </label>
                          );
                        })}
                      </>
                    )}
                  </div>

                  <div className="label-preview-panel">
                    <div>
                      <strong>라벨 미리보기</strong>
                      <span>
                        {currentModeSelectionCount > 0
                          ? `${selectedLabelSize.label} 기준 ${currentModeSelectionCount.toLocaleString("ko-KR")}종 선택됨`
                          : `${selectedLabelSize.label} 선택 후 약품을 클릭해 출력 목록에 추가`}
                      </span>
                    </div>
                    <div className="drug-label-preview-grid mixed-label-grid">
                      {currentModeLabelPrintRows.slice(0, 6).map((entry, index) =>
                        renderDrugLabelArticle(entry, `preview-${entry.id}-${entry.sizeKey}-${entry.copyIndex}-${index}`),
                      )}
                    </div>
                    {currentModeLabelPrintRows.length > 6 && (
                      <small>미리보기는 현재 라벨 종류 6장까지만 표시됩니다. 인쇄 시 전체 {labelPrintRows.length}장이 출력됩니다.</small>
                    )}
                    {currentModeLabelPrintRows.length === 0 && labelPrintRows.length > 0 && (
                      <small>현재 라벨 종류에서 선택된 항목은 없습니다. 인쇄 미리보기에는 선택해 둔 전체 라벨이 함께 표시됩니다.</small>
                    )}
                  </div>
                </div>
              </div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>전체 비품약 마스터 보유 현황</h2>
                  <p>
                    총 {visibleMasterRows.length}종 · 전체 보유수량{" "}
                    {visibleMasterRows.reduce((sum, row) => sum + row.totalQuantity, 0).toLocaleString("ko-KR")}개
                  </p>
                  <div className="master-kind-filter" aria-label="마스터 분류 필터">
                    {MASTER_KIND_FILTER_OPTIONS.map((option) => {
                      const isDisabled = isMasterKindFilterDisabled(appMode, option.kind);
                      return (
                      <label key={option.kind}>
                        <input
                          type="checkbox"
                          checked={masterKindFilter[option.kind]}
                          disabled={isDisabled}
                          onChange={(event) =>
                            !isDisabled && setMasterKindFilter((prev) => ({ ...prev, [option.kind]: event.target.checked }))
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                      );
                    })}
                  </div>
                </div>
                <div className="master-search-actions">
                  <SearchBox value={masterQuery} onChange={setMasterQuery} placeholder="마스터 약품/보유실 검색" />
                  <button
                    type="button"
                    className="secondary-button master-label-button"
                    onClick={() => openSelectedMasterLabelPreview("stock")}
                    disabled={selectedLabelRows.length === 0}
                  >
                    <Printer size={16} />
                    체크 약품 라벨 출력
                  </button>
                  <button type="button" className="secondary-button master-excel-button" onClick={downloadMasterWorkbook}>
                    <Download size={16} />
                    Excel 다운로드
                  </button>
                </div>
              </div>
              <div
                className={`master-grid ${showMasterQuickView ? "" : "single-column"} ${
                  showMasterQuickView && masterQuickPlacement === "bottom" ? "quick-bottom" : ""
                }`}
              >
                <div className="table-wrap">
                  <table className="data-table master-table">
                    <thead>
                      <tr>
                        <th className="master-select-cell">
                          <input
                            type="checkbox"
                            checked={filteredMasterRows.length > 0 && filteredMasterRows.every((row) => labelSelectedCodes.includes(row.code))}
                            onChange={(event) => toggleFilteredMasterLabels(event.target.checked)}
                            aria-label="현재 마스터 목록 전체 선택"
                          />
                        </th>
                        <th>코드</th>
                        <th>약품명</th>
                        <th>보관방법</th>
                        <th>고주의/고위험</th>
                        <th>보유실별 갯수</th>
                        <th>합계</th>
                        {!isViewerMode && <th>관리</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMasterRows.map((row) => {
                        const cautionLabels =
                          row.masterKind === "psychotropic" ? ["향정"] : row.masterKind === "narcotic" ? ["마약"] : drugCautionLabels(row);
                        return (
                        <tr key={row.code} className={`master-row-${row.masterKind}`}>
                          <td className="master-select-cell">
                            <input
                              type="checkbox"
                              checked={labelSelectedCodes.includes(row.code)}
                              onChange={() => toggleLabelDrug(row.code)}
                              aria-label={`${drugTitle(row)} 라벨 선택`}
                            />
                          </td>
                          <td className="code">{row.code}</td>
                          <td className="master-drug-name">
                            <strong>{drugTitle(row)}</strong>
                          </td>
                          <td className="master-storage-cell">
                            <span>{row.storage || "-"}</span>
                            {storageBadge(row)}
                          </td>
                          <td className="master-caution-cell">
                            {cautionLabels.length === 0 ? (
                              <span className="empty">-</span>
                            ) : (
                              cautionLabels.map((label) => (
                                <span
                                  key={label}
                                  className={`badge ${
                                    row.masterKind === "psychotropic"
                                      ? "psychotropic"
                                      : row.masterKind === "narcotic"
                                        ? "narcotic-group"
                                        : label.includes("고위험")
                                          ? "red"
                                          : "amber"
                                  }`}
                                >
                                  {label}
                                </span>
                              ))
                            )}
                          </td>
                          <td>
                            <div className="room-detail-list">
                              {row.roomDetails.length === 0 ? (
                                <span className="empty">보유실 배정 없음</span>
                              ) : (
                                row.roomDetails.map((detail) =>
                                  isReadOnlyViewer ? (
                                    <span className="room-detail-pill" key={`${row.code}-${detail.roomId}`}>
                                      {displayRoomName(detail.roomId)} {detail.requiredQty}
                                    </span>
                                  ) : (
                                    <button
                                      key={`${row.code}-${detail.roomId}`}
                                      onClick={() => (row.masterKind === "stock" ? goToStockRoom(detail.roomId) : goToNarcoticRoom(detail.roomId))}
                                    >
                                      {displayRoomName(detail.roomId)} {detail.requiredQty}
                                    </button>
                                  ),
                                )
                              )}
                            </div>
                          </td>
                          <td className="qty-total">{row.totalQuantity}</td>
                          {!isViewerMode && (
                            <td className="master-row-actions">
                              <button type="button" className="secondary-button danger-light" onClick={() => deleteMasterRow(row)}>
                                <Trash2 size={15} />
                                삭제
                              </button>
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {showMasterQuickView && (
                  <aside className="master-side">
                    <div className="master-side-head">
                      <h3>빠른 확인</h3>
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={() => setMasterQuickPlacement((placement) => (placement === "side" ? "bottom" : "side"))}
                      >
                        {masterQuickPlacement === "side" ? "아래로 이동" : "오른쪽 고정"}
                      </button>
                    </div>
                    {selectedMasterRow ? (
                      <>
                        <strong>{drugTitle(selectedMasterRow)}</strong>
                        <p>{selectedMasterRow.code}</p>
                        <div className="master-side-storage">
                          <span>{selectedMasterRow.storage || "-"}</span>
                          {storageBadge(selectedMasterRow)}
                        </div>
                        <div className="big-total">{selectedMasterRow.totalQuantity}</div>
                        <span>전체 보유 합계</span>
                        <div className="detail-scroll">
                          {selectedMasterRow.roomDetails.map((detail) => (
                            <div key={detail.roomId}>
                              <span>{displayRoomName(detail.roomId)}</span>
                              <strong>{detail.requiredQty}</strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p>검색 결과가 없습니다.</p>
                    )}
                  </aside>
                )}
              </div>
            </section>
          </section>
        ) : (
          <section className="inspection-stack">
            {mainCategory === "stock" && (
              <StockRoomGuide
                sections={currentStockGuideSections}
                activeRoom={activeRoom}
                uninspectedIds={uninspectedRoomIds}
                inspectedIds={inspectedStockRoomIds}
                onSelect={openGuideEntry}
                onToggleUninspected={(item) => toggleUninspectedRoom(getStockGuideInspectionKey(item))}
              />
            )}

            {mainCategory === "narcotic" && (
              <section className="card narcotic-guide">
                <div className="narcotic-guide-head">
                  <h3>비치마약류 보유 현황</h3>
                  <div className="toolbar-actions">
                    <button type="button" className="secondary-button" onClick={openNarcoticRoundSummary}>
                      <FileText size={16} />
                      비치마약류 순회점검표
                    </button>
                    <button type="button" className="secondary-button narcotic-sync-button" onClick={() => void pullNarcoticInspectionStateFromServer()}>
                      <Download size={16} />
                      {isNarcoticViewer ? "PC 엑셀 내용 불러오기" : "모바일 점검 내용 PC로 불러오기"}
                    </button>
                    {isNarcoticViewer && (
                      <button
                        type="button"
                        className="secondary-button narcotic-sync-button"
                        onClick={() => void saveNarcoticInspectionStateToServer()}
                        title="모바일에서 점검한 비치마약류 내용을 관리자 PC로 반영"
                      >
                        <Upload size={16} />
                        모바일 점검 내용 PC로 올리기
                      </button>
                    )}
                    {!isNarcoticViewer && (
                      <button
                        type="button"
                        className="secondary-button narcotic-sync-button"
                        onClick={() => void saveNarcoticInspectionStateToServer()}
                        title="PC에서 엑셀 업로드한 비치마약류 내용을 모바일 뷰어로 전송"
                      >
                        <Upload size={16} />
                        PC 엑셀 내용 모바일로 보내기
                      </button>
                    )}
                    <button type="button" className="secondary-button narcotic-upload-button" onClick={() => narcoticExcelInputRef.current?.click()}>
                      <Upload size={16} />
                      엑셀 업로드
                    </button>
                    <input
                      ref={narcoticExcelInputRef}
                      className="hidden-file-input"
                      type="file"
                      onChange={handleNarcoticExcelUpload}
                    />
                  </div>
                </div>
                {narcoticExcelFileName && <p className="narcotic-upload-name">선택 파일: {narcoticExcelFileName}</p>}
                <div className="narcotic-guide-list">
                  {currentNarcoticFloors.map((floorGroup) => (
                    <div className="narcotic-guide-floor" key={floorGroup.floor}>
                      <strong>{floorGroup.floor}</strong>
                      <div className="narcotic-guide-rows">
                        {getNarcoticFloorRows(floorGroup.floor, floorGroup.rooms).map((row, rowIndex) => (
                          <div className="narcotic-guide-row" key={`${floorGroup.floor}-${rowIndex}`}>
                            {row.map((room) => (
                              <button
                                key={room.id}
                                className={[
                                  narcoticActiveRoom === room.id ? "active" : "",
                                  getStockGuideClassName(room.id, uninspectedNarcoticRoomIds, inspectedNarcoticRoomIds),
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                                onClick={() => setNarcoticActiveRoom(room.id)}
                                onDoubleClick={() => toggleUninspectedNarcoticRoom(room.id)}
                              >
                                {narcoticGuideLabel(room)} ({room.allocationCount})
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {mainCategory === "stock" ? (
              <TabStrip
                items={currentStockRooms}
                activeId={activeRoom}
                getId={(room) => room.id}
                getLabel={(room) => `${displayRoomName(room.label)} (${room.allocationCount})`}
                getClassName={(room) => getStockGuideClassName(room.id, uninspectedRoomIds, inspectedStockRoomIds)}
                onSelect={(room) => setActiveRoom(room.id)}
                onDoubleClick={(room) => toggleUninspectedRoom(room.id)}
                tone="stock"
              />
            ) : mainCategory === "narcotic" ? (
              <TabStrip
                items={currentNarcoticRooms}
                activeId={narcoticActiveRoom}
                getId={(room) => room.id}
                getLabel={(room) => `${displayRoomName(room.label)} (${room.allocationCount})`}
                getClassName={(room) => getStockGuideClassName(room.id, uninspectedNarcoticRoomIds, inspectedNarcoticRoomIds)}
                onSelect={(room) => setNarcoticActiveRoom(room.id)}
                onDoubleClick={(room) => toggleUninspectedNarcoticRoom(room.id)}
                tone={"narcotic" as "stock"}
              />
            ) : (
              <div className="ecart-tab-row">
                <button className={activeEcartTab === "general" ? "active" : ""} onClick={() => setActiveEcartTab("general")}>
                  NICU 외 일반
                </button>
                <button className={activeEcartTab === "nicu" ? "active" : ""} onClick={() => setActiveEcartTab("nicu")}>
                  NICU 신생아중환자실
                </button>
              </div>
            )}

            {mainCategory === "ecart" && activeEcartTab === "general" && (
              <section className="card ecart-departments">
                <h3>현재 점검 중인 E-cart 보유 부서</h3>
                <div className="department-tags">
                  {ecartTargets.map((department) => (
                    <button
                      key={department.id}
                      className={activeEcartTarget.id === department.id ? "active" : ""}
                      onClick={() => setActiveEcartTargetId(department.id)}
                    >
                      {displayRoomName(department.label)}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="section-toolbar">
              <div>
                <h2>
                  {mainCategory === "stock"
                    ? `${displayRoomName(activeRoomInfo?.label ?? activeRoom)} 비품약 현황판`
                    : mainCategory === "narcotic"
                    ? `${displayRoomName(narcoticRoomInfo?.label ?? narcoticActiveRoom)} 비치마약류 현황판`
                    : `${displayRoomName(activeEcartTarget.label)} E-cart 현황판`}
                </h2>
                <p>
                  {mainCategory === "stock"
                    ? `원본 시트 ${displayRoomName(activeRoomInfo?.sourceSheet ?? activeRoom)} · 현재 ${currentStockItems.length}개 표시`
                    : mainCategory === "narcotic"
                    ? `비치향정,마약현황 · 현재 ${currentNarcoticItems.length}개 표시`
                    : `점검 부서 ${displayRoomName(activeEcartTarget.label)} · 현재 ${currentEcartItems.length}개 표시`}
                </p>
              </div>
              <div className="toolbar-actions">
                <SearchBox value={query} onChange={setQuery} placeholder="현재 탭 검색" />
                {mainCategory === "stock" && (
                  <button className="secondary-button" onClick={() => openPrintPreview("all-stock")}>
                    <Printer size={16} />
                    전체 실 일괄 출력
                  </button>
                )}
                {mainCategory === "ecart" && (
                  <button className="secondary-button" onClick={() => openPrintPreview("all-ecart")}>
                    <Printer size={16} />
                    전체 부서 일괄 출력
                  </button>
                )}
                {mainCategory === "narcotic" && (
                  <button className="secondary-button" onClick={() => openPrintPreview("all-narcotic")}>
                    <Printer size={16} />
                    전체 실 일괄 출력
                  </button>
                )}
                <button className="print-button" onClick={() => openPrintPreview("single")}>
                  <Printer size={16} />
                  미리보기/인쇄
                </button>
              </div>
            </div>

            {renderReportCard(reportRef)}
          </section>
        )}
        {!showRoundSummary && <section className="bottom-summary">{summaryGrid}</section>}
      </main>
      {showPrintPreview && (
        <div className="print-preview-backdrop" role="dialog" aria-modal="true" aria-label="보고서 인쇄 미리보기">
          <div className="print-preview-shell">
            <div className="print-preview-toolbar">
              <div>
                <strong>
                  {printPreviewMode === "round-summary"
                    ? `${activeRoundSummaryDraft.title} 미리보기`
                    : printPreviewMode === "all-stock"
                      ? "전체 실 일괄 출력 미리보기"
                      : printPreviewMode === "all-ecart"
                        ? "전체 E-cart 일괄 출력 미리보기"
                        : printPreviewMode === "all-narcotic"
                          ? "전체 비치마약류 보유실 일괄 출력 미리보기"
                          : printPreviewMode === "drug-labels"
                            ? "약품 라벨 인쇄 미리보기"
                            : "보고서 미리보기"}
                </strong>
                <span>
                  {printPreviewMode === "round-summary"
                    ? activeRoundSummaryDraft.inspectionPeriod
                    : printPreviewMode === "all-stock"
                      ? `${currentStockRooms.length.toLocaleString("ko-KR")}개 보유실`
                      : printPreviewMode === "all-ecart"
                        ? `${getAllEcartPrintTargets(ecartTargets).length.toLocaleString("ko-KR")}개 E-cart 보유 부서`
                        : printPreviewMode === "all-narcotic"
                          ? `${currentNarcoticRooms.length.toLocaleString("ko-KR")}개 비치마약류 보유실`
                          : printPreviewMode === "drug-labels"
                            ? `${pharmacyPrintDrafts.length.toLocaleString("ko-KR")}장 · 화면은 최대 6장 표시`
                            : mainCategory === "stock"
                              ? displayRoomName(activeRoomInfo?.label ?? activeRoom)
                              : mainCategory === "narcotic"
                                ? displayRoomName(narcoticRoomInfo?.label ?? narcoticActiveRoom)
                                : displayRoomName(activeEcartTarget.label)}
                </span>
              </div>
              <div className="preview-actions">
                <button className="print-button" onClick={printPreviewReport}>
                  <Printer size={16} />
                  인쇄
                </button>
                <button className="secondary-button" onClick={() => void downloadReport()} disabled={pdfStatus === "generating"}>
                  <Download size={16} />
                  {pdfStatus === "generating" ? "PDF 생성 중..." : "PDF 저장"}
                </button>
                {pdfStatus === "ready" && pdfDownload && (
                  <a className="pdf-ready-link" href={pdfDownload.url} download={pdfDownload.fileName} target="_blank" rel="noreferrer">
                    PDF 파일 열기/저장
                  </a>
                )}
                {pdfStatus === "error" && <span className="pdf-error">PDF 생성 실패</span>}
                <button className="icon-button" onClick={closePrintPreview} aria-label="미리보기 닫기">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="print-preview-body">
              {printPreviewMode === "round-summary"
                ? renderRoundSummaryReport(printPreviewRef, "round-summary-report print-preview-report")
                : printPreviewMode === "all-stock"
                  ? renderBulkStockReports()
                  : printPreviewMode === "all-narcotic"
                    ? renderBulkNarcoticReports()
                  : printPreviewMode === "all-ecart"
                    ? renderBulkEcartReports()
                    : printPreviewMode === "drug-labels"
                      ? <>{renderDrugLabelSheet(printPreviewRef, "drug-label-sheet print-preview-report", 6)}<div className="pdf-full-label-source">{renderDrugLabelSheet(reportRef, "drug-label-sheet")}</div></>
                      : renderReportCard(printPreviewRef, "report-card print-preview-report")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "indigo" | "green" | "slate" | "amber";
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function StockRoomGuide({
  sections,
  activeRoom,
  uninspectedIds = [],
  inspectedIds = [],
  onSelect,
  onToggleUninspected,
}: {
  sections: StockGuideSection[];
  activeRoom: string;
  uninspectedIds?: string[];
  inspectedIds?: string[];
  onSelect: (item: StockGuideEntry) => void;
  onToggleUninspected?: (item: StockGuideEntry) => void;
}) {
  const lastTapRef = useRef<{ key: string; time: number } | null>(null);

  function handleGuideChipClick(item: StockGuideEntry) {
    const key = getStockGuideInspectionKey(item);
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap?.key === key && now - lastTap.time <= 500) {
      lastTapRef.current = null;
      onToggleUninspected?.(item);
      return;
    }
    lastTapRef.current = { key, time: now };
    onSelect(item);
  }

  return (
    <section className="card stock-guide">
      <div className="card-head">
        <div>
          <h2>비품 보유 현황 안내</h2>
          <p>층별 보유실을 선택하면 해당 비품약 또는 E-cart 점검 화면으로 이동합니다.</p>
        </div>
        <ListChecks size={24} />
      </div>
      <div className="stock-guide-list">
        {sections.map((section) => (
          <div className="stock-guide-floor" key={section.floor}>
            <strong>{section.floor}</strong>
            <div className="stock-guide-rows">
              {section.rows.map((row, rowIndex) => (
                <div className="stock-guide-row" key={`${section.floor}-${rowIndex}`}>
                  {row.map((item) => (
                    <button
                      key={`${section.floor}-${item.label}`}
                      className={[
                        "guide-chip",
                        item.ecartOnly ? "ecart-only" : "",
                        item.stockRoomId === activeRoom ? "active" : "",
                        getStockGuideClassName(getStockGuideInspectionKey(item), uninspectedIds, inspectedIds),
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleGuideChipClick(item)}
                    >
                      {item.label}
                      {item.ecartOnly && <span>(E-cart만 보유)</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TabStrip<T>({
  items,
  activeId,
  getId,
  getLabel,
  getClassName,
  onSelect,
  onDoubleClick,
  tone,
}: {
  items: T[];
  activeId: string;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getClassName?: (item: T) => string;
  onSelect: (item: T) => void;
  onDoubleClick?: (item: T) => void;
  tone: "stock" | "ecart";
}) {
  return (
    <div className={`tab-strip ${tone}`}>
      {items.map((item) => {
        const id = getId(item);
        return (
          <button
            key={id}
            className={[id === activeId ? "active" : "", getClassName?.(item) ?? ""].filter(Boolean).join(" ")}
            onClick={() => onSelect(item)}
            onDoubleClick={() => onDoubleClick?.(item)}
          >
            {getLabel(item)}
          </button>
        );
      })}
    </div>
  );
}

function StockReportTable({
  refrigerated,
  roomTemperature,
  checkedStock,
  onCheck,
  onSplitCheck,
  onExpiry,
  onCount,
  onDelete,
}: {
  refrigerated: EditableStockItem[];
  roomTemperature: EditableStockItem[];
  checkedStock: Record<string, boolean>;
  onCheck: (roomId: string, drugCode: string) => void;
  onSplitCheck: (roomId: string, drugCode: string, partIndex: number, partCount: number) => void;
  onExpiry: (roomId: string, drugCode: string, value: string) => void;
  onCount: (roomId: string, drugCode: string, value: string) => void;
  onDelete: (roomId: string, drugCode: string) => void;
}) {
  return (
    <div className="table-wrap bordered inspection-table-wrap stock-inventory-wrap">
      <table className="data-table inspection-table">
        <thead>
          <tr>
            <th>점검</th>
            <th>코드</th>
            <th>약품명</th>
            <th>수량</th>
            <th>주의사항</th>
            <th>3개월 미만</th>
            <th>삭제</th>
          </tr>
        </thead>
        <tbody>
          {refrigerated.length > 0 && (
            <GroupRows
              label="냉장 보관 약품"
              tone="cold"
              items={refrigerated}
              checkedStock={checkedStock}
              onCheck={onCheck}
              onSplitCheck={onSplitCheck}
              onExpiry={onExpiry}
              onCount={onCount}
              onDelete={onDelete}
            />
          )}
          <GroupRows
            label="실온 보관 및 기타 약품"
            tone="room"
            items={roomTemperature}
            checkedStock={checkedStock}
            onCheck={onCheck}
            onSplitCheck={onSplitCheck}
            onExpiry={onExpiry}
            onCount={onCount}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    </div>
  );
}

function countInput(
  item: EditableStockItem,
  checkedStock: Record<string, boolean>,
  onCount: (roomId: string, drugCode: string, value: string) => void,
  onSplitCheck: (roomId: string, drugCode: string, partIndex: number, partCount: number) => void,
) {
  const splitParts = getStockSplitParts(item.roomId, item.drugCode, item.requiredQty, `${drugTitle(item.drug)} ${item.drug.genericName}`);
  if (splitParts) {
    return (
      <div className="split-count-inputs">
        {splitParts.map((count, index) => (
          <button
            className={`split-count-button ${checkedStock[stockSplitKey(item.roomId, item.drugCode, index)] ? "checked" : ""}`}
            key={`${item.roomId}-${item.drugCode}-split-${index}`}
            type="button"
            onClick={() => onSplitCheck(item.roomId, item.drugCode, index, splitParts.length)}
          >
            {count}
          </button>
        ))}
      </div>
    );
  }

  return (
    <input
      className="count-input"
      type="number"
      min={0}
      value={item.requiredQty}
      onChange={(event) => onCount(item.roomId, item.drugCode, event.target.value)}
    />
  );
}

function GroupRows({
  label,
  tone,
  items,
  checkedStock,
  onCheck,
  onSplitCheck,
  onExpiry,
  onCount,
  onDelete,
  renderExtraCells,
}: {
  label: string;
  tone: "cold" | "room" | "psychotropic" | "narcotic-group";
  items: EditableStockItem[];
  checkedStock: Record<string, boolean>;
  onCheck: (roomId: string, drugCode: string) => void;
  onSplitCheck: (roomId: string, drugCode: string, partIndex: number, partCount: number) => void;
  onExpiry: (roomId: string, drugCode: string, value: string) => void;
  onCount: (roomId: string, drugCode: string, value: string) => void;
  onDelete: (roomId: string, drugCode: string) => void;
  renderExtraCells?: (item: EditableStockItem) => ReactNode;
}) {
  const columnCount = renderExtraCells ? 8 : 7;
  return (
    <>
      <tr className={`group-row ${tone}`}>
        <td colSpan={columnCount}>{label}</td>
      </tr>
      {items.length === 0 ? (
        <tr>
          <td colSpan={columnCount} className="empty-row">
            약품이 없습니다.
          </td>
        </tr>
      ) : (
        items.map((item) => (
          <tr key={`${item.roomId}-${item.drugCode}`} className={`item-row ${tone}`}>
            <td className="check-cell">
              <input type="checkbox" checked={item.checked} onChange={() => onCheck(item.roomId, item.drugCode)} />
            </td>
            <td className="code">{item.drugCode}</td>
            <td>
              <strong className={isHighRiskDrug(item.drug) ? "high-risk-drug-name" : undefined}>{drugTitle(item.drug)}</strong>
              <span>{item.drug.genericName}</span>
              <small>{item.drug.storage}</small>
              {storageBadge(item.drug)}
            </td>
            <td>{countInput(item, checkedStock, onCount, onSplitCheck)}</td>
            {renderExtraCells ? renderExtraCells(item) : <td>{warningBadge(item.drug.warning)}</td>}
            <td>
              <input
                className="date-input"
                type="date"
                value={item.expiryDate}
                onChange={(event) => onExpiry(item.roomId, item.drugCode, event.target.value)}
              />
            </td>
            <td>
              <button className="icon-button" onClick={() => onDelete(item.roomId, item.drugCode)} title="삭제">
                <Trash2 size={17} />
              </button>
            </td>
          </tr>
        ))
      )}
    </>
  );
}

function EcartReportTable({
  items,
  onCheck,
  onExpiry,
  onCount,
  onDelete,
}: {
  items: EditableEcartItem[];
  onCheck: (id: string) => void;
  onExpiry: (id: string, value: string) => void;
  onCount: (id: string, value: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="table-wrap bordered inspection-table-wrap">
      <table className="data-table inspection-table">
        <thead>
          <tr>
            <th>점검</th>
            <th>코드</th>
            <th>약품명</th>
            <th>수량</th>
            <th>용량</th>
            <th>3개월 미만</th>
            <th>삭제</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-row">
                약품이 없습니다.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td className="check-cell">
                  <input type="checkbox" checked={item.checked} onChange={() => onCheck(item.id)} />
                </td>
                <td className="code">{item.code || item.id}</td>
                <td>
                  <strong>{item.name}</strong>
                </td>
                <td>
                  <input
                    className="count-input"
                    type="number"
                    min={0}
                    value={item.quantity}
                    onChange={(event) => onCount(item.id, event.target.value)}
                  />
                </td>
                <td>{item.dosage || "-"}</td>
                <td>
                  <input className="date-input" type="date" value={item.expiryDate} onChange={(event) => onExpiry(item.id, event.target.value)} />
                </td>
                <td>
                  <button className="icon-button" onClick={() => onDelete(item.id)} title="삭제">
                    <Trash2 size={17} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistTable({
  items,
  onNote,
  onStatus,
}: {
  items: ChecklistState[];
  onNote: (id: string, note: string) => void;
  onStatus: (id: string, status: CheckStatus) => void;
}) {
  const visibleItems = normalizeChecklistRows(items);

  return (
    <section className="checklist-section">
      <div className="report-section-title">
        <ClipboardCheck size={18} />
        점검 사항
      </div>
      <div className="table-wrap bordered">
        <table className="data-table checklist-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>점검 내용</th>
              <th>양호</th>
              <th>
                <span className="checklist-status-heading" aria-label="개선 필요">
                  <span>개선</span>
                  <span>필요</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, index) => {
              const showSection = index === 0 || visibleItems[index - 1].section !== item.section;
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>{showSection ? `[${item.section}]` : ""}</td>
                    <td>{`${index + 1}. ${item.text}`}</td>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={item.status === "good"}
                        onChange={() => onStatus(item.id, item.status === "good" ? "" : "good")}
                      />
                    </td>
                    <td className="check-cell">
                      <input
                        type="checkbox"
                        checked={item.status === "bad"}
                        onChange={() => onStatus(item.id, item.status === "bad" ? "" : "bad")}
                      />
                    </td>
                  </tr>
                  <tr className="checklist-note-row">
                    <td />
                    <td colSpan={3}>
                      <input
                        className="note-input"
                        value={item.note}
                        onChange={(event: ChangeEvent<HTMLInputElement>) => onNote(item.id, event.target.value)}
                        placeholder="사유 입력"
                      />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
