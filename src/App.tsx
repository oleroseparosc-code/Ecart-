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
  X,
} from "lucide-react";
import { Fragment, type ChangeEvent, type FormEvent, type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import rawInventory from "./data/inventory.generated.json";
import { isForcedRefrigeratedDrug, isHighRiskDrug, normalizeDrugWarning } from "./drugRules";
import { shouldApplyRemoteState, shouldMarkLocalChange, shouldPushLocalState, type RemoteStateEnvelope } from "./githubSync";
import {
  buildMasterRows,
  compareStockDrugsByName,
  deleteAllocation,
  drugDisplayName,
  type MasterRow,
  sortStockDrugsByName,
  updateAllocationQuantity,
} from "./inventoryState";
import { downloadElementAsPdf, type PdfDownloadResult } from "./reportPdf";
import { effectiveRoomUpdatedAt, formatRoomUpdatedAt, markRoomsUpdated } from "./roomUpdateDate";
import { buildRoundSummaryDraft, type RoundSummaryDraft, type RoundSummaryRow } from "./roundSummary";
import { loadServerState, saveServerState } from "./serverSync";
import type { ChecklistItem, EcartItem, InventoryData, StockAllocation, StockDrug, StockRoom } from "./types";

const inventory = rawInventory as InventoryData;
const STORAGE_KEY = "hospital-inventory-app-state-v2";
const LOCAL_UPDATED_AT_KEY = "hospital-inventory-local-updated-at-v1";
const SYNC_CLIENT_KEY = "hospital-inventory-sync-client-v1";
const STOCK_CODE_REPLACEMENTS = new Map([["0.9% NaKCl 20mEq/100ml btl", "XNAK20"]]);
const STOCK_FIELD_CORRECTIONS = new Map<
  string,
  Partial<Pick<StockDrug, "storageType" | "warning">>
>([
  ["XBPCA5W", { warning: "" }],
  ["XEPIN", { storageType: "ROOM" }],
  ["XMEXO", { warning: "유사모양" }],
  ["XMVH", { storageType: "REFRIGERATED" }],
]);
const FORCE_ROOM_STORAGE_CODES = new Set(["XEPIN"]);
const ECART_GENERAL_CORRECTIONS = new Map(
  [
    ["XNS20", { name: "N/S 20cc", dosage: "20mL/Amp", quantity: 3 }],
    ["NITR", { name: "Nitroglycerin(SL)", dosage: "0.6mg/Tab", quantity: 3 }],
    ["XCPENIR", { name: "Peniramin", dosage: "4mg/2ml/Amp", quantity: 3 }],
    ["XNITR10F", { name: "Nitrolingual 0.1%", dosage: "10mg/10ml", quantity: 5 }],
    ["XADENO6", { name: "Adenocor( Adenosin )", dosage: "6mg/Vial", quantity: 3 }],
    ["XNB84", { name: "Sodium Bicabonate", dosage: "20mEq/20mL/Amp", quantity: 10 }],
    ["XLID2W", { name: "2% Lidocaine 400mg", dosage: "2% 20mL/Vial", quantity: 2 }],
  ] satisfies Array<[string, Partial<EcartItem>]>,
);

type MainCategory = "stock" | "ecart";
type EcartTab = "general" | "nicu";
type CheckStatus = "" | "good" | "bad";
type PrintPreviewMode = "single" | "all-stock" | "round-summary";
type AppMode = "admin" | "master-viewer";

type EditableStockItem = StockAllocation & {
  drug: StockDrug;
  checked: boolean;
  expiryDate: string;
};

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
  checkedStock: Record<string, boolean>;
  stockExpiry: Record<string, string>;
  stockChecklistByRoom: Record<string, ChecklistState[]>;
  ecartByTarget: Record<string, EcartInspectionState>;
  roundSummaryDraft: RoundSummaryDraft | null;
  stockRoomUpdatedAt: Record<string, string>;
  uninspectedRoomIds: string[];
};

type NewDrugForm = {
  code: string;
  genericName: string;
  productName: string;
  spec: string;
  storage: string;
  warning: string;
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

const hiddenStockRooms = new Set(["체외순환실"]);
const initialStockRooms = inventory.stock.rooms.filter((room) => !hiddenStockRooms.has(room.id));
const initialStockAllocations = inventory.stock.allocations.filter((allocation) => !hiddenStockRooms.has(allocation.roomId));
const firstStockRoom = initialStockRooms[0]?.id ?? "";
const CLAIM_FLUID_SECTION = "청구약/ 수액";
const stockChecklistSections = ["비품약", "냉장약", CLAIM_FLUID_SECTION];
const ecartChecklistSections = ["E-cart"];
const ecartTargets = buildEcartTargets(inventory.ecart.departments);
const firstEcartTargetId = ecartTargets[0]?.id ?? "ecart-general";
const nicuTarget: EcartTarget = { id: "nicu", label: "NICU 신생아중환자실" };
const stockGuideSections: StockGuideSection[] = [
  {
    floor: "지하 1층",
    rows: [[{ label: "재활의학과", stockRoomId: "재활의학과", ecartTargetId: "재활의학과" }, { label: "핵의학과", ecartTargetId: "핵의학과", ecartOnly: true }]],
  },
  {
    floor: "1층",
    rows: [
      [
        { label: "피부과", stockRoomId: "피부과" },
        { label: "정형외과", stockRoomId: "정형외과" },
        { label: "비뇨기과", stockRoomId: "비뇨기과" },
        { label: "외래주사실", stockRoomId: "외래주사실", ecartTargetId: "외래주사실" },
      ],
      [
        { label: "AER1", stockRoomId: "AER", ecartTargetId: "AER-1" },
        { label: "AER2", ecartTargetId: "AER-2", ecartOnly: true },
        { label: "영상의학과1", stockRoomId: "영상의학과", ecartTargetId: "영상의학과-1" },
        { label: "영상의학과2", ecartTargetId: "영상의학과-2", ecartOnly: true },
        { label: "CT실", ecartTargetId: "CT실", ecartOnly: true },
      ],
    ],
  },
  {
    floor: "2층",
    rows: [
      [
        { label: "이비인후과", stockRoomId: "이비인후과" },
        { label: "신경과", stockRoomId: "신경과" },
        { label: "안과", stockRoomId: "안과" },
        { label: "산부인과", stockRoomId: "산부인과" },
        { label: "심혈관센터외래", ecartTargetId: "심혈관센터외래", ecartOnly: true },
        { label: "PED", stockRoomId: "PED" },
      ],
      [
        { label: "HBEF심혈관조영실", stockRoomId: "HBEF심혈관조영실" },
        { label: "운동부하검사실", ecartTargetId: "운동부하검사실", ecartOnly: true },
        { label: "소화기병검사실", stockRoomId: "소화기병검사실", ecartTargetId: "소화기병검사실" },
      ],
      [
        { label: "MICU", stockRoomId: "MICU", ecartTargetId: "MICU" },
        { label: "DSR", stockRoomId: "DSR" },
      ],
    ],
  },
  {
    floor: "3층",
    rows: [[{ label: "SICU", stockRoomId: "SICU", ecartTargetId: "SICU" }, { label: "AN", stockRoomId: "AN", ecartTargetId: "AN" }, { label: "OR", stockRoomId: "OR" }]],
  },
  {
    floor: "4층",
    rows: [
      [
        { label: "건강증진센터", ecartTargetId: "건강증진센터", ecartOnly: true },
        { label: "ADR", stockRoomId: "ADR", ecartTargetId: "ADR" },
      ],
      [
        { label: "난임클리닉", stockRoomId: "난임클리닉" },
        { label: "분만장", stockRoomId: "DRL", ecartTargetId: "DRL" },
        { label: "NICU", stockRoomId: "NICU", ecartTargetId: "nicu", ecartTab: "nicu" },
        { label: "42병동", stockRoomId: "42W", ecartTargetId: "42" },
      ],
    ],
  },
  {
    floor: "5층 ~ 12층",
    rows: [
      [
        { label: "51W", ecartTargetId: "51", ecartOnly: true },
        { label: "52W", ecartTargetId: "52", ecartOnly: true },
        { label: "61W", stockRoomId: "61W", ecartTargetId: "61" },
        { label: "62W", stockRoomId: "62W", ecartTargetId: "62" },
        { label: "71W", stockRoomId: "71W", ecartTargetId: "71" },
        { label: "72W", stockRoomId: "72W", ecartTargetId: "72" },
      ],
      [
        { label: "81W", stockRoomId: "81W", ecartTargetId: "81" },
        { label: "82W", stockRoomId: "82W", ecartTargetId: "82" },
        { label: "91W", stockRoomId: "91W", ecartTargetId: "91" },
        { label: "92W", stockRoomId: "92W", ecartTargetId: "92" },
      ],
      [
        { label: "101W", stockRoomId: "101W", ecartTargetId: "101" },
        { label: "102W", stockRoomId: "102W", ecartTargetId: "102" },
        { label: "RRT", stockRoomId: "신속대응팀" },
        { label: "111W", stockRoomId: "111W", ecartTargetId: "111" },
        { label: "112W", stockRoomId: "112W", ecartTargetId: "112" },
        { label: "121W", stockRoomId: "121W", ecartTargetId: "121" },
      ],
    ],
  },
];
const stockRoomEcartLinks = new Map(
  stockGuideSections.flatMap((section) =>
    section.rows.flatMap((row) =>
      row.flatMap((item) =>
        item.stockRoomId && item.ecartTargetId
          ? [[item.stockRoomId, { targetId: item.ecartTargetId, tab: item.ecartTab ?? "general", label: item.label }] as const]
          : [],
      ),
    ),
  ),
);
const ROUND_SUMMARY_COMMON_GUIDANCE = [
  "1. 비품약과 E-cart 유효기간 관리를 월 1회 날짜로 관리해 주시고, 유효기간 1달 미만인 경우 약제팀에 문의하여 교환 기간 안내를 받으시기 바랍니다.",
  "   - E-cart은 연 1회, NTG는 연 2회 일괄교환이며 주기 내 임박 약품은 약제팀 문의 후 개별 교환해 주십시오.",
  "2. 비품약 관리대장 수량과 실제 보유/카운트 수량이 일치하도록 관리해 주십시오. 잉여 발생 시 약제팀으로 바로 내려 주십시오.",
  "3. 처치 청구약은 사용량 변화에 따라 청구량을 조절하고 유효기간 경과 폐기가 없도록 관리 부탁드립니다.",
  "4. 병동 비품 점검표는 분기별 의약품 보관 상태 점검 증빙 서류로 보관해 주시기 바랍니다.",
  "5. 24시간 근무하지 않는 부서에서 냉장약이 있는 경우 주말이나 휴일도 냉장고 MIN/MAX를 확인하여 2-8도를 유지해 주십시오.",
].join("\n");

export function makeChecklistState(prefix: string, sections: string[]) {
  return normalizeChecklistRows(inventory.checklist)
    .filter((item) => sections.includes(item.section))
    .map((item, index) => {
      const isNoteOrReason = item.text.startsWith("*") || item.text.includes("사유") || item.text.startsWith("이상 시");
      const shouldDefaultGood = !isNoteOrReason;
      return {
        ...item,
        id: `${prefix}-${index}`,
        status: (shouldDefaultGood ? "good" : "") as CheckStatus,
        note: "",
      };
    });
}

function makeStockChecklist(roomId: string) {
  return makeChecklistState(`stock-${roomId}`, stockChecklistSections);
}

function makeEcartKey(tab: EcartTab, targetId: string) {
  return `${tab}:${targetId}`;
}

function makeEcartInspectionState(tab: EcartTab, key: string): EcartInspectionState {
  const baseItems = tab === "general" ? inventory.ecart.generalItems : inventory.ecart.nicuItems;
  return {
    items: baseItems.map((item) => ({ ...normalizeEcartItem(item), checked: false, expiryDate: "" })),
    checklist: makeChecklistState(`ecart-${key}`, ecartChecklistSections),
  };
}

export function getStockChecklistDefaultState(
  prev: Record<string, ChecklistState[]>,
  roomId: string
): ChecklistState[] {
  const current = prev[roomId];
  if (current) return normalizeChecklistRows(current);

  const base = makeStockChecklist(roomId);
  const w42 = prev["42W"];
  if (roomId !== "42W" && w42) {
    const w42Norm = normalizeChecklistRows(w42);
    return normalizeChecklistRows(base).map((item, index) => {
      const w42Item = w42Norm[index];
      return {
        ...item,
        status: w42Item ? w42Item.status : item.status,
        note: w42Item ? w42Item.note : item.note,
      };
    });
  }
  return normalizeChecklistRows(base);
}

function getEcartDefaultState(
  prev: Record<string, EcartInspectionState>,
  tab: EcartTab,
  key: string
): EcartInspectionState {
  const current = prev[key];
  if (current) return normalizeEcartInspectionState(current);

  const base = makeEcartInspectionState(tab, key);
  const w42 = prev["general:42"];
  if (key !== "general:42" && w42) {
    const w42Norm = normalizeEcartInspectionState(w42);
    const w42ItemMap = new Map(w42Norm.items.map((item) => [item.code, item]));
    const items = base.items.map((item) => {
      const w42Item = w42ItemMap.get(item.code);
      return {
        ...item,
        checked: w42Item ? w42Item.checked : item.checked,
        expiryDate: w42Item ? w42Item.expiryDate : item.expiryDate,
      };
    });
    const checklist = base.checklist.map((item, index) => {
      const w42Check = w42Norm.checklist[index];
      return {
        ...item,
        status: w42Check ? w42Check.status : item.status,
        note: w42Check ? w42Check.note : item.note,
      };
    });
    return { items, checklist };
  }
  return normalizeEcartInspectionState(base);
}

function buildEcartTargets(departments: string[]): EcartTarget[] {
  const targets: EcartTarget[] = [];
  const seen = new Set<string>();

  function add(label: string, id = label.replace(/\s+/g, "-")) {
    const normalizedLabel = label.trim();
    const normalizedId = id.trim();
    if (!normalizedLabel || seen.has(normalizedId)) return;
    seen.add(normalizedId);
    targets.push({ id: normalizedId, label: normalizedLabel });
  }

  for (const department of departments) {
    const value = department.trim();
    if (!value) continue;
    if (/^AER/i.test(value)) {
      add("AER 1", "AER-1");
      add("AER 2", "AER-2");
      continue;
    }
    if (value.includes("영상의학과")) {
      add("영상의학과 1", "영상의학과-1");
      add("영상의학과 2", "영상의학과-2");
      continue;
    }
    add(value.replace(/\s*\d+\s*개\s*$/, ""));
  }

  add("CT실", "CT실");
  return targets;
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

function normalizeStockDrug(drug: StockDrug): StockDrug {
  const code = normalizeStockCode(drug.code, drug.productName);
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

function dedupeStockDrugs(drugs: StockDrug[]) {
  const byCode = new Map<string, StockDrug>();
  for (const drug of drugs.map(normalizeStockDrug)) {
    byCode.set(drug.code, { ...(byCode.get(drug.code) ?? drug), ...drug });
  }
  return sortStockDrugsByName([...byCode.values()]);
}

function normalizeStockAllocations(allocations: StockAllocation[]) {
  const byKey = new Map<string, StockAllocation>();
  for (const allocation of allocations) {
    const drugCode = normalizeStockCode(allocation.drugCode);
    const key = stockKey(allocation.roomId, drugCode);
    const current = byKey.get(key);
    byKey.set(key, {
      roomId: allocation.roomId,
      drugCode,
      requiredQty: Math.max(current?.requiredQty ?? 0, allocation.requiredQty),
    });
  }
  return [...byKey.values()];
}

function normalizeEcartItem(item: EcartItem): EcartItem {
  return { ...item, ...ECART_GENERAL_CORRECTIONS.get(item.code) };
}

function normalizeEcartInspectionState(state: EcartInspectionState): EcartInspectionState {
  return {
    ...state,
    items: state.items.map((item) => ({ ...item, ...normalizeEcartItem(item) })),
    checklist: normalizeChecklistRows(state.checklist),
  };
}

function normalizeStockRooms(rooms: StockRoom[]) {
  const generatedById = new Map(initialStockRooms.map((room) => [room.id, room]));
  return rooms.map((room) => {
    const generated = generatedById.get(room.id);
    return {
      ...generated,
      ...room,
      sourceUpdatedAt: room.sourceUpdatedAt ?? generated?.sourceUpdatedAt ?? "",
    };
  });
}

function remapStockKeyRecord<T>(record?: Record<string, T>) {
  if (!record) return undefined;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    const [roomId, drugCode] = key.split("::");
    next[roomId && drugCode ? stockKey(roomId, normalizeStockCode(drugCode)) : key] = value;
  }
  return next;
}

function normalizePersistedState(state: Partial<PersistedAppState>): Partial<PersistedAppState> {
  const ecartByTarget = state.ecartByTarget
    ? Object.fromEntries(Object.entries(state.ecartByTarget).map(([key, value]) => [key, normalizeEcartInspectionState(value)]))
    : undefined;
  return {
    ...state,
    stockDrugs: state.stockDrugs ? dedupeStockDrugs(state.stockDrugs) : undefined,
    stockRooms: state.stockRooms ? normalizeStockRooms(state.stockRooms) : undefined,
    stockAllocations: state.stockAllocations ? normalizeStockAllocations(state.stockAllocations) : undefined,
    checkedStock: remapStockKeyRecord(state.checkedStock),
    stockExpiry: remapStockKeyRecord(state.stockExpiry),
    stockChecklistByRoom: state.stockChecklistByRoom
      ? Object.fromEntries(Object.entries(state.stockChecklistByRoom).map(([roomId, rows]) => [roomId, normalizeChecklistRows(rows)]))
      : undefined,
    ecartByTarget,
    uninspectedRoomIds: Array.isArray(state.uninspectedRoomIds) ? state.uninspectedRoomIds : undefined,
  };
}

function drugTitle(drug: StockDrug) {
  return drugDisplayName(drug);
}

function isRefrigeratedStorage(storage: string) {
  const value = storage.replace(/\s+/g, "");
  const normalized = value.replace(/[∼～−–—]/g, "-").replace(/℃|°C/gi, "");
  if (normalized.includes("냉장보관하지")) return false;
  return normalized.includes("냉장") || /2(?:-|~)8/.test(normalized);
}

function isRefrigerated(drug: StockDrug) {
  if (FORCE_ROOM_STORAGE_CODES.has(drug.code)) return false;
  if (isForcedRefrigeratedDrug(drug)) return true;
  return isRefrigeratedStorage(drug.storage);
}

function splitStockItems(items: EditableStockItem[]) {
  return {
    refrigerated: items.filter((item) => isRefrigerated(item.drug)),
    roomTemperature: items.filter((item) => !isRefrigerated(item.drug)),
  };
}

function inferStorageType(storage: string): StockDrug["storageType"] {
  if (isRefrigeratedStorage(storage)) return "REFRIGERATED";
  const value = storage.replace(/\s+/g, "");
  if (value.includes("차광")) return "LIGHT_PROTECTED";
  return "ROOM";
}

function storageBadge(drug: StockDrug) {
  if (isRefrigerated(drug)) return <span className="badge blue">냉장</span>;
  if (drug.storageType === "LIGHT_PROTECTED") return <span className="badge amber">차광</span>;
  return <span className="badge gray">실온</span>;
}

function warningBadge(text: string) {
  if (!text) return <span className="empty">-</span>;
  const tone = text.includes("고위험") ? "red" : "amber";
  return <span className={`badge ${tone}`}>{text}</span>;
}

function matchesDrug(drug: StockDrug, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [drug.code, drug.genericName, drug.productName, drug.spec, drug.storage, drug.warning]
    .join(" ")
    .toLowerCase()
    .includes(value);
}

function matchesMaster(row: MasterRow, query: string) {
  return matchesDrug(row, query) || row.roomDetails.some((detail) => detail.roomId.toLowerCase().includes(query));
}

function updateChecklistRows(items: ChecklistState[], id: string, patch: Partial<ChecklistState>) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function isChecklistLabelOnly(text: string) {
  const compact = text.replace(/\s+/g, "");
  return compact === "양호불량";
}

function isRetiredChecklistRow(text: string) {
  return text.includes("E-cart") && text.includes("주 2회") && text.includes("관리대장");
}

function normalizeChecklistSection(section: string) {
  return section === "청구약" ? CLAIM_FLUID_SECTION : section;
}

function normalizeChecklistText(text: string) {
  return text.replace(/청구약(?!\/\s*수액)/g, CLAIM_FLUID_SECTION);
}

function makeChecklistSibling<T extends { id?: string; note?: string; section: string; status?: CheckStatus; text: string }>(
  item: T,
  suffix: string,
  text: string,
) {
  return {
    ...item,
    id: item.id ? `${item.id}-${suffix}` : undefined,
    note: "",
    status: "" as CheckStatus,
    text,
  } as T;
}

function ensureChecklistRow<T extends { id?: string; note?: string; section: string; status?: CheckStatus; text: string }>(
  rows: T[],
  section: string,
  text: string,
  suffix: string,
) {
  const compactText = text.replace(/\s+/g, "");
  if (rows.some((item) => item.section === section && item.text.replace(/\s+/g, "") === compactText)) return;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].section === section) {
      rows.splice(index + 1, 0, makeChecklistSibling(rows[index], suffix, text));
      return;
    }
  }
}

function normalizeChecklistRows<T extends { id?: string; note?: string; section: string; status?: CheckStatus; text: string }>(items: T[]) {
  const rows: T[] = [];
  for (const item of items) {
    if (isChecklistLabelOnly(item.text)) continue;
    if (isRetiredChecklistRow(item.text)) continue;
    const section = normalizeChecklistSection(item.section);
    let text = normalizeChecklistText(item.text);
    if (text.includes("비품이외의 잉여약을 보관하고 있다.")) {
      text = text.replace("비품이외의 잉여약을 보관하고 있다.", "비품이외의 잉여약을 보관하고 있지 않다.");
    }
    let status = item.status;
    const isNoteOrReason = text.startsWith("*") || text.includes("사유") || text.startsWith("이상 시");
    const shouldDefaultGood = !isNoteOrReason;
    if (shouldDefaultGood && (status === undefined || status === "")) {
      status = "good" as CheckStatus;
    }
    const normalizedItem = { ...item, section, text, status };
    if (text.startsWith("2-1 ") && text.includes(" 2-2 ")) {
      const [first, second] = text.split(" 2-2 ", 2);
      rows.push(makeChecklistSibling(normalizedItem, "2-1", first));
      rows.push(makeChecklistSibling(normalizedItem, "2-2", `2-2 ${second}`));
      continue;
    }
    rows.push(normalizedItem);
  }

  const stockKindIndex = rows.findIndex((item) => item.section === "비품약" && item.text.replace(/\s+/g, "") === "비품약종류일치");
  const hasQuantityMatch = rows.some((item) => item.section === "비품약" && item.text.replace(/\s+/g, "") === "수량일치");
  if (stockKindIndex >= 0 && !hasQuantityMatch) {
    rows.splice(stockKindIndex + 1, 0, makeChecklistSibling(rows[stockKindIndex], "quantity-match", "수량 일치"));
  }

  let lastColdIndex = -1;
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (rows[index].section === "냉장약") {
      lastColdIndex = index;
      break;
    }
  }
  const hasThermometerCheck = rows.some((item) => item.section === "냉장약" && item.text.includes("냉장고 온도계 검증"));
  if (lastColdIndex >= 0 && !hasThermometerCheck) {
    rows.splice(lastColdIndex + 1, 0, makeChecklistSibling(rows[lastColdIndex], "thermometer", "6. 연 1회 냉장고 온도계 검증 여부"));
  }

  ensureChecklistRow(rows, "비품약", "5. 비품약 유효기간 1달에 1번 날짜로 관리한다.", "monthly-stock-expiry");
  ensureChecklistRow(rows, CLAIM_FLUID_SECTION, "5. 청구약/ 수액 유효기간을 1달에 1번 관리 한다.", "monthly-claim-fluid-expiry");

  return rows;
}

function stockKey(roomId: string, drugCode: string) {
  return `${roomId}::${drugCode}`;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function defaultRoundInspectionPeriod() {
  const now = new Date();
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
}

export function getInitialAppMode(pathname = window.location.pathname, search = window.location.search): AppMode {
  const params = new URLSearchParams(search);
  if (params.get("view") === "master" || pathname.replace(/\/+$/, "").endsWith("/viewer")) {
    return "master-viewer";
  }
  return "admin";
}

function getStockGuideInspectionKey(item: StockGuideEntry) {
  if (item.stockRoomId) return item.stockRoomId;
  if (item.ecartTargetId) return `ecart:${item.ecartTab ?? "general"}:${item.ecartTargetId}`;
  return item.label;
}

export function App() {
  const appMode = useMemo(() => getInitialAppMode(), []);
  const isMasterViewer = appMode === "master-viewer";
  const persistedState = useMemo(loadPersistedState, []);
  const [mainCategory, setMainCategory] = useState<MainCategory>("stock");
  const [showMaster, setShowMaster] = useState(isMasterViewer);
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [activeRoom, setActiveRoom] = useState(firstStockRoom);
  const [activeEcartTab, setActiveEcartTab] = useState<EcartTab>("general");
  const [activeEcartTargetId, setActiveEcartTargetId] = useState(firstEcartTargetId);
  const [stockDrugs, setStockDrugs] = useState<StockDrug[]>(() => dedupeStockDrugs(persistedState.stockDrugs ?? inventory.stock.drugs));
  const [stockRooms, setStockRooms] = useState<StockRoom[]>(
    (persistedState.stockRooms ?? initialStockRooms).filter((room) => !hiddenStockRooms.has(room.id)),
  );
  const [stockAllocations, setStockAllocations] = useState<StockAllocation[]>(
    (persistedState.stockAllocations ?? initialStockAllocations).filter((allocation) => !hiddenStockRooms.has(allocation.roomId)),
  );
  const [checkedStock, setCheckedStock] = useState<Record<string, boolean>>(persistedState.checkedStock ?? {});
  const [stockExpiry, setStockExpiry] = useState<Record<string, string>>(persistedState.stockExpiry ?? {});
  const [stockChecklistByRoom, setStockChecklistByRoom] = useState<Record<string, ChecklistState[]>>(
    persistedState.stockChecklistByRoom ?? {},
  );
  const [ecartByTarget, setEcartByTarget] = useState<Record<string, EcartInspectionState>>(
    persistedState.ecartByTarget ?? {},
  );
  const [roundSummaryDraft, setRoundSummaryDraft] = useState<RoundSummaryDraft | null>(
    persistedState.roundSummaryDraft ?? null,
  );
  const [stockRoomUpdatedAt, setStockRoomUpdatedAt] = useState<Record<string, string>>(
    persistedState.stockRoomUpdatedAt ?? {},
  );
  const [uninspectedRoomIds, setUninspectedRoomIds] = useState<string[]>(persistedState.uninspectedRoomIds ?? []);
  const [query, setQuery] = useState("");
  const [masterQuery, setMasterQuery] = useState("");
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
  });
  const [newRoomName, setNewRoomName] = useState("");
  const [renameDrugForm, setRenameDrugForm] = useState({ oldCode: "", newCode: "" });
  const [isMobileMode, setIsMobileMode] = useState(false);
  const [showSyncSettings, setShowSyncSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ mode: "syncing", message: "자동 저장 서버 연결 중..." });
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>("idle");
  const [pdfDownload, setPdfDownload] = useState<PdfDownloadResult | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printPreviewMode, setPrintPreviewMode] = useState<PrintPreviewMode>("single");
  const reportRef = useRef<HTMLDivElement>(null);
  const printPreviewRef = useRef<HTMLDivElement>(null);
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
      checkedStock,
      stockExpiry,
      stockChecklistByRoom,
      ecartByTarget,
      roundSummaryDraft,
      stockRoomUpdatedAt,
      uninspectedRoomIds,
    }),
    [
      checkedStock,
      ecartByTarget,
      roundSummaryDraft,
      stockAllocations,
      stockChecklistByRoom,
      stockDrugs,
      stockExpiry,
      stockRoomUpdatedAt,
      stockRooms,
      uninspectedRoomIds,
    ],
  );

  function applyPersistedAppState(nextState: Partial<PersistedAppState>) {
    const normalized = normalizePersistedState(nextState);
    applyingRemoteRef.current = true;
    if (normalized.stockDrugs) setStockDrugs(dedupeStockDrugs(normalized.stockDrugs));
    if (normalized.stockRooms) setStockRooms(normalizeStockRooms(normalized.stockRooms).filter((room) => !hiddenStockRooms.has(room.id)));
    if (normalized.stockAllocations) {
      setStockAllocations(normalizeStockAllocations(normalized.stockAllocations).filter((allocation) => !hiddenStockRooms.has(allocation.roomId)));
    }
    if (normalized.checkedStock) setCheckedStock(normalized.checkedStock);
    if (normalized.stockExpiry) setStockExpiry(normalized.stockExpiry);
    if (normalized.stockChecklistByRoom) setStockChecklistByRoom(normalized.stockChecklistByRoom);
    if (normalized.ecartByTarget) setEcartByTarget(normalized.ecartByTarget);
    if ("roundSummaryDraft" in normalized) setRoundSummaryDraft(normalized.roundSummaryDraft ?? null);
    if (normalized.stockRoomUpdatedAt) setStockRoomUpdatedAt(normalized.stockRoomUpdatedAt);
    if (normalized.uninspectedRoomIds) setUninspectedRoomIds(normalized.uninspectedRoomIds);
  }

  async function pullRemoteState(forceApply = false, options: PullRemoteOptions = {}) {
    if (pullInFlightRef.current) {
      if (!options.silent) setSyncStatus({ mode: "idle", message: "이미 자동 저장 상태를 확인 중입니다." });
      return false;
    }
    pullInFlightRef.current = true;
    if (!options.silent) setSyncStatus({ mode: "syncing", message: "자동 저장 상태 확인 중..." });
    try {
      const remote = await loadServerState<PersistedAppState>();
      syncInitializedRef.current = true;
      if (!remote) {
        setSyncStatus({ mode: "idle", message: "저장된 상태 없음. 다음 수정 시 자동 생성됩니다." });
        scheduleRemotePush();
        return false;
      }
      remoteShaRef.current = remote.sha;
      const shouldApply =
        forceApply ||
        shouldApplyRemoteState({
          remoteUpdatedAt: remote.envelope.updatedAt,
          localUpdatedAt: localUpdatedAtRef.current,
          remoteClientId: remote.envelope.clientId,
          clientId: syncClientId,
          hasUnsavedLocalChanges: hasUnsavedLocalChangesRef.current || pendingPushRef.current,
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
      const result = await saveServerState(envelope, { baseSha: remoteShaRef.current });
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
    if (!latestStateRef.current) return;
    const confirmed = window.confirm(
      "이 기기에 남아 있는 현재 입력 내용을 PC/모바일 공유 상태로 덮어씁니다. 모바일에서 점검한 내용과 병동 순회점검표 내용을 PC로 옮길 때만 사용하세요.",
    );
    if (!confirmed) return;

    const updatedAt = new Date().toISOString();
    const envelope: RemoteStateEnvelope<PersistedAppState> = {
      version: 1,
      updatedAt,
      clientId: syncClientId,
      state: latestStateRef.current,
    };

    setSyncStatus({ mode: "syncing", message: "이 기기 내용으로 서버 반영 중..." });
    try {
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
      scheduleRemotePush();
    } else if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
    }
  }, [persistedAppState]);

  useEffect(() => {
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
  }, [syncClientId]);

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

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

  const drugByCode = useMemo(() => new Map(stockDrugs.map((drug) => [drug.code, drug])), [stockDrugs]);
  const roomById = useMemo(() => new Map(currentStockRooms.map((room) => [room.id, room])), [currentStockRooms]);
  const activeRoomInfo = roomById.get(activeRoom) ?? currentStockRooms[0];
  const activeEcartTarget =
    activeEcartTab === "general"
      ? ecartTargets.find((target) => target.id === activeEcartTargetId) ?? ecartTargets[0]
      : nicuTarget;
  const activeEcartKey = makeEcartKey(activeEcartTab, activeEcartTarget.id);
  const activeEcartState = useMemo(() => {
    return getEcartDefaultState(ecartByTarget, activeEcartTab, activeEcartKey);
  }, [activeEcartKey, activeEcartTab, ecartByTarget]);

  const masterRows = useMemo(() => buildMasterRows(stockDrugs, stockAllocations), [stockAllocations, stockDrugs]);
  const filteredMasterRows = useMemo(
    () => masterRows.filter((row) => matchesMaster(row, masterQuery.trim().toLowerCase())),
    [masterRows, masterQuery],
  );
  const selectedAssignmentDrug = useMemo(
    () => stockDrugs.find((drug) => drug.code === newAssignment.drugCode),
    [newAssignment.drugCode, stockDrugs],
  );
  const assignmentDrugMatches = useMemo(() => {
    const value = assignmentDrugQuery.trim();
    if (!value) return [];
    return stockDrugs.filter((drug) => matchesDrug(drug, value)).slice(0, 18);
  }, [assignmentDrugQuery, stockDrugs]);

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
  const currentChecklist = mainCategory === "stock" ? currentStockChecklist : activeEcartState.checklist;

  const selectedMasterRow = filteredMasterRows[0];
  const showMasterQuickView = masterQuery.trim().length > 0;
  const stockTotalQuantity = useMemo(
    () => stockAllocations.reduce((sum, allocation) => sum + allocation.requiredQty, 0),
    [stockAllocations],
  );
  const currentCheckedCount =
    mainCategory === "stock"
      ? currentStockItems.filter((item) => item.checked).length
      : currentEcartItems.filter((item) => item.checked).length;
  const currentItemCount = mainCategory === "stock" ? currentStockItems.length : currentEcartItems.length;
  const checklistDoneCount = currentChecklist.filter((item) => item.status !== "").length;
  const currentAlertCount =
    mainCategory === "stock"
      ? currentStockItems.filter((item) => item.drug.warning || item.drug.storageType !== "ROOM").length
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
        label: room.label,
        stockChecklist: getStockChecklistDefaultState(stockChecklistByRoom, room.id),
        ecartChecklist,
      };
    });

    const ecartOnlyEntries = new Map<string, { id: string; label: string; tab: EcartTab }>();
    for (const section of stockGuideSections) {
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
  }, [currentStockRooms, ecartByTarget, stockChecklistByRoom]);
  const activeRoundSummaryDraft = roundSummaryDraft ?? generatedRoundSummaryDraft;

  const lastGeneratedDraftRef = useRef<RoundSummaryDraft | null>(null);

  useEffect(() => {
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
        label={mainCategory === "stock" ? "주의/특수보관" : "대상 부서"}
        value={currentAlertCount.toLocaleString("ko-KR")}
        detail={mainCategory === "stock" ? `냉장 ${refrigeratedStock.length}개 포함` : activeEcartTarget.label}
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
    if (isMasterViewer) return;
    setShowMaster((prev) => {
      const next = !prev;
      if (next) setShowRoundSummary(false);
      return next;
    });
  }

  function toggleRoundSummaryView() {
    if (isMasterViewer) return;
    setShowRoundSummary((prev) => {
      const next = !prev;
      if (next) setShowMaster(false);
      return next;
    });
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

  function addAssignment(event: FormEvent) {
    event.preventDefault();
    if (!newAssignment.drugCode || targetRooms.length === 0) return;
    setStockAllocations((prev) => {
      let next = prev;
      for (const roomId of targetRooms) {
        next = updateAllocationQuantity(next, roomId, newAssignment.drugCode, newAssignment.count);
      }
      return next;
    });
    markStockRoomsEdited(targetRooms);
    setNewAssignment({ drugCode: "", count: 1 });
    setAssignmentDrugQuery("");
    setTargetRooms([]);
  }

  function addNewDrug(event: FormEvent) {
    event.preventDefault();
    const productName = newDrug.productName.trim();
    const code = normalizeStockCode(newDrug.code.trim(), productName);
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
    setStockDrugs((prev) =>
      sortStockDrugsByName(prev.some((item) => item.code === code) ? prev.map((item) => (item.code === code ? drug : item)) : [...prev, drug]),
    );
    setNewAssignment((prev) => ({ ...prev, drugCode: code }));
    setNewDrug({ code: "", genericName: "", productName: "", spec: "", storage: "실온보관", warning: "" });
  }

  function changeDrugCode(event: FormEvent) {
    event.preventDefault();
    const oldCode = renameDrugForm.oldCode.trim();
    const newCode = normalizeStockCode(renameDrugForm.newCode.trim());
    if (!oldCode || !newCode) {
      alert("기존 코드와 신규 코드를 모두 입력해 주세요.");
      return;
    }
    if (oldCode === newCode) {
      alert("기존 코드와 신규 코드가 동일합니다.");
      return;
    }
    const drugExists = stockDrugs.some((item) => item.code === oldCode);
    if (!drugExists) {
      alert("존재하지 않는 기존 약품 코드입니다.");
      return;
    }
    const newDrugExists = stockDrugs.some((item) => item.code === newCode);
    if (newDrugExists) {
      alert("이미 존재하는 신규 약품 코드입니다.");
      return;
    }

    // 1. Update stockDrugs
    setStockDrugs((prev) => {
      const updated = prev.map((item) => {
        if (item.code === oldCode) {
          return { ...item, code: newCode };
        }
        return item;
      });
      return sortStockDrugsByName(updated);
    });

    // 2. Update stockAllocations
    setStockAllocations((prev) => {
      return prev.map((allocation) => {
        if (allocation.drugCode === oldCode) {
          return { ...allocation, drugCode: newCode };
        }
        return allocation;
      });
    });

    // 3. Update checkedStock keys
    setCheckedStock((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(prev)) {
        const parts = key.split("::");
        if (parts.length === 2 && parts[1] === oldCode) {
          const roomId = parts[0];
          const newKey = stockKey(roomId, newCode);
          next[newKey] = prev[key];
          delete next[key];
        }
      }
      return next;
    });

    // 4. Update stockExpiry keys
    setStockExpiry((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(prev)) {
        const parts = key.split("::");
        if (parts.length === 2 && parts[1] === oldCode) {
          const roomId = parts[0];
          const newKey = stockKey(roomId, newCode);
          next[newKey] = prev[key];
          delete next[key];
        }
      }
      return next;
    });

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
    setStockRooms((prev) =>
      prev.some((room) => room.id === id)
        ? prev
        : [...prev, { id, label: id, sourceColumn: id, sourceSheet: id, sourceUpdatedAt: formatRoomUpdatedAt(), allocationCount: 0, totalQuantity: 0 }],
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
    const stockChecklist = getStockChecklistDefaultState(stockChecklistByRoom, roomId);
    const index = stockChecklist.findIndex((item) => item.id === id);

    setStockChecklistByRoom((prev) => {
      const current = getStockChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { note }) };
    });

    const ecartLink = stockRoomEcartLinks.get(roomId);
    if (ecartLink && index >= 0) {
      const ecartKey = makeEcartKey(ecartLink.tab, ecartLink.targetId);
      setEcartByTarget((prev) => {
        const currentEcart = getEcartDefaultState(prev, ecartLink.tab, ecartKey);
        if (index < currentEcart.checklist.length) {
          const ecartId = currentEcart.checklist[index].id;
          return {
            ...prev,
            [ecartKey]: {
              ...currentEcart,
              checklist: updateChecklistRows(currentEcart.checklist, ecartId, { note }),
            },
          };
        }
        return prev;
      });
    }
  }

  function updateStockChecklistStatusForRoom(roomId: string, id: string, status: CheckStatus) {
    const stockChecklist = getStockChecklistDefaultState(stockChecklistByRoom, roomId);
    const index = stockChecklist.findIndex((item) => item.id === id);

    setStockChecklistByRoom((prev) => {
      const current = getStockChecklistDefaultState(prev, roomId);
      return { ...prev, [roomId]: updateChecklistRows(current, id, { status }) };
    });

    const ecartLink = stockRoomEcartLinks.get(roomId);
    if (ecartLink && index >= 0) {
      const ecartKey = makeEcartKey(ecartLink.tab, ecartLink.targetId);
      setEcartByTarget((prev) => {
        const currentEcart = getEcartDefaultState(prev, ecartLink.tab, ecartKey);
        if (index < currentEcart.checklist.length) {
          const ecartId = currentEcart.checklist[index].id;
          return {
            ...prev,
            [ecartKey]: {
              ...currentEcart,
              checklist: updateChecklistRows(currentEcart.checklist, ecartId, { status }),
            },
          };
        }
        return prev;
      });
    }
  }

  function updateEcartChecklistNote(id: string, note: string) {
    const currentEcart = getEcartDefaultState(ecartByTarget, activeEcartTab, activeEcartKey);
    const index = currentEcart.checklist.findIndex((item) => item.id === id);

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

    const roomId = [...stockRoomEcartLinks.entries()].find(
      ([_, link]) => makeEcartKey(link.tab, link.targetId) === activeEcartKey
    )?.[0];

    if (roomId && index >= 0) {
      setStockChecklistByRoom((prev) => {
        const currentStock = getStockChecklistDefaultState(prev, roomId);
        if (index < currentStock.length) {
          const stockId = currentStock[index].id;
          return { ...prev, [roomId]: updateChecklistRows(currentStock, stockId, { note }) };
        }
        return prev;
      });
    }
  }

  function updateEcartChecklistStatus(id: string, status: CheckStatus) {
    const currentEcart = getEcartDefaultState(ecartByTarget, activeEcartTab, activeEcartKey);
    const index = currentEcart.checklist.findIndex((item) => item.id === id);

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

    const roomId = [...stockRoomEcartLinks.entries()].find(
      ([_, link]) => makeEcartKey(link.tab, link.targetId) === activeEcartKey
    )?.[0];

    if (roomId && index >= 0) {
      setStockChecklistByRoom((prev) => {
        const currentStock = getStockChecklistDefaultState(prev, roomId);
        if (index < currentStock.length) {
          const stockId = currentStock[index].id;
          return { ...prev, [roomId]: updateChecklistRows(currentStock, stockId, { status }) };
        }
        return prev;
      });
    }
  }

  function updateRoundSummaryDraft(patch: Partial<Omit<RoundSummaryDraft, "rows">>) {
    setRoundSummaryDraft((prev) => ({
      ...(prev ?? (JSON.parse(JSON.stringify(generatedRoundSummaryDraft)) as RoundSummaryDraft)),
      ...patch,
    }));
  }

  function updateRoundSummaryRow(rowId: string, patch: Partial<RoundSummaryRow>) {
    setRoundSummaryDraft((prev) => {
      const draft = prev ?? (JSON.parse(JSON.stringify(generatedRoundSummaryDraft)) as RoundSummaryDraft);
      return {
        ...draft,
        rows: draft.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)),
      };
    });
  }

  function regenerateRoundSummaryDraft() {
    setRoundSummaryDraft(null);
  }

  function openRoundSummaryPrintPreview() {
    setPrintPreviewMode("round-summary");
    setPdfStatus("idle");
    setPdfDownload(null);
    setShowPrintPreview(true);
  }

  async function downloadReport() {
    const reportElement = printPreviewRef.current ?? reportRef.current;
    if (!reportElement) return;
    const isBulkStock = showPrintPreview && printPreviewMode === "all-stock";
    const isRoundSummary = showPrintPreview && printPreviewMode === "round-summary";
    const targetName = isRoundSummary
      ? "병동순회점검표"
      : isBulkStock
        ? "전체보유실"
        : mainCategory === "stock"
          ? activeRoomInfo?.label ?? activeRoom
          : activeEcartTarget.label;
    const reportName = isRoundSummary
      ? "전체점검내용"
      : isBulkStock
        ? "비품약-일괄점검보고서"
        : mainCategory === "stock"
          ? "비품약-점검보고서"
          : "E-cart-점검보고서";
    const fileName = `${sanitizeFileName(`${targetName}-${reportName}-${todayStamp()}`)}.pdf`;
    setPdfStatus("generating");
    setPdfDownload(null);
    try {
      const result = await downloadElementAsPdf(reportElement, fileName);
      setPdfDownload(result);
      setPdfStatus("ready");
    } catch (error) {
      console.error(error);
      setPdfStatus("error");
    }
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
            <h2>{`( ${room.label} ) 병동 비품약 점검 체크리스트`}</h2>
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
          onCheck={(roomId, drugCode) =>
            setCheckedStock((prev) => {
              const key = stockKey(roomId, drugCode);
              const currentVal = prev[key] !== undefined ? prev[key] : (prev[stockKey("42W", drugCode)] ?? false);
              return { ...prev, [key]: !currentVal };
            })
          }
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

  function renderEcartReportCard(targetRef: RefObject<HTMLDivElement | null>, className = "report-card") {
    return (
      <section ref={targetRef} className={className}>
        <div className="report-title">
          <div className="report-title-row">
            <h2>{`( ${activeEcartTarget.label} ) 응급카트 점검 체크리스트`}</h2>
          </div>
          <span>점검 일자: {new Date().toLocaleDateString("ko-KR")}</span>
        </div>

        <div className="report-section-title">
          <Database size={18} />
          약품 보유 현황
        </div>
        <EcartReportTable
          items={currentEcartItems}
          onCheck={(id) => updateActiveEcartItems((items) => items.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))}
          onExpiry={(id, expiryDate) =>
            updateActiveEcartItems((items) => items.map((item) => (item.id === id ? { ...item, expiryDate } : item)))
          }
          onCount={updateEcartCount}
          onDelete={deleteEcartItem}
        />

        <ChecklistTable items={activeEcartState.checklist} onNote={updateEcartChecklistNote} onStatus={updateEcartChecklistStatus} />
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
    return renderEcartReportCard(targetRef, className);
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
                <th>병동명</th>
                <th>점검결과</th>
                <th>비품 및 E-cart 약품</th>
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
              <h2>병동 순회 점검표</h2>
              <p>불량 체크와 비고/사유 입력 내용을 중심으로 병동 순회 점검표 양식에 맞춰 자동 작성합니다.</p>
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
                    <th>병동명</th>
                    <th>점검결과</th>
                    <th>비품 및 E-cart 약품</th>
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
              공통 안내
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

  return (
    <div className={`app-page ${isMobileMode ? "mobile-mode" : ""} ${isMasterViewer ? "viewer-mode" : ""}`}>
      <header className="app-header">
        <div>
          <p>{isMasterViewer ? "뷰어 전용" : "병동 비품약 & E-cart 점검"}</p>
          <h1>{isMasterViewer ? "전체 약품 마스터" : "비품관리 현황판"}</h1>
        </div>
        {!isMasterViewer && (
          <div className="header-actions">
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
            <button className={`admin-toggle ${showMaster ? "danger" : ""}`} onClick={toggleMasterView}>
              <Database size={18} />
              {showMaster ? "점검 현황판으로 돌아가기" : "전체 약품 마스터 관리"}
            </button>
          </div>
        )}
      </header>

      {!isMasterViewer && showSyncSettings && (
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
                서버 내용 다시 받기
              </button>
              <button type="button" className="danger" onClick={() => void forceUploadCurrentDeviceState()}>
                이 기기 내용으로 PC 반영
              </button>
            </div>
          </div>
          <div className={`sync-status ${syncStatus.mode}`}>{syncStatusText}</div>
        </section>
      )}

      {!isMasterViewer && !showMaster && !showRoundSummary && (
        <div className="primary-tabs">
          <button className={mainCategory === "stock" ? "active stock" : ""} onClick={() => setMainCategory("stock")}>
            비품약 관리
          </button>
          <button className={mainCategory === "ecart" ? "active ecart" : ""} onClick={() => setMainCategory("ecart")}>
            응급카트 E-cart 관리
          </button>
        </div>
      )}

      <main className="app-content">
        {showRoundSummary ? (
          renderRoundSummaryEditor()
        ) : showMaster ? (
          <section className="master-stack">
            {!isMasterViewer && (
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
                    <button type="button" onClick={() => setTargetRooms(currentStockRooms.map((room) => room.id))}>
                      전체 선택
                    </button>
                  </div>
                  <div className="room-chip-grid">
                    {currentStockRooms.map((room) => (
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
                        {room.label}
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
                          {stockDrugs.map((drug) => (
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
                    <button className="secondary-button" type="submit" style={{ backgroundColor: "#0284c7", borderColor: "#0284c7" }}>
                      <RefreshCw size={16} />
                      코드 변경 실행
                    </button>
                  </form>
                </div>

                <form className="add-panel compact" onSubmit={addNewRoom}>
                  <div>
                    <h3>신규 보유실 추가</h3>
                    <p>추가된 보유실은 비품약 관리 탭과 마스터에 함께 생성됩니다.</p>
                  </div>
                  <label>
                    보유실명
                    <input value={newRoomName} onChange={(event) => setNewRoomName(event.target.value)} />
                  </label>
                  <button className="secondary-button" type="submit">
                    <Plus size={16} />
                    보유실 추가
                  </button>
                </form>
              </div>
            </section>
            )}

            <section className="card">
              <div className="card-head">
                <div>
                  <h2>전체 비품약 마스터 보유 현황</h2>
                  <p>
                    총 {masterRows.length}종 · 전체 보유수량{" "}
                    {masterRows.reduce((sum, row) => sum + row.totalQuantity, 0).toLocaleString("ko-KR")}개
                  </p>
                </div>
                <SearchBox value={masterQuery} onChange={setMasterQuery} placeholder="마스터 약품/보유실 검색" />
              </div>
              <div className={`master-grid ${showMasterQuickView ? "" : "single-column"}`}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>코드</th>
                        <th>약품명</th>
                        <th>보유실별 갯수</th>
                        <th>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMasterRows.map((row) => (
                        <tr key={row.code}>
                          <td className="code">{row.code}</td>
                          <td>
                            <strong>{drugTitle(row)}</strong>
                            <span>{row.storage}</span>
                          </td>
                          <td>
                            <div className="room-detail-list">
                              {row.roomDetails.length === 0 ? (
                                <span className="empty">보유실 배정 없음</span>
                              ) : (
                                row.roomDetails.map((detail) =>
                                  isMasterViewer ? (
                                    <span className="room-detail-pill" key={`${row.code}-${detail.roomId}`}>
                                      {detail.roomId} {detail.requiredQty}
                                    </span>
                                  ) : (
                                    <button
                                      key={`${row.code}-${detail.roomId}`}
                                      onClick={() => goToStockRoom(detail.roomId)}
                                    >
                                      {detail.roomId} {detail.requiredQty}
                                    </button>
                                  ),
                                )
                              )}
                            </div>
                          </td>
                          <td className="qty-total">{row.totalQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {showMasterQuickView && (
                  <aside className="master-side">
                    <h3>빠른 확인</h3>
                    {selectedMasterRow ? (
                      <>
                        <strong>{drugTitle(selectedMasterRow)}</strong>
                        <p>{selectedMasterRow.code}</p>
                        <div className="big-total">{selectedMasterRow.totalQuantity}</div>
                        <span>전체 보유 합계</span>
                        <div className="detail-scroll">
                          {selectedMasterRow.roomDetails.map((detail) => (
                            <div key={detail.roomId}>
                              <span>{detail.roomId}</span>
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
                sections={stockGuideSections}
                activeRoom={activeRoom}
                uninspectedIds={uninspectedRoomIds}
                onSelect={openGuideEntry}
                onToggleUninspected={(item) => toggleUninspectedRoom(getStockGuideInspectionKey(item))}
              />
            )}

            {mainCategory === "stock" ? (
              <TabStrip
                items={currentStockRooms}
                activeId={activeRoom}
                getId={(room) => room.id}
                getLabel={(room) => `${room.label} (${room.allocationCount})`}
                getClassName={(room) => (uninspectedRoomIds.includes(room.id) ? "uninspected" : "")}
                onSelect={(room) => setActiveRoom(room.id)}
                onDoubleClick={(room) => toggleUninspectedRoom(room.id)}
                tone="stock"
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
                      {department.label}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="section-toolbar">
              <div>
                <h2>
                  {mainCategory === "stock"
                    ? `${activeRoomInfo?.label ?? activeRoom} 비품약 현황판`
                    : `${activeEcartTarget.label} E-cart 현황판`}
                </h2>
                <p>
                  {mainCategory === "stock"
                    ? `원본 시트 ${activeRoomInfo?.sourceSheet ?? activeRoom} · 현재 ${currentStockItems.length}개 표시`
                    : `점검 부서 ${activeEcartTarget.label} · 현재 ${currentEcartItems.length}개 표시`}
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
                    ? "병동 순회 점검표 미리보기"
                    : printPreviewMode === "all-stock"
                      ? "전체 실 일괄 출력 미리보기"
                      : "보고서 미리보기"}
                </strong>
                <span>
                  {printPreviewMode === "round-summary"
                    ? activeRoundSummaryDraft.inspectionPeriod
                    : printPreviewMode === "all-stock"
                    ? `${currentStockRooms.length.toLocaleString("ko-KR")}개 보유실`
                    : mainCategory === "stock"
                      ? activeRoomInfo?.label ?? activeRoom
                      : activeEcartTarget.label}
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
  onSelect,
  onToggleUninspected,
}: {
  sections: StockGuideSection[];
  activeRoom: string;
  uninspectedIds?: string[];
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
                        uninspectedIds.includes(getStockGuideInspectionKey(item)) ? "uninspected" : "",
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
  onCheck,
  onExpiry,
  onCount,
  onDelete,
}: {
  refrigerated: EditableStockItem[];
  roomTemperature: EditableStockItem[];
  onCheck: (roomId: string, drugCode: string) => void;
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
              onCheck={onCheck}
              onExpiry={onExpiry}
              onCount={onCount}
              onDelete={onDelete}
            />
          )}
          <GroupRows
            label="실온 보관 및 기타 약품"
            tone="room"
            items={roomTemperature}
            onCheck={onCheck}
            onExpiry={onExpiry}
            onCount={onCount}
            onDelete={onDelete}
          />
        </tbody>
      </table>
    </div>
  );
}

function countInput(item: EditableStockItem, onCount: (roomId: string, drugCode: string, value: string) => void) {
  if (item.roomId === "HBEF심혈관조영실" && item.requiredQty > 0 && item.requiredQty % 2 === 0) {
    const half = item.requiredQty / 2;
    return (
      <div className="split-count-inputs">
        <input
          className="count-input"
          type="number"
          min={0}
          value={half}
          onChange={(event) => onCount(item.roomId, item.drugCode, String((Number.parseInt(event.target.value, 10) || 0) + half))}
        />
        <input
          className="count-input"
          type="number"
          min={0}
          value={half}
          onChange={(event) => onCount(item.roomId, item.drugCode, String(half + (Number.parseInt(event.target.value, 10) || 0)))}
        />
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
  onCheck,
  onExpiry,
  onCount,
  onDelete,
}: {
  label: string;
  tone: "cold" | "room";
  items: EditableStockItem[];
  onCheck: (roomId: string, drugCode: string) => void;
  onExpiry: (roomId: string, drugCode: string, value: string) => void;
  onCount: (roomId: string, drugCode: string, value: string) => void;
  onDelete: (roomId: string, drugCode: string) => void;
}) {
  return (
    <>
      <tr className={`group-row ${tone}`}>
        <td colSpan={7}>{label}</td>
      </tr>
      {items.length === 0 ? (
        <tr>
          <td colSpan={7} className="empty-row">
            약품이 없습니다.
          </td>
        </tr>
      ) : (
        items.map((item) => (
          <tr key={`${item.roomId}-${item.drugCode}`}>
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
            <td>{countInput(item, onCount)}</td>
            <td>{warningBadge(item.drug.warning)}</td>
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
              <th>불량</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, index) => {
              const showSection = index === 0 || visibleItems[index - 1].section !== item.section;
              return (
                <Fragment key={item.id}>
                  <tr>
                    <td>{showSection ? `[${item.section}]` : ""}</td>
                    <td>{item.text}</td>
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
