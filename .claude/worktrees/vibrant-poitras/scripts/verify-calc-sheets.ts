// Lean verification: test buildCalcSheets without runFullModel
import ExcelJS from 'exceljs';
import { buildCalcSheets } from '@/lib/export/build-calc-sheets';
import type { ScenarioRowMap } from '@/lib/export/build-scenarios';

async function main() {
    console.log('=== Lean buildCalcSheets Verification ===\n');

    const workbook = new ExcelJS.Workbook();
    const nYears = 8; // 3 hist + 5 proj
    const numHistorical = 3;
    const periods = ['2021A', '2022A', '2023A', '2024E', '2025E', '2026E', '2027E', '2028E'];

    // Create minimal Scenarios sheet with input rows
    const scenSheet = workbook.addWorksheet('Scenarios');

    // Create IS and BS sheets with minimal rows
    const isSheet = workbook.addWorksheet('Income Statement');
    const bsSheet = workbook.addWorksheet('Balance Sheet');

    // Build mock IS rows — must match keys used in build-calc-sheets.ts
    const isRows: Record<string, number> = {};
    const IS_KEYS = ['revenue', 'cogs', 'grossProfit', 'sgaExpense', 'rdExpense', 'otherOpex', 'totalOpex',
        'ebit', 'interestIncome', 'interestExpense', 'otherIncomeExpense', 'ebt',
        'taxExpense', 'netIncome', 'depreciation', 'amortization', 'stockBasedComp', 'ebitda'];
    IS_KEYS.forEach((key, i) => { isRows[key] = i + 2; });

    // Build mock BS rows — must match keys used in build-calc-sheets.ts
    const bsRows: Record<string, number> = {};
    const BS_KEYS = ['cash', 'accountsReceivable', 'inventory', 'prepaidExpenses', 'otherCurrentAssets',
        'totalCurrentAssets', 'grossPPE', 'accumulatedDepreciation', 'netPPE', 'intangibles', 'goodwill',
        'otherLongTermAssets', 'totalAssets', 'accountsPayable', 'accruedExpenses',
        'deferredRevenue', 'shortTermDebt', 'currentPortionLTD', 'otherCurrentLiabilities',
        'totalCurrentLiabilities', 'longTermDebt', 'deferredTaxLiabilities',
        'otherLongTermLiabilities', 'totalLiabilities', 'commonStock', 'additionalPaidInCapital',
        'retainedEarnings', 'treasuryStock', 'otherComprehensiveIncome', 'totalEquity', 'totalLiabilitiesEquity',
        'balanceCheck'];
    BS_KEYS.forEach((key, i) => { bsRows[key] = i + 2; });

    // Build mock scenarioRows
    const scenarioRows: ScenarioRowMap = {};
    const INPUT_KEYS = [
        'revenueBase', 'revenueBaseProjection', 'revenueGrowthRate', 'cogsPercent',
        'sgaPercent', 'rdPercent', 'otherOpexPercent', 'taxRate', 'otherIncomeExpense',
        'sharesOutstanding', 'stockBasedCompAmount', 'dso', 'dio', 'dpo',
        'prepaidPercent', 'accruedExpPercent', 'deferredRevPercent',
        'capexPercent', 'depreciationRate', 'amortizationAmount',
        'interestRate', 'interestIncomeRate', 'shortTermDebtAmount',
        'longTermDebtIssuance', 'longTermDebtRepayment', 'currentPortionLTD',
        'dividendPayoutRatio', 'shareRepurchaseAmount', 'equityIssuance',
        'goodwill', 'otherCurrentAssets', 'otherLongTermAssets',
        'otherCurrentLiabilities', 'deferredTaxLiabilities', 'otherLongTermLiabilities',
        'commonStock', 'apic', 'oci',
        // Computed keys (needed for CF historical references)
        'acquisitionsComputed', 'assetSalesComputed', 'dividendsPaidComputed',
        'equityIssuanceComputed', 'shareRepurchasesComputed',
    ];

    let mockRow = 3;
    for (const scenName of ['Base Case', 'Optimistic', 'Conservative']) {
        for (const key of INPUT_KEYS) {
            scenarioRows[`${scenName}_${key}`] = mockRow;
            scenSheet.getCell(mockRow, 1).value = `${scenName} ${key}`;
            for (let yr = 0; yr < nYears; yr++) {
                scenSheet.getCell(mockRow, yr + 2).value = 0.1;
            }
            mockRow++;
        }
    }

    // Put historical values in IS/BS tabs
    for (let yr = 0; yr < numHistorical; yr++) {
        const c = yr + 2;
        IS_KEYS.forEach((key, i) => {
            isSheet.getCell(i + 2, c).value = 100000 * (yr + 1);
        });
        BS_KEYS.forEach((key, i) => {
            bsSheet.getCell(i + 2, c).value = 50000 * (yr + 1);
        });
    }

    // Mock allScenarios with null results
    const allScenarios = [
        { type: 'base', results: null },
        { type: 'optimistic', results: null },
        { type: 'conservative', results: null },
    ];

    console.log('Calling buildCalcSheets...');
    const result = buildCalcSheets({
        workbook,
        scenarioRows,
        isRows,
        bsRows,
        periods,
        numHistorical,
        nYears,
        allScenarios,
    });

    // Verify results
    console.log('\n=== Results ===');
    const checks = { pass: 0, fail: 0 };

    function check(label: string, condition: boolean) {
        if (condition) { checks.pass++; console.log(`  ✅ ${label}`); }
        else { checks.fail++; console.log(`  ❌ ${label}`); }
    }

    check('base CalcSheetInfo exists', !!result.base);
    check('optimistic CalcSheetInfo exists', !!result.optimistic);
    check('conservative CalcSheetInfo exists', !!result.conservative);

    check('base sheet name = _Calc_Base', result.base?.sheetName === '_Calc_Base');
    check('optimistic sheet name = _Calc_Opt', result.optimistic?.sheetName === '_Calc_Opt');
    check('conservative sheet name = _Calc_Con', result.conservative?.sheetName === '_Calc_Con');

    check('_Calc_Base worksheet exists', !!workbook.getWorksheet('_Calc_Base'));
    check('_Calc_Opt worksheet exists', !!workbook.getWorksheet('_Calc_Opt'));
    check('_Calc_Con worksheet exists', !!workbook.getWorksheet('_Calc_Con'));

    const baseWs = workbook.getWorksheet('_Calc_Base');
    check('_Calc_Base is hidden', baseWs?.state === 'hidden' || baseWs?.state === 'veryHidden');

    const baseRows = result.base?.rows;
    if (baseRows) {
        check('rows.revenue > 0', baseRows.revenue > 0);
        check('rows.netIncome > 0', baseRows.netIncome > 0);
        check('rows.cash > 0', baseRows.cash > 0);
        check('rows.totalAssets > 0', baseRows.totalAssets > 0);
        check('rows.totalEquity > 0', baseRows.totalEquity > 0);
        check('rows.cf_cfo > 0', baseRows.cf_cfo > 0);
        check('rows.cf_fcf > 0', baseRows.cf_fcf > 0);

        if (baseWs) {
            const projCol = numHistorical + 2;
            const revCell = baseWs.getCell(baseRows.revenue, projCol);
            const val = revCell.value;
            const hasFormula = val && typeof val === 'object' && 'formula' in val;
            check(`Revenue row ${baseRows.revenue} col ${projCol} has formula`, !!hasFormula);
            if (hasFormula) {
                console.log(`    Formula: ${(val as any).formula}`);
            }

            const niCell = baseWs.getCell(baseRows.netIncome, projCol);
            const niVal = niCell.value;
            const niHasFormula = niVal && typeof niVal === 'object' && 'formula' in niVal;
            check(`NetIncome row ${baseRows.netIncome} col ${projCol} has formula`, !!niHasFormula);
            if (niHasFormula) {
                console.log(`    Formula: ${(niVal as any).formula}`);
            }

            // Count total formula cells
            let formulaCount = 0;
            for (let r = 1; r <= 90; r++) {
                for (let c = 2; c <= nYears + 1; c++) {
                    const cell = baseWs.getCell(r, c);
                    const v = cell.value;
                    if (v && typeof v === 'object' && 'formula' in v) formulaCount++;
                }
            }
            check(`Total formula cells > 100 (got ${formulaCount})`, formulaCount > 100);
        }
    }

    await workbook.xlsx.writeFile('TEST_CalcSheets_Lean.xlsx');
    console.log(`\n  📁 Saved to: TEST_CalcSheets_Lean.xlsx`);

    console.log(`\n=== Summary: ${checks.pass} passed, ${checks.fail} failed ===`);
    process.exit(checks.fail > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('FATAL ERROR:', err);
    process.exit(1);
});
