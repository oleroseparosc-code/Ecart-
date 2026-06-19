export type StockDrug = {
  code: string;
  genericName: string;
  productName: string;
  spec: string;
  storage: string;
  note: string;
  warning: string;
  storageType: "ROOM" | "REFRIGERATED" | "LIGHT_PROTECTED";
};

export type StockRoom = {
  id: string;
  label: string;
  sourceColumn: string;
  sourceSheet: string;
  sourceUpdatedAt: string;
  allocationCount: number;
  totalQuantity: number;
};

export type StockAllocation = {
  roomId: string;
  drugCode: string;
  requiredQty: number;
};

export type EcartItem = {
  id: string;
  code: string;
  name: string;
  dosage: string;
  quantity: number;
};

export type ChecklistItem = {
  section: string;
  text: string;
};

export type InventoryData = {
  generatedAt: string;
  sourceFiles: {
    stockWorkbook: string;
    ecartWorkbook: string;
    checklistWorkbook: string;
  };
  summary: {
    stockDrugCount: number;
    stockRoomCount: number;
    stockAllocationCount: number;
    ecartGeneralItemCount: number;
    ecartNicuItemCount: number;
    ecartDepartmentCount: number;
    checklistItemCount: number;
  };
  stock: {
    drugs: StockDrug[];
    rooms: StockRoom[];
    allocations: StockAllocation[];
  };
  ecart: {
    generalItems: EcartItem[];
    nicuItems: EcartItem[];
    departments: string[];
  };
  checklist: ChecklistItem[];
};
