# 3SM v2 - Part 1 Read-Only Audit

Audited commit: `8ba8ab2` (main). Audit date: 31-Oct-2026. No file under app/, components/, lib/, types/ or fixtures/ was changed.

Method: source read by hand for the engine, exporter entry points, store and services. Calculation and constant inventories were extracted from the TypeScript AST so nothing depends on memory. Runtime claims were tested in a throwaway copy of the repo outside the working tree, using `fixtures/telecom-egypt.json` (synthetic, see 0.8). The workbook was hard-recalculated in LibreOffice headless with OOXMLRecalcMode=always. Non-ASCII output characters are written as `[U+XXXX]` to keep this file free of emoji; paths to the temp copy are written `<scratch-copy>`.

## 0. Failures and unknowns (read first)

### Failures

| # | Finding | Evidence |
|---|---|---|
| 0.1 | **A Groq API key is compiled into the static bundle.** `NEXT_PUBLIC_` variables are public by construction. The key shape in `.env.local` matches `gsk_`, and 2 files under the local `out/` and `.next/static/` contain it. It is not in any tracked file or in git history. Whether the deployed site carries it was not tested, because this repo does not record the deployed URL. Treat it as exposed and rotate it. | `lib/services/analyst.ts:29`; `.env.local` (not tracked); scan counts only, the key was never printed |
| 0.2 | **The Excel file shows engine values, not its own formula results.** 302 of 1,888 formula cells change on hard recalculation. Worst case: 2025 ending cash is cached 12,000,000,000 but recalculates to 23,745,000,000. Forecast cash also drifts (2026E 11,697,654,914 cached vs 11,697,652,499 recalculated, past the 1 EGP tolerance). | Section 8.7; `lib/export/excel.ts:131-142` sets `fullCalcOnLoad: false` on purpose |
| 0.3 | **The existing sync audit cannot detect 0.2.** `npm run audit:sync` prints 1635/1635 aligned because it compares the exporter's cached results with the engine that produced them. It never recalculates. | `scripts/audit-sync.ts:41-51`; Section 10 |
| 0.4 | **Historical net income is re-derived, not loaded.** When a statutory rate exists, reported tax is discarded: `max(0, EBT) x rate`. Test: reported tax 1,000,000,000 and 2,000,000,000 came out as 3,032,325,000 and 6,547,500,000. The tax field had no effect on net income, and back-solved dividends do not depend on it either. | `lib/engines/income-statement.ts:416`; probe in Section 10 |
| 0.5 | **The historical cash flow is entirely derived from BS changes, with dividends back-solved as the plug.** `reconciles` is then true by construction. This is what Part 4 forbids, and MOPCO's debtors line would break it. | `lib/engines/cash-flow.ts:171-301`, plug at `:231`, `:241`, `:248` |
| 0.6 | **A balanced base case hides 12 ways to unbalance the forecast.** BS-only overrides and CF-only lines have no counterpart (table in Section 5). Largest gap 465,750,000,000. | Section 5.3; probe in Section 10 |
| 0.7 | **Altman is wrong in three independent ways.** EM score omits the 3.25 constant; X4 divides by total debt rather than total liabilities and is forced to 0 when debt is 0, which is MOPCO's case; engine zones (2.60/1.10) differ from Excel zones (2.9/1.23) for the same score. Excel's cached Altman cell is 0 and its zone is 0. | `lib/ratios.ts:63,72-74`; `lib/export/excel.ts:2385-2390` |
| 0.8 | **Telecom Egypt fixture is synthetic.** Round figures throughout; historical tax equals exactly 22.5% of EBT; retained earnings documented as a plug. Decision 10 is correct. | `fixtures/telecom-egypt.json:12-47`; `fixtures/README.md:24,52-53` |
| 0.9 | **Invented company data is written into every exported workbook.** Founded 2010, register no. `12345-Cairo-2010`, tax ID `123-456-789`, Zamalek address, sector Technology / Software, whichever company is exported. | `lib/export/build-company-info.ts:99-104` |
| 0.10 | **Unofficial FX is presented in a CBE rates panel.** ExchangeRate-API; hardcoded fallbacks are stamped with the current time, so stale values look fresh. Opening the panel also overwrites `cbeRate` and `riskFreeRate` in all scenarios. | `lib/services/liveRates.ts:45,50,62-63,84`; `lib/store.ts:383-402`; `components/LiveRatesPanel.tsx:12` |
| 0.11 | **The "40 checks" count is not a count of checks run.** `totalChecks = 40` is a literal; `passed` is 40 minus findings. At least 2 integration checks are tautologies. | `lib/agents/validation-agent.ts:191,204`; `lib/engines/circular-resolver.ts:268-270,399-401` |
| 0.12 | **10-year runs silently change the model in year 6.** Driver arrays have 5 entries; indexes 5-9 fall back to code literals. Test: growth 0%, COGS jumps 42% to 60%, SG&A 10% to 15%, without warning, and all checks pass. | `lib/engines/income-statement.ts:180,184,190`; probe in Section 10 |
| 0.13 | **Silent input rewriting.** `seedAssumptionsFromHistorical` replaces an input when it is under 10% of the last historical value, or looks like a default. A user input can be overwritten without notice. | `lib/engines/integrator.ts:40-45,84-105` |
| 0.14 | **The historical schema cannot hold MOPCO.** No fields for legal or general reserve, merger reserve, ROU assets, lease liabilities, amortized-cost or FVTPL investments, tax payable, provisions, employee benefits, customer or supplier advances, or FX. Historical legal reserve is hard-set to 0. | `types/assumptions.ts:165-207`; `lib/engines/balance-sheet.ts:330` |
| 0.15 | **Missing engine requirements:** no FX module, no leases, no revolver, no tranche debt, no minimum cash, no circularity switch, no sensitivity. Deferred tax is a flat input, and current tax is paid in the year it is expensed. | Sections 2 and 6 |

### Unknowns

| # | Unknown | Status |
|---|---|---|
| U1 | MOPCO audited FY2025 and FY2023 PDFs. Not found in the repo, D:\WOLF, Desktop, Downloads or Documents (name search for mopco / fertili / MFPC and any PDF under D:\WOLF). Found only an interview guide, a comps file and a WOLF valuation output. | Needed before Part 4 |
| U2 | Whether the deployed site contains the Groq key (0.1). | Not tested |
| U3 | Behaviour in real Excel. Only LibreOffice was available. The 302-cell count is LibreOffice's. | Excel not available |
| U4 | All "stale" flags in Section 4 compare code with the brief's Appendix A. Nothing was re-verified at primary sources; that is Part 3's job. | `unconfirmed` |
| U5 | Legal citations in code (Law 14/2025, Law 30/2023 thin-cap ratios and rate ceiling, Art. 25-26 depreciation rates, Law 6/2025 SME regime). None verified here. | `unconfirmed` |

### Conflicts between the brief and the repo

| # | Conflict | Recommendation |
|---|---|---|
| C1 | The brief says React + Vite. The repo is **Next.js 16.1.6 static export** (`next.config.ts`, `package.json`). | Move to Vite in Part 2. Nothing needs a server after the AI route is deleted, and `src/` in Part 2 assumes it. Needs your go-ahead. |
| C2 | The brief's order puts Part 3 after Parts 2 and 4-8, but `runModel(inputs, ratesSnapshot)` and Part 5 read the registry. | Build `packages/rates-registry` schema plus a manual snapshot in Part 2, with every value `unconfirmed`. Worker and verification stay in Part 3. |
| C3 | The brief says DCF, Multiples, CBE Banking Metrics, `_Calc_*` sheets and AI Analyst are to be deleted. CBE Banking Metrics pages and `_Calc_*` sheets are already gone from main (commit 7ccf177); they survive only in the tracked `.claude/worktrees/` copy. A second AI feature the brief does not name exists: `/api/validate`. | Delete it under Decision 1. |
| C4 | The brief says `npm test`. No test script exists. | Recorded verbatim in Section 10. |
| C5 | Modules absent from the brief: tax-loss carryforward, thin-cap, VAT schedule, EOS by % of SG&A, PDF export, CSV export. | See "Proposed" in `docs/PROGRESS.md`. |


## 1. File tree with line counts

293 tracked files: 142 project files, 151 under `.claude/worktrees/vibrant-poitras/`. That worktree copy is committed to main by accident: `.gitignore` has a UTF-16 `.claude/` entry that git does not parse, and the worktree itself is marked prunable. Total worktree lines: 64,429.

```text
     28  .claude/settings.local.json
      8  .eslintignore
     50  .gitignore
  10378  Demo_Company_Inc__Financial_Model.json
 binary  Engine_Overview.docx
     33  KNOWN_LIMITATIONS.md
     36  README.md
   1065  WolfSuite_PDF_Design_MasterPrompt.md
     47  app/api/validate/route.ts
 binary  app/favicon.ico
   1322  app/globals.css
 binary  app/icon.png
      4  app/icon.svg
     20  app/layout.tsx
    198  app/page.tsx
    578  audit_report.md
    392  components/AnalystPanel.tsx
     86  components/CBERateBanner.tsx
     78  components/CompanySettings.tsx
     75  components/ConflictModal.tsx
    219  components/Dashboard.tsx
    454  components/EgyptianSettings.tsx
     74  components/ErrorBanner.tsx
     16  components/Footer.tsx
     40  components/HeroStrip.tsx
    357  components/HistoricalDataInput.tsx
    526  components/HistoricalImportPage.tsx
    108  components/LiveRatesPanel.tsx
    152  components/ModelPage.tsx
    324  components/Navbar.tsx
    192  components/RatiosPage.tsx
    238  components/ScenarioComparisonModal.tsx
     62  components/ScenarioSelector.tsx
    143  components/ScenariosPage.tsx
    280  components/Sidebar.tsx
    301  components/ValidationPage.tsx
     27  components/charts/MarginChart.tsx
     40  components/charts/RevenueChart.tsx
    176  components/schedules/DebtSchedulePage.tsx
    167  components/schedules/DepreciationPage.tsx
    203  components/schedules/WorkingCapitalPage.tsx
    127  components/statements/BalanceSheetPage.tsx
    156  components/statements/CashFlowPage.tsx
    300  components/statements/IncomeStatementPage.tsx
     80  debug_excel.js
   1018  engine_complete_overview.md
     18  eslint.config.mjs
     57  fixtures/README.md
     83  fixtures/telecom-egypt.json
   1354  generate_overview_docx.mjs
    664  generate_overview_pdf.mjs
    105  lib/agents/multi-scenario-validator.ts
    236  lib/agents/validation-agent.ts
    129  lib/agents/validation-prompt.ts
    666  lib/agents/validation-rules.ts
     75  lib/agents/validation-types.ts
    341  lib/engines/balance-sheet.ts
    301  lib/engines/cash-flow.ts
    560  lib/engines/circular-resolver.ts
    151  lib/engines/dcf.ts
    472  lib/engines/income-statement.ts
    290  lib/engines/integrator.ts
    121  lib/engines/valuation.ts
    182  lib/export/build-company-info.ts
    398  lib/export/build-dashboard.ts
    498  lib/export/build-scenarios.ts
    340  lib/export/csv-json.ts
   3408  lib/export/excel.ts
   1056  lib/export/pdf.ts
      6  lib/i18n/index.ts
    139  lib/i18n/labels.ts
    178  lib/ratios.ts
     67  lib/scenario-manager.ts
     87  lib/scenarios.ts
    112  lib/schedules/egyptian-depreciation.ts
    214  lib/services/analyst.ts
    119  lib/services/liveRates.ts
    715  lib/store.ts
    101  lib/templates/egyptian-industries.ts
     64  lib/utils.ts
      7  next.config.ts
 binary  out-base.xlsx
   8873  package-lock.json
     39  package.json
      7  postcss.config.mjs
 binary  scripts/__pycache__/build_company_info.cpython-314.pyc
 binary  scripts/__pycache__/build_dashboard.cpython-314.pyc
 binary  scripts/__pycache__/build_scenarios.cpython-314.pyc
 binary  scripts/__pycache__/enhance_helpers.cpython-314.pyc
    330  scripts/audit-sync.ts
    112  scripts/build_company_info.py
    295  scripts/build_dashboard.py
    146  scripts/build_scenarios.py
     28  scripts/check-circ.ts
    119  scripts/check_excel.js
    110  scripts/check_excel.mjs
    172  scripts/check_wolf.py
     64  scripts/debug-excel-cells.ts
    138  scripts/deep_dive.py
     76  scripts/diag-calc-sheets.ts
     89  scripts/diag-interest-dividend.ts
     63  scripts/diag_is.ts
     94  scripts/diagnose-scenarios-tab.ts
     91  scripts/enhance_helpers.py
    221  scripts/enhance_model.py
     35  scripts/enhance_output.txt
    142  scripts/final_fix.py
    209  scripts/full_reconciliation.py
    416  scripts/generate_docx.mjs
     99  scripts/map_excel.py
    418  scripts/mapping_output.txt
    236  scripts/phase1_diagnosis.py
     23  scripts/quick-diag.ts
    200  scripts/run-export.ts
    175  scripts/targeted_comparison.py
    514  scripts/test-audit-fixes.ts
    191  scripts/test-calc-sheets.ts
    101  scripts/test-validation-agent.ts
    133  scripts/test_export.js
    429  scripts/test_full_export.ts
     73  scripts/test_scenarios.ts
    256  scripts/trace_discrepancy.py
    176  scripts/verify-calc-sheets.ts
    177  scripts/verify-excel-export.ts
    226  scripts/verify-full-fix.ts
     69  scripts/verify-scenarios-sheet.ts
    156  scripts/verify-scenarios-tab-full.ts
     54  scripts/verify-scenarios.ts
     75  scripts/verify_audit.ts
    373  scripts/verify_excel_full.ts
    354  scripts/verify_excel_readback.ts
    320  scripts/verify_live_formulas.ts
    310  scripts/verify_scenario_export.ts
    196  scripts/verify_scenario_output.ts
    151  scripts/verify_scenarios.py
    151  tash show -p stash@{0}
    378  test_excel_export.mjs
     43  tsconfig.json
    432  types/assumptions.ts
    369  types/financial.ts
    289  types/historical.ts
    138  types/scenario.ts
```

Untracked and ignored at root: `.env.local` (Groq key), `out/`, `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`, `next-env.d.ts`, `out-optimistic.xlsx`, `out-conservative.xlsx`. Junk tracked at root: `tash show -p stash@{0}` (a mistyped command saved as a file), `scripts/__pycache__/`, `out-base.xlsx`.

## 2. Every calculation

### 2.1 Core calculations, in engine order

| file:line | Computes | Inputs |
|---|---|---|
| `lib/engines/income-statement.ts:181` | Revenue | prior revenue, growth[yr] |
| `:185-187` | COGS, gross profit, margin | revenue, cogs%[yr] |
| `:190-194` | SG&A, R&D, other opex | revenue, % drivers |
| `:195` | SBC | stockBasedCompAmount[yr] |
| `:197-199` | EOS expense | SG&A, eos% |
| `:200-205` | total opex, EBIT, EBITDA | opex lines |
| `:213` | EBT | EBIT, interest income, interest expense, other |
| `:105-144` | thin-cap disallowed interest | interest, debt, equity, cbeRate, calendar year |
| `:43-99` | tax with 5-year FIFO loss carryforward | EBT + disallowed, rate, vintages |
| `:238` | net income | EBT, tax |
| `:146-165` | legal reserve addition on **same-year** NI, cap 50% of capital | NI, prior reserve, paidUpCapital |
| `:260-269` | employee distribution: 10% of NI, cap payroll | NI, rate, payroll |
| `:275` | distributable profit | NI, EPD, reserve addition |
| `:279-281` | gross dividends on **same-year** distributable, blocked if prior RE < 0 | distributable, payout, prior RE |
| `:282-286` | dividend WHT and net dividends | gross dividends, listed flag |
| `:287` | addition to RE | distributable, dividends |
| `:290-295` | NOPAT and FCFF memo | EBIT, ETR, D&A, capex, NWC |
| `:303` | EPS on NI after EPD | NI, EPD, shares |
| `:309-313` | VAT memo | revenue, vatRate |
| `:416-417` | historical tax (overrides reported) and NI | EBT, statutory rate |
| `:462-464` | historical addition to RE as RE delta | BS RE |
| `lib/engines/balance-sheet.ts:32,36,73` | AR, inventory, AP from DSO/DIO/DPO | revenue, COGS, days |
| `:39,75,76` | prepaid, accrued, deferred revenue as % revenue | revenue |
| `:46-51` | capex, gross PP&E, accumulated depreciation, net PP&E | revenue, capex%, prior, depreciation |
| `:54-55` | intangibles with floor at 0 | prior, capex%, amortization |
| `:66,84` | VAT receivable and payable | capex, revenue, vatRate |
| `:93-113` | debt repayment by mode; LTD with floor at 0 | mode, prior LTD |
| `:122` | EOS provision with floor at 0 | prior, expense, payments |
| `:129-138` | APIC, legal reserve, RE | prior, issuance, SBC, additions |
| `:157` | balance difference | total assets, L+E |
| `:206-227` | depreciation: straight-line on avg gross or declining on NBV | prior gross, NBV, capex, rate, mix |
| `:235` | interest expense on **opening** debt | opening debt, rate |
| `:246` | interest income on **average** cash | opening and closing cash, rate |
| `lib/engines/cash-flow.ts:24-53` | CFO | NI, D&A, SBC, delta DTL, delta other LT, delta OCI, delta EOS, WC deltas |
| `:56-69` | CFI | revenue, capex%, intangibles%, deltas, inputs |
| `:72-111` | CFF, including EPD paid as financing | debt inputs, dividends, EPD, buybacks |
| `:114-119` | net change, ending cash, FCF | CFO, CFI, CFF, opening cash |
| `lib/engines/circular-resolver.ts:55-177` | per-year fixed-point iteration | see Section 6 |
| `:71-77` | effective debt and cash rates | rate arrays or cbeRate projection +/- literals |
| `lib/engines/integrator.ts:30-110` | input seeding | assumptions, last historical |
| `:112-254` | master run and DCF attach | assumptions, historicals |
| `lib/ratios.ts:15-105` | all ratios, DuPont, Altman Z' and EM, break-even | IS, BS, prior BS, CF |
| `lib/engines/dcf.ts:21-151` | WACC, DCF (delete) | assumptions, results |
| `lib/engines/valuation.ts:34-109` | multiples, implied prices (delete; dead code) | results |
| `lib/schedules/egyptian-depreciation.ts:49-98` | declining balance, blended rate, straight-line | NBV, capex, mix, rates |
| `types/historical.ts` | per-year derived totals; `convertToHistoricalInputs` | historical rows |
| `types/assumptions.ts:378-391` | demo RE as balance plug | demo balances |


### 2.2 Full AST inventory (1107 expressions)

Every variable, property, assignment, return or inline expression containing arithmetic, in `app/`, `components/`, `lib/` and `types/`. Target and expression state what it computes. Excel formula text lives inside strings and is covered in Section 8. Layout-only arithmetic in style props is excluded. Expressions are truncated at 150 characters.

| file:line | target | expression | inputs |
|---|---|---|---|
| `components/CBERateBanner.tsx:14` | isStale | `Math.abs(currentCBE - 0.195) > 0.001` | Math.abs, currentCBE |
| `components/charts/MarginChart.tsx:8` | 'Gross' | `+(d.grossMargin * 100).toFixed(1)` | (d.grossMargin*100).toFixed |
| `components/charts/MarginChart.tsx:9` | 'Operating' | `+(d.ebitMargin * 100).toFixed(1)` | (d.ebitMargin*100).toFixed |
| `components/charts/MarginChart.tsx:10` | 'Net' | `+(d.netMargin * 100).toFixed(1)` | (d.netMargin*100).toFixed |
| `components/charts/RevenueChart.tsx:32` | (inline) | `v / 1000` | v |
| `components/Dashboard.tsx:20` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `components/Dashboard.tsx:21` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `components/Dashboard.tsx:22` | lastCF | `results.cashFlowStatements[results.cashFlowStatements.length - 1]` | results.cashFlowStatements, results.cashFlowStatements.length |
| `components/Dashboard.tsx:24` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `components/Dashboard.tsx:26` | metrics | `[ { label: 'Revenue', value: formatCurrency(lastIS.revenue, currency, true), sub: formatPercent(lastIS.revenueGrowthRate) + ' growth' }, { label: 'EBI` | label, value, formatCurrency, lastIS.revenue, currency, sub, formatPercent |
| `components/Dashboard.tsx:28` | sub | `formatPercent(lastIS.ebitda / lastIS.revenue) + ' margin'` | formatPercent, lastIS.ebitda, lastIS.revenue |
| `components/Dashboard.tsx:30` | sub | ``FCF yield: ${formatPercent(lastIS.revenue !== 0 ? lastCF.freeCashFlow / lastIS.revenue : 0)}`` | formatPercent, lastIS.revenue, lastCF.freeCashFlow |
| `components/Dashboard.tsx:32` | sub | ``D/E: ${(lastBS.totalEquity !== 0 ? totalDebt / lastBS.totalEquity : 0).toFixed(2)}x`` | (lastBS.totalEquity!==0?totalDebt/lastBS.totalEquity:0).toFixed |
| `components/Dashboard.tsx:33` | value | `formatCurrency(totalDebt - lastBS.cash, currency, true)` | formatCurrency, totalDebt, lastBS.cash, currency |
| `components/Dashboard.tsx:33` | sub | `totalDebt - lastBS.cash < 0 ? 'Net cash position [U+00E2][U+0153][U+201C]' : `${formatPercent(lastBS.totalAssets !== 0 ? (totalDebt - lastBS.cash) / lastBS.totalAssets : 0)}` | totalDebt, lastBS.cash, formatPercent, lastBS.totalAssets |
| `components/Dashboard.tsx:34` | sub | ``ROE: ${formatPercent(results.ratios[results.ratios.length - 1]?.roe ?? 0)}`` | formatPercent, results.ratios[results.ratios.length-1]?.roe |
| `components/Dashboard.tsx:35` | sub | ``Shares: ${(lastIS.sharesOutstanding / 1e6).toFixed(1)}M`` | (lastIS.sharesOutstanding/1e6).toFixed |
| `components/Dashboard.tsx:39` | period | `results.incomeStatements[i + 1]?.period ?? `Period ${i + 1}`` | results.incomeStatements[i+1]?.period, i |
| `components/Dashboard.tsx:102` | (inline) | `r.incomeStatements.length - 1` | r.incomeStatements.length |
| `components/Dashboard.tsx:103` | (inline) | `r.incomeStatements.length - 1` | r.incomeStatements.length |
| `components/Dashboard.tsx:104` | (inline) | `r.incomeStatements.length - 1` | r.incomeStatements.length |
| `components/Dashboard.tsx:105` | (inline) | `r.cashFlowStatements.length - 1` | r.cashFlowStatements.length |
| `components/Dashboard.tsx:106` | (inline) | `r.balanceSheets.length - 1` | r.balanceSheets.length |
| `components/Dashboard.tsx:134` | delta | `m.fn(s.results!) - baseVal` | m.fn, s.results, baseVal |
| `components/Dashboard.tsx:135` | pct | `baseVal !== 0 ? (delta / Math.abs(baseVal)) * 100 : 0` | baseVal, delta, Math.abs |
| `components/EgyptianSettings.tsx:33` | (return) | `( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent-blue)' }}` | div, className, style, marginTop, h3, fontSize, fontWeight |
| `components/EgyptianSettings.tsx:145` | val | `parseFloat(e.target.value) / 100 \|\| 0` | parseFloat, e.target.value |
| `components/EgyptianSettings.tsx:218` | yr | `a.startYear - a.historicalYears + i` | a.startYear, a.historicalYears, i |
| `components/EgyptianSettings.tsx:219` | (return) | `( <div key={i} style={{ textAlign: 'center' }}> <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{yr} Debt</div> <input clas` | div, key, i, style, textAlign, fontSize, color |
| `components/EgyptianSettings.tsx:229` | arr[i] | `parseFloat(e.target.value) / 100 \|\| 0.22` | parseFloat, e.target.value |
| `components/EgyptianSettings.tsx:238` | yr | `a.startYear - a.historicalYears + i` | a.startYear, a.historicalYears, i |
| `components/EgyptianSettings.tsx:239` | (return) | `( <div key={`cash-${i}`} style={{ textAlign: 'center' }}> <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{yr} Cash</div> <` | div, key, i, style, textAlign, fontSize, color |
| `components/EgyptianSettings.tsx:249` | arr[i] | `parseFloat(e.target.value) / 100 \|\| 0.18` | parseFloat, e.target.value |
| `components/EgyptianSettings.tsx:307` | arr[i] | `parseFloat(e.target.value) / 100 \|\| 0.195` | parseFloat, e.target.value |
| `components/HistoricalDataInput.tsx:73` | grossProfit | `d.revenue - d.cogs` | d.revenue, d.cogs |
| `components/HistoricalDataInput.tsx:74` | totalOpex | `d.sgaExpense + d.rdExpense + d.depreciation + d.amortization + d.otherOpex` | d.sgaExpense, d.rdExpense, d.depreciation, d.amortization, d.otherOpex |
| `components/HistoricalDataInput.tsx:75` | ebit | `grossProfit - totalOpex` | grossProfit, totalOpex |
| `components/HistoricalDataInput.tsx:76` | ebt | `ebit + d.interestIncome - d.interestExpense + d.otherIncomeExpense` | ebit, d.interestIncome, d.interestExpense, d.otherIncomeExpense |
| `components/HistoricalDataInput.tsx:77` | netIncome | `ebt - d.taxExpense` | ebt, d.taxExpense |
| `components/HistoricalDataInput.tsx:78` | netPPE | `d.grossPPE - d.accumulatedDepreciation` | d.grossPPE, d.accumulatedDepreciation |
| `components/HistoricalDataInput.tsx:79` | totalCurrentAssets | `d.cash + d.accountsReceivable + d.inventory + d.prepaidExpenses + d.otherCurrentAssets` | d.cash, d.accountsReceivable, d.inventory, d.prepaidExpenses, d.otherCurrentAssets |
| `components/HistoricalDataInput.tsx:80` | totalNonCurrentAssets | `netPPE + d.intangibleAssets + d.goodwill + d.otherLTAssets` | netPPE, d.intangibleAssets, d.goodwill, d.otherLTAssets |
| `components/HistoricalDataInput.tsx:81` | totalAssets | `totalCurrentAssets + totalNonCurrentAssets` | totalCurrentAssets, totalNonCurrentAssets |
| `components/HistoricalDataInput.tsx:82` | totalCurrentLiabilities | `d.accountsPayable + d.accruedExpenses + d.shortTermDebt + d.currentPortionLTD + d.deferredRevenue + d.otherCurrentLiabilities` | d.accountsPayable, d.accruedExpenses, d.shortTermDebt, d.currentPortionLTD, d.deferredRevenue, d.otherCurrentLiabilities |
| `components/HistoricalDataInput.tsx:83` | totalNonCurrentLiabilities | `d.longTermDebt + d.deferredTaxLiabilities + d.otherLTLiabilities` | d.longTermDebt, d.deferredTaxLiabilities, d.otherLTLiabilities |
| `components/HistoricalDataInput.tsx:84` | totalLiabilities | `totalCurrentLiabilities + totalNonCurrentLiabilities` | totalCurrentLiabilities, totalNonCurrentLiabilities |
| `components/HistoricalDataInput.tsx:85` | totalEquity | `d.commonStock + d.additionalPaidInCapital + d.retainedEarnings + d.treasuryStock + d.otherComprehensiveIncome` | d.commonStock, d.additionalPaidInCapital, d.retainedEarnings, d.treasuryStock, d.otherComprehensiveIncome |
| `components/HistoricalDataInput.tsx:165` | year | `parseInt(p) \|\| (2023 + i)` | parseInt, p, i |
| `components/HistoricalDataInput.tsx:175` | val | `parseFloat(cells[j + 1]?.replace(/[$,%"]/g, '') \|\| '0') \|\| 0` | parseFloat, cells[j+1]?.replace |
| `components/HistoricalDataInput.tsx:193` | balanceDiff | `current.totalAssets - (current.totalLiabilities + current.totalEquity)` | current.totalAssets, current.totalLiabilities, current.totalEquity |
| `components/HistoricalDataInput.tsx:196` | (return) | `( <div> <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}> <h1 styl` | div, style, display, justifyContent, alignItems, marginBottom, flexWrap |
| `components/HistoricalImportPage.tsx:108` | (return) | `{ id: (s.id as string) ?? `imported-${idx}-${now}`, name: (s.name as string) ?? `Imported ${idx + 1}`, type: (s.type as string) ?? 'custom', descripti` | id, s.id, idx, now, name, s.name, type |
| `components/HistoricalImportPage.tsx:110` | name | `(s.name as string) ?? `Imported ${idx + 1}`` | s.name, idx |
| `components/HistoricalImportPage.tsx:378` | (inline) | `v + data.shortTermDebt[i]` | v, data.shortTermDebt, i |
| `components/HistoricalImportPage.tsx:401` | (inline) | `i - 1` | i |
| `components/HistoricalImportPage.tsx:408` | (inline) | `startYear - n + i` | startYear, n, i |
| `components/HistoricalImportPage.tsx:424` | grossProfit | `revenue - cogs` | revenue, cogs |
| `components/HistoricalImportPage.tsx:434` | ebit | `grossProfit - sgaExpense - rdExpense - depreciation - amortization - otherOpex` | grossProfit, sgaExpense, rdExpense, depreciation, amortization, otherOpex |
| `components/HistoricalImportPage.tsx:435` | ebt | `ebit + interestIncome - interestExpense + otherIncomeExpense` | ebit, interestIncome, interestExpense, otherIncomeExpense |
| `components/HistoricalImportPage.tsx:436` | netIncome | `ebt - taxExpense` | ebt, taxExpense |
| `components/HistoricalImportPage.tsx:445` | netPPE | `grossPPE - accumulatedDepreciation` | grossPPE, accumulatedDepreciation |
| `components/HistoricalImportPage.tsx:449` | totalCurrentAssets | `cash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets` | cash, accountsReceivable, inventory, prepaidExpenses, otherCurrentAssets |
| `components/HistoricalImportPage.tsx:450` | totalNonCurrentAssets | `netPPE + intangibleAssets + goodwill + otherLTAssets` | netPPE, intangibleAssets, goodwill, otherLTAssets |
| `components/HistoricalImportPage.tsx:451` | totalAssets | `totalCurrentAssets + totalNonCurrentAssets` | totalCurrentAssets, totalNonCurrentAssets |
| `components/HistoricalImportPage.tsx:462` | totalCurrentLiabilities | `accountsPayable + accruedExpenses + shortTermDebt + currentPortionLTD + deferredRevenue + otherCurrentLiabilities` | accountsPayable, accruedExpenses, shortTermDebt, currentPortionLTD, deferredRevenue, otherCurrentLiabilities |
| `components/HistoricalImportPage.tsx:463` | totalNonCurrentLiabilities | `longTermDebt + deferredTaxLiabilities + otherLTLiabilities` | longTermDebt, deferredTaxLiabilities, otherLTLiabilities |
| `components/HistoricalImportPage.tsx:464` | totalLiabilities | `totalCurrentLiabilities + totalNonCurrentLiabilities` | totalCurrentLiabilities, totalNonCurrentLiabilities |
| `components/HistoricalImportPage.tsx:471` | totalEquity | `commonStock + additionalPaidInCapital + retainedEarnings + treasuryStock + otherComprehensiveIncome` | commonStock, additionalPaidInCapital, retainedEarnings, treasuryStock, otherComprehensiveIncome |
| `components/LiveRatesPanel.tsx:16` | (inline) | `v * 100` | v |
| `components/ModelPage.tsx:65` | actualVal | `item?.pct ? num / 100 : num` | item?.pct, num |
| `components/ModelPage.tsx:104` | (inline) | `i + 1` | i |
| `components/ModelPage.tsx:104` | (inline) | `assumptions.startYear + i` | assumptions.startYear, i |
| `components/ModelPage.tsx:116` | displayVal | `item.pct ? (rawVal * 100).toFixed(1) : rawVal.toFixed(0)` | item.pct, (rawVal*100).toFixed, rawVal.toFixed |
| `components/ModelPage.tsx:136` | (inline) | `((getValue(item.path) as number \| undefined) ?? 0) * 100` | getValue, item.path |
| `components/Navbar.tsx:122` | (return) | `( <> {/* Hamburger [U+00E2][U+20AC][U+201D] mobile only */} <button id="hamburger-menu" className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={si` | button, id, className, onClick, setSidebarOpen, sidebarOpen, aria-label |
| `components/RatiosPage.tsx:27` | (inline) | `n / d` | n, d |
| `components/RatiosPage.tsx:29` | (inline) | `(bs[yr]?.shortTermDebt ?? 0) + (bs[yr]?.currentPortionLTD ?? 0) + (bs[yr]?.longTermDebt ?? 0)` | bs[yr]?.shortTermDebt, bs[yr]?.currentPortionLTD, bs[yr]?.longTermDebt |
| `components/RatiosPage.tsx:30` | (inline) | `(is[yr]?.ebit ?? 0) + (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0)` | is[yr]?.ebit, is[yr]?.depreciation, is[yr]?.amortization |
| `components/RatiosPage.tsx:31` | (inline) | `yr - 1` | yr |
| `components/RatiosPage.tsx:47` | effRate | `ebt > 0 ? taxExp / ebt : (is[yr]?.taxRate ?? 0)` | ebt, taxExp, is[yr]?.taxRate |
| `components/RatiosPage.tsx:48` | nopat | `(is[yr]?.ebit ?? 0) * (1 - effRate)` | is[yr]?.ebit, effRate |
| `components/RatiosPage.tsx:49` | icCurr | `(bs[yr]?.totalEquity ?? 0) + totalDebt(yr) - (bs[yr]?.cash ?? 0)` | bs[yr]?.totalEquity, totalDebt, yr, bs[yr]?.cash |
| `components/RatiosPage.tsx:50` | prev | `bs[yr - 1]` | bs, yr |
| `components/RatiosPage.tsx:52` | debtPrev | `(prev.shortTermDebt ?? 0) + (prev.currentPortionLTD ?? 0) + (prev.longTermDebt ?? 0)` | prev.shortTermDebt, prev.currentPortionLTD, prev.longTermDebt |
| `components/RatiosPage.tsx:53` | icPrev | `(prev.totalEquity ?? 0) + debtPrev - (prev.cash ?? 0)` | prev.totalEquity, debtPrev, prev.cash |
| `components/RatiosPage.tsx:54` | (return) | `sd(nopat, (icCurr + icPrev) / 2)` | sd, nopat, icCurr, icPrev |
| `components/RatiosPage.tsx:63` | (inline) | `(bs[yr]?.totalCurrentAssets ?? 0) - (bs[yr]?.inventory ?? 0)` | bs[yr]?.totalCurrentAssets, bs[yr]?.inventory |
| `components/RatiosPage.tsx:72` | (inline) | `totalDebt(yr) - (bs[yr]?.cash ?? 0)` | totalDebt, yr, bs[yr]?.cash |
| `components/RatiosPage.tsx:79` | debtService | `Math.abs(cf[ci]?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0)` | Math.abs, cf[ci]?.debtRepayment, is[yr]?.interestExpense |
| `components/RatiosPage.tsx:80` | (return) | `debtService !== 0 ? eb / debtService : null` | debtService, eb |
| `components/RatiosPage.tsx:139` | (return) | `(v * 100).toFixed(1) + '%'` | (v*100).toFixed |
| `components/RatiosPage.tsx:149` | (return) | `v >= threshold.good ? 'var(--accent-emerald)' : v >= threshold.good * 0.7 ? 'var(--text-primary)' : 'var(--accent-rose)'` | v, threshold.good |
| `components/RatiosPage.tsx:150` | (return) | `v <= threshold.good ? 'var(--accent-emerald)' : v <= threshold.good * 1.3 ? 'var(--text-primary)' : 'var(--accent-rose)'` | v, threshold.good |
| `components/ScenarioComparisonModal.tsx:29` | lastIS | `r.incomeStatements[r.incomeStatements.length - 1]` | r.incomeStatements, r.incomeStatements.length |
| `components/ScenarioComparisonModal.tsx:30` | lastCF | `r.cashFlowStatements[r.cashFlowStatements.length - 1]` | r.cashFlowStatements, r.cashFlowStatements.length |
| `components/ScenarioComparisonModal.tsx:31` | lastBS | `r.balanceSheets[r.balanceSheets.length - 1]` | r.balanceSheets, r.balanceSheets.length |
| `components/ScenarioComparisonModal.tsx:34` | (return) | `{ name: scenario.name, type: scenario.type, period: lastPeriod, revenue: lastIS.revenue, ebitda: lastIS.ebitda, ebitdaMargin: lastIS.revenue !== 0 ? l` | name, scenario.name, type, scenario.type, period, lastPeriod, revenue |
| `components/ScenarioComparisonModal.tsx:40` | ebitdaMargin | `lastIS.revenue !== 0 ? lastIS.ebitda / lastIS.revenue : 0` | lastIS.revenue, lastIS.ebitda |
| `components/ScenarioComparisonModal.tsx:68` | rows | `[ { label: 'Revenue', values: metrics.map(m => m ? formatCurrency(m.revenue, currency, true) : '[U+00E2][U+20AC][U+201D]'), range: opt && cons ? formatCurrency(opt.revenue -` | label, values, metrics.map, m, formatCurrency, m.revenue, currency |
| `components/ScenarioComparisonModal.tsx:72` | range | `opt && cons ? formatCurrency(opt.revenue - cons.revenue, currency, true) : null` | opt, cons, formatCurrency, opt.revenue, cons.revenue, currency |
| `components/ScenarioComparisonModal.tsx:77` | range | `opt && cons ? formatCurrency(opt.ebitda - cons.ebitda, currency, true) : null` | opt, cons, formatCurrency, opt.ebitda, cons.ebitda, currency |
| `components/ScenarioComparisonModal.tsx:82` | range | `opt && cons ? `${((opt.ebitdaMargin - cons.ebitdaMargin) * 100).toFixed(1)}pp` : null` | opt, cons, ((opt.ebitdaMargin-cons.ebitdaMargin)*100).toFixed |
| `components/ScenarioComparisonModal.tsx:87` | range | `opt && cons ? formatCurrency(opt.netIncome - cons.netIncome, currency, true) : null` | opt, cons, formatCurrency, opt.netIncome, cons.netIncome, currency |
| `components/ScenarioComparisonModal.tsx:92` | range | `opt && cons ? `${((opt.netMargin - cons.netMargin) * 100).toFixed(1)}pp` : null` | opt, cons, ((opt.netMargin-cons.netMargin)*100).toFixed |
| `components/ScenarioComparisonModal.tsx:97` | range | `opt && cons ? formatCurrency(opt.fcf - cons.fcf, currency, true) : null` | opt, cons, formatCurrency, opt.fcf, cons.fcf, currency |
| `components/ScenarioComparisonModal.tsx:102` | range | `opt && cons ? `${(opt.eps - cons.eps).toFixed(2)}` : null` | opt, cons, (opt.eps-cons.eps).toFixed |
| `components/ScenarioComparisonModal.tsx:107` | range | `opt && cons ? formatCurrency(opt.totalAssets - cons.totalAssets, currency, true) : null` | opt, cons, formatCurrency, opt.totalAssets, cons.totalAssets, currency |
| `components/ScenarioComparisonModal.tsx:206` | (inline) | `(def.assumptions.revenueGrowthRate?.[0] ?? 0) * 100` | def.assumptions.revenueGrowthRate |
| `components/ScenarioComparisonModal.tsx:206` | (inline) | `(def.assumptions.revenueGrowthRate?.[4] ?? 0) * 100` | def.assumptions.revenueGrowthRate |
| `components/ScenarioComparisonModal.tsx:210` | (inline) | `(def.assumptions.cogsPercent?.[0] ?? 0) * 100` | def.assumptions.cogsPercent |
| `components/ScenarioComparisonModal.tsx:210` | (inline) | `(def.assumptions.cogsPercent?.[4] ?? 0) * 100` | def.assumptions.cogsPercent |
| `components/ScenarioComparisonModal.tsx:214` | (inline) | `(def.assumptions.sgaPercent?.[0] ?? 0) * 100` | def.assumptions.sgaPercent |
| `components/ScenarioComparisonModal.tsx:214` | (inline) | `(def.assumptions.sgaPercent?.[4] ?? 0) * 100` | def.assumptions.sgaPercent |
| `components/ScenarioComparisonModal.tsx:218` | (inline) | `(def.assumptions.capexPercent?.[0] ?? 0) * 100` | def.assumptions.capexPercent |
| `components/ScenarioComparisonModal.tsx:218` | (inline) | `(def.assumptions.capexPercent?.[4] ?? 0) * 100` | def.assumptions.capexPercent |
| `components/ScenariosPage.tsx:13` | lastIS | `r.incomeStatements[r.incomeStatements.length - 1]` | r.incomeStatements, r.incomeStatements.length |
| `components/ScenariosPage.tsx:14` | lastCF | `r.cashFlowStatements[r.cashFlowStatements.length - 1]` | r.cashFlowStatements, r.cashFlowStatements.length |
| `components/ScenariosPage.tsx:15` | lastBS | `r.balanceSheets[r.balanceSheets.length - 1]` | r.balanceSheets, r.balanceSheets.length |
| `components/ScenariosPage.tsx:18` | cagr | `years > 1 && firstIS.revenue > 0 ? Math.pow(lastIS.revenue / firstIS.revenue, 1 / (years - 1)) - 1 : 0` | years, firstIS.revenue, Math.pow, lastIS.revenue |
| `components/ScenariosPage.tsx:19` | ic | `lastIS.interestExpense !== 0 ? lastIS.ebit / lastIS.interestExpense : 0` | lastIS.interestExpense, lastIS.ebit |
| `components/ScenariosPage.tsx:57` | (inline) | `s.results.incomeStatements.length - 1` | s.results.incomeStatements.length |
| `components/ScenariosPage.tsx:58` | (inline) | `s.results.incomeStatements.length - 1` | s.results.incomeStatements.length |
| `components/ScenariosPage.tsx:59` | (inline) | `s.results.incomeStatements.length - 1` | s.results.incomeStatements.length |
| `components/ScenariosPage.tsx:78` | (inline) | `v / 1000` | v |
| `components/schedules/DebtSchedulePage.tsx:19` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/schedules/DebtSchedulePage.tsx:20` | (return) | `base + sep` | base, sep |
| `components/schedules/DebtSchedulePage.tsx:25` | prev | `i > 0 ? bs[i - 1] : null` | i, bs |
| `components/schedules/DebtSchedulePage.tsx:26` | cfIdx | `i - 1` | i |
| `components/schedules/DebtSchedulePage.tsx:29` | totalDebt | `b.shortTermDebt + b.longTermDebt + b.currentPortionLTD` | b.shortTermDebt, b.longTermDebt, b.currentPortionLTD |
| `components/schedules/DebtSchedulePage.tsx:30` | prevTotalDebt | `prev ? prev.shortTermDebt + prev.longTermDebt + prev.currentPortionLTD : null` | prev, prev.shortTermDebt, prev.longTermDebt, prev.currentPortionLTD |
| `components/schedules/DebtSchedulePage.tsx:31` | avgDebt | `prevTotalDebt !== null ? (totalDebt + prevTotalDebt) / 2 : totalDebt` | prevTotalDebt, totalDebt |
| `components/schedules/DebtSchedulePage.tsx:32` | debtToEbitda | `is[i].ebitda !== 0 ? totalDebt / is[i].ebitda : 0` | is[i].ebitda, totalDebt |
| `components/schedules/DebtSchedulePage.tsx:34` | (return) | `{ period: b.period, // Short-term stDebt: b.shortTermDebt, prevSTDebt: prev?.shortTermDebt ?? null, // Long-term beginLTD: prev?.longTermDebt ?? null,` | period, b.period, stDebt, b.shortTermDebt, prevSTDebt, prev?.shortTermDebt, beginLTD |
| `components/schedules/DebtSchedulePage.tsx:51` | netInterest | `is[i].interestExpense - is[i].interestIncome` | is[i].interestExpense, is[i].interestIncome |
| `components/schedules/DebtSchedulePage.tsx:60` | lastDebt | `debtData[debtData.length - 1]` | debtData, debtData.length |
| `components/schedules/DebtSchedulePage.tsx:106` | (return) | `( <> <tr className="row-subheader"><td colSpan={debtData.length + 1}>{title}</td></tr> {rows.map((row, ri) => ( <tr key={ri} className={row.bold ? 'ro` | tr, className, td, colSpan, debtData.length, title, rows.map |
| `components/schedules/DebtSchedulePage.tsx:126` | (return) | `( <div> <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>[U+064B][U+06BA][U+0688][U+203A][U+00EF][U+00B8][U+0688] Debt Schedule</h1> {/* Summary Cards */} <div className="dashboard-grid" s` | div, h1, style, fontSize, fontWeight, marginBottom, className |
| `components/schedules/DepreciationPage.tsx:18` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/schedules/DepreciationPage.tsx:19` | (return) | `base + sep` | base, sep |
| `components/schedules/DepreciationPage.tsx:24` | prev | `i > 0 ? bs[i - 1] : null` | i, bs |
| `components/schedules/DepreciationPage.tsx:26` | cfIdx | `i - 1` | i |
| `components/schedules/DepreciationPage.tsx:29` | depRate | `b.grossPPE !== 0 ? dep / b.grossPPE : 0` | b.grossPPE, dep |
| `components/schedules/DepreciationPage.tsx:30` | usefulLife | `depRate !== 0 ? 1 / depRate : 0` | depRate |
| `components/schedules/DepreciationPage.tsx:31` | capexPctRev | `is[i].revenue !== 0 ? capex / is[i].revenue : 0` | is[i].revenue, capex |
| `components/schedules/DepreciationPage.tsx:50` | lastPPE | `ppeData[ppeData.length - 1]` | ppeData, ppeData.length |
| `components/schedules/DepreciationPage.tsx:52` | cards | `[ { label: 'Net PP&E', value: formatCurrency(lastPPE.netPPE, currency), icon: '[U+064B][U+06BA][U+0688][U+00AD]', sub: `Gross: ${formatCurrency(lastPPE.endGrossPPE, currency)}` }, ` | label, value, formatCurrency, lastPPE.netPPE, currency, icon, sub |
| `components/schedules/DepreciationPage.tsx:54` | value | ``${(lastPPE.depRate * 100).toFixed(1)}%`` | (lastPPE.depRate*100).toFixed |
| `components/schedules/DepreciationPage.tsx:55` | value | ``${(lastPPE.capexPctRev * 100).toFixed(1)}%`` | (lastPPE.capexPctRev*100).toFixed |
| `components/schedules/DepreciationPage.tsx:107` | (return) | `( <div> <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>[U+064B][U+06BA][U+0688][U+00AD] Depreciation Schedule (PP&E Rollforward)</h1> {/* Summary Cards */} <div cl` | div, h1, style, fontSize, fontWeight, marginBottom, className |
| `components/schedules/WorkingCapitalPage.tsx:18` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/schedules/WorkingCapitalPage.tsx:19` | (return) | `base + sep` | base, sep |
| `components/schedules/WorkingCapitalPage.tsx:24` | prev | `i > 0 ? bs[i - 1] : null` | i, bs |
| `components/schedules/WorkingCapitalPage.tsx:25` | nwc | `(b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.other` | b.accountsReceivable, b.inventory, b.prepaidExpenses, b.otherCurrentAssets, b.accountsPayable, b.accruedExpenses, b.deferredRevenue |
| `components/schedules/WorkingCapitalPage.tsx:27` | prevNwc | `prev ? (prev.accountsReceivable + prev.inventory + prev.prepaidExpenses + prev.otherCurrentAssets) - (prev.accountsPayable + prev.accruedExpenses + pr` | prev, prev.accountsReceivable, prev.inventory, prev.prepaidExpenses, prev.otherCurrentAssets, prev.accountsPayable, prev.accruedExpenses |
| `components/schedules/WorkingCapitalPage.tsx:31` | nwcChange | `prevNwc !== null ? nwc - prevNwc : null` | prevNwc, nwc |
| `components/schedules/WorkingCapitalPage.tsx:32` | nwcPctRev | `is[i].revenue !== 0 ? nwc / is[i].revenue : 0` | is[i].revenue, nwc |
| `components/schedules/WorkingCapitalPage.tsx:54` | lastWC | `wcData[wcData.length - 1]` | wcData, wcData.length |
| `components/schedules/WorkingCapitalPage.tsx:57` | cards | `[ { label: 'Net Working Capital', value: formatCurrency(lastWC.nwc, currency), icon: '[U+064B][U+06BA][U+201C][U+00A6]', sub: `${(lastWC.nwcPctRev * 100).toFixed(1)}% of Revenue` }` | label, value, formatCurrency, lastWC.nwc, currency, icon, sub |
| `components/schedules/WorkingCapitalPage.tsx:58` | sub | ``${(lastWC.nwcPctRev * 100).toFixed(1)}% of Revenue`` | (lastWC.nwcPctRev*100).toFixed |
| `components/schedules/WorkingCapitalPage.tsx:93` | (return) | `( <div> <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>[U+064B][U+06BA][U+201C][U+00A6] Working Capital Schedule</h1> {/* Summary Cards */} <div className="dashboa` | div, h1, style, fontSize, fontWeight, marginBottom, className |
| `components/Sidebar.tsx:58` | (return) | `( <> {/* Hamburger button [U+00E2][U+20AC][U+201D] visible only on mobile (FIX #9) */} <button id="hamburger-menu" className="hamburger-btn" onClick={() => setSidebarOpen(!s` | button, id, className, onClick, setSidebarOpen, sidebarOpen, aria-label |
| `components/statements/BalanceSheetPage.tsx:66` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/statements/BalanceSheetPage.tsx:67` | (return) | `base + sep` | base, sep |
| `components/statements/BalanceSheetPage.tsx:97` | (inline) | `(s.periodType === 'historical' ? 'type-actual' : 'type-estimate') + (i === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '')` | s.periodType, i, lastHistIdx |
| `components/statements/BalanceSheetPage.tsx:119` | (inline) | `sections.length - 1` | sections.length |
| `components/statements/CashFlowPage.tsx:82` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/statements/CashFlowPage.tsx:83` | (return) | `base + sep` | base, sep |
| `components/statements/CashFlowPage.tsx:86` | (return) | `( <div> <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 'clamp(1.3rem, 3vw, 1.6rem)', fontWeight: 700, marginBottom: 20 }}>Cash Flow Statement` | div, h2, style, fontFamily, fontSize, fontWeight, marginBottom |
| `components/statements/IncomeStatementPage.tsx:142` | (return) | `( <> {label.slice(0, idx)} <mark style={{ background: 'rgba(201,168,76,0.3)', color: 'inherit', padding: '0 2px', borderRadius: 2 }}> {label.slice(idx` | label.slice, idx, mark, style, background, color, padding |
| `components/statements/IncomeStatementPage.tsx:156` | sep | `idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : ''` | idx, lastHistIdx |
| `components/statements/IncomeStatementPage.tsx:157` | (return) | `base + sep` | base, sep |
| `components/statements/IncomeStatementPage.tsx:224` | (inline) | `visibleStartIdx + i` | visibleStartIdx, i |
| `components/statements/IncomeStatementPage.tsx:234` | (inline) | `(s.periodType === 'historical' ? 'type-actual' : 'type-estimate') + ((visibleStartIdx + i) === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-l` | s.periodType, visibleStartIdx, i, lastHistIdx |
| `components/statements/IncomeStatementPage.tsx:244` | (return) | `<tr key={rowIdx} className="row-separator"><td colSpan={visibleStatements.length + 1}></td></tr>` | tr, key, rowIdx, className, td, colSpan, visibleStatements.length |
| `components/statements/IncomeStatementPage.tsx:245` | (return) | `<tr key={rowIdx} className="row-subheader"><td colSpan={visibleStatements.length + 1}>{row.label}</td></tr>` | tr, key, rowIdx, className, td, colSpan, visibleStatements.length |
| `components/statements/IncomeStatementPage.tsx:250` | globalColIdx | `visibleStartIdx + si` | visibleStartIdx, si |
| `components/ValidationPage.tsx:18` | period | `results.incomeStatements[periodIdx + 1]?.period ?? `Period ${periodIdx + 1}`` | results.incomeStatements[periodIdx+1]?.period, periodIdx |
| `components/ValidationPage.tsx:28` | failedChecks | `totalChecks - passedChecks` | totalChecks, passedChecks |
| `components/ValidationPage.tsx:29` | passRate | `totalChecks > 0 ? (passedChecks / totalChecks * 100).toFixed(1) : '0'` | totalChecks, (passedChecks/totalChecks*100).toFixed |
| `lib/agents/validation-agent.ts:193` | (return) | `{ auditId, passed, summary, criticalErrors, majorWarnings, advisoryNotes, statistics: { periodsAudited: localChecks.length > 0 ? localChecks[0].findin` | auditId, passed, summary, criticalErrors, majorWarnings, advisoryNotes, statistics |
| `lib/agents/validation-agent.ts:200` | statistics | `{ periodsAudited: localChecks.length > 0 ? localChecks[0].findings.length > 0 ? new Set(localChecks.flatMap(c => c.findings.map(f => f.period))).size ` | periodsAudited, localChecks.length, localChecks[0].findings.length, newSet(localChecks.flatMap(c=>c.findings.map(f=>f.period))).size, scenariosAudited, totalChecks, passed |
| `lib/agents/validation-agent.ts:204` | passed | `totalChecks - criticalErrors.length - majorWarnings.length - advisoryNotes.length` | totalChecks, criticalErrors.length, majorWarnings.length, advisoryNotes.length |
| `lib/agents/validation-agent.ts:219` | durationMs | `Date.now() - startTime` | Date.now, startTime |
| `lib/agents/validation-rules.ts:30` | (return) | `{ rule, severity, period, scenario, field, expected, actual, difference: actual - expected, explanation, fixInstruction, }` | rule, severity, period, scenario, field, expected, actual |
| `lib/agents/validation-rules.ts:33` | difference | `actual - expected` | actual, expected |
| `lib/agents/validation-rules.ts:47` | diff | `Math.abs(period.totalAssets - period.totalLiabilitiesEquity)` | Math.abs, period.totalAssets, period.totalLiabilitiesEquity |
| `lib/agents/validation-rules.ts:76` | diff | `Math.abs(cfPeriod.endingCash - bsPeriod.cash)` | Math.abs, cfPeriod.endingCash, bsPeriod.cash |
| `lib/agents/validation-rules.ts:101` | prev | `is[i - 1]` | is, i |
| `lib/agents/validation-rules.ts:104` | expected | `prev.revenue * (1 + curr.revenueGrowthRate)` | prev.revenue, curr.revenueGrowthRate |
| `lib/agents/validation-rules.ts:105` | (inline) | `curr.revenue - expected` | curr.revenue, expected |
| `lib/agents/validation-rules.ts:110` | (inline) | ``Revenue (${curr.revenue}) [U+00E2][U+2030][U+00A0] prior_revenue [U+0623]- (1 + growth_rate) = ${expected.toFixed(2)}. ` + `Growth rate used: ${(curr.revenueGrowthRate * 100).toFix` | curr.revenue, expected.toFixed, (curr.revenueGrowthRate*100).toFixed |
| `lib/agents/validation-rules.ts:129` | expected | `period.ebt - period.taxExpense` | period.ebt, period.taxExpense |
| `lib/agents/validation-rules.ts:130` | (inline) | `period.netIncome - expected` | period.netIncome, expected |
| `lib/agents/validation-rules.ts:166` | lrCap | `effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50)` | effectivePaidUpCapital, assumptions.legalReserveCap |
| `lib/agents/validation-rules.ts:169` | projIdx | `idx - numHistorical` | idx, numHistorical |
| `lib/agents/validation-rules.ts:175` | expectedEPD | `period.periodType === 'historical' ? period.employeeProfitSharing : Math.max(0, ni * epdRate)` | period.periodType, period.employeeProfitSharing, Math.max, ni, epdRate |
| `lib/agents/validation-rules.ts:177` | (inline) | `period.employeeProfitSharing - expectedEPD` | period.employeeProfitSharing, expectedEPD |
| `lib/agents/validation-rules.ts:181` | (inline) | `epdRate * 100` | epdRate |
| `lib/agents/validation-rules.ts:187` | expectedLRAdd | `period.periodType === 'historical' ? period.legalReserveAddition : (ni <= 0 ? 0 : Math.min(ni * lrRate, Math.max(0, lrCap - cumulativeLR)))` | period.periodType, period.legalReserveAddition, ni, Math.min, lrRate, Math.max, lrCap |
| `lib/agents/validation-rules.ts:189` | (inline) | `period.legalReserveAddition - expectedLRAdd` | period.legalReserveAddition, expectedLRAdd |
| `lib/agents/validation-rules.ts:201` | niAfterEPD | `ni - period.employeeProfitSharing` | ni, period.employeeProfitSharing |
| `lib/agents/validation-rules.ts:202` | expectedDistributable | `niAfterEPD - period.legalReserveAddition` | niAfterEPD, period.legalReserveAddition |
| `lib/agents/validation-rules.ts:203` | (inline) | `period.distributableProfit - expectedDistributable` | period.distributableProfit, expectedDistributable |
| `lib/agents/validation-rules.ts:214` | expectedGrossDivs | `Math.max(0, period.distributableProfit * payoutRate)` | Math.max, period.distributableProfit, payoutRate |
| `lib/agents/validation-rules.ts:215` | (inline) | `period.grossDividends - expectedGrossDivs` | period.grossDividends, expectedGrossDivs |
| `lib/agents/validation-rules.ts:229` | expectedWHT | `period.grossDividends * whtRate` | period.grossDividends, whtRate |
| `lib/agents/validation-rules.ts:230` | (inline) | `period.dividendWHT - expectedWHT` | period.dividendWHT, expectedWHT |
| `lib/agents/validation-rules.ts:234` | (inline) | `whtRate * 100` | whtRate |
| `lib/agents/validation-rules.ts:243` | expectedAddToRE | `period.distributableProfit - period.grossDividends` | period.distributableProfit, period.grossDividends |
| `lib/agents/validation-rules.ts:244` | (inline) | `period.additionToRE - expectedAddToRE` | period.additionToRE, expectedAddToRE |
| `lib/agents/validation-rules.ts:273` | expectedRE | `bs[i - 1].retainedEarnings + is[i].additionToRE` | bs[i-1].retainedEarnings, is[i].additionToRE |
| `lib/agents/validation-rules.ts:274` | diff | `Math.abs(bs[i].retainedEarnings - expectedRE)` | Math.abs, bs[i].retainedEarnings, expectedRE |
| `lib/agents/validation-rules.ts:280` | (inline) | `i - 1` | i |
| `lib/agents/validation-rules.ts:298` | expected | `Math.max(0, period.ebt * period.taxRate)` | Math.max, period.ebt, period.taxRate |
| `lib/agents/validation-rules.ts:299` | (inline) | `period.taxExpense - expected` | period.taxExpense, expected |
| `lib/agents/validation-rules.ts:322` | expected | `cfo + cfi + cff` | cfo, cfi, cff |
| `lib/agents/validation-rules.ts:326` | tolerance | `Math.max(TOL, 1e-6 * (Math.abs(cfo) + Math.abs(cfi) + Math.abs(cff)))` | Math.max, TOL, Math.abs, cfo, cfi, cff |
| `lib/agents/validation-rules.ts:327` | (inline) | `period.netChangeInCash - expected` | period.netChangeInCash, expected |
| `lib/agents/validation-rules.ts:350` | expected | `period.beginningCash + period.netChangeInCash` | period.beginningCash, period.netChangeInCash |
| `lib/agents/validation-rules.ts:351` | tolerance | `Math.max(TOL, 1e-6 * (Math.abs(period.beginningCash) + Math.abs(period.netChangeInCash)))` | Math.max, TOL, Math.abs, period.beginningCash, period.netChangeInCash |
| `lib/agents/validation-rules.ts:352` | (inline) | `period.endingCash - expected` | period.endingCash, expected |
| `lib/agents/validation-rules.ts:375` | expected | `period.ebit * (1 - period.taxRate)` | period.ebit, period.taxRate |
| `lib/agents/validation-rules.ts:376` | (inline) | `period.nopat - expected` | period.nopat, expected |
| `lib/agents/validation-rules.ts:397` | expected | `period.ebit + period.depreciation + period.amortization` | period.ebit, period.depreciation, period.amortization |
| `lib/agents/validation-rules.ts:398` | (inline) | `period.ebitda - expected` | period.ebitda, expected |
| `lib/agents/validation-rules.ts:429` | effectiveTaxRate | `isp.ebt > 0 ? isp.taxExpense / isp.ebt : isp.taxRate` | isp.ebt, isp.taxExpense, isp.taxRate |
| `lib/agents/validation-rules.ts:430` | nopat | `isp.ebit * (1 - effectiveTaxRate)` | isp.ebit, effectiveTaxRate |
| `lib/agents/validation-rules.ts:431` | debtCurr | `bsp.shortTermDebt + bsp.longTermDebt + bsp.currentPortionLTD` | bsp.shortTermDebt, bsp.longTermDebt, bsp.currentPortionLTD |
| `lib/agents/validation-rules.ts:432` | icCurr | `bsp.totalEquity + debtCurr - bsp.cash` | bsp.totalEquity, debtCurr, bsp.cash |
| `lib/agents/validation-rules.ts:435` | prevBs | `bs[i - 1]` | bs, i |
| `lib/agents/validation-rules.ts:436` | debtPrev | `prevBs.shortTermDebt + prevBs.longTermDebt + prevBs.currentPortionLTD` | prevBs.shortTermDebt, prevBs.longTermDebt, prevBs.currentPortionLTD |
| `lib/agents/validation-rules.ts:437` | icPrev | `prevBs.totalEquity + debtPrev - prevBs.cash` | prevBs.totalEquity, debtPrev, prevBs.cash |
| `lib/agents/validation-rules.ts:438` | avgIC | `(icCurr + icPrev) / 2` | icCurr, icPrev |
| `lib/agents/validation-rules.ts:441` | expectedROIC | `nopat / avgIC` | nopat, avgIC |
| `lib/agents/validation-rules.ts:442` | (inline) | `r.roic - expectedROIC` | r.roic, expectedROIC |
| `lib/agents/validation-rules.ts:470` | prevEquity | `i > 0 ? bs[i - 1].totalEquity : bsp.totalEquity` | i, bs[i-1].totalEquity, bsp.totalEquity |
| `lib/agents/validation-rules.ts:471` | avgEquity | `(prevEquity + bsp.totalEquity) / 2` | prevEquity, bsp.totalEquity |
| `lib/agents/validation-rules.ts:472` | expected | `avgEquity !== 0 ? is[i].netIncome / avgEquity : 0` | avgEquity, is[i].netIncome |
| `lib/agents/validation-rules.ts:473` | (inline) | `r.roe - expected` | r.roe, expected |
| `lib/agents/validation-rules.ts:499` | prevAssets | `i > 0 ? bs[i - 1].totalAssets : bsp.totalAssets` | i, bs[i-1].totalAssets, bsp.totalAssets |
| `lib/agents/validation-rules.ts:500` | avgAssets | `(prevAssets + bsp.totalAssets) / 2` | prevAssets, bsp.totalAssets |
| `lib/agents/validation-rules.ts:501` | expected | `avgAssets !== 0 ? is[i].netIncome / avgAssets : 0` | avgAssets, is[i].netIncome |
| `lib/agents/validation-rules.ts:502` | (inline) | `r.roa - expected` | r.roa, expected |
| `lib/agents/validation-rules.ts:568` | lrCap | `effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50)` | effectivePaidUpCapital, assumptions.legalReserveCap |
| `lib/agents/validation-rules.ts:571` | (inline) | `lrCap + 1.0` | lrCap |
| `lib/agents/validation-rules.ts:593` | (inline) | `projected[i - 1].revenueGrowthRate + 0.001` | projected[i-1].revenueGrowthRate |
| `lib/agents/validation-rules.ts:596` | (inline) | `i - 1` | i |
| `lib/agents/validation-rules.ts:597` | (inline) | ``Revenue growth accelerated from ${(projected[i - 1].revenueGrowthRate * 100).toFixed(1)}% ` + `to ${(projected[i].revenueGrowthRate * 100).toFixed(1)` | (projected[i-1].revenueGrowthRate*100).toFixed, (projected[i].revenueGrowthRate*100).toFixed |
| `lib/engines/balance-sheet.ts:24` | period | ``${assumptions.startYear + yr}E`` | assumptions.startYear, yr |
| `lib/engines/balance-sheet.ts:32` | accountsReceivable | `(dso * incomeStatement.revenue) / 365` | dso, incomeStatement.revenue |
| `lib/engines/balance-sheet.ts:36` | inventory | `(dio * incomeStatement.cogs) / 365` | dio, incomeStatement.cogs |
| `lib/engines/balance-sheet.ts:39` | prepaidExpenses | `incomeStatement.revenue * (assumptions.prepaidPercent[yr] ?? 0.01)` | incomeStatement.revenue, assumptions.prepaidPercent, yr |
| `lib/engines/balance-sheet.ts:42` | totalCurrentAssets | `cash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets` | cash, accountsReceivable, inventory, prepaidExpenses, otherCurrentAssets |
| `lib/engines/balance-sheet.ts:46` | capex | `incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05)` | incomeStatement.revenue, assumptions.capexPercent, yr |
| `lib/engines/balance-sheet.ts:47` | grossPPE | `prev.grossPPE + capex` | prev.grossPPE, capex |
| `lib/engines/balance-sheet.ts:50` | accumulatedDepreciation | `prev.accumulatedDepreciation + incomeStatement.depreciation` | prev.accumulatedDepreciation, incomeStatement.depreciation |
| `lib/engines/balance-sheet.ts:51` | netPPE | `grossPPE - accumulatedDepreciation` | grossPPE, accumulatedDepreciation |
| `lib/engines/balance-sheet.ts:54` | intangiblesCapEx | `(assumptions.intangiblesCapExPercent?.[yr] ?? 0) * incomeStatement.revenue` | assumptions.intangiblesCapExPercent, yr, incomeStatement.revenue |
| `lib/engines/balance-sheet.ts:55` | intangibles | `Math.max(0, prev.intangibles + intangiblesCapEx - incomeStatement.amortization)` | Math.max, prev.intangibles, intangiblesCapEx, incomeStatement.amortization |
| `lib/engines/balance-sheet.ts:61` | totalNonCurrentAssets | `netPPE + intangibles + goodwill + otherLongTermAssets` | netPPE, intangibles, goodwill, otherLongTermAssets |
| `lib/engines/balance-sheet.ts:66` | vatReceivable | `enableVAT ? capex * vatRate : 0` | enableVAT, capex, vatRate |
| `lib/engines/balance-sheet.ts:68` | totalCurrentAssetsRaw | `cash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets + vatReceivable` | cash, accountsReceivable, inventory, prepaidExpenses, otherCurrentAssets, vatReceivable |
| `lib/engines/balance-sheet.ts:69` | totalAssets | `totalCurrentAssetsRaw + totalNonCurrentAssets` | totalCurrentAssetsRaw, totalNonCurrentAssets |
| `lib/engines/balance-sheet.ts:73` | accountsPayable | `(dpo * incomeStatement.cogs) / 365` | dpo, incomeStatement.cogs |
| `lib/engines/balance-sheet.ts:75` | accruedExpenses | `incomeStatement.revenue * (assumptions.accruedExpPercent[yr] ?? 0.03)` | incomeStatement.revenue, assumptions.accruedExpPercent, yr |
| `lib/engines/balance-sheet.ts:76` | deferredRevenue | `incomeStatement.revenue * (assumptions.deferredRevPercent[yr] ?? 0.02)` | incomeStatement.revenue, assumptions.deferredRevPercent, yr |
| `lib/engines/balance-sheet.ts:83` | vatPayable | `enableVAT ? Math.max(0, incomeStatement.revenue * vatRate - capex * vatRate) : 0` | enableVAT, Math.max, incomeStatement.revenue, vatRate, capex |
| `lib/engines/balance-sheet.ts:87` | totalCurrentLiabilities | `accountsPayable + accruedExpenses + shortTermDebt + currentPortionLTD + deferredRevenue + otherCurrentLiabilities + vatPayable` | accountsPayable, accruedExpenses, shortTermDebt, currentPortionLTD, deferredRevenue, otherCurrentLiabilities, vatPayable |
| `lib/engines/balance-sheet.ts:103` | ltDebtRepayment | `yr === projYears - 1 ? prev.longTermDebt : 0` | yr, projYears, prev.longTermDebt |
| `lib/engines/balance-sheet.ts:106` | ltDebtRepayment | `amortYears > 0 ? prev.longTermDebt / amortYears : 0` | amortYears, prev.longTermDebt |
| `lib/engines/balance-sheet.ts:113` | longTermDebt | `Math.max(0, prev.longTermDebt + ltDebtIssuance - ltDebtRepayment)` | Math.max, prev.longTermDebt, ltDebtIssuance, ltDebtRepayment |
| `lib/engines/balance-sheet.ts:122` | endOfServiceProvision | `Math.max(0, (prev.endOfServiceProvision ?? 0) + eosAddition - eosPayments)` | Math.max, prev.endOfServiceProvision, eosAddition, eosPayments |
| `lib/engines/balance-sheet.ts:124` | totalNonCurrentLiabilities | `longTermDebt + deferredTaxLiabilities + otherLongTermLiabilities + endOfServiceProvision` | longTermDebt, deferredTaxLiabilities, otherLongTermLiabilities, endOfServiceProvision |
| `lib/engines/balance-sheet.ts:125` | totalLiabilities | `totalCurrentLiabilities + totalNonCurrentLiabilities` | totalCurrentLiabilities, totalNonCurrentLiabilities |
| `lib/engines/balance-sheet.ts:129` | additionalPaidInCapital | `prev.additionalPaidInCapital + (assumptions.equityIssuance[yr] ?? 0) + (assumptions.stockBasedCompAmount[yr] ?? 0)` | prev.additionalPaidInCapital, assumptions.equityIssuance, yr, assumptions.stockBasedCompAmount |
| `lib/engines/balance-sheet.ts:134` | legalReserve | `priorLegalReserve + legalReserveAddition` | priorLegalReserve, legalReserveAddition |
| `lib/engines/balance-sheet.ts:138` | retainedEarnings | `prev.retainedEarnings + incomeStatement.additionToRE` | prev.retainedEarnings, incomeStatement.additionToRE |
| `lib/engines/balance-sheet.ts:142` | treasuryStock | `prev.treasuryStock - shareRepurchases` | prev.treasuryStock, shareRepurchases |
| `lib/engines/balance-sheet.ts:146` | totalEquity | `commonStock + additionalPaidInCapital + legalReserve + retainedEarnings + treasuryStock + otherComprehensiveIncome` | commonStock, additionalPaidInCapital, legalReserve, retainedEarnings, treasuryStock, otherComprehensiveIncome |
| `lib/engines/balance-sheet.ts:149` | totalLiabilitiesEquity | `totalLiabilities + totalEquity` | totalLiabilities, totalEquity |
| `lib/engines/balance-sheet.ts:157` | balanceDifference | `finalTotalAssets - totalLiabilitiesEquity` | finalTotalAssets, totalLiabilitiesEquity |
| `lib/engines/balance-sheet.ts:235` | (return) | `beginningTotalDebt * interestRate` | beginningTotalDebt, interestRate |
| `lib/engines/balance-sheet.ts:246` | avgCash | `(beginningCash + endingCash) / 2` | beginningCash, endingCash |
| `lib/engines/balance-sheet.ts:247` | (return) | `avgCash * interestIncomeRate` | avgCash, interestIncomeRate |
| `lib/engines/balance-sheet.ts:281` | netPPE | `data.grossPPE[i] - data.accumulatedDepreciation[i]` | data.grossPPE, i, data.accumulatedDepreciation |
| `lib/engines/balance-sheet.ts:282` | totalCurrentAssets | `data.cash[i] + data.accountsReceivable[i] + data.inventory[i] + data.prepaidExpenses[i] + data.otherCurrentAssets[i]` | data.cash, i, data.accountsReceivable, data.inventory, data.prepaidExpenses, data.otherCurrentAssets |
| `lib/engines/balance-sheet.ts:284` | totalNonCurrentAssets | `netPPE + data.intangibles[i] + data.goodwill[i] + data.otherLongTermAssets[i]` | netPPE, data.intangibles, i, data.goodwill, data.otherLongTermAssets |
| `lib/engines/balance-sheet.ts:285` | totalAssets | `totalCurrentAssets + totalNonCurrentAssets` | totalCurrentAssets, totalNonCurrentAssets |
| `lib/engines/balance-sheet.ts:287` | totalCurrentLiabilities | `data.accountsPayable[i] + data.accruedExpenses[i] + data.shortTermDebt[i] + data.currentPortionLTD[i] + data.deferredRevenue[i] + data.otherCurrentLia` | data.accountsPayable, i, data.accruedExpenses, data.shortTermDebt, data.currentPortionLTD, data.deferredRevenue, data.otherCurrentLiabilities |
| `lib/engines/balance-sheet.ts:290` | totalNonCurrentLiabilities | `data.longTermDebt[i] + data.deferredTaxLiabilities[i] + data.otherLongTermLiabilities[i]` | data.longTermDebt, i, data.deferredTaxLiabilities, data.otherLongTermLiabilities |
| `lib/engines/balance-sheet.ts:292` | totalLiabilities | `totalCurrentLiabilities + totalNonCurrentLiabilities` | totalCurrentLiabilities, totalNonCurrentLiabilities |
| `lib/engines/balance-sheet.ts:294` | totalEquity | `data.commonStock[i] + data.additionalPaidInCapital[i] + data.retainedEarnings[i] + data.treasuryStock[i] + data.otherComprehensiveIncome[i]` | data.commonStock, i, data.additionalPaidInCapital, data.retainedEarnings, data.treasuryStock, data.otherComprehensiveIncome |
| `lib/engines/balance-sheet.ts:296` | totalLiabilitiesEquity | `totalLiabilities + totalEquity` | totalLiabilities, totalEquity |
| `lib/engines/balance-sheet.ts:297` | balanceDifference | `totalAssets - totalLiabilitiesEquity` | totalAssets, totalLiabilitiesEquity |
| `lib/engines/cash-flow.ts:19` | period | ``${assumptions.startYear + yr}E`` | assumptions.startYear, yr |
| `lib/engines/cash-flow.ts:30` | deferredTaxes | `curr.deferredTaxLiabilities - prev.deferredTaxLiabilities` | curr.deferredTaxLiabilities, prev.deferredTaxLiabilities |
| `lib/engines/cash-flow.ts:31` | changeInOtherLTLiabilities | `curr.otherLongTermLiabilities - prev.otherLongTermLiabilities` | curr.otherLongTermLiabilities, prev.otherLongTermLiabilities |
| `lib/engines/cash-flow.ts:32` | changeInOCI | `curr.otherComprehensiveIncome - prev.otherComprehensiveIncome` | curr.otherComprehensiveIncome, prev.otherComprehensiveIncome |
| `lib/engines/cash-flow.ts:33` | endOfServiceProvisionAddition | `(curr.endOfServiceProvision ?? 0) - (prev.endOfServiceProvision ?? 0)` | curr.endOfServiceProvision, prev.endOfServiceProvision |
| `lib/engines/cash-flow.ts:36` | changeInAR | `-(curr.accountsReceivable - prev.accountsReceivable)` | curr.accountsReceivable, prev.accountsReceivable |
| `lib/engines/cash-flow.ts:37` | changeInInventory | `-(curr.inventory - prev.inventory)` | curr.inventory, prev.inventory |
| `lib/engines/cash-flow.ts:38` | changeInPrepaid | `-(curr.prepaidExpenses - prev.prepaidExpenses)` | curr.prepaidExpenses, prev.prepaidExpenses |
| `lib/engines/cash-flow.ts:39` | changeInAP | `curr.accountsPayable - prev.accountsPayable` | curr.accountsPayable, prev.accountsPayable |
| `lib/engines/cash-flow.ts:40` | changeInAccruedExp | `curr.accruedExpenses - prev.accruedExpenses` | curr.accruedExpenses, prev.accruedExpenses |
| `lib/engines/cash-flow.ts:41` | changeInDeferredRev | `curr.deferredRevenue - prev.deferredRevenue` | curr.deferredRevenue, prev.deferredRevenue |
| `lib/engines/cash-flow.ts:44` | changeInVATReceivable | `-((curr.vatReceivable ?? 0) - (prev.vatReceivable ?? 0))` | curr.vatReceivable, prev.vatReceivable |
| `lib/engines/cash-flow.ts:45` | changeInVATPayable | `(curr.vatPayable ?? 0) - (prev.vatPayable ?? 0)` | curr.vatPayable, prev.vatPayable |
| `lib/engines/cash-flow.ts:47` | totalWorkingCapitalChange | `changeInAR + changeInInventory + changeInPrepaid + changeInAP + changeInAccruedExp + changeInDeferredRev + changeInVATReceivable + changeInVATPayable` | changeInAR, changeInInventory, changeInPrepaid, changeInAP, changeInAccruedExp, changeInDeferredRev, changeInVATReceivable |
| `lib/engines/cash-flow.ts:51` | cashFromOperations | `netIncome + depreciation + amortization + stockBasedComp + deferredTaxes + changeInOtherLTLiabilities + changeInOCI + endOfServiceProvisionAddition + ` | netIncome, depreciation, amortization, stockBasedComp, deferredTaxes, changeInOtherLTLiabilities, changeInOCI |
| `lib/engines/cash-flow.ts:56` | capex | `-(incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05))` | incomeStatement.revenue, assumptions.capexPercent, yr |
| `lib/engines/cash-flow.ts:59` | purchaseOfIntangibles | `-(incomeStatement.revenue * intangiblesCapExPct)` | incomeStatement.revenue, intangiblesCapExPct |
| `lib/engines/cash-flow.ts:61` | changeInOtherLongTermAssets | `-(curr.otherLongTermAssets - prev.otherLongTermAssets)` | curr.otherLongTermAssets, prev.otherLongTermAssets |
| `lib/engines/cash-flow.ts:62` | changeInGoodwill | `-(curr.goodwill - prev.goodwill)` | curr.goodwill, prev.goodwill |
| `lib/engines/cash-flow.ts:68` | cashFromInvesting | `capex + purchaseOfIntangibles + changeInOtherLongTermAssets + changeInGoodwill + acquisitions + assetSales + investmentPurchases + investmentSales` | capex, purchaseOfIntangibles, changeInOtherLongTermAssets, changeInGoodwill, acquisitions, assetSales, investmentPurchases |
| `lib/engines/cash-flow.ts:84` | scheduledRepayment | `yr === projYears - 1 ? prev.longTermDebt : 0` | yr, projYears, prev.longTermDebt |
| `lib/engines/cash-flow.ts:87` | scheduledRepayment | `amortYears > 0 ? prev.longTermDebt / amortYears : 0` | amortYears, prev.longTermDebt |
| `lib/engines/cash-flow.ts:110` | cashFromFinancing | `debtIssuance + debtRepayment + equityIssuance + dividendsPaid + employeeProfitSharingPaid + shareRepurchases` | debtIssuance, debtRepayment, equityIssuance, dividendsPaid, employeeProfitSharingPaid, shareRepurchases |
| `lib/engines/cash-flow.ts:114` | netChangeInCash | `cashFromOperations + cashFromInvesting + cashFromFinancing` | cashFromOperations, cashFromInvesting, cashFromFinancing |
| `lib/engines/cash-flow.ts:116` | endingCash | `beginningCash + netChangeInCash` | beginningCash, netChangeInCash |
| `lib/engines/cash-flow.ts:119` | freeCashFlow | `cashFromOperations + capex` | cashFromOperations, capex |
| `lib/engines/cash-flow.ts:122` | reconciles | `Math.abs(endingCash - curr.cash) < 0.01` | Math.abs, endingCash, curr.cash |
| `lib/engines/cash-flow.ts:180` | prev | `balanceSheets[i - 1]` | balanceSheets, i |
| `lib/engines/cash-flow.ts:183` | changeInAR | `-(curr.accountsReceivable - prev.accountsReceivable)` | curr.accountsReceivable, prev.accountsReceivable |
| `lib/engines/cash-flow.ts:184` | changeInInventory | `-(curr.inventory - prev.inventory)` | curr.inventory, prev.inventory |
| `lib/engines/cash-flow.ts:185` | changeInPrepaid | `-(curr.prepaidExpenses - prev.prepaidExpenses)` | curr.prepaidExpenses, prev.prepaidExpenses |
| `lib/engines/cash-flow.ts:186` | changeInAP | `curr.accountsPayable - prev.accountsPayable` | curr.accountsPayable, prev.accountsPayable |
| `lib/engines/cash-flow.ts:187` | changeInAccruedExp | `curr.accruedExpenses - prev.accruedExpenses` | curr.accruedExpenses, prev.accruedExpenses |
| `lib/engines/cash-flow.ts:188` | changeInDeferredRev | `curr.deferredRevenue - prev.deferredRevenue` | curr.deferredRevenue, prev.deferredRevenue |
| `lib/engines/cash-flow.ts:189` | changeInVATReceivable | `-((curr.vatReceivable ?? 0) - (prev.vatReceivable ?? 0))` | curr.vatReceivable, prev.vatReceivable |
| `lib/engines/cash-flow.ts:190` | changeInVATPayable | `(curr.vatPayable ?? 0) - (prev.vatPayable ?? 0)` | curr.vatPayable, prev.vatPayable |
| `lib/engines/cash-flow.ts:192` | changeInOtherCurrentAssets | `-(curr.otherCurrentAssets - prev.otherCurrentAssets)` | curr.otherCurrentAssets, prev.otherCurrentAssets |
| `lib/engines/cash-flow.ts:193` | changeInOtherCurrentLiabilities | `curr.otherCurrentLiabilities - prev.otherCurrentLiabilities` | curr.otherCurrentLiabilities, prev.otherCurrentLiabilities |
| `lib/engines/cash-flow.ts:194` | changeInOtherLTLiabilities | `curr.otherLongTermLiabilities - prev.otherLongTermLiabilities` | curr.otherLongTermLiabilities, prev.otherLongTermLiabilities |
| `lib/engines/cash-flow.ts:195` | changeInDeferredTax | `curr.deferredTaxLiabilities - prev.deferredTaxLiabilities` | curr.deferredTaxLiabilities, prev.deferredTaxLiabilities |
| `lib/engines/cash-flow.ts:196` | changeInOCI | `curr.otherComprehensiveIncome - prev.otherComprehensiveIncome` | curr.otherComprehensiveIncome, prev.otherComprehensiveIncome |
| `lib/engines/cash-flow.ts:197` | endOfServiceProvisionAddition | `(curr.endOfServiceProvision ?? 0) - (prev.endOfServiceProvision ?? 0)` | curr.endOfServiceProvision, prev.endOfServiceProvision |
| `lib/engines/cash-flow.ts:198` | totalWorkingCapitalChange | `changeInAR + changeInInventory + changeInPrepaid + changeInAP + changeInAccruedExp + changeInDeferredRev + changeInVATReceivable + changeInVATPayable ` | changeInAR, changeInInventory, changeInPrepaid, changeInAP, changeInAccruedExp, changeInDeferredRev, changeInVATReceivable |
| `lib/engines/cash-flow.ts:208` | cashFromOperations | `is.netIncome + is.depreciation + is.amortization + stockBasedComp + changeInDeferredTax + changeInOtherLTLiabilities + changeInOCI + endOfServiceProvi` | is.netIncome, is.depreciation, is.amortization, stockBasedComp, changeInDeferredTax, changeInOtherLTLiabilities, changeInOCI |
| `lib/engines/cash-flow.ts:213` | capex | `-(curr.grossPPE - prev.grossPPE)` | curr.grossPPE, prev.grossPPE |
| `lib/engines/cash-flow.ts:215` | purchaseOfIntangibles | `-((curr.intangibles + is.amortization) - prev.intangibles)` | curr.intangibles, is.amortization, prev.intangibles |
| `lib/engines/cash-flow.ts:216` | changeInGoodwill | `-(curr.goodwill - prev.goodwill)` | curr.goodwill, prev.goodwill |
| `lib/engines/cash-flow.ts:217` | changeInOtherLongTermAssets | `-(curr.otherLongTermAssets - prev.otherLongTermAssets)` | curr.otherLongTermAssets, prev.otherLongTermAssets |
| `lib/engines/cash-flow.ts:218` | cashFromInvesting | `capex + purchaseOfIntangibles + changeInGoodwill + changeInOtherLongTermAssets` | capex, purchaseOfIntangibles, changeInGoodwill, changeInOtherLongTermAssets |
| `lib/engines/cash-flow.ts:223` | stdChange | `curr.shortTermDebt - prev.shortTermDebt` | curr.shortTermDebt, prev.shortTermDebt |
| `lib/engines/cash-flow.ts:224` | ltdChange | `(curr.longTermDebt + curr.currentPortionLTD) - (prev.longTermDebt + prev.currentPortionLTD)` | curr.longTermDebt, curr.currentPortionLTD, prev.longTermDebt, prev.currentPortionLTD |
| `lib/engines/cash-flow.ts:226` | debtIssuance | `Math.max(0, ltdChange) + Math.max(0, stdChange)` | Math.max, ltdChange, stdChange |
| `lib/engines/cash-flow.ts:227` | debtRepayment | `-Math.max(0, -ltdChange) - Math.max(0, -stdChange)` | Math.max, ltdChange, stdChange |
| `lib/engines/cash-flow.ts:231` | dividendsPaid | `-((prev.retainedEarnings + is.netIncome) - curr.retainedEarnings)` | prev.retainedEarnings, is.netIncome, curr.retainedEarnings |
| `lib/engines/cash-flow.ts:236` | prevEquityPaid | `prev.additionalPaidInCapital + prev.commonStock` | prev.additionalPaidInCapital, prev.commonStock |
| `lib/engines/cash-flow.ts:237` | currEquityPaid | `curr.additionalPaidInCapital + curr.commonStock` | curr.additionalPaidInCapital, curr.commonStock |
| `lib/engines/cash-flow.ts:241` | equityIssuance | `(currEquityPaid - prevEquityPaid) - historicalSBC` | currEquityPaid, prevEquityPaid, historicalSBC |
| `lib/engines/cash-flow.ts:243` | shareRepurchases | `-(prev.treasuryStock - curr.treasuryStock)` | prev.treasuryStock, curr.treasuryStock |
| `lib/engines/cash-flow.ts:245` | cashFromFinancing | `debtIssuance + debtRepayment + dividendsPaid + equityIssuance + shareRepurchases` | debtIssuance, debtRepayment, dividendsPaid, equityIssuance, shareRepurchases |
| `lib/engines/cash-flow.ts:248` | netChangeInCash | `curr.cash - prev.cash` | curr.cash, prev.cash |
| `lib/engines/cash-flow.ts:251` | freeCashFlow | `cashFromOperations + capex` | cashFromOperations, capex |
| `lib/engines/cash-flow.ts:252` | reconciles | `Math.abs((beginningCash + (cashFromOperations + cashFromInvesting + cashFromFinancing)) - endingCash) < 0.01` | Math.abs, beginningCash, cashFromOperations, cashFromInvesting, cashFromFinancing, endingCash |
| `lib/engines/circular-resolver.ts:57` | previousNWC | `(previousBalanceSheet.accountsReceivable + previousBalanceSheet.inventory) - (previousBalanceSheet.accountsPayable)` | previousBalanceSheet.accountsReceivable, previousBalanceSheet.inventory, previousBalanceSheet.accountsPayable |
| `lib/engines/circular-resolver.ts:61` | capex | `previousIncomeStatement.revenue * (1 + (assumptions.revenueGrowthRate[yearIndex] ?? 0)) * (assumptions.capexPercent[yearIndex] ?? 0.05)` | previousIncomeStatement.revenue, assumptions.revenueGrowthRate, yearIndex, assumptions.capexPercent |
| `lib/engines/circular-resolver.ts:66` | priorTotalDebt | `previousBalanceSheet.shortTermDebt + previousBalanceSheet.longTermDebt + previousBalanceSheet.currentPortionLTD` | previousBalanceSheet.shortTermDebt, previousBalanceSheet.longTermDebt, previousBalanceSheet.currentPortionLTD |
| `lib/engines/circular-resolver.ts:76` | effectiveDebtRate | `cbeProj + spread + 0.005` | cbeProj, spread |
| `lib/engines/circular-resolver.ts:77` | effectiveCashRate | `cbeProj - 0.005` | cbeProj |
| `lib/engines/circular-resolver.ts:112` | currentNWC | `(balanceSheet.accountsReceivable + balanceSheet.inventory) - (balanceSheet.accountsPayable)` | balanceSheet.accountsReceivable, balanceSheet.inventory, balanceSheet.accountsPayable |
| `lib/engines/circular-resolver.ts:151` | beginDebt | `previousBalanceSheet.shortTermDebt + previousBalanceSheet.longTermDebt + previousBalanceSheet.currentPortionLTD` | previousBalanceSheet.shortTermDebt, previousBalanceSheet.longTermDebt, previousBalanceSheet.currentPortionLTD |
| `lib/engines/circular-resolver.ts:152` | endDebt | `updatedBalanceSheet.shortTermDebt + updatedBalanceSheet.longTermDebt + updatedBalanceSheet.currentPortionLTD` | updatedBalanceSheet.shortTermDebt, updatedBalanceSheet.longTermDebt, updatedBalanceSheet.currentPortionLTD |
| `lib/engines/circular-resolver.ts:168` | finalDelta | `Math.abs(cashFlow.endingCash - previousEndingCash)` | Math.abs, cashFlow.endingCash, previousEndingCash |
| `lib/engines/circular-resolver.ts:205` | assetsBalance | `Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesEquity) < 0.01` | Math.abs, balanceSheet.totalAssets, balanceSheet.totalLiabilitiesEquity |
| `lib/engines/circular-resolver.ts:211` | difference | `balanceSheet.totalAssets - balanceSheet.totalLiabilitiesEquity` | balanceSheet.totalAssets, balanceSheet.totalLiabilitiesEquity |
| `lib/engines/circular-resolver.ts:215` | cashTies | `Math.abs(balanceSheet.cash - cashFlow.endingCash) < 0.01` | Math.abs, balanceSheet.cash, cashFlow.endingCash |
| `lib/engines/circular-resolver.ts:221` | difference | `balanceSheet.cash - cashFlow.endingCash` | balanceSheet.cash, cashFlow.endingCash |
| `lib/engines/circular-resolver.ts:225` | netIncomeFlows | `Math.abs(incomeStatement.netIncome - cashFlow.netIncome) < 0.01` | Math.abs, incomeStatement.netIncome, cashFlow.netIncome |
| `lib/engines/circular-resolver.ts:231` | difference | `incomeStatement.netIncome - cashFlow.netIncome` | incomeStatement.netIncome, cashFlow.netIncome |
| `lib/engines/circular-resolver.ts:235` | expectedGrossPPE | `previousBalanceSheet.grossPPE + Math.abs(cashFlow.capex)` | previousBalanceSheet.grossPPE, Math.abs, cashFlow.capex |
| `lib/engines/circular-resolver.ts:236` | ppeTies | `Math.abs(balanceSheet.grossPPE - expectedGrossPPE) < 0.01` | Math.abs, balanceSheet.grossPPE, expectedGrossPPE |
| `lib/engines/circular-resolver.ts:242` | difference | `balanceSheet.grossPPE - expectedGrossPPE` | balanceSheet.grossPPE, expectedGrossPPE |
| `lib/engines/circular-resolver.ts:246` | expectedRE | `previousBalanceSheet.retainedEarnings + incomeStatement.additionToRE` | previousBalanceSheet.retainedEarnings, incomeStatement.additionToRE |
| `lib/engines/circular-resolver.ts:247` | retainedEarningsFlows | `Math.abs(balanceSheet.retainedEarnings - expectedRE) < 0.01` | Math.abs, balanceSheet.retainedEarnings, expectedRE |
| `lib/engines/circular-resolver.ts:253` | difference | `balanceSheet.retainedEarnings - expectedRE` | balanceSheet.retainedEarnings, expectedRE |
| `lib/engines/circular-resolver.ts:257` | expectedLTD | `previousBalanceSheet.longTermDebt + cashFlow.debtIssuance + cashFlow.debtRepayment` | previousBalanceSheet.longTermDebt, cashFlow.debtIssuance, cashFlow.debtRepayment |
| `lib/engines/circular-resolver.ts:258` | debtTies | `Math.abs(balanceSheet.longTermDebt - expectedLTD) < 0.01` | Math.abs, balanceSheet.longTermDebt, expectedLTD |
| `lib/engines/circular-resolver.ts:264` | difference | `balanceSheet.longTermDebt - expectedLTD` | balanceSheet.longTermDebt, expectedLTD |
| `lib/engines/circular-resolver.ts:268` | cfNetChange | `cashFlow.cashFromOperations + cashFlow.cashFromInvesting + cashFlow.cashFromFinancing` | cashFlow.cashFromOperations, cashFlow.cashFromInvesting, cashFlow.cashFromFinancing |
| `lib/engines/circular-resolver.ts:269` | expectedNetChange | `cashFlow.endingCash - cashFlow.beginningCash` | cashFlow.endingCash, cashFlow.beginningCash |
| `lib/engines/circular-resolver.ts:270` | cfReconciles | `Math.abs(cfNetChange - expectedNetChange) < 0.01` | Math.abs, cfNetChange, expectedNetChange |
| `lib/engines/circular-resolver.ts:276` | difference | `cfNetChange - expectedNetChange` | cfNetChange, expectedNetChange |
| `lib/engines/circular-resolver.ts:280` | arChange | `balanceSheet.accountsReceivable - previousBalanceSheet.accountsReceivable` | balanceSheet.accountsReceivable, previousBalanceSheet.accountsReceivable |
| `lib/engines/circular-resolver.ts:281` | invChange | `balanceSheet.inventory - previousBalanceSheet.inventory` | balanceSheet.inventory, previousBalanceSheet.inventory |
| `lib/engines/circular-resolver.ts:282` | apChange | `balanceSheet.accountsPayable - previousBalanceSheet.accountsPayable` | balanceSheet.accountsPayable, previousBalanceSheet.accountsPayable |
| `lib/engines/circular-resolver.ts:283` | expectedWCImpact | `-(arChange + invChange) + apChange` | arChange, invChange, apChange |
| `lib/engines/circular-resolver.ts:284` | actualWCImpact | `cashFlow.changeInAR + cashFlow.changeInInventory + cashFlow.changeInAP` | cashFlow.changeInAR, cashFlow.changeInInventory, cashFlow.changeInAP |
| `lib/engines/circular-resolver.ts:285` | workingCapitalTies | `Math.abs(expectedWCImpact - actualWCImpact) < 0.01` | Math.abs, expectedWCImpact, actualWCImpact |
| `lib/engines/circular-resolver.ts:291` | difference | `expectedWCImpact - actualWCImpact` | expectedWCImpact, actualWCImpact |
| `lib/engines/circular-resolver.ts:295` | expectedCurrentAssets | `balanceSheet.cash + balanceSheet.accountsReceivable + balanceSheet.inventory + balanceSheet.prepaidExpenses + balanceSheet.otherCurrentAssets + (balan` | balanceSheet.cash, balanceSheet.accountsReceivable, balanceSheet.inventory, balanceSheet.prepaidExpenses, balanceSheet.otherCurrentAssets, balanceSheet.vatReceivable |
| `lib/engines/circular-resolver.ts:298` | totalCurrentAssetsCheck | `Math.abs(balanceSheet.totalCurrentAssets - expectedCurrentAssets) < 0.01` | Math.abs, balanceSheet.totalCurrentAssets, expectedCurrentAssets |
| `lib/engines/circular-resolver.ts:304` | difference | `balanceSheet.totalCurrentAssets - expectedCurrentAssets` | balanceSheet.totalCurrentAssets, expectedCurrentAssets |
| `lib/engines/circular-resolver.ts:308` | expectedNonCurrentAssets | `balanceSheet.netPPE + balanceSheet.intangibles + balanceSheet.goodwill + balanceSheet.otherLongTermAssets` | balanceSheet.netPPE, balanceSheet.intangibles, balanceSheet.goodwill, balanceSheet.otherLongTermAssets |
| `lib/engines/circular-resolver.ts:310` | totalNonCurrentAssetsCheck | `Math.abs(balanceSheet.totalNonCurrentAssets - expectedNonCurrentAssets) < 0.01` | Math.abs, balanceSheet.totalNonCurrentAssets, expectedNonCurrentAssets |
| `lib/engines/circular-resolver.ts:316` | difference | `balanceSheet.totalNonCurrentAssets - expectedNonCurrentAssets` | balanceSheet.totalNonCurrentAssets, expectedNonCurrentAssets |
| `lib/engines/circular-resolver.ts:320` | expectedCurrentLiabilities | `balanceSheet.accountsPayable + balanceSheet.accruedExpenses + balanceSheet.shortTermDebt + balanceSheet.currentPortionLTD + balanceSheet.deferredReven` | balanceSheet.accountsPayable, balanceSheet.accruedExpenses, balanceSheet.shortTermDebt, balanceSheet.currentPortionLTD, balanceSheet.deferredRevenue, balanceSheet.otherCurrentLiabilities, balanceSheet.vatPayable |
| `lib/engines/circular-resolver.ts:324` | totalCurrentLiabilitiesCheck | `Math.abs(balanceSheet.totalCurrentLiabilities - expectedCurrentLiabilities) < 0.01` | Math.abs, balanceSheet.totalCurrentLiabilities, expectedCurrentLiabilities |
| `lib/engines/circular-resolver.ts:330` | difference | `balanceSheet.totalCurrentLiabilities - expectedCurrentLiabilities` | balanceSheet.totalCurrentLiabilities, expectedCurrentLiabilities |
| `lib/engines/circular-resolver.ts:334` | expectedNonCurrentLiabilities | `balanceSheet.longTermDebt + balanceSheet.deferredTaxLiabilities + balanceSheet.otherLongTermLiabilities + (balanceSheet.endOfServiceProvision ?? 0)` | balanceSheet.longTermDebt, balanceSheet.deferredTaxLiabilities, balanceSheet.otherLongTermLiabilities, balanceSheet.endOfServiceProvision |
| `lib/engines/circular-resolver.ts:336` | totalNonCurrentLiabilitiesCheck | `Math.abs(balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities) < 0.01` | Math.abs, balanceSheet.totalNonCurrentLiabilities, expectedNonCurrentLiabilities |
| `lib/engines/circular-resolver.ts:342` | difference | `balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities` | balanceSheet.totalNonCurrentLiabilities, expectedNonCurrentLiabilities |
| `lib/engines/circular-resolver.ts:346` | expectedEquity | `balanceSheet.commonStock + balanceSheet.additionalPaidInCapital + (balanceSheet.legalReserve ?? 0) + balanceSheet.retainedEarnings + balanceSheet.trea` | balanceSheet.commonStock, balanceSheet.additionalPaidInCapital, balanceSheet.legalReserve, balanceSheet.retainedEarnings, balanceSheet.treasuryStock, balanceSheet.otherComprehensiveIncome |
| `lib/engines/circular-resolver.ts:349` | totalEquityCheck | `Math.abs(balanceSheet.totalEquity - expectedEquity) < 0.01` | Math.abs, balanceSheet.totalEquity, expectedEquity |
| `lib/engines/circular-resolver.ts:355` | difference | `balanceSheet.totalEquity - expectedEquity` | balanceSheet.totalEquity, expectedEquity |
| `lib/engines/circular-resolver.ts:359` | expectedNI | `incomeStatement.revenue - incomeStatement.cogs - incomeStatement.sgaExpense - incomeStatement.rdExpense - incomeStatement.depreciation - incomeStateme` | incomeStatement.revenue, incomeStatement.cogs, incomeStatement.sgaExpense, incomeStatement.rdExpense, incomeStatement.depreciation, incomeStatement.amortization, incomeStatement.otherOpex |
| `lib/engines/circular-resolver.ts:364` | grossToNetIncomeWaterfall | `Math.abs(incomeStatement.netIncome - expectedNI) < 0.01` | Math.abs, incomeStatement.netIncome, expectedNI |
| `lib/engines/circular-resolver.ts:370` | difference | `incomeStatement.netIncome - expectedNI` | incomeStatement.netIncome, expectedNI |
| `lib/engines/circular-resolver.ts:374` | expectedEBITDA | `incomeStatement.ebit + incomeStatement.depreciation + incomeStatement.amortization` | incomeStatement.ebit, incomeStatement.depreciation, incomeStatement.amortization |
| `lib/engines/circular-resolver.ts:375` | ebitdaIdentity | `Math.abs(incomeStatement.ebitda - expectedEBITDA) < 0.01` | Math.abs, incomeStatement.ebitda, expectedEBITDA |
| `lib/engines/circular-resolver.ts:381` | difference | `incomeStatement.ebitda - expectedEBITDA` | incomeStatement.ebitda, expectedEBITDA |
| `lib/engines/circular-resolver.ts:385` | apicDelta | `balanceSheet.additionalPaidInCapital - previousBalanceSheet.additionalPaidInCapital` | balanceSheet.additionalPaidInCapital, previousBalanceSheet.additionalPaidInCapital |
| `lib/engines/circular-resolver.ts:386` | expectedApicDelta | `cashFlow.equityIssuance + cashFlow.stockBasedComp` | cashFlow.equityIssuance, cashFlow.stockBasedComp |
| `lib/engines/circular-resolver.ts:387` | apicConsistency | `Math.abs(apicDelta - expectedApicDelta) < 0.01` | Math.abs, apicDelta, expectedApicDelta |
| `lib/engines/circular-resolver.ts:393` | difference | `apicDelta - expectedApicDelta` | apicDelta, expectedApicDelta |
| `lib/engines/circular-resolver.ts:399` | expectedEPD | `incomeStatement.netIncome > 0 ? incomeStatement.netIncome * (incomeStatement.employeeProfitSharing / Math.max(0.01, incomeStatement.netIncome)) : 0` | incomeStatement.netIncome, incomeStatement.employeeProfitSharing, Math.max |
| `lib/engines/circular-resolver.ts:402` | epdCheck | `Math.abs(incomeStatement.employeeProfitSharing - expectedEPD) < 0.01` | Math.abs, incomeStatement.employeeProfitSharing, expectedEPD |
| `lib/engines/circular-resolver.ts:408` | difference | `incomeStatement.employeeProfitSharing - expectedEPD` | incomeStatement.employeeProfitSharing, expectedEPD |
| `lib/engines/circular-resolver.ts:412` | expectedNIAfterEPD | `incomeStatement.netIncome - incomeStatement.employeeProfitSharing` | incomeStatement.netIncome, incomeStatement.employeeProfitSharing |
| `lib/engines/circular-resolver.ts:413` | niAfterEPDCheck | `Math.abs(incomeStatement.netIncomeAfterEPD - expectedNIAfterEPD) < 0.01` | Math.abs, incomeStatement.netIncomeAfterEPD, expectedNIAfterEPD |
| `lib/engines/circular-resolver.ts:419` | difference | `incomeStatement.netIncomeAfterEPD - expectedNIAfterEPD` | incomeStatement.netIncomeAfterEPD, expectedNIAfterEPD |
| `lib/engines/circular-resolver.ts:423` | expectedDistributable | `incomeStatement.netIncome - incomeStatement.employeeProfitSharing - incomeStatement.legalReserveAddition` | incomeStatement.netIncome, incomeStatement.employeeProfitSharing, incomeStatement.legalReserveAddition |
| `lib/engines/circular-resolver.ts:424` | distributabelCheck | `Math.abs(incomeStatement.distributableProfit - expectedDistributable) < 0.01` | Math.abs, incomeStatement.distributableProfit, expectedDistributable |
| `lib/engines/circular-resolver.ts:430` | difference | `incomeStatement.distributableProfit - expectedDistributable` | incomeStatement.distributableProfit, expectedDistributable |
| `lib/engines/circular-resolver.ts:436` | dividendsWithinBounds | `incomeStatement.grossDividends <= distributableFloor + 0.01` | incomeStatement.grossDividends, distributableFloor |
| `lib/engines/circular-resolver.ts:442` | difference | `distributableFloor - incomeStatement.grossDividends` | distributableFloor, incomeStatement.grossDividends |
| `lib/engines/circular-resolver.ts:446` | expectedNetDiv | `incomeStatement.grossDividends - incomeStatement.dividendWHT` | incomeStatement.grossDividends, incomeStatement.dividendWHT |
| `lib/engines/circular-resolver.ts:447` | netDivCheck | `Math.abs(incomeStatement.netDividends - expectedNetDiv) < 0.01` | Math.abs, incomeStatement.netDividends, expectedNetDiv |
| `lib/engines/circular-resolver.ts:453` | difference | `incomeStatement.netDividends - expectedNetDiv` | incomeStatement.netDividends, expectedNetDiv |
| `lib/engines/circular-resolver.ts:458` | expectedAddToRE | `incomeStatement.distributableProfit - incomeStatement.grossDividends` | incomeStatement.distributableProfit, incomeStatement.grossDividends |
| `lib/engines/circular-resolver.ts:459` | addToRECheck | `Math.abs(incomeStatement.additionToRE - expectedAddToRE) < 0.01` | Math.abs, incomeStatement.additionToRE, expectedAddToRE |
| `lib/engines/circular-resolver.ts:465` | difference | `incomeStatement.additionToRE - expectedAddToRE` | incomeStatement.additionToRE, expectedAddToRE |
| `lib/engines/circular-resolver.ts:470` | effectiveTaxRate | `incomeStatement.ebt > 0 ? incomeStatement.taxExpense / incomeStatement.ebt : incomeStatement.taxRate` | incomeStatement.ebt, incomeStatement.taxExpense, incomeStatement.taxRate |
| `lib/engines/circular-resolver.ts:473` | expectedNOPAT | `incomeStatement.ebit * (1 - effectiveTaxRate)` | incomeStatement.ebit, effectiveTaxRate |
| `lib/engines/circular-resolver.ts:474` | nopatCheck | `Math.abs(incomeStatement.nopat - expectedNOPAT) < 0.01` | Math.abs, incomeStatement.nopat, expectedNOPAT |
| `lib/engines/circular-resolver.ts:480` | difference | `incomeStatement.nopat - expectedNOPAT` | incomeStatement.nopat, expectedNOPAT |
| `lib/engines/circular-resolver.ts:484` | expectedLegalReserve | `(previousBalanceSheet.legalReserve ?? 0) + incomeStatement.legalReserveAddition` | previousBalanceSheet.legalReserve, incomeStatement.legalReserveAddition |
| `lib/engines/circular-resolver.ts:485` | legalReserveCheck | `Math.abs((balanceSheet.legalReserve ?? 0) - expectedLegalReserve) < 0.01` | Math.abs, balanceSheet.legalReserve, expectedLegalReserve |
| `lib/engines/circular-resolver.ts:491` | difference | `(balanceSheet.legalReserve ?? 0) - expectedLegalReserve` | balanceSheet.legalReserve, expectedLegalReserve |
| `lib/engines/circular-resolver.ts:495` | taxLossUtilizationCheck | `incomeStatement.taxLossUtilized <= incomeStatement.taxLossCarryforward + 0.01` | incomeStatement.taxLossUtilized, incomeStatement.taxLossCarryforward |
| `lib/engines/circular-resolver.ts:501` | difference | `incomeStatement.taxLossCarryforward - incomeStatement.taxLossUtilized` | incomeStatement.taxLossCarryforward, incomeStatement.taxLossUtilized |
| `lib/engines/circular-resolver.ts:506` | expectedTaxableIncome | `Math.max(0, incomeStatement.ebt - incomeStatement.taxLossUtilized)` | Math.max, incomeStatement.ebt, incomeStatement.taxLossUtilized |
| `lib/engines/circular-resolver.ts:507` | taxableIncomeCheck | `Math.abs( Math.max(0, incomeStatement.taxableIncome) - expectedTaxableIncome ) < 0.01` | Math.abs, Math.max, incomeStatement.taxableIncome, expectedTaxableIncome |
| `lib/engines/circular-resolver.ts:515` | difference | `Math.max(0, incomeStatement.taxableIncome) - expectedTaxableIncome` | Math.max, incomeStatement.taxableIncome, expectedTaxableIncome |
| `lib/engines/circular-resolver.ts:519` | cfDivCheck | `Math.abs(Math.abs(cashFlow.dividendsPaid) - incomeStatement.grossDividends) < 0.01` | Math.abs, cashFlow.dividendsPaid, incomeStatement.grossDividends |
| `lib/engines/circular-resolver.ts:525` | difference | `Math.abs(cashFlow.dividendsPaid) - incomeStatement.grossDividends` | Math.abs, cashFlow.dividendsPaid, incomeStatement.grossDividends |
| `lib/engines/circular-resolver.ts:529` | cfWhtCheck | `Math.abs(Math.abs(cashFlow.dividendWHT) - incomeStatement.dividendWHT) < 0.01` | Math.abs, cashFlow.dividendWHT, incomeStatement.dividendWHT |
| `lib/engines/circular-resolver.ts:535` | difference | `Math.abs(cashFlow.dividendWHT) - incomeStatement.dividendWHT` | Math.abs, cashFlow.dividendWHT, incomeStatement.dividendWHT |
| `lib/engines/dcf.ts:25` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/engines/dcf.ts:26` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/engines/dcf.ts:32` | costOfEquity | `riskFreeRate + assumptions.beta * assumptions.equityRiskPremium` | riskFreeRate, assumptions.beta, assumptions.equityRiskPremium |
| `lib/engines/dcf.ts:40` | avgDebtRate | `rateSlice.length > 0 ? rateSlice.reduce((a, b) => a + b, 0) / rateSlice.length : (assumptions.legacyDebtRate ?? 0.18)` | rateSlice.length, rateSlice.reduce, a, b, assumptions.legacyDebtRate |
| `lib/engines/dcf.ts:45` | costOfDebt | `debtRate * (1 - taxRate)` | debtRate, taxRate |
| `lib/engines/dcf.ts:48` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/engines/dcf.ts:50` | totalCapital | `totalDebt + totalEquity` | totalDebt, totalEquity |
| `lib/engines/dcf.ts:51` | debtWeight | `totalDebt / totalCapital` | totalDebt, totalCapital |
| `lib/engines/dcf.ts:52` | equityWeight | `totalEquity / totalCapital` | totalEquity, totalCapital |
| `lib/engines/dcf.ts:55` | wacc | `equityWeight * costOfEquity + debtWeight * costOfDebt` | equityWeight, costOfEquity, debtWeight, costOfDebt |
| `lib/engines/dcf.ts:62` | (inline) | `wacc * 100` | wacc |
| `lib/engines/dcf.ts:68` | (inline) | `debtWeight * 100` | debtWeight |
| `lib/engines/dcf.ts:71` | (inline) | `costOfEquity * 100` | costOfEquity |
| `lib/engines/dcf.ts:95` | (inline) | `g * 100` | g |
| `lib/engines/dcf.ts:95` | (inline) | `wacc * 100` | wacc |
| `lib/engines/dcf.ts:99` | (inline) | `fcf / Math.pow(1 + wacc, i + 1)` | fcf, Math.pow, wacc, i |
| `lib/engines/dcf.ts:102` | lastFCFF | `fcfProjections[fcfProjections.length - 1] ?? 0` | fcfProjections, fcfProjections.length |
| `lib/engines/dcf.ts:103` | terminalValue | `wacc > g ? (lastFCFF * (1 + g)) / (wacc - g) : 0` | wacc, g, lastFCFF |
| `lib/engines/dcf.ts:107` | pvTerminalValue | `terminalValue / Math.pow(1 + wacc, nPeriods)` | terminalValue, Math.pow, wacc, nPeriods |
| `lib/engines/dcf.ts:110` | (inline) | `a + b` | a, b |
| `lib/engines/dcf.ts:111` | enterpriseValue | `sumDiscountedFCFs + pvTerminalValue` | sumDiscountedFCFs, pvTerminalValue |
| `lib/engines/dcf.ts:114` | tvAsPercentOfEV | `enterpriseValue !== 0 ? pvTerminalValue / enterpriseValue : 0` | enterpriseValue, pvTerminalValue |
| `lib/engines/dcf.ts:116` | (inline) | `tvAsPercentOfEV * 100` | tvAsPercentOfEV |
| `lib/engines/dcf.ts:120` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/engines/dcf.ts:121` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/engines/dcf.ts:122` | netDebt | `totalDebt - lastBS.cash` | totalDebt, lastBS.cash |
| `lib/engines/dcf.ts:123` | equityValue | `enterpriseValue - netDebt` | enterpriseValue, netDebt |
| `lib/engines/dcf.ts:126` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/engines/dcf.ts:128` | impliedSharePrice | `equityValue / shares` | equityValue, shares |
| `lib/engines/income-statement.ts:60` | (inline) | `s + v.amount` | s, v.amount |
| `lib/engines/income-statement.ts:64` | newVintages | `ebt < 0 ? [...activeVintages, { year: currentYear, amount: Math.abs(ebt), expiresAfterYear: currentYear + carryforwardYears }] : activeVintages` | ebt, activeVintages, year, currentYear, amount, Math.abs, expiresAfterYear |
| `lib/engines/income-statement.ts:65` | expiresAfterYear | `currentYear + carryforwardYears` | currentYear, carryforwardYears |
| `lib/engines/income-statement.ts:71` | (inline) | `s + v.amount` | s, v.amount |
| `lib/engines/income-statement.ts:85` | (return) | `{ ...v, amount: v.amount - use }` | v, amount, v.amount, use |
| `lib/engines/income-statement.ts:85` | amount | `v.amount - use` | v.amount, use |
| `lib/engines/income-statement.ts:88` | taxableIncome | `Math.max(0, ebt - utilized)` | Math.max, ebt, utilized |
| `lib/engines/income-statement.ts:89` | tax | `taxableIncome * taxRate` | taxableIncome, taxRate |
| `lib/engines/income-statement.ts:95` | (inline) | `s + v.amount` | s, v.amount |
| `lib/engines/income-statement.ts:114` | (return) | `{ deductible: interestExpense, disallowed: 0, deRatioLimit: calendarYear >= 2028 ? 2.0 : 3.0, rateCeiling: cbeRate * 2, }` | deductible, interestExpense, disallowed, deRatioLimit, calendarYear, rateCeiling, cbeRate |
| `lib/engines/income-statement.ts:118` | rateCeiling | `cbeRate * 2` | cbeRate |
| `lib/engines/income-statement.ts:122` | rateCeiling | `cbeRate * 2` | cbeRate |
| `lib/engines/income-statement.ts:125` | effectiveRate | `interestExpense / totalDebt` | interestExpense, totalDebt |
| `lib/engines/income-statement.ts:127` | rateCapInterest | `totalDebt * cappedRate` | totalDebt, cappedRate |
| `lib/engines/income-statement.ts:130` | currentDE | `totalDebt / totalEquity` | totalDebt, totalEquity |
| `lib/engines/income-statement.ts:133` | deductibleDebtFraction | `(totalEquity * deRatioLimit) / totalDebt` | totalEquity, deRatioLimit, totalDebt |
| `lib/engines/income-statement.ts:134` | deductibleInterest | `rateCapInterest * deductibleDebtFraction` | rateCapInterest, deductibleDebtFraction |
| `lib/engines/income-statement.ts:137` | disallowed | `Math.max(0, interestExpense - deductibleInterest)` | Math.max, interestExpense, deductibleInterest |
| `lib/engines/income-statement.ts:138` | (return) | `{ deductible: interestExpense - disallowed, disallowed, deRatioLimit, rateCeiling, }` | deductible, interestExpense, disallowed, deRatioLimit, rateCeiling |
| `lib/engines/income-statement.ts:139` | deductible | `interestExpense - disallowed` | interestExpense, disallowed |
| `lib/engines/income-statement.ts:157` | maxReserve | `paidUpCapital * reserveCap` | paidUpCapital, reserveCap |
| `lib/engines/income-statement.ts:161` | proposed | `netIncome * reservePercent` | netIncome, reservePercent |
| `lib/engines/income-statement.ts:162` | room | `maxReserve - priorLegalReserve` | maxReserve, priorLegalReserve |
| `lib/engines/income-statement.ts:164` | (return) | `{ addition, newBalance: priorLegalReserve + addition }` | addition, newBalance, priorLegalReserve |
| `lib/engines/income-statement.ts:164` | newBalance | `priorLegalReserve + addition` | priorLegalReserve, addition |
| `lib/engines/income-statement.ts:176` | currentYear | `assumptions.startYear + yr` | assumptions.startYear, yr |
| `lib/engines/income-statement.ts:181` | revenue | `previousRevenue * (1 + growthRate)` | previousRevenue, growthRate |
| `lib/engines/income-statement.ts:185` | cogs | `revenue * cogsPercent` | revenue, cogsPercent |
| `lib/engines/income-statement.ts:186` | grossProfit | `revenue - cogs` | revenue, cogs |
| `lib/engines/income-statement.ts:187` | grossMargin | `revenue !== 0 ? grossProfit / revenue : 0` | revenue, grossProfit |
| `lib/engines/income-statement.ts:190` | sgaExpense | `revenue * (assumptions.sgaPercent[yr] ?? 0.15)` | revenue, assumptions.sgaPercent, yr |
| `lib/engines/income-statement.ts:191` | rdExpense | `revenue * (assumptions.rdPercent[yr] ?? 0.05)` | revenue, assumptions.rdPercent, yr |
| `lib/engines/income-statement.ts:194` | otherOpex | `revenue * (assumptions.otherOpexPercent[yr] ?? 0.02)` | revenue, assumptions.otherOpexPercent, yr |
| `lib/engines/income-statement.ts:197` | eosExpense | `(assumptions.enableEndOfServiceBenefit ?? false) ? sgaExpense * (assumptions.eosProvisionPctOfSGA?.[yr] ?? 0.015) : 0` | assumptions.enableEndOfServiceBenefit, sgaExpense, assumptions.eosProvisionPctOfSGA, yr |
| `lib/engines/income-statement.ts:200` | totalOpex | `sgaExpense + rdExpense + depreciation + amortization + otherOpex + stockBasedComp + eosExpense` | sgaExpense, rdExpense, depreciation, amortization, otherOpex, stockBasedComp, eosExpense |
| `lib/engines/income-statement.ts:203` | ebit | `grossProfit - totalOpex` | grossProfit, totalOpex |
| `lib/engines/income-statement.ts:204` | ebitda | `ebit + depreciation + amortization` | ebit, depreciation, amortization |
| `lib/engines/income-statement.ts:205` | ebitMargin | `revenue !== 0 ? ebit / revenue : 0` | revenue, ebit |
| `lib/engines/income-statement.ts:213` | ebt | `ebit + interestIncome - interestExpense + otherIncomeExpense` | ebit, interestIncome, interestExpense, otherIncomeExpense |
| `lib/engines/income-statement.ts:218` | (inline) | `taxRate * 100` | taxRate |
| `lib/engines/income-statement.ts:229` | taxResult | `calculateTaxWithCarryforward( ebt + thinCap.disallowed, // add back non-deductible interest to taxable base taxRate, taxLossVintages, currentYear, ass` | calculateTaxWithCarryforward, ebt, thinCap.disallowed, taxRate, taxLossVintages, currentYear, assumptions.taxLossCarryforwardYears |
| `lib/engines/income-statement.ts:238` | netIncome | `ebt - taxExpense` | ebt, taxExpense |
| `lib/engines/income-statement.ts:239` | netMargin | `revenue !== 0 ? netIncome / revenue : 0` | revenue, netIncome |
| `lib/engines/income-statement.ts:260` | epdBase | `(assumptions.enableNonOperatingExclusion ?? false) ? Math.max(0, netIncome - Math.max(0, otherIncomeExpense)) : netIncome` | assumptions.enableNonOperatingExclusion, Math.max, netIncome, otherIncomeExpense |
| `lib/engines/income-statement.ts:263` | rawEPD | `( (assumptions.enableEmployeeProfitShare ?? true) && epdBase > 0 ) ? epdBase * (assumptions.employeeProfitSharingRate ?? 0.10) : 0` | assumptions.enableEmployeeProfitShare, epdBase, assumptions.employeeProfitSharingRate |
| `lib/engines/income-statement.ts:272` | netIncomeAfterEPD | `netIncome - employeeProfitSharing` | netIncome, employeeProfitSharing |
| `lib/engines/income-statement.ts:275` | distributableProfit | `netIncome - employeeProfitSharing - legalReserve.addition` | netIncome, employeeProfitSharing, legalReserve.addition |
| `lib/engines/income-statement.ts:281` | grossDividends | `canPayDividends ? distributableProfit * dividendPayoutRatio : 0` | canPayDividends, distributableProfit, dividendPayoutRatio |
| `lib/engines/income-statement.ts:285` | dividendWHT | `grossDividends * dividendWHTRate` | grossDividends, dividendWHTRate |
| `lib/engines/income-statement.ts:286` | netDividends | `grossDividends - dividendWHT` | grossDividends, dividendWHT |
| `lib/engines/income-statement.ts:287` | additionToRE | `distributableProfit - grossDividends` | distributableProfit, grossDividends |
| `lib/engines/income-statement.ts:290` | effectiveTaxRate | `ebt > 0 ? taxExpense / ebt : taxRate` | ebt, taxExpense, taxRate |
| `lib/engines/income-statement.ts:291` | nopat | `ebit * (1 - effectiveTaxRate)` | ebit, effectiveTaxRate |
| `lib/engines/income-statement.ts:294` | changeInNWC | `currentNWC - previousNWC` | currentNWC, previousNWC |
| `lib/engines/income-statement.ts:295` | fcff | `nopat + depreciation + amortization - capex - changeInNWC` | nopat, depreciation, amortization, capex, changeInNWC |
| `lib/engines/income-statement.ts:299` | sharesOutstanding | `assumptions.sharesOutstanding[yr] ?? assumptions.sharesOutstanding[yr - 1] ?? assumptions.sharesOutstanding[0] ?? 0` | assumptions.sharesOutstanding, yr |
| `lib/engines/income-statement.ts:303` | eps | `sharesOutstanding !== 0 ? netIncomeAfterEPD / sharesOutstanding : 0` | sharesOutstanding, netIncomeAfterEPD |
| `lib/engines/income-statement.ts:311` | vatCollected | `revenue * assumptions.vatRate` | revenue, assumptions.vatRate |
| `lib/engines/income-statement.ts:312` | revenueInclVAT | `revenue + vatCollected` | revenue, vatCollected |
| `lib/engines/income-statement.ts:400` | grossProfit | `revenue - cogs` | revenue, cogs |
| `lib/engines/income-statement.ts:407` | totalOpex | `sgaExpense + rdExpense + depreciation + amortization + otherOpex + stockBasedComp` | sgaExpense, rdExpense, depreciation, amortization, otherOpex, stockBasedComp |
| `lib/engines/income-statement.ts:408` | ebit | `grossProfit - totalOpex` | grossProfit, totalOpex |
| `lib/engines/income-statement.ts:409` | ebitda | `ebit + depreciation + amortization` | ebit, depreciation, amortization |
| `lib/engines/income-statement.ts:413` | ebt | `ebit + interestIncome - interestExpense + otherIncomeExpense` | ebit, interestIncome, interestExpense, otherIncomeExpense |
| `lib/engines/income-statement.ts:416` | taxExpense | `statRate != null ? Math.max(0, ebt) * statRate : data.taxExpense[i]` | statRate, Math.max, ebt, data.taxExpense, i |
| `lib/engines/income-statement.ts:417` | netIncome | `ebt - taxExpense` | ebt, taxExpense |
| `lib/engines/income-statement.ts:420` | prevRevenue | `i > 0 ? data.revenue[i - 1] : revenue` | i, data.revenue, revenue |
| `lib/engines/income-statement.ts:421` | revenueGrowthRate | `prevRevenue !== 0 ? (revenue - prevRevenue) / prevRevenue : 0` | prevRevenue, revenue |
| `lib/engines/income-statement.ts:423` | (return) | `{ period, periodType: 'historical' as const, revenue, revenueGrowthRate, cogs, grossProfit, grossMargin: revenue !== 0 ? grossProfit / revenue : 0, sg` | period, periodType, const, revenue, revenueGrowthRate, cogs, grossProfit |
| `lib/engines/income-statement.ts:430` | grossMargin | `revenue !== 0 ? grossProfit / revenue : 0` | revenue, grossProfit |
| `lib/engines/income-statement.ts:440` | ebitMargin | `revenue !== 0 ? ebit / revenue : 0` | revenue, ebit |
| `lib/engines/income-statement.ts:445` | taxRate | `statutoryTaxRate?.[i] ?? statutoryTaxRate?.[0] ?? (ebt !== 0 ? taxExpense / ebt : 0)` | statutoryTaxRate, i, ebt, taxExpense |
| `lib/engines/income-statement.ts:448` | netMargin | `revenue !== 0 ? netIncome / revenue : 0` | revenue, netIncome |
| `lib/engines/income-statement.ts:462` | additionToRE | `retainedEarnings && i > 0 ? retainedEarnings[i] - retainedEarnings[i - 1] // actual RE change : netIncome` | retainedEarnings, i, netIncome |
| `lib/engines/income-statement.ts:466` | nopat | `ebit * (1 - (statutoryTaxRate?.[i] ?? statutoryTaxRate?.[0] ?? (ebt !== 0 ? taxExpense / ebt : 0.225)))` | ebit, statutoryTaxRate, i, ebt, taxExpense |
| `lib/engines/income-statement.ts:469` | eps | `sharesOutstanding !== 0 ? netIncome / sharesOutstanding : 0` | sharesOutstanding, netIncome |
| `lib/engines/integrator.ts:36` | last | `n - 1` | n |
| `lib/engines/integrator.ts:44` | (return) | `Math.abs(histVal) > 0 && Math.abs(first) < Math.abs(histVal) * 0.1` | Math.abs, histVal, first |
| `lib/engines/integrator.ts:79` | (inline) | `Math.abs(histCommon) * 0.1` | Math.abs, histCommon |
| `lib/engines/integrator.ts:92` | prepaidRatio | `(historicalInputs.prepaidExpenses[last] ?? 0) / rev` | historicalInputs.prepaidExpenses, last, rev |
| `lib/engines/integrator.ts:93` | accruedRatio | `(historicalInputs.accruedExpenses[last] ?? 0) / rev` | historicalInputs.accruedExpenses, last, rev |
| `lib/engines/integrator.ts:94` | defRevRatio | `(historicalInputs.deferredRevenue[last] ?? 0) / rev` | historicalInputs.deferredRevenue, last, rev |
| `lib/engines/integrator.ts:96` | (inline) | `a - b` | a, b |
| `lib/engines/integrator.ts:122` | (return) | ``${assumptions.startYear - numHistorical + index}`` | assumptions.startYear, numHistorical, index |
| `lib/engines/integrator.ts:156` | prevIS | `yr === 0 ? historicalIS[historicalIS.length - 1] : projectedIS[yr - 1]` | yr, historicalIS, historicalIS.length, projectedIS |
| `lib/engines/integrator.ts:159` | prevBS | `yr === 0 ? historicalBS[historicalBS.length - 1] : projectedBS[yr - 1]` | yr, historicalBS, historicalBS.length, projectedBS |
| `lib/engines/integrator.ts:203` | prevBS | `i > 0 ? allBS[i - 1] : bs` | i, allBS, bs |
| `lib/engines/integrator.ts:205` | cf | `i > 0 && i - 1 < allCF.length ? allCF[i - 1] : null` | i, allCF.length, allCF |
| `lib/engines/integrator.ts:258` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/engines/integrator.ts:259` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/engines/integrator.ts:260` | lastCF | `results.cashFlowStatements[results.cashFlowStatements.length - 1]` | results.cashFlowStatements, results.cashFlowStatements.length |
| `lib/engines/integrator.ts:265` | (return) | `{ // Latest period revenue: lastIS.revenue, ebitda: lastIS.ebitda, netIncome: lastIS.netIncome, eps: lastIS.eps, freeCashFlow: lastCF.freeCashFlow, to` | revenue, lastIS.revenue, ebitda, lastIS.ebitda, netIncome, lastIS.netIncome, eps |
| `lib/engines/integrator.ts:273` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/engines/integrator.ts:279` | avgRevenueGrowth | `projectedIS.reduce((sum, s) => sum + s.revenueGrowthRate, 0) / projectedIS.length` | projectedIS.reduce, sum, s, s.revenueGrowthRate, projectedIS.length |
| `lib/engines/integrator.ts:280` | avgNetMargin | `projectedIS.reduce((sum, s) => sum + s.netMargin, 0) / projectedIS.length` | projectedIS.reduce, sum, s, s.netMargin, projectedIS.length |
| `lib/engines/integrator.ts:281` | avgFCF | `projectedCF.reduce((sum, s) => sum + s.freeCashFlow, 0) / projectedCF.length` | projectedCF.reduce, sum, s, s.freeCashFlow, projectedCF.length |
| `lib/engines/valuation.ts:38` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/engines/valuation.ts:39` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/engines/valuation.ts:40` | lastCF | `results.cashFlowStatements[results.cashFlowStatements.length - 1]` | results.cashFlowStatements, results.cashFlowStatements.length |
| `lib/engines/valuation.ts:49` | marketCap | `sharePrice * shares` | sharePrice, shares |
| `lib/engines/valuation.ts:50` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/engines/valuation.ts:51` | netDebt | `totalDebt - lastBS.cash` | totalDebt, lastBS.cash |
| `lib/engines/valuation.ts:52` | enterpriseValueMarket | `marketCap + netDebt` | marketCap, netDebt |
| `lib/engines/valuation.ts:55` | pe | `lastIS.eps !== 0 ? sharePrice / lastIS.eps : null` | lastIS.eps, sharePrice |
| `lib/engines/valuation.ts:58` | evEbitda | `lastIS.ebitda !== 0 ? enterpriseValueMarket / lastIS.ebitda : null` | lastIS.ebitda, enterpriseValueMarket |
| `lib/engines/valuation.ts:61` | bookValuePerShare | `lastBS.totalEquity / shares` | lastBS.totalEquity, shares |
| `lib/engines/valuation.ts:62` | priceBook | `bookValuePerShare !== 0 ? sharePrice / bookValuePerShare : null` | bookValuePerShare, sharePrice |
| `lib/engines/valuation.ts:65` | fcfYield | `marketCap !== 0 ? lastCF.freeCashFlow / marketCap : null` | marketCap, lastCF.freeCashFlow |
| `lib/engines/valuation.ts:69` | dps | `dividendsPaid / shares` | dividendsPaid, shares |
| `lib/engines/valuation.ts:70` | dividendYield | `sharePrice !== 0 ? dps / sharePrice : null` | sharePrice, dps |
| `lib/engines/valuation.ts:90` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/engines/valuation.ts:91` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/engines/valuation.ts:95` | fromPE | `benchmarks.pe.avg * lastIS.eps` | benchmarks.pe.avg, lastIS.eps |
| `lib/engines/valuation.ts:98` | totalDebt | `lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD` | lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/engines/valuation.ts:99` | netDebt | `totalDebt - lastBS.cash` | totalDebt, lastBS.cash |
| `lib/engines/valuation.ts:100` | impliedEV | `benchmarks.evEbitda.avg * lastIS.ebitda` | benchmarks.evEbitda.avg, lastIS.ebitda |
| `lib/engines/valuation.ts:101` | impliedEquity | `impliedEV - netDebt` | impliedEV, netDebt |
| `lib/engines/valuation.ts:102` | fromEVEBITDA | `impliedEquity / shares` | impliedEquity, shares |
| `lib/engines/valuation.ts:105` | bvps | `lastBS.totalEquity / shares` | lastBS.totalEquity, shares |
| `lib/engines/valuation.ts:106` | fromPB | `benchmarks.priceBook.avg * bvps` | benchmarks.priceBook.avg, bvps |
| `lib/export/build-company-info.ts:115` | histStart | `projStart - histYears` | projStart, histYears |
| `lib/export/build-company-info.ts:116` | histEnd | `projStart - 1` | projStart |
| `lib/export/build-company-info.ts:117` | projEnd | `projStart + projYears - 1` | projStart, projYears |
| `lib/export/build-company-info.ts:166` | (inline) | `sec4Start + 1` | sec4Start |
| `lib/export/build-company-info.ts:167` | (inline) | `sec4Start + 2` | sec4Start |
| `lib/export/build-company-info.ts:168` | (inline) | `sec4Start + 3` | sec4Start |
| `lib/export/build-company-info.ts:169` | (inline) | `sec4Start + 4` | sec4Start |
| `lib/export/build-company-info.ts:170` | (inline) | `sec4Start + 5` | sec4Start |
| `lib/export/build-company-info.ts:171` | (inline) | `sec4Start + 6` | sec4Start |
| `lib/export/build-company-info.ts:174` | footerRow | `sec4Start + 8` | sec4Start |
| `lib/export/build-dashboard.ts:33` | s | `String.fromCharCode(65 + (c % 26)) + s` | String.fromCharCode, c, s |
| `lib/export/build-dashboard.ts:33` | c | `Math.floor(c / 26)` | Math.floor, c |
| `lib/export/build-dashboard.ts:58` | (inline) | `i + 2` | i |
| `lib/export/build-dashboard.ts:59` | (inline) | `nYears + 2` | nYears |
| `lib/export/build-dashboard.ts:60` | (inline) | `nYears + 3` | nYears |
| `lib/export/build-dashboard.ts:61` | lastCol | `nYears + 3` | nYears |
| `lib/export/build-dashboard.ts:149` | hc | `ws.getCell(9, i + 2)` | ws.getCell, i |
| `lib/export/build-dashboard.ts:240` | dc | `ws.getCell(row, i + 2)` | ws.getCell, row, i |
| `lib/export/build-dashboard.ts:241` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/build-dashboard.ts:253` | cfIdx | `i - 1` | i |
| `lib/export/build-dashboard.ts:278` | bsMap | `{ out_totalAssets: bs.totalAssets, out_totalEquity: bs.totalEquity, out_cash: bs.cash, out_totalDebt: (bs.shortTermDebt ?? 0) + (bs.longTermDebt ?? 0)` | out_totalAssets, bs.totalAssets, out_totalEquity, bs.totalEquity, out_cash, bs.cash, out_totalDebt |
| `lib/export/build-dashboard.ts:281` | out_totalDebt | `(bs.shortTermDebt ?? 0) + (bs.longTermDebt ?? 0) + (bs.currentPortionLTD ?? 0)` | bs.shortTermDebt, bs.longTermDebt, bs.currentPortionLTD |
| `lib/export/build-dashboard.ts:325` | termColIS | `colLetter(nYears + 1)` | colLetter, nYears |
| `lib/export/build-dashboard.ts:326` | numCFTotal | `nYears - 1` | nYears |
| `lib/export/build-dashboard.ts:327` | termColCF | `colLetter(numCFTotal + 1)` | colLetter, numCFTotal |
| `lib/export/build-dashboard.ts:330` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/export/build-dashboard.ts:331` | lastBS | `results.balanceSheets[results.balanceSheets.length - 1]` | results.balanceSheets, results.balanceSheets.length |
| `lib/export/build-dashboard.ts:332` | lastCF | `results.cashFlowStatements[results.cashFlowStatements.length - 1]` | results.cashFlowStatements, results.cashFlowStatements.length |
| `lib/export/build-dashboard.ts:333` | lastRatio | `results.ratios[results.ratios.length - 1]` | results.ratios, results.ratios.length |
| `lib/export/build-scenarios.ts:158` | (inline) | `n / d` | n, d |
| `lib/export/build-scenarios.ts:160` | (inline) | `Math.round(v * 100) / 100` | Math.round, v |
| `lib/export/build-scenarios.ts:161` | (inline) | `Math.round(v * 1000000) / 1000000` | Math.round, v |
| `lib/export/build-scenarios.ts:173` | (return) | `sd(rev - engineRevenues[i - 1], engineRevenues[i - 1])` | sd, rev, engineRevenues, i |
| `lib/export/build-scenarios.ts:197` | projIdx | `i - numHistorical` | i, numHistorical |
| `lib/export/build-scenarios.ts:205` | cfIdx | `i - 1` | i |
| `lib/export/build-scenarios.ts:213` | (inline) | `sd(bs.accountsReceivable, allIS[i]?.revenue ?? 1) * 365` | sd, bs.accountsReceivable, allIS[i]?.revenue |
| `lib/export/build-scenarios.ts:214` | (inline) | `sd(bs.inventory, allIS[i]?.cogs ?? 1) * 365` | sd, bs.inventory, allIS[i]?.cogs |
| `lib/export/build-scenarios.ts:215` | (inline) | `sd(bs.accountsPayable, allIS[i]?.cogs ?? 1) * 365` | sd, bs.accountsPayable, allIS[i]?.cogs |
| `lib/export/build-scenarios.ts:223` | (return) | `roundPct(sd(bs.grossPPE - allBS[i - 1].grossPPE, allIS[i]?.revenue ?? 1))` | roundPct, sd, bs.grossPPE, allBS[i-1].grossPPE, allIS[i]?.revenue |
| `lib/export/build-scenarios.ts:232` | projIdx | `i - numHistorical` | i, numHistorical |
| `lib/export/build-scenarios.ts:247` | (inline) | `i - numHistorical` | i, numHistorical |
| `lib/export/build-scenarios.ts:247` | (inline) | `a.interestRateOnDebt.length - 1` | a.interestRateOnDebt.length |
| `lib/export/build-scenarios.ts:252` | (inline) | `i - numHistorical` | i, numHistorical |
| `lib/export/build-scenarios.ts:252` | (inline) | `a.interestRateOnCash.length - 1` | a.interestRateOnCash.length |
| `lib/export/build-scenarios.ts:258` | change | `bs.longTermDebt - allBS[i - 1].longTermDebt` | bs.longTermDebt, allBS[i-1].longTermDebt |
| `lib/export/build-scenarios.ts:263` | change | `bs.longTermDebt - allBS[i - 1].longTermDebt` | bs.longTermDebt, allBS[i-1].longTermDebt |
| `lib/export/build-scenarios.ts:274` | projIdx | `i - numHistorical` | i, numHistorical |
| `lib/export/build-scenarios.ts:278` | cfIdx | `i - 1` | i |
| `lib/export/build-scenarios.ts:282` | (return) | `ni !== 0 ? Math.abs(divPaid) / ni : 0` | ni, Math.abs, divPaid |
| `lib/export/build-scenarios.ts:288` | (return) | `Math.abs(bs.treasuryStock - allBS[i - 1].treasuryStock)` | Math.abs, bs.treasuryStock, allBS[i-1].treasuryStock |
| `lib/export/build-scenarios.ts:291` | cfIdx | `i - 1` | i |
| `lib/export/build-scenarios.ts:354` | (inline) | `(bs.shortTermDebt ?? 0) + (bs.longTermDebt ?? 0) + (bs.currentPortionLTD ?? 0)` | bs.shortTermDebt, bs.longTermDebt, bs.currentPortionLTD |
| `lib/export/build-scenarios.ts:394` | (inline) | `i + 2` | i |
| `lib/export/build-scenarios.ts:398` | (inline) | `nYears + 1` | nYears |
| `lib/export/build-scenarios.ts:405` | (inline) | `nYears + 1` | nYears |
| `lib/export/build-scenarios.ts:434` | (inline) | `nYears + 1` | nYears |
| `lib/export/build-scenarios.ts:447` | hc | `ws.getCell(row, i + 2)` | ws.getCell, row, i |
| `lib/export/build-scenarios.ts:461` | (inline) | `nYears + 1` | nYears |
| `lib/export/build-scenarios.ts:479` | dc | `ws.getCell(row, i + 2)` | ws.getCell, row, i |
| `lib/export/csv-json.ts:182` | (inline) | `i + 1` | i |
| `lib/export/csv-json.ts:242` | (inline) | `a + b` | a, b |
| `lib/export/csv-json.ts:303` | (inline) | `startYear - numHist + idx` | startYear, numHist, idx |
| `lib/export/excel.ts:34` | rem | `(col - 1) % 26` | col |
| `lib/export/excel.ts:35` | s | `String.fromCharCode(65 + rem) + s` | String.fromCharCode, rem, s |
| `lib/export/excel.ts:36` | col | `Math.floor((col - 1) / 26)` | Math.floor, col |
| `lib/export/excel.ts:259` | (inline) | `a / b` | a, b |
| `lib/export/excel.ts:271` | (return) | `safeDiv(rev - engineRevenues[i - 1], engineRevenues[i - 1])` | safeDiv, rev, engineRevenues, i |
| `lib/export/excel.ts:283` | projIdx | `i - numHistorical` | i, numHistorical |
| `lib/export/excel.ts:293` | cfIdx | `i - 1` | i |
| `lib/export/excel.ts:301` | (inline) | `safeDiv(bs.accountsReceivable, allIS[i]?.revenue ?? 1) * 365` | safeDiv, bs.accountsReceivable, allIS[i]?.revenue |
| `lib/export/excel.ts:302` | (inline) | `safeDiv(bs.inventory, allIS[i]?.cogs ?? 1) * 365` | safeDiv, bs.inventory, allIS[i]?.cogs |
| `lib/export/excel.ts:303` | (inline) | `safeDiv(bs.accountsPayable, allIS[i]?.cogs ?? 1) * 365` | safeDiv, bs.accountsPayable, allIS[i]?.cogs |
| `lib/export/excel.ts:311` | capexPositive | `bs.grossPPE - allBS[i - 1].grossPPE` | bs.grossPPE, allBS[i-1].grossPPE |
| `lib/export/excel.ts:324` | (inline) | `i - numHistorical` | i, numHistorical |
| `lib/export/excel.ts:324` | (inline) | `assumptions.interestRateOnDebt.length - 1` | assumptions.interestRateOnDebt.length |
| `lib/export/excel.ts:329` | (inline) | `i - numHistorical` | i, numHistorical |
| `lib/export/excel.ts:329` | (inline) | `assumptions.interestRateOnCash.length - 1` | assumptions.interestRateOnCash.length |
| `lib/export/excel.ts:335` | change | `bs.longTermDebt - allBS[i - 1].longTermDebt` | bs.longTermDebt, allBS[i-1].longTermDebt |
| `lib/export/excel.ts:340` | change | `bs.longTermDebt - allBS[i - 1].longTermDebt` | bs.longTermDebt, allBS[i-1].longTermDebt |
| `lib/export/excel.ts:348` | projIdx | `i - numHistorical` | i, numHistorical |
| `lib/export/excel.ts:352` | cfIdx | `i - 1` | i |
| `lib/export/excel.ts:356` | (return) | `ni !== 0 ? Math.abs(divPaid) / ni : 0` | ni, Math.abs, divPaid |
| `lib/export/excel.ts:365` | (return) | `Math.abs(bs.treasuryStock - allBS[i - 1].treasuryStock)` | Math.abs, bs.treasuryStock, allBS[i-1].treasuryStock |
| `lib/export/excel.ts:398` | projectionYears | `nYears - numHistorical` | nYears, numHistorical |
| `lib/export/excel.ts:414` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:417` | (inline) | `numHistorical + 1` | numHistorical |
| `lib/export/excel.ts:428` | hc | `hdSheet.getCell(hdRow, i + 2)` | hdSheet.getCell, hdRow, i |
| `lib/export/excel.ts:442` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:454` | cell | `hdSheet.getCell(hdRow, i + 2)` | hdSheet.getCell, hdRow, i |
| `lib/export/excel.ts:467` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:468` | cell | `hdSheet.getCell(hdRow, i + 2)` | hdSheet.getCell, hdRow, i |
| `lib/export/excel.ts:575` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:586` | base | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:587` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:602` | c | `colLetter(histYearIdx + 2)` | colLetter, histYearIdx |
| `lib/export/excel.ts:631` | cell | `aSheet.getCell(aRow, i + 2)` | aSheet.getCell, aRow, i |
| `lib/export/excel.ts:649` | f | `opts.historicalFormula(colLetter(i + 2), i)` | opts.historicalFormula, colLetter, i |
| `lib/export/excel.ts:692` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:759` | cfIdx | `i - 1` | i |
| `lib/export/excel.ts:834` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:885` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:935` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:945` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:951` | prev | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:961` | c | `colLetter(yearIdx + 2)` | colLetter, yearIdx |
| `lib/export/excel.ts:976` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:979` | isSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:979` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:993` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:994` | cell | `isSheet.getCell(isRow, i + 2)` | isSheet.getCell, isRow, i |
| `lib/export/excel.ts:1016` | cell | `isSheet.getCell(isRow, i + 2)` | isSheet.getCell, isRow, i |
| `lib/export/excel.ts:1020` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1029` | prevC | `colLetter(i + 1)` | colLetter, i |
| `lib/export/excel.ts:1091` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1204` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1205` | cell | `isSheet.getCell(isRow, i + 2)` | isSheet.getCell, isRow, i |
| `lib/export/excel.ts:1231` | prevCum | `aRef('legalReserveComputed', yr - 1)` | aRef, yr |
| `lib/export/excel.ts:1255` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1256` | cell | `isSheet.getCell(isRow, i + 2)` | isSheet.getCell, isRow, i |
| `lib/export/excel.ts:1285` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1286` | cell | `isSheet.getCell(isRow, i + 2)` | isSheet.getCell, isRow, i |
| `lib/export/excel.ts:1360` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:1362` | bsSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:1362` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:1376` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1377` | cell | `bsSheet.getCell(bsRow, i + 2)` | bsSheet.getCell, bsRow, i |
| `lib/export/excel.ts:1432` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1433` | cell | `bsSheet.getCell(bsRow, i + 2)` | bsSheet.getCell, bsRow, i |
| `lib/export/excel.ts:1461` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1472` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1488` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1560` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1561` | cell | `bsSheet.getCell(bsRow, i + 2)` | bsSheet.getCell, bsRow, i |
| `lib/export/excel.ts:1588` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1635` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1646` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1657` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1668` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:1698` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1699` | cell | `bsSheet.getCell(bsRows['cash'], i + 2)` | bsSheet.getCell, bsRows, i |
| `lib/export/excel.ts:1716` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1717` | cell | `bsSheet.getCell(bsRow, i + 2)` | bsSheet.getCell, bsRow, i |
| `lib/export/excel.ts:1727` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:1728` | cell | `bsSheet.getCell(bsRow, i + 2)` | bsSheet.getCell, bsRow, i |
| `lib/export/excel.ts:1747` | (inline) | `j + 2` | j |
| `lib/export/excel.ts:1749` | cfSheet.getCell(1, j + 2).value | `cfPeriods[j] ?? `Year ${j + 1}`` | cfPeriods, j |
| `lib/export/excel.ts:1749` | (inline) | `j + 2` | j |
| `lib/export/excel.ts:1763` | cfCol | `colLetter(j + 2)` | colLetter, j |
| `lib/export/excel.ts:1764` | isYr | `j + cfOffset` | j, cfOffset |
| `lib/export/excel.ts:1765` | isCol | `colLetter(isYr + 2)` | colLetter, isYr |
| `lib/export/excel.ts:1766` | cell | `cfSheet.getCell(cfRow, j + 2)` | cfSheet.getCell, cfRow, j |
| `lib/export/excel.ts:1813` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1822` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1831` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1841` | (return) | ``${aRef('eosProvisionComputed', isYr)}-${aRef('eosProvisionComputed', isYr - 1)}`` | aRef, isYr |
| `lib/export/excel.ts:1854` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1861` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1868` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1876` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1883` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1890` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1898` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1905` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1939` | prior | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:1948` | prior | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:2017` | c | `colLetter(isYr + 2)` | colLetter, isYr |
| `lib/export/excel.ts:2018` | prev | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:2035` | c | `colLetter(isYr + 2)` | colLetter, isYr |
| `lib/export/excel.ts:2036` | prev | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:2063` | priorIsCol | `colLetter(isYr + 1)` | colLetter, isYr |
| `lib/export/excel.ts:2094` | cfCol | `colLetter(j + 2)` | colLetter, j |
| `lib/export/excel.ts:2095` | isYr | `j + cfOffset` | j, cfOffset |
| `lib/export/excel.ts:2096` | isCol | `colLetter(isYr + 2)` | colLetter, isYr |
| `lib/export/excel.ts:2097` | cell | `cfSheet.getCell(cfRow, j + 2)` | cfSheet.getCell, cfRow, j |
| `lib/export/excel.ts:2128` | cfJ | `i - cfOffset` | i, cfOffset |
| `lib/export/excel.ts:2130` | cfCol | `colLetter(cfJ + 2)` | colLetter, cfJ |
| `lib/export/excel.ts:2131` | cell | `bsSheet.getCell(bsRows['cash'], i + 2)` | bsSheet.getCell, bsRows, i |
| `lib/export/excel.ts:2153` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2155` | ratioSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:2155` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2165` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:2166` | cell | `ratioSheet.getCell(rRow, i + 2)` | ratioSheet.getCell, rRow, i |
| `lib/export/excel.ts:2253` | pc | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2261` | pc | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2434` | lastHistColIdx | `sheetNumHistorical + 1` | sheetNumHistorical |
| `lib/export/excel.ts:2435` | firstProjColIdx | `sheetNumHistorical + 2` | sheetNumHistorical |
| `lib/export/excel.ts:2451` | (inline) | `sheetTotalCols + 1` | sheetTotalCols |
| `lib/export/excel.ts:2463` | cell | `sheet.getCell(1, i + 2)` | sheet.getCell, i |
| `lib/export/excel.ts:2492` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2494` | wcSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:2494` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2508` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:2509` | cell | `wcSheet.getCell(wcRow, i + 2)` | wcSheet.getCell, wcRow, i |
| `lib/export/excel.ts:2596` | (return) | `(b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.other` | b.accountsReceivable, b.inventory, b.prepaidExpenses, b.otherCurrentAssets, b.accountsPayable, b.accruedExpenses, b.deferredRevenue |
| `lib/export/excel.ts:2604` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2609` | pb | `results.balanceSheets[yr - 1]` | results.balanceSheets, yr |
| `lib/export/excel.ts:2610` | nwc | `(b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.other` | b.accountsReceivable, b.inventory, b.prepaidExpenses, b.otherCurrentAssets, b.accountsPayable, b.accruedExpenses, b.deferredRevenue |
| `lib/export/excel.ts:2611` | pnwc | `(pb.accountsReceivable + pb.inventory + pb.prepaidExpenses + pb.otherCurrentAssets) - (pb.accountsPayable + pb.accruedExpenses + pb.deferredRevenue + ` | pb.accountsReceivable, pb.inventory, pb.prepaidExpenses, pb.otherCurrentAssets, pb.accountsPayable, pb.accruedExpenses, pb.deferredRevenue |
| `lib/export/excel.ts:2612` | (return) | `nwc - pnwc` | nwc, pnwc |
| `lib/export/excel.ts:2619` | nwc | `(b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.other` | b.accountsReceivable, b.inventory, b.prepaidExpenses, b.otherCurrentAssets, b.accountsPayable, b.accruedExpenses, b.deferredRevenue |
| `lib/export/excel.ts:2620` | (return) | `results.incomeStatements[yr].revenue !== 0 ? nwc / results.incomeStatements[yr].revenue : 0` | results.incomeStatements[yr].revenue, nwc |
| `lib/export/excel.ts:2633` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2635` | depSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:2635` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2649` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:2650` | cell | `depSheet.getCell(depRow, i + 2)` | depSheet.getCell, depRow, i |
| `lib/export/excel.ts:2670` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2673` | (inline) | `yr - 1` | yr |
| `lib/export/excel.ts:2682` | cfIdx | `yr - 1` | yr |
| `lib/export/excel.ts:2699` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2702` | (inline) | `yr - 1` | yr |
| `lib/export/excel.ts:2732` | cfIdx | `yr - 1` | yr |
| `lib/export/excel.ts:2734` | (return) | `results.incomeStatements[yr].revenue !== 0 ? capex / results.incomeStatements[yr].revenue : 0` | results.incomeStatements[yr].revenue, capex |
| `lib/export/excel.ts:2740` | (inline) | `results.incomeStatements[yr].depreciation / results.balanceSheets[yr].grossPPE` | results.incomeStatements[yr].depreciation, results.balanceSheets[yr].grossPPE |
| `lib/export/excel.ts:2746` | r | `results.balanceSheets[yr].grossPPE !== 0 ? results.incomeStatements[yr].depreciation / results.balanceSheets[yr].grossPPE : 0` | results.balanceSheets[yr].grossPPE, results.incomeStatements[yr].depreciation |
| `lib/export/excel.ts:2747` | (return) | `r !== 0 ? 1 / r : 0` | r |
| `lib/export/excel.ts:2774` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2776` | debtSheet.getCell(1, i + 2).value | `periods[i] ?? `Year ${i + 1}`` | periods, i |
| `lib/export/excel.ts:2776` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:2790` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:2791` | cell | `debtSheet.getCell(dbtRow, i + 2)` | debtSheet.getCell, dbtRow, i |
| `lib/export/excel.ts:2811` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2814` | (inline) | `yr - 1` | yr |
| `lib/export/excel.ts:2822` | cfIdx | `yr - 1` | yr |
| `lib/export/excel.ts:2832` | cfIdx | `yr - 1` | yr |
| `lib/export/excel.ts:2862` | (return) | `b.shortTermDebt + b.longTermDebt + b.currentPortionLTD` | b.shortTermDebt, b.longTermDebt, b.currentPortionLTD |
| `lib/export/excel.ts:2874` | prevC | `colLetter(yr + 1)` | colLetter, yr |
| `lib/export/excel.ts:2879` | td | `b.shortTermDebt + b.longTermDebt + b.currentPortionLTD` | b.shortTermDebt, b.longTermDebt, b.currentPortionLTD |
| `lib/export/excel.ts:2881` | pb | `results.balanceSheets[yr - 1]` | results.balanceSheets, yr |
| `lib/export/excel.ts:2882` | ptd | `pb.shortTermDebt + pb.longTermDebt + pb.currentPortionLTD` | pb.shortTermDebt, pb.longTermDebt, pb.currentPortionLTD |
| `lib/export/excel.ts:2883` | (return) | `(td + ptd) / 2` | td, ptd |
| `lib/export/excel.ts:2896` | (inline) | `results.incomeStatements[yr].interestExpense - results.incomeStatements[yr].interestIncome` | results.incomeStatements[yr].interestExpense, results.incomeStatements[yr].interestIncome |
| `lib/export/excel.ts:2922` | (inline) | `(results.balanceSheets[yr].shortTermDebt + results.balanceSheets[yr].longTermDebt + results.balanceSheets[yr].currentPortionLTD) / results.incomeState` | results.balanceSheets[yr].shortTermDebt, results.balanceSheets[yr].longTermDebt, results.balanceSheets[yr].currentPortionLTD, results.incomeStatements[yr].ebitda |
| `lib/export/excel.ts:2951` | scenarioControlRow | `aRow + 2` | aRow |
| `lib/export/excel.ts:2952` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2952` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2952` | (inline) | `nYears + 1` | nYears |
| `lib/export/excel.ts:2953` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2954` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2955` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2956` | (inline) | `aRow + 1` | aRow |
| `lib/export/excel.ts:2962` | (inline) | `nYears + 1` | nYears |
| `lib/export/excel.ts:2964` | (inline) | `scenarioControlRow + 1` | scenarioControlRow |
| `lib/export/excel.ts:2965` | (inline) | `scenarioControlRow + 1` | scenarioControlRow |
| `lib/export/excel.ts:2966` | (inline) | `scenarioControlRow + 1` | scenarioControlRow |
| `lib/export/excel.ts:2966` | (inline) | `scenarioControlRow + 1` | scenarioControlRow |
| `lib/export/excel.ts:2966` | (inline) | `nYears + 1` | nYears |
| `lib/export/excel.ts:2970` | nProj | `nYears - numHistorical` | nYears, numHistorical |
| `lib/export/excel.ts:2982` | yearIdx | `numHistorical + pi` | numHistorical, pi |
| `lib/export/excel.ts:2983` | cellCol | `yearIdx + 2` | yearIdx |
| `lib/export/excel.ts:2984` | scenCol | `colLetter(yearIdx + 2)` | colLetter, yearIdx |
| `lib/export/excel.ts:3003` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3007` | (inline) | `nYears + 1` | nYears |
| `lib/export/excel.ts:3015` | vatSheet.getCell(vRow, 1).value | ``VAT Rate: ${(vatRate * 100).toFixed(0)}% (Egyptian standard [U+00E2][U+20AC][U+201D] Law 67/2016)`` | (vatRate*100).toFixed |
| `lib/export/excel.ts:3021` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3029` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3030` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3031` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3032` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3040` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3041` | result | `(results.incomeStatements[i]?.revenue ?? 0) * vatRate` | results.incomeStatements[i]?.revenue, vatRate |
| `lib/export/excel.ts:3042` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3046` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3047` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3055` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3056` | result | `(results.incomeStatements[i]?.cogs ?? 0) * vatRate` | results.incomeStatements[i]?.cogs, vatRate |
| `lib/export/excel.ts:3057` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3061` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3062` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3070` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3071` | capex | `(results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0)` | results.incomeStatements[i]?.revenue, allCapex, i |
| `lib/export/excel.ts:3072` | result | `capex * vatRate` | capex, vatRate |
| `lib/export/excel.ts:3073` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3077` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3078` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3087` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3088` | vatSheet.getCell(vRow, i + 2).value | `{ formula: `${c}${inputVATRow}+${c}${capexVATRow}`, result: ((results.incomeStatements[i]?.cogs ?? 0) + (results.incomeStatements[i]?.revenue ?? 0) * ` | formula, c, inputVATRow, capexVATRow, result, results.incomeStatements[i]?.cogs, results.incomeStatements[i]?.revenue |
| `lib/export/excel.ts:3088` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3090` | result | `((results.incomeStatements[i]?.cogs ?? 0) + (results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0)) * vatRate` | results.incomeStatements[i]?.cogs, results.incomeStatements[i]?.revenue, allCapex, i, vatRate |
| `lib/export/excel.ts:3092` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3093` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3104` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3105` | outputV | `(results.incomeStatements[i]?.revenue ?? 0) * vatRate` | results.incomeStatements[i]?.revenue, vatRate |
| `lib/export/excel.ts:3106` | inputV | `((results.incomeStatements[i]?.cogs ?? 0) + (results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0)) * vatRate` | results.incomeStatements[i]?.cogs, results.incomeStatements[i]?.revenue, allCapex, i, vatRate |
| `lib/export/excel.ts:3107` | vatSheet.getCell(vRow, i + 2).value | `{ formula: `${c}${outputVATRow}-${c}${totalInputVATRow}`, result: outputV - inputV, }` | formula, c, outputVATRow, totalInputVATRow, result, outputV, inputV |
| `lib/export/excel.ts:3107` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3109` | result | `outputV - inputV` | outputV, inputV |
| `lib/export/excel.ts:3111` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3112` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3126` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3127` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3131` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3132` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3139` | c | `colLetter(i + 2)` | colLetter, i |
| `lib/export/excel.ts:3140` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3144` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3145` | (inline) | `i + 2` | i |
| `lib/export/excel.ts:3323` | computed | `Math.min(Math.max(maxLength + 3, 12), 32)` | Math.min, Math.max, maxLength |
| `lib/export/pdf.ts:47` | (return) | ``${_currencySymbol}${(v / 1e9).toFixed(1)}B`` | _currencySymbol, (v/1e9).toFixed |
| `lib/export/pdf.ts:48` | (return) | ``${_currencySymbol}${(v / 1e6).toFixed(1)}M`` | _currencySymbol, (v/1e6).toFixed |
| `lib/export/pdf.ts:49` | (return) | ``${_currencySymbol}${(v / 1e3).toFixed(1)}K`` | _currencySymbol, (v/1e3).toFixed |
| `lib/export/pdf.ts:55` | (return) | ``${(v * 100).toFixed(1)}%`` | (v*100).toFixed |
| `lib/export/pdf.ts:77` | (inline) | `pw - 14` | pw |
| `lib/export/pdf.ts:77` | (inline) | `ph - 6` | ph |
| `lib/export/pdf.ts:92` | (inline) | `pw - 14` | pw |
| `lib/export/pdf.ts:98` | (inline) | `doc.internal.pageSize.getWidth() - 28` | doc.internal.pageSize.getWidth |
| `lib/export/pdf.ts:101` | (inline) | `y + 4.2` | y |
| `lib/export/pdf.ts:102` | (return) | `y + 8` | y |
| `lib/export/pdf.ts:128` | lastIS | `results.incomeStatements[nYears - 1]` | results.incomeStatements, nYears |
| `lib/export/pdf.ts:129` | lastBS | `results.balanceSheets[nYears - 1]` | results.balanceSheets, nYears |
| `lib/export/pdf.ts:130` | lastCF | `results.cashFlowStatements[results.cashFlowStatements.length - 1]` | results.cashFlowStatements, results.cashFlowStatements.length |
| `lib/export/pdf.ts:131` | lastRatios | `results.ratios[nYears - 1]` | results.ratios, nYears |
| `lib/export/pdf.ts:143` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:147` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:151` | (inline) | `pw / 2 - 50` | pw |
| `lib/export/pdf.ts:151` | (inline) | `pw / 2 + 50` | pw |
| `lib/export/pdf.ts:154` | (inline) | `pw / 2 - 80` | pw |
| `lib/export/pdf.ts:158` | details | `[ `Period Coverage: ${periods[0]} [U+00E2][U+20AC][U+201D] ${periods[nYears - 1]}`, `Historical Periods: ${results.incomeStatements.filter(s => s.periodType === 'historical'` | periods, nYears, results.incomeStatements.filter(s=>s.periodType==='historical').length, results.incomeStatements.filter(s=>s.periodType==='projected').length, currency, currCfg.symbol, results.convergenceInfo.converged |
| `lib/export/pdf.ts:167` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:167` | (inline) | `95 + i * 8` | i |
| `lib/export/pdf.ts:172` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:172` | (inline) | `ph - 20` | ph |
| `lib/export/pdf.ts:176` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:176` | (inline) | `ph - 12` | ph |
| `lib/export/pdf.ts:186` | kpiCards | `[ { label: 'Revenue', value: fc(lastIS.revenue), sub: `Growth: ${fp(lastIS.revenueGrowthRate)}`, color: ACCENT_BLUE }, { label: 'EBITDA', value: fc(la` | label, value, fc, lastIS.revenue, sub, fp, lastIS.revenueGrowthRate |
| `lib/export/pdf.ts:188` | sub | ``Margin: ${fp(lastIS.ebitda / (lastIS.revenue \|\| 1))}`` | fp, lastIS.ebitda, lastIS.revenue |
| `lib/export/pdf.ts:191` | sub | ``FCF % Rev: ${fp(lastCF.freeCashFlow / (lastIS.revenue \|\| 1))}`` | fp, lastCF.freeCashFlow, lastIS.revenue |
| `lib/export/pdf.ts:193` | value | `fc(lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD)` | fc, lastBS.shortTermDebt, lastBS.longTermDebt, lastBS.currentPortionLTD |
| `lib/export/pdf.ts:197` | cardW | `(pw - 28 - 18) / 4` | pw |
| `lib/export/pdf.ts:200` | row | `Math.floor(i / 4)` | Math.floor, i |
| `lib/export/pdf.ts:202` | x | `14 + col * (cardW + 6)` | col, cardW |
| `lib/export/pdf.ts:203` | y | `24 + row * (cardH + 6)` | row, cardH |
| `lib/export/pdf.ts:212` | (inline) | `x + 6` | x |
| `lib/export/pdf.ts:212` | (inline) | `y + 7` | y |
| `lib/export/pdf.ts:216` | (inline) | `x + 6` | x |
| `lib/export/pdf.ts:216` | (inline) | `y + 17` | y |
| `lib/export/pdf.ts:220` | (inline) | `x + 6` | x |
| `lib/export/pdf.ts:220` | (inline) | `y + 24` | y |
| `lib/export/pdf.ts:226` | revenueCAGR | `nYears > 1 ? Math.pow(lastIS.revenue / (firstIS.revenue \|\| 1), 1 / (nYears - 1)) - 1 : 0` | nYears, Math.pow, lastIS.revenue, firstIS.revenue |
| `lib/export/pdf.ts:227` | highlights | `[ `Revenue CAGR (${periods[0]}[U+00E2][U+20AC][U+201C]${periods[nYears - 1]}): ${fp(revenueCAGR)}`, `Net margin improved from ${fp(firstIS.netMargin)} to ${fp(lastIS.netMarg` | periods, nYears, fp, revenueCAGR, firstIS.netMargin, lastIS.netMargin, fc |
| `lib/export/pdf.ts:240` | (inline) | `pw - 28` | pw |
| `lib/export/pdf.ts:241` | (inline) | `ey + 5` | ey |
| `lib/export/pdf.ts:271` | mY | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:275` | startY | `mY + 8` | mY |
| `lib/export/pdf.ts:280` | (inline) | `s.ebitda / (s.revenue \|\| 1)` | s.ebitda, s.revenue |
| `lib/export/pdf.ts:290` | oY | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:294` | startY | `oY + 8` | oY |
| `lib/export/pdf.ts:304` | (inline) | `s.totalOpex / (s.revenue \|\| 1)` | s.totalOpex, s.revenue |
| `lib/export/pdf.ts:545` | (inline) | `(b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.other` | b.accountsReceivable, b.inventory, b.prepaidExpenses, b.otherCurrentAssets, b.accountsPayable, b.accruedExpenses, b.deferredRevenue |
| `lib/export/pdf.ts:572` | (inline) | `v - nwcArr[i - 1]` | v, nwcArr, i |
| `lib/export/pdf.ts:573` | (inline) | `v / results.incomeStatements[i].revenue` | v, results.incomeStatements[i].revenue |
| `lib/export/pdf.ts:602` | (inline) | `i - 1` | i |
| `lib/export/pdf.ts:605` | cfIdx | `i - 1` | i |
| `lib/export/pdf.ts:611` | (inline) | `i - 1` | i |
| `lib/export/pdf.ts:620` | cfIdx | `i - 1` | i |
| `lib/export/pdf.ts:622` | (return) | `fp(results.incomeStatements[i].revenue !== 0 ? capex / results.incomeStatements[i].revenue : 0)` | fp, results.incomeStatements[i].revenue, capex |
| `lib/export/pdf.ts:624` | (inline) | `results.incomeStatements[i].depreciation / b.grossPPE` | results.incomeStatements[i].depreciation, b.grossPPE |
| `lib/export/pdf.ts:626` | r | `b.grossPPE !== 0 ? results.incomeStatements[i].depreciation / b.grossPPE : 0` | b.grossPPE, results.incomeStatements[i].depreciation |
| `lib/export/pdf.ts:627` | (return) | `r !== 0 ? `${(1 / r).toFixed(1)} yrs` : '[U+00E2][U+20AC][U+201D]'` | r, (1/r).toFixed |
| `lib/export/pdf.ts:656` | (inline) | `b.shortTermDebt + b.longTermDebt + b.currentPortionLTD` | b.shortTermDebt, b.longTermDebt, b.currentPortionLTD |
| `lib/export/pdf.ts:663` | (inline) | `i - 1` | i |
| `lib/export/pdf.ts:665` | cfIdx | `i - 1` | i |
| `lib/export/pdf.ts:669` | cfIdx | `i - 1` | i |
| `lib/export/pdf.ts:681` | (inline) | `(v + totalDebt[i - 1]) / 2` | v, totalDebt, i |
| `lib/export/pdf.ts:684` | (inline) | `s.interestExpense - s.interestIncome` | s.interestExpense, s.interestIncome |
| `lib/export/pdf.ts:690` | (inline) | `v / results.incomeStatements[i].ebitda` | v, results.incomeStatements[i].ebitda |
| `lib/export/pdf.ts:769` | (inline) | `vy + 5` | vy |
| `lib/export/pdf.ts:770` | (inline) | `vy + 5` | vy |
| `lib/export/pdf.ts:771` | (inline) | `vy + 5` | vy |
| `lib/export/pdf.ts:799` | failedCells | `totalCells - passedCells` | totalCells, passedCells |
| `lib/export/pdf.ts:827` | finalVY | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:830` | (inline) | `pw - 28` | pw |
| `lib/export/pdf.ts:837` | (inline) | `pw / 2` | pw |
| `lib/export/pdf.ts:837` | (inline) | `finalVY + 8` | finalVY |
| `lib/export/pdf.ts:871` | dcfTableY | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:875` | startY | `dcfTableY + 8` | dcfTableY |
| `lib/export/pdf.ts:878` | (inline) | `a + b` | a, b |
| `lib/export/pdf.ts:894` | fcfY | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:896` | (inline) | `i + 1` | i |
| `lib/export/pdf.ts:898` | startY | `fcfY + 8` | fcfY |
| `lib/export/pdf.ts:902` | (inline) | `1 / Math.pow(1 + dcf.wacc, i + 1)` | Math.pow, dcf.wacc, i |
| `lib/export/pdf.ts:990` | (inline) | `pw - 28` | pw |
| `lib/export/pdf.ts:993` | (inline) | `dy + 8` | dy |
| `lib/export/pdf.ts:994` | (inline) | `nYears - 1` | nYears |
| `lib/export/pdf.ts:994` | (inline) | `dy + 14` | dy |
| `lib/export/pdf.ts:995` | (inline) | `dy + 20` | dy |
| `lib/export/pdf.ts:996` | (inline) | `dy + 26` | dy |
| `lib/export/pdf.ts:1012` | startY | `ry + 2` | ry |
| `lib/export/pdf.ts:1027` | ry | `getAutoTableFinalY(doc) + 6` | getAutoTableFinalY, doc |
| `lib/export/pdf.ts:1031` | startY | `ry + 2` | ry |
| `lib/export/pdf.ts:1045` | ry | `getAutoTableFinalY(doc) + 8` | getAutoTableFinalY, doc |
| `lib/ratios.ts:15` | avgTotalAssets | `(bs.totalAssets + previousBS.totalAssets) / 2` | bs.totalAssets, previousBS.totalAssets |
| `lib/ratios.ts:16` | avgEquity | `(bs.totalEquity + previousBS.totalEquity) / 2` | bs.totalEquity, previousBS.totalEquity |
| `lib/ratios.ts:17` | avgInventory | `(bs.inventory + previousBS.inventory) / 2` | bs.inventory, previousBS.inventory |
| `lib/ratios.ts:18` | avgAR | `(bs.accountsReceivable + previousBS.accountsReceivable) / 2` | bs.accountsReceivable, previousBS.accountsReceivable |
| `lib/ratios.ts:21` | totalDebt | `bs.shortTermDebt + bs.longTermDebt + bs.currentPortionLTD` | bs.shortTermDebt, bs.longTermDebt, bs.currentPortionLTD |
| `lib/ratios.ts:22` | prevTotalDebt | `previousBS.shortTermDebt + previousBS.longTermDebt + previousBS.currentPortionLTD` | previousBS.shortTermDebt, previousBS.longTermDebt, previousBS.currentPortionLTD |
| `lib/ratios.ts:23` | investedCapital | `bs.totalEquity + totalDebt - bs.cash` | bs.totalEquity, totalDebt, bs.cash |
| `lib/ratios.ts:24` | prevInvestedCapital | `previousBS.totalEquity + prevTotalDebt - previousBS.cash` | previousBS.totalEquity, prevTotalDebt, previousBS.cash |
| `lib/ratios.ts:25` | avgInvestedCapital | `(investedCapital + prevInvestedCapital) / 2` | investedCapital, prevInvestedCapital |
| `lib/ratios.ts:28` | effectiveTaxRate | `is.ebt > 0 ? is.taxExpense / is.ebt : is.taxRate` | is.ebt, is.taxExpense, is.taxRate |
| `lib/ratios.ts:29` | nopat | `is.ebit * (1 - effectiveTaxRate)` | is.ebit, effectiveTaxRate |
| `lib/ratios.ts:32` | dso | `is.revenue !== 0 ? (bs.accountsReceivable / is.revenue) * 365 : 0` | is.revenue, bs.accountsReceivable |
| `lib/ratios.ts:33` | dio | `is.cogs !== 0 ? (bs.inventory / is.cogs) * 365 : 0` | is.cogs, bs.inventory |
| `lib/ratios.ts:34` | dpo | `is.cogs !== 0 ? (bs.accountsPayable / is.cogs) * 365 : 0` | is.cogs, bs.accountsPayable |
| `lib/ratios.ts:37` | roe | `avgEquity !== 0 ? is.netIncome / avgEquity : 0` | avgEquity, is.netIncome |
| `lib/ratios.ts:38` | roa | `avgTotalAssets !== 0 ? is.netIncome / avgTotalAssets : 0` | avgTotalAssets, is.netIncome |
| `lib/ratios.ts:39` | assetTurnover | `avgTotalAssets !== 0 ? is.revenue / avgTotalAssets : 0` | avgTotalAssets, is.revenue |
| `lib/ratios.ts:40` | equityMultiplier | `bs.totalEquity !== 0 ? bs.totalAssets / bs.totalEquity : 0` | bs.totalEquity, bs.totalAssets |
| `lib/ratios.ts:47` | dupontROE_3F | `dupontNetMargin * dupontAssetTurnover * dupontEquityMultiplier` | dupontNetMargin, dupontAssetTurnover, dupontEquityMultiplier |
| `lib/ratios.ts:50` | dupontTaxBurden | `is.ebt !== 0 ? is.netIncome / is.ebt : 1` | is.ebt, is.netIncome |
| `lib/ratios.ts:51` | dupontInterestBurden | `is.ebit !== 0 ? is.ebt / is.ebit : 1` | is.ebit, is.ebt |
| `lib/ratios.ts:52` | dupontOperatingMargin | `is.revenue !== 0 ? is.ebit / is.revenue : 0` | is.revenue, is.ebit |
| `lib/ratios.ts:53` | dupontROE_5F | `dupontTaxBurden * dupontInterestBurden * dupontOperatingMargin * dupontAssetTurnover * dupontEquityMultiplier` | dupontTaxBurden, dupontInterestBurden, dupontOperatingMargin, dupontAssetTurnover, dupontEquityMultiplier |
| `lib/ratios.ts:58` | workingCapital | `bs.totalCurrentAssets - bs.totalCurrentLiabilities` | bs.totalCurrentAssets, bs.totalCurrentLiabilities |
| `lib/ratios.ts:59` | x1 | `bs.totalAssets !== 0 ? workingCapital / bs.totalAssets : 0` | bs.totalAssets, workingCapital |
| `lib/ratios.ts:60` | x2 | `bs.totalAssets !== 0 ? bs.retainedEarnings / bs.totalAssets : 0` | bs.totalAssets, bs.retainedEarnings |
| `lib/ratios.ts:61` | x3 | `bs.totalAssets !== 0 ? is.ebit / bs.totalAssets : 0` | bs.totalAssets, is.ebit |
| `lib/ratios.ts:63` | x4 | `totalDebt !== 0 ? bookEquity / totalDebt : 0` | totalDebt, bookEquity |
| `lib/ratios.ts:64` | x5 | `bs.totalAssets !== 0 ? is.revenue / bs.totalAssets : 0` | bs.totalAssets, is.revenue |
| `lib/ratios.ts:65` | altmanZScore | `0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5` | x1, x2, x3, x4, x5 |
| `lib/ratios.ts:72` | altmanZScoreEM | `6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4` | x1, x2, x3, x4 |
| `lib/ratios.ts:78` | variableCostRatio | `is.revenue !== 0 ? is.cogs / is.revenue : 0` | is.revenue, is.cogs |
| `lib/ratios.ts:79` | contributionMarginRatio | `1 - variableCostRatio` | variableCostRatio |
| `lib/ratios.ts:80` | fixedCosts | `is.sgaExpense + is.depreciation + is.amortization + is.otherOpex + is.stockBasedComp + is.rdExpense` | is.sgaExpense, is.depreciation, is.amortization, is.otherOpex, is.stockBasedComp, is.rdExpense |
| `lib/ratios.ts:82` | breakEvenRevenue | `contributionMarginRatio !== 0 ? fixedCosts / contributionMarginRatio : 0` | contributionMarginRatio, fixedCosts |
| `lib/ratios.ts:83` | marginOfSafety | `is.revenue !== 0 ? (is.revenue - breakEvenRevenue) / is.revenue : 0` | is.revenue, breakEvenRevenue |
| `lib/ratios.ts:85` | contributionMargin | `is.revenue - is.cogs` | is.revenue, is.cogs |
| `lib/ratios.ts:86` | operatingLeverage | `is.ebit !== 0 ? contributionMargin / is.ebit : 0` | is.ebit, contributionMargin |
| `lib/ratios.ts:89` | netDebt | `totalDebt - bs.cash` | totalDebt, bs.cash |
| `lib/ratios.ts:90` | netDebtToEbitda | `is.ebitda !== 0 ? netDebt / is.ebitda : 0` | is.ebitda, netDebt |
| `lib/ratios.ts:94` | debtService | `is.interestExpense + scheduledPrincipal` | is.interestExpense, scheduledPrincipal |
| `lib/ratios.ts:95` | dscr | `!cf ? null : (debtService > 0 ? is.ebitda / debtService : null)` | cf, debtService, is.ebitda |
| `lib/ratios.ts:98` | fcfMargin | `cf ? (is.revenue !== 0 ? cf.freeCashFlow / is.revenue : 0) : null` | cf, is.revenue, cf.freeCashFlow |
| `lib/ratios.ts:99` | fcfToEbitda | `cf ? (is.ebitda !== 0 ? cf.freeCashFlow / is.ebitda : 0) : null` | cf, is.ebitda, cf.freeCashFlow |
| `lib/ratios.ts:102` | bookValuePerShare | `is.sharesOutstanding !== 0 ? bs.totalEquity / is.sharesOutstanding : 0` | is.sharesOutstanding, bs.totalEquity |
| `lib/ratios.ts:103` | fcfPerShare | `is.sharesOutstanding !== 0 ? is.fcff / is.sharesOutstanding : 0` | is.sharesOutstanding, is.fcff |
| `lib/ratios.ts:104` | revenuePerShare | `is.sharesOutstanding !== 0 ? is.revenue / is.sharesOutstanding : 0` | is.sharesOutstanding, is.revenue |
| `lib/ratios.ts:105` | eps | `is.sharesOutstanding !== 0 ? is.netIncomeAfterEPD / is.sharesOutstanding : 0` | is.sharesOutstanding, is.netIncomeAfterEPD |
| `lib/ratios.ts:107` | (return) | `{ period: is.period, // Profitability grossMargin: is.grossMargin, ebitdaMargin: is.revenue !== 0 ? is.ebitda / is.revenue : 0, operatingMargin: is.eb` | period, is.period, grossMargin, is.grossMargin, ebitdaMargin, is.revenue, is.ebitda |
| `lib/ratios.ts:112` | ebitdaMargin | `is.revenue !== 0 ? is.ebitda / is.revenue : 0` | is.revenue, is.ebitda |
| `lib/ratios.ts:118` | roic | `avgInvestedCapital !== 0 ? nopat / avgInvestedCapital : 0` | avgInvestedCapital, nopat |
| `lib/ratios.ts:121` | currentRatio | `bs.totalCurrentLiabilities !== 0 ? bs.totalCurrentAssets / bs.totalCurrentLiabilities : 0` | bs.totalCurrentLiabilities, bs.totalCurrentAssets |
| `lib/ratios.ts:124` | quickRatio | `bs.totalCurrentLiabilities !== 0 ? (bs.totalCurrentAssets - bs.inventory) / bs.totalCurrentLiabilities : 0` | bs.totalCurrentLiabilities, bs.totalCurrentAssets, bs.inventory |
| `lib/ratios.ts:126` | cashRatio | `bs.totalCurrentLiabilities !== 0 ? bs.cash / bs.totalCurrentLiabilities : 0` | bs.totalCurrentLiabilities, bs.cash |
| `lib/ratios.ts:130` | debtToEquity | `bs.totalEquity !== 0 ? totalDebt / bs.totalEquity : 0` | bs.totalEquity, totalDebt |
| `lib/ratios.ts:131` | debtToAssets | `bs.totalAssets !== 0 ? totalDebt / bs.totalAssets : 0` | bs.totalAssets, totalDebt |
| `lib/ratios.ts:132` | interestCoverage | `is.interestExpense !== 0 ? is.ebit / is.interestExpense : 0` | is.interestExpense, is.ebit |
| `lib/ratios.ts:139` | inventoryTurnover | `avgInventory !== 0 ? is.cogs / avgInventory : 0` | avgInventory, is.cogs |
| `lib/ratios.ts:140` | receivablesTurnover | `avgAR !== 0 ? is.revenue / avgAR : 0` | avgAR, is.revenue |
| `lib/ratios.ts:144` | cashConversionCycle | `dso + dio - dpo` | dso, dio, dpo |
| `lib/schedules/egyptian-depreciation.ts:54` | depreciableBase | `previousNetPPE + capex` | previousNetPPE, capex |
| `lib/schedules/egyptian-depreciation.ts:59` | classBase | `depreciableBase * fraction` | depreciableBase, fraction |
| `lib/schedules/egyptian-depreciation.ts:62` | byClass[cls] | `classBase * rateObj.rate` | classBase, rateObj.rate |
| `lib/schedules/egyptian-depreciation.ts:82` | (inline) | `s + w` | s, w |
| `lib/schedules/egyptian-depreciation.ts:84` | (return) | `weights.reduce((sum, w, i) => sum + w * rates[i], 0) / totalWeight` | weights.reduce, sum, w, i, rates, totalWeight |
| `lib/schedules/egyptian-depreciation.ts:96` | avgGrossPPE | `previousGrossPPE + capex / 2` | previousGrossPPE, capex |
| `lib/schedules/egyptian-depreciation.ts:97` | (return) | `avgGrossPPE * rate` | avgGrossPPE, rate |
| `lib/services/analyst.ts:110` | tl | `b.totalLiabilities ?? ((b.totalLiabilitiesEquity ?? 0) - (b.totalEquity ?? 0))` | b.totalLiabilities, b.totalLiabilitiesEquity, b.totalEquity |
| `lib/services/analyst.ts:111` | tle | `b.totalLiabilitiesEquity ?? (tl + (b.totalEquity ?? 0))` | b.totalLiabilitiesEquity, tl, b.totalEquity |
| `lib/services/analyst.ts:113` | diff | `Math.abs(ta - tle)` | Math.abs, ta, tle |
| `lib/services/analyst.ts:125` | reOpen | `BS[i - 1]?.retainedEarnings ?? 0` | BS[i-1]?.retainedEarnings |
| `lib/services/analyst.ts:127` | reCalc | `reOpen + addToRE` | reOpen, addToRE |
| `lib/services/analyst.ts:129` | match | `Math.abs(reCalc - bsRE) < 1` | Math.abs, reCalc, bsRE |
| `lib/services/analyst.ts:131` | (inline) | `reCalc - bsRE` | reCalc, bsRE |
| `lib/services/analyst.ts:148` | match | `Math.abs(endCash - bsCash) < 0.1` | Math.abs, endCash, bsCash |
| `lib/services/liveRates.ts:72` | cachedRates | `{ ...FALLBACK_RATES, usdEgpRate: egp, eurEgpRate: egp / (fxData.rates?.EUR ?? 0.92), sarEgpRate: egp / (fxData.rates?.SAR ?? 3.75), aedEgpRate: egp / ` | FALLBACK_RATES, usdEgpRate, egp, eurEgpRate, fxData.rates?.EUR, sarEgpRate, fxData.rates?.SAR |
| `lib/services/liveRates.ts:75` | eurEgpRate | `egp / (fxData.rates?.EUR ?? 0.92)` | egp, fxData.rates?.EUR |
| `lib/services/liveRates.ts:76` | sarEgpRate | `egp / (fxData.rates?.SAR ?? 3.75)` | egp, fxData.rates?.SAR |
| `lib/services/liveRates.ts:77` | aedEgpRate | `egp / (fxData.rates?.AED ?? 3.67)` | egp, fxData.rates?.AED |
| `lib/services/liveRates.ts:112` | (inline) | `rates.cbeLendingRate + 0.02 - (i * 0.01)` | rates.cbeLendingRate, i |
| `lib/services/liveRates.ts:115` | (inline) | `rates.cbeDepositRate - (i * 0.01)` | rates.cbeDepositRate, i |
| `lib/store.ts:225` | lastIS | `results.incomeStatements[results.incomeStatements.length - 1]` | results.incomeStatements, results.incomeStatements.length |
| `lib/store.ts:249` | dataVersion | `state.dataVersion + 1` | state.dataVersion |
| `lib/store.ts:336` | dataVersion | `state.dataVersion + 1` | state.dataVersion |
| `lib/store.ts:412` | entry | `state.undoStack[state.undoStack.length - 1]` | state.undoStack, state.undoStack.length |
| `lib/store.ts:443` | entry | `state.redoStack[state.redoStack.length - 1]` | state.redoStack, state.redoStack.length |
| `lib/store.ts:670` | (inline) | `r - 0.22` | r |
| `lib/store.ts:677` | (inline) | `r - 0.18` | r |
| `lib/utils.ts:39` | (return) | ``${cfg.symbol}${(value / 1_000_000_000).toFixed(1)}B`` | cfg.symbol, (value/1_000_000_000).toFixed |
| `lib/utils.ts:40` | (return) | ``${cfg.symbol}${(value / 1_000_000).toFixed(1)}M`` | cfg.symbol, (value/1_000_000).toFixed |
| `lib/utils.ts:41` | (return) | ``${cfg.symbol}${(value / 1_000).toFixed(1)}K`` | cfg.symbol, (value/1_000).toFixed |
| `lib/utils.ts:54` | (return) | ``${(value * 100).toFixed(decimals)}%`` | (value*100).toFixed, decimals |
| `types/assumptions.ts:379` | netPPE | `grossPPE[i] - accumulatedDepreciation[i]` | grossPPE, i, accumulatedDepreciation |
| `types/assumptions.ts:380` | totalCA | `cash[i] + accountsReceivable[i] + inventory[i] + prepaidExpenses[i] + otherCurrentAssets[i]` | cash, i, accountsReceivable, inventory, prepaidExpenses, otherCurrentAssets |
| `types/assumptions.ts:381` | totalNCA | `netPPE + intangibles[i] + goodwill[i] + otherLongTermAssets[i]` | netPPE, intangibles, i, goodwill, otherLongTermAssets |
| `types/assumptions.ts:382` | totalAssets | `totalCA + totalNCA` | totalCA, totalNCA |
| `types/assumptions.ts:384` | totalCL | `accountsPayable[i] + accruedExpenses[i] + shortTermDebt[i] + currentPortionLTD[i] + deferredRevenue[i] + otherCurrentLiabilities[i]` | accountsPayable, i, accruedExpenses, shortTermDebt, currentPortionLTD, deferredRevenue, otherCurrentLiabilities |
| `types/assumptions.ts:386` | totalNCL | `longTermDebt[i] + deferredTaxLiabilities[i] + otherLongTermLiabilities[i]` | longTermDebt, i, deferredTaxLiabilities, otherLongTermLiabilities |
| `types/assumptions.ts:387` | totalLiabilities | `totalCL + totalNCL` | totalCL, totalNCL |
| `types/assumptions.ts:389` | otherEquity | `commonStock[i] + additionalPaidInCapital[i] + treasuryStock[i] + otherComprehensiveIncome[i]` | commonStock, i, additionalPaidInCapital, treasuryStock, otherComprehensiveIncome |
| `types/assumptions.ts:390` | (return) | `totalAssets - totalLiabilities - otherEquity` | totalAssets, totalLiabilities, otherEquity |
| `types/historical.ts:242` | grossProfit | `raw.revenue - raw.cogs` | raw.revenue, raw.cogs |
| `types/historical.ts:243` | totalOpex | `raw.sgaExpense + raw.rdExpense + raw.depreciation + raw.amortization + raw.otherOpex` | raw.sgaExpense, raw.rdExpense, raw.depreciation, raw.amortization, raw.otherOpex |
| `types/historical.ts:244` | ebit | `grossProfit - totalOpex` | grossProfit, totalOpex |
| `types/historical.ts:245` | ebt | `ebit + raw.interestIncome - raw.interestExpense + raw.otherIncomeExpense` | ebit, raw.interestIncome, raw.interestExpense, raw.otherIncomeExpense |
| `types/historical.ts:246` | netIncome | `ebt - raw.taxExpense` | ebt, raw.taxExpense |
| `types/historical.ts:249` | netPPE | `raw.grossPPE - raw.accumulatedDepreciation` | raw.grossPPE, raw.accumulatedDepreciation |
| `types/historical.ts:250` | totalCurrentAssets | `raw.cash + raw.accountsReceivable + raw.inventory + raw.prepaidExpenses + raw.otherCurrentAssets` | raw.cash, raw.accountsReceivable, raw.inventory, raw.prepaidExpenses, raw.otherCurrentAssets |
| `types/historical.ts:251` | totalNonCurrentAssets | `netPPE + raw.intangibleAssets + raw.goodwill + raw.otherLTAssets` | netPPE, raw.intangibleAssets, raw.goodwill, raw.otherLTAssets |
| `types/historical.ts:252` | totalAssets | `totalCurrentAssets + totalNonCurrentAssets` | totalCurrentAssets, totalNonCurrentAssets |
| `types/historical.ts:254` | totalCurrentLiabilities | `raw.accountsPayable + raw.accruedExpenses + raw.shortTermDebt + raw.currentPortionLTD + raw.deferredRevenue + raw.otherCurrentLiabilities` | raw.accountsPayable, raw.accruedExpenses, raw.shortTermDebt, raw.currentPortionLTD, raw.deferredRevenue, raw.otherCurrentLiabilities |
| `types/historical.ts:255` | totalNonCurrentLiabilities | `raw.longTermDebt + raw.deferredTaxLiabilities + raw.otherLTLiabilities` | raw.longTermDebt, raw.deferredTaxLiabilities, raw.otherLTLiabilities |
| `types/historical.ts:256` | totalLiabilities | `totalCurrentLiabilities + totalNonCurrentLiabilities` | totalCurrentLiabilities, totalNonCurrentLiabilities |
| `types/historical.ts:259` | otherEquity | `raw.commonStock + raw.additionalPaidInCapital + raw.treasuryStock + raw.otherComprehensiveIncome` | raw.commonStock, raw.additionalPaidInCapital, raw.treasuryStock, raw.otherComprehensiveIncome |
| `types/historical.ts:260` | retainedEarnings | `raw.retainedEarnings ?? (totalAssets - totalLiabilities - otherEquity)` | raw.retainedEarnings, totalAssets, totalLiabilities, otherEquity |
| `types/historical.ts:261` | totalEquity | `otherEquity + retainedEarnings` | otherEquity, retainedEarnings |
| `types/historical.ts:284` | diff | `Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity))` | Math.abs, data.totalAssets, data.totalLiabilities, data.totalEquity |
| `types/historical.ts:286` | (return) | ``${data.period}: Balance sheet does not balance. Assets=${data.totalAssets.toLocaleString()}, L+E=${(data.totalLiabilities + data.totalEquity).toLocal` | data.period, data.totalAssets.toLocaleString, (data.totalLiabilities+data.totalEquity).toLocaleString, diff.toFixed |

## 3. Duplicated calculations

### 3.1 Duplicates that disagree (these change numbers)

| Quantity | Locations | Disagreement |
|---|---|---|
| ROIC | `lib/ratios.ts:118` (average IC); `components/RatiosPage.tsx:44-55` (average IC); `lib/export/excel.ts:2205` (**ending IC**) | Exported formula 20.16% vs engine 21.06% for 2026E. |
| ROE, ROA | `lib/ratios.ts:37-38` (average balances); `components/RatiosPage.tsx:42-43` (**ending**) | Same label, different numbers on screen vs engine. |
| Altman EM zone | `lib/ratios.ts:73-74` (2.60 / 1.10); `lib/export/excel.ts:2390` (2.9 / 1.23) | Same score can be Safe in one, Grey in the other. |
| Altman label | `lib/ratios.ts:65` is Z' 5-factor; Excel row at `lib/export/excel.ts:2385` calls EM coefficients "Altman Z' Score". | Two variants under one name. |
| Interest basis | Code: `lib/engines/balance-sheet.ts:235` opening debt. Validator prompt: `lib/agents/validation-prompt.ts` rule 14 says average debt. Comment: `lib/engines/circular-resolver.ts:159` says beginning cash, code uses average. | Documentation contradicts code. |
| Default debt rate fallback | `lib/engines/circular-resolver.ts:71` 0.22; `lib/engines/dcf.ts:42` 0.18; `types/assumptions.ts:241` 0.045 | Three values for one fallback. |
| Scenario definitions | `lib/scenario-manager.ts:34-59`; `lib/scenarios.ts` | Two sets. The exporter and the comparison modal read `lib/scenarios.ts`; the store reads scenario-manager. |
| Global keys list | `lib/store.ts:273-284`; `lib/export/excel.ts:206-217` | Hand-synced copies, the code comment says "MUST match". |

### 3.2 Same-value duplicates (each one is a future divergence)

| Quantity | Locations |
|---|---|
| Debt repayment schedule | `lib/engines/balance-sheet.ts:93-112`; `lib/engines/cash-flow.ts:74-93` |
| Capex | `lib/engines/balance-sheet.ts:46`; `lib/engines/cash-flow.ts:56`; `lib/engines/circular-resolver.ts:61` |
| Total debt | `lib/ratios.ts:21`; `lib/engines/dcf.ts:48,121`; `lib/engines/valuation.ts:50,98`; `lib/engines/integrator.ts:273`; `components/Dashboard.tsx:24`; `components/schedules/DebtSchedulePage.tsx:29`; `components/RatiosPage.tsx:29` |
| Net debt | `lib/ratios.ts:89`; `lib/engines/dcf.ts:122`; `lib/engines/valuation.ts:51,99`; `components/Dashboard.tsx:33`; `components/RatiosPage.tsx:72` |
| NOPAT and effective tax | `lib/engines/income-statement.ts:290-291`; `lib/ratios.ts:28-29`; `lib/engines/circular-resolver.ts:470-473`; `lib/agents/validation-rules.ts`; `components/RatiosPage.tsx:47-48` |
| EBITDA | `lib/engines/income-statement.ts:204`; `components/RatiosPage.tsx:30`; Excel formula rows |
| NWC | `lib/engines/circular-resolver.ts:57,112`; `components/schedules/WorkingCapitalPage.tsx:25,27` |
| Historical subtotals (6 files) | `lib/engines/income-statement.ts:378-472`; `lib/engines/balance-sheet.ts:280-296`; `types/historical.ts`; `types/assumptions.ts:378-391`; `components/HistoricalDataInput.tsx`; `components/HistoricalImportPage.tsx` |
| Whole model, as Excel formulas | `lib/export/excel.ts` writes a second copy of the model logic as formula templates, and also back-computes drivers from results at `:269-366`. |
| Validation rules | `lib/engines/circular-resolver.ts:196-560`; `lib/agents/validation-rules.ts`; `lib/agents/validation-prompt.ts`; `lib/services/analyst.ts:3-27` restate the same equations. |

### 3.3 Mechanical list: same target name computed in more than one file (49)

Includes harmless index helpers. Use 3.1 and 3.2 for judgement.

| files | name | where |
|---|---|---|
| 9 | `lastIS` | components/Dashboard.tsx, components/ScenarioComparisonModal.tsx, components/ScenariosPage.tsx, lib/engines/dcf.ts, lib/engines/integrator.ts, lib/engines/valuation.ts, lib/export/build-dashboard.ts, lib/export/pdf.ts, lib/store.ts |
| 8 | `lastBS` | components/Dashboard.tsx, components/ScenarioComparisonModal.tsx, components/ScenariosPage.tsx, lib/engines/dcf.ts, lib/engines/integrator.ts, lib/engines/valuation.ts, lib/export/build-dashboard.ts, lib/export/pdf.ts |
| 7 | `lastCF` | components/Dashboard.tsx, components/ScenarioComparisonModal.tsx, components/ScenariosPage.tsx, lib/engines/integrator.ts, lib/engines/valuation.ts, lib/export/build-dashboard.ts, lib/export/pdf.ts |
| 7 | `prev` | components/RatiosPage.tsx, components/schedules/DebtSchedulePage.tsx, components/schedules/DepreciationPage.tsx, components/schedules/WorkingCapitalPage.tsx, lib/agents/validation-rules.ts, lib/engines/cash-flow.ts, lib/export/excel.ts |
| 6 | `cfIdx` | components/schedules/DebtSchedulePage.tsx, components/schedules/DepreciationPage.tsx, lib/export/build-dashboard.ts, lib/export/build-scenarios.ts, lib/export/excel.ts, lib/export/pdf.ts |
| 6 | `sep` | components/schedules/DebtSchedulePage.tsx, components/schedules/DepreciationPage.tsx, components/schedules/WorkingCapitalPage.tsx, components/statements/BalanceSheetPage.tsx, components/statements/CashFlowPage.tsx, components/statements/IncomeStatementPage.tsx |
| 6 | `totalDebt` | components/Dashboard.tsx, components/schedules/DebtSchedulePage.tsx, lib/engines/dcf.ts, lib/engines/integrator.ts, lib/engines/valuation.ts, lib/ratios.ts |
| 5 | `netPPE` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/assumptions.ts, types/historical.ts |
| 5 | `totalAssets` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/assumptions.ts, types/historical.ts |
| 5 | `totalLiabilities` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/assumptions.ts, types/historical.ts |
| 4 | `capex` | lib/engines/balance-sheet.ts, lib/engines/cash-flow.ts, lib/engines/circular-resolver.ts, lib/export/excel.ts |
| 4 | `ebit` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/income-statement.ts, types/historical.ts |
| 4 | `ebt` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/income-statement.ts, types/historical.ts |
| 4 | `effectiveTaxRate` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts, lib/engines/income-statement.ts, lib/ratios.ts |
| 4 | `grossProfit` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/income-statement.ts, types/historical.ts |
| 4 | `netIncome` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/income-statement.ts, types/historical.ts |
| 4 | `nopat` | components/RatiosPage.tsx, lib/agents/validation-rules.ts, lib/engines/income-statement.ts, lib/ratios.ts |
| 4 | `period` | components/Dashboard.tsx, components/ValidationPage.tsx, lib/engines/balance-sheet.ts, lib/engines/cash-flow.ts |
| 4 | `totalCurrentAssets` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/historical.ts |
| 4 | `totalCurrentLiabilities` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/historical.ts |
| 4 | `totalEquity` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/historical.ts |
| 4 | `totalNonCurrentAssets` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/historical.ts |
| 4 | `totalNonCurrentLiabilities` | components/HistoricalDataInput.tsx, components/HistoricalImportPage.tsx, lib/engines/balance-sheet.ts, types/historical.ts |
| 4 | `value` | components/Dashboard.tsx, components/schedules/DepreciationPage.tsx, lib/export/excel.ts, lib/export/pdf.ts |
| 3 | `diff` | lib/agents/validation-rules.ts, lib/services/analyst.ts, types/historical.ts |
| 3 | `netDebt` | lib/engines/dcf.ts, lib/engines/valuation.ts, lib/ratios.ts |
| 3 | `projIdx` | lib/agents/validation-rules.ts, lib/export/build-scenarios.ts, lib/export/excel.ts |
| 3 | `sub` | components/Dashboard.tsx, components/schedules/WorkingCapitalPage.tsx, lib/export/pdf.ts |
| 3 | `totalOpex` | components/HistoricalDataInput.tsx, lib/engines/income-statement.ts, types/historical.ts |
| 2 | `avgEquity` | lib/agents/validation-rules.ts, lib/ratios.ts |
| 2 | `bookValuePerShare` | lib/engines/valuation.ts, lib/ratios.ts |
| 2 | `cards` | components/schedules/DepreciationPage.tsx, components/schedules/WorkingCapitalPage.tsx |
| 2 | `change` | lib/export/build-scenarios.ts, lib/export/excel.ts |
| 2 | `debtPrev` | components/RatiosPage.tsx, lib/agents/validation-rules.ts |
| 2 | `debtService` | components/RatiosPage.tsx, lib/ratios.ts |
| 2 | `difference` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts |
| 2 | `ebitdaMargin` | components/ScenarioComparisonModal.tsx, lib/ratios.ts |
| 2 | `eps` | lib/engines/income-statement.ts, lib/ratios.ts |
| 2 | `expectedAddToRE` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts |
| 2 | `expectedDistributable` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts |
| 2 | `expectedEPD` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts |
| 2 | `expectedRE` | lib/agents/validation-rules.ts, lib/engines/circular-resolver.ts |
| 2 | `icCurr` | components/RatiosPage.tsx, lib/agents/validation-rules.ts |
| 2 | `icPrev` | components/RatiosPage.tsx, lib/agents/validation-rules.ts |
| 2 | `nwc` | components/schedules/WorkingCapitalPage.tsx, lib/export/excel.ts |
| 2 | `otherEquity` | types/assumptions.ts, types/historical.ts |
| 2 | `prevTotalDebt` | components/schedules/DebtSchedulePage.tsx, lib/ratios.ts |
| 2 | `retainedEarnings` | lib/engines/balance-sheet.ts, types/historical.ts |
| 2 | `val` | components/EgyptianSettings.tsx, components/HistoricalDataInput.tsx |

## 4. Hardcoded rates and constants

**Stale** means it differs from the brief's Appendix A seed, which is itself not yet re-verified (U4).

### 4.1 Rates and statutory values

| file:line | Value | Meaning | Flag |
|---|---|---|---|
| `components/CBERateBanner.tsx:50,53` | 19.00 / 20.00 / 19.50, "April 2, 2026 MPC" | banner text | **STALE**: seed is 20.00 / 21.00 / 20.50, 29-Oct-2026 |
| `components/CBERateBanner.tsx:13,14,23` | 0.195 | "in sync" reference | **STALE**; also drives the IN SYNC chip at `:81` |
| `components/CBERateBanner.tsx:24-28` | 0.235; debt and cash rate paths | written into all scenarios by the Sync button | **STALE** |
| `lib/services/liveRates.ts:36-38` | 0.19, 0.20, 0.195 | fallback CBE corridor | **STALE** |
| `lib/services/liveRates.ts:39` | 0.235 | 12M T-bill | **STALE**: seed 364d 25.912% (TO_VERIFY) |
| `lib/services/liveRates.ts:40` | 50.80 | USD/EGP | **STALE**: seed says past 54.73 (TO_VERIFY) |
| `lib/services/liveRates.ts:41-43` | 55.20, 13.55, 13.83 | EUR, SAR, AED | **STALE**; out of scope |
| `lib/services/liveRates.ts:44` | 0.134 | CPI | **STALE**: seed 13.9% Sep-2026 |
| `lib/services/liveRates.ts:75-77,112,115` | 0.92, 3.75, 3.67, 0.02, 0.01, 0.08 | FX defaults, spread, step-down, floor | no source |
| `types/assumptions.ts:235` | 0.195 | cbeRate | **STALE** |
| `types/assumptions.ts:236-240` | rate paths; historical 0.295, 0.245, 0.255, 0.215 | debt and cash rates | **STALE**, no source |
| `types/assumptions.ts:241` | 0.045 | legacyDebtRate | no source |
| `types/assumptions.ts:254` | 0.225 | CIT | matches seed; article unconfirmed |
| `types/assumptions.ts:256,265` | 0.10 | employee share | Basis differs from Art. 41 as stated in the brief (of profits distributed) |
| `types/assumptions.ts:258`; `lib/engines/income-statement.ts:241,257`; `components/EgyptianSettings.tsx:327,344` | "Law 14/2025" | citation | **`unconfirmed`, seed says remove if not found** |
| `types/assumptions.ts:263`; `lib/engines/income-statement.ts:232` | 5 | loss carryforward years | unconfirmed |
| `types/assumptions.ts:271` | 0.195 ... 0.130 | CBE path | analyst estimate presented as default |
| `types/assumptions.ts:275,277` | 0.05, 0.50 | legal reserve | matches seed; secondary source |
| `types/assumptions.ts:282`; `lib/engines/income-statement.ts:283-284` | 0.10, **0.05 literal** | dividend WHT; cites Law 30/2023 | values match seed; citation stale (seed: Laws 148-155/2026) |
| `types/assumptions.ts:299` | 0.015 | EOS % of SG&A, cites Art. 110 | unconfirmed |
| `types/assumptions.ts:320` | 0.14 | VAT | matches seed |
| `types/assumptions.ts:328-330` | 0.235, 0.07, 0.105 | rf, g, ERP (Damodaran Jan 2025) | delete with DCF |
| `types/assumptions.ts:334` | 0.25 ... 0.08 | inflation path | **STALE**, no source |
| `types/assumptions.ts:324,341`; `lib/store.ts:74-75` | June FYE, 2026 start, valuation date Dec-2023 | defaults | internally inconsistent |
| `lib/engines/income-statement.ts:117,121-122` | 2.0, 3.0, x2, 2028 | thin-cap | **`unconfirmed`** |
| `lib/engines/income-statement.ts:184,190,191,194,198,215,251-253,265,466` | 0.6, 0.15, 0.05, 0.02, 0.015, 0.225, 10000, 0.05, 0.50, 0.10, 0.225 | silent fallbacks | cause of 0.12 |
| `lib/engines/balance-sheet.ts:31,35,39,46,65,72,75,76,95` | 45, 30, 0.01, 0.05, 0.14, 40, 0.03, 0.02, 10 | silent fallbacks | cause of 0.12 |
| `lib/engines/balance-sheet.ts:218-219` | asset mix | fallback | no source |
| `lib/engines/cash-flow.ts:56,76` | 0.05, 10 | silent fallbacks | duplicates BS |
| `lib/engines/circular-resolver.ts:36,37` | 500, 0.01 | iteration cap, tolerance | brief: 100, 1 EGP |
| `lib/engines/circular-resolver.ts:62,71,72,75,76,77,146` | 0.05, 0.22, 0.15, 0.02, 0.005, 0.005, 0.10 | fallbacks and unexplained spreads | no source |
| `lib/schedules/egyptian-depreciation.ts:21-29,81` | 0.05, 0.25, 0.25, 0.50, 0.20 | "fixed by law" tax depreciation | **`unconfirmed`**; duplicated at `:81` |
| `lib/schedules/egyptian-depreciation.ts:102-104` | 0.225, 0.14, 0.10 | defaults | a third copy |
| `lib/store.ts:505-511` | 0.195, rate paths, 0.045, 0.10 | Egypt preset | **STALE** |
| `lib/store.ts:514` | 0.25 | US preset | out of scope |
| `lib/store.ts:570,576-578` | 0.2725, 0.20, 0.105, 0.07 | migrations | delete |
| `lib/store.ts:584-595,638` | 0.225, 0.4055, 0.40 | migration **forces** tax rates on load | delete; overwrites user input |
| `lib/store.ts:603,607,662,666,672,679,701,704` | rate overrides | migration | delete; overwrites user input |
| `lib/engines/dcf.ts:12-15` | April-2026 corridor | comments | **STALE**; delete |
| `lib/engines/valuation.ts:14-21` | EGX30 multiples "Bloomberg consensus" | benchmark table | **Source not possible under Decision 2**; dead code; delete |
| `lib/export/excel.ts:281,284,323-330,349,399-402,709,743,751,755,3000,3230` | 0.225, 0.22, 0.18, 0.30, 0.14, 0.10, 0.195, 0.05 | fallbacks | rewrite |
| `lib/export/build-company-info.ts:101-104` | 2010, register and tax IDs, address | invented data | **delete** |
| `components/EgyptianSettings.tsx:201` | "12M T-Bill: ~23.5% / CBE deposit: 19% (April 2026)" | UI hint | **STALE** |
| `lib/services/analyst.ts:16-17`; `lib/agents/validation-prompt.ts` | EPD Art. 40, reserve Art. 41 | citations | **Swapped** vs Decision 14; delete |

No S&P rating or stamp-duty constant exists in the source (searched), so those two WOLF errors in Appendix C do not recur here.

### 4.2 Full AST inventory of numeric literals (1070)

Excludes 0, 1, 2 and common unit values (3-10, 12, 100, 365, 1000) and style properties.

| file:line | value | context |
|---|---|---|
| `app/api/validate/route.ts:13` | 500 | `status: 500` |
| `app/api/validate/route.ts:28` | 4096 | `max_tokens: 4096` |
| `app/api/validate/route.ts:45` | 500 | `status: 500` |
| `components/CBERateBanner.tsx:13` | 0.195 | `const currentCBE = scenario?.assumptions.cbeRate ?? 0.195;` |
| `components/CBERateBanner.tsx:14` | 0.195 | `const isStale = Math.abs(currentCBE - 0.195) > 0.001;` |
| `components/CBERateBanner.tsx:14` | 0.001 | `const isStale = Math.abs(currentCBE - 0.195) > 0.001;` |
| `components/CBERateBanner.tsx:23` | 0.195 | `cbeRate: 0.195` |
| `components/CBERateBanner.tsx:24` | 0.235 | `riskFreeRate: 0.235` |
| `components/CBERateBanner.tsx:25` | 0.22 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `components/CBERateBanner.tsx:25` | 0.20 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `components/CBERateBanner.tsx:25` | 0.18 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `components/CBERateBanner.tsx:25` | 0.17 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `components/CBERateBanner.tsx:25` | 0.16 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `components/CBERateBanner.tsx:26` | 0.19 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `components/CBERateBanner.tsx:26` | 0.17 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `components/CBERateBanner.tsx:26` | 0.15 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `components/CBERateBanner.tsx:26` | 0.13 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `components/CBERateBanner.tsx:26` | 0.12 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `components/CBERateBanner.tsx:27` | 0.295 | `historicalInterestRateOnDebt: [0.295, 0.245]` |
| `components/CBERateBanner.tsx:27` | 0.245 | `historicalInterestRateOnDebt: [0.295, 0.245]` |
| `components/CBERateBanner.tsx:28` | 0.255 | `historicalInterestRateOnCash: [0.255, 0.215]` |
| `components/CBERateBanner.tsx:28` | 0.215 | `historicalInterestRateOnCash: [0.255, 0.215]` |
| `components/CBERateBanner.tsx:33` | 50 | `setTimeout(() => calculateAllScenarios(), 50);` |
| `components/charts/RevenueChart.tsx:18` | 0.3 | `return ( <ResponsiveContainer width="100%" height={250}> <AreaChart data={chartData}> <defs> <linearGradient i` |
| `components/charts/RevenueChart.tsx:22` | 0.3 | `return ( <ResponsiveContainer width="100%" height={250}> <AreaChart data={chartData}> <defs> <linearGradient i` |
| `components/charts/RevenueChart.tsx:26` | 0.3 | `return ( <ResponsiveContainer width="100%" height={250}> <AreaChart data={chartData}> <defs> <linearGradient i` |
| `components/CompanySettings.tsx:13` | 600 | `fontWeight: 600` |
| `components/Dashboard.tsx:35` | 1e6 | `sub: `Shares: ${(lastIS.sharesOutstanding / 1e6).toFixed(1)}M`` |
| `components/Dashboard.tsx:200` | 50 | `fn: (r: typeof results.ratios[0]) => r.interestCoverage >= 50 ? '>50x' : r.interestCoverage.toFixed(1) + 'x'` |
| `components/EgyptianSettings.tsx:121` | 0.225 | `standard: 0.225` |
| `components/EgyptianSettings.tsx:121` | 0.4055 | `oil: 0.4055` |
| `components/EgyptianSettings.tsx:121` | 0.40 | `strategic: 0.40` |
| `components/EgyptianSettings.tsx:121` | 0.015 | `sme: 0.015` |
| `components/EgyptianSettings.tsx:124` | 0.225 | `const rate = rateMap[regime] ?? 0.225;` |
| `components/EgyptianSettings.tsx:147` | 0.10 | `if (val > 0 && val < 0.10) val = 0.225;` |
| `components/EgyptianSettings.tsx:147` | 0.225 | `val = 0.225;` |
| `components/EgyptianSettings.tsx:154` | 0.20 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:169` | 0.05 | `updateAssumption('dividendWithholdingTaxRate', listed ? 0.05 : 0.10);` |
| `components/EgyptianSettings.tsx:169` | 0.10 | `updateAssumption('dividendWithholdingTaxRate', listed ? 0.05 : 0.10);` |
| `components/EgyptianSettings.tsx:197` | 0.235 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:198` | 0.235 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:217` | 0.295 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:217` | 0.245 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:228` | 0.295 | `const arr = [...(a.historicalInterestRateOnDebt ?? [0.295, 0.245])];` |
| `components/EgyptianSettings.tsx:228` | 0.245 | `const arr = [...(a.historicalInterestRateOnDebt ?? [0.295, 0.245])];` |
| `components/EgyptianSettings.tsx:229` | 0.22 | `arr[i] = parseFloat(e.target.value) / 100 \|\| 0.22;` |
| `components/EgyptianSettings.tsx:237` | 0.255 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:237` | 0.215 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:248` | 0.255 | `const arr = [...(a.historicalInterestRateOnCash ?? [0.255, 0.215])];` |
| `components/EgyptianSettings.tsx:248` | 0.215 | `const arr = [...(a.historicalInterestRateOnCash ?? [0.255, 0.215])];` |
| `components/EgyptianSettings.tsx:249` | 0.18 | `arr[i] = parseFloat(e.target.value) / 100 \|\| 0.18;` |
| `components/EgyptianSettings.tsx:285` | 0.02 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:285` | 10000 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:286` | 200 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:286` | 10000 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:297` | 0.195 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:297` | 0.175 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:297` | 0.155 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:297` | 0.140 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:297` | 0.130 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:306` | 0.195 | `const arr = [...(a.cbeRateProjection ?? [0.195, 0.175, 0.155, 0.140, 0.130])];` |
| `components/EgyptianSettings.tsx:306` | 0.175 | `const arr = [...(a.cbeRateProjection ?? [0.195, 0.175, 0.155, 0.140, 0.130])];` |
| `components/EgyptianSettings.tsx:306` | 0.155 | `const arr = [...(a.cbeRateProjection ?? [0.195, 0.175, 0.155, 0.140, 0.130])];` |
| `components/EgyptianSettings.tsx:306` | 0.140 | `const arr = [...(a.cbeRateProjection ?? [0.195, 0.175, 0.155, 0.140, 0.130])];` |
| `components/EgyptianSettings.tsx:306` | 0.130 | `const arr = [...(a.cbeRateProjection ?? [0.195, 0.175, 0.155, 0.140, 0.130])];` |
| `components/EgyptianSettings.tsx:307` | 0.195 | `arr[i] = parseFloat(e.target.value) / 100 \|\| 0.195;` |
| `components/EgyptianSettings.tsx:316` | 0.195 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:317` | 0.02 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:317` | 0.005 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/EgyptianSettings.tsx:369` | 0.50 | `return ( <div className="metric-card" style={{ marginTop: 16 }}> <h3 style={{ fontSize: 14, fontWeight: 600, m` |
| `components/ErrorBanner.tsx:16` | 10000 | `const timer = setTimeout(() => { setVisible(false); clearError(); }, 10000);` |
| `components/HistoricalDataInput.tsx:59` | 100_000 | `sharesOutstanding: 100_000` |
| `components/HistoricalDataInput.tsx:97` | 2023 | `const [data, setData] = useState<HistoricalDataInputType[]>( historicalData.length > 0 ? historicalData.map(d ` |
| `components/HistoricalDataInput.tsx:97` | 2024 | `const [data, setData] = useState<HistoricalDataInputType[]>( historicalData.length > 0 ? historicalData.map(d ` |
| `components/HistoricalDataInput.tsx:165` | 2023 | `const year = parseInt(p) \|\| (2023 + i);` |
| `components/HistoricalDataInput.tsx:194` | 0.01 | `const isBalanced = Math.abs(balanceDiff) < 0.01;` |
| `components/HistoricalImportPage.tsx:89` | 2026 | `const inferredStartYear: number = (firstImportedAssumptions as any)?.startYear ?? activeScenario?.assumptions?` |
| `components/HistoricalImportPage.tsx:326` | 100000 | `sharesOutstanding: data.sharesOutstanding \|\| arr(numPeriods, 100000)` |
| `components/HistoricalImportPage.tsx:346` | 10000 | `commonStock: data.commonStock \|\| arr(numPeriods, 10000)` |
| `components/RatiosPage.tsx:38` | 0.3 | `good: 0.3` |
| `components/RatiosPage.tsx:39` | 0.1 | `good: 0.1` |
| `components/RatiosPage.tsx:40` | 0.15 | `good: 0.15` |
| `components/RatiosPage.tsx:41` | 0.05 | `good: 0.05` |
| `components/RatiosPage.tsx:42` | 0.12 | `good: 0.12` |
| `components/RatiosPage.tsx:43` | 0.05 | `good: 0.05` |
| `components/RatiosPage.tsx:55` | 0.1 | `good: 0.1` |
| `components/RatiosPage.tsx:62` | 1.2 | `good: 1.2` |
| `components/RatiosPage.tsx:64` | 0.5 | `good: 0.5` |
| `components/RatiosPage.tsx:81` | 1.50 | `good: 1.50` |
| `components/RatiosPage.tsx:90` | 0.05 | `good: 0.05` |
| `components/RatiosPage.tsx:107` | 0.12 | `good: 0.12` |
| `components/RatiosPage.tsx:111` | 0.12 | `good: 0.12` |
| `components/RatiosPage.tsx:121` | 2.90 | `good: 2.90` |
| `components/RatiosPage.tsx:122` | 2.60 | `good: 2.60` |
| `components/RatiosPage.tsx:130` | 0.20 | `good: 0.20` |
| `components/RatiosPage.tsx:149` | 0.7 | `return v >= threshold.good ? 'var(--accent-emerald)' : v >= threshold.good * 0.7 ? 'var(--text-primary)' : 'va` |
| `components/RatiosPage.tsx:150` | 1.3 | `return v <= threshold.good ? 'var(--accent-emerald)' : v <= threshold.good * 1.3 ? 'var(--text-primary)' : 'va` |
| `components/statements/CashFlowPage.tsx:76` | 0.005 | `return typeof v === 'number' && Math.abs(v) > 0.005;` |
| `components/statements/IncomeStatementPage.tsx:81` | 0.005 | `const rows: { label: string; key: ISKey; format: 'currency' \| 'percent' \| 'eps'; bold?: boolean; subheader?: b` |
| `components/statements/IncomeStatementPage.tsx:84` | 0.005 | `const rows: { label: string; key: ISKey; format: 'currency' \| 'percent' \| 'eps'; bold?: boolean; subheader?: b` |
| `lib/agents/validation-agent.ts:191` | 40 | `const totalChecks = 40;` |
| `lib/agents/validation-agent.ts:214` | 11 | `overallCompliant: criticalErrors.filter(f => [6, 7, 8, 9, 10, 11].includes(f.rule)).length === 0` |
| `lib/agents/validation-rules.ts:17` | 0.01 | `const TOL = 0.01;` |
| `lib/agents/validation-rules.ts:159` | 0.10 | `const epdRate = assumptions.employeeProfitSharingRate ?? 0.10;` |
| `lib/agents/validation-rules.ts:160` | 0.10 | `const whtRate = assumptions.dividendWithholdingTaxRate ?? 0.10;` |
| `lib/agents/validation-rules.ts:161` | 0.05 | `const lrRate = assumptions.legalReservePercent ?? 0.05;` |
| `lib/agents/validation-rules.ts:166` | 0.50 | `const lrCap = effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50);` |
| `lib/agents/validation-rules.ts:171` | 0.30 | `const payoutRate = projIdx >= 0 && Array.isArray(assumptions.dividendPayoutRatio) ? (assumptions.dividendPayou` |
| `lib/agents/validation-rules.ts:172` | 0.30 | `const payoutRate = projIdx >= 0 && Array.isArray(assumptions.dividendPayoutRatio) ? (assumptions.dividendPayou` |
| `lib/agents/validation-rules.ts:245` | 11 | `findings.push(findingBuilder(11, 'critical', p, scenario, 'additionToRE', expectedAddToRE, period.additionToRE` |
| `lib/agents/validation-rules.ts:300` | 13 | `findings.push(findingBuilder(13, 'critical', period.period, scenario, 'taxExpense', expected, period.taxExpens` |
| `lib/agents/validation-rules.ts:326` | 1e-6 | `const tolerance = Math.max(TOL, 1e-6 * (Math.abs(cfo) + Math.abs(cfi) + Math.abs(cff)));` |
| `lib/agents/validation-rules.ts:329` | 15 | `findings.push(findingBuilder( 15, 'critical', period.period, scenario, 'netChangeInCash', expected, period.net` |
| `lib/agents/validation-rules.ts:351` | 1e-6 | `const tolerance = Math.max(TOL, 1e-6 * (Math.abs(period.beginningCash) + Math.abs(period.netChangeInCash)));` |
| `lib/agents/validation-rules.ts:354` | 16 | `findings.push(findingBuilder( 16, 'critical', period.period, scenario, 'endingCash', expected, period.endingCa` |
| `lib/agents/validation-rules.ts:378` | 17 | `findings.push(findingBuilder( 17, 'major', period.period, scenario, 'nopat', expected, period.nopat, `NOPAT sh` |
| `lib/agents/validation-rules.ts:398` | 0.5 | `if (Math.abs(period.ebitda - expected) > 0.5) { findings.push(findingBuilder(20, 'major', period.period, scena` |
| `lib/agents/validation-rules.ts:399` | 20 | `findings.push(findingBuilder(20, 'major', period.period, scenario, 'ebitda', expected, period.ebitda, `EBITDA ` |
| `lib/agents/validation-rules.ts:442` | 0.001 | `if (r.roic !== undefined && Math.abs(r.roic - expectedROIC) > 0.001) { findings.push(findingBuilder(26, 'major` |
| `lib/agents/validation-rules.ts:443` | 26 | `findings.push(findingBuilder(26, 'major', isp.period, scenario, 'roic', expectedROIC, r.roic, `ROIC should be ` |
| `lib/agents/validation-rules.ts:473` | 0.001 | `if (Math.abs(r.roe - expected) > 0.001) { findings.push(findingBuilder(27, 'major', is[i].period, scenario, 'r` |
| `lib/agents/validation-rules.ts:474` | 27 | `findings.push(findingBuilder(27, 'major', is[i].period, scenario, 'roe', expected, r.roe, `ROE should be NI / ` |
| `lib/agents/validation-rules.ts:502` | 0.001 | `if (Math.abs(r.roa - expected) > 0.001) { findings.push(findingBuilder(28, 'major', is[i].period, scenario, 'r` |
| `lib/agents/validation-rules.ts:503` | 28 | `findings.push(findingBuilder(28, 'major', is[i].period, scenario, 'roa', expected, r.roa, `ROA should be NI / ` |
| `lib/agents/validation-rules.ts:524` | 31 | `findings.push(findingBuilder(31, 'advisory', period.period, scenario, 'employeeProfitSharing', 0, period.emplo` |
| `lib/agents/validation-rules.ts:545` | 32 | `findings.push(findingBuilder(32, 'advisory', period.period, scenario, 'legalReserveAddition', 0, period.legalR` |
| `lib/agents/validation-rules.ts:568` | 0.50 | `const lrCap = effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50);` |
| `lib/agents/validation-rules.ts:572` | 33 | `findings.push(findingBuilder(33, 'advisory', bsPeriod.period, scenario, 'legalReserve', lrCap, bsPeriod.legalR` |
| `lib/agents/validation-rules.ts:593` | 0.001 | `if (projected[i].revenueGrowthRate > projected[i - 1].revenueGrowthRate + 0.001) { findings.push(findingBuilde` |
| `lib/agents/validation-rules.ts:595` | 37 | `findings.push(findingBuilder( 37, 'advisory', projected[i].period, scenario, 'revenueGrowthRate', projected[i ` |
| `lib/agents/validation-rules.ts:619` | 38 | `findings.push(findingBuilder( 38, 'advisory', period.period, scenario, 'freeCashFlow', 0, period.freeCashFlow,` |
| `lib/agents/validation-types.ts:74` | 0.01 | `tolerance: 0.01` |
| `lib/engines/balance-sheet.ts:31` | 45 | `const dso = assumptions.dso[yr] ?? 45;` |
| `lib/engines/balance-sheet.ts:35` | 30 | `const dio = assumptions.dio[yr] ?? 30;` |
| `lib/engines/balance-sheet.ts:39` | 0.01 | `const prepaidExpenses = incomeStatement.revenue * (assumptions.prepaidPercent[yr] ?? 0.01);` |
| `lib/engines/balance-sheet.ts:46` | 0.05 | `const capex = incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05);` |
| `lib/engines/balance-sheet.ts:65` | 0.14 | `const vatRate = assumptions.vatRate ?? 0.14;` |
| `lib/engines/balance-sheet.ts:72` | 40 | `const dpo = assumptions.dpo[yr] ?? 40;` |
| `lib/engines/balance-sheet.ts:75` | 0.03 | `const accruedExpenses = incomeStatement.revenue * (assumptions.accruedExpPercent[yr] ?? 0.03);` |
| `lib/engines/balance-sheet.ts:76` | 0.02 | `const deferredRevenue = incomeStatement.revenue * (assumptions.deferredRevPercent[yr] ?? 0.02);` |
| `lib/engines/balance-sheet.ts:158` | 0.01 | `const isBalanced = Math.abs(balanceDifference) < 0.01;` |
| `lib/engines/balance-sheet.ts:218` | 0.30 | `buildings: 0.30` |
| `lib/engines/balance-sheet.ts:218` | 0.35 | `machinery: 0.35` |
| `lib/engines/balance-sheet.ts:218` | 0.15 | `vehicles: 0.15` |
| `lib/engines/balance-sheet.ts:219` | 0.10 | `computers: 0.10` |
| `lib/engines/balance-sheet.ts:219` | 0.10 | `furniture: 0.10` |
| `lib/engines/balance-sheet.ts:337` | 0.01 | `isBalanced: Math.abs(balanceDifference) < 0.01` |
| `lib/engines/cash-flow.ts:56` | 0.05 | `const capex = -(incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05));` |
| `lib/engines/cash-flow.ts:122` | 0.01 | `const reconciles = Math.abs(endingCash - curr.cash) < 0.01;` |
| `lib/engines/cash-flow.ts:252` | 0.01 | `const reconciles = Math.abs((beginningCash + (cashFromOperations + cashFromInvesting + cashFromFinancing)) - e` |
| `lib/engines/circular-resolver.ts:36` | 500 | `export function resolveCircularReferences( assumptions: AssumptionSet, yearIndex: number, previousIncomeStatem` |
| `lib/engines/circular-resolver.ts:37` | 0.01 | `export function resolveCircularReferences( assumptions: AssumptionSet, yearIndex: number, previousIncomeStatem` |
| `lib/engines/circular-resolver.ts:62` | 0.05 | `const capex = previousIncomeStatement.revenue * (1 + (assumptions.revenueGrowthRate[yearIndex] ?? 0)) * (assum` |
| `lib/engines/circular-resolver.ts:71` | 0.22 | `let effectiveDebtRate = assumptions.interestRateOnDebt[yearIndex] ?? assumptions.legacyDebtRate ?? 0.22;` |
| `lib/engines/circular-resolver.ts:72` | 0.15 | `let effectiveCashRate = assumptions.interestRateOnCash[yearIndex] ?? 0.15;` |
| `lib/engines/circular-resolver.ts:75` | 0.02 | `const spread = assumptions.corporateCreditSpread ?? 0.02;` |
| `lib/engines/circular-resolver.ts:76` | 0.005 | `effectiveDebtRate = cbeProj + spread + 0.005;` |
| `lib/engines/circular-resolver.ts:77` | 0.005 | `effectiveCashRate = cbeProj - 0.005;` |
| `lib/engines/circular-resolver.ts:146` | 0.10 | `estimatedDepreciation = calculateDepreciation( previousBalanceSheet.grossPPE, previousBalanceSheet.netPPE, cap` |
| `lib/engines/circular-resolver.ts:205` | 0.01 | `const assetsBalance = Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesEquity) < 0.01;` |
| `lib/engines/circular-resolver.ts:215` | 0.01 | `const cashTies = Math.abs(balanceSheet.cash - cashFlow.endingCash) < 0.01;` |
| `lib/engines/circular-resolver.ts:225` | 0.01 | `const netIncomeFlows = Math.abs(incomeStatement.netIncome - cashFlow.netIncome) < 0.01;` |
| `lib/engines/circular-resolver.ts:236` | 0.01 | `const ppeTies = Math.abs(balanceSheet.grossPPE - expectedGrossPPE) < 0.01;` |
| `lib/engines/circular-resolver.ts:247` | 0.01 | `const retainedEarningsFlows = Math.abs(balanceSheet.retainedEarnings - expectedRE) < 0.01;` |
| `lib/engines/circular-resolver.ts:258` | 0.01 | `const debtTies = Math.abs(balanceSheet.longTermDebt - expectedLTD) < 0.01;` |
| `lib/engines/circular-resolver.ts:270` | 0.01 | `const cfReconciles = Math.abs(cfNetChange - expectedNetChange) < 0.01;` |
| `lib/engines/circular-resolver.ts:285` | 0.01 | `const workingCapitalTies = Math.abs(expectedWCImpact - actualWCImpact) < 0.01;` |
| `lib/engines/circular-resolver.ts:298` | 0.01 | `const totalCurrentAssetsCheck = Math.abs(balanceSheet.totalCurrentAssets - expectedCurrentAssets) < 0.01;` |
| `lib/engines/circular-resolver.ts:310` | 0.01 | `const totalNonCurrentAssetsCheck = Math.abs(balanceSheet.totalNonCurrentAssets - expectedNonCurrentAssets) < 0` |
| `lib/engines/circular-resolver.ts:324` | 0.01 | `const totalCurrentLiabilitiesCheck = Math.abs(balanceSheet.totalCurrentLiabilities - expectedCurrentLiabilitie` |
| `lib/engines/circular-resolver.ts:336` | 0.01 | `const totalNonCurrentLiabilitiesCheck = Math.abs(balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentL` |
| `lib/engines/circular-resolver.ts:349` | 0.01 | `const totalEquityCheck = Math.abs(balanceSheet.totalEquity - expectedEquity) < 0.01;` |
| `lib/engines/circular-resolver.ts:364` | 0.01 | `const grossToNetIncomeWaterfall = Math.abs(incomeStatement.netIncome - expectedNI) < 0.01;` |
| `lib/engines/circular-resolver.ts:375` | 0.01 | `const ebitdaIdentity = Math.abs(incomeStatement.ebitda - expectedEBITDA) < 0.01;` |
| `lib/engines/circular-resolver.ts:387` | 0.01 | `const apicConsistency = Math.abs(apicDelta - expectedApicDelta) < 0.01;` |
| `lib/engines/circular-resolver.ts:400` | 0.01 | `const expectedEPD = incomeStatement.netIncome > 0 ? incomeStatement.netIncome * (incomeStatement.employeeProfi` |
| `lib/engines/circular-resolver.ts:402` | 0.01 | `const epdCheck = Math.abs(incomeStatement.employeeProfitSharing - expectedEPD) < 0.01;` |
| `lib/engines/circular-resolver.ts:413` | 0.01 | `const niAfterEPDCheck = Math.abs(incomeStatement.netIncomeAfterEPD - expectedNIAfterEPD) < 0.01;` |
| `lib/engines/circular-resolver.ts:424` | 0.01 | `const distributabelCheck = Math.abs(incomeStatement.distributableProfit - expectedDistributable) < 0.01;` |
| `lib/engines/circular-resolver.ts:436` | 0.01 | `const dividendsWithinBounds = incomeStatement.grossDividends <= distributableFloor + 0.01;` |
| `lib/engines/circular-resolver.ts:447` | 0.01 | `const netDivCheck = Math.abs(incomeStatement.netDividends - expectedNetDiv) < 0.01;` |
| `lib/engines/circular-resolver.ts:459` | 0.01 | `const addToRECheck = Math.abs(incomeStatement.additionToRE - expectedAddToRE) < 0.01;` |
| `lib/engines/circular-resolver.ts:474` | 0.01 | `const nopatCheck = Math.abs(incomeStatement.nopat - expectedNOPAT) < 0.01;` |
| `lib/engines/circular-resolver.ts:485` | 0.01 | `const legalReserveCheck = Math.abs((balanceSheet.legalReserve ?? 0) - expectedLegalReserve) < 0.01;` |
| `lib/engines/circular-resolver.ts:495` | 0.01 | `const taxLossUtilizationCheck = incomeStatement.taxLossUtilized <= incomeStatement.taxLossCarryforward + 0.01;` |
| `lib/engines/circular-resolver.ts:509` | 0.01 | `const taxableIncomeCheck = Math.abs( Math.max(0, incomeStatement.taxableIncome) - expectedTaxableIncome ) < 0.` |
| `lib/engines/circular-resolver.ts:519` | 0.01 | `const cfDivCheck = Math.abs(Math.abs(cashFlow.dividendsPaid) - incomeStatement.grossDividends) < 0.01;` |
| `lib/engines/circular-resolver.ts:529` | 0.01 | `const cfWhtCheck = Math.abs(Math.abs(cashFlow.dividendWHT) - incomeStatement.dividendWHT) < 0.01;` |
| `lib/engines/dcf.ts:42` | 0.18 | `const avgDebtRate = rateSlice.length > 0 ? rateSlice.reduce((a, b) => a + b, 0) / rateSlice.length : (assumpti` |
| `lib/engines/dcf.ts:61` | 0.50 | `if (wacc > 0.50) { warnings.push(`WACC (${(wacc * 100).toFixed(1)}%) exceeds 50% [U+00E2][U+20AC][U+201D] unusually high`); }` |
| `lib/engines/dcf.ts:67` | 0.90 | `if (debtWeight > 0.90) { warnings.push(`Debt weight (${(debtWeight * 100).toFixed(1)}%) exceeds 90% [U+00E2][U+20AC][U+201D] extreme ` |
| `lib/engines/dcf.ts:70` | 0.60 | `if (costOfEquity > 0.60) { warnings.push(`Cost of Equity (${(costOfEquity * 100).toFixed(1)}%) exceeds 60% [U+00E2][U+20AC][U+201D] c` |
| `lib/engines/dcf.ts:115` | 0.85 | `if (tvAsPercentOfEV > 0.85) { warnings.push(`Terminal Value is ${(tvAsPercentOfEV * 100).toFixed(0)}% of EV [U+00E2][U+20AC][U+201D] ` |
| `lib/engines/income-statement.ts:86` | 0.01 | `const updatedVintages = activeVintages.map(v => { if (remainingProfit <= 0) return v; const use = Math.min(rem` |
| `lib/engines/income-statement.ts:117` | 2028 | `deRatioLimit: calendarYear >= 2028 ? 2.0 : 3.0` |
| `lib/engines/income-statement.ts:121` | 2028 | `const deRatioLimit = calendarYear >= 2028 ? 2.0 : 3.0;` |
| `lib/engines/income-statement.ts:150` | 0.05 | `function calculateLegalReserveAddition( netIncome: number, priorLegalReserve: number, paidUpCapital: number, r` |
| `lib/engines/income-statement.ts:151` | 0.50 | `function calculateLegalReserveAddition( netIncome: number, priorLegalReserve: number, paidUpCapital: number, r` |
| `lib/engines/income-statement.ts:184` | 0.6 | `const cogsPercent = assumptions.cogsPercent[yr] ?? 0.6;` |
| `lib/engines/income-statement.ts:190` | 0.15 | `const sgaExpense = revenue * (assumptions.sgaPercent[yr] ?? 0.15);` |
| `lib/engines/income-statement.ts:191` | 0.05 | `const rdExpense = revenue * (assumptions.rdPercent[yr] ?? 0.05);` |
| `lib/engines/income-statement.ts:194` | 0.02 | `const otherOpex = revenue * (assumptions.otherOpexPercent[yr] ?? 0.02);` |
| `lib/engines/income-statement.ts:198` | 0.015 | `const eosExpense = (assumptions.enableEndOfServiceBenefit ?? false) ? sgaExpense * (assumptions.eosProvisionPc` |
| `lib/engines/income-statement.ts:215` | 0.225 | `let taxRate = assumptions.taxRate[yr] ?? 0.225;` |
| `lib/engines/income-statement.ts:217` | 0.05 | `if (taxRegime === 'standard' && taxRate > 0 && taxRate < 0.05) { console.warn(`[Tax] Standard regime taxRate $` |
| `lib/engines/income-statement.ts:251` | 10_000 | `const legalReserve = calculateLegalReserveAddition( netIncome, priorLegalReserve, assumptions.paidUpCapital ??` |
| `lib/engines/income-statement.ts:252` | 0.05 | `const legalReserve = calculateLegalReserveAddition( netIncome, priorLegalReserve, assumptions.paidUpCapital ??` |
| `lib/engines/income-statement.ts:253` | 0.50 | `const legalReserve = calculateLegalReserveAddition( netIncome, priorLegalReserve, assumptions.paidUpCapital ??` |
| `lib/engines/income-statement.ts:265` | 0.10 | `const rawEPD = ( (assumptions.enableEmployeeProfitShare ?? true) && epdBase > 0 ) ? epdBase * (assumptions.emp` |
| `lib/engines/income-statement.ts:283` | 0.05 | `const dividendWHTRate = assumptions.isEGXListed ? 0.05 // EGX-listed: 5% WHT : (assumptions.dividendWithholdin` |
| `lib/engines/income-statement.ts:284` | 0.10 | `const dividendWHTRate = assumptions.isEGXListed ? 0.05 // EGX-listed: 5% WHT : (assumptions.dividendWithholdin` |
| `lib/engines/income-statement.ts:466` | 0.225 | `nopat: ebit * (1 - (statutoryTaxRate?.[i] ?? statutoryTaxRate?.[0] ?? (ebt !== 0 ? taxExpense / ebt : 0.225)))` |
| `lib/engines/integrator.ts:44` | 0.1 | `return Math.abs(histVal) > 0 && Math.abs(first) < Math.abs(histVal) * 0.1;` |
| `lib/engines/integrator.ts:79` | 0.1 | `if (Math.abs(histCommon) > 0 && Math.abs(seeded.paidUpCapital ?? 0) < Math.abs(histCommon) * 0.1) { seeded.pai` |
| `lib/engines/integrator.ts:84` | 10_000 | `if (seeded.stockBasedCompAmount && seeded.stockBasedCompAmount.every(v => v === 10_000)) { seeded.stockBasedCo` |
| `lib/engines/integrator.ts:96` | 1e-6 | `const closeTo = (a: number, b: number) => Math.abs(a - b) < 1e-6;` |
| `lib/engines/integrator.ts:97` | 0.01 | `if (seeded.prepaidPercent?.every(v => closeTo(v, 0.01)) && !closeTo(prepaidRatio, 0.01)) { seeded.prepaidPerce` |
| `lib/engines/integrator.ts:97` | 0.01 | `if (seeded.prepaidPercent?.every(v => closeTo(v, 0.01)) && !closeTo(prepaidRatio, 0.01)) { seeded.prepaidPerce` |
| `lib/engines/integrator.ts:100` | 0.03 | `if (seeded.accruedExpPercent?.every(v => closeTo(v, 0.03)) && !closeTo(accruedRatio, 0.03)) { seeded.accruedEx` |
| `lib/engines/integrator.ts:100` | 0.03 | `if (seeded.accruedExpPercent?.every(v => closeTo(v, 0.03)) && !closeTo(accruedRatio, 0.03)) { seeded.accruedEx` |
| `lib/engines/integrator.ts:103` | 0.02 | `if (seeded.deferredRevPercent?.every(v => closeTo(v, 0.02)) && !closeTo(defRevRatio, 0.02)) { seeded.deferredR` |
| `lib/engines/integrator.ts:103` | 0.02 | `if (seeded.deferredRevPercent?.every(v => closeTo(v, 0.02)) && !closeTo(defRevRatio, 0.02)) { seeded.deferredR` |
| `lib/engines/valuation.ts:15` | 15.0 | `high: 15.0` |
| `lib/engines/valuation.ts:15` | 11.5 | `avg: 11.5` |
| `lib/engines/valuation.ts:16` | 7.5 | `avg: 7.5` |
| `lib/engines/valuation.ts:17` | 2.5 | `high: 2.5` |
| `lib/engines/valuation.ts:17` | 1.75 | `avg: 1.75` |
| `lib/engines/valuation.ts:18` | 4.5 | `avg: 4.5` |
| `lib/engines/valuation.ts:115` | 45 | `dso: 45` |
| `lib/engines/valuation.ts:115` | 30 | `dpo: 30` |
| `lib/engines/valuation.ts:116` | 60 | `dso: 60` |
| `lib/engines/valuation.ts:116` | 45 | `dio: 45` |
| `lib/engines/valuation.ts:116` | 60 | `dpo: 60` |
| `lib/engines/valuation.ts:117` | 15 | `dso: 15` |
| `lib/engines/valuation.ts:117` | 60 | `dio: 60` |
| `lib/engines/valuation.ts:117` | 45 | `dpo: 45` |
| `lib/engines/valuation.ts:118` | 90 | `dso: 90` |
| `lib/engines/valuation.ts:118` | 45 | `dio: 45` |
| `lib/engines/valuation.ts:118` | 60 | `dpo: 60` |
| `lib/engines/valuation.ts:119` | 45 | `dso: 45` |
| `lib/engines/valuation.ts:119` | 30 | `dio: 30` |
| `lib/engines/valuation.ts:119` | 30 | `dpo: 30` |
| `lib/engines/valuation.ts:120` | 180 | `dso: 180` |
| `lib/engines/valuation.ts:120` | 90 | `dpo: 90` |
| `lib/export/build-company-info.ts:82` | 32 | `ws.getColumn(1).width = 32;` |
| `lib/export/build-company-info.ts:83` | 42 | `ws.getColumn(2).width = 42;` |
| `lib/export/build-company-info.ts:84` | 20 | `ws.getColumn(3).width = 20;` |
| `lib/export/build-company-info.ts:85` | 20 | `ws.getColumn(4).width = 20;` |
| `lib/export/build-company-info.ts:88` | 36 | `ws.getRow(1).height = 36;` |
| `lib/export/build-company-info.ts:101` | 2010 | `infoRow(ws, 7, 'Founded Year', 2010, true);` |
| `lib/export/build-company-info.ts:108` | 13 | `infoRow(ws, 13, 'Reporting Currency', 'Egyptian Pound (EGP)', false);` |
| `lib/export/build-company-info.ts:109` | 14 | `infoRow(ws, 14, 'Currency Symbol', 'E[U+0622]GBP-sign', false);` |
| `lib/export/build-company-info.ts:110` | 15 | `infoRow(ws, 15, 'Fiscal Year End', 'December 31', true);` |
| `lib/export/build-company-info.ts:112` | 2026 | `const projStart = config?.startYear ?? 2026;` |
| `lib/export/build-company-info.ts:121` | 16 | `infoRow(ws, 16, 'Historical Period', historicalPeriod, false);` |
| `lib/export/build-company-info.ts:122` | 17 | `infoRow(ws, 17, 'Projection Period', projectionPeriod, false);` |
| `lib/export/build-company-info.ts:125` | 18 | `infoRow(ws, 18, 'Model Version', `${version} \| ${new Date().toLocaleDateString('en-US', { month: 'short', year` |
| `lib/export/build-company-info.ts:126` | 19 | `infoRow(ws, 19, 'Last Updated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: ` |
| `lib/export/build-company-info.ts:129` | 21 | `sectionHeader(ws, 21, 'SECTION 3 [U+00E2][U+20AC][U+201D] EGYPT REGULATORY / TAX');` |
| `lib/export/build-company-info.ts:130` | 0.225 | `const taxRate = config?.taxRate ?? 0.225;` |
| `lib/export/build-company-info.ts:131` | 0.14 | `const vatRate = config?.vatRate ?? 0.14;` |
| `lib/export/build-company-info.ts:132` | 0.10 | `const divWHT = config?.dividendWithholdingTaxRate ?? 0.10;` |
| `lib/export/build-company-info.ts:133` | 0.195 | `const cbeRate = config?.cbeRate ?? config?.liveRates?.cbeDiscountRate ?? 0.195;` |
| `lib/export/build-company-info.ts:134` | 0.235 | `const riskFreeRate = config?.riskFreeRate ?? config?.liveRates?.tbillRate12m ?? 0.235;` |
| `lib/export/build-company-info.ts:136` | 22 | `infoRow(ws, 22, 'Corporate Income Tax Rate', taxRate, false);` |
| `lib/export/build-company-info.ts:137` | 22 | `ws.getCell(22, 2).numFmt = '0.0%';` |
| `lib/export/build-company-info.ts:138` | 23 | `infoRow(ws, 23, 'VAT Rate (Standard)', vatRate, false);` |
| `lib/export/build-company-info.ts:139` | 23 | `ws.getCell(23, 2).numFmt = '0.0%';` |
| `lib/export/build-company-info.ts:140` | 24 | `infoRow(ws, 24, 'Dividend Withholding Tax', divWHT, false);` |
| `lib/export/build-company-info.ts:141` | 24 | `ws.getCell(24, 2).numFmt = '0.0%';` |
| `lib/export/build-company-info.ts:142` | 25 | `infoRow(ws, 25, 'CBE Policy Rate (Discount)', cbeRate, false);` |
| `lib/export/build-company-info.ts:143` | 25 | `ws.getCell(25, 2).numFmt = '0.00%';` |
| `lib/export/build-company-info.ts:144` | 26 | `infoRow(ws, 26, 'Risk-Free Rate (12M T-Bill)', riskFreeRate, false);` |
| `lib/export/build-company-info.ts:145` | 26 | `ws.getCell(26, 2).numFmt = '0.00%';` |
| `lib/export/build-company-info.ts:150` | 27 | `infoRow(ws, 27, 'CBE Deposit Rate', lr.cbeDepositRate, false);` |
| `lib/export/build-company-info.ts:151` | 27 | `ws.getCell(27, 2).numFmt = '0.00%';` |
| `lib/export/build-company-info.ts:152` | 28 | `infoRow(ws, 28, 'CBE Lending Rate', lr.cbeLendingRate, false);` |
| `lib/export/build-company-info.ts:153` | 28 | `ws.getCell(28, 2).numFmt = '0.00%';` |
| `lib/export/build-company-info.ts:154` | 29 | `infoRow(ws, 29, 'USD / EGP Exchange Rate', lr.usdEgpRate, false);` |
| `lib/export/build-company-info.ts:155` | 29 | `ws.getCell(29, 2).numFmt = '#,##0.00';` |
| `lib/export/build-company-info.ts:156` | 30 | `infoRow(ws, 30, 'Last MPC Meeting', lr.lastMPCDate, false);` |
| `lib/export/build-company-info.ts:157` | 31 | `infoRow(ws, 31, 'Rates Source', lr.source, false);` |
| `lib/export/build-company-info.ts:158` | 32 | `infoRow(ws, 32, 'Rates Last Fetched', lr.lastUpdated, false);` |
| `lib/export/build-company-info.ts:160` | 27 | `infoRow(ws, 27, 'Financial Year Note', 'July 1 [U+00E2][U+20AC][U+201C] June 30 (Note: model uses Dec)', false);` |
| `lib/export/build-company-info.ts:164` | 34 | `const sec4Start = lr ? 34 : 29;` |
| `lib/export/build-company-info.ts:164` | 29 | `const sec4Start = lr ? 34 : 29;` |
| `lib/export/build-dashboard.ts:33` | 65 | `s = String.fromCharCode(65 + (c % 26)) + s;` |
| `lib/export/build-dashboard.ts:33` | 26 | `s = String.fromCharCode(65 + (c % 26)) + s;` |
| `lib/export/build-dashboard.ts:33` | 26 | `c = Math.floor(c / 26);` |
| `lib/export/build-dashboard.ts:57` | 24 | `ws.getColumn(1).width = 24;` |
| `lib/export/build-dashboard.ts:58` | 16 | `ws.getColumn(i + 2).width = 16;` |
| `lib/export/build-dashboard.ts:59` | 16 | `ws.getColumn(nYears + 2).width = 16;` |
| `lib/export/build-dashboard.ts:60` | 16 | `ws.getColumn(nYears + 3).width = 16;` |
| `lib/export/build-dashboard.ts:65` | 48 | `ws.getRow(1).height = 48;` |
| `lib/export/build-dashboard.ts:73` | 22 | `ws.getRow(2).height = 22;` |
| `lib/export/build-dashboard.ts:233` | 18 | `ws.getRow(row).height = 18;` |
| `lib/export/build-scenarios.ts:161` | 1000000 | `const roundPct = (v: number) => Math.round(v * 1000000) / 1000000;` |
| `lib/export/build-scenarios.ts:161` | 1000000 | `const roundPct = (v: number) => Math.round(v * 1000000) / 1000000;` |
| `lib/export/build-scenarios.ts:193` | 0.225 | `const rate = Array.isArray(a.taxRate) ? (a.taxRate[0] ?? 0.225) : (a.taxRate ?? 0.225);` |
| `lib/export/build-scenarios.ts:193` | 0.225 | `const rate = Array.isArray(a.taxRate) ? (a.taxRate[0] ?? 0.225) : (a.taxRate ?? 0.225);` |
| `lib/export/build-scenarios.ts:198` | 0.225 | `const rate = Array.isArray(a.taxRate) ? (a.taxRate[projIdx] ?? 0.225) : (a.taxRate ?? 0.225);` |
| `lib/export/build-scenarios.ts:198` | 0.225 | `const rate = Array.isArray(a.taxRate) ? (a.taxRate[projIdx] ?? 0.225) : (a.taxRate ?? 0.225);` |
| `lib/export/build-scenarios.ts:209` | 0.10 | `out['employeeProfitSharingRate'] = Array(nYears).fill(a.employeeProfitSharingRate ?? 0.10);` |
| `lib/export/build-scenarios.ts:210` | 10_000 | `out['paidUpCapital'] = Array(nYears).fill(a.paidUpCapital ?? 10_000);` |
| `lib/export/build-scenarios.ts:234` | 0.10 | `const rate = Array.isArray(a.depreciationRate) ? (a.depreciationRate[projIdx] ?? 0.10) : (a.depreciationRate ?` |
| `lib/export/build-scenarios.ts:235` | 0.10 | `const rate = Array.isArray(a.depreciationRate) ? (a.depreciationRate[projIdx] ?? 0.10) : (a.depreciationRate ?` |
| `lib/export/build-scenarios.ts:246` | 0.22 | `out['interestRate'] = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (a.interestRateOnDebt[0] ??` |
| `lib/export/build-scenarios.ts:247` | 0.22 | `out['interestRate'] = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (a.interestRateOnDebt[0] ??` |
| `lib/export/build-scenarios.ts:251` | 0.18 | `out['interestIncomeRate'] = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (a.interestRateOnCash` |
| `lib/export/build-scenarios.ts:252` | 0.18 | `out['interestIncomeRate'] = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (a.interestRateOnCash` |
| `lib/export/build-scenarios.ts:298` | 0.14 | `out['vatRate'] = Array(nYears).fill(a.vatRate ?? 0.14);` |
| `lib/export/build-scenarios.ts:393` | 35 | `ws.getColumn(1).width = 35;` |
| `lib/export/build-scenarios.ts:394` | 14 | `ws.getColumn(i + 2).width = 14;` |
| `lib/export/build-scenarios.ts:397` | 36 | `ws.getRow(1).height = 36;` |
| `lib/export/csv-json.ts:278` | 2026 | `const startYear = opts.assumptions.startYear ?? 2026;` |
| `lib/export/excel.ts:34` | 26 | `const rem = (col - 1) % 26;` |
| `lib/export/excel.ts:35` | 65 | `s = String.fromCharCode(65 + rem) + s;` |
| `lib/export/excel.ts:36` | 26 | `col = Math.floor((col - 1) / 26);` |
| `lib/export/excel.ts:150` | 0.001 | `calcProps.iterateDelta = 0.001;` |
| `lib/export/excel.ts:281` | 0.225 | `return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[0] ?? 0.225) : 0.225;` |
| `lib/export/excel.ts:281` | 0.225 | `return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[0] ?? 0.225) : 0.225;` |
| `lib/export/excel.ts:284` | 0.225 | `return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[projIdx] ?? 0.225) : 0.225;` |
| `lib/export/excel.ts:284` | 0.225 | `return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[projIdx] ?? 0.225) : 0.225;` |
| `lib/export/excel.ts:323` | 0.22 | `const allInterestRate = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (assumptions.historicalIn` |
| `lib/export/excel.ts:324` | 0.22 | `const allInterestRate = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (assumptions.historicalIn` |
| `lib/export/excel.ts:328` | 0.18 | `const allInterestIncRate = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (assumptions.historica` |
| `lib/export/excel.ts:329` | 0.18 | `const allInterestIncRate = Array.from({ length: nYears }, (_, i) => i < numHistorical ? (assumptions.historica` |
| `lib/export/excel.ts:349` | 0.30 | `return assumptions.dividendPayoutRatio?.[projIdx] ?? assumptions.dividendPayoutRatio?.[0] ?? 0.30;` |
| `lib/export/excel.ts:396` | 2024 | `startYear: assumptions.startYear ?? 2024` |
| `lib/export/excel.ts:399` | 0.225 | `taxRate: assumptions.taxRate?.[0] ?? 0.225` |
| `lib/export/excel.ts:400` | 0.14 | `vatRate: assumptions.vatRate ?? 0.14` |
| `lib/export/excel.ts:401` | 0.10 | `dividendWithholdingTaxRate: assumptions.dividendWithholdingTaxRate ?? 0.10` |
| `lib/export/excel.ts:402` | 0.195 | `cbeRate: assumptions.cbeRate ?? 0.195` |
| `lib/export/excel.ts:403` | 0.235 | `riskFreeRate: assumptions.riskFreeRate ?? 0.235` |
| `lib/export/excel.ts:413` | 32 | `hdSheet.getColumn(1).width = 32;` |
| `lib/export/excel.ts:414` | 18 | `hdSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:573` | 32 | `aSheet.getColumn(1).width = 32;` |
| `lib/export/excel.ts:575` | 16 | `aSheet.getColumn(i + 2).width = 16;` |
| `lib/export/excel.ts:709` | 0.14 | `addAssumptionRow('VAT Rate', 'vatRate', Array(nYears).fill(assumptions.vatRate ?? 0.14), PCT_FMT, { driverOnly` |
| `lib/export/excel.ts:743` | 0.10 | `addAssumptionRow('EPD Rate (Employee Profit Sharing)', 'employeeProfitSharingRate', Array(nYears).fill(assumpt` |
| `lib/export/excel.ts:751` | 0.05 | `addAssumptionRow('Legal Reserve %', 'legalReservePercent', Array(nYears).fill(assumptions.legalReservePercent ` |
| `lib/export/excel.ts:755` | 0.10 | `addAssumptionRow('Dividend WHT Rate', 'dividendWHTRate', Array(nYears).fill(assumptions.dividendWithholdingTax` |
| `lib/export/excel.ts:975` | 32 | `isSheet.getColumn(1).width = 32;` |
| `lib/export/excel.ts:976` | 18 | `isSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:1359` | 35 | `bsSheet.getColumn(1).width = 35;` |
| `lib/export/excel.ts:1360` | 18 | `bsSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:1746` | 35 | `cfSheet.getColumn(1).width = 35;` |
| `lib/export/excel.ts:1747` | 18 | `cfSheet.getColumn(j + 2).width = 18;` |
| `lib/export/excel.ts:2152` | 30 | `ratioSheet.getColumn(1).width = 30;` |
| `lib/export/excel.ts:2153` | 16 | `ratioSheet.getColumn(i + 2).width = 16;` |
| `lib/export/excel.ts:2491` | 35 | `wcSheet.getColumn(1).width = 35;` |
| `lib/export/excel.ts:2492` | 18 | `wcSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:2632` | 35 | `depSheet.getColumn(1).width = 35;` |
| `lib/export/excel.ts:2633` | 18 | `depSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:2773` | 38 | `debtSheet.getColumn(1).width = 38;` |
| `lib/export/excel.ts:2774` | 18 | `debtSheet.getColumn(i + 2).width = 18;` |
| `lib/export/excel.ts:3000` | 0.14 | `const vatRate = assumptions.vatRate ?? 0.14;` |
| `lib/export/excel.ts:3002` | 32 | `vatSheet.getColumn(1).width = 32;` |
| `lib/export/excel.ts:3003` | 16 | `vatSheet.getColumn(i + 2).width = 16;` |
| `lib/export/excel.ts:3161` | 32 | `lrSheet.getColumn(1).width = 32;` |
| `lib/export/excel.ts:3162` | 20 | `lrSheet.getColumn(2).width = 20;` |
| `lib/export/excel.ts:3163` | 30 | `lrSheet.getColumn(3).width = 30;` |
| `lib/export/excel.ts:3229` | 0.235 | `addLRRow('Risk-Free Rate', assumptions.riskFreeRate ?? 0.235, '0.00%', '[U+00E2][U+2020]' Assumptions');` |
| `lib/export/excel.ts:3230` | 0.195 | `addLRRow('CBE Rate (Assumptions)', assumptions.cbeRate ?? 0.195, '0.00%', '[U+00E2][U+2020]' Assumptions tab');` |
| `lib/export/excel.ts:3231` | 0.22 | `addLRRow('Interest on Debt', assumptions.interestRateOnDebt?.[0] ?? 0.22, '0.00%', '[U+00E2][U+2020]' Debt Schedule tab');` |
| `lib/export/excel.ts:3232` | 0.18 | `addLRRow('Interest on Cash', assumptions.interestRateOnCash?.[0] ?? 0.18, '0.00%', '[U+00E2][U+2020]' IS Interest Income');` |
| `lib/export/excel.ts:3323` | 32 | `const computed = Math.min(Math.max(maxLength + 3, 12), 32);` |
| `lib/export/pdf.ts:27` | 26 | `const NAVY: [number, number, number] = [26, 26, 46];` |
| `lib/export/pdf.ts:27` | 26 | `const NAVY: [number, number, number] = [26, 26, 46];` |
| `lib/export/pdf.ts:27` | 46 | `const NAVY: [number, number, number] = [26, 26, 46];` |
| `lib/export/pdf.ts:28` | 22 | `const DARK_BLUE: [number, number, number] = [22, 33, 62];` |
| `lib/export/pdf.ts:28` | 33 | `const DARK_BLUE: [number, number, number] = [22, 33, 62];` |
| `lib/export/pdf.ts:28` | 62 | `const DARK_BLUE: [number, number, number] = [22, 33, 62];` |
| `lib/export/pdf.ts:29` | 52 | `const ACCENT_BLUE: [number, number, number] = [52, 100, 235];` |
| `lib/export/pdf.ts:29` | 235 | `const ACCENT_BLUE: [number, number, number] = [52, 100, 235];` |
| `lib/export/pdf.ts:30` | 176 | `const ACCENT_TEAL: [number, number, number] = [0, 176, 240];` |
| `lib/export/pdf.ts:30` | 240 | `const ACCENT_TEAL: [number, number, number] = [0, 176, 240];` |
| `lib/export/pdf.ts:31` | 39 | `const GREEN: [number, number, number] = [39, 174, 96];` |
| `lib/export/pdf.ts:31` | 174 | `const GREEN: [number, number, number] = [39, 174, 96];` |
| `lib/export/pdf.ts:31` | 96 | `const GREEN: [number, number, number] = [39, 174, 96];` |
| `lib/export/pdf.ts:32` | 192 | `const RED: [number, number, number] = [192, 57, 43];` |
| `lib/export/pdf.ts:32` | 57 | `const RED: [number, number, number] = [192, 57, 43];` |
| `lib/export/pdf.ts:32` | 43 | `const RED: [number, number, number] = [192, 57, 43];` |
| `lib/export/pdf.ts:33` | 243 | `const ORANGE: [number, number, number] = [243, 156, 18];` |
| `lib/export/pdf.ts:33` | 156 | `const ORANGE: [number, number, number] = [243, 156, 18];` |
| `lib/export/pdf.ts:33` | 18 | `const ORANGE: [number, number, number] = [243, 156, 18];` |
| `lib/export/pdf.ts:34` | 255 | `const WHITE: [number, number, number] = [255, 255, 255];` |
| `lib/export/pdf.ts:34` | 255 | `const WHITE: [number, number, number] = [255, 255, 255];` |
| `lib/export/pdf.ts:34` | 255 | `const WHITE: [number, number, number] = [255, 255, 255];` |
| `lib/export/pdf.ts:35` | 245 | `const LIGHT_GRAY: [number, number, number] = [245, 245, 245];` |
| `lib/export/pdf.ts:35` | 245 | `const LIGHT_GRAY: [number, number, number] = [245, 245, 245];` |
| `lib/export/pdf.ts:35` | 245 | `const LIGHT_GRAY: [number, number, number] = [245, 245, 245];` |
| `lib/export/pdf.ts:36` | 150 | `const MED_GRAY: [number, number, number] = [150, 150, 150];` |
| `lib/export/pdf.ts:36` | 150 | `const MED_GRAY: [number, number, number] = [150, 150, 150];` |
| `lib/export/pdf.ts:36` | 150 | `const MED_GRAY: [number, number, number] = [150, 150, 150];` |
| `lib/export/pdf.ts:41` | 248 | `fillColor: [248, 249, 252] as [number, number, number]` |
| `lib/export/pdf.ts:41` | 249 | `fillColor: [248, 249, 252] as [number, number, number]` |
| `lib/export/pdf.ts:41` | 252 | `fillColor: [248, 249, 252] as [number, number, number]` |
| `lib/export/pdf.ts:46` | 0.01 | `if (v == null \|\| Math.abs(v) < 0.01) return '--';` |
| `lib/export/pdf.ts:47` | 1e9 | `if (Math.abs(v) >= 1e9) return `${_currencySymbol}${(v / 1e9).toFixed(1)}B`;` |
| `lib/export/pdf.ts:47` | 1e9 | `return `${_currencySymbol}${(v / 1e9).toFixed(1)}B`;` |
| `lib/export/pdf.ts:48` | 1e6 | `if (Math.abs(v) >= 1e6) return `${_currencySymbol}${(v / 1e6).toFixed(1)}M`;` |
| `lib/export/pdf.ts:48` | 1e6 | `return `${_currencySymbol}${(v / 1e6).toFixed(1)}M`;` |
| `lib/export/pdf.ts:77` | 14 | `doc.text(`Page ${currentPage}`, pw - 14, ph - 6, { align: 'right' });` |
| `lib/export/pdf.ts:83` | 18 | `doc.rect(0, 0, pw, 18, 'F');` |
| `lib/export/pdf.ts:85` | 18 | `doc.rect(0, 18, pw, 1.2, 'F');` |
| `lib/export/pdf.ts:85` | 1.2 | `doc.rect(0, 18, pw, 1.2, 'F');` |
| `lib/export/pdf.ts:86` | 14 | `doc.setFontSize(14);` |
| `lib/export/pdf.ts:88` | 14 | `doc.text(title, 14, 12);` |
| `lib/export/pdf.ts:91` | 180 | `doc.setTextColor(180, 195, 230);` |
| `lib/export/pdf.ts:91` | 195 | `doc.setTextColor(180, 195, 230);` |
| `lib/export/pdf.ts:91` | 230 | `doc.setTextColor(180, 195, 230);` |
| `lib/export/pdf.ts:92` | 14 | `doc.text(subtitle, pw - 14, 12, { align: 'right' });` |
| `lib/export/pdf.ts:98` | 14 | `doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 6, 'F');` |
| `lib/export/pdf.ts:98` | 28 | `doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 6, 'F');` |
| `lib/export/pdf.ts:101` | 17 | `doc.text(label, 17, y + 4.2);` |
| `lib/export/pdf.ts:101` | 4.2 | `doc.text(label, 17, y + 4.2);` |
| `lib/export/pdf.ts:141` | 36 | `doc.setFontSize(36);` |
| `lib/export/pdf.ts:143` | 55 | `doc.text(companyName, pw / 2, 55, { align: 'center' });` |
| `lib/export/pdf.ts:145` | 18 | `doc.setFontSize(18);` |
| `lib/export/pdf.ts:147` | 68 | `doc.text('3-Statement Financial Model', pw / 2, 68, { align: 'center' });` |
| `lib/export/pdf.ts:150` | 0.8 | `doc.setLineWidth(0.8);` |
| `lib/export/pdf.ts:151` | 50 | `doc.line(pw / 2 - 50, 76, pw / 2 + 50, 76);` |
| `lib/export/pdf.ts:151` | 76 | `doc.line(pw / 2 - 50, 76, pw / 2 + 50, 76);` |
| `lib/export/pdf.ts:151` | 50 | `doc.line(pw / 2 - 50, 76, pw / 2 + 50, 76);` |
| `lib/export/pdf.ts:151` | 76 | `doc.line(pw / 2 - 50, 76, pw / 2 + 50, 76);` |
| `lib/export/pdf.ts:153` | 22 | `doc.setFillColor(22, 33, 62);` |
| `lib/export/pdf.ts:153` | 33 | `doc.setFillColor(22, 33, 62);` |
| `lib/export/pdf.ts:153` | 62 | `doc.setFillColor(22, 33, 62);` |
| `lib/export/pdf.ts:154` | 80 | `doc.roundedRect(pw / 2 - 80, 85, 160, 50, 3, 3, 'F');` |
| `lib/export/pdf.ts:154` | 85 | `doc.roundedRect(pw / 2 - 80, 85, 160, 50, 3, 3, 'F');` |
| `lib/export/pdf.ts:154` | 160 | `doc.roundedRect(pw / 2 - 80, 85, 160, 50, 3, 3, 'F');` |
| `lib/export/pdf.ts:154` | 50 | `doc.roundedRect(pw / 2 - 80, 85, 160, 50, 3, 3, 'F');` |
| `lib/export/pdf.ts:157` | 180 | `doc.setTextColor(180, 200, 240);` |
| `lib/export/pdf.ts:157` | 200 | `doc.setTextColor(180, 200, 240);` |
| `lib/export/pdf.ts:157` | 240 | `doc.setTextColor(180, 200, 240);` |
| `lib/export/pdf.ts:164` | 16 | `const details = [ `Period Coverage: ${periods[0]} [U+00E2][U+20AC][U+201D] ${periods[nYears - 1]}`, `Historical Periods: ${results.in` |
| `lib/export/pdf.ts:167` | 95 | `doc.text(d, pw / 2, 95 + i * 8, { align: 'center' });` |
| `lib/export/pdf.ts:172` | 20 | `doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric'` |
| `lib/export/pdf.ts:175` | 120 | `doc.setTextColor(100, 100, 120);` |
| `lib/export/pdf.ts:197` | 28 | `const cardW = (pw - 28 - 18) / 4;` |
| `lib/export/pdf.ts:197` | 18 | `const cardW = (pw - 28 - 18) / 4;` |
| `lib/export/pdf.ts:198` | 28 | `const cardH = 28;` |
| `lib/export/pdf.ts:202` | 14 | `const x = 14 + col * (cardW + 6);` |
| `lib/export/pdf.ts:203` | 24 | `const y = 24 + row * (cardH + 6);` |
| `lib/export/pdf.ts:214` | 14 | `doc.setFontSize(14);` |
| `lib/export/pdf.ts:216` | 17 | `doc.text(kpi.value, x + 6, y + 17);` |
| `lib/export/pdf.ts:220` | 24 | `doc.text(kpi.sub, x + 6, y + 24);` |
| `lib/export/pdf.ts:223` | 90 | `let ey = 90;` |
| `lib/export/pdf.ts:237` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:237` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:237` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:239` | 248 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:239` | 255 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:239` | 249 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:239` | 255 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:239` | 252 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:239` | 255 | `doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);` |
| `lib/export/pdf.ts:240` | 14 | `doc.rect(14, ey, pw - 28, 7, 'F');` |
| `lib/export/pdf.ts:240` | 28 | `doc.rect(14, ey, pw - 28, 7, 'F');` |
| `lib/export/pdf.ts:241` | 18 | `doc.text(`- ${h}`, 18, ey + 5);` |
| `lib/export/pdf.ts:253` | 24 | `let ry = 24;` |
| `lib/export/pdf.ts:321` | 24 | `startY: 24` |
| `lib/export/pdf.ts:392` | 24 | `startY: 24` |
| `lib/export/pdf.ts:457` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:457` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:457` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:473` | 24 | `startY: 24` |
| `lib/export/pdf.ts:531` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:531` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:531` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:550` | 24 | `startY: 24` |
| `lib/export/pdf.ts:583` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:583` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:583` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:598` | 24 | `startY: 24` |
| `lib/export/pdf.ts:642` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:642` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:642` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:659` | 24 | `startY: 24` |
| `lib/export/pdf.ts:700` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:700` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:700` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:715` | 24 | `startY: 24` |
| `lib/export/pdf.ts:751` | 230 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:751` | 236 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:751` | 250 | `data.cell.styles.fillColor = [230, 236, 250];` |
| `lib/export/pdf.ts:764` | 24 | `let vy = 24;` |
| `lib/export/pdf.ts:768` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:768` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:768` | 50 | `doc.setTextColor(50, 50, 50);` |
| `lib/export/pdf.ts:769` | 18 | `doc.text(`Status: ${results.convergenceInfo.converged ? 'Converged' : 'Not Converged'}`, 18, vy + 5);` |
| `lib/export/pdf.ts:770` | 80 | `doc.text(`Iterations: ${results.convergenceInfo.iterations}`, 80, vy + 5);` |
| `lib/export/pdf.ts:771` | 130 | `doc.text(`Final Delta: ${results.convergenceInfo.finalDelta.toFixed(6)}`, 130, vy + 5);` |
| `lib/export/pdf.ts:815` | 39 | `data.cell.styles.textColor = [39, 174, 96];` |
| `lib/export/pdf.ts:815` | 174 | `data.cell.styles.textColor = [39, 174, 96];` |
| `lib/export/pdf.ts:815` | 96 | `data.cell.styles.textColor = [39, 174, 96];` |
| `lib/export/pdf.ts:819` | 192 | `data.cell.styles.textColor = [192, 57, 43];` |
| `lib/export/pdf.ts:819` | 57 | `data.cell.styles.textColor = [192, 57, 43];` |
| `lib/export/pdf.ts:819` | 43 | `data.cell.styles.textColor = [192, 57, 43];` |
| `lib/export/pdf.ts:830` | 14 | `doc.roundedRect(14, finalVY, pw - 28, 12, 2, 2, 'F');` |
| `lib/export/pdf.ts:830` | 28 | `doc.roundedRect(14, finalVY, pw - 28, 12, 2, 2, 'F');` |
| `lib/export/pdf.ts:831` | 11 | `doc.setFontSize(11);` |
| `lib/export/pdf.ts:851` | 24 | `let dcfY = 24;` |
| `lib/export/pdf.ts:921` | 28 | `let dy = 28;` |
| `lib/export/pdf.ts:925` | 14 | `doc.text('Model Methodology', 14, dy);` |
| `lib/export/pdf.ts:929` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:929` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:929` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:942` | 14 | `doc.text(m, 14, dy, { maxWidth: pw - 28 });` |
| `lib/export/pdf.ts:949` | 14 | `doc.text('Disclaimer', 14, dy);` |
| `lib/export/pdf.ts:953` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:953` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:953` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:962` | 14 | `doc.text(d, 14, dy, { maxWidth: pw - 28 });` |
| `lib/export/pdf.ts:969` | 14 | `doc.text('Egyptian Tax & Regulatory Compliance', 14, dy);` |
| `lib/export/pdf.ts:973` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:973` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:973` | 60 | `doc.setTextColor(60, 60, 60);` |
| `lib/export/pdf.ts:983` | 14 | `doc.text(c, 14, dy, { maxWidth: pw - 28 });` |
| `lib/export/pdf.ts:990` | 14 | `doc.roundedRect(14, dy, pw - 28, 30, 2, 2, 'F');` |
| `lib/export/pdf.ts:990` | 28 | `doc.roundedRect(14, dy, pw - 28, 30, 2, 2, 'F');` |
| `lib/export/pdf.ts:990` | 30 | `doc.roundedRect(14, dy, pw - 28, 30, 2, 2, 'F');` |
| `lib/export/pdf.ts:993` | 20 | `doc.text(`Company: ${companyName}`, 20, dy + 8);` |
| `lib/export/pdf.ts:994` | 20 | `doc.text(`Periods: ${periods[0]} [U+00E2][U+20AC][U+201D] ${periods[nYears - 1]} (${nYears} years) \| Currency: ${currency} (${currCfg` |
| `lib/export/pdf.ts:994` | 14 | `doc.text(`Periods: ${periods[0]} [U+00E2][U+20AC][U+201D] ${periods[nYears - 1]} (${nYears} years) \| Currency: ${currency} (${currCfg` |
| `lib/export/pdf.ts:995` | 20 | `doc.text(`Model Type: 3-Statement Integrated Financial Model with Circular Resolution`, 20, dy + 20);` |
| `lib/export/pdf.ts:995` | 20 | `doc.text(`Model Type: 3-Statement Integrated Financial Model with Circular Resolution`, 20, dy + 20);` |
| `lib/export/pdf.ts:996` | 20 | `doc.text(`Report Generated: ${new Date().toLocaleString()} \| Export v1.0`, 20, dy + 26);` |
| `lib/export/pdf.ts:996` | 26 | `doc.text(`Report Generated: ${new Date().toLocaleString()} \| Export v1.0`, 20, dy + 26);` |
| `lib/export/pdf.ts:1008` | 24 | `let ry = 24;` |
| `lib/export/pdf.ts:1048` | 14 | `doc.text(`Last Updated: ${liveRates.lastUpdated}`, 14, ry);` |
| `lib/ratios.ts:65` | 0.717 | `const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;` |
| `lib/ratios.ts:65` | 0.847 | `const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;` |
| `lib/ratios.ts:65` | 3.107 | `const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;` |
| `lib/ratios.ts:65` | 0.420 | `const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;` |
| `lib/ratios.ts:65` | 0.998 | `const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;` |
| `lib/ratios.ts:67` | 2.90 | `const altmanZone: 'safe' \| 'grey' \| 'distress' = altmanZScore > 2.90 ? 'safe' : altmanZScore > 1.23 ? 'grey' :` |
| `lib/ratios.ts:67` | 1.23 | `const altmanZone: 'safe' \| 'grey' \| 'distress' = altmanZScore > 2.90 ? 'safe' : altmanZScore > 1.23 ? 'grey' :` |
| `lib/ratios.ts:72` | 6.56 | `const altmanZScoreEM = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;` |
| `lib/ratios.ts:72` | 3.26 | `const altmanZScoreEM = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;` |
| `lib/ratios.ts:72` | 6.72 | `const altmanZScoreEM = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;` |
| `lib/ratios.ts:72` | 1.05 | `const altmanZScoreEM = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;` |
| `lib/ratios.ts:74` | 2.60 | `const altmanZoneEM: 'safe' \| 'grey' \| 'distress' = altmanZScoreEM > 2.60 ? 'safe' : altmanZScoreEM > 1.10 ? 'g` |
| `lib/ratios.ts:74` | 1.10 | `const altmanZoneEM: 'safe' \| 'grey' \| 'distress' = altmanZScoreEM > 2.60 ? 'safe' : altmanZScoreEM > 1.10 ? 'g` |
| `lib/scenario-manager.ts:36` | 0.10 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenario-manager.ts:36` | 0.08 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenario-manager.ts:36` | 0.07 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenario-manager.ts:36` | 0.06 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenario-manager.ts:36` | 0.05 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenario-manager.ts:37` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenario-manager.ts:37` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenario-manager.ts:37` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenario-manager.ts:37` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenario-manager.ts:37` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenario-manager.ts:38` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenario-manager.ts:38` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenario-manager.ts:38` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenario-manager.ts:38` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenario-manager.ts:38` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenario-manager.ts:40` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenario-manager.ts:40` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenario-manager.ts:40` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenario-manager.ts:40` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenario-manager.ts:40` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenario-manager.ts:45` | 0.15 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenario-manager.ts:45` | 0.12 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenario-manager.ts:45` | 0.10 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenario-manager.ts:45` | 0.09 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenario-manager.ts:45` | 0.08 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenario-manager.ts:46` | 0.55 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenario-manager.ts:46` | 0.54 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenario-manager.ts:46` | 0.53 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenario-manager.ts:46` | 0.52 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenario-manager.ts:46` | 0.51 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenario-manager.ts:47` | 0.13 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenario-manager.ts:47` | 0.12 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenario-manager.ts:47` | 0.12 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenario-manager.ts:47` | 0.11 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenario-manager.ts:47` | 0.11 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenario-manager.ts:49` | 0.06 | `capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06]` |
| `lib/scenario-manager.ts:49` | 0.06 | `capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06]` |
| `lib/scenario-manager.ts:49` | 0.06 | `capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06]` |
| `lib/scenario-manager.ts:49` | 0.06 | `capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06]` |
| `lib/scenario-manager.ts:49` | 0.06 | `capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06]` |
| `lib/scenario-manager.ts:54` | 0.03 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenario-manager.ts:54` | 0.02 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenario-manager.ts:54` | 0.02 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenario-manager.ts:54` | 0.01 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenario-manager.ts:54` | 0.01 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenario-manager.ts:55` | 0.65 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenario-manager.ts:55` | 0.66 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenario-manager.ts:55` | 0.67 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenario-manager.ts:55` | 0.67 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenario-manager.ts:55` | 0.68 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenario-manager.ts:56` | 0.18 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenario-manager.ts:56` | 0.19 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenario-manager.ts:56` | 0.19 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenario-manager.ts:56` | 0.20 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenario-manager.ts:56` | 0.20 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenario-manager.ts:58` | 0.04 | `capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04]` |
| `lib/scenario-manager.ts:58` | 0.04 | `capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04]` |
| `lib/scenario-manager.ts:58` | 0.04 | `capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04]` |
| `lib/scenario-manager.ts:58` | 0.04 | `capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04]` |
| `lib/scenario-manager.ts:58` | 0.04 | `capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04]` |
| `lib/scenarios.ts:32` | 0.10 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenarios.ts:32` | 0.08 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenarios.ts:32` | 0.07 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenarios.ts:32` | 0.06 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenarios.ts:32` | 0.05 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `lib/scenarios.ts:33` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenarios.ts:33` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenarios.ts:33` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenarios.ts:33` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenarios.ts:33` | 0.60 | `cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60]` |
| `lib/scenarios.ts:34` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenarios.ts:34` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenarios.ts:34` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenarios.ts:34` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenarios.ts:34` | 0.15 | `sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15]` |
| `lib/scenarios.ts:35` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:35` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:35` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:35` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:35` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:36` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:36` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:36` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:36` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:36` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:47` | 0.15 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenarios.ts:47` | 0.12 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenarios.ts:47` | 0.10 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenarios.ts:47` | 0.09 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenarios.ts:47` | 0.08 | `revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08]` |
| `lib/scenarios.ts:48` | 0.55 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenarios.ts:48` | 0.54 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenarios.ts:48` | 0.53 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenarios.ts:48` | 0.52 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenarios.ts:48` | 0.51 | `cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51]` |
| `lib/scenarios.ts:49` | 0.13 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenarios.ts:49` | 0.12 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenarios.ts:49` | 0.12 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenarios.ts:49` | 0.11 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenarios.ts:49` | 0.11 | `sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11]` |
| `lib/scenarios.ts:50` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:50` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:50` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:50` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:50` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:51` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:51` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:51` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:51` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:51` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:52` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:52` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:52` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:52` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:52` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:53` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:53` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:53` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:53` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:53` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:64` | 0.03 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenarios.ts:64` | 0.02 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenarios.ts:64` | 0.02 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenarios.ts:64` | 0.01 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenarios.ts:64` | 0.01 | `revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01]` |
| `lib/scenarios.ts:65` | 0.65 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenarios.ts:65` | 0.66 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenarios.ts:65` | 0.67 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenarios.ts:65` | 0.67 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenarios.ts:65` | 0.68 | `cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68]` |
| `lib/scenarios.ts:66` | 0.18 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenarios.ts:66` | 0.19 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenarios.ts:66` | 0.19 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenarios.ts:66` | 0.20 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenarios.ts:66` | 0.20 | `sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20]` |
| `lib/scenarios.ts:67` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:67` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:67` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:67` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:67` | 0.05 | `rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:68` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:68` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:68` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:68` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:68` | 0.05 | `capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:69` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:69` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:69` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:69` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:69` | 0.05 | `interestRateOnDebt: [0.05, 0.05, 0.05, 0.05, 0.05]` |
| `lib/scenarios.ts:70` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:70` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:70` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:70` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/scenarios.ts:70` | 0.30 | `dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30]` |
| `lib/schedules/egyptian-depreciation.ts:21` | 0.05 | `rate: 0.05` |
| `lib/schedules/egyptian-depreciation.ts:22` | 0.25 | `rate: 0.25` |
| `lib/schedules/egyptian-depreciation.ts:23` | 0.25 | `rate: 0.25` |
| `lib/schedules/egyptian-depreciation.ts:28` | 0.50 | `rate: 0.50` |
| `lib/schedules/egyptian-depreciation.ts:29` | 0.20 | `rate: 0.20` |
| `lib/schedules/egyptian-depreciation.ts:81` | 0.05 | `const rates = [0.05, 0.25, 0.25, 0.50, 0.20];` |
| `lib/schedules/egyptian-depreciation.ts:81` | 0.25 | `const rates = [0.05, 0.25, 0.25, 0.50, 0.20];` |
| `lib/schedules/egyptian-depreciation.ts:81` | 0.25 | `const rates = [0.05, 0.25, 0.25, 0.50, 0.20];` |
| `lib/schedules/egyptian-depreciation.ts:81` | 0.50 | `const rates = [0.05, 0.25, 0.25, 0.50, 0.20];` |
| `lib/schedules/egyptian-depreciation.ts:81` | 0.20 | `const rates = [0.05, 0.25, 0.25, 0.50, 0.20];` |
| `lib/schedules/egyptian-depreciation.ts:83` | 0.10 | `return 0.10;` |
| `lib/schedules/egyptian-depreciation.ts:102` | 0.225 | `corporateTaxRate: 0.225` |
| `lib/schedules/egyptian-depreciation.ts:103` | 0.14 | `vatRate: 0.14` |
| `lib/schedules/egyptian-depreciation.ts:104` | 0.10 | `dividendWithholdingRate: 0.10` |
| `lib/services/analyst.ts:115` | 0.1 | `lines.push( `${String(b.period ?? '').padEnd(12)} \| ${fmt(b.cash)} \| ${fmt(ta)} \| ${fmt(tl)} \| ${fmt(b.totalEq` |
| `lib/services/analyst.ts:148` | 0.1 | `const match = Math.abs(endCash - bsCash) < 0.1;` |
| `lib/services/analyst.ts:197` | 1500 | `max_tokens: 1500` |
| `lib/services/analyst.ts:198` | 0.1 | `temperature: 0.1` |
| `lib/services/liveRates.ts:36` | 0.190 | `cbeDepositRate: 0.190` |
| `lib/services/liveRates.ts:37` | 0.200 | `cbeLendingRate: 0.200` |
| `lib/services/liveRates.ts:38` | 0.195 | `cbeDiscountRate: 0.195` |
| `lib/services/liveRates.ts:39` | 0.235 | `tbillRate12m: 0.235` |
| `lib/services/liveRates.ts:40` | 50.80 | `usdEgpRate: 50.80` |
| `lib/services/liveRates.ts:41` | 55.20 | `eurEgpRate: 55.20` |
| `lib/services/liveRates.ts:42` | 13.55 | `sarEgpRate: 13.55` |
| `lib/services/liveRates.ts:43` | 13.83 | `aedEgpRate: 13.83` |
| `lib/services/liveRates.ts:44` | 0.134 | `egyptianCPI: 0.134` |
| `lib/services/liveRates.ts:60` | 5000 | `const timeout = setTimeout(() => controller.abort(), 5000);` |
| `lib/services/liveRates.ts:75` | 0.92 | `eurEgpRate: egp / (fxData.rates?.EUR ?? 0.92)` |
| `lib/services/liveRates.ts:76` | 3.75 | `sarEgpRate: egp / (fxData.rates?.SAR ?? 3.75)` |
| `lib/services/liveRates.ts:77` | 3.67 | `aedEgpRate: egp / (fxData.rates?.AED ?? 3.67)` |
| `lib/services/liveRates.ts:112` | 0.02 | `interestRateOnDebt: assumptions.interestRateOnDebt.map((_, i) => Math.max(rates.cbeLendingRate + 0.02 - (i * 0` |
| `lib/services/liveRates.ts:112` | 0.01 | `interestRateOnDebt: assumptions.interestRateOnDebt.map((_, i) => Math.max(rates.cbeLendingRate + 0.02 - (i * 0` |
| `lib/services/liveRates.ts:115` | 0.01 | `interestRateOnCash: assumptions.interestRateOnCash.map((_, i) => Math.max(rates.cbeDepositRate - (i * 0.01), 0` |
| `lib/services/liveRates.ts:115` | 0.08 | `interestRateOnCash: assumptions.interestRateOnCash.map((_, i) => Math.max(rates.cbeDepositRate - (i * 0.01), 0` |
| `lib/store.ts:165` | 49 | `undoStack: [...state.undoStack.slice(-49), undoEntry]` |
| `lib/store.ts:226` | 0.95 | `if (lastIS.grossMargin > 0.95) { warnings.push({ id: 'high-margin', type: 'unrealistic' as const, message: 'Gr` |
| `lib/store.ts:234` | 0.5 | `if (lastIS.netMargin < -0.5) { warnings.push({ id: 'neg-margin', type: 'unrealistic' as const, message: 'Net m` |
| `lib/store.ts:505` | 0.195 | `updatedAssumptions.cbeRate = 0.195;` |
| `lib/store.ts:506` | 0.22 | `updatedAssumptions.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:506` | 0.20 | `updatedAssumptions.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:506` | 0.18 | `updatedAssumptions.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:506` | 0.17 | `updatedAssumptions.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:506` | 0.16 | `updatedAssumptions.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:507` | 0.19 | `updatedAssumptions.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:507` | 0.17 | `updatedAssumptions.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:507` | 0.15 | `updatedAssumptions.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:507` | 0.13 | `updatedAssumptions.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:507` | 0.12 | `updatedAssumptions.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:508` | 0.295 | `updatedAssumptions.historicalInterestRateOnDebt = [0.295, 0.245];` |
| `lib/store.ts:508` | 0.245 | `updatedAssumptions.historicalInterestRateOnDebt = [0.295, 0.245];` |
| `lib/store.ts:509` | 0.255 | `updatedAssumptions.historicalInterestRateOnCash = [0.255, 0.215];` |
| `lib/store.ts:509` | 0.215 | `updatedAssumptions.historicalInterestRateOnCash = [0.255, 0.215];` |
| `lib/store.ts:510` | 0.045 | `updatedAssumptions.legacyDebtRate = 0.045;` |
| `lib/store.ts:511` | 0.10 | `updatedAssumptions.employeeProfitSharingRate = 0.10;` |
| `lib/store.ts:514` | 0.25 | `updatedAssumptions.taxRate = updatedAssumptions.taxRate.map(() => 0.25);` |
| `lib/store.ts:570` | 0.2725 | `a.cbeRate = 0.2725;` |
| `lib/store.ts:571` | 0.045 | `a.legacyDebtRate = 0.045;` |
| `lib/store.ts:572` | 0.10 | `a.employeeProfitSharingRate = 0.10;` |
| `lib/store.ts:576` | 0.20 | `a.riskFreeRate = 0.20;` |
| `lib/store.ts:577` | 0.08 | `if (a.equityRiskPremium === undefined \|\| a.equityRiskPremium < 0.08) a.equityRiskPremium = 0.105;` |
| `lib/store.ts:577` | 0.105 | `a.equityRiskPremium = 0.105;` |
| `lib/store.ts:578` | 0.06 | `if (a.terminalGrowthRate === undefined \|\| a.terminalGrowthRate < 0.06) a.terminalGrowthRate = 0.07;` |
| `lib/store.ts:578` | 0.07 | `a.terminalGrowthRate = 0.07;` |
| `lib/store.ts:584` | 0.225 | `standard: 0.225` |
| `lib/store.ts:584` | 0.4055 | `oil: 0.4055` |
| `lib/store.ts:584` | 0.40 | `strategic: 0.40` |
| `lib/store.ts:587` | 0.225 | `const correctRate = TAX_RATES[regime] ?? 0.225;` |
| `lib/store.ts:595` | 0.225 | `a.taxRate = a.taxRate.map(() => 0.225);` |
| `lib/store.ts:602` | 0.06 | `const allLow = a.interestRateOnDebt.every((r: number) => r <= 0.06);` |
| `lib/store.ts:603` | 0.22 | `a.interestRateOnDebt = a.interestRateOnDebt.map(() => 0.22);` |
| `lib/store.ts:606` | 0.05 | `const allLow = a.interestRateOnCash.every((r: number) => r <= 0.05);` |
| `lib/store.ts:607` | 0.18 | `a.interestRateOnCash = a.interestRateOnCash.map(() => 0.18);` |
| `lib/store.ts:610` | 2025 | `if (a.startYear === 2025) a.startYear = 2026;` |
| `lib/store.ts:610` | 2026 | `a.startYear = 2026;` |
| `lib/store.ts:636` | 0.10 | `const hasErroneousRate = a.taxRate.some((r: number) => r > 0 && r < 0.10);` |
| `lib/store.ts:638` | 0.10 | `a.taxRate = a.taxRate.map((r: number) => (r > 0 && r < 0.10) ? 0.225 : r);` |
| `lib/store.ts:638` | 0.225 | `a.taxRate = a.taxRate.map((r: number) => (r > 0 && r < 0.10) ? 0.225 : r);` |
| `lib/store.ts:661` | 0.25 | `if (a.cbeRate !== undefined && a.cbeRate > 0.25) { a.cbeRate = 0.195; }` |
| `lib/store.ts:662` | 0.195 | `a.cbeRate = 0.195;` |
| `lib/store.ts:665` | 0.22 | `if (a.riskFreeRate !== undefined && a.riskFreeRate < 0.22) { a.riskFreeRate = 0.235; }` |
| `lib/store.ts:666` | 0.235 | `a.riskFreeRate = 0.235;` |
| `lib/store.ts:670` | 0.22 | `const allFlat22 = a.interestRateOnDebt.every((r: number) => Math.abs(r - 0.22) < 0.001);` |
| `lib/store.ts:670` | 0.001 | `const allFlat22 = a.interestRateOnDebt.every((r: number) => Math.abs(r - 0.22) < 0.001);` |
| `lib/store.ts:672` | 0.22 | `a.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:672` | 0.20 | `a.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:672` | 0.18 | `a.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:672` | 0.17 | `a.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:672` | 0.16 | `a.interestRateOnDebt = [0.22, 0.20, 0.18, 0.17, 0.16];` |
| `lib/store.ts:677` | 0.18 | `const allFlat18 = a.interestRateOnCash.every((r: number) => Math.abs(r - 0.18) < 0.001);` |
| `lib/store.ts:677` | 0.001 | `const allFlat18 = a.interestRateOnCash.every((r: number) => Math.abs(r - 0.18) < 0.001);` |
| `lib/store.ts:679` | 0.19 | `a.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:679` | 0.17 | `a.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:679` | 0.15 | `a.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:679` | 0.13 | `a.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:679` | 0.12 | `a.interestRateOnCash = [0.19, 0.17, 0.15, 0.13, 0.12];` |
| `lib/store.ts:701` | 0.295 | `a.historicalInterestRateOnDebt = [0.295, 0.245];` |
| `lib/store.ts:701` | 0.245 | `a.historicalInterestRateOnDebt = [0.295, 0.245];` |
| `lib/store.ts:704` | 0.255 | `a.historicalInterestRateOnCash = [0.255, 0.215];` |
| `lib/store.ts:704` | 0.215 | `a.historicalInterestRateOnCash = [0.255, 0.215];` |
| `lib/templates/egyptian-industries.ts:32` | 0.15 | `revenueGrowth: 0.15` |
| `lib/templates/egyptian-industries.ts:33` | 0.35 | `grossMargin: 0.35` |
| `lib/templates/egyptian-industries.ts:34` | 0.08 | `sgaPercent: 0.08` |
| `lib/templates/egyptian-industries.ts:35` | 90 | `dso: 90` |
| `lib/templates/egyptian-industries.ts:36` | 60 | `dio: 60` |
| `lib/templates/egyptian-industries.ts:37` | 75 | `dpo: 75` |
| `lib/templates/egyptian-industries.ts:38` | 0.03 | `capexPercent: 0.03` |
| `lib/templates/egyptian-industries.ts:39` | 0.60 | `buildings: 0.60` |
| `lib/templates/egyptian-industries.ts:39` | 0.20 | `machinery: 0.20` |
| `lib/templates/egyptian-industries.ts:39` | 0.10 | `vehicles: 0.10` |
| `lib/templates/egyptian-industries.ts:39` | 0.05 | `computers: 0.05` |
| `lib/templates/egyptian-industries.ts:39` | 0.05 | `furniture: 0.05` |
| `lib/templates/egyptian-industries.ts:46` | 0.12 | `revenueGrowth: 0.12` |
| `lib/templates/egyptian-industries.ts:47` | 0.30 | `grossMargin: 0.30` |
| `lib/templates/egyptian-industries.ts:48` | 0.12 | `sgaPercent: 0.12` |
| `lib/templates/egyptian-industries.ts:49` | 30 | `dso: 30` |
| `lib/templates/egyptian-industries.ts:50` | 45 | `dio: 45` |
| `lib/templates/egyptian-industries.ts:51` | 40 | `dpo: 40` |
| `lib/templates/egyptian-industries.ts:52` | 0.05 | `capexPercent: 0.05` |
| `lib/templates/egyptian-industries.ts:53` | 0.25 | `buildings: 0.25` |
| `lib/templates/egyptian-industries.ts:53` | 0.45 | `machinery: 0.45` |
| `lib/templates/egyptian-industries.ts:53` | 0.15 | `vehicles: 0.15` |
| `lib/templates/egyptian-industries.ts:53` | 0.05 | `computers: 0.05` |
| `lib/templates/egyptian-industries.ts:53` | 0.10 | `furniture: 0.10` |
| `lib/templates/egyptian-industries.ts:60` | 0.10 | `revenueGrowth: 0.10` |
| `lib/templates/egyptian-industries.ts:61` | 0.55 | `grossMargin: 0.55` |
| `lib/templates/egyptian-industries.ts:62` | 0.15 | `sgaPercent: 0.15` |
| `lib/templates/egyptian-industries.ts:63` | 35 | `dso: 35` |
| `lib/templates/egyptian-industries.ts:65` | 50 | `dpo: 50` |
| `lib/templates/egyptian-industries.ts:66` | 0.15 | `capexPercent: 0.15` |
| `lib/templates/egyptian-industries.ts:67` | 0.15 | `buildings: 0.15` |
| `lib/templates/egyptian-industries.ts:67` | 0.40 | `machinery: 0.40` |
| `lib/templates/egyptian-industries.ts:67` | 0.05 | `vehicles: 0.05` |
| `lib/templates/egyptian-industries.ts:67` | 0.30 | `computers: 0.30` |
| `lib/templates/egyptian-industries.ts:67` | 0.10 | `furniture: 0.10` |
| `lib/templates/egyptian-industries.ts:74` | 0.08 | `revenueGrowth: 0.08` |
| `lib/templates/egyptian-industries.ts:75` | 0.25 | `grossMargin: 0.25` |
| `lib/templates/egyptian-industries.ts:76` | 0.06 | `sgaPercent: 0.06` |
| `lib/templates/egyptian-industries.ts:77` | 45 | `dso: 45` |
| `lib/templates/egyptian-industries.ts:78` | 30 | `dio: 30` |
| `lib/templates/egyptian-industries.ts:79` | 45 | `dpo: 45` |
| `lib/templates/egyptian-industries.ts:80` | 0.08 | `capexPercent: 0.08` |
| `lib/templates/egyptian-industries.ts:81` | 0.20 | `buildings: 0.20` |
| `lib/templates/egyptian-industries.ts:81` | 0.55 | `machinery: 0.55` |
| `lib/templates/egyptian-industries.ts:81` | 0.10 | `vehicles: 0.10` |
| `lib/templates/egyptian-industries.ts:81` | 0.05 | `computers: 0.05` |
| `lib/templates/egyptian-industries.ts:81` | 0.10 | `furniture: 0.10` |
| `lib/templates/egyptian-industries.ts:88` | 0.18 | `revenueGrowth: 0.18` |
| `lib/templates/egyptian-industries.ts:89` | 0.45 | `grossMargin: 0.45` |
| `lib/templates/egyptian-industries.ts:90` | 0.20 | `sgaPercent: 0.20` |
| `lib/templates/egyptian-industries.ts:91` | 15 | `dso: 15` |
| `lib/templates/egyptian-industries.ts:93` | 25 | `dpo: 25` |
| `lib/templates/egyptian-industries.ts:94` | 0.06 | `capexPercent: 0.06` |
| `lib/templates/egyptian-industries.ts:95` | 0.55 | `buildings: 0.55` |
| `lib/templates/egyptian-industries.ts:95` | 0.10 | `machinery: 0.10` |
| `lib/templates/egyptian-industries.ts:95` | 0.10 | `vehicles: 0.10` |
| `lib/templates/egyptian-industries.ts:95` | 0.10 | `computers: 0.10` |
| `lib/templates/egyptian-industries.ts:95` | 0.15 | `furniture: 0.15` |
| `lib/utils.ts:39` | 1_000_000_000 | `if (Math.abs(value) >= 1_000_000_000) return `${cfg.symbol}${(value / 1_000_000_000).toFixed(1)}B`;` |
| `lib/utils.ts:39` | 1_000_000_000 | `return `${cfg.symbol}${(value / 1_000_000_000).toFixed(1)}B`;` |
| `lib/utils.ts:40` | 1_000_000 | `if (Math.abs(value) >= 1_000_000) return `${cfg.symbol}${(value / 1_000_000).toFixed(1)}M`;` |
| `lib/utils.ts:40` | 1_000_000 | `return `${cfg.symbol}${(value / 1_000_000).toFixed(1)}M`;` |
| `types/assumptions.ts:215` | 1_000_000 | `revenueBase: 1_000_000` |
| `types/assumptions.ts:216` | 0.10 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `types/assumptions.ts:216` | 0.08 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `types/assumptions.ts:216` | 0.07 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `types/assumptions.ts:216` | 0.06 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `types/assumptions.ts:216` | 0.05 | `revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05]` |
| `types/assumptions.ts:218` | 0.60 | `cogsPercent: fill(0.60)` |
| `types/assumptions.ts:219` | 0.15 | `sgaPercent: fill(0.15)` |
| `types/assumptions.ts:221` | 0.02 | `otherOpexPercent: fill(0.02)` |
| `types/assumptions.ts:223` | 45 | `dso: fill(45)` |
| `types/assumptions.ts:224` | 30 | `dio: fill(30)` |
| `types/assumptions.ts:225` | 40 | `dpo: fill(40)` |
| `types/assumptions.ts:226` | 0.01 | `prepaidPercent: fill(0.01)` |
| `types/assumptions.ts:227` | 0.03 | `accruedExpPercent: fill(0.03)` |
| `types/assumptions.ts:228` | 0.02 | `deferredRevPercent: fill(0.02)` |
| `types/assumptions.ts:230` | 0.05 | `capexPercent: fill(0.05)` |
| `types/assumptions.ts:231` | 0.10 | `depreciationRate: fill(0.10)` |
| `types/assumptions.ts:232` | 5_000 | `amortizationAmount: fill(5_000)` |
| `types/assumptions.ts:235` | 0.195 | `cbeRate: 0.195` |
| `types/assumptions.ts:236` | 0.22 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `types/assumptions.ts:236` | 0.20 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `types/assumptions.ts:236` | 0.18 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `types/assumptions.ts:236` | 0.17 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `types/assumptions.ts:236` | 0.16 | `interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16]` |
| `types/assumptions.ts:237` | 0.19 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `types/assumptions.ts:237` | 0.17 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `types/assumptions.ts:237` | 0.15 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `types/assumptions.ts:237` | 0.13 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `types/assumptions.ts:237` | 0.12 | `interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12]` |
| `types/assumptions.ts:239` | 0.295 | `historicalInterestRateOnDebt: [0.295, 0.245]` |
| `types/assumptions.ts:239` | 0.245 | `historicalInterestRateOnDebt: [0.295, 0.245]` |
| `types/assumptions.ts:240` | 0.255 | `historicalInterestRateOnCash: [0.255, 0.215]` |
| `types/assumptions.ts:240` | 0.215 | `historicalInterestRateOnCash: [0.255, 0.215]` |
| `types/assumptions.ts:241` | 0.045 | `legacyDebtRate: 0.045` |
| `types/assumptions.ts:242` | 50_000 | `shortTermDebtAmount: fill(50_000)` |
| `types/assumptions.ts:249` | 100_000 | `sharesOutstanding: fill(100_000)` |
| `types/assumptions.ts:250` | 0.30 | `dividendPayoutRatio: fill(0.30)` |
| `types/assumptions.ts:252` | 10_000 | `stockBasedCompAmount: fill(10_000)` |
| `types/assumptions.ts:254` | 0.225 | `taxRate: fill(0.225)` |
| `types/assumptions.ts:256` | 0.10 | `employeeProfitSharingRate: 0.10` |
| `types/assumptions.ts:269` | 0.02 | `corporateCreditSpread: 0.02` |
| `types/assumptions.ts:271` | 0.195 | `cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130]` |
| `types/assumptions.ts:271` | 0.175 | `cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130]` |
| `types/assumptions.ts:271` | 0.155 | `cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130]` |
| `types/assumptions.ts:271` | 0.140 | `cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130]` |
| `types/assumptions.ts:271` | 0.130 | `cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130]` |
| `types/assumptions.ts:275` | 0.05 | `legalReservePercent: 0.05` |
| `types/assumptions.ts:276` | 10_000 | `paidUpCapital: 10_000` |
| `types/assumptions.ts:277` | 0.50 | `legalReserveCap: 0.50` |
| `types/assumptions.ts:282` | 0.10 | `dividendWithholdingTaxRate: 0.10` |
| `types/assumptions.ts:288` | 0.30 | `buildings: 0.30` |
| `types/assumptions.ts:289` | 0.35 | `machinery: 0.35` |
| `types/assumptions.ts:290` | 0.15 | `vehicles: 0.15` |
| `types/assumptions.ts:291` | 0.10 | `computers: 0.10` |
| `types/assumptions.ts:292` | 0.10 | `furniture: 0.10` |
| `types/assumptions.ts:297` | 5_000 | `averageMonthlyBasicSalary: 5_000` |
| `types/assumptions.ts:298` | 50 | `numberOfEmployees: fill(50)` |
| `types/assumptions.ts:299` | 0.015 | `eosProvisionPctOfSGA: fill(0.015)` |
| `types/assumptions.ts:303` | 100_000 | `goodwill: fill(100_000)` |
| `types/assumptions.ts:304` | 20_000 | `otherLongTermAssets: fill(20_000)` |
| `types/assumptions.ts:305` | 10_000 | `otherCurrentAssets: fill(10_000)` |
| `types/assumptions.ts:306` | 15_000 | `otherCurrentLiabilities: fill(15_000)` |
| `types/assumptions.ts:307` | 30_000 | `deferredTaxLiabilities: fill(30_000)` |
| `types/assumptions.ts:308` | 25_000 | `otherLongTermLiabilities: fill(25_000)` |
| `types/assumptions.ts:309` | 10_000 | `commonStock: fill(10_000)` |
| `types/assumptions.ts:310` | 200_000 | `apic: fill(200_000)` |
| `types/assumptions.ts:320` | 0.14 | `vatRate: 0.14` |
| `types/assumptions.ts:322` | 0.10 | `dividendWithholdingRate: 0.10` |
| `types/assumptions.ts:328` | 0.235 | `riskFreeRate: 0.235` |
| `types/assumptions.ts:329` | 0.07 | `terminalGrowthRate: 0.07` |
| `types/assumptions.ts:330` | 0.105 | `equityRiskPremium: 0.105` |
| `types/assumptions.ts:334` | 0.25 | `inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08]` |
| `types/assumptions.ts:334` | 0.18 | `inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08]` |
| `types/assumptions.ts:334` | 0.14 | `inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08]` |
| `types/assumptions.ts:334` | 0.10 | `inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08]` |
| `types/assumptions.ts:334` | 0.08 | `inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08]` |
| `types/assumptions.ts:341` | 2026 | `startYear: 2026` |
| `types/assumptions.ts:349` | 175_000 | `const cash = [175_000, 200_000];` |
| `types/assumptions.ts:349` | 200_000 | `const cash = [175_000, 200_000];` |
| `types/assumptions.ts:350` | 104_795 | `const accountsReceivable = [104_795, 117_123];` |
| `types/assumptions.ts:350` | 117_123 | `const accountsReceivable = [104_795, 117_123];` |
| `types/assumptions.ts:351` | 41_918 | `const inventory = [41_918, 46_849];` |
| `types/assumptions.ts:351` | 46_849 | `const inventory = [41_918, 46_849];` |
| `types/assumptions.ts:352` | 8_500 | `const prepaidExpenses = [8_500, 9_500];` |
| `types/assumptions.ts:352` | 9_500 | `const prepaidExpenses = [8_500, 9_500];` |
| `types/assumptions.ts:353` | 10_000 | `const otherCurrentAssets = [10_000, 10_000];` |
| `types/assumptions.ts:353` | 10_000 | `const otherCurrentAssets = [10_000, 10_000];` |
| `types/assumptions.ts:354` | 340_000 | `const grossPPE = [340_000, 385_000];` |
| `types/assumptions.ts:354` | 385_000 | `const grossPPE = [340_000, 385_000];` |
| `types/assumptions.ts:355` | 128_000 | `const accumulatedDepreciation = [128_000, 160_000];` |
| `types/assumptions.ts:355` | 160_000 | `const accumulatedDepreciation = [128_000, 160_000];` |
| `types/assumptions.ts:356` | 45_000 | `const intangibles = [45_000, 40_000];` |
| `types/assumptions.ts:356` | 40_000 | `const intangibles = [45_000, 40_000];` |
| `types/assumptions.ts:357` | 100_000 | `const goodwill = [100_000, 100_000];` |
| `types/assumptions.ts:357` | 100_000 | `const goodwill = [100_000, 100_000];` |
| `types/assumptions.ts:358` | 20_000 | `const otherLongTermAssets = [20_000, 20_000];` |
| `types/assumptions.ts:358` | 20_000 | `const otherLongTermAssets = [20_000, 20_000];` |
| `types/assumptions.ts:361` | 55_890 | `const accountsPayable = [55_890, 62_466];` |
| `types/assumptions.ts:361` | 62_466 | `const accountsPayable = [55_890, 62_466];` |
| `types/assumptions.ts:362` | 25_500 | `const accruedExpenses = [25_500, 28_500];` |
| `types/assumptions.ts:362` | 28_500 | `const accruedExpenses = [25_500, 28_500];` |
| `types/assumptions.ts:363` | 50_000 | `const shortTermDebt = [50_000, 50_000];` |
| `types/assumptions.ts:363` | 50_000 | `const shortTermDebt = [50_000, 50_000];` |
| `types/assumptions.ts:364` | 20_000 | `const currentPortionLTD = [20_000, 20_000];` |
| `types/assumptions.ts:364` | 20_000 | `const currentPortionLTD = [20_000, 20_000];` |
| `types/assumptions.ts:365` | 17_000 | `const deferredRevenue = [17_000, 19_000];` |
| `types/assumptions.ts:365` | 19_000 | `const deferredRevenue = [17_000, 19_000];` |
| `types/assumptions.ts:366` | 15_000 | `const otherCurrentLiabilities = [15_000, 15_000];` |
| `types/assumptions.ts:366` | 15_000 | `const otherCurrentLiabilities = [15_000, 15_000];` |
| `types/assumptions.ts:367` | 230_000 | `const longTermDebt = [230_000, 210_000];` |
| `types/assumptions.ts:367` | 210_000 | `const longTermDebt = [230_000, 210_000];` |
| `types/assumptions.ts:368` | 30_000 | `const deferredTaxLiabilities = [30_000, 30_000];` |
| `types/assumptions.ts:368` | 30_000 | `const deferredTaxLiabilities = [30_000, 30_000];` |
| `types/assumptions.ts:369` | 25_000 | `const otherLongTermLiabilities = [25_000, 25_000];` |
| `types/assumptions.ts:369` | 25_000 | `const otherLongTermLiabilities = [25_000, 25_000];` |
| `types/assumptions.ts:372` | 10_000 | `const commonStock = [10_000, 10_000];` |
| `types/assumptions.ts:372` | 10_000 | `const commonStock = [10_000, 10_000];` |
| `types/assumptions.ts:373` | 210_000 | `const additionalPaidInCapital = [210_000, 220_000];` |
| `types/assumptions.ts:373` | 220_000 | `const additionalPaidInCapital = [210_000, 220_000];` |
| `types/assumptions.ts:395` | 850_000 | `revenue: [850_000, 950_000]` |
| `types/assumptions.ts:395` | 950_000 | `revenue: [850_000, 950_000]` |
| `types/assumptions.ts:396` | 510_000 | `cogs: [510_000, 570_000]` |
| `types/assumptions.ts:396` | 570_000 | `cogs: [510_000, 570_000]` |
| `types/assumptions.ts:397` | 127_500 | `sgaExpense: [127_500, 142_500]` |
| `types/assumptions.ts:397` | 142_500 | `sgaExpense: [127_500, 142_500]` |
| `types/assumptions.ts:398` | 42_500 | `rdExpense: [42_500, 47_500]` |
| `types/assumptions.ts:398` | 47_500 | `rdExpense: [42_500, 47_500]` |
| `types/assumptions.ts:399` | 28_000 | `depreciation: [28_000, 32_000]` |
| `types/assumptions.ts:399` | 32_000 | `depreciation: [28_000, 32_000]` |
| `types/assumptions.ts:400` | 5_000 | `amortization: [5_000, 5_000]` |
| `types/assumptions.ts:400` | 5_000 | `amortization: [5_000, 5_000]` |
| `types/assumptions.ts:401` | 17_000 | `otherOpex: [17_000, 19_000]` |
| `types/assumptions.ts:401` | 19_000 | `otherOpex: [17_000, 19_000]` |
| `types/assumptions.ts:402` | 2_500 | `interestIncome: [2_500, 3_000]` |
| `types/assumptions.ts:402` | 3_000 | `interestIncome: [2_500, 3_000]` |
| `types/assumptions.ts:403` | 14_000 | `interestExpense: [14_000, 13_000]` |
| `types/assumptions.ts:403` | 13_000 | `interestExpense: [14_000, 13_000]` |
| `types/assumptions.ts:405` | 24_413 | `taxExpense: [24_413, 27_900]` |
| `types/assumptions.ts:405` | 27_900 | `taxExpense: [24_413, 27_900]` |
| `types/assumptions.ts:406` | 100_000 | `sharesOutstanding: [100_000, 100_000]` |
| `types/assumptions.ts:406` | 100_000 | `sharesOutstanding: [100_000, 100_000]` |
| `types/historical.ts:157` | 2024 | `year: 2024` |
| `types/historical.ts:159` | 850_000 | `revenue: 850_000` |
| `types/historical.ts:160` | 510_000 | `cogs: 510_000` |
| `types/historical.ts:161` | 127_500 | `sgaExpense: 127_500` |
| `types/historical.ts:162` | 42_500 | `rdExpense: 42_500` |
| `types/historical.ts:163` | 28_000 | `depreciation: 28_000` |
| `types/historical.ts:164` | 5_000 | `amortization: 5_000` |
| `types/historical.ts:165` | 17_000 | `otherOpex: 17_000` |
| `types/historical.ts:166` | 2_500 | `interestIncome: 2_500` |
| `types/historical.ts:167` | 14_000 | `interestExpense: 14_000` |
| `types/historical.ts:169` | 24_413 | `taxExpense: 24_413` |
| `types/historical.ts:170` | 100_000 | `sharesOutstanding: 100_000` |
| `types/historical.ts:171` | 175_000 | `cash: 175_000` |
| `types/historical.ts:172` | 104_795 | `accountsReceivable: 104_795` |
| `types/historical.ts:173` | 41_918 | `inventory: 41_918` |
| `types/historical.ts:174` | 8_500 | `prepaidExpenses: 8_500` |
| `types/historical.ts:175` | 10_000 | `otherCurrentAssets: 10_000` |
| `types/historical.ts:176` | 340_000 | `grossPPE: 340_000` |
| `types/historical.ts:177` | 128_000 | `accumulatedDepreciation: 128_000` |
| `types/historical.ts:178` | 45_000 | `intangibleAssets: 45_000` |
| `types/historical.ts:179` | 100_000 | `goodwill: 100_000` |
| `types/historical.ts:180` | 20_000 | `otherLTAssets: 20_000` |
| `types/historical.ts:181` | 55_890 | `accountsPayable: 55_890` |
| `types/historical.ts:182` | 25_500 | `accruedExpenses: 25_500` |
| `types/historical.ts:183` | 50_000 | `shortTermDebt: 50_000` |
| `types/historical.ts:184` | 20_000 | `currentPortionLTD: 20_000` |
| `types/historical.ts:185` | 17_000 | `deferredRevenue: 17_000` |
| `types/historical.ts:186` | 15_000 | `otherCurrentLiabilities: 15_000` |
| `types/historical.ts:187` | 230_000 | `longTermDebt: 230_000` |
| `types/historical.ts:188` | 30_000 | `deferredTaxLiabilities: 30_000` |
| `types/historical.ts:189` | 25_000 | `otherLTLiabilities: 25_000` |
| `types/historical.ts:190` | 10_000 | `commonStock: 10_000` |
| `types/historical.ts:191` | 210_000 | `additionalPaidInCapital: 210_000` |
| `types/historical.ts:196` | 2025 | `year: 2025` |
| `types/historical.ts:198` | 950_000 | `revenue: 950_000` |
| `types/historical.ts:199` | 570_000 | `cogs: 570_000` |
| `types/historical.ts:200` | 142_500 | `sgaExpense: 142_500` |
| `types/historical.ts:201` | 47_500 | `rdExpense: 47_500` |
| `types/historical.ts:202` | 32_000 | `depreciation: 32_000` |
| `types/historical.ts:203` | 5_000 | `amortization: 5_000` |
| `types/historical.ts:204` | 19_000 | `otherOpex: 19_000` |
| `types/historical.ts:205` | 3_000 | `interestIncome: 3_000` |
| `types/historical.ts:206` | 13_000 | `interestExpense: 13_000` |
| `types/historical.ts:208` | 27_900 | `taxExpense: 27_900` |
| `types/historical.ts:209` | 100_000 | `sharesOutstanding: 100_000` |
| `types/historical.ts:210` | 200_000 | `cash: 200_000` |
| `types/historical.ts:211` | 117_123 | `accountsReceivable: 117_123` |
| `types/historical.ts:212` | 46_849 | `inventory: 46_849` |
| `types/historical.ts:213` | 9_500 | `prepaidExpenses: 9_500` |
| `types/historical.ts:214` | 10_000 | `otherCurrentAssets: 10_000` |
| `types/historical.ts:215` | 385_000 | `grossPPE: 385_000` |
| `types/historical.ts:216` | 160_000 | `accumulatedDepreciation: 160_000` |
| `types/historical.ts:217` | 40_000 | `intangibleAssets: 40_000` |
| `types/historical.ts:218` | 100_000 | `goodwill: 100_000` |
| `types/historical.ts:219` | 20_000 | `otherLTAssets: 20_000` |
| `types/historical.ts:220` | 62_466 | `accountsPayable: 62_466` |
| `types/historical.ts:221` | 28_500 | `accruedExpenses: 28_500` |
| `types/historical.ts:222` | 50_000 | `shortTermDebt: 50_000` |
| `types/historical.ts:223` | 20_000 | `currentPortionLTD: 20_000` |
| `types/historical.ts:224` | 19_000 | `deferredRevenue: 19_000` |
| `types/historical.ts:225` | 15_000 | `otherCurrentLiabilities: 15_000` |
| `types/historical.ts:226` | 210_000 | `longTermDebt: 210_000` |
| `types/historical.ts:227` | 30_000 | `deferredTaxLiabilities: 30_000` |
| `types/historical.ts:228` | 25_000 | `otherLTLiabilities: 25_000` |
| `types/historical.ts:229` | 10_000 | `commonStock: 10_000` |
| `types/historical.ts:230` | 220_000 | `additionalPaidInCapital: 220_000` |
| `types/historical.ts:285` | 0.01 | `if (diff > 0.01) { return `${data.period}: Balance sheet does not balance. Assets=${data.totalAssets.toLocaleS` |

## 5. How the statements link

### 5.1 Forecast links

| Link | Where | Type |
|---|---|---|
| IS NI -> distributable -> additionToRE | `lib/engines/income-statement.ts:238,275,287` | Formula |
| additionToRE -> BS RE | `lib/engines/balance-sheet.ts:138` | Formula |
| Reserve addition -> BS legal reserve | `lib/engines/balance-sheet.ts:134` | Formula |
| IS NI -> CF NI | `lib/engines/cash-flow.ts:24` | Formula |
| CF ending cash -> BS cash | `lib/engines/cash-flow.ts:116`; `lib/engines/circular-resolver.ts:136`; `lib/engines/balance-sheet.ts:28` | Formula, not a plug |
| BS deltas -> CF WC lines | `lib/engines/cash-flow.ts:36-45` | Formula |
| Delta OCI -> CFO | `lib/engines/cash-flow.ts:32,53` | **Wrong class**: non-cash OCI treated as an operating cash add-back |
| EPD -> CFF | `lib/engines/cash-flow.ts:102,111` | Hard-wired to financing; MOPCO classifies as operating |
| Dividends declared = paid same year | `lib/engines/cash-flow.ts:98` | No payable bridge |
| Tax expense = paid same year | none | No tax payable |
| DTL | `lib/engines/balance-sheet.ts:116` | Flat input, no tax expense link |

### 5.2 Historical links (back-solved)

| Item | Where | Type |
|---|---|---|
| Historical tax | `lib/engines/income-statement.ts:416` | **Overwrites reported** |
| Historical addition to RE | `lib/engines/income-statement.ts:462-464` | **Back-solved** from RE delta |
| Historical dividends | `lib/engines/cash-flow.ts:231` | **PLUG** |
| Historical equity issuance | `lib/engines/cash-flow.ts:241` | **Back-solved** |
| Historical buybacks | `lib/engines/cash-flow.ts:243` | **Back-solved** from treasury stock delta |
| Historical capex | `lib/engines/cash-flow.ts:213` | **Back-solved**; delta gross PP&E, ignores disposals |
| Historical intangibles purchases | `lib/engines/cash-flow.ts:215` | **Back-solved** |
| Historical WC, debt, DTL lines | `lib/engines/cash-flow.ts:183-195,223-227` | **Derived** from BS |
| Historical net change | `lib/engines/cash-flow.ts:248` | **Back-solved** from cash delta |
| Demo RE | `types/assumptions.ts:377-391` | **PLUG** |
| Fixture RE | `fixtures/README.md:24,52-53` | **PLUG** by instruction |
| Period labels | `lib/engines/integrator.ts:121-123` | Overwrites input labels |
| Historical legal reserve | `lib/engines/balance-sheet.ts:330` | Hard 0 |
| Exporter drivers | `lib/export/excel.ts:269-366` | **Back-computed** from results |

### 5.3 Forecast inputs that break the balance (tested)

The base case balances. These single-input changes do not, because the BS and CF read different things. All come from the probe in Section 10.

| Input | Cause | Worst gap (EGP) |
|---|---|---|
| `longTermDebtRepayment` above balance | floor at BS `:113`, CF pays in full | 465,750,000,000 |
| `amortizationAmount` above intangibles | floor at BS `:55` | 68,400,000,000 |
| `commonStock` | BS `:128`, no CF line | 17,070,716,000 |
| `shortTermDebtAmount` | BS `:78`, no CF line | 14,000,000,000 |
| `currentPortionLTD` | BS `:79`, no CF line | 8,000,000,000 |
| `otherCurrentLiabilities` | BS `:80`, no CF line | 6,000,000,000 |
| `acquisitions`, `assetSales`, `investmentPurchases`, `investmentSales` | CF `:63-66`, no BS line | 5,000,000,000 each |
| `otherCurrentAssets` | BS `:40`, no CF line | 3,000,000,000 |
| `initialLegalReserve` | adds to forecast equity, absent from historical | 1,000,000,000 |

Also: enabling EOS fails the integration check "Gross to Net Income Waterfall" because `lib/engines/circular-resolver.ts:359-363` omits `eosExpense`. That is a false failure, and the BS still balances.


## 6. Balance check and circularity

**Balance check.** Forecast: `lib/engines/balance-sheet.ts:157-158`, |A - (L+E)| < 0.01. Historical: `:297,337`. Integration: `lib/engines/circular-resolver.ts:196-560`, 28 named checks per forecast year. Not blocking; results are reported only. `blockExportOnCritical` is set at `lib/store.ts:360`, but no code outside the store and type definition reads it (grep), so export is never blocked.

Weak checks: #7 `:268-270` is an identity because ending cash is defined that way at `lib/engines/cash-flow.ts:116`. #17 `:399-401` computes x * (y / x) = y. #18, 19, 21, 22 re-run the same formula. None tests the historical statements.

**Circularity.**

| Property | Current | Brief |
|---|---|---|
| Method | Fixed-point iteration per year, `lib/engines/circular-resolver.ts:55-177` | Engine iterates |
| Actual loop | Cash -> interest income -> NI -> cash. The header comment at `:4-6` describes a debt capacity loop that does not exist. | |
| Convergence test | Ending cash only, `:168-171` | |
| Tolerance | 0.01 EGP, `:37` | 1 EGP |
| Iteration cap | 500, `:36` | 100 |
| Iterations | 52 across 5 years on the fixture (about 10 per year); only the total is reported, `lib/engines/integrator.ts:190` | Per year |
| Non-convergence | Flag only, the run still returns | |
| Switch | **None.** Debt always opening, cash always average (tested). | Single switch cell, 0 or 1 |
| Excel | `iterate=1`, count 1000, delta 0.001, `lib/export/excel.ts:148-150,3351`; differs from engine | Switch at 0 by default |
| Determinism | `runFullModel` gives identical JSON across 2 runs (tested). Separately, `lib/services/liveRates.ts:45,50` and `lib/scenario-manager.ts:15,17` use `Date` and `uuid`. | Pure |


## 7. Network calls, storage and data leaving the browser

### 7.1 Network

| Call | file:line | Trigger | Data sent | Leaves browser? |
|---|---|---|---|---|
| Groq `api.groq.com/openai/v1/chat/completions` (AI Analyst) | `lib/services/analyst.ts:189-205` | User sends a chat message | **Company name; revenue, EBIT, NI, FCFF, EPS, profit waterfall, cash, assets, liabilities, equity, RE roll-forward, CFO/CFI/CFF per year; check status; last 4 chat messages; browser-held API key** | **YES: company financials to a third party. Violates Decision 1. Delete.** |
| `/api/validate`, proxied to Anthropic | `lib/agents/validation-agent.ts:152-159`; `app/api/validate/route.ts:19` | Only with `runAIChecks: true`. The store sets false at `lib/store.ts:358`, and the route is not served by a static export. | **All IS, BS, CF, ratios, key assumptions, per scenario** | **Dormant, but would send everything. Delete.** |
| ExchangeRate-API `api.exchangerate-api.com/v4/latest/USD` | `lib/services/liveRates.ts:62-63` | Opening the Live Rates tab or the Navbar refresh | None beyond IP | Request only. **Not an official source. Delete** |
| Google Fonts | `app/layout.tsx:13-15` | Every page load | IP, user agent | Request only. Conflicts with Part 10's rule; self-host. |
| `/api/dev-save-file` | `lib/export/excel.ts:3383-3396` | Dev mode Excel export | **Whole workbook** to same origin; route does not exist in the repo | Dead. Delete |
| External links | `components/Navbar.tsx:33-34,312`; `components/Footer.tsx:6` | User click | None | Navigation only |

No analytics, no WebSocket, no `sendBeacon`, no XHR, no Worker, no `wrangler` config (searched).

### 7.2 Storage

| Store | Key | file:line | Contents |
|---|---|---|---|
| localStorage | `financial-model-storage` | `lib/store.ts:66,538-552` | Company identity, all historicals, all scenarios **including results**, UI theme. Plain text, on-device. No clear control, no versioned snapshot. |
| sessionStorage | `is-scroll-x` | `components/statements/IncomeStatementPage.tsx:53,56` | Scroll position |
| IndexedDB | none | | |

The store migration at `lib/store.ts:555-711` silently rewrites saved tax and interest rates on load.

Secrets: `.env.local` holds `NEXT_PUBLIC_GROQ_API_KEY` (see 0.1). It is git-ignored; `ANTHROPIC_API_KEY` is read server-side at `app/api/validate/route.ts:9` and was not found in `.env.local`.


## 8. Excel exporter

Tested artifact: `buildWorkbook` output for `fixtures/telecom-egypt.json`, base scenario. Source: `lib/export/excel.ts` (3,408 lines), `build-dashboard.ts`, `build-scenarios.ts`, `build-company-info.ts`.

### 8.1 Sheets (13, none hidden; `_Calc_*` sheets are already gone)

Live Rates is added only when rates are passed (`lib/export/excel.ts:3160`). VAT Schedule only when VAT is on (`:2999`).

| Sheet | Dimension | Formulas | Hardcoded numbers | Text | Merged | Freeze | Over 80 chars | Longest | Max IF depth | Literal uses |
|---|---|---:|---:|---:|---:|---|---:|---:|---:|---:|
| Dashboard | A1:J50 | 161 | 0 | 58 | 16 | B10 | 161 | 226 | 2 | 0 |
| Company Info | A1:D37 | 0 | 6 | 78 | 32 | None | 0 | 0 | 0 | 0 |
| Scenarios | A1:H260 | 0 | 1575 | 278 | 29 | None | 0 | 0 | 0 | 0 |
| Assumptions | A1:H68 | 311 | 22 | 74 | 3 | B2 | 265 | 113 | 2 | 0 |
| Income Statement | A1:H47 | 243 | 23 | 54 | 0 | B2 | 5 | 94 | 1 | 5 |
| Balance Sheet | A1:H48 | 269 | 4 | 55 | 0 | B2 | 22 | 128 | 1 | 27 |
| Cash Flow Statement | A1:G47 | 222 | 0 | 53 | 0 | B2 | 2 | 124 | 1 | 6 |
| Ratios | A1:H56 | 329 | 0 | 63 | 0 | B2 | 68 | 316 | 2 | 87 |
| Working Capital | A1:H22 | 105 | 0 | 29 | 0 | B2 | 0 | 56 | 1 | 0 |
| Depreciation Schedule | A1:H21 | 80 | 0 | 32 | 0 | B2 | 0 | 55 | 1 | 0 |
| Debt Schedule | A1:H24 | 109 | 0 | 34 | 0 | B2 | 0 | 58 | 1 | 6 |
| VAT Schedule | A1:H16 | 49 | 7 | 20 | 1 | B2 | 1 | 121 | 1 | 0 |
| Historical Data | A1:C60 | 10 | 96 | 60 | 1 | None | 0 | 31 | 1 | 6 |

Total formulas: 1888. Fills are used on every sheet (cells filled: 3652), plus zebra stripes (`lib/export/excel.ts:82-105`). Tab colours, dark headers, emoji in labels (Dashboard rows 4, 8; Ratios zone cells). No named ranges (0). Each of these breaks Part 8.

### 8.2 Hardcoded numbers in calculation cells

| Sheet | Cells | What | Severity |
|---|---|---|---|
| Scenarios | all 1,575 numeric cells, 0 formulas | **Engine outputs and drivers pasted as values for all 3 scenarios.** Assumptions rows read from here. | Critical. Switching scenario reads pasted values. |
| Assumptions | D62:H62, D63:H63 | Legal reserve and EOS provision "(Computed)" pasted from engine | Critical |
| Assumptions | D36:H36, D38:H38 | 0.05, 0.10 inside driver rows | Should be Inputs |
| Assumptions | B3, B64 | Base revenue; dividends 0 | Input / plug |
| Income Statement | B37, C37 | Addition to RE, historical, pasted | Critical |
| Income Statement | B44:H44 | **FCFF pasted** (`lib/export/excel.ts:1328-1329`: "engine-computed value") | Critical |
| Income Statement | B45:H46 | Disallowed interest, adjusted taxable income, pasted | Critical |
| Balance Sheet | B8, C8, B27, C27 | Zeros (historical) | Minor |
| VAT Schedule | B4:H4 | 0.14 | Should be Input |
| Company Info | B7, B22:B26 | 2010 (invented); 0.225, 0.14, 0.10, 0.195, 0.235 | Critical for B7; stale for B25, B26 |
| Historical Data | 96 cells | Historical inputs | Legitimate |

### 8.3 Literal constants inside formulas

| Sheet | Literal | Uses | Example |
|---|---:|---:|---|
| Income Statement | 2 | 5 | `D11: =(Assumptions!C54+'Income Statement'!D2*Assumptions!D23/2)*Assumptions!D24` |
| Balance Sheet | 365 | 27 | `B4: ='Income Statement'!B2*IF('Historical Data'!B4=0,0,'Historical Data'!B25/'Historical Data'` |
| Cash Flow Statement | 0.01 | 6 | `B47: =IF(ABS(B43-'Balance Sheet'!C3)<0.01,"[U+2713] Reconciles","[U+2717] Error")` |
| Ratios | 2 | 24 | `C17: =IF(('Balance Sheet'!B5+'Balance Sheet'!C5)/2=0,0,'Income Statement'!C4/(('Balance Sheet'!` |
| Ratios | 365 | 21 | `B19: =IF('Income Statement'!B2=0,0,'Balance Sheet'!B4/'Income Statement'!B2*365)` |
| Ratios | 6.56 | 7 | `B48: =6.56*B44+3.26*B45+6.72*B46+1.05*B47` |
| Ratios | 3.26 | 7 | `B48: =6.56*B44+3.26*B45+6.72*B46+1.05*B47` |
| Ratios | 6.72 | 7 | `B48: =6.56*B44+3.26*B45+6.72*B46+1.05*B47` |
| Ratios | 1.05 | 7 | `B48: =6.56*B44+3.26*B45+6.72*B46+1.05*B47` |
| Ratios | 2.9 | 7 | `B49: =IF(B48>=2.9,"[U+2705] Safe",IF(B48>=1.23,"[U+26A0] Grey","[U+274C] Distress"))` |
| Ratios | 1.23 | 7 | `B49: =IF(B48>=2.9,"[U+2705] Safe",IF(B48>=1.23,"[U+26A0] Grey","[U+274C] Distress"))` |
| Debt Schedule | 2 | 6 | `C15: =(C12+B12)/2` |
| Historical Data | 365 | 6 | `B58: =IF(B4=0,0,ROUND(B25/B4*365,1))` |

0 and 1 are excluded from this table. They are widespread in the 1,284 IF calls.

### 8.4 Thirty longest formulas

| Len | Sheet!Cell | Formula |
|---:|---|---|
| 316 | Ratios!H9 | `=IF(('Balance Sheet'!H44+'Balance Sheet'!H23+'Balance Sheet'!H30+'Balance Sheet'!H24-'Balance Sheet'!H3)=0,0,('Income Statement'!H17*(1-IF('Income Statement'!H24>0,'Income Statement'!H25/'Income Statement'!H24,0)))/('Balance Sheet'!H44+'Balance Sheet'!H23+'Balance Sheet'!H30+'Balance Sheet'!H24-'Balance Sheet'!H3))` |
| 316 | Ratios!G9 | `=IF(('Balance Sheet'!G44+'Balance Sheet'!G23+'Balance Sheet'!G30+'Balance Sheet'!G24-'Balance Sheet'!G3)=0,0,('Income Statement'!G17*(1-IF('Income Statement'!G24>0,'Income Statement'!G25/'Income Statement'!G24,0)))/('Balance Sheet'!G44+'Balance Sheet'!G23+'Balance Sheet'!G30+'Balance Sheet'!G24-'Balance Sheet'!G3))` |
| 316 | Ratios!F9 | `=IF(('Balance Sheet'!F44+'Balance Sheet'!F23+'Balance Sheet'!F30+'Balance Sheet'!F24-'Balance Sheet'!F3)=0,0,('Income Statement'!F17*(1-IF('Income Statement'!F24>0,'Income Statement'!F25/'Income Statement'!F24,0)))/('Balance Sheet'!F44+'Balance Sheet'!F23+'Balance Sheet'!F30+'Balance Sheet'!F24-'Balance Sheet'!F3))` |
| 316 | Ratios!E9 | `=IF(('Balance Sheet'!E44+'Balance Sheet'!E23+'Balance Sheet'!E30+'Balance Sheet'!E24-'Balance Sheet'!E3)=0,0,('Income Statement'!E17*(1-IF('Income Statement'!E24>0,'Income Statement'!E25/'Income Statement'!E24,0)))/('Balance Sheet'!E44+'Balance Sheet'!E23+'Balance Sheet'!E30+'Balance Sheet'!E24-'Balance Sheet'!E3))` |
| 316 | Ratios!D9 | `=IF(('Balance Sheet'!D44+'Balance Sheet'!D23+'Balance Sheet'!D30+'Balance Sheet'!D24-'Balance Sheet'!D3)=0,0,('Income Statement'!D17*(1-IF('Income Statement'!D24>0,'Income Statement'!D25/'Income Statement'!D24,0)))/('Balance Sheet'!D44+'Balance Sheet'!D23+'Balance Sheet'!D30+'Balance Sheet'!D24-'Balance Sheet'!D3))` |
| 316 | Ratios!C9 | `=IF(('Balance Sheet'!C44+'Balance Sheet'!C23+'Balance Sheet'!C30+'Balance Sheet'!C24-'Balance Sheet'!C3)=0,0,('Income Statement'!C17*(1-IF('Income Statement'!C24>0,'Income Statement'!C25/'Income Statement'!C24,0)))/('Balance Sheet'!C44+'Balance Sheet'!C23+'Balance Sheet'!C30+'Balance Sheet'!C24-'Balance Sheet'!C3))` |
| 316 | Ratios!B9 | `=IF(('Balance Sheet'!B44+'Balance Sheet'!B23+'Balance Sheet'!B30+'Balance Sheet'!B24-'Balance Sheet'!B3)=0,0,('Income Statement'!B17*(1-IF('Income Statement'!B24>0,'Income Statement'!B25/'Income Statement'!B24,0)))/('Balance Sheet'!B44+'Balance Sheet'!B23+'Balance Sheet'!B30+'Balance Sheet'!B24-'Balance Sheet'!B3))` |
| 226 | Dashboard!E6 | `=IF(B6="Base Case","Central planning - stable market \| Revenue 10%->5% \| COGS 60%",IF(B6="Optimistic","Optimistic case - strong execution \| Revenue 15%->8% \| COGS 55%","Conservative case - headwinds \| Revenue 5%->2% \| COGS 63%"))` |
| 152 | Ratios!H47 | `=IF(('Balance Sheet'!H23+'Balance Sheet'!H30+'Balance Sheet'!H24)=0,0,'Balance Sheet'!H44/('Balance Sheet'!H23+'Balance Sheet'!H30+'Balance Sheet'!H24))` |
| 152 | Ratios!G47 | `=IF(('Balance Sheet'!G23+'Balance Sheet'!G30+'Balance Sheet'!G24)=0,0,'Balance Sheet'!G44/('Balance Sheet'!G23+'Balance Sheet'!G30+'Balance Sheet'!G24))` |
| 152 | Ratios!F47 | `=IF(('Balance Sheet'!F23+'Balance Sheet'!F30+'Balance Sheet'!F24)=0,0,'Balance Sheet'!F44/('Balance Sheet'!F23+'Balance Sheet'!F30+'Balance Sheet'!F24))` |
| 152 | Ratios!E47 | `=IF(('Balance Sheet'!E23+'Balance Sheet'!E30+'Balance Sheet'!E24)=0,0,'Balance Sheet'!E44/('Balance Sheet'!E23+'Balance Sheet'!E30+'Balance Sheet'!E24))` |
| 152 | Ratios!D47 | `=IF(('Balance Sheet'!D23+'Balance Sheet'!D30+'Balance Sheet'!D24)=0,0,'Balance Sheet'!D44/('Balance Sheet'!D23+'Balance Sheet'!D30+'Balance Sheet'!D24))` |
| 152 | Ratios!C47 | `=IF(('Balance Sheet'!C23+'Balance Sheet'!C30+'Balance Sheet'!C24)=0,0,'Balance Sheet'!C44/('Balance Sheet'!C23+'Balance Sheet'!C30+'Balance Sheet'!C24))` |
| 152 | Ratios!B47 | `=IF(('Balance Sheet'!B23+'Balance Sheet'!B30+'Balance Sheet'!B24)=0,0,'Balance Sheet'!B44/('Balance Sheet'!B23+'Balance Sheet'!B30+'Balance Sheet'!B24))` |
| 137 | Ratios!H27 | `=IF('Income Statement'!H18=0,0,(('Balance Sheet'!H23+'Balance Sheet'!H30+'Balance Sheet'!H24)-'Balance Sheet'!H3)/'Income Statement'!H18)` |
| 137 | Ratios!G27 | `=IF('Income Statement'!G18=0,0,(('Balance Sheet'!G23+'Balance Sheet'!G30+'Balance Sheet'!G24)-'Balance Sheet'!G3)/'Income Statement'!G18)` |
| 137 | Ratios!F27 | `=IF('Income Statement'!F18=0,0,(('Balance Sheet'!F23+'Balance Sheet'!F30+'Balance Sheet'!F24)-'Balance Sheet'!F3)/'Income Statement'!F18)` |
| 137 | Ratios!E27 | `=IF('Income Statement'!E18=0,0,(('Balance Sheet'!E23+'Balance Sheet'!E30+'Balance Sheet'!E24)-'Balance Sheet'!E3)/'Income Statement'!E18)` |
| 137 | Ratios!D27 | `=IF('Income Statement'!D18=0,0,(('Balance Sheet'!D23+'Balance Sheet'!D30+'Balance Sheet'!D24)-'Balance Sheet'!D3)/'Income Statement'!D18)` |
| 137 | Ratios!C27 | `=IF('Income Statement'!C18=0,0,(('Balance Sheet'!C23+'Balance Sheet'!C30+'Balance Sheet'!C24)-'Balance Sheet'!C3)/'Income Statement'!C18)` |
| 137 | Ratios!B27 | `=IF('Income Statement'!B18=0,0,(('Balance Sheet'!B23+'Balance Sheet'!B30+'Balance Sheet'!B24)-'Balance Sheet'!B3)/'Income Statement'!B18)` |
| 128 | Balance Sheet!H27 | `=IF(Assumptions!H10=0,0,MAX(0,'Income Statement'!H2*Assumptions!H11-ABS('Income Statement'!H2*Assumptions!H23)*Assumptions!H11))` |
| 128 | Balance Sheet!G27 | `=IF(Assumptions!G10=0,0,MAX(0,'Income Statement'!G2*Assumptions!G11-ABS('Income Statement'!G2*Assumptions!G23)*Assumptions!G11))` |
| 128 | Balance Sheet!F27 | `=IF(Assumptions!F10=0,0,MAX(0,'Income Statement'!F2*Assumptions!F11-ABS('Income Statement'!F2*Assumptions!F23)*Assumptions!F11))` |
| 128 | Balance Sheet!E27 | `=IF(Assumptions!E10=0,0,MAX(0,'Income Statement'!E2*Assumptions!E11-ABS('Income Statement'!E2*Assumptions!E23)*Assumptions!E11))` |
| 128 | Balance Sheet!D27 | `=IF(Assumptions!D10=0,0,MAX(0,'Income Statement'!D2*Assumptions!D11-ABS('Income Statement'!D2*Assumptions!D23)*Assumptions!D11))` |
| 124 | Cash Flow Statement!B24 | `=-ABS('Income Statement'!C2*IF('Historical Data'!C4=0,0,('Historical Data'!C29-'Historical Data'!B29)/'Historical Data'!C4))` |
| 121 | VAT Schedule!C7 | `='Income Statement'!C2*IF('Historical Data'!C4=0,0,('Historical Data'!C29-'Historical Data'!B29)/'Historical Data'!C4)*C4` |
| 116 | Ratios!H18 | `=IF(('Balance Sheet'!G4+'Balance Sheet'!H4)/2=0,0,'Income Statement'!H2/(('Balance Sheet'!G4+'Balance Sheet'!H4)/2))` |

### 8.5 Function use

| Function | Uses |
|---|---:|
| IF | 1284 |
| ABS | 53 |
| SUM | 34 |
| MAX | 32 |
| ROUND | 6 |

OFFSET, INDIRECT, array formulas, LET, LAMBDA, INDEX, MATCH, VLOOKUP, XLOOKUP: **none** (0 hits). Maximum nested IF depth: 2, which is at the Part 8 limit. Scenario selection uses nested IF on label strings in 265 Assumptions cells, each over 80 characters.

### 8.6 Number formats

| Format | Cells |
|---|---:|
| `#,##0;-#,##0;0` | 1306 |
| `#,##0` | 1030 |
| `General` | 902 |
| `0.0%` | 786 |
| `$#,##0` | 87 |
| `0.00"x"` | 77 |
| `#,##0.0000` | 77 |
| `#,##0.0000x` | 63 |
| `$#,##0.00` | 42 |
| `0.0` | 41 |
| `#,##0.00x` | 28 |
| `#,##0.00` | 28 |
| `0` | 26 |
| `@` | 7 |
| `0.0"x"` | 7 |
| `0.00%` | 2 |

`$#,##0` and `$#,##0.00` on 129 cells display a dollar sign on EGP figures. The main number format uses a minus, not parentheses, and shows zero as 0, not a dash. Dates and year headers are not in the Part 8 format.

### 8.7 Hard recalculation against cached values (LibreOffice)

| Sheet | Formulas | Differ | Errors |
|---|---:|---:|---:|
| Dashboard | 161 | 0 | 0 |
| Company Info | 0 | 0 | 0 |
| Scenarios | 0 | 0 | 0 |
| Assumptions | 311 | 6 | 0 |
| Income Statement | 243 | 0 | 0 |
| Balance Sheet | 269 | 45 | 0 |
| Cash Flow Statement | 222 | 53 | 0 |
| Ratios | 329 | 152 | 0 |
| Working Capital | 105 | 33 | 0 |
| Depreciation Schedule | 80 | 2 | 0 |
| Debt Schedule | 109 | 1 | 0 |
| VAT Schedule | 49 | 0 | 0 |
| Historical Data | 10 | 10 | 0 |
| **Total** | **1888** | **302** | **0** |

Tolerance: 1 EGP for values of 100 or more, 0.0001 otherwise.

Largest differences by sheet (cell, cached, recalculated, formula):

| Sheet | Cell | Cached | Recalculated | Formula |
|---|---|---:|---:|---|
| Assumptions | C64 | -2552500000 | 2552500000 | `='Historical Data'!C18-('Historical Data'!C48-'Historical Data'!B48)` |
| Assumptions | D24 | 0.07356474652716319 | 0.08 | `=IF(Assumptions!$B$67="Base Case",Scenarios!D28,IF(Assumptions!$B$67="` |
| Assumptions | E24 | 0.07389293112385636 | 0.08 | `=IF(Assumptions!$B$67="Base Case",Scenarios!E28,IF(Assumptions!$B$67="` |
| Assumptions | F24 | 0.07424820582407143 | 0.08 | `=IF(Assumptions!$B$67="Base Case",Scenarios!F28,IF(Assumptions!$B$67="` |
| Balance Sheet | H22 | 12975621120 | 12975695567.6262 | `='Income Statement'!H2*Assumptions!H20` |
| Balance Sheet | G22 | 12241152000 | 12241222233.6096 | `='Income Statement'!G2*Assumptions!G20` |
| Balance Sheet | F22 | 11334400000 | 11334465031.12 | `='Income Statement'!F2*Assumptions!F20` |
| Balance Sheet | E22 | 10304000000 | 10304059119.2 | `='Income Statement'!E2*Assumptions!E20` |
| Cash Flow Statement | B39 | -10692500000 | 2552500000 | `=B32+B33+B34+B35+B37+B38` |
| Cash Flow Statement | B41 | 2000000000 | 13745000000 | `=B21+B29+B39` |
| Cash Flow Statement | B43 | 12000000000 | 23745000000 | `=B42+B41` |
| Cash Flow Statement | B33 | -8140000000 | 0 | `=-ABS(Assumptions!C32)` |
| Ratios | H55 | 0 | 87390664678.6207 | `='Income Statement'!H2-H53` |
| Ratios | G55 | 0 | 85420208551.7241 | `='Income Statement'!G2-G53` |
| Ratios | F55 | 0 | 81249931034.4828 | `='Income Statement'!F2-F53` |
| Ratios | E55 | 0 | 75326241379.3103 | `='Income Statement'!E2-E53` |
| Working Capital | H16 | 12975621120 | 12975695567.6262 | `='Balance Sheet'!H22` |
| Working Capital | G16 | 12241152000 | 12241222233.6096 | `='Balance Sheet'!G22` |
| Working Capital | F16 | 11334400000 | 11334465031.12 | `='Balance Sheet'!F22` |
| Working Capital | E16 | 10304000000 | 10304059119.2 | `='Balance Sheet'!E22` |
| Depreciation Schedule | C4 | 30000000000 | 0 | `=ABS('Income Statement'!C2*Assumptions!C23)` |
| Depreciation Schedule | C15 | 0.28116213683223995 | 0 | `=IF('Income Statement'!C2=0,0,C4/'Income Statement'!C2)` |
| Debt Schedule | C5 | -8140000000 | 0 | `=-ABS(Assumptions!C32)` |
| Historical Data | C60 | 0 | 144.4 | `=IF(C5=0,0,ROUND(C36/C5*365,1))` |
| Historical Data | B60 | 0 | 111.7 | `=IF(B5=0,0,ROUND(B36/B5*365,1))` |
| Historical Data | B58 | 0 | 71.5 | `=IF(B4=0,0,ROUND(B25/B4*365,1))` |
| Historical Data | C58 | 0 | 65 | `=IF(C4=0,0,ROUND(C25/C4*365,1))` |

Key lines, cached and recalculated:

```text
Income Statement r28 'Net Income'
  cached   [10444675000, 22552500000, 19796233593, 24052750050, 27926093073, 30555140097, 32420986259]
  recalced [10444675000, 22552500000, 19796233593, 24052750050, 27926093073, 30555140097, 32420986259]
Income Statement r21 'Interest Income'
  cached   [1200000000, 1500000000, 2251277217, 2096586516, 2183708481, 2419766261, 2946945143]
  recalced [1200000000, 1500000000, 2251277217, 2096586516, 2183708481, 2419766261, 2946945143]
Balance Sheet r3 'Cash & Equivalents'
  cached   [10000000000, 12000000000, 11697654914, 12968068806, 16148044274, 21079128979, 28036623400]
  recalced [10000000000, 12000000000, 11697652499, 12968066101, 16148041298, 21079125766, 28036619994]
Balance Sheet r18 'Total Assets'
  cached   [170000000000, 201000000000, 215875387448, 235062229244, 256502522756, 279227195980, 302582184485]
  recalced [170000000000, 201000000000, 215875418383, 235062263892, 256502560868, 279227237141, 302582228115]
Balance Sheet r47 'Balance Check (A - L+E)'
  cached   [0, 0, 0, 0, 0, 0, 0]
  recalced [0, 0, 0, 0, 0, 0, 0]
Balance Sheet r47 'Balance Check (A - L+E)'
  cached   [0, 0, 0, 0, 0, 0, 0]
  recalced [0, 0, 0, 0, 0, 0, 0]
Cash Flow Statement r43 'Ending Cash'
  cached   [12000000000, 11697654914, 12968068806, 16148044274, 21079128979, 28036623400, None]
  recalced [23745000000, 11697652499, 12968066101, 16148041298, 21079125766, 28036619994, None]
Cash Flow Statement r21 'Cash from Operations'
  cached   [50692500000, 37401567840, 44166540160, 50886878508, 56594750640, 61732531215, None]
  recalced [49192500000, 37401565425, 44166539870, 50886878238, 56594750402, 61732531022, None]
Cash Flow Statement r31 'Financing Activities'
  cached   [None, None, None, None, None, None, None]
  recalced [None, None, None, None, None, None, None]
['Telecom Egypt', 'FINANCIAL MODEL DASHBOARD  |  EGBP-sign (Egyptian Pound)  |  CONFIDENTIAL', None, '[U+1F4CA]  SCENARIO CONTROL', 'Active Scenario', '[U+25BC] Scenario Selector', None, '[U+1F4C8]  KEY METRICS - ACTIVE SCENARIO']
```

Root causes seen in the sample:
- `Cash Flow Statement!B33`: `=-ABS(Assumptions!C32)`, and C32 is an empty cell, so the historical debt repayment recalculates to 0 while the cached value is -8,140,000,000.
- `Assumptions!C64`: dividends formula has the opposite sign to the cached engine value, flipping 2025 financing cash flow.
- `Assumptions!D24`: picks a scenario driver (8%) while the cached value is a back-computed effective rate (7.36%).
- `Balance Sheet!D22`: `='Income Statement'!D2*Assumptions!D20` does not reproduce the engine value; the gap is tens of thousands of EGP. The driver chain was not traced further, because Part 8 replaces it.
- `Ratios!D48,D49,D55` and `Historical Data` day rows: cached values are 0 and only appear after recalculation, so the delivered file opens with blanks or zeros there.

The exporter comment at `lib/export/excel.ts:134-137` records that a full calculation on load produced wrong values, and the chosen response was to stop Excel recalculating on open. Part 8's rebuild removes this by design.


## 9. Module inventory

| Module | Verdict | Why |
|---|---|---|
| `lib/engines/income-statement.ts` | rewrite | Same-year appropriations, overwrites reported tax, no segments, no FX. Reuse the loss-carryforward logic if approved. |
| `lib/engines/balance-sheet.ts` | rewrite | Unbalancing inputs, fixed schema, no leases or investments. |
| `lib/engines/cash-flow.ts` | rewrite | Historical derivation forbidden by Part 4; forecast classification hard-wired. |
| `lib/engines/circular-resolver.ts` | rewrite | Keep the iteration idea; add the switch, 1 EGP tolerance, cap 100, per-year counts. Split the checks into `statements.ts`. |
| `lib/engines/integrator.ts` | rewrite | Becomes `run.ts`; remove seeding and DCF. |
| `lib/engines/dcf.ts` | delete | Valuation belongs in WOLF. |
| `lib/engines/valuation.ts` | delete | Valuation; dead code; unverifiable Bloomberg table. |
| `lib/ratios.ts` | rewrite | Altman errors; single ROIC definition needed; add Piotroski, credit. |
| `lib/schedules/egyptian-depreciation.ts` | delete | Decision 8 uses a tax depreciation rate input. Rates unconfirmed. |
| `lib/scenario-manager.ts` | rewrite | Explicit driver sets, single source. |
| `lib/scenarios.ts` | delete | Second copy of scenarios. |
| `lib/store.ts` | rewrite | Thin UI state; IndexedDB; drop rate-forcing migrations, validation and live rates. |
| `lib/agents/validation-agent.ts` | delete | AI path; invented check count. |
| `lib/agents/validation-prompt.ts` | delete | AI path. |
| `lib/agents/validation-rules.ts` | delete | Duplicates checks. Gates replace it; re-create only inline warnings from Part 9. |
| `lib/agents/validation-types.ts` | delete | With the agent. |
| `lib/agents/multi-scenario-validator.ts` | delete | No importer. |
| `lib/services/analyst.ts` | delete | Decision 1. |
| `lib/services/liveRates.ts` | delete | Replaced by registry; unofficial FX. |
| `app/api/validate/route.ts` | delete | Decision 1. |
| `lib/export/excel.ts` | rewrite | New formula writer per Part 8. |
| `lib/export/build-dashboard.ts` | rewrite | Becomes Summary; remove emoji and fills. |
| `lib/export/build-scenarios.ts` | rewrite | Becomes CHOOSE-driven inputs. |
| `lib/export/build-company-info.ts` | delete | Invented data. Cover replaces it. |
| `lib/export/csv-json.ts` | rewrite | Becomes `src/export/wolf.ts`. CSV not in brief. |
| `lib/export/pdf.ts` | delete | Not in brief; contains DCF and CBE Banking references. Proposed item. |
| `lib/i18n/*` | delete | No importer. |
| `lib/templates/egyptian-industries.ts` | delete | No importer. |
| `lib/utils.ts` | keep | Formatting and helpers; review for emoji and rework for absolute EGP. |
| `types/assumptions.ts` | rewrite | Moves to `engine/types.ts`; delete demo data. |
| `types/financial.ts` | rewrite | Same. |
| `types/historical.ts` | rewrite | Chart of accounts. |
| `types/scenario.ts` | rewrite | Same. |
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | rewrite | Vite entry (C1), remove AI toggle, keep WOLF tokens where they fit. |
| `components/AnalystPanel.tsx` | delete | Decision 1. |
| `components/CBERateBanner.tsx` | delete | Stale, IN SYNC chip. |
| `components/LiveRatesPanel.tsx` | rewrite | Rates panel from registry. |
| `components/ValidationPage.tsx` | rewrite | Checks page from `ModelRun`; remove icons and "40". |
| `components/Dashboard.tsx` | rewrite | Recalculates; emoji. |
| `components/RatiosPage.tsx` | rewrite | Recalculates all ratios in the UI. |
| `components/ScenariosPage.tsx`, `ScenarioSelector.tsx`, `ScenarioComparisonModal.tsx` | rewrite | Side-by-side drivers then outputs. |
| `components/schedules/*` | rewrite | Recalculate; new schedules required. |
| `components/statements/*` | rewrite | Thin views with audit panel. |
| `components/ModelPage.tsx`, `EgyptianSettings.tsx`, `CompanySettings.tsx` | rewrite | New drivers; remove unverified citations. |
| `components/HistoricalDataInput.tsx`, `HistoricalImportPage.tsx` | rewrite | Mapping layer; variable years; both duplicate subtotals. |
| `components/Navbar.tsx` | rewrite | Remove AI and rate actions; keep engine links. |
| `components/Footer.tsx` | rewrite | Remove credential line (`:12`). |
| `components/ErrorBanner.tsx`, `ConflictModal.tsx` | rewrite | Keep function; remove emoji. |
| `components/charts/*` | keep | Thin Recharts wrappers, re-theme. |
| `components/HeroStrip.tsx`, `components/Sidebar.tsx` | delete | No importer found. |
| `fixtures/telecom-egypt.json` | keep, relabel | Label as synthetic (Decision 10). Moves to `tests/fixtures`. |
| `fixtures/README.md` | rewrite | Instructs RE as a plug. |
| `scripts/*` (44 scripts) | delete | One-off diagnostics. Many fail on removed modules or Downloads paths. Replaced by `scripts/verify-*`. |
| `.claude/worktrees/**` (151 files) | delete from git | Committed by accident. |
| `.claude/settings.local.json` | delete from git | Local settings. |
| `.gitignore` | rewrite | Fix UTF-16 entry. |
| `tash show -p stash@{0}`, `debug_excel.js`, `test_excel_export.mjs`, `out-base.xlsx`, `Demo_Company_Inc__Financial_Model.json` | delete | Junk or stale output. |
| `generate_overview_docx.mjs`, `generate_overview_pdf.mjs`, `Engine_Overview.docx`, `engine_complete_overview.md`, `audit_report.md`, `WolfSuite_PDF_Design_MasterPrompt.md`, `KNOWN_LIMITATIONS.md` | delete | Superseded. `KNOWN_LIMITATIONS.md:9-10` is false: cash is not a plug, loss carryforward exists. |
| `README.md` | rewrite | Part 12. |
| `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `package.json` | rewrite | Vite; add `test`. Remove Next. |


## 10. Current test results, verbatim

All run in the temp copy at commit 8ba8ab2. Exit codes are as returned.

### 10.1 Summary

| Command | Exit | Result |
|---|---|---|
| `npm test` | 1 | Missing script. There are no tests. |
| `npx tsc --noEmit` | 0 | Clean |
| `npx eslint app components lib types` | 1 | 39 problems (3 errors, 36 warnings) |
| `npx next build` | 0 | Compiles; `/api/validate` listed as dynamic, not available in a static deployment |
| `npm run audit:sync` | 0 | 1635/1635 aligned. **Does not recalculate, see 0.3** |
| `npm run export:audit`, `export:audit:telecom` | 0 | Workbooks written |

Important: several scripts print failures but exit 0, notably `scripts/test-audit-fixes.ts` (`81 PASSED, 34 FAILED`) and `test_excel_export.mjs`. Exit codes in that set are not evidence.

Not run, because they rewrite workbooks or generate documents: `scripts/enhance_model.py`, `final_fix.py`, `build_*.py`, `map_excel.py`, `generate_docx.mjs`, `generate_overview_*.mjs`.

### 10.2 npm test

```text
$ npm test
npm error Missing script: "test"
npm error
npm error To see a list of scripts, run:
npm error   npm run
npm error A complete log of this run can be found in: C:\Users\user\AppData\Local\npm-cache\_logs\2026-10-31T14_19_55_687Z-debug-0.log
[exit code 1]
```

### 10.3 tsc

```text
$ npx tsc --noEmit
[exit code 0]
```

### 10.4 eslint

```text
$ npx eslint app components lib types
(node:5948) ESLintIgnoreWarning: The ".eslintignore" file is no longer supported. Switch to using the "ignores" property in "eslint.config.js": https://eslint.org/docs/latest/use/configure/migration-guide#ignoring-files
(Use `node --trace-warnings ...` to show where the warning was created)

<scratch-copy>\app\layout.tsx
  15:9  warning  Custom fonts not added in `pages/_document.js` will only load for a single page. This is discouraged. See: https://nextjs.org/docs/messages/no-page-custom-font  @next/next/no-page-custom-font

<scratch-copy>\app\page.tsx
   3:39  warning  'useCallback' is defined but never used                                                                                                     @typescript-eslint/no-unused-vars
  74:8   warning  React Hook useEffect has missing dependencies: 'calculateAllScenarios' and 'scenarios'. Either include them or remove the dependency array  react-hooks/exhaustive-deps

<scratch-copy>\components\ErrorBanner.tsx
  12:13  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

<scratch-copy>\components\ErrorBanner.tsx:12:13
  10 |     useEffect(() => {
  11 |         if (calculationError) {
> 12 |             setVisible(true);
     |             ^^^^^^^^^^ Avoid calling setState() directly within an effect
  13 |             const timer = setTimeout(() => {
  14 |                 setVisible(false);
  15 |                 clearError();  react-hooks/set-state-in-effect

<scratch-copy>\components\Navbar.tsx
   6:10  warning  'CURRENCY_MAP' is defined but never used             @typescript-eslint/no-unused-vars
  44:9   warning  'setCompanyInfo' is assigned a value but never used  @typescript-eslint/no-unused-vars
  44:25  warning  'industry' is assigned a value but never used        @typescript-eslint/no-unused-vars
  44:35  warning  'ticker' is assigned a value but never used          @typescript-eslint/no-unused-vars

<scratch-copy>\components\ScenarioComparisonModal.tsx
   13:11  warning  'MetricRow' is defined but never used  @typescript-eslint/no-unused-vars
  160:61  warning  'i' is defined but never used          @typescript-eslint/no-unused-vars

<scratch-copy>\components\ScenariosPage.tsx
  2:20  warning  'useMemo' is defined but never used  @typescript-eslint/no-unused-vars

<scratch-copy>\components\statements\IncomeStatementPage.tsx
   2:31  warning  'useCallback' is defined but never used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   @typescript-eslint/no-unused-vars
  20:20  error    Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

<scratch-copy>\components\statements\IncomeStatementPage.tsx:20:20
  18 |             const params = new URLSearchParams(window.location.search);
  19 |             const q = params.get('search');
> 20 |             if (q) setSearchTerm(q);
     |                    ^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  21 |         }
  22 |     }, []);
  23 |  react-hooks/set-state-in-effect

<scratch-copy>\lib\agents\validation-agent.ts
  9:29  warning  'FinancialRatios' is defined but never used  @typescript-eslint/no-unused-vars

<scratch-copy>\lib\engines\balance-sheet.ts
   8:44  warning  'calculateEgyptianBlendedRate' is defined but never used  @typescript-eslint/no-unused-vars
  42:11  warning  'totalCurrentAssets' is assigned a value but never used   @typescript-eslint/no-unused-vars

<scratch-copy>\lib\engines\income-statement.ts
  215:9  error  'taxRate' is never reassigned. Use 'const' instead  prefer-const

<scratch-copy>\lib\export\build-dashboard.ts
   14:7   warning  'MED_GRAY' is assigned a value but never used     @typescript-eslint/no-unused-vars
   18:7   warning  'GREEN' is assigned a value but never used        @typescript-eslint/no-unused-vars
   19:7   warning  'LIGHT_GREEN' is assigned a value but never used  @typescript-eslint/no-unused-vars
   20:7   warning  'DARK_GREEN' is assigned a value but never used   @typescript-eslint/no-unused-vars
   21:7   warning  'RED' is assigned a value but never used          @typescript-eslint/no-unused-vars
   52:5   warning  'numHistorical' is defined but never used         @typescript-eslint/no-unused-vars
   62:13  warning  'isRows' is assigned a value but never used       @typescript-eslint/no-unused-vars
   62:21  warning  'bsRows' is assigned a value but never used       @typescript-eslint/no-unused-vars
   62:29  warning  'cfRows' is assigned a value but never used       @typescript-eslint/no-unused-vars
   62:37  warning  'ratioRows' is assigned a value but never used    @typescript-eslint/no-unused-vars
   62:48  warning  'dbtRows' is assigned a value but never used      @typescript-eslint/no-unused-vars
  221:11  warning  'numCF' is assigned a value but never used        @typescript-eslint/no-unused-vars
  327:11  warning  'termColCF' is assigned a value but never used    @typescript-eslint/no-unused-vars

<scratch-copy>\lib\export\build-scenarios.ts
  162:11  warning  'roundMoney' is assigned a value but never used  @typescript-eslint/no-unused-vars

<scratch-copy>\lib\export\excel.ts
   510:15  warning  'hdBSGrossPPERow' is assigned a value but never used  @typescript-eslint/no-unused-vars
   682:11  warning  'hdSafeRatio' is assigned a value but never used      @typescript-eslint/no-unused-vars
   688:11  warning  'hdYoYGrowth' is assigned a value but never used      @typescript-eslint/no-unused-vars
   695:11  warning  'hdDays' is assigned a value but never used           @typescript-eslint/no-unused-vars
  3101:15  warning  'netVATRow' is assigned a value but never used        @typescript-eslint/no-unused-vars

<scratch-copy>\lib\export\pdf.ts
  67:14  warning  '_e' is defined but never used  @typescript-eslint/no-unused-vars

<scratch-copy>\lib\store.ts
   9:15  warning  'ModelResults' is defined but never used       @typescript-eslint/no-unused-vars
  17:26  warning  'getLastKnownRates' is defined but never used  @typescript-eslint/no-unused-vars

[U+2716] 39 problems (3 errors, 36 warnings)
  1 error and 0 warnings potentially fixable with the `--fix` option.

[exit code 1]
```

### 10.5 next build

```text
[U+25B2] Next.js 16.1.6 (Turbopack)

  Creating an optimized production build ...
[U+2713] Compiled successfully in 17.6s
  Running TypeScript ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/7) ...
  Generating static pages using 3 workers (1/7) 
  Generating static pages using 3 workers (3/7) 
  Generating static pages using 3 workers (5/7) 
[U+2713] Generating static pages using 3 workers (7/7) in 469.2ms
  Finalizing page optimization ...

Route (app)
[U+250C] [U+25CB] /
[U+251C] [U+25CB] /_not-found
[U+251C] [U+0192] /api/validate
[U+251C] [U+25CB] /icon.png
[U+2514] [U+25CB] /icon.svg


[U+25CB]  (Static)   prerendered as static content
[U+0192]  (Dynamic)  server-rendered on demand

[exit code 0]
```

### 10.6 audit:sync

```text
$ npx tsx scripts/audit-sync.ts
[U+25B6] Auditing against fixture: fixtures/telecom-egypt.json
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"

=== Base Case ===
  Income Statement   119/119 [U+2713]
  Balance Sheet      217/217 [U+2713]
  Cash Flow          174/174 [U+2713]
  Ratios             35/35 [U+2713]
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"

=== Optimistic Case ===
  Income Statement   119/119 [U+2713]
  Balance Sheet      217/217 [U+2713]
  Cash Flow          174/174 [U+2713]
  Ratios             35/35 [U+2713]
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"

=== Conservative Case ===
  Income Statement   119/119 [U+2713]
  Balance Sheet      217/217 [U+2713]
  Cash Flow          174/174 [U+2713]
  Ratios             35/35 [U+2713]

Total: 1635/1635 [U+2713] all sheets aligned
[exit code 0]
```

### 10.7 export:audit (Telecom fixture)

```text
$ npx tsx scripts/run-export.ts --input fixtures/telecom-egypt.json
[U+25B6] Loaded fixture: Telecom Egypt  (<scratch-copy>\fixtures\telecom-egypt.json)

=== Base Case ===
  Total Assets 2026E:        215,875,387,448
  Total Assets 2030E:        302,582,184,485
  Total Equity 2026E:        89,878,570,668
  Total Equity 2030E:        164,024,525,981
  CFO 2025:                  50,692,500,000
  CFO 2030E:                 61,732,531,215
  Net Change in Cash 2025:   2,000,000,000
  Cash 2026E (BS):           11,697,654,914
  BS balance check 2030E:    [U+2713] balanced
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"
  -> wrote out-base.xlsx (438.1 KB)

=== Optimistic Case ===
  Total Assets 2026E:        219,095,201,447
  Total Assets 2030E:        345,164,705,733
  Total Equity 2026E:        92,399,635,924
  Total Equity 2030E:        201,427,202,377
  CFO 2025:                  50,692,500,000
  CFO 2030E:                 85,256,141,375
  Net Change in Cash 2025:   2,000,000,000
  Cash 2026E (BS):           15,672,163,970
  BS balance check 2030E:    [U+2713] balanced
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"
  -> wrote out-optimistic.xlsx (438.5 KB)

=== Conservative Case ===
  Total Assets 2026E:        212,180,370,313
  Total Assets 2030E:        252,448,235,005
  Total Equity 2026E:        86,887,371,255
  Total Equity 2030E:        119,112,644,030
  CFO 2025:                  50,692,500,000
  CFO 2030E:                 42,042,290,571
  Net Change in Cash 2025:   2,000,000,000
  Cash 2026E (BS):           8,541,783,357
  BS balance check 2030E:    [U+2713] balanced
=== Scenario Guarantee (Single Source of Truth) ===
  Store provided 3 scenario(s)
    [0] name="Base Case" type="base" hasResults=true
    [1] name="Optimistic Case" type="optimistic" hasResults=true
    [2] name="Conservative Case" type="conservative" hasResults=true
  -> Computing results for "Base Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Optimistic Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  -> Computing results for "Conservative Case"...
    taxRate: [0.225,0.225,0.225,0.225,0.225]
  -> [U+2713] Computed successfully
  Final: 3/3 with results
=== buildScenariosSheet DEBUG ===
allScenarios count: 3
  [0] name="Base Case" type="base" hasResults=true
  [1] name="Optimistic Case" type="optimistic" hasResults=true
  [2] name="Conservative Case" type="conservative" hasResults=true
Block "Base Case" (type=base): found=true, hasResults=true, scenarioName="Base Case"
Block "Optimistic" (type=optimistic): found=true, hasResults=true, scenarioName="Optimistic Case"
Block "Conservative" (type=conservative): found=true, hasResults=true, scenarioName="Conservative Case"
  -> wrote out-conservative.xlsx (439.0 KB)

Done.
[exit code 0]
```

### 10.8 Engine probes written for this audit

```text
DETERMINISM identical JSON across 2 runs: true
HIST_TAX 2024 input=3,032,325,000 engine=3,032,325,000 diff=0 NI=10,444,675,000
HIST_TAX 2025 input=6,547,500,000 engine=6,547,500,000 diff=0 NI=22,552,500,000
HIST_CF 2025 CFO=50,692,500,000 CFI=-38,000,000,000 dividends(backsolved)=-2,552,500,000 equityIssue(backsolved)=0 reconciles=true
HIST_CF sum=2,000,000,000 reported_change=2,000,000,000 gap=0
BAL baseline                 years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL acquisitions             years=5 worst_gap=     5,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL assetSales               years=5 worst_gap=     5,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL investmentPurchases      years=5 worst_gap=     5,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL investmentSales          years=5 worst_gap=     5,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL otherCurrentAssets_up    years=5 worst_gap=     3,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL otherCurrentLiab_up      years=5 worst_gap=     6,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL shortTermDebt_up         years=5 worst_gap=    14,000,000,000 converged=true iters=51 failed=[Assets = Liabilities + Equity] nan=false
BAL currentPortionLTD_up     years=5 worst_gap=     8,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL commonStock_up           years=5 worst_gap=    17,070,716,000 converged=true iters=52 failed=[Assets = Liabilities + Equity] nan=false
BAL initialLegalReserve      years=5 worst_gap=     1,000,000,000 converged=true iters=52 failed=[Assets = Liabilities + Equity; Legal Reserve Roll Forward] nan=false
BAL equityIssuance           years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL oci_up                   years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL dtl_up                   years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL debt_bullet              years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL debt_amortizing          years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL ltd_repay_gt_balance     years=5 worst_gap=   465,750,000,000 converged=true iters=56 failed=[Assets = Liabilities + Equity; Long-Term Debt Schedule Ties] nan=false
BAL amort_gt_intangibles     years=5 worst_gap=    68,400,000,000 converged=true iters=53 failed=[Assets = Liabilities + Equity] nan=false
BAL eos_on                   years=5 worst_gap=                 0 converged=true iters=52 failed=[Gross to Net Income Waterfall] nan=false
BAL eos_pay_gt_bal           years=5 worst_gap=                 0 converged=true iters=52 failed=[Gross to Net Income Waterfall] nan=false
BAL decl_balance             years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL vat_off                  years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL zero_revenue             years=5 worst_gap=                 0 converged=true iters=63 failed=[] nan=false
BAL loss_making              years=5 worst_gap=                 0 converged=true iters=67 failed=[] nan=false
BAL formula_rates            years=5 worst_gap=                 0 converged=true iters=52 failed=[] nan=false
BAL ten_years                years=10 worst_gap=                 0 converged=true iters=112 failed=[] nan=false
HIST3 periods: 2023,2024,2025,2026E,2027E,2028E,2029E,2030E cf periods: 2024,2025,2026E,2027E,2028E,2029E,2030E
ALTMAN no-debt 2025 EM=3.307 zone=safe (X4 forced 0 when total debt=0) Z'=1.597
INTEREST_BASIS exp=16,225,000,000 opening_debt*rate=16,225,000,000; inc=2,251,277,217 avg_cash*rate=2,251,277,217
CONVERGENCE {"converged":true,"iterations":52,"finalDelta":0.008358001708984375}
HIST_TAX_OVERRIDE 2024 reported_input=1000000000 engine=3032325000 NI=10444675000
HIST_TAX_OVERRIDE 2025 reported_input=2000000000 engine=6547500000 NI=22552500000
dividends absorbs difference: -2552500000 reconciles true
3HIST exporter header: ["x - Income Statement","2023 (A)","2024 (A)","2025 (A)","2026E","2027E","2028E","2029E","2030E"]
3HIST HistData header: ["","2023","2024","2025"]
10Y growth 0.15,0.12,0.1,0.08,0.06,0,0,0,0,0
10Y cogs% 0.420,0.420,0.420,0.420,0.420,0.600,0.600,0.600,0.600,0.600
10Y sga% 0.100,0.100,0.100,0.100,0.100,0.150,0.150,0.150,0.150,0.150
10Y intRate 0.22,0.2,0.18,0.17,0.16,default,default,default,default,default
```

### 10.9 Remaining existing scripts (each run with a 60 second limit)

Full output: `docs/verify/part1-existing-scripts.txt`.

| Script | Exit | Last meaningful line |
|---|---:|---|
| `node debug_excel.js` | 0 | Error: File not found: C:/Users/user/Downloads/Demo_Company_Inc__Financial_Model.xlsx |
| `npx tsx scripts/check-circ.ts` | 0 | Error: File not found: TEST_CalcSheets_Lean.xlsx |
| `node scripts/check_excel.js` | 0 | Error: ENOENT: no such file or directory, stat 'C:\Users\user\Downloads\WOLF_Financial_Model.xlsx' |
| `node scripts/check_excel.mjs` | 1 | No WOLF Excel files found in Downloads |
| `npx tsx scripts/debug-excel-cells.ts` | 0 | Col 8: value={"formula":"IF(Assumptions!$B$67=\"Base Case\",Scenarios!H9,IF(Assumptions!$B$67=\"Optimistic\",Scenarios!H95,Scenari |
| `npx tsx scripts/diag-calc-sheets.ts` | 0 | Error: File not found: Demo_Company_Inc__Financial_Model.xlsx |
| `npx tsx scripts/diag-interest-dividend.ts` | 0 | Row 34 "Dividend Payout Ratio": null, null, formula:0.3000, formula:0.3000, formula:0.3000, formula:0.3000, formula:0.3000 |
| `npx tsx scripts/diag_is.ts` | 0 | Error: File not found: <scratch-copy>\Demo_Company_Inc__Financial_Model.xlsx |
| `npx tsx scripts/diagnose-scenarios-tab.ts` | 0 | cogsPercent:         [0.65,0.66,0.67,0.67,0.68] |
| `npx tsx scripts/quick-diag.ts` | 0 | Converged: true Iters: 35 |
| `npx tsx scripts/test-audit-fixes.ts` | 0 | FINAL RESULTS: 81 PASSED, 34 FAILED |
| `npx tsx scripts/test-calc-sheets.ts` | 1 | Error: Cannot find module '@/lib/export/build-calc-sheets' |
| `npx tsx scripts/test-validation-agent.ts` | 0 | Total Checks:  40 |
| `node scripts/test_export.js` | 1 | Error: Cannot find module './tsconfig.json' |
| `npx tsx scripts/test_full_export.ts` | 0 | [U+1F389] ALL CHECKS PASSED! |
| `npx tsx scripts/test_scenarios.ts` | 0 | [U+2713] Total blocks in saved file: 3 |
| `npx tsx scripts/verify-calc-sheets.ts` | 1 | Error: Cannot find module '@/lib/export/build-calc-sheets' |
| `npx tsx scripts/verify-excel-export.ts` | 1 | [U+26A0] SOME VALIDATIONS FAILED |
| `npx tsx scripts/verify-full-fix.ts` | 0 | [U+1F389] ALL VERIFICATIONS PASSED! |
| `npx tsx scripts/verify-scenarios-sheet.ts` | 0 | [U+1F389] ALL SCENARIOS SHEET REVENUE MATCHES! |
| `npx tsx scripts/verify-scenarios-tab-full.ts` | 1 | [U+26A0] SOME VALUES MISMATCHED |
| `npx tsx scripts/verify-scenarios.ts` | 1 | [U+26A0] SOME SCENARIOS DO NOT MATCH |
| `npx tsx scripts/verify_audit.ts` | 0 | --- Convergence: YES \| 33 iterations \| delta=7.13e-3 --- |
| `npx tsx scripts/verify_excel_full.ts` | 1 | [U+2757] SOME CHECKS FAILED - see above |
| `npx tsx scripts/verify_excel_readback.ts` | 1 | File not found: <scratch-copy>\Demo_Company_Inc__Financial_Model.xlsx |
| `npx tsx scripts/verify_live_formulas.ts` | 1 | [U+2717] SOME CHECKS FAILED - see above for details |
| `npx tsx scripts/verify_scenario_export.ts` | 0 | [U+1F389] ALL CHECKS PASSED! |
| `npx tsx scripts/verify_scenario_output.ts` | 0 | Error: File not found: <scratch-copy>\Demo_Company_Inc__Financial_Model.xlsx |
| `node test_excel_export.mjs` | 0 | [U+2757] SOME CHECKS FAILED - see above |
| `python -I scripts/check_wolf.py` | 1 | FileNotFoundError: [WinError 2] The system cannot find the file specified: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model.xlsx' |
| `python -I scripts/deep_dive.py` | 1 | FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model.xlsx' |
| `python -I scripts/full_reconciliation.py` | 1 | FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model.xlsx' |
| `python -I scripts/phase1_diagnosis.py` | 1 | FileNotFoundError: [WinError 2] The system cannot find the file specified |
| `python -I scripts/targeted_comparison.py` | 1 | FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model.xlsx' |
| `python -I scripts/trace_discrepancy.py` | 1 | FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model.xlsx' |
| `python -I scripts/verify_scenarios.py` | 1 | FileNotFoundError: [Errno 2] No such file or directory: 'C:\\Users\\user\\Downloads\\WOLF_Financial_Model_Fixed.xlsx' |

