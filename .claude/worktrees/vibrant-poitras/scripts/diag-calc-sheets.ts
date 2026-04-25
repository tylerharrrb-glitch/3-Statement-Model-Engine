// Diagnostic: Verify calc sheets exist and contain formulas
import ExcelJS from 'exceljs';

async function main() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('Demo_Company_Inc__Financial_Model.xlsx');

    console.log('=== Sheet Names ===');
    wb.worksheets.forEach(ws => {
        console.log(`  "${ws.name}" state=${ws.state}`);
    });

    // Check calc sheets
    for (const name of ['_Calc_Base', '_Calc_Opt', '_Calc_Con']) {
        const ws = wb.getWorksheet(name);
        if (!ws) {
            console.log(`\n❌ ${name} NOT FOUND`);
            continue;
        }
        console.log(`\n✅ ${name} (state=${ws.state})`);

        // Check some key cells (projected years start at column 5 = 2024E for 3-hist model)
        const checkRows = [
            { row: 2, label: 'Revenue' },
            { row: 19, label: 'Net Income' },
            { row: 21, label: 'Cash' },
            { row: 58, label: 'Total L+E' },
            { row: 59, label: 'Balance Check' },
            { row: 73, label: 'CFO' },
            { row: 89, label: 'End Cash' },
        ];
        for (const { row, label } of checkRows) {
            // Check if column 5 (first projected) has a formula
            const cell = ws.getCell(row, 5);
            const val = cell.value;
            const hasFormula = val && typeof val === 'object' && 'formula' in val;
            console.log(`  Row ${row} (${label}): ${hasFormula ? '📐 FORMULA: ' + (val as any).formula?.substring(0, 60) : '📊 VALUE: ' + val}`);
        }
    }

    // Check Scenarios tab computed rows for formulas
    const scenWs = wb.getWorksheet('Scenarios');
    if (scenWs) {
        console.log('\n=== Scenarios Tab — Checking Computed Rows ===');
        // Find "Engine-Computed Values" header
        let engineSection = false;
        let formulaCount = 0;
        let staticCount = 0;
        for (let r = 1; r <= 200; r++) {
            const labelCell = scenWs.getCell(r, 1);
            const label = String(labelCell.value ?? '');
            if (label.includes('Engine-Computed')) {
                engineSection = true;
                continue;
            }
            if (engineSection && label.includes('──')) {
                // Still in computed or dashboard section
                continue;
            }
            if (engineSection) {
                if (!label || label.trim() === '') continue;
                // Check projected columns (5-9 typically)
                for (let c = 5; c <= 9; c++) {
                    const cell = scenWs.getCell(r, c);
                    const val = cell.value;
                    const hasFormula = val && typeof val === 'object' && 'formula' in val;
                    if (hasFormula) formulaCount++;
                    else if (typeof val === 'number') staticCount++;
                }
            }
        }
        console.log(`  Projected cells in computed/output sections: ${formulaCount} formulas, ${staticCount} static`);
    }
}

main().catch(console.error);
