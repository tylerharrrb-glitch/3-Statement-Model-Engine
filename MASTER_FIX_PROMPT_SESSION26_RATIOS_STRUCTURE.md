# MASTER FIX PROMPT — SESSION 26
## 3-Statement Financial Model Engine — Excel Ratios Tab: Section Structure + DuPont Fix
### Claude Opus 4.6 Extended Thinking — budget_tokens: 16000
### Engine: https://3-statement-model-engine.pages.dev/
### File: lib/export/excel.ts → Ratios tab builder
### Date: March 2026

---

## SCOPE

Five issues in the Excel Ratios tab, all in `lib/export/excel.ts`.
No changes to any calculation engine, JSON export, or UI components.
All 140 integration checks must still pass after these changes.

---

## ISSUE 1 — LABEL: "Operating Margin" should be "EBIT Margin"

**Location:** Profitability section, currently row 5 in the Ratios tab, label cell A5.

**Current:** `A5 = "Operating Margin"`
**Correct:**  `A5 = "EBIT Margin"`

The engine UI calls this metric "EBIT Margin". The formula (IS row 17 / IS row 2) is correct — only the label is wrong.

**In `lib/export/excel.ts`**, find the line that writes the Profitability section label for this row and change the string:
```typescript
// WRONG:
ws.getCell('A5').value = 'Operating Margin';
// CORRECT:
ws.getCell('A5').value = 'EBIT Margin';
```

---

## ISSUE 2 — LABEL: "EBIT Margin (ref)" should be "Operating Margin"

**Location:** DuPont Decomposition section, currently row 41, label cell A41.

**Current:** `A41 = "EBIT Margin (ref)"`
**Correct:**  `A41 = "Operating Margin"`

The engine UI labels this row "Operating Margin" within the DuPont section. Formula is correct.

```typescript
// WRONG:
ws.getCell('A41').value = 'EBIT Margin (ref)';
// CORRECT:
ws.getCell('A41').value = 'Operating Margin';
```

---

## ISSUE 3 — SECTION: "Interest Coverage" belongs in Leverage, not Liquidity

**Current position:** Row 12, inside the Liquidity section (between Current Ratio and Total Liab/Equity).
**Correct position:** Inside the Leverage section (after Net Debt / EBITDA).

The engine UI places Interest Coverage in the Leverage section. The Excel must match.

### Restructuring required

The tab currently has:
```
Row 10: ── Liquidity ──
Row 11: Current Ratio
Row 12: Interest Coverage (×)   ← WRONG SECTION
Row 13: Total Liabilities / Equity
Row 14: ── Efficiency ──
...
Row 24: ── Leverage ──
Row 25: Total Debt / Equity (D/E)
Row 26: Total Debt / Assets
Row 27: Net Debt (EGP)
Row 28: Net Debt / EBITDA (×)
```

Target structure after fix:
```
Row 10: ── Liquidity ──
Row 11: Current Ratio              (unchanged)
Row 12: Quick Ratio                (moved from Efficiency — see Issue 4)
Row 13: Cash Ratio                 (moved from Efficiency — see Issue 4)
Row 14: Total Liabilities / Equity (unchanged)
Row 15: ── Efficiency ──
Row 16: Asset Turnover             (unchanged)
Row 17: Inventory Turnover (×)     (unchanged, was row 18)
Row 18: Receivables Turnover (×)   (unchanged, was row 19)
Row 19: DSO (Days)                 (unchanged, was row 20)
Row 20: DIO (Days)                 (unchanged, was row 21)
Row 21: DPO (Days)                 (unchanged, was row 22)
Row 22: Cash Conversion Cycle      (unchanged, was row 23)
Row 23: ── Leverage ──
Row 24: Total Debt / Equity (D/E)  (unchanged)
Row 25: Total Debt / Assets        (unchanged)
Row 26: Net Debt (EGP)             (unchanged)
Row 27: Net Debt / EBITDA (×)      (unchanged)
Row 28: Interest Coverage (×)      ← MOVED HERE from Liquidity
Row 29: ── Per Share ──
... (Per Share, DuPont, Altman, Break-Even all shift down by 1 row)
```

### Exact formula for Interest Coverage (same formula, new location):
```
Label: Interest Coverage (×)
B: =IF('Income Statement'!B22=0,0,'Income Statement'!B17/'Income Statement'!B22)
C–H: same pattern (IS row 17 = EBIT, IS row 22 = Interest Expense)
```

Verified correct values:
```
2024: 8.5714x  |  2025: 10.3077x  |  2026E: 2.1427x  |  2027E: 2.4756x
2028E: 2.8406x |  2029E: 3.2398x  |  2030E: 3.6765x
```

---

## ISSUE 4 — SECTION: "Quick Ratio" and "Cash Ratio" belong in Liquidity, not Efficiency

**Current positions:** Rows 16–17, inside the Efficiency section.
**Correct positions:** Inside the Liquidity section, after Current Ratio.

The engine UI places Quick Ratio and Cash Ratio in the Liquidity section. The Excel must match.

These rows move from the Efficiency section into the Liquidity section (see restructured layout above, rows 12–13).

### Formulas stay identical — only section placement changes:

**Quick Ratio** (TCA − Inventory) / TCL:
```
Label: Quick Ratio
B: =IF('Balance Sheet'!B26=0,0,('Balance Sheet'!B8-'Balance Sheet'!B5)/'Balance Sheet'!B26)
C–H: same pattern
```

**Cash Ratio** Cash / TCL:
```
Label: Cash Ratio
B: =IF('Balance Sheet'!B26=0,0,'Balance Sheet'!B3/'Balance Sheet'!B26)
C–H: same pattern
```

Verified correct values:
```
Quick Ratio:  2024=1.6266  2025=1.7266  2026E=1.8449  2027E=2.0052  2028E=2.2066  2029E=2.4528  2030E=2.7476
Cash Ratio:   2024=0.9543  2025=1.0258  2026E=1.1201  2027E=1.2612  2028E=1.4460  2029E=1.6782  2030E=1.9614
```

---

## ISSUE 5 — DUPONT FORMULAS: ATO and Equity Multiplier use wrong (average) balances

**Location:** DuPont section, rows 36 and 37.

### Root cause

The engine computes ROE using **ending equity** (`NI / ending equity`). For DuPont to
decompose correctly back to that same ROE, **all three components must also use ending balances**.

Currently rows 36 and 37 use average balances → DuPont 3F and 5F don't reconcile to ROE.

Proof (from JSON data):
```
2025: NM=9.76% × ATO_avg(1.2789) × EM_avg(2.6657) = 33.28%  ← WRONG (doesn't match ROE=30.06%)
2025: NM=9.76% × ATO_end(1.2362) × EM_end(2.4909) = 30.06%  ← CORRECT (matches ROE exactly)
```

### Fix: Row 36 — Asset Turnover (change from average to ending balance)

**Current WRONG formula (column C as example, average):**
```
C36: =IF(('Balance Sheet'!B17+'Balance Sheet'!C17)/2=0,0,'Income Statement'!C2/(('Balance Sheet'!B17+'Balance Sheet'!C17)/2))
```

**Correct formula (ending balance, same pattern for all columns):**
```
B36: =IF('Balance Sheet'!B17=0,0,'Income Statement'!B2/'Balance Sheet'!B17)
C36: =IF('Balance Sheet'!C17=0,0,'Income Statement'!C2/'Balance Sheet'!C17)
D36: =IF('Balance Sheet'!D17=0,0,'Income Statement'!D2/'Balance Sheet'!D17)
E36: =IF('Balance Sheet'!E17=0,0,'Income Statement'!E2/'Balance Sheet'!E17)
F36: =IF('Balance Sheet'!F17=0,0,'Income Statement'!F2/'Balance Sheet'!F17)
G36: =IF('Balance Sheet'!G17=0,0,'Income Statement'!G2/'Balance Sheet'!G17)
H36: =IF('Balance Sheet'!H17=0,0,'Income Statement'!H2/'Balance Sheet'!H17)
```

### Fix: Row 37 — Equity Multiplier (change from average to ending balance)

**Current WRONG formula (column C as example, average):**
```
C37: =IF(('Balance Sheet'!B42+'Balance Sheet'!C42)/2=0,0,(('Balance Sheet'!B17+'Balance Sheet'!C17)/2)/(('Balance Sheet'!B42+'Balance Sheet'!C42)/2))
```

**Correct formula (ending balance: Total Assets / Total Equity for same period):**
```
B37: =IF('Balance Sheet'!B42=0,0,'Balance Sheet'!B17/'Balance Sheet'!B42)
C37: =IF('Balance Sheet'!C42=0,0,'Balance Sheet'!C17/'Balance Sheet'!C42)
D37: =IF('Balance Sheet'!D42=0,0,'Balance Sheet'!D17/'Balance Sheet'!D42)
E37: =IF('Balance Sheet'!E42=0,0,'Balance Sheet'!E17/'Balance Sheet'!E42)
F37: =IF('Balance Sheet'!F42=0,0,'Balance Sheet'!F17/'Balance Sheet'!F42)
G37: =IF('Balance Sheet'!G42=0,0,'Balance Sheet'!G17/'Balance Sheet'!G42)
H37: =IF('Balance Sheet'!H42=0,0,'Balance Sheet'!H17/'Balance Sheet'!H42)
```

### Rows 38 and 42 auto-fix

DuPont ROE (3-Factor) in row 38 is `=B35*B36*B37` and DuPont ROE (5-Factor) in row 42
references rows 36 and 37. Once rows 36 and 37 are corrected, both ROE outputs
automatically produce the correct values — **no formula changes needed in rows 38 or 42**.

### Verified correct values after fix:
```
Period  | ATO(end) | EM(end) | ROE_3F  | ROE_5F  | Matches ROE row
2024    | 1.1851   | 2.8824  | 32.60%  | 32.60%  | ✅
2025    | 1.2362   | 2.4909  | 30.06%  | 30.06%  | ✅
2026E   | 1.2703   | 2.2133  | 22.18%  | 22.18%  | ✅
2027E   | 1.2766   | 1.9937  | 22.01%  | 22.01%  | ✅
2028E   | 1.2651   | 1.8190  | 21.58%  | 21.58%  | ✅
2029E   | 1.2374   | 1.6785  | 20.99%  | 20.99%  | ✅
2030E   | 1.1961   | 1.5647  | 20.31%  | 20.31%  | ✅
```

---

## IMPLEMENTATION APPROACH

All 5 issues are in `lib/export/excel.ts` inside the Ratios tab builder function.

### For Issues 1 and 2 (label renames):
Simple one-line string changes. Find and replace the label strings.

### For Issues 3 and 4 (section moves):
The cleanest approach is to **rewrite the entire Ratios tab builder** in the correct order
rather than trying to insert/delete rows from the existing builder. The tab builder
likely iterates through a config array or writes rows sequentially — restructure that
sequence to match the correct order:

```
Profitability → Liquidity (incl. Quick + Cash) → Efficiency (excl. Quick + Cash) →
Leverage (incl. Interest Coverage) → Per Share → DuPont → Altman Z' → Break-Even
```

### For Issue 5 (DuPont formulas):
Find the lines in the builder that write rows 36 and 37 (Asset Turnover Avg and
Equity Multiplier Avg) and replace their formula templates with the ending-balance versions.

---

## COMPLETE RATIOS TAB TARGET LAYOUT

Use this as the reference for the correct final structure:

```
Row 1:  "Financial Ratios" header + period columns

── Profitability ──
Row 2:  Section header
Row 3:  Gross Margin
Row 4:  EBITDA Margin
Row 5:  EBIT Margin            ← renamed from "Operating Margin"
Row 6:  Net Margin
Row 7:  ROA
Row 8:  ROE
Row 9:  ROIC (Net IC)

── Liquidity ──
Row 10: Section header
Row 11: Current Ratio
Row 12: Quick Ratio             ← moved from Efficiency
Row 13: Cash Ratio              ← moved from Efficiency
Row 14: Total Liabilities / Equity

── Efficiency ──
Row 15: Section header
Row 16: Asset Turnover
Row 17: Inventory Turnover (×)
Row 18: Receivables Turnover (×)
Row 19: DSO (Days)
Row 20: DIO (Days)
Row 21: DPO (Days)
Row 22: Cash Conversion Cycle (Days)

── Leverage ──
Row 23: Section header
Row 24: Total Debt / Equity (D/E)
Row 25: Total Debt / Assets
Row 26: Net Debt (EGP)
Row 27: Net Debt / EBITDA (×)
Row 28: Interest Coverage (×)   ← moved from Liquidity

── Per Share ──
Row 29: Section header
Row 30: EPS (After EPD)
Row 31: Book Value Per Share (BVPS)
Row 32: Revenue Per Share
Row 33: FCFF Per Share

── DuPont Decomposition ──
Row 34: Section header
Row 35: Net Profit Margin
Row 36: Asset Turnover          ← formula fixed to ending balance
Row 37: Equity Multiplier       ← formula fixed to ending balance
Row 38: DuPont ROE (3-Factor)   ← auto-corrects once 36+37 fixed
Row 39: Tax Burden (NI / EBT)
Row 40: Interest Burden (EBT / EBIT)
Row 41: Operating Margin        ← renamed from "EBIT Margin (ref)"
Row 42: DuPont ROE (5-Factor)   ← auto-corrects once 36+37 fixed

── Altman Z'-Score (Credit Risk) ──
Row 43: Section header
Row 44: X1 = Working Capital / Total Assets
Row 45: X2 = Retained Earnings / Total Assets
Row 46: X3 = EBIT / Total Assets
Row 47: X4 = Book Equity / Total Financial Debt
Row 48: Altman Z' Score (Emerging Markets)
Row 49: Zone

── Break-Even Analysis ──
Row 50: Section header
Row 51: Fixed Costs (Total OpEx)
Row 52: Contribution Margin Ratio
Row 53: Break-Even Revenue (EGP)
Row 54: Margin of Safety %
Row 55: Margin of Safety (EGP)
Row 56: Operating Leverage
```

---

## TESTING CHECKLIST

```
Issue 1 — EBIT Margin label:
  □ Ratios tab A5 = "EBIT Margin" (not "Operating Margin")
  □ Values unchanged: 2024=14.12%, 2026E=12.63%

Issue 2 — Operating Margin label in DuPont:
  □ Ratios tab A41 = "Operating Margin" (not "EBIT Margin (ref)")
  □ Values unchanged: 2024=14.12%, 2026E=12.63%

Issue 3 — Interest Coverage in Leverage:
  □ Interest Coverage NOT in Liquidity section
  □ Interest Coverage IS in Leverage section (after Net Debt/EBITDA)
  □ Values unchanged: 2024=8.57x, 2026E=2.14x

Issue 4 — Quick Ratio and Cash Ratio in Liquidity:
  □ Quick Ratio and Cash Ratio NOT in Efficiency section
  □ Both ARE in Liquidity section (after Current Ratio)
  □ Quick Ratio values unchanged: 2024=1.6266, 2026E=1.8449
  □ Cash Ratio values unchanged: 2024=0.9543, 2026E=1.1201

Issue 5 — DuPont ending balance:
  □ Asset Turnover 2025 = 1.2362 (not 1.2789)
  □ Asset Turnover 2026E = 1.2703 (not 1.3135)
  □ Equity Multiplier 2025 = 2.4909 (not 2.6657)
  □ Equity Multiplier 2026E = 2.2133 (not 2.3392)
  □ DuPont ROE 3-Factor 2025 = 30.06% (not 33.28%)
  □ DuPont ROE 3-Factor 2026E = 22.18% (not 24.24%)
  □ DuPont ROE 5-Factor 2025 = 30.06% (not 33.28%)
  □ DuPont ROE 5-Factor 2026E = 22.18% (not 24.24%)
  □ DuPont ROE matches ROE row for all 7 periods

Non-regression:
  □ All 140 integration checks still pass
  □ Balance sheets still balance for all periods
  □ No hardcoded values introduced
  □ All other Ratios tab values unchanged
  □ Altman and Break-Even sections unchanged
```
