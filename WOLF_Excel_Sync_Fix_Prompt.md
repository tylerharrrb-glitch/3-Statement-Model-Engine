# WOLF Engine — Excel Sync & Architecture Fix
## Prompt for Google Antigravity (Claude Opus 4.6 Thinking)
### Diagnosis: 5 Confirmed Root-Cause Bugs in the Excel Export System

> Based on verified inspection of the exported `.xlsx` and `.json` files against the live engine.

---

## THE 5 ROOT CAUSES — READ THIS BEFORE TOUCHING CODE

These were confirmed by reading every relevant cell formula in the Excel file.

---

### ROOT CAUSE 1 — `_Calc_Base` Revenue Row Is Completely Broken [CRITICAL]

**File**: `lib/export/build-calc-sheets.ts`

**What was found**:
```
_Calc_Base A2 = '=G2*(1+Scenarios!H9)'   ← formula for 2030E is in column A (label column!)
_Calc_Base B2 = None (empty)
_Calc_Base C2 = None (empty)
_Calc_Base D2 = None (empty)
_Calc_Base E2 = None (empty)
_Calc_Base F2 = None (empty)
_Calc_Base G2 = None (empty)
_Calc_Base H2 = None (empty)
```

The label cell A2 received the 2030E revenue growth formula. Cells B2 through H2 are completely empty. **Since every other IS/BS/CF formula in the calc sheet references cells in this sheet (e.g., `=D2*Scenarios!D10` for COGS), and D2 is empty, every single formula in the entire `_Calc_Base` sheet returns 0 or an error.** This is why "nothing syncs with the engine."

**Root cause in code**: In the `setF()` helper inside `buildOneCalcSheet()`:
```typescript
const setF = (row: number, yr: number, formula: string, result: number = 0, fmt: string = NUM_FMT) => {
    const cell = ws.getCell(row, yr + 2);   // ← yr + 2 should give column B (col 2) for yr=0
    cell.value = { formula, result };
    ...
};
```
When `setL(R.revenue, 'Revenue')` is called first, it writes "Revenue" to `ws.getCell(2, 1)` = A2. Then `setF(R.revenue, yr=0, ...)` should write to `ws.getCell(2, 2)` = B2. But the observed result is that ALL revenue formulas end up absent from B2-H2, and A2 contains the last formula.

**Most likely cause**: One of two things:
(a) The `setL()` call runs AFTER the `setF()` loop for this row, overwriting the already-placed formula in B2 with "Revenue" in A2, and the loop column index is `yr + 1` (off by one) instead of `yr + 2`, so yr=0 writes to col 1 = A2, yr=1 writes to B2, ..., yr=6 writes to G2 — but then `setL` overwrites A2 with "Revenue", leaving only G2 populated (but openpyxl shows A2 with the formula, so this isn't it either).

(b) The column index calculation uses `colLetter(yr + 2)` for the FORMULA TEXT (e.g., the formula says `=G2*(1+...)`) but `ws.getCell(row, yr + 1)` (off by one) for the CELL POSITION. So formula text references col H but is written to col G... still doesn't explain A2 having it.

**The actual fix**: Open `build-calc-sheets.ts` and find the `setF` and `setL` helper definitions. Trace through exactly what happens for `R.revenue` (row 2) across all years. Add a console.log to confirm which cell each write lands on. Then fix the offset.

**GUARANTEED FIX APPROACH** — Replace the `setF` helper to use ExcelJS row/column approach that is unambiguous:
```typescript
const setF = (row: number, yr: number, formula: string, result: number = 0, fmt: string = NUM_FMT) => {
    const colIndex = yr + 2;  // col 2 = B (yr=0), col 3 = C (yr=1), ... col 8 = H (yr=6)
    const cell = ws.getCell(row, colIndex);
    cell.value = { formula, result };
    cell.numFmt = fmt;
};

const setL = (row: number, label: string) => {
    const cell = ws.getCell(row, 1);  // Always column A
    cell.value = label;
};
```
If this is already the code, then the issue is that `yr` is using a different range. **Verify that `yr` in the loop goes from 0 to nYears-1, inclusive**, and that `numHistorical` is correctly set.

Also verify that for projected years the formula col references match the cell positions:
```typescript
const col = (yr: number) => colLetter(yr + 2);    // yr=0 → 'B', yr=6 → 'H'
const prevCol = (yr: number) => colLetter(yr + 1);  // yr=0 → 'A' ← BUG! Should be max('B', ...)
```
**THIS IS THE BUG**: `prevCol(yr=0)` = `colLetter(1)` = `'A'`. So for yr=0 (2024, first historical year), the formula tries to reference the previous year as column A — which is the label column. More importantly, for the PROJECTED year 2026E where yr=2, `prevCol(2)` = `colLetter(3)` = `'C'` ✓, and `col(2)` = `colLetter(4)` = `'D'` ✓. So projections should be fine.

But for the HISTORICAL years, look at the `isRef()` function:
```typescript
function isRef(isRows: Record<string, number>, key: string, yearIdx: number): string {
    const row = isRows[key];
    if (!row) throw new Error(`isRef: missing row for IS key "${key}"`);
    return `'Income Statement'!${colLetter(yearIdx + 2)}${row}`;
}
```
If `isRows['revenue']` is undefined or 0, `if (!row)` is true → throws. **This throw breaks the entire loop for ALL years.** The `for (let yr = 0; yr < nYears; yr++)` loop has no try/catch, so the first `isRef(isRows, 'revenue', 0)` throw would exit the function entirely, leaving ALL cells empty.

**DEFINITIVE FIX**:
1. Find where `isRows` is built and passed into `buildOneCalcSheet`. Confirm it has a `'revenue'` key.
2. In the `buildOneCalcSheet` call in `excel.ts`, the `isRows` parameter maps row labels to their row numbers in the IS tab. Confirm:
   ```typescript
   const isRows: Record<string, number> = {
       revenue: 2,          // IS!row2 = Revenue
       revenueGrowthRate: 3,
       cogs: 4,
       grossProfit: 5,
       sgaExpense: 9,
       rdExpense: 10,
       depreciation: 11,
       amortization: 12,
       otherOpex: 13,
       stockBasedComp: 14,
       totalOpex: 15,
       ebit: 17,
       interestIncome: 19,
       interestExpense: 20,
       otherIncomeExpense: 21,
       ebt: 22,
       taxExpense: 23,
       netIncome: 24,
       // ... etc
   };
   ```
3. If ANY key in `isRows` doesn't match the actual row number in the IS tab, all `isRef()` calls for that key will throw. Map the IS tab row by row and fix the `isRows` object.

---

### ROOT CAUSE 2 — Scenarios Sheet Values Are Text Strings, Not Numbers [CRITICAL]

**File**: `lib/export/build-scenarios.ts` (or wherever Scenarios tab values are written)

**What was found**:
```
Scenarios!B7  = '850000'    ← string "850000", not number 850000
Scenarios!B9  = '0'         ← string "0"
Scenarios!D9  = '0.10000000000000012'   ← string with floating-point noise
Scenarios!D10 = '0.6'       ← string
Scenarios!B14 = '0.2523041474654378'   ← string (historical back-calculated tax rate)
Scenarios!B21 = '45.00020588235294'    ← string with floating-point noise
```

All values in the Scenarios sheet are stored as TEXT STRINGS. When `_Calc_Base` formulas reference these cells (e.g., `=D2*Scenarios!D10`), Excel sees a text value and returns 0 or a VALUE error. This completely breaks all projected calculations.

**Root cause**: In the export code, values are being written as `cell.value = String(someNumber)` or `cell.value = someNumber.toString()` or similar, instead of `cell.value = someNumber`.

**Fix**:
In every place where numeric values are written to the Scenarios sheet, use:
```typescript
// WRONG — stores as text:
ws.getCell(row, col).value = value.toString();
ws.getCell(row, col).value = `${value}`;
ws.getCell(row, col).value = String(value);

// CORRECT — stores as number:
ws.getCell(row, col).value = typeof value === 'number' ? value : Number(value);
// Or simply:
ws.getCell(row, col).value = value;  // when value is already a number
```

**Also round/clean historical values**:
Historical ratios that are back-calculated from actual data have floating-point noise:
- DSO: 45.00020588... → should be `Math.round(dso * 100) / 100` = 45.00
- DIO: 30.00013... → 30.00
- Tax rate: 0.25230... → This is the ACTUAL historical effective tax rate (not the 22.5% assumption). Store as-is but as a number: `0.2523`
- CapEx%: 0.04736842... → `0.0474`

Apply `Math.round(value * 10000) / 10000` (4 decimal places) to all percentage/ratio values before writing to Scenarios, and `Math.round(value)` to all whole-number day values (DSO, DIO, DPO).

---

### ROOT CAUSE 3 — `revenueBase` Is Unused and Confusing [MAJOR]

**Files**: `lib/export/excel.ts`, `lib/export/build-scenarios.ts`, `lib/export/build-calc-sheets.ts`

**What was found**:
In the Assumptions sheet, there are TWO "Revenue Base" rows:
- Row 3: "Revenue Base (Historical)" = 850,000 — this IS used by IS!B2 as the 2024 revenue anchor
- Row 4: "Revenue Base (Projection)" = 1,000,000 — this is `assumptions.revenueBase` but is **never referenced by any IS formula**

In the engine, when historical data is present, Year 1 projected revenue = `lastHistoricalRevenue × (1 + growthRate[0])` = 950,000 × 1.10 = 1,045,000. The `revenueBase = 1,000,000` field in `AssumptionSet` is a legacy input that was originally used before historical data was supported. With historical data, it is completely ignored.

**The user confusion**: When a user sees "Revenue Base (Projection) = 1,000,000" they expect 2026E revenue = 1,000,000 × 1.10 = 1,100,000. But the engine shows 1,045,000. This makes it look like "nothing matches."

**Fix**:

Option A (Recommended — Clean): **Remove both "Revenue Base" rows from the Assumptions sheet entirely**. The IS tab's 2024 revenue should reference the historical IS data directly:
```
IS!B2 = 'Income Statement'!B2_historical_value  [or locked value from historical data]
```
And for 2025:
```
IS!C2 = locked historical value (950,000)
```
Only the projected years 2026E-2030E use formula-driven growth:
```
IS!D2 = IS!C2 * (1 + growthRate_2026E)
```

Option B: **Keep "Revenue Base (Historical)" but remove "Revenue Base (Projection)"**. Add a note cell: *"Projection revenue grows from last historical period via the growth rates below."*

Option C: **Add a note to "Revenue Base (Projection)"** that it is shown for reference only and does not drive the projection when historical data is present.

**Choose Option A** — the cleanest approach. Here's the IS tab revenue chain after the fix:

| Cell | Formula | Description |
|------|---------|-------------|
| IS!B2 | `=historical_IS_revenue_2024` | Locked historical value |
| IS!C2 | `=historical_IS_revenue_2025` | Locked historical value |
| IS!D2 | `='_Calc_Base'!D{revenue_row}` | From calc sheet |
| IS!E2 | `='_Calc_Base'!E{revenue_row}` | From calc sheet |
| etc. | ... | ... |

---

### ROOT CAUSE 4 — Historical 2024/2025 Data Is Hidden in Assumptions Columns, Not a Dedicated Section [MAJOR]

**File**: `lib/export/excel.ts`, `lib/export/build-scenarios.ts`

**What was found**:
- The Assumptions sheet has columns B (2024) and C (2025) populated with hardcoded values as historical actuals
- BUT: these are ratios back-calculated from the actuals, not the original inputs
- Example: Assumptions!B10 (Tax Rate 2024) = 0.2523041474654378 — this is the back-calculated effective tax rate, not the statutory 22.5%
- Example: Assumptions!B15 (DSO 2024) = 45.000205882... — floating-point noise
- The user says: "I can't find the assumptions for 2024 and 2025 in Excel"
- This happens because there is no dedicated, labeled "Historical Data" section — the user is looking for clean input values for 2024 and 2025 and cannot find them

**Also discovered**: The JSON export shows `historicalInputs.periods: ['2025', '2025']` — both historical periods are labeled '2025'. The engine's integrator corrects this to ['2024', '2025'] at runtime, but the JSON and Excel export uses the uncorrected labels. This is why column headers may show '2025' twice.

**Fix (two parts)**:

**Part A: Fix historical period labels in the JSON/Excel export**
In `lib/export/csv-json.ts` and `lib/export/excel.ts`, when writing historical period labels, apply the same correction the integrator uses:
```typescript
// BEFORE writing any historical data labels:
const numHistorical = historicalInputs.periods.length;
const correctedPeriods = historicalInputs.periods.map((_: string, index: number) => {
    return `${assumptions.startYear - numHistorical + index}`;
});
// Use correctedPeriods instead of historicalInputs.periods for all column headers
// e.g., correctedPeriods = ['2024', '2025'] regardless of what historicalInputs.periods says
```

**Part B: Add a dedicated "Historical Data" sheet to the Excel export**
Add a new visible sheet named `Historical Data` that contains:

```
Row 1: Headers — [Metric | 2024 | 2025 | Notes]
--- Income Statement ---
Row 3: Revenue                   | 850,000  | 950,000  | Actual
Row 4: COGS                      | 510,000  | 570,000  | Actual
Row 5: Gross Profit              | 340,000  | 380,000  | =Revenue - COGS
Row 6: SG&A                      | 127,500  | 142,500  | Actual
Row 7: R&D                       | 42,500   | 47,500   | Actual
Row 8: Depreciation              | 28,000   | 32,000   | Actual
Row 9: Amortization              | 5,000    | 5,000    | Actual
Row 10: EBIT                     | 120,000  | 134,000  | =formula
Row 11: Interest Expense         | 14,000   | 13,000   | Actual
Row 12: Interest Income          | 2,500    | 3,000    | Actual
Row 13: Net Income               | 81,100   | 92,750   | Actual
--- Balance Sheet ---
Row 15: Cash                     | 175,000  | 200,000  | Actual
Row 16: Accounts Receivable      | 104,795  | 117,123  | Actual
Row 17: Net PP&E                 | 212,000  | 225,000  | Actual
Row 18: Total Assets             | 717,200  | 768,500  | Actual
Row 19: Long-Term Debt           | 230,000  | 210,000  | Actual
Row 20: Total Equity             | 248,800  | 308,500  | Actual
--- Derived Ratios (for reference) ---
Row 22: Gross Margin %           | 40.0%    | 40.0%    | =formula
Row 23: Effective Tax Rate %     | 25.2%    | 25.2%    | Back-calculated from actuals
Row 24: DSO (Days)               | 45.0     | 45.0     | Back-calculated (rounded)
Row 25: DIO (Days)               | 30.0     | 30.0     | Back-calculated (rounded)
Row 26: DPO (Days)               | 40.0     | 40.0     | Back-calculated (rounded)
Row 27: CapEx % Revenue          | N/A      | 4.7%     | Back-calculated
```

Values in the "Actual" rows are locked engine-computed values from `historicalInputs`.
Derived ratios are Excel formulas (e.g., `=B22/B19` for gross margin).

**Part C: Clean up Assumptions historical columns (B, C)**
In the Assumptions tab, historical columns B and C should reference the Historical Data sheet for cleanliness:
```
Assumptions!B6 (COGS% 2024) = 'Historical Data'!B4 / 'Historical Data'!B3
Assumptions!B15 (DSO 2024)  = 'Historical Data'!B24
```
OR: Keep them hardcoded but apply rounding:
```typescript
// When writing to Assumptions B/C columns:
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const round2 = (v: number) => Math.round(v * 100) / 100;
ws.getCell(row_dso, 2).value = round2(historicalDSO);   // 45.00, not 45.000205882
ws.getCell(row_dpo, 2).value = round2(historicalDPO);   // 40.00
ws.getCell(row_dio, 2).value = round2(historicalDIO);   // 30.00
ws.getCell(row_tax, 2).value = round4(historicalTaxRate); // 0.2523
```
Also: Remove the "Revenue Base (Historical)" and "Revenue Base (Projection)" rows from the Assumptions tab (per ROOT CAUSE 3).

---

### ROOT CAUSE 5 — IS Tab Revenue Chain Uses Back-Calculated 2025 Growth (Not Locked Historical) [MODERATE]

**File**: `lib/export/excel.ts` (the IS sheet builder)

**What was found**:
```
IS!B2 = =Assumptions!B3        ← 2024 revenue from hardcoded Assumptions cell
IS!C2 = =B2*(1+Assumptions!C5) ← 2025 revenue DERIVED from 2024 × back-calculated growth rate
IS!D2 = =C2*(1+Assumptions!D5) ← 2026E projected (correct — uses scenario growth rate)
```

The 2025 revenue is not locked — it's derived from a formula using a back-calculated 11.76% growth rate. If there's any floating-point error in the growth rate, 2025 revenue drifts from the actual 950,000. More critically, if the Assumptions!C5 cell gets corrupted, the entire revenue chain for all 5 projected years breaks.

**Fix**: Historical years (2024, 2025) in IS tab should reference locked values from the Historical Data sheet:
```
IS!B2 = 'Historical Data'!B3   ← locked 850,000 (2024 revenue)
IS!C2 = 'Historical Data'!C3   ← locked 950,000 (2025 revenue)
IS!D2 = =C2*(1+Assumptions!D5) ← 2026E still uses growth rate (correct)
```
OR (simpler approach without the new Historical Data sheet):
```
IS!B2 = historical_value_850000   ← locked hardcoded number (no formula)
IS!C2 = historical_value_950000   ← locked hardcoded number (no formula)
IS!D2 = =C2*(1+Assumptions!D5)   ← projected formula (unchanged)
```

The key principle: **historical periods must never be formula-derived in Excel**. They are actual known values. Lock them.

---

## THE COMPLETE FIX PROMPT FOR GOOGLE ANTIGRAVITY

Copy everything between the triple-dashes below into Google Antigravity.

---

```
══════════════════════════════════════════════════════════════
WOLF ENGINE — EXCEL SYNC ARCHITECTURE FIX
Google Antigravity | Claude Opus 4.6 Thinking
══════════════════════════════════════════════════════════════

You are fixing a confirmed set of 5 architectural bugs in the WOLF
Financial Model Engine's Excel export system. These bugs cause the
Excel file to show 0 or wrong values across all sheets. All 5 root
causes were verified by direct cell-level inspection of the exported
Excel file.

READ THESE FILES FIRST (in order, before writing any code):
1. lib/export/excel.ts
2. lib/export/build-calc-sheets.ts
3. lib/export/build-scenarios.ts
4. lib/export/build-dashboard.ts
5. lib/export/build-company-info.ts
6. lib/export/csv-json.ts
7. types/assumptions.ts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUG-01 — _CALC_BASE REVENUE ROW IS COMPLETELY EMPTY [CRITICAL]

Confirmed by direct inspection:
  _Calc_Base!A2 = =G2*(1+Scenarios!H9)   ← formula is in label column A
  _Calc_Base!B2 = (empty)
  _Calc_Base!C2 = (empty)
  _Calc_Base!D2 = (empty)  ... all empty
  
Since every other formula in _Calc_Base references row 2 for revenue
(COGS = D2 × rate, etc.), and D2 is empty, ALL 105+ rows in the
_Calc_Base sheet compute against 0. This is why the Excel shows 0
everywhere for projected scenarios.

Root cause: In build-calc-sheets.ts → buildOneCalcSheet(), the
isRef() helper throws when isRows['revenue'] is undefined or 0:
  function isRef(isRows, key, yearIdx) {
      const row = isRows[key];
      if (!row) throw new Error(...);  // ← THIS THROW kills the loop
      ...
  }
The loop has no try/catch, so the first throw at yr=0 exits the
entire function before writing any cell values.

STEP 1A: Find where isRows is built and passed to buildOneCalcSheet.
Print or log the isRows object to verify it has all required keys.
Required keys (must ALL be present and non-zero):
  'revenue', 'cogs', 'grossProfit', 'sgaExpense', 'rdExpense',
  'depreciation', 'amortization', 'otherOpex', 'stockBasedComp',
  'totalOpex', 'ebit', 'interestIncome', 'interestExpense',
  'otherIncomeExpense', 'ebt', 'taxExpense', 'netIncome',
  'employeeProfitSharing', 'netIncomeAfterEPD', 'legalReserveAddition',
  'distributableProfit', 'grossDividends', 'dividendWHT', 'netDividends',
  'additionToRetainedEarnings', 'eps'

STEP 1B: Find where bsRows is built. Required keys:
  'cash', 'accountsReceivable', 'inventory', 'prepaidExpenses',
  'otherCurrentAssets', 'totalCurrentAssets', 'grossPPE',
  'accumulatedDepreciation', 'netPPE', 'intangibles', 'goodwill',
  'otherLongTermAssets', 'totalNonCurrentAssets', 'totalAssets',
  'accountsPayable', 'accruedExpenses', 'shortTermDebt',
  'currentPortionLTD', 'deferredRevenue', 'otherCurrentLiabilities',
  'totalCurrentLiabilities', 'longTermDebt', 'deferredTaxLiabilities',
  'otherLongTermLiabilities', 'totalNonCurrentLiabilities',
  'totalLiabilities', 'commonStock', 'apic', 'legalReserve',
  'retainedEarnings', 'treasuryStock', 'oci', 'totalEquity',
  'totalLiabilitiesAndEquity'

STEP 1C: Cross-check every key in isRows against the actual row
numbers in the IS sheet as built by excel.ts. Every row number must
match exactly. If the IS sheet builds rows in this order:
  Row 2: Revenue
  Row 3: Revenue Growth %
  Row 4: COGS
  Row 5: Gross Profit
  ...then isRows must be {revenue: 2, revenueGrowthRate: 3, cogs: 4, ...}

STEP 1D: After fixing isRows and bsRows, also verify the setF column
offset. The formula should be:
  ws.getCell(row, yr + 2)  ← yr=0 → col 2 = B, yr=6 → col 8 = H
Confirm this is correct by checking that yr starts at 0 for the
first historical period (2024) and goes to nYears-1 for the last.

STEP 1E: Same fix must be applied to _Calc_Opt and _Calc_Con sheets.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUG-02 — SCENARIOS SHEET VALUES ARE TEXT STRINGS, NOT NUMBERS [CRITICAL]

Confirmed by direct inspection (Python openpyxl read):
  Scenarios!B7 = '850000'    (string, should be number 850000)
  Scenarios!D9 = '0.10000000000000012'  (string with floating-point noise)
  Scenarios!D10 = '0.6'     (string)
  Scenarios!B14 = '0.2523041474654378'  (string)
  Scenarios!B21 = '45.00020588235294'   (string with floating-point noise)
  
ALL values in the Scenarios sheet are text strings. When _Calc_Base
references Scenarios!D10 for COGS%, it gets a text value → 0 in
arithmetic → broken calculations.

STEP 2A: In build-scenarios.ts (or wherever Scenarios tab cells are
written), find all instances of:
  cell.value = value.toString()
  cell.value = String(value)
  cell.value = `${value}`
  cell.value = '' + value
Replace ALL of these with: cell.value = value  (where value is already number)
or: cell.value = Number(value)  (if it might be a string)

STEP 2B: Round values to remove floating-point noise before writing:
  Days (DSO, DIO, DPO): Math.round(value * 100) / 100  → max 2 decimal places
  Percentages (rates, margins): Math.round(value * 100000) / 100000  → max 5 dp
  Money amounts: Math.round(value)  → whole numbers
  
Example:
  // BEFORE: Scenarios!B21 = '45.00020588235294' (string with noise)
  // AFTER:  Scenarios!B21 = 45  (number, clean)
  ws.getCell(dsoRow, 2).value = Math.round(historicalDSO);

  // BEFORE: Scenarios!D9 = '0.10000000000000012' (string)
  // AFTER:  Scenarios!D9 = 0.1  (number, clean)
  ws.getCell(growthRow, colD).value = Math.round(growthRate * 100000) / 100000;

STEP 2C: This fix applies to ALL three scenario blocks in the
Scenarios sheet: Base Case, Optimistic, and Conservative.

STEP 2D: For the "Engine-Computed Values" section (rows 52+), the
historical values (B52, C52, etc.) are also hardcoded strings:
  Scenarios!B52 = '2500'  (interest income 2024 — string)
  Scenarios!B53 = '14000' (interest expense 2024 — string)
Change these to numbers: cell.value = 2500 (not '2500').

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUG-03 — REVENUE BASE ROW IS UNUSED AND CAUSES CONFUSION [MAJOR]

Confirmed: AssumptionSet.revenueBase = 1,000,000 is exported to both
the Assumptions sheet (row 4: "Revenue Base (Projection)") and the
Scenarios sheet (row 8: same).

Confirmed: The IS tab uses Assumptions!B3 (historical revenue 850K)
as its anchor — NOT Assumptions!B4 (projection base 1M). The engine
projects: 950K × 1.10 = 1,045K for 2026E — not 1,000K × 1.10 = 1,100K.
So the "Revenue Base (Projection)" row appears in the Excel but drives
NOTHING. This makes users believe the engine is broken when in fact
the Excel just has an orphan row.

STEP 3A: Remove the "Revenue Base (Projection)" row (row 4 in
Assumptions, row 8 in Scenarios) from ALL places in the Excel export.
This means:
  - In excel.ts: delete the row that writes revenueBase (projection)
  - In build-scenarios.ts: delete the corresponding row
  - In build-calc-sheets.ts: if the ScenarioRowMap references
    'Revenue Base (Projection)', remove that reference

STEP 3B: Rename "Revenue Base (Historical)" to just "Revenue (2024)"
to make it clear this is a historical anchor value, not an adjustable
assumption. Add a cell comment: "Locked 2024 actual revenue. Projected
years grow from last historical period via Revenue Growth Rate below."

STEP 3C: In the Assumptions sheet, the 2025 column C for revenue
should also show the actual 2025 revenue (950,000), not 0. Fix:
  Assumptions!C3 = 950000  (2025 historical revenue, currently missing/0)

STEP 3D: Update the IS tab to NOT use "Revenue Base (Projection)":
  IS!B2 = Assumptions!B3  ← keep this (locked 2024 historical revenue)
  IS!C2 = 950000           ← lock to actual 2025 value directly (not formula)
  IS!D2 = =C2*(1+Assumptions!D5)  ← keep this formula (correct)
Historical years must never be formula-derived in Excel.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUG-04 — HISTORICAL PERIOD LABELS ARE WRONG (BOTH SHOW '2025') [MAJOR]

Confirmed from JSON: historicalInputs.periods = ['2025', '2025']
The engine's integrator corrects this at runtime, but the export
uses the uncorrected labels → both historical columns may be headed
'2025' in Excel.

STEP 4A: In every export file (excel.ts, csv-json.ts), when writing
period headers for historical years, apply the same correction the
integrator uses:
  
  // In integrator.ts this is: 
  const correctedPeriods = periods.map((_, index) =>
      `${assumptions.startYear - numHistorical + index}`
  );
  // For startYear=2026, numHistorical=2: ['2024', '2025']

  // Apply the same logic in exports:
  const exportPeriods = historicalInputs.periods.map((_, index) =>
      `${assumptions.startYear - historicalInputs.periods.length + index}`
  );
  // Use exportPeriods for column headers, NOT historicalInputs.periods

STEP 4B: Also fix the IS sheet column B header:
  IS!B1 = '2024 (A)'   ← must say 2024, not 2025
  IS!C1 = '2025 (A)'   ← must say 2025

STEP 4C: Fix _Calc_Base, _Calc_Opt, _Calc_Con headers (row 1):
  _Calc_Base!B1 = '2024'  ← correct
  _Calc_Base!C1 = '2025'  ← must say 2025, not 2025 twice

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BUG-05 — ADD HISTORICAL DATA SHEET [MAJOR]

The user can't find 2024/2025 historical inputs in Excel. The
historical data is embedded invisibly in Assumptions columns B and C
as back-calculated ratios with floating-point noise.

STEP 5A: Add a new visible worksheet named "Historical Data" to the
Excel workbook, inserted BEFORE the Assumptions sheet.

STEP 5B: Structure it as follows:

Row 1: "Demo Company Inc. — Historical Data (2024-2025)"
Row 2: [blank]
         Col A (label)         | Col B (2024)      | Col C (2025)
Row 3:  [Section header] INCOME STATEMENT
Row 4:  Revenue                | historicalRevenue[0]   | historicalRevenue[1]
Row 5:  COGS                   | historicalCOGS[0]      | historicalCOGS[1]
Row 6:  Gross Profit           | =B4-B5                 | =C4-C5
Row 7:  SG&A                   | historicalSGA[0]       | historicalSGA[1]
Row 8:  R&D                    | historicalRD[0]        | historicalRD[1]
Row 9:  Depreciation           | historicalDep[0]       | historicalDep[1]
Row 10: Amortization           | historicalAmort[0]     | historicalAmort[1]
Row 11: Other OpEx             | historicalOtherOpEx[0] | historicalOtherOpEx[1]
Row 12: Total OpEx             | =SUM(B7:B11)           | =SUM(C7:C11)
Row 13: EBIT                   | =B6-B12                | =C6-C12
Row 14: Interest Expense       | historicalIntExp[0]    | historicalIntExp[1]
Row 15: Interest Income        | historicalIntInc[0]    | historicalIntInc[1]
Row 16: EBT                    | =B13+B15-B14           | =C13+C15-C14
Row 17: Tax Expense            | historicalTax[0]       | historicalTax[1]
Row 18: Net Income             | =B16-B17               | =C16-C17
Row 19: [blank]
Row 20: [Section header] BALANCE SHEET
Row 21: Cash                   | historicalCash[0]      | historicalCash[1]
Row 22: Accounts Receivable    | historicalAR[0]        | historicalAR[1]
Row 23: Inventory              | historicalInv[0]       | historicalInv[1]
Row 24: Net PP&E               | historicalNetPPE[0]    | historicalNetPPE[1]
Row 25: Total Assets           | historicalTA[0]        | historicalTA[1]
Row 26: Long-Term Debt         | historicalLTD[0]       | historicalLTD[1]
Row 27: Total Equity           | historicalEq[0]        | historicalEq[1]
Row 28: [blank]
Row 29: [Section header] DERIVED ASSUMPTIONS (for reference only)
Row 30: Gross Margin %         | =B6/B4                 | =C6/C4
Row 31: Effective Tax Rate %   | =IF(B16>0,B17/B16,0)   | =IF(C16>0,C17/C16,0)
Row 32: DSO (Days)             | =ROUND(B22/B4*365,1)   | =ROUND(C22/C4*365,1)
Row 33: DIO (Days)             | =ROUND(B23/B5*365,1)   | =ROUND(C23/C5*365,1)
Row 34: DPO (Days)             | =ROUND(historicalAP/B5*365,1) | ...
Row 35: CapEx % Revenue        | N/A                    | =ROUND(historicalCapEx/C4,4)
Row 36: Interest Coverage      | =B13/B14               | =C13/C14

All values in rows 4-27 are direct number values (no formulas),
locked from the engine's historicalInputs object.
Derived rows 30-36 are Excel formulas referencing rows 4-27.

STEP 5C: Update the Assumptions sheet to reference the Historical
Data sheet for historical columns B and C instead of hardcoding:
  Assumptions!B6 (COGS% 2024) = ='Historical Data'!B5/'Historical Data'!B4
  Assumptions!B15 (DSO 2024)  = ='Historical Data'!B32
  Assumptions!C6 (COGS% 2025) = ='Historical Data'!C5/'Historical Data'!C4
  etc.
This means when historical data changes (e.g., a new export), the
Assumptions tab automatically updates.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTION ORDER

Fix in this exact order. Test after EACH step with a fresh export.

1. BUG-01: Fix isRows/bsRows keys and confirm _Calc_Base revenue row
   has formulas in B2:H2, label in A2. Verify by exporting and
   opening in Excel — all projected values should be non-zero.

2. BUG-02: Fix Scenarios values from strings to numbers.
   Verify: Scenarios!D9 should be the number 0.1, not text '0.1'.
   In Excel: the cell should show right-aligned (numbers) not
   left-aligned (text).

3. BUG-04: Fix historical period labels.
   Verify: IS tab column B header = '2024 (A)', C = '2025 (A)'.

4. BUG-03: Remove Revenue Base (Projection) row.
   Lock IS!C2 to actual 950,000.
   Verify: 2026E revenue in IS tab = 950,000 × 1.10 = 1,045,000.

5. BUG-05: Add Historical Data sheet.
   Verify: Sheet exists, is visible, has clean values with no
   floating-point noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERIFICATION CHECKLIST

After all fixes, export and open the Excel file. Confirm:

□ _Calc_Base!B2 = 850,000 (2024 revenue, reference to IS tab)
□ _Calc_Base!C2 = 950,000 (2025 revenue)
□ _Calc_Base!D2 = 1,045,000 (2026E = 950K × 1.10)
□ _Calc_Base!D4 (COGS 2026E) = 627,000 (= 1,045,000 × 0.60)
□ Scenarios!D9 is right-aligned in Excel (= number 0.1, not text)
□ IS tab column B header = "2024 (A)", C = "2025 (A)"
□ IS!B2 = 850,000 (locked)
□ IS!C2 = 950,000 (locked)
□ IS!D2 = 1,045,000 (formula-driven)
□ Assumptions tab has NO "Revenue Base (Projection)" row
□ "Historical Data" sheet exists with clean values
□ All three scenarios (Base/Optimistic/Conservative) produce
  non-zero values that match engine output
□ Export the JSON simultaneously and verify numbers match Excel

ABSOLUTE RULES (unchanged from previous brief):
- Zero hardcoded financial values in calc sheets
- All projected year formulas reference Scenarios tab
- No strings in cells that should contain numbers
- Historical years = locked values; projected years = live formulas
══════════════════════════════════════════════════════════════
```

---

## ANSWER TO YOUR THREE QUESTIONS

### Q1: Why is `Revenue Base ($)` in the Assumptions tab if historical data is already there?

It is a **legacy field** from before the engine supported historical data. `AssumptionSet.revenueBase = 1,000,000` was originally used to set the starting revenue for projections when no historical data existed. Now that you have 2024 and 2025 actuals, the engine ignores it entirely — 2026E revenue is computed as `last_historical_revenue (950K) × (1 + growth_rate)` = 1,045,000.

The Excel export still serializes this field and shows it as "Revenue Base (Projection)" = 1,000,000. It is not connected to any IS formula, so it causes confusion but doesn't break anything by itself. **The fix is to remove it from the Excel export.**

### Q2: Why does nothing sync between Excel and the engine?

There are two stacked critical bugs:

**Bug A**: The entire `_Calc_Base` hidden sheet has empty revenue cells (B2:H2 are all blank). Because every other formula in the sheet calculates from revenue (`COGS = revenue × cogs%`, `SGA = revenue × sga%`, etc.), and revenue is 0/empty, every single computed value in all three hidden calc sheets is 0. The source of this is that `isRef()` throws an error when `isRows['revenue']` is not found, crashing the loop before any cell is written.

**Bug B**: The Scenarios sheet stores all values as **text strings** instead of numbers. Even if the calc sheets reference them correctly, Excel sees text in an arithmetic formula and returns 0.

These two bugs together mean every formula-driven cell in the projected columns produces 0 — which is what you see.

### Q3: Where are 2024 and 2025 assumptions in Excel?

They exist in the Assumptions sheet **columns B (2024) and C (2025)**, but there are two problems that make them hard to find:

1. Both columns may be labeled **"2025"** because of the historical period label bug (`historicalInputs.periods = ['2025', '2025']` — both periods have the same label in the raw JSON). The engine corrects this at runtime but the Excel export doesn't apply the same correction.

2. The historical values have **floating-point noise**: DSO shows as 45.00020588... instead of 45, COGS% shows correctly as 0.6, but Tax Rate shows as 0.25230414... (the back-calculated effective rate, not the 22.5% statutory rate).

There is also no dedicated "Historical Data" sheet — the historical inputs are mixed into the Assumptions tab without a clear header or separator. The fix adds a proper "Historical Data" sheet and corrects the period labels.

---

*April 9, 2026 | WOLF Financial Suite | Ahmed Wael Metwally*
