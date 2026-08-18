import type { StockAllocation, StockDrug, StockRoom } from "./types";

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
