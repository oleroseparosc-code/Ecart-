import { describe, expect, it } from "vitest";
import { buildRoundSummaryDraft, summarizeChecklistIssues } from "./roundSummary";

describe("round summary draft", () => {
  it("summarizes only manual notes and bad checklist rows", () => {
    const issues = summarizeChecklistIssues([
      { section: "비품약", text: "정상 확인 항목", status: "good", note: "" },
      { section: "비품약", text: "수량 일치", status: "bad", note: "잉여 약품 약제팀 반납 안내" },
      { section: "E-cart", text: "봉인지 확인", status: "bad", note: "" },
    ]);

    expect(issues).toEqual(["잉여 약품 약제팀 반납 안내", "봉인지 확인 확인 필요"]);
  });

  it("builds a concise editable draft in the uploaded form shape", () => {
    const draft = buildRoundSummaryDraft({
      inspectionPeriod: "2026년 3월 2일 ~ 3월 9일",
      stockRooms: [
        {
          id: "42W",
          label: "42병동",
          stockChecklist: [{ section: "비품약", text: "비품약 수량 일치", status: "bad", note: "수량 재확인 안내" }],
          ecartChecklist: [{ section: "E-cart", text: "하단 서랍 확인", status: "bad", note: "하단 서랍 물품 위치 재확인 안내" }],
        },
      ],
      ecartOnlyTargets: [
        {
          id: "CT실",
          label: "CT실",
          checklist: [{ section: "E-cart", text: "봉인지 확인", status: "good", note: "" }],
        },
      ],
      commonGuidance: "공통 안내",
    });

    expect(draft.title).toBe("병동 순회 점검표");
    expect(draft.rows).toEqual([
      {
        id: "stock:42W",
        roomName: "42병동",
        result: "확인 필요",
        details: "비품약: 수량 재확인 안내\nE-cart: 하단 서랍 물품 위치 재확인 안내",
      },
      {
        id: "ecart:CT실",
        roomName: "CT실",
        result: "적합",
        details: "적합",
      },
    ]);
  });
});
