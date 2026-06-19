export type SummaryCheckStatus = "" | "good" | "bad";

export type SummaryChecklistItem = {
  section: string;
  text: string;
  status?: SummaryCheckStatus;
  note?: string;
};

export type StockSummaryInput = {
  id: string;
  label: string;
  stockChecklist: SummaryChecklistItem[];
  ecartChecklist?: SummaryChecklistItem[];
};

export type EcartOnlySummaryInput = {
  id: string;
  label: string;
  checklist: SummaryChecklistItem[];
};

export type RoundSummaryRow = {
  id: string;
  roomName: string;
  result: string;
  details: string;
};

export type RoundSummaryDraft = {
  title: string;
  inspectionPeriod: string;
  rows: RoundSummaryRow[];
  commonGuidance: string;
  closingNote: string;
};

export type RoundSummaryInput = {
  inspectionPeriod: string;
  stockRooms: StockSummaryInput[];
  ecartOnlyTargets: EcartOnlySummaryInput[];
  commonGuidance: string;
};

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function summarizeChecklistIssues(items: SummaryChecklistItem[]) {
  return unique(
    items.flatMap((item) => {
      const note = cleanText(item.note ?? "");
      if (note) return [note];
      if (item.status === "bad") return [`${cleanText(item.text)} 확인 필요`];
      return [];
    }),
  );
}

function formatDetails(stockIssues: string[], ecartIssues: string[]) {
  const lines = [
    ...stockIssues.map((issue) => `비품약: ${issue}`),
    ...ecartIssues.map((issue) => `E-cart: ${issue}`),
  ];

  return lines.length > 0 ? lines.join("\n") : "적합";
}

export function buildRoundSummaryDraft(input: RoundSummaryInput): RoundSummaryDraft {
  const stockRows = input.stockRooms.map((room): RoundSummaryRow => {
    const stockIssues = summarizeChecklistIssues(room.stockChecklist);
    const ecartIssues = summarizeChecklistIssues(room.ecartChecklist ?? []);
    const details = formatDetails(stockIssues, ecartIssues);

    return {
      id: `stock:${room.id}`,
      roomName: room.label,
      result: details === "적합" ? "적합" : "확인 필요",
      details,
    };
  });

  const ecartOnlyRows = input.ecartOnlyTargets.map((target): RoundSummaryRow => {
    const ecartIssues = summarizeChecklistIssues(target.checklist);
    const details = formatDetails([], ecartIssues);

    return {
      id: `ecart:${target.id}`,
      roomName: target.label,
      result: details === "적합" ? "적합" : "확인 필요",
      details,
    };
  });

  return {
    title: "병동 순회 점검표",
    inspectionPeriod: input.inspectionPeriod,
    rows: [...stockRows, ...ecartOnlyRows],
    commonGuidance: input.commonGuidance,
    closingNote: "간호부의 지속적이고 적극적인 협조 항상 감사드립니다.",
  };
}
