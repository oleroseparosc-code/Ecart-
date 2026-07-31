export type HospitalDrugCabinetInfo = {
  source: "경구 주사 리스트" | "영양수액리스트" | "외용제리스트" | "시럽리스트";
  atc?: string;
  warning?: string;
  expiry?: string;
  location?: string;
};

export type HospitalDrugLabelRow = {
  code: string;
  itemCode?: string;
  name: string;
  koreanName: string;
  strength: string;
  drugType: string;
  fluidColor?: string;
  highCost?: boolean;
  narcotic?: boolean;
  psychotropic?: boolean;
  anticancer?: boolean;
  eCart?: boolean;
  eCartNicu?: boolean;
  spec: string;
  package: string;
  storage: string;
  lightProtected: boolean;
  inHospital: boolean;
  oralAnticancer?: boolean;
  similarLook: boolean;
  similarSound: boolean;
  doseCaution: boolean;
  doseCheck: boolean;
  highRisk: boolean;
  highRiskCategory?: string;
  atc?: string;
  ptpOpened?: boolean;
  inpatientPowderPtp?: boolean;
  threeTierHalf?: boolean;
  expiry?: string;
  location?: string;
  ampouleHolder?: string;
  sideLabel1T?: string;
  sideLabelHalfT?: string;
  sideLabelQuarterT?: string;
  sideLabel?: boolean;
  labelDose1T?: boolean;
  labelDoseHalfT?: boolean;
  labelDoseQuarterT?: boolean;
  coloredSideLabel?: string;
  coloredSideBackground?: string;
  capLabel?: string;
  regularCapLabel?: boolean;
  coloredCapLabel?: boolean;
  capBackground?: string;
  nameCaution?: boolean;
  border?: boolean;
  borderColor?: string;
  cabinetOralInjection?: boolean;
  cabinetNutrition?: boolean;
  cabinetExternal?: boolean;
  cabinetSyrup?: boolean;
  cabinetOralInjectionInfo?: HospitalDrugCabinetInfo | null;
  cabinetNutritionInfo?: HospitalDrugCabinetInfo | null;
  cabinetExternalInfo?: HospitalDrugCabinetInfo | null;
  cabinetSyrupInfo?: HospitalDrugCabinetInfo | null;
  imagePath?: string;
  imageSourceUrl?: string;
};

type HospitalDrugLabelsModule = { default: HospitalDrugLabelRow[] };

let hospitalDrugLabelsPromise: Promise<HospitalDrugLabelRow[]> | null = null;
const MANDATORY_DILUTION_DRUG_CODES = new Set(["XACETATE", "XK20", "XMGSF50", "XNA40", "XKPHMB"]);

export const MANDATORY_DILUTION_LABEL = "<반드시 희석 후 사용>";

export function requiresMandatoryDilutionLabel(code: string) {
  return MANDATORY_DILUTION_DRUG_CODES.has(code.trim().toUpperCase());
}
export type HospitalDrugControlledCategory = "마약" | "향정";

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function loadHospitalDrugLabelRows() {
  hospitalDrugLabelsPromise ??= (import("./data/hospitalDrugLabels.generated.json") as Promise<HospitalDrugLabelsModule>).then(
    (module) => module.default,
  );
  return hospitalDrugLabelsPromise;
}

export function makeHospitalDrugLabelId(row: Pick<HospitalDrugLabelRow, "code">) {
  return `pharmacy-${row.code}`;
}
export function makeHospitalControlledDrugLabelId(row: Pick<HospitalDrugLabelRow, "code">) {
  return `narcotic-hospital-${row.code}`;
}
export function isHospitalDrugType(row: Partial<Pick<HospitalDrugLabelRow, "drugType">>, drugType: string) {
  return compact(row.drugType ?? "") === compact(drugType);
}
export function isHospitalControlledDrugType(
  row: Partial<Pick<HospitalDrugLabelRow, "drugType" | "narcotic" | "psychotropic">>,
) {
  return Boolean(row.narcotic || row.psychotropic) || isHospitalDrugType(row, "마약") || isHospitalDrugType(row, "향정");
}
export function isHospitalGeneralDrugLabelType(row: Partial<Pick<HospitalDrugLabelRow, "drugType">>) {
  return Boolean(row.drugType?.trim()) && !isHospitalDrugType(row, "일반수액") && !isHospitalControlledDrugType(row);
}
export function isSelectableHospitalDrugLabelRow(row: Pick<HospitalDrugLabelRow, "name" | "inHospital"> & Partial<Pick<HospitalDrugLabelRow, "drugType">>) {
  return row.inHospital && Boolean(row.name.trim()) && Boolean(row.drugType?.trim()) && !/^\d+(?:\.\d+)?$/.test(row.name.trim());
}
export function getHospitalDrugControlledCategory(
  row: Pick<HospitalDrugLabelRow, "name" | "koreanName"> &
    Partial<Pick<HospitalDrugLabelRow, "drugType" | "narcotic" | "psychotropic">>,
) {
  if (row.narcotic) return "마약";
  if (row.psychotropic) return "향정";
  if (isHospitalDrugType(row, "마약")) return "마약";
  if (isHospitalDrugType(row, "향정")) return "향정";
  return /^\s*\[(마약|향정)\]/.exec(row.name)?.[1] as HospitalDrugControlledCategory | undefined;
}
export function stripHospitalDrugControlledPrefix(name: string) {
  return name.replace(/^\s*\[(마약|향정)\]\s*/, "").trim();
}
export function shouldExcludeHospitalControlledDrugLabel(row: Pick<HospitalDrugLabelRow, "name">) {
  const name = stripHospitalDrugControlledPrefix(row.name);
  return /^PCA-/i.test(name) || /검사용/.test(name) || /소화기\s*병?\s*검사실/.test(name);
}

export function matchesHospitalDrugLabel(row: HospitalDrugLabelRow, query: string) {
  const value = compact(query.trim());
  if (!value) return true;
  return compact([row.code, row.itemCode, row.name, row.koreanName, row.strength, row.drugType, row.storage, row.location].join(" ")).includes(value);
}

export function isHospitalDrugLightProtected(row: HospitalDrugLabelRow) {
  return row.lightProtected || compact(row.storage).includes("차광");
}

export function isHospitalDrugFrozen(row: HospitalDrugLabelRow) {
  return compact(row.storage).includes("냉동");
}

export function isHospitalDrugRefrigerated(row: HospitalDrugLabelRow) {
  const storage = compact(row.storage);
  return !storage.includes("냉장보관하지") && (storage.includes("냉장") || /2[-~～]8/.test(storage));
}

export function isHospitalDrugHighRisk(row: HospitalDrugLabelRow) {
  return row.highRisk;
}

export function getHospitalDrugStorageLabel(row: HospitalDrugLabelRow) {
  if (isHospitalDrugFrozen(row)) return "냉동";
  if (isHospitalDrugRefrigerated(row)) return "냉장";
  return "";
}

export function getHospitalDrugLabelWarnings(row: HospitalDrugLabelRow) {
  return [
    row.doseCaution ? "용량주의" : "",
    row.similarSound ? "유사발음" : "",
    row.similarLook ? "유사모양" : "",
    row.highRisk ? "고위험의약품" : "",
    requiresMandatoryDilutionLabel(row.code) ? MANDATORY_DILUTION_LABEL : "",
    row.nameCaution ? "이름주의" : "",
    row.doseCheck ? "용량확인" : "",
    isHospitalDrugFrozen(row) ? "냉동" : "",
    isHospitalDrugRefrigerated(row) ? "냉장" : "",
    isHospitalDrugLightProtected(row) ? "차광" : "",
  ].filter(Boolean);
}
