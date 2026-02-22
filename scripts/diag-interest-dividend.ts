/**
 * Quick diagnostic: check what interestRate and dividendPayoutRatio
 * values actually get written to the Scenarios tab.
 * Run:  npx tsx scripts/diag-interest-dividend.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';

function cellNum(cell: ExcelJS.Cell): number {
    const v = cell.value;
    if (typeof v === 'number') return v;
    if (v && typeof v === 'object' && 'result' in v) return typeof (v as any).result === 'number' ? (v as any).result : 0;
    return parseFloat(String(v)) || 0;
}

async function main() {
    const hi = getDefaultHistoricalInputs();
    const scenarios = createDefaultScenarios();
    for (const s of scenarios) s.results = runFullModel(s.assumptions, hi);

    // Print assumption values
    for (const s of scenarios) {
        console.log(`\n${s.name}:`);
        console.log(`  interestRateOnDebt = [${s.assumptions.interestRateOnDebt.join(', ')}]`);
        console.log(`  interestRateOnCash = [${s.assumptions.interestRateOnCash.join(', ')}]`);
        console.log(`  dividendPayoutRatio = [${s.assumptions.dividendPayoutRatio.join(', ')}]`);
    }

    // Generate Excel
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

    // Check specific rows
    function findAllRows(label: string): number[] {
        const rows: number[] = [];
        scenSheet.eachRow((row, rn) => { if (String(row.getCell(1).value).trim() === label) rows.push(rn); });
        return rows;
    }
    function readRow(rn: number): string {
        const vals: number[] = [];
        for (let c = 2; c <= 8; c++) vals.push(cellNum(scenSheet.getRow(rn).getCell(c)));
        return vals.map(v => v.toFixed(4)).join(', ');
    }

    const labels = ['Interest Rate (on Debt)', 'Interest Income Rate (on Cash)', 'Dividend Payout Ratio'];
    for (const label of labels) {
        const rows = findAllRows(label);
        console.log(`\n"${label}" — found ${rows.length} rows: ${JSON.stringify(rows)}`);
        for (let i = 0; i < rows.length; i++) {
            const blockName = i === 0 ? 'Base' : i === 1 ? 'Optimistic' : 'Conservative';
            console.log(`  ${blockName} (row ${rows[i]}): ${readRow(rows[i])}`);
        }
    }

    // Also check Assumptions tab for these rows
    const aSheet = wb.getWorksheet('Assumptions')!;
    console.log('\n=== Assumptions Tab ===');
    const aLabels = ['Interest Rate on Debt', 'Interest Rate', 'Interest Income Rate', 'Dividend Payout'];
    aSheet.eachRow((row, rn) => {
        const label = String(row.getCell(1).value).trim();
        if (aLabels.some(l => label.includes(l))) {
            const vals: string[] = [];
            for (let c = 2; c <= 8; c++) {
                const v = row.getCell(c).value;
                if (v && typeof v === 'object' && 'formula' in v) {
                    vals.push(`formula:${(v as any).result?.toFixed(4) ?? '?'}`);
                } else if (typeof v === 'number') {
                    vals.push(v.toFixed(4));
                } else {
                    vals.push(String(v));
                }
            }
            console.log(`  Row ${rn} "${label}": ${vals.join(', ')}`);
        }
    });
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
