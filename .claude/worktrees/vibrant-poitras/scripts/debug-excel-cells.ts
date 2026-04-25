/**
 * Debug: check what the Assumptions tab cells actually contain.
 * Run:  npx tsx scripts/debug-excel-cells.ts
 */
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';
import type { Scenario } from '@/lib/scenario-manager';

async function main() {
    const hi = getDefaultHistoricalInputs();
    const scenarios = createDefaultScenarios();
    for (const s of scenarios) { s.results = runFullModel(s.assumptions, hi); }

    const base = scenarios.find(s => s.type === 'base')!;
    const results = base.results!;
    const assumptions = base.assumptions;

    // Stub browser APIs
    (globalThis as any).document = { createElement: () => ({ click() { }, href: '', download: '' }), body: { appendChild() { }, removeChild() { } } };
    (globalThis as any).URL = { createObjectURL: () => '', revokeObjectURL: () => { } };
    let capturedBuffer: Buffer | null = null;
    const origBlob = (globalThis as any).Blob;
    (globalThis as any).Blob = class FakeBlob { constructor(parts: any[]) { capturedBuffer = Buffer.from(parts[0]); } };

    const { exportToExcel } = await import('@/lib/export/excel');
    await exportToExcel(results, assumptions, 'Debug', scenarios, hi);
    (globalThis as any).Blob = origBlob;

    if (!capturedBuffer) throw new Error('No buffer');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(capturedBuffer);

    const aSheet = wb.getWorksheet('Assumptions')!;

    // Find Revenue Growth Rate row
    let growthRow = -1;
    aSheet.eachRow((row, rn) => {
        if (String(row.getCell(1).value).trim() === 'Revenue Growth Rate') growthRow = rn;
    });

    if (growthRow === -1) { console.error('Revenue Growth Rate row not found'); process.exit(1); }

    console.log(`Revenue Growth Rate is on row ${growthRow}`);
    const nCols = results.incomeStatements.length;
    for (let c = 2; c <= nCols + 1; c++) {
        const cell = aSheet.getRow(growthRow).getCell(c);
        console.log(`  Col ${c}: value=${JSON.stringify(cell.value)}, type=${typeof cell.value}, formula=${JSON.stringify((cell as any).formula)}, result=${JSON.stringify((cell as any).result)}`);
    }

    // Also check COGS %
    let cogsRow = -1;
    aSheet.eachRow((row, rn) => {
        if (String(row.getCell(1).value).trim() === 'COGS % of Revenue') cogsRow = rn;
    });
    console.log(`\nCOGS % of Revenue is on row ${cogsRow}`);
    for (let c = 2; c <= nCols + 1; c++) {
        const cell = aSheet.getRow(cogsRow).getCell(c);
        console.log(`  Col ${c}: value=${JSON.stringify(cell.value)}, type=${typeof cell.value}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });
