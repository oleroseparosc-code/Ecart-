import { FileDown, Printer } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { HospitalDrugLabelRow } from "./hospitalDrugLabels";
import { arrangeThreeTierEntriesByAlphabetColumns, buildCabinetFullListDrafts, buildCabinetLocationDraft, buildThreeTierEntries, buildThreeTierPositionDraft, cabinetAlphabetKey, listCabinetLocations } from "./pharmacyCabinetLabels";
import { formatPharmacyExpiry, splitDoseText, type PharmacyCabinetEntry, type PharmacyCabinetLayout, type PharmacyLabelCategory, type PharmacyLabelDraft } from "./pharmacyLabelStudio";

type Props = {
  category: PharmacyLabelCategory;
  rows: HospitalDrugLabelRow[];
  onPrint: (labels: PharmacyLabelDraft[], paperKey: "A4" | "A3") => void;
};

export function PharmacyCabinetLayoutView({ layout }: { layout: PharmacyCabinetLayout }) {
  if (layout.kind === "three-tier") {
    const arrangedEntries = arrangeThreeTierEntriesByAlphabetColumns(layout.entries);
    return <div className="pharmacy-three-tier-label" aria-label={layout.title}>
      {arrangedEntries.map((entry, index) => {
        if (!entry) return <div className="pharmacy-three-tier-cell blank" aria-label="빈 칸" key={`blank-${index}`}/>;
        const nameParts = splitDoseText(entry.name);
        return <div className="pharmacy-three-tier-cell" key={entry.code}>
          <strong>{entry.doseHighlighted && nameParts.dose
            ? <>{nameParts.before}<mark className="pharmacy-three-tier-name-dose">{nameParts.dose}</mark>{nameParts.after}</>
            : entry.name}</strong>
          {entry.doseUnit && <b className={`pharmacy-three-tier-dose dose-${entry.doseUnit.replace(".", "-").toLowerCase()}`}>{entry.doseUnit === "1T" ? "" : entry.doseUnit}</b>}
        </div>;
      })}
    </div>;
  }
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
  const showsLocation = isExternalList || ["경구 고가약", "앰플", "바이알", "영양수액"].includes(layout.category);
  const compactListCategories = ["외용제", "외용점안제", "팩제", "시럽", "앰플", "바이알", "영양수액"];
  const columnCount = layout.category === "경구 고가약" ? 2 : compactListCategories.includes(layout.category) ? 4 : 3;
  const rowCount = Math.max(1, Math.ceil(layout.entries.length / columnCount));
  const gridStyle = {
    "--cabinet-list-columns": columnCount,
    "--cabinet-list-rows": rowCount,
  } as CSSProperties;
  return <div className={`pharmacy-cabinet-full-list ${isAtc ? "atc-list" : ""} ${isExternalList ? "external-list" : ""} ${isNutritionList ? "nutrition-list" : ""}`}>
    <header><strong>{layout.title}</strong><span>{layout.page} / {layout.totalPages}</span></header>
    <div className="pharmacy-cabinet-full-list-grid" style={gridStyle}>
      {layout.entries.map((entry) => <div className={`pharmacy-cabinet-full-list-row ${isAtc ? "atc-row" : ""} ${showsLocation && !isAtc ? "with-category-details" : ""}`} key={entry.code}>
        {isAtc && <em>{entry.atc || "-"}</em>}
        <div><strong>{entry.name}</strong></div>
        {isAtc
          ? <section className="pharmacy-atc-detail">{entry.reference && <b>{entry.reference}</b>}<time>{formatPharmacyExpiry(entry.expiry) || "유효기간 미입력"}</time></section>
          : showsLocation
            ? <div className="cabinet-entry-details"><b>주의: {entry.reference || "없음"}</b><em>위치: {entry.location || "미입력"}</em></div>
            : <b>{entry.reference || "-"}</b>}
      </div>)}
    </div>
  </div>;
}

export function PharmacyCabinetLabelCanvas({ category, rows, onPrint }: Props) {
  const cabinetRows = rows;
  const isThreeTierCategory = ["유색라벨", "측면라벨"].includes(category);
  const threeTierEntries = useMemo(() => isThreeTierCategory ? buildThreeTierEntries(cabinetRows, category) : [], [cabinetRows, category, isThreeTierCategory]);
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
  const locationEnabled = ["원병", "PTP", "냉장주사"].includes(category);
  const fullListCount = fullListDrafts.flatMap((draft) => draft.cabinetLayout?.entries ?? []).length;
  const fullListPageCount = fullListDrafts.length;

  if (isThreeTierCategory) {
    return <section className="pharmacy-cabinet-canvas-panel">
      <div className="pharmacy-panel-head"><div><h2>{category} 약품장 라벨</h2><p>원병과 PTP 약품을 함께 검색하여 분할용량별 라벨을 구성합니다.</p></div></div>
      <PharmacyThreeTierLocationCanvas category={category} entries={threeTierEntries} onPrint={onPrint}/>
    </section>;
  }

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
      <div className="pharmacy-cabinet-section-head"><div><h3>{category} 전체 리스트</h3><p>{category === "ATC" ? "ATC 번호를 세로 오름차순으로 정렬하고 주의·유효기간을 두 행으로 표시합니다." : category === "경구 고가약" ? "엑셀에서 경구 고가약으로 분류된 전체 약품과 등록 위치를 함께 표시합니다." : category === "영양수액" ? "A4 한 페이지의 3열 구성으로 빈 공간을 줄여 정렬합니다." : ["외용제", "외용점안제", "팩제", "시럽"].includes(category) ? "약품명, 주의 분류와 약품장 위치를 함께 표시합니다." : ["원병", "PTP"].includes(category) ? "영문 상용약품명과 주의·항암제·고가약 분류만 표시합니다." : "약품명과 주의·항암제·고가약 분류를 표시합니다."}</p></div></div>
      <div className={`pharmacy-cabinet-page-thumbnails ${fullListPageCount === 1 ? "single-page" : ""}`}>
        {fullListDrafts.map((draft) => draft.cabinetLayout && <div key={draft.id}><PharmacyCabinetLayoutView layout={draft.cabinetLayout}/></div>)}
      </div>
      <div className="pharmacy-save-row">
        <span>{fullListCount.toLocaleString("ko-KR")}개 약품 · A4 {fullListPageCount}페이지</span>
        <button type="button" className="secondary-button" disabled={fullListCount === 0} onClick={() => onPrint(fullListDrafts, "A4")}><FileDown size={16}/>PDF 미리보기</button>
        <button type="button" className="print-button" disabled={fullListCount === 0} onClick={() => onPrint(fullListDrafts, "A4")}><Printer size={16}/>전체 리스트 출력</button>
      </div>
    </section>
  </section>;
}

type ThreeTierProps = {
  category: PharmacyLabelCategory;
  entries: PharmacyCabinetEntry[];
  onPrint: Props["onPrint"];
};

export function PharmacyThreeTierLocationCanvas({ category, entries, onPrint }: ThreeTierProps) {
  const alphabet = useMemo(() => [...new Set(entries.map((entry) => cabinetAlphabetKey(entry.name)))].sort((left, right) => left.localeCompare(right, "en")), [entries]);
  const [selectedLetters, setSelectedLetters] = useState<string[]>([]);
  useEffect(() => setSelectedLetters(alphabet), [category, alphabet]);
  const allSelected = alphabet.length > 0 && alphabet.every((letter) => selectedLetters.includes(letter));
  const selectedEntries = useMemo(() => entries.filter((entry) => selectedLetters.includes(cabinetAlphabetKey(entry.name))), [entries, selectedLetters]);
  const draft = useMemo(() => selectedEntries.length ? buildThreeTierPositionDraft(selectedEntries, category) : undefined, [category, selectedEntries]);

  return <section className="pharmacy-three-tier-panel">
    <div className="pharmacy-cabinet-section-head"><div><h3>{category} 3단장 위치별 라벨</h3><p>약품 1칸 3 × 43mm · 한 줄 2칸 · 선택한 알파벳 순서로 아래로 확장</p></div></div>
    <div className="pharmacy-alphabet-filters" aria-label="약품명 첫 알파벳 선택">
      <button type="button" className={allSelected ? "active" : ""} onClick={() => setSelectedLetters(allSelected ? [] : alphabet)}>전체</button>
      {alphabet.map((letter) => <button type="button" key={letter} className={selectedLetters.includes(letter) ? "active" : ""} onClick={() => setSelectedLetters((current) => current.includes(letter) ? current.filter((value) => value !== letter) : [...current, letter])}>{letter}</button>)}
    </div>
    {draft?.cabinetLayout
      ? <div className="pharmacy-three-tier-preview"><PharmacyCabinetLayoutView layout={draft.cabinetLayout}/></div>
      : <span className="empty">출력할 알파벳을 선택하십시오.</span>}
    <div className="pharmacy-save-row"><span>{selectedEntries.length.toLocaleString("ko-KR")}개 약품</span><button type="button" className="print-button" disabled={!draft} onClick={() => draft && onPrint([draft], "A4")}><Printer size={16}/>3단장 라벨 출력</button></div>
  </section>;
}
