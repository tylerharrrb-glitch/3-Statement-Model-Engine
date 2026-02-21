// Engine Overview Word Document Generator
import {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle, AlignmentType, ShadingType
} from 'docx';
import fs from 'fs';

const NAVY = '1F3864';
const WHITE = 'FFFFFF';
const LIGHT = 'F2F2F2';

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t, bold: true, size: 32, color: NAVY })] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t, bold: true, size: 26, color: NAVY })] }); }
function h3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t, bold: true, size: 22, color: '2E75B6' })] }); }
function p(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 20 })], spacing: { after: 120 } }); }
function b(label, text) { return new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 }), new TextRun({ text, size: 20 })], spacing: { after: 80 } }); }
function bullet(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 20 })], bullet: { level: 0 }, spacing: { after: 60 } }); }
function bullet2(t) { return new Paragraph({ children: [new TextRun({ text: t, size: 20 })], bullet: { level: 1 }, spacing: { after: 40 } }); }
function spacer() { return new Paragraph({ children: [], spacing: { after: 200 } }); }

function makeTable(headers, rows) {
    const hdrCells = headers.map(h => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: WHITE })], alignment: AlignmentType.CENTER })],
        shading: { type: ShadingType.SOLID, color: NAVY },
        width: { size: Math.floor(9000 / headers.length), type: WidthType.DXA },
    }));
    const dataRows = rows.map((r, ri) => new TableRow({
        children: r.map(c => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(c), size: 18 })], spacing: { after: 40 } })],
            shading: ri % 2 === 0 ? { type: ShadingType.SOLID, color: LIGHT } : undefined,
        })),
    }));
    return new Table({ rows: [new TableRow({ children: hdrCells }), ...dataRows], width: { size: 9000, type: WidthType.DXA } });
}

const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        children: [
            // ═══ TITLE PAGE ═══
            new Paragraph({
                spacing: { before: 3000 }, alignment: AlignmentType.CENTER, children: [
                    new TextRun({ text: '3-Statement Financial Model Engine', bold: true, size: 48, color: NAVY }),
                ]
            }),
            new Paragraph({
                alignment: AlignmentType.CENTER, children: [
                    new TextRun({ text: 'Complete Technical & Functional Overview', size: 28, color: '666666', italics: true }),
                ]
            }),
            new Paragraph({
                spacing: { before: 600 }, alignment: AlignmentType.CENTER, children: [
                    new TextRun({ text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, size: 22, color: '999999' }),
                ]
            }),
            spacer(), spacer(),

            // ═══ 1. EXECUTIVE SUMMARY ═══
            h1('1. Executive Summary'),
            p('The 3-Statement Financial Model Engine is a browser-based, real-time financial modeling platform built with Next.js, TypeScript, and Zustand. It generates fully integrated Income Statement, Balance Sheet, and Cash Flow Statement projections from user-defined assumptions and historical data. The engine resolves circular references (debt → interest → NI → cash → debt) via iterative convergence and performs 16+ integration checks to guarantee accounting identity compliance.'),
            spacer(),
            b('Technology Stack: ', 'Next.js 15 + React 19 | TypeScript | Zustand (persisted state) | ExcelJS | Recharts'),
            b('Architecture: ', 'Client-side SPA with modular engine (5 computation modules), multi-format export (Excel/PDF/CSV/JSON)'),
            b('Key Differentiators: ', 'Circular reference resolution, scenario analysis (Base/Bull/Bear), Monte Carlo simulation, sensitivity tables, Egyptian market localization'),
            spacer(),

            // ═══ 2. SYSTEM ARCHITECTURE ═══
            h1('2. System Architecture'),
            h2('2.1 High-Level Architecture'),
            p('The system follows a layered architecture with clear separation between data, computation, state management, and presentation:'),
            makeTable(['Layer', 'Components', 'Responsibility'], [
                ['Types', 'types/assumptions.ts, financial.ts, historical.ts, scenario.ts', 'Interface definitions for all data structures'],
                ['Engine', 'lib/engines/* (5 files)', 'IS, BS, CF computation + circular resolver + integrator'],
                ['Analysis', 'lib/monte-carlo.ts, sensitivity.ts, ratios.ts', 'Financial analysis and simulation tools'],
                ['State', 'lib/store.ts (Zustand)', 'Global state management with localStorage persistence'],
                ['Scenarios', 'lib/scenario-manager.ts, scenarios.ts', 'Multi-scenario creation, management, and defaults'],
                ['Export', 'lib/export/* (6 files)', 'Excel (with live formulas), PDF, CSV, JSON export'],
                ['UI', 'components/* (16+ files)', 'React components: Dashboard, statements, charts, schedules'],
            ]),
            spacer(),

            h2('2.2 Directory Structure'),
            makeTable(['Path', 'Purpose'], [
                ['types/', 'TypeScript interfaces — AssumptionSet, ModelResults, IncomeStatement, BalanceSheet, CashFlowStatement, FinancialRatios, Scenario, MonteCarloConfig'],
                ['lib/engines/', 'Core computation: income-statement.ts, balance-sheet.ts, cash-flow.ts, circular-resolver.ts, integrator.ts'],
                ['lib/export/', 'Multi-format export: excel.ts (2,200+ lines), pdf.ts, csv-json.ts, build-dashboard.ts, build-scenarios.ts, build-company-info.ts'],
                ['lib/schedules/', 'Egyptian depreciation schedules with per-asset-class rates'],
                ['lib/', 'Store, ratios, Monte Carlo, sensitivity, scenario manager, formatting utilities'],
                ['components/', 'Dashboard, ModelPage, Historical import, Sidebar, ScenarioSelector, charts, statements, schedules'],
                ['app/', 'Next.js 15 app router (layout + page)'],
            ]),
            spacer(),

            // ═══ 3. TYPE SYSTEM ═══
            h1('3. Type System & Data Model'),
            h2('3.1 AssumptionSet (60+ fields)'),
            p('The AssumptionSet interface is the primary input to the engine. Each projected year is driven by these assumptions. Array fields have one value per projection year (default 5 years).'),
            makeTable(['Category', 'Fields', 'Format'], [
                ['Revenue', 'revenueBase, revenueGrowthRate[]', 'Absolute + % array'],
                ['Margins', 'cogsPercent[], sgaPercent[], rdPercent[], otherOpexPercent[]', '% of revenue arrays'],
                ['Working Capital', 'dso[], dio[], dpo[], prepaidPercent[], accruedExpPercent[], deferredRevPercent[]', 'Days / % arrays'],
                ['CapEx & D&A', 'capexPercent[], depreciationRate[], amortizationAmount[]', '% / absolute arrays'],
                ['Debt', 'interestRate, interestIncomeRate, shortTermDebtAmount[], longTermDebtIssuance[], longTermDebtRepayment[], currentPortionLTD[]', 'Scalar + arrays'],
                ['Tax', 'taxRate[], enableVAT, vatRate, useEgyptianRates, countryPreset', '% + boolean flags'],
                ['Equity', 'dividendPayoutRatio[], shareRepurchaseAmount[], equityIssuance[], sharesOutstanding[], stockBasedCompAmount[]', 'Mixed arrays'],
                ['BS Direct', 'goodwill[], commonStock[], apic[], oci[], otherCurrentAssets[], otherLongTermAssets[], otherCurrentLiabilities[], deferredTaxLiabilities[], otherLongTermLiabilities[]', 'Absolute arrays'],
                ['Egyptian', 'buildings, machinery, vehicles, computers, furniture (PP&E breakdown)', 'Fractions 0–1'],
                ['Model Config', 'projectionYears, historicalYears, startYear, fiscalYearEnd, fiscalYearPreset', 'Scalars'],
            ]),
            spacer(),

            h2('3.2 Output Interfaces'),
            makeTable(['Interface', 'Key Fields', 'Lines'], [
                ['IncomeStatement', 'revenue, cogs, grossProfit, sgaExpense, rdExpense, depreciation, amortization, ebit, ebitda, interestIncome/Expense, ebt, taxExpense, netIncome, eps, VAT memo fields', '56'],
                ['BalanceSheet', 'cash, AR, inventory, prepaid, grossPPE, accumDep, netPPE, intangibles, goodwill, AP, accrued, ST/LT debt, CPLTD, deferredRev/Tax, commonStock, APIC, RE, treasuryStock, OCI, isBalanced, balanceDifference', '111'],
                ['CashFlowStatement', 'netIncome, D&A, SBC, deferredTaxes, WC changes (AR, inventory, prepaid, AP, accrued, deferred), capex, acquisitions, debt issuance/repayment, equity, dividends, share repurchases, FCF, reconciles', '161'],
                ['FinancialRatios', 'Profitability (gross/operating/net margin, ROE, ROA, ROIC), Liquidity (current/quick/cash ratio), Leverage (D/E, D/A, interest coverage), Efficiency (turnover ratios, DSO/DIO/DPO, CCC)', '197'],
                ['IntegrationChecks', '16 boolean checks: assetsBalance, cashTies, netIncomeFlows, ppeTies, retainedEarningsFlows, debtTies, cfReconciles, workingCapitalTies, subtotal checks, ebitdaIdentity, apicConsistency', '219'],
                ['ModelResults', 'Combined: incomeStatements[], balanceSheets[], cashFlowStatements[], ratios[], integrationChecks[], convergenceInfo{converged, iterations, finalDelta}', '240'],
            ]),
            spacer(),

            // ═══ 4. ENGINE PIPELINE ═══
            h1('4. Engine Computation Pipeline'),
            h2('4.1 Master Orchestrator — integrator.ts'),
            p('The runFullModel() function is the entry point. It accepts an AssumptionSet and HistoricalInputs, then:'),
            bullet('Step 1: Build historical Income Statements from raw period data (buildHistoricalIncomeStatements)'),
            bullet('Step 2: Build historical Balance Sheets from raw data (buildHistoricalBalanceSheets)'),
            bullet('Step 3: Derive historical Cash Flow Statements from BS deltas (buildHistoricalCashFlows)'),
            bullet('Step 4: Loop through each projection year (default 5), calling resolveCircularReferences()'),
            bullet('Step 5: Validate integration after each period (validateIntegration → 16 checks)'),
            bullet('Step 6: Calculate financial ratios for all periods (calculateFinancialRatios)'),
            bullet('Step 7: Return combined ModelResults with convergence metadata'),
            spacer(),

            h2('4.2 Income Statement Engine — income-statement.ts'),
            p('Calculates projected IS line items from assumptions:'),
            bullet('Revenue: previousRevenue × (1 + growthRate[yr])'),
            bullet('COGS: revenue × cogsPercent[yr]'),
            bullet('Operating Expenses: SGA, R&D, Other OpEx as % of revenue; D&A from schedule; SBC from assumption'),
            bullet('EBIT = Gross Profit − Total OpEx; EBITDA = EBIT + D&A'),
            bullet('EBT = EBIT + Interest Income − Interest Expense + Other Income/Expense'),
            bullet('Tax = max(0, EBT × taxRate[yr]); Net Income = EBT − Tax'),
            bullet('EPS = Net Income / Shares Outstanding'),
            bullet('VAT memo fields computed when enableVAT is true (Egyptian market)'),
            spacer(),

            h2('4.3 Balance Sheet Engine — balance-sheet.ts'),
            p('Projects each BS line item using IS results, assumptions, and prior-period BS:'),
            bullet('Current Assets: AR = Revenue × DSO/365; Inventory = COGS × DIO/365; Prepaid = Revenue × prepaidPercent'),
            bullet('PP&E: Gross PPE = prior + CapEx; Accum Dep = prior + Depreciation; Net PPE = Gross − Accum'),
            bullet('Depreciation: depRate × (prior Gross PPE + current CapEx) — rate applied to avg gross PPE'),
            bullet('Interest Expense: interestRate × avg(beginning + ending total debt)'),
            bullet('Interest Income: interestIncomeRate × avg(beginning + ending cash)'),
            bullet('Liabilities: AP = COGS × DPO/365; Accrued = Revenue × accruedPercent; LTD = prior + issuance − repayment'),
            bullet('Equity: RE = prior RE + NI − Dividends; APIC = prior + SBC + equity issuance; Treasury = prior − repurchases'),
            bullet('Cash: plugged from CF ending cash (iterative convergence)'),
            spacer(),

            h2('4.4 Cash Flow Engine — cash-flow.ts'),
            p('Indirect method cash flow statement derived from IS and BS changes:'),
            bullet('Operating: NI + D&A + SBC + Deferred Taxes ± Working Capital Changes (ΔAR, ΔInventory, ΔPrepaid, ΔAP, ΔAccrued, ΔDeferred Rev)'),
            bullet('Investing: −CapEx ± Acquisitions ± Asset Sales ± Investment purchases/sales'),
            bullet('Financing: Debt issuance − repayment + Equity issuance − Dividends − Share repurchases'),
            bullet('Net Change = CFO + CFI + CFF; Ending Cash = Beginning Cash + Net Change'),
            bullet('FCF = CFO − CapEx (non-GAAP metric)'),
            bullet('Reconciliation check: CF ending cash must match BS cash'),
            spacer(),

            h2('4.5 Circular Reference Resolver — circular-resolver.ts'),
            p('The core algorithmic challenge. Financial models have inherent circularity:'),
            b('The Circular Loop: ', 'Debt Balance → Interest Expense → Net Income → Retained Earnings → Equity → Balance Sheet → Cash Flow → Ending Cash → Debt Capacity → Debt Balance'),
            spacer(),
            p('Resolution algorithm (iterative fixed-point convergence):'),
            bullet('Iteration 0: Seed estimates from prior period (depreciation, interest expense, interest income)'),
            bullet('Each iteration: (1) Calculate IS with current estimates → (2) Calculate BS → (3) Calculate CF → (4) Update BS cash from CF ending cash → (5) Recalculate depreciation from updated PP&E → (6) Recalculate interest expense from average debt → (7) Recalculate interest income from average cash'),
            bullet('Convergence test: |current ending cash − previous ending cash| < tolerance (default 0.01)'),
            bullet('Maximum iterations: 100 (safety bound)'),
            bullet('Output: converged flag, iteration count, final delta — reported in ModelResults.convergenceInfo'),
            spacer(),

            h2('4.6 Integration Validation — 16 Checks'),
            p('After each projection period, validateIntegration() runs 16 accounting identity checks:'),
            makeTable(['#', 'Check', 'Identity'], [
                ['1', 'Assets Balance', 'Total Assets = Total Liabilities + Total Equity'],
                ['2', 'Cash Ties', 'BS Cash = CF Ending Cash'],
                ['3', 'Net Income Flows', 'IS Net Income = CF Net Income'],
                ['4', 'PP&E Ties', 'Net PPE = Gross PPE − Accumulated Depreciation'],
                ['5', 'Retained Earnings', 'RE = Prior RE + NI − Dividends Paid'],
                ['6', 'Debt Ties', 'LTD = Prior LTD + Issuance − Repayment'],
                ['7', 'CF Reconciles', 'Ending Cash = Beginning Cash + Net Change'],
                ['8', 'Working Capital', 'WC changes in CF match BS deltas'],
                ['9–12', 'Subtotal Checks', 'Current Assets, Non-Current Assets, Current Liabilities, Non-Current Liabilities, Equity subtotals'],
                ['13', 'Income Waterfall', 'Revenue → GP → EBIT → EBT → NI waterfall'],
                ['14', 'EBITDA Identity', 'EBITDA = EBIT + D&A'],
                ['15', 'APIC Consistency', 'APIC = Prior APIC + SBC + Equity Issuance'],
                ['16', 'Overall', 'allPassed = all above true'],
            ]),
            spacer(),

            // ═══ 5. SCENARIO MANAGEMENT ═══
            h1('5. Scenario Management'),
            p('The engine supports multiple scenarios, each with its own complete AssumptionSet and computed ModelResults.'),
            h3('Default Scenarios'),
            makeTable(['Scenario', 'Type', 'Revenue Growth', 'COGS %', 'SGA %', 'CapEx %'], [
                ['Base Case', 'base', '10%, 8%, 7%, 6%, 5%', '60% (flat)', '15% (flat)', '5% (flat)'],
                ['Optimistic (Bull)', 'optimistic', '15%, 12%, 10%, 9%, 8%', '58%→55%', '14%→12%', '6%→5%'],
                ['Conservative (Bear)', 'conservative', '5%, 4%, 3%, 3%, 2%', '62%→64%', '16%→17%', '4% (flat)'],
            ]),
            spacer(),
            bullet('Scenarios stored in Zustand store as Scenario[] with id, name, type, assumptions, results, timestamps'),
            bullet('calculateAllScenarios() syncs global settings (tax rate, VAT, fiscal year) from Base Case before computing each'),
            bullet('setCountryPreset() applies country-specific settings (e.g., Egypt 22.5% tax) to ALL scenarios'),
            bullet('Custom scenarios can be added via duplicateScenario() or addScenario()'),
            bullet('Undo/Redo stack tracks assumption changes per scenario'),
            spacer(),

            // ═══ 6. FINANCIAL RATIOS ═══
            h1('6. Financial Ratio Analysis'),
            p('Computed for every period (historical + projected) via calculateFinancialRatios():'),
            makeTable(['Category', 'Ratios', 'Formula'], [
                ['Profitability', 'Gross Margin, Operating Margin, Net Margin', 'GP/Rev, EBIT/Rev, NI/Rev'],
                ['Returns', 'ROE, ROA, ROIC', 'NI/Avg Equity, NI/Avg Assets, NOPAT/Avg Invested Capital'],
                ['Liquidity', 'Current Ratio, Quick Ratio, Cash Ratio', 'CA/CL, (CA−Inv)/CL, Cash/CL'],
                ['Leverage', 'D/E, D/A, Interest Coverage', 'Debt/Equity, Debt/Assets, EBIT/Interest'],
                ['Efficiency', 'Asset Turnover, Inventory Turnover, Receivables Turnover', 'Rev/Avg Assets, COGS/Avg Inv, Rev/Avg AR'],
                ['Working Capital', 'DSO, DIO, DPO, Cash Conversion Cycle', 'AR/Rev×365, Inv/COGS×365, AP/COGS×365, DSO+DIO−DPO'],
            ]),
            spacer(),

            // ═══ 7. MONTE CARLO ═══
            h1('7. Monte Carlo Simulation'),
            p('Stochastic analysis engine that runs N iterations (default 10,000) with random assumption sampling:'),
            bullet('Distribution types: Normal (Box-Muller transform), Uniform, Triangular, Lognormal'),
            bullet('Default variables: revenueGrowthRate (Normal, μ=7%, σ=3%), cogsPercent (Normal, μ=60%, σ=3%), interestRate (Uniform, 3%–8%)'),
            bullet('Each iteration: sample variables → modify assumptions → runFullModel() → extract output metric'),
            bullet('Output metrics: Net Income, FCF, EPS, Revenue, EBITDA, ROE'),
            bullet('Statistics computed: Mean, Median, Std Dev, P10/P25/P50/P75/P90, Min, Max'),
            bullet('Failed iterations (convergence failures) are skipped gracefully'),
            spacer(),

            // ═══ 8. SENSITIVITY ANALYSIS ═══
            h1('8. Sensitivity Analysis'),
            p('Deterministic what-if analysis with one-way and two-way tables:'),
            h3('One-Way Sensitivity'),
            bullet('Varies a single assumption across a range (e.g., revenue growth from 3% to 13%)'),
            bullet('Runs runFullModel() for each value and extracts the chosen output metric'),
            bullet('Output: SensitivityResult[] with inputValue → outputValue pairs'),
            h3('Two-Way Sensitivity'),
            bullet('Varies two assumptions simultaneously (e.g., revenue growth × COGS %)'),
            bullet('Produces a matrix of output values for all combinations'),
            bullet('Output: TwoWaySensitivityResult with matrix[][], row1Values[], row2Values[]'),
            bullet('generateRange() helper creates centered ranges with configurable step size'),
            spacer(),

            // ═══ 9. EGYPTIAN MARKET ═══
            h1('9. Egyptian Market Localization'),
            p('Specialized support for Egyptian financial modeling:'),
            h3('Tax & Fiscal'),
            bullet('Corporate tax rate: 22.5% (vs. 25% US default)'),
            bullet('VAT rate: 14% (optional, computed as memo fields on IS)'),
            bullet('Dividend withholding rate: 10%'),
            bullet('Fiscal year presets: Calendar (Jan–Dec), Egyptian Government (Jul–Jun), Custom'),
            h3('Depreciation by Asset Class'),
            makeTable(['Asset Class', 'Arabic', 'Min Rate', 'Max Rate', 'Typical'], [
                ['Buildings', 'مباني', '2%', '5%', '4%'],
                ['Machinery', 'آلات', '7%', '10%', '8%'],
                ['Vehicles', 'مركبات', '12.5%', '25%', '20%'],
                ['Computers', 'حاسبات', '25%', '33%', '33%'],
                ['Furniture', 'أثاث', '10%', '20%', '15%'],
            ]),
            bullet('calculateEgyptianBlendedRate() computes weighted-average depreciation from PP&E composition'),
            h3('Currency Support'),
            bullet('6 currencies: USD ($), EGP (E£), EUR (€), GBP (£), SAR (SR), AED'),
            bullet('Always English numerals (never Arabic ٠-٩) via en-US locale enforcement'),
            spacer(),

            // ═══ 10. EXPORT ═══
            h1('10. Export System'),
            h2('10.1 Excel Export (2,200+ lines)'),
            p('The crown jewel — generates a professional Excel workbook with 8–12 tabs, all containing LIVE FORMULAS that update dynamically:'),
            makeTable(['Tab', 'Contents'], [
                ['Dashboard', 'Scenario selector dropdown (B6), key metrics with IF formulas, company info, sparkline-ready layout'],
                ['Company Info', 'Company name, ticker, industry, currency, country, fiscal year, valuation date'],
                ['Scenarios', 'Complete assumption + output data for all 3 scenarios (Base/Optimistic/Conservative) — source of truth for IF formulas'],
                ['Assumptions', 'All driver inputs with scenario-aware IF formulas for projection columns referencing Scenarios sheet via IF(Assumptions!$B$64=...)'],
                ['Income Statement', 'Full IS with live formulas: Revenue chain, COGS=Rev×%, operating expenses, EBIT, interest, tax, NI, EPS'],
                ['Balance Sheet', 'Full BS with formulas: WC from assumptions, PP&E chain (Gross→AccumDep→Net), debt schedule, equity chain, A=L+E check'],
                ['Cash Flow Statement', 'Indirect method with formulas: NI+D&A+SBC±WC changes, CapEx, debt/equity flows, FCF'],
                ['Ratios', 'All financial ratios computed via live cell references to IS/BS'],
                ['Working Capital', 'Detailed WC schedule with period-over-period changes'],
                ['Depreciation Schedule', 'PP&E rollforward: Beginning → +CapEx → −Depreciation → Ending'],
                ['Debt Schedule', 'Debt rollforward: Beginning → +Issuance → −Repayment → Ending, interest computation'],
            ]),
            spacer(),
            b('Scenario Wiring: ', 'ALL assumption rows in the Assumptions tab have IF() formulas for projection columns: IF(Assumptions!$B$64="Base Case", Scenarios!CellBase, IF(..."Optimistic", Scenarios!CellOpt, Scenarios!CellCons)). The Active Scenario cell links to Dashboard!B6 dropdown.'),
            spacer(),

            h2('10.2 Other Export Formats'),
            makeTable(['Format', 'Module', 'Contents'], [
                ['PDF', 'export/pdf.ts (49KB)', 'Professional multi-page PDF with executive summary, IS, BS, CF, ratios, scenario comparison'],
                ['CSV', 'export/csv-json.ts', 'Flat CSV with IS, BS, CF sections — one file download'],
                ['JSON', 'export/csv-json.ts', 'Full structured JSON with all statements, ratios, integration checks, convergence info'],
            ]),
            spacer(),

            // ═══ 11. STATE MANAGEMENT ═══
            h1('11. State Management — Zustand Store'),
            p('Global state managed by Zustand with localStorage persistence (key: "financial-model-storage"):'),
            makeTable(['Action', 'Description'], [
                ['setCompanyInfo()', 'Update company metadata (name, ticker, industry, currency, country)'],
                ['setHistoricalData()', 'Import/update historical periods, auto-builds HistoricalInputs array'],
                ['updateAssumption()', 'Modify a single assumption (with undo stack push), supports array indexing (e.g., "revenueGrowthRate[0]")'],
                ['calculateModel()', 'Run full model for active scenario: calls runFullModel(), stores results, validates integration'],
                ['calculateAllScenarios()', 'Run full model for ALL scenarios with global settings sync from Base Case'],
                ['setCountryPreset()', 'Apply US/Egypt/Custom tax & fiscal settings to ALL scenarios'],
                ['addScenario() / duplicateScenario()', 'Create new or clone existing scenarios'],
                ['undo() / redo()', 'Revert/replay assumption changes (per-scenario stack, max 20 entries)'],
                ['resetToDefaults()', 'Clear all data, recreate default scenarios and historical inputs'],
            ]),
            spacer(),

            // ═══ 12. UI COMPONENTS ═══
            h1('12. User Interface'),
            p('Single-page application with sidebar navigation and dynamic content area:'),
            makeTable(['Component', 'File', 'Purpose'], [
                ['Dashboard', 'Dashboard.tsx', 'Executive summary with KPIs, charts (Revenue/EBITDA/NI trends), scenario comparison, export buttons'],
                ['ModelPage', 'ModelPage.tsx', 'Assumption input grids organized by category (Revenue, Margins, WC, CapEx, Debt/Tax)'],
                ['HistoricalDataInput', 'HistoricalDataInput.tsx', 'Per-year historical financial data entry forms'],
                ['HistoricalImportPage', 'HistoricalImportPage.tsx', 'CSV/paste import for historical data with validation'],
                ['ScenarioSelector', 'ScenarioSelector.tsx', 'Dropdown to switch active scenario + scenario info cards'],
                ['ScenariosPage', 'ScenariosPage.tsx', 'Manage scenarios: create, duplicate, delete, compare'],
                ['ScenarioComparisonModal', 'ScenarioComparisonModal.tsx', 'Side-by-side comparison of all scenario outputs'],
                ['SensitivityPage', 'SensitivityPage.tsx', 'One-way and two-way sensitivity analysis UI with data tables'],
                ['MonteCarloPage', 'MonteCarloPage.tsx', 'Monte Carlo simulation config, run, and results visualization'],
                ['ValidationPage', 'ValidationPage.tsx', 'Integration check results display with pass/fail indicators'],
                ['EgyptianSettings', 'EgyptianSettings.tsx', 'Egyptian market configuration: tax rates, VAT, fiscal year, depreciation asset-class breakdown'],
                ['CompanySettings', 'CompanySettings.tsx', 'Company metadata and country preset configuration'],
                ['Sidebar', 'Sidebar.tsx', 'Navigation sidebar with tab switching, dark mode toggle, branding'],
            ]),
            spacer(),

            // ═══ 13. FILE INVENTORY ═══
            h1('13. Complete File Inventory'),
            makeTable(['File', 'Size', 'Purpose'], [
                ['types/assumptions.ts', '9.8 KB', 'AssumptionSet, HistoricalInputs, getDefaultAssumptions()'],
                ['types/financial.ts', '5.4 KB', 'IncomeStatement, BalanceSheet, CashFlowStatement, FinancialRatios, IntegrationChecks, ModelResults'],
                ['types/historical.ts', '10.4 KB', 'HistoricalDataInput, HistoricalPeriod, convertToHistoricalInputs(), getDefaultHistoricalData()'],
                ['types/scenario.ts', '3.4 KB', 'Scenario, ModelState, SensitivityConfig, MonteCarloConfig/Result, Distribution'],
                ['lib/engines/integrator.ts', '5.6 KB', 'runFullModel() — master orchestrator'],
                ['lib/engines/circular-resolver.ts', '15.5 KB', 'resolveCircularReferences(), validateIntegration() — 16 checks'],
                ['lib/engines/income-statement.ts', '6.8 KB', 'calculateIncomeStatement(), buildHistoricalIncomeStatements()'],
                ['lib/engines/balance-sheet.ts', '13.2 KB', 'calculateBalanceSheet(), calculateDepreciation/InterestExpense/InterestIncome()'],
                ['lib/engines/cash-flow.ts', '10.0 KB', 'calculateCashFlow() (indirect method), buildHistoricalCashFlows()'],
                ['lib/ratios.ts', '3.1 KB', 'calculateFinancialRatios() — 24 ratios across 4 categories'],
                ['lib/monte-carlo.ts', '6.3 KB', 'runMonteCarloSimulation() — 10,000 iterations with 4 distribution types'],
                ['lib/sensitivity.ts', '3.9 KB', 'oneWaySensitivity(), twoWaySensitivity(), generateRange()'],
                ['lib/store.ts', '18.3 KB', 'Zustand store — 15+ actions, localStorage persistence, undo/redo'],
                ['lib/scenario-manager.ts', '4.5 KB', 'createDefaultScenarios(), duplicateScenario(), updateScenarioAssumption()'],
                ['lib/scenarios.ts', '2.8 KB', 'SCENARIOS constant with default scenario overrides (used by Excel export)'],
                ['lib/schedules/egyptian-depreciation.ts', '2.8 KB', 'Egyptian asset-class depreciation rates, blended rate calculator, tax defaults'],
                ['lib/utils.ts', '3.2 KB', 'Multi-currency formatting (6 currencies), always English numerals'],
                ['lib/export/excel.ts', '115.9 KB', 'Full Excel export with 8–12 tabs, live formulas, scenario wiring'],
                ['lib/export/pdf.ts', '49.3 KB', 'Professional PDF export'],
                ['lib/export/csv-json.ts', '6.1 KB', 'CSV and JSON export'],
                ['lib/export/build-dashboard.ts', '19.7 KB', 'Dashboard tab builder with scenario IF formulas'],
                ['lib/export/build-scenarios.ts', '23.7 KB', 'Scenarios tab builder — source of truth for all scenario data'],
                ['lib/export/build-company-info.ts', '6.3 KB', 'Company Info tab builder'],
            ]),
            spacer(),

            // ═══ 14. KEY ALGORITHMS ═══
            h1('14. Key Algorithms & Design Decisions'),
            h3('Revenue Chain'),
            bullet('Historical: raw data from HistoricalInputs, YoY growth back-calculated'),
            bullet('Projection: Revenue[yr] = Revenue[yr-1] × (1 + growthRate[yr]) — always chains from prior period'),
            bullet('First projected year chains from last historical year (seamless transition)'),
            h3('PP&E Rollforward'),
            bullet('Gross PPE = Prior Gross PPE + CapEx (where CapEx = Revenue × capexPercent)'),
            bullet('Depreciation = depreciationRate × (Prior Gross PPE + CapEx) — full-year convention'),
            bullet('Accumulated Depreciation = Prior Accum Dep + Current Depreciation'),
            bullet('Net PPE = Gross PPE − Accumulated Depreciation'),
            h3('Debt Schedule'),
            bullet('LT Debt = Prior LTD + New Issuance − Repayment'),
            bullet('Interest Expense = interestRate × average(beginning total debt, ending total debt)'),
            bullet('Interest Income = interestIncomeRate × average(beginning cash, ending cash)'),
            h3('Retained Earnings'),
            bullet('RE = Prior RE + Net Income − Dividends Paid'),
            bullet('Dividends = Net Income × dividendPayoutRatio (only if NI > 0)'),
            h3('APIC Chain'),
            bullet('APIC = Prior APIC + Stock-Based Comp + Equity Issuance'),
            h3('Cash (Balancing Plug)'),
            bullet('Cash is NOT directly assumed — it is the output of the entire CF statement'),
            bullet('Ending Cash = Beginning Cash + Net Change in Cash (from CF)'),
            bullet('This is what creates the circular loop requiring iterative resolution'),
            spacer(),

            // ═══ FOOTER ═══
            new Paragraph({
                spacing: { before: 600 }, children: [
                    new TextRun({ text: '═══════════════════════════════════════════════════════════', color: NAVY }),
                ]
            }),
            p('This document was auto-generated from source code analysis of the 3-Statement Financial Model Engine codebase.'),
            b('Total Source Files: ', '35+ TypeScript files'),
            b('Total Lines of Code: ', '~5,000+ lines (engine + types + export)'),
            b('Engine Version: ', 'Next.js 15 + React 19 + TypeScript 5'),
        ],
    }],
});

const buffer = await Packer.toBuffer(doc);
const outPath = 'Engine_Overview.docx';
fs.writeFileSync(outPath, buffer);
console.log(`✅ Written ${outPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
