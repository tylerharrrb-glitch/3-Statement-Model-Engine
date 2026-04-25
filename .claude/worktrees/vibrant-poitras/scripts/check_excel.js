// Deep diagnostic of the WOLF Excel file
const ExcelJS = require('exceljs');
const { readdirSync, statSync } = require('fs');
const path = require('path');

async function main() {
    const dlDir = path.join(process.env.USERPROFILE || '', 'Downloads');
    const filePath = path.join(dlDir, 'WOLF_Financial_Model.xlsx');

    const stats = statSync(filePath);
    console.log(`File: WOLF_Financial_Model.xlsx`);
    console.log(`Modified: ${stats.mtime.toISOString()}`);
    console.log(`Size: ${stats.size} bytes\n`);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePath);

    // 1. Sheet order
    console.log('=== SHEET ORDER ===');
    wb.worksheets.forEach((ws, i) => console.log(`  ${i + 1}. ${ws.name}`));

    // 2. Scenarios sheet - count blocks
    const scenSheet = wb.getWorksheet('Scenarios');
    if (!scenSheet) {
        console.log('\n❌ Scenarios sheet NOT FOUND!');
        return;
    }

    console.log('\n=== SCENARIOS SHEET ===');
    console.log(`  Total rows: ${scenSheet.rowCount}`);

    // Find all block headers (▎ markers)
    const blocks = [];
    for (let r = 1; r <= scenSheet.rowCount; r++) {
        const val = String(scenSheet.getCell(r, 1).value || '');
        if (val.includes('▎')) {
            blocks.push({ row: r, name: val });
            console.log(`  Block at row ${r}: ${val}`);
        }
    }
    console.log(`  Total blocks: ${blocks.length}`);

    // Check data in each block
    for (const block of blocks) {
        let dataCount = 0;
        for (let r = block.row; r <= Math.min(block.row + 70, scenSheet.rowCount); r++) {
            const nextBlock = blocks.find(b => b.row > block.row && b.row <= r);
            if (nextBlock && r >= nextBlock.row) break;
            const v = scenSheet.getCell(r, 5).value;
            if (typeof v === 'number') dataCount++;
        }
        console.log(`  Data rows in "${block.name}": ${dataCount}`);
    }

    // 3. Assumptions sheet - check formulas in projection columns
    const aSheet = wb.getWorksheet('Assumptions');
    if (!aSheet) {
        console.log('\n❌ Assumptions sheet NOT FOUND!');
        return;
    }

    console.log('\n=== ASSUMPTIONS SHEET ===');
    const periods = [];
    for (let c = 2; c <= 20; c++) {
        const v = aSheet.getCell(1, c).value;
        if (v) periods.push({ col: c, value: String(v) });
    }
    console.log(`  Periods: ${periods.map(p => `${p.value}(col${p.col})`).join(', ')}`);

    const firstProjIdx = periods.findIndex(p => String(p.value).includes('E'));
    const firstProjCol = firstProjIdx >= 0 ? firstProjIdx + 2 : -1;
    console.log(`  First projection column: ${firstProjCol}`);

    // Check ALL cells in first projection column
    let ifForms = 0, plainNums = 0, otherForms = 0;
    for (let r = 2; r <= aSheet.rowCount; r++) {
        const cell = aSheet.getCell(r, firstProjCol);
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) {
            const f = v.formula;
            if (f.includes('IF(')) {
                ifForms++;
                if (ifForms <= 3) {
                    const label = aSheet.getCell(r, 1).value;
                    console.log(`  ✓ Row ${r} [${label}]: IF formula → ${f.substring(0, 130)}`);
                }
            } else {
                otherForms++;
            }
        } else if (typeof v === 'number') {
            plainNums++;
        }
    }
    console.log(`  IF formulas: ${ifForms}`);
    console.log(`  Other formulas: ${otherForms}`);
    console.log(`  Plain numbers: ${plainNums}`);

    // 4. Scenario control
    for (let r = 2; r <= aSheet.rowCount; r++) {
        const v = aSheet.getCell(r, 1).value;
        if (typeof v === 'string' && v.includes('Active Scenario')) {
            console.log(`\n  Scenario control at row ${r}:`);
            console.log(`    B${r} = ${JSON.stringify(aSheet.getCell(r, 2).value)}`);
            break;
        }
    }

    // 5. Dashboard B6
    const dashSheet = wb.getWorksheet('Dashboard');
    if (dashSheet) {
        console.log('\n=== DASHBOARD ===');
        console.log(`  B6 value: ${JSON.stringify(dashSheet.getCell('B6').value)}`);
        console.log(`  B6 validation: ${JSON.stringify(dashSheet.getCell('B6').dataValidation)}`);
    }

    console.log('\n=== DONE ===');
}

main().catch(console.error);
