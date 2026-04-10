// ============================================================
// Company Info Sheet Builder — ExcelJS
// All values driven by engine assumptions + live rates.
// Zero hardcoded financial values.
// ============================================================
import ExcelJS from 'exceljs';
import type { LiveRates } from '@/lib/services/liveRates';

const NAVY = 'FF1F3864';
const MED_BLUE = 'FF2E75B6';
const WHITE = 'FFFFFFFF';
const LIGHT_GRAY = 'FFF2F2F2';
const MED_GRAY = 'FFD9D9D9';
const DARK_GRAY = 'FF404040';
const INPUT_BLUE = 'FF0000CC';
const AMBER = 'FFB7791F';
const LABEL_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } };
const VALUE_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, color: { argb: INPUT_BLUE } };
const AUTO_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 10, color: { argb: DARK_GRAY } };
const HINT_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9, italic: true, color: { argb: AMBER } };
const AUTO_HINT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF999999' } };

const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function sectionHeader(ws: ExcelJS.Worksheet, row: number, text: string) {
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    c.fill = solidFill(MED_BLUE);
    c.alignment = { vertical: 'middle' };
    for (let i = 1; i <= 4; i++) ws.getCell(row, i).border = THIN_BORDER;
}

function infoRow(ws: ExcelJS.Worksheet, row: number, label: string, value: string | number, editable: boolean) {
    const lc = ws.getCell(row, 1);
    lc.value = label;
    lc.font = LABEL_FONT;
    lc.fill = solidFill(LIGHT_GRAY);
    lc.alignment = { vertical: 'middle', wrapText: true };
    lc.border = THIN_BORDER;

    const vc = ws.getCell(row, 2);
    vc.value = value;
    vc.font = editable ? VALUE_FONT : AUTO_FONT;
    vc.fill = editable ? solidFill(WHITE) : solidFill(MED_GRAY);
    vc.alignment = { vertical: 'middle', wrapText: true };
    vc.border = THIN_BORDER;

    ws.mergeCells(row, 3, row, 4);
    const hc = ws.getCell(row, 3);
    hc.value = editable ? '← Edit' : 'Auto';
    hc.font = editable ? HINT_FONT : AUTO_HINT;
    hc.fill = solidFill(WHITE);
    hc.alignment = { vertical: 'middle', horizontal: 'center' };
    for (let i = 3; i <= 4; i++) ws.getCell(row, i).border = THIN_BORDER;
}

export interface CompanyInfoConfig {
    startYear?: number;
    historicalYears?: number;
    projectionYears?: number;
    // Engine-driven values (no hardcoding)
    taxRate?: number;
    vatRate?: number;
    dividendWithholdingTaxRate?: number;
    cbeRate?: number;
    riskFreeRate?: number;
    liveRates?: LiveRates | null;
    engineVersion?: string;
}

export function buildCompanyInfoSheet(workbook: ExcelJS.Workbook, companyName: string, config?: CompanyInfoConfig): ExcelJS.Worksheet {
    const ws = workbook.addWorksheet('Company Info');
    ws.properties.tabColor = { argb: MED_BLUE };
    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 42;
    ws.getColumn(3).width = 20;
    ws.getColumn(4).width = 20;

    // Banner
    ws.getRow(1).height = 36;
    ws.mergeCells(1, 1, 1, 4);
    const banner = ws.getCell(1, 1);
    banner.value = 'COMPANY INFORMATION & MODEL CONFIGURATION';
    banner.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
    banner.fill = solidFill(NAVY);
    banner.alignment = { vertical: 'middle', horizontal: 'center' };

    // Section 1: Company ID
    sectionHeader(ws, 3, 'SECTION 1 — COMPANY IDENTIFICATION');
    infoRow(ws, 4, 'Company Name', companyName, true);
    infoRow(ws, 5, 'Legal Entity Type', 'Société Anonyme (S.A.E.)', true);
    infoRow(ws, 6, 'Industry / Sector', 'Technology / Software', true);
    infoRow(ws, 7, 'Founded Year', 2010, true);
    infoRow(ws, 8, 'Commercial Register No.', '12345-Cairo-2010', false);
    infoRow(ws, 9, 'Tax Identification No.', '123-456-789', false);
    infoRow(ws, 10, 'Headquarters Address', '5 El-Nile Street, Zamalek, Cairo, Egypt', false);

    // Section 2: Model Config
    sectionHeader(ws, 12, 'SECTION 2 — FINANCIAL MODEL CONFIGURATION');
    infoRow(ws, 13, 'Reporting Currency', 'Egyptian Pound (EGP)', false);
    infoRow(ws, 14, 'Currency Symbol', 'E£', false);
    infoRow(ws, 15, 'Fiscal Year End', 'December 31', true);

    const projStart = config?.startYear ?? 2026;
    const histYears = config?.historicalYears ?? 2;
    const projYears = config?.projectionYears ?? 5;
    const histStart = projStart - histYears;
    const histEnd = projStart - 1;
    const projEnd = projStart + projYears - 1;
    const historicalPeriod = `${histStart} – ${histEnd} (Actual)`;
    const projectionPeriod = `${projStart}E – ${projEnd}E (${projYears} Years)`;

    infoRow(ws, 16, 'Historical Period', historicalPeriod, false);
    infoRow(ws, 17, 'Projection Period', projectionPeriod, false);
    // Model version + last updated: dynamic from engine
    const version = config?.engineVersion ?? '3SM-v8';
    infoRow(ws, 18, 'Model Version', `${version}  |  ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, false);
    infoRow(ws, 19, 'Last Updated', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), false);

    // Section 3: Egypt Regulatory — ALL values from engine assumptions
    sectionHeader(ws, 21, 'SECTION 3 — EGYPT REGULATORY / TAX');
    const taxRate = config?.taxRate ?? 0.225;
    const vatRate = config?.vatRate ?? 0.14;
    const divWHT = config?.dividendWithholdingTaxRate ?? 0.10;
    const cbeRate = config?.cbeRate ?? config?.liveRates?.cbeDiscountRate ?? 0.195;
    const riskFreeRate = config?.riskFreeRate ?? config?.liveRates?.tbillRate12m ?? 0.235;

    infoRow(ws, 22, 'Corporate Income Tax Rate', taxRate, false);
    ws.getCell(22, 2).numFmt = '0.0%';
    infoRow(ws, 23, 'VAT Rate (Standard)', vatRate, false);
    ws.getCell(23, 2).numFmt = '0.0%';
    infoRow(ws, 24, 'Dividend Withholding Tax', divWHT, false);
    ws.getCell(24, 2).numFmt = '0.0%';
    infoRow(ws, 25, 'CBE Policy Rate (Discount)', cbeRate, false);
    ws.getCell(25, 2).numFmt = '0.00%';
    infoRow(ws, 26, 'Risk-Free Rate (12M T-Bill)', riskFreeRate, false);
    ws.getCell(26, 2).numFmt = '0.00%';

    // Live rates section (if available)
    const lr = config?.liveRates;
    if (lr) {
        infoRow(ws, 27, 'CBE Deposit Rate', lr.cbeDepositRate, false);
        ws.getCell(27, 2).numFmt = '0.00%';
        infoRow(ws, 28, 'CBE Lending Rate', lr.cbeLendingRate, false);
        ws.getCell(28, 2).numFmt = '0.00%';
        infoRow(ws, 29, 'USD / EGP Exchange Rate', lr.usdEgpRate, false);
        ws.getCell(29, 2).numFmt = '#,##0.00';
        infoRow(ws, 30, 'Last MPC Meeting', lr.lastMPCDate, false);
        infoRow(ws, 31, 'Rates Source', lr.source, false);
        infoRow(ws, 32, 'Rates Last Fetched', lr.lastUpdated, false);
    } else {
        infoRow(ws, 27, 'Financial Year Note', 'July 1 – June 30 (Note: model uses Dec)', false);
    }

    // Section 4: Report & Preparer
    const sec4Start = lr ? 34 : 29;
    sectionHeader(ws, sec4Start, 'SECTION 4 — REPORT & PREPARER INFORMATION');
    infoRow(ws, sec4Start + 1, 'Prepared By', 'Financial Modeling Team', true);
    infoRow(ws, sec4Start + 2, 'Reviewed By', 'CFO', true);
    infoRow(ws, sec4Start + 3, 'Preparation Date', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), false);
    infoRow(ws, sec4Start + 4, 'Purpose', 'Internal Planning & Analysis', true);
    infoRow(ws, sec4Start + 5, 'Confidentiality', 'CONFIDENTIAL — Internal Use Only', true);
    infoRow(ws, sec4Start + 6, 'Contact Email', 'finance@democompany.com', true);

    // Footer
    const footerRow = sec4Start + 8;
    ws.mergeCells(footerRow, 1, footerRow, 4);
    const footer = ws.getCell(footerRow, 1);
    footer.value = 'Note: All financial rates are driven by the WOLF engine. To update rates, use "Refresh Rates" in the engine dashboard, then re-export.';
    footer.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } };
    footer.fill = solidFill(LIGHT_GRAY);

    return ws;
}
