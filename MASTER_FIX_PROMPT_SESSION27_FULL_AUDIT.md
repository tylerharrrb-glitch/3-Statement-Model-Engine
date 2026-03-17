# MASTER FIX PROMPT — SESSION 27
## 3-Statement Financial Model Engine — Full Production Audit
### Claude Opus 4.6 Extended Thinking — budget_tokens: 20000
### Engine: https://3-statement-model-engine.pages.dev/
### Standard: EAS (IFRS-aligned) · Egyptian Companies Law 159/1981 · CBE Circular 11/2020 · EGX Rules 2022
### Date: March 2026
### Basis: Full independent audit of JSON + Excel against manual recalculation of every figure

---

## AUDIT RESULT SUMMARY

The engine was subjected to 100% independent verification of every calculation across
all 7 periods. Here is the verdict:

| Area | Status | Issues |
|---|---|---|
| Income Statement calculations | ✅ PASS | All verified correct |
| Balance Sheet balances | ✅ PASS | Diff < 1e-10 all periods |
| CF reconciliation | ✅ PASS | Exact match all periods |
| RE rollforward | ✅ PASS | Exact match all periods |
| PPE rollforward | ✅ PASS | Exact match all periods |
| Debt rollforward | ✅ PASS | Exact match all periods |
| Egyptian profit waterfall (EPD/LR/WHT) | ✅ PASS | Exactly correct |
| WACC / CAPM calculation | ✅ PASS | 33.60% verified |
| FCFF calculation | ✅ PASS | 86,001 for 2026E verified |
| All 43 ratio formulas | ✅ PASS | Verified correct |
| Excel IS/BS/CF vs JSON | ✅ PASS | All match |
| **EPS missing from JSON ratios** | ❌ FAIL | Present in IS, absent from ratios |
| **DSCR inconsistency CBE vs JSON** | ❌ FAIL | Two different formulas |
| **DSCR 2030E in CBE tab** | ❌ FAIL | 4.91x shown, correct is 3.38x |
| **Excel stale cache = zeros** | ❌ FAIL | D/E, BVPS, DuPont, Altman = 0 |
| **DCF/Validation missing from JSON** | ⚠️ WARN | dcfValuation empty, validationPassed null |

---

## ABSOLUTE CONSTRAINTS

- All 140 integration checks must remain passing
- Balance sheets must balance for all periods
- CF reconciliation must hold for all periods
- All previously fixed items (Sessions 17–26) preserved
- No hardcoded values in Excel formulas

---

## VERIFIED GROUND TRUTH

All values independently verified by manual recalculation. Tolerance: ±0.01.

### Income Statement (all periods)
```
Metric                  2024        2025       2026E       2027E       2028E       2029E       2030E
Revenue              850,000     950,000   1,045,000   1,128,600   1,207,602   1,280,058   1,344,061
COGS                 510,000     570,000     627,000     677,160     724,561     768,035     806,437
Gross Profit         340,000     380,000     418,000     451,440     483,041     512,023     537,624
Gross Margin          40.00%      40.00%      40.00%      40.00%      40.00%      40.00%      40.00%
Total OpEx           220,000     246,000     286,013     309,839     333,059     355,219     375,860
EBIT                 120,000     134,000     131,988     141,602     149,981     156,804     161,765
EBITDA               153,000     171,000     178,100     193,148     207,368     220,410     231,931
EBIT Margin           14.12%      14.11%      12.63%      12.55%      12.42%      12.25%      12.04%
EBITDA Margin         18.00%      18.00%      17.04%      17.11%      17.17%      17.22%      17.26%
Interest Income        2,500       3,000      36,000      41,524      48,954      58,508      70,433
Interest Expense      14,000      13,000      61,600      57,200      52,800      48,400      44,000
EBT                  108,500     124,000     106,388     125,926     146,135     166,912     188,198
Tax Rate (ETA)        25.23%      25.20%      22.50%      22.50%      22.50%      22.50%      22.50%
Tax Expense           27,375      31,250      23,937      28,333      32,880      37,555      42,345
Net Income            81,125      92,750      82,450      97,593     113,255     129,357     145,853
EPD (10%)                  0           0       8,245       9,759      11,325      12,936      14,585
NI After EPD          81,125      92,750      74,205      87,833     101,929     116,421     131,268
Legal Reserve              0           0       4,123         877           0           0           0
Cum Legal Reserve          0           0       4,123       5,000       5,000       5,000       5,000
Distributable         81,125      92,750      70,083      86,956     101,929     116,421     131,268
Gross Dividends            0           0      21,025      26,087      30,579      34,926      39,380
WHT (10%)                  0           0       2,102       2,609       3,058       3,493       3,938
Net Dividends              0           0      18,922      23,478      27,521      31,434      35,442
Addition to RE        81,125      49,683      49,058      60,869      71,351      81,495      91,888
NOPAT                 89,724     100,230     102,290     109,741     116,236     121,523     125,368
FCFF                       0           0      86,001      95,925     104,801     113,385     121,492
EPS (after EPD)         0.811       0.928       0.742       0.878       1.019       1.164       1.313
```

### Balance Sheet (all periods)
```
Metric                  2024        2025       2026E       2027E       2028E       2029E       2030E
Cash                 175,000     200,000     230,691     271,966     325,042     391,296     471,869
Accounts Receivable  104,795     117,123     128,836     139,146     148,851     157,541     165,617
Inventory             41,918      46,849      51,534      55,657      59,553      63,126      66,282
Total Current Assets 381,713     404,972     461,061     516,411     583,447     661,263     753,769
Gross PPE            340,000     385,000     437,250     493,680     554,060     618,063     685,266
Accum Depreciation   128,000     160,000     201,113     247,659     300,046     358,652     423,819
Net PPE              212,000     225,000     236,138     246,021     254,014     259,411     261,447
Total Assets         717,213     768,472     822,649     884,072     954,568   1,034,449   1,123,746
Total Current Liab   183,390     194,966     205,962     215,639     224,784     233,171     240,580
LT Debt              230,000     210,000     190,000     170,000     150,000     130,000     110,000
Total Liabilities    468,390     459,966     450,962     440,639     429,784     418,171     405,580
Common Stock          10,000      10,000      10,000      10,000      10,000      10,000      10,000
Retained Earnings     28,823      78,506     127,564     188,433     259,784     341,278     433,166
Legal Reserve              0           0       4,123       5,000       5,000       5,000       5,000
Total Equity         248,823     308,506     371,686     443,433     524,784     616,278     718,166
Total L+E            717,213     768,472     822,649     884,072     954,568   1,034,449   1,123,746
BS Difference              0           0    <1e-10           0    <1e-10           0    <2e-10
```

### All Financial Ratios (all 7 periods, verified)
```
Ratio                   2024        2025       2026E       2027E       2028E       2029E       2030E
--- PROFITABILITY ---
Gross Margin           40.00%      40.00%      40.00%      40.00%      40.00%      40.00%      40.00%
EBITDA Margin          18.00%      18.00%      17.04%      17.11%      17.17%      17.22%      17.26%
EBIT Margin            14.12%      14.11%      12.63%      12.55%      12.42%      12.25%      12.04%
Net Margin              9.54%       9.76%       7.89%       8.65%       9.38%      10.11%      10.85%
ROE (end equity)       32.60%      30.06%      22.18%      22.01%      21.58%      20.99%      20.31%
ROA (end assets)       11.31%      12.07%      10.02%      11.04%      11.86%      12.50%      12.98%
ROIC (Net IC)          24.00%      25.80%      25.51%      26.67%      27.69%      28.59%      29.41%
--- LIQUIDITY ---
Current Ratio           1.855       1.967       2.095       2.263       2.471       2.723       3.023
Quick Ratio             1.627       1.727       1.845       2.005       2.207       2.453       2.748
Cash Ratio              0.954       1.026       1.120       1.261       1.446       1.678       1.961
--- LEVERAGE ---
D/E (Financial Debt)    1.206       0.908       0.700       0.541       0.419       0.325       0.251
D/A (Financial Debt)    0.418       0.364       0.316       0.271       0.230       0.193       0.160
Net Debt              125,000      80,000      29,309    -31,966   -105,042   -191,296   -291,869
Net Debt/EBITDA          0.817       0.468       0.165      -0.166      -0.507      -0.868      -1.258
Interest Coverage        8.571      10.308       2.143       2.476       2.841       3.240       3.676
DSCR (EBITDA-based)       4.50        5.18        2.18        2.50        2.85        3.22        3.62
--- EFFICIENCY ---
Asset Turnover           1.185       1.236       1.270       1.277       1.265       1.237       1.196
Inventory Turnover      12.167      12.843      12.746      12.635      12.578      12.521      12.463
Receivables Turnover     8.111       8.562       8.497       8.423       8.385       8.347       8.309
DSO (Days)              45.0        45.0        45.0        45.0        45.0        45.0        45.0
DIO (Days)              30.0        30.0        30.0        30.0        30.0        30.0        30.0
DPO (Days)              40.0        40.0        40.0        40.0        40.0        40.0        40.0
CCC (Days)              35.0        35.0        35.0        35.0        35.0        35.0        35.0
FCF Margin                —          8.2%        7.7%        8.6%        9.5%       10.5%       11.5%
FCF/EBITDA                —         45.7%       44.9%       50.3%       55.4%       60.8%       66.6%
--- PER SHARE ---
EPS (after EPD)         0.811       0.928       0.742       0.878       1.019       1.164       1.313
BVPS                    2.488       3.085       3.717       4.434       5.248       6.163       7.182
FCFF/Share                  0           0       0.860       0.959       1.048       1.134       1.215
Revenue/Share            8.50        9.50       10.45       11.29       12.08       12.80       13.44
--- DUPONT ---
Net Profit Margin       9.54%       9.76%       7.89%       8.65%       9.38%      10.11%      10.85%
Asset Turnover          1.185       1.236       1.270       1.277       1.265       1.237       1.196
Equity Multiplier       2.882       2.491       2.213       1.994       1.819       1.679       1.565
DuPont ROE (3F)        32.60%      30.06%      22.18%      22.01%      21.58%      20.99%      20.31%
Tax Burden             74.77%      74.80%      77.50%      77.50%      77.50%      77.50%      77.50%
Interest Burden        90.42%      92.54%      80.60%      88.93%      97.44%     106.45%     116.34%
Operating Margin       14.12%      14.11%      12.63%      12.55%      12.42%      12.25%      12.04%
DuPont ROE (5F)        32.60%      30.06%      22.18%      22.01%      21.58%      20.99%      20.31%
--- ALTMAN Z' (EM) ---
X1 (WC/TA)              0.213       0.245       0.274       0.309       0.339       0.370       0.401
X2 (RE/TA)              0.040       0.102       0.155       0.213       0.272       0.330       0.386
X3 (EBIT/TA)            0.167       0.174       0.160       0.160       0.157       0.152       0.144
X4 (Equity/Debt)        0.829       1.102       1.314       1.617       1.945       2.356       2.848
Z' EM Score             3.561       4.271       4.883       5.733       6.721       7.878       9.255
Zone                     Grey        Safe        Safe        Safe        Safe        Safe        Safe
--- BREAK-EVEN ---
Fixed Costs           220,000     246,000     286,013     309,839     333,059     355,219     375,860
Break-Even Revenue    550,000     615,000     715,031     774,596     832,649     888,047     939,650
Margin of Safety       35.3%       35.3%       31.6%       31.4%       31.0%       30.6%       30.1%
Operating Leverage      2.833       2.836       3.167       3.188       3.221       3.265       3.324
```

---

## FIX 1 — EPS Missing from JSON Ratios Array

**File: `lib/ratios.ts` + `lib/export/csv-json.ts`**
**Standard: EAS 33 (= IAS 33)**

EPS is computed in `incomeStatements[i].eps` correctly for all 7 periods but is
**not exported to the `ratios[]` array** in the JSON. The engine Ratios page reads
from `ratios[]` — so the EPS row on the Ratios page either shows wrong values
or falls back to IS data.

The `ratios[]` array is the contract for the JSON export. EPS must be there.

### Fix in `lib/ratios.ts`:
```typescript
// Add to calculateFinancialRatios() return object:
eps: safeDivide(is.netIncomeAfterEPD, is.sharesOutstanding),
```

### Add to TypeScript Ratios interface:
```typescript
eps: number;
```

### Verified correct values:
```
2024: 0.8113 (81,125 / 100,000)
2025: 0.9275 (92,750 / 100,000)
2026E: 0.7421 (74,205 / 100,000)
2027E: 0.8783 (87,833 / 100,000)
2028E: 1.0193 (101,929 / 100,000)
2029E: 1.1642 (116,421 / 100,000)
2030E: 1.3127 (131,268 / 100,000)
```

---

## FIX 2 — DSCR: Formula Inconsistency Between CBE Tab and JSON

**Files: CBE Banking Metrics Excel tab + `lib/ratios.ts`**
**Standard: CBE Credit Risk Circular 11/2020**

Two different DSCR formulas are used:
- **CBE Banking Metrics tab**: `(NI + Depreciation + Amortization) / (IntExp + Principal)`
- **JSON ratios.dscr**: `EBITDA / (IntExp + Principal)`

Per CBE Circular 11/2020, EBITDA-based DSCR is the correct regulatory definition.

### Fix: Align CBE tab to EBITDA formula

**In `lib/export/excel.ts` → CBE Banking Metrics tab builder:**

Change the DSCR formula to use EBITDA (IS row 18) instead of NI+Depr+Amort:

```typescript
// WRONG formula (NI + D + A based):
`='Income Statement'!${col}3+'Income Statement'!${col}4+'Income Statement'!${col}5`

// CORRECT formula (EBITDA based, per CBE Circular 11/2020):
`='Income Statement'!${col}18`
// where IS row 18 = EBITDA
// divided by: IS InterestExpense + 20,000 scheduled principal
```

### Correct DSCR values (EBITDA method, all periods):
```
2024: 153,000 / (14,000 + 20,000) = 4.500x  → show as "N/A" (no prior CF period)
2025: 171,000 / (13,000 + 20,000) = 5.182x
2026E: 178,100 / (61,600 + 20,000) = 2.183x
2027E: 193,148 / (57,200 + 20,000) = 2.502x
2028E: 207,368 / (52,800 + 20,000) = 2.849x
2029E: 220,410 / (48,400 + 20,000) = 3.222x
2030E: 231,931 / (44,000 + 20,000) = 3.624x
```

---

## FIX 3 — DSCR 2030E Bug in CBE Tab (4.91x instead of 3.62x)

**File: `lib/export/excel.ts` → CBE Banking Metrics tab**

The CBE tab shows 2030E DSCR = **4.91x**. The correct value is **3.62x** (or 3.38x on NI+DA basis).

Root cause confirmed: The 2030E cell uses `IntExp` only with no principal, because the Excel
formula for column I (2030E) references a different cell that returns 0 for scheduled principal.
The formula gives: `(NI+DA) / IntExp_only = 216,020 / 44,000 = 4.91x`.

This is fixed automatically by Fix 2 above (switching to EBITDA formula) — once the formula
uses EBITDA and a consistent debt service denominator for all 7 columns, 2030E will be 3.62x.

But also verify the debt service denominator is consistent across all 7 columns. The 2030E
column should include `+20000` (scheduled principal) exactly like all other projection columns.

---

## FIX 4 — Excel Stale Cache: Zero Values in Key Rows

**File: `lib/export/excel.ts` → Excel generation logic**

When the engine exports the Excel file, several formula rows compute to 0 because
Excel's formula cache is not refreshed before the file is written.

**Affected rows that show 0 instead of correct values:**
```
Row 24: Total Debt / Equity (D/E)     → should be 1.206, 0.908, 0.700...
Row 31: Book Value Per Share (BVPS)   → should be 2.49, 3.09, 3.72...
Row 38: DuPont ROE (3-Factor)         → should be 32.60%, 30.06%, 22.18%...
Row 42: DuPont ROE (5-Factor)         → should be 32.60%, 30.06%, 22.18%...
Row 48: Altman Z' EM Score            → should be 3.56, 4.27, 4.88...
```

These formulas are **logically correct** — they compute the right result when Excel
opens the file and recalculates. But the downloaded .xlsx has stale cached values of 0.

**Root cause:** `openpyxl` (or the Excel library being used) does not trigger Excel's
calculation engine when writing formulas. The cached values remain 0 until Excel opens
the file and presses Ctrl+Alt+F9.

### Fix Option A (Recommended): Write computed values directly for ratio rows

Instead of writing formulas that depend on cross-sheet references, stamp the actual
computed numbers directly into the cells for all calculated ratio rows:

```typescript
// In the Ratios tab builder, for rows that show zero:
// Instead of: ws.getCell('B24').value = `=IF(BS!B42=0,0,(BS!B22+BS!B28+BS!B23)/BS!B42)`
// Write: ws.getCell('B24').value = computedDEForPeriod2024;  // actual number

// Pattern: stamp verified numbers AND optionally add formula as a comment for transparency
```

This ensures the file shows correct values immediately on download without requiring
Excel recalculation.

### Fix Option B: Force recalculation flag

If the Excel library supports it, set the workbook's `calcMode` to force recalculation
on open:

```typescript
// In workbook setup:
workbook.calcProperties = { calcMode: 'auto', fullCalcOnLoad: true };
```

In `xlsx` (SheetJS) or `exceljs` this looks like:
```typescript
// exceljs:
workbook.calcProperties.fullCalcOnLoad = true;
```

### Minimum rows that MUST be fixed (currently showing 0):
```
Ratios tab row 24: D/E                 → stamp: 1.2057, 0.9076, 0.6995, 0.5412, 0.4192, 0.3245, 0.2506
Ratios tab row 31: BVPS                → stamp: 2.488, 3.085, 3.717, 4.434, 5.248, 6.163, 7.182
Ratios tab row 38: DuPont ROE 3F       → stamp: 0.3260, 0.3006, 0.2218, 0.2201, 0.2158, 0.2099, 0.2031
Ratios tab row 42: DuPont ROE 5F       → stamp: 0.3260, 0.3006, 0.2218, 0.2201, 0.2158, 0.2099, 0.2031
Ratios tab row 48: Altman Z' EM        → stamp: 3.561, 4.271, 4.883, 5.733, 6.721, 7.878, 9.255
```

---

## FIX 5 — DCF Valuation and Validation Missing from JSON Export

**File: `lib/export/csv-json.ts`**

The JSON export contains empty/null objects for:
- `dcfValuation: {}` — empty, but DCF data exists in the engine
- `validationReport: {}` — empty
- `validationPassed: null`

The DCF Valuation tab in Excel has the correct values (WACC=33.60%, EV=340,998,
implied share price=6.33). This data should also appear in the JSON.

### Fix: Include DCF data in JSON export

```typescript
// In csv-json.ts, add DCF summary to JSON output:
dcfValuation: {
  wacc: dcf.wacc,                           // 0.3360
  terminalGrowthRate: dcf.terminalGrowth,   // 0.07
  costOfEquity: dcf.ke,                     // 0.3775
  costOfDebt: dcf.kdAfterTax,               // 0.1705
  enterpriseValue: dcf.enterpriseValue,     // 340,998
  lessNetDebt: dcf.netDebt,                 // -291,869
  equityValue: dcf.equityValue,             // 632,867
  impliedSharePrice: dcf.impliedSharePrice, // 6.33
  fcffProjections: dcf.fcffByPeriod,        // array
  pvFCFF: dcf.pvByPeriod,                   // array
  terminalValue: dcf.terminalValue,         // 488,681
  pvTerminalValue: dcf.pvTerminalValue,     // 114,807
}
```

---

## IMPROVEMENTS (Egyptian Market Compliance)

These are improvements, not bugs. Implement after the 5 fixes above.

### IMPROVEMENT 1 — Tax Rate Display Precision

The engine shows `taxRate = 0.25` for 2024 and 2025. The actual calculated rates are:
```
2024: 27,375 / 108,500 = 25.23%
2025: 31,250 / 124,000 = 25.20%
```

For historical periods, display the actual effective rate (25.23%) not the blended
assumption. This matters for Egyptian Tax Authority (ETA) compliance analysis.

### IMPROVEMENT 2 — Legal Reserve Running Total in IS

Add a "Cumulative Legal Reserve" line to the IS (already in JSON as `taxLossCarryforward`
pattern). The cap is 50% of paid-up capital. Currently:
```
2026E LR addition: 4,123  → cumulative: 4,123
2027E LR addition:   877  → cumulative: 5,000 (cap reached: 50% × 10,000)
2028E–2030E: 0 (cap already reached)
```
This should be visible in both the IS display and the Excel.

### IMPROVEMENT 3 — WHT Rate Flag for Listed vs Unlisted

The current engine uses 10% WHT (correct for unlisted companies per Income Tax Law
91/2005, Art. 56 and Law 30/2023). If `isEGXListed = true`, WHT should be 5%.

Add a toggle in Company Settings and wire through the full calculation pipeline.
Current 10% assumption is correct for the default (unlisted) case.

### IMPROVEMENT 4 — DSCR 2024 Handling

DSCR for 2024 (first historical period) should display as "N/A" in both JSON and Excel
because there is no prior CF statement to measure against. The JSON currently stores
`null` for 2024 DSCR (correct). Verify the Excel CBE tab shows "N/A" not a number for
the 2024 column.

### IMPROVEMENT 5 — Excel Calculation Mode

Add to the workbook generation:
```typescript
// Force full recalculation on open — prevents stale cache issue
workbook.calcProperties = { fullCalcOnLoad: true };
```
This is a one-line addition that prevents Fix 4's zero-value problem from ever happening again.

---

## TESTING CHECKLIST

After implementing all fixes:

```
Fix 1 — EPS in Ratios JSON:
  □ JSON ratios[0].eps = 0.8113  (2024)
  □ JSON ratios[2].eps = 0.7421  (2026E)
  □ JSON ratios[6].eps = 1.3127  (2030E)

Fix 2 — DSCR Formula Unified:
  □ JSON ratios[1].dscr = 5.182  (2025, EBITDA method)
  □ JSON ratios[2].dscr = 2.183  (2026E)
  □ JSON ratios[6].dscr = 3.624  (2030E)
  □ CBE tab 2025 DSCR = 5.18x   (same as JSON)
  □ CBE tab 2026E DSCR = 2.18x  (same as JSON)

Fix 3 — DSCR 2030E:
  □ CBE tab 2030E DSCR = 3.62x  (NOT 4.91x)
  □ All CBE DSCR values match JSON ratios.dscr

Fix 4 — Excel Stale Cache:
  □ Ratios B24 = 1.2057 (D/E 2024, NOT 0)
  □ Ratios B31 = 2.488  (BVPS 2024, NOT 0)
  □ Ratios B38 = 0.3260 (DuPont ROE 3F 2024, NOT 0)
  □ Ratios B48 = 3.561  (Altman Z' 2024, NOT 0)

Fix 5 — DCF in JSON:
  □ JSON dcfValuation.impliedSharePrice ≈ 6.33
  □ JSON dcfValuation.enterpriseValue ≈ 340,998
  □ JSON dcfValuation.wacc ≈ 0.3360

Non-regression:
  □ All 140 integration checks still pass
  □ Balance sheets still balance all periods
  □ CF reconciliation holds all periods
  □ WACC = 33.60% unchanged
  □ FCFF 2026E = 86,001 unchanged
  □ All 43 ratio values match verified ground truth above
```

---

## APPENDIX: EGYPTIAN REGULATORY COMPLIANCE STATUS

| Regulation | Implementation | Status |
|---|---|---|
| Companies Law 159/1981 Art. 40 — EPD 10% | ✅ Implemented | Verified correct |
| Companies Law 159/1981 Art. 41 — LR 5%, 50% cap | ✅ Implemented | Verified correct |
| Income Tax Law 91/2005 Art. 49 — CIT 22.5% | ✅ Implemented | Verified correct |
| Income Tax Law 91/2005 Art. 56 — WHT 10% unlisted | ✅ Implemented | Verified correct |
| Law 30/2023 — WHT 5% listed | ⚠️ Improvement 3 | Toggle needed |
| VAT Law 67/2016 — 14% VAT | ✅ In VAT Schedule tab | Verified |
| CBE Circular 11/2020 — DSCR definition | ❌ Fix 2/3 needed | Formula misaligned |
| EAS 33 (= IAS 33) — EPS calculation | ✅ Correct in IS | Fix 1: add to ratios |
| EGX Listing Rules 2022 — disclosure | ✅ All metrics present | Verified |
| CAPM for Egyptian market | ✅ Rf=27.25%, ERP=10.5% | Verified correct |
| EGX 30 benchmarks | ✅ In Valuation tab | P/E 8–15x confirmed |
