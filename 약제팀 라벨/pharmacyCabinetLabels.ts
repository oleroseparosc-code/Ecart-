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
    atc: row.atc ?? "",
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
  listKind: "standard" | "high-cost" = "standard",
) {
  const filteredRows = category === "원병"
    ? rows.filter((row) => listKind === "high-cost" ? row.highCost : !row.highCost)
    : category === "PTP"
      ? rows.filter((row) => !row.highCost)
    : rows;
  const entries = [...filteredRows]
    .sort((left, right) => {
      if (category === "ATC") {
        const leftAtc = Number.parseInt(left.atc ?? "", 10);
        const rightAtc = Number.parseInt(right.atc ?? "", 10);
        const order = (Number.isFinite(leftAtc) ? leftAtc : Number.MAX_SAFE_INTEGER)
          - (Number.isFinite(rightAtc) ? rightAtc : Number.MAX_SAFE_INTEGER);
        if (order) return order;
      }
      return left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true });
    })
    .map((row) => toEntry(row, category));
  const totalPages = listKind === "high-cost" || category === "영양수액" ? 1 : 2;
  const pageSize = Math.ceil(entries.length / totalPages);
  const pages = Array.from({ length: totalPages }, (_, index) => entries.slice(index * pageSize, (index + 1) * pageSize));
  return pages.map((pageEntries, index) => {
    const suffix = listKind === "high-cost" ? "high-cost" : "standard";
    const title = category === "원병" && listKind === "high-cost" ? "원병 고가약 리스트" : `${category} 전체 리스트`;
    const draft = baseDraft(category, `pharmacy-cabinet-full-${category}-${suffix}-${index + 1}`);
    return {
      ...draft,
      code: `CABINET-FULL-${category}-${suffix}-${index + 1}`,
      size: { presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 },
      printable: { ...draft.printable, title },
      cabinetLayout: {
        kind: "full-list" as const,
        category,
        listKind,
        title,
        entries: pageEntries,
        page: index + 1,
        totalPages,
      },
    };
  });
}
