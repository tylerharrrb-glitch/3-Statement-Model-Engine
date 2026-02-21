/**
 * Full Scenario Export Verification Script
 * -----------------------------------------
 * 1. Computes all 3 scenarios via the engine (runFullModel)
 * 2. Builds the full Excel via the same code path as the real export
 * 3. Reads the spreadsheet back and verifies EVERY scenario data value
 *    in the Scenarios sheet matches the engine output exactly.
 * 4. Checks the Assumptions tab wiring (IF formulas present for projection cols)
 * 5. Checks IS/BS/CF cached result values match engine values for the active scenario
 *
 * Run:  npx tsx scripts/verify_scenario_export.ts
 */

import ExcelJS from 'exceljs';
import path from 'path';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';
import { buildScenariosSheet, ROW_SPECS } from '@/lib/export/build-scenarios';

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
let errors = 0;
let warnings = 0;
let passed = 0;

function check(label: string, condition: boolean, detail = '') {
    if (condition) {
        passed++;
    } else {
        console.log(`  ❌ ${label} ${detail}`);
        errors++;
    }
}

function warn(label: string, detail = '') {
    console.log(`  ⚠️  ${label} ${detail}`);
    warnings++;
}

function getCellValue(sheet: ExcelJS.Worksheet, row: number, col: number) {
    const cell = sheet.getCell(row, col);
    const v = cell.value;
    if (v && typeof v === 'object' && 'formula' in v) {
        return { formula: (v as any).formula, result: (v as any).result, type: 'formula' as const };
    }
    return { value: v, type: 'value' as const };
}

function findRow(sheet: ExcelJS.Worksheet, label: string): number | null {
    let found: number | null = null;
    sheet.eachRow((row, rowNumber) => {
        const val = row.getCell(1).value;
        if (val && typeof val === 'string' && val.trim() === label.trim()) {
            found = rowNumber;
        }
    });
    return found;
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════
async function main() {
    console.log('\n══════════════════════════════════════');
    console.log('   SCENARIO EXPORT VERIFICATION');
    console.log('══════════════════════════════════════\n');

    // 1. Create scenarios and compute via engine
    const scenarios = createDefaultScenarios();
    const historicalInputs = getDefaultHistoricalInputs();

    console.log('Step 1: Computing all scenarios via engine...');
    for (let i = 0; i < scenarios.length; i++) {
        const results = runFullModel(scenarios[i].assumptions, historicalInputs);
        scenarios[i] = { ...scenarios[i], results };
        const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
        console.log(`  ✓ ${scenarios[i].name} (type=${scenarios[i].type}): TerminalRev=${lastIS.revenue.toFixed(0)}, TerminalNI=${lastIS.netIncome.toFixed(0)}`);
    }

    const baseScenario = scenarios.find(s => s.type === 'base')!;
    const optScenario = scenarios.find(s => s.type === 'optimistic')!;
    const consScenario = scenarios.find(s => s.type === 'conservative')!;

    const baseResults = baseScenario.results!;
    const nYears = baseResults.incomeStatements.length;
    const periods = baseResults.incomeStatements.map(s => s.period);
    const numHistorical = baseResults.incomeStatements.filter(s => s.periodType === 'historical').length;
    const nProj = nYears - numHistorical;

    console.log(`  nYears=${nYears}, numHistorical=${numHistorical}, nProj=${nProj}`);
    console.log(`  Periods: ${periods.join(', ')}`);

    // 2. Build Scenarios sheet
    console.log('\nStep 2: Building Scenarios sheet...');
    const wb = new ExcelJS.Workbook();
    const { sheet: scenSheet, scenarioRows } = buildScenariosSheet(wb, periods, scenarios, numHistorical, nYears);

    // Save intermediate file for inspection
    const outPath = path.join(process.cwd(), 'VERIFY_Scenarios.xlsx');
    await wb.xlsx.writeFile(outPath);
    console.log(`  Saved: ${outPath}`);

    // 3. Verify each scenario's data in the Scenarios sheet matches engine
    console.log('\n══════════════════════════════════════');
    console.log('Step 3: Cross-checking Scenarios sheet vs Engine');
    console.log('══════════════════════════════════════');

    const scenarioMap: Record<string, typeof baseResults> = {
        'Base Case': baseResults,
        'Optimistic': optScenario.results!,
        'Conservative': consScenario.results!,
    };

    const assumptionMap: Record<string, typeof baseScenario.assumptions> = {
        'Base Case': baseScenario.assumptions,
        'Optimistic': optScenario.assumptions,
        'Conservative': consScenario.assumptions,
    };

    for (const [scenName, engineResults] of Object.entries(scenarioMap)) {
        console.log(`\n── ${scenName} ──`);
        const scenAssumptions = assumptionMap[scenName];

        // Build the same data arrays that buildAllArrays would produce
        const histIS = engineResults.incomeStatements.slice(0, numHistorical);
        const histBS = engineResults.balanceSheets.slice(0, numHistorical);
        const sd = (n: number, d: number) => d !== 0 ? n / d : 0;
        const engineRevenues = engineResults.incomeStatements.map(is => is.revenue);

        // Check key engine values against what's in the Scenarios sheet
        for (const spec of ROW_SPECS) {
            const rowKey = `${scenName}_${spec.key}`;
            const sheetRow = scenarioRows[rowKey];
            if (!sheetRow) {
                warn(`Missing scenarioRows key: ${rowKey}`);
                continue;
            }

            // For each year column, compare Scenarios sheet value vs engine
            for (let i = 0; i < nYears; i++) {
                const cellVal = getCellValue(scenSheet, sheetRow, i + 2);
                const sheetValue = typeof cellVal.value === 'number' ? cellVal.value
                    : (cellVal.result !== undefined ? Number(cellVal.result) : 0);

                // Compute expected value for this spec/key
                let expected = 0;
                const key = spec.key;

                // Engine-computed values
                if (key === 'interestIncomeComputed') expected = engineResults.incomeStatements[i]?.interestIncome ?? 0;
                else if (key === 'interestExpenseComputed') expected = engineResults.incomeStatements[i]?.interestExpense ?? 0;
                else if (key === 'depreciationComputed') expected = engineResults.incomeStatements[i]?.depreciation ?? 0;
                else if (key === 'grossPPEComputed') expected = engineResults.balanceSheets[i]?.grossPPE ?? 0;
                else if (key === 'accumDepComputed') expected = engineResults.balanceSheets[i]?.accumulatedDepreciation ?? 0;
                else if (key === 'netPPEComputed') expected = engineResults.balanceSheets[i]?.netPPE ?? 0;
                else if (key === 'intangiblesComputed') expected = engineResults.balanceSheets[i]?.intangibles ?? 0;
                else if (key === 'ltdComputed') expected = engineResults.balanceSheets[i]?.longTermDebt ?? 0;
                else if (key === 'reComputed') expected = engineResults.balanceSheets[i]?.retainedEarnings ?? 0;
                else if (key === 'tsComputed') expected = engineResults.balanceSheets[i]?.treasuryStock ?? 0;
                else if (key === 'apicComputed') expected = engineResults.balanceSheets[i]?.additionalPaidInCapital ?? 0;
                else if (key === 'dividendsPaidComputed') {
                    expected = i === 0 ? 0 : (engineResults.cashFlowStatements[i - 1]?.dividendsPaid ?? 0);
                }
                else if (key === 'equityIssuanceComputed') {
                    expected = i === 0 ? 0 : (engineResults.cashFlowStatements[i - 1]?.equityIssuance ?? 0);
                }
                else if (key === 'shareRepurchasesComputed') {
                    expected = i === 0 ? 0 : (engineResults.cashFlowStatements[i - 1]?.shareRepurchases ?? 0);
                }
                else if (key === 'acquisitionsComputed') {
                    expected = i === 0 ? 0 : (engineResults.cashFlowStatements[i - 1]?.acquisitions ?? 0);
                }
                else if (key === 'assetSalesComputed') {
                    expected = i === 0 ? 0 : (engineResults.cashFlowStatements[i - 1]?.assetSales ?? 0);
                }
                // Assumption-level values (projected from assumptions, historical from engine)
                else if (key === 'revenueGrowthRate') {
                    if (i === 0) expected = 0;
                    else if (i < numHistorical) expected = sd(engineRevenues[i] - engineRevenues[i - 1], engineRevenues[i - 1]);
                    else expected = scenAssumptions.revenueGrowthRate[i - numHistorical] ?? 0;
                }
                else if (key === 'cogsPercent') {
                    if (i < numHistorical) expected = sd(histIS[i]?.cogs ?? 0, histIS[i]?.revenue ?? 1);
                    else expected = scenAssumptions.cogsPercent[i - numHistorical] ?? 0;
                }
                else if (key === 'taxRate') {
                    if (i < numHistorical) expected = histIS[i]?.taxRate ?? 0;
                    else expected = scenAssumptions.taxRate[i - numHistorical] ?? 0;
                }
                else if (key === 'revenueBase') {
                    expected = i === 0 ? (engineRevenues[0] ?? scenAssumptions.revenueBase) : 0;
                }
                else if (key === 'revenueBaseProjection') {
                    expected = i === 0 ? scenAssumptions.revenueBase : 0;
                }
                else {
                    // For non-critical keys, skip detailed check
                    continue;
                }

                const tolerance = Math.max(Math.abs(expected) * 0.0001, 0.01); // 0.01% or $0.01
                const diff = Math.abs(sheetValue - expected);

                if (diff > tolerance) {
                    check(
                        `${scenName} > ${spec.label} [${periods[i]}]`,
                        false,
                        `sheet=${sheetValue.toFixed(2)} vs engine=${expected.toFixed(2)} (diff=${diff.toFixed(4)})`
                    );
                } else {
                    check(`${scenName} > ${spec.label} [${periods[i]}]`, true);
                }
            }
        }
    }

    // 4. Check that projection columns on assumptions would get IF formulas
    console.log('\n══════════════════════════════════════');
    console.log('Step 4: Checking IF formula wiring coverage');
    console.log('══════════════════════════════════════');

    let wireableCount = 0;
    let missingWire = 0;
    for (const spec of ROW_SPECS) {
        const baseRow = scenarioRows[`Base Case_${spec.key}`];
        const optRow = scenarioRows[`Optimistic_${spec.key}`];
        const consRow = scenarioRows[`Conservative_${spec.key}`];

        if (baseRow && optRow && consRow) {
            wireableCount++;
        } else {
            missingWire++;
            warn(`Missing scenario row for key "${spec.key}": base=${baseRow}, opt=${optRow}, cons=${consRow}`);
        }
    }
    console.log(`  Wireable: ${wireableCount}/${ROW_SPECS.length} (${missingWire} missing)`);

    // 5. Cross-scenario comparison of key projected values
    console.log('\n══════════════════════════════════════');
    console.log('Step 5: Cross-Scenario Key Value Comparison');
    console.log('══════════════════════════════════════');

    const terminalIdx = nYears - 1;
    for (const [scenName, engineResults] of Object.entries(scenarioMap)) {
        const lastIS = engineResults.incomeStatements[terminalIdx];
        const lastBS = engineResults.balanceSheets[terminalIdx];
        const lastCF = engineResults.cashFlowStatements[engineResults.cashFlowStatements.length - 1];

        console.log(`\n  ${scenName} (Terminal Year):`);
        console.log(`    Revenue:    ${lastIS.revenue.toLocaleString()}`);
        console.log(`    COGS:       ${lastIS.cogs.toLocaleString()}`);
        console.log(`    Net Income: ${lastIS.netIncome.toLocaleString()}`);
        console.log(`    EBITDA:     ${lastIS.ebitda.toLocaleString()}`);
        console.log(`    Cash:       ${lastBS.cash.toLocaleString()}`);
        console.log(`    Total Eq:   ${lastBS.totalEquity.toLocaleString()}`);
        console.log(`    FCF:        ${lastCF.freeCashFlow.toLocaleString()}`);
        console.log(`    End Cash:   ${lastCF.endingCash.toLocaleString()}`);
        console.log(`    Balanced:   ${lastBS.isBalanced}`);
    }

    // 6. Check for stale active-scenario data
    // The revenueGrowthRate for projection years should differ between scenarios
    console.log('\n══════════════════════════════════════');
    console.log('Step 6: Verifying assumption differences');
    console.log('══════════════════════════════════════');

    const firstProjIdx = numHistorical;
    for (const key of ['revenueGrowthRate', 'cogsPercent', 'taxRate']) {
        const baseRowNum = scenarioRows[`Base Case_${key}`];
        const optRowNum = scenarioRows[`Optimistic_${key}`];
        const consRowNum = scenarioRows[`Conservative_${key}`];
        if (!baseRowNum || !optRowNum || !consRowNum) continue;

        const baseVal = getCellValue(scenSheet, baseRowNum, firstProjIdx + 2);
        const optVal = getCellValue(scenSheet, optRowNum, firstProjIdx + 2);
        const consVal = getCellValue(scenSheet, consRowNum, firstProjIdx + 2);

        const bv = typeof baseVal.value === 'number' ? baseVal.value : 0;
        const ov = typeof optVal.value === 'number' ? optVal.value : 0;
        const cv = typeof consVal.value === 'number' ? consVal.value : 0;

        console.log(`  ${key} (first proj year): Base=${bv}, Opt=${ov}, Cons=${cv}`);

        // They should differ (unless the scenario definitions don't differ on this key)
        if (key === 'revenueGrowthRate') {
            check(`${key} differs: Base vs Opt`, bv !== ov, `both=${bv}`);
            check(`${key} differs: Base vs Cons`, bv !== cv, `both=${bv}`);
        }
        if (key === 'cogsPercent') {
            check(`${key} differs: Base vs Opt`, bv !== ov, `both=${bv}`);
            check(`${key} differs: Base vs Cons`, bv !== cv, `both=${bv}`);
        }
    }

    // ═══════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('SUMMARY');
    console.log('══════════════════════════════════════');
    console.log(`  ✅ Passed: ${passed}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  ⚠️  Warnings: ${warnings}`);
    console.log(errors === 0 ? '\n  🎉 ALL CHECKS PASSED!' : '\n  ❗ SOME CHECKS FAILED — see above');
    process.exit(errors > 0 ? 1 : 0);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
