import { FileDown, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { buildCabinetFullListDrafts, buildCabinetLocationDraft, listCabinetLocations } from "./pharmacyCabinetLabels";
import { formatPharmacyExpiry, type PharmacyCabinetLayout, type PharmacyLabelCategory, type PharmacyLabelDraft } from "./pharmacyLabelStudio";

type Props = {
  category: PharmacyLabelCategory;
  rows: HospitalDrugLabelRow[];
  onPrint: (labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") => void;
};

export function PharmacyCabinetLayoutView({ layout }: { layout: PharmacyCabinetLayout }) {
  if (layout.kind === "location") {
    return <div className="pharmacy-cabinet-location-label" aria-label={layout.title}>
      {layout.entries.map((entry) => <div className="pharmacy-cabinet-location-cell" key={entry.code}>
        <strong>{entry.name}</strong>
        {entry.reference && <span>{entry.reference}</span>}
      </div>)}
      <div className="pharmacy-cabinet-location-cell blank" aria-label="추가 빈 칸"/>
      <div className="pharmacy-cabinet-location-cell blank" aria-label="추가 빈 칸"/>
    </div>;
  }
  return <div className="pharmacy-cabinet-full-list">
    <header><strong>{layout.title}</strong><span>{layout.page} / {layout.totalPages}</span></header>
    <div className="pharmacy-cabinet-full-list-grid">
      {layout.entries.map((entry) => <div className="pharmacy-cabinet-full-list-row" key={entry.code}>
        <div><strong>{entry.name}</strong>{entry.koreanName && <small>{entry.koreanName}</small>}</div>
        <b>{entry.reference || "-"}</b>
        {entry.atc && <em>ATC {entry.atc}</em>}
        {entry.expiry && <time>{formatPharmacyExpiry(entry.expiry)}</time>}
      </div>)}
    </div>
  </div>;
}

export function PharmacyCabinetLabelCanvas({ category, rows, onPrint }: Props) {
  const locations = useMemo(() => listCabinetLocations(rows), [rows]);
  const [location, setLocation] = useState("");
  useEffect(() => setLocation((current) => locations.includes(current) ? current : locations[0] ?? ""), [category, locations]);
  const locationDraft = useMemo(
    () => location ? buildCabinetLocationDraft(rows, category, location) : undefined,
    [category, location, rows],
  );
  const fullListDrafts = useMemo(() => buildCabinetFullListDrafts(rows, category), [category, rows]);
  const locationEnabled = ["원병", "PTP"].includes(category);

  return <section className="pharmacy-cabinet-canvas-panel">
    <div className="pharmacy-panel-head"><div><h2>약품장 라벨 편집 캔버스</h2><p>엑셀의 제형 유형과 위치를 기준으로 자동 구성합니다.</p></div></div>
    {locationEnabled && <section className="pharmacy-cabinet-location-section">
      <div className="pharmacy-cabinet-section-head">
        <div><h3>{category}장 위치별 라벨</h3><p>약품 1칸 5 × 60mm · 한 줄 2칸 · 마지막 빈 줄 1개</p></div>
        <label>위치 선택<select value={location} onChange={(event) => setLocation(event.target.value)}>
          {locations.map((value) => <option key={value}>{value}</option>)}
        </select></label>
      </div>
      {!locationDraft || locationDraft.cabinetLayout?.entries.length === 0
        ? <span className="empty">위치가 등록된 약품이 없습니다.</span>
        : <div className="pharmacy-cabinet-preview-shell"><PharmacyCabinetLayoutView layout={locationDraft.cabinetLayout}/></div>}
      <div className="pharmacy-save-row">
        <span>{locationDraft?.cabinetLayout?.entries.length ?? 0}개 약품 · 알파벳 내림차순</span>
        <button type="button" className="secondary-button" disabled={!locationDraft} onClick={() => locationDraft && onPrint([locationDraft], "A4")}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={!locationDraft} onClick={() => locationDraft && onPrint([locationDraft], "A4")}><Printer size={16}/>위치 라벨 출력</button>
      </div>
    </section>}
    <section className="pharmacy-cabinet-full-section">
      <div className="pharmacy-cabinet-section-head"><div><h3>{category} 전체 리스트</h3><p>A4 2장에 약품명, 주의·항암제·고가약 분류{category === "ATC" ? ", ATC 번호와 유효기간을" : "를"} 표시합니다.</p></div></div>
      <div className="pharmacy-cabinet-page-thumbnails">
        {fullListDrafts.map((draft) => draft.cabinetLayout && <div key={draft.id}><PharmacyCabinetLayoutView layout={draft.cabinetLayout}/></div>)}
      </div>
      <div className="pharmacy-save-row">
        <span>{rows.length.toLocaleString("ko-KR")}개 약품 · A4 2페이지</span>
        <button type="button" className="secondary-button" disabled={rows.length === 0} onClick={() => onPrint(fullListDrafts, "A4")}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={rows.length === 0} onClick={() => onPrint(fullListDrafts, "A4")}><Printer size={16}/>전체 리스트 출력</button>
      </div>
    </section>
  </section>;
}
