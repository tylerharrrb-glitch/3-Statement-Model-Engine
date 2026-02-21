#!/usr/bin/env npx tsx
// Diagnose tax rate discrepancy
import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';
import { getScenarioAssumptions, ScenarioEnum } from '@/lib/scenarios';
import * as path from 'path';

async function main() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(process.cwd(), 'Demo_Company_Inc__Financial_Model.xlsx'));
    const aSheet = wb.getWorksheet('Assumptions')!;

    const baseAssumptions = getDefaultAssumptions();
    const baseCaseAssumptions = getScenarioAssumptions(baseAssumptions, ScenarioEnum.BASE);
    const historicalInputs = getDefaultHistoricalInputs();
    const r = runFullModel(baseCaseAssumptions, historicalInputs);

    // Print Assumptions row 10 (tax rate)
    console.log('=== Assumptions Row 10 ===');
    const lbl = String(aSheet.getCell(10, 1).value ?? '');
    const vals: any[] = [];
    for (let c = 2; c <= 8; c++) {
        const v = aSheet.getCell(10, c).value;
        if (v && typeof v === 'object' && 'result' in v) vals.push((v as any).result);
        else vals.push(v);
    }
    console.log(`  ${lbl}: [${vals.join(', ')}]`);

    // What tax rate does the engine use?
    console.log('\n=== Engine Tax Rate ===');
    console.log('  baseCaseAssumptions.taxRate:', baseCaseAssumptions.taxRate);
    console.log('  effective tax rates:');
    for (let yr = 0; yr < r.incomeStatements.length; yr++) {
        const is = r.incomeStatements[yr];
        const effRate = is.ebt !== 0 ? is.taxExpense / is.ebt : 0;
        console.log(`    yr=${yr} period=${is.period}: ebt=${is.ebt.toFixed(2)} tax=${is.taxExpense.toFixed(2)} effRate=${(effRate * 100).toFixed(2)}%`);
    }

    // Check if engine computes tax differently
    console.log('\n=== Excel Tax Cached vs Manual EBT*taxRate ===');
    const isSheet = wb.getWorksheet('Income Statement')!;

    // Find EBT and Tax rows
    let ebtRow = -1, taxRow = -1;
    isSheet.eachRow((row, num) => {
        const l = String(row.getCell(1).value ?? '').trim();
        if (l === 'EBT') ebtRow = num;
        if (l === 'Tax Expense') taxRow = num;
    });

    for (let c = 2; c <= 8; c++) {
        const ebtV = isSheet.getCell(ebtRow, c).value;
        const taxV = isSheet.getCell(taxRow, c).value;
        const ebtCached = (ebtV && typeof ebtV === 'object' && 'result' in ebtV) ? (ebtV as any).result : ebtV;
        const taxCached = (taxV && typeof taxV === 'object' && 'result' in taxV) ? (taxV as any).result : taxV;
        const taxRateV = aSheet.getCell(10, c).value;
        const taxRate = (taxRateV && typeof taxRateV === 'object' && 'result' in taxRateV) ? (taxRateV as any).result : taxRateV;
        const manual = Math.max(0, Number(ebtCached) * Number(taxRate));
        console.log(`  Col ${c}: ebt=${Number(ebtCached).toFixed(2)} taxRate=${Number(taxRate).toFixed(4)} manual=${manual.toFixed(2)} cached=${Number(taxCached).toFixed(2)} engine=${r.incomeStatements[c - 2].taxExpense.toFixed(2)}`);
    }
}
main().catch(console.error);
