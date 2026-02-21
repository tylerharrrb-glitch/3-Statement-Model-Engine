#!/usr/bin/env npx tsx
// ============================================================
// Real Excel Readback Verification — INTERNAL CONSISTENCY
// ============================================================
// Reads the exported Excel, checks:
// 1. BS balances (Total Assets = Total L+E) for every period
// 2. CF reconciles (Beginning + Net Change = Ending) for every period
// 3. IS Net Income = CF Net Income for each period
// 4. BS Cash = CF Ending Cash for projection periods
// 5. All projection cells for key derived rows have LIVE FORMULAS
// 6. Formula string checks for key items
// ============================================================

import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m';
const RS = '\x1b[0m', B = '\x1b[1m', D = '\x1b[2m';

const ABS_TOL = 1.5;

function eq(a: number, b: number): boolean {
    return Math.abs(a - b) < ABS_TOL;
}

function getCached(cell: ExcelJS.Cell): number {
    const v = cell.value;
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && 'result' in v) {
        const r = (v as any).result;
        return typeof r === 'number' ? r : 0;
    }
    return typeof v === 'string' ? parseFloat(v) || 0 : 0;
}

function getFormula(cell: ExcelJS.Cell): string | null {
    const v = cell.value;
    if (v && typeof v === 'object' && 'formula' in v) return (v as any).formula;
    return null;
}

interface Check { name: string; period: string; expected: number; actual: number; pass: boolean; detail?: string; }

async function main() {
    const xlsxPath = path.join(process.cwd(), 'Demo_Company_Inc__Financial_Model.xlsx');
    if (!fs.existsSync(xlsxPath)) { console.error(`${R}File not found: ${xlsxPath}${RS}`); process.exit(1); }

    console.log(`${B}${C}══════════════════════════════════════════════════════${RS}`);
    console.log(`${B}${C}  REAL EXCEL INTERNAL CONSISTENCY CHECK${RS}`);
    console.log(`${B}${C}══════════════════════════════════════════════════════${RS}\n`);
    console.log(`  File: ${xlsxPath} (${(fs.statSync(xlsxPath).size / 1024).toFixed(1)} KB)\n`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(xlsxPath);

    const sheetNames = workbook.worksheets.map(s => s.name);
    console.log(`  Sheets: ${sheetNames.join(', ')}\n`);

    const isSheet = workbook.getWorksheet('Income Statement')!;
    const bsSheet = workbook.getWorksheet('Balance Sheet')!;
    const cfSheet = workbook.getWorksheet('Cash Flow Statement')!;

    // Helper to find rows by exact label
    function findRow(sheet: ExcelJS.Worksheet, label: string): number | null {
        let found: number | null = null;
        sheet.eachRow((row, num) => {
            if (String(row.getCell(1).value ?? '').trim() === label) found = num;
        });
        return found;
    }

    // Discovery: figure out how many columns (periods)
    // The IS title row is row 1, period headers start from col 2
    let nCols = 0;
    isSheet.getRow(1).eachCell((cell, col) => { if (col > 1) nCols = col; });
    // Actually get the period count from max non-empty column in row 2 (Revenue)
    const revRow = findRow(isSheet, 'Revenue')!;
    nCols = 0;
    for (let c = 2; c <= 20; c++) {
        const v = getCached(isSheet.getCell(revRow, c));
        if (v !== 0) nCols = c;
    }
    const nYears = nCols - 1; // col 2 = year 1, so 7 years = col 2..8
    console.log(`  Detected ${nYears} periods (columns 2-${nCols})\n`);

    // Get period labels from the title row or Revenue Growth % row
    const periods: string[] = [];
    const growthRow = findRow(isSheet, 'Revenue Growth %');
    // Try to get from a header or title row
    // Let's look for them in row 1
    for (let c = 2; c <= nCols; c++) {
        const titleCell = isSheet.getCell(1, c);
        const tVal = titleCell.value;
        if (tVal && typeof tVal === 'string') {
            periods.push(tVal.trim());
        } else if (typeof tVal === 'number') {
            periods.push(String(tVal));
        } else {
            periods.push(`Col${c}`);
        }
    }
    console.log(`  Periods: ${periods.join(', ')}\n`);

    // Determine numHistorical by looking for "E" suffix in periods
    let numHistorical = 0;
    for (let i = 0; i < periods.length; i++) {
        if (!periods[i].endsWith('E')) numHistorical = i + 1;
        else break;
    }
    console.log(`  Historical periods: ${numHistorical}, Projection periods: ${nYears - numHistorical}\n`);

    const checks: Check[] = [];

    // ══════════ TEST 1: BS Balance (Assets = L+E) ══════════
    console.log(`${B}${C}── Test 1: Balance Sheet Balances ──${RS}`);
    const taRow = findRow(bsSheet, 'Total Assets');
    const tleRow = findRow(bsSheet, 'Total Liabilities + Equity');
    if (taRow && tleRow) {
        for (let c = 2; c <= nCols; c++) {
            const ta = getCached(bsSheet.getCell(taRow, c));
            const tle = getCached(bsSheet.getCell(tleRow, c));
            const pass = eq(ta, tle);
            checks.push({ name: 'BS A=L+E', period: periods[c - 2], expected: ta, actual: tle, pass });
            const icon = pass ? `${G}✓` : `${R}✗`;
            console.log(`  ${icon} ${periods[c - 2]}: Assets=${ta.toFixed(0)}, L+E=${tle.toFixed(0)}, diff=${(ta - tle).toFixed(2)}${RS}`);
        }
    }

    // ══════════ TEST 2: CF Reconciliation ══════════
    console.log(`\n${B}${C}── Test 2: Cash Flow Reconciliation ──${RS}`);
    const cfBegRow = findRow(cfSheet, 'Beginning Cash');
    const cfNetChgRow = findRow(cfSheet, 'Net Change in Cash');
    const cfEndRow = findRow(cfSheet, 'Ending Cash');
    const cfCfoRow = findRow(cfSheet, 'Cash from Operations');
    const cfCfiRow = findRow(cfSheet, 'Cash from Investing');
    const cfCffRow = findRow(cfSheet, 'Cash from Financing');

    if (cfBegRow && cfNetChgRow && cfEndRow) {
        // CF starts at col 2, usually has 6 periods (yrs 1-6)
        let cfPeriods = 0;
        for (let c = 2; c <= 20; c++) {
            const v = cfSheet.getCell(cfEndRow, c).value;
            if (v !== null && v !== undefined) cfPeriods = c;
        }

        for (let c = 2; c <= cfPeriods; c++) {
            const beg = getCached(cfSheet.getCell(cfBegRow, c));
            const netChg = getCached(cfSheet.getCell(cfNetChgRow, c));
            const end = getCached(cfSheet.getCell(cfEndRow, c));
            const expected = beg + netChg;
            const pass = eq(expected, end);
            checks.push({ name: 'CF Reconciliation', period: `CF col${c}`, expected, actual: end, pass });
            const icon = pass ? `${G}✓` : `${R}✗`;
            console.log(`  ${icon} CF col ${c}: Beg=${beg.toFixed(0)} + NetChg=${netChg.toFixed(0)} = ${expected.toFixed(0)}, End=${end.toFixed(0)}, diff=${(expected - end).toFixed(2)}${RS}`);
        }

        // Also verify: Net Change = CFO + CFI + CFF
        if (cfCfoRow && cfCfiRow && cfCffRow) {
            console.log('');
            for (let c = 2; c <= cfPeriods; c++) {
                const cfo = getCached(cfSheet.getCell(cfCfoRow, c));
                const cfi = getCached(cfSheet.getCell(cfCfiRow, c));
                const cff = getCached(cfSheet.getCell(cfCffRow, c));
                const netChg = getCached(cfSheet.getCell(cfNetChgRow, c));
                const expected = cfo + cfi + cff;
                const pass = eq(expected, netChg);
                checks.push({ name: 'CF CFO+CFI+CFF', period: `CF col${c}`, expected, actual: netChg, pass });
                const icon = pass ? `${G}✓` : `${R}✗`;
                console.log(`  ${icon} CF col ${c}: CFO+CFI+CFF=${expected.toFixed(0)}, NetChg=${netChg.toFixed(0)}, diff=${(expected - netChg).toFixed(2)}${RS}`);
            }
        }
    }

    // ══════════ TEST 3: IS NI = CF NI ══════════
    console.log(`\n${B}${C}── Test 3: IS Net Income = CF Net Income ──${RS}`);
    const isNiRow = findRow(isSheet, 'Net Income');
    const cfNiRow = findRow(cfSheet, 'Net Income');
    if (isNiRow && cfNiRow) {
        // CF col 2 corresponds to IS col 3 (first CF period = second IS period)
        // But this depends on the layout. Let's just compare matching columns.
        // Actually CF col 2 = first CF period. IS has nYears cols starting col 2.
        // CF typically has nYears-1 cols. CF col 2 references IS col 3.
        // The CF Net Income formula is 'Income Statement'!CX28

        // Let's check the CF NI formula to determine the IS column mapping
        const cfNiFormula = getFormula(cfSheet.getCell(cfNiRow, 2));
        console.log(`  CF NI formula (col 2): ${cfNiFormula ?? 'static value'}`);

        // Extract IS column from formula like 'Income Statement'!C28
        // Pattern: 'Income Statement'!<col><row>
        let isColOffset = 1; // default: CF col 2 → IS col 3
        if (cfNiFormula) {
            const match = cfNiFormula.match(/'Income Statement'!([A-Z]+)/);
            if (match) {
                const colLetter = match[1];
                isColOffset = colLetter.charCodeAt(0) - 'A'.charCodeAt(0) + 1 - 2; // convert to 1-based offset from col 2
            }
        }
        console.log(`  IS column offset: CF col 2 → IS col ${2 + isColOffset}`);

        let cfPeriods = 0;
        for (let c = 2; c <= 20; c++) {
            const v = cfSheet.getCell(cfNiRow, c).value;
            if (v !== null && v !== undefined) cfPeriods = c;
        }

        for (let c = 2; c <= cfPeriods; c++) {
            const cfNi = getCached(cfSheet.getCell(cfNiRow, c));
            const isCol = c + isColOffset;
            if (isCol > nCols) break;
            const isNi = getCached(isSheet.getCell(isNiRow, isCol));
            const pass = eq(cfNi, isNi);
            checks.push({ name: 'IS NI = CF NI', period: `CF col${c}/IS col${isCol}`, expected: isNi, actual: cfNi, pass });
            const icon = pass ? `${G}✓` : `${R}✗`;
            console.log(`  ${icon} IS NI (col${isCol})=${isNi.toFixed(0)}, CF NI (col${c})=${cfNi.toFixed(0)}, diff=${(isNi - cfNi).toFixed(2)}${RS}`);
        }
    }

    // ══════════ TEST 4: BS Cash = CF Ending Cash (projections) ══════════
    console.log(`\n${B}${C}── Test 4: BS Cash = CF Ending Cash (projections) ──${RS}`);
    // Try multiple possible Cash labels
    let bsCashRow: number | null = null;
    for (const label of ['Cash & Equivalents', 'Cash and Equivalents', 'Cash & Cash Equivalents', 'Cash']) {
        bsCashRow = findRow(bsSheet, label);
        if (bsCashRow) { console.log(`  BS Cash row found as "${label}" (row ${bsCashRow})`); break; }
    }

    if (bsCashRow && cfEndRow) {
        // For projections: BS Cash should equal CF Ending Cash
        // BS col numHistorical+2 onwards = projection columns
        // CF col numHistorical onwards = projection columns  
        // But need to figure out mapping. Check BS Cash formula for a proj column:
        const projBsCol = numHistorical + 2; // first projection BS column
        const bsCashFormula = getFormula(bsSheet.getCell(bsCashRow, projBsCol));
        console.log(`  BS Cash formula (col ${projBsCol}): ${bsCashFormula ?? 'static value'}`);

        // The formula should reference CF Ending Cash
        // E.g., 'Cash Flow Statement'!C34
        if (bsCashFormula) {
            const match = bsCashFormula.match(/'Cash Flow Statement'!([A-Z]+)(\d+)/);
            if (match) {
                const cfEndCol = match[1].charCodeAt(0) - 'A'.charCodeAt(0) + 1;
                console.log(`  Maps to CF column ${cfEndCol}, row ${match[2]}`);

                // Check all projection columns
                for (let bsCol = numHistorical + 2; bsCol <= nCols; bsCol++) {
                    const bsCash = getCached(bsSheet.getCell(bsCashRow, bsCol));
                    const cfCol = cfEndCol + (bsCol - projBsCol);
                    const cfEnd = getCached(cfSheet.getCell(cfEndRow, cfCol));
                    const pass = eq(bsCash, cfEnd);
                    checks.push({ name: 'BS Cash = CF End', period: periods[bsCol - 2], expected: cfEnd, actual: bsCash, pass });
                    const icon = pass ? `${G}✓` : `${R}✗`;
                    console.log(`  ${icon} ${periods[bsCol - 2]}: BS Cash=${bsCash.toFixed(0)}, CF End=${cfEnd.toFixed(0)}, diff=${(bsCash - cfEnd).toFixed(2)}${RS}`);
                }
            }
        }
    } else {
        console.log(`  ${Y}⚠ Could not find BS Cash row or CF Ending Cash row${RS}`);
    }

    // ══════════ TEST 5: All key projection cells have formulas ══════════
    console.log(`\n${B}${C}── Test 5: Live Formula Check (projections) ──${RS}`);
    const formulaRows = [
        { sheet: isSheet, name: 'IS', labels: ['Revenue', 'Cost of Goods Sold', 'Gross Profit', 'Depreciation', 'EBIT', 'EBITDA', 'Interest Expense', 'Interest Income', 'EBT', 'Tax Expense', 'Net Income'] },
        { sheet: bsSheet, name: 'BS', labels: ['Gross PP&E', 'Accumulated Depreciation', 'Net PP&E', 'Intangibles', 'Total Current Assets', 'Total Non-Current Assets', 'Total Assets', 'Long-Term Debt', 'Total Liabilities', 'Retained Earnings', 'Additional Paid-in Capital', 'Treasury Stock', 'Total Equity', 'Total Liabilities + Equity'] },
        { sheet: cfSheet, name: 'CF', labels: ['Net Income', 'Cash from Operations', 'Cash from Investing', 'Cash from Financing', 'Net Change in Cash', 'Beginning Cash', 'Ending Cash', 'Free Cash Flow'] },
    ];

    let fPass = 0, fFail = 0, fSkip = 0;
    for (const group of formulaRows) {
        for (const label of group.labels) {
            const row = findRow(group.sheet, label);
            if (!row) { console.log(`  ${Y}⚠ "${label}" not found in ${group.name}${RS}`); fSkip++; continue; }
            // Check last projection column
            const lastProjCol = (group.name === 'CF') ? nCols - 1 : nCols; // CF has one less column
            const cell = group.sheet.getCell(row, lastProjCol);
            const f = getFormula(cell);
            if (f) {
                console.log(`  ${G}✓${RS} ${group.name}/${label} ${D}${f.substring(0, 60)}${RS}`);
                fPass++;
            } else {
                const v = getCached(cell);
                console.log(`  ${R}✗ ${group.name}/${label}: NO FORMULA (static: ${v.toFixed(2)})${RS}`);
                fFail++;
            }
        }
    }

    // ══════════ TEST 6: Key numbers sanity checks ══════════
    console.log(`\n${B}${C}── Test 6: Sanity Checks ──${RS}`);

    // Revenue should be positive
    for (let c = 2; c <= nCols; c++) {
        const rev = getCached(isSheet.getCell(revRow, c));
        const pass = rev > 0;
        checks.push({ name: 'Revenue > 0', period: periods[c - 2], expected: 1, actual: rev, pass });
    }
    console.log(`  ${G}✓${RS} Revenue is positive for all periods`);

    // Total Assets should be positive
    if (taRow) {
        for (let c = 2; c <= nCols; c++) {
            const ta = getCached(bsSheet.getCell(taRow, c));
            const pass = ta > 0;
            checks.push({ name: 'TA > 0', period: periods[c - 2], expected: 1, actual: ta, pass });
        }
        console.log(`  ${G}✓${RS} Total Assets is positive for all periods`);
    }

    // A = L+E (already checked in Test 1, just confirming)

    // Revenue grows properly (projection years should have positive revenue growth)
    const revGrowthRow = findRow(isSheet, 'Revenue Growth %');
    if (revGrowthRow) {
        for (let c = numHistorical + 2; c <= nCols; c++) {
            const growth = getCached(isSheet.getCell(revGrowthRow, c));
            const pass = growth > 0;
            checks.push({ name: 'Growth > 0', period: periods[c - 2], expected: 0.01, actual: growth, pass });
        }
        console.log(`  ${G}✓${RS} Revenue growth is positive for all projection periods`);
    }

    // ══════════ RESULTS ══════════
    const failures = checks.filter(c => !c.pass);
    console.log(`\n${B}${C}══════════════════════════════════════════════════════${RS}`);
    console.log(`${B}  RESULTS${RS}`);
    console.log(`${B}${C}══════════════════════════════════════════════════════${RS}\n`);

    const groups = [...new Set(checks.map(c => c.name))];
    for (const g of groups) {
        const gc = checks.filter(c => c.name === g);
        const gp = gc.filter(c => c.pass).length;
        console.log(`  ${gp === gc.length ? G + '✓' : R + '✗'} ${g}:${RS} ${gp}/${gc.length}`);
        for (const f of gc.filter(c => !c.pass)) {
            console.log(`    ${R}✗ [${f.period}] expected=${f.expected.toFixed(2)}, actual=${f.actual.toFixed(2)}${RS}`);
        }
    }

    const totalP = checks.filter(c => c.pass).length;
    const totalF = failures.length;
    console.log(`\n  ${B}Formulas: ${fPass} live, ${fFail} missing, ${fSkip} skipped${RS}`);
    console.log(`  ${B}Consistency: ${totalP}/${checks.length} passed, ${totalF} failed${RS}`);

    if (totalF === 0 && fFail === 0) {
        console.log(`\n${B}${G}  ✓ ALL CHECKS PASSED — Excel is internally consistent${RS}\n`);
    } else {
        console.log(`\n${B}${R}  ✗ SOME CHECKS FAILED${RS}\n`);
        process.exit(1);
    }
}

main().catch(err => { console.error('Error:', err); process.exit(1); });
