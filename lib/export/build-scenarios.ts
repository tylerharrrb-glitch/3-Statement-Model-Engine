// ============================================================
// Scenarios Sheet Builder — ExcelJS  (FULL ENGINE DATA)
// ============================================================
//
// Writes every assumption AND engine-computed value for each scenario
// into the Scenarios sheet, so the IF formulas in Assumptions can
// switch the entire model between scenarios with zero reconciliation
// errors.
// ============================================================
import ExcelJS from 'exceljs';
import { Scenario } from '@/types/scenario';
import { AssumptionSet } from '@/types/assumptions';
import { ModelResults } from '@/types/financial';

/* ── Styling ─────────────────────────────────────────── */
const NAVY = 'FF1F3864';
const MED_BLUE = 'FF2E75B6';
const GREEN = 'FF1A7A4A';
const AMBER = 'FFB7791F';
const WHITE = 'FFFFFFFF';
const LIGHT_GRAY = 'FFF2F2F2';
const DARK_GRAY = 'FF404040';
const SCENARIO_BLUE = 'FF000080';
const solidFill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
};
const PCT_FMT = '0.0%';
const NUM_FMT = '#,##0';
const DAY_FMT = '#,##0';

/* ── Row Key Definitions ─────────────────────────────── */
// These MUST match the keys used in aRows in excel.ts exactly so the
// wiring loop can pair each Assumptions row with its Scenarios row.

interface RowSpec {
    key: string;                              // matches aRows key
    label: string;
    fmt: string;
    section?: string;                         // section header before this row
}

const ROW_SPECS: RowSpec[] = [
    // ── Income Statement Drivers ──
    { key: 'revenueBase', label: 'Revenue Base (Historical)', fmt: NUM_FMT, section: '── Income Statement Drivers ──' },
    { key: 'revenueBaseProjection', label: 'Revenue Base (Projection)', fmt: NUM_FMT },
    { key: 'revenueGrowthRate', label: 'Revenue Growth Rate', fmt: PCT_FMT },
    { key: 'cogsPercent', label: 'COGS % of Revenue', fmt: PCT_FMT },
    { key: 'sgaPercent', label: 'SG&A % of Revenue', fmt: PCT_FMT },
    { key: 'rdPercent', label: 'R&D % of Revenue', fmt: PCT_FMT },
    { key: 'otherOpexPercent', label: 'Other OpEx % of Revenue', fmt: PCT_FMT },
    { key: 'taxRate', label: 'Tax Rate', fmt: PCT_FMT },
    { key: 'otherIncomeExpense', label: 'Other Income / Expense', fmt: NUM_FMT },
    { key: 'sharesOutstanding', label: 'Shares Outstanding', fmt: '#,##0' },
    { key: 'stockBasedCompAmount', label: 'Stock-Based Comp Amount', fmt: NUM_FMT },
    { key: 'employeeProfitSharingRate', label: 'EPD Rate (Employee Profit Sharing)', fmt: PCT_FMT },
    { key: 'paidUpCapital', label: 'Issued (Paid-Up) Capital', fmt: NUM_FMT },

    // ── Balance Sheet / WC Drivers ──
    { key: 'dso', label: 'DSO (Days)', fmt: DAY_FMT, section: '── Balance Sheet / WC Drivers ──' },
    { key: 'dio', label: 'DIO (Days)', fmt: DAY_FMT },
    { key: 'dpo', label: 'DPO (Days)', fmt: DAY_FMT },
    { key: 'prepaidPercent', label: 'Prepaid % of Revenue', fmt: PCT_FMT },
    { key: 'accruedExpPercent', label: 'Accrued Exp % of Revenue', fmt: PCT_FMT },
    { key: 'deferredRevPercent', label: 'Deferred Rev % of Revenue', fmt: PCT_FMT },

    // ── CapEx & Depreciation ──
    { key: 'capexPercent', label: 'CapEx % of Revenue', fmt: PCT_FMT, section: '── CapEx & Depreciation ──' },
    { key: 'depreciationRate', label: 'Depreciation Rate (% Gross PPE)', fmt: PCT_FMT },
    { key: 'amortizationAmount', label: 'Amortization Amount', fmt: NUM_FMT },

    // ── Debt & Financing ──
    { key: 'interestRate', label: 'Interest Rate (on Debt)', fmt: PCT_FMT, section: '── Debt & Financing ──' },
    { key: 'interestIncomeRate', label: 'Interest Income Rate (on Cash)', fmt: PCT_FMT },
    { key: 'shortTermDebtAmount', label: 'Short-Term Debt', fmt: NUM_FMT },
    { key: 'longTermDebtIssuance', label: 'LT Debt Issuance', fmt: NUM_FMT },
    { key: 'longTermDebtRepayment', label: 'LT Debt Repayment', fmt: NUM_FMT },
    { key: 'currentPortionLTD', label: 'Current Portion LTD', fmt: NUM_FMT },
    { key: 'dividendPayoutRatio', label: 'Dividend Payout Ratio', fmt: PCT_FMT },
    { key: 'shareRepurchaseAmount', label: 'Share Repurchase Amount', fmt: NUM_FMT },
    { key: 'equityIssuance', label: 'Equity Issuance', fmt: NUM_FMT },

    // ── BS / Equity Direct Values ──
    { key: 'goodwill', label: 'Goodwill', fmt: NUM_FMT, section: '── BS / Equity Direct Values ──' },
    { key: 'otherCurrentAssets', label: 'Other Current Assets', fmt: NUM_FMT },
    { key: 'otherLongTermAssets', label: 'Other Long-Term Assets', fmt: NUM_FMT },
    { key: 'otherCurrentLiabilities', label: 'Other Current Liabilities', fmt: NUM_FMT },
    { key: 'deferredTaxLiabilities', label: 'Deferred Tax Liabilities', fmt: NUM_FMT },
    { key: 'otherLongTermLiabilities', label: 'Other LT Liabilities', fmt: NUM_FMT },
    { key: 'commonStock', label: 'Common Stock', fmt: NUM_FMT },
    { key: 'apic', label: 'APIC', fmt: NUM_FMT },
    { key: 'oci', label: 'Other Comprehensive Income', fmt: NUM_FMT },

    // ── Engine-Computed Values ──
    { key: 'interestIncomeComputed', label: 'Interest Income (Computed)', fmt: NUM_FMT, section: '── Engine-Computed Values ──' },
    { key: 'interestExpenseComputed', label: 'Interest Expense (Computed)', fmt: NUM_FMT },
    { key: 'depreciationComputed', label: 'Depreciation (Computed)', fmt: NUM_FMT },
    { key: 'grossPPEComputed', label: 'Gross PP&E (Computed)', fmt: NUM_FMT },
    { key: 'accumDepComputed', label: 'Accum Depreciation (Computed)', fmt: NUM_FMT },
    { key: 'netPPEComputed', label: 'Net PP&E (Computed)', fmt: NUM_FMT },
    { key: 'intangiblesComputed', label: 'Intangibles (Computed)', fmt: NUM_FMT },
    { key: 'ltdComputed', label: 'Long-Term Debt (Computed)', fmt: NUM_FMT },
    { key: 'reComputed', label: 'Retained Earnings (Computed)', fmt: NUM_FMT },
    { key: 'tsComputed', label: 'Treasury Stock (Computed)', fmt: NUM_FMT },
    { key: 'apicComputed', label: 'APIC (Computed)', fmt: NUM_FMT },
    { key: 'dividendsPaidComputed', label: 'Dividends Paid (Computed)', fmt: NUM_FMT },
    { key: 'equityIssuanceComputed', label: 'Equity Issuance (Computed)', fmt: NUM_FMT },
    { key: 'shareRepurchasesComputed', label: 'Share Repurchases (Computed)', fmt: NUM_FMT },
    { key: 'acquisitionsComputed', label: 'Acquisitions (Computed)', fmt: NUM_FMT },
    { key: 'assetSalesComputed', label: 'Asset Sales (Computed)', fmt: NUM_FMT },

    // ── Dashboard Output Metrics ──
    // These store the full IS/BS/CF/Ratio output values so the Dashboard
    // can pull scenario-specific numbers using IF formulas.
    { key: 'out_revenue', label: 'Revenue', fmt: NUM_FMT, section: '── Dashboard Output Metrics ──' },
    { key: 'out_revenueGrowth', label: 'Revenue Growth %', fmt: PCT_FMT },
    { key: 'out_grossProfit', label: 'Gross Profit', fmt: NUM_FMT },
    { key: 'out_grossMargin', label: 'Gross Margin %', fmt: PCT_FMT },
    { key: 'out_ebitda', label: 'EBITDA', fmt: NUM_FMT },
    { key: 'out_ebit', label: 'EBIT', fmt: NUM_FMT },
    { key: 'out_ebitMargin', label: 'EBIT Margin %', fmt: PCT_FMT },
    { key: 'out_netIncome', label: 'Net Income', fmt: NUM_FMT },
    { key: 'out_netMargin', label: 'Net Margin %', fmt: PCT_FMT },
    { key: 'out_eps', label: 'EPS', fmt: '$#,##0.00' },
    { key: 'out_cfo', label: 'Cash from Operations', fmt: NUM_FMT },
    { key: 'out_fcf', label: 'Free Cash Flow', fmt: NUM_FMT },
    { key: 'out_endingCash', label: 'Ending Cash', fmt: NUM_FMT },
    { key: 'out_totalAssets', label: 'Total Assets', fmt: NUM_FMT },
    { key: 'out_totalDebt', label: 'Total Debt', fmt: NUM_FMT },
    { key: 'out_totalEquity', label: 'Total Equity', fmt: NUM_FMT },
    { key: 'out_cash', label: 'Cash Balance', fmt: NUM_FMT },
    { key: 'out_currentRatio', label: 'Current Ratio', fmt: '0.00"x"' },
    { key: 'out_debtToEquity', label: 'Debt / Equity', fmt: '0.00"x"' },
    { key: 'out_roe', label: 'ROE %', fmt: PCT_FMT },
    { key: 'out_roa', label: 'ROA %', fmt: PCT_FMT },
];

/* ── ScenarioRowMap ──────────────────────────────────── */
// Maps "ScenarioName_rowKey" → row number in the Scenarios sheet
export interface ScenarioRowMap { [scenarioKey: string]: number }

/* ── Build the all* arrays from a scenario's data ──── */
// This mirrors the logic in excel.ts lines 148-251 exactly, so the
// Scenarios sheet values will match what excel.ts writes for the
// active scenario.
function buildAllArrays(
    a: AssumptionSet,
    r: ModelResults,
    nYears: number,
    numHistorical: number,
): Record<string, number[]> {
    const sd = (n: number, d: number) => d !== 0 ? n / d : 0;

    // Derive ALL values from engine results `r` (not raw assumption arrays).
    // This ensures the Scenarios tab always reflects engine-consistent data,
    // since `r` is already computed per-scenario via runFullModel().
    const allIS = r.incomeStatements;
    const allBS = r.balanceSheets;
    const engineRevenues = allIS.map(is => is.revenue);

    const allRevenueGrowth = engineRevenues.map((rev, i) => {
        if (i === 0) return 0;
        return sd(rev - engineRevenues[i - 1], engineRevenues[i - 1]);
    });

    const out: Record<string, number[]> = {};

    // Revenue bases
    out['revenueBase'] = Array(nYears).fill(0);
    out['revenueBase'][0] = engineRevenues[0] ?? a.revenueBase;
    out['revenueBaseProjection'] = Array(nYears).fill(0);
    out['revenueBaseProjection'][0] = a.revenueBase;

    out['revenueGrowthRate'] = allRevenueGrowth;
    out['cogsPercent'] = allIS.map(is => sd(is.cogs, is.revenue));
    out['sgaPercent'] = allIS.map(is => sd(is.sgaExpense, is.revenue));
    out['rdPercent'] = allIS.map(is => sd(is.rdExpense, is.revenue));
    out['otherOpexPercent'] = allIS.map(is => sd(is.otherOpex, is.revenue));
    out['taxRate'] = allIS.map(is => is.taxRate);
    out['otherIncomeExpense'] = allIS.map(is => is.otherIncomeExpense);
    out['sharesOutstanding'] = allIS.map(is => is.sharesOutstanding);
    out['stockBasedCompAmount'] = allIS.map((_, i) => {
        // CF SBC (CF index = IS index - 1)
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < r.cashFlowStatements.length) return r.cashFlowStatements[cfIdx].stockBasedComp;
        return 0;
    });
    out['employeeProfitSharingRate'] = Array(nYears).fill(a.employeeProfitSharingRate ?? 0.10);
    out['paidUpCapital'] = Array(nYears).fill(a.paidUpCapital ?? 10_000);

    // Working capital days: back-calculate from BS/IS for all periods
    out['dso'] = allBS.map((bs, i) => sd(bs.accountsReceivable, allIS[i]?.revenue ?? 1) * 365);
    out['dio'] = allBS.map((bs, i) => sd(bs.inventory, allIS[i]?.cogs ?? 1) * 365);
    out['dpo'] = allBS.map((bs, i) => sd(bs.accountsPayable, allIS[i]?.cogs ?? 1) * 365);
    out['prepaidPercent'] = allBS.map((bs, i) => sd(bs.prepaidExpenses, allIS[i]?.revenue ?? 1));
    out['accruedExpPercent'] = allBS.map((bs, i) => sd(bs.accruedExpenses, allIS[i]?.revenue ?? 1));
    out['deferredRevPercent'] = allBS.map((bs, i) => sd(bs.deferredRevenue, allIS[i]?.revenue ?? 1));

    // CapEx % — back-compute from BS gross PPE changes
    out['capexPercent'] = allBS.map((bs, i) => {
        if (i === 0) return 0;
        return sd(bs.grossPPE - allBS[i - 1].grossPPE, allIS[i]?.revenue ?? 1);
    });
    // Depreciation Rate: use the assumption INPUT for projected years (10%),
    // NOT the back-calculated ratio (depreciation/grossPPE ≈ 9.4%).
    // Historical years: back-compute from engine data.
    // Same pattern as dividendPayoutRatio below.
    out['depreciationRate'] = allIS.map((is, i) => {
        if (i >= numHistorical) {
            // Projected: use the assumption input directly
            const projIdx = i - numHistorical;
            const rate = Array.isArray(a.depreciationRate)
                ? (a.depreciationRate[projIdx] ?? 0.10)
                : (a.depreciationRate ?? 0.10);
            return rate;
        }
        // Historical: back-compute from engine
        return sd(is.depreciation, allBS[i]?.grossPPE ?? 1);
    });
    out['amortizationAmount'] = allIS.map(is => is.amortization);

    // Per-year interest rate arrays (from assumptions, NOT scalar fill)
    out['interestRate'] = a.interestRateOnDebt.slice(0, nYears);
    while (out['interestRate'].length < nYears) out['interestRate'].push(out['interestRate'][out['interestRate'].length - 1] ?? 0.22);
    out['interestIncomeRate'] = a.interestRateOnCash.slice(0, nYears);
    while (out['interestIncomeRate'].length < nYears) out['interestIncomeRate'].push(out['interestIncomeRate'][out['interestIncomeRate'].length - 1] ?? 0.15);
    out['shortTermDebtAmount'] = allBS.map(bs => bs.shortTermDebt);
    // LTD Issuance/Repayment — back-compute from BS LTD changes
    out['longTermDebtIssuance'] = allBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - allBS[i - 1].longTermDebt;
        return change > 0 ? change : 0;
    });
    out['longTermDebtRepayment'] = allBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - allBS[i - 1].longTermDebt;
        return change < 0 ? Math.abs(change) : 0;
    });
    out['currentPortionLTD'] = allBS.map(bs => bs.currentPortionLTD);
    // Dividend payout ratio: use INPUT assumption value for projected years.
    // Back-computing from engine (abs(divPaid)/NI) breaks when NI≤0
    // (Conservative scenario gets 0.00 instead of 0.30).
    // Historical periods: back-compute from engine data.
    out['dividendPayoutRatio'] = allIS.map((is, i) => {
        if (i >= numHistorical) {
            // Projected: use the assumption input directly
            const projIdx = i - numHistorical;
            return a.dividendPayoutRatio[projIdx] ?? 0;
        }
        // Historical: back-compute from engine
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < r.cashFlowStatements.length) {
            const ni = is.netIncome;
            const divPaid = r.cashFlowStatements[cfIdx]?.dividendsPaid ?? 0;
            return ni !== 0 ? Math.abs(divPaid) / ni : 0;
        }
        return 0;
    });
    out['shareRepurchaseAmount'] = allBS.map((bs, i) => {
        if (i === 0) return 0;
        return Math.abs(bs.treasuryStock - allBS[i - 1].treasuryStock);
    });
    out['equityIssuance'] = allIS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < r.cashFlowStatements.length) return r.cashFlowStatements[cfIdx].equityIssuance;
        return 0;
    });

    // BS direct values — derive from engine results for all periods
    out['goodwill'] = allBS.map(bs => bs.goodwill);
    out['otherCurrentAssets'] = allBS.map(bs => bs.otherCurrentAssets);
    out['otherLongTermAssets'] = allBS.map(bs => bs.otherLongTermAssets);
    out['otherCurrentLiabilities'] = allBS.map(bs => bs.otherCurrentLiabilities);
    out['deferredTaxLiabilities'] = allBS.map(bs => bs.deferredTaxLiabilities);
    out['otherLongTermLiabilities'] = allBS.map(bs => bs.otherLongTermLiabilities);
    out['commonStock'] = allBS.map(bs => bs.commonStock);
    out['apic'] = allBS.map(bs => bs.additionalPaidInCapital);
    out['oci'] = allBS.map(bs => bs.otherComprehensiveIncome);

    // Engine-computed values
    out['interestIncomeComputed'] = r.incomeStatements.map(is => is.interestIncome);
    out['interestExpenseComputed'] = r.incomeStatements.map(is => is.interestExpense);
    out['depreciationComputed'] = r.incomeStatements.map(is => is.depreciation);
    out['grossPPEComputed'] = r.balanceSheets.map(bs => bs.grossPPE);
    out['accumDepComputed'] = r.balanceSheets.map(bs => bs.accumulatedDepreciation);
    out['netPPEComputed'] = r.balanceSheets.map(bs => bs.netPPE);
    out['intangiblesComputed'] = r.balanceSheets.map(bs => bs.intangibles);
    out['ltdComputed'] = r.balanceSheets.map(bs => bs.longTermDebt);
    out['reComputed'] = r.balanceSheets.map(bs => bs.retainedEarnings);
    out['tsComputed'] = r.balanceSheets.map(bs => bs.treasuryStock);
    out['apicComputed'] = r.balanceSheets.map(bs => bs.additionalPaidInCapital);

    // CF-computed (padded with 0 at index 0)
    out['dividendsPaidComputed'] = [0, ...r.cashFlowStatements.map(cf => cf.dividendsPaid)];
    out['equityIssuanceComputed'] = [0, ...r.cashFlowStatements.map(cf => cf.equityIssuance)];
    out['shareRepurchasesComputed'] = [0, ...r.cashFlowStatements.map(cf => cf.shareRepurchases)];
    out['acquisitionsComputed'] = [0, ...r.cashFlowStatements.map(cf => cf.acquisitions)];
    out['assetSalesComputed'] = [0, ...r.cashFlowStatements.map(cf => cf.assetSales)];

    // Legal Reserve computed values
    out['legalReserveAddition'] = r.incomeStatements.map(is => is.legalReserveAddition ?? 0);
    out['distributableProfit'] = r.incomeStatements.map(is => is.distributableProfit ?? 0);

    // ── Dashboard Output Metrics ──
    // IS-derived output values
    out['out_revenue'] = r.incomeStatements.map(is => is.revenue);
    out['out_revenueGrowth'] = r.incomeStatements.map(is => is.revenueGrowthRate ?? 0);
    out['out_grossProfit'] = r.incomeStatements.map(is => is.grossProfit);
    out['out_grossMargin'] = r.incomeStatements.map(is => is.grossMargin ?? 0);
    out['out_ebitda'] = r.incomeStatements.map(is => is.ebitda);
    out['out_ebit'] = r.incomeStatements.map(is => is.ebit);
    out['out_ebitMargin'] = r.incomeStatements.map(is => is.ebitMargin ?? 0);
    out['out_netIncome'] = r.incomeStatements.map(is => is.netIncome);
    out['out_netMargin'] = r.incomeStatements.map(is => is.netMargin ?? 0);
    out['out_eps'] = r.incomeStatements.map(is => is.eps ?? 0);

    // CF-derived output values (padded with 0 at index 0, since CF has nYears-1 entries)
    out['out_cfo'] = [0, ...r.cashFlowStatements.map(cf => cf.cashFromOperations)];
    out['out_fcf'] = [0, ...r.cashFlowStatements.map(cf => cf.freeCashFlow)];
    out['out_endingCash'] = [0, ...r.cashFlowStatements.map(cf => cf.endingCash)];

    // BS-derived output values
    out['out_totalAssets'] = r.balanceSheets.map(bs => bs.totalAssets);
    out['out_totalDebt'] = r.balanceSheets.map(bs => (bs.shortTermDebt ?? 0) + (bs.longTermDebt ?? 0) + (bs.currentPortionLTD ?? 0));
    out['out_totalEquity'] = r.balanceSheets.map(bs => bs.totalEquity);
    out['out_cash'] = r.balanceSheets.map(bs => bs.cash);

    // Ratio-derived output values
    out['out_currentRatio'] = r.ratios.map(rat => rat.currentRatio ?? 0);
    out['out_debtToEquity'] = r.ratios.map(rat => rat.debtToEquity ?? 0);
    out['out_roe'] = r.ratios.map(rat => rat.roe ?? 0);
    out['out_roa'] = r.ratios.map(rat => rat.roa ?? 0);

    return out;
}

/* ── Scenario Block Info ─────────────────────────────── */
interface ScenarioBlock {
    name: string;
    color: string;
    type: string;     // match against Scenario.type
}
const BLOCKS: ScenarioBlock[] = [
    { name: 'Base Case', color: MED_BLUE, type: 'base' },
    { name: 'Optimistic', color: GREEN, type: 'optimistic' },
    { name: 'Conservative', color: AMBER, type: 'conservative' },
];

/* ══════════════════════════════════════════════════════ */
/*  MAIN BUILDER                                         */
/* ══════════════════════════════════════════════════════ */

export function buildScenariosSheet(
    workbook: ExcelJS.Workbook,
    periods: string[],
    allScenarios: Scenario[] | undefined,
    numHistorical: number,
    nYears: number,
): { sheet: ExcelJS.Worksheet; scenarioRows: ScenarioRowMap } {
    const ws = workbook.addWorksheet('Scenarios');
    ws.properties.tabColor = { argb: GREEN };
    ws.getColumn(1).width = 35;
    for (let i = 0; i < nYears; i++) ws.getColumn(i + 2).width = 14;

    // Banner
    ws.getRow(1).height = 36;
    ws.mergeCells(1, 1, 1, nYears + 1);
    const b = ws.getCell(1, 1);
    b.value = 'SCENARIO DATA — COMPLETE ENGINE VALUES';
    b.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
    b.fill = solidFill(NAVY);
    b.alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells(2, 1, 2, nYears + 1);
    const sub = ws.getCell(2, 1);
    sub.value = 'This sheet stores the full engine-computed data for each scenario. All projection columns in Assumptions reference this sheet via IF formulas.';
    sub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: DARK_GRAY } };
    sub.fill = solidFill(LIGHT_GRAY);

    const scenarioRows: ScenarioRowMap = {};
    let row = 4;

    // Resolve scenarios
    const findScenario = (type: string): Scenario | undefined =>
        allScenarios?.find(s => s.type === type) ??
        allScenarios?.find(s => s.name.toLowerCase().includes(type.toLowerCase()));

    // Debug: log what scenarios we have
    console.log('=== buildScenariosSheet DEBUG ===');
    console.log('allScenarios count:', allScenarios?.length ?? 0);
    allScenarios?.forEach((s, i) => {
        console.log(`  [${i}] name="${s.name}" type="${s.type}" hasResults=${!!s.results}`);
    });

    for (const block of BLOCKS) {
        const scenario = findScenario(block.type);
        console.log(`Block "${block.name}" (type=${block.type}): found=${!!scenario}, hasResults=${!!scenario?.results}, scenarioName="${scenario?.name}"`);
        if (!scenario?.results) continue; // skip if no results

        const data = buildAllArrays(scenario.assumptions, scenario.results, nYears, numHistorical);

        // ── Scenario Title ──
        ws.mergeCells(row, 1, row, nYears + 1);
        const tc = ws.getCell(row, 1);
        tc.value = `▎ ${block.name.toUpperCase()}  ·  ${scenario.description || ''}`;
        tc.font = { name: 'Calibri', size: 12, bold: true, color: { argb: WHITE } };
        tc.fill = solidFill(block.color);
        row++;

        // ── Period Headers ──
        ws.getCell(row, 1).value = 'Assumption / Computed Value';
        ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
        ws.getCell(row, 1).fill = solidFill('FF444444');
        ws.getCell(row, 1).border = THIN_BORDER;
        for (let i = 0; i < nYears; i++) {
            const hc = ws.getCell(row, i + 2);
            hc.value = periods[i];
            hc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
            hc.fill = solidFill('FF444444');
            hc.alignment = { horizontal: 'center' };
            hc.border = THIN_BORDER;
        }
        row++;

        // ── Data Rows ──
        let altIdx = 0;
        for (const spec of ROW_SPECS) {
            // Section header
            if (spec.section) {
                ws.mergeCells(row, 1, row, nYears + 1);
                ws.getCell(row, 1).value = spec.section;
                ws.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
                ws.getCell(row, 1).fill = solidFill('FF555555');
                row++;
                altIdx = 0;
            }

            scenarioRows[`${block.name}_${spec.key}`] = row;
            const bg = altIdx % 2 === 0 ? LIGHT_GRAY : WHITE;

            ws.getCell(row, 1).value = spec.label;
            ws.getCell(row, 1).font = { name: 'Calibri', size: 10, color: { argb: NAVY } };
            ws.getCell(row, 1).fill = solidFill(bg);
            ws.getCell(row, 1).border = THIN_BORDER;

            const vals = data[spec.key] ?? [];
            for (let i = 0; i < nYears; i++) {
                const dc = ws.getCell(row, i + 2);
                dc.value = vals[i] ?? 0;
                dc.numFmt = spec.fmt;
                dc.font = { name: 'Calibri', size: 10, color: { argb: SCENARIO_BLUE } };
                dc.fill = solidFill(bg);
                dc.alignment = { horizontal: 'center' };
                dc.border = THIN_BORDER;
            }

            row++;
            altIdx++;
        }

        row++; // spacer between blocks
    }

    return { sheet: ws, scenarioRows };
}

export { ROW_SPECS };
