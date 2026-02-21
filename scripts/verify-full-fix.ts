/**
 * Comprehensive verification after scenario assumption update.
 * Checks:
 * 1. Engine output for all 3 scenarios (Revenue, COGS, SGA, CFO, Dividends, Ending Cash)
 * 2. Convergence for all 3 scenarios
 * 3. Excel Scenarios tab matches engine
 * 4. Spot-check tables for Optimistic and Conservative 2024E (first projected year = 2025E)
 * 
 * Run:  npx tsx scripts/verify-full-fix.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { getScenarioAssumptions, ScenarioEnum, SCENARIOS } from '@/lib/scenarios';
import { runFullModel } from '@/lib/engines/integrator';

function round(n: number, d = 2) { return Math.round(n * 10 ** d) / 10 ** d; }
function pct(n: number) { return (n * 100).toFixed(1) + '%'; }

async function main() {
    const hi = getDefaultHistoricalInputs();
    const baseAsm = getDefaultAssumptions();

    // ── 1. Print scenario assumptions from lib/scenarios.ts ──
    console.log('═══════════════════════════════════════════');
    console.log('  lib/scenarios.ts Assumption Overrides');
    console.log('═══════════════════════════════════════════');
    for (const [enumKey, def] of Object.entries(SCENARIOS)) {
        const a = def.assumptions as any;
        console.log(`\n  ${def.name} (${enumKey}):`);
        if (a.revenueGrowthRate) console.log(`    revenueGrowthRate: [${a.revenueGrowthRate.map(pct).join(', ')}]`);
        if (a.cogsPercent) console.log(`    cogsPercent:       [${a.cogsPercent.map(pct).join(', ')}]`);
        if (a.sgaPercent) console.log(`    sgaPercent:        [${a.sgaPercent.map(pct).join(', ')}]`);
        if (a.rdPercent) console.log(`    rdPercent:         [${a.rdPercent.map(pct).join(', ')}]`);
        if (a.capexPercent) console.log(`    capexPercent:      [${a.capexPercent.map(pct).join(', ')}]`);
    }

    // ── 2. Run engine for all 3 scenarios ──
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  Engine Results — All 3 Scenarios');
    console.log('═══════════════════════════════════════════');

    const scenarios = createDefaultScenarios();
    for (const s of scenarios) s.results = runFullModel(s.assumptions, hi);

    for (const s of scenarios) {
        const r = s.results!;
        const isArr = r.incomeStatements;
        const cfArr = r.cashFlowStatements;
        const bsArr = r.balanceSheets;

        console.log(`\n  ── ${s.name} ──`);
        console.log(`  Converged: ${r.convergenceInfo?.converged}, Iterations: ${r.convergenceInfo?.iterations}`);

        // Revenue trajectory
        console.log(`  Revenue:       ${isArr.map(is => Math.round(is.revenue)).join(' → ')}`);
        console.log(`  Net Income:    ${isArr.map(is => Math.round(is.netIncome)).join(' → ')}`);
        console.log(`  COGS%:         ${isArr.map(is => pct(is.cogs / is.revenue)).join(' → ')}`);
        console.log(`  SGA%:          ${isArr.map(is => pct(is.sgaExpense / is.revenue)).join(' → ')}`);
        console.log(`  R&D%:          ${isArr.map(is => pct(is.rdExpense / is.revenue)).join(' → ')}`);
        console.log(`  Tax Rate:      ${isArr.map(is => pct(is.taxRate)).join(' → ')}`);
        console.log(`  CFO:           [-, ${cfArr.map(cf => Math.round(cf.cashFromOperations)).join(', ')}]`);
        console.log(`  FCF:           [-, ${cfArr.map(cf => Math.round(cf.freeCashFlow)).join(', ')}]`);
        console.log(`  DivPaid:       [-, ${cfArr.map(cf => Math.round(cf.dividendsPaid)).join(', ')}]`);
        console.log(`  EndingCash:    [-, ${cfArr.map(cf => Math.round(cf.endingCash)).join(', ')}]`);
        console.log(`  CapEx:         [-, ${cfArr.map(cf => Math.round(cf.capex)).join(', ')}]`);
        console.log(`  TotalAssets:   ${bsArr.map(bs => Math.round(bs.totalAssets)).join(' → ')}`);
        console.log(`  TotalEquity:   ${bsArr.map(bs => Math.round(bs.totalEquity)).join(' → ')}`);
    }

    // ── 3. Spot-Check Tables ──
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  Spot-Check: First Projected Year (2025E)');
    console.log('═══════════════════════════════════════════');

    for (const s of scenarios.filter(s => s.type !== 'base')) {
        const r = s.results!;
        const projIdx = r.incomeStatements.findIndex(is => is.periodType === 'projected');
        if (projIdx === -1) continue;
        const is = r.incomeStatements[projIdx];
        const cf = r.cashFlowStatements[projIdx - 1]; // CF is offset by 1
        const bs = r.balanceSheets[projIdx];

        console.log(`\n  ${s.name} — ${is.period}:`);
        console.log(`    Revenue:          ${Math.round(is.revenue)}`);
        console.log(`    COGS:             ${Math.round(is.cogs)} (${pct(is.cogs / is.revenue)})`);
        console.log(`    SG&A:             ${Math.round(is.sgaExpense)} (${pct(is.sgaExpense / is.revenue)})`);
        console.log(`    R&D:              ${Math.round(is.rdExpense)} (${pct(is.rdExpense / is.revenue)})`);
        console.log(`    Interest Expense: ${Math.round(is.interestExpense)}`);
        console.log(`    Net Income:       ${Math.round(is.netIncome)}`);
        console.log(`    Dividends Paid:   ${Math.round(cf.dividendsPaid)}`);
        console.log(`    Ending Cash:      ${Math.round(cf.endingCash)}`);
        console.log(`    CFO:              ${Math.round(cf.cashFromOperations)}`);
        console.log(`    CapEx:            ${Math.round(cf.capex)}`);
    }

    // ── 4. Build Excel and verify Scenarios tab ──
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  Excel Scenarios Tab Verification');
    console.log('═══════════════════════════════════════════');

    (globalThis as any).document = { createElement: () => ({ click() { }, href: '', download: '' }), body: { appendChild() { }, removeChild() { } } };
    (globalThis as any).URL = { createObjectURL: () => '', revokeObjectURL: () => { } };
    let capturedBuffer: Buffer | null = null;
    (globalThis as any).Blob = class FakeBlob { constructor(parts: any[]) { capturedBuffer = Buffer.from(parts[0]); } };

    const base = scenarios.find(s => s.type === 'base')!;
    const { exportToExcel } = await import('@/lib/export/excel');
    await exportToExcel(base.results!, base.assumptions, 'Test', scenarios, hi);
    if (!capturedBuffer) throw new Error('No buffer');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(capturedBuffer);
    const scenSheet = wb.getWorksheet('Scenarios')!;
    const nYears = base.results!.incomeStatements.length;
    const sd = (a: number, b: number) => b !== 0 ? a / b : 0;

    function cellNum(cell: ExcelJS.Cell): number {
        const v = cell.value;
        if (typeof v === 'number') return v;
        if (v && typeof v === 'object' && 'result' in v) return typeof (v as any).result === 'number' ? (v as any).result : 0;
        return parseFloat(String(v)) || 0;
    }

    function findAllRows(label: string): number[] {
        const rows: number[] = [];
        scenSheet.eachRow((row, rn) => { if (String(row.getCell(1).value).trim() === label) rows.push(rn); });
        return rows;
    }

    function readRowValues(rn: number): number[] {
        const vals: number[] = [];
        for (let c = 2; c <= nYears + 1; c++) vals.push(cellNum(scenSheet.getRow(rn).getCell(c)));
        return vals;
    }

    let allOk = true;
    const scenOrder = [
        { s: scenarios.find(s => s.type === 'base')!, label: 'Base Case' },
        { s: scenarios.find(s => s.type === 'optimistic')!, label: 'Optimistic' },
        { s: scenarios.find(s => s.type === 'conservative')!, label: 'Conservative' },
    ];

    const checks = [
        'Revenue Growth Rate', 'COGS % of Revenue', 'SG&A % of Revenue',
        'R&D % of Revenue', 'Tax Rate', 'CapEx % of Revenue',
        'Dividend Payout Ratio',
        'Interest Income (Computed)', 'Interest Expense (Computed)',
        'Depreciation (Computed)', 'Gross PP&E (Computed)',
        'Long-Term Debt (Computed)', 'Retained Earnings (Computed)',
        'Dividends Paid (Computed)',
        'Revenue', 'Net Income',
        'Cash from Operations', 'Free Cash Flow', 'Ending Cash',
        'Total Assets', 'Total Equity',
    ];

    for (let blockIdx = 0; blockIdx < scenOrder.length; blockIdx++) {
        const { s, label } = scenOrder[blockIdx];
        const r = s.results!;
        console.log(`\n  ── ${label} ──`);

        const expectedMap: Record<string, number[]> = {
            'Revenue Growth Rate': r.incomeStatements.map((is, i) => i === 0 ? 0 : sd(is.revenue - r.incomeStatements[i - 1].revenue, r.incomeStatements[i - 1].revenue)),
            'COGS % of Revenue': r.incomeStatements.map(is => sd(is.cogs, is.revenue)),
            'SG&A % of Revenue': r.incomeStatements.map(is => sd(is.sgaExpense, is.revenue)),
            'R&D % of Revenue': r.incomeStatements.map(is => sd(is.rdExpense, is.revenue)),
            'Tax Rate': r.incomeStatements.map(is => is.taxRate),
            'CapEx % of Revenue': r.balanceSheets.map((bs, i) => i === 0 ? 0 : sd(bs.grossPPE - r.balanceSheets[i - 1].grossPPE, r.incomeStatements[i]?.revenue ?? 1)),
            'Dividend Payout Ratio': r.incomeStatements.map((is, i) => { if (i >= s.assumptions.historicalYears) { const projIdx = i - s.assumptions.historicalYears; return s.assumptions.dividendPayoutRatio[projIdx] ?? 0; } const ci = i - 1; if (ci >= 0 && ci < r.cashFlowStatements.length) return is.netIncome !== 0 ? Math.abs(r.cashFlowStatements[ci].dividendsPaid) / is.netIncome : 0; return 0; }),
            'Interest Income (Computed)': r.incomeStatements.map(is => is.interestIncome),
            'Interest Expense (Computed)': r.incomeStatements.map(is => is.interestExpense),
            'Depreciation (Computed)': r.incomeStatements.map(is => is.depreciation),
            'Gross PP&E (Computed)': r.balanceSheets.map(bs => bs.grossPPE),
            'Long-Term Debt (Computed)': r.balanceSheets.map(bs => bs.longTermDebt),
            'Retained Earnings (Computed)': r.balanceSheets.map(bs => bs.retainedEarnings),
            'Dividends Paid (Computed)': [0, ...r.cashFlowStatements.map(cf => cf.dividendsPaid)],
            'Revenue': r.incomeStatements.map(is => is.revenue),
            'Net Income': r.incomeStatements.map(is => is.netIncome),
            'Cash from Operations': [0, ...r.cashFlowStatements.map(cf => cf.cashFromOperations)],
            'Free Cash Flow': [0, ...r.cashFlowStatements.map(cf => cf.freeCashFlow)],
            'Ending Cash': [0, ...r.cashFlowStatements.map(cf => cf.endingCash)],
            'Total Assets': r.balanceSheets.map(bs => bs.totalAssets),
            'Total Equity': r.balanceSheets.map(bs => bs.totalEquity),
        };

        for (const checkLabel of checks) {
            const rows = findAllRows(checkLabel);
            if (blockIdx >= rows.length) {
                console.log(`    ⚠️  ${checkLabel}: not enough rows`);
                allOk = false;
                continue;
            }
            const actual = readRowValues(rows[blockIdx]);
            const expected = expectedMap[checkLabel];
            const tolerance = ['Revenue Growth Rate', 'COGS % of Revenue', 'SG&A % of Revenue', 'R&D % of Revenue', 'Tax Rate', 'CapEx % of Revenue', 'Dividend Payout Ratio'].includes(checkLabel) ? 0.005 : 2;
            let ok = true;
            for (let i = 0; i < Math.min(expected.length, actual.length); i++) {
                if (Math.abs(expected[i] - actual[i]) > tolerance) {
                    ok = false;
                    console.log(`    ❌ ${checkLabel} [${i}]: expected=${round(expected[i], 4)} actual=${round(actual[i], 4)}`);
                }
            }
            if (ok) console.log(`    ✅ ${checkLabel}`);
            else allOk = false;
        }
    }

    // ── 5. Integration checks ──
    console.log('\n\n═══════════════════════════════════════════');
    console.log('  Integration Checks');
    console.log('═══════════════════════════════════════════');
    for (const s of scenarios) {
        const checks = s.results!.integrationChecks;
        const allPass = checks.every(c => c.allPassed);
        console.log(`  ${allPass ? '✅' : '❌'} ${s.name}: ${allPass ? 'All passed' : 'FAILED'}`);
        if (!allPass) {
            allOk = false;
            checks.filter(c => !c.allPassed).forEach(c => c.details.filter(d => !d.passed).forEach(d => console.log(`      ✗ ${d.name}: ${d.message}`)));
        }
    }

    console.log('\n' + (allOk ? '🎉 ALL VERIFICATIONS PASSED!' : '⚠️ SOME VERIFICATIONS FAILED'));
    process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
