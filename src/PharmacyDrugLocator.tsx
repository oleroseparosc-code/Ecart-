import { useMemo, useState } from "react";

export type LocatorDrug = {
  code: string;
  itemCode?: string;
  name: string;
  koreanName: string;
  strength: string;
  drugType: string;
  storage: string;
  location?: string;
  imagePath?: string;
  highRisk?: boolean;
  hazardous?: boolean;
  similarLook?: boolean;
  similarSound?: boolean;
  doseCaution?: boolean;
  doseCheck?: boolean;
  nameCaution?: boolean;
  lightProtected?: boolean;
};

type Props = { rows: LocatorDrug[]; isLoading: boolean };

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function warningLabels(row: LocatorDrug) {
  const storage = compact(row.storage);
  return [
    row.hazardous ? "위해의약품" : "",
    row.highRisk ? "고위험의약품" : "",
    row.doseCaution ? "용량주의" : "",
    row.doseCheck ? "용량확인" : "",
    row.similarSound ? "유사발음" : "",
    row.similarLook ? "유사모양" : "",
    row.nameCaution ? "이름주의" : "",
    row.lightProtected || storage.includes("차광") ? "차광" : "",
    storage.includes("냉동") ? "냉동 보관" : "",
    storage.includes("냉장") || /2[-~]?8/.test(storage) ? "냉장 보관" : "",
  ].filter(Boolean);
}

export function PharmacyDrugLocator({ rows, isLoading }: Props) {
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const matches = useMemo(() => {
    const keyword = compact(query);
    if (!keyword) return [];
    return rows.filter((row) => compact([row.code, row.itemCode ?? "", row.name, row.koreanName, row.strength, row.location ?? ""].join(" ")).includes(keyword)).slice(0, 12);
  }, [query, rows]);
  const selected = matches.find((row) => row.code === selectedCode) ?? matches[0];
  const warnings = selected ? warningLabels(selected) : [];
  const locationParts = (selected?.location ?? "").split("-").map((part) => part.trim()).filter(Boolean);

  return (
    <main style={{ minHeight: "100vh", background: "#F5F5F0", color: "#3D3833", padding: "24px 16px 48px" }}>
      <section style={{ width: "min(100%, 720px)", margin: "0 auto" }}>
        <p style={{ margin: 0, color: "#8C7A6B", fontWeight: 700, letterSpacing: "0.08em", fontSize: 12 }}>PHARMACY DRUG LOCATOR</p>
        <h1 style={{ margin: "8px 0", fontSize: 28, lineHeight: 1.25 }}>약품 위치 찾기</h1>
        <p style={{ margin: 0, color: "#8C7A6B" }}>약품코드·상용약품명·한글약품명·라벨 위치 코드로 검색합니다.</p>
        <label style={{ display: "block", marginTop: 24 }}>
          <span style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>약품 검색</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedCode(""); }} placeholder="예: XNAK20, Lidocaine, V4-L-5" style={{ boxSizing: "border-box", width: "100%", border: "2px solid #A9B5C0", borderRadius: 12, padding: "14px 16px", fontSize: 16, color: "#3D3833", background: "#fff" }} />
        </label>
        {isLoading ? <p style={{ color: "#8C7A6B" }}>약품 마스터를 불러오는 중입니다.</p> : null}
        {!isLoading && query && matches.length === 0 ? <p style={{ color: "#8C7A6B" }}>일치하는 약품이 없습니다.</p> : null}
        {matches.length > 1 ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{matches.map((row) => <button key={row.code} type="button" onClick={() => setSelectedCode(row.code)} style={{ textAlign: "left", border: row.code === selected?.code ? "2px solid #E8843C" : "1px solid #ddd", borderRadius: 10, background: "#fff", padding: 12, color: "#3D3833" }}><strong>{row.name}</strong><br /><small>{row.code} · {row.location || "위치 미등록"}</small></button>)}</div> : null}
        {selected ? <article style={{ marginTop: 20, background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 18px rgba(61,56,51,0.1)" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {selected.imagePath ? <img src={selected.imagePath} alt={`${selected.name} 약품 이미지`} style={{ width: 96, height: 96, objectFit: "contain", background: "#F5F5F0", borderRadius: 10 }} /> : null}
            <div><p style={{ margin: 0, color: "#8C7A6B", fontSize: 13 }}>{selected.code}</p><h2 style={{ margin: "4px 0", fontSize: 22 }}>{selected.name}</h2><p style={{ margin: 0, color: "#8C7A6B" }}>{[selected.koreanName, selected.strength, selected.drugType].filter(Boolean).join(" · ")}</p></div>
          </div>
          <section style={{ marginTop: 20, padding: 16, background: "#FFF6EF", borderRadius: 12 }}><p style={{ margin: 0, color: "#8C7A6B", fontWeight: 700, fontSize: 13 }}>현재 약품 위치</p><strong style={{ display: "block", marginTop: 4, color: "#E8843C", fontSize: 24 }}>{selected.location || "위치 미등록"}</strong><p style={{ margin: "8px 0 0", color: "#8C7A6B", fontSize: 14 }}>보관 조건: {selected.storage || "마스터 미등록"}</p></section>
          <section aria-label="3D 위치 안내" style={{ marginTop: 20 }}><p style={{ margin: "0 0 8px", fontWeight: 700 }}>3D 위치 안내</p><div style={{ position: "relative", height: 148, borderRadius: 14, overflow: "hidden", background: "linear-gradient(145deg, #A9B5C0, #7D8D9B)", perspective: 500 }}><div style={{ position: "absolute", inset: "28px 20px 16px", transform: "rotateX(58deg) rotateZ(-28deg)", transformStyle: "preserve-3d" }}>{[0, 1, 2].map((shelf) => <div key={shelf} style={{ position: "absolute", left: 0, right: 0, top: shelf * 31, height: 21, background: "#F5F5F0", border: "2px solid #8C7A6B", boxShadow: "0 10px 0 rgba(61,56,51,0.22)" }} />)}<div style={{ position: "absolute", left: "52%", top: 31, width: 38, height: 21, background: "#E8843C", border: "2px solid #fff", boxShadow: "0 0 0 4px rgba(232,132,60,0.28)" }} /></div><span style={{ position: "absolute", left: 14, bottom: 12, color: "#fff", fontWeight: 700 }}>{locationParts.length ? locationParts.join(" › ") : "좌표 도면 미등록"}</span></div><p style={{ margin: "8px 0 0", color: "#8C7A6B", fontSize: 12 }}>위치 코드를 기준으로 표시한 선반 안내입니다. 실제 도면 좌표를 등록하면 병동·약품장별 3D 지도와 연결할 수 있습니다.</p></section>
          {warnings.length ? <section style={{ marginTop: 20 }}><p style={{ margin: "0 0 8px", fontWeight: 700 }}>주의사항</p><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{warnings.map((warning) => <span key={warning} style={{ borderRadius: 999, padding: "6px 10px", background: "#E8843C", color: "#fff", fontSize: 13, fontWeight: 700 }}>{warning}</span>)}</div></section> : null}
        </article> : null}
      </section>
    </main>
  );
}
