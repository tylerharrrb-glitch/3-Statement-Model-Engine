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
const R = {
    // IS section
    revenue: 2,
    revenueGrowth: 3,
    cogs: 4,
    grossProfit: 5,
    sga: 6,
    rd: 7,
    depreciation: 8,
    amortization: 9,
    otherOpex: 10,
    sbc: 11,
    totalOpex: 12,
    ebit: 13,
    interestIncome: 14,
    interestExpense: 15,
    otherIncomeExpense: 16,
    ebt: 17,
    tax: 18,
    netIncome: 19,
    // Legal Reserve (Law 159/1981) — inserted between NI and EPD
    legalReserveAddition: 20,     // = MIN(NI × 5%, cap - cumulative)
    cumulativeLegalReserve: 21,   // = prior + addition
    distributableProfit: 22,      // = NI - LR Addition
    employeeProfitSharing: 23,    // = MAX(0, Distributable × 10%)
    netIncomeAfterEPD: 24,        // = Distributable - EPD
    // BS section (row 26+)
    cash: 26,
    accountsReceivable: 27,
    inventory: 28,
    prepaid: 29,
    otherCA: 30,
    totalCA: 31,
    // spacer 32
    grossPPE: 33,
    accumDep: 34,
    netPPE: 35,
    intangibles: 36,
    goodwill: 37,
    otherLTA: 38,
    totalNCA: 39,
    totalAssets: 40,
    // spacer 41
    accountsPayable: 42,
    accruedExp: 43,
    shortTermDebt: 44,
    currentPortionLTD: 45,
    deferredRevenue: 46,
    otherCL: 47,
    totalCL: 48,
    // spacer 49
    longTermDebt: 50,
    deferredTaxLiab: 51,
    otherLTL: 52,
    totalNCL: 53,
    totalLiabilities: 54,
    // spacer 55
    commonStock: 56,
    apic: 57,
    legalReserveEquity: 58,      // NEW: cumulative Legal Reserve in equity
    retainedEarnings: 59,
    treasuryStock: 60,
    oci: 61,
    totalEquity: 62,
    // spacer 63
    totalLE: 64,
    balanceCheck: 65,
    // CF section (row 67+)
    cf_netIncome: 67,
    cf_depreciation: 68,
    cf_amortization: 69,
    cf_sbc: 70,
    cf_deferredTax: 71,
    cf_changeAR: 72,
    cf_changeInv: 73,
    cf_changePrepaid: 74,
    cf_changeAP: 75,
    cf_changeAccrued: 76,
    cf_changeDeferredRev: 77,
    cf_totalWC: 78,
    cf_cfo: 79,
    // spacer 80
    cf_capex: 81,
    cf_acquisitions: 82,
    cf_assetSales: 83,
    cf_cfi: 84,
    // spacer 85
    cf_debtIssuance: 86,
    cf_debtRepayment: 87,
    cf_dividends: 88,
    cf_epdPaid: 89,
    cf_equityIssuance: 90,
    cf_shareRepurchases: 91,
    cf_cff: 92,
    // spacer 93
    cf_netChange: 94,
    cf_beginCash: 95,
    cf_endCash: 96,
    cf_fcf: 97,
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
    setL(R.legalReserveAddition, 'Legal Reserve Addition (5% NI, Law 159/1981)');
    setL(R.cumulativeLegalReserve, 'Cumulative Legal Reserve');
    setL(R.distributableProfit, 'Distributable Profit');
    setL(R.employeeProfitSharing, 'Employee Profit Sharing (EPD)');
    setL(R.netIncomeAfterEPD, 'Net Income After EPD');
    ws.getCell(25, 1).value = '── Balance Sheet ──';
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
    ws.getCell(66, 1).value = '── Cash Flow ──';
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
                0, PCT_FMT);
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
            // Legal Reserve — Law 159/1981: 5% of NI, cap at 50% of issued capital
            setF(R.legalReserveAddition, yr, '0', isData?.legalReserveAddition ?? 0);
            setF(R.cumulativeLegalReserve, yr, '0', 0);
            setF(R.distributableProfit, yr, `${c}${R.netIncome}-${c}${R.legalReserveAddition}`,
                (isData?.netIncome ?? 0) - (isData?.legalReserveAddition ?? 0));
            // EPD — compute from Distributable Profit for historical consistency
            setF(R.employeeProfitSharing, yr,
                `MAX(0,${c}${R.distributableProfit}*${scenRef(scenarioRows, blockName, 'employeeProfitSharingRate', yr)})`,
                isData?.employeeProfitSharing ?? 0);
            setF(R.netIncomeAfterEPD, yr,
                `${c}${R.distributableProfit}-${c}${R.employeeProfitSharing}`,
                isData?.netIncomeAfterEPD ?? 0);

            // BS — reference existing BS tab
            setF(R.cash, yr, bsRef(bsRows, 'cash', yr), bsData?.cash ?? 0);
            setF(R.accountsReceivable, yr, bsRef(bsRows, 'accountsReceivable', yr), bsData?.accountsReceivable ?? 0);
            setF(R.inventory, yr, bsRef(bsRows, 'inventory', yr), bsData?.inventory ?? 0);
            setF(R.prepaid, yr, bsRef(bsRows, 'prepaidExpenses', yr), bsData?.prepaidExpenses ?? 0);
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
            setF(R.otherCL, yr, bsRef(bsRows, 'otherCurrentLiabilities', yr), bsData?.otherCurrentLiabilities ?? 0);
            setF(R.totalCL, yr, `SUM(${c}${R.accountsPayable}:${c}${R.otherCL})`, bsData?.totalCurrentLiabilities ?? 0);
            setF(R.longTermDebt, yr, bsRef(bsRows, 'longTermDebt', yr), bsData?.longTermDebt ?? 0);
            setF(R.deferredTaxLiab, yr, bsRef(bsRows, 'deferredTaxLiabilities', yr), bsData?.deferredTaxLiabilities ?? 0);
            setF(R.otherLTL, yr, bsRef(bsRows, 'otherLongTermLiabilities', yr), bsData?.otherLongTermLiabilities ?? 0);
            setF(R.totalNCL, yr, `SUM(${c}${R.longTermDebt}:${c}${R.otherLTL})`, bsData?.totalNonCurrentLiabilities ?? 0);
            setF(R.totalLiabilities, yr, `${c}${R.totalCL}+${c}${R.totalNCL}`, bsData?.totalLiabilities ?? 0);
            setF(R.commonStock, yr, bsRef(bsRows, 'commonStock', yr), bsData?.commonStock ?? 0);
            setF(R.apic, yr, bsRef(bsRows, 'additionalPaidInCapital', yr), bsData?.additionalPaidInCapital ?? 0);
            setF(R.legalReserveEquity, yr, `${c}${R.cumulativeLegalReserve}`, 0);
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
                setF(R.cf_totalWC, yr,
                    `SUM(${c}${R.cf_changeAR}:${c}${R.cf_changeDeferredRev})`,
                    cfData.totalWorkingCapitalChange);
                setF(R.cf_cfo, yr,
                    `${c}${R.cf_netIncome}+${c}${R.cf_depreciation}+${c}${R.cf_amortization}+${c}${R.cf_sbc}+${c}${R.cf_deferredTax}+${c}${R.cf_totalWC}`,
                    cfData.cashFromOperations);
                setF(R.cf_capex, yr,
                    `-ABS(${c}${R.revenue}*${sRef('capexPercent', yr)})`,
                    cfData.capex);
                setF(R.cf_acquisitions, yr, `${sRef('acquisitionsComputed', yr)}`, cfData.acquisitions);
                setF(R.cf_assetSales, yr, `${sRef('assetSalesComputed', yr)}`, cfData.assetSales);
                setF(R.cf_cfi, yr,
                    `${c}${R.cf_capex}+${c}${R.cf_acquisitions}+${c}${R.cf_assetSales}`,
                    cfData.cashFromInvesting);
                setF(R.cf_debtIssuance, yr, `${sRef('longTermDebtIssuance', yr)}`, cfData.debtIssuance);
                setF(R.cf_debtRepayment, yr, `-ABS(${sRef('longTermDebtRepayment', yr)})`, cfData.debtRepayment);
                setF(R.cf_dividends, yr, `${sRef('dividendsPaidComputed', yr)}`, cfData.dividendsPaid);
                setF(R.cf_epdPaid, yr, `-${c}${R.employeeProfitSharing}`, cfData.employeeProfitSharingPaid ?? 0);
                setF(R.cf_equityIssuance, yr, `${sRef('equityIssuanceComputed', yr)}`, cfData.equityIssuance);
                setF(R.cf_shareRepurchases, yr, `${sRef('shareRepurchasesComputed', yr)}`, cfData.shareRepurchases);
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
            setF(R.revenueGrowth, yr, sr('revenueGrowthRate'), 0, PCT_FMT);

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

            // ── Legal Reserve (Law 159/1981) ──
            // LR Addition = IF(cumLR >= issuedCap*0.50, 0, MIN(NI*0.05, issuedCap*0.50 - prevCumLR))
            // For simplicity, use MIN(NI*0.05, paidUpCap*0.50 - prevCumulativeLR)
            // where paidUpCap comes from Scenarios if available, else hardcode issued capital
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
                0);
            // Distributable Profit = NI - Legal Reserve Addition
            setF(R.distributableProfit, yr,
                `${c}${R.netIncome}-${c}${R.legalReserveAddition}`,
                (isData?.netIncome ?? 0) - (isData?.legalReserveAddition ?? 0));

            // EPD = MAX(0, Distributable Profit × EPD rate) — Law 159/1981
            setF(R.employeeProfitSharing, yr,
                `MAX(0,${c}${R.distributableProfit}*${sr('employeeProfitSharingRate')})`,
                isData?.employeeProfitSharing ?? 0);
            // NI After EPD = Distributable Profit - EPD
            setF(R.netIncomeAfterEPD, yr,
                `${c}${R.distributableProfit}-${c}${R.employeeProfitSharing}`,
                isData?.netIncomeAfterEPD ?? 0);

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
                `${pc}${R.apic}+${sr('equityIssuance')}`,
                bsData?.additionalPaidInCapital ?? 0);
            // Legal Reserve (Equity) — cumulative from IS
            setF(R.legalReserveEquity, yr,
                `${c}${R.cumulativeLegalReserve}`,
                0);
            // Retained Earnings — NI After EPD - Dividends (LR already subtracted)
            setF(R.retainedEarnings, yr,
                `${pc}${R.retainedEarnings}+${c}${R.netIncomeAfterEPD}+${c}${R.cf_dividends}`,
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
            setF(R.cf_totalWC, yr,
                `SUM(${c}${R.cf_changeAR}:${c}${R.cf_changeDeferredRev})`,
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
            // Dividends = -MAX(0, NI After EPD * payout)
            setF(R.cf_dividends, yr,
                `-MAX(0,${c}${R.netIncomeAfterEPD}*${sr('dividendPayoutRatio')})`,
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
