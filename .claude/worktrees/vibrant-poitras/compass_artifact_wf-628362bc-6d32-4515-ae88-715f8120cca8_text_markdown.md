# Forensic Audit Research Brief: 3-Statement Model Engine for Egypt

**The engine must be audited against 47 verified Egyptian regulatory parameters and 38 critical modeling integrity checks.** Central Bank of Egypt rates now stand at **19.00%/20.00%** (deposit/lending) after 825 basis points of cuts since early 2025, corporate income tax remains at **22.5%**, and VAT at **14%**. Any hardcoded rates in the codebase that predate the 2025–2026 easing cycle will produce materially wrong outputs. This report provides every parameter, formula standard, and audit criterion needed to write a definitive Claude Code repair prompt.

---

## Part A: Verified Egyptian rates and parameters (April 2026)

### CBE monetary policy rates locked in after February 2026 cut

The Monetary Policy Committee held rates unchanged on **April 2, 2026**, pausing the easing cycle amid escalating regional conflict and inflation reacceleration. The current rate structure, effective since **February 12, 2026**, is:

| Parameter | Rate | Source |
|---|---|---|
| **Overnight deposit rate** | **19.00%** | CBE MPC decision, Apr 2, 2026 |
| **Overnight lending rate** | **20.00%** | CBE MPC decision, Apr 2, 2026 |
| **Main operation rate** | **19.50%** | CBE MPC decision, Apr 2, 2026 |
| **Discount rate** | **19.50%** | CBE MPC decision, Apr 2, 2026 |

The full easing cycle trajectory: **27.25%→25.00%** (Apr 2025, −225bps) → **24.00%** (May 2025, −100bps) → **22.00%** (Aug 2025, −200bps) → **21.00%** (Oct 2025, −100bps) → hold (Nov 2025) → **20.00%** (Dec 2025, −100bps) → **19.00%** (Feb 2026, −100bps) → hold (Apr 2026). Total cumulative cut: **825 basis points**. The Required Reserve Ratio was also reduced from 18% to 16% on February 12, 2026. Sources: CBE official website (cbe.org.eg), Trading Economics, Bloomberg, Ahram Online, Daily News Egypt.

### Tax rates codified under Egyptian law

| Parameter | Rate | Legal Basis | Source |
|---|---|---|---|
| **Corporate income tax (standard)** | **22.5%** | Income Tax Law No. 91/2005, Art. 49 (amended by Law 30/2023) | PwC Tax Summaries Egypt (reviewed Feb 2026) |
| **CIT for oil exploration** | **40.55%** | Law 91/2005 | PwC |
| **VAT standard rate** | **14%** | VAT Law No. 67/2016 (effective Jul 2017) | PwC; EY |
| **Stamp tax on bank loans** | **0.4% per annum** (0.1%/quarter), split 50/50 between bank and borrower | Stamp Tax Law No. 111/1980, amended by Law 30/2023 | PwC; Latham & Watkins |
| **WHT on dividends (EGX-listed)** | **5%** | Law 91/2005 as amended | PwC WHT table, Feb 2026 |
| **WHT on dividends (unlisted)** | **10%** | Law 91/2005 as amended | PwC |
| **WHT on interest to non-residents** | **20%** | Law 91/2005, Art. 56 | PwC |
| **WHT on royalties to non-residents** | **20%** | Law 91/2005, Art. 56 | PwC |
| **Loss carryforward** | **5 years** max | Law 91/2005, Art. 29 | PwC; KPMG Egypt |
| **Thin capitalization ratio (2026)** | **2.5:1** debt-to-equity | Law 91/2005, amended by Law 30/2023 (phased: 4:1→3.5:1→3:1→**2.5:1**→2:1 by 2027) | EY Tax Agenda Egypt |
| **Interest deductibility cap** | ≤ **2× CBE discount rate** (i.e., ≤39% for 2026) | Law 91/2005 as amended | EY |

### Tax depreciation rates per Article 25

Egyptian tax depreciation follows a **declining balance** method for most assets, which differs fundamentally from the straight-line book depreciation typically used under EAS. This divergence is the primary driver of deferred tax in Egyptian financial models.

| Asset Category | Tax Depreciation Rate | Method |
|---|---|---|
| Buildings & establishments | **5%** | Straight-line |
| Intangible assets (incl. goodwill) | **10%** | Straight-line |
| Computers, IT, software, data storage | **50%** | Declining balance |
| All other assets (machinery, furniture, vehicles) | **25%** | Declining balance |
| Accelerated (industrial M&E, first year, optional) | Additional **30%** | One-time deduction |

Source: PwC Tax Summaries – Egypt Corporate Deductions; Income Tax Law 91/2005, Art. 25–26.

### Labor law and social insurance parameters

Egypt enacted **New Labor Law No. 14 of 2025** (effective September 1, 2025), replacing Law No. 12/2003. Key financial modeling impacts:

| Parameter | Value | Source |
|---|---|---|
| **Employer social insurance contribution** | **18.75%** of insurable salary | Social Insurance Law No. 148/2019; PwC |
| **Employee social insurance contribution** | **11%** of insurable salary | Law 148/2019; PwC |
| **Maximum insurable salary (2026)** | **EGP 16,700/month** (EGP 200,400/year) | BDO; Law 148/2019 + 15% annual increase |
| **Minimum insurable salary (2026)** | **EGP 2,700/month** (EGP 32,400/year) | BDO |
| **Minimum wage (private sector)** | **EGP 7,000/month** | National Wages Council, March 2025 |
| **End-of-service (unfair dismissal)** | ≥ **2 months' salary per year of service** | Labor Law 14/2025 |
| **End-of-service (fixed-term >5 years)** | **1 month's salary per year** | Labor Law 14/2025 |
| **Notice period** | **3 months** (uniform) | Labor Law 14/2025 |
| **Annual mandatory increment** | Minimum **3%** of SI salary | Labor Law 14/2025 |

Employer SI breakdown: old-age/disability/death 12%, work injury 1.5%, sickness 3.25%, unemployment 2%. Additional payroll costs include a 0.05% Martyrs Fund contribution and a 0.25% training fund levy. Source: EY Tax Alert; PwC Individual Other Taxes; Ramco Payroll Compliance Egypt.

### Macroeconomic indicators

| Indicator | Value | Date | Source |
|---|---|---|---|
| **Urban headline CPI (YoY)** | **15.2%** | March 2026 | CAPMAS via TradingView/Reuters |
| **Core inflation** | **12.7%** | February 2026 | CBE |
| **CBE inflation target** | **7% ±2pp** by Q4 2026 | Dec 2024 announcement | CBE |
| **EGP/USD exchange rate** | **~53.09–54.42** | April 2026 | Investing.com; Trading Economics; Yahoo Finance |
| **52-week EGP/USD range** | **46.64–54.86** | Apr 2025–Apr 2026 | Yahoo Finance |
| **10-year Egyptian T-bond yield** | **~20.41–20.54%** | March 2026 | Investing.com; Cbonds |
| **1-year T-bond yield** | **~25.45%** | Recent | Investing.com |
| **S&P sovereign rating** | **B** (upgraded Oct 2025 from B−) | Oct 2025 | S&P |
| **Moody's sovereign rating** | **Caa1** | Jan 2026 (Damodaran input) | Moody's |
| **Net international reserves** | **US$52,830.6 million** | End-March 2026 | CBE |

### Equity risk premium (Damodaran, January 5, 2026)

| Parameter | Value |
|---|---|
| **Egypt total ERP (rating-based)** | **13.94%** |
| **Egypt country risk premium** | **9.71%** |
| **Mature market ERP (US S&P 500)** | **4.23%** |
| **Adjusted default spread** | **6.37%** |
| **Sovereign CDS spread** | **3.41%** (341 bps) |
| **Total ERP (CDS-based, alternative)** | **~9.41%** |
| **Damodaran synthetic EGP risk-free rate** | **9.49%** |

Source: Aswath Damodaran, "Country Default Spreads and Risk Premiums" (pages.stern.nyu.edu/~adamodar/); "Data Update 4 for 2026" (Substack).

**Key caveat:** The CDS-based ERP (9.41%) reflects market-determined risk and may better capture current conditions than the Caa1-rating-based figure (13.94%), given the S&P upgrade to B. However, CDS spreads have likely widened since January 2026 due to regional conflict escalation.

---

## Part B: 3-statement modeling integrity standards

### The twelve mandatory linkages that cannot break

A production-grade 3-statement model must maintain these linkages in every period, for every scenario. If any link breaks, the model is unreliable.

1. **Net Income → Retained Earnings**: `RE(close) = RE(open) + Net Income − Dividends`
2. **Net Income → CFS line 1**: Net Income is the starting point of operating cash flow (indirect method)
3. **D&A triple link**: IS expense = BS accumulated depreciation increase = CFS operating add-back — all three must reference one depreciation schedule
4. **Working capital → CFS operating**: `WC adjustment = −Δ(Current Assets excl. Cash) + Δ(Current Liabilities excl. Debt)`
5. **CapEx → BS and CFS**: CFS investing outflow = BS gross PP&E addition
6. **PP&E corkscrew**: `Closing Net PP&E = Opening + CapEx − Disposals − Depreciation`
7. **Debt → BS and CFS**: New issuance = CFS financing inflow = BS debt increase; repayment = CFS financing outflow = BS debt decrease
8. **Interest expense → IS and debt schedule**: Interest calculated from debt schedule flows to IS below EBIT
9. **Cash reconciliation (the moment of truth)**: `CFS ending cash ≡ BS cash balance` — every period, every scenario
10. **Dividends dual flow**: CFS financing outflow AND BS retained earnings reduction
11. **Share issuance/buyback**: CFS financing AND BS equity (share capital / treasury stock)
12. **Deferred tax triple flow**: IS tax expense adjustment + BS DTA/DTL change + CFS operating non-cash adjustment

### Interest calculation and circular reference handling

**Average balance method** (more accurate): `Interest = Rate × (Opening Debt + Closing Debt) / 2`. This creates a circular reference because interest → net income → cash flow → debt repayment → closing debt → average debt → interest. Three solutions exist:

- **Iterative calculation with circuit breaker** (industry standard in Excel): Enable iterative calc (100 iterations, 0.001 precision), add a named switch that zeros interest when toggled off.
- **Algebraic solution** (best for code-based engines like this one): `Interest = Rate × Opening_Balance / (1 + Rate/2)` — eliminates circularity entirely while preserving accuracy. This is the recommended approach for a React-based calculation engine.
- **Opening balance method** (simplest, no circularity): `Interest = Rate × Opening Balance`. Less accurate but acceptable when debt doesn't change dramatically within periods.

### Working capital schedule methodology

| Metric | Formula (to calculate days) | Formula (to forecast balance) |
|---|---|---|
| **DSO** | `AR / Revenue × 365` | `AR = Revenue × DSO / 365` |
| **DIO** | `Inventory / COGS × 365` | `Inventory = COGS × DIO / 365` |
| **DPO** | `AP / COGS × 365` | `AP = COGS × DPO / 365` |

**Cash Conversion Cycle** = DSO + DIO − DPO.

**Critical sign convention for CFS**: Current asset increase = cash outflow (negative on CFS). Current liability increase = cash inflow (positive on CFS). Getting this wrong is the single most common 3-statement modeling error.

### Scenario analysis architecture

The engine should use a **single-cell toggle** pattern: one variable (e.g., `scenarioId = 1|2|3`) drives all assumption selections via a lookup/switch mechanism. Every assumption that differs across scenarios must have three values (Base/Upside/Downside), and the active value is selected dynamically. **No separate model files or separate calculation paths per scenario** — the entire model recalculates from one toggle.

### Excel export golden rules

- **Zero hardcoded values in calculation cells** — every constant must reference an assumption cell
- Blue font = inputs; black font = formulas; green font = cross-sheet links
- One row, one formula — all forecast columns must use identical formula structure
- Every cumulative account (PP&E, debt, retained earnings, accumulated depreciation, deferred tax) must use a corkscrew/roll-forward pattern
- Balance sheet check row: `= Total Assets − Total Liabilities − Total Equity` must equal zero
- CFS cash check: `= CFS Ending Cash − BS Cash` must equal zero

---

## Part C: Egypt-specific modeling requirements

### Tax depreciation creates material deferred tax

The divergence between **straight-line book depreciation** (EAS) and **declining-balance tax depreciation** (Law 91/2005) is the dominant source of deferred tax liability in Egyptian models. A company purchasing EGP 10M of machinery will claim **EGP 2.5M tax depreciation** in Year 1 (25% declining balance) versus perhaps **EGP 1.0M book depreciation** (10% straight-line over 10 years). The EGP 1.5M temporary difference generates a **DTL of EGP 337,500** (1.5M × 22.5%). This must flow to all three statements: IS tax expense increases, BS DTL increases, CFS non-cash adjustment offsets.

For IT assets at 50% declining balance, the difference is even more dramatic. The model engine **must** have a deferred tax schedule or the tax expense will be wrong.

### Stamp tax on debt is a separate cost line

**Bank loans attract 0.4% annual proportional stamp tax** (0.1% per quarter), levied on the opening quarterly balance plus new drawdowns. The borrower's share is **0.2% per annum**. This flows as a separate expense on the IS and a cash outflow on the CFS. Loans from non-bank establishments are exempt. Treasury bills and bonds are also exempt. Projects under Investment Law 72/2017 enjoy a 5-year exemption from stamp tax on credit facilities.

The model must calculate: `Quarterly Stamp Tax (borrower) = Beginning Quarter Balance × 0.001 × 0.5`, annualized as `Annual Stamp Tax (borrower) = Average Loan Balance × 0.002`.

### Thin capitalization limits interest deductibility

For fiscal year 2026, the thin cap ratio is **2.5:1** (debt-to-equity). Interest on debt exceeding this ratio is **non-deductible** for CIT purposes — a permanent difference that must be modeled separately from temporary differences. Additionally, interest expense is only deductible if the rate does not exceed **2× the CBE discount rate** at the start of the calendar year (2× 19.5% = 39.0% for 2026). Excess interest is non-deductible.

### Workers' profit sharing affects tax calculation

Egyptian law requires distribution of **10% of net profits to employees** (capped per employee). This must be modeled as a separate line between EBT and the tax calculation — it reduces taxable income. The correct flow is: `EBIT − Interest + Interest Income = EBT → less 10% employees' profit share → Taxable Income → × 22.5% = Current Tax`. Under EAS, workers' profit sharing is recognized as an **equity distribution**, not a P&L expense — a key difference from IFRS.

### Social insurance flows through operating expenses

The employer's **18.75% contribution** is capped at the maximum insurable salary of **EGP 16,700/month per employee**. The maximum annual employer SI cost per employee is therefore EGP 16,700 × 12 × 18.75% = **EGP 37,575/year**. The model must calculate total SI cost based on headcount, average salary, and the cap — not simply apply 18.75% to total payroll.

### FX exposure requires explicit treatment

Post-devaluation Egypt (the EGP dropped from ~30 to ~50+ per USD between 2023 and 2024), companies with USD-denominated costs or revenues need an explicit FX assumption line. Monetary assets and liabilities must be revalued at each period-end rate, with FX gains/losses flowing to the IS. EAS follows IAS 21 principles but allowed special one-time treatments for the 2016 and 2022 devaluations (extended through 2023).

### Other Egypt-specific requirements

- **Inventory valuation**: FIFO and weighted average cost permitted; **LIFO is prohibited** under EAS (aligned with IAS 2)
- **Zakat**: **NOT applicable** as a corporate tax in Egypt. Unlike Saudi Arabia, Egypt imposes no government zakat. No zakat line item needed.
- **Free zones**: Projects in free zones are exempt from CIT, paying instead 1% of goods value (manufacturing) or 3% of value added (services). No deferred tax arises for free zone entities.
- **EAS vs IFRS differences**: (1) Workers' profit sharing = equity distribution, not expense; (2) Separate P&L required (no single OCI statement option); (3) Revaluation model for PP&E only permitted since January 2023; (4) Investment property uses PP&E revaluation model, not fair value through P&L.
- **EGX reporting**: Listed companies must file quarterly statements within **45 days** of quarter-end, prepared under EAS, audited by FRA-registered auditor. Minimum issued capital **EGP 100M** (fully paid), minimum **10% free float**.

---

## Part D: 38-point forensic audit checklist

### Balance sheet and integration integrity (8 checks)

1. ☐ BS balances in every period and every scenario: `Total Assets = Total Liabilities + Total Equity`
2. ☐ CFS ending cash = BS cash balance, every period
3. ☐ Retained earnings roll-forward: `RE(close) = RE(open) + NI − Dividends`
4. ☐ Dividends flow to BOTH CFS financing AND BS retained earnings
5. ☐ CapEx flows to BOTH CFS investing AND BS gross PP&E
6. ☐ Debt issuance/repayment flows to BOTH CFS financing AND BS debt
7. ☐ Share issuance/buyback flows to BOTH CFS financing AND BS equity
8. ☐ Net change in cash from CFS = Change in BS cash balance

### Depreciation and PP&E (4 checks)

9. ☐ D&A on IS = D&A in PP&E schedule = D&A add-back on CFS (single source)
10. ☐ Accumulated depreciation rolls forward properly (corkscrew)
11. ☐ PP&E corkscrew: `Close = Open + CapEx − Disposals − Depreciation`
12. ☐ Tax depreciation (declining balance) differs from book depreciation (straight-line) and creates deferred tax

### Debt, interest, and financing (7 checks)

13. ☐ Interest calculated consistently (average balance vs opening balance)
14. ☐ Circular reference handled (algebraic solution preferred in code)
15. ☐ Debt balance cannot go negative (repayment capped at outstanding)
16. ☐ Revolver/cash sweep mechanism prevents negative cash
17. ☐ Interest income modeled on cash balances (material in Egypt at 19%+ rates)
18. ☐ **Stamp tax on bank loans modeled (0.2% borrower's share)**
19. ☐ **Thin capitalization rule applied (2.5:1 for 2026)**

### Tax calculations (5 checks)

20. ☐ Tax calculated on **EBT**, not EBIT
21. ☐ **Workers' 10% profit share** deducted before tax calculation
22. ☐ CIT rate = **22.5%** (not hardcoded elsewhere as different value)
23. ☐ Deferred tax schedule exists for book/tax depreciation difference
24. ☐ **Interest rate cap** checked (≤2× CBE discount rate = 39%)

### Working capital and cash flow (5 checks)

25. ☐ WC sign convention correct: ΔAssets = negative on CFS, ΔLiabilities = positive
26. ☐ DSO/DIO/DPO formulas correct and drive AR/Inventory/AP
27. ☐ D&A is POSITIVE (add-back) in CFS operating section
28. ☐ CapEx is NEGATIVE (outflow) in CFS investing section
29. ☐ Debt issuance POSITIVE, repayment NEGATIVE in CFS financing

### Formula and structure quality (5 checks)

30. ☐ ZERO hardcoded values in calculation cells — everything references assumptions
31. ☐ Consistent formulas across all forecast periods
32. ☐ All SUM ranges include every relevant line item
33. ☐ Scenario toggle changes ALL assumptions simultaneously
34. ☐ No hardcoded values bypass the scenario toggle

### Egypt-specific compliance (4 checks)

35. ☐ **Social insurance** costs capped at EGP 16,700/month per employee, employer rate 18.75%
36. ☐ **CBE rates** match current 19.00%/20.00%/19.50%/19.50%
37. ☐ **FX assumptions** explicit if company has USD exposure
38. ☐ **Inflation** assumptions consistent with ~15% CPI environment

---

## Part E: Complete paste-ready Claude Code prompt

The following prompt is designed for Claude Code (Opus 4.6) running in your terminal against the 3-Statement Model Engine repository. It should be pasted directly into the Claude Code session with the 3-Statement Model Engine codebase open.

---

```
You are performing a forensic audit and repair of the 3-Statement Financial Model Engine, a React 19 + Vite 6 + Tailwind CSS application (plain JavaScript JSX) deployed on Cloudflare Pages at https://3-statement-model-engine.pages.dev/. This engine is part of Ahmed Wael Metwally's Wolf Financial Suite, built for Egyptian capital markets. Your task is to systematically audit every calculation, fix every error, and ensure full Egyptian regulatory compliance.

## PHASE 0: CODEBASE RECONNAISSANCE (do this first, report findings before proceeding)

1. Map the entire project structure:
   - List all files in src/ with their purposes
   - Identify the main calculation engine file(s) — likely where IS, BS, CFS formulas live
   - Identify the Excel export generator file(s) — likely using a library like xlsx/exceljs/sheetjs
   - Identify the assumptions/defaults/constants file(s)
   - Identify scenario management logic
   - Identify any state management (React context, zustand, redux, etc.)

2. Document every hardcoded constant you find anywhere in the codebase:
   - Tax rates, interest rates, growth rates, depreciation rates
   - Days assumptions (DSO, DIO, DPO)
   - Any magic numbers in formulas
   - Default values in state initialization
   - Create a complete inventory: file, line number, current value, what it represents

3. Document every formula/calculation:
   - Income Statement: Revenue → COGS → Gross Profit → OpEx → EBITDA → D&A → EBIT → Interest → EBT → Tax → Net Income
   - Balance Sheet: every asset, liability, and equity line item calculation
   - Cash Flow Statement: every operating, investing, and financing line item
   - Supporting schedules: PP&E, debt, working capital, depreciation
   - Note the EXACT JavaScript code for each calculation

Report your Phase 0 findings in detail before proceeding. I need to see every formula before you change anything.

## PHASE 1: RATE VERIFICATION AND CORRECTION

### Egyptian Regulatory Parameters (verified as of April 2026)

Replace ALL hardcoded rates with properly named constants in a central configuration file (e.g., src/config/egyptianParameters.js or similar). Create this file if it doesn't exist. Every parameter below must be a named, documented constant:

```javascript
// src/config/egyptianParameters.js
// Egyptian Financial Parameters — Last verified: April 11, 2026
// Sources: CBE, PwC Tax Summaries, EY Tax Alerts, Law 91/2005, Law 148/2019

export const EGYPTIAN_PARAMS = {
  // === CBE MONETARY POLICY RATES (effective Feb 12, 2026; held Apr 2, 2026) ===
  CBE_OVERNIGHT_DEPOSIT_RATE: 0.19,      // 19.00%
  CBE_OVERNIGHT_LENDING_RATE: 0.20,      // 20.00%
  CBE_MAIN_OPERATION_RATE: 0.195,        // 19.50%
  CBE_DISCOUNT_RATE: 0.195,              // 19.50%

  // === CORPORATE INCOME TAX (Law 91/2005, Art. 49) ===
  CIT_RATE_STANDARD: 0.225,              // 22.5% for non-oil companies
  CIT_RATE_OIL_EXPLORATION: 0.4055,      // 40.55%

  // === VALUE ADDED TAX (Law 67/2016) ===
  VAT_RATE_STANDARD: 0.14,               // 14%

  // === STAMP TAX (Law 111/1980, amended by Law 30/2023) ===
  STAMP_TAX_ON_LOANS_ANNUAL: 0.004,      // 0.4% p.a. total (split 50/50)
  STAMP_TAX_BORROWER_SHARE_ANNUAL: 0.002, // 0.2% p.a. borrower's share
  STAMP_TAX_QUARTERLY_RATE: 0.001,       // 0.1% per quarter total

  // === WITHHOLDING TAX ===
  WHT_DIVIDENDS_LISTED: 0.05,            // 5% for EGX-listed shares
  WHT_DIVIDENDS_UNLISTED: 0.10,          // 10% for unlisted shares
  WHT_INTEREST_NONRESIDENT: 0.20,        // 20%
  WHT_ROYALTIES_NONRESIDENT: 0.20,       // 20%

  // === TAX DEPRECIATION (Law 91/2005, Art. 25) ===
  TAX_DEPR_BUILDINGS: 0.05,              // 5% straight-line
  TAX_DEPR_INTANGIBLES: 0.10,            // 10% straight-line
  TAX_DEPR_IT_COMPUTERS: 0.50,           // 50% declining balance
  TAX_DEPR_OTHER_ASSETS: 0.25,           // 25% declining balance
  TAX_DEPR_ACCELERATED_FIRST_YEAR: 0.30, // Optional 30% additional (industrial M&E)

  // === THIN CAPITALIZATION (Law 91/2005, amended by Law 30/2023) ===
  THIN_CAP_RATIO_2026: 2.5,              // 2.5:1 debt-to-equity for 2026
  INTEREST_RATE_CAP_MULTIPLIER: 2,       // Interest deductible only if rate ≤ 2× CBE discount rate

  // === TAX LOSS CARRYFORWARD ===
  LOSS_CARRYFORWARD_YEARS: 5,            // Maximum 5 years

  // === WORKERS' PROFIT SHARING ===
  WORKERS_PROFIT_SHARE: 0.10,            // 10% of net profits to employees

  // === SOCIAL INSURANCE (Law 148/2019, effective Jan 2026) ===
  SI_EMPLOYER_RATE: 0.1875,              // 18.75% total
  SI_EMPLOYEE_RATE: 0.11,                // 11% total
  SI_SALARY_CAP_MONTHLY: 16700,          // EGP 16,700/month (2026)
  SI_SALARY_CAP_ANNUAL: 200400,          // EGP 200,400/year (2026)
  SI_SALARY_FLOOR_MONTHLY: 2700,         // EGP 2,700/month (2026)
  SI_SALARY_FLOOR_ANNUAL: 32400,         // EGP 32,400/year (2026)
  MINIMUM_WAGE_MONTHLY: 7000,            // EGP 7,000/month (March 2025)

  // === MACROECONOMIC (for reference/defaults) ===
  INFLATION_RATE_CPI: 0.152,             // 15.2% urban CPI YoY (March 2026)
  RISK_FREE_RATE_10Y_TBOND: 0.2054,      // ~20.54% (March 2026)
  EGP_USD_RATE: 53.09,                   // April 2026 approximate
  DAMODARAN_TOTAL_ERP: 0.1394,           // 13.94% (rating-based, Jan 2026)
  DAMODARAN_COUNTRY_RISK_PREMIUM: 0.0971, // 9.71% (Jan 2026)
};
```

### Verification steps:
1. Search the ENTIRE codebase for every occurrence of these numbers (0.225, 22.5, 0.14, 14, 0.25, 25, etc.) — both in calculation logic AND in Excel export generation
2. Replace every hardcoded instance with a reference to the central EGYPTIAN_PARAMS object
3. Ensure the Excel export also uses these same constants (do NOT have separate hardcoded values in the export code)
4. Check if any rates are stored in React state or JSON that don't match these values — if so, update them
5. Log every replacement you make: file, line, old value, new value, parameter name

## PHASE 2: FORMULA AUDIT — INCOME STATEMENT

Verify each IS formula. The correct flow is:

```
Revenue (user input or growth-driven)
− COGS (driven by COGS margin % × Revenue, or direct input)
= Gross Profit
− Operating Expenses (SG&A, R&D, etc.)
  − Including: Social Insurance (employer 18.75%, capped at EGP 16,700/month × headcount)
= EBITDA
− Depreciation & Amortization (from PP&E schedule, book depreciation)
= EBIT (Operating Income)
+ Interest Income (on cash balances × interest income rate)
− Interest Expense (from debt schedule)
= EBT (Earnings Before Tax)
− Workers' Profit Share (10% of EBT)        ← EGYPT-SPECIFIC, often missing
= Taxable Income
− Income Tax Expense (22.5% × Taxable Income) ← must be on TAXABLE INCOME, not EBIT or EBT
  − Current Tax
  − Deferred Tax (change in DTL/DTA)
= Net Income
```

### Common errors to check and fix:
- [ ] Tax calculated on EBIT instead of EBT → FIX: tax base must be AFTER interest
- [ ] Tax calculated on EBT instead of (EBT − Workers' Profit Share) → FIX: deduct 10% WPS first
- [ ] Missing interest income on cash balances → ADD if missing (material in Egypt at 19%+ rates)
- [ ] Missing workers' profit share line → ADD: 10% of profits to employees
- [ ] Social insurance not capped → FIX: apply EGP 16,700/month cap per employee
- [ ] D&A hardcoded instead of linked to PP&E schedule → FIX: link to schedule

## PHASE 3: FORMULA AUDIT — BALANCE SHEET

Verify the BS structure and formulas:

```
ASSETS:
  Current Assets:
    Cash & Cash Equivalents = CFS Ending Cash (MUST equal)
    Accounts Receivable = Revenue × DSO / 365
    Inventory = COGS × DIO / 365
    Other Current Assets (if any)
  Total Current Assets = SUM of above

  Non-Current Assets:
    Gross PP&E = Prior Gross PP&E + CapEx − Disposals
    Less: Accumulated Depreciation = Prior Accum Depr + Book Depreciation − Accum Depr on Disposals
    Net PP&E = Gross PP&E − Accumulated Depreciation
    Deferred Tax Asset (if book > tax expenses in period)
    Other Non-Current Assets
  Total Non-Current Assets = SUM of above

Total Assets = Total Current + Total Non-Current

LIABILITIES:
  Current Liabilities:
    Accounts Payable = COGS × DPO / 365
    Short-term Debt / Current Portion of LTD
    Accrued Expenses
    Tax Payable
    Workers' Profit Share Payable
  Total Current Liabilities

  Non-Current Liabilities:
    Long-term Debt (from debt schedule)
    Deferred Tax Liability (if tax depr > book depr)
    End-of-Service Benefits Provision
  Total Non-Current Liabilities

Total Liabilities

EQUITY:
    Share Capital / Common Stock
    Additional Paid-in Capital
    Retained Earnings = Prior RE + Net Income − Dividends
  Total Equity

Total Liabilities + Equity

BALANCE CHECK: Total Assets − Total L&E = 0 (MUST be zero in every period)
```

### Checks:
- [ ] Cash on BS links to CFS ending cash
- [ ] AR driven by DSO formula, not hardcoded
- [ ] Inventory driven by DIO formula, not hardcoded
- [ ] AP driven by DPO formula, not hardcoded
- [ ] PP&E uses corkscrew (roll-forward) pattern
- [ ] Accumulated depreciation rolls forward properly
- [ ] Retained earnings formula correct: Open + NI − Dividends = Close
- [ ] Deferred tax asset/liability exists (for book vs tax depreciation difference)
- [ ] BS check row exists and = 0 for all periods
- [ ] Workers' profit share payable exists (if applicable)
- [ ] End-of-service benefits provision exists (EAS 19 / Labor Law 14/2025)

## PHASE 4: FORMULA AUDIT — CASH FLOW STATEMENT

Verify the CFS (indirect method):

```
OPERATING ACTIVITIES:
  Net Income
  + Depreciation & Amortization (add-back, POSITIVE)
  + Deferred Tax change (non-cash adjustment)
  + Other non-cash items
  Working Capital Changes:
    − Change in Accounts Receivable (increase = NEGATIVE = cash outflow)
    − Change in Inventory (increase = NEGATIVE)
    + Change in Accounts Payable (increase = POSITIVE = cash inflow)
    + Change in Accrued Expenses (increase = POSITIVE)
    + Change in Tax Payable (increase = POSITIVE)
  = Cash from Operating Activities

INVESTING ACTIVITIES:
  − Capital Expenditures (NEGATIVE = cash outflow)
  + Proceeds from Asset Disposals (POSITIVE)
  = Cash from Investing Activities

FINANCING ACTIVITIES:
  + Debt Issuance (POSITIVE = cash inflow)
  − Debt Repayment (NEGATIVE = cash outflow)
  + Equity Issuance (POSITIVE)
  − Share Buybacks (NEGATIVE)
  − Dividends Paid (NEGATIVE)
  − Stamp Tax on Debt (NEGATIVE, borrower's share)
  = Cash from Financing Activities

Net Change in Cash = Operating + Investing + Financing
Beginning Cash = Prior Period Ending Cash
ENDING CASH = Beginning + Net Change (MUST = BS Cash)
```

### Critical sign convention checks:
- [ ] D&A is POSITIVE in operating section (it's an add-back)
- [ ] CapEx is NEGATIVE in investing section
- [ ] Increase in AR/Inventory is NEGATIVE in operating (cash outflow)
- [ ] Increase in AP/Accruals is POSITIVE in operating (cash inflow)
- [ ] Debt repayment is NEGATIVE in financing
- [ ] Dividends is NEGATIVE in financing
- [ ] Ending cash = BS cash (reconciliation check)

## PHASE 5: SUPPORTING SCHEDULES

### PP&E / Depreciation Schedule
- Book depreciation: straight-line over useful life (user-specified)
- Tax depreciation: declining balance at 25% (most assets) or 50% (IT)
- Verify BOTH are calculated and the DIFFERENCE drives deferred tax
- PP&E corkscrew: Opening + CapEx − Disposals = Closing (gross); Opening AccDep + Depr = Closing AccDep

### Debt Schedule
- Opening balance, new issuance, mandatory repayment, optional prepayment, closing balance
- Interest = Rate × Average Balance (or Opening Balance, but be consistent and handle circularity)
- For a JavaScript engine, use the ALGEBRAIC SOLUTION to avoid circularity:
  Interest = Rate × OpeningBalance / (1 + Rate/2)  [if using average balance]
- Stamp tax: 0.2% of average balance annually (borrower's share)
- Revolver/cash sweep to balance BS (if implemented)
- Closing balance = Opening + Issuance − Repayment
- Check: BS debt = sum of all tranches' closing balances

### Working Capital Schedule
- DSO → AR, DIO → Inventory, DPO → AP
- Changes flow to CFS operating section with correct signs
- Verify formulas: AR = Revenue × DSO / 365 (not Revenue / 365 × DSO, ensure correct order)

### Deferred Tax Schedule (CREATE IF MISSING)
- Temporary Difference = Book Carrying Value − Tax Base
- DTL/DTA = Temporary Difference × 22.5%
- Change in DTL/DTA flows to IS tax expense and CFS operating adjustments
- Common sources: depreciation timing difference, bad debt provisions, end-of-service benefits

## PHASE 6: SCENARIO ANALYSIS

Verify that:
1. A scenario toggle exists (Base/Upside/Downside)
2. Changing the toggle updates ALL assumptions simultaneously
3. No hardcoded values bypass the toggle
4. The following assumptions are scenario-dependent:
   - Revenue growth rate
   - Gross margin / COGS %
   - OpEx growth or OpEx as % of revenue
   - CapEx as % of revenue
   - Working capital days (DSO, DIO, DPO)
   - Interest rate (or spread over CBE rate)
   - Tax rate effectiveness
5. All three scenarios produce a balanced BS and reconciled CFS
6. Test: switch to Downside → verify BS still balances, CFS cash = BS cash

## PHASE 7: EXCEL EXPORT AUDIT

The Excel export is CRITICAL — it must mirror the React calculation logic exactly. Verify:

1. **Every cell that contains a calculation in the React engine must contain a formula (not a value) in the Excel export**
   - Search the export code for patterns like `worksheet.getCell().value = calculatedNumber` — these are hardcoded values
   - Replace with `worksheet.getCell().value = { formula: '=...' }` using proper Excel formula syntax
   - Only INPUT cells (assumptions, user entries) should be values; everything else must be formulas

2. **Excel formula structure must match React calculation logic:**
   - If React calculates `grossProfit = revenue - cogs`, then Excel must have `=B5-B6` (not a pasted number)
   - Tax formula in Excel must be: `=EBT_Cell * CIT_Rate_Cell` referencing the assumptions sheet
   - Working capital formulas must reference DSO/DIO/DPO from assumptions sheet

3. **Cross-sheet references:**
   - Net Income on BS Retained Earnings must reference IS Net Income cell (e.g., `='Income Statement'!B25`)
   - Cash on BS must reference CFS Ending Cash (e.g., `='Cash Flow'!B30`)
   - D&A in CFS must reference IS D&A or PP&E schedule D&A

4. **Assumptions sheet:**
   - All rates (22.5% CIT, 14% VAT, 19% CBE rate, etc.) must be on the Assumptions sheet
   - All calculation sheets must reference these cells, not contain their own constants
   - Named ranges preferred for key assumptions

5. **Color coding (if supported by the library):**
   - Blue font for input cells
   - Black font for formula cells
   - Conditional formatting for check rows (green if 0, red if ≠ 0)

6. **Check rows in Excel:**
   - BS check: `=Total Assets - Total L&E` (should be 0)
   - CFS check: `=CFS Ending Cash - BS Cash` (should be 0)

## PHASE 8: OUTPUT REQUIREMENTS

After completing all phases, produce:

### 1. CHANGELOG (versioned)
Format each fix as:
```
[FIX-001] File: src/calculations/incomeStatement.js, Line 45
  BEFORE: const tax = ebit * 0.225;
  AFTER: const tax = (ebt - workersProfit) * EGYPTIAN_PARAMS.CIT_RATE_STANDARD;
  REASON: Tax was calculated on EBIT instead of (EBT − Workers' Profit Share). Tax base must be after interest expense and workers' profit sharing per Egyptian Income Tax Law 91/2005.
```

### 2. FILES CREATED
List any new files created (e.g., egyptianParameters.js, deferredTaxSchedule.js)

### 3. REMAINING ISSUES
List any issues you identified but could not fix, with explanations and recommendations.

### 4. TESTING CHECKLIST
Provide a testing checklist the developer should run after applying fixes:
- [ ] BS balances in Base scenario (all periods)
- [ ] BS balances in Upside scenario (all periods)
- [ ] BS balances in Downside scenario (all periods)
- [ ] CFS ending cash = BS cash (all periods, all scenarios)
- [ ] RE roll-forward correct (all periods)
- [ ] Tax rate = 22.5% applied to correct base
- [ ] Excel export: all calculation cells contain formulas, not values
- [ ] Excel export: BS check row = 0
- [ ] Excel export: CFS check row = 0
- [ ] Scenario toggle: switching scenarios updates all outputs
- [ ] No console errors in browser
- [ ] Cloudflare Pages build succeeds

## IMPORTANT CONSTRAINTS:
- Do NOT break existing functionality — fix incrementally
- Do NOT change the UI/UX unless fixing a calculation display error
- Do NOT modify the build system or dependencies unless strictly necessary
- PRESERVE all existing features — add missing ones, fix broken ones
- Comment every significant change with // AUDIT FIX: [description]
- If a formula is ambiguous, add a comment explaining the Egyptian regulatory basis
- Use git commits with semantic messages: fix(calc): correct tax base from EBIT to taxable income
- Run the dev server (npm run dev or similar) after each phase to verify nothing breaks
```

---

## Conclusion: what the audit will likely uncover

Based on patterns in financial model engines built with AI coding assistants, the most probable issues in this engine fall into three categories. **First, rate staleness**: the CBE rates have changed seven times since early 2025, and any rates hardcoded during initial development will be wrong. **Second, Egyptian regulatory gaps**: workers' profit sharing, stamp tax on loans, thin capitalization rules, deferred tax for book/tax depreciation differences, and social insurance caps are commonly omitted from non-Big-4-built models. **Third, Excel export hollowness**: AI-generated Excel exports frequently paste calculated values rather than embedding live formulas, which means the exported Excel file looks correct but contains zero working formulas — a critical failure for any financial professional who needs to audit or modify the output.

The Claude Code prompt above is structured in eight sequential phases to ensure systematic discovery before repair. Phase 0 maps the codebase without changing anything. Phases 1–6 fix the React calculation logic. Phase 7 separately audits the Excel export generator. Phase 8 produces the documentation. The central `EGYPTIAN_PARAMS` configuration object serves as a single source of truth, eliminating the most dangerous class of errors: scattered hardcoded constants that silently produce wrong outputs across multiple code paths.

The **thin capitalization ratio transitioning to 2.5:1 in 2026** and the **new Labor Law 14/2025** replacing Law 12/2003 are the most likely regulatory changes to be missing from any model built before mid-2025. The interest deductibility cap at 2× CBE discount rate (39% for 2026) is another frequently overlooked constraint that can materially affect after-tax cash flows for highly leveraged Egyptian companies.