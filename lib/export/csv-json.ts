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
        ['Interest Expense', ...results.incomeStatements.map(s => s.interestExpense)],
        ['EBT', ...results.incomeStatements.map(s => s.ebt)],
        ['Tax Expense', ...results.incomeStatements.map(s => s.taxExpense)],
        ['Net Income', ...results.incomeStatements.map(s => s.netIncome)],
        ['EPS', ...results.incomeStatements.map(s => s.eps)],
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
        ['Net PPE', ...results.balanceSheets.map(s => s.netPPE)],
        ['Total Assets', ...results.balanceSheets.map(s => s.totalAssets)],
        ['Total Current Liabilities', ...results.balanceSheets.map(s => s.totalCurrentLiabilities)],
        ['Long-Term Debt', ...results.balanceSheets.map(s => s.longTermDebt)],
        ['Total Liabilities', ...results.balanceSheets.map(s => s.totalLiabilities)],
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

    const csv = sections.join('\n');
    downloadText(csv, `${safeName(companyName)}_Financial_Model.csv`, 'text/csv');
}

// ── JSON EXPORT ──────────────────────────────────────────────

export function exportToJSON(results: ModelResults, companyName: string, currency: string = 'USD'): void {
    const data = {
        companyName,
        currency,
        exportDate: new Date().toISOString(),
        incomeStatements: results.incomeStatements,
        balanceSheets: results.balanceSheets,
        cashFlowStatements: results.cashFlowStatements,
        ratios: results.ratios,
        convergenceInfo: results.convergenceInfo,
        integrationChecks: results.integrationChecks,
    };

    const json = JSON.stringify(data, null, 2);
    downloadText(json, `${safeName(companyName)}_Financial_Model.json`, 'application/json');
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
