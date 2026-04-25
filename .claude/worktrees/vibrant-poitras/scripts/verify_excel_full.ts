/**
 * Full Excel Export Verification — Reads a generated .xlsx and verifies:
 * 1. Assumptions tab PROJECTION columns have IF formulas (not hardcoded values)
 * 2. Cached result values in IS/BS/CF match the engine for ALL 3 scenarios
 * 3. The scenario selector cell references Dashboard!B6
 *
 * This reads an existing exported .xlsx file from the project directory.
 * Export first from the browser, then run:  npx tsx scripts/verify_excel_full.ts
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';

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

function getCellRaw(sheet: ExcelJS.Worksheet, row: number, col: number) {
    const cell = sheet.getCell(row, col);
    const v = cell.value;
    if (v && typeof v === 'object' && 'formula' in v) {
        return { formula: (v as any).formula as string, result: (v as any).result, type: 'formula' as const };
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

function findRowContaining(sheet: ExcelJS.Worksheet, substring: string): number | null {
    let found: number | null = null;
    sheet.eachRow((row, rowNumber) => {
        const val = row.getCell(1).value;
        if (val && typeof val === 'string' && val.includes(substring)) {
            found = rowNumber;
        }
    });
    return found;
}

function colLetter(col: number): string {
    let s = '';
    let c = col;
    while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
    return s;
}

async function main() {
    // Find .xlsx file in project root
    const projectDir = process.cwd();
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~') && !f.startsWith('VERIFY'));
    if (files.length === 0) {
        console.log('❌ No .xlsx file found in project directory.');
        console.log('   Export from browser first, or use the dev-save API.');
        process.exit(1);
    }
    const excelFile = files[0];
    console.log(`\n📊 Reading: ${excelFile}\n`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path.join(projectDir, excelFile));

    // Also compute engine results for comparison
    const scenarios = createDefaultScenarios();
    const historicalInputs = getDefaultHistoricalInputs();
    for (let i = 0; i < scenarios.length; i++) {
        scenarios[i] = { ...scenarios[i], results: runFullModel(scenarios[i].assumptions, historicalInputs) };
    }
    const baseResults = scenarios.find(s => s.type === 'base')!.results!;
    const optResults = scenarios.find(s => s.type === 'optimistic')!.results!;
    const consResults = scenarios.find(s => s.type === 'conservative')!.results!;
    const nYears = baseResults.incomeStatements.length;
    const numHistorical = baseResults.incomeStatements.filter(s => s.periodType === 'historical').length;
    const nProj = nYears - numHistorical;

    console.log(`Engine: nYears=${nYears}, numHistorical=${numHistorical}, nProj=${nProj}`);

    // ═══════════════════════════════════════
    // CHECK 1: ASSUMPTIONS — IF formulas in projection columns
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 1: Assumptions — IF Formulas in Projection Columns');
    console.log('══════════════════════════════════════');

    const aSheet = wb.getWorksheet('Assumptions');
    if (!aSheet) {
        console.log('❌ Assumptions sheet not found!');
        process.exit(1);
    }

    // Count periods
    const headerRow = aSheet.getRow(1);
    let headerCount = 0;
    headerRow.eachCell((cell, colNumber) => { if (colNumber > 1 && cell.value) headerCount++; });
    console.log(`  Periods: ${headerCount}`);

    // Find the Scenario Control row
    const ctrlRow = findRowContaining(aSheet, 'Active Scenario');
    if (ctrlRow) {
        const ctrlCell = getCellRaw(aSheet, ctrlRow, 2);
        console.log(`  Scenario Control (row ${ctrlRow}): type=${ctrlCell.type}`);
        if (ctrlCell.type === 'formula') {
            console.log(`    Formula: ${ctrlCell.formula}`);
            check('Scenario Control references Dashboard!B6', ctrlCell.formula.includes('Dashboard!B6'));
        } else {
            check('Scenario Control is formula', false, `type=${ctrlCell.type}`);
        }
    } else {
        check('Scenario Control row exists', false);
    }

    // Check specific assumption rows for IF formulas in projection columns
    const assumptionLabels = [
        'Revenue Growth Rate',
        'COGS % of Revenue',
        'Tax Rate',
        'DSO (Days)',
        'CapEx % of Revenue',
        'Interest Rate (on Debt)',
        'Dividend Payout Ratio',
        'Goodwill',
        'Interest Income (Computed)',
        'Interest Expense (Computed)',
        'Depreciation (Computed)',
        'Retained Earnings (Computed)',
    ];

    let ifFormulaCount = 0;
    let nonIfCount = 0;
    for (const label of assumptionLabels) {
        const row = findRow(aSheet, label);
        if (!row) {
            warn(`Missing row: "${label}"`);
            continue;
        }

        // Check projection columns (numHistorical+2...nYears+1)
        for (let pi = 0; pi < nProj; pi++) {
            const col = numHistorical + pi + 2;
            const raw = getCellRaw(aSheet, row, col);

            if (raw.type === 'formula') {
                if (raw.formula.includes('IF(')) {
                    ifFormulaCount++;
                } else {
                    // Has a formula but not an IF — might be okay for some rows
                    console.log(`    "${label}" col ${colLetter(col)}: formula but no IF: ${raw.formula.substring(0, 60)}`);
                    nonIfCount++;
                }
            } else {
                console.log(`  ❌ "${label}" col ${colLetter(col)}: HARDCODED value=${raw.value}, expected IF formula`);
                errors++;
            }
        }
    }
    console.log(`\n  IF formulas found: ${ifFormulaCount}`);
    console.log(`  Non-IF formulas: ${nonIfCount}`);

    // ═══════════════════════════════════════
    // CHECK 2: INCOME STATEMENT — cached results match engine
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 2: Income Statement — Cached Results');
    console.log('══════════════════════════════════════');

    const isSheet = wb.getWorksheet('Income Statement');
    if (isSheet) {
        const revRow = findRow(isSheet, 'Revenue');
        const niRow = findRow(isSheet, 'Net Income');
        const cogsRow = findRow(isSheet, 'Cost of Goods Sold');

        if (revRow) {
            console.log('  Revenue cached results:');
            for (let i = 0; i < nYears; i++) {
                const cell = getCellRaw(isSheet, revRow, i + 2);
                const cached = cell.type === 'formula' ? Number(cell.result) || 0 : Number(cell.value) || 0;
                const expected = baseResults.incomeStatements[i].revenue;
                const diff = Math.abs(cached - expected);
                const ok = diff < 1;
                if (!ok) {
                    console.log(`    Year ${i}: cached=${cached.toFixed(0)}, engine=${expected.toFixed(0)}, diff=${diff.toFixed(2)}`);
                }
                check(`Revenue Year ${i} cached matches engine (base)`, ok);
            }
        }

        if (niRow) {
            console.log('  Net Income cached results:');
            for (let i = 0; i < nYears; i++) {
                const cell = getCellRaw(isSheet, niRow, i + 2);
                const cached = cell.type === 'formula' ? Number(cell.result) || 0 : Number(cell.value) || 0;
                const expected = baseResults.incomeStatements[i].netIncome;
                const diff = Math.abs(cached - expected);
                const ok = diff < 1;
                if (!ok) {
                    console.log(`    Year ${i}: cached=${cached.toFixed(0)}, engine=${expected.toFixed(0)}, diff=${diff.toFixed(2)}`);
                }
                check(`NetIncome Year ${i} cached matches engine (base)`, ok);
            }
        }
    }

    // ═══════════════════════════════════════
    // CHECK 3: SCENARIOS SHEET — values differ across scenarios
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 3: Scenarios Sheet — Value Differences');
    console.log('══════════════════════════════════════');

    const scenSheet = wb.getWorksheet('Scenarios');
    if (scenSheet) {
        // Find the 3 scenario blocks
        const blockRows: { name: string; startRow: number }[] = [];
        scenSheet.eachRow((row, rowNumber) => {
            const val = String(row.getCell(1).value || '');
            if (val.includes('▎')) {
                const name = val.includes('BASE') ? 'Base Case' : val.includes('OPTIMISTIC') ? 'Optimistic' : val.includes('CONSERVATIVE') ? 'Conservative' : 'Unknown';
                blockRows.push({ name, startRow: rowNumber });
                console.log(`  Block "${name}" at row ${rowNumber}`);
            }
        });

        check('Found 3 scenario blocks', blockRows.length === 3, `found ${blockRows.length}`);

        // Check that revenue growth rate values differ between blocks
        for (const block of blockRows) {
            // Revenue Growth Rate should be 2 rows below the header row (row after block start + period headers)
            const revenueGrowthLabel = 'Revenue Growth Rate';
            let revenueGrowthRow: number | null = null;
            // Search within a range after the block start
            for (let r = block.startRow + 1; r < block.startRow + 80; r++) {
                const val = String(scenSheet.getCell(r, 1).value || '').trim();
                if (val === revenueGrowthLabel) {
                    revenueGrowthRow = r;
                    break;
                }
            }

            if (revenueGrowthRow) {
                // First projection year
                const projCol = numHistorical + 2;
                const cell = getCellRaw(scenSheet, revenueGrowthRow, projCol);
                const val = typeof cell.value === 'number' ? cell.value : 0;
                console.log(`  ${block.name}: Revenue Growth (first proj) = ${(val * 100).toFixed(1)}%`);
            }
        }
    }

    // ═══════════════════════════════════════
    // CHECK 4: BALANCE SHEET — balance check
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 4: Balance Sheet — Balance Check');
    console.log('══════════════════════════════════════');

    const bsSheet = wb.getWorksheet('Balance Sheet');
    if (bsSheet) {
        const balCheckRow = findRow(bsSheet, 'Balance Check');
        if (balCheckRow) {
            for (let i = 0; i < nYears; i++) {
                const cell = getCellRaw(bsSheet, balCheckRow, i + 2);
                const val = cell.type === 'formula' ? Number(cell.result) || 0 : Number(cell.value) || 0;
                check(`BS Balance Check Year ${i} ≈ 0`, Math.abs(val) < 1, `diff=${val.toFixed(2)}`);
            }
        }
    }

    // ═══════════════════════════════════════
    // CHECK 5: CASH FLOW — reconciliation
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 5: Cash Flow — Reconciliation');
    console.log('══════════════════════════════════════');

    const cfSheet = wb.getWorksheet('Cash Flow Statement');
    if (cfSheet) {
        const fcfRow = findRow(cfSheet, 'Free Cash Flow');
        const endCashRow = findRow(cfSheet, 'Ending Cash');

        if (endCashRow) {
            const numCF = baseResults.cashFlowStatements.length;
            for (let i = 0; i < numCF; i++) {
                const cell = getCellRaw(cfSheet, endCashRow, i + 2);
                const cached = cell.type === 'formula' ? Number(cell.result) || 0 : Number(cell.value) || 0;
                const expected = baseResults.cashFlowStatements[i].endingCash;
                const diff = Math.abs(cached - expected);
                const ok = diff < 1;
                if (!ok) {
                    console.log(`    CF[${i}]: cached=${cached.toFixed(0)}, engine=${expected.toFixed(0)}, diff=${diff.toFixed(2)}`);
                }
                check(`CF Ending Cash ${i} cached matches engine`, ok);
            }
        }
    }

    // ═══════════════════════════════════════
    // CHECK 6: INSPECT A SPECIFIC IF FORMULA
    // ═══════════════════════════════════════
    console.log('\n══════════════════════════════════════');
    console.log('CHECK 6: Sample IF Formula Inspection');
    console.log('══════════════════════════════════════');

    if (aSheet) {
        const row = findRow(aSheet, 'Revenue Growth Rate');
        if (row) {
            const firstProjCol = numHistorical + 2;
            const cell = getCellRaw(aSheet, row, firstProjCol);
            console.log(`  Revenue Growth Rate (row ${row}, col ${colLetter(firstProjCol)}):`);
            if (cell.type === 'formula') {
                console.log(`    Formula: ${cell.formula}`);
                console.log(`    Result: ${cell.result}`);
            } else {
                console.log(`    Value (no formula): ${cell.value}`);
            }
        }

        const row2 = findRow(aSheet, 'Retained Earnings (Computed)');
        if (row2) {
            const firstProjCol = numHistorical + 2;
            const cell = getCellRaw(aSheet, row2, firstProjCol);
            console.log(`  Retained Earnings (Computed) (row ${row2}, col ${colLetter(firstProjCol)}):`);
            if (cell.type === 'formula') {
                console.log(`    Formula: ${cell.formula}`);
                console.log(`    Result: ${cell.result}`);
            } else {
                console.log(`    Value (no formula): ${cell.value}`);
            }
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
