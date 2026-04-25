// CLI script to test Excel export with calc sheets
import { runFullModel } from '@/lib/engines/integrator';
import { getScenarioAssumptions, SCENARIOS, ScenarioEnum } from '@/lib/scenarios';
import { DEFAULT_ASSUMPTIONS } from '@/types/assumptions';
import type { Scenario } from '@/types/scenario';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';

// We need to replicate what exportToExcel does, but for file output
// Import the actual build functions
import { buildScenariosSheet, ROW_SPECS } from '@/lib/export/build-scenarios';
import { buildCalcSheets } from '@/lib/export/build-calc-sheets';

async function main() {
    console.log('=== CLI Export Test — Calc Sheets ===');

    // Build base assumptions
    const baseAssumptions = { ...DEFAULT_ASSUMPTIONS };

    // Create historical inputs (minimal for test)
    const historicalInputs = {
        revenue: [800000, 1000000, 1200000],
        cogs: [400000, 500000, 600000],
        sga: [120000, 150000, 180000],
        rd: [40000, 50000, 60000],
        otherOpex: [24000, 30000, 36000],
        da: [32000, 40000, 48000],
        interestExpense: [8000, 10000, 12000],
        interestIncome: [4000, 5000, 6000],
        otherIncomeExpense: [8000, 10000, 12000],
        taxRate: 0.25,
        historicalYears: 3,
        actualHistoricalYears: 3,
        periods: ['2021A', '2022A', '2023A'],
        cash: [200000, 230000, 270000],
        accountsReceivable: [80000, 100000, 120000],
        inventory: [60000, 75000, 90000],
        prepaidExpenses: [20000, 25000, 30000],
        otherCurrentAssets: [10000, 12000, 14000],
        grossPPE: [400000, 460000, 520000],
        accumulatedDepreciation: [120000, 160000, 208000],
        intangibles: [50000, 45000, 40000],
        goodwill: [100000, 100000, 100000],
        otherLongTermAssets: [30000, 35000, 40000],
        accountsPayable: [60000, 75000, 90000],
        accruedExpenses: [40000, 50000, 60000],
        deferredRevenue: [30000, 37500, 45000],
        shortTermDebt: [50000, 50000, 50000],
        currentPortionLTD: [20000, 20000, 20000],
        otherCurrentLiabilities: [15000, 18000, 21000],
        longTermDebt: [200000, 180000, 160000],
        deferredTaxLiabilities: [25000, 27000, 29000],
        otherLongTermLiabilities: [15000, 17000, 19000],
        commonStock: [10000, 10000, 10000],
        apic: [150000, 155000, 160000],
        retainedEarnings: [145000, 193000, 252000],
        treasuryStock: [-30000, -35000, -40000],
        oci: [5000, 4000, 3000],
        sharesOutstanding: [100000, 100000, 100000],
        stockBasedComp: [10000, 12000, 14000],
    };

    // Run the full model for base case
    console.log('  Running Base Case model...');
    const baseResults = runFullModel(baseAssumptions, historicalInputs);
    console.log(`  → ${baseResults.incomeStatements.length} IS periods, ${baseResults.balanceSheets.length} BS periods`);

    const nYears = baseResults.incomeStatements.length;
    const periods = baseResults.incomeStatements.map(s => s.period);
    const numHistorical = baseResults.incomeStatements.filter(s => s.periodType === 'historical').length;

    // Build all 3 scenarios
    const allScenarios: Scenario[] = [];
    for (const [key, scenEnum] of [['base', ScenarioEnum.BASE], ['optimistic', ScenarioEnum.OPTIMISTIC], ['conservative', ScenarioEnum.CONSERVATIVE]] as const) {
        const assumptions = getScenarioAssumptions(baseAssumptions, scenEnum);
        const results = runFullModel(assumptions, historicalInputs);
        allScenarios.push({
            id: `test-${key}`,
            name: SCENARIOS[scenEnum].name,
            type: key,
            description: SCENARIOS[scenEnum].description,
            assumptions,
            results,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }

    console.log(`  Built ${allScenarios.length} scenarios`);

    // Create workbook
    const workbook = new ExcelJS.Workbook();

    // Build Scenarios sheet
    const { scenarioRows } = buildScenariosSheet(workbook, periods, allScenarios, numHistorical, nYears);
    console.log(`  scenarioRows keys: ${Object.keys(scenarioRows).length}`);

    // Build minimal IS and BS sheets (for row anchors)
    // For now just create them with basic structure
    const isSheet = workbook.addWorksheet('Income Statement');
    const bsSheet = workbook.addWorksheet('Balance Sheet');

    // Simplified IS row setup
    const isRows: Record<string, number> = {};
    const isRowKeys = ['revenue', 'cogs', 'grossProfit', 'sga', 'rd', 'otherOpex', 'totalOpex',
        'ebit', 'interestIncome', 'interestExpense', 'otherIncomeExpense', 'ebt',
        'taxExpense', 'netIncome', 'depreciation', 'amortization', 'sbc', 'ebitda'];
    isRowKeys.forEach((key, i) => {
        isRows[key] = i + 2; // Start at row 2
        isSheet.getCell(i + 2, 1).value = key;
    });

    // Simplified BS row setup
    const bsRows: Record<string, number> = {};
    const bsRowKeys = ['cash', 'accountsReceivable', 'inventory', 'prepaidExpenses', 'otherCurrentAssets',
        'totalCurrentAssets', 'grossPPE', 'accumDep', 'netPPE', 'intangibles', 'goodwill',
        'otherLongTermAssets', 'totalAssets', 'accountsPayable', 'accruedExpenses',
        'deferredRevenue', 'shortTermDebt', 'currentPortionLTD', 'otherCurrentLiabilities',
        'totalCurrentLiabilities', 'longTermDebt', 'deferredTaxLiabilities',
        'otherLongTermLiabilities', 'totalLiabilities', 'commonStock', 'apic',
        'retainedEarnings', 'treasuryStock', 'oci', 'totalEquity', 'totalLiabilitiesEquity',
        'balanceCheck'];
    bsRowKeys.forEach((key, i) => {
        bsRows[key] = i + 2; // Start at row 2
        bsSheet.getCell(i + 2, 1).value = key;
    });

    // Now build calc sheets!
    console.log('\n  Building calc sheets...');
    const calcSheets = buildCalcSheets({
        workbook,
        scenarioRows,
        isRows,
        bsRows,
        periods,
        numHistorical,
        nYears,
        allScenarios: allScenarios.map(s => ({ type: s.type, results: s.results })),
    });

    console.log('\n=== Calc Sheet Results ===');
    console.log(`  base: ${calcSheets.base ? `✅ sheet="${calcSheets.base.sheetName}" rows=${JSON.stringify(Object.keys(calcSheets.base.rows).length)}` : '❌'}`);
    console.log(`  optimistic: ${calcSheets.optimistic ? `✅ sheet="${calcSheets.optimistic.sheetName}" rows=${JSON.stringify(Object.keys(calcSheets.optimistic.rows).length)}` : '❌'}`);
    console.log(`  conservative: ${calcSheets.conservative ? `✅ sheet="${calcSheets.conservative.sheetName}" rows=${JSON.stringify(Object.keys(calcSheets.conservative.rows).length)}` : '❌'}`);

    if (calcSheets.base) {
        console.log(`\n  Base calc rows sample:`);
        const r = calcSheets.base.rows;
        console.log(`    revenue: ${r.revenue}, netIncome: ${r.netIncome}, cash: ${r.cash}`);
        console.log(`    totalAssets: ${r.totalAssets}, totalEquity: ${r.totalEquity}`);
        console.log(`    cf_cfo: ${r.cf_cfo}, cf_fcf: ${r.cf_fcf}`);
    }

    // Save the workbook
    const outPath = path.resolve('TEST_CalcSheets.xlsx');
    await workbook.xlsx.writeFile(outPath);
    console.log(`\n  📁 Saved to: ${outPath}`);

    // Verify by reading it back
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(outPath);
    console.log('\n=== Re-read Verification ===');
    wb2.worksheets.forEach(ws => {
        console.log(`  "${ws.name}" state=${ws.state}`);
    });

    for (const name of ['_Calc_Base', '_Calc_Opt', '_Calc_Con']) {
        const ws = wb2.getWorksheet(name);
        if (!ws) {
            console.log(`\n  ❌ ${name} NOT FOUND`);
            continue;
        }
        console.log(`\n  ✅ ${name}`);
        // Check first projected column (numHistorical+2)
        const projCol = numHistorical + 2;
        for (let r = 1; r <= Math.min(90, ws.rowCount); r++) {
            const labelCell = ws.getCell(r, 1);
            const dataCell = ws.getCell(r, projCol);
            const val = dataCell.value;
            const hasFormula = val && typeof val === 'object' && 'formula' in val;
            if (hasFormula) {
                console.log(`    Row ${r}: ${labelCell.value} => FORMULA: ${(val as any).formula.substring(0, 80)}`);
            } else if (String(labelCell.value ?? '').includes('──')) {
                console.log(`    Row ${r}: ${labelCell.value} (section header)`);
            }
        }
    }
}

main().catch(console.error);
