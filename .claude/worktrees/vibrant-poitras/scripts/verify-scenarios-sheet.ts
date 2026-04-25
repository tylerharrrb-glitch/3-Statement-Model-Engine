/**
 * Verify all Revenue rows on the Scenarios sheet correspond to the correct scenario values.
 * Run:  npx tsx scripts/verify-scenarios-sheet.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';

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

    // Find ALL "Revenue" rows
    const revenueRows: { row: number; values: number[] }[] = [];
    scenSheet.eachRow((row, rn) => {
        if (String(row.getCell(1).value).trim() === 'Revenue') {
            const vals: number[] = [];
            for (let c = 2; c <= nYears + 1; c++) {
                const v = row.getCell(c).value;
                vals.push(typeof v === 'number' ? v : (v && typeof v === 'object' && 'result' in v ? (v as any).result : 0));
            }
            revenueRows.push({ row: rn, values: vals });
        }
    });

    console.log(`Found ${revenueRows.length} "Revenue" rows on Scenarios sheet:`);
    let allOk = true;

    // Expected: Base, Optimistic, Conservative (in that order)
    const expectedScenarios = [
        { name: 'Base Case', revs: base.results!.incomeStatements.map(is => Math.round(is.revenue)) },
        { name: 'Optimistic', revs: scenarios.find(s => s.type === 'optimistic')!.results!.incomeStatements.map(is => Math.round(is.revenue)) },
        { name: 'Conservative', revs: scenarios.find(s => s.type === 'conservative')!.results!.incomeStatements.map(is => Math.round(is.revenue)) },
    ];

    for (let i = 0; i < revenueRows.length && i < expectedScenarios.length; i++) {
        const actual = revenueRows[i].values.map(v => Math.round(v));
        const expected = expectedScenarios[i];
        const lastMatch = Math.abs(actual[actual.length - 1] - expected.revs[expected.revs.length - 1]) <= 1;
        console.log(`\n  Row ${revenueRows[i].row} → ${expected.name}:`);
        console.log(`    Engine:  ${expected.revs.join(', ')}`);
        console.log(`    Excel:   ${actual.join(', ')}`);
        console.log(`    ${lastMatch ? '✅ Match' : '❌ MISMATCH'}`);
        if (!lastMatch) allOk = false;
    }

    console.log('\n' + (allOk ? '🎉 ALL SCENARIOS SHEET REVENUE MATCHES!' : '⚠️ MISMATCH DETECTED'));
    process.exit(allOk ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
