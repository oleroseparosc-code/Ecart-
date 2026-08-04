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
  - Label data includes item code, drug type, 일반수액 색기호, high-cost/oral-anticancer flags, caution flags, high-risk category, ATC, opened-PTP/powder/three-tier fields, expiry/location, side/cap label values, name caution, and border settings. The appended master columns store independent narcotic/psychotropic/anticancer, E-cart/E-cart(NICU), label-type, and tablet-dose flags; E-cart defaults are matched by drug code from the E-cart workbook.
  - Cabinet membership and cabinet label details are derived from `경구 주사 리스트`, `영양수액리스트`, `외용제리스트`, and `시럽리스트`, including list-specific ATC, expiry, caution, and location values where present.
  - `동국대학교일산병원_매출_날짜*` uploads match item codes, choose the earliest expiry per item, and save an updated `원내보유의약품리스트.xlsx`.
  - A validated atomic backup is maintained at `H:/CHOI/라벨앱/원내보유의약품리스트_백업.xlsx`; invalid ZIP/XML or unexpected sheet structures never overwrite the last valid backup.
  - `식별사진경로` and `식별사진출처` columns store the local image asset and the health.kr verification link; missing paths fall back to dose/form-stripped name matching against the side-label template, then colored-side-label rows fetch health.kr `result_drug`/`ajax_result_pop` images with the `common.health.kr/shared/images/ext_images` fallback. Runtime labels always refresh image, ATC, expiry, and colored-side background from the workbook.
  - Cabinet labels render the four cabinet-list sheets as name/caution/location rows, while nutrition-fluid labels use the `라벨 생성규칙` left/right 12mm caution layout.
  - The label studio derives its drug list and label defaults only from this generated source and the `라벨 생성규칙` sheet dimensions. Its three-column `약품 마스터` registers new drugs only in the shared section, then exposes the same row to pharmacy-only dosage-form and attachment-label search. Shared caution/storage/management flags and high-risk category are written back to the workbook, while pharmacy-only settings remain isolated; shared fields overlay ward, narcotic, and E-cart label output by `약품코드`. Master label output falls back directly to the pharmacy master row before the ward-label source finishes loading, and previously saved manual labels refresh shared warning flags from the current master row.
  - Master registration starts with `경구`, `주사`, `외용`, or `일반수액`. Checking injectable anticancer automatically enables high-risk and stores `주사용 항암제`. Narcotic or psychotropic rows classified as `중등도진정의약품`, including newly registered injection rows, keep the controlled flag and high-risk flag together. The live high-risk list places all other categories first with a colored priority treatment.
  - Every saved pharmacy master row, including edits to existing drugs, is kept in the shared `pharmacyAdditionalRows` overlay and synchronized by drug code. The cloud sync service persists app state in D1 and the latest pharmacy workbook in R2, so pharmacy editor, admin, and viewer clients poll and merge the same changes without opening a local file picker.
  - Label fields use workbook storage, light-protection, similar-look, similar-sound, dose-caution, dose-check, and workbook high-risk `Y` flags.
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
- 약제팀 라벨 편집 전용 주소 `/pharmacy-label-editor/`는 약제팀 라벨 작업공간만 열며, 저장된 라벨 편집본(`pharmacyLabels`)을 공용 서버 동기화 상태에 포함합니다. 따라서 편집 PC와 관리자 PC가 동일한 서버 상태를 읽고 변경 내용을 자동 반영합니다.
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
7. The Vite dev server exposes `/api/app-state` and persists the same app state in `app-state/shared-state.json`.
   - The server commits and pushes that file to GitHub with the local repository's existing Git credentials.
   - Admin mode polls for newer server updates and automatically saves local edits after changes settle.
   - The narcotic viewer keeps edits local until the user presses `관리자 PC로 반영`, then saves only narcotic-room state into the shared admin state.
   - Admin `뷰어 반영 내용 받기` previews incoming narcotic-room changes in a confirmation popup before applying them to the admin screen.
   - Master drug, room, and allocation edits are queued for automatic save even while initial server checking is still in progress.
   - Saves include the last-read server state hash; the server rejects stale writes so old browser tabs cannot overwrite newer shared state.
   - The sync panel can force-upload the current device state to recover edits that only exist in that browser's local storage.
   - Static GitHub Pages builds include `app-state/shared-state.json` and fall back to it when `/api/app-state` is unavailable, so new domains can hydrate current shared state such as narcotic LOT values.
   - `npm run dev:public` opens a Cloudflare quick tunnel for mobile access outside the PC's Wi-Fi network.
   - The dev server allows `*.trycloudflare.com` hosts so the tunneled app and `/api/app-state` share the same server state.
8. Build the round-summary report from bad checklist statuses and manual note text, then print/PDF it through the shared preview flow.

## Update Rule
When stock/checklist/narcotic inventory Excel files change, run `npm run generate:data` and `npm run validate:data`. Pharmacy label source changes are generated by `npm run generate:labels` from `약제팀 라벨/원내보유의약품리스트.xlsx`; ward/master label source changes are generated by `npm run generate:ward-labels` from `병동라벨/원내보유의약품리스트.xlsx`. The two generated JSON files and source workbooks must not be interchanged. `npm run autosync:hospital-drugs:install` watches the pharmacy source, while `npm run autosync:ward-labels:install` watches the ward source. When `약제팀 라벨/원내보유의약품_라벨매칭_20260702.xlsx` changes, run `npm run generate:label-matches`. When narcotic label or conversion workbooks in `마약/` change, refresh their generated JSON. The UI should update from generated data without editing React components.
