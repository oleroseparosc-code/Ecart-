import rawInventory from "./data/inventory.generated.json";
import { getPolicyCautionLabels, isHighRiskDrug, type DrugRuleFields } from "./drugRules";
import { drugDisplayName, type MasterRow, type MasterRowKindFilter } from "./inventoryState";
import type { NarcoticCategory } from "./narcoticData";
import { makeNarcoticLabelId, type NarcoticLabelRow } from "./narcoticLabels";
import type { RoundSummaryDraft } from "./roundSummary";
import { storageDisplayLabel } from "./storageDisplay";
import type { ChecklistItem, EcartItem, InventoryData, StockDrug, StockRoom } from "./types";

const inventory = rawInventory as InventoryData;

export type MainCategory = "stock" | "ecart" | "narcotic";
export type EcartTab = "general" | "nicu";
export type CheckStatus = "" | "good" | "bad";
export type PrintPreviewMode = "single" | "all-stock" | "all-ecart" | "all-narcotic" | "round-summary" | "drug-labels";
export type AppMode = "admin" | "master-viewer" | "pharmacy-viewer" | "pharmacy-editor" | "pharmacy-locator" | "narcotic-viewer";
export type DrugLabelMode = "stock" | "ecart" | "ecart-nicu" | "fluid" | "narcotic" | "pharmacy";
export type DrugLabelSizeKey = "10x70" | "15x95" | "40x70" | "55x95" | "35x100";

export type DrugLabelData = {
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

export type DrugLabelPrintSelectionData = {
  labelRow?: DrugLabelData;
  roomId?: string;
  quantityOverride?: number;
};

export type LabelModeOption = {
  mode: DrugLabelMode;
  label: string;
};

export type FluidLabelSource = {
  code: string;
  name: string;
};

export type EditableEcartItem = EcartItem & {
  checked: boolean;
  expiryDate: string;
};

export const EMPTY_NARCOTIC_STOCK_CODE = "__NO_NARCOTIC_STOCK__";
export const EMPTY_NARCOTIC_STOCK_LABEL = "보유약 없음";

export type ChecklistState = ChecklistItem & {
  id: string;
  status: CheckStatus;
  note: string;
};

export type EcartTarget = {
  id: string;
  label: string;
};

export type EcartInspectionState = {
  items: EditableEcartItem[];
  checklist: ChecklistState[];
};

export type PersistedAppState = {
  stockDrugs: StockDrug[];
  stockRooms: StockRoom[];
  stockAllocations: InventoryData["stock"]["allocations"];
  checkedStock: Record<string, boolean>;
  stockExpiry: Record<string, string>;
  stockChecklistByRoom: Record<string, ChecklistState[]>;
  ecartByTarget: Record<string, EcartInspectionState>;
  roundSummaryDraft: RoundSummaryDraft | null;
  stockRoomUpdatedAt: Record<string, string>;
  uninspectedRoomIds: string[];
};

export type InspectionCycleResetState = Pick<
  PersistedAppState,
  "checkedStock" | "stockExpiry" | "stockChecklistByRoom" | "ecartByTarget" | "roundSummaryDraft" | "uninspectedRoomIds"
>;

const STANDARD_ROOM_NAMES = [
  { display: "ER", aliases: ["ER", "응급실", "응급실(ER)"] },
  {
    display: "DREMM",
    aliases: ["DREMM", "DREMM혈관조영실", "DREMM 혈관조영실", "DREMM영상의학과", "DREMM 영상의학과", "혈관조영실", "영상의학과"],
  },
  {
    display: "HPC",
    aliases: ["HPC", "HPC건강증진센터", "HPC 건강증진 센터", "건강증진센터", "건강증진 센터", "동서의학건진센터", "동서의학건진 센터"],
  },
  { display: "DRL", aliases: ["DRL", "DRL분만장", "DRL 분만장", "분만장"] },
  {
    display: "GICLA",
    aliases: [
      "GICLA",
      "GICLA소화기병검사실",
      "GICLA 소화기병 검사실",
      "GICLA소화기검사실",
      "GICLA 소화기 검사실",
      "소화기병검사실",
      "소화기병 검사실",
      "소화기검사실",
      "소화기 검사실",
    ],
  },
  { display: "HBEF", aliases: ["HBEF", "HBEF심혈관조영실", "HBEF 심혈관조영실", "심혈관조영실", "심장혈관검사실"] },
  { display: "INJ", aliases: ["INJ", "INJ외래주사실", "INJ 외래 주사실", "외래주사실", "외래 주사실"] },
  { display: "PED", aliases: ["PED", "PED소아청소년과", "PED 소아청소년과", "소아청소년과"] },
];

function normalizeRoomLookupValue(value: string) {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "");
  const wardMatch = compact.match(/^(\d+)(?:병동|ward)$/);
  if (wardMatch) return `${wardMatch[1]}w`;
  return compact;
}

const standardRoomByAlias = new Map(
  STANDARD_ROOM_NAMES.flatMap((room) => room.aliases.map((alias) => [normalizeRoomLookupValue(alias), room] as const)),
);

export function displayRoomName(value: string) {
  return standardRoomByAlias.get(normalizeRoomLookupValue(value))?.display ?? value;
}

function roomAliasTokens(value: string) {
  const normalized = normalizeRoomLookupValue(value);
  const room = standardRoomByAlias.get(normalized);
  return room ? [room.display, ...room.aliases].map(normalizeRoomLookupValue) : [];
}

function roomLookupTokensFromValue(value: string) {
  const normalized = normalizeRoomLookupValue(value);
  const tokens = new Set<string>();
  if (!normalized) return tokens;
  tokens.add(normalized);
  roomAliasTokens(value).forEach((token) => tokens.add(token));
  const wardNumber = normalized.match(/^(\d+)w$/)?.[1];
  if (wardNumber) {
    tokens.add(wardNumber);
    tokens.add(`${wardNumber}병동`);
  }
  const narcoticWardNumber = normalized.match(/^(\d+)$/)?.[1];
  if (narcoticWardNumber) {
    tokens.add(`${narcoticWardNumber}w`);
    tokens.add(`${narcoticWardNumber}병동`);
  }
  return tokens;
}

function roomIdsMatch(left: string, right: string) {
  const leftTokens = roomLookupTokensFromValue(left);
  const rightTokens = roomLookupTokensFromValue(right);
  return [...leftTokens].some((token) => rightTokens.has(token));
}

export type StockGuideEntry = {
  label: string;
  stockRoomId?: string;
  ecartTargetId?: string;
  ecartTab?: EcartTab;
  ecartOnly?: boolean;
};

export type StockGuideSection = {
  floor: string;
  rows: StockGuideEntry[][];
};

export type DrugLabelSizeOption = {
  key: DrugLabelSizeKey;
  label: string;
  widthMm: number;
  heightMm: number;
};

export type DrugLabelSizeGroup = {
  id: "stock-ecart" | "fluid" | "narcotic";
  sizeKeys: DrugLabelSizeKey[];
  outputLabel: string;
};

export const DRUG_LABEL_SIZES: DrugLabelSizeOption[] = [
  { key: "10x70", label: "10*70mm", widthMm: 70, heightMm: 10 },
  { key: "15x95", label: "15*95mm", widthMm: 95, heightMm: 15 },
  { key: "40x70", label: "40*70mm", widthMm: 70, heightMm: 40 },
  { key: "55x95", label: "55*95mm", widthMm: 95, heightMm: 55 },
  { key: "35x100", label: "35*100mm", widthMm: 100, heightMm: 35 },
];

export const DRUG_LABEL_SIZE_GROUPS: DrugLabelSizeGroup[] = [
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
];

const BASE_LABEL_MODE_OPTIONS: LabelModeOption[] = [
  { mode: "stock", label: "일반 약품 라벨" },
  { mode: "ecart", label: "E-cart 약품 라벨" },
  { mode: "ecart-nicu", label: "E-cart 라벨(NICU)" },
  { mode: "fluid", label: "일반 수액 라벨" },
  { mode: "narcotic", label: "마약/향정 라벨" },
];

export function getLabelModeOptions(appMode: AppMode): LabelModeOption[] {
  if (appMode === "master-viewer") return BASE_LABEL_MODE_OPTIONS;
  return [...BASE_LABEL_MODE_OPTIONS, { mode: "pharmacy", label: "약제팀 라벨" }];
}

export function canEditMasterAssignments(appMode: AppMode) {
  return appMode === "admin" || appMode === "pharmacy-viewer" || appMode === "narcotic-viewer";
}

export function shouldOpenPharmacyWorkspaceInitially(appMode: AppMode) {
  return appMode === "pharmacy-editor";
}

export function getEcartLabelItemsForMode(mode: DrugLabelMode, ecart: InventoryData["ecart"]) {
  if (mode === "ecart-nicu") return ecart.nicuItems;
  if (mode === "ecart") return ecart.generalItems;
  return [];
}

export function getInitialMasterKindFilter(appMode: AppMode): MasterRowKindFilter {
  if (appMode === "narcotic-viewer") return { stock: false, psychotropic: true, narcotic: true };
  return { stock: true, psychotropic: true, narcotic: true };
}

export function isMasterKindFilterDisabled(appMode: AppMode, kind: keyof MasterRowKindFilter) {
  return appMode === "narcotic-viewer" && kind === "stock";
}

export function makeLabelPrintSelectionKey(id: string, mode: DrugLabelMode, sizeKey: DrugLabelSizeKey, roomId?: string) {
  return roomId ? `${mode}::${sizeKey}::${roomId}::${id}` : `${mode}::${sizeKey}::${id}`;
}

export function getDrugLabelSize(sizeKey: DrugLabelSizeKey) {
  return DRUG_LABEL_SIZES.find((size) => size.key === sizeKey) ?? DRUG_LABEL_SIZES[3];
}

export const GENERAL_FLUID_LABELS: FluidLabelSource[] = [
  { code: "XNAK40", name: "0.9% NaKCl 40mEq/L bag" },
  { code: "XD10W", name: "10% DW 1L bag" },
  { code: "XD10W5", name: "10% DW 500ml bag" },
  { code: "XD15W", name: "15% DW 1L bag" },
  { code: "XD20W1L", name: "20% DW 1L bag" },
  { code: "XGD20W3", name: "20% DW 300ml btl" },
  { code: "XD5S", name: "5% DS 1L bag" },
  { code: "XD5S5", name: "5% DS 500ml bag" },
  { code: "XD5W100", name: "5% DW 100ml bag" },
  { code: "XD5W", name: "5% DW 1L bag" },
  { code: "XD5W2Y", name: "5% DW 200ml BAG" },
  { code: "XD5W5", name: "5% DW 500ml bag" },
  { code: "XD5W50", name: "5% DW 50ml btl" },
  { code: "XDNK25", name: "5% DW NKa2 500ml bag" },
  { code: "XDNK1", name: "5% DW NaK1 1L bag" },
  { code: "XDNK2", name: "5% DW NaK2 1L bag" },
  { code: "XDNK35", name: "5% DW NaK3 500ml bag" },
  { code: "XD50W1", name: "50% DW 100ml bag" },
  { code: "XHS", name: "Hartmann 1L bag" },
  { code: "XHS5", name: "Hartmann 500ml bag" },
  { code: "XHD", name: "Hartmann-Dex 1L" },
  { code: "XNST00", name: "NS 100ml bag" },
  { code: "XGNS150", name: "NS 150ml btl" },
  { code: "XNS1L", name: "NS 1L bag" },
  { code: "XNS250", name: "NS 250ml bag" },
  { code: "XNS500", name: "NS 500ml bag" },
  { code: "XNS50", name: "NS 50ml bag" },
  { code: "XPLASMA5", name: "Plasma soln A 500ml bag" },
  { code: "XPLASMA", name: "Plasma solution A 1L bag" },
  { code: "XHNS", name: "Saline 0.45% 1L bag" },
  { code: "XAQD", name: "Water for injection 1L bag" },
];

const FLUID_LABEL_TONE_BY_CODE = new Map<string, string>([
  ["XNAK40", "orange"],
  ["XD10W", "black"],
  ["XD10W5", "black"],
  ["XD15W", "black"],
  ["XD20W1L", "black"],
  ["XGD20W3", "black"],
  ["XD5S", "pink"],
  ["XD5S5", "pink"],
  ["XD5W100", "black"],
  ["XD5W", "black"],
  ["XD5W2Y", "black"],
  ["XD5W5", "black"],
  ["XD5W50", "orange"],
  ["XDNK25", "red"],
  ["XDNK1", "purple"],
  ["XDNK2", "red"],
  ["XDNK35", "black"],
  ["XD50W1", "black"],
  ["XHS", "orange"],
  ["XHS5", "orange"],
  ["XHD", "yellow"],
  ["XNST00", "black"],
  ["XGNS150", "blue"],
  ["XNS1L", "blue"],
  ["XNS250", "pink"],
  ["XNS500", "blue"],
  ["XNS50", "green"],
  ["XPLASMA5", "green"],
  ["XPLASMA", "green"],
  ["XHNS", "green"],
  ["XAQD", "green"],
]);

export const CLAIM_FLUID_SECTION = "청구약/ 수액";
const stockChecklistSections = ["비품약", "냉장약", CLAIM_FLUID_SECTION];
const ecartChecklistSections = ["E-cart"];
export const ecartTargets = buildEcartTargets(inventory.ecart.departments);
export const firstEcartTargetId = ecartTargets[0]?.id ?? "ecart-general";
export const nicuTarget: EcartTarget = { id: "nicu", label: "NICU 신생아중환자실" };

export function getAllEcartPrintTargets(targets: EcartTarget[]) {
  return [
    ...targets.map((target) => ({ tab: "general" as const, target, key: makeEcartKey("general", target.id) })),
    { tab: "nicu" as const, target: nicuTarget, key: makeEcartKey("nicu", nicuTarget.id) },
  ];
}

export const stockGuideSections: StockGuideSection[] = [
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
        { label: "INJ", stockRoomId: "외래주사실", ecartTargetId: "외래주사실" },
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
        { label: "HBEF", stockRoomId: "HBEF심혈관조영실", ecartTargetId: "심장혈관검사실" },
        { label: "운동부하검사실", ecartTargetId: "운동부하검사실", ecartOnly: true },
        { label: "GICLA", stockRoomId: "소화기병검사실", ecartTargetId: "소화기병검사실" },
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
        { label: "HPC", ecartTargetId: "건강증진센터", ecartOnly: true },
        { label: "ADR", stockRoomId: "ADR", ecartTargetId: "ADR" },
      ],
      [
        { label: "난임클리닉", stockRoomId: "난임클리닉" },
        { label: "DRL", stockRoomId: "DRL", ecartTargetId: "DRL" },
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

export const stockRoomEcartLinks = new Map(
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

export function getStockRoomEcartLink(roomId: string) {
  return stockRoomEcartLinks.get(roomId);
}

export const ROUND_SUMMARY_COMMON_GUIDANCE = [
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

export function makeEcartKey(tab: EcartTab, targetId: string) {
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
  return normalizeChecklistRows(makeStockChecklist(roomId));
}

export function getEcartDefaultState(
  prev: Record<string, EcartInspectionState>,
  tab: EcartTab,
  key: string
): EcartInspectionState {
  const current = prev[key];
  if (current) return normalizeEcartInspectionState(current);

  const base = makeEcartInspectionState(tab, key);
  return normalizeEcartInspectionState(base);
}

function buildEcartTargets(departments: string[]): EcartTarget[] {
  const targets: EcartTarget[] = [];
  const seen = new Set<string>();

  function add(label: string, id = label.replace(/\s+/g, "-")) {
    const normalizedLabel = displayRoomName(label.trim());
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

const GENERATED_ECART_ITEMS = [...inventory.ecart.generalItems, ...inventory.ecart.nicuItems];
const GENERATED_ECART_ITEMS_BY_ID = new Map(GENERATED_ECART_ITEMS.map((item) => [item.id, item]));
const GENERATED_ECART_ITEMS_BY_CODE = new Map(GENERATED_ECART_ITEMS.filter((item) => item.code).map((item) => [item.code, item]));

export function normalizeEcartItem(item: EcartItem): EcartItem {
  const generated = GENERATED_ECART_ITEMS_BY_ID.get(item.id) ?? (item.code ? GENERATED_ECART_ITEMS_BY_CODE.get(item.code) : undefined);
  const normalized = generated
    ? {
        ...item,
        code: generated.code,
        name: generated.name,
        dosage: generated.dosage,
      }
    : item;

  if (normalized.id.startsWith("NICU-")) return normalized;
  return { ...normalized, ...ECART_GENERAL_CORRECTIONS.get(normalized.code) };
}

export function normalizeEcartInspectionState(state: EcartInspectionState): EcartInspectionState {
  return {
    ...state,
    items: state.items.map((item) => ({ ...item, ...normalizeEcartItem(item) })),
    checklist: normalizeChecklistRows(state.checklist),
  };
}

export function fluidLabelTone(drug: Pick<StockDrug, "genericName" | "productName" | "spec"> & { code?: string }) {
  const codeTone = drug.code ? FLUID_LABEL_TONE_BY_CODE.get(drug.code.toUpperCase()) : undefined;
  if (codeTone) return codeTone;

  const text = [drug.genericName, drug.productName, drug.spec].join(" ").toLowerCase();
  const compact = text.replace(/[\s._-]+/g, "");
  if (/water|aqd|distilled|증류수|주사용수/.test(text)) return "green";
  if (/plasma/.test(text)) return "green";
  if (/hartmann.?dex|하트만덱스|h\/d/.test(text) || compact.includes("xhd")) return "yellow";
  if (/hartmann|하트만/.test(text) || compact.includes("xhs")) return "orange";
  if (/mannitol|만니톨/.test(text)) return /20%|20ml/.test(compact) ? "red" : "yellow";
  if (/dnk2|nka2|nak2/.test(compact)) return "red";
  if (/dnk1|nak1/.test(compact)) return "purple";
  if (/dnk3|nak3/.test(compact)) return "black";
  if (/nakcl|xnak/.test(compact)) return "orange";
  if (/\bds\b/.test(text) || compact.includes("xd5s") || /g\/s|가생리/.test(text)) return "pink";
  if (/\bns\b|n\/s|normal saline|saline|생리식염|멸균생리/.test(text) || compact.includes("xns")) {
    if (/50ml|50cc/.test(compact)) return "green";
    if (/100ml|100cc/.test(compact)) return "black";
    if (/250ml|250cc/.test(compact)) return "pink";
    return "blue";
  }
  if (/\bdw\b|d\/w|dextrose|glucose|포도당/.test(text) || compact.includes("xd")) {
    if (/50ml|50cc/.test(compact)) return "orange";
    if (/10%|15%/.test(compact)) return "gray";
    return "black";
  }
  if (/0\.45|half|하프|염화나트륨/.test(text)) return "green";
  return undefined;
}

export function labelStorageTone(label: string): DrugLabelData["storageTone"] {
  if (label === "냉장" || label === "냉동") return "cold";
  if (label === "차광") return "light";
  if (label === "E-cart") return "ecart";
  return "room";
}

export function formatStockLabelSpec(spec: string) {
  const value = spec.trim();
  if (!value || /\bbox\b/i.test(value)) return "";
  return value;
}

function roomLookupTokens(room: StockRoom) {
  const values = [room.id, room.label, room.sourceColumn, room.sourceSheet].filter(Boolean);
  const tokens = new Set<string>();
  for (const value of values) {
    roomLookupTokensFromValue(value).forEach((token) => tokens.add(token));
  }
  return tokens;
}

export function resolveMasterLabelRoomId(query: string, rooms: StockRoom[]) {
  return resolveMasterLabelRoomIds(query, rooms)[0];
}

export function resolveMasterLabelRoomIds(query: string, rooms: StockRoom[]) {
  const normalized = normalizeRoomLookupValue(query);
  if (!normalized) return [];
  const queryTokens = roomLookupTokensFromValue(query);

  return [
    ...new Set(
      rooms
        .filter((room) => [...roomLookupTokens(room)].some((roomToken) => [...queryTokens].some((queryToken) => roomToken.includes(queryToken))))
        .map((room) => room.id),
    ),
  ];
}

function getMasterRoomQuantity(row: MasterRow, roomId?: string) {
  if (!roomId) return undefined;
  return row.roomDetails.find((detail) => roomIdsMatch(detail.roomId, roomId))?.requiredQty;
}

export function matchesMasterRoom(row: MasterRow, roomId?: string) {
  if (!roomId) return false;
  return row.roomDetails.some((detail) => roomIdsMatch(detail.roomId, roomId));
}

export function getDrugLabelNameClass(name: string, kind: DrugLabelMode = "stock", sizeKey?: DrugLabelSizeKey) {
  const normalized = name.replace(/\s+/g, " ").trim();
  const meaningfulLength = normalized.replace(/[()\s/%.-]/g, "").length;
  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;

  if (kind === "fluid") {
    if (sizeKey === "10x70") {
      if (meaningfulLength >= 13) return "name-extra-long";
      if (meaningfulLength >= 10 || tokenCount >= 3) return "name-long";
      return "";
    }

    if (sizeKey === "15x95" || sizeKey === "55x95" || sizeKey === "35x100") {
      if (meaningfulLength >= 24 || tokenCount >= 5) return "name-extra-long";
      if (meaningfulLength >= 13 || tokenCount >= 3) return "name-long";
      return "";
    }
  }

  if (sizeKey === "10x70") {
    if (meaningfulLength >= 22 || tokenCount >= 5) return "name-extra-long";
    if (meaningfulLength >= 13 || tokenCount >= 3) return "name-long";
    return "";
  }

  if (kind === "ecart" || kind === "ecart-nicu") {
    if (meaningfulLength >= 24 || tokenCount >= 4) return "name-extra-long";
    if (meaningfulLength >= 16 || tokenCount >= 3) return "name-long";
    return "";
  }

  if (meaningfulLength >= 34 || tokenCount >= 6) return "name-extra-long";
  if (meaningfulLength >= 20 || tokenCount >= 4) return "name-long";
  return "";
}

export function formatFluidLabelName(name: string) {
  return name.replace(/\s*(?:bag|btl)\b\.?/gi, "").replace(/\s{2,}/g, " ").trim();
}

const GENERAL_DRUG_LABEL_DOSE_NUMBER = String.raw`(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const GENERAL_DRUG_LABEL_DOSE_UNIT = String.raw`(?:mcg|mg|g|kg|ml|l|iu|u|unit|units|meq|mmol|hr|h|%)`;
const GENERAL_DRUG_LABEL_DOSE_PATTERN = new RegExp(
  String.raw`(?:\(?${GENERAL_DRUG_LABEL_DOSE_NUMBER}\s*${GENERAL_DRUG_LABEL_DOSE_UNIT}\)?\s*\/\s*)*${GENERAL_DRUG_LABEL_DOSE_NUMBER}\s*${GENERAL_DRUG_LABEL_DOSE_UNIT}(?:\s*\/\s*${GENERAL_DRUG_LABEL_DOSE_NUMBER}?\s*${GENERAL_DRUG_LABEL_DOSE_UNIT})?`,
  "gi",
);

function splitGeneralDrugLabelSegment(segment: string, maxLength: number) {
  const tokens = segment.replace(/\s{2,}/g, " ").trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return segment ? [segment] : [];

  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (current && next.length > maxLength) {
      lines.push(current);
      current = token;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const GENERAL_DRUG_LABEL_DOSE_TOKEN_PATTERN = new RegExp(
  String.raw`${GENERAL_DRUG_LABEL_DOSE_NUMBER}\s*${GENERAL_DRUG_LABEL_DOSE_UNIT}`,
  "gi",
);

function splitGeneralDrugLabelDoseSegment(segment: string, maxLength: number) {
  const normalized = segment.replace(/\s{2,}/g, " ").trim();
  const matches = [...normalized.matchAll(GENERAL_DRUG_LABEL_DOSE_TOKEN_PATTERN)];
  if (matches.length < 2) return splitGeneralDrugLabelSegment(normalized, maxLength);

  const lines: string[] = [];
  let currentStart = 0;
  for (let index = 1; index < matches.length; index += 1) {
    const previous = matches[index - 1];
    const current = matches[index];
    const previousEnd = (previous.index ?? 0) + previous[0].length;
    const separator = normalized.slice(previousEnd, current.index ?? previousEnd);
    if (/\s/.test(separator) && !separator.includes("/")) {
      const unit = normalized.slice(currentStart, current.index).trim();
      if (unit) lines.push(unit);
      currentStart = current.index ?? currentStart;
    }
  }

  const lastUnit = normalized.slice(currentStart).trim();
  if (lastUnit) lines.push(lastUnit);
  return lines.flatMap((line) => splitGeneralDrugLabelSegment(line, maxLength));
}

export function getGeneralDrugLabelNameLines(name: string, sizeKey: DrugLabelSizeKey) {
  const cleaned = name.replace(/\s{2,}/g, " ").trim();
  if (!cleaned) return [];

  const nameMaxLength = sizeKey === "10x70" ? 20 : sizeKey === "15x95" ? 22 : sizeKey === "35x100" ? 22 : 20;
  const doseMaxLength = sizeKey === "10x70" ? 20 : sizeKey === "15x95" ? 24 : nameMaxLength;
  const doseMatches = [...cleaned.matchAll(GENERAL_DRUG_LABEL_DOSE_PATTERN)];
  const doseMatch = doseMatches.find((match) => (match.index ?? 0) > 0);
  if (!doseMatch?.index) return splitGeneralDrugLabelSegment(cleaned, nameMaxLength);

  const namePart = cleaned.slice(0, doseMatch.index).trim();
  const dosePart = cleaned.slice(doseMatch.index).trim();
  const parenthetical = namePart.match(/^(.+?)\s*(\([^()]+\))$/);
  const nameLines = parenthetical
    ? [...splitGeneralDrugLabelSegment(parenthetical[1], nameMaxLength), parenthetical[2]]
    : splitGeneralDrugLabelSegment(namePart, nameMaxLength);

  const doseLines = sizeKey === "55x95"
    ? splitGeneralDrugLabelDoseSegment(dosePart, doseMaxLength)
    : splitGeneralDrugLabelSegment(dosePart, doseMaxLength);
  return [...nameLines, ...doseLines].filter(Boolean);
}

export function stripControlledDrugLabelPrefix(name: string) {
  return name.replace(/^\s*\[(?:\ub9c8\uc57d|\ud5a5\uc815)\]\s*/u, "").replace(/\s{2,}/g, " ").trim();
}

const NARCOTIC_FORTY_DOSE_PATTERN =
  /\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*\s*(?:mcg|mg|g|iu|u|%)(?:\s*\/\s*\d*(?:\.\d+)?\s*(?:mcg|mg|g|ml|l|iu|u|%|hr|h))?\b/i;
const NARCOTIC_FORTY_FORM_PATTERN = /\b(?:sublingual|tab|cap|patch|supp|spray|soln|solution)\b/i;
const NARCOTIC_FORTY_KEEP_DOSE_WITH_NAME_PATTERN = /^\s*sublingual\b/i;
const NARCOTIC_FORTY_RELEASE_MARKER_PATTERN = /^(.+\S)\s+(IR|PR|CR|SR|ER|XR|MR)$/i;
const NARCOTIC_DOSE_CAUTION_FORM_PATTERN = /\b(?:inj|tab|cap|patch|supp|spray|soln|solution|vial|amp)\b/i;

function formatNarcoticFortyDoseToken(token: string) {
  return token.replace(/\s+/g, "").replace(/\/(ml|l)\b/i, "/1$1");
}

function stripNarcoticFortyInjectionSuffix(suffix: string) {
  return suffix.replace(/^\s*inj\b(?:\s*\([^)]*\))?\.?\s*$/i, "").trim();
}

function splitNarcoticFortyNamePart(namePart: string) {
  const normalized = namePart.replace(/\s{2,}/g, " ").trim();
  const parenthetical = normalized.match(/^(.+?)\s*(\([^()]+\))$/);
  if (parenthetical) {
    return [parenthetical[1].trim(), parenthetical[2].trim()].filter(Boolean);
  }

  const releaseMarker = normalized.match(NARCOTIC_FORTY_RELEASE_MARKER_PATTERN);
  if (releaseMarker && releaseMarker[1].replace(/\s+/g, "").length >= 8) {
    return [releaseMarker[1].trim(), releaseMarker[2].trim()];
  }

  return [normalized];
}

export function getDoseHighlightTextParts(text: string) {
  const parts: { text: string; highlighted: boolean }[] = [];
  const pattern = /\d+(?:\.\d+)?/g;
  let lastIndex = 0;
  function pushPart(partText: string, highlighted: boolean) {
    if (!partText) return;
    const previous = parts[parts.length - 1];
    if (previous && previous.highlighted === highlighted) {
      previous.text += partText;
      return;
    }
    parts.push({ text: partText, highlighted });
  }

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      pushPart(text.slice(lastIndex, index), false);
    }
    const precededBySlash = text.slice(0, index).endsWith("/");
    const followingText = text.slice(index + match[0].length);
    const isSecondStrength = precededBySlash && /^\s*(?:mcg|mg|g|iu|u|%)\b/i.test(followingText);
    const isVolumeOrRate = precededBySlash && /^\s*(?:ml|l|hr|h)\b/i.test(followingText);
    pushPart(match[0], !precededBySlash || (isSecondStrength && !isVolumeOrRate));
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    pushPart(text.slice(lastIndex), false);
  }
  return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

export function getNarcoticFortyLabelNameLines(name: string) {
  const cleaned = stripControlledDrugLabelPrefix(name).replace(/\s{2,}/g, " ").trim();
  const doseMatch = cleaned.match(NARCOTIC_FORTY_DOSE_PATTERN);
  if (doseMatch?.index == null || doseMatch.index <= 0) return [cleaned];

  const doseStart = doseMatch.index;
  const doseEnd = doseStart + doseMatch[0].length;
  const namePart = cleaned.slice(0, doseStart).trim();
  const doseToken = formatNarcoticFortyDoseToken(cleaned.slice(doseStart, doseEnd).trim());
  const suffix = stripNarcoticFortyInjectionSuffix(cleaned.slice(doseEnd).trim());
  if (!namePart || !doseToken) return [cleaned];

  if (
    suffix &&
    NARCOTIC_FORTY_KEEP_DOSE_WITH_NAME_PATTERN.test(suffix) &&
    NARCOTIC_FORTY_FORM_PATTERN.test(suffix) &&
    namePart.length <= 14 &&
    !namePart.includes(" ")
  ) {
    return [`${namePart} ${doseToken}`, suffix];
  }

  return [...splitNarcoticFortyNamePart(namePart), [doseToken, suffix].filter(Boolean).join(" ")];
}

function narcoticDoseCautionKey(name: string) {
  const cleaned = stripControlledDrugLabelPrefix(name)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:citrate|hydrochloride|hcl|sulfate|phosphate)\b/gi, " ");
  const doseMatch = cleaned.match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?\s*(?:mcg|mg|g|ml|iu|unit|meq|%)/i);
  if (!doseMatch) return "";
  const doseIndex = doseMatch.index ?? 0;
  const baseName = cleaned
    .slice(0, doseIndex)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const form = cleaned.slice(doseIndex + doseMatch[0].length).match(NARCOTIC_DOSE_CAUTION_FORM_PATTERN)?.[0].toLowerCase() ?? "";
  return [baseName, form].filter(Boolean).join(":");
}

export function getNarcoticDoseCautionCodes(rows: readonly Pick<MasterRow, "code" | "genericName" | "productName">[]) {
  const groups = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = narcoticDoseCautionKey(drugDisplayName(row));
    if (!key) continue;
    const codes = groups.get(key) ?? new Set<string>();
    codes.add(row.code);
    groups.set(key, codes);
  }

  return new Set(
    [...groups.values()]
      .filter((codes) => codes.size > 1)
      .flatMap((codes) => [...codes]),
  );
}

export function cleanDrugLabelName(name: string, highRisk: boolean) {
  if (!highRisk) return name.replace(/\s{2,}/g, " ").trim();
  return name
    .replace(/고위험\s*의약품/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const FORCE_COLD_LABEL_CODES = new Set(["XATIV2W", "XATIV4W", "XLZPAM2", "XLZPAM4", "XKETA5", "XKETA5W"]);

function labelStorage(row: MasterRow) {
  const forcedCold = FORCE_COLD_LABEL_CODES.has(row.code);
  const storageLabel = forcedCold ? "냉장" : storageDisplayLabel(row);
  const storage = row.storage || storageLabel;
  return {
    storageLabel,
    storage: forcedCold && !storage.includes("냉장") ? `${storage} / 냉장보관(2-8℃)` : storage,
  };
}

function masterKindCautionLabel(row: MasterRow) {
  if (row.masterKind === "psychotropic") return "향정";
  if (row.masterKind === "narcotic") return "마약";
  return "";
}

export function buildStockLabelData(row: MasterRow, mode: DrugLabelMode, roomId?: string): DrugLabelData {
  const { storageLabel, storage } = labelStorage(row);
  const highRisk = isHighRiskDrug(row);
  const roomQuantity = getMasterRoomQuantity(row, roomId);
  const categoryLabel = masterKindCautionLabel(row);
  return {
    id: `${mode === "pharmacy" ? "pharmacy" : "stock"}-${row.code}`,
    kind: mode === "pharmacy" ? "pharmacy" : "stock",
    code: row.code,
    name: cleanDrugLabelName(drugDisplayName(row), highRisk),
    spec: formatStockLabelSpec(row.spec || ""),
    storageLabel,
    storageTone: labelStorageTone(storageLabel),
    storage,
    roomId: roomQuantity === undefined ? undefined : roomId,
    totalQuantity: roomQuantity,
    quantityLabel: roomQuantity === undefined ? undefined : "수량",
    cautionLabels: [...getPolicyCautionLabels(row), categoryLabel].filter(Boolean),
    categoryLabel: categoryLabel || undefined,
    highRisk,
    fluidTone: mode === "fluid" ? fluidLabelTone(row) : undefined,
  };
}

export function buildNarcoticMasterLabelData(row: MasterRow, category: NarcoticCategory, roomId?: string, doseCaution = false): DrugLabelData {
  const base = buildStockLabelData(row, "narcotic", roomId);
  return {
    ...base,
    id: `narcotic-${row.code}`,
    kind: "narcotic",
    name: stripControlledDrugLabelPrefix(base.name),
    storageLabel: base.storageLabel,
    cautionLabels: [category],
    categoryLabel: category,
    highRisk: false,
    doseCaution,
  };
}

function narcoticFileStorageLabel(row: NarcoticLabelRow) {
  const text = [row.categoryText, row.cautionText, row.labelText].join(" ");
  return /냉장|2\s*[-~∼～]\s*8/.test(text) ? "냉장" : row.category;
}

export function buildNarcoticFileLabelData(row: NarcoticLabelRow): DrugLabelData {
  const storageLabel = narcoticFileStorageLabel(row);
  return {
    id: makeNarcoticLabelId(row),
    kind: "narcotic",
    code: row.code,
    name: row.labelText,
    spec: "",
    storageLabel,
    storageTone: labelStorageTone(storageLabel),
    storage: row.categoryText || row.category,
    cautionLabels: [row.category],
    categoryLabel: row.category,
    highRisk: false,
  };
}

export function normalizeLabelCautionLabels(cautionLabels: string[], highRisk: boolean) {
  const normalized = cautionLabels
    .filter(Boolean)
    .map((label) => (label.includes("고위험") ? "고위험의약품" : label))
    .filter((label) => label !== "고위험의약품");

  if (highRisk || cautionLabels.some((label) => label.includes("고위험"))) {
    normalized.push("고위험의약품");
  }

  return [...new Set(normalized)];
}

export function getDrugLabelFlagLabels(row: Pick<DrugLabelData, "cautionLabels" | "highRisk"> & Partial<Pick<DrugLabelData, "categoryLabel">>) {
  const categoryLabels = row.categoryLabel ? [row.categoryLabel] : [];
  return normalizeLabelCautionLabels([...row.cautionLabels, ...categoryLabels], row.highRisk);
}

export function resolveDrugLabelPrintRow(selection: DrugLabelPrintSelectionData, fallbackRow?: DrugLabelData) {
  const row = selection.labelRow ?? fallbackRow;
  if (!row) return undefined;
  if (selection.quantityOverride === undefined) return row;
  return {
    ...row,
    roomId: selection.roomId,
    totalQuantity: selection.quantityOverride,
    quantityLabel: "수량",
  };
}

export function matchesDrug(drug: StockDrug, query: string) {
  const value = query.trim().toLowerCase();
  if (!value) return true;
  return [drug.code, drug.genericName, drug.productName, drug.spec, drug.storage, drug.warning]
    .join(" ")
    .toLowerCase()
    .includes(value);
}

export function matchesMaster(row: MasterRow, query: string) {
  const normalizedRoomQuery = normalizeRoomLookupValue(query);
  return (
    matchesDrug(row, query) ||
    row.roomDetails.some((detail) => {
      const roomTokens = new Set([normalizeRoomLookupValue(detail.roomId), ...roomAliasTokens(detail.roomId)]);
      const narcoticWardNumber = normalizeRoomLookupValue(detail.roomId).match(/^(\d+)$/)?.[1];
      if (narcoticWardNumber) {
        roomTokens.add(`${narcoticWardNumber}w`);
        roomTokens.add(`${narcoticWardNumber}병동`);
      }
      return [...roomTokens].some((token) => token.includes(normalizedRoomQuery));
    })
  );
}

export function matchesMasterSearch(row: MasterRow, query: string, roomIds: string[] = []) {
  if (roomIds.length > 0) return roomIds.some((roomId) => matchesMasterRoom(row, roomId));
  return matchesMaster(row, query);
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
  return text
    .replace(/청구약품 보관 장소에 약품명 라벨링이 되어 있다\./g, `${CLAIM_FLUID_SECTION}의 보관 장소에 약품명 라벨링이 되어 있다.`)
    .replace(/청구약(?!\/\s*수액|품)/g, CLAIM_FLUID_SECTION)
    .replace(/^\s*\d+(?:-\d+)?[.)]?\s+/, "");
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

export function normalizeChecklistRows<T extends { id?: string; note?: string; section: string; status?: CheckStatus; text: string }>(items: T[]) {
  const rows: T[] = [];
  for (const item of items) {
    if (isChecklistLabelOnly(item.text)) continue;
    if (isRetiredChecklistRow(item.text)) continue;
    const section = normalizeChecklistSection(item.section);
    let text = normalizeChecklistText(item.text);
    if (section === "E-cart" && text.trim() === "이상 시 사유:") continue;
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
    rows.splice(lastColdIndex + 1, 0, makeChecklistSibling(rows[lastColdIndex], "thermometer", "연 1회 냉장고 온도계 검증 여부"));
  }

  ensureChecklistRow(rows, "비품약", "비품약 유효기간 1달에 1번 날짜로 관리한다.", "monthly-stock-expiry");
  ensureChecklistRow(rows, CLAIM_FLUID_SECTION, "청구약/ 수액 유효기간을 1달에 1번 관리 한다.", "monthly-claim-fluid-expiry");
  ensureChecklistRow(rows, "E-cart", "E-cart 약물의 종류와 갯수가 규정과 동일 하다.", "drug-count-match");

  return rows;
}

export function stockKey(roomId: string, drugCode: string) {
  return `${roomId}::${drugCode}`;
}

export function getInspectedRoomIdsFromCheckedItems(checkedItems: Record<string, boolean>) {
  const ids = new Set<string>();
  for (const [key, checked] of Object.entries(checkedItems)) {
    if (!checked) continue;
    const [roomId] = key.split("::");
    if (roomId) ids.add(roomId);
  }
  return [...ids];
}

export function removeStockDrugRecords<T>(record: Record<string, T>, drugCode: string) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key.split("::")[1] !== drugCode));
}

export function stockSplitKey(roomId: string, drugCode: string, partIndex: number) {
  return `${stockKey(roomId, drugCode)}::split-${partIndex}`;
}

function includesAny(value: string, patterns: string[]) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
}

export function getStockSplitParts(roomId: string, drugCode: string, requiredQty: number, drugName: string) {
  if (roomId === "HBEF심혈관조영실" && (drugCode === "XVERAW" || includesAny(drugName, ["Isoptin", "Verapamil"]))) {
    return [1, Math.max(0, requiredQty - 1)];
  }
  if (
    roomId === "DRL" &&
    requiredQty === 2 &&
    (["XEPIN", "XNALO.4"].includes(drugCode) || includesAny(drugName, ["Epinephrine", "Naloxone"]))
  ) {
    return [1, 1];
  }
  if (roomId === "HBEF심혈관조영실" && requiredQty > 0 && requiredQty % 2 === 0) {
    return [requiredQty / 2, requiredQty / 2];
  }
  return null;
}

export function toggleStockSplitPart(
  checkedStock: Record<string, boolean>,
  roomId: string,
  drugCode: string,
  partIndex: number,
  partCount: number,
) {
  const next = { ...checkedStock };
  const partKey = stockSplitKey(roomId, drugCode, partIndex);
  if (next[partKey]) {
    delete next[partKey];
  } else {
    next[partKey] = true;
  }

  const allChecked = Array.from({ length: partCount }, (_, index) => Boolean(next[stockSplitKey(roomId, drugCode, index)])).every(Boolean);
  const parentKey = stockKey(roomId, drugCode);
  if (allChecked) {
    next[parentKey] = true;
  } else if (next[parentKey]) {
    delete next[parentKey];
  }
  return next;
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
}

function todayStamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function buildReportFileName({
  category,
  mode,
  targetName = "",
  date = todayStamp(),
}: {
  category: MainCategory;
  mode: PrintPreviewMode;
  targetName?: string;
  date?: string;
}) {
  if (mode === "round-summary") {
    return `${sanitizeFileName(`병동순회점검표-전체점검내용-${date}`)}.pdf`;
  }

  if (mode === "drug-labels") {
    return `${sanitizeFileName(`약품라벨_${date}`)}.pdf`;
  }

  if (mode === "all-stock") {
    return `${sanitizeFileName(`비품약 현황 및 일괄점검보고서_${date}`)}.pdf`;
  }

  if (mode === "all-ecart") {
    return `${sanitizeFileName(`E-cart 현황 및 일괄점검보고서_${date}`)}.pdf`;
  }

  if (mode === "all-narcotic") {
    return `${sanitizeFileName(`비치마약류 현황 및 일괄점검보고서_${date}`)}.pdf`;
  }

  const reportTitle =
    category === "stock" ? "비품약 현황 및 일괄점검보고서" : category === "narcotic" ? "비치마약류 현황 및 일괄점검보고서" : "E-cart 현황 및 일괄점검보고서";
  const prefix = targetName ? `${targetName}_` : "";
  return `${sanitizeFileName(`${prefix}${reportTitle}_${date}`)}.pdf`;
}

export function getInitialAppMode(pathname = window.location.pathname, search = window.location.search): AppMode {
  const params = new URLSearchParams(search);
  if (params.get("view") === "pharmacy-editor" || pathname.replace(/\/+$/, "").includes("/pharmacy-label-editor")) {
    return "pharmacy-editor";
  }
  if (params.get("view") === "pharmacy-locator" || pathname.replace(/\/+$/, "").endsWith("/pharmacy-drug-locator")) {
    return "pharmacy-locator";
  }
  if (params.get("view") === "narcotic" || pathname.replace(/\/+$/, "").endsWith("/narcotic-viewer")) {
    return "narcotic-viewer";
  }
  if (params.get("view") === "pharmacy" || pathname.replace(/\/+$/, "").endsWith("/pharmacy-viewer")) {
    return "pharmacy-viewer";
  }
  if (params.get("view") === "master" || pathname.replace(/\/+$/, "").endsWith("/viewer")) {
    return "master-viewer";
  }
  return "admin";
}

export function getStockGuideInspectionKey(item: StockGuideEntry) {
  if (item.stockRoomId) return item.stockRoomId;
  if (item.ecartTargetId) return `ecart:${item.ecartTab ?? "general"}:${item.ecartTargetId}`;
  return item.label;
}

export function clearUninspectedRoomId(ids: string[], roomId: string) {
  return ids.includes(roomId) ? ids.filter((id) => id !== roomId) : ids;
}

export function getStockGuideClassName(roomId: string | undefined, uninspectedIds: string[], inspectedIds: string[]) {
  if (!roomId) return "";
  if (uninspectedIds.includes(roomId)) return "uninspected";
  if (inspectedIds.includes(roomId)) return "inspected";
  return "";
}

export function makeInspectionCycleResetState(): InspectionCycleResetState {
  return {
    checkedStock: {},
    stockExpiry: {},
    stockChecklistByRoom: {},
    ecartByTarget: {},
    roundSummaryDraft: null,
    uninspectedRoomIds: [],
  };
}
