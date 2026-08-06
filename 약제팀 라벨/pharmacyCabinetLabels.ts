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

export function listCabinetLocations(rows: readonly HospitalDrugLabelRow[]) {
  return [...new Set(rows.flatMap((row) => splitLocations(row.location)))]
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

function toEntry(row: HospitalDrugLabelRow): PharmacyCabinetEntry {
  return {
    code: row.code,
    name: row.name,
    koreanName: row.koreanName,
    reference: cabinetReference(row),
    location: row.location ?? "",
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
    .filter((row) => splitLocations(row.location).includes(location))
    .sort((left, right) => right.name.localeCompare(left.name, "en", { sensitivity: "base", numeric: true }))
    .map(toEntry);
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
      title: `${category}장 ${location}`,
      entries,
      page: 1,
      totalPages: 1,
    },
  };
}

export function buildCabinetFullListDrafts(
  rows: readonly HospitalDrugLabelRow[],
  category: PharmacyLabelCategory,
) {
  const entries = [...rows]
    .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base", numeric: true }))
    .map(toEntry);
  const firstPageCount = Math.ceil(entries.length / 2);
  const pages = [entries.slice(0, firstPageCount), entries.slice(firstPageCount)];
  return pages.map((pageEntries, index) => {
    const draft = baseDraft(category, `pharmacy-cabinet-full-${category}-${index + 1}`);
    return {
      ...draft,
      code: `CABINET-FULL-${category}-${index + 1}`,
      size: { presetKey: "cabinet-full-list", widthMm: 190, heightMm: 277 },
      printable: { ...draft.printable, title: `${category} 전체 리스트` },
      cabinetLayout: {
        kind: "full-list" as const,
        title: `${category} 전체 리스트`,
        entries: pageEntries,
        page: index + 1,
        totalPages: 2,
      },
    };
  });
}
