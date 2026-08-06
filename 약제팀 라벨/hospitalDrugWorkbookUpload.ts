import {
  isHospitalDrugFrozen,
  isHospitalDrugHighRisk,
  isHospitalDrugLightProtected,
  isHospitalDrugRefrigerated,
  type HospitalDrugLabelRow,
} from "./hospitalDrugLabels";
import type { PharmacyLabelMatchRow } from "./pharmacyLabelMatches";

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

const XLSX_EOCD_SIGNATURE = 0x06054b50;
const XLSX_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const XLSX_LOCAL_FILE_SIGNATURE = 0x04034b50;
const HOSPITAL_DRUG_WORKBOOK_STEM = "원내보유의약품리스트";

const HOSPITAL_DRUG_HEADERS = [
  "약품코드",
  "상용약품명",
  "한글약품명",
  "함량",
  "규격",
  "포장",
  "차광필요",
  "원내보유",
  "유사모양",
  "유사발음",
  "용량주의",
  "용량확인",
] as const;
const HOSPITAL_DRUG_TYPE_HEADERS = ["약품유형", "약품 유형"] as const;
const HOSPITAL_DRUG_STORAGE_HEADERS = ["보관법", "보관조건"] as const;
const HOSPITAL_DRUG_HIGH_RISK_HEADERS = ["고위험의약품", "고위험약품"] as const;

const textDecoder = new TextDecoder("utf-8");

function clean(value: string | undefined) {
  return (value ?? "").replace(/_x000D_/g, "").trim();
}

function isYes(value: string | undefined) {
  return clean(value).toUpperCase() === "Y";
}

function readUint16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function getAttribute(xml: string, name: string) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(xml)?.[1] ?? "";
}

function findEndOfCentralDirectory(view: DataView) {
  const minOffset = Math.max(0, view.byteLength - 66000);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (readUint32(view, offset) === XLSX_EOCD_SIGNATURE) return offset;
  }
  throw new Error("엑셀 파일 구조를 읽을 수 없습니다.");
}

function listZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, eocdOffset + 10);
  const centralDirectoryOffset = readUint32(view, eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(view, offset) !== XLSX_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("엑셀 파일 목록을 읽을 수 없습니다.");
    }

    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const name = textDecoder.decode(bytes.subarray(nameStart, nameStart + fileNameLength));
    entries.push({ name, compressionMethod, compressedSize, localHeaderOffset });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateRaw(bytes: Uint8Array) {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readZipEntryText(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readUint32(view, entry.localHeaderOffset) !== XLSX_LOCAL_FILE_SIGNATURE) {
    throw new Error("엑셀 파일 내용을 읽을 수 없습니다.");
  }

  const fileNameLength = readUint16(view, entry.localHeaderOffset + 26);
  const extraLength = readUint16(view, entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  const uncompressed =
    entry.compressionMethod === 0 ? compressed : entry.compressionMethod === 8 ? await inflateRaw(compressed) : undefined;

  if (!uncompressed) throw new Error("지원하지 않는 엑셀 압축 형식입니다.");
  return textDecoder.decode(uncompressed);
}

function parseSharedStrings(xml: string) {
  return [...xml.matchAll(/<(?:\w+:)?si\b[\s\S]*?<\/(?:\w+:)?si>/g)].map(([item]) =>
    [...item.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXmlEntities(match[1])).join(""),
  );
}

function resolveFirstWorksheetPath(workbookXml: string, relsXml: string) {
  const firstSheet = /<(?:\w+:)?sheet\b[^>]*\br:id="([^"]+)"/.exec(workbookXml)?.[1];
  if (!firstSheet) return "xl/worksheets/sheet1.xml";

  const relPattern = /<(?:\w+:)?Relationship\b([^>]*)\/?>/g;
  for (const match of relsXml.matchAll(relPattern)) {
    if (getAttribute(match[1], "Id") !== firstSheet) continue;
    const target = getAttribute(match[1], "Target");
    if (!target) break;
    return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.?\//, "")}`;
  }

  return "xl/worksheets/sheet1.xml";
}

function columnIndexFromCellRef(cellRef: string) {
  const letters = /^[A-Z]+/.exec(cellRef)?.[0] ?? "";
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseCellValue(cellAttributes: string, cellXml: string, sharedStrings: string[]) {
  const type = getAttribute(cellAttributes, "t");
  if (type === "inlineStr") {
    return clean([...cellXml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((match) => decodeXmlEntities(match[1])).join(""));
  }

  const rawValue = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cellXml)?.[1] ?? "";
  if (type === "s") return clean(sharedStrings[Number(rawValue)] ?? "");
  return clean(decodeXmlEntities(rawValue));
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  return [...xml.matchAll(/<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)].map((rowMatch) => {
    const values: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const cellRef = getAttribute(cellMatch[1], "r");
      const columnIndex = columnIndexFromCellRef(cellRef);
      if (columnIndex >= 0) values[columnIndex] = parseCellValue(cellMatch[1], cellMatch[2] ?? "", sharedStrings);
    }
    return values;
  });
}

function requireHeaders(headers: string[]) {
  const missing: string[] = HOSPITAL_DRUG_HEADERS.filter((header) => !headers.includes(header));
  if (!HOSPITAL_DRUG_TYPE_HEADERS.some((header) => headers.includes(header))) {
    missing.push("약품유형");
  }
  if (!HOSPITAL_DRUG_STORAGE_HEADERS.some((header) => headers.includes(header))) {
    missing.push("보관법");
  }
  if (!HOSPITAL_DRUG_HIGH_RISK_HEADERS.some((header) => headers.includes(header))) {
    missing.push("고위험의약품");
  }
  if (missing.length > 0) {
    throw new Error(`원내보유의약품리스트 양식이 아닙니다. 누락 열: ${missing.join(", ")}`);
  }
}

function rowsToHospitalDrugLabels(rows: string[][]): HospitalDrugLabelRow[] {
  const headers = (rows[0] ?? []).map((header) => clean(header).replace(/\n/g, " "));
  requireHeaders(headers);
  const index = new Map(headers.map((header, position) => [header, position]));
  const read = (row: string[], header: string) => clean(row[index.get(header) ?? -1]);
  const readOptional = (row: string[], header: string) => index.has(header) ? read(row, header) : "";
  const readAny = (row: string[], possibleHeaders: readonly string[]) => {
    const header = possibleHeaders.find((candidate) => index.has(candidate));
    return header ? read(row, header) : "";
  };

  return rows
    .slice(1)
    .map((row): HospitalDrugLabelRow | undefined => {
      const code = read(row, "약품코드");
      const name = read(row, "상용약품명");
      if (!code || !name) return undefined;
      const drugType = readAny(row, HOSPITAL_DRUG_TYPE_HEADERS);
      const sideLabel1T = readOptional(row, "1T 3단장 뺑뺑이 PTP 측면라벨");
      const sideLabelHalfT = readOptional(row, "0.5T 3단장 뺑뺑이 병 측면라벨");
      const sideLabelQuarterT = readOptional(row, "0.25T 3단장 뺑뺑이 병 측면라벨");
      const legacyCapLabel = readOptional(row, "3단장 유색 반티통 병뚜껑");
      const capBackground = readOptional(row, "3단장 반티통 병뚜껑 바탕색 기호");
      return {
        code,
        itemCode: readOptional(row, "물품코드"),
        name,
        koreanName: read(row, "한글약품명"),
        strength: read(row, "함량"),
        drugType,
        fluidColor: readOptional(row, "일반수액 색기호"),
        highCost: isYes(readOptional(row, "고가약")),
        hazardous: isYes(readOptional(row, "위해의약품")),
        narcotic: isYes(readOptional(row, "마약")) || drugType === "마약",
        psychotropic: isYes(readOptional(row, "향정")) || drugType === "향정",
        anticancer: isYes(readOptional(row, "항암제")) || drugType === "항암제" || isYes(readOptional(row, "경구항암제")),
        eCart: isYes(readOptional(row, "E-cart")),
        eCartNicu: isYes(readOptional(row, "E-cart(NICU)")),
        spec: read(row, "규격"),
        package: read(row, "포장"),
        storage: readAny(row, HOSPITAL_DRUG_STORAGE_HEADERS),
        lightProtected: read(row, "차광필요") === "차광",
        highRisk: isYes(readAny(row, HOSPITAL_DRUG_HIGH_RISK_HEADERS)),
        inHospital: isYes(read(row, "원내보유")),
        similarLook: isYes(read(row, "유사모양")),
        similarSound: isYes(read(row, "유사발음")),
        doseCaution: isYes(read(row, "용량주의")),
        doseCheck: isYes(read(row, "용량확인")),
        nameCaution: isYes(readOptional(row, "이름주의")),
        pharmacyLabelTypes: !index.has("약제팀 라벨 세부유형") || !readOptional(row, "약제팀 라벨 세부유형")
          ? undefined
          : readOptional(row, "약제팀 라벨 세부유형") === "없음"
            ? []
            : readOptional(row, "약제팀 라벨 세부유형").split(/[,/\n]+/).map((value) => value.trim()).filter(Boolean),
        sideLabel1T,
        sideLabelHalfT,
        sideLabelQuarterT,
        sideLabel: isYes(readOptional(row, "측면라벨")) || [sideLabel1T, sideLabelHalfT, sideLabelQuarterT].some(isYes),
        labelDose1T: isYes(readOptional(row, "정제용량 1T")) || isYes(sideLabel1T),
        labelDoseHalfT: isYes(readOptional(row, "정제용량 0.5T")) || isYes(sideLabelHalfT),
        labelDoseQuarterT: isYes(readOptional(row, "정제용량 0.25T")) || isYes(sideLabelQuarterT),
        coloredSideLabel: readOptional(row, "3단장 유색 반티통 측면라벨"),
        capLabel: legacyCapLabel,
        regularCapLabel: isYes(readOptional(row, "병뚜껑")) || (isYes(legacyCapLabel) && !capBackground),
        coloredCapLabel: isYes(readOptional(row, "유색병뚜껑")) || (isYes(legacyCapLabel) && Boolean(capBackground)),
        capBackground,
      };
    })
    .filter((row): row is HospitalDrugLabelRow => row != null)
    .sort((first, second) => first.name.localeCompare(second.name, "ko") || first.code.localeCompare(second.code, "ko"));
}

export function isHospitalDrugWorkbookFileName(fileName: string) {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  const dotIndex = name.lastIndexOf(".");
  const stem = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
  const extension = dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
  return stem === HOSPITAL_DRUG_WORKBOOK_STEM && [".xlsx", ".xlsm"].includes(extension);
}

export async function parseHospitalDrugWorkbook(buffer: ArrayBufferLike) {
  const bytes = new Uint8Array(buffer);
  const entries = listZipEntries(bytes);
  const entryByName = new Map(entries.map((entry) => [entry.name, entry]));
  const readText = async (name: string) => {
    const entry = entryByName.get(name);
    return entry ? readZipEntryText(bytes, entry) : "";
  };

  const workbookXml = await readText("xl/workbook.xml");
  const relsXml = await readText("xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await readText("xl/sharedStrings.xml");
  const worksheetPath = resolveFirstWorksheetPath(workbookXml, relsXml);
  const worksheetXml = await readText(worksheetPath);
  if (!worksheetXml) throw new Error("원내보유의약품리스트 시트를 찾을 수 없습니다.");

  return rowsToHospitalDrugLabels(parseWorksheetRows(worksheetXml, parseSharedStrings(sharedStringsXml)));
}

export function mergeHospitalDrugRowsIntoPharmacyLabelMatches(
  hospitalRows: readonly HospitalDrugLabelRow[],
  currentRows: readonly PharmacyLabelMatchRow[],
): PharmacyLabelMatchRow[] {
  const currentByCode = new Map(currentRows.map((row) => [row.code, row]));

  return hospitalRows
    .map((row) => {
      const current = currentByCode.get(row.code);
      return {
        code: row.code,
        englishName: row.name,
        koreanName: row.koreanName,
        strength: row.strength,
        spec: row.spec,
        package: row.package,
        storage: row.storage,
        lightProtected: isHospitalDrugLightProtected(row),
        refrigerated: isHospitalDrugRefrigerated(row),
        frozen: isHospitalDrugFrozen(row),
        doseCaution: row.doseCaution,
        doseCheck: row.doseCheck,
        similarSound: row.similarSound,
        similarLook: row.similarLook,
        highRisk: isHospitalDrugHighRisk(row),
        highCaution: current?.highCaution ?? false,
        anticancer: current?.anticancer ?? false,
        narcotic: current?.narcotic ?? false,
        psychotropic: current?.psychotropic ?? false,
        highCost: current?.highCost ?? false,
        nameCaution: current?.nameCaution ?? false,
        matchedLabel: current?.matchedLabel ?? "",
        sourceFile: current?.sourceFile ?? "",
        sourceLocation: current?.sourceLocation ?? "",
        matchStatus: current?.matchStatus ?? "미매칭",
        matchScore: current?.matchScore ?? 0,
        matchReason: current?.matchReason ?? "",
        conditionSource: current?.conditionSource ?? "",
        reviewMemo: current?.reviewMemo ?? "",
      };
    })
    .sort((first, second) => first.englishName.localeCompare(second.englishName, "ko") || first.code.localeCompare(second.code, "ko"));
}
