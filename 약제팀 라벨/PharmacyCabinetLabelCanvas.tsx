import { FileDown, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { buildCabinetFullListDrafts, buildCabinetLocationDraft, hasDedicatedHighCostLocation, listCabinetLocations } from "./pharmacyCabinetLabels";
import { formatPharmacyExpiry, type PharmacyCabinetLayout, type PharmacyLabelCategory, type PharmacyLabelDraft } from "./pharmacyLabelStudio";

type Props = {
  category: PharmacyLabelCategory;
  rows: HospitalDrugLabelRow[];
  onPrint: (labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") => void;
};

export function PharmacyCabinetLayoutView({ layout }: { layout: PharmacyCabinetLayout }) {
  if (layout.kind === "location") {
    const blankCellCount = (layout.entries.length % 2 === 1 ? 1 : 0) + (layout.appendBlankRow === false ? 0 : 2);
    return <div className="pharmacy-cabinet-location-label" aria-label={layout.title}>
      {layout.entries.map((entry) => <div className="pharmacy-cabinet-location-cell" key={entry.code}>
        <strong>{entry.name}</strong>
        {entry.reference && <span>{entry.reference}</span>}
      </div>)}
      {Array.from({ length: blankCellCount }, (_, index) => <div className="pharmacy-cabinet-location-cell blank" aria-label="추가 빈 칸" key={`blank-${index}`}/>)}
    </div>;
  }
  const isAtc = layout.category === "ATC";
  const isExternalList = ["외용제", "외용점안제", "팩제", "시럽"].includes(layout.category);
  const isNutritionList = layout.category === "영양수액";
  return <div className={`pharmacy-cabinet-full-list ${isAtc ? "atc-list" : ""} ${isExternalList ? "external-list" : ""} ${isNutritionList ? "nutrition-list" : ""}`}>
    <header><strong>{layout.title}</strong><span>{layout.page} / {layout.totalPages}</span></header>
    <div className="pharmacy-cabinet-full-list-grid">
      {layout.entries.map((entry) => <div className={`pharmacy-cabinet-full-list-row ${isAtc ? "atc-row" : ""}`} key={entry.code}>
        {isAtc && <em>ATC {entry.atc || "-"}</em>}
        <div><strong>{entry.name}</strong></div>
        <b>{entry.reference || "-"}</b>
        {isAtc && <time>{formatPharmacyExpiry(entry.expiry) || "-"}</time>}
        {isExternalList && <em className="cabinet-entry-location">{entry.location || "위치 미입력"}</em>}
      </div>)}
    </div>
  </div>;
}

export function PharmacyCabinetLabelCanvas({ category, rows, onPrint }: Props) {
  const cabinetRows = useMemo(
    () => ["원병", "PTP"].includes(category) ? rows.filter((row) => !hasDedicatedHighCostLocation(row, category)) : rows,
    [category, rows],
  );
  const locations = useMemo(() => listCabinetLocations(cabinetRows, category), [cabinetRows, category]);
  const [location, setLocation] = useState("");
  const [paper, setPaper] = useState<"A4" | "A3">("A4");
  const allLocationsValue = "__ALL_LOCATIONS__";
  useEffect(() => setLocation((current) => current === allLocationsValue || locations.includes(current) ? current : locations[0] ?? ""), [category, locations]);
  const locationDrafts = useMemo(
    () => (location === allLocationsValue ? locations : location ? [location] : [])
      .map((selectedLocation) => buildCabinetLocationDraft(cabinetRows, category, selectedLocation)),
    [cabinetRows, category, location],
  );
  const locationDraft = locationDrafts[0];
  const fullListDrafts = useMemo(() => buildCabinetFullListDrafts(cabinetRows, category), [cabinetRows, category]);
  const highCostListDrafts = useMemo(
    () => category === "원병" ? buildCabinetFullListDrafts(rows, category, "high-cost") : [],
    [category, rows],
  );
  const locationEnabled = ["원병", "PTP", "냉장주사"].includes(category);
  const fullListCount = fullListDrafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).length;
  const fullListPageCount = fullListDrafts.length;
  const highCostCount = highCostListDrafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).length;

  return <section className="pharmacy-cabinet-canvas-panel">
    <div className="pharmacy-panel-head"><div><h2>약품장 라벨 편집 캔버스</h2><p>엑셀의 제형 유형과 위치를 기준으로 자동 구성합니다.</p></div></div>
    {locationEnabled && <section className="pharmacy-cabinet-location-section">
      <div className="pharmacy-cabinet-section-head">
        <div><h3>{category}장 위치별 라벨</h3><p>약품 1칸 5 × 60mm · 한 줄 2칸 · 마지막 빈 줄 1개</p></div>
        <label>위치 선택<select value={location} onChange={(event) => setLocation(event.target.value)}>
          <option value={allLocationsValue}>전체 위치 한 번에 출력</option>
          {locations.map((value) => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      {!locationDraft || locationDraft.cabinetLayout?.entries.length === 0
        ? <span className="empty">위치가 등록된 약품이 없습니다.</span>
        : <div className={`pharmacy-cabinet-preview-shell ${locationDrafts.length > 1 ? "multiple" : ""}`}>
          {locationDrafts.map((selectedDraft) => selectedDraft.cabinetLayout && <div key={selectedDraft.id}><PharmacyCabinetLayoutView layout={selectedDraft.cabinetLayout}/></div>)}
        </div>}
      <div className="pharmacy-save-row">
        <span>{locationDrafts.length.toLocaleString("ko-KR")}개 위치 · 알파벳 내림차순</span>
        <div className="pharmacy-paper-mini"><button type="button" className={paper === "A4" ? "active" : ""} onClick={() => setPaper("A4")}>A4</button><button type="button" className={paper === "A3" ? "active" : ""} onClick={() => setPaper("A3")}>A3</button></div>
        <button type="button" className="secondary-button" disabled={!locationDrafts.length} onClick={() => onPrint(locationDrafts, paper)}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={!locationDrafts.length} onClick={() => onPrint(locationDrafts, paper)}><Printer size={16}/>{location === allLocationsValue ? "전체 위치 출력" : "위치 라벨 출력"}</button>
      </div>
    </section>}
    <section className="pharmacy-cabinet-full-section">
      <div className="pharmacy-cabinet-section-head"><div><h3>{category} 전체 리스트</h3><p>{category === "ATC" ? "ATC 번호 올림차순으로 정렬하고 유효기간을 고정 위치에 표시합니다." : category === "영양수액" ? "A4 한 페이지의 3열 구성으로 빈 공간을 줄여 정렬합니다." : ["외용제", "외용점안제", "팩제", "시럽"].includes(category) ? "약품명, 주의 분류와 약품장 위치를 함께 표시합니다." : ["원병", "PTP"].includes(category) ? "영문 상용약품명과 주의·항암제·고가약 분류만 표시합니다." : "약품명과 주의·항암제·고가약 분류를 표시합니다."}</p></div></div>
      <div className={`pharmacy-cabinet-page-thumbnails ${fullListPageCount === 1 ? "single-page" : ""}`}>
        {fullListDrafts.map((draft) => draft.cabinetLayout && <div key={draft.id}><PharmacyCabinetLayoutView layout={draft.cabinetLayout}/></div>)}
      </div>
      <div className="pharmacy-save-row">
        <span>{fullListCount.toLocaleString("ko-KR")}개 약품 · A4 {fullListPageCount}페이지</span>
        <button type="button" className="secondary-button" disabled={fullListCount === 0} onClick={() => onPrint(fullListDrafts, "A4")}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={fullListCount === 0} onClick={() => onPrint(fullListDrafts, "A4")}><Printer size={16}/>전체 리스트 출력</button>
      </div>
    </section>
    {category === "원병" && <section className="pharmacy-cabinet-full-section high-cost-list-section">
      <div className="pharmacy-cabinet-section-head"><div><h3>원병 고가약 별도 리스트</h3><p>원병 전체 리스트에서 고가약을 분리하여 별도 목록으로 출력합니다.</p></div></div>
      <div className="pharmacy-cabinet-page-thumbnails single-page">
        {highCostListDrafts.map((selectedDraft) => selectedDraft.cabinetLayout && <div key={selectedDraft.id}><PharmacyCabinetLayoutView layout={selectedDraft.cabinetLayout}/></div>)}
      </div>
      <div className="pharmacy-save-row">
        <span>{highCostCount.toLocaleString("ko-KR")}개 고가약</span>
        <button type="button" className="secondary-button" disabled={highCostCount === 0} onClick={() => onPrint(highCostListDrafts, "A4")}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={highCostCount === 0} onClick={() => onPrint(highCostListDrafts, "A4")}><Printer size={16}/>고가약 리스트 출력</button>
      </div>
    </section>}
  </section>;
}
