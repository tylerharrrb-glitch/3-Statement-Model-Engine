/**
 * Headless Full Export Test
 * ─────────────────────────
 * Builds the COMPLETE Excel workbook (all tabs, all wiring) in Node.js
 * then reads it back and verifies the IF formula wiring.
 *
 * This mirrors the exportToExcel() flow but stays Node-friendly.
 *
 * Run: npx tsx scripts/test_full_export.ts
 */
import ExcelJS from 'exceljs';
import path from 'path';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';
import { buildScenariosSheet, ROW_SPECS } from '@/lib/export/build-scenarios';
import { buildCompanyInfoSheet } from '@/lib/export/build-company-info';
import { buildDashboardSheet } from '@/lib/export/build-dashboard';
import type { ScenarioRowMap } from '@/lib/export/build-scenarios';
import { getScenarioAssumptions, SCENARIOS, ScenarioEnum } from '@/lib/scenarios';

// ═══════════════════════════════════════
// HELPERS (copied from excel.ts)
// ═══════════════════════════════════════
const NUM_FMT = '#,##0';
const PCT_FMT = '0.0%';

function colLetter(col: number): string {
    let s = '';
    let c = col;
    while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
    return s;
}

function styleRow(row: ExcelJS.Row, opts: { input?: boolean; bold?: boolean; subheader?: boolean; numFmt?: string }) {
    const nf = opts.numFmt ?? NUM_FMT;
    row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Calibri', size: 10, bold: opts.bold || opts.subheader };
        if (colNumber > 1) cell.numFmt = nf;
    });
}

function styleHeader(sheet: ExcelJS.Worksheet) {
    const r = sheet.getRow(1);
    r.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
}

let errors = 0;
let passed = 0;
let warnings = 0;

function check(label: string, ok: boolean, detail = '') {
    if (ok) { passed++; } else { console.log(`  ❌ ${label} ${detail}`); errors++; }
}

function warn(label: string, detail = '') {
    console.log(`  ⚠️  ${label} ${detail}`); warnings++;
}

async function main() {
    console.log('\n══════════════════════════════════════');
    console.log('  HEADLESS FULL EXPORT VERIFICATION');
    console.log('══════════════════════════════════════\n');

    // 1. Create and compute scenarios
    const scenarios = createDefaultScenarios();
    const historicalInputs = getDefaultHistoricalInputs();


    for (let i = 0; i < scenarios.length; i++) {
        scenarios[i] = { ...scenarios[i], results: runFullModel(scenarios[i].assumptions, historicalInputs) };
        const r = scenarios[i].results!;
        console.log(`  ✓ ${scenarios[i].name} computed: Rev=${r.incomeStatements[r.incomeStatements.length - 1].revenue.toFixed(0)}`);
    }

    const baseScenario = scenarios.find(s => s.type === 'base')!;
    const results = baseScenario.results!;
    const assumptions = baseScenario.assumptions;
    const nYears = results.incomeStatements.length;
    const periods = results.incomeStatements.map(s => s.period);
    const numHistorical = results.incomeStatements.filter(s => s.periodType === 'historical').length;
    const nProj = nYears - numHistorical;

    // 2. Build the workbook — mimicking exportToExcel
    const workbook = new ExcelJS.Workbook();
    workbook.calcProperties = { fullCalcOnLoad: true } as ExcelJS.CalculationProperties;

    // Company Info
    buildCompanyInfoSheet(workbook, 'TestCo');

    // Scenarios
    const { scenarioRows } = buildScenariosSheet(workbook, periods, scenarios, numHistorical, nYears);

    // Assumptions
    const aSheet = workbook.addWorksheet('Assumptions');
    aSheet.getColumn(1).width = 32;
    for (let i = 0; i < nYears; i++) aSheet.getColumn(i + 2).width = 16;
    aSheet.getCell(1, 1).value = 'Assumption';
    for (let i = 0; i < nYears; i++) aSheet.getCell(1, i + 2).value = periods[i];
    styleHeader(aSheet);

    const aRows: Record<string, number> = {};
    let aRow = 2;

    function addAssumptionRow(label: string, key: string, values: number[], fmt: string = NUM_FMT) {
        aRows[key] = aRow;
        aSheet.getCell(aRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            aSheet.getCell(aRow, i + 2).value = values[i] ?? 0;
        }
        styleRow(aSheet.getRow(aRow), { input: true, numFmt: fmt });
        aRow++;
    }

    // Back-compute historical values (same as excel.ts)
    const histIS = results.incomeStatements.slice(0, numHistorical);
    const histBS = results.balanceSheets.slice(0, numHistorical);
    const sd = (a: number, b: number) => b !== 0 ? a / b : 0;
    const engineRevenues = results.incomeStatements.map(is => is.revenue);

    const allRevenueGrowth = engineRevenues.map((rev, i) => {
        if (i === 0) return 0;
        if (i < numHistorical) return sd(rev - engineRevenues[i - 1], engineRevenues[i - 1]);
        return assumptions.revenueGrowthRate[i - numHistorical] ?? 0;
    });

    aSheet.getCell(aRow, 1).value = '── Income Statement Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    aRows['revenueBase'] = aRow;
    aSheet.getCell(aRow, 1).value = 'Revenue Base (Historical)';
    aSheet.getCell(aRow, 2).value = engineRevenues[0] ?? assumptions.revenueBase;
    styleRow(aSheet.getRow(aRow), { input: true, numFmt: NUM_FMT }); aRow++;

    aRows['revenueBaseProjection'] = aRow;
    aSheet.getCell(aRow, 1).value = 'Revenue Base (Projection)';
    aSheet.getCell(aRow, 2).value = assumptions.revenueBase;
    styleRow(aSheet.getRow(aRow), { input: true, numFmt: NUM_FMT }); aRow++;

    addAssumptionRow('Revenue Growth Rate', 'revenueGrowthRate', allRevenueGrowth, PCT_FMT);
    addAssumptionRow('COGS % of Revenue', 'cogsPercent', [...histIS.map(is => sd(is.cogs, is.revenue)), ...assumptions.cogsPercent], PCT_FMT);
    addAssumptionRow('SG&A % of Revenue', 'sgaPercent', [...histIS.map(is => sd(is.sgaExpense, is.revenue)), ...assumptions.sgaPercent], PCT_FMT);
    addAssumptionRow('R&D % of Revenue', 'rdPercent', [...histIS.map(is => sd(is.rdExpense, is.revenue)), ...assumptions.rdPercent], PCT_FMT);
    addAssumptionRow('Other OpEx % of Revenue', 'otherOpexPercent', [...histIS.map(is => sd(is.otherOpex, is.revenue)), ...assumptions.otherOpexPercent], PCT_FMT);
    addAssumptionRow('Tax Rate', 'taxRate', [...histIS.map(is => is.taxRate), ...assumptions.taxRate], PCT_FMT);
    addAssumptionRow('Other Income / Expense', 'otherIncomeExpense', [...histIS.map(is => is.otherIncomeExpense), ...assumptions.otherIncomeExpense], NUM_FMT);
    addAssumptionRow('Shares Outstanding', 'sharesOutstanding', [...histIS.map(is => is.sharesOutstanding), ...assumptions.sharesOutstanding], '#,##0');
    addAssumptionRow('Stock-Based Comp Amount', 'stockBasedCompAmount', [...histIS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) return results.cashFlowStatements[cfIdx].stockBasedComp;
        return 0;
    }), ...assumptions.stockBasedCompAmount], NUM_FMT);

    aSheet.getCell(aRow, 1).value = '── Balance Sheet / WC Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    addAssumptionRow('DSO (Days)', 'dso', [...histBS.map((bs, i) => sd(bs.accountsReceivable, histIS[i]?.revenue ?? 1) * 365), ...assumptions.dso], '#,##0');
    addAssumptionRow('DIO (Days)', 'dio', [...histBS.map((bs, i) => sd(bs.inventory, histIS[i]?.cogs ?? 1) * 365), ...assumptions.dio], '#,##0');
    addAssumptionRow('DPO (Days)', 'dpo', [...histBS.map((bs, i) => sd(bs.accountsPayable, histIS[i]?.cogs ?? 1) * 365), ...assumptions.dpo], '#,##0');
    addAssumptionRow('Prepaid % of Revenue', 'prepaidPercent', [...histBS.map((bs, i) => sd(bs.prepaidExpenses, histIS[i]?.revenue ?? 1)), ...assumptions.prepaidPercent], PCT_FMT);
    addAssumptionRow('Accrued Exp % of Revenue', 'accruedExpPercent', [...histBS.map((bs, i) => sd(bs.accruedExpenses, histIS[i]?.revenue ?? 1)), ...assumptions.accruedExpPercent], PCT_FMT);
    addAssumptionRow('Deferred Rev % of Revenue', 'deferredRevPercent', [...histBS.map((bs, i) => sd(bs.deferredRevenue, histIS[i]?.revenue ?? 1)), ...assumptions.deferredRevPercent], PCT_FMT);

    aSheet.getCell(aRow, 1).value = '── CapEx & Depreciation Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    addAssumptionRow('CapEx % of Revenue', 'capexPercent', [...histBS.map((bs, i) => {
        if (i === 0) return 0;
        return sd(bs.grossPPE - histBS[i - 1].grossPPE, histIS[i]?.revenue ?? 1);
    }), ...assumptions.capexPercent], PCT_FMT);
    addAssumptionRow('Depreciation Rate (% Gross PPE)', 'depreciationRate', [...histIS.map((is, i) => sd(is.depreciation, histBS[i]?.grossPPE ?? 1)), ...assumptions.depreciationRate], PCT_FMT);
    addAssumptionRow('Amortization Amount', 'amortizationAmount', [...histIS.map(is => is.amortization), ...assumptions.amortizationAmount], NUM_FMT);

    aSheet.getCell(aRow, 1).value = '── Debt & Financing ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    addAssumptionRow('Interest Rate (on Debt)', 'interestRate', Array(nYears).fill(assumptions.interestRate), PCT_FMT);
    addAssumptionRow('Interest Income Rate (on Cash)', 'interestIncomeRate', Array(nYears).fill(assumptions.interestIncomeRate), PCT_FMT);
    addAssumptionRow('Short-Term Debt', 'shortTermDebtAmount', [...histBS.map(bs => bs.shortTermDebt), ...assumptions.shortTermDebtAmount], NUM_FMT);
    addAssumptionRow('LT Debt Issuance', 'longTermDebtIssuance', [...histBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - histBS[i - 1].longTermDebt;
        return change > 0 ? change : 0;
    }), ...assumptions.longTermDebtIssuance], NUM_FMT);
    addAssumptionRow('LT Debt Repayment', 'longTermDebtRepayment', [...histBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - histBS[i - 1].longTermDebt;
        return change < 0 ? Math.abs(change) : 0;
    }), ...assumptions.longTermDebtRepayment], NUM_FMT);
    addAssumptionRow('Current Portion LTD', 'currentPortionLTD', [...histBS.map(bs => bs.currentPortionLTD), ...assumptions.currentPortionLTD], NUM_FMT);
    addAssumptionRow('Dividend Payout Ratio', 'dividendPayoutRatio', [...histBS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            const ni = results.incomeStatements[i]?.netIncome ?? 0;
            const divPaid = results.cashFlowStatements[cfIdx]?.dividendsPaid ?? 0;
            return ni !== 0 ? Math.abs(divPaid) / ni : 0;
        }
        return 0;
    }), ...assumptions.dividendPayoutRatio], PCT_FMT);
    addAssumptionRow('Share Repurchase Amount', 'shareRepurchaseAmount', [...histBS.map((bs, i) => {
        if (i === 0) return 0;
        return Math.abs(bs.treasuryStock - histBS[i - 1].treasuryStock);
    }), ...assumptions.shareRepurchaseAmount], NUM_FMT);
    addAssumptionRow('Equity Issuance', 'equityIssuance', [...histBS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) return results.cashFlowStatements[cfIdx].equityIssuance;
        return 0;
    }), ...assumptions.equityIssuance], NUM_FMT);

    aSheet.getCell(aRow, 1).value = '── BS / Equity Direct Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    addAssumptionRow('Goodwill', 'goodwill', [...histBS.map(bs => bs.goodwill), ...assumptions.goodwill], NUM_FMT);
    addAssumptionRow('Other Current Assets', 'otherCurrentAssets', [...histBS.map(bs => bs.otherCurrentAssets), ...assumptions.otherCurrentAssets], NUM_FMT);
    addAssumptionRow('Other Long-Term Assets', 'otherLongTermAssets', [...histBS.map(bs => bs.otherLongTermAssets), ...assumptions.otherLongTermAssets], NUM_FMT);
    addAssumptionRow('Other Current Liabilities', 'otherCurrentLiabilities', [...histBS.map(bs => bs.otherCurrentLiabilities), ...assumptions.otherCurrentLiabilities], NUM_FMT);
    addAssumptionRow('Deferred Tax Liabilities', 'deferredTaxLiabilities', [...histBS.map(bs => bs.deferredTaxLiabilities), ...assumptions.deferredTaxLiabilities], NUM_FMT);
    addAssumptionRow('Other LT Liabilities', 'otherLongTermLiabilities', [...histBS.map(bs => bs.otherLongTermLiabilities), ...assumptions.otherLongTermLiabilities], NUM_FMT);
    addAssumptionRow('Common Stock', 'commonStock', [...histBS.map(bs => bs.commonStock), ...assumptions.commonStock], NUM_FMT);
    addAssumptionRow('APIC', 'apic', [...histBS.map(bs => bs.additionalPaidInCapital), ...assumptions.apic], NUM_FMT);
    addAssumptionRow('Other Comprehensive Income', 'oci', [...histBS.map(bs => bs.otherComprehensiveIncome), ...assumptions.oci], NUM_FMT);

    aSheet.getCell(aRow, 1).value = '── Engine-Computed Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true }); aRow++;

    addAssumptionRow('Interest Income (Computed)', 'interestIncomeComputed', results.incomeStatements.map(is => is.interestIncome), NUM_FMT);
    addAssumptionRow('Interest Expense (Computed)', 'interestExpenseComputed', results.incomeStatements.map(is => is.interestExpense), NUM_FMT);
    addAssumptionRow('Depreciation (Computed)', 'depreciationComputed', results.incomeStatements.map(is => is.depreciation), NUM_FMT);
    addAssumptionRow('Gross PP&E (Computed)', 'grossPPEComputed', results.balanceSheets.map(bs => bs.grossPPE), NUM_FMT);
    addAssumptionRow('Accum Depreciation (Computed)', 'accumDepComputed', results.balanceSheets.map(bs => bs.accumulatedDepreciation), NUM_FMT);
    addAssumptionRow('Net PP&E (Computed)', 'netPPEComputed', results.balanceSheets.map(bs => bs.netPPE), NUM_FMT);
    addAssumptionRow('Intangibles (Computed)', 'intangiblesComputed', results.balanceSheets.map(bs => bs.intangibles), NUM_FMT);
    addAssumptionRow('Long-Term Debt (Computed)', 'ltdComputed', results.balanceSheets.map(bs => bs.longTermDebt), NUM_FMT);
    addAssumptionRow('Retained Earnings (Computed)', 'reComputed', results.balanceSheets.map(bs => bs.retainedEarnings), NUM_FMT);
    addAssumptionRow('Treasury Stock (Computed)', 'tsComputed', results.balanceSheets.map(bs => bs.treasuryStock), NUM_FMT);
    addAssumptionRow('APIC (Computed)', 'apicComputed', results.balanceSheets.map(bs => bs.additionalPaidInCapital), NUM_FMT);
    addAssumptionRow('Dividends Paid (Computed)', 'dividendsPaidComputed', [0, ...results.cashFlowStatements.map(cf => cf.dividendsPaid)], NUM_FMT);
    addAssumptionRow('Equity Issuance (Computed)', 'equityIssuanceComputed', [0, ...results.cashFlowStatements.map(cf => cf.equityIssuance)], NUM_FMT);
    addAssumptionRow('Share Repurchases (Computed)', 'shareRepurchasesComputed', [0, ...results.cashFlowStatements.map(cf => cf.shareRepurchases)], NUM_FMT);
    addAssumptionRow('Acquisitions (Computed)', 'acquisitionsComputed', [0, ...results.cashFlowStatements.map(cf => cf.acquisitions)], NUM_FMT);
    addAssumptionRow('Asset Sales (Computed)', 'assetSalesComputed', [0, ...results.cashFlowStatements.map(cf => cf.assetSales)], NUM_FMT);

    // ── SCENARIO WIRING ──
    // Replicate the wiring from excel.ts lines 2015-2057
    const scenarioControlRow = aRow + 2;
    aSheet.getCell(aRow + 1, 1).value = '── SCENARIO CONTROL ──';
    aSheet.getCell(scenarioControlRow, 1).value = 'Active Scenario';
    aSheet.getCell(scenarioControlRow, 2).value = { formula: 'Dashboard!B6', result: 'Base Case' };

    const scenCtrlRef = `Assumptions!$${colLetter(2)}$${scenarioControlRow}`;

    console.log(`\naRows keys (${Object.keys(aRows).length}):`);
    console.log(`scenarioRows keys (${Object.keys(scenarioRows).length}):`);

    let wiredCount = 0;
    let skippedCount = 0;
    const missingKeys: string[] = [];

    for (const spec of ROW_SPECS) {
        const aRowNum = aRows[spec.key];
        if (!aRowNum) {
            missingKeys.push(spec.key);
            continue;
        }

        const baseRow = scenarioRows[`Base Case_${spec.key}`];
        const optRow = scenarioRows[`Optimistic_${spec.key}`];
        const consRow = scenarioRows[`Conservative_${spec.key}`];
        if (!baseRow || !optRow || !consRow) {
            skippedCount++;
            continue;
        }

        for (let pi = 0; pi < nProj; pi++) {
            const yearIdx = numHistorical + pi;
            const cellCol = yearIdx + 2;
            const scenCol = colLetter(yearIdx + 2);

            const formula = `IF(${scenCtrlRef}="Base Case",Scenarios!${scenCol}${baseRow},IF(${scenCtrlRef}="Optimistic",Scenarios!${scenCol}${optRow},Scenarios!${scenCol}${consRow}))`;
            const cell = aSheet.getCell(aRowNum, cellCol);
            const currentVal = cell.value;
            const numResult = typeof currentVal === 'number' ? currentVal : 0;
            cell.value = { formula, result: numResult };
        }
        wiredCount++;
    }

    console.log(`\n  Wired: ${wiredCount}/${ROW_SPECS.length}`);
    console.log(`  Skipped (no scenario row): ${skippedCount}`);
    if (missingKeys.length > 0) console.log(`  Missing aRows keys: ${missingKeys.join(', ')}`);

    // Save and re-read
    const outPath = path.join(process.cwd(), 'VERIFY_Full_Export.xlsx');
    await workbook.xlsx.writeFile(outPath);
    console.log(`\n  Saved: ${outPath}`);

    // 3. Re-read and verify
    console.log('\n══════════════════════════════════════');
    console.log('VERIFICATION: Reading back the Excel file');
    console.log('══════════════════════════════════════');

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.readFile(outPath);
    const a2 = wb2.getWorksheet('Assumptions');
    if (!a2) { console.log('❌ Assumptions not found in saved file'); process.exit(1); }

    // Check specific assumption rows for IF formulas
    const checkKeys = ['revenueGrowthRate', 'cogsPercent', 'taxRate', 'interestIncomeComputed', 'reComputed', 'dividendPayoutRatio', 'grossPPEComputed'];

    for (const key of checkKeys) {
        const rowNum = aRows[key];
        if (!rowNum) continue;

        console.log(`\n  Checking "${key}" (row ${rowNum}):`);

        // Check historical columns (should be plain values)
        for (let i = 0; i < numHistorical; i++) {
            const cell = a2.getCell(rowNum, i + 2);
            const v = cell.value;
            const isFormula = v && typeof v === 'object' && 'formula' in v;
            if (isFormula) {
                warn(`  Historical col ${colLetter(i + 2)}: should be value, got formula=${(v as any).formula}`);
            }
        }

        // Check projection columns (should be IF formulas)
        for (let pi = 0; pi < nProj; pi++) {
            const col = numHistorical + pi + 2;
            const cell = a2.getCell(rowNum, col);
            const v = cell.value;
            const isFormula = v && typeof v === 'object' && 'formula' in v;

            if (!isFormula) {
                check(`${key} col ${colLetter(col)} has IF formula`, false, `value=${v}`);
                continue;
            }

            const formula = (v as any).formula as string;
            const hasIF = formula.includes('IF(');
            const hasBase = formula.includes('"Base Case"');
            const hasOpt = formula.includes('"Optimistic"');

            check(`${key} col ${colLetter(col)} has IF formula`, hasIF, `formula=${formula.substring(0, 60)}`);
            if (hasIF) {
                check(`${key} col ${colLetter(col)} refs Base Case`, hasBase);
                check(`${key} col ${colLetter(col)} refs Optimistic`, hasOpt);
            }

            // Show first projection year's formula for inspection
            if (pi === 0) {
                console.log(`    First proj formula: ${formula}`);
                console.log(`    Cached result: ${(v as any).result}`);
            }
        }
    }

    // Check Scenario Control
    const ctrlCell = a2.getCell(scenarioControlRow, 2);
    const ctrlVal = ctrlCell.value;
    if (ctrlVal && typeof ctrlVal === 'object' && 'formula' in ctrlVal) {
        check('Scenario Control formula', (ctrlVal as any).formula.includes('Dashboard!B6'));
        console.log(`\n  Scenario Control formula: ${(ctrlVal as any).formula}`);
    }

    // ═══════════════════════════════════════
    // NOW: Simulate what happens when scenario changes
    // Check: for "Optimistic", what values would the IF formulas resolve to?
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('SIMULATION: What IF formulas would resolve to');
    console.log('══════════════════════════════════════');

    const optScenario = scenarios.find(s => s.type === 'optimistic')!;
    const optResults = optScenario.results!;

    const scenSheet = wb2.getWorksheet('Scenarios');
    if (!scenSheet) { console.log('❌ Scenarios sheet not found'); process.exit(1); }

    // For Optimistic, the IF formula would resolve to Scenarios!${col}${optRow}
    // Let's read those values directly from the Scenarios sheet and compare to engine
    const simKeys = ['revenueGrowthRate', 'cogsPercent', 'interestIncomeComputed', 'reComputed'];
    for (const key of simKeys) {
        const optRowKey = `Optimistic_${key}`;
        const optRow = scenarioRows[optRowKey];
        if (!optRow) continue;

        console.log(`\n  ${key} (Optimistic, Scenarios row ${optRow}):`);
        for (let pi = 0; pi < nProj; pi++) {
            const yearIdx = numHistorical + pi;
            const col = yearIdx + 2;
            const cell = scenSheet.getCell(optRow, col);
            const scenVal = typeof cell.value === 'number' ? cell.value : 0;

            // Expected from engine
            let engineVal = 0;
            if (key === 'revenueGrowthRate') {
                engineVal = optScenario.assumptions.revenueGrowthRate[pi] ?? 0;
            } else if (key === 'cogsPercent') {
                engineVal = optScenario.assumptions.cogsPercent[pi] ?? 0;
            } else if (key === 'interestIncomeComputed') {
                engineVal = optResults.incomeStatements[yearIdx]?.interestIncome ?? 0;
            } else if (key === 'reComputed') {
                engineVal = optResults.balanceSheets[yearIdx]?.retainedEarnings ?? 0;
            }

            const diff = Math.abs(scenVal - engineVal);
            const ok = diff < 0.01;
            if (!ok) {
                console.log(`    ${periods[yearIdx]}: scenSheet=${scenVal.toFixed(4)} vs engine=${engineVal.toFixed(4)} MISMATCH`);
            }
            check(`Opt ${key} ${periods[yearIdx]}`, ok, `scenSheet=${scenVal}, engine=${engineVal}`);
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
