// Direct test of buildScenariosSheet with ts-node
// Run from project root: npx ts-node --transpile-only scripts/test_scenarios.ts

import ExcelJS from 'exceljs';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';
import { buildScenariosSheet, ROW_SPECS } from '@/lib/export/build-scenarios';
import path from 'path';

async function main() {
    // Create and compute all 3 scenarios
    const scenarios = createDefaultScenarios();
    const historicalInputs = getDefaultHistoricalInputs();

    for (let i = 0; i < scenarios.length; i++) {
        const results = runFullModel(scenarios[i].assumptions, historicalInputs);
        scenarios[i] = { ...scenarios[i], results };
        const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
        console.log(`✓ ${scenarios[i].name} (type=${scenarios[i].type}): Revenue=${lastIS.revenue.toFixed(0)}, NetIncome=${lastIS.netIncome.toFixed(0)}`);
    }

    // Build workbook + Scenarios sheet
    const wb = new ExcelJS.Workbook();
    const baseResults = scenarios[0].results!;
    const nYears = baseResults.incomeStatements.length;
    const periods = baseResults.incomeStatements.map(s => s.period);
    const numHistorical = baseResults.incomeStatements.filter(s => s.periodType === 'historical').length;

    console.log(`\nnYears=${nYears}, numHistorical=${numHistorical}, nProj=${nYears - numHistorical}`);
    console.log(`Periods: ${periods.join(', ')}`);

    const { sheet: scenSheet, scenarioRows } = buildScenariosSheet(wb, periods, scenarios, numHistorical, nYears);

    // Check scenario rows map
    const keys = Object.keys(scenarioRows);
    const baseKeys = keys.filter(k => k.startsWith('Base Case'));
    const optKeys = keys.filter(k => k.startsWith('Optimistic'));
    const consKeys = keys.filter(k => k.startsWith('Conservative'));
    console.log(`\nScenario rows map: ${keys.length} total`);
    console.log(`  Base Case: ${baseKeys.length} keys`);
    console.log(`  Optimistic: ${optKeys.length} keys`);
    console.log(`  Conservative: ${consKeys.length} keys`);

    // Check blocks in sheet
    console.log(`\nScenarios sheet rows: ${scenSheet.rowCount}`);
    for (let r = 1; r <= scenSheet.rowCount; r++) {
        const v = String(scenSheet.getCell(r, 1).value || '');
        if (v.includes('▎')) console.log(`  Block row ${r}: ${v}`);
    }

    // Save test file
    const outPath = path.join(process.env.USERPROFILE || '', 'Downloads', 'TEST_Scenarios.xlsx');
    await wb.xlsx.writeFile(outPath);
    console.log(`\nSaved: ${outPath}`);

    // Re-read and verify
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(outPath);
    const s2 = wb2.getWorksheet('Scenarios')!;
    let blockCount = 0;
    for (let r = 1; r <= s2.rowCount; r++) {
        const v = String(s2.getCell(r, 1).value || '');
        if (v.includes('▎')) {
            blockCount++;
            console.log(`  Verified block: ${v}`);
        }
    }
    console.log(`\n✓ Total blocks in saved file: ${blockCount}`);
    console.log(`✓ ROW_SPECS count: ${ROW_SPECS.length}`);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
