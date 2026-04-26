// Phase B audit — compare Excel exported cell values against engine compute.
//
// For each scenario × year × line, read the cell from the in-memory built
// workbook and compare to the engine's ModelResults value. Mismatches > 1
// EGP (or > 0.01% for ratios) are reported as FAIL with the cell address.
//
// Usage: npm run audit:sync
//        (defaults to fixtures/telecom-egypt.json so we audit against
//         the actual Telecom Egypt data, not Demo Co)
//
// Scope: read-only audit. Does NOT modify engine compute or exporter.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import type ExcelJS from 'exceljs';
import { runFullModel } from '../lib/engines/integrator';
import { buildWorkbook } from '../lib/export/excel';
import { createDefaultScenarios } from '../lib/scenario-manager';
import type { Scenario, ScenarioType } from '../types/scenario';
import { type AssumptionSet, type HistoricalInputs, getDefaultHistoricalInputs } from '../types/assumptions';
import type { IncomeStatement, BalanceSheet, CashFlowStatement, FinancialRatios } from '../types/financial';

const TOL_ABS = 1.0;       // EGP
const TOL_PCT = 0.0001;    // 1bp for ratios

// ── Fixture loading (same shape as run-export.ts) ───────────────────
interface FixtureFile {
    historicalInputs: HistoricalInputs;
    assumptions?: Partial<Record<ScenarioType, Partial<AssumptionSet>>>;
}

function loadFixture(p: string): FixtureFile {
    const root = path.resolve(__dirname, '..');
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    return JSON.parse(readFileSync(abs, 'utf-8')) as FixtureFile;
}

// ── Cell value extraction ────────────────────────────────────────────
// ExcelJS surfaces formula cells as { formula, result } and raw cells as
// the value itself. Pull a numeric value out of either form.
function cellNumber(cell: ExcelJS.Cell | undefined): number | null {
    if (!cell) return null;
    const v = cell.value as unknown;
    if (v == null) return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null) {
        const obj = v as { formula?: string; result?: unknown };
        if (typeof obj.result === 'number') return obj.result;
    }
    return null;
}

function colLetter(col: number): string {
    let s = '';
    let n = col;
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

// Find a row by exact label in column A, scanning rows 2..200
function findRowByLabel(ws: ExcelJS.Worksheet, label: string): number | null {
    for (let r = 2; r <= 200; r++) {
        const v = ws.getCell(r, 1).value;
        if (typeof v === 'string' && v === label) return r;
    }
    return null;
}

// ── Per-statement field maps ─────────────────────────────────────────
// Each entry: [Excel-sheet-row-label, ModelResult key path].
// Validated against actual labels in lib/export/excel.ts.

const IS_LINES: Array<[string, keyof IncomeStatement]> = [
    ['Revenue', 'revenue'],
    ['Cost of Goods Sold', 'cogs'],
    ['Gross Profit', 'grossProfit'],
    ['SG&A', 'sgaExpense'],
    ['R&D', 'rdExpense'],
    ['Depreciation', 'depreciation'],
    ['Amortization', 'amortization'],
    ['Other OpEx', 'otherOpex'],
    ['Stock-Based Comp', 'stockBasedComp'],
    ['Total OpEx', 'totalOpex'],
    ['EBIT', 'ebit'],
    ['EBITDA', 'ebitda'],
    ['Interest Income', 'interestIncome'],
    ['Interest Expense', 'interestExpense'],
    ['Other Income / Expense', 'otherIncomeExpense'],
    ['EBT', 'ebt'],
    ['Tax Expense', 'taxExpense'],
    ['Net Income', 'netIncome'],
];

const BS_LINES: Array<[string, keyof BalanceSheet]> = [
    ['Cash & Equivalents', 'cash'],
    ['Accounts Receivable', 'accountsReceivable'],
    ['Inventory', 'inventory'],
    ['Prepaid Expenses', 'prepaidExpenses'],
    ['Other Current Assets', 'otherCurrentAssets'],
    ['Total Current Assets', 'totalCurrentAssets'],
    ['Gross PP&E', 'grossPPE'],
    ['Accumulated Depreciation', 'accumulatedDepreciation'],
    ['Net PP&E', 'netPPE'],
    ['Intangibles', 'intangibles'],
    ['Goodwill', 'goodwill'],
    ['Other LT Assets', 'otherLongTermAssets'],
    ['Total Non-Current Assets', 'totalNonCurrentAssets'],
    ['Total Assets', 'totalAssets'],
    ['Accounts Payable', 'accountsPayable'],
    ['Accrued Expenses', 'accruedExpenses'],
    ['Short-Term Debt', 'shortTermDebt'],
    ['Current Portion LTD', 'currentPortionLTD'],
    ['Deferred Revenue', 'deferredRevenue'],
    ['Other Current Liabilities', 'otherCurrentLiabilities'],
    ['Total Current Liabilities', 'totalCurrentLiabilities'],
    ['Long-Term Debt', 'longTermDebt'],
    ['Deferred Tax Liabilities', 'deferredTaxLiabilities'],
    ['Other LT Liabilities', 'otherLongTermLiabilities'],
    ['Total Non-Current Liabilities', 'totalNonCurrentLiabilities'],
    ['Total Liabilities', 'totalLiabilities'],
    ['Common Stock', 'commonStock'],
    ['APIC', 'additionalPaidInCapital'],
    ['Retained Earnings', 'retainedEarnings'],
    ['Treasury Stock', 'treasuryStock'],
    ['Other Comprehensive Income', 'otherComprehensiveIncome'],
    ['Total Equity', 'totalEquity'],
    ['Total Liabilities + Equity', 'totalLiabilitiesEquity'],
];

const CF_LINES: Array<[string, keyof CashFlowStatement]> = [
    ['Net Income', 'netIncome'],
    ['Depreciation', 'depreciation'],
    ['Amortization', 'amortization'],
    ['Stock-Based Compensation', 'stockBasedComp'],
    ['Deferred Taxes', 'deferredTaxes'],
    ['Δ Other LT Liabilities', 'changeInOtherLTLiabilities'],
    ['Δ OCI (non-cash)', 'changeInOCI'],
    ['Δ End of Service Provision', 'endOfServiceProvisionAddition'],
    ['Change in A/R', 'changeInAR'],
    ['Change in Inventory', 'changeInInventory'],
    ['Change in Prepaid', 'changeInPrepaid'],
    ['Change in A/P', 'changeInAP'],
    ['Change in Accrued Exp', 'changeInAccruedExp'],
    ['Change in Deferred Rev', 'changeInDeferredRev'],
    ['Total WC Change', 'totalWorkingCapitalChange'],
    ['Cash from Operations', 'cashFromOperations'],
    ['Capital Expenditures', 'capex'],
    ['Purchase of Intangibles', 'purchaseOfIntangibles'],
    ['Δ Other LT Assets', 'changeInOtherLongTermAssets'],
    ['Cash from Investing', 'cashFromInvesting'],
    ['Debt Issuance', 'debtIssuance'],
    ['Debt Repayment', 'debtRepayment'],
    ['Dividends Paid', 'dividendsPaid'],
    ['Equity Issuance', 'equityIssuance'],
    ['Share Repurchases', 'shareRepurchases'],
    ['Cash from Financing', 'cashFromFinancing'],
    ['Net Change in Cash', 'netChangeInCash'],
    ['Beginning Cash', 'beginningCash'],
    ['Ending Cash', 'endingCash'],
];

const RATIO_LINES: Array<[string, keyof FinancialRatios]> = [
    ['Gross Margin', 'grossMargin'],
    ['Net Margin', 'netMargin'],
    ['ROE', 'roe'],
    ['ROIC (Net IC)', 'roic'],
    ['Current Ratio', 'currentRatio'],
];

// ── Audit core ───────────────────────────────────────────────────────
interface AuditFinding {
    sheet: string;
    label: string;
    period: string;
    addr: string;
    engine: number;
    excel: number | null;
    delta: number;
}

function auditStatement<T extends { period: string }>(
    ws: ExcelJS.Worksheet | undefined,
    sheetLabel: string,
    lines: Array<[string, keyof T]>,
    rows: T[],
    /** For CF: array starts at index 1 of IS/BS year sequence (no CF for first historical period). */
    cellColForPeriod: (period: string) => number | null,
    isRatio = false,
): { passed: number; total: number; findings: AuditFinding[] } {
    const findings: AuditFinding[] = [];
    let total = 0, passed = 0;

    if (!ws) {
        return { passed: 0, total: 0, findings: [{ sheet: sheetLabel, label: '(sheet missing)', period: '-', addr: '-', engine: NaN, excel: null, delta: NaN }] };
    }

    for (const [label, key] of lines) {
        const r = findRowByLabel(ws, label);
        if (r == null) {
            // Allow optional rows (CF intangibles/goodwill) silently
            continue;
        }
        for (const row of rows) {
            const colIdx = cellColForPeriod(row.period);
            if (colIdx == null) continue;
            const cell = ws.getCell(r, colIdx);
            const engineVal = (row as unknown as Record<string, number>)[key as string] ?? 0;
            const excelVal = cellNumber(cell);
            total++;
            const delta = excelVal == null ? NaN : Math.abs(engineVal - excelVal);
            const tol = isRatio ? TOL_PCT : TOL_ABS;
            const ok = excelVal != null && delta <= tol;
            if (ok) {
                passed++;
            } else {
                findings.push({
                    sheet: sheetLabel,
                    label,
                    period: row.period,
                    addr: `${colLetter(colIdx)}${r}`,
                    engine: engineVal,
                    excel: excelVal,
                    delta: isNaN(delta) ? NaN : delta,
                });
            }
        }
    }
    return { passed, total, findings };
}

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));

async function auditScenario(s: Scenario, all: Scenario[], hist: HistoricalInputs) {
    const wb = await buildWorkbook(s.results!, s.assumptions, 'Telecom Egypt', all, hist, null);
    const isWS = wb.getWorksheet('Income Statement');
    const bsWS = wb.getWorksheet('Balance Sheet');
    const cfWS = wb.getWorksheet('Cash Flow Statement');
    const rWS = wb.getWorksheet('Ratios');

    // IS/BS: column B = first period (index 0), so col = i+2.
    const isPeriods = s.results!.incomeStatements.map(p => p.period);
    const isColFor = (period: string): number | null => {
        const i = isPeriods.indexOf(period);
        return i < 0 ? null : i + 2;
    };
    // CF: starts at index 1 of IS sequence (no CF for first historical period).
    const cfPeriods = s.results!.cashFlowStatements.map(p => p.period);
    const cfColFor = (period: string): number | null => {
        const i = cfPeriods.indexOf(period);
        return i < 0 ? null : i + 2;
    };

    const isAudit = auditStatement(isWS, 'Income Statement', IS_LINES, s.results!.incomeStatements, isColFor);
    const bsAudit = auditStatement(bsWS, 'Balance Sheet', BS_LINES, s.results!.balanceSheets, isColFor);
    const cfAudit = auditStatement(cfWS, 'Cash Flow', CF_LINES, s.results!.cashFlowStatements, cfColFor);
    const rAudit = auditStatement(rWS, 'Ratios', RATIO_LINES, s.results!.ratios, isColFor, true);

    return { isAudit, bsAudit, cfAudit, rAudit };
}

async function main() {
    const fixturePath = process.env.AUDIT_FIXTURE ?? 'fixtures/telecom-egypt.json';
    let hist: HistoricalInputs;
    let overrides: Partial<Record<ScenarioType, Partial<AssumptionSet>>> = {};
    try {
        const f = loadFixture(fixturePath);
        hist = f.historicalInputs;
        overrides = f.assumptions ?? {};
        console.log(`▶ Auditing against fixture: ${fixturePath}`);
    } catch (e) {
        console.warn(`fixture load failed (${(e as Error).message}); falling back to Demo defaults`);
        hist = getDefaultHistoricalInputs();
    }

    const scenarios = createDefaultScenarios();
    for (const s of scenarios) {
        const ov = overrides[s.type as ScenarioType];
        if (ov) s.assumptions = { ...s.assumptions, ...ov };
        s.results = runFullModel(s.assumptions, hist);
    }

    let grandTotal = 0, grandPassed = 0;
    const allFindings: AuditFinding[] = [];

    for (const s of scenarios) {
        const a = await auditScenario(s, scenarios, hist);
        const totals = [
            ['Income Statement', a.isAudit.passed, a.isAudit.total],
            ['Balance Sheet', a.bsAudit.passed, a.bsAudit.total],
            ['Cash Flow', a.cfAudit.passed, a.cfAudit.total],
            ['Ratios', a.rAudit.passed, a.rAudit.total],
        ] as Array<[string, number, number]>;

        console.log(`\n=== ${s.name} ===`);
        for (const [name, p, t] of totals) {
            const tag = p === t ? '✓' : '✗';
            console.log(`  ${name.padEnd(18)} ${p}/${t} ${tag}`);
            grandPassed += p;
            grandTotal += t;
        }
        const findings = [...a.isAudit.findings, ...a.bsAudit.findings, ...a.cfAudit.findings, ...a.rAudit.findings];
        for (const f of findings) {
            console.log(`    FAIL [${f.sheet}] ${f.label} ${f.period} (${f.addr}) — engine ${fmt(f.engine)} / excel ${fmt(f.excel)} (Δ ${fmt(f.delta)})`);
        }
        allFindings.push(...findings);
    }

    console.log(`\nTotal: ${grandPassed}/${grandTotal} ${grandPassed === grandTotal ? '✓ all sheets aligned' : '✗ mismatches present'}`);
    if (grandPassed !== grandTotal) {
        console.log(`\nMismatch breakdown by sheet:`);
        const bySheet: Record<string, number> = {};
        for (const f of allFindings) bySheet[f.sheet] = (bySheet[f.sheet] ?? 0) + 1;
        for (const [k, v] of Object.entries(bySheet)) console.log(`  ${k}: ${v} fail(s)`);
    }
    process.exit(grandPassed === grandTotal ? 0 : 1);
}

main().catch(err => {
    console.error('audit failed:', err);
    process.exit(2);
});
