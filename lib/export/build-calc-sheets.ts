// ============================================================
// Calc Sheet Builder — Creates hidden IS/BS/CF formula sheets
// for each scenario (_Calc_Base, _Calc_Opt, _Calc_Con)
// ============================================================
//
// Each calc sheet is a fully self-contained 3-statement model
// with LIVE formulas.  Input assumptions are read from the
// Scenarios tab input rows.  Historical anchors come from
// existing IS/BS tabs.  The computed rows in the Scenarios tab
// then reference these sheets for live values.
//
// Circular reference: Interest Income ↔ Cash is resolved by
// workbook-level iterative calculation (set in excel.ts).
// ============================================================

import type ExcelJS from 'exceljs';
import type { ScenarioRowMap } from './build-scenarios';
import type { ModelResults } from '@/types/financial';

/* ── helpers ─────────────────────────────────────────── */
function colLetter(col: number): string {
    let s = '';
    while (col > 0) {
        const rem = (col - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        col = Math.floor((col - 1) / 26);
    }
    return s;
}

/* ── fixed row map inside each calc sheet ─────────────── */
// These constants define the row positions in the calc sheets.
// Row 1 = title, Row 2 = iterative-calc warning banner (merged), Row 3 = spacer.
// Data starts at row 4 to avoid collision with the merged warning row.
const R = {
    // IS section
    revenue: 4,
    revenueGrowth: 5,
    cogs: 6,
    grossProfit: 7,
    sga: 8,
    rd: 9,
    depreciation: 10,
    amortization: 11,
    otherOpex: 12,
    sbc: 13,
    totalOpex: 14,
    ebit: 15,
    interestIncome: 16,
    interestExpense: 17,
    otherIncomeExpense: 18,
    ebt: 19,
    tax: 20,
    netIncome: 21,
    // Profit Appropriation (Egyptian Law — correct order: EPD → LR → Distributable)
    employeeProfitSharing: 22,    // = MAX(0, NI × 10%)
    netIncomeAfterEPD: 23,        // = NI − EPD
    legalReserveAddition: 24,     // = MIN(NI × 5%, cap - cumulative)
    cumulativeLegalReserve: 25,   // = prior + addition
    distributableProfit: 26,      // = NI − EPD − LR Addition
    grossDividends: 27,           // = Distributable × payout ratio
    dividendWHT: 28,              // = Gross Dividends × 10%
    netDividends: 29,             // = Gross − WHT
    additionToRE: 30,             // = Distributable − Gross Dividends
    // spacer 31
    eps: 32,                      // = NI After EPD / Shares
    nopat: 33,                    // = EBIT × (1 − tax rate)
    fcff: 34,                     // engine-computed FCFF
    // BS section (row 36+)
    cash: 36,
    accountsReceivable: 37,
    inventory: 38,
    prepaid: 39,
    vatReceivable: 40,            // FIX: VAT input on CapEx
    otherCA: 41,
    totalCA: 42,
    // spacer 43
    grossPPE: 44,
    accumDep: 45,
    netPPE: 46,
    intangibles: 47,
    goodwill: 48,
    otherLTA: 49,
    totalNCA: 50,
    totalAssets: 51,
    // spacer 52
    accountsPayable: 53,
    accruedExp: 54,
    shortTermDebt: 55,
    currentPortionLTD: 56,
    deferredRevenue: 57,
    vatPayable: 58,               // FIX: VAT output - input (net)
    otherCL: 59,
    totalCL: 60,
    // spacer 61
    longTermDebt: 62,
    deferredTaxLiab: 63,
    otherLTL: 64,
    totalNCL: 65,
    totalLiabilities: 66,
    // spacer 67
    commonStock: 68,
    apic: 69,
    legalReserveEquity: 70,
    retainedEarnings: 71,
    treasuryStock: 72,
    oci: 73,
    totalEquity: 74,
    // spacer 75
    totalLE: 76,
    balanceCheck: 77,
    // CF section (row 79+)
    cf_netIncome: 79,
    cf_depreciation: 80,
    cf_amortization: 81,
    cf_sbc: 82,
    cf_deferredTax: 83,
    cf_changeAR: 84,
    cf_changeInv: 85,
    cf_changePrepaid: 86,
    cf_changeAP: 87,
    cf_changeAccrued: 88,
    cf_changeDeferredRev: 89,
    cf_changeVATRec: 90,          // FIX: VAT receivable WC change
    cf_changeVATPay: 91,          // FIX: VAT payable WC change
    cf_totalWC: 92,
    cf_cfo: 93,
    // spacer 94
    cf_capex: 95,
    cf_acquisitions: 96,
    cf_assetSales: 97,
    cf_cfi: 98,
    // spacer 99
    cf_debtIssuance: 100,
    cf_debtRepayment: 101,
    cf_dividends: 102,
    cf_epdPaid: 103,
    cf_equityIssuance: 104,
    cf_shareRepurchases: 105,
    cf_cff: 106,
    // spacer 107
    cf_netChange: 108,
    cf_beginCash: 109,
    cf_endCash: 110,
    cf_fcf: 111,
} as const;

/* ── scenario key → Scenarios tab row lookup ─────────── */
// Creates a helper that returns {col}{row} in the Scenarios tab
// for a given ROW_SPEC key and year index.
function scenRef(
    scenarioRows: ScenarioRowMap,
    blockName: string,
    key: string,
    yearIdx: number,
): string {
    const row = scenarioRows[`${blockName}_${key}`];
    if (!row) throw new Error(`scenRef: missing row for ${blockName}_${key}`);
    const col = colLetter(yearIdx + 2);
    return `Scenarios!${col}${row}`;
}

/* ── IS/BS tab historical anchor ─────────────────────── */
function isRef(isRows: Record<string, number>, key: string, yearIdx: number): string {
    const row = isRows[key];
    if (!row) throw new Error(`isRef: missing row for IS key "${key}"`);
    return `'Income Statement'!${colLetter(yearIdx + 2)}${row}`;
}

function bsRef(bsRows: Record<string, number>, key: string, yearIdx: number): string {
    const row = bsRows[key];
    if (!row) throw new Error(`bsRef: missing row for BS key "${key}"`);
    return `'Balance Sheet'!${colLetter(yearIdx + 2)}${row}`;
}

/* ══════════════════════════════════════════════════════ */
/*  BUILD ONE CALC SHEET                                 */
/* ══════════════════════════════════════════════════════ */
interface CalcSheetConfig {
    workbook: ExcelJS.Workbook;
    sheetName: string;               // e.g., '_Calc_Base'
    blockName: string;               // e.g., 'Base Case'
    scenarioRows: ScenarioRowMap;
    isRows: Record<string, number>;
    bsRows: Record<string, number>;
    periods: string[];
    numHistorical: number;
    nYears: number;
    results: ModelResults | null;    // for historical result values as formula results (null = use 0)
}

export interface CalcSheetRowMap {
    [key: string]: number;           // R key → actual row
}

function buildOneCalcSheet(cfg: CalcSheetConfig): CalcSheetRowMap {
    const { workbook, sheetName, blockName, scenarioRows, isRows, bsRows,
        periods, numHistorical, nYears, results } = cfg;

    const ws = workbook.addWorksheet(sheetName);
    ws.state = 'hidden';
    ws.getColumn(1).width = 30;
    for (let i = 0; i < nYears; i++) ws.getColumn(i + 2).width = 14;

    // Title row
    ws.getCell(1, 1).value = `${sheetName} — Full 3-Statement Model`;
    ws.getCell(1, 1).font = { bold: true, size: 10 };
    for (let i = 0; i < nYears; i++) ws.getCell(1, i + 2).value = periods[i];

    // ── Recalculation Guide Banner ──
    // Values are pre-cached from the WOLF engine — correct as-is on open.
    // This banner warns users about iterative calc only if they modify assumptions.
    ws.mergeCells(2, 1, 2, nYears + 1);
    const warnCell = ws.getCell(2, 1);
    warnCell.value = [
        '⚠ HOW TO RECALCULATE AFTER CHANGING ASSUMPTIONS:',
        '1. File → Options → Formulas → Enable iterative calculation (Max Iterations=1000, Max Change=0.001)',
        '2. Press Ctrl+Alt+F9 to force full recalculation',
        '3. Values shown by default are pre-calculated by the WOLF engine and are correct as-is.',
    ].join('  |  ');
    warnCell.font = { bold: true, size: 9, color: { argb: 'FFCC0000' } };
    warnCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
    warnCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getRow(2).height = 40;

    // Shift row map: all rows below shift by 1 to accommodate the warning row
    // NOTE: The R constants are used as-is since they represent the LOGICAL row,
    // and the actual cell writes already reference R directly.
    // The warning row is at physical row 2, data starts at row 3 (R values + 1).

    const NUM_FMT = '#,##0';
    const PCT_FMT = '0.00%';

    // Helper: get a Scenarios-tab reference for this scenario
    const sRef = (key: string, yr: number) => scenRef(scenarioRows, blockName, key, yr);

    // Helper: get column letter in the calc sheet
    const col = (yr: number) => colLetter(yr + 2);
    const prevCol = (yr: number) => colLetter(yr + 1);

    // Helper: set a cell with a formula (and a cached result)
    const setF = (row: number, yr: number, formula: string, result: number = 0, fmt: string = NUM_FMT) => {
        const cell = ws.getCell(row, yr + 2);
        cell.value = { formula, result };
        cell.numFmt = fmt;
    };

    // Helper: set a label
    const setL = (row: number, label: string) => {
        ws.getCell(row, 1).value = label;
    };

    // ── LABELS ──
    setL(R.revenue, 'Revenue');
    setL(R.revenueGrowth, 'Revenue Growth %');
    setL(R.cogs, 'COGS');
    setL(R.grossProfit, 'Gross Profit');
    setL(R.sga, 'SG&A');
    setL(R.rd, 'R&D');
    setL(R.depreciation, 'Depreciation');
    setL(R.amortization, 'Amortization');
    setL(R.otherOpex, 'Other OpEx');
    setL(R.sbc, 'SBC');
    setL(R.totalOpex, 'Total OpEx');
    setL(R.ebit, 'EBIT');
    setL(R.interestIncome, 'Interest Income');
    setL(R.interestExpense, 'Interest Expense');
    setL(R.otherIncomeExpense, 'Other Income/Expense');
    setL(R.ebt, 'EBT');
    setL(R.tax, 'Tax Expense');
    setL(R.netIncome, 'Net Income');
    setL(R.employeeProfitSharing, 'Employee Profit Sharing (EPD)');
    setL(R.netIncomeAfterEPD, 'Net Income After EPD');
    setL(R.legalReserveAddition, 'Legal Reserve Addition (5% NI, Law 159/1981)');
    setL(R.cumulativeLegalReserve, 'Cumulative Legal Reserve');
    setL(R.distributableProfit, 'Distributable Profit');
    setL(R.grossDividends, 'Gross Dividends');
    setL(R.dividendWHT, 'Dividend WHT (10%)');
    setL(R.netDividends, 'Net Dividends');
    setL(R.additionToRE, 'Addition to Retained Earnings');
    setL(R.eps, 'EPS');
    setL(R.nopat, 'NOPAT');
    setL(R.fcff, 'FCFF');
    ws.getCell(35, 1).value = '── Balance Sheet ──';
    setL(R.cash, 'Cash & Equivalents');
    setL(R.accountsReceivable, 'Accounts Receivable');
    setL(R.inventory, 'Inventory');
    setL(R.prepaid, 'Prepaid Expenses');
    setL(R.otherCA, 'Other Current Assets');
    setL(R.totalCA, 'Total Current Assets');
    setL(R.grossPPE, 'Gross PP&E');
    setL(R.accumDep, 'Accumulated Depreciation');
    setL(R.netPPE, 'Net PP&E');
    setL(R.intangibles, 'Intangibles');
    setL(R.goodwill, 'Goodwill');
    setL(R.otherLTA, 'Other LT Assets');
    setL(R.totalNCA, 'Total Non-Current Assets');
    setL(R.totalAssets, 'Total Assets');
    setL(R.accountsPayable, 'Accounts Payable');
    setL(R.accruedExp, 'Accrued Expenses');
    setL(R.shortTermDebt, 'Short-Term Debt');
    setL(R.currentPortionLTD, 'Current Portion LTD');
    setL(R.deferredRevenue, 'Deferred Revenue');
    setL(R.otherCL, 'Other Current Liabilities');
    setL(R.totalCL, 'Total Current Liabilities');
    setL(R.longTermDebt, 'Long-Term Debt');
    setL(R.deferredTaxLiab, 'Deferred Tax Liabilities');
    setL(R.otherLTL, 'Other LT Liabilities');
    setL(R.totalNCL, 'Total Non-Current Liabilities');
    setL(R.totalLiabilities, 'Total Liabilities');
    setL(R.commonStock, 'Common Stock');
    setL(R.apic, 'APIC');
    setL(R.legalReserveEquity, 'Legal Reserve (Equity)');
    setL(R.retainedEarnings, 'Retained Earnings');
    setL(R.treasuryStock, 'Treasury Stock');
    setL(R.oci, 'Other Comprehensive Income');
    setL(R.totalEquity, 'Total Equity');
    setL(R.totalLE, 'Total Liabilities + Equity');
    setL(R.balanceCheck, 'Balance Check (TA - TLE)');
    ws.getCell(76, 1).value = '── Cash Flow ──';
    setL(R.cf_netIncome, 'Net Income');
    setL(R.cf_depreciation, '+ Depreciation');
    setL(R.cf_amortization, '+ Amortization');
    setL(R.cf_sbc, '+ SBC');
    setL(R.cf_deferredTax, 'Deferred Taxes');
    setL(R.cf_changeAR, 'Δ A/R');
    setL(R.cf_changeInv, 'Δ Inventory');
    setL(R.cf_changePrepaid, 'Δ Prepaid');
    setL(R.cf_changeAP, 'Δ A/P');
    setL(R.cf_changeAccrued, 'Δ Accrued Exp');
    setL(R.cf_changeDeferredRev, 'Δ Deferred Revenue');
    setL(R.cf_totalWC, 'Total WC Change');
    setL(R.cf_cfo, 'Cash from Operations');
    setL(R.cf_capex, 'Capital Expenditures');
    setL(R.cf_acquisitions, 'Acquisitions');
    setL(R.cf_assetSales, 'Asset Sales');
    setL(R.cf_cfi, 'Cash from Investing');
    setL(R.cf_debtIssuance, 'Debt Issuance');
    setL(R.cf_debtRepayment, 'Debt Repayment');
    setL(R.cf_dividends, 'Dividends Paid');
    setL(R.cf_epdPaid, 'Employee Profit Sharing Paid');
    setL(R.cf_equityIssuance, 'Equity Issuance');
    setL(R.cf_shareRepurchases, 'Share Repurchases');
    setL(R.cf_cff, 'Cash from Financing');
    setL(R.cf_netChange, 'Net Change in Cash');
    setL(R.cf_beginCash, 'Beginning Cash');
    setL(R.cf_endCash, 'Ending Cash');
    setL(R.cf_fcf, 'Free Cash Flow');

    // ════════════════════════════════════════════════════
    // Write formulas for each year
    // ════════════════════════════════════════════════════
    for (let yr = 0; yr < nYears; yr++) {
        const c = col(yr);
        const pc = prevCol(yr);
        const isProjected = yr >= numHistorical;

        // Cached engine results for formula result hints (null-safe)
        const isData = results?.incomeStatements?.[yr] ?? null;
        const bsData = results?.balanceSheets?.[yr] ?? null;
        // CF index: CF entry j corresponds to IS/BS entry j+1, so cfIdx = yr-1
        const cfIdx = yr - 1;
        const cfData = cfIdx >= 0 && results?.cashFlowStatements && cfIdx < results.cashFlowStatements.length
            ? results.cashFlowStatements[cfIdx] : null;

        if (!isProjected) {
            // ── HISTORICAL: reference existing IS/BS tabs ──
            // Revenue
            setF(R.revenue, yr, isRef(isRows, 'revenue', yr), isData?.revenue ?? 0);
            setF(R.revenueGrowth, yr,
                yr === 0 ? '0' : `(${c}${R.revenue}-${pc}${R.revenue})/${pc}${R.revenue}`,
                isData?.revenueGrowthRate ?? 0, PCT_FMT);
            setF(R.cogs, yr, isRef(isRows, 'cogs', yr), isData?.cogs ?? 0);
            setF(R.grossProfit, yr, `${c}${R.revenue}-${c}${R.cogs}`, isData?.grossProfit ?? 0);
            setF(R.sga, yr, isRef(isRows, 'sgaExpense', yr), isData?.sgaExpense ?? 0);
            setF(R.rd, yr, isRef(isRows, 'rdExpense', yr), isData?.rdExpense ?? 0);
            setF(R.depreciation, yr, isRef(isRows, 'depreciation', yr), isData?.depreciation ?? 0);
            setF(R.amortization, yr, isRef(isRows, 'amortization', yr), isData?.amortization ?? 0);
            setF(R.otherOpex, yr, isRef(isRows, 'otherOpex', yr), isData?.otherOpex ?? 0);
            setF(R.sbc, yr, isRef(isRows, 'stockBasedComp', yr), isData?.stockBasedComp ?? 0);
            setF(R.totalOpex, yr,
                `${c}${R.sga}+${c}${R.rd}+${c}${R.depreciation}+${c}${R.amortization}+${c}${R.otherOpex}+${c}${R.sbc}`,
                isData?.totalOpex ?? 0);
            setF(R.ebit, yr, `${c}${R.grossProfit}-${c}${R.totalOpex}`, isData?.ebit ?? 0);
            setF(R.interestIncome, yr, isRef(isRows, 'interestIncome', yr), isData?.interestIncome ?? 0);
            setF(R.interestExpense, yr, isRef(isRows, 'interestExpense', yr), isData?.interestExpense ?? 0);
            setF(R.otherIncomeExpense, yr, isRef(isRows, 'otherIncomeExpense', yr), isData?.otherIncomeExpense ?? 0);
            setF(R.ebt, yr,
                `${c}${R.ebit}+${c}${R.interestIncome}-${c}${R.interestExpense}+${c}${R.otherIncomeExpense}`,
                isData?.ebt ?? 0);
            setF(R.tax, yr, isRef(isRows, 'taxExpense', yr), isData?.taxExpense ?? 0);
            setF(R.netIncome, yr, `${c}${R.ebt}-${c}${R.tax}`, isData?.netIncome ?? 0);
            // EPD = NI × rate (Egyptian Labor Law Art.41) — FIRST deduction
            setF(R.employeeProfitSharing, yr, '0', isData?.employeeProfitSharing ?? 0);
            // NI After EPD = NI - EPD
            setF(R.netIncomeAfterEPD, yr,
                `${c}${R.netIncome}-${c}${R.employeeProfitSharing}`,
                isData?.netIncomeAfterEPD ?? 0);
            // Legal Reserve — Law 159/1981: 5% of NI, cap at 50% of issued capital
            setF(R.legalReserveAddition, yr, '0', isData?.legalReserveAddition ?? 0);
            setF(R.cumulativeLegalReserve, yr, '0', bsData?.legalReserve ?? 0);
            // Distributable = NI - EPD - Legal Reserve
            setF(R.distributableProfit, yr,
                `${c}${R.netIncome}-${c}${R.employeeProfitSharing}-${c}${R.legalReserveAddition}`,
                isData?.distributableProfit ?? 0);
            // Gross Dividends = 0 for historical
            setF(R.grossDividends, yr, '0', isData?.grossDividends ?? 0);
            setF(R.dividendWHT, yr, '0', isData?.dividendWHT ?? 0);
            setF(R.netDividends, yr, '0', isData?.netDividends ?? 0);
            setF(R.additionToRE, yr,
                `${c}${R.distributableProfit}-${c}${R.grossDividends}`,
                isData?.additionToRE ?? 0);
            // EPS
            setF(R.eps, yr,
                `IF(${sRef('sharesOutstanding', yr)}=0,0,${c}${R.netIncomeAfterEPD}/${sRef('sharesOutstanding', yr)})`,
                isData?.eps ?? 0);
            // NOPAT = EBIT × (1 − tax rate)
            setF(R.nopat, yr,
                `${c}${R.ebit}*(1-${sRef('taxRate', yr)})`,
                (isData?.ebit ?? 0) * (1 - (isData?.taxRate ?? 0.225)));
            // FCFF = 0 for historical
            setF(R.fcff, yr, '0', 0);

            // BS — reference existing BS tab
            setF(R.cash, yr, bsRef(bsRows, 'cash', yr), bsData?.cash ?? 0);
            setF(R.accountsReceivable, yr, bsRef(bsRows, 'accountsReceivable', yr), bsData?.accountsReceivable ?? 0);
            setF(R.inventory, yr, bsRef(bsRows, 'inventory', yr), bsData?.inventory ?? 0);
            setF(R.prepaid, yr, bsRef(bsRows, 'prepaidExpenses', yr), bsData?.prepaidExpenses ?? 0);
            setF(R.vatReceivable, yr, bsRef(bsRows, 'vatReceivable', yr), bsData?.vatReceivable ?? 0);
            setF(R.otherCA, yr, bsRef(bsRows, 'otherCurrentAssets', yr), bsData?.otherCurrentAssets ?? 0);
            setF(R.totalCA, yr, `SUM(${c}${R.cash}:${c}${R.otherCA})`, bsData?.totalCurrentAssets ?? 0);
            setF(R.grossPPE, yr, bsRef(bsRows, 'grossPPE', yr), bsData?.grossPPE ?? 0);
            setF(R.accumDep, yr, bsRef(bsRows, 'accumulatedDepreciation', yr), bsData?.accumulatedDepreciation ?? 0);
            setF(R.netPPE, yr, `${c}${R.grossPPE}-${c}${R.accumDep}`, bsData?.netPPE ?? 0);
            setF(R.intangibles, yr, bsRef(bsRows, 'intangibles', yr), bsData?.intangibles ?? 0);
            setF(R.goodwill, yr, bsRef(bsRows, 'goodwill', yr), bsData?.goodwill ?? 0);
            setF(R.otherLTA, yr, bsRef(bsRows, 'otherLongTermAssets', yr), bsData?.otherLongTermAssets ?? 0);
            setF(R.totalNCA, yr,
                `${c}${R.netPPE}+${c}${R.intangibles}+${c}${R.goodwill}+${c}${R.otherLTA}`,
                bsData?.totalNonCurrentAssets ?? 0);
            setF(R.totalAssets, yr, `${c}${R.totalCA}+${c}${R.totalNCA}`, bsData?.totalAssets ?? 0);
            setF(R.accountsPayable, yr, bsRef(bsRows, 'accountsPayable', yr), bsData?.accountsPayable ?? 0);
            setF(R.accruedExp, yr, bsRef(bsRows, 'accruedExpenses', yr), bsData?.accruedExpenses ?? 0);
            setF(R.shortTermDebt, yr, bsRef(bsRows, 'shortTermDebt', yr), bsData?.shortTermDebt ?? 0);
            setF(R.currentPortionLTD, yr, bsRef(bsRows, 'currentPortionLTD', yr), bsData?.currentPortionLTD ?? 0);
            setF(R.deferredRevenue, yr, bsRef(bsRows, 'deferredRevenue', yr), bsData?.deferredRevenue ?? 0);
            setF(R.vatPayable, yr, bsRef(bsRows, 'vatPayable', yr), bsData?.vatPayable ?? 0);
            setF(R.otherCL, yr, bsRef(bsRows, 'otherCurrentLiabilities', yr), bsData?.otherCurrentLiabilities ?? 0);
            setF(R.totalCL, yr, `SUM(${c}${R.accountsPayable}:${c}${R.otherCL})`, bsData?.totalCurrentLiabilities ?? 0);
            setF(R.longTermDebt, yr, bsRef(bsRows, 'longTermDebt', yr), bsData?.longTermDebt ?? 0);
            setF(R.deferredTaxLiab, yr, bsRef(bsRows, 'deferredTaxLiabilities', yr), bsData?.deferredTaxLiabilities ?? 0);
            setF(R.otherLTL, yr, bsRef(bsRows, 'otherLongTermLiabilities', yr), bsData?.otherLongTermLiabilities ?? 0);
            setF(R.totalNCL, yr, `SUM(${c}${R.longTermDebt}:${c}${R.otherLTL})`, bsData?.totalNonCurrentLiabilities ?? 0);
            setF(R.totalLiabilities, yr, `${c}${R.totalCL}+${c}${R.totalNCL}`, bsData?.totalLiabilities ?? 0);
            setF(R.commonStock, yr, bsRef(bsRows, 'commonStock', yr), bsData?.commonStock ?? 0);
            setF(R.apic, yr, bsRef(bsRows, 'additionalPaidInCapital', yr), bsData?.additionalPaidInCapital ?? 0);
            setF(R.legalReserveEquity, yr, `${c}${R.cumulativeLegalReserve}`, bsData?.legalReserve ?? 0);
            setF(R.retainedEarnings, yr, bsRef(bsRows, 'retainedEarnings', yr), bsData?.retainedEarnings ?? 0);
            setF(R.treasuryStock, yr, bsRef(bsRows, 'treasuryStock', yr), bsData?.treasuryStock ?? 0);
            setF(R.oci, yr, bsRef(bsRows, 'otherComprehensiveIncome', yr), bsData?.otherComprehensiveIncome ?? 0);
            setF(R.totalEquity, yr, `SUM(${c}${R.commonStock}:${c}${R.oci})`, bsData?.totalEquity ?? 0);
            setF(R.totalLE, yr, `${c}${R.totalLiabilities}+${c}${R.totalEquity}`, bsData?.totalLiabilitiesEquity ?? 0);
            setF(R.balanceCheck, yr, `${c}${R.totalAssets}-${c}${R.totalLE}`, 0);

            // CF — historical (only exists if yr >= 1)
            if (cfData) {
                setF(R.cf_netIncome, yr, `${c}${R.netIncome}`, cfData.netIncome);
                setF(R.cf_depreciation, yr, `${c}${R.depreciation}`, cfData.depreciation);
                setF(R.cf_amortization, yr, `${c}${R.amortization}`, cfData.amortization);
                setF(R.cf_sbc, yr, `${c}${R.sbc}`, cfData.stockBasedComp);
                setF(R.cf_deferredTax, yr,
                    `${c}${R.deferredTaxLiab}-${pc}${R.deferredTaxLiab}`,
                    cfData.deferredTaxes);
                setF(R.cf_changeAR, yr, `-(${c}${R.accountsReceivable}-${pc}${R.accountsReceivable})`, cfData.changeInAR);
                setF(R.cf_changeInv, yr, `-(${c}${R.inventory}-${pc}${R.inventory})`, cfData.changeInInventory);
                setF(R.cf_changePrepaid, yr, `-(${c}${R.prepaid}-${pc}${R.prepaid})`, cfData.changeInPrepaid);
                setF(R.cf_changeAP, yr, `${c}${R.accountsPayable}-${pc}${R.accountsPayable}`, cfData.changeInAP);
                setF(R.cf_changeAccrued, yr, `${c}${R.accruedExp}-${pc}${R.accruedExp}`, cfData.changeInAccruedExp);
                setF(R.cf_changeDeferredRev, yr, `${c}${R.deferredRevenue}-${pc}${R.deferredRevenue}`, cfData.changeInDeferredRev);
                setF(R.cf_changeVATRec, yr, `-(${c}${R.vatReceivable}-${pc}${R.vatReceivable})`, cfData.changeInVATReceivable ?? 0);
                setF(R.cf_changeVATPay, yr, `${c}${R.vatPayable}-${pc}${R.vatPayable}`, cfData.changeInVATPayable ?? 0);
                setF(R.cf_totalWC, yr,
                    `SUM(${c}${R.cf_changeAR}:${c}${R.cf_changeVATPay})`,
                    cfData.totalWorkingCapitalChange);
                setF(R.cf_cfo, yr,
                    `${c}${R.cf_netIncome}+${c}${R.cf_depreciation}+${c}${R.cf_amortization}+${c}${R.cf_sbc}+${c}${R.cf_deferredTax}+${c}${R.cf_totalWC}`,
                    cfData.cashFromOperations);
                setF(R.cf_capex, yr,
                    `-ABS(${c}${R.revenue}*${sRef('capexPercent', yr)})`,
                    cfData.capex);
                // Acquisitions / Asset Sales: no engine driver, always 0 (Fix 3)
                setF(R.cf_acquisitions, yr, `0`, cfData.acquisitions);
                setF(R.cf_assetSales, yr, `0`, cfData.assetSales);
                setF(R.cf_cfi, yr,
                    `${c}${R.cf_capex}+${c}${R.cf_acquisitions}+${c}${R.cf_assetSales}`,
                    cfData.cashFromInvesting);
                setF(R.cf_debtIssuance, yr, `${sRef('longTermDebtIssuance', yr)}`, cfData.debtIssuance);
                setF(R.cf_debtRepayment, yr, `-ABS(${sRef('longTermDebtRepayment', yr)})`, cfData.debtRepayment);
                setF(R.cf_dividends, yr, `${sRef('dividendsPaidComputed', yr)}`, cfData.dividendsPaid);
                setF(R.cf_epdPaid, yr, `-${c}${R.employeeProfitSharing}`, cfData.employeeProfitSharingPaid ?? 0);
                // Equity Issuance / Share Repurchases: removed back-solved Computed
                // rows (Fix 3). Use the regular driver assumption rows; for historical
                // periods these resolve via Scenarios sheet to engine values.
                setF(R.cf_equityIssuance, yr, `${sRef('equityIssuance', yr)}`, cfData.equityIssuance);
                setF(R.cf_shareRepurchases, yr, `-ABS(${sRef('shareRepurchaseAmount', yr)})`, cfData.shareRepurchases);
                setF(R.cf_cff, yr,
                    `${c}${R.cf_debtIssuance}+${c}${R.cf_debtRepayment}+${c}${R.cf_dividends}+${c}${R.cf_epdPaid}+${c}${R.cf_equityIssuance}+${c}${R.cf_shareRepurchases}`,
                    cfData.cashFromFinancing);
                setF(R.cf_netChange, yr,
                    `${c}${R.cf_cfo}+${c}${R.cf_cfi}+${c}${R.cf_cff}`,
                    cfData.netChangeInCash);
                setF(R.cf_beginCash, yr, `${pc}${R.cash}`, cfData.beginningCash);
                setF(R.cf_endCash, yr,
                    `${c}${R.cf_beginCash}+${c}${R.cf_netChange}`,
                    cfData.endingCash);
                setF(R.cf_fcf, yr,
                    `${c}${R.cf_cfo}+${c}${R.cf_capex}`,
                    cfData.freeCashFlow);
            }
            // Year 0 has no CF — cells left blank
        } else {
            // ── PROJECTED: live formulas from Scenarios tab inputs ──
            const sr = (key: string) => sRef(key, yr);

            // IS formulas
            // Revenue — chain from prior year using growth rate (independent formula, no Scenarios output ref)
            setF(R.revenue, yr,
                `${pc}${R.revenue}*(1+${sr('revenueGrowthRate')})`,
                isData?.revenue ?? 0);
            setF(R.revenueGrowth, yr, sr('revenueGrowthRate'), isData?.revenueGrowthRate ?? 0, PCT_FMT);

            // COGS = Revenue * COGS%
            setF(R.cogs, yr, `${c}${R.revenue}*${sr('cogsPercent')}`, isData?.cogs ?? 0);
            setF(R.grossProfit, yr, `${c}${R.revenue}-${c}${R.cogs}`, isData?.grossProfit ?? 0);

            // OpEx
            setF(R.sga, yr, `${c}${R.revenue}*${sr('sgaPercent')}`, isData?.sgaExpense ?? 0);
            setF(R.rd, yr, `${c}${R.revenue}*${sr('rdPercent')}`, isData?.rdExpense ?? 0);

            // Depreciation — independent formula: (prevGrossPPE + rev*capex%/2) * depRate
            setF(R.depreciation, yr,
                `(${pc}${R.grossPPE}+${c}${R.revenue}*${sr('capexPercent')}/2)*${sr('depreciationRate')}`,
                isData?.depreciation ?? 0);

            setF(R.amortization, yr, sr('amortizationAmount'), isData?.amortization ?? 0);
            setF(R.otherOpex, yr, `${c}${R.revenue}*${sr('otherOpexPercent')}`, isData?.otherOpex ?? 0);
            setF(R.sbc, yr, sr('stockBasedCompAmount'), isData?.stockBasedComp ?? 0);
            setF(R.totalOpex, yr,
                `${c}${R.sga}+${c}${R.rd}+${c}${R.depreciation}+${c}${R.amortization}+${c}${R.otherOpex}+${c}${R.sbc}`,
                isData?.totalOpex ?? 0);
            setF(R.ebit, yr, `${c}${R.grossProfit}-${c}${R.totalOpex}`, isData?.ebit ?? 0);

            // Interest Income — beginning-balance formula:
            // prevCash × interestIncomeRate
            // This eliminates the circular reference (cash depends on NI which depends on interest income)
            setF(R.interestIncome, yr,
                `${pc}${R.cash}*${sr('interestIncomeRate')}`,
                isData?.interestIncome ?? 0);

            // Interest Expense — beginning-balance formula:
            // prevTotalDebt × interestRate
            // where TotalDebt = ShortTermDebt + CurrentPortionLTD + LongTermDebt
            setF(R.interestExpense, yr,
                `(${pc}${R.shortTermDebt}+${pc}${R.currentPortionLTD}+${pc}${R.longTermDebt})*${sr('interestRate')}`,
                isData?.interestExpense ?? 0);

            setF(R.otherIncomeExpense, yr, sr('otherIncomeExpense'), isData?.otherIncomeExpense ?? 0);

            // EBT = EBIT + IntIncome - IntExpense + OtherIncExp
            setF(R.ebt, yr,
                `${c}${R.ebit}+${c}${R.interestIncome}-${c}${R.interestExpense}+${c}${R.otherIncomeExpense}`,
                isData?.ebt ?? 0);

            // Tax = MAX(0, EBT * TaxRate)
            setF(R.tax, yr, `MAX(0,${c}${R.ebt}*${sr('taxRate')})`, isData?.taxExpense ?? 0);

            // Net Income — computed locally: EBT - Tax
            setF(R.netIncome, yr, `${c}${R.ebt}-${c}${R.tax}`, isData?.netIncome ?? 0);

            // ── EPD (Egyptian Labor Law Art.41) — FIRST deduction ──
            setF(R.employeeProfitSharing, yr,
                `MAX(0,${c}${R.netIncome}*${sr('employeeProfitSharingRate')})`,
                isData?.employeeProfitSharing ?? 0);
            // NI After EPD = NI - EPD
            setF(R.netIncomeAfterEPD, yr,
                `${c}${R.netIncome}-${c}${R.employeeProfitSharing}`,
                isData?.netIncomeAfterEPD ?? 0);

            // ── Legal Reserve (Law 159/1981) ──
            const prevCumLR = yr === numHistorical
                ? '0'  // first projected year: assume 0 prior cumulative LR
                : `${pc}${R.cumulativeLegalReserve}`;
            setF(R.legalReserveAddition, yr,
                `IF(${c}${R.netIncome}<=0,0,MIN(${c}${R.netIncome}*0.05,MAX(0,${sr('paidUpCapital')}*0.5-${prevCumLR})))`,
                isData?.legalReserveAddition ?? 0);
            setF(R.cumulativeLegalReserve, yr,
                yr === numHistorical
                    ? `${c}${R.legalReserveAddition}`  // first projected year
                    : `${pc}${R.cumulativeLegalReserve}+${c}${R.legalReserveAddition}`,
                bsData?.legalReserve ?? 0);
            // Distributable Profit = NI - EPD - Legal Reserve Addition
            setF(R.distributableProfit, yr,
                `${c}${R.netIncome}-${c}${R.employeeProfitSharing}-${c}${R.legalReserveAddition}`,
                isData?.distributableProfit ?? 0);

            // ── Dividend Distribution ──
            setF(R.grossDividends, yr,
                `MAX(0,${c}${R.distributableProfit}*${sr('dividendPayoutRatio')})`,
                isData?.grossDividends ?? 0);
            setF(R.dividendWHT, yr,
                `${c}${R.grossDividends}*0.10`,
                isData?.dividendWHT ?? 0);
            setF(R.netDividends, yr,
                `${c}${R.grossDividends}-${c}${R.dividendWHT}`,
                isData?.netDividends ?? 0);
            setF(R.additionToRE, yr,
                `${c}${R.distributableProfit}-${c}${R.grossDividends}`,
                isData?.additionToRE ?? 0);
            // EPS
            setF(R.eps, yr,
                `IF(${sr('sharesOutstanding')}=0,0,${c}${R.netIncomeAfterEPD}/${sr('sharesOutstanding')})`,
                isData?.eps ?? 0);
            // NOPAT = EBIT × (1 − tax rate)
            setF(R.nopat, yr,
                `${c}${R.ebit}*(1-${sr('taxRate')})`,
                (isData?.ebit ?? 0) * (1 - (isData?.taxRate ?? 0.225)));
            // FCFF — pull from engine-computed values
            const fcffIdx = yr - numHistorical;
            const fcffResult = fcffIdx >= 0 && results?.cashFlowStatements && fcffIdx < results.cashFlowStatements.length
                ? (results.cashFlowStatements[fcffIdx] as unknown as Record<string, number>)['fcff'] ?? 0 : 0;
            setF(R.fcff, yr,
                `${c}${R.nopat}+${c}${R.depreciation}+${c}${R.amortization}-(${c}${R.revenue}*${sr('capexPercent')})-(${c}${R.accountsReceivable}-${pc}${R.accountsReceivable})-(${c}${R.inventory}-${pc}${R.inventory})+(${c}${R.accountsPayable}-${pc}${R.accountsPayable})`,
                fcffResult);

            // ── BS formulas ──
            // Cash — equals Ending Cash from CF section in same sheet (row 89)
            // This avoids the circular loop: _Calc_*!row21 ↔ Scenarios!out_cash
            setF(R.cash, yr,
                `${c}${R.cf_endCash}`,
                bsData?.cash ?? 0);

            // A/R = Revenue * DSO / 365
            setF(R.accountsReceivable, yr,
                `${c}${R.revenue}*${sr('dso')}/365`,
                bsData?.accountsReceivable ?? 0);
            // Inventory = COGS * DIO / 365
            setF(R.inventory, yr,
                `${c}${R.cogs}*${sr('dio')}/365`,
                bsData?.inventory ?? 0);
            // Prepaid = Revenue * prepaidPercent
            setF(R.prepaid, yr,
                `${c}${R.revenue}*${sr('prepaidPercent')}`,
                bsData?.prepaidExpenses ?? 0);
            // VAT Receivable = CapEx * vatRate (input VAT on capital expenditures)
            setF(R.vatReceivable, yr,
                `IF(${sr('enableVAT')}=0,0,ABS(${c}${R.revenue}*${sr('capexPercent')})*${sr('vatRate')})`,
                bsData?.vatReceivable ?? 0);
            // Other CA
            setF(R.otherCA, yr, sr('otherCurrentAssets'), bsData?.otherCurrentAssets ?? 0);
            // Total CA
            setF(R.totalCA, yr, `SUM(${c}${R.cash}:${c}${R.otherCA})`, bsData?.totalCurrentAssets ?? 0);

            // Gross PPE — independent formula: prev + Revenue * CapEx%
            setF(R.grossPPE, yr,
                `${pc}${R.grossPPE}+${c}${R.revenue}*${sr('capexPercent')}`,
                bsData?.grossPPE ?? 0);
            // Accum Dep — independent formula: prev + Depreciation
            setF(R.accumDep, yr,
                `${pc}${R.accumDep}+${c}${R.depreciation}`,
                bsData?.accumulatedDepreciation ?? 0);
            // Net PPE — independent formula: Gross PPE - Accum Dep
            setF(R.netPPE, yr, `${c}${R.grossPPE}-${c}${R.accumDep}`, bsData?.netPPE ?? 0);
            // Intangibles — independent formula: MAX(0, prev - Amortization)
            setF(R.intangibles, yr,
                `MAX(0,${pc}${R.intangibles}-${c}${R.amortization})`,
                bsData?.intangibles ?? 0);
            // Goodwill
            setF(R.goodwill, yr, sr('goodwill'), bsData?.goodwill ?? 0);
            // Other LTA
            setF(R.otherLTA, yr, sr('otherLongTermAssets'), bsData?.otherLongTermAssets ?? 0);
            // Total NCA
            setF(R.totalNCA, yr,
                `${c}${R.netPPE}+${c}${R.intangibles}+${c}${R.goodwill}+${c}${R.otherLTA}`,
                bsData?.totalNonCurrentAssets ?? 0);
            // Total Assets
            setF(R.totalAssets, yr, `${c}${R.totalCA}+${c}${R.totalNCA}`, bsData?.totalAssets ?? 0);

            // A/P = COGS * DPO / 365
            setF(R.accountsPayable, yr,
                `${c}${R.cogs}*${sr('dpo')}/365`,
                bsData?.accountsPayable ?? 0);
            // Accrued Exp = Revenue * accruedExpPercent
            setF(R.accruedExp, yr,
                `${c}${R.revenue}*${sr('accruedExpPercent')}`,
                bsData?.accruedExpenses ?? 0);
            // ST Debt
            setF(R.shortTermDebt, yr, sr('shortTermDebtAmount'), bsData?.shortTermDebt ?? 0);
            // Current Portion LTD
            setF(R.currentPortionLTD, yr, sr('currentPortionLTD'), bsData?.currentPortionLTD ?? 0);
            // Deferred Revenue = Revenue * deferredRevPercent
            setF(R.deferredRevenue, yr,
                `${c}${R.revenue}*${sr('deferredRevPercent')}`,
                bsData?.deferredRevenue ?? 0);
            // VAT Payable = MAX(0, Revenue * vatRate - CapEx * vatRate) (net output - input VAT)
            setF(R.vatPayable, yr,
                `IF(${sr('enableVAT')}=0,0,MAX(0,${c}${R.revenue}*${sr('vatRate')}-ABS(${c}${R.revenue}*${sr('capexPercent')})*${sr('vatRate')}))`,
                bsData?.vatPayable ?? 0);
            // Other CL
            setF(R.otherCL, yr, sr('otherCurrentLiabilities'), bsData?.otherCurrentLiabilities ?? 0);
            // Total CL
            setF(R.totalCL, yr, `SUM(${c}${R.accountsPayable}:${c}${R.otherCL})`, bsData?.totalCurrentLiabilities ?? 0);

            // Long-Term Debt — independent formula: prev + issuance - repayment
            setF(R.longTermDebt, yr,
                `${pc}${R.longTermDebt}+${sr('longTermDebtIssuance')}-ABS(${sr('longTermDebtRepayment')})`,
                bsData?.longTermDebt ?? 0);
            // DTL
            setF(R.deferredTaxLiab, yr, sr('deferredTaxLiabilities'), bsData?.deferredTaxLiabilities ?? 0);
            // Other LTL
            setF(R.otherLTL, yr, sr('otherLongTermLiabilities'), bsData?.otherLongTermLiabilities ?? 0);
            // Total NCL
            setF(R.totalNCL, yr, `SUM(${c}${R.longTermDebt}:${c}${R.otherLTL})`, bsData?.totalNonCurrentLiabilities ?? 0);
            // Total Liabilities
            setF(R.totalLiabilities, yr, `${c}${R.totalCL}+${c}${R.totalNCL}`, bsData?.totalLiabilities ?? 0);

            // Common Stock
            setF(R.commonStock, yr, sr('commonStock'), bsData?.commonStock ?? 0);
            // APIC — equity issuance only (SBC does NOT go to APIC)
            setF(R.apic, yr,
                `${pc}${R.apic}+${c}${R.sbc}+${sr('equityIssuance')}`,
                bsData?.additionalPaidInCapital ?? 0);
            // Legal Reserve (Equity) — cumulative from IS
            setF(R.legalReserveEquity, yr,
                `${c}${R.cumulativeLegalReserve}`,
                bsData?.legalReserve ?? 0);
            // Retained Earnings — Distributable - Gross Dividends (using pre-computed Addition to RE)
            setF(R.retainedEarnings, yr,
                `${pc}${R.retainedEarnings}+${c}${R.additionToRE}`,
                bsData?.retainedEarnings ?? 0);
            // Treasury Stock — independent formula: prev - repurchases
            setF(R.treasuryStock, yr,
                `${pc}${R.treasuryStock}+${c}${R.cf_shareRepurchases}`,
                bsData?.treasuryStock ?? 0);
            // OCI
            setF(R.oci, yr, sr('oci'), bsData?.otherComprehensiveIncome ?? 0);
            // Total Equity
            setF(R.totalEquity, yr, `SUM(${c}${R.commonStock}:${c}${R.oci})`, bsData?.totalEquity ?? 0);
            // Total L+E
            setF(R.totalLE, yr, `${c}${R.totalLiabilities}+${c}${R.totalEquity}`, bsData?.totalLiabilitiesEquity ?? 0);
            // Balance Check
            setF(R.balanceCheck, yr, `${c}${R.totalAssets}-${c}${R.totalLE}`, 0);

            // ── CF formulas ──
            setF(R.cf_netIncome, yr, `${c}${R.netIncome}`, cfData?.netIncome ?? 0);
            setF(R.cf_depreciation, yr, `${c}${R.depreciation}`, cfData?.depreciation ?? 0);
            setF(R.cf_amortization, yr, `${c}${R.amortization}`, cfData?.amortization ?? 0);
            setF(R.cf_sbc, yr, `${c}${R.sbc}`, cfData?.stockBasedComp ?? 0);
            setF(R.cf_deferredTax, yr,
                `${c}${R.deferredTaxLiab}-${pc}${R.deferredTaxLiab}`,
                cfData?.deferredTaxes ?? 0);
            // WC changes
            setF(R.cf_changeAR, yr, `-(${c}${R.accountsReceivable}-${pc}${R.accountsReceivable})`, cfData?.changeInAR ?? 0);
            setF(R.cf_changeInv, yr, `-(${c}${R.inventory}-${pc}${R.inventory})`, cfData?.changeInInventory ?? 0);
            setF(R.cf_changePrepaid, yr, `-(${c}${R.prepaid}-${pc}${R.prepaid})`, cfData?.changeInPrepaid ?? 0);
            setF(R.cf_changeAP, yr, `${c}${R.accountsPayable}-${pc}${R.accountsPayable}`, cfData?.changeInAP ?? 0);
            setF(R.cf_changeAccrued, yr, `${c}${R.accruedExp}-${pc}${R.accruedExp}`, cfData?.changeInAccruedExp ?? 0);
            setF(R.cf_changeDeferredRev, yr, `${c}${R.deferredRevenue}-${pc}${R.deferredRevenue}`, cfData?.changeInDeferredRev ?? 0);
            setF(R.cf_changeVATRec, yr, `-(${c}${R.vatReceivable}-${pc}${R.vatReceivable})`, cfData?.changeInVATReceivable ?? 0);
            setF(R.cf_changeVATPay, yr, `${c}${R.vatPayable}-${pc}${R.vatPayable}`, cfData?.changeInVATPayable ?? 0);
            setF(R.cf_totalWC, yr,
                `SUM(${c}${R.cf_changeAR}:${c}${R.cf_changeVATPay})`,
                cfData?.totalWorkingCapitalChange ?? 0);
            // CFO
            setF(R.cf_cfo, yr,
                `${c}${R.cf_netIncome}+${c}${R.cf_depreciation}+${c}${R.cf_amortization}+${c}${R.cf_sbc}+${c}${R.cf_deferredTax}+${c}${R.cf_totalWC}`,
                cfData?.cashFromOperations ?? 0);

            // CFI
            setF(R.cf_capex, yr,
                `-ABS(${c}${R.revenue}*${sr('capexPercent')})`,
                cfData?.capex ?? 0);
            setF(R.cf_acquisitions, yr, `0`, cfData?.acquisitions ?? 0);
            setF(R.cf_assetSales, yr, `0`, cfData?.assetSales ?? 0);
            setF(R.cf_cfi, yr,
                `${c}${R.cf_capex}+${c}${R.cf_acquisitions}+${c}${R.cf_assetSales}`,
                cfData?.cashFromInvesting ?? 0);

            // CFF
            setF(R.cf_debtIssuance, yr, sr('longTermDebtIssuance'), cfData?.debtIssuance ?? 0);
            setF(R.cf_debtRepayment, yr, `-ABS(${sr('longTermDebtRepayment')})`, cfData?.debtRepayment ?? 0);
            // Dividends = -MAX(0, Distributable Profit * payout)
            setF(R.cf_dividends, yr,
                `-MAX(0,${c}${R.distributableProfit}*${sr('dividendPayoutRatio')})`,
                cfData?.dividendsPaid ?? 0);
            // Employee Profit Sharing Paid = -EPD (cash outflow)
            setF(R.cf_epdPaid, yr,
                `-${c}${R.employeeProfitSharing}`,
                cfData?.employeeProfitSharingPaid ?? 0);
            setF(R.cf_equityIssuance, yr, sr('equityIssuance'), cfData?.equityIssuance ?? 0);
            setF(R.cf_shareRepurchases, yr, `-ABS(${sr('shareRepurchaseAmount')})`, cfData?.shareRepurchases ?? 0);
            setF(R.cf_cff, yr,
                `${c}${R.cf_debtIssuance}+${c}${R.cf_debtRepayment}+${c}${R.cf_dividends}+${c}${R.cf_epdPaid}+${c}${R.cf_equityIssuance}+${c}${R.cf_shareRepurchases}`,
                cfData?.cashFromFinancing ?? 0);

            // Summary
            setF(R.cf_netChange, yr,
                `${c}${R.cf_cfo}+${c}${R.cf_cfi}+${c}${R.cf_cff}`,
                cfData?.netChangeInCash ?? 0);
            setF(R.cf_beginCash, yr, `${pc}${R.cash}`, cfData?.beginningCash ?? 0);
            setF(R.cf_endCash, yr,
                `${c}${R.cf_beginCash}+${c}${R.cf_netChange}`,
                cfData?.endingCash ?? 0);
            setF(R.cf_fcf, yr,
                `${c}${R.cf_cfo}+${c}${R.cf_capex}`,
                cfData?.freeCashFlow ?? 0);
        }
    }

    return { ...R };
}

/* ══════════════════════════════════════════════════════ */
/*  PUBLIC: Build all 3 calc sheets                      */
/* ══════════════════════════════════════════════════════ */
interface CalcSheetsConfig {
    workbook: ExcelJS.Workbook;
    scenarioRows: ScenarioRowMap;
    isRows: Record<string, number>;
    bsRows: Record<string, number>;
    periods: string[];
    numHistorical: number;
    nYears: number;
    allScenarios: Array<{ type: string; results: ModelResults | null }>;
}

export interface CalcSheetInfo {
    sheetName: string;
    rows: CalcSheetRowMap;
}

export function buildCalcSheets(cfg: CalcSheetsConfig): Record<string, CalcSheetInfo> {
    const SHEET_MAP: { type: string; sheetName: string; blockName: string }[] = [
        { type: 'base', sheetName: '_Calc_Base', blockName: 'Base Case' },
        { type: 'optimistic', sheetName: '_Calc_Opt', blockName: 'Optimistic' },
        { type: 'conservative', sheetName: '_Calc_Con', blockName: 'Conservative' },
    ];

    const result: Record<string, CalcSheetInfo> = {};

    for (const sm of SHEET_MAP) {
        const scenario = cfg.allScenarios.find(s => s.type === sm.type);
        if (!scenario) {
            console.warn(`buildCalcSheets: skipping ${sm.sheetName} — no scenario for type "${sm.type}"`);
            continue;
        }

        console.log(`buildCalcSheets: creating ${sm.sheetName} for "${sm.blockName}"`);

        const rows = buildOneCalcSheet({
            workbook: cfg.workbook,
            sheetName: sm.sheetName,
            blockName: sm.blockName,
            scenarioRows: cfg.scenarioRows,
            isRows: cfg.isRows,
            bsRows: cfg.bsRows,
            periods: cfg.periods,
            numHistorical: cfg.numHistorical,
            nYears: cfg.nYears,
            results: scenario.results,
        });

        result[sm.type] = { sheetName: sm.sheetName, rows };
    }

    return result;
}

// Re-export the row constants for use in build-scenarios.ts
export { R as CALC_ROWS };
