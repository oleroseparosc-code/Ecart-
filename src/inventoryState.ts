import type { StockAllocation, StockDrug, StockRoom } from "./types";
import type { HospitalDrugLabelRow } from "../약제팀 라벨/hospitalDrugLabels";
import { inferStorageType } from "./storageDisplay";

export type MasterRoomDetail = {
  roomId: string;
  requiredQty: number;
};

export type MasterRowKind = "stock" | "psychotropic" | "narcotic";
export type MasterRowKindFilter = Record<MasterRowKind, boolean>;

export type MasterRow = StockDrug & {
  masterKind: MasterRowKind;
  totalQuantity: number;
  roomDetails: MasterRoomDetail[];
};

type DrugDisplayFields = Pick<StockDrug, "code" | "genericName" | "productName">;
type CanonicalDrugDisplayFields = Pick<StockDrug, "code"> & Partial<Pick<StockDrug, "genericName" | "productName">>;

export function drugDisplayName(drug: DrugDisplayFields) {
  return drug.productName || drug.genericName || drug.code;
}

export function compareStockDrugsByName(a: DrugDisplayFields, b: DrugDisplayFields) {
  const nameComparison = drugDisplayName(a).localeCompare(drugDisplayName(b), "en", {
    numeric: true,
    sensitivity: "base",
  });
  if (nameComparison !== 0) return nameComparison;

  return a.code.localeCompare(b.code, "en", { numeric: true, sensitivity: "base" });
}

export function sortStockDrugsByName<T extends DrugDisplayFields>(drugs: T[]) {
  return [...drugs].sort(compareStockDrugsByName);
}

export function applyCanonicalDrugNames<T extends StockDrug>(
  drugs: readonly T[],
  canonicalDrugs: readonly CanonicalDrugDisplayFields[],
  codeAliases: Readonly<Record<string, string>> = {},
): T[] {
  const canonicalByCode = new Map(canonicalDrugs.map((drug) => [drug.code, drug]));

  return drugs.map((drug) => {
    const canonical = canonicalByCode.get(codeAliases[drug.code] ?? drug.code);
    if (!canonical) return drug;

    const productName = canonical.productName?.trim();
    const genericName = canonical.genericName?.trim();
    return {
      ...drug,
      ...(genericName ? { genericName } : {}),
      ...(productName ? { productName } : {}),
    };
  });
}

export function mergeGeneratedRooms(rooms: StockRoom[], generatedRooms: readonly StockRoom[]) {
  const generatedById = new Map(generatedRooms.map((room) => [room.id, room]));
  const savedById = new Map<string, StockRoom>();
  for (const room of rooms) {
    savedById.set(room.id, { ...(savedById.get(room.id) ?? {}), ...room });
  }
  const merged = generatedRooms.map((generated) => {
    const saved = savedById.get(generated.id);
    return {
      ...generated,
      ...saved,
      sourceUpdatedAt: saved?.sourceUpdatedAt ?? generated.sourceUpdatedAt ?? "",
    };
  });

  for (const [roomId, saved] of savedById) {
    if (!generatedById.has(roomId)) merged.push(saved);
  }

  return merged;
}

export function mergeGeneratedStockDrugs<T extends StockDrug>(
  drugs: T[],
  generatedDrugs: readonly T[],
  normalizeCode: (code: string) => string = (code) => code,
) {
  const byCode = new Map<string, T>();

  for (const drug of generatedDrugs) {
    const code = normalizeCode(drug.code);
    byCode.set(code, { ...drug, code });
  }

  for (const drug of drugs) {
    const code = normalizeCode(drug.code);
    byCode.set(code, { ...(byCode.get(code) ?? drug), ...drug, code });
  }

  return sortStockDrugsByName([...byCode.values()]);
}

export function applyPharmacyMasterToStockDrug(drug: StockDrug, master: HospitalDrugLabelRow | undefined): StockDrug {
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

export function pharmacyMasterToStockDrug(
  master: HospitalDrugLabelRow,
  normalizeCode: (code: string, fallback?: string) => string,
): StockDrug {
  const code = normalizeCode(master.code, master.name);
  return applyPharmacyMasterToStockDrug(
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

export function projectPharmacyAdditionalStockDrugs(
  stockDrugs: StockDrug[],
  pharmacyRows: HospitalDrugLabelRow[],
  generatedDrugs: readonly StockDrug[],
  normalizeCode: (code: string, fallback?: string) => string,
  isControlled: (row: HospitalDrugLabelRow) => boolean,
) {
  const existingCodes = new Set(stockDrugs.map((drug) => drug.code.toUpperCase()));
  const additions = pharmacyRows
    .filter((row) => {
      const code = normalizeCode(row.code, row.name).toUpperCase();
      return code && !existingCodes.has(code) && !isControlled(row);
    })
    .map((row) => pharmacyMasterToStockDrug(row, normalizeCode));

  return mergeGeneratedStockDrugs([...stockDrugs, ...additions], generatedDrugs, (code) => normalizeCode(code));
}

function allocationKey(roomId: string, drugCode: string) {
  return `${roomId}::${drugCode}`;
}

function normalizeAllocation(allocation: StockAllocation, normalizeCode: (code: string) => string): StockAllocation {
  return {
    roomId: allocation.roomId,
    drugCode: normalizeCode(allocation.drugCode),
    requiredQty: Number.isFinite(allocation.requiredQty) ? Math.max(0, Math.trunc(allocation.requiredQty)) : 0,
  };
}

export function reconcileGeneratedAllocations(
  allocations: StockAllocation[],
  generatedAllocations: readonly StockAllocation[],
  generatedRooms: readonly Pick<StockRoom, "id">[],
  generatedDrugs: readonly Pick<StockDrug, "code">[],
  normalizeCode: (code: string) => string = (code) => code,
) {
  const generatedKeys = new Set(
    generatedAllocations.map((allocation) => allocationKey(allocation.roomId, normalizeCode(allocation.drugCode))),
  );
  const byKey = new Map<string, StockAllocation>();

  for (const allocation of allocations) {
    const normalized = normalizeAllocation(allocation, normalizeCode);
    if (normalized.requiredQty <= 0) continue;
    if (generatedKeys.has(allocationKey(normalized.roomId, normalized.drugCode))) continue;
    byKey.set(allocationKey(normalized.roomId, normalized.drugCode), normalized);
  }

  for (const allocation of generatedAllocations) {
    const normalized = normalizeAllocation(allocation, normalizeCode);
    if (normalized.requiredQty <= 0) continue;
    byKey.set(allocationKey(normalized.roomId, normalized.drugCode), normalized);
  }

  return [...byKey.values()];
}

export function buildMasterRows(
  drugs: StockDrug[],
  allocations: StockAllocation[],
  resolveKind: (drug: StockDrug) => MasterRowKind = () => "stock",
): MasterRow[] {
  const rows = new Map<string, MasterRow>();

  for (const drug of drugs) {
    rows.set(drug.code, {
      ...drug,
      masterKind: resolveKind(drug),
      totalQuantity: 0,
      roomDetails: [],
    });
  }

  for (const allocation of allocations) {
    if (allocation.requiredQty <= 0) continue;
    const row = rows.get(allocation.drugCode);
    if (!row) continue;
    row.roomDetails.push({
      roomId: allocation.roomId,
      requiredQty: allocation.requiredQty,
    });
    row.totalQuantity += allocation.requiredQty;
  }

  return sortStockDrugsByName([...rows.values()]);
}

export function filterMasterRowsWithStock(rows: MasterRow[]) {
  return rows.filter((row) => row.totalQuantity > 0);
}

export function filterMasterRowsByKind<T extends MasterRow>(rows: readonly T[], filter: MasterRowKindFilter) {
  return rows.filter((row) => filter[row.masterKind]);
}

export function updateAllocationQuantity(
  allocations: StockAllocation[],
  roomId: string,
  drugCode: string,
  requiredQty: number,
): StockAllocation[] {
  const normalizedQty = Number.isFinite(requiredQty) ? Math.max(0, Math.trunc(requiredQty)) : 0;
  let touched = false;

  const next = allocations
    .map((allocation) => {
      if (allocation.roomId !== roomId || allocation.drugCode !== drugCode) return allocation;
      touched = true;
      return { ...allocation, requiredQty: normalizedQty };
    })
    .filter((allocation) => allocation.requiredQty > 0);

  if (!touched && normalizedQty > 0) {
    next.push({ roomId, drugCode, requiredQty: normalizedQty });
  }

  return next;
}

export function deleteAllocation(
  allocations: StockAllocation[],
  roomId: string,
  drugCode: string,
): StockAllocation[] {
  return allocations.filter((allocation) => allocation.roomId !== roomId || allocation.drugCode !== drugCode);
}

export function deleteMasterDrug(drugs: StockDrug[], allocations: StockAllocation[], drugCode: string) {
  return {
    drugs: drugs.filter((drug) => drug.code !== drugCode),
    allocations: allocations.filter((allocation) => allocation.drugCode !== drugCode),
  };
}
