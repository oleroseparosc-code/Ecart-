# AGENTS.md

## Mission
Build a TypeScript app for pharmacist-led ward inventory checks using the Excel files in this folder as the data source.

## Commands
- Generate app data: `npm run generate:data` (`py scripts/extract_inventory.py`)
- Validate Excel import: `npm run validate:data` (`py scripts/validate_inventory.py`)
- Test allocation logic: `npm test` (`vitest run --no-watch --reporter=basic --testTimeout=10000 --config vitest.config.ts`)
- Build: `npm run build`
- Local preview: `npm run dev`

## Data Rules
- `병동별비품현황 202606.xlsx` is the canonical source for registered stock drugs and room allocations.
- Use the first worksheet, `비품현황표(전체)`, for stock data.
- Columns A-F are drug master fields; room allocation columns start at G.
- Exclude the `합계` column from room lists because it is a total, not a room.
- Keep all registered drugs, even if all room quantities are empty or zero.
- Create room inventory from non-zero room quantities only.
- E-cart data comes from `20260302E-cart 약품목록_ cortisolu 삭제.xlsx`.
- Checklist text comes from `비품점검체크리스트.xlsx`.

## Invariants
- Drug identity is `약품코드`.
- Room identity is the Excel room column name.
- A room list is always derived from master drugs plus allocations.
- Do not hand-edit `src/data/inventory.generated.json`; regenerate it.
- Do not reintroduce mock inventory data.

## UI Rules
- Show counts for registered drugs, rooms, allocations, and E-cart items.
- Let users switch rooms and see exact assigned drugs and quantities.
- Preserve Korean labels from Excel.
- Surface storage condition and warning text per drug.

## Documentation
- Update `docs/SYSTEM_MAPPING.md` whenever data flow, import rules, or generated data shape changes.
- Keep this file under 100 lines.
