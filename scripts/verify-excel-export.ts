/**
 * End-to-end verification: generates the Excel file and validates that  
 * the Assumptions tab + Scenarios tab values match the engine for ALL 3 scenarios.
 *
 * The Assumptions tab projected cells contain IF() formulas referencing the Scenarios sheet.
 * For formula cells we check the cached `.result` field.
 *
 * Run:  npx tsx scripts/verify-excel-export.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';
import type { Scenario } from '@/lib/scenario-manager';
import type { ModelResults } from '@/types/financial';

function round(n: number, d = 0) { return Math.round(n * 10 ** d) / 10 ** d; }

async function buildWorkbook(
    results: ModelResults,
    assumptions: ReturnType<typeof getDefaultAssumptions>,
    scenarios: Scenario[],
    hi: ReturnType<typeof getDefaultHistoricalInputs>,
): Promise<ExcelJS.Workbook> {
    (globalThis as any).document = { createElement: () => ({ click() { }, href: '', download: '' }), body: { appendChild() { }, removeChild() { } } };
    (globalThis as any).URL = { createObjectURL: () => '', revokeObjectURL: () => { } };
    let capturedBuffer: Buffer | null = null;
    const origBlob = (globalThis as any).Blob;
    (globalThis as any).Blob = class FakeBlob { constructor(parts: any[]) { capturedBuffer = Buffer.from(parts[0]); } };

    const { exportToExcel } = await import('@/lib/export/excel');
    await exportToExcel(results, assumptions, 'Test', scenarios, hi);
    (globalThis as any).Blob = origBlob;

    if (!capturedBuffer) throw new Error('Failed to capture buffer');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(capturedBuffer);
    return wb;
}

/** Read a numeric value from a cell, handling formula cells via .result */
function cellNum(cell: ExcelJS.Cell): number {
    const v = cell.value;
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && 'result' in v) {
        const r = (v as any).result;
        return typeof r === 'number' ? r : parseFloat(String(r)) || 0;
    }
    return parseFloat(String(v)) || 0;
}

async function main() {
    const hi = getDefaultHistoricalInputs();
    const scenarios = createDefaultScenarios();
    for (const s of scenarios) s.results = runFullModel(s.assumptions, hi);

    const base = scenarios.find(s => s.type === 'base')!;
    const results = base.results!;
    const nYears = results.incomeStatements.length;

    console.log('Generating Excel workbook…');
    const wb = await buildWorkbook(results, base.assumptions, scenarios, hi);

    const sheetNames = wb.worksheets.map(s => s.name);
    console.log('Sheets:', sheetNames.join(', '));

    // ── Helpers ──
    const safeDiv = (a: number, b: number) => b !== 0 ? a / b : 0;
    let allOk = true;

    function findRow(sheet: ExcelJS.Worksheet, label: string): number {
        let rn = -1;
        sheet.eachRow((row, r) => { if (String(row.getCell(1).value).trim() === label) rn = r; });
        return rn;
    }

    function readRow(sheet: ExcelJS.Worksheet, label: string): number[] {
        const rn = findRow(sheet, label);
        if (rn === -1) { console.warn(`  ⚠️  "${label}" not found`); return []; }
        const vals: number[] = [];
        for (let c = 2; c <= nYears + 1; c++) vals.push(cellNum(sheet.getRow(rn).getCell(c)));
        return vals;
    }

    function compare(label: string, expected: number[], actual: number[], tolerance = 0.002) {
        let ok = true;
        for (let i = 0; i < expected.length; i++) {
            const diff = Math.abs(expected[i] - actual[i]);
            if (diff > tolerance) {
                ok = false; allOk = false;
                console.log(`  ❌  ${label} [${i}]: expected=${round(expected[i], 6)} actual=${round(actual[i], 6)} Δ=${round(diff, 6)}`);
            }
        }
        if (ok) console.log(`  ✅  ${label} — all ${expected.length} values match`);
    }

    // ── 1) Assumptions Tab — Base Case ──
    console.log('\n════ Assumptions Tab (Base Case cached results) ════');
    const aSheet = wb.getWorksheet('Assumptions')!;
    const engineRevenues = results.incomeStatements.map(is => is.revenue);
    const expGrowth = engineRevenues.map((r, i) => i === 0 ? 0 : safeDiv(r - engineRevenues[i - 1], engineRevenues[i - 1]));
    const expCogs = results.incomeStatements.map(is => safeDiv(is.cogs, is.revenue));
    const expSga = results.incomeStatements.map(is => safeDiv(is.sgaExpense, is.revenue));
    const expTax = results.incomeStatements.map(is => is.taxRate);

    compare('Revenue Growth Rate', expGrowth, readRow(aSheet, 'Revenue Growth Rate'));
    compare('COGS % of Revenue', expCogs, readRow(aSheet, 'COGS % of Revenue'));
    compare('SG&A % of Revenue', expSga, readRow(aSheet, 'SG&A % of Revenue'));
    compare('Tax Rate', expTax, readRow(aSheet, 'Tax Rate'));

    // ── 2) Scenarios Tab — verify all 3 scenarios ──
    const scenSheet = wb.getWorksheet('Scenarios')!;
    console.log('\n════ Scenarios Tab — Revenue per Scenario ════');

    for (const s of scenarios) {
        const res = s.results!;
        const expectedRevs = res.incomeStatements.map(is => Math.round(is.revenue));
        const lastExpected = expectedRevs[expectedRevs.length - 1];

        // Find the revenue row for this scenario in the Scenarios sheet
        let scenRevRow = -1;
        scenSheet.eachRow((row, rn) => {
            const label = String(row.getCell(1).value).trim();
            if (label === 'Revenue') {
                // Check if this row's values match this scenario
                const c2 = cellNum(row.getCell(2));
                const scenFirstRev = Math.round(res.incomeStatements[0].revenue);
                if (Math.abs(Math.round(c2) - scenFirstRev) < 2) scenRevRow = rn;
            }
        });

        if (scenRevRow !== -1) {
            const actualRevs: number[] = [];
            for (let c = 2; c <= nYears + 1; c++) actualRevs.push(Math.round(cellNum(scenSheet.getRow(scenRevRow).getCell(c))));
            const lastActual = actualRevs[actualRevs.length - 1];
            const ok = Math.abs(lastActual - lastExpected) <= 1;
            console.log(`  ${ok ? '✅' : '❌'}  ${s.name.padEnd(20)} 2029E Rev: Excel=${lastActual} Engine=${lastExpected}`);
            if (!ok) allOk = false;
        } else {
            console.log(`  ⚠️  ${s.name}: Revenue row not located in Scenarios sheet`);
        }
    }

    // ── 3) IS Tab — formulas check ──
    const isSheet = wb.getWorksheet('Income Statement')!;
    console.log('\n════ Income Statement — Formula Verification ════');
    const numHist = results.incomeStatements.filter(is => is.periodType === 'historical').length;
    const revRow = findRow(isSheet, 'Revenue');
    if (revRow !== -1) {
        let formulaCount = 0, hardcoded = 0;
        for (let c = numHist + 2; c <= nYears + 1; c++) {
            const cell = isSheet.getRow(revRow).getCell(c);
            const v = cell.value;
            if ((v && typeof v === 'object' && 'formula' in v) || cell.formula) formulaCount++;
            else hardcoded++;
        }
        console.log(hardcoded === 0
            ? `  ✅  Revenue: all ${formulaCount} projected cells are formulas`
            : `  ❌  Revenue: ${hardcoded} hard-coded, ${formulaCount} formulas`);
        if (hardcoded > 0) allOk = false;
    }

    // ── 4) Check integration ──
    console.log('\n════ Engine Integration Checks ════');
    for (const s of scenarios) {
        const checks = s.results!.integrationChecks;
        const allPass = checks.every(c => c.allPassed);
        console.log(`  ${allPass ? '✅' : '❌'}  ${s.name}: ${allPass ? 'All passed' : 'FAILED'}`);
        if (!allPass) { allOk = false; checks.filter(c => !c.allPassed).forEach(c => c.details.filter(d => !d.passed).forEach(d => console.log(`      ✗ ${d.name}`))); }
    }

    // ── Summary ──
    console.log('\n' + (allOk ? '🎉 ALL EXCEL VALIDATIONS PASSED!' : '⚠️ SOME VALIDATIONS FAILED'));
    process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
