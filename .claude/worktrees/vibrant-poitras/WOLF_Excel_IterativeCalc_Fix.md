# WOLF Engine — Excel Sync Bug: Root Cause Confirmed
## Prompt for Google Antigravity (Claude Opus 4.6 Thinking)

---

## DIAGNOSIS — CONFIRMED BY DIRECT INSPECTION

All three issues (wrong values in Engine-Computed Values, scenarios not matching,
interest income 39,387 instead of 61,771) have ONE single root cause.

### What the investigation found

The Excel file was opened with Python using `data_only=True` (reads cached computed values
exactly as saved) and compared against the engine JSON.

**_Calc_Base cached values = Engine exactly:**
```
Row 16 Interest Income:  2026E=38,000  2027E=61,771  2028E=64,136  2029E=65,351  2030E=70,416
Row 17 Interest Expense: 2026E=61,600  2027E=52,000  2028E=43,200  2029E=37,400  2030E=32,000
Row 36 Cash:             2026E=363,361 2027E=427,570 2028E=502,701 2029E=586,796 2030E=681,284
Row 21 Net Income:       2026E=84,000  2027E=117,314 2028E=132,461 2029E=143,185 2030E=155,140
```

These match the engine JSON perfectly. So _Calc_Base is NOT broken.

**The Scenarios "Engine-Computed Values" section also reads correctly from the cache:**
```
Scenarios E51 (IntInc 2027E) = 61,771  ← correct when read from cached values
```

**But when the user opens the file in Excel, it shows 39,387.**

Why? Because the workbook has `fullCalcOnLoad=True`.

This forces Excel to run a FULL RECALCULATION on every file open. The 2027E+ interest
income formula is: `=D36 × Scenarios!E33` (cash rate), where D36 = ending cash for 2026E.
Cash is circular (Cash → CFO → Net Change → Ending Cash → Cash → Interest Income → ...).

Excel CAN solve this correctly using iterative calculation. The workbook already has
`iterate=True` and `iterateCount=1000` set in its calcProperties. BUT these properties
are applied at the WORKBOOK level and can be overridden by the user's Excel application
settings. If the user's Excel has iterative calculation disabled in their personal
settings (File → Options → Formulas), that overrides the file setting.

With iterative calc off + fullCalcOnLoad=True + circular reference:
- First-pass Cash 2026E = ~231,688 (instead of converged 363,361)
- Interest Income 2027E = 231,688 × 0.17 = 39,387 ← EXACTLY what the user sees
- This propagates wrong cash to 2028E, 2029E, 2030E → all three are wrong
- Same issue affects _Calc_Opt and _Calc_Con → all scenarios wrong

**Proof:** 39,387 ÷ 0.17 = 231,688 = the first-pass non-converged cash balance. ✓

---

## THE FIX — ONE LINE CHANGE + ONE STRUCTURAL IMPROVEMENT

### Part A: Set fullCalcOnLoad = false  [THE CRITICAL FIX]

**File**: `lib/export/excel.ts` (wherever workbook calcProperties are set)

**Find** (current code):
```typescript
workbook.calcProperties = {
    fullCalcOnLoad: true,   // ← THIS IS THE BUG
    iterate: true,
    iterateCount: 1000,
    iterateDelta: 0.001,
};
```

**Replace with**:
```typescript
workbook.calcProperties = {
    fullCalcOnLoad: false,  // ← DO NOT recalculate on open; use cached engine values
    iterate: true,          // ← Iterative calc mode: on (in case user does recalculate)
    iterateCount: 1000,     // ← 1000 iterations (matches browser engine's convergence)
    iterateDelta: 0.001,    // ← Convergence tolerance
};
```

**Why this works**: With `fullCalcOnLoad=false`, Excel displays the pre-computed cached
values that were baked in at export time. These cached values came directly from the
WOLF JavaScript engine and are 100% correct. The user sees the right numbers immediately
without needing any Excel calculation to run.

The `iterate=true` setting remains so that IF the user manually changes an assumption
and forces a recalculation (Ctrl+Alt+F9), Excel will use iterative mode to resolve
circular references correctly — but ONLY if they've also enabled it in their own
Excel settings.

---

### Part B: Add a Recalculation Guide Cell in Each Calc Sheet  [UX IMPROVEMENT]

**File**: `lib/export/build-calc-sheets.ts`

The iterative calculation warning was already added as a cell at row 2. Improve it:

```typescript
// Replace the existing warning cell content (row 2) with this:
const warningCell = ws.getCell(2, 1);
warningCell.value = [
    '⚠ IMPORTANT — HOW TO RECALCULATE AFTER CHANGING ASSUMPTIONS:',
    '1. In Excel: File → Options → Formulas → check "Enable iterative calculation"',
    '   Set Max Iterations = 1000 | Max Change = 0.001 | then click OK',
    '2. Press Ctrl+Alt+F9 (Force full recalculation)',
    '3. Values displayed by default are pre-calculated from the WOLF engine and are correct as-is.',
    '   Do NOT press F9 or allow Excel to auto-recalculate without completing step 1 first.',
].join('  |  ');
warningCell.font = { bold: true, color: { argb: 'FFCC0000' }, size: 9 };
warningCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
ws.mergeCells(2, 1, 2, nYears + 1);
warningCell.alignment = { wrapText: true };
ws.getRow(2).height = 40;
```

---

### Part C: Ensure ALL Formula Cells Have Cached Engine Values  [VERIFICATION]

**Files**: `lib/export/build-calc-sheets.ts`, `lib/export/build-scenarios.ts`

The `setF()` helper in build-calc-sheets.ts writes cells as:
```typescript
cell.value = { formula: '=...', result: engineValue };
```

Verify that `engineValue` is never `undefined` or `0` for projected years where the
engine has real data. Specifically verify these rows get correct results parameter:

In `buildOneCalcSheet()`, make sure `results` is being passed and used:
```typescript
const isData = results?.incomeStatements?.[yr] ?? null;
const bsData = results?.balanceSheets?.[yr] ?? null;

// Row 16 (Interest Income) — must use correct engine value:
setF(R.interestIncome, yr,
    isProjected ? `=C36*Scenarios!${col(yr-1)}33` : isRef(isRows, 'interestIncome', yr),
    isData?.interestIncome ?? 0  // ← This must be the real engine value, e.g. 61771 for 2027E
);
```

If `isData?.interestIncome` is null for projected years (because the DCF bug prevented
full ModelResults from being populated), the cached result defaults to 0 → wrong display.

**Check**: After the DCF fix (FIX-02 from previous brief), `results.incomeStatements`
should include all projected years. Confirm this by logging the `results` object length
before building calc sheets. It should have `historicalYears + projectionYears` entries.

---

### Part D: Fix the Interest Income Rate Reference  [FORMULA CORRECTNESS]

**File**: `lib/export/build-calc-sheets.ts`

The current interest income formula uses `Scenarios!D32` (debt rate row) instead of
`Scenarios!D33` (cash rate row):

```typescript
// Current (may be wrong depending on your Scenarios row layout):
col4='=C36*Scenarios!D32'   ← row 32 = Interest Rate on DEBT

// Correct (must use cash rate):
col4='=C36*Scenarios!D33'   ← row 33 = Interest Income Rate on CASH
```

**Verify by checking your Scenarios row layout**. Count rows from top:
- If Row 32 = "Interest Rate (on Debt)" AND Row 33 = "Interest Income Rate (on Cash)",
  then the formula should reference Row 33 for interest INCOME and Row 32 for interest EXPENSE.

Check the formula generated by `scenRef(scenarioRows, blockName, 'interestRateOnCash', yr)`.
This should produce `Scenarios!D33` for 2026E, not `Scenarios!D32`.

If the ScenarioRowMap maps `'interestRateOnCash'` to row 33 correctly, the formula is fine.
If it maps to row 32 (the debt rate row), fix the row mapping.

Confirm in build-scenarios.ts that the rows are written in this order:
```
Row 31: section header "── Debt & Financing ──"  (no data in B-H)
Row 32: 'Interest Rate (on Debt)'      → interestRateOnDebt[yr]
Row 33: 'Interest Income Rate (on Cash)' → interestRateOnCash[yr]
```

And in build-calc-sheets.ts the `scenarioRows` map must have:
```typescript
scenarioRows['Base Case_interestRateOnDebt']   = 32;
scenarioRows['Base Case_interestRateOnCash']   = 33;
```

---

## VERIFICATION CHECKLIST

After making changes, export a fresh Excel and:

□ Open in Excel WITHOUT enabling iterative calculation first
  → All values should show correctly (from cached results)
  → Interest Income 2027E should be 61,771 (NOT 39,387)
  → All projected years should match engine values

□ Manually change Revenue Growth 2026E from 10% to 15% in Assumptions tab
  → WITHOUT iterative calc: values will be wrong (expected, warn user)
  → WITH iterative calc (File→Options→Formulas→Enable + Ctrl+Alt+F9): values update correctly

□ Verify all three scenarios show different values:
  → Base Case: NI 2026E ≈ 84,000, Cash 2026E ≈ 363,361
  → Optimistic: NI 2026E ≈ 149,803, Cash 2026E ≈ 404,113
  → Conservative: NI 2026E ≈ 14,185, Cash 2026E ≈ 318,896

□ Confirm interest income 2027E in all scenarios:
  → Base: 61,771 ✓
  → Optimistic: 68,699 ✓
  → Conservative: 54,212 ✓

□ Confirm Scenarios "Engine-Computed Values" section shows same numbers as _Calc_Base

---

## ALSO: ANSWER TO THE USER'S QUESTION ABOUT `A48`

The user noticed row A48 in the Scenarios sheet shows "APIC" = 210,000 but this doesn't
match what the engine stores. This row is in the **static inputs** section (BS/Equity
Direct Values), not the Engine-Computed Values section.

In the engine, APIC for 2024 starts at 210,000 and grows by SBC + equity issuance each
year. The Scenarios row 48 stores the manually-input starting APIC values (correct).
The APIC (Computed) in row 61 (Engine-Computed section) then shows the formula-driven
APIC values: `=C67+D13+Scenarios!D39` where D67=prior APIC, D13=SBC, D39=equity issuance.

If the user is confused by seeing APIC in TWO places (rows 48 and 61), add a note cell:
```
Row 48 label → change from 'APIC' to 'APIC (Starting Input — manual override only)'
Row 61 label → keep as 'APIC (Computed — formula-driven from prior period + SBC)'
```

---

## ONE-LINE SUMMARY FOR ANTIGRAVITY

The ONLY code change needed to fix all mismatches across all scenarios is:

```
In lib/export/excel.ts: change  fullCalcOnLoad: true  →  fullCalcOnLoad: false
```

This prevents Excel from overwriting the correct engine-computed cached values with
wrong first-pass recalculated values when the file opens.
```
