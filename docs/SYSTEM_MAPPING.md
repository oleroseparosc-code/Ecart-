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

## Generated Shape
- `stock.drugs`: one row per registered drug code from the stock workbook.
- `stock.rooms`: one room per non-total Excel room column.
  - `sourceUpdatedAt` stores the top-row date from each room sheet when a date pattern exists.
- `stock.allocations`: one non-zero quantity assignment between a room and a drug.
- `ecart.generalItems`: standard E-cart list.
- `ecart.nicuItems`: NICU-specific E-cart list.
- `checklist`: normalized checklist rows.
  - Label-only `양호 불량` rows are excluded; `수량 일치` remains a real checklist item.
  - Split combined `2-1`/`2-2` rows and append 냉장약 item 6 for annual refrigerator thermometer verification.
  - Apply pharmacy policy corrections for E-cart labels, warning labels, and storage grouping overrides.

## App Flow
1. Load generated JSON at startup.
2. Build lookup maps for drugs and room allocations in memory.
3. Show summary metrics from the generated data.
4. Let the user select a stock room and filter/search its assigned drugs.
5. Let the user inspect the full registered drug master, E-cart lists, and checklist source.
6. Persist user edits in localStorage: stock counts, expiry checks, room checklists, E-cart target checklists, edited room update dates, uninspected stock-room flags, and the editable round-summary draft.
7. The Vite dev server exposes `/api/app-state` and persists the same app state in `app-state/shared-state.json`.
   - The server commits and pushes that file to GitHub with the local repository's existing Git credentials.
   - The app polls for newer server updates and automatically saves every local edit after changes settle.
   - Master drug, room, and allocation edits are queued for automatic save even while initial server checking is still in progress.
   - Saves include the last-read server state hash; the server rejects stale writes so old browser tabs cannot overwrite newer shared state.
   - The sync panel can force-upload the current device state to recover edits that only exist in that browser's local storage.
   - `npm run dev:public` opens a Cloudflare quick tunnel for mobile access outside the PC's Wi-Fi network.
   - The dev server allows `*.trycloudflare.com` hosts so the tunneled app and `/api/app-state` share the same server state.
8. Build the round-summary report from bad checklist statuses and manual note text, then print/PDF it through the shared preview flow.

## Update Rule
When Excel files change, run `npm run generate:data` and `npm run validate:data`. The UI should update from generated data without editing React components.
