# WOLF 3-Statement Financial Model Engine
## Masterclass Development Prompt for Google Antigravity
### Claude Opus 4.6 (Thinking) — Complete Build & Rectification Guide

> **Engine URL**: https://3-statement-model-engine.pages.dev/
> **Stack**: Next.js 16 + React 19 + TypeScript 5 + Zustand 5
> **Authority Date**: April 8, 2026
> **Prepared by**: Ahmed Wael Metwally, Financial Officer, MCDR

---

## PART 1 — AUDIT FINDINGS & VERIFIED ERRORS

Before issuing any code, the agent must understand the **exact errors** found across the JSON export, PDF report, Excel file, and engine source. Every fix below was verified against live CBE data (April 2, 2026 MPC decision) and Egyptian law.

---

### ERROR-01 ► CBE Rate Stale and Cascading WACC Distortion [CRITICAL]

**Location**: `lib/store.ts` default assumptions → `cbeRate`; `types/assumptions.ts` defaults; `lib/engines/dcf.ts`

**Current value**: `cbeRate: 0.2725` (27.25%)

**Verified correct value**: **19.50%** (CBE main operation / discount rate, held at April 2, 2026 MPC meeting — overnight deposit 19.00%, overnight lending 20.00%, discount/main operation 19.50%)

**Cascade damage**:
- CAPM Cost of Equity = 27.25% + β × 10.5% → severely overstated Ke (~37.75% vs correct ~30.5%)
- WACC inflated to ~33% instead of ~25–27%
- Terminal Value discounted at 33% shrinks Enterprise Value by 40–50%
- Implied share price is materially understated, rendering all DCF decisions wrong

**Fix required**: Update `cbeRate` default to `0.195`. Wire the DCF module to derive all rate inputs dynamically from `cbeRate`:
```typescript
// In dcf.ts — never hardcode; always derive
const riskFreeRate = assumptions.riskFreeRate; // 12M T-bill yield
const costOfDebtPreTax = assumptions.cbeRate + CORPORATE_SPREAD; // CBE lending + 50–150bps
const maxDeductibleRate = assumptions.cbeRate * 2; // Thin-cap ceiling per Law 30/2023
```

---

### ERROR-02 ► Risk-Free Rate Incorrect [CRITICAL]

**Location**: `assumptions.riskFreeRate` default

**Current value**: `0.20` (20.00%)

**Verified correct value**: **~23.50%** (Latest 12-month Egyptian Treasury Bill auction yield as of Q1 2026; CBE data confirms average 23.5% at February 2026 auction)

**Why this matters**: The risk-free rate is the anchor of CAPM. Using 20% understates the true cost of equity for an Egyptian-market company, producing an EV that is ~8–12% too high relative to local market benchmarks.

**Fix required**: Update default `riskFreeRate` to `0.235`. Add a tooltip in the UI ("Source: CBE 12-month T-bill average auction yield") and allow the user to override it on the DCF page.

---

### ERROR-03 ► Interest on Cash Rates Stale [MAJOR]

**Location**: `assumptions.interestRateOnCash` per-year array

**Current value**: `[0.18, 0.18, 0.18, 0.18, 0.18]` — flat 18% for all 5 years

**Verified issue**: CBE deposit rate is currently 19.00%. The engine's interest income is **below** current actual deposit rates (19%), AND it does not project the declining rate path the CBE has signaled.

**Correct default path** (based on CBE easing cycle and current hold):
```typescript
interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]
// 2026E: 19% (current deposit rate)
// 2027E: 17% (2×1% expected cuts in H2 2026 if inflation hits target)
// 2028E–2030E: gradual descent toward neutral ~12%
```

---

### ERROR-04 ► Interest on Debt Rates Need Formula-Driven CBE Spread [MAJOR]

**Location**: `assumptions.interestRateOnDebt` per-year array

**Current value**: `[0.22, 0.22, 0.22, 0.22, 0.22]` — flat 22%

**Issue**: Rate is not linked to `cbeRate`. As CBE cuts, corporate lending rates should decline. The correct approach is `CBE lending rate + credit spread`.

**Correct default path**:
```typescript
interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]
// Y1: CBE lending (20%) + 200bps spread = 22%
// Y2–Y5: declining as CBE eases
```
In the UI, expose a `corporateCreditSpread` input (default 200bps = 0.02) so the formula is:
`interestRateOnDebt[yr] = projectedCBELendingRate[yr] + creditSpread`

---

### ERROR-05 ► DCF Valuation Returns NULL — Critical Export Bug [CRITICAL]

**Location**: `lib/export/csv-json.ts`; `lib/engines/dcf.ts`

**Evidence**: JSON export shows `"dcfValuation": null` even when the DCF page displays data in-browser.

**Root cause (likely)**: The DCF engine is called separately from the main `runFullModel()` integrator and its results are not being serialized into the `ModelResults` object before export. The `dcfValuation` field in `ModelResults` type is populated after the circular resolver completes, but the export captures the store state before `runDCF()` is called.

**Fix required**:
1. In `lib/engines/integrator.ts` → `runFullModel()`, call `calculateDCF(results, assumptions)` at the end and attach to `ModelResults.dcfValuation`.
2. In the Zustand store `calculateModel()` action, ensure `modelResults.dcfValuation` is set before triggering re-render.
3. Verify JSON export serializes the full `modelResults` object including DCF.

---

### ERROR-06 ► Thin Capitalization Rules NOT Implemented [CRITICAL — Compliance]

**Location**: `lib/engines/income-statement.ts` → tax calculation section

**Law**: Egypt Income Tax Law as amended by **Law No. 30 of 2023**

**Current behavior**: 100% of interest expense is deducted from EBT with no limit check.

**Required behavior**: Interest deductibility must be capped based on the Debt/Equity ratio:
- **2024–2027**: Max D/E = **3:1** (interest on excess debt is non-deductible)
- **2028 onward**: Max D/E = **2:1**
- **Rate ceiling**: Deductible interest rate must not exceed **2× CBE discount rate** at start of calendar year. With current CBE at 19.50%, ceiling = 39.00%

**Implementation**:
```typescript
// In income-statement.ts calculateTax()
function calculateDeductibleInterest(
  interestExpense: number,
  totalDebt: number,
  totalEquity: number,
  cbeRate: number,
  projectionYear: number // calendar year e.g. 2028
): { deductible: number; disallowed: number } {
  const deRatioLimit = projectionYear >= 2028 ? 2.0 : 3.0;
  const rateLimit = cbeRate * 2;
  
  // 1. Rate-based cap
  const effectiveRate = totalDebt > 0 ? interestExpense / totalDebt : 0;
  const rateCap = Math.min(effectiveRate, rateLimit);
  const rateLimitedInterest = totalDebt * rateCap;
  
  // 2. D/E ratio cap
  const maxDeductibleDebt = totalEquity * deRatioLimit;
  const excessDebt = Math.max(0, totalDebt - maxDeductibleDebt);
  const deductibleDebt = totalDebt - excessDebt;
  const deductibleInterest = deductibleDebt > 0
    ? rateLimitedInterest * (deductibleDebt / totalDebt)
    : 0;
  
  return {
    deductible: Math.min(interestExpense, deductibleInterest),
    disallowed: interestExpense - Math.min(interestExpense, deductibleInterest)
  };
}
// Then in EBT calculation:
// taxableIncome = EBT + disallowedInterest - taxLossUtilized
// taxExpense = taxableIncome * taxRate
```

Add `disallowedInterest` as a memo line on the IS and a compliance flag in the Validation Agent.

---

### ERROR-07 ► Interest Expense Calculation Method — Confirm and Document [MODERATE]

**Location**: `lib/engines/balance-sheet.ts` → `InterestExpense()` helper

**Verification result**: The engine uses **beginning-of-period balance** method.
- Verified: 2026E IntExp = 61,600 = beginning debt 280,000 × 22% ✓
- The Gemini Deep Research doc mistakenly described this as "average balance" — that is incorrect

**This is CORRECT behavior** (beginning balance avoids circular dependency on ending debt). However, a note in `buildCalcSheets.ts` should clarify this choice so the Excel formulas are self-documenting.

**Excel formula fix**: In `_Calc_Base` sheet, the interest expense cell comment (or named range label) should read:
`=PriorPeriodTotalDebt × InterestRateOnDebt` — not "average debt × rate".

---

### ERROR-08 ► Labor Law No. 14 of 2025 — EPD Cap Update [MAJOR]

**Location**: `lib/engines/income-statement.ts` → EPD calculation

**Current law reference**: Labor Law Art. 41 (old)
**New law**: **Labor Law No. 14 of 2025** replaced the 1981 code. EPD remains at 10% of net profit, capped at total annual payroll. However, the new law modifies the definition of "net profit" to exclude one-off non-operating gains for the purpose of EPD calculation.

**Fix required**: Add an optional input `enableNonOperatingExclusion: boolean` (default `false`). When true:
```typescript
const epdBase = netIncome - Math.max(0, otherIncomeExpense);
const epd = Math.max(0, epdBase * employeeProfitSharingRate);
```
Update the UI tooltip in `EgyptianSettings.tsx` to reference Law 14/2025 instead of Labor Law 1981.

---

### ERROR-09 ► EPS Denominator Uses Wrong Net Income [MODERATE]

**Location**: `lib/engines/income-statement.ts` memo section

**Current**: `EPS = netIncomeAfterEPD / sharesOutstanding` ✓ (this is correct per engine docs)

**Verification**: 2030E EPS = 131,313 / 100,000 = 1.313 ✓ (matches PDF: EGP 1.31)

**Status**: No bug. Confirmed correct. Document this explicitly.

---

### ERROR-10 ► EGX 30 Benchmarks Need Q1 2026 Refresh [MODERATE]

**Location**: `lib/engines/valuation.ts` → `EGX_BENCHMARKS`

**Current values** (marked Q1 2026 in code):
```
P/E: 8.0x–15.0x avg 11.5x
EV/EBITDA: 5.0x–10.0x avg 7.5x
P/B: 1.0x–2.5x avg 1.75x
Dividend Yield: 2.0%–7.0% avg 4.5%
```

**Required**: These must be sourced from live EGX data and refreshed at least quarterly. Add a `lastUpdated: "2026-Q1"` field and a UI badge showing the benchmark vintage. Note to developer: these should eventually be fetched via EGX API or FMP API.

---

### ERROR-11 ► Excel `_Calc` Circular Interest Formula [MODERATE]

**Location**: `lib/export/build-calc-sheets.ts`

**Issue**: The circular reference between interest expense and cash (which feeds interest income) is resolved in the browser via the iterative solver. However, in Excel the `_Calc_Base` sheet does NOT replicate the iterative solver — it uses a single-pass formula. This means the Excel interest income/expense values will differ slightly from the browser output for models with large cash balances.

**Fix**: Either:
(a) Add a note cell in Excel: "Interest figures use single-pass calculation. Enable Excel iterative calculation (File > Options > Formulas > Enable iterative calculation, max 100 iterations) to match browser output." — and set the cells to be self-referential.
(b) Pre-bake the converged values and document this clearly in the `_Calc` sheet header.

Option (a) is preferred for a professional deliverable.

---

### ERROR-12 ► VAT Working Capital Impact Not Looping [MINOR]

**Location**: `lib/engines/balance-sheet.ts`; `components/CBEMetricsPage.tsx`

**Issue**: The VAT Schedule memo correctly calculates output/input VAT and net payable. However, the net VAT payable/receivable balance is **not added** to current liabilities (if payable) or other current assets (if receivable) on the Balance Sheet. This understates current liabilities and distorts the current ratio.

**Fix**: Add `vatPayable` line to current liabilities in BS:
```typescript
vatPayable = Math.max(0, outputVAT - inputVAT);
vatReceivable = Math.max(0, inputVAT - outputVAT);
// Add to TCL / TCA respectively
```

---

## PART 2 — CALCULATION VERIFICATION AUDIT

The following calculations were independently verified against the JSON export and PDF. All figures rounded to nearest EGP.

### Income Statement Verification (2030E)

| Line Item | PDF | JSON | Formula Check | Status |
|-----------|-----|------|---------------|--------|
| Revenue | 1,344,061 | 1,344,061 | 850K×1.118×1.10×1.08×1.07×1.06×1.05 | ✅ |
| COGS (60%) | 806,437 | — | 1,344,061 × 60% = 806,437 | ✅ |
| Gross Profit | 537,625 | — | 1,344,061 − 806,437 = 537,624 | ✅ |
| Interest Expense | 44,000 | 44,000 | End-2029 debt (200K) × 22% = 44,000 | ✅ |
| Interest Income | 70,433 | 70,433 | Based on beginning cash × rate | ✅ |
| Net Income | 145,853 | 145,853 | Verified via EBT→Tax→NI chain | ✅ |
| EPS | 1.31 | 1.313 | 131,313 / 100,000 = 1.313 | ✅ |

### Interest Expense Chain Verification (All Years)

| Year | Beginning Debt | Rate | Expected | Actual | Match |
|------|---------------|------|----------|--------|-------|
| 2026E | 280,000 | 22% | 61,600 | 61,600 | ✅ |
| 2027E | 260,000 | 22% | 57,200 | 57,200 | ✅ |
| 2028E | 240,000 | 22% | 52,800 | 52,800 | ✅ |
| 2029E | 220,000 | 22% | 48,400 | 48,400 | ✅ |
| 2030E | 200,000 | 22% | 44,000 | 44,000 | ✅ |

**Confirmed**: Engine uses beginning-of-period total debt × rate. ✅

### Balance Sheet Verification (2030E)

| Item | PDF | Formula | Status |
|------|-----|---------|--------|
| Total Assets | 1,123,695 | CA 727,311 + NCA 396,384 = 1,123,695 | ✅ |
| Total Liabilities | 405,479 | TCL 240,624 + NCL 164,855 | ✅ |
| Total Equity | 718,216 | 10K+270K+0+433.2K | ✅ |
| Balance Check | Balanced | TA = TL+E | ✅ |
| Cash | 471,869 | Per CF reconciliation | ✅ |

### DCF Quick Check (with corrected rates)

| Parameter | Current (Wrong) | Corrected |
|-----------|----------------|-----------|
| CBE Rate | 27.25% | 19.50% |
| Risk-Free Rate | 20.00% | 23.50% |
| Cost of Equity | ~37.75% | ~34.25% (23.5% + 1.0×10.5%) |
| WACC | ~33.0% | ~27.5% (approx) |
| FCFF 2030E | 121,492 | 121,492 (unchanged) |
| Terminal Value | ~499,324 | ~499,324 |
| PV of TV | ~119,828 | ~179,000+ |
| Enterprise Value | Severely understated | Correctly higher |

**Impact**: Correcting the CBE rate alone increases Enterprise Value by approximately **35–50%**. This is a critical error for any real investment decision.

---

## PART 3 — DEVELOPMENT ROADMAP

### Phase 1 — Critical Fixes (Must complete before any real use)

**P1-A: Rate Recalibration**
- [ ] Update `cbeRate` default: `0.2725` → `0.195`
- [ ] Update `riskFreeRate` default: `0.20` → `0.235`
- [ ] Update `interestRateOnCash` defaults: flat 18% → `[0.19, 0.17, 0.15, 0.13, 0.12]`
- [ ] Update `interestRateOnDebt` defaults: flat 22% → `[0.22, 0.20, 0.18, 0.17, 0.16]`
- [ ] Update `terminalGrowthRate` default: keep 7% (CBE's Q4 2026 inflation target) ✅

**P1-B: Thin Capitalization Module**
- [ ] Implement `calculateDeductibleInterest()` per ERROR-06 specification above
- [ ] Add `disallowedInterest` memo line to IS output type
- [ ] Add thin-cap compliance check to the 28-point integration suite (check #29)
- [ ] Display thin-cap disallowance and adjusted taxable income on IS page

**P1-C: DCF Null Bug**
- [ ] Fix DCF serialization in `runFullModel()` (see ERROR-05)
- [ ] Verify JSON export includes `dcfValuation` with all fields
- [ ] Add integration check: `dcfValuation !== null` → validation warning if null

**P1-D: Labor Law 14/2025 Update**
- [ ] Update EPD tooltip reference from "Labor Law 1981 Art. 41" → "Labor Law No. 14/2025"
- [ ] Add `enableNonOperatingExclusion` toggle per ERROR-08

---

### Phase 2 — High Priority Enhancements

**P2-A: Formula-Driven Debt Rate Schedule**
Add `corporateCreditSpread: number` (default `0.02`) to `AssumptionSet`.
Project `interestRateOnDebt[yr]` as:
```typescript
projectedCBELendingRate[yr] = cbeRate - (expectedCutsPerYear[yr] * 0.01);
interestRateOnDebt[yr] = projectedCBELendingRate[yr] + creditSpread;
```
Expose both `corporateCreditSpread` and `expectedCBECutBps[]` in the `EgyptianSettings.tsx` panel.

**P2-B: Excel Iterative Calculation Note**
In `build-calc-sheets.ts`, add an auto-generated row at top of each `_Calc_*` sheet:
```
⚠ ENABLE ITERATIVE CALCULATION: File → Options → Formulas → Enable iterative calculation (max iterations: 100, tolerance: 0.001) to fully replicate browser circular reference resolution.
```
Set interest income and interest expense cells to use self-referential Excel circular formulas.

**P2-C: VAT Working Capital Loop**
Implement per ERROR-12. Add `vatPayable` and `vatReceivable` to the Balance Sheet type and calculation engines.

**P2-D: EGX Benchmark Refresh System**
Add `egxBenchmarkDate: string` field to store. Display "EGX Benchmarks as of [date]" badge on Valuation page. Add a one-click "Refresh Benchmarks" button that fetches from a data source (Yahoo Finance API or FMP Egypt data).

---

### Phase 3 — EAS/IFRS Compliance Layer

**P3-A: EAS 49 Right-of-Use Asset (Lease Accounting)**
EAS 49 (equivalent to IFRS 16) requires operating leases to be capitalized as Right-of-Use (ROU) assets.

Add to `AssumptionSet`:
```typescript
enableLeaseAccounting: boolean;           // EAS 49 toggle
annualLeasePayments: number[];            // per-year absolute
leaseDiscountRate: number;                // IBR (incremental borrowing rate)
leaseTerm: number;                        // years
```

Balance Sheet additions:
- Non-current assets: `rightOfUseAsset` (initial PV of lease payments, amortized)
- Non-current liabilities: `leaseLiability` (declining as payments made)

Income Statement change:
- Remove operating lease expense from OpEx
- Add `depreciationROU` (ROU asset / lease term) to depreciation
- Add `leaseInterestExpense` (lease liability × discount rate) to interest expense

This transforms EBITDA (now includes lease depreciation and interest) — important for EGX-listed companies where EV/EBITDA comparisons expect IFRS 16 treatment.

**P3-B: EAS 38 End-of-Service Benefits (Enhanced)**
The engine has a basic EOS provision. Enhance with:
- Actuarial assumption: salary growth rate, employee turnover rate
- Discount rate for present value of defined benefit obligation
- Separate current vs non-current portion per EAS 38 disclosure requirements

**P3-C: EAS 48 Revenue Recognition**
For the Real Estate industry template specifically, add:
- `percentageOfCompletion: number[]` (for off-plan projects)
- Revenue recognized = contract price × % complete (not cash received)
- Deferred revenue = contract liabilities for received-not-yet-earned cash

---

### Phase 4 — Advanced Financial Architecture

**P4-A: Revolving Credit Facility (RCF)**
Add `rcfLimit: number`, `rcfDrawn: number[]`, `rcfRate: number` to `AssumptionSet`.
The BS should auto-draw the RCF if ending cash would go negative:
```typescript
if (projectedEndingCash < minimumCashBalance) {
  rcfDrawn = minimumCashBalance - projectedEndingCash;
  shortTermDebt += rcfDrawn;
}
```

**P4-B: Debt Covenant Monitoring**
Add covenant check layer that runs after circular resolution:
```typescript
interface DebtCovenant {
  type: 'interest_coverage' | 'leverage' | 'current_ratio';
  threshold: number;
  isMinimum: boolean; // true = must exceed, false = must be below
}
```
Flag covenant breaches as Tier-1 validation failures that block export.

**P4-C: Monte Carlo Web Worker**
Move `lib/monte-carlo.ts` to a Web Worker to prevent UI freeze on 10,000+ iterations:
```typescript
// In monte-carlo.worker.ts
self.onmessage = (e) => {
  const results = runSimulation(e.data.config, e.data.assumptions);
  self.postMessage(results);
};
```
Show a progress bar during simulation.

**P4-D: Historical Data Import via EGX API**
Build an EGX data fetcher that accepts a ticker symbol and auto-populates the historical inputs:
- Target: EGX DataHub or Financial Modeling Prep (FMP) Egypt endpoint
- Map: revenue, COGS, SGA, EBIT, NI, total assets, total debt, equity, CapEx
- Auto-detect historical periods from filing dates

---

### Phase 5 — UI/UX & Export Polish

**P5-A: CBE Rate Live Banner**
Add a top-of-page banner: "CBE Rate: 19.50% (as of April 2, 2026 MPC) — Click to update assumptions"
Wire it to trigger `setAssumption('cbeRate', ...)` and `calculateAllScenarios()`.

**P5-B: Sensitivity Analysis Output — Tornado Chart**
Add a Tornado Chart component to `SensitivityPage.tsx` showing the top 10 drivers of NPV/EPS ranked by impact magnitude.

**P5-C: PDF Export Column Truncation Fix**
For 7+ year models, switch PDF page orientation to Landscape A3 or implement column compression. In `lib/export/pdf.ts`, detect `projectionYears > 6` and reduce font size or split tables across pages.

**P5-D: Audit Trail in Excel**
Add a `_Audit` sheet to the Excel export that lists:
- Model version, export timestamp, active scenario
- All assumption inputs with their source labels
- Validation check results
- CBE rate source and date

---

## PART 4 — EGYPTIAN REGULATORY QUICK REFERENCE

This section is the engine's authoritative reference for Egyptian law. All calculations must match these exact rules.

### Corporate Tax (Income Tax Law No. 91/2005 as amended)

| Regime | Rate | Applies To |
|--------|------|-----------|
| Standard | 22.5% | All commercial/industrial companies |
| Oil Exploration | 40.55% | Petroleum concession holders |
| Strategic Projects | 40.0% | CBE/Suez Canal/strategic industries |
| SME Turnover Tax (Law 6/2025) | 0.4%–1.5% | Revenue < EGP 20M |

**Tax Base Rule (Thin-Cap adjusted)**:
`TaxableIncome = max(0, EBT + disallowedInterest - NOLUtilized)`
`TaxExpense = TaxableIncome × statutoryRate`

**Tax Loss Carryforward (Art. 29)**:
- Maximum carryforward: 5 years
- FIFO vintage utilization (oldest first)
- No carryback

**Thin Capitalization (Law 30/2023)**:
- Max D/E: 3:1 for 2024–2027, then 2:1 from 2028+
- Max deductible rate: 2× CBE discount rate at year-start
- April 2026: 2 × 19.50% = 39.00% ceiling rate

### Egyptian Accounting Standards (EAS) vs IFRS — Key Differences

| Area | IFRS | EAS | Engine Impact |
|------|------|-----|--------------|
| Revenue Recognition | IFRS 15 (full 5-step) | EAS 48 (IFRS 15 equivalent, effective 2021) | Use 5-step for complex revenue; simplified % of revenue is acceptable for projection models |
| Leases | IFRS 16 | EAS 49 | All operating leases capitalized as ROU assets (Phase 3 enhancement) |
| Financial Instruments | IFRS 9 (ECL model) | EAS 47 (modified ECL) | Provision for doubtful debts should use simplified ECL matrix |
| PPE Depreciation | Straight-line or diminishing balance (IAS 16) | Same (EAS 10) + Tax rates per Law 91/2005 | Engine supports both; tax depreciation uses declining balance |
| Employee Benefits | IAS 19 (actuarial) | EAS 38 (simplified for EOS benefits) | Engine uses simplified method — acceptable for projection models |
| Provisions | IAS 37 | EAS 28 (equivalent) | No difference for standard commercial entities |
| FX Translation | IAS 21 | EAS 13 (equivalent) | Engine is single-currency — correct for EGP-reporting entities |

**Key EAS-Specific Requirement**:
EAS requires **Arabic-language** financial statements for Egyptian corporate filings. The engine's bilingual labels (EN/AR) in `lib/i18n/labels.ts` fulfill this for display purposes. PDF exports for regulatory submission must include the Arabic label column.

### Egyptian Tax Depreciation Rates (Law 91/2005, Articles 25-26)

| Asset Class | Method | Rate |
|-------------|--------|------|
| Buildings & structures | Straight-Line | 5% per year |
| Machinery & equipment | Declining Balance on NBV | 25% per year |
| Vehicles & transport | Declining Balance on NBV | 25% per year |
| Computers, software, IT | Accelerated in Y1 then Declining Balance | 50% Y1, then 25% declining |
| Furniture & fixtures | Declining Balance on NBV | 20% per year |
| Intangible assets | Straight-Line | 10% per year |

**Note for engine**: Computer/IT assets use a **split rate** (50% Y1 + 25% declining thereafter), which is not currently reflected in the engine's `egyptian-depreciation.ts`. This must be added as a special case.

### Profit Distribution Waterfall (Companies Law 159/1981 as amended)

The **mandatory statutory sequence** (must run in this exact order):

```
1. Net Income (after tax)
2. Legal Reserve             = min(NI × 5%, remaining cap)
   → Stops when cumulative LR = 50% of paid-up capital (Art. 40)
   → Zero if NI ≤ 0
3. Employee Profit Sharing   = max(0, NI × 10%), capped at total payroll (Law 14/2025)
   → Zero if NI ≤ 0
4. NI After EPD              = NI − EPD
5. Distributable Profit      = NI − EPD − Legal Reserve
6. Dividend Eligibility      = distributable > 0 AND cumulative RE ≥ 0
7. Gross Dividends           = distributable × payoutRatio (if eligible)
8. Dividend WHT              = grossDividends × (5% if EGX-listed, else 10%) [Law 30/2023]
9. Net Dividends             = grossDividends − dividendWHT
10. Addition to RE           = distributable − grossDividends
```

**VERIFIED**: The engine implements this waterfall correctly. ✅

### Working Capital — Egyptian Market Sector Benchmarks

| Sector | DSO | DIO | DPO | CCC | Notes |
|--------|-----|-----|-----|-----|-------|
| Technology / SaaS | 45 | 0 | 30 | 15 | No physical inventory |
| Manufacturing (Industrial) | 60 | 45 | 60 | 45 | Standard Egyptian mfg |
| FMCG / Consumer Goods | 30 | 45 | 40 | 35 | Fast inventory turns |
| Retail | 15 | 60 | 45 | 30 | Long shelf, fast AR |
| Government Contracting | 90–120 | 45 | 60 | 75–105 | Slow government payment |
| Real Estate (off-plan) | 180 | 0 | 90 | 90 | Long receivable cycle |
| Export-Oriented | 45 | 30 | 30 | 45 | USD receivables typical |
| Pharma / Healthcare | 75 | 60 | 45 | 90 | Hospital credit terms |
| Telecom | 30–35 | 5 | 50 | −15 | Negative CCC (healthy) |

### CBE Rate History (for projected scenarios)

| Date | Deposit | Lending | Discount |
|------|---------|---------|----------|
| July 2023 | 19.25% | 20.25% | 19.75% |
| March 2024 | 27.25% | 28.25% | 27.75% (peak — emergency hike) |
| September 2024 | 27.25% | 28.25% | 27.75% |
| December 2025 | 20.00% | 21.00% | 20.50% (−100bps cut) |
| February 2026 | 19.00% | 20.00% | 19.50% (−100bps cut) |
| **April 2, 2026** | **19.00%** | **20.00%** | **19.50%** (on hold — current) |

**Important**: The engine's stored default `cbeRate: 0.2725` is from the March 2024 emergency peak. It is over 750bps above the current rate and MUST be updated.

---

## PART 5 — THE MASTERCLASS PROMPT FOR GOOGLE ANTIGRAVITY

Copy and paste the following prompt verbatim into Google Antigravity (Claude Opus 4.6 Thinking). This is the complete engineering brief.

---

```
══════════════════════════════════════════════════════════════════════
WOLF 3-STATEMENT FINANCIAL MODEL ENGINE — MASTERCLASS ENGINEERING BRIEF
Version 2.0 | April 2026 | Google Antigravity (Claude Opus 4.6 Thinking)
══════════════════════════════════════════════════════════════════════

You are an elite financial engineering agent operating inside Google Antigravity. Your mission is to complete and perfect the WOLF 3-Statement Financial Model Engine — a production-grade, Egyptian-market financial modeling system deployed at https://3-statement-model-engine.pages.dev/

Stack: Next.js 16 + React 19 + TypeScript 5 + Zustand 5 + ExcelJS + jsPDF + Recharts
Repository structure follows the Wolf Financial Suite conventions (Playfair Display, IBM Plex Mono, Sora typography; no TypeScript errors allowed; no hardcoded financial values anywhere except user input fields).

You have access to the complete engine source code. Read ALL relevant files before touching a single line.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY FIRST STEP — READ THESE FILES IN ORDER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. lib/engines/income-statement.ts
2. lib/engines/balance-sheet.ts
3. lib/engines/cash-flow.ts
4. lib/engines/circular-resolver.ts
5. lib/engines/integrator.ts
6. lib/engines/dcf.ts
7. lib/engines/valuation.ts
8. types/assumptions.ts
9. lib/store.ts
10. lib/export/excel.ts
11. lib/export/build-calc-sheets.ts

Do not write a single line of code until you have read all 11 files and fully understand the data flow, type contracts, and circular resolver architecture.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFIED ERRORS — FIX IN EXACT PRIORITY ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-01 — CBE RATE CORRECTION [CRITICAL — FIX FIRST]

File: types/assumptions.ts (defaults), lib/store.ts (v8 migration)

The engine has cbeRate: 0.2725 hardcoded. The CBE Monetary Policy Committee
held rates UNCHANGED at its April 2, 2026 meeting:
  • Overnight deposit rate: 19.00%
  • Overnight lending rate: 20.00%
  • Main operation / discount rate: 19.50%

The correct value to use as the CBE reference rate is 19.50% (discount rate).

ACTION:
(a) In types/assumptions.ts, update all default rate fields:
    cbeRate: 0.195                          // was 0.2725 — CBE discount rate April 2026
    riskFreeRate: 0.235                     // was 0.20 — 12-month T-bill yield Q1 2026
    interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]  // was flat 0.22 — CBE lending + 200bps spread, declining
    interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]  // was flat 0.18 — CBE deposit rate, declining path

(b) In lib/store.ts, add version v8 migration:
    version 8: force update cbeRate to 0.195 and riskFreeRate to 0.235 for any
    stored state where cbeRate > 0.25 (indicating stale 27.25% value).
    Also update interestRateOnDebt and interestRateOnCash arrays if they are
    still flat at the old values.

(c) In lib/engines/dcf.ts, add this comment block above the WACC calculation:
    // CBE Policy Rates (April 2, 2026 MPC Decision):
    // Overnight Deposit: 19.00% | Overnight Lending: 20.00%
    // Main Operation / Discount: 19.50% ← this is cbeRate
    // Risk-Free Rate: ~23.50% (12M T-bill average auction yield, Q1 2026)
    // Corporate Credit Spread (typical): +200bps over CBE lending rate

(d) Update the UI tooltip in DCFPage.tsx to show:
    "CBE Rate: Overnight Deposit 19.00% | Lending 20.00% | Discount 19.50% (April 2, 2026)"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-02 — DCF NULL BUG [CRITICAL]

File: lib/engines/integrator.ts, lib/store.ts, lib/export/csv-json.ts

The JSON export shows "dcfValuation": null even when DCF page renders correctly
in-browser. This means the DCF result is computed in the UI component layer but
never attached to the persisted ModelResults object.

ACTION:
(a) In lib/engines/integrator.ts → runFullModel():
    At the END of the function, after building ratios, call:
      results.dcfValuation = calculateDCF(results, assumptions);
    Ensure the DCF function signature accepts ModelResults and AssumptionSet.

(b) In lib/store.ts → calculateModel() action:
    Verify that modelResults is stored AFTER DCF is populated.
    The store.dcfValuation field should be set from modelResults.dcfValuation,
    not computed independently in a separate action.

(c) In lib/export/csv-json.ts:
    Confirm the JSON serialization includes results.dcfValuation.
    If it is null, log a warning: console.warn('[WOLF Export] DCF valuation is null — run calculateModel() first')

(d) Add integration check #29 to circular-resolver.ts validateIntegration():
    { name: 'DCF Computed', pass: dcfValuation !== null, critical: false }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-03 — THIN CAPITALIZATION MODULE [CRITICAL — COMPLIANCE]

Files: lib/engines/income-statement.ts, types/financial.ts,
       lib/agents/validation-rules.ts, components/statements/IncomeStatementPage.tsx

Egypt Law No. 30 of 2023 restricts interest deductibility:
• 2024–2027: Max D/E = 3:1 for interest deductibility
• 2028+:     Max D/E = 2:1
• Rate cap:  Deductible rate ≤ 2× CBE discount rate at year-start
• April 2026: Rate ceiling = 2 × 19.50% = 39.00%

The engine currently deducts 100% of interest expense. This is NON-COMPLIANT.

ACTION:
(a) Add to types/financial.ts → IncomeStatementResult:
    thinCapDeRatioLimit: number;      // 3 or 2 depending on year
    thinCapRateCeiling: number;       // 2× CBE rate
    disallowedInterest: number;       // non-deductible portion
    adjustedTaxableIncome: number;    // EBT + disallowedInterest - NOLUtilized

(b) Add to types/assumptions.ts → AssumptionSet:
    enableThinCapRule: boolean;       // default: true
    // (always true for Egyptian entities; toggle for non-Egyptian scenarios)

(c) In lib/engines/income-statement.ts, add AFTER the EBT calculation:

function calculateThinCapCompliance(
  interestExpense: number,
  totalDebt: number,
  totalEquity: number,
  cbeRate: number,
  calendarYear: number,
  enableThinCap: boolean
): { deductible: number; disallowed: number; deRatioLimit: number; rateCeiling: number } {
  if (!enableThinCap || totalDebt <= 0 || totalEquity <= 0) {
    return { deductible: interestExpense, disallowed: 0,
             deRatioLimit: Infinity, rateCeiling: Infinity };
  }
  const deRatioLimit = calendarYear >= 2028 ? 2.0 : 3.0;
  const rateCeiling = cbeRate * 2; // e.g. 0.195 * 2 = 0.39

  // Step 1: Rate cap — compute interest at capped rate
  const effectiveRate = interestExpense / totalDebt;
  const cappedRate = Math.min(effectiveRate, rateCeiling);
  const rateCapInterest = totalDebt * cappedRate;

  // Step 2: D/E cap — limit deductible debt
  const currentDE = totalDebt / totalEquity;
  let deductibleInterest = rateCapInterest;
  if (currentDE > deRatioLimit) {
    const deductibleDebtFraction = (totalEquity * deRatioLimit) / totalDebt;
    deductibleInterest = rateCapInterest * deductibleDebtFraction;
  }

  const disallowed = Math.max(0, interestExpense - deductibleInterest);
  return { deductible: interestExpense - disallowed, disallowed,
           deRatioLimit, rateCeiling };
}

// Then modify the tax calculation:
const thinCap = calculateThinCapCompliance(
  is.interestExpense, bs.totalDebt, bs.totalEquity,
  assumptions.cbeRate, calendarYear, assumptions.enableThinCapRule
);
is.disallowedInterest = thinCap.disallowed;
is.adjustedTaxableIncome = Math.max(0, is.ebt + thinCap.disallowed - lossUtilized);
is.taxExpense = is.adjustedTaxableIncome * effectiveTaxRate;

(d) In validation-rules.ts, add rule #29:
{
  id: 29,
  name: 'Thin Capitalization Compliance',
  tier: 'major',
  check: (period) => {
    const de = period.bs.totalDebt / period.bs.totalEquity;
    const limit = period.calendarYear >= 2028 ? 2.0 : 3.0;
    return { pass: de <= limit || period.is.disallowedInterest > 0,
             message: de > limit && period.is.disallowedInterest === 0
               ? `D/E ratio ${de.toFixed(2)}x exceeds ${limit}:1 limit but no interest was disallowed`
               : 'OK' };
  }
}

(e) On IncomeStatementPage.tsx, add a row below Tax Expense:
    "Disallowed Interest (Thin-Cap)" — shown in amber when > 0
    "Adjusted Taxable Income" — shown always

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-04 — FORMULA-DRIVEN RATE SCHEDULE [MAJOR]

Files: types/assumptions.ts, components/EgyptianSettings.tsx,
       components/ModelPage.tsx

Interest rates must be derived from CBE rate + spread, not hardcoded arrays.

ACTION:
(a) Add to AssumptionSet:
    corporateCreditSpread: number;            // default: 0.02 (200bps)
    useFormulaRates: boolean;                 // default: true
    // When true, interestRateOnDebt[yr] = projectedCBERate[yr] + creditSpread
    // When false, user manually sets interestRateOnDebt per year

(b) Add projected CBE rate path assumption:
    cbeRateProjection: number[];              // default: [0.195, 0.175, 0.155, 0.140, 0.130]
    // 5-year declining path based on CBE easing cycle and 7% inflation target

(c) In the integrator/circular resolver, when useFormulaRates is true:
    assumptions.interestRateOnDebt[yr] = assumptions.cbeRateProjection[yr]
      + assumptions.corporateCreditSpread + 0.005; // 50bps lending premium
    assumptions.interestRateOnCash[yr] = assumptions.cbeRateProjection[yr] - 0.005;
    // Deposit rates are typically CBE overnight rate − 50bps

(d) In EgyptianSettings.tsx, add a "Rate Settings" card with:
    - Toggle: "Formula-Driven Rates" (linked to useFormulaRates)
    - Slider: "Credit Spread" (0–500bps)
    - Input: "CBE Rate Projection (5 years)" — per-year editable row
    - Display: computed interestRateOnDebt and interestRateOnCash per year (read-only when formula mode on)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-05 — EXCEL ITERATIVE CALCULATION SETUP [MAJOR]

File: lib/export/build-calc-sheets.ts

The browser engine resolves circular references iteratively (up to 500 iterations).
The Excel file does NOT replicate this — it uses single-pass formulas. The result:
Excel interest income/expense will differ from browser output.

ACTION:
(a) In build-calc-sheets.ts, at the top of each _Calc_* sheet generation,
    add a configuration instruction row (row 1, before data):
    Cell A1: "⚠ TO MATCH BROWSER OUTPUT: File → Options → Formulas → Enable
    iterative calculation. Set Max Iterations = 100, Max Change = 0.001"
    Style this row in amber background with bold text.

(b) Restructure interest income and expense cells to be self-referential:
    Interest expense cell for year N = PriorYearTotalDebt × rate
    (This is non-circular — uses prior year debt which is already computed)
    Interest income cell for year N = PriorYearCash × cashRate
    (Also non-circular — uses prior year cash)
    
    IMPORTANT: This means the Excel matches the browser's "beginning of period"
    methodology. Document this explicitly in cell comments.

(c) Add a named range INTEREST_METHOD in the Excel file:
    Value: "Beginning-of-Period Balance × Rate"
    Reference this in any cell comments on interest rows.

(d) In the Dashboard sheet, add a validation row:
    "Model Methodology": "Circular references resolved via Newton-Raphson
    iteration (15 iterations). Excel file uses beginning-of-period interest
    rates (non-circular equivalent)."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-06 — LABOR LAW NO. 14/2025 AND EPD UPDATE [MODERATE]

Files: lib/engines/income-statement.ts, components/EgyptianSettings.tsx,
       lib/i18n/labels.ts

ACTION:
(a) Update all code comments and UI labels from "Labor Law 1981" →
    "Labor Law No. 14 of 2025 (replaces Law 137/1981)"

(b) Add to AssumptionSet:
    enableNonOperatingExclusion: boolean;   // default: false
    // When true, EPD base = NI - max(0, otherIncomeExpense)
    // Rationale: Law 14/2025 excludes one-off non-operating gains from EPD base

(c) In income-statement.ts calculateEPD():
    const epdBase = enableNonOperatingExclusion
      ? Math.max(0, netIncome - Math.max(0, otherIncomeExpense))
      : netIncome;
    const epd = Math.max(0, epdBase * employeeProfitSharingRate);

(d) In EgyptianSettings.tsx, add a tooltip:
    "Per Labor Law No. 14/2025, EPD is 10% of net profit after tax,
    capped at total annual payroll. Enable the toggle to exclude
    one-off non-operating gains from the EPD base."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-07 — VAT WORKING CAPITAL LOOP [MODERATE]

Files: lib/engines/balance-sheet.ts, types/financial.ts,
       components/schedules/WorkingCapitalPage.tsx

Net VAT payable/receivable is currently computed in the VAT Schedule memo
but never flows back into the Balance Sheet. This understates current liabilities
and distorts the current ratio and quick ratio.

ACTION:
(a) Add to BalanceSheetResult:
    vatPayable: number;       // max(0, outputVAT - inputVAT) — part of TCL
    vatReceivable: number;    // max(0, inputVAT - outputVAT) — part of TCA

(b) In balance-sheet.ts, compute:
    const outputVAT = revenue * vatRate;
    const inputVAT = (cogs + capex + sgaPercent * revenue) * vatRate;
    const netVATPayable = outputVAT - inputVAT;
    bs.vatPayable = Math.max(0, netVATPayable);
    bs.vatReceivable = Math.max(0, -netVATPayable);

(c) Add vatPayable to totalCurrentLiabilities and vatReceivable to
    totalCurrentAssets calculations.

(d) Update all 28 integration checks that reference TCA/TCL sums to
    include these new fields.

(e) Show VAT Payable/Receivable as distinct line items on the
    Balance Sheet page under the respective sections.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-08 — COMPUTER/IT ACCELERATED DEPRECIATION [MODERATE]

File: lib/schedules/egyptian-depreciation.ts

Egyptian Tax Law Art. 25 specifies a special rate for computers and software:
  Year 1: 50% accelerated depreciation (of cost)
  Year 2+: 25% declining balance on remaining NBV

The current engine applies a flat 50% declining balance for all years.
This is wrong for Year 2 onward (should be 25% on remaining balance,
not 50% on original cost).

ACTION:
In egyptian-depreciation.ts, for the 'computers' asset class:

interface AssetClassState {
  originalCost: number;
  ageYears: number;       // track how old the asset cohort is
  nbv: number;
}

// Year 1 depreciation for new computer CapEx:
if (assetAge === 0) {
  depreciation = classCapex * 0.50;  // 50% of cost in year 1
} else {
  depreciation = classNBV * 0.25;    // 25% declining balance thereafter
}

Note: Since the engine pools assets, approximate by:
  Y1: new computer CapEx × 50% + existing computer NBV × 25%
  Y2+: computer NBV × 25%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-09 — EGX BENCHMARKS VINTAGE DISPLAY [MINOR]

File: lib/engines/valuation.ts, components/ValuationPage.tsx

ACTION:
(a) Add to EGX_BENCHMARKS object:
    lastUpdated: "2026-Q1",
    source: "EGX 30 constituents median, Q1 2026"

(b) In ValuationPage.tsx, display a badge:
    "EGX Benchmarks: Q1 2026 — Click to refresh"
    (Refresh button logs a console message for now;
    wire to API in Phase 4)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ FIX-10 — CBE RATE LIVE BANNER [MINOR]

File: components/Navbar.tsx or new components/CBERateBanner.tsx

ACTION:
Add a thin banner below the Navbar:
  Background: amber-50, text amber-800 (light mode) / amber-900/20 (dark)
  Content: "📊 CBE Rate: Deposit 19.00% | Lending 20.00% | Discount 19.50%
            (April 2, 2026 MPC — Rates on hold) | Click to update model"
  On click: open a modal that sets cbeRate in assumptions and triggers
            calculateAllScenarios()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ABSOLUTE RULES — NO EXCEPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. ZERO HARDCODED FINANCIAL VALUES in calculation engines.
   Every rate, percentage, and threshold must be derived from assumptions
   or defined as a named constant with a law citation comment.
   Example: const EPD_RATE = 0.10; // Labor Law 14/2025, 10% of net profit

2. EVERY formula must have a source comment.
   Example: // Interest Expense = Beginning Debt × Rate (Law 91/2005 Art. 25)

3. ALL 28 integration checks must continue to PASS after your changes.
   Run the full validation suite after every file you touch.
   If any check fails, do not proceed to the next fix.

4. TypeScript strict mode. Zero type errors. Zero `any` types without
   explicit justification comment.

5. No breaking changes to the Zustand store schema without a migration.
   All new fields must have defaults so existing stored models load correctly.
   Increment store version to v8.

6. All monetary calculations must use integer math or toFixed(2) rounding
   to avoid floating-point drift. Use the existing precision helpers.

7. The circular resolver must still converge. If your changes affect the
   circular dependency chain (interest income, interest expense, debt, cash),
   run a convergence test with the default Demo Company data and verify:
   • Convergence within 20 iterations
   • Final delta < 0.001
   • All 28 integration checks pass

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHASE 2 ENHANCEMENTS — IMPLEMENT AFTER ALL FIXES VERIFIED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After all 10 fixes above are implemented and tested:

ENHANCEMENT-A: EAS 49 Right-of-Use Asset (Lease Accounting)
Add operating lease capitalization per EAS 49 (IFRS 16 equivalent):
• AssumptionSet additions: annualLeasePayments[], leaseTerm, leaseDiscountRate
• BS: rightOfUseAsset (non-current), leaseLiability (split current/non-current)
• IS: remove operating lease from OpEx; add depreciationROU + leaseInterestExpense
• CF: add leaseRepayment to financing activities
• This changes EBITDA — document the pre/post EAS-49 EBITDA comparison

ENHANCEMENT-B: Revolving Credit Facility (RCF)
• AssumptionSet: rcfLimit, rcfRate, minimumCashBalance
• Auto-draw RCF if projectedEndingCash < minimumCashBalance
• Include RCF in total debt and interest expense

ENHANCEMENT-C: Monte Carlo Web Worker
Move monte-carlo.ts to a dedicated Web Worker.
Add progress bar (0–100% via postMessage).
Reduce default to 5,000 iterations; allow user to increase to 50,000.

ENHANCEMENT-D: Tornado Chart for Sensitivity Analysis
In SensitivityPage.tsx, add a horizontal bar chart (Recharts BarChart,
layout="vertical") showing the top 10 sensitivity variables ranked by
|high impact - low impact| on the selected output metric.

ENHANCEMENT-E: Audit Trail Sheet in Excel Export
Add _Audit sheet to workbook. Content:
• Export timestamp and model version
• All AssumptionSet values with law citations
• Validation check pass/fail grid
• Rate sources with dates

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERIFICATION CHECKLIST — RUN BEFORE CALLING COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

After all fixes are implemented, verify the following against Demo Company:

RATES:
□ cbeRate defaults to 0.195 in fresh store
□ riskFreeRate defaults to 0.235
□ interestRateOnDebt[0] = 0.22, declining to 0.16 by Y5
□ interestRateOnCash[0] = 0.19, declining to 0.12 by Y5
□ Store v8 migration updates old 0.2725 values correctly

CALCULATIONS:
□ Interest Expense 2026E = Beginning Debt × 22% (beginning balance method)
□ Tax = Applied to adjusted taxable income (not raw EBT) if thin-cap triggered
□ Thin-cap check: Demo Company 2024 D/E = 300K/248.8K = 1.21x < 3.0x limit → no disallowance ✓
□ EPD calculation: 10% of NI, capped at payroll
□ Legal Reserve: 5% of NI until 50% of paid-up capital
□ All 28 (now 29) integration checks pass
□ DCF not null in JSON export

EXCEL:
□ No hardcoded rate values in _Calc sheets (all rates pull from Scenarios/Assumptions)
□ Iterative calculation banner visible in _Calc sheets
□ Interest rows have cell comments citing "Beginning-of-Period Balance × Rate"
□ _Audit sheet present with all required fields

DCF:
□ JSON export "dcfValuation" is NOT null
□ WACC with corrected rates ≈ 27–30% (not 33%)
□ Enterprise Value increases significantly vs previous version
□ All 6 DCF sanity checks still run (negative share price, TV > 85% EV, etc.)

UI:
□ CBE Rate banner displays correct April 2026 rates
□ Thin-cap disallowance row visible on IS page (amber) when triggered
□ Formula-Driven Rates toggle works in EgyptianSettings
□ EGX benchmark vintage badge shows "Q1 2026"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXECUTION PROTOCOL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Proceed in this exact order:
1. Read all 11 files listed at the top
2. Implement FIX-01 (CBE rates) — affects defaults only, safe to do first
3. Run full model and verify Demo Company outputs are reasonable
4. Implement FIX-02 (DCF null) — verify JSON export
5. Implement FIX-03 (thin-cap) — most complex, validate carefully
6. Implement FIX-04 (formula rates) — builds on FIX-01
7. Implement FIX-05 (Excel iterative) — export layer, safe
8. Implement FIX-06 (Labor law update) — minor change
9. Implement FIX-07 (VAT working capital) — moderate BS impact
10. Implement FIX-08 (computer depreciation)
11. Implement FIX-09 and FIX-10 (UI enhancements)
12. Run full verification checklist
13. Only then proceed to Phase 2 Enhancements

If any fix causes a validation failure, STOP and resolve before continuing.
Do not batch fixes — implement one at a time and test.

Begin by reading lib/engines/income-statement.ts and confirming you
understand the full EPD → LR → distributable → dividends → RE waterfall
before touching any code.
══════════════════════════════════════════════════════════════════════
```

---

## PART 6 — VERIFIED CALCULATION CROSS-REFERENCE TABLE

Use this table to spot-check any new model output against the verified baseline.
If any number deviates from these verified values, there is a regression.

### Demo Company — Baseline Verified Values (Before Rate Corrections)

| Metric | 2024 | 2025 | 2026E | 2027E | 2028E | 2029E | 2030E |
|--------|------|------|-------|-------|-------|-------|-------|
| Revenue | 850,000 | 950,000 | 1,045,000 | 1,128,600 | 1,207,602 | 1,280,058 | 1,344,061 |
| Gross Margin | 40.0% | 40.0% | 40.0% | 40.0% | 40.0% | 40.0% | 40.0% |
| EBIT | 120,000 | 134,000 | 132,000 | 141,600 | 150,000 | 156,800 | 161,800 |
| Interest Expense | 14,000 | 13,000 | 61,600 | 57,200 | 52,800 | 48,400 | 44,000 |
| Net Income | 81,100 | 92,800 | 82,500 | 97,600 | 113,300 | 129,400 | 145,853 |
| EPS | 0.81 | 0.93 | 0.74 | 0.88 | 1.02 | 1.16 | 1.31 |
| FCF | — | 78,100 | 80,000 | 97,100 | 115,000 | 134,100 | 154,500 |
| Cash | 175,000 | 200,000 | 230,691 | 271,966 | 325,042 | 391,296 | 471,869 |
| Total Debt | 300,000 | 280,000 | 260,000 | 240,000 | 220,000 | 200,000 | 180,000 |
| D/E Ratio | 1.21x | 0.91x | 0.70x | 0.54x | 0.42x | 0.32x | 0.25x |
| Balance Sheet | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Thin-Cap check**: Demo Company's D/E never exceeds 3:1 limit in any year — no disallowance will trigger for Demo Company. But the rule must be active for companies with higher leverage.

### Interest Expense Verification Formula
```
IntExp[yr] = SUM(EndingLTD[yr-1], EndingSTD[yr-1], EndingCPLTD[yr-1]) × interestRate[yr]
# 2026E: (210,000 + 50,000 + 20,000) × 22% = 280,000 × 22% = 61,600 ✓
# 2030E: (110,000 + 50,000 + 20,000) × 22% = 180,000 × 22% = 39,600 ≠ 44,000
# Wait — 2029 ending LTD = 130K + STD 50K + CPLTD 20K = 200K × 22% = 44,000 ✓
```

---

*Document prepared: April 8, 2026 | WOLF Financial Suite | Ahmed Wael Metwally*
*Engine: https://3-statement-model-engine.pages.dev/*
