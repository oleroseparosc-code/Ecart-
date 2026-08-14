import XLSX from "xlsx";

const workbookPath = "약제팀 라벨/원내보유의약품리스트.xlsx";
const diluentCodes = new Set(["XMMR2", "XMMR2W", "XMMR2G", "XJENCVB", "XJENCVB2", "XJENCVB4", "XJENCVB7"]);
const needleCodes = new Set(["XPNEUM20A", "XPNEUM20P"]);

const workbook = XLSX.readFile(workbookPath);
const worksheet = workbook.Sheets["약품조회"];
if (!worksheet) throw new Error("약품조회 시트를 찾을 수 없습니다.");

const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1");
const headers = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0, defval: "" })[0];
const ensureColumn = (header) => {
  let column = headers.indexOf(header);
  if (column >= 0) return column;
  column = headers.length;
  headers.push(header);
  worksheet[XLSX.utils.encode_cell({ r: 0, c: column })] = { t: "s", v: header };
  range.e.c = Math.max(range.e.c, column);
  return column;
};

const codeColumn = headers.indexOf("약품코드");
if (codeColumn < 0) throw new Error("약품코드 열을 찾을 수 없습니다.");
const diluentColumn = ensureColumn("용해액 필요");
const needleColumn = ensureColumn("니들 필요");

for (let row = 1; row <= range.e.r; row += 1) {
  const code = String(worksheet[XLSX.utils.encode_cell({ r: row, c: codeColumn })]?.v ?? "").trim().toUpperCase();
  if (!code) continue;
  if (diluentCodes.has(code)) worksheet[XLSX.utils.encode_cell({ r: row, c: diluentColumn })] = { t: "s", v: "Y" };
  if (needleCodes.has(code)) worksheet[XLSX.utils.encode_cell({ r: row, c: needleColumn })] = { t: "s", v: "Y" };
}

worksheet["!ref"] = XLSX.utils.encode_range(range);
XLSX.writeFile(workbook, workbookPath);
console.log("Updated preparation flags for MMR, J.E.V, and Prevenar.");
