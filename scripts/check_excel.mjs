// Diagnostic: inspect the exported Excel file
import ExcelJS from 'exceljs';
import { readdir } from 'fs/promises';
import { join } from 'path';

// Find the most recent WOLF Excel file in Downloads
const dlDir = join(process.env.USERPROFILE || '', 'Downloads');
const files = await readdir(dlDir);
const wolfFiles = files
    .filter(f => f.includes('WOLF') && f.endsWith('.xlsx'))
    .sort()
    .reverse();

if (wolfFiles.length === 0) {
    console.log('No WOLF Excel files found in Downloads');
    process.exit(1);
}

const filePath = join(dlDir, wolfFiles[0]);
console.log(`\n=== Inspecting: ${wolfFiles[0]} ===\n`);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(filePath);

// 1. Sheet order
console.log('=== SHEET ORDER ===');
wb.worksheets.forEach((ws, i) => console.log(`  ${i + 1}. ${ws.name}`));

// 2. Check Scenarios sheet
const scenSheet = wb.getWorksheet('Scenarios');
if (!scenSheet) {
    console.log('\n❌ Scenarios sheet NOT FOUND!');
} else {
    console.log('\n=== SCENARIOS SHEET ===');
    console.log(`  Row count: ${scenSheet.rowCount}`);
    // Check first few rows for scenario block headers
    for (let r = 1; r <= Math.min(scenSheet.rowCount, 200); r++) {
        const val = scenSheet.getCell(r, 1).value;
        if (typeof val === 'string' && val.includes('▎')) {
            console.log(`  Row ${r}: ${val}`);
        }
    }
    // Check a data row value
    const sampleRow = 7; // should be near first data
    const sampleVal = scenSheet.getCell(sampleRow, 5).value;
    console.log(`  Sample cell (${sampleRow},5): ${JSON.stringify(sampleVal)}`);
}

// 3. Check Assumptions sheet IF formulas
const aSheet = wb.getWorksheet('Assumptions');
if (!aSheet) {
    console.log('\n❌ Assumptions sheet NOT FOUND!');
} else {
    console.log('\n=== ASSUMPTIONS SHEET — checking for IF formulas ===');
    let formulaCount = 0;
    let plainCount = 0;
    // Check projection columns (numHistorical+2 to nYears+1)
    // Find first projection column by looking at period headers
    const periods = [];
    for (let c = 2; c <= 20; c++) {
        const v = aSheet.getCell(1, c).value;
        if (v) periods.push({ col: c, value: String(v) });
    }
    console.log(`  Periods: ${periods.map(p => p.value).join(', ')}`);

    const firstProjCol = periods.findIndex(p => String(p.value).includes('E')) + 2;
    console.log(`  First projection column: ${firstProjCol}`);

    // Check rows 2-60 at the first projection column
    for (let r = 2; r <= Math.min(aSheet.rowCount, 60); r++) {
        const cell = aSheet.getCell(r, firstProjCol);
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) {
            const f = v.formula;
            if (f.includes('IF(')) {
                formulaCount++;
                if (formulaCount <= 5) {
                    const label = aSheet.getCell(r, 1).value;
                    console.log(`  Row ${r} [${label}]: IF formula ✓ → ${f.substring(0, 100)}`);
                }
            }
        } else if (typeof v === 'number') {
            plainCount++;
        }
    }
    console.log(`  Total IF formulas in proj cols: ${formulaCount}`);
    console.log(`  Total plain numbers in proj cols: ${plainCount}`);

    // Check scenario control row
    for (let r = 2; r <= aSheet.rowCount; r++) {
        const v = aSheet.getCell(r, 1).value;
        if (typeof v === 'string' && v.includes('Active Scenario')) {
            console.log(`\n  Scenario control row: ${r}`);
            const ctrlCell = aSheet.getCell(r, 2).value;
            console.log(`  Control cell value: ${JSON.stringify(ctrlCell)}`);
            break;
        }
    }
}

// 4. Check Dashboard B6
const dashSheet = wb.getWorksheet('Dashboard');
if (dashSheet) {
    console.log('\n=== DASHBOARD B6 ===');
    const b6 = dashSheet.getCell('B6');
    console.log(`  B6 value: ${JSON.stringify(b6.value)}`);
    console.log(`  B6 dataValidation: ${JSON.stringify(b6.dataValidation)}`);
}

console.log('\n=== DONE ===');
