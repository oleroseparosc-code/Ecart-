# System Mapping

## Purpose
This app previews a pharmacist ward inventory workflow with real Excel data. The implementation avoids copied mock lists: every stock room list is derived from the canonical Excel workbook and generated into `src/data/inventory.generated.json`.

## Data Sources
- `병동별비품현황 202606.xlsx`
  - First worksheet: stock drug master and room allocation matrix.
  - A-F: drug fields (`약품코드`, `일반명`, `영문상품명`, `규격`, `보관조건`, `기타 주의 사항`).
  - G onward: room quantities.
  - `합계` is excluded as a room.
  - `0.9% NaKCl 20mEq/100ml btl` is normalized to drug code `XNAK20`.
- `20260302E-cart 약품목록_ cortisolu 삭제.xlsx`
  - `응급카트약품목록`: standard E-cart item list.
  - `NICU자체관리`: NICU-specific E-cart item list.
  - `수령확인`: E-cart target departments.
- `비품점검체크리스트.xlsx`
  - Checklist text grouped by visible section headers.
- `약제팀 라벨/원내보유의약품리스트.xlsx`
  - Label-only source for pharmacy-wide drug labels.
  - Column B `상용약품명` overrides stock and E-cart display drug names by `약품코드`; leading `[마약]`/`[향정]` prefixes are stripped for inventory names.
  - `약품조회` rows are generated into `약제팀 라벨/data/hospitalDrugLabels.generated.json`.
  - `라벨 생성규칙`, `경구 주사 리스트`, `영양수액리스트`, `외용제리스트`, and `시럽리스트` are exported into `약제팀 라벨/원내보유의약품리스트 마크다운/*.md`; future pharmacy label rule changes must read these Markdown files first.
  - Label data includes item code, drug type, pharmacy-only multi-select subtypes, 일반수액 색기호, high-cost/hazardous/oral-anticancer flags, caution flags, high-risk category, ATC, opened-PTP/powder/three-tier fields, expiry/location, ampoule-holder, side/cap label values, name caution, and border settings. The appended master columns store independent narcotic/psychotropic/anticancer, E-cart/E-cart(NICU), label-type, and tablet-dose flags; E-cart defaults are matched by drug code from the E-cart workbook.
  - Cabinet membership and cabinet label details are derived from `경구 주사 리스트`, `영양수액리스트`, `외용제리스트`, and `시럽리스트`, including list-specific ATC, expiry, caution, and location values where present.
  - `동국대학교일산병원_매출_날짜*` uploads match item codes, choose the earliest expiry per item, and save it in the adjacent `최신 유효기간` column. Label output prefers that value and retains the existing `유효기간` value when no new date is supplied.
  - A validated atomic backup is maintained at `H:/CHOI/라벨앱/원내보유의약품리스트_백업.xlsx`; invalid ZIP/XML or unexpected sheet structures never overwrite the last valid backup.
  - `식별사진경로` and `식별사진출처` columns store the local image asset and the health.kr verification link; missing paths fall back to dose/form-stripped name matching against the side-label template, then colored-side-label rows fetch health.kr `result_drug`/`ajax_result_pop` images with the `common.health.kr/shared/images/ext_images` fallback. Runtime labels refresh workbook-managed image, expiry, and colored-side background values; saved label edits remain authoritative for item code, location, ATC, size, attachment position, title styling, and border settings.
  - The drug master supports individual deletion and workbook-based bulk registration/deletion. The downloadable bulk template uses `약품코드`, `물품코드`, `상용약품명`, `한글약품명`, `함량`, and `의약품 분류`; deletion requires only `약품코드`. Deleted codes are removed from the pharmacy workbook, saved labels, pharmacy/ward label lists, stock/narcotic room allocations, E-cart views, and synced app state.
  - Cabinet labels use the same category rows as drug labels. Bottle and PTP locations come from `약품조회.위치`; each selected location prints descending alphabetic names in two 60×5mm cells per row plus one blank row. 냉장주사 위치 목록 maps `1-`, `2-`, `3-` prefixes to 1·2·3번 냉장고 and maps 백색/백신 locations to their dedicated refrigerators. Full lists fill each 2-, 3-, or compact 4-column page vertically before moving right. External, ampoule, vial, and nutrition lists place caution and location together below the common name. ATC lists show the numeric part only in a colored bordered cell and place caution/expiry in two stacked rows. Oral high-cost rows are a separate workbook-derived cabinet category whose list shows each registered position without a location selector.
  - Bottle colored-side-label doses (`0.5T`, `0.25T`) and PTP side-label doses (`1T`, `0.5T`, `0.25T`) support multi-selection. A drug checked for multiple doses is treated as a separate display item per dose, with the dose appended to its common name. The resulting list feeds multi-select alphabet filters and 43×3mm two-column three-tier position labels.
  - The label studio derives its drug list and label defaults only from this generated source and the `라벨 생성규칙` sheet dimensions. Its three-column `약품 마스터` registers new drugs with a cabinet location, exposes multi-select pharmacy-only subtypes, and writes both fields back to Excel; selected subtypes feed every cabinet full list. New drug labels can be staged, checked, and saved to the workbook in one batch. Shared caution/storage/management flags and high-risk category are written back to the workbook, while pharmacy-only settings remain isolated; shared fields overlay ward, narcotic, and E-cart label output by `약품코드`. Master output falls back to the pharmacy row before the ward source loads, and saved labels refresh shared warnings while retaining workbook-managed item code, location, ATC, size, title styling, and borders.
  - Master registration starts with `경구`, `주사`, `외용`, or `일반수액`. Checking injectable anticancer automatically enables high-risk and stores `주사용 항암제`. Narcotic or psychotropic rows classified as `중등도진정의약품`, including newly registered injection rows, keep the controlled flag and high-risk flag together. The live high-risk list places all other categories first with a colored priority treatment.
  - Every saved pharmacy master row, including edits to existing drugs, is kept in the shared `pharmacyAdditionalRows` overlay and synchronized by drug code. The cloud sync service persists app state in D1 and the latest pharmacy workbook in R2, so pharmacy editor, admin, and viewer clients poll and merge the same changes without opening a local file picker. Final pharmacy label saves also write the selected `최종 라벨 크기` and the complete draft to workbook columns; reopening that drug restores the saved size as its default.
  - Label fields use workbook storage, light-protection, similar-look, similar-sound, dose-caution, dose-check, high-risk, and hazardous `Y` flags. Hazardous labels display `위해의약품` and `<캅셀개봉. 분쇄 금지>` by default.
  - General drug labels show all in-hospital rows whose `drugType` is filled, excluding `일반수액`, `마약`, and `향정`; fluid labels show only `drugType=일반수액`, and narcotic/psychotropic labels show only `drugType=마약` or `drugType=향정`.
  - E-cart labels continue to use the E-cart management item lists, whose item names are corrected from the hospital common-name list by `약품코드`.
  - Label storage badges show only cold/frozen storage (`냉장`, `냉동`); light protection (`차광`) is shown as a caution flag.
- `약제팀 라벨/원내보유의약품_라벨매칭_20260702.xlsx`
  - Source for pharmacy label matching and label source metadata.
  - `라벨매칭` rows are generated into `약제팀 라벨/data/pharmacyLabelMatches.generated.json`.
  - Match details are keyed by `약품코드`; score and original location stay in the pharmacy label detail panel.
  - Runtime uploads accept only `원내보유의약품리스트.xlsx` or `.xlsm` and refresh the pharmacy label list while preserving existing match details by `약품코드`.
- `마약/향정라벨.xlsx`, `마약/마약주사라벨.xlsx`, `마약/마약경구라벨.xlsx`
  - Source for 40*70mm narcotic/psychotropic label text.
  - Code-label pairs are generated into `src/data/narcoticLabels.generated.json`.
- `마약/마약 실별 LOT 넣는 규칙.xlsx`
  - Source for narcotic LOT upload display rules: AN/HPC/GICLA/DREMM/HBEF storage maps to the matching room, `소화기병검사실` and `소화기검사실` aliases map to GICLA, `기타병동` maps to other narcotic rooms, and `조제실` fills pharmacy LOT.
  - Uploaded stock-detail drug names prefer exact conversion-map name/code aliases, then fall back to meaningful leading drug-name tokens plus equivalent dose/concentration text such as `50mg/ml` and `500mg/10ml`.
- `마약/마약류 약품명 약품코드 변환.xlsx`
  - Source for matching uploaded narcotic LOT drug names to app drug codes when stock-detail files use external codes.
- `마약/비치향정,마약현황.xlsx`
  - Only the `점검` sheet is imported for placed narcotic/psychotropic master drugs, rooms, and room quantities.
  - `Sheet1` and `Sheet3` are ignored.
  - Drug codes come from the `점검` sheet / hospital drug-list code, and display names prefer `약제팀 라벨/원내보유의약품리스트.xlsx` column B with `[마약]`/`[향정]` removed.
  - 40*70mm narcotic/psychotropic labels print from `hospitalDrugLabels.generated.json` column B common names with `[마약]`/`[향정]` stripped, excluding names starting with `PCA-` or containing `검사용` or `소화기병검사실`, plus derived repeated-dose caution for the same drug name and same dosage form.

## Generated Shape
- `stock.drugs`: one row per registered drug code from the stock workbook.
- `stock.rooms`: one room per non-total Excel room column.
  - `sourceUpdatedAt` stores the top-row date from each room sheet when a date pattern exists.
- `stock.allocations`: one non-zero quantity assignment between a room and a drug.
- `ecart.generalItems`: standard E-cart list.
- `ecart.nicuItems`: NICU-specific E-cart list.
- `checklist`: normalized checklist rows.
  - Label-only `양호 불량` rows are excluded; `수량 일치` remains a real checklist item.
  - Retired E-cart twice-weekly management-log rows are excluded during import.
  - Split combined `2-1`/`2-2` rows and append 냉장약 item 6 for annual refrigerator thermometer verification.
  - Apply hospital common-name corrections for stock/E-cart labels, plus warning labels and storage grouping overrides.
- `약제팀 라벨/data/hospitalDrugLabels.generated.json`: all hospital drug label candidates with storage/caution fields and `drugType` for label-button filtering.
- `약제팀 라벨/data/pharmacyLabelMatches.generated.json`: matched pharmacy label text, match status, source file, source location, and caution/storage flags; runtime pharmacy-label rows are rebuilt from hospital drug rows while preserving match details by drug code.
- 약제팀 라벨 편집 전용 주소 `/pharmacy-label-editor/`는 저장된 편집본(`pharmacyLabels`)을 공용 서버에 동기화합니다. 상단 경구·외용·주사 대분류는 세부유형을 통합 검색하고 고가약 라벨을 제형보다 우선합니다. 원병·PTP 고가약은 각 제형의 전체·위치 목록에 유지하되 약품 라벨 생성 시 고가약 형식을 우선합니다. 경구 고가약 목록은 등록 위치를 함께 표시하며 항암제와 경구항암제가 중복되면 경구항암제만 표시합니다. 약품장 `유색라벨`·`측면라벨`은 선택 알파벳을 두 개씩 묶어 첫 글자는 왼쪽 세로열, 다음 글자는 오른쪽 세로열에 배치합니다. 43×3mm 칸의 왼쪽에는 약품명, 오른쪽에는 분할용량을 배치하고 0.5T는 빨간색, 0.25T는 파란색이며 1T 문구는 생략합니다. ATC 목록은 연한 녹색 번호 칸을 사용하고 주의가 없으면 빈칸으로 두며 주의·유효기간 사이 내부선은 표시하지 않습니다. 유색 병뚜껑은 유색 측면라벨 배경색을 우선 적용하고 용량주의·용량확인 항목은 상용약품명 안의 용량 숫자를 빨간색·형광 배경으로 표시합니다. 냉장주사는 백신 냉장고를 포함하고, 영양수액은 A4 1장 3열, 외용은 약품명·주의·위치를 적용합니다. 마스터 선택 항목은 엑셀에 일괄 저장됩니다.
- 공용 상태의 `deletedPharmacyDrugCodes`는 약품 마스터에서 삭제한 약품코드를 보관합니다. 원본 JSON이나 병동 엑셀을 다시 불러와도 해당 코드는 약품·라벨·병동 비품·마약류·E-cart 화면에 재등장하지 않습니다.
- `병동라벨/원내보유의약품리스트.xlsx`와 `병동라벨/data/hospitalDrugLabels.generated.json`은 전체비품약 마스터의 stock/fluid/narcotic 라벨 및 E-cart 보정용 독립 원본입니다. 약제팀 라벨 원본과 생성 JSON은 이 경로를 참조하지 않습니다.
- `narcoticLabels.generated.json`: legacy narcotic/psychotropic label text, category, source file, and source cell retained for generated-data coverage.
- `narcoticDrugCodeMap.generated.json`: narcotic drug-name/code conversion rows used before fuzzy LOT name matching.
- `narcoticInventory.generated.json`: placed narcotic/psychotropic drugs, rooms, allocations, and categories generated only from `비치향정,마약현황.xlsx` `점검`.

## App Flow
1. Load generated JSON at startup.
2. Build lookup maps for drugs and room allocations in memory.
3. Show summary metrics from the generated data.
4. Let the user select a stock room and filter/search its assigned drugs.
5. Let the user inspect the full registered drug master, E-cart lists, and checklist source.
6. Persist user edits in localStorage: stock counts, expiry checks, room checklists, E-cart target checklists, edited room update dates, uninspected stock-room flags, and the editable round-summary draft.
   - The current baseline is `비품약 현황/병동별 비품약·비치마약류 현황_2026-08-18_앱반영.xlsx`; its first sheet contains both stock and controlled-drug allocation matrices.
   - `npm run inventory:workbook:initialize` first imports the manually checked workbook into D1, then watches it. `npm run inventory:workbook:watch` reflects new D1 app/viewer allocations back into the same workbook within two seconds.
   - Before every server-to-workbook write, the watcher copies an immediate rollback file into `비품약 현황/버전 보관`. The watcher will not write while the workbook is open.
7. The Vite dev server exposes `/api/app-state` and persists the same app state in `app-state/shared-state.json`.
   - The server commits and pushes that file to GitHub with the local repository's existing Git credentials.
   - Admin mode polls for newer server updates and automatically saves local edits after changes settle.
   - The narcotic viewer keeps edits local until the user presses `관리자 PC로 반영`, then saves only narcotic-room state into the shared admin state; the workbook watcher records it in the controlled-drug matrix.
   - Admin `뷰어 반영 내용 받기` previews incoming narcotic-room changes in a confirmation popup before applying them to the admin screen.
   - Master drug, room, and allocation edits are queued for automatic save even while initial server checking is still in progress.
   - Saves include the last-read server state hash; the server rejects stale writes so old browser tabs cannot overwrite newer shared state.
   - The sync panel can force-upload the current device state to recover edits that only exist in that browser's local storage.
   - Static GitHub Pages builds include `app-state/shared-state.json` and fall back to it when `/api/app-state` is unavailable, so new domains can hydrate current shared state such as narcotic LOT values.
   - `npm run dev:public` opens a Cloudflare quick tunnel for mobile access outside the PC's Wi-Fi network.
   - The dev server allows `*.trycloudflare.com` hosts so the tunneled app and `/api/app-state` share the same server state.
8. Build the round-summary report from bad checklist statuses and manual note text, then print/PDF it through the shared preview flow.

## Update Rule
The live allocation workbook is managed by `npm run inventory:workbook:initialize` once, followed by `npm run inventory:workbook:install` for logon startup. Pharmacy master additions are already merged into the assignment search by `약품코드`; the workbook receives that drug when it is assigned. Historical source workbook changes still require `npm run generate:data` and `npm run validate:data`. Pharmacy label source changes use `npm run generate:labels`; ward/master label source changes use `npm run generate:ward-labels`. The two generated JSON files and source workbooks must not be interchanged.
