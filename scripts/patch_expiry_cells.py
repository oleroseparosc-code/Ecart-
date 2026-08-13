from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "약제팀 라벨" / "원내보유의약품리스트.xlsx"
GENERATED = ROOT / "약제팀 라벨" / "data" / "hospitalDrugLabels.generated.json"
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"


def tag(name: str) -> str:
    return f"{{{MAIN}}}{name}"


def column_letters(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def excel_serial(value: str) -> int:
    return (date.fromisoformat(value) - date(1899, 12, 30)).days


def main() -> None:
    generated = {row["code"]: row for row in json.loads(GENERATED.read_text(encoding="utf-8"))}
    workbook = load_workbook(WORKBOOK, data_only=True, read_only=True)
    sheet = workbook["약품조회"]
    headers = [str(cell.value or "").strip() for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
    code_col = headers.index("약품코드") + 1
    item_col = headers.index("물품코드") + 1
    latest_col = headers.index("최신 유효기간") + 1
    updates: list[tuple[int, str, str]] = []
    for row_index, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        code = str(row[code_col - 1] or "").strip()
        updated = generated.get(code)
        if str(row[item_col - 1] or "").strip() or not updated or not updated.get("itemCode") or not updated.get("expiry"):
            continue
        updates.append((row_index, str(updated["itemCode"]), str(updated["expiry"])))
    workbook.close()
    if not updates:
        raise RuntimeError("반영할 물품코드·유효기간 행을 찾지 못했습니다.")

    with zipfile.ZipFile(WORKBOOK, "r") as source:
        workbook_xml = ET.fromstring(source.read("xl/workbook.xml"))
        relations = ET.fromstring(source.read("xl/_rels/workbook.xml.rels"))
        targets = {relation.attrib["Id"]: relation.attrib["Target"] for relation in relations.findall(f"{{{PACKAGE_REL}}}Relationship")}
        sheet_id = next(sheet.attrib[f"{{{REL}}}id"] for sheet in workbook_xml.findall(f".//{tag('sheet')}") if sheet.attrib["name"] == "약품조회")
        sheet_xml_path = "xl/" + targets[sheet_id].lstrip("/")
        sheet_root = ET.fromstring(source.read(sheet_xml_path))
        rows_by_index = {int(row.attrib["r"]): row for row in sheet_root.findall(f".//{tag('row')}")}
        latest_letter = column_letters(latest_col)
        date_style = next((cell.attrib.get("s") for cell in sheet_root.findall(f".//{tag('c')}") if cell.attrib.get("r", "").startswith(latest_letter) and cell.attrib.get("s")), None)

        def write_cell(row_xml: ET.Element, address: str, value: str, style: str | None = None) -> None:
            cell = next((candidate for candidate in row_xml.findall(tag("c")) if candidate.attrib.get("r") == address), None)
            if cell is None:
                cell = ET.SubElement(row_xml, tag("c"), {"r": address})
            cell.attrib.pop("t", None)
            if style:
                cell.set("s", style)
            for child in list(cell):
                cell.remove(child)
            ET.SubElement(cell, tag("v")).text = value

        for row_index, item_code, expiry in updates:
            row_xml = rows_by_index[row_index]
            write_cell(row_xml, f"{column_letters(item_col)}{row_index}", item_code)
            write_cell(row_xml, f"{latest_letter}{row_index}", str(excel_serial(expiry)), date_style)

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx", dir=WORKBOOK.parent) as temp_file:
            temporary = Path(temp_file.name)
        with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as target:
            for entry in source.infolist():
                if entry.filename == sheet_xml_path:
                    target.writestr(entry, ET.tostring(sheet_root, encoding="utf-8", xml_declaration=True))
                else:
                    target.writestr(entry, source.read(entry.filename))
    os.replace(temporary, WORKBOOK)
    print(f"Patched {len(updates)} rows while preserving non-worksheet workbook parts.")


if __name__ == "__main__":
    main()
