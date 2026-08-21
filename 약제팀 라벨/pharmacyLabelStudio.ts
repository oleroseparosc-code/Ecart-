import {
  MANDATORY_DILUTION_LABEL,
  getHospitalDrugLabelWarnings,
  isHospitalDrugLightProtected,
  isHospitalDrugRefrigerated,
  requiresMandatoryDilutionLabel,
  type HospitalDrugCabinetInfo,
  type HospitalDrugLabelRow,
} from "./hospitalDrugLabels";

export type PharmacyLabelFamily = "drug" | "cabinet";
export type PharmacyLabelCategory =
  | "원병" | "PTP" | "ATC" | "입원산제" | "경구 고가약" | "유색라벨" | "측면라벨"
  | "외용제" | "외용점안제" | "팩제" | "시럽"
  | "앰플" | "바이알" | "냉장주사" | "백신" | "영양수액" | "일반수액"
  | "마약/향정" | "고가약" | "항암제" | "경구 항암제" | "주사 항암제";
export type PharmacyHighCostRoute = "주사" | "경구";
export type PharmacyLabelSizePresetKey = string;
export type PharmacyLabelPaper = { key: "A4" | "A3"; widthMm: number; heightMm: number; marginMm: number };
export type PharmacyLabelPaperOrientation = "portrait" | "landscape";
export type PharmacyLabelSize = { presetKey: PharmacyLabelSizePresetKey; widthMm: number; heightMm: number };
export type PharmacyLabelStyle = {
  outerBorderPx: number;
  outerBorderColor: string;
  textOutlinePx: number;
  textOutlineColor: string;
  fontFamily: string;
  fontSizePt: number;
  fontColor: string;
  warningColor: string;
};
export type PharmacyPrintableText = {
  title: string;
  koreanName: string;
  strength: string;
  warning: string;
  topBanner: string;
  footer: { enabled: boolean; text: string };
  reconstitution: string;
};
export type PharmacyTitleStyle = {
  start: number;
  end: number;
  fontSizePt?: number;
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase";
};
export type PharmacyCabinetEntry = {
  code: string;
  name: string;
  koreanName: string;
  reference: string;
  location: string;
  atc: string;
  expiry: string;
  doseUnit?: "0.25T" | "0.5T" | "1T";
  doseHighlighted?: boolean;
};
export type PharmacyCabinetLayout = {
  kind: "location" | "full-list" | "three-tier";
  category: PharmacyLabelCategory;
  paperKey?: "A4" | "A3";
  columnCount?: number;
  listKind?: "standard" | "high-cost";
  title: string;
  entries: PharmacyCabinetEntry[];
  page: number;
  totalPages: number;
  appendBlankRow?: boolean;
};
export type PharmacyLabelDraft = {
  id: string;
  code: string;
  itemCode: string;
  labelFamily: PharmacyLabelFamily;
  category: PharmacyLabelCategory;
  doseUnit?: "0.25T" | "0.5T" | "1T";
  accessory?: "측면라벨" | "유색 측면라벨" | "병뚜껑" | "유색 병뚜껑" | "선반라벨" | "앰플꽂이";
  location: string;
  atc: string;
  expiry: string;
  imagePath: string;
  imageSourceUrl: string;
  backgroundColor: string;
  size: PharmacyLabelSize;
  printable: PharmacyPrintableText;
  titleStyles?: PharmacyTitleStyle[];
  warnings: string[];
  drugTypes: string[];
  style: PharmacyLabelStyle;
  sourceType: "workbook" | "manual" | "new";
  savedAt?: string;
  cabinetLayout?: PharmacyCabinetLayout;
};
export type PharmacySavedLabel = PharmacyLabelDraft & { savedAt: string };

export const A4_PAPER: PharmacyLabelPaper = { key: "A4", widthMm: 210, heightMm: 297, marginMm: 10 };
export const A3_PAPER: PharmacyLabelPaper = { key: "A3", widthMm: 297, heightMm: 420, marginMm: 10 };
export const DEFAULT_PHARMACY_LABEL_SIZE: PharmacyLabelSize = { presetKey: "33x100", widthMm: 100, heightMm: 33 };
export const PHARMACY_LABEL_REPOSITORY_KEY = "pharmacy-label-repository-v2";
export const WARNING_OPTIONS = ["위해의약품", "용량주의", "유사발음", "유사모양", "고위험의약품", "이름주의", "용량확인", "냉장", "냉동", "차광"] as const;
export const DRUG_CATEGORIES: PharmacyLabelCategory[][] = [
  ["원병", "PTP", "ATC", "입원산제"],
  ["외용제", "외용점안제", "팩제", "시럽"],
  ["앰플", "바이알", "냉장주사", "백신", "영양수액", "일반수액"],
  ["마약/향정"],
  ["고가약"],
  ["경구 항암제", "주사 항암제"],
];
export const CABINET_CATEGORIES: PharmacyLabelCategory[][] = [
  ["원병", "PTP", "ATC", "입원산제", "경구 고가약", "유색라벨", "측면라벨"],
  ...DRUG_CATEGORIES.slice(1, 3).map((group) => group.filter((category) => category !== "백신")),
];
export const PHARMACY_CATEGORY_GROUP_NAMES = ["경구", "외용", "주사"] as const;
export type PharmacyCategoryGroupName = (typeof PHARMACY_CATEGORY_GROUP_NAMES)[number];
const PHARMACY_TYPE_CATEGORIES = new Set<PharmacyLabelCategory>(DRUG_CATEGORIES.slice(0, 3).flat());
const ANTICANCER_CATEGORIES: PharmacyLabelCategory[] = ["항암제", "경구 항암제", "주사 항암제"];

const SIZE_MAP: Record<string, PharmacyLabelSize[]> = {
  외용제: sizes(["33*100", "13.5*105", "40*80", "44*100"]),
  외용점안제: sizes(["33*100", "13.5*105", "40*80", "44*100"]),
  팩제: sizes(["33*100", "13.5*105", "40*80", "44*100"]),
  시럽: sizes(["48*94", "15*90"]),
  입원산제: sizes(["23*102", "10*27", "15*30"]),
  앰플: sizes(["33*100"]),
  바이알: sizes(["43*80", "47*80", "52*80", "47*90"]),
  PTP: sizes(["32*70", "40*80", "42*80", "47*80", "52*80", "47*90"]),
  냉장주사: sizes(["40*80", "42*80", "47*80", "52*80"]),
  백신: sizes(["40*80", "42*80", "47*80", "52*80"]),
  영양수액: sizes(["15*110", "15*140"]),
  일반수액: sizes(["50*93", "55*93", "50*160"]),
  "마약/향정": sizes(["40*70"]),
  고가약: sizes(["43*80", "50*80"]),
  항암제: sizes(["46*80"]),
  "경구 항암제": sizes(["46*80"]),
  "주사 항암제": sizes(["46*80"]),
  원병: sizes(["33*100", "23*102", "10*27", "15*30"]),
};

function sizes(values: string[]) {
  return values.map((value) => {
    const [heightMm, widthMm] = value.split("*").map(Number);
    return { presetKey: value.replace("*", "x"), widthMm, heightMm };
  });
}

export function sizesForCategory(category: PharmacyLabelCategory, row?: HospitalDrugLabelRow) {
  const available = SIZE_MAP[category] ?? [DEFAULT_PHARMACY_LABEL_SIZE];
  if (category === "영양수액") return [row && getHospitalDrugLabelWarnings(row).length > 0 ? available[1] : available[0]];
  if (row?.border && ["PTP", "바이알", "냉장주사", "백신"].includes(category)) return available.filter((size) => size.heightMm > 40);
  return available;
}

export function isAnticancerCategory(category: PharmacyLabelCategory) {
  return ANTICANCER_CATEGORIES.includes(category);
}

export function isInjectableAnticancerCategory(category: PharmacyLabelCategory) {
  return category === "주사 항암제";
}

export function rowMatchesCategory(
  row: HospitalDrugLabelRow,
  category: PharmacyLabelCategory,
  highCostRoute: PharmacyHighCostRoute = "주사",
  family: PharmacyLabelFamily = "drug",
) {
  const type = row.drugType.replace(/\s+/g, "");
  if (!row.inHospital) return false;
  const pharmacyTypes = row.pharmacyLabelTypes?.map((value) => value.replace(/\s+/g, "")).filter(Boolean) ?? [];
  const isOralHighCost = ["원병", "PTP"].some((value) => type.includes(value));
  const isInjection = ["앰플", "바이알", "냉장주사", "주사", "영양수액", "일반수액", "항암제", "백신", "제로관리약"].some((value) => type.includes(value));
  if (["유색라벨", "측면라벨"].includes(category)) return family === "cabinet" && threeTierDoseUnitsForCategory(row, category).length > 0;
  if (category === "경구 고가약") return family === "cabinet" && Boolean(row.highCost) && isOralHighCost;
  if (category === "백신") return type === "백신" || pharmacyTypes.includes("백신");
  if (category === "냉장주사" && type === "백신") return true;
  if (row.pharmacyLabelTypes && PHARMACY_TYPE_CATEGORIES.has(category)) {
    return pharmacyTypes.includes(category.replace(/\s+/g, ""));
  }
  if (category === "고가약") {
    if (!row.highCost) return false;
    return highCostRoute === "주사" ? isInjection : !isInjection;
  }
  if (category === "경구 항암제") return Boolean(row.oralAnticancer);
  if (category === "주사 항암제") return (row.highRiskCategory ?? "").replace(/\s+/g, "").includes("주사용항암제");
  if (category === "항암제") return Boolean(row.anticancer) || type === "항암제" || (row.highRiskCategory ?? "").includes("주사용항암제");
  if (category === "마약/향정") return Boolean(row.narcotic || row.psychotropic) || type === "마약" || type === "향정";
  if (category === "냉장주사") {
    return type === "제로관리약" || type === "백신" || (isHospitalDrugRefrigerated(row) && ["앰플", "바이알", "주사"].some((value) => type.includes(value)));
  }
  if (category === "입원산제") return type === "입원산제" || Boolean(row.inpatientPowderPtp);
  if (category === "ATC") return type === "ATC" || Boolean(row.atc);
  if (category === "PTP") return type === "PTP" || Boolean(row.ptpOpened);
  if (category === "외용제") return type === "외용제";
  if (category === "외용점안제") return type === "외용점안제";
  if (category === "팩제") return type === "팩제";
  return type === category;
}

export function threeTierDoseUnitsForCategory(
  row: HospitalDrugLabelRow,
  category: PharmacyLabelCategory,
): NonNullable<PharmacyLabelDraft["doseUnit"]>[] {
  if (!["유색라벨", "측면라벨"].includes(category)) return [];
  const types = [row.drugType, ...(row.pharmacyLabelTypes ?? [])].map((value) => value.replace(/\s+/g, ""));
  if (!types.some((value) => value === "원병" || value === "PTP")) return [];
  const marked = (value?: string) => value?.trim().toUpperCase() === "Y";
  const one = marked(row.sideLabel1T);
  const half = marked(row.sideLabelHalfT);
  const quarter = marked(row.sideLabelQuarterT);
  if (category === "유색라벨") {
    if (!marked(row.coloredSideLabel)) return [];
    const markedDoses = [one ? "1T" : "", half ? "0.5T" : "", quarter ? "0.25T" : ""].filter(Boolean) as NonNullable<PharmacyLabelDraft["doseUnit"]>[];
    return markedDoses.length ? markedDoses : ["1T"];
  }
  if (!one && !half && !quarter) return [];
  return [one ? "1T" : "", half ? "0.5T" : "", quarter ? "0.25T" : ""].filter(Boolean) as NonNullable<PharmacyLabelDraft["doseUnit"]>[];
}

export function rowMatchesCategoryGroup(
  row: HospitalDrugLabelRow,
  group: PharmacyCategoryGroupName,
  family: PharmacyLabelFamily,
) {
  const groupIndex = PHARMACY_CATEGORY_GROUP_NAMES.indexOf(group);
  const categories = (family === "drug" ? DRUG_CATEGORIES : CABINET_CATEGORIES)[groupIndex] ?? [];
  return categories.some((category) => rowMatchesCategory(row, category, "주사", family === "drug" && row.highCost ? "cabinet" : family));
}

export function categoryForGroupedRow(
  row: HospitalDrugLabelRow,
  group: PharmacyCategoryGroupName,
  family: PharmacyLabelFamily,
) {
  if (family === "drug" && row.highCost) return "고가약" as const;
  const groupIndex = PHARMACY_CATEGORY_GROUP_NAMES.indexOf(group);
  const categories = (family === "drug" ? DRUG_CATEGORIES : CABINET_CATEGORIES)[groupIndex] ?? [];
  return categories.find((category) => rowMatchesCategory(row, category, "주사", family)) ?? categories[0] ?? "원병";
}

export function createPharmacyLabelDraft(
  row: HospitalDrugLabelRow,
  category: PharmacyLabelCategory,
  labelFamily: PharmacyLabelFamily,
): PharmacyLabelDraft {
  const cabinetInfo = labelFamily === "cabinet" ? getCabinetInfoForCategory(row, category) : undefined;
  const warnings = getPharmacyLabelWarnings(row, cabinetInfo);
  const cabinetSize = labelFamily === "cabinet"
    ? category === "원병"
      ? sizes(["30*120"])[0]
      : category === "PTP"
        ? sizes(["25*125"])[0]
        : category === "영양수액"
          ? sizes([warnings.length > 0 ? "15*140" : "15*110"])[0]
          : ["외용제", "외용점안제", "팩제", "시럽"].includes(category)
            ? sizes(["33*100"])[0]
            : undefined
    : undefined;
  const size = cabinetSize ?? sizesForCategory(category, row)[0] ?? DEFAULT_PHARMACY_LABEL_SIZE;
  const anticancer = isAnticancerCategory(category);
  const cabinetNameOnly = labelFamily === "cabinet" && category === "영양수액";
  const workbookBorderColor = extractHex(row.borderColor);
  const hasWorkbookBorder = row.border || Boolean(workbookBorderColor);
  return {
    id: `pharmacy-label-${row.code}-${labelFamily}-${category}`,
    code: row.code,
    itemCode: row.itemCode ?? "",
    labelFamily,
    category,
    location: cabinetInfo?.location || row.location || "",
    atc: cabinetInfo?.atc || row.atc || "",
    expiry: cabinetInfo?.expiry || row.expiry || "",
    imagePath: row.imagePath ?? "",
    imageSourceUrl: row.imageSourceUrl ?? "",
    backgroundColor: extractHex(row.coloredSideBackground) || "#ffffff",
    size,
    printable: {
      title: row.name,
      koreanName: cabinetNameOnly ? "" : row.koreanName,
      strength: cabinetNameOnly ? "" : row.strength,
      warning: warnings.join(" · "),
      topBanner: anticancer ? "고위험의약품" : category === "고가약" ? "고가통계약" : row.oralAnticancer ? "경구항암제" : "",
      footer: {
        enabled: anticancer || row.highRisk,
        text: anticancer
          ? ["항암제", isHospitalDrugRefrigerated(row) ? "냉장" : "", isHospitalDrugLightProtected(row) ? "차광" : ""].filter(Boolean).join(" · ")
          : row.highRiskCategory ?? "",
      },
      reconstitution: row.reconstitution ?? "",
    },
    warnings,
    drugTypes: row.drugType ? [row.drugType] : [],
    accessory: labelFamily === "cabinet" && ["원병", "PTP"].includes(category)
      ? "선반라벨"
      : category === "앰플" && row.ampouleHolder?.trim().toUpperCase() === "Y"
        ? "앰플꽂이"
        : undefined,
    style: {
      outerBorderPx: hasWorkbookBorder || category === "고가약" ? 5 : 0.5,
      outerBorderColor: workbookBorderColor || "#111827",
      textOutlinePx: 0,
      textOutlineColor: "#ffffff",
      fontFamily: "Malgun Gothic, Segoe UI, sans-serif",
      fontSizePt: anticancer ? 21 : 18,
      fontColor: "#111827",
      warningColor: "#d92d20",
    },
    sourceType: "workbook",
  };
}

export function extractHex(value?: string) {
  return /#[0-9a-f]{6}/i.exec(value ?? "")?.[0] ?? "";
}

export function splitDoseText(title: string) {
  const match = /\d+(?:\.\d+)?(?=\s*(?:mcg|mg|g|ml|mL|%|IU|unit))/i.exec(title);
  if (!match || match.index == null) return { before: title, dose: "", after: "" };
  return {
    before: title.slice(0, match.index),
    dose: match[0],
    after: title.slice(match.index + match[0].length),
  };
}

export function splitNutritionDoseText(title: string) {
  const matches = [...title.matchAll(/\d+(?:\.\d+)?(?=\s*(?:mcg|mg|g|ml|mL|IU|unit))/gi)];
  const match = matches.at(-1);
  if (!match || match.index == null) return splitDoseText(title);
  return {
    before: title.slice(0, match.index),
    dose: match[0],
    after: title.slice(match.index + match[0].length),
  };
}

export function splitNutritionDoseParts(title: string) {
  const pattern = /\d+(?:\.\d+)?(?=\s*(?:\/|mcg|mg|g|ml|mL|IU|unit))/gi;
  const matches = [...title.matchAll(pattern)];
  if (matches.length === 0) return [{ text: title, highlighted: false }];
  const parts: { text: string; highlighted: boolean }[] = [];
  let cursor = 0;
  for (const match of matches) {
    const index = match.index ?? cursor;
    if (index > cursor) parts.push({ text: title.slice(cursor, index), highlighted: false });
    parts.push({ text: match[0], highlighted: true });
    cursor = index + match[0].length;
  }
  if (cursor < title.length) parts.push({ text: title.slice(cursor), highlighted: false });
  return parts;
}

export function mergeDoseHighlightStyles(title: string, styles: PharmacyTitleStyle[] = [], enabled = false) {
  if (!enabled) return styles;
  const { before, dose } = splitDoseText(title);
  return dose
    ? [...styles, { start: before.length, end: before.length + dose.length, color: "#d92d20", backgroundColor: "#fff200" }]
    : styles;
}

export function splitStyledPharmacyTitle(title: string, styles: PharmacyTitleStyle[] = []) {
  const valid = styles
    .map((style) => ({ ...style, start: Math.max(0, style.start), end: Math.min(title.length, style.end) }))
    .filter((style) => style.end > style.start)
    .sort((a, b) => a.start - b.start);
  if (valid.length === 0) return [{ text: title, style: undefined }];
  const points = [...new Set([0, title.length, ...valid.flatMap((style) => [style.start, style.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, index) => {
    const end = points[index + 1];
    const applied = valid.filter((style) => style.start <= start && style.end >= end);
    const merged = applied.reduce<PharmacyTitleStyle | undefined>((result, style) => ({ ...result, ...style }), undefined);
    const rawText = title.slice(start, end);
    const text = merged?.textTransform === "uppercase"
      ? rawText.toUpperCase()
      : merged?.textTransform === "lowercase"
        ? rawText.toLowerCase()
        : rawText;
    return { text, style: merged };
  });
}

function getCabinetInfoForCategory(row: HospitalDrugLabelRow, category: PharmacyLabelCategory) {
  if (category === "영양수액") return row.cabinetNutritionInfo ?? undefined;
  if (["외용제", "외용점안제", "팩제"].includes(category)) return row.cabinetExternalInfo ?? undefined;
  if (category === "시럽") return row.cabinetSyrupInfo ?? undefined;
  if (["원병", "PTP", "ATC", "입원산제", "경구 고가약", "유색라벨", "측면라벨", "앰플", "바이알", "냉장주사"].includes(category)) {
    return row.cabinetOralInjectionInfo ?? undefined;
  }
  return undefined;
}

function splitCabinetWarnings(info?: HospitalDrugCabinetInfo) {
  return (info?.warning ?? "")
    .split(/[,\n/·]+/)
    .map((warning) => warning.trim())
    .filter(Boolean);
}

function getPharmacyLabelWarnings(row: HospitalDrugLabelRow, cabinetInfo?: HospitalDrugCabinetInfo) {
  const warnings = [...splitCabinetWarnings(cabinetInfo), ...getHospitalDrugLabelWarnings(row)];
  if (/^Ntense\s+(?:central\s+1518|EF\s+506)\s*mL/i.test(row.name) && !warnings.includes("용량확인")) {
    warnings.push("용량확인");
  }
  return [...new Set(warnings)];
}

export function formatPharmacyExpiry(value: string) {
  const normalized = value.replace(/\s+00:00:00$/, "").trim();
  if (!/^\d+(?:\.0+)?$/.test(normalized)) return normalized;

  const serial = Number(normalized);
  if (!Number.isInteger(serial) || serial < 1 || serial > 99999) return normalized;

  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + serial * 86_400_000).toISOString().slice(0, 10);
}

export function resolvePharmacyLabelDraft(
  row: HospitalDrugLabelRow,
  savedLabels: PharmacySavedLabel[],
  category: PharmacyLabelCategory,
  family: PharmacyLabelFamily,
) {
  const saved = savedLabels
    .filter((label) => label.code.trim().toUpperCase() === row.code.trim().toUpperCase() && label.category === category && label.labelFamily === family)
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
    .pop();
  if (!saved) return createPharmacyLabelDraft(row, category, family);
  const size = category === "바이알" && ["40x80", "42x80"].includes(saved.size.presetKey)
    ? { presetKey: "43x80", widthMm: 80, heightMm: 43 }
    : category === "고가약" && saved.size.presetKey === "40x80"
      ? { presetKey: "43x80", widthMm: 80, heightMm: 43 }
      : category === "고가약" && saved.size.presetKey === "55x80"
        ? { presetKey: "50x80", widthMm: 80, heightMm: 50 }
        : saved.size;
  const cabinetInfo = family === "cabinet" ? getCabinetInfoForCategory(row, category) : undefined;
  const sharedWarnings = new Set<string>(WARNING_OPTIONS);
  const warnings = [
    ...saved.warnings.filter((warning) => !sharedWarnings.has(warning)),
    ...getPharmacyLabelWarnings(row, cabinetInfo),
  ].filter((warning, index, values) => values.indexOf(warning) === index);
  if (requiresMandatoryDilutionLabel(row.code) && !warnings.includes(MANDATORY_DILUTION_LABEL)) {
    warnings.push(MANDATORY_DILUTION_LABEL);
  }
  const accessory = category === "앰플"
    ? row.ampouleHolder?.trim().toUpperCase() === "Y" ? "앰플꽂이" : undefined
    : saved.accessory;
  const workbookBorderColor = extractHex(row.borderColor);
  const hasWorkbookBorder = row.border || Boolean(workbookBorderColor);
  return {
    ...saved,
    size,
    accessory,
    itemCode: saved.itemCode,
    location: saved.location,
    atc: saved.atc,
    expiry: cabinetInfo?.expiry || row.expiry || "",
    imagePath: row.imagePath ?? "",
    imageSourceUrl: row.imageSourceUrl ?? "",
    backgroundColor: accessory === "유색 측면라벨" || accessory === "유색 병뚜껑"
      ? extractHex(row.coloredSideBackground) || (accessory === "유색 병뚜껑" ? extractHex(row.capBackground) : "") || saved.backgroundColor
      : saved.backgroundColor,
    warnings,
    printable: { ...saved.printable, warning: warnings.join(" · ") },
    style: saved.sourceType === "manual"
      ? saved.style
      : hasWorkbookBorder || category === "고가약"
      ? { ...saved.style, outerBorderPx: 5, outerBorderColor: workbookBorderColor || saved.style.outerBorderColor }
      : { ...saved.style, outerBorderPx: saved.style.outerBorderPx === 5 ? 5 : 0.5 },
  };
}

export function savePharmacyLabelDraft(draft: PharmacyLabelDraft, now = new Date()): PharmacySavedLabel {
  return { ...draft, sourceType: "manual", savedAt: now.toISOString() };
}

function packPharmacyLabelsForPaper(labels: PharmacyLabelDraft[], paper: PharmacyLabelPaper) {
  const maxHeight = paper.heightMm - paper.marginMm * 2;
  const printableLabels = labels.flatMap((label) => {
    if (!label.cabinetLayout || !["location", "three-tier"].includes(label.cabinetLayout.kind) || label.size.heightMm <= maxHeight) return [label];
    const isThreeTier = label.cabinetLayout.kind === "three-tier";
    const rowHeightMm = isThreeTier ? 3 : 5;
    const maxRows = Math.max(1, Math.floor(maxHeight / rowHeightMm));
    const finalCapacity = Math.max(1, (maxRows - (isThreeTier ? 0 : 1)) * 2);
    const chunks: PharmacyCabinetEntry[][] = [];
    let remaining = label.cabinetLayout.entries;
    while (remaining.length > finalCapacity) {
      chunks.push(remaining.slice(0, maxRows * 2));
      remaining = remaining.slice(maxRows * 2);
    }
    chunks.push(remaining);
    return chunks.map((entries, index) => {
      const appendBlankRow = !isThreeTier && index === chunks.length - 1;
      return {
        ...label,
        id: `${label.id}-part-${index + 1}`,
        code: `${label.code}-PART-${index + 1}`,
        size: { ...label.size, heightMm: (Math.ceil(entries.length / 2) + (appendBlankRow ? 1 : 0)) * rowHeightMm },
        cabinetLayout: {
          ...label.cabinetLayout!,
          title: `${label.cabinetLayout!.title} (${index + 1}/${chunks.length})`,
          entries,
          page: index + 1,
          totalPages: chunks.length,
          appendBlankRow,
        },
      };
    });
  });
  const pages: PharmacyLabelDraft[][] = [];
  let page: PharmacyLabelDraft[] = [];
  let x = 0, y = 0, rowHeight = 0;
  const maxWidth = paper.widthMm - paper.marginMm * 2;
  for (const label of printableLabels) {
    if (x + label.size.widthMm > maxWidth) { x = 0; y += rowHeight; rowHeight = 0; }
    if (y + label.size.heightMm > maxHeight && page.length) { pages.push(page); page = []; x = 0; y = 0; rowHeight = 0; }
    page.push(label); x += label.size.widthMm; rowHeight = Math.max(rowHeight, label.size.heightMm);
  }
  if (page.length) pages.push(page);
  return pages;
}

function orientedPaper(paper: PharmacyLabelPaper, orientation: PharmacyLabelPaperOrientation): PharmacyLabelPaper {
  return orientation === "portrait" ? paper : { ...paper, widthMm: paper.heightMm, heightMm: paper.widthMm };
}

function labelsPerRow(labels: PharmacyLabelDraft[], paper: PharmacyLabelPaper) {
  const printableWidth = paper.widthMm - paper.marginMm * 2;
  return labels.reduce((total, label) => total + Math.floor(printableWidth / label.size.widthMm), 0);
}

export function planPharmacyLabelsForPaper(labels: PharmacyLabelDraft[], paper: PharmacyLabelPaper) {
  const portraitPaper = orientedPaper(paper, "portrait");
  const landscapePaper = orientedPaper(paper, "landscape");
  const portraitPages = packPharmacyLabelsForPaper(labels, portraitPaper);
  const landscapePages = packPharmacyLabelsForPaper(labels, landscapePaper);
  const useLandscape = landscapePages.length < portraitPages.length
    || (landscapePages.length === portraitPages.length && labelsPerRow(labels, landscapePaper) > labelsPerRow(labels, portraitPaper));
  return useLandscape
    ? { orientation: "landscape" as const, paper: landscapePaper, pages: landscapePages }
    : { orientation: "portrait" as const, paper: portraitPaper, pages: portraitPages };
}

export function groupPharmacyLabelsForPaper(labels: PharmacyLabelDraft[], paper: PharmacyLabelPaper) {
  return planPharmacyLabelsForPaper(labels, paper).pages;
}

export function loadSavedPharmacyLabelsFromStorage(storage: Pick<Storage, "getItem">): PharmacySavedLabel[] {
  try { return JSON.parse(storage.getItem(PHARMACY_LABEL_REPOSITORY_KEY) ?? "[]"); } catch { return []; }
}
export function savePharmacyLabelToStorage(storage: Pick<Storage, "getItem" | "setItem">, draft: PharmacyLabelDraft, now = new Date()) {
  const saved = savePharmacyLabelDraft(draft, now);
  const previous = loadSavedPharmacyLabelsFromStorage(storage);
  storage.setItem(PHARMACY_LABEL_REPOSITORY_KEY, JSON.stringify([...previous.filter((label) => label.id !== saved.id), saved]));
  return saved;
}
export function writeSavedPharmacyLabelsToStorage(storage: Pick<Storage, "setItem">, labels: PharmacySavedLabel[]) {
  storage.setItem(PHARMACY_LABEL_REPOSITORY_KEY, JSON.stringify(labels));
}
