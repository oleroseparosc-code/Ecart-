import { getHospitalDrugLabelWarnings, type HospitalDrugLabelRow } from "./hospitalDrugLabels";
import {
  type PharmacyCabinetEntry,
  type PharmacyLabelCategory,
  type PharmacyLabelDraft,
} from "./pharmacyLabelStudio";

function splitLocations(value?: string) {
  return (value ?? "")
    .split(/[,/\n]+/)
    .map((location) => location.trim())
    .filter(Boolean);
}

function cabinetLocation(row: HospitalDrugLabelRow, category?: PharmacyLabelCategory) {
  const sourceLocation = category === "영양수액"
    ? row.cabinetNutritionInfo?.location
    : category === "시럽"
      ? row.cabinetSyrupInfo?.location || row.cabinetExternalInfo?.location
      : category && ["외용제", "외용점안제", "팩제"].includes(category)
        ? row.cabinetExternalInfo?.location
        : row.cabinetOralInjectionInfo?.location;
  const workbookLocation = row.location || sourceLocation || "";
  if (category === "냉장주사" && row.drugType.replace(/\s+/g, "") === "백신") {
    return workbookLocation || "백신 냉장고";
  }
  return workbookLocation;
}

export function listCabinetLocations(rows: readonly HospitalDrugLabelRow[], category?: PharmacyLabelCategory) {
  return [...new Set(rows.flatMap((row) => splitLocations(cabinetLocation(row, category))))]
    .sort((left, right) => left.localeCompare(right, "ko", { numeric: true }));
}

export function hasDedicatedHighCostLocation(row: HospitalDrugLabelRow, category?: PharmacyLabelCategory) {
  return Boolean(row.highCost && splitLocations(cabinetLocation(row, category)).some((location) => location.startsWith("고")));
}

export function formatCabinetAtcNumber(value?: string) {
  return (value ?? "").trim().replace(/^ATC\s*/i, "");
}

export function cabinetAlphabetKey(name: string) {
  return /^[A-Z]/.exec(name.trim().toUpperCase())?.[0] ?? "기타";
}

export function cabinetReference(row: HospitalDrugLabelRow) {
  return [...getHospitalDrugLabelWarnings(row).filter((warning) => !["냉장", "냉동", "차광"].includes(warning)),
    row.hazardous ? "위해의약품" : "",
    row.oralAnticancer ? "경구항암제" : "",
    row.anticancer ? "항암제" : "",
    row.highCost ? "고가약" : "",
  ].filter((value, index, values) => value && values.indexOf(value) === index).join(" · ");
}

function toEntry(row: HospitalDrugLabelRow, category: PharmacyLabelCategory): PharmacyCabinetEntry {
  return {
    code: row.code,
    name: row.name,
    koreanName: row.koreanName,
    reference: cabinetReference(row),
    location: cabinetLocation(row, category),
    atc: formatCabinetAtcNumber(row.atc),
    expiry: row.expiry ?? "",
  };
}

function baseDraft(category: PharmacyLabelCategory, id: string): PharmacyLabelDraft {
  return {
    id,
    code: id,
    itemCode: "",
    labelFamily: "cabinet",
    category,
    location: "",
    atc: "",
    expiry: "",
    imagePath: "",
    imageSourceUrl: "",
    backgroundColor: "#ffffff",
    size: { presetKey: "cabinet", widthMm: 120, heightMm: 10 },
    printable: {
      title: "",
      koreanName: "",
      strength: "",
      warning: "",
      topBanner: "",
      footer: { enabled: false, text: "" },
      reconstitution: "",
    },
    warnings: [],
    drugTypes: [category],
    style: {
      outerBorderPx: 0.5,
      outerBorderColor: "#111827",
      textOutlinePx: 0,
      textOutlineColor: "#ffffff",
      fontFamily: "Malgun Gothic, Segoe UI, sans-serif",
      fontSizePt: 8,
      fontColor: "#111827",
      warningColor: "#d92d20",
    },
    sourceType: "workbook",
  };
}

export function buildCabinetLocationDraft(
  rows: readonly HospitalDrugLabelRow[],
  category: PharmacyLabelCategory,
  location: string,
) {
  const entries = rows
    .filter((row) => splitLocations(cabinetLocation(row, category)).includes(location))
    .sort((left, right) => right.name.localeCompare(left.name, "en", { sensitivity: "base", numeric: true }))
    .map((row) => toEntry(row, category));
  const rowCount = Math.ceil(entries.length / 2) + 1;
  const draft = baseDraft(category, `pharmacy-cabinet-${category}-${location}`);
  return {
    ...draft,
    code: `CABINET-${category}-${location}`,
    location,
    size: { presetKey: "cabinet-location", widthMm: 120, heightMm: rowCount * 5 },
    printable: { ...draft.printable, title: `${category} ${location}` },
    cabinetLayout: {
      kind: "location" as const,
      category,
      title: `${category}장 ${location}`,
      entries,
      page: 1,
      totalPages: 1,
      appendBlankRow: true,
    },
  };
}

export function buildCabinetFullListDrafts(
  rows: readonly HospitalDrugLabelRow[],
  category: PharmacyLabelCategory,
) {
  const entries = [...rows]
    .sort((left, right) => {
      if (category === "ATC") {
        const leftAtc = Number.parseInt(formatCabinetAtcNumber(left.atc), 10);
        const rightAtc = Number.parseInt(formatCabinetAtcNumber(right.atc), 10);
        const order = (Number.isFinite(leftAtc) ? leftAtc : Number.MAX_SAFE_INTEGER)
          - (Number.isFinite(rightAtc) ? rightAtc : Number.MAX_SAFE_INTEGER);
        if (order) return order;
      }
      return left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true });
    })
    .map((row) => toEntry(row, category));
  const totalPages = ["영양수액", "경구 고가약"].includes(category) ? 1 : 2;
  const pageSize = Math.ceil(entries.length / totalPages);
  const pages = Array.from({ length: totalPages }, (_, index) => entries.slice(index * pageSize, (index + 1) * pageSize));
  return pages.map((pageEntries, index) => {
    const title = `${category} 전체 리스트`;
    const draft = baseDraft(category, `pharmacy-cabinet-full-${category}-${index + 1}`);
    return {
      ...draft,
      code: `CABINET-FULL-${category}-${index + 1}`,
      size: { presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 },
      printable: { ...draft.printable, title },
      cabinetLayout: {
        kind: "full-list" as const,
        category,
        title,
        entries: pageEntries,
        page: index + 1,
        totalPages,
      },
    };
  });
}

export function buildThreeTierPositionDraft(
  entries: readonly PharmacyCabinetEntry[],
  category: PharmacyLabelCategory,
) {
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true }));
  const draft = baseDraft(category, `pharmacy-three-tier-${category}`);
  return {
    ...draft,
    code: `THREE-TIER-${category}`,
    size: { presetKey: "three-tier-position", widthMm: 86, heightMm: Math.max(3, Math.ceil(sortedEntries.length / 2) * 3) },
    printable: { ...draft.printable, title: "3단장 위치별 라벨" },
    cabinetLayout: {
      kind: "three-tier" as const,
      category,
      title: "3단장 위치별 라벨",
      entries: sortedEntries,
      page: 1,
      totalPages: 1,
      appendBlankRow: false,
    },
  };
}
