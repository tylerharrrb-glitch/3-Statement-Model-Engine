import ExcelJS from 'exceljs';

async function main() {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile('TEST_CalcSheets_Lean.xlsx');
    const ws = wb.getWorksheet('_Calc_Base')!;

    console.log('=== Interest Income (Row 14) — Circularity Check ===');
    for (let c = 5; c <= 9; c++) {
        const cell = ws.getCell(14, c);
        const v = cell.value as any;
        const formula = v?.formula || 'NO FORMULA';
        // Current-period cash col letter
        const curCashRef = String.fromCharCode(65 + c - 2) + '21';
        const hasCircular = formula.includes(curCashRef);
        console.log(`  Col ${c}: ${formula} ${hasCircular ? '⚠️ CIRCULAR' : '✅ NON-CIRCULAR'}`);
    }

    console.log('\n=== Interest Expense (Row 15) ===');
    for (let c = 5; c <= 9; c++) {
        const cell = ws.getCell(15, c);
        const v = cell.value as any;
        const formula = v?.formula || 'NO FORMULA';
        console.log(`  Col ${c}: ${formula}`);
    }
}

main().catch(console.error);
