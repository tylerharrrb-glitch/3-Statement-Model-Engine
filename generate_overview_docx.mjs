/**
 * Generate Engine Overview as Word Document (.docx)
 * Uses the 'docx' npm package for rich formatting.
 * Run: node generate_overview_docx.mjs
 */

import {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, HeadingLevel, BorderStyle, ShadingType,
    PageBreak, TableOfContents, Header, Footer, PageNumber, NumberFormat,
    TabStopPosition, TabStopType, ImageRun, LevelFormat,
} from 'docx';
import fs from 'fs';

// ── Color palette ───────────────────────────────────────
const C = {
    primary: '1E3A8A',    // dark blue
    accent: '3B82F6',     // blue
    text: '1F2937',       // dark gray
    muted: '6B7280',      // gray
    tableHead: '1E3A8A',  // dark blue
    tableBg: 'F3F4F6',    // light gray
    white: 'FFFFFF',
    codeBg: '1E1E2E',     // dark bg
    codeText: 'B4DCFF',
    success: '16A34A',
    black: '000000',
};

// ── Helper functions ────────────────────────────────────
function heading1(text) {
    return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 32, color: C.primary, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 3, color: C.accent } },
    });
}

function heading2(text) {
    return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 26, color: C.primary, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 80 },
    });
}

function heading3(text) {
    return new Paragraph({
        children: [new TextRun({ text, bold: true, size: 22, color: C.accent, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 60 },
    });
}

function para(text, opts = {}) {
    return new Paragraph({
        children: [new TextRun({
            text,
            size: 20,
            color: opts.color || C.text,
            font: 'Calibri',
            bold: opts.bold || false,
            italics: opts.italics || false,
        })],
        spacing: { after: opts.afterSpacing ?? 80 },
        alignment: opts.align || AlignmentType.LEFT,
    });
}

function richPara(runs, opts = {}) {
    return new Paragraph({
        children: runs.map(r => new TextRun({
            text: r.text,
            size: r.size || 20,
            color: r.color || C.text,
            font: r.font || 'Calibri',
            bold: r.bold || false,
            italics: r.italics || false,
        })),
        spacing: { after: opts.afterSpacing ?? 80 },
        alignment: opts.align || AlignmentType.LEFT,
    });
}

function bullet(text, level = 0) {
    return new Paragraph({
        children: [new TextRun({ text, size: 20, color: C.text, font: 'Calibri' })],
        bullet: { level },
        spacing: { after: 40 },
    });
}

function codeLine(text) {
    return new Paragraph({
        children: [new TextRun({ text, size: 18, color: C.accent, font: 'Consolas' })],
        spacing: { after: 20 },
        shading: { type: ShadingType.SOLID, color: 'F8F9FA', fill: 'F8F9FA' },
        indent: { left: 360 },
    });
}

function codeBlock(lines) {
    return lines.map(line => codeLine(line));
}

function emptyLine() {
    return new Paragraph({ children: [], spacing: { after: 40 } });
}

function pageBreak() {
    return new Paragraph({ children: [new PageBreak()] });
}

function makeTableCell(text, opts = {}) {
    return new TableCell({
        children: [new Paragraph({
            children: [new TextRun({
                text: String(text),
                size: opts.size || 18,
                color: opts.color || C.text,
                font: opts.font || 'Calibri',
                bold: opts.bold || false,
            })],
            spacing: { after: 0 },
        })],
        width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
        shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading } : undefined,
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
    });
}

function makeTable(headers, rows, widths) {
    const headerRow = new TableRow({
        children: headers.map((h, i) => makeTableCell(h, {
            bold: true, color: C.white, shading: C.tableHead,
            width: widths?.[i],
        })),
        tableHeader: true,
    });

    const dataRows = rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => makeTableCell(cell, {
            shading: ri % 2 === 0 ? C.tableBg : C.white,
            width: widths?.[ci],
        })),
    }));

    return new Table({
        rows: [headerRow, ...dataRows],
        width: { size: 100, type: WidthType.PERCENTAGE },
    });
}

function importantBox(text) {
    return new Paragraph({
        children: [
            new TextRun({ text: '⚡ ', size: 20, bold: true, color: C.accent, font: 'Calibri' }),
            new TextRun({ text, size: 20, color: C.primary, font: 'Calibri', bold: true }),
        ],
        spacing: { before: 120, after: 120 },
        shading: { type: ShadingType.SOLID, color: 'EFF6FF', fill: 'EFF6FF' },
        border: {
            left: { style: BorderStyle.SINGLE, size: 6, color: C.accent },
        },
        indent: { left: 120 },
    });
}

// ════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ════════════════════════════════════════════════════════

const children = [];

// ── COVER PAGE ──────────────────────────────────────────
children.push(emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine(), emptyLine());
children.push(para('3-Statement Financial Model Engine', {
    bold: true, color: C.primary, align: AlignmentType.CENTER, afterSpacing: 40,
}));
// Override the above with bigger text
children.pop();
children.push(new Paragraph({
    children: [new TextRun({ text: '3-Statement Financial', bold: true, size: 52, color: C.primary, font: 'Calibri' })],
    alignment: AlignmentType.CENTER, spacing: { after: 0 },
}));
children.push(new Paragraph({
    children: [new TextRun({ text: 'Model Engine', bold: true, size: 52, color: C.primary, font: 'Calibri' })],
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
}));

// Separator line
children.push(new Paragraph({
    children: [new TextRun({ text: '━'.repeat(50), size: 16, color: C.accent, font: 'Calibri' })],
    alignment: AlignmentType.CENTER, spacing: { after: 200 },
}));

children.push(new Paragraph({
    children: [new TextRun({ text: 'Complete Technical Overview', size: 28, color: C.muted, font: 'Calibri', italics: true })],
    alignment: AlignmentType.CENTER, spacing: { after: 400 },
}));

const coverMeta = [
    'Framework: Next.js 16 + React 19 + TypeScript 5',
    'Engine: Iterative Circular Resolver (100-iteration convergence)',
    'Export: Excel (9 tabs, live formulas) · PDF · CSV · JSON',
    'Analysis: Monte Carlo · Sensitivity · Scenario Comparison',
    'Localization: English / Arabic · Egyptian Market Support',
];
for (const line of coverMeta) {
    children.push(new Paragraph({
        children: [
            new TextRun({ text: '›  ', bold: true, size: 20, color: C.accent, font: 'Calibri' }),
            new TextRun({ text: line, size: 20, color: C.text, font: 'Calibri' }),
        ],
        alignment: AlignmentType.CENTER, spacing: { after: 60 },
    }));
}

children.push(emptyLine(), emptyLine(), emptyLine(), emptyLine());
children.push(new Paragraph({
    children: [new TextRun({
        text: `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
        size: 18, color: C.muted, font: 'Calibri', italics: true,
    })],
    alignment: AlignmentType.CENTER,
}));

children.push(pageBreak());

// ── TABLE OF CONTENTS ───────────────────────────────────
children.push(new Paragraph({
    children: [new TextRun({ text: 'Table of Contents', bold: true, size: 36, color: C.primary, font: 'Calibri' })],
    spacing: { after: 200 },
}));

const tocItems = [
    ['1', 'Technology Stack'],
    ['2', 'Project Structure'],
    ['3', 'Type System'],
    ['4', 'Engine Layer'],
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

for (const [num, title] of tocItems) {
    children.push(new Paragraph({
        children: [
            new TextRun({ text: `${num}.  `, bold: true, size: 22, color: C.primary, font: 'Calibri' }),
            new TextRun({ text: title, size: 22, color: C.text, font: 'Calibri' }),
            new TextRun({ text: '  ' + '.'.repeat(80 - title.length), size: 18, color: 'D1D5DB', font: 'Calibri' }),
        ],
        spacing: { after: 80 },
    }));
}

children.push(pageBreak());

// ── 1. TECH STACK ───────────────────────────────────────
children.push(heading1('1. Technology Stack'));
children.push(makeTable(
    ['Layer', 'Technology', 'Version'],
    [
        ['Framework', 'Next.js (Turbopack)', '16.1.6'],
        ['Language', 'TypeScript', '5.x'],
        ['UI', 'React', '19.2.3'],
        ['State Management', 'Zustand (persist middleware)', '5.0.11'],
        ['Charts', 'Recharts + D3', '3.7 / 7.9'],
        ['Excel Export', 'ExcelJS', '4.4'],
        ['PDF Export', 'jsPDF + AutoTable', '4.1 / 5.0'],
        ['Validation', 'Zod + TypeBox', '4.3 / 0.34'],
        ['CSS Framework', 'Tailwind CSS', '4.x'],
        ['Math Library', 'mathjs', '15.1'],
    ],
    [25, 45, 30],
));

// ── 2. PROJECT STRUCTURE ────────────────────────────────
children.push(heading1('2. Project Structure'));
children.push(...codeBlock([
    '3_Statement_Model_Engine/',
    '├── app/                        # Next.js app router',
    '│   ├── page.tsx                # Main page (tab router)',
    '│   ├── layout.tsx              # Root layout',
    '│   └── globals.css             # Design system (8.9 KB)',
    '├── types/                      # TypeScript interfaces',
    '│   ├── assumptions.ts          # AssumptionSet (60+ fields), HistoricalInputs',
    '│   ├── financial.ts            # IS, BS, CF, Ratios, IntegrationChecks, ModelResults',
    '│   ├── historical.ts           # HistoricalDataInput, converters, validators',
    '│   └── scenario.ts             # Scenario, ModelState, Monte Carlo types',
    '├── lib/',
    '│   ├── engines/                # Core calculation engine',
    '│   │   ├── income-statement.ts # Revenue → Net Income waterfall',
    '│   │   ├── balance-sheet.ts    # All asset/liability/equity calculations',
    '│   │   ├── cash-flow.ts        # Indirect method CF generation',
    '│   │   ├── circular-resolver.ts# Iterative solver for circular references',
    '│   │   └── integrator.ts       # Master orchestrator',
    '│   ├── export/',
    '│   │   ├── excel.ts            # 9-tab Excel workbook (103 KB of formulas)',
    '│   │   ├── pdf.ts              # Multi-page PDF report (49 KB)',
    '│   │   └── csv-json.ts         # CSV + JSON data export',
    '│   ├── store.ts                # Zustand store (16 KB, 15+ actions)',
    '│   ├── ratios.ts               # 23 financial ratios',
    '│   ├── monte-carlo.ts          # Monte Carlo simulation (4 distributions)',
    '│   ├── sensitivity.ts          # 1-way and 2-way sensitivity analysis',
    '│   ├── scenario-manager.ts     # Scenario CRUD + comparison',
    '│   ├── scenarios.ts            # Pre-defined scenario definitions',
    '│   ├── i18n/labels.ts          # Bilingual labels (English / Arabic)',
    '│   ├── schedules/egyptian-depreciation.ts',
    '│   └── utils.ts                # Multi-currency formatting utilities',
    '└── components/                 # 21 React UI components',
]));

// ── 3. TYPE SYSTEM ──────────────────────────────────────
children.push(pageBreak());
children.push(heading1('3. Type System (types/)'));

children.push(heading2('3.1 AssumptionSet (assumptions.ts) — 60+ fields'));
children.push(para('The main projection configuration with ~60 fields organized by category:'));
children.push(makeTable(
    ['Category', 'Key Fields'],
    [
        ['Revenue', 'revenueBase, revenueGrowthRate[]'],
        ['Margins', 'cogsPercent[], sgaPercent[], rdPercent[], otherOpexPercent[]'],
        ['Working Capital', 'dso[], dio[], dpo[], prepaidPercent[], accruedExpPercent[], deferredRevPercent[], otherCAPercent[], otherCLPercent[]'],
        ['Non-Current Assets', 'capexPercent[], depreciationRate[], amortizationAmount[], intangiblesAmount[], goodwillAmount[], otherLTAPercent[]'],
        ['Debt', 'interestRate[], shortTermDebt[], longTermDebtIssuance[], longTermDebtRepayment[], currentPortionLTD[], deferredTaxLiabilityPercent[]'],
        ['Equity', 'commonStock[], APIC[], sharesOutstanding[], stockBasedCompAmount[], dividendPayoutRatio[], equityIssuance[], shareRepurchaseAmount[]'],
        ['Tax / VAT', 'taxRate[], enableVAT, vatRate, interestIncomeRate[]'],
        ['Egyptian', 'buildings, machinery, vehicles, computers, furniture (PP&E asset-class mix fractions)'],
        ['Model Config', 'projectionYears, historicalYears, startYear, fiscalYearEnd, fiscalYearPreset'],
    ],
    [25, 75],
));
children.push(para('Also provides getDefaultAssumptions() with 5 projection-year demo data and getDefaultHistoricalInputs() with balanced 2-year demo historical data.'));

children.push(heading2('3.2 Financial Statement Interfaces (financial.ts)'));
children.push(makeTable(
    ['Interface', 'Fields', 'Purpose'],
    [
        ['IncomeStatement', '26 fields', 'Revenue → EPS waterfall, includes VAT memo fields'],
        ['BalanceSheet', '30 fields', 'Full A = L + E with isBalanced check flag'],
        ['CashFlowStatement', '25 fields', 'CFO/CFI/CFF sections + FCF + reconciliation flag'],
        ['FinancialRatios', '23 fields', 'Profitability, Liquidity, Leverage, Efficiency ratios'],
        ['IntegrationChecks', '16 booleans + details[]', 'Cross-statement validation results'],
        ['ModelResults', 'Combined arrays', 'IS[] + BS[] + CF[] + Ratios[] + IntegrationChecks[] + ConvergenceInfo'],
    ],
    [25, 20, 55],
));

children.push(heading2('3.3 Historical Data (historical.ts)'));
children.push(bullet('HistoricalDataInput — Per-year input object with 55+ fields, user-editable through the UI'));
children.push(bullet('convertToHistoricalInputs() — Bridges per-year object format → parallel array format for the engine'));
children.push(bullet('buildHistoricalYear() — Auto-computes derived totals (totalCurrentAssets, totalAssets, etc.) and uses retained earnings as plug so balance sheet always balances'));
children.push(bullet('validateHistoricalBalance() — Returns error string if Assets ≠ Liabilities + Equity'));

children.push(heading2('3.4 Scenario & Analysis Types (scenario.ts)'));
children.push(bullet('ModelState — Global application state interface: company info, 15 navigation tabs, undo/redo stacks, errors/warnings arrays'));
children.push(bullet('Scenario — { id, name, type, assumptions, results, createdAt, updatedAt }'));
children.push(bullet("ScenarioType — 'base' | 'optimistic' | 'conservative' | 'custom'"));
children.push(bullet('Distribution — { type: normal|uniform|triangular|lognormal, params: {mean, stdDev, min, max, mode} }'));
children.push(bullet('MonteCarloConfig — iterations count, variable-to-distribution map, output metrics list'));
children.push(bullet('MonteCarloResult — values array + statistics (mean, median, stdDev, p10/p25/p50/p75/p90, min, max)'));

// ── 4. ENGINE LAYER ─────────────────────────────────────
children.push(pageBreak());
children.push(heading1('4. Engine Layer (lib/engines/)'));

children.push(heading2('4.1 Income Statement Engine (income-statement.ts)'));
children.push(para('calculateIncomeStatement(inputs) builds a single projected IS using the waterfall:'));
children.push(...codeBlock([
    'Revenue = previousRevenue × (1 + growthRate)     ← ALWAYS chains from prior period',
    'COGS = Revenue × cogsPercent',
    'Gross Profit = Revenue − COGS',
    'SG&A = Revenue × sgaPercent',
    'R&D = Revenue × rdPercent',
    'Depreciation = from PP&E schedule (passed in from circular resolver)',
    'Amortization = fixed amount from assumptions',
    'Other OpEx = Revenue × otherOpexPercent',
    'SBC = fixed amount from assumptions',
    'Total OpEx = SG&A + R&D + D&A + Other + SBC',
    'EBIT = Gross Profit − Total OpEx',
    'EBITDA = EBIT + Depreciation + Amortization',
    'Interest Income = from average cash balance (passed in)',
    'Interest Expense = from average debt balance (passed in)',
    'Other Income/Expense = from assumptions',
    'EBT = EBIT + Interest Income − Interest Expense + Other Income',
    'Tax = max(0, EBT × taxRate)',
    'Net Income = EBT − Tax',
    'EPS = Net Income / Shares Outstanding',
]));
children.push(para('Also supports VAT memo fields for Egyptian market: revenueInclVAT, revenueExclVAT, vatCollected (only when enableVAT is true).'));
children.push(para('buildHistoricalIncomeStatements() constructs IS array from raw historical data arrays, computing growth rates from period-over-period changes.'));

children.push(heading2('4.2 Balance Sheet Engine (balance-sheet.ts)'));
children.push(para('calculateBalanceSheet(inputs) builds a single projected BS. Every item is derived from assumptions or the income statement:'));
children.push(makeTable(
    ['Balance Sheet Item', 'Calculation Formula'],
    [
        ['Accounts Receivable', 'Revenue × DSO / 365'],
        ['Inventory', 'COGS × DIO / 365'],
        ['Prepaid Expenses', 'Revenue × prepaidPercent'],
        ['Other Current Assets', 'Revenue × otherCAPercent'],
        ['Total Current Assets', 'Sum of Cash + AR + Inventory + Prepaid + OCA'],
        ['Gross PP&E', 'Prior Gross PP&E + CapEx (Revenue × capexPercent)'],
        ['Accumulated Depreciation', 'Prior Accum Dep + Current Depreciation'],
        ['Net PP&E', 'Gross PP&E − Accumulated Depreciation'],
        ['Intangibles / Goodwill', 'From assumptions (fixed amounts)'],
        ['Other Long-Term Assets', 'Total Assets × otherLTAPercent'],
        ['Accounts Payable', 'COGS × DPO / 365'],
        ['Accrued Expenses', 'Revenue × accruedExpPercent'],
        ['Deferred Revenue', 'Revenue × deferredRevPercent'],
        ['Short-Term Debt', 'From assumptions'],
        ['Long-Term Debt', 'Prior LTD + Issuance − Repayment'],
        ['Deferred Tax Liabilities', 'Total Liabilities × deferredTaxLiabilityPercent'],
        ['Retained Earnings', 'Prior RE + Net Income − Dividends'],
        ['APIC', 'Prior APIC + SBC + Equity Issuance'],
        ['Treasury Stock', 'Prior Treasury − Share Repurchases'],
        ['Cash & Equivalents', 'PLUG → Total L+E − all other assets (ensures A = L+E)'],
    ],
    [30, 70],
));
children.push(importantBox('Cash is the balancing "plug" item: Cash = Total Liabilities + Equity − all other asset items. This guarantees the balance sheet always balances.'));

children.push(para('Helper functions provided:'));
children.push(bullet('calculateDepreciation(previousGrossPPE, capex, depreciationRate) — straight-line on gross PP&E'));
children.push(bullet('calculateInterestExpense(beginDebt, endDebt, interestRate) — based on average debt balance'));
children.push(bullet('calculateInterestIncome(beginCash, endCash, interestIncomeRate) — based on average cash balance'));

children.push(heading2('4.3 Cash Flow Statement Engine (cash-flow.ts) — Indirect Method'));
children.push(para('calculateCashFlow(inputs) derives the cash flow from the income statement and balance sheet changes:'));
children.push(...codeBlock([
    'OPERATING ACTIVITIES:',
    '  Net Income',
    '  + Depreciation & Amortization',
    '  + Stock-Based Compensation',
    '  + Deferred Tax Changes',
    '  + Working Capital Changes:',
    '    − Change in Accounts Receivable',
    '    − Change in Inventory',
    '    − Change in Prepaid Expenses',
    '    + Change in Accounts Payable',
    '    + Change in Accrued Expenses',
    '    + Change in Deferred Revenue',
    '  = Cash from Operations (CFO)',
    '',
    'INVESTING ACTIVITIES:',
    '  − Capital Expenditures',
    '  − Acquisitions',
    '  + Asset Sales',
    '  = Cash from Investing (CFI)',
    '',
    'FINANCING ACTIVITIES:',
    '  + Debt Issuance',
    '  − Debt Repayment',
    '  − Dividends Paid',
    '  + Equity Issuance',
    '  − Share Repurchases',
    '  = Cash from Financing (CFF)',
    '',
    'Net Change in Cash = CFO + CFI + CFF',
    'Free Cash Flow = CFO − CapEx',
    'Ending Cash = Beginning Cash + Net Change',
    'Reconciles? = |Ending Cash − BS Cash| < 0.01',
]));

children.push(heading2('4.4 Circular Resolver (circular-resolver.ts) — THE HEART OF THE ENGINE'));
children.push(importantBox('This module resolves the fundamental circular dependency in a 3-statement model: Interest ↔ Cash ↔ Cash Flow ↔ Net Income ↔ Interest'));
children.push(para('resolveCircularReferences(assumptions, yearIndex, prevIS, prevBS) operates as follows:'));
children.push(bullet('Starts with initial estimates: interestIncome = 0, interestExpense = 0'));
children.push(bullet('Iterates up to 100 times (configurable, tolerance = 0.01):'));
children.push(bullet('Calculate Depreciation from PP&E schedule', 1));
children.push(bullet('Calculate Interest Expense from average total debt balance', 1));
children.push(bullet('Calculate Interest Income from average cash balance', 1));
children.push(bullet('Build complete Income Statement with these inputs', 1));
children.push(bullet('Build complete Balance Sheet (cash = plug)', 1));
children.push(bullet('Build complete Cash Flow Statement', 1));
children.push(bullet('Check convergence: delta = |new interest values − old interest values|', 1));
children.push(bullet('If delta < tolerance → converged ✓, exit loop', 1));
children.push(bullet('Returns { incomeStatement, balanceSheet, cashFlow, converged, iterations, finalDelta }'));

children.push(heading3('16 Integration Checks (validateIntegration)'));
children.push(para('After convergence, the engine validates cross-statement consistency with 16 checks:'));
children.push(makeTable(
    ['#', 'Check Name', 'Validation Formula'],
    [
        ['1', 'Assets Balance', 'Total Assets = Total Liabilities + Equity'],
        ['2', 'Cash Ties to CF', 'CF Ending Cash ≈ BS Cash (within 0.01)'],
        ['3', 'Net Income Flows', 'IS Net Income = CF Net Income (starting point)'],
        ['4', 'PP&E Ties', 'Net PP&E = Gross PP&E − Accumulated Depreciation'],
        ['5', 'Retained Earnings Flow', 'RE = Prior RE + Net Income − Dividends'],
        ['6', 'Debt Ties', 'LTD = Prior LTD + Issuance − Repayment'],
        ['7', 'CF Reconciliation', 'Ending Cash = Beginning Cash + Net Change'],
        ['8', 'Working Capital Ties', 'Working Capital changes consistent with BS deltas'],
        ['9', 'Total Current Assets', 'Sum of individual CA items = TCA'],
        ['10', 'Total Non-Current Assets', 'Sum of individual NCA items = TNCA'],
        ['11', 'Total Current Liabilities', 'Sum of individual CL items = TCL'],
        ['12', 'Total Non-Current Liabilities', 'Sum of individual NCL items = TNCL'],
        ['13', 'Total Equity', 'Sum of equity components = Total Equity'],
        ['14', 'IS Waterfall', 'Revenue → COGS → Gross Profit → OpEx → EBIT → Tax → NI'],
        ['15', 'EBITDA Identity', 'EBITDA = EBIT + Depreciation + Amortization'],
        ['16', 'APIC Consistency', 'APIC = Prior APIC + SBC + Equity Issuance'],
    ],
    [8, 28, 64],
));

children.push(heading2('4.5 Integrator (integrator.ts) — Master Orchestrator'));
children.push(para('runFullModel(assumptions, historicalInputs) is the top-level function that runs the entire model:'));
children.push(bullet('Step 1: Build historical Income Statements from raw data arrays'));
children.push(bullet('Step 2: Build historical Balance Sheets from raw data arrays'));
children.push(bullet('Step 3: Build historical Cash Flows from IS/BS period-over-period changes'));
children.push(bullet('Step 4: For each projection year (0 to projectionYears-1):'));
children.push(bullet('Get previous period IS and BS (historical for yr=0, prior projected otherwise)', 1));
children.push(bullet('Call resolveCircularReferences() for this year', 1));
children.push(bullet('Call validateIntegration() and store results', 1));
children.push(bullet('Track convergence statistics (total iterations, max delta)', 1));
children.push(bullet('Step 5: Combine historical + projected arrays'));
children.push(bullet('Step 6: Calculate financial ratios for all periods'));
children.push(bullet('Step 7: Return ModelResults { IS[], BS[], CF[], Ratios[], IntegrationChecks[], ConvergenceInfo }'));
children.push(para('getModelSummary(results) extracts key metrics: revenue, EBITDA, NI, EPS, FCF, total debt, cash, average growth, average margin, and convergence status.'));

// ── 5. RATIOS ───────────────────────────────────────────
children.push(pageBreak());
children.push(heading1('5. Financial Ratios (ratios.ts)'));
children.push(para('calculateFinancialRatios(is, bs, prevBS) computes 23 ratios using current-period IS and BS data with average balances where appropriate:'));
children.push(makeTable(
    ['Category', 'Ratios', 'Notes'],
    [
        ['Profitability', 'Gross Margin, Operating Margin, Net Margin, ROE, ROA, ROIC', 'ROE/ROA use average balances; ROIC = NOPAT / avg invested capital'],
        ['Liquidity', 'Current Ratio, Quick Ratio, Cash Ratio', 'Standard formulas'],
        ['Leverage', 'Debt-to-Equity, Debt-to-Assets, Interest Coverage', 'Total Debt = ST + LT + Current LTD; Coverage = EBIT/IntExp'],
        ['Efficiency', 'Asset Turnover, Inventory Turnover, Receivables Turnover, DSO, DIO, DPO, CCC', 'CCC = DSO + DIO − DPO'],
    ],
    [20, 45, 35],
));

// ── 6. ANALYSIS ─────────────────────────────────────────
children.push(heading1('6. Analysis Tools'));

children.push(heading2('6.1 Sensitivity Analysis (sensitivity.ts)'));
children.push(bullet('oneWaySensitivity(baseAssumptions, historicalInputs, variable, range, outputMetric) — Varies one assumption across a range of values, runs the full model for each, and returns the output metric values. Supports array assumptions (applies sampled value uniformly).'));
children.push(bullet('twoWaySensitivity(..., variable1, range1, variable2, range2, outputMetric) — Varies two assumptions simultaneously, produces an NxN matrix of output values.'));
children.push(bullet('generateRange(baseValue, steps, stepSize) — Generates a centered range: base ± steps × stepSize'));
children.push(bullet('Output metrics supported: revenue, ebitda, netIncome, eps, fcf, roe'));

children.push(heading2('6.2 Monte Carlo Simulation (monte-carlo.ts)'));
children.push(bullet('4 distribution types: Normal (Box-Muller transform), Uniform, Triangular, Lognormal'));
children.push(bullet('runMonteCarloSimulation() — Runs N iterations (default 10,000), sampling from configured distributions, perturbing assumptions, and capturing all output metrics. Failed iterations (convergence failures) are silently skipped.'));
children.push(bullet('Statistics computed: mean, median, standard deviation, p10, p25, p50, p75, p90, min, max'));
children.push(bullet('Default config: revenue growth rate (normal μ=7%, σ=3%), COGS% (normal μ=60%, σ=3%), interest rate (uniform 3%-8%). Output metrics: netIncome, fcf, eps.'));

children.push(heading2('6.3 Scenario Manager (scenario-manager.ts)'));
children.push(bullet("3 pre-defined scenarios: Base Case (moderate growth, stable margins), Optimistic (high growth, margin expansion), Conservative (slow growth, margin pressure)"));
children.push(bullet('CRUD operations: createScenario(), duplicateScenario(), updateScenarioAssumption() (supports nested paths like revenueGrowthRate[0]), deleteScenario()'));
children.push(bullet('compareScenarios() — Returns side-by-side comparison for all calculated scenarios: revenue, EBITDA, NI, EPS, FCF, total debt, cash, ROE'));

// ── 7. STATE ────────────────────────────────────────────
children.push(heading1('7. State Management (store.ts)'));
children.push(para('Zustand store with localStorage persistence via zustand/middleware/persist. 396 lines of code with 15+ actions:'));
children.push(makeTable(
    ['State Field', 'Description'],
    [
        ['companyName, ticker, industry, currency', 'Company metadata fields'],
        ['country, fiscalYearEnd, valuationDate', 'Localization and dating fields'],
        ['historicalInputs', 'Array-format historical data (engine format)'],
        ['historicalData[]', 'Per-year historical data objects (UI format)'],
        ['scenarios[]', 'All scenarios with their assumption sets and results'],
        ['activeScenarioId', 'Currently selected scenario UUID'],
        ['activeTab', 'Current navigation tab (15 possible values)'],
        ['isDarkMode', 'Dark mode toggle state'],
        ['undoStack[] / redoStack[]', 'Assumption change history for undo/redo'],
        ['errors[] / warnings[]', 'Current validation messages'],
    ],
    [35, 65],
));
children.push(emptyLine());
children.push(makeTable(
    ['Action', 'Description'],
    [
        ['setCompanyInfo()', 'Update company metadata (name, ticker, currency, country, fiscal year, valuation date)'],
        ['setHistoricalData(data)', 'Set per-year data + automatically convert to engine format'],
        ['updateAssumption(path, value)', 'Update any assumption; handles nested paths like revenueGrowthRate[0]'],
        ['addScenario() / deleteScenario()', 'Create or remove scenarios'],
        ['duplicateScenario(id, name)', 'Clone an existing scenario with a new name'],
        ['calculateModel()', 'Runs runFullModel() for the active scenario and stores results'],
        ['calculateAllScenarios()', 'Runs model for every scenario sequentially'],
        ['undo() / redo()', 'Assumption-level undo/redo with unlimited stack depth'],
        ['resetToDefaults()', 'Full state reset to demo company data'],
        ['setCountryPreset(preset)', 'Applies US / Egyptian / Custom tax, VAT, and depreciation defaults'],
        ['toggleDarkMode()', 'Toggle dark/light mode'],
        ['setActiveTab(tab)', 'Navigate to a different section'],
    ],
    [35, 65],
));

// ── 8. EXPORT ───────────────────────────────────────────
children.push(pageBreak());
children.push(heading1('8. Export Layer (lib/export/)'));

children.push(heading2('8.1 Excel Export (excel.ts) — 2,029 lines, 103 KB'));
children.push(importantBox('Generates a 9-tab Excel workbook where every single calculation cell contains a LIVE FORMULA — no hard-coded computed values.'));
children.push(makeTable(
    ['Tab Name', 'Content Description'],
    [
        ['Summary Dashboard', 'Scenario comparison matrix showing all scenarios side-by-side with key metrics'],
        ['Assumptions', '40+ assumption rows — these are the editable inputs that drive all other tabs'],
        ['Income Statement', 'Full Revenue → EPS waterfall with formulas referencing Assumptions tab'],
        ['Balance Sheet', 'Full Assets = Liabilities + Equity with Cash as a plug formula'],
        ['Cash Flow Statement', 'Indirect method CF with formulas referencing IS and BS tabs'],
        ['Ratios', 'Profitability, Liquidity, Leverage, Efficiency — all formula-driven from IS/BS'],
        ['Working Capital', 'DSO/DIO/DPO calculation + Net Working Capital schedule'],
        ['Depreciation Schedule', 'Gross PP&E rollforward, Accumulated Depreciation, Net PP&E'],
    ],
    [25, 75],
));
children.push(para('Key Excel features:'));
children.push(bullet('Historical vs Projected visual styling — historical columns have blue tint, vertical separator border'));
children.push(bullet('Back-computed assumptions — historical DSO, DIO, DPO are reverse-calculated from actual BS/IS data'));
children.push(bullet('Cash plug formula: Cash = Total L+E − AR − Inventory − Prepaid − OCA − Total NCA'));
children.push(bullet('Balance check row: IF(ABS(TotalAssets − TotalL&E) < 1, "✓ Balanced", "✗ Imbalanced")'));
children.push(bullet('CF reconciliation: IF(ABS(EndingCash − BS.Cash) < 0.01, "✓ Reconciles", "✗ Error")'));

children.push(heading2('8.2 PDF Export (pdf.ts) — 49 KB'));
children.push(bullet('Multi-page professional report with cover page (company name, ticker, industry, generation date)'));
children.push(bullet('Income Statement, Balance Sheet, Cash Flow tables rendered via jsPDF AutoTable'));
children.push(bullet('Ratio analysis section'));
children.push(bullet('Supports Egyptian locale with bilingual headers'));

children.push(heading2('8.3 CSV / JSON Export (csv-json.ts)'));
children.push(bullet('Plain data export in CSV and JSON formats for integration with external tools'));
children.push(bullet('Includes all statement data in structured format'));

// ── 9. I18N ─────────────────────────────────────────────
children.push(heading1('9. Internationalization & Egyptian Localization'));

children.push(heading2('9.1 Bilingual Labels (i18n/labels.ts)'));
children.push(para('80+ financial line items with English/Arabic label pairs covering Income Statement, Balance Sheet, Cash Flow, Ratios, and Egyptian-specific terms:'));
children.push(...codeBlock([
    "revenue:            { en: 'Revenue',              ar: 'الإيرادات' }",
    "accountsReceivable: { en: 'Accounts Receivable',  ar: 'المدينون' }",
    "netIncome:          { en: 'Net Income',            ar: 'صافي الربح' }",
    "vatRate:            { en: 'VAT Rate',              ar: 'معدل ضريبة القيمة المضافة' }",
    "corporateTaxRate:   { en: 'Corporate Tax Rate',    ar: 'معدل الضريبة على الشركات' }",
]));
children.push(para('getLabel(key, language) function retrieves the appropriate label with English fallback.'));

children.push(heading2('9.2 Egyptian Depreciation Schedules'));
children.push(para('Egyptian tax law prescribes specific depreciation rate ranges per asset class:'));
children.push(makeTable(
    ['Asset Class', 'Arabic Name', 'Min Rate', 'Max Rate', 'Typical Rate'],
    [
        ['Buildings', 'مباني', '2%', '5%', '4%'],
        ['Machinery', 'آلات', '7%', '10%', '8%'],
        ['Vehicles', 'مركبات', '12.5%', '25%', '20%'],
        ['Computers', 'حاسبات', '25%', '33%', '33%'],
        ['Furniture', 'أثاث', '10%', '20%', '15%'],
    ],
    [20, 20, 15, 15, 15],
));
children.push(para('calculateEgyptianBlendedRate(breakdown) computes a weighted-average depreciation rate from the asset-class mix.'));
children.push(para('Egyptian defaults: Corporate tax 22.5%, VAT 14%, Dividend withholding 10%.'));
children.push(para('Fiscal year presets: Calendar (January-December), Egyptian Government (July-June), Custom.'));

// ── 10. UTILS ───────────────────────────────────────────
children.push(heading1('10. Utility Functions (utils.ts)'));
children.push(makeTable(
    ['Function', 'Purpose'],
    [
        ['formatCurrency(value, currency, compact)', 'Multi-currency formatting. ALWAYS uses en-US locale to ensure English numerals (0-9), never Arabic (٠-٩). Supports compact mode ($1.2M, $340K).'],
        ['formatPercent(value, decimals)', 'Percentage formatting (e.g., "15.2%")'],
        ['formatNumber(value, decimals)', 'Number formatting with en-US locale'],
        ['formatEPS(value, currency)', 'EPS formatted with appropriate currency symbol'],
        ['colorForValue(value)', 'Returns CSS color: green (>0), red (<0), or neutral'],
        ['cn(...classes)', 'CSS class name joiner (filters falsy values)'],
    ],
    [35, 65],
));
children.push(para('Supported currencies: USD ($), EGP (E£), EUR (€), GBP (£), SAR (SR), AED (AED).'));

// ── 11. COMPONENTS ──────────────────────────────────────
children.push(pageBreak());
children.push(heading1('11. UI Components (21 total)'));

children.push(heading2('11.1 Core Pages'));
children.push(makeTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['Sidebar.tsx', '11.7 KB', 'Navigation (15 tabs), Calculate button, Export buttons (Excel/PDF/CSV/JSON), dark mode toggle'],
        ['Dashboard.tsx', '14.6 KB', 'KPI cards (Revenue, EBITDA, NI, EPS, FCF), Scenario comparison table with delta vs base case'],
        ['ModelPage.tsx', '7 KB', 'Assumptions editor — all 60+ fields organized in collapsible sections by category'],
        ['ValidationPage.tsx', '7.8 KB', 'Displays 80 integration checks (16 checks × 5 projection years) with pass/fail indicators'],
    ],
    [22, 10, 68],
));

children.push(heading2('11.2 Financial Statement Views'));
children.push(makeTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['IncomeStatementPage.tsx', '6.5 KB', 'Full IS table with historical columns (blue tint) and projected columns'],
        ['BalanceSheetPage.tsx', '7 KB', 'Assets, Liabilities, Equity sections with balance check indicator'],
        ['CashFlowPage.tsx', '7.1 KB', 'CFO/CFI/CFF sections with reconciliation indicator at bottom'],
    ],
    [28, 10, 62],
));

children.push(heading2('11.3 Supporting Schedules'));
children.push(makeTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['WorkingCapitalPage.tsx', '10.9 KB', 'DSO/DIO/DPO metrics, NWC build, NWC as % of Revenue analysis'],
        ['DepreciationPage.tsx', '8.2 KB', 'Gross PP&E rollforward, Egyptian asset-class mix sliders for blended rate'],
        ['DebtSchedulePage.tsx', '9.1 KB', 'Debt issuance/repayment timeline, beginning/ending balances, interest calc'],
    ],
    [28, 10, 62],
));

children.push(heading2('11.4 Analysis & Settings'));
children.push(makeTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['SensitivityPage.tsx', '6 KB', 'Tornado chart visualization + data table with one-way sensitivity results'],
        ['MonteCarloPage.tsx', '9.4 KB', 'Histogram visualization + comprehensive percentile statistics panel'],
        ['ScenariosPage.tsx', '5.7 KB', 'Scenario list with create / duplicate / delete actions'],
        ['ScenarioSelector.tsx', '5.8 KB', 'Quick scenario switcher component (used in sidebar or header)'],
        ['ScenarioComparisonModal.tsx', '12 KB', 'Full side-by-side scenario comparison modal with all key metrics'],
        ['CompanySettings.tsx', '3.2 KB', 'Company name, ticker, industry, currency, country, fiscal year editor'],
        ['EgyptianSettings.tsx', '8.7 KB', 'VAT toggle, tax rates, fiscal year preset, asset-class depreciation mix'],
        ['HistoricalImportPage.tsx', '12.3 KB', 'CSV file import with automatic column mapping and preview'],
    ],
    [28, 10, 62],
));

children.push(heading2('11.5 Charts'));
children.push(makeTable(
    ['Component', 'Size', 'Purpose'],
    [
        ['RevenueChart.tsx', '2.4 KB', 'Revenue bar chart built with Recharts, shows historical + projected'],
        ['MarginChart.tsx', '1.5 KB', 'Gross/Operating/Net margin line chart with period labels'],
    ],
    [22, 10, 68],
));

// ── 12. TABS ────────────────────────────────────────────
children.push(heading1('12. Navigation & Tab System'));
children.push(para("The app uses a 15-tab system controlled by the Zustand store's activeTab field:"));
children.push(...codeBlock([
    'dashboard → income → balance → cashflow → model →',
    'working-capital → depreciation → debt-schedule →',
    'scenarios → sensitivity → montecarlo →',
    'import → historicaldata → validation → company-settings',
]));
children.push(para('Each tab is rendered as a separate component in page.tsx based on the activeTab value. The Sidebar component provides navigation buttons with icons for each section.'));

// ── 13. DATA FLOW ───────────────────────────────────────
children.push(heading1('13. Data Flow Architecture'));
children.push(para('The system follows a clear input → engine → output pipeline:'));
children.push(heading3('Input Layer'));
children.push(bullet('Historical Data (2-3 years of actual financial data, entered manually or via CSV import)'));
children.push(bullet('Assumptions (60+ configurable parameters for projections)'));
children.push(bullet('Scenario Selection (Base / Optimistic / Conservative / Custom)'));
children.push(bullet('All state managed centrally in the Zustand store'));

children.push(heading3('Engine Layer'));
children.push(bullet('integrator.runFullModel() orchestrates the entire calculation'));
children.push(bullet('Builds historical IS/BS/CF from raw data'));
children.push(bullet('For each projection year: runs resolveCircularReferences() (up to 100 iterations per year)'));
children.push(bullet('Each iteration: IS → BS (cash=plug) → CF → check interest convergence'));
children.push(bullet('Validates integration with 16 cross-statement checks per year'));
children.push(bullet('Combines all periods and calculates 23 financial ratios'));

children.push(heading3('Output Layer'));
children.push(bullet('UI Components — Dashboard, statement views, schedule pages, analysis charts'));
children.push(bullet('Excel Export — 9-tab workbook with 100% live formulas (no hard-coded values)'));
children.push(bullet('PDF Export — Multi-page professional report'));
children.push(bullet('CSV/JSON Export — Raw data for external tools'));

children.push(heading3('Analysis Layer'));
children.push(bullet('Sensitivity Analysis — One-way and two-way parameter sweeps'));
children.push(bullet('Monte Carlo Simulation — 10,000 iterations with configurable distributions'));
children.push(bullet('Scenario Comparison — Side-by-side metric comparison across all scenarios'));

// ── 14. DESIGN DECISIONS ────────────────────────────────
children.push(pageBreak());
children.push(heading1('14. Key Design Decisions'));

children.push(heading3('1. Cash as Plug'));
children.push(para('Cash is the balancing item on the balance sheet: Cash = Total L+E − all other assets. This guarantees A = L+E always holds, which is critical for the iterative solver to work correctly.'));

children.push(heading3('2. Iterative Circular Resolution'));
children.push(para('The fundamental circular dependency (Interest → Net Income → Cash → CF → Interest) is resolved via iteration. The solver runs up to 100 rounds with a tolerance of 0.01 for interest values. This approach is simpler and more robust than algebraic solutions.'));

children.push(heading3('3. Revenue Chain'));
children.push(para('Revenue ALWAYS chains from previousRevenue × (1 + growthRate). There is no separate base for projections — the first projected year grows from the last historical revenue. This ensures consistency across the IS.'));

children.push(heading3('4. Average Balances for Interest'));
children.push(para('Interest expense = average(beginning, ending) total debt × interest rate. Interest income = average(beginning, ending) cash × interest income rate. This is standard financial modeling practice.'));

children.push(heading3('5. Back-Computed Historical Assumptions'));
children.push(para('For the Excel export, historical-period DSO, DIO, DPO, and other metrics are reverse-calculated from actual data. This allows every cell in the Excel to have a formula, even for historical periods.'));

children.push(heading3('6. Egyptian Localization'));
children.push(para('Full support for the Egyptian market: 22.5% corporate tax rate, 14% VAT, 5 asset-class depreciation with legal rate ranges, bilingual English/Arabic labels, and Egyptian government fiscal year (July-June) support.'));

children.push(heading3('7. Zustand + localStorage'));
children.push(para('State persists across browser refreshes via the zustand/middleware/persist module. Only essential fields are persisted (via partialize), while computed results and UI state are excluded.'));

// ── 15. LIMITATIONS ─────────────────────────────────────
children.push(heading1('15. Known Limitations'));
children.push(bullet('No multi-segment revenue breakdown (single top-line revenue only)'));
children.push(bullet('No DCF / terminal value / WACC valuation module'));
children.push(bullet('No automated import from financial data APIs (SEC EDGAR, Bloomberg, Capital IQ, etc.)'));
children.push(bullet('Single currency only — no foreign exchange conversion or multi-currency balance sheets'));
children.push(bullet('No user authentication or multi-user collaboration features'));
children.push(bullet('Monte Carlo runs synchronously on the main thread (may freeze UI for very large iteration counts)'));
children.push(bullet('Historical data limited to manual entry or CSV import — no database persistence'));
children.push(bullet('No audit trail or change logging for assumption modifications beyond undo/redo'));

// ════════════════════════════════════════════════════════
// CREATE AND SAVE DOCUMENT
// ════════════════════════════════════════════════════════

const document = new Document({
    title: '3-Statement Financial Model Engine — Complete Technical Overview',
    creator: 'Financial Model Engine',
    description: 'Complete technical overview of the 3-Statement Financial Model Engine',
    styles: {
        default: {
            document: {
                run: { font: 'Calibri', size: 20, color: C.text },
            },
            heading1: {
                run: { font: 'Calibri', size: 32, bold: true, color: C.primary },
                paragraph: { spacing: { before: 360, after: 120 } },
            },
            heading2: {
                run: { font: 'Calibri', size: 26, bold: true, color: C.primary },
                paragraph: { spacing: { before: 280, after: 80 } },
            },
            heading3: {
                run: { font: 'Calibri', size: 22, bold: true, color: C.accent },
                paragraph: { spacing: { before: 200, after: 60 } },
            },
        },
    },
    numbering: {
        config: [{
            reference: 'default-bullet',
            levels: [{
                level: 0,
                format: LevelFormat.BULLET,
                text: '•',
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            }, {
                level: 1,
                format: LevelFormat.BULLET,
                text: '◦',
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            }],
        }],
    },
    sections: [{
        properties: {
            page: {
                margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 }, // ~2cm
                size: { width: 11906, height: 16838 }, // A4
            },
        },
        headers: {
            default: new Header({
                children: [new Paragraph({
                    children: [new TextRun({
                        text: '3-Statement Financial Model Engine — Technical Overview',
                        size: 16, color: C.muted, font: 'Calibri', italics: true,
                    })],
                    alignment: AlignmentType.RIGHT,
                })],
            }),
        },
        footers: {
            default: new Footer({
                children: [new Paragraph({
                    children: [
                        new TextRun({ text: 'Page ', size: 16, color: C.muted, font: 'Calibri' }),
                        new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C.muted, font: 'Calibri' }),
                        new TextRun({ text: ' of ', size: 16, color: C.muted, font: 'Calibri' }),
                        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C.muted, font: 'Calibri' }),
                    ],
                    alignment: AlignmentType.CENTER,
                })],
            }),
        },
        children,
    }],
});

const buffer = await Packer.toBuffer(document);
const outPath = 'Engine_Overview.docx';
fs.writeFileSync(outPath, buffer);
console.log(`✓ Generated ${outPath} (${(buffer.byteLength / 1024).toFixed(0)} KB)`);
