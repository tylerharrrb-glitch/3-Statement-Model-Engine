// ============================================================
// Dashboard Sheet Builder — ExcelJS
// ============================================================
import ExcelJS from 'exceljs';
import { ModelResults } from '@/types/financial';
import type { ScenarioRowMap } from './build-scenarios';

const NAVY = 'FF1F3864';
const MED_BLUE = 'FF2E75B6';
const WHITE = 'FFFFFFFF';
const LIGHT_BLUE = 'FFD6E4F0';
const VERY_LIGHT_BLUE = 'FFEBF3FB';
const LIGHT_GRAY = 'FFF2F2F2';
const MED_GRAY = 'FFD9D9D9';
const DARK_GRAY = 'FF404040';
const AMBER = 'FFB7791F';
const LIGHT_AMBER = 'FFFFF3E0';
const GREEN = 'FF1A7A4A';
const LIGHT_GREEN = 'FFE8F4EA';
const DARK_GREEN = 'FF004400';
const RED = 'FFC0392B';
const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};

function colLetter(col: number): string {
    let s = '';
    let c = col;
    while (c > 0) { c--; s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26); }
    return s;
}

interface RowMaps {
    isRows: Record<string, number>;
    bsRows: Record<string, number>;
    cfRows: Record<string, number>;
    ratioRows: Record<string, number>;
    dbtRows: Record<string, number>;
}

export function buildDashboardSheet(
    workbook: ExcelJS.Workbook,
    companyName: string,
    periods: string[],
    results: ModelResults,
    rowMaps: RowMaps,
    scenarioRows: ScenarioRowMap,
    numHistorical: number,
): ExcelJS.Worksheet {
    const ws = workbook.addWorksheet('Dashboard');
    ws.properties.tabColor = { argb: NAVY };
    const nYears = periods.length;
    ws.getColumn(1).width = 24;
    for (let i = 0; i < nYears; i++) ws.getColumn(i + 2).width = 16;
    ws.getColumn(nYears + 2).width = 16;
    ws.getColumn(nYears + 3).width = 16;
    const lastCol = nYears + 3;
    const { isRows, bsRows, cfRows, ratioRows, dbtRows } = rowMaps;

    // ── Section A: Company Banner ───────────────
    ws.getRow(1).height = 48;
    ws.mergeCells(1, 1, 1, lastCol);
    const banner = ws.getCell(1, 1);
    banner.value = companyName;
    banner.font = { name: 'Calibri', size: 22, bold: true, color: { argb: WHITE } };
    banner.fill = solidFill(NAVY);
    banner.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.getRow(2).height = 22;
    ws.mergeCells(2, 1, 2, lastCol);
    const sub = ws.getCell(2, 1);
    sub.value = 'FINANCIAL MODEL DASHBOARD  ·  E£ (Egyptian Pound)  ·  CONFIDENTIAL';
    sub.font = { name: 'Calibri', size: 11, color: { argb: WHITE } };
    sub.fill = solidFill(MED_BLUE);
    sub.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.getRow(3).height = 6;
    ws.mergeCells(3, 1, 3, lastCol);
    ws.getCell(3, 1).fill = solidFill(LIGHT_BLUE);

    // ── Section B: Scenario Control ─────────────
    ws.mergeCells(4, 1, 4, lastCol);
    const ctrlHeader = ws.getCell(4, 1);
    ctrlHeader.value = '📊  SCENARIO CONTROL';
    ctrlHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
    ctrlHeader.fill = solidFill(MED_BLUE);

    // Row 5: labels
    ws.getCell(5, 1).value = 'Active Scenario';
    ws.getCell(5, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } };
    ws.getCell(5, 1).fill = solidFill(LIGHT_GRAY);
    ws.getCell(5, 1).border = THIN_BORDER;
    ws.mergeCells(5, 2, 5, 4);
    ws.getCell(5, 2).value = 'Select Scenario →';
    ws.getCell(5, 2).font = { name: 'Calibri', size: 10, italic: true, color: { argb: AMBER } };
    ws.getCell(5, 2).fill = solidFill(LIGHT_AMBER);
    ws.getCell(5, 2).alignment = { horizontal: 'center' };

    // Row 6: Dropdown
    ws.getCell(6, 1).value = '▼ Scenario Selector';
    ws.getCell(6, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: WHITE } };
    ws.getCell(6, 1).fill = solidFill(NAVY);
    ws.getCell(6, 1).border = THIN_BORDER;

    ws.mergeCells(6, 2, 6, 4);
    const dropCell = ws.getCell(6, 2);
    dropCell.value = 'Base Case';
    dropCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: NAVY } };
    dropCell.fill = solidFill(LIGHT_BLUE);
    dropCell.alignment = { horizontal: 'center', vertical: 'middle' };
    const medBorder: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: MED_BLUE } };
    dropCell.border = { top: medBorder, bottom: medBorder, left: medBorder, right: medBorder };
    // Data validation for dropdown
    dropCell.dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"Base Case,Optimistic,Conservative"'],
    };

    // Description formula
    ws.mergeCells(6, 5, 6, lastCol);
    ws.getCell(6, 5).value = {
        formula: 'IF(B6="Base Case","Central planning — stable market | Revenue 10%→5% | COGS 60%",IF(B6="Optimistic","Optimistic case — strong execution | Revenue 15%→8% | COGS 55%","Conservative case — headwinds | Revenue 5%→2% | COGS 63%"))',
        result: 'Central planning — stable market | Revenue 10%→5% | COGS 60%',
    };
    ws.getCell(6, 5).font = { name: 'Calibri', size: 9, italic: true, color: { argb: DARK_GRAY } };

    // Row 7: spacer
    ws.getRow(7).height = 6;
    ws.mergeCells(7, 1, 7, lastCol);
    ws.getCell(7, 1).fill = solidFill(LIGHT_BLUE);

    // ── Section C: Key Metrics ──────────────────
    ws.mergeCells(8, 1, 8, lastCol);
    const metricsHeader = ws.getCell(8, 1);
    metricsHeader.value = '📈  KEY METRICS — ACTIVE SCENARIO';
    metricsHeader.font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
    metricsHeader.fill = solidFill(NAVY);

    // Row 9: Period headers
    ws.getCell(9, 1).value = '';
    ws.getCell(9, 1).fill = solidFill(NAVY);
    ws.getCell(9, 1).border = THIN_BORDER;
    for (let i = 0; i < nYears; i++) {
        const hc = ws.getCell(9, i + 2);
        hc.value = periods[i];
        hc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
        hc.fill = solidFill(NAVY);
        hc.alignment = { horizontal: 'center' };
        hc.border = THIN_BORDER;
    }

    // Metric definitions with scenarioKey mapping to Scenarios sheet output rows
    type MetricDef = {
        label: string; scenarioKey: string;
        fmt: string; bold: boolean; isCF?: boolean;
    };

    const sectionRows: { label: string; metrics: MetricDef[] }[] = [
        {
            label: '📗  INCOME STATEMENT',
            metrics: [
                { label: 'Revenue (E£)', scenarioKey: 'out_revenue', fmt: '$#,##0', bold: true },
                { label: 'Revenue Growth %', scenarioKey: 'out_revenueGrowth', fmt: '0.0%', bold: false },
                { label: 'Gross Profit (E£)', scenarioKey: 'out_grossProfit', fmt: '$#,##0', bold: false },
                { label: 'Gross Margin %', scenarioKey: 'out_grossMargin', fmt: '0.0%', bold: false },
                { label: 'EBITDA (E£)', scenarioKey: 'out_ebitda', fmt: '$#,##0', bold: false },
                { label: 'EBIT (E£)', scenarioKey: 'out_ebit', fmt: '$#,##0', bold: false },
                { label: 'EBIT Margin %', scenarioKey: 'out_ebitMargin', fmt: '0.0%', bold: false },
                { label: 'Net Income (E£)', scenarioKey: 'out_netIncome', fmt: '$#,##0', bold: true },
                { label: 'Net Margin %', scenarioKey: 'out_netMargin', fmt: '0.0%', bold: false },
                { label: 'EPS (E£)', scenarioKey: 'out_eps', fmt: '$#,##0.00', bold: false },
            ],
        },
        {
            label: '💵  CASH FLOW',
            metrics: [
                { label: 'CFO (E£)', scenarioKey: 'out_cfo', fmt: '$#,##0', bold: false, isCF: true },
                { label: 'Free Cash Flow (E£)', scenarioKey: 'out_fcf', fmt: '$#,##0', bold: true, isCF: true },
                { label: 'Ending Cash (E£)', scenarioKey: 'out_endingCash', fmt: '$#,##0', bold: false, isCF: true },
            ],
        },
        {
            label: '🏦  BALANCE SHEET',
            metrics: [
                { label: 'Total Assets (E£)', scenarioKey: 'out_totalAssets', fmt: '$#,##0', bold: true },
                { label: 'Total Debt (E£)', scenarioKey: 'out_totalDebt', fmt: '$#,##0', bold: false },
                { label: 'Total Equity (E£)', scenarioKey: 'out_totalEquity', fmt: '$#,##0', bold: true },
                { label: 'Cash (E£)', scenarioKey: 'out_cash', fmt: '$#,##0', bold: false },
            ],
        },
        {
            label: '📊  KEY RATIOS',
            metrics: [
                { label: 'Current Ratio', scenarioKey: 'out_currentRatio', fmt: '0.00"x"', bold: false },
                { label: 'Debt / Equity', scenarioKey: 'out_debtToEquity', fmt: '0.00"x"', bold: false },
                { label: 'ROE %', scenarioKey: 'out_roe', fmt: '0.0%', bold: false },
                { label: 'ROIC %', scenarioKey: 'out_roic', fmt: '0.0%', bold: false },
                { label: 'ROA %', scenarioKey: 'out_roa', fmt: '0.0%', bold: false },
            ],
        },
    ];

    // Helper: build an IF formula that switches between 3 scenario rows
    // IF(Dashboard!$B$6="Base Case", Scenarios!{col}{baseRow},
    //   IF(Dashboard!$B$6="Optimistic", Scenarios!{col}{optRow}, Scenarios!{col}{conRow}))
    const scenarioIF = (col: string, scenarioKey: string): string | null => {
        const baseRow = scenarioRows[`Base Case_${scenarioKey}`];
        const optRow = scenarioRows[`Optimistic_${scenarioKey}`];
        const conRow = scenarioRows[`Conservative_${scenarioKey}`];
        if (!baseRow || !optRow || !conRow) return null;
        return `IF(Dashboard!$B$6="Base Case",Scenarios!${col}${baseRow},IF(Dashboard!$B$6="Optimistic",Scenarios!${col}${optRow},Scenarios!${col}${conRow}))`;
    };

    let row = 10;
    let altIdx = 0;
    const numCF = results.cashFlowStatements.length;

    for (const section of sectionRows) {
        ws.mergeCells(row, 1, row, lastCol);
        ws.getCell(row, 1).value = section.label;
        ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } };
        ws.getCell(row, 1).fill = solidFill(LIGHT_BLUE);
        row++;
        altIdx = 0;

        for (const m of section.metrics) {
            const bg = altIdx % 2 === 0 ? LIGHT_GRAY : WHITE;
            ws.getRow(row).height = 18;
            ws.getCell(row, 1).value = m.label;
            ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: m.bold, color: { argb: NAVY } };
            ws.getCell(row, 1).fill = solidFill(bg);
            ws.getCell(row, 1).border = THIN_BORDER;

            for (let i = 0; i < nYears; i++) {
                const dc = ws.getCell(row, i + 2);
                const c = colLetter(i + 2);

                // CF metrics: year 0 has no CF entry
                if (m.isCF && i === 0) {
                    dc.value = '—';
                } else {
                    // Build IF formula referencing Scenarios sheet
                    const formula = scenarioIF(c, m.scenarioKey);
                    if (formula) {
                        // Compute cached result from Base Case engine data
                        let cachedResult: number = 0;
                        if (m.isCF) {
                            const cfIdx = i - 1;
                            if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
                                const cf = results.cashFlowStatements[cfIdx];
                                const cfMap: Record<string, number> = {
                                    out_cfo: cf.cashFromOperations,
                                    out_fcf: cf.freeCashFlow,
                                    out_endingCash: cf.endingCash,
                                };
                                cachedResult = cfMap[m.scenarioKey] ?? 0;
                            }
                        } else {
                            // IS/BS/Ratios: direct mapping from engine results
                            if (i < results.incomeStatements.length) {
                                const is = results.incomeStatements[i];
                                const isMap: Record<string, number> = {
                                    out_revenue: is.revenue, out_revenueGrowth: is.revenueGrowthRate ?? 0,
                                    out_grossProfit: is.grossProfit, out_grossMargin: is.grossMargin ?? 0,
                                    out_ebitda: is.ebitda, out_ebit: is.ebit,
                                    out_ebitMargin: is.ebitMargin ?? 0, out_netIncome: is.netIncome,
                                    out_netMargin: is.netMargin ?? 0, out_eps: is.eps ?? 0,
                                };
                                if (m.scenarioKey in isMap) cachedResult = isMap[m.scenarioKey];
                            }
                            if (i < results.balanceSheets.length) {
                                const bs = results.balanceSheets[i];
                                const bsMap: Record<string, number> = {
                                    out_totalAssets: bs.totalAssets, out_totalEquity: bs.totalEquity,
                                    out_cash: bs.cash,
                                    out_totalDebt: (bs.shortTermDebt ?? 0) + (bs.longTermDebt ?? 0) + (bs.currentPortionLTD ?? 0),
                                };
                                if (m.scenarioKey in bsMap) cachedResult = bsMap[m.scenarioKey];
                            }
                            if (i < results.ratios.length) {
                                const rat = results.ratios[i];
                                const ratMap: Record<string, number> = {
                                    out_currentRatio: rat.currentRatio ?? 0, out_debtToEquity: rat.debtToEquity ?? 0,
                                    out_roe: rat.roe ?? 0, out_roic: rat.roic ?? 0, out_roa: rat.roa ?? 0,
                                };
                                if (m.scenarioKey in ratMap) cachedResult = ratMap[m.scenarioKey];
                            }
                        }
                        dc.value = { formula, result: cachedResult };
                        dc.numFmt = m.fmt;
                    } else {
                        dc.value = '—'; // scenario row not found
                    }
                }
                dc.font = { name: 'Calibri', size: 10, bold: m.bold, color: { argb: m.bold ? NAVY : DARK_GRAY } };
                dc.fill = solidFill(bg);
                dc.alignment = { horizontal: 'right' };
                dc.border = THIN_BORDER;
            }
            row++;
            altIdx++;
        }
    }

    // ── Spacer ──────────────────────────────────
    row++;
    ws.getRow(row).height = 6;
    ws.mergeCells(row, 1, row, lastCol);
    ws.getCell(row, 1).fill = solidFill(LIGHT_BLUE);
    row++;

    // ── Section D: Scenario Comparison (terminal year) ──
    ws.mergeCells(row, 1, row, lastCol);
    ws.getCell(row, 1).value = '⚖️  SCENARIO COMPARISON — Terminal Year';
    ws.getCell(row, 1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
    ws.getCell(row, 1).fill = solidFill(NAVY);
    row++;

    // Terminal year column letter in IS/BS (nYears + 1), CF (nYears)
    const termColIS = colLetter(nYears + 1);   // IS/BS terminal year column
    const numCFTotal = nYears - 1;
    const termColCF = colLetter(numCFTotal + 1); // CF terminal year column

    // Terminal year values using IF formulas referencing Scenarios sheet
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];
    const lastRatio = results.ratios[results.ratios.length - 1];

    interface CompMetric {
        label: string;
        formula: string | null;
        result: number;
        fmt: string;
    }

    // Use the terminal year column from the Scenarios sheet (same as IS/BS column)
    const compMetrics: CompMetric[] = [
        { label: 'Revenue', formula: scenarioIF(termColIS, 'out_revenue'), result: lastIS?.revenue ?? 0, fmt: '$#,##0' },
        { label: 'EBITDA', formula: scenarioIF(termColIS, 'out_ebitda'), result: lastIS?.ebitda ?? 0, fmt: '$#,##0' },
        { label: 'Net Income', formula: scenarioIF(termColIS, 'out_netIncome'), result: lastIS?.netIncome ?? 0, fmt: '$#,##0' },
        { label: 'Free Cash Flow', formula: scenarioIF(termColIS, 'out_fcf'), result: lastCF?.freeCashFlow ?? 0, fmt: '$#,##0' },
        { label: 'Cash Balance', formula: scenarioIF(termColIS, 'out_cash'), result: lastBS?.cash ?? 0, fmt: '$#,##0' },
        { label: 'Total Equity', formula: scenarioIF(termColIS, 'out_totalEquity'), result: lastBS?.totalEquity ?? 0, fmt: '$#,##0' },
        { label: 'ROE', formula: scenarioIF(termColIS, 'out_roe'), result: lastRatio?.roe ?? 0, fmt: '0.0%' },
        { label: 'ROIC', formula: scenarioIF(termColIS, 'out_roic'), result: lastRatio?.roic ?? 0, fmt: '0.0%' },
        { label: 'Gross Margin', formula: scenarioIF(termColIS, 'out_grossMargin'), result: lastRatio?.grossMargin ?? 0, fmt: '0.0%' },
    ];

    // Headers
    ws.getCell(row, 1).value = 'Metric';
    ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    ws.getCell(row, 1).fill = solidFill(NAVY);
    ws.getCell(row, 1).border = THIN_BORDER;
    ws.getCell(row, 2).value = 'Active Scenario';
    ws.getCell(row, 2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    ws.getCell(row, 2).fill = solidFill(NAVY);
    ws.getCell(row, 2).alignment = { horizontal: 'center' };
    ws.getCell(row, 2).border = THIN_BORDER;
    row++;

    for (let i = 0; i < compMetrics.length; i++) {
        const cm = compMetrics[i];
        const bg = i % 2 === 0 ? LIGHT_GRAY : WHITE;
        ws.getCell(row, 1).value = cm.label;
        ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } };
        ws.getCell(row, 1).fill = solidFill(bg);
        ws.getCell(row, 1).border = THIN_BORDER;
        if (cm.formula) {
            ws.getCell(row, 2).value = { formula: cm.formula, result: cm.result };
        } else {
            ws.getCell(row, 2).value = cm.result;
        }
        ws.getCell(row, 2).numFmt = cm.fmt;
        ws.getCell(row, 2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } };
        ws.getCell(row, 2).fill = solidFill(VERY_LIGHT_BLUE);
        ws.getCell(row, 2).alignment = { horizontal: 'right' };
        ws.getCell(row, 2).border = THIN_BORDER;
        row++;
    }

    // Footer
    row++;
    ws.mergeCells(row, 1, row, lastCol);
    ws.getCell(row, 1).value = '⚠ The scenario selector (B6) drives the entire model. Edit scenario values in the Scenarios sheet.';
    ws.getCell(row, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: AMBER } };
    ws.getCell(row, 1).fill = solidFill(LIGHT_AMBER);

    // Freeze panes
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 9, activeCell: 'B10' }];

    return ws;
}
