import { useEffect, useMemo, useRef, useState } from "react";

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
  needsDiluent?: boolean;
  needsNeedle?: boolean;
  ampouleHolder?: string;
};

type Props = { rows: LocatorDrug[]; isLoading: boolean };
type WarningTone = "caution" | "light" | "cold";
type WarningBadge = { label: string; tone: WarningTone };

const WARNING_COLORS: Record<WarningTone, string> = {
  caution: "#C62828",
  light: "#2E7D32",
  cold: "#4BA3D8",
};

const LOCATOR_IMAGE_OVERRIDES: Record<string, string> = {
  RAMOSET: "ward-drug-images/health-a11aggggg5333-324c72e30d05a52a.jpg",
  XRAMOSET: "ward-drug-images/health-a11aggggg5334-4979210fd5ac1e56.jpg",
  EDOXA1: "ward-drug-images/health-2015082600012-63dafded3c5477a8.jpg",
  EDOXA3: "ward-drug-images/health-2015082600012-63dafded3c5477a8.jpg",
  EDOXA6: "ward-drug-images/health-2015082600012-63dafded3c5477a8.jpg",
};

function compact(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function preparationNotes(row: Pick<LocatorDrug, "needsDiluent" | "needsNeedle" | "ampouleHolder">) {
  return [
    row.needsDiluent ? "용해액 필요" : "",
    row.needsNeedle ? "니들 필요" : "",
    row.ampouleHolder?.trim().toUpperCase() === "Y" ? "앰플꽂이 필요" : "",
  ].filter(Boolean);
}

function compactName(value: string) {
  return compact(value).replace(/[^0-9a-z가-힣]/g, "");
}

function nameTokens(value: string) {
  return compact(value)
    .replace(/([a-z가-힣])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z가-힣])/g, "$1 $2")
    .split(/[^0-9a-z가-힣.]+/)
    .map(compactName)
    .filter((token) => token.length >= 3 && !["inj", "tab", "cap", "syr", "soln"].includes(token));
}

function isOneCharacterOcrDifference(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return true;
}

export function findRecognizedDrug(rows: LocatorDrug[], recognizedText: string) {
  const recognizedName = compactName(recognizedText);
  const recognizedTokens = nameTokens(recognizedText);
  if (!recognizedName) return undefined;
  const exact = rows.find((row) => [row.name, row.koreanName].some((name) => {
    const candidate = compactName(name);
    return candidate.length >= 4 && recognizedName.includes(candidate);
  }));
  if (exact) return exact;

  return rows
    .map((row) => ({
      row,
      score: [...new Set([row.name, row.koreanName].flatMap(nameTokens))]
        .filter((token) => recognizedName.includes(token) || recognizedTokens.some((recognizedToken) => token.length >= 5 && isOneCharacterOcrDifference(token, recognizedToken)))
        .reduce((total, token) => total + token.length, 0),
    }))
    .filter(({ score }) => score >= 5)
    .sort((left, right) => right.score - left.score)[0]?.row;
}

export function selectDefaultDrug(rows: LocatorDrug[], selectedCode: string) {
  const normalizedSelectedCode = selectedCode.trim().toUpperCase();
  return rows.find((row) => row.code.trim().toUpperCase() === normalizedSelectedCode) ?? rows[0];
}

function resolveImageUrl(row?: Pick<LocatorDrug, "code" | "imagePath">) {
  const imagePath = row?.imagePath || LOCATOR_IMAGE_OVERRIDES[row?.code.trim().toUpperCase() ?? ""];
  if (!imagePath) return "";
  if (/^(https?:|data:)/i.test(imagePath)) return imagePath;
  return `${import.meta.env.BASE_URL}${imagePath.replace(/^\.?\//, "")}`;
}

function warningBadges(row: LocatorDrug): WarningBadge[] {
  const storage = compact(row.storage);
  return [
    row.hazardous ? { label: "위해의약품", tone: "caution" } : null,
    row.highRisk ? { label: "고위험의약품", tone: "caution" } : null,
    row.doseCaution ? { label: "용량주의", tone: "caution" } : null,
    row.doseCheck ? { label: "용량확인", tone: "caution" } : null,
    row.similarSound ? { label: "유사발음", tone: "caution" } : null,
    row.similarLook ? { label: "유사모양", tone: "caution" } : null,
    row.nameCaution ? { label: "이름주의", tone: "caution" } : null,
    row.lightProtected || storage.includes("차광") ? { label: "차광", tone: "light" } : null,
    storage.includes("냉동") ? { label: "냉동 보관", tone: "cold" } : null,
    storage.includes("냉장") || /2[-~]?8/.test(storage) ? { label: "냉장 보관", tone: "cold" } : null,
  ].filter((badge): badge is WarningBadge => badge !== null);
}

export function PharmacyDrugLocator({ rows, isLoading }: Props) {
  const [screen, setScreen] = useState<"scan" | "search">("scan");
  const [query, setQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [cameraState, setCameraState] = useState<"idle" | "ready" | "error">("idle");
  const [cameraMessage, setCameraMessage] = useState("카메라를 연결하면 라벨 인식 영역이 표시됩니다.");
  const [scannedDrug, setScannedDrug] = useState<LocatorDrug | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const matches = useMemo(() => {
    const keyword = compact(query);
    if (!keyword) return [];
    return rows.filter((row) => compact([row.code, row.itemCode ?? "", row.name, row.koreanName, row.strength, row.location ?? ""].join(" ")).includes(keyword)).slice(0, 12);
  }, [query, rows]);
  const selected = selectDefaultDrug(matches, selectedCode);
  const warnings = selected ? warningBadges(selected) : [];
  const selectedPreparationNotes = selected ? preparationNotes(selected) : [];
  const locationParts = (selected?.location ?? "").split("-").map((part) => part.trim()).filter(Boolean);
  const imageUrl = resolveImageUrl(selected);
  const scannedWarnings = scannedDrug ? warningBadges(scannedDrug) : [];
  const scannedPreparationNotes = scannedDrug ? preparationNotes(scannedDrug) : [];

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("error");
      setCameraMessage("이 브라우저에서는 카메라를 사용할 수 없습니다. 휴대폰 Chrome 또는 Safari에서 열어 주세요.");
      return;
    }
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setScannedDrug(null);
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = nextStream;
      setStream(nextStream);
      setCameraState("ready");
      setCameraMessage("카메라가 연결되었습니다. 라벨이 프레임 안에 들어오도록 맞춰 주세요.");
    } catch {
      setCameraState("error");
      setCameraMessage("카메라 권한이 필요합니다. 브라우저의 카메라 접근을 허용해 주세요.");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    setCameraState("idle");
    setCameraMessage("카메라 연결이 종료되었습니다.");
  }

  async function recognizeLabelText() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraMessage("카메라 영상이 준비된 후 다시 시도해 주세요.");
      return;
    }
    const crops = [
      { top: Math.round(video.videoHeight * 0.18), height: Math.round(video.videoHeight * 0.64) },
      { top: Math.round(video.videoHeight * 0.65), height: Math.round(video.videoHeight * 0.35) },
    ];
    setIsRecognizing(true);
    setScannedDrug(null);
    setCameraMessage("라벨의 상용명 문자를 읽는 중입니다.");
    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      worker = await createWorker(["kor", "eng"]);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      let matched: LocatorDrug | undefined;
      const recognizedTexts: string[] = [];
      for (const crop of crops) {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth * 2;
        canvas.height = crop.height * 2;
        const context = canvas.getContext("2d");
        if (!context) continue;
        context.filter = "grayscale(1) contrast(1.6)";
        context.drawImage(video, 0, crop.top, video.videoWidth, crop.height, 0, 0, canvas.width, canvas.height);
        const { data } = await worker.recognize(canvas);
        recognizedTexts.push(data.text);
        matched = findRecognizedDrug(rows, data.text) ?? findRecognizedDrug(rows, recognizedTexts.join(" "));
        if (matched) break;
      }
      if (!matched) {
        setCameraMessage("상용명 문자를 읽었지만 등록 약품과 일치하지 않습니다. 라벨 전체가 선명하게 보이도록 다시 촬영해 주세요.");
        return;
      }
      setScannedDrug(matched);
      setCameraMessage(`${matched.name} 라벨을 인식했습니다.`);
    } catch {
      setCameraMessage("라벨 문자 인식에 실패했습니다. 네트워크 연결과 카메라 초점을 확인한 후 다시 시도해 주세요.");
    } finally {
      await worker?.terminate();
      setIsRecognizing(false);
    }
  }

  function openScannedDrug() {
    if (!scannedDrug) return;
    stopCamera();
    setQuery(scannedDrug.code);
    setSelectedCode(scannedDrug.code);
    setScreen("search");
  }

  if (screen === "scan") {
    return (
      <main style={{ minHeight: "100vh", background: "#161514", color: "#fff", display: "flex", justifyContent: "center" }}>
        <section style={{ width: "min(100%, 480px)", minHeight: "100vh", display: "flex", flexDirection: "column", background: "#161514" }}>
          <header style={{ padding: "22px 20px 16px", background: "#F5F5F0", color: "#3D3833" }}>
            <p style={{ margin: 0, color: "#8C7A6B", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em" }}>PHARMACY DRUG LOCATOR</p>
            <h1 style={{ margin: "5px 0 0", fontSize: 24 }}>약품 라벨 스캔</h1>
            <p style={{ margin: "6px 0 0", color: "#8C7A6B", fontSize: 13 }}>라벨의 분류와 약품명이 보이도록 맞춰 주세요.</p>
          </header>
          <div style={{ position: "relative", flex: 1, minHeight: 420, overflow: "hidden", background: "linear-gradient(145deg, #444, #111)" }}>
            {stream ? <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20 }}>
              <div style={{ width: "92%", aspectRatio: "100 / 61", position: "relative", border: "3px solid #E8843C", borderRadius: 14, boxShadow: "0 0 0 999px rgba(0,0,0,0.28)", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: 0, top: 0, width: "35%", height: "20%", background: "rgba(169,181,192,0.48)", borderRight: "1px dashed #fff", borderBottom: "1px dashed #fff", padding: 6, fontSize: 11, fontWeight: 700 }}>분류 참고 영역</div>
                <div style={{ position: "absolute", left: 0, top: "20%", width: "100%", height: "60%", background: "rgba(232,132,60,0.28)", borderTop: "1px dashed #fff", borderBottom: "1px dashed #fff", padding: 6, fontSize: 11, fontWeight: 700 }}>앰플 상용명 문자 인식 영역</div>
                <div style={{ position: "absolute", left: "44%", top: "31%", width: 44, height: 44, borderRadius: "50%", background: "#E8843C", display: "grid", placeItems: "center", boxShadow: "0 0 0 6px rgba(232,132,60,0.24)" }}>⌁</div>
              </div>
            </div>
            {scannedDrug ? <button type="button" onClick={openScannedDrug} style={{ position: "absolute", left: 20, right: 20, top: 20, border: "2px solid #fff", borderRadius: 14, padding: 14, background: "#1F7A4D", color: "#fff", textAlign: "left", boxShadow: "0 4px 14px rgba(0,0,0,0.3)" }}>
              <strong style={{ display: "block", fontSize: 16 }}>라벨 인식 완료</strong>
              <span style={{ display: "block", marginTop: 4, fontSize: 17, fontWeight: 700 }}>{scannedDrug.name}</span>
              <small style={{ display: "block", marginTop: 3, opacity: 0.9 }}>{[scannedDrug.koreanName, scannedDrug.strength, scannedDrug.drugType].filter(Boolean).join(" · ")}</small>
              <span style={{ display: "block", marginTop: 9, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,0.35)", fontSize: 14 }}><strong>위치</strong> {scannedDrug.location || "위치 미등록"}</span>
              {scannedWarnings.length > 0 || scannedPreparationNotes.length > 0 ? <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>{[...scannedWarnings.map((warning) => warning.label), ...scannedPreparationNotes].map((label) => <span key={label} style={{ borderRadius: 999, padding: "4px 8px", background: "rgba(255,255,255,0.2)", fontSize: 12, fontWeight: 700 }}>{label}</span>)}</span> : null}
              <small style={{ display: "block", marginTop: 9, textDecoration: "underline" }}>상세 결과 보기</small>
            </button> : null}
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, padding: 14, borderRadius: 12, background: "rgba(0,0,0,0.65)", fontSize: 14 }}>{cameraMessage}</div>
          </div>
          <footer style={{ padding: "18px 20px 28px", background: "#A9B5C0", display: "grid", gap: 10 }}>
            <button type="button" onClick={cameraState === "ready" ? stopCamera : startCamera} style={{ border: 0, borderRadius: 14, padding: "16px", background: "#E8843C", color: "#fff", fontSize: 17, fontWeight: 700 }}>{cameraState === "ready" ? "카메라 종료" : "카메라 연결"}</button>
            {cameraState === "ready" ? <button type="button" onClick={() => void recognizeLabelText()} disabled={isRecognizing} style={{ border: "2px solid #fff", borderRadius: 14, padding: "13px", background: isRecognizing ? "rgba(255,255,255,0.35)" : "#1F7A4D", color: "#fff", fontSize: 15, fontWeight: 700 }}>{isRecognizing ? "상용명 문자 인식 중…" : "라벨 상용명 문자 인식"}</button> : null}
            <button type="button" onClick={() => { stopCamera(); setScreen("search"); }} style={{ border: "2px solid #fff", borderRadius: 14, padding: "13px", background: "transparent", color: "#fff", fontSize: 15, fontWeight: 700 }}>약품명 또는 위치 코드로 검색</button>
            <p style={{ margin: 0, color: "#3D3833", fontSize: 12, textAlign: "center" }}>라벨의 상용명이 선명하게 보이도록 맞춘 뒤 문자 인식을 누르면 등록 약품을 표시합니다.</p>
          </footer>
        </section>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F5F5F0", color: "#3D3833", padding: "24px 16px 48px" }}>
      <section style={{ width: "min(100%, 720px)", margin: "0 auto" }}>
        <p style={{ margin: 0, color: "#8C7A6B", fontWeight: 700, letterSpacing: "0.08em", fontSize: 12 }}>PHARMACY DRUG LOCATOR</p>
        <h1 style={{ margin: "8px 0", fontSize: 28, lineHeight: 1.25 }}>약품 위치 찾기</h1>
        <p style={{ margin: 0, color: "#8C7A6B" }}>약품코드·상용약품명·한글약품명·라벨 위치 코드로 검색합니다.</p>
        <button type="button" onClick={() => setScreen("scan")} style={{ marginTop: 14, border: "1px solid #8C7A6B", borderRadius: 999, background: "#fff", color: "#3D3833", padding: "8px 12px", fontWeight: 700 }}>카메라 스캔 화면으로 돌아가기</button>
        <label style={{ display: "block", marginTop: 24 }}>
          <span style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>약품 검색</span>
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedCode(""); }} placeholder="예: XNAK20, Lidocaine, V4-L-5" style={{ boxSizing: "border-box", width: "100%", border: "2px solid #A9B5C0", borderRadius: 12, padding: "14px 16px", fontSize: 16, color: "#3D3833", background: "#fff" }} />
        </label>
        {isLoading ? <p style={{ color: "#8C7A6B" }}>약품 마스터를 불러오는 중입니다.</p> : null}
        {!isLoading && query && matches.length === 0 ? <p style={{ color: "#8C7A6B" }}>일치하는 약품이 없습니다.</p> : null}
        {matches.length > 1 ? <div style={{ display: "grid", gap: 8, marginTop: 12 }}>{matches.map((row) => <button key={row.code} type="button" onClick={() => setSelectedCode(row.code)} style={{ textAlign: "left", border: row.code === selected?.code ? "2px solid #E8843C" : "1px solid #ddd", borderRadius: 10, background: "#fff", padding: 12, color: "#3D3833" }}><strong>{row.name}</strong><br /><small>{row.code} · {row.location || "위치 미등록"}{row.ampouleHolder?.trim().toUpperCase() === "Y" ? " · 앰플꽂이 필요" : ""}</small></button>)}</div> : null}
        {selected ? <article style={{ marginTop: 20, background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 4px 18px rgba(61,56,51,0.1)" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {imageUrl ? <img src={imageUrl} alt={`${selected.name} 약품 이미지`} style={{ width: 96, height: 96, objectFit: "contain", background: "#F5F5F0", borderRadius: 10 }} /> : null}
            <div><p style={{ margin: 0, color: "#8C7A6B", fontSize: 13 }}>{selected.code}</p><h2 style={{ margin: "4px 0", fontSize: 22 }}>{selected.name}</h2><p style={{ margin: 0, color: "#8C7A6B" }}>{[selected.koreanName, selected.strength, selected.drugType].filter(Boolean).join(" · ")}</p></div>
          </div>
          {warnings.length || selectedPreparationNotes.length ? <section style={{ marginTop: 20 }}><p style={{ margin: "0 0 8px", fontWeight: 700 }}>주의사항</p>{warnings.length ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{warnings.map((warning) => <span key={warning.label} style={{ borderRadius: 999, padding: "6px 10px", background: WARNING_COLORS[warning.tone], color: "#fff", fontSize: 13, fontWeight: 700 }}>{warning.label}</span>)}</div> : null}{selectedPreparationNotes.length ? <div style={{ marginTop: 10, borderLeft: "4px solid #E8843C", borderRadius: 8, padding: "10px 12px", background: "#FFF6EF", color: "#5D4037" }}><strong style={{ display: "block", fontSize: 13 }}>준비물·조제 안내</strong>{selectedPreparationNotes.map((note) => <span key={note} style={{ display: "block", marginTop: 4 }}>{note}</span>)}</div> : null}</section> : null}
          <section style={{ marginTop: 20, padding: 16, background: "#FFF6EF", borderRadius: 12 }}><p style={{ margin: 0, color: "#8C7A6B", fontWeight: 700, fontSize: 13 }}>현재 약품 위치</p><strong style={{ display: "block", marginTop: 4, color: "#E8843C", fontSize: 24 }}>{selected.location || "위치 미등록"}</strong><p style={{ margin: "8px 0 0", color: "#8C7A6B", fontSize: 14 }}>보관 조건: {selected.storage || "마스터 미등록"}</p></section>
          <section aria-label="3D 위치 안내" style={{ marginTop: 20 }}><p style={{ margin: "0 0 8px", fontWeight: 700 }}>3D 위치 안내</p><div style={{ position: "relative", height: 148, borderRadius: 14, overflow: "hidden", background: "linear-gradient(145deg, #A9B5C0, #7D8D9B)", perspective: 500 }}><div style={{ position: "absolute", inset: "28px 20px 16px", transform: "rotateX(58deg) rotateZ(-28deg)", transformStyle: "preserve-3d" }}>{[0, 1, 2].map((shelf) => <div key={shelf} style={{ position: "absolute", left: 0, right: 0, top: shelf * 31, height: 21, background: "#F5F5F0", border: "2px solid #8C7A6B", boxShadow: "0 10px 0 rgba(61,56,51,0.22)" }} />)}<div style={{ position: "absolute", left: "52%", top: 31, width: 38, height: 21, background: "#E8843C", border: "2px solid #fff", boxShadow: "0 0 0 4px rgba(232,132,60,0.28)" }} /></div><span style={{ position: "absolute", left: 14, bottom: 12, color: "#fff", fontWeight: 700 }}>{locationParts.length ? locationParts.join(" › ") : "좌표 도면 미등록"}</span></div><p style={{ margin: "8px 0 0", color: "#8C7A6B", fontSize: 12 }}>위치 코드를 기준으로 표시한 선반 안내입니다. 실제 도면 좌표를 등록하면 병동·약품장별 3D 지도와 연결할 수 있습니다.</p></section>
        </article> : null}
      </section>
    </main>
  );
}
