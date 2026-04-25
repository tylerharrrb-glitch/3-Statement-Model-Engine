/**
 * Comprehensive Scenarios Tab verification: generates the Excel workbook
 * and validates that Scenarios tab values match engine for ALL 3 scenarios.
 *
 * Checks: Revenue, CFO, FCF, Ending Cash, Dividends Paid, CapEx, Net Income,
 *         CapEx%, DividendPayoutRatio, COGS%, SGA%, Tax Rate, and all
 *         engine-computed values.
 *
 * Run:  npx tsx scripts/verify-scenarios-tab-full.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';

function round(n: number, d = 4) { return Math.round(n * 10 ** d) / 10 ** d; }

async function main() {
    const hi = getDefaultHistoricalInputs();
    const scenarios = createDefaultScenarios();
    for (const s of scenarios) s.results = runFullModel(s.assumptions, hi);

    const base = scenarios.find(s => s.type === 'base')!;

    // Build workbook
    (globalThis as any).document = { createElement: () => ({ click() { }, href: '', download: '' }), body: { appendChild() { }, removeChild() { } } };
    (globalThis as any).URL = { createObjectURL: () => '', revokeObjectURL: () => { } };
    let capturedBuffer: Buffer | null = null;
    (globalThis as any).Blob = class FakeBlob { constructor(parts: any[]) { capturedBuffer = Buffer.from(parts[0]); } };
    const { exportToExcel } = await import('@/lib/export/excel');
    await exportToExcel(base.results!, base.assumptions, 'Test', scenarios, hi);
    if (!capturedBuffer) throw new Error('No buffer');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(capturedBuffer);

    const scenSheet = wb.getWorksheet('Scenarios')!;
    const nYears = base.results!.incomeStatements.length;
    const sd = (a: number, b: number) => b !== 0 ? a / b : 0;

    let allOk = true;

    /** Read a cell's numeric value, handling formula cells */
    function cellNum(cell: ExcelJS.Cell): number {
        const v = cell.value;
        if (typeof v === 'number') return v;
        if (v && typeof v === 'object' && 'result' in v) return typeof (v as any).result === 'number' ? (v as any).result : 0;
        return parseFloat(String(v)) || 0;
    }

    /** Find ALL rows with a given label */
    function findAllRows(label: string): number[] {
        const rows: number[] = [];
        scenSheet.eachRow((row, rn) => {
            if (String(row.getCell(1).value).trim() === label) rows.push(rn);
        });
        return rows;
    }

    /** Read values from a specific row */
    function readRowValues(rn: number): number[] {
        const vals: number[] = [];
        for (let c = 2; c <= nYears + 1; c++) vals.push(cellNum(scenSheet.getRow(rn).getCell(c)));
        return vals;
    }

    function compare(label: string, expected: number[], actual: number[], tolerance = 1): boolean {
        let ok = true;
        for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
            const diff = Math.abs(expected[i] - actual[i]);
            if (diff > tolerance) {
                ok = false;
                console.log(`    ❌ [${i}]: expected=${round(expected[i])} actual=${round(actual[i])} Δ=${round(diff)}`);
            }
        }
        return ok;
    }

    // The Scenarios sheet has 3 blocks: Base (block 0), Optimistic (block 1), Conservative (block 2)
    const scenarioOrder = [
        { scenario: scenarios.find(s => s.type === 'base')!, name: 'Base Case' },
        { scenario: scenarios.find(s => s.type === 'optimistic')!, name: 'Optimistic' },
        { scenario: scenarios.find(s => s.type === 'conservative')!, name: 'Conservative' },
    ];

    // Find all Revenue rows to determine block boundaries
    const revenueRows = findAllRows('Revenue');
    console.log(`Found ${revenueRows.length} "Revenue" rows: ${JSON.stringify(revenueRows)}`);

    // For each scenario block
    for (let blockIdx = 0; blockIdx < scenarioOrder.length; blockIdx++) {
        const { scenario, name } = scenarioOrder[blockIdx];
        const res = scenario.results!;
        const asm = scenario.assumptions;
        console.log(`\n═══════════════════════════════════════════`);
        console.log(`  ${name} (${scenario.type})`);
        console.log(`═══════════════════════════════════════════`);

        // Check key rows
        const checks: { label: string; expected: number[]; tolerance?: number }[] = [
            // Input assumption rows (derived from engine)
            { label: 'Revenue Growth Rate', expected: res.incomeStatements.map((is, i) => i === 0 ? 0 : sd(is.revenue - res.incomeStatements[i - 1].revenue, res.incomeStatements[i - 1].revenue)), tolerance: 0.005 },
            { label: 'COGS % of Revenue', expected: res.incomeStatements.map(is => sd(is.cogs, is.revenue)), tolerance: 0.005 },
            { label: 'SG&A % of Revenue', expected: res.incomeStatements.map(is => sd(is.sgaExpense, is.revenue)), tolerance: 0.005 },
            { label: 'R&D % of Revenue', expected: res.incomeStatements.map(is => sd(is.rdExpense, is.revenue)), tolerance: 0.005 },
            { label: 'Tax Rate', expected: res.incomeStatements.map(is => is.taxRate), tolerance: 0.005 },
            { label: 'CapEx % of Revenue', expected: res.balanceSheets.map((bs, i) => i === 0 ? 0 : sd(bs.grossPPE - res.balanceSheets[i - 1].grossPPE, res.incomeStatements[i]?.revenue ?? 1)), tolerance: 0.005 },
            { label: 'Dividend Payout Ratio', expected: res.incomeStatements.map((is, i) => { const ci = i - 1; if (ci >= 0 && ci < res.cashFlowStatements.length) { return is.netIncome !== 0 ? Math.abs(res.cashFlowStatements[ci].dividendsPaid) / is.netIncome : 0; } return 0; }), tolerance: 0.005 },

            // Engine-computed value rows
            { label: 'Interest Income (Computed)', expected: res.incomeStatements.map(is => is.interestIncome) },
            { label: 'Interest Expense (Computed)', expected: res.incomeStatements.map(is => is.interestExpense) },
            { label: 'Depreciation (Computed)', expected: res.incomeStatements.map(is => is.depreciation) },
            { label: 'Gross PP&E (Computed)', expected: res.balanceSheets.map(bs => bs.grossPPE) },
            { label: 'Long-Term Debt (Computed)', expected: res.balanceSheets.map(bs => bs.longTermDebt) },
            { label: 'Retained Earnings (Computed)', expected: res.balanceSheets.map(bs => bs.retainedEarnings) },
            { label: 'Dividends Paid (Computed)', expected: [0, ...res.cashFlowStatements.map(cf => cf.dividendsPaid)] },

            // Dashboard output metrics
            { label: 'Revenue', expected: res.incomeStatements.map(is => is.revenue) },
            { label: 'Net Income', expected: res.incomeStatements.map(is => is.netIncome) },
            { label: 'Cash from Operations', expected: [0, ...res.cashFlowStatements.map(cf => cf.cashFromOperations)] },
            { label: 'Free Cash Flow', expected: [0, ...res.cashFlowStatements.map(cf => cf.freeCashFlow)] },
            { label: 'Ending Cash', expected: [0, ...res.cashFlowStatements.map(cf => cf.endingCash)] },
            { label: 'Total Assets', expected: res.balanceSheets.map(bs => bs.totalAssets) },
            { label: 'Total Equity', expected: res.balanceSheets.map(bs => bs.totalEquity) },
        ];

        for (const check of checks) {
            const rows = findAllRows(check.label);
            // Pick the row from this scenario's block (blockIdx-th occurrence)
            if (blockIdx >= rows.length) {
                console.log(`  ⚠️  ${check.label}: only ${rows.length} rows found, need block ${blockIdx}`);
                allOk = false;
                continue;
            }
            const rn = rows[blockIdx];
            const actual = readRowValues(rn);
            const ok = compare(check.label, check.expected, actual, check.tolerance ?? 1);
            if (ok) {
                console.log(`  ✅  ${check.label} (row ${rn})`);
            } else {
                console.log(`  ❌  ${check.label} (row ${rn}) — MISMATCH`);
                allOk = false;
            }
        }

        // Convergence check
        console.log(`  ${res.convergenceInfo?.converged ? '✅' : '❌'}  Converged: ${res.convergenceInfo?.converged}, Iterations: ${res.convergenceInfo?.iterations}`);
        if (!res.convergenceInfo?.converged) allOk = false;
    }

    console.log('\n' + (allOk ? '🎉 ALL SCENARIOS TAB VALUES MATCH ENGINE!' : '⚠️ SOME VALUES MISMATCHED'));
    process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
