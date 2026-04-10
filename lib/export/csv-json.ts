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

function buildCsvRows(headers: string[], rows: (string | number)[][]): string {
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

    // Income Statement
    sections.push('=== INCOME STATEMENT ===');
    const isPeriods = results.incomeStatements.map(s => s.period);
    const isRows: [string, ...number[]][] = [
        ['Revenue', ...results.incomeStatements.map(s => s.revenue)],
        ['COGS', ...results.incomeStatements.map(s => s.cogs)],
        ['Gross Profit', ...results.incomeStatements.map(s => s.grossProfit)],
        ['SG&A', ...results.incomeStatements.map(s => s.sgaExpense)],
        ['R&D', ...results.incomeStatements.map(s => s.rdExpense)],
        ['Depreciation', ...results.incomeStatements.map(s => s.depreciation)],
        ['Amortization', ...results.incomeStatements.map(s => s.amortization)],
        ['EBIT', ...results.incomeStatements.map(s => s.ebit)],
        ['EBITDA', ...results.incomeStatements.map(s => s.ebitda)],
        ['Interest Income', ...results.incomeStatements.map(s => s.interestIncome)],
        ['Interest Expense', ...results.incomeStatements.map(s => s.interestExpense)],
        ['Other Income/Expense', ...results.incomeStatements.map(s => s.otherIncomeExpense)],
        ['EBT', ...results.incomeStatements.map(s => s.ebt)],
        ['Disallowed Interest (Thin-Cap)', ...results.incomeStatements.map(s => s.disallowedInterest ?? 0)],
        ['Adjusted Taxable Income', ...results.incomeStatements.map(s => s.adjustedTaxableIncome ?? s.taxableIncome)],
        ['Tax Expense', ...results.incomeStatements.map(s => s.taxExpense)],
        ['Net Income', ...results.incomeStatements.map(s => s.netIncome)],
        ['Employee Profit Sharing (EPD)', ...results.incomeStatements.map(s => s.employeeProfitSharing)],
        ['Net Income After EPD', ...results.incomeStatements.map(s => s.netIncomeAfterEPD)],
        ['Legal Reserve Addition', ...results.incomeStatements.map(s => s.legalReserveAddition)],
        ['Distributable Profit', ...results.incomeStatements.map(s => s.distributableProfit)],
        ['Gross Dividends', ...results.incomeStatements.map(s => s.grossDividends)],
        ['Dividend WHT', ...results.incomeStatements.map(s => s.dividendWHT)],
        ['Addition to RE', ...results.incomeStatements.map(s => s.additionToRE)],
        ['EPS', ...results.incomeStatements.map(s => s.eps)],
        ['FCFF', ...results.incomeStatements.map(s => s.fcff ?? 0)],
    ];
    sections.push(buildCsvRows(['Item', ...isPeriods], isRows));

    // Balance Sheet
    sections.push('\n=== BALANCE SHEET ===');
    const bsPeriods = results.balanceSheets.map(s => s.period);
    const bsRows: [string, ...number[]][] = [
        ['Cash', ...results.balanceSheets.map(s => s.cash)],
        ['Accounts Receivable', ...results.balanceSheets.map(s => s.accountsReceivable)],
        ['Inventory', ...results.balanceSheets.map(s => s.inventory)],
        ['Total Current Assets', ...results.balanceSheets.map(s => s.totalCurrentAssets)],
        ['VAT Receivable', ...results.balanceSheets.map(s => s.vatReceivable ?? 0)],
        ['Net PPE', ...results.balanceSheets.map(s => s.netPPE)],
        ['Total Assets', ...results.balanceSheets.map(s => s.totalAssets)],
        ['Total Current Liabilities', ...results.balanceSheets.map(s => s.totalCurrentLiabilities)],
        ['VAT Payable', ...results.balanceSheets.map(s => s.vatPayable ?? 0)],
        ['Long-Term Debt', ...results.balanceSheets.map(s => s.longTermDebt)],
        ['Total Liabilities', ...results.balanceSheets.map(s => s.totalLiabilities)],
        ['Legal Reserve', ...results.balanceSheets.map(s => s.legalReserve ?? 0)],
        ['Retained Earnings', ...results.balanceSheets.map(s => s.retainedEarnings)],
        ['Total Equity', ...results.balanceSheets.map(s => s.totalEquity)],
        ['Total L+E', ...results.balanceSheets.map(s => s.totalLiabilitiesEquity)],
    ];
    sections.push(buildCsvRows(['Item', ...bsPeriods], bsRows));

    // Cash Flow
    sections.push('\n=== CASH FLOW STATEMENT ===');
    const cfPeriods = results.cashFlowStatements.map(s => s.period);
    const cfRows: [string, ...number[]][] = [
        ['Net Income', ...results.cashFlowStatements.map(s => s.netIncome)],
        ['Cash from Operations', ...results.cashFlowStatements.map(s => s.cashFromOperations)],
        ['Cash from Investing', ...results.cashFlowStatements.map(s => s.cashFromInvesting)],
        ['Cash from Financing', ...results.cashFlowStatements.map(s => s.cashFromFinancing)],
        ['Net Change in Cash', ...results.cashFlowStatements.map(s => s.netChangeInCash)],
        ['Ending Cash', ...results.cashFlowStatements.map(s => s.endingCash)],
        ['Free Cash Flow', ...results.cashFlowStatements.map(s => s.freeCashFlow)],
    ];
    sections.push(buildCsvRows(['Item', ...cfPeriods], cfRows));

    // Key Ratios
    sections.push('\n=== KEY RATIOS ===');
    const ratPeriods = results.ratios.map((_, i) => results.incomeStatements[i]?.period ?? `Year ${i + 1}`);
    const ratRows: [string, ...number[]][] = [
        ['Gross Margin', ...results.ratios.map(r => r.grossMargin ?? 0)],
        ['EBITDA Margin', ...results.ratios.map(r => r.ebitdaMargin ?? 0)],
        ['Net Margin', ...results.ratios.map(r => r.netMargin ?? 0)],
        ['ROE', ...results.ratios.map(r => r.roe ?? 0)],
        ['ROA', ...results.ratios.map(r => r.roa ?? 0)],
        ['ROIC', ...results.ratios.map(r => r.roic ?? 0)],
        ['Current Ratio', ...results.ratios.map(r => r.currentRatio ?? 0)],
        ['Debt/Equity', ...results.ratios.map(r => r.debtToEquity ?? 0)],
        ['Interest Coverage', ...results.ratios.map(r => r.interestCoverage ?? 0)],
        ['DSO', ...results.ratios.map(r => r.dso ?? 0)],
        ['DIO', ...results.ratios.map(r => r.dio ?? 0)],
        ['DPO', ...results.ratios.map(r => r.dpo ?? 0)],
        ['EPS', ...results.incomeStatements.map(s => s.eps ?? 0)],
    ];
    sections.push(buildCsvRows(['Ratio', ...ratPeriods], ratRows));

    // DCF Valuation Summary
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
    results: ModelResults;
    liveRates?: { cbeDepositRate: number; cbeLendingRate: number; cbeDiscountRate: number; tbillRate12m: number; usdEgpRate: number; eurEgpRate: number; lastUpdated: string; lastMPCDate: string; source: string } | null;
}

export function exportToJSON(opts: JSONExportOptions): void {
    const { results } = opts;

    const data = {
        // ── Metadata ─────────────────────────────────────────
        exportDate: new Date().toISOString(),
        engineVersion: '3SM-v8',  // v8: CBE rates, thin-cap, DCF, Labor Law 14/2025, VAT WC

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

        // ── Active Scenario Assumptions ──────────────────────
        assumptions: opts.assumptions,

        // ── Historical Inputs ────────────────────────────────
        // Fix period labels: raw store may have duplicates like ['2025','2025'].
        // Apply the same correction the engine integrator uses.
        historicalInputs: {
            ...opts.historicalInputs,
            periods: opts.historicalInputs.periods.map((_, idx) => {
                const numHist = opts.historicalInputs.periods.length;
                const startYear = opts.assumptions.startYear ?? 2026;
                return `${startYear - numHist + idx}`;
            }),
        },

        // ── All Scenarios ────────────────────────────────────
        activeScenarioId: opts.activeScenarioId ?? '',
        scenarios: opts.scenarios.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            description: s.description,
            assumptions: s.assumptions,
            results: s.results,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
        })),

        // ── Active Scenario Results (flat for convenience) ───
        incomeStatements: results.incomeStatements,
        balanceSheets: results.balanceSheets,
        cashFlowStatements: results.cashFlowStatements,
        ratios: results.ratios,
        convergenceInfo: results.convergenceInfo,
        integrationChecks: results.integrationChecks,

        // ── Valuation ────────────────────────────────────────
        dcfValuation: results.dcfValuation ?? (() => {
            console.warn('[WOLF Export] DCF valuation is null — run calculateModel() first');
            return null;
        })(),
        valuationMultiples: results.valuationMultiples ?? null,

        // ── Validation ───────────────────────────────────────
        validationReport: results.validationReport ?? null,
        validationPassed: results.validationPassed ?? null,

        // ── Live Market Rates ───────────────────────────────
        liveRates: opts.liveRates ?? null,
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
