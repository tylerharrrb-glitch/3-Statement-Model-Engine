const ExcelJS = require('exceljs');

async function main() {
    const wb = new ExcelJS.Workbook();
    const filePath = 'C:/Users/user/Downloads/Demo_Company_Inc__Financial_Model.xlsx';
    try {
        await wb.xlsx.readFile(filePath);
    } catch (e) {
        console.log('File not found at', filePath, '\nError:', e.message);
        return;
    }

    const aSheet = wb.getWorksheet('Assumptions');
    const isSheet = wb.getWorksheet('Income Statement');
    const bsSheet = wb.getWorksheet('Balance Sheet');
    const cfSheet = wb.getWorksheet('Cash Flow Statement');

    // Helper: show cell content
    function cellInfo(sheet, row, col) {
        const cell = sheet.getCell(row, col);
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v) {
            return `F="${v.formula}" res=${v.result}`;
        }
        return `V=${v}`;
    }

    // Show last column (col 9 = column I = 2028E, index 7)
    const lastCol = 9; // Column I = 2028E
    const firstProjCol = 5; // Column E = 2024E

    console.log('=== ASSUMPTIONS TAB (all rows) ===');
    if (aSheet) {
        aSheet.eachRow((row, rowNum) => {
            const label = String(row.getCell(1).value || '').trim().padEnd(40);
            const vals = [];
            for (let c = 2; c <= lastCol; c++) {
                vals.push(String(row.getCell(c).value ?? 'null').substring(0, 12));
            }
            console.log(`R${String(rowNum).padStart(2)}: ${label} ${vals.join(' | ')}`);
        });
    }

    console.log('\n=== INCOME STATEMENT (all rows, cols B & I) ===');
    if (isSheet) {
        isSheet.eachRow((row, rowNum) => {
            const label = String(row.getCell(1).value || '').trim();
            if (!label) return;
            const b = cellInfo(isSheet, rowNum, 2);
            const i = cellInfo(isSheet, rowNum, lastCol);
            console.log(`R${String(rowNum).padStart(2)}: ${label.padEnd(35)} B: ${b.padEnd(40)} I: ${i}`);
        });
    }

    console.log('\n=== BALANCE SHEET (all rows, cols B & I) ===');
    if (bsSheet) {
        bsSheet.eachRow((row, rowNum) => {
            const label = String(row.getCell(1).value || '').trim();
            if (!label) return;
            const b = cellInfo(bsSheet, rowNum, 2);
            const i = cellInfo(bsSheet, rowNum, lastCol);
            console.log(`R${String(rowNum).padStart(2)}: ${label.padEnd(35)} B: ${b.padEnd(40)} I: ${i}`);
        });
    }

    console.log('\n=== CASH FLOW STATEMENT (all rows, cols B & I) ===');
    if (cfSheet) {
        cfSheet.eachRow((row, rowNum) => {
            const label = String(row.getCell(1).value || '').trim();
            if (!label) return;
            const b = cellInfo(cfSheet, rowNum, 2);
            const i = cellInfo(cfSheet, rowNum, lastCol);
            console.log(`R${String(rowNum).padStart(2)}: ${label.padEnd(35)} B: ${b.padEnd(40)} I: ${i}`);
        });
    }

    console.log('\nDone!');
}

main().catch(e => console.error('Error:', e.message));
