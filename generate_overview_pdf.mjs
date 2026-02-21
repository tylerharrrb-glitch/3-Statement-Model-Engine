/**
 * Generate Engine Overview PDF
 * Uses jsPDF (already installed) to create a nicely formatted PDF
 * from the engine overview content.
 * 
 * Run: node generate_overview_pdf.mjs
 */

import { jsPDF } from 'jspdf';
import fs from 'fs';

const doc = new jsPDF({ unit: 'mm', format: 'a4' });
const W = doc.internal.pageSize.getWidth();
const H = doc.internal.pageSize.getHeight();
const MARGIN = 18;
const TEXT_W = W - 2 * MARGIN;
let y = MARGIN;

const COLORS = {
    primary: [30, 58, 138],    // dark blue
    accent: [59, 130, 246],    // blue
    heading2: [17, 24, 39],    // near black
    text: [31, 41, 55],        // dark gray
    muted: [107, 114, 128],    // gray
    tableBg: [243, 244, 246],  // light gray
    tableHead: [30, 58, 138],  // dark blue
    white: [255, 255, 255],
    success: [22, 163, 74],    // green
    separator: [209, 213, 219],
};

function checkPage(needed = 12) {
    if (y + needed > H - 15) {
        doc.addPage();
        y = MARGIN;
        return true;
    }
    return false;
}

function setColor(c) { doc.setTextColor(c[0], c[1], c[2]); }
function setFill(c) { doc.setFillColor(c[0], c[1], c[2]); }

// ── COVER PAGE ──────────────────────────────────────────
function drawCover() {
    // Background gradient effect
    setFill(COLORS.primary);
    doc.rect(0, 0, W, H, 'F');

    // Accent bar
    setFill(COLORS.accent);
    doc.rect(0, H * 0.42, W, 3, 'F');

    // Title
    doc.setFont('helvetica', 'bold');
    setColor(COLORS.white);
    doc.setFontSize(32);
    doc.text('3-Statement Financial', W / 2, H * 0.30, { align: 'center' });
    doc.text('Model Engine', W / 2, H * 0.30 + 14, { align: 'center' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.text('Complete Technical Overview', W / 2, H * 0.50, { align: 'center' });

    // Meta info
    doc.setFontSize(11);
    const meta = [
        'Framework: Next.js 16 + React 19 + TypeScript 5',
        'Engine: Iterative Circular Resolver (100-iteration convergence)',
        'Export: Excel (9 tabs, live formulas) · PDF · CSV · JSON',
        'Analysis: Monte Carlo · Sensitivity · Scenario Comparison',
        'Localization: English / Arabic · Egyptian Market Support',
    ];
    let my = H * 0.60;
    for (const line of meta) {
        doc.text('›  ' + line, W / 2, my, { align: 'center' });
        my += 7;
    }

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, W / 2, H - 25, { align: 'center' });

    doc.addPage();
    y = MARGIN;
}

// ── TABLE OF CONTENTS ───────────────────────────────────
function drawTOC() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setColor(COLORS.primary);
    doc.text('Table of Contents', MARGIN, y); y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    setColor(COLORS.text);

    const toc = [
        ['1', 'Technology Stack'],
        ['2', 'Project Structure'],
        ['3', 'Type System (types/)'],
        ['4', 'Engine Layer (lib/engines/)'],
        ['5', 'Financial Ratios'],
        ['6', 'Analysis Tools'],
        ['7', 'State Management'],
        ['8', 'Export Layer'],
        ['9', 'Internationalization & Egyptian Localization'],
        ['10', 'Utility Functions'],
        ['11', 'UI Components (21 total)'],
        ['12', 'Navigation & Tab System'],
        ['13', 'Data Flow Architecture'],
        ['14', 'Key Design Decisions'],
        ['15', 'Known Limitations'],
    ];

    for (const [num, title] of toc) {
        doc.setFont('helvetica', 'bold');
        doc.text(`${num}.`, MARGIN + 2, y);
        doc.setFont('helvetica', 'normal');
        doc.text(title, MARGIN + 12, y);
        // Dots
        const tw = doc.getTextWidth(title);
        doc.setTextColor(180, 180, 180);
        const dotsStart = MARGIN + 12 + tw + 2;
        const dotsEnd = W - MARGIN - 5;
        let dx = dotsStart;
        while (dx < dotsEnd) {
            doc.text('.', dx, y);
            dx += 2;
        }
        setColor(COLORS.text);
        y += 7;
    }

    doc.addPage();
    y = MARGIN;
}

// ── SECTION HELPERS ─────────────────────────────────────
function sectionTitle(num, title) {
    checkPage(20);
    // Blue bar
    setFill(COLORS.primary);
    doc.rect(MARGIN, y - 5, TEXT_W, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(COLORS.white);
    doc.text(`${num}. ${title}`, MARGIN + 4, y + 1);
    y += 12;
}

function subTitle(title) {
    checkPage(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColor(COLORS.primary);
    doc.text(title, MARGIN, y);
    y += 2;
    setFill(COLORS.accent);
    doc.rect(MARGIN, y, 30, 0.5, 'F');
    y += 6;
}

function para(text) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(COLORS.text);
    const lines = doc.splitTextToSize(text, TEXT_W);
    for (const line of lines) {
        checkPage(6);
        doc.text(line, MARGIN, y);
        y += 4.5;
    }
    y += 2;
}

function bullet(text, indent = 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(COLORS.text);
    const x = MARGIN + 4 + indent * 6;
    const available = W - MARGIN - x;
    const lines = doc.splitTextToSize(text, available);
    for (let i = 0; i < lines.length; i++) {
        checkPage(5);
        if (i === 0) {
            doc.text('•', x - 4, y);
        }
        doc.text(lines[i], x, y);
        y += 4.5;
    }
}

function drawTable(headers, rows, colWidths) {
    const totalW = colWidths.reduce((s, w) => s + w, 0);
    const rowH = 6;

    // Header
    checkPage(rowH * 2);
    setFill(COLORS.tableHead);
    let x = MARGIN;
    doc.rect(x, y - 4, totalW, rowH, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setColor(COLORS.white);
    for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 2, y);
        x += colWidths[i];
    }
    y += rowH - 2;

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (let r = 0; r < rows.length; r++) {
        checkPage(rowH);
        x = MARGIN;
        if (r % 2 === 0) {
            setFill(COLORS.tableBg);
            doc.rect(x, y - 4, totalW, rowH, 'F');
        }
        setColor(COLORS.text);
        for (let i = 0; i < rows[r].length; i++) {
            const cellText = doc.splitTextToSize(String(rows[r][i]), colWidths[i] - 4);
            doc.text(cellText[0] || '', x + 2, y);
            x += colWidths[i];
        }
        y += rowH;
    }
    y += 3;
}

function codeBlock(lines) {
    checkPage(lines.length * 4.5 + 6);
    setFill([30, 30, 40]);
    const blockH = lines.length * 4.5 + 4;
    doc.rect(MARGIN, y - 4, TEXT_W, blockH, 'F');
    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    setColor([180, 220, 255]);
    for (const line of lines) {
        doc.text(line, MARGIN + 3, y);
        y += 4.5;
    }
    y += 4;
}

function separator() {
    checkPage(4);
    setFill(COLORS.separator);
    doc.rect(MARGIN, y, TEXT_W, 0.3, 'F');
    y += 5;
}

// ════════════════════════════════════════════════════════
// CONTENT
// ════════════════════════════════════════════════════════

drawCover();
drawTOC();

// ── 1. TECH STACK ───────────────────────────────────────
sectionTitle('1', 'Technology Stack');
drawTable(
    ['Layer', 'Technology', 'Version'],
    [
        ['Framework', 'Next.js (Turbopack)', '16.1.6'],
        ['Language', 'TypeScript', '5.x'],
        ['UI', 'React', '19.2.3'],
        ['State', 'Zustand (persist)', '5.0.11'],
        ['Charts', 'Recharts + D3', '3.7 / 7.9'],
        ['Excel Export', 'ExcelJS', '4.4'],
        ['PDF Export', 'jsPDF + AutoTable', '4.1 / 5.0'],
        ['Validation', 'Zod + TypeBox', '4.3 / 0.34'],
        ['CSS', 'Tailwind CSS', '4.x'],
        ['Math', 'mathjs', '15.1'],
    ],
    [45, 70, 60],
);

// ── 2. PROJECT STRUCTURE ────────────────────────────────
sectionTitle('2', 'Project Structure');
codeBlock([
    '3_Statement_Model_Engine/',
    '├── app/                 # Next.js app router',
    '│   ├── page.tsx         # Main page (tab router)',
    '│   └── globals.css      # Design system (8.9 KB)',
    '├── types/               # TypeScript interfaces',
    '│   ├── assumptions.ts   # AssumptionSet (60+ fields)',
    '│   ├── financial.ts     # IS, BS, CF, Ratios, ModelResults',
    '│   ├── historical.ts    # HistoricalDataInput, converters',
    '│   └── scenario.ts      # Scenario, ModelState, MC types',
    '├── lib/',
    '│   ├── engines/',
    '│   │   ├── income-statement.ts   # Revenue → Net Income',
    '│   │   ├── balance-sheet.ts      # Assets/Liabilities/Equity',
    '│   │   ├── cash-flow.ts          # Indirect method CF',
    '│   │   ├── circular-resolver.ts  # Iterative solver',
    '│   │   └── integrator.ts         # Master orchestrator',
    '│   ├── export/',
    '│   │   ├── excel.ts     # 9-tab workbook (103 KB)',
    '│   │   ├── pdf.ts       # Multi-page report (49 KB)',
    '│   │   └── csv-json.ts  # CSV + JSON export',
    '│   ├── store.ts         # Zustand (16 KB, 15+ actions)',
    '│   ├── ratios.ts        # 23 financial ratios',
    '│   ├── monte-carlo.ts   # 4 distributions, 10K iter',
    '│   ├── sensitivity.ts   # 1-way and 2-way analysis',
    '│   └── scenario-manager.ts # CRUD + comparison',
    '└── components/          # 21 React UI components',
]);

// ── 3. TYPE SYSTEM ──────────────────────────────────────
sectionTitle('3', 'Type System');

subTitle('AssumptionSet (types/assumptions.ts) — 60+ fields');
drawTable(
    ['Category', 'Key Fields'],
    [
        ['Revenue', 'revenueBase, revenueGrowthRate[]'],
        ['Margins', 'cogsPercent[], sgaPercent[], rdPercent[], otherOpexPercent[]'],
        ['Working Capital', 'dso[], dio[], dpo[], prepaidPercent[], accruedExpPercent[], deferredRevPercent[]'],
        ['Non-Current Assets', 'capexPercent[], depreciationRate[], amortizationAmount[], intangibles, goodwill'],
        ['Debt', 'interestRate[], shortTermDebt[], LTD issuance/repayment, currentPortionLTD[]'],
        ['Equity', 'commonStock[], APIC[], sharesOutstanding[], SBC, dividendPayout%, equityIssuance[]'],
        ['Tax / VAT', 'taxRate[], enableVAT, vatRate, interestIncomeRate[]'],
        ['Egyptian', 'buildings, machinery, vehicles, computers, furniture (PP&E asset-class mix)'],
        ['Model Config', 'projectionYears, historicalYears, startYear, fiscalYearEnd'],
    ],
    [40, 134],
);

subTitle('Financial Statement Interfaces (types/financial.ts)');
drawTable(
    ['Interface', 'Fields', 'Purpose'],
    [
        ['IncomeStatement', '26', 'Revenue → EPS waterfall + VAT memo'],
        ['BalanceSheet', '30', 'Full A = L + E with balance check'],
        ['CashFlowStatement', '25', 'CFO/CFI/CFF + FCF + reconciliation'],
        ['FinancialRatios', '23', 'Profitability / Liquidity / Leverage / Efficiency'],
        ['IntegrationChecks', '16 booleans', 'Cross-statement validation'],
        ['ModelResults', 'Combined', 'IS[] + BS[] + CF[] + Ratios[] + Convergence'],
    ],
    [45, 30, 99],
);

subTitle('Historical Data (types/historical.ts)');
bullet('HistoricalDataInput — Per-year input (55+ fields), user-editable');
bullet('convertToHistoricalInputs() — Bridges per-year → array format for engine');
bullet('buildHistoricalYear() — Auto-computes derived totals + retained earnings plug');
bullet('validateHistoricalBalance() — Returns error if Assets ≠ Liabilities + Equity');

subTitle('Scenario & Analysis Types (types/scenario.ts)');
bullet('ModelState — Global app state (company info, 15 tabs, undo/redo stacks, errors)');
bullet('Scenario — {id, name, type, assumptions, results, timestamps}');
bullet('ScenarioType — base | optimistic | conservative | custom');
bullet('Distribution — normal | uniform | triangular | lognormal');
bullet('MonteCarloResult — with p10/p25/p50/p75/p90 percentile statistics');

// ── 4. ENGINE LAYER ─────────────────────────────────────
sectionTitle('4', 'Engine Layer');

subTitle('Income Statement Engine (income-statement.ts)');
codeBlock([
    'Revenue = previousRevenue × (1 + growthRate)    // ALWAYS chains',
    'COGS = Revenue × cogsPercent',
    'Gross Profit = Revenue − COGS',
    'OpEx = SG&A + R&D + D&A + Other + SBC',
    'EBIT = Gross Profit − Total OpEx',
    'EBITDA = EBIT + Depreciation + Amortization',
    'EBT = EBIT + IntIncome − IntExp + OtherInc',
    'Tax = max(0, EBT × taxRate)',
    'Net Income = EBT − Tax',
    'EPS = NetIncome / SharesOutstanding',
]);
para('Also supports VAT memo fields (Egyptian market): revenueInclVAT, revenueExclVAT, vatCollected.');

subTitle('Balance Sheet Engine (balance-sheet.ts)');
drawTable(
    ['Item', 'Formula'],
    [
        ['Accounts Receivable', 'Revenue × DSO / 365'],
        ['Inventory', 'COGS × DIO / 365'],
        ['Prepaid Expenses', 'Revenue × prepaidPercent'],
        ['Gross PP&E', 'Prior + CapEx (Revenue × capexPercent)'],
        ['Accum. Depreciation', 'Prior + Depreciation'],
        ['Net PP&E', 'Gross − Accumulated'],
        ['Accounts Payable', 'COGS × DPO / 365'],
        ['Accrued Expenses', 'Revenue × accruedExpPercent'],
        ['Long-Term Debt', 'Prior + Issuance − Repayment'],
        ['Retained Earnings', 'Prior + NetIncome − Dividends'],
        ['APIC', 'Prior + SBC + EquityIssuance'],
        ['Cash', 'PLUG → Total L+E − all other assets'],
    ],
    [45, 129],
);

subTitle('Cash Flow Engine (cash-flow.ts) — Indirect Method');
codeBlock([
    'OPERATING:  NI + D&A + SBC + DefTax + WC Changes = CFO',
    'INVESTING:  −CapEx − Acquisitions + AssetSales = CFI',
    'FINANCING:  +DebtIssue −DebtRepay −Dividends +Equity −Buybacks = CFF',
    'Net Change = CFO + CFI + CFF',
    'FCF = CFO − CapEx',
    'Reconciles? = |EndingCash − BS.Cash| < 0.01',
]);

subTitle('Circular Resolver (circular-resolver.ts) — THE HEART');
para('Resolves the fundamental circular dependency: Interest ↔ Cash ↔ CF ↔ Net Income ↔ Interest. Iterates up to 100 times with tolerance = 0.01. Each iteration: compute Depreciation → Interest → IS → BS (cash=plug) → CF → check convergence.');

subTitle('16 Integration Checks (validateIntegration)');
drawTable(
    ['#', 'Check', 'Formula'],
    [
        ['1', 'Assets Balance', 'Total Assets = Total L+E'],
        ['2', 'Cash Ties', 'CF Ending Cash ≈ BS Cash'],
        ['3', 'Net Income Flows', 'IS Net Income = CF Net Income'],
        ['4', 'PP&E Ties', 'Net PP&E = Gross − Accum Dep'],
        ['5', 'RE Flows', 'RE = Prior + NI − Dividends'],
        ['6', 'Debt Ties', 'LTD = Prior + Issue − Repay'],
        ['7', 'CF Reconciles', 'Ending = Begin + Net Change'],
        ['8', 'WC Ties', 'WC changes = BS deltas'],
        ['9-13', 'Subtotal checks', 'CA, NCA, CL, NCL, Equity sums'],
        ['14', 'IS Waterfall', 'Revenue → COGS → Gross → NI'],
        ['15', 'EBITDA Identity', 'EBITDA = EBIT + D + A'],
        ['16', 'APIC Consistency', 'APIC = Prior + SBC + Equity'],
    ],
    [12, 50, 112],
);

subTitle('Integrator (integrator.ts) — Master Orchestrator');
para('runFullModel(assumptions, historicalInputs): 1) Build historical IS/BS/CF → 2) For each projection year: resolveCircularReferences → validateIntegration → 3) Combine historical + projected → 4) Calculate ratios → ModelResults.');

// ── 5. RATIOS ───────────────────────────────────────────
sectionTitle('5', 'Financial Ratios (ratios.ts)');
drawTable(
    ['Category', 'Ratios'],
    [
        ['Profitability', 'Gross Margin, Operating Margin, Net Margin, ROE, ROA, ROIC'],
        ['Liquidity', 'Current Ratio, Quick Ratio, Cash Ratio'],
        ['Leverage', 'Debt-to-Equity, Debt-to-Assets, Interest Coverage'],
        ['Efficiency', 'Asset Turnover, Inventory Turnover, Receivables Turnover, DSO, DIO, DPO, CCC'],
    ],
    [38, 136],
);
para('Uses average balances for ROE, ROA, and turnover ratios. ROIC = NOPAT / avg invested capital. Interest Coverage = EBIT / Interest Expense.');

// ── 6. ANALYSIS ─────────────────────────────────────────
sectionTitle('6', 'Analysis Tools');

subTitle('Sensitivity Analysis (sensitivity.ts)');
bullet('oneWaySensitivity() — Varies one assumption across a range, measures output metric');
bullet('twoWaySensitivity() — Varies two assumptions simultaneously, produces NxN matrix');
bullet('Output metrics: revenue | ebitda | netIncome | eps | fcf | roe');

subTitle('Monte Carlo Simulation (monte-carlo.ts)');
bullet('4 distributions: Normal (Box-Muller), Uniform, Triangular, Lognormal');
bullet('Default: 10,000 iterations with revenue growth, COGS%, and interest rate as variables');
bullet('Statistics: mean, median, stdDev, p10, p25, p50, p75, p90, min, max');

subTitle('Scenario Manager (scenario-manager.ts)');
bullet('3 pre-defined: Base (moderate growth), Optimistic (high growth + margin expansion), Conservative (slow growth + margin pressure)');
bullet('CRUD: createScenario, duplicateScenario, updateScenarioAssumption, deleteScenario');
bullet('compareScenarios() — Side-by-side: Revenue, EBITDA, NI, EPS, FCF, Debt, Cash, ROE');

// ── 7. STATE ────────────────────────────────────────────
sectionTitle('7', 'State Management (store.ts)');
para('Zustand store with localStorage persistence. 396 lines, 15+ actions.');
drawTable(
    ['Action', 'Description'],
    [
        ['setCompanyInfo()', 'Update company metadata (name, ticker, currency, country)'],
        ['setHistoricalData()', 'Set per-year data + auto-convert to engine format'],
        ['updateAssumption(path, val)', 'Handles nested paths like revenueGrowthRate[0]'],
        ['addScenario() / delete / dup', 'Scenario CRUD operations'],
        ['calculateModel()', 'Runs runFullModel() for active scenario'],
        ['calculateAllScenarios()', 'Runs model for every scenario in parallel'],
        ['undo() / redo()', 'Assumption-level undo/redo (unlimited stack)'],
        ['setCountryPreset()', 'Applies US / Egyptian / Custom tax and depreciation defaults'],
        ['resetToDefaults()', 'Full state reset to demo data'],
    ],
    [55, 119],
);

// ── 8. EXPORT ───────────────────────────────────────────
sectionTitle('8', 'Export Layer');

subTitle('Excel Export (excel.ts) — 2,029 lines, 103 KB');
para('Generates a 9-tab Excel workbook with 100% LIVE FORMULAS (no hard-coded values):');
drawTable(
    ['Tab', 'Content'],
    [
        ['Summary Dashboard', 'Scenario comparison matrix (all scenarios side-by-side)'],
        ['Assumptions', '40+ editable rows that drive all formulas'],
        ['Income Statement', 'Revenue → EPS with formulas referencing Assumptions'],
        ['Balance Sheet', 'Full A=L+E with Cash as plug formula'],
        ['Cash Flow Statement', 'Indirect method, formulas reference IS and BS'],
        ['Ratios', 'Profitability, Liquidity, Efficiency — all formulas'],
        ['Working Capital', 'DSO/DIO/DPO + NWC schedule'],
        ['Depreciation Schedule', 'Gross PP&E rollforward + accumulated depreciation'],
    ],
    [48, 126],
);
bullet('Historical vs Projected visual styling (blue tint for historical, border separator)');
bullet('Back-computed assumptions for historical periods (DSO, DIO, DPO from actual data)');
bullet('Cash plug: Total L+E − AR − Inventory − Prepaid − OCA − Total NCA');
bullet('Balance check: IF(ABS(Assets − L+E) < 1, "✓ Balanced", "✗ Imbalanced")');
bullet('CF reconciliation: IF(ABS(EndingCash − BS.Cash) < 0.01, "✓", "✗")');

subTitle('PDF Export (pdf.ts) — 49 KB');
bullet('Multi-page report: Cover, Income Statement, Balance Sheet, Cash Flow, Ratios');
bullet('Supports Egyptian locale with bilingual labels');

subTitle('CSV / JSON Export (csv-json.ts)');
bullet('Plain data export in CSV and JSON formats for external tools');

// ── 9. I18N ─────────────────────────────────────────────
sectionTitle('9', 'Internationalization & Egyptian Localization');

subTitle('Bilingual Labels (i18n/labels.ts)');
para('80+ financial line items with English/Arabic label pairs covering IS, BS, CF, Ratios, and Egyptian-specific terms.');
codeBlock([
    "revenue:    { en: 'Revenue',            ar: 'الإيرادات' }",
    "accountsReceivable: { en: 'Accounts Receivable', ar: 'المدينون' }",
    "vatRate:    { en: 'VAT Rate',            ar: 'معدل ضريبة القيمة المضافة' }",
]);

subTitle('Egyptian Depreciation (schedules/egyptian-depreciation.ts)');
drawTable(
    ['Asset Class', 'Arabic', 'Min Rate', 'Max Rate', 'Typical'],
    [
        ['Buildings', 'مباني', '2%', '5%', '4%'],
        ['Machinery', 'آلات', '7%', '10%', '8%'],
        ['Vehicles', 'مركبات', '12.5%', '25%', '20%'],
        ['Computers', 'حاسبات', '25%', '33%', '33%'],
        ['Furniture', 'أثاث', '10%', '20%', '15%'],
    ],
    [35, 25, 25, 25, 25],
);
para('Egyptian tax defaults: Corporate tax 22.5%, VAT 14%, Dividend withholding 10%. Fiscal year presets: Calendar (Jan-Dec), Egyptian Govt (Jul-Jun), Custom.');

// ── 10. UTILS ───────────────────────────────────────────
sectionTitle('10', 'Utility Functions (utils.ts)');
drawTable(
    ['Function', 'Purpose'],
    [
        ['formatCurrency(val, cur, compact)', 'Multi-currency, ALWAYS English numerals (never Arabic ٠-٩)'],
        ['formatPercent(val, decimals)', 'Percentage formatting (e.g., "15.2%")'],
        ['formatNumber(val, decimals)', 'Number formatting with en-US locale'],
        ['formatEPS(val, currency)', 'EPS with currency symbol'],
        ['colorForValue(val)', 'Green (>0) / Red (<0) / Neutral CSS color'],
    ],
    [58, 116],
);
para('Supported currencies: USD ($), EGP (E£), EUR (€), GBP (£), SAR (SR), AED (AED).');

// ── 11. COMPONENTS ──────────────────────────────────────
sectionTitle('11', 'UI Components (21 total)');

subTitle('Core Pages');
drawTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['Sidebar.tsx', '11.7 KB', 'Navigation (15 tabs), Calculate, Export, Dark mode'],
        ['Dashboard.tsx', '14.6 KB', 'KPI cards + Scenario comparison table with deltas'],
        ['ModelPage.tsx', '7 KB', 'Assumptions editor — 60+ fields in sections'],
        ['ValidationPage.tsx', '7.8 KB', '80 integration checks (16 × 5 years) pass/fail'],
    ],
    [48, 18, 108],
);

subTitle('Financial Statements');
drawTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['IncomeStatementPage.tsx', '6.5 KB', 'Full IS with historical (blue) vs projected columns'],
        ['BalanceSheetPage.tsx', '7 KB', 'Assets, Liabilities, Equity + balance check'],
        ['CashFlowPage.tsx', '7.1 KB', 'CFO/CFI/CFF + reconciliation indicator'],
    ],
    [52, 18, 104],
);

subTitle('Schedules');
drawTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['WorkingCapitalPage.tsx', '10.9 KB', 'DSO/DIO/DPO, NWC build, NWC % Revenue'],
        ['DepreciationPage.tsx', '8.2 KB', 'Gross PP&E rollforward, Egyptian asset-class sliders'],
        ['DebtSchedulePage.tsx', '9.1 KB', 'Debt issuance/repayment, interest calculation'],
    ],
    [52, 18, 104],
);

subTitle('Analysis & Settings');
drawTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['SensitivityPage.tsx', '6 KB', 'Tornado chart + data table'],
        ['MonteCarloPage.tsx', '9.4 KB', 'Histogram + percentile statistics'],
        ['ScenariosPage.tsx', '5.7 KB', 'Scenario list, create/duplicate/delete'],
        ['ScenarioComparisonModal', '12 KB', 'Full side-by-side comparison modal'],
        ['CompanySettings.tsx', '3.2 KB', 'Company name, ticker, currency, country'],
        ['EgyptianSettings.tsx', '8.7 KB', 'VAT, tax rates, fiscal year, depreciation mix'],
        ['HistoricalImportPage.tsx', '12.3 KB', 'CSV import with column mapping'],
        ['RevenueChart.tsx', '2.4 KB', 'Revenue bar chart (Recharts)'],
        ['MarginChart.tsx', '1.5 KB', 'Gross/Operating/Net margin line chart'],
    ],
    [52, 18, 104],
);

// ── 12. TABS ────────────────────────────────────────────
sectionTitle('12', 'Navigation & Tab System');
para('The app uses a 15-tab system controlled by the Zustand store\'s activeTab:');
codeBlock([
    'dashboard → income → balance → cashflow → model →',
    'working-capital → depreciation → debt-schedule →',
    'scenarios → sensitivity → montecarlo →',
    'import → historicaldata → validation → company-settings',
]);

// ── 13. DATA FLOW ───────────────────────────────────────
sectionTitle('13', 'Data Flow Architecture');
para('INPUT: Historical Data (2-3 years) + Assumptions (60+ fields) + Scenario Selection → Zustand Store');
para('ENGINE: integrator.runFullModel() → Build Historical IS/BS/CF → For each projection year: resolveCircularReferences (iterate up to 100×) → IS → BS → CF loop → validateIntegration (16 checks)');
para('OUTPUT: ModelResults → UI Components + Excel (9 tabs, live formulas) + PDF (multi-page report) + CSV/JSON');
para('ANALYSIS: ModelResults → Sensitivity Analysis + Monte Carlo (10K iterations) + Scenario Comparison');

// ── 14. DESIGN DECISIONS ────────────────────────────────
sectionTitle('14', 'Key Design Decisions');
bullet('Cash as Plug — Cash is the balancing item (Total L+E − all other assets). A = L+E always holds.');
bullet('Iterative Circular Resolution — Interest ↔ Cash ↔ CF ↔ NI. Solved via 100-iteration loop, tolerance 0.01.');
bullet('Revenue Chain — ALWAYS chains previousRevenue × (1 + growthRate). No separate projection base.');
bullet('Average Balances for Interest — Interest expense = avg(begin, end) debt × rate. Same for income.');
bullet('Back-Computed Historical Assumptions — For Excel, historical DSO/DIO/DPO are back-computed so all cells can be formulas.');
bullet('Egyptian Localization — Full support: 22.5% corp tax, 14% VAT, 5 asset-class depreciation, bilingual labels.');
bullet('Zustand + localStorage — State persists across browser refreshes.');

// ── 15. LIMITATIONS ─────────────────────────────────────
sectionTitle('15', 'Known Limitations');
bullet('No multi-segment revenue breakdown');
bullet('No DCF / terminal value / WACC valuation module');
bullet('No automated import from financial data APIs (SEC, Bloomberg, etc.)');
bullet('Single currency only — no FX conversion or multi-currency BS');
bullet('No user authentication or multi-user collaboration');
bullet('Monte Carlo runs synchronously (may freeze UI for large iteration counts)');
bullet('Historical data limited to manual entry or CSV import');

// ── FOOTER ON EACH PAGE ─────────────────────────────────
const pageCount = doc.getNumberOfPages();
for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    if (p > 1) { // Skip cover
        doc.text(`3-Statement Financial Model Engine — Technical Overview`, MARGIN, H - 6);
        doc.text(`Page ${p - 1} of ${pageCount - 1}`, W - MARGIN, H - 6, { align: 'right' });
    }
}

// ── SAVE ────────────────────────────────────────────────
const output = doc.output('arraybuffer');
const outPath = 'Engine_Overview.pdf';
fs.writeFileSync(outPath, Buffer.from(output));
console.log(`✓ Generated ${outPath} (${(Buffer.from(output).byteLength / 1024).toFixed(0)} KB, ${pageCount} pages)`);
