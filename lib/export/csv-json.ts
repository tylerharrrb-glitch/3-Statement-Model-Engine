// ============================================================
// CSV & JSON Export
// ============================================================

import { ModelResults } from '@/types/financial';

// ── CSV EXPORT ───────────────────────────────────────────────

function toCsvValue(v: unknown): string {
    if (v === null || v === undefined) return '';
    const str = String(v);
    return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
}

function buildCsvRows(headers: string[], rows: (string | number | boolean)[][]): string {
    const lines = [headers.map(toCsvValue).join(',')];
    for (const row of rows) {
        lines.push(row.map(toCsvValue).join(','));
    }
    return lines.join('\n');
}

export function exportToCSV(results: ModelResults, companyName: string, currency: string = 'USD'): void {
    const sections: string[] = [];

    // Metadata header
    sections.push(`# Export: ${companyName} | Currency: ${currency} | Generated: ${new Date().toISOString()}`);

    // ── INCOME STATEMENT ────────────────────────────────────
    sections.push('=== INCOME STATEMENT ===');
    const isPeriods = results.incomeStatements.map(s => s.period);
    const isRows: [string, ...(number | string)[]][] = [
        ['Period Type', ...results.incomeStatements.map(s => s.periodType)],
        ['Revenue', ...results.incomeStatements.map(s => s.revenue)],
        ['Revenue Growth Rate', ...results.incomeStatements.map(s => s.revenueGrowthRate)],
        ['COGS', ...results.incomeStatements.map(s => s.cogs)],
        ['Gross Profit', ...results.incomeStatements.map(s => s.grossProfit)],
        ['Gross Margin', ...results.incomeStatements.map(s => s.grossMargin)],
        ['SG&A', ...results.incomeStatements.map(s => s.sgaExpense)],
        ['R&D', ...results.incomeStatements.map(s => s.rdExpense)],
        ['Depreciation', ...results.incomeStatements.map(s => s.depreciation)],
        ['Amortization', ...results.incomeStatements.map(s => s.amortization)],
        ['Other OpEx', ...results.incomeStatements.map(s => s.otherOpex)],
        ['Stock-Based Comp', ...results.incomeStatements.map(s => s.stockBasedComp)],
        ['Total OpEx', ...results.incomeStatements.map(s => s.totalOpex)],
        ['EBIT', ...results.incomeStatements.map(s => s.ebit)],
        ['EBITDA', ...results.incomeStatements.map(s => s.ebitda)],
        ['EBIT Margin', ...results.incomeStatements.map(s => s.ebitMargin)],
        ['Interest Income', ...results.incomeStatements.map(s => s.interestIncome)],
        ['Interest Expense', ...results.incomeStatements.map(s => s.interestExpense)],
        ['Other Income/Expense', ...results.incomeStatements.map(s => s.otherIncomeExpense)],
        ['EBT', ...results.incomeStatements.map(s => s.ebt)],
        ['Disallowed Interest (Thin-Cap)', ...results.incomeStatements.map(s => s.disallowedInterest ?? 0)],
        ['Adjusted Taxable Income', ...results.incomeStatements.map(s => s.adjustedTaxableIncome ?? s.taxableIncome)],
        ['Tax Rate', ...results.incomeStatements.map(s => s.taxRate)],
        ['Tax Expense', ...results.incomeStatements.map(s => s.taxExpense)],
        ['Net Income', ...results.incomeStatements.map(s => s.netIncome)],
        ['Net Margin', ...results.incomeStatements.map(s => s.netMargin)],
        ['Employee Profit Sharing (EPD)', ...results.incomeStatements.map(s => s.employeeProfitSharing)],
        ['Net Income After EPD', ...results.incomeStatements.map(s => s.netIncomeAfterEPD)],
        ['Tax Loss Carryforward', ...results.incomeStatements.map(s => s.taxLossCarryforward)],
        ['Tax Loss Utilized', ...results.incomeStatements.map(s => s.taxLossUtilized)],
        ['Tax Loss Remaining', ...results.incomeStatements.map(s => s.taxLossRemaining)],
        ['Taxable Income', ...results.incomeStatements.map(s => s.taxableIncome)],
        ['Legal Reserve Addition', ...results.incomeStatements.map(s => s.legalReserveAddition)],
        ['Distributable Profit', ...results.incomeStatements.map(s => s.distributableProfit)],
        ['Gross Dividends', ...results.incomeStatements.map(s => s.grossDividends)],
        ['Dividend WHT', ...results.incomeStatements.map(s => s.dividendWHT)],
        ['Net Dividends', ...results.incomeStatements.map(s => s.netDividends)],
        ['Addition to RE', ...results.incomeStatements.map(s => s.additionToRE)],
        ['NOPAT', ...results.incomeStatements.map(s => s.nopat)],
        ['FCFF', ...results.incomeStatements.map(s => s.fcff ?? 0)],
        ['Shares Outstanding', ...results.incomeStatements.map(s => s.sharesOutstanding)],
        ['EPS', ...results.incomeStatements.map(s => s.eps)],
    ];
    sections.push(buildCsvRows(['Item', ...isPeriods], isRows));

    // ── BALANCE SHEET ───────────────────────────────────────
    sections.push('\n=== BALANCE SHEET ===');
    const bsPeriods = results.balanceSheets.map(s => s.period);
    const bsRows: [string, ...(number | string | boolean)[]][] = [
        ['Period Type', ...results.balanceSheets.map(s => s.periodType)],
        // Current Assets
        ['Cash', ...results.balanceSheets.map(s => s.cash)],
        ['Accounts Receivable', ...results.balanceSheets.map(s => s.accountsReceivable)],
        ['Inventory', ...results.balanceSheets.map(s => s.inventory)],
        ['Prepaid Expenses', ...results.balanceSheets.map(s => s.prepaidExpenses)],
        ['Other Current Assets', ...results.balanceSheets.map(s => s.otherCurrentAssets)],
        ['VAT Receivable', ...results.balanceSheets.map(s => s.vatReceivable ?? 0)],
        ['Total Current Assets', ...results.balanceSheets.map(s => s.totalCurrentAssets)],
        // Non-Current Assets
        ['Gross PP&E', ...results.balanceSheets.map(s => s.grossPPE)],
        ['Accumulated Depreciation', ...results.balanceSheets.map(s => s.accumulatedDepreciation)],
        ['Net PP&E', ...results.balanceSheets.map(s => s.netPPE)],
        ['Intangibles', ...results.balanceSheets.map(s => s.intangibles)],
        ['Goodwill', ...results.balanceSheets.map(s => s.goodwill)],
        ['Other LT Assets', ...results.balanceSheets.map(s => s.otherLongTermAssets)],
        ['Total Non-Current Assets', ...results.balanceSheets.map(s => s.totalNonCurrentAssets)],
        ['Total Assets', ...results.balanceSheets.map(s => s.totalAssets)],
        // Current Liabilities
        ['Accounts Payable', ...results.balanceSheets.map(s => s.accountsPayable)],
        ['Accrued Expenses', ...results.balanceSheets.map(s => s.accruedExpenses)],
        ['Short-Term Debt', ...results.balanceSheets.map(s => s.shortTermDebt)],
        ['Current Portion LTD', ...results.balanceSheets.map(s => s.currentPortionLTD)],
        ['Deferred Revenue', ...results.balanceSheets.map(s => s.deferredRevenue)],
        ['Other Current Liabilities', ...results.balanceSheets.map(s => s.otherCurrentLiabilities)],
        ['VAT Payable', ...results.balanceSheets.map(s => s.vatPayable ?? 0)],
        ['Total Current Liabilities', ...results.balanceSheets.map(s => s.totalCurrentLiabilities)],
        // Non-Current Liabilities
        ['Long-Term Debt', ...results.balanceSheets.map(s => s.longTermDebt)],
        ['Deferred Tax Liabilities', ...results.balanceSheets.map(s => s.deferredTaxLiabilities)],
        ['End of Service Provision', ...results.balanceSheets.map(s => s.endOfServiceProvision)],
        ['Other LT Liabilities', ...results.balanceSheets.map(s => s.otherLongTermLiabilities)],
        ['Total Non-Current Liabilities', ...results.balanceSheets.map(s => s.totalNonCurrentLiabilities)],
        ['Total Liabilities', ...results.balanceSheets.map(s => s.totalLiabilities)],
        // Equity
        ['Common Stock', ...results.balanceSheets.map(s => s.commonStock)],
        ['Additional Paid-In Capital', ...results.balanceSheets.map(s => s.additionalPaidInCapital)],
        ['Legal Reserve', ...results.balanceSheets.map(s => s.legalReserve ?? 0)],
        ['Retained Earnings', ...results.balanceSheets.map(s => s.retainedEarnings)],
        ['Treasury Stock', ...results.balanceSheets.map(s => s.treasuryStock)],
        ['Other Comprehensive Income', ...results.balanceSheets.map(s => s.otherComprehensiveIncome)],
        ['Total Equity', ...results.balanceSheets.map(s => s.totalEquity)],
        ['Total Liabilities + Equity', ...results.balanceSheets.map(s => s.totalLiabilitiesEquity)],
        // Checks
        ['Is Balanced', ...results.balanceSheets.map(s => s.isBalanced)],
        ['Balance Difference', ...results.balanceSheets.map(s => s.balanceDifference)],
    ];
    sections.push(buildCsvRows(['Item', ...bsPeriods], bsRows));

    // ── CASH FLOW STATEMENT ─────────────────────────────────
    sections.push('\n=== CASH FLOW STATEMENT ===');
    const cfPeriods = results.cashFlowStatements.map(s => s.period);
    const cfRows: [string, ...(number | string | boolean)[]][] = [
        ['Period Type', ...results.cashFlowStatements.map(s => s.periodType)],
        // Operating
        ['Net Income', ...results.cashFlowStatements.map(s => s.netIncome)],
        ['Depreciation', ...results.cashFlowStatements.map(s => s.depreciation)],
        ['Amortization', ...results.cashFlowStatements.map(s => s.amortization)],
        ['Stock-Based Comp', ...results.cashFlowStatements.map(s => s.stockBasedComp)],
        ['Deferred Taxes', ...results.cashFlowStatements.map(s => s.deferredTaxes)],
        // Working Capital
        ['Δ Accounts Receivable', ...results.cashFlowStatements.map(s => s.changeInAR)],
        ['Δ Inventory', ...results.cashFlowStatements.map(s => s.changeInInventory)],
        ['Δ Prepaid Expenses', ...results.cashFlowStatements.map(s => s.changeInPrepaid)],
        ['Δ Accounts Payable', ...results.cashFlowStatements.map(s => s.changeInAP)],
        ['Δ Accrued Expenses', ...results.cashFlowStatements.map(s => s.changeInAccruedExp)],
        ['Δ Deferred Revenue', ...results.cashFlowStatements.map(s => s.changeInDeferredRev)],
        ['Δ VAT Receivable', ...results.cashFlowStatements.map(s => s.changeInVATReceivable)],
        ['Δ VAT Payable', ...results.cashFlowStatements.map(s => s.changeInVATPayable)],
        ['Total WC Change', ...results.cashFlowStatements.map(s => s.totalWorkingCapitalChange)],
        ['Cash from Operations', ...results.cashFlowStatements.map(s => s.cashFromOperations)],
        // Investing
        ['Capital Expenditures', ...results.cashFlowStatements.map(s => s.capex)],
        ['Acquisitions', ...results.cashFlowStatements.map(s => s.acquisitions)],
        ['Asset Sales', ...results.cashFlowStatements.map(s => s.assetSales)],
        ['Investment Purchases', ...results.cashFlowStatements.map(s => s.investmentPurchases)],
        ['Investment Sales', ...results.cashFlowStatements.map(s => s.investmentSales)],
        ['Cash from Investing', ...results.cashFlowStatements.map(s => s.cashFromInvesting)],
        // Financing
        ['Debt Issuance', ...results.cashFlowStatements.map(s => s.debtIssuance)],
        ['Debt Repayment', ...results.cashFlowStatements.map(s => s.debtRepayment)],
        ['Equity Issuance', ...results.cashFlowStatements.map(s => s.equityIssuance)],
        ['Dividends Paid', ...results.cashFlowStatements.map(s => s.dividendsPaid)],
        ['Dividend WHT', ...results.cashFlowStatements.map(s => s.dividendWHT)],
        ['EPD Paid', ...results.cashFlowStatements.map(s => s.employeeProfitSharingPaid)],
        ['Share Repurchases', ...results.cashFlowStatements.map(s => s.shareRepurchases)],
        ['Cash from Financing', ...results.cashFlowStatements.map(s => s.cashFromFinancing)],
        // Net
        ['Net Change in Cash', ...results.cashFlowStatements.map(s => s.netChangeInCash)],
        ['Beginning Cash', ...results.cashFlowStatements.map(s => s.beginningCash)],
        ['Ending Cash', ...results.cashFlowStatements.map(s => s.endingCash)],
        ['Free Cash Flow', ...results.cashFlowStatements.map(s => s.freeCashFlow)],
        ['Reconciles', ...results.cashFlowStatements.map(s => s.reconciles)],
    ];
    sections.push(buildCsvRows(['Item', ...cfPeriods], cfRows));

    // ── KEY RATIOS ──────────────────────────────────────────
    sections.push('\n=== KEY RATIOS ===');
    const ratPeriods = results.ratios.map((_, i) => results.incomeStatements[i]?.period ?? `Year ${i + 1}`);
    const ratRows: [string, ...number[]][] = [
        // Profitability
        ['Gross Margin', ...results.ratios.map(r => r.grossMargin ?? 0)],
        ['EBITDA Margin', ...results.ratios.map(r => r.ebitdaMargin ?? 0)],
        ['Operating Margin', ...results.ratios.map(r => r.operatingMargin ?? 0)],
        ['Net Margin', ...results.ratios.map(r => r.netMargin ?? 0)],
        ['ROE', ...results.ratios.map(r => r.roe ?? 0)],
        ['ROA', ...results.ratios.map(r => r.roa ?? 0)],
        ['ROIC', ...results.ratios.map(r => r.roic ?? 0)],
        ['FCF Margin', ...results.ratios.map(r => r.fcfMargin ?? 0)],
        ['FCF / EBITDA', ...results.ratios.map(r => r.fcfToEbitda ?? 0)],
        // Liquidity
        ['Current Ratio', ...results.ratios.map(r => r.currentRatio ?? 0)],
        ['Quick Ratio', ...results.ratios.map(r => r.quickRatio ?? 0)],
        ['Cash Ratio', ...results.ratios.map(r => r.cashRatio ?? 0)],
        // Leverage
        ['Debt / Equity', ...results.ratios.map(r => r.debtToEquity ?? 0)],
        ['Debt / Assets', ...results.ratios.map(r => r.debtToAssets ?? 0)],
        ['Interest Coverage', ...results.ratios.map(r => r.interestCoverage ?? 0)],
        ['Net Debt', ...results.ratios.map(r => r.netDebt ?? 0)],
        ['Net Debt / EBITDA', ...results.ratios.map(r => r.netDebtToEbitda ?? 0)],
        ['DSCR', ...results.ratios.map(r => r.dscr ?? 0)],
        // Efficiency
        ['Asset Turnover', ...results.ratios.map(r => r.assetTurnover ?? 0)],
        ['Inventory Turnover', ...results.ratios.map(r => r.inventoryTurnover ?? 0)],
        ['Receivables Turnover', ...results.ratios.map(r => r.receivablesTurnover ?? 0)],
        ['DSO', ...results.ratios.map(r => r.dso ?? 0)],
        ['DIO', ...results.ratios.map(r => r.dio ?? 0)],
        ['DPO', ...results.ratios.map(r => r.dpo ?? 0)],
        ['Cash Conversion Cycle', ...results.ratios.map(r => r.cashConversionCycle ?? 0)],
        // DuPont
        ['DuPont ROE (3-Factor)', ...results.ratios.map(r => r.dupontROE_3F ?? 0)],
        ['DuPont ROE (5-Factor)', ...results.ratios.map(r => r.dupontROE_5F ?? 0)],
        // Altman Z-Score
        ['Altman Z-Score (Private)', ...results.ratios.map(r => r.altmanZScore ?? 0)],
        ['Altman Z-Score (EM)', ...results.ratios.map(r => r.altmanZScoreEM ?? 0)],
        // Break-Even
        ['Break-Even Revenue', ...results.ratios.map(r => r.breakEvenRevenue ?? 0)],
        ['Margin of Safety', ...results.ratios.map(r => r.marginOfSafety ?? 0)],
        ['Operating Leverage', ...results.ratios.map(r => r.operatingLeverage ?? 0)],
        // Per Share
        ['EPS', ...results.incomeStatements.map(s => s.eps ?? 0)],
        ['Book Value Per Share', ...results.ratios.map(r => r.bookValuePerShare ?? 0)],
        ['FCF Per Share', ...results.ratios.map(r => r.fcfPerShare ?? 0)],
        ['Revenue Per Share', ...results.ratios.map(r => r.revenuePerShare ?? 0)],
    ];
    sections.push(buildCsvRows(['Ratio', ...ratPeriods], ratRows));

    // ── DCF VALUATION ───────────────────────────────────────
    if (results.dcfValuation) {
        sections.push('\n=== DCF VALUATION ===');
        const dcf = results.dcfValuation;
        const dcfRows: [string, ...number[]][] = [
            ['WACC', dcf.wacc],
            ['Enterprise Value', dcf.enterpriseValue],
            ['Equity Value', dcf.equityValue],
            ['Implied Share Price', dcf.impliedSharePrice],
            ['Terminal Value', dcf.terminalValue],
            ['PV of Terminal Value', dcf.pvTerminalValue],
            ['Sum of Discounted FCFs', dcf.discountedFCFs.reduce((a, b) => a + b, 0)],
        ];
        sections.push(buildCsvRows(['Metric', 'Value'], dcfRows));
    }

    const csv = sections.join('\n');
    downloadText(csv, `${safeName(companyName)}_Financial_Model.csv`, 'text/csv');
}

// ── JSON EXPORT ──────────────────────────────────────────────

import type { AssumptionSet, HistoricalInputs } from '@/types/assumptions';
import type { Scenario } from '@/types/scenario';

export interface JSONExportOptions {
    companyName: string;
    ticker?: string;
    industry?: string;
    currency: string;
    country?: string;
    fiscalYearEnd?: string;
    valuationDate?: string;
    activeScenarioId?: string;
    assumptions: AssumptionSet;
    historicalInputs: HistoricalInputs;
    scenarios: Scenario[];
    /** Accepted for backwards compatibility — not written to the file. */
    results?: ModelResults;
    liveRates?: { cbeDepositRate: number; cbeLendingRate: number; cbeDiscountRate: number; tbillRate12m: number; usdEgpRate: number; eurEgpRate: number; lastUpdated: string; lastMPCDate: string; source: string } | null;
}

export function exportToJSON(opts: JSONExportOptions): void {
    // Inputs-only export: historical data + assumptions (per scenario).
    // Computed outputs (statements, ratios, DCF, validation) are NOT persisted
    // — the engine regenerates them deterministically from inputs on import.
    const numHist = opts.historicalInputs.periods.length;
    const startYear = opts.assumptions.startYear ?? 2026;

    const data = {
        // ── Metadata ─────────────────────────────────────────
        exportDate: new Date().toISOString(),
        engineVersion: '3SM-v10-inputs',

        // ── Company Info ─────────────────────────────────────
        companyInfo: {
            companyName: opts.companyName,
            ticker: opts.ticker ?? '',
            industry: opts.industry ?? '',
            currency: opts.currency,
            country: opts.country ?? '',
            fiscalYearEnd: opts.fiscalYearEnd ?? '',
            valuationDate: opts.valuationDate ?? '',
        },

        // ── Historical Inputs ────────────────────────────────
        // Normalize period labels — raw store may have duplicates like
        // ['2025','2025']; rebuild by back-counting from startYear so we
        // always emit e.g. ['2024','2025'].
        historicalInputs: {
            ...opts.historicalInputs,
            periods: opts.historicalInputs.periods.map(
                (_, idx) => `${startYear - numHist + idx}`,
            ),
        },

        // ── All Scenarios (assumptions only, no computed results) ────
        activeScenarioId: opts.activeScenarioId ?? '',
        scenarios: opts.scenarios.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            description: s.description,
            assumptions: s.assumptions,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
        })),
    };

    const json = JSON.stringify(data, null, 2);
    downloadText(json, `${safeName(opts.companyName)}_Financial_Model.json`, 'application/json');
}

// ── HELPERS ──────────────────────────────────────────────────

function safeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function downloadText(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
