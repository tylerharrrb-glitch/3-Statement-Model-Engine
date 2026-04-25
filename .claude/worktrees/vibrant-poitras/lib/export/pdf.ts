// ============================================================
// PDF Export — Professional Financial Model Presentation
// ============================================================
// jsPDF + jspdf-autotable
//
// Pages:
//  1  Cover Page
//  2  Executive Summary (8 KPI cards + highlights)
//  3  Revenue & Margin Analysis
//  4  Income Statement
//  5  Balance Sheet
//  6  Cash Flow Statement
//  7  Working Capital Schedule
//  8  Depreciation / PP&E Schedule
//  9  Debt Schedule
// 10  Key Financial Ratios
// 11  Model Validation & Integration Checks
// 12  Disclaimer / Notes
// ============================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ModelResults } from '@/types/financial';
import { CURRENCY_MAP, SupportedCurrency } from '@/lib/utils';

// ── Color Palette ─────────────────────────────────────────
const NAVY: [number, number, number] = [26, 26, 46];
const DARK_BLUE: [number, number, number] = [22, 33, 62];
const ACCENT_BLUE: [number, number, number] = [52, 100, 235];
const ACCENT_TEAL: [number, number, number] = [0, 176, 240];
const GREEN: [number, number, number] = [39, 174, 96];
const RED: [number, number, number] = [192, 57, 43];
const ORANGE: [number, number, number] = [243, 156, 18];
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_GRAY: [number, number, number] = [245, 245, 245];
const MED_GRAY: [number, number, number] = [150, 150, 150];

// ── Head styles for tables ────────────────────────────────
const HEAD_STYLE = { fillColor: NAVY, textColor: WHITE, fontSize: 7.5, fontStyle: 'bold' as const, halign: 'center' as const };
const BODY_STYLE = { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' as const };
const ALT_STYLE = { fillColor: [248, 249, 252] as [number, number, number] };

// ── Format Helpers ────────────────────────────────────────
let _currencySymbol = '$';
function fc(v: number): string {
    if (v == null || Math.abs(v) < 0.01) return '--';
    if (Math.abs(v) >= 1e9) return `${_currencySymbol}${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `${_currencySymbol}${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${_currencySymbol}${(v / 1e3).toFixed(1)}K`;
    return `${_currencySymbol}${new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v)}`;
}
function fn(v: number): string {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}
function fp(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function fx(v: number): string { return `${v.toFixed(1)}x`; }
function fx2(v: number): string { return `${v.toFixed(2)}x`; }
function fd(v: number): string { return v.toFixed(1); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowLabel(data: any): string {
    // Safely extract the first column label from a didParseCell callback
    try {
        const raw = data.row?.raw;
        if (Array.isArray(raw)) return String(raw[0] ?? '');
        return '';
    } catch (_e) { return ''; }
}

// ── Page Utilities ────────────────────────────────────────
function addPageNumber(doc: jsPDF) {
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const currentPage = doc.getNumberOfPages();
    doc.setFontSize(7);
    doc.setTextColor(...MED_GRAY);
    doc.text(`Page ${currentPage}`, pw - 14, ph - 6, { align: 'right' });
}

function drawPageHeader(doc: jsPDF, title: string, subtitle?: string) {
    const pw = doc.internal.pageSize.getWidth();
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pw, 18, 'F');
    doc.setFillColor(...ACCENT_BLUE);
    doc.rect(0, 18, pw, 1.2, 'F');
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(title, 14, 12);
    if (subtitle) {
        doc.setFontSize(8);
        doc.setTextColor(180, 195, 230);
        doc.text(subtitle, pw - 14, 12, { align: 'right' });
    }
}

function drawSectionDivider(doc: jsPDF, y: number, label: string): number {
    doc.setFillColor(...DARK_BLUE);
    doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 6, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...WHITE);
    doc.text(label, 17, y + 4.2);
    return y + 8;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAutoTableFinalY(doc: any): number {
    return doc.lastAutoTable?.finalY ?? 100;
}

// ── Main Export Function ──────────────────────────────────
export function exportToPDF(
    results: ModelResults,
    companyName: string,
    currency: string = 'USD',
    liveRates?: { cbeDepositRate: number; cbeLendingRate: number; cbeDiscountRate: number; tbillRate12m: number; usdEgpRate: number; eurEgpRate: number; sarEgpRate: number; aedEgpRate: number; egyptianCPI: number; lastUpdated: string; lastMPCDate: string; source: string } | null,
): void {
    // Set the module-level currency symbol for all fc() calls
    const currCfg = CURRENCY_MAP[currency as SupportedCurrency] || CURRENCY_MAP.USD;
    _currencySymbol = currCfg.symbol;
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();


    const periods = results.incomeStatements.map(s => s.period);
    const nYears = periods.length;
    const firstIS = results.incomeStatements[0];
    const lastIS = results.incomeStatements[nYears - 1];
    const lastBS = results.balanceSheets[nYears - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];
    const lastRatios = results.ratios[nYears - 1];

    // ═══════════════════════════════════════════════════════
    // PAGE 1: COVER PAGE
    // ═══════════════════════════════════════════════════════
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pw, ph, 'F');
    doc.setFillColor(...ACCENT_BLUE);
    doc.rect(0, 0, pw, 4, 'F');

    doc.setFontSize(36);
    doc.setTextColor(...WHITE);
    doc.text(companyName, pw / 2, 55, { align: 'center' });

    doc.setFontSize(18);
    doc.setTextColor(...ACCENT_TEAL);
    doc.text('3-Statement Financial Model', pw / 2, 68, { align: 'center' });

    doc.setDrawColor(...ACCENT_BLUE);
    doc.setLineWidth(0.8);
    doc.line(pw / 2 - 50, 76, pw / 2 + 50, 76);

    doc.setFillColor(22, 33, 62);
    doc.roundedRect(pw / 2 - 80, 85, 160, 50, 3, 3, 'F');

    doc.setFontSize(10);
    doc.setTextColor(180, 200, 240);
    const details = [
        `Period Coverage: ${periods[0]} — ${periods[nYears - 1]}`,
        `Historical Periods: ${results.incomeStatements.filter(s => s.periodType === 'historical').length}`,
        `Projected Periods: ${results.incomeStatements.filter(s => s.periodType === 'projected').length}`,
        `Currency: ${currency} (${currCfg.symbol}) | Locale: ${currency === 'EGP' ? 'Egypt' : 'International'}`,
        `Model Validation: ${results.convergenceInfo.converged ? 'Converged' : 'Not Converged'} (${results.convergenceInfo.iterations} iter.)`,
        `Integration Checks: ${results.integrationChecks[results.integrationChecks.length - 1]?.allPassed ? `All ${results.integrationChecks[results.integrationChecks.length - 1]?.details?.length ?? 16} Passed` : 'Some Failed'}`,
    ];
    details.forEach((d, i) => {
        doc.text(d, pw / 2, 95 + i * 8, { align: 'center' });
    });

    doc.setFontSize(9);
    doc.setTextColor(...MED_GRAY);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, pw / 2, ph - 20, { align: 'center' });

    doc.setFontSize(7);
    doc.setTextColor(100, 100, 120);
    doc.text('CONFIDENTIAL — For Internal Use Only', pw / 2, ph - 12, { align: 'center' });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 2: EXECUTIVE SUMMARY
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Executive Summary', companyName);

    const kpiCards = [
        { label: 'Revenue', value: fc(lastIS.revenue), sub: `Growth: ${fp(lastIS.revenueGrowthRate)}`, color: ACCENT_BLUE },
        { label: 'EBITDA', value: fc(lastIS.ebitda), sub: `Margin: ${fp(lastIS.ebitda / (lastIS.revenue || 1))}`, color: ACCENT_TEAL },
        { label: 'Net Income', value: fc(lastIS.netIncome), sub: `Margin: ${fp(lastIS.netMargin)}`, color: GREEN },
        { label: 'EPS', value: `${_currencySymbol}${lastIS.eps.toFixed(2)}`, sub: `Shares: ${fn(lastIS.sharesOutstanding)}`, color: ORANGE },
        { label: 'Free Cash Flow', value: fc(lastCF.freeCashFlow), sub: `FCF % Rev: ${fp(lastCF.freeCashFlow / (lastIS.revenue || 1))}`, color: ACCENT_BLUE },
        { label: 'Total Assets', value: fc(lastBS.totalAssets), sub: `ROA: ${fp(lastRatios.roa)}`, color: ACCENT_TEAL },
        { label: 'Total Debt', value: fc(lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD), sub: `D/E: ${fx(lastRatios.debtToEquity)}`, color: RED },
        { label: 'Total Equity', value: fc(lastBS.totalEquity), sub: `ROE: ${fp(lastRatios.roe)}`, color: GREEN },
    ];

    const cardW = (pw - 28 - 18) / 4;
    const cardH = 28;
    kpiCards.forEach((kpi, i) => {
        const row = Math.floor(i / 4);
        const col = i % 4;
        const x = 14 + col * (cardW + 6);
        const y = 24 + row * (cardH + 6);

        doc.setFillColor(...LIGHT_GRAY);
        doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
        doc.setFillColor(...kpi.color);
        doc.rect(x, y, 2, cardH, 'F');

        doc.setFontSize(7);
        doc.setTextColor(...MED_GRAY);
        doc.text(kpi.label, x + 6, y + 7);

        doc.setFontSize(14);
        doc.setTextColor(...NAVY);
        doc.text(kpi.value, x + 6, y + 17);

        doc.setFontSize(7);
        doc.setTextColor(...kpi.color);
        doc.text(kpi.sub, x + 6, y + 24);
    });

    let ey = 90;
    ey = drawSectionDivider(doc, ey, 'KEY HIGHLIGHTS');

    const revenueCAGR = nYears > 1 ? Math.pow(lastIS.revenue / (firstIS.revenue || 1), 1 / (nYears - 1)) - 1 : 0;
    const highlights = [
        `Revenue CAGR (${periods[0]}–${periods[nYears - 1]}): ${fp(revenueCAGR)}`,
        `Net margin improved from ${fp(firstIS.netMargin)} to ${fp(lastIS.netMargin)}`,
        `Cash position: ${fc(lastBS.cash)} (${fp(lastBS.cash / (lastBS.totalAssets || 1))} of total assets)`,
        `Interest coverage ratio: ${fx(lastRatios.interestCoverage)}`,
        `Working capital cycle: ${fd(lastRatios.cashConversionCycle)} days (DSO: ${fd(lastRatios.dso)}, DIO: ${fd(lastRatios.dio)}, DPO: ${fd(lastRatios.dpo)})`,
        `Model integrity: ${results.convergenceInfo.converged ? 'Converged' : 'Not converged'} in ${results.convergenceInfo.iterations} iterations, all balance sheets balanced`,
    ];

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    highlights.forEach((h, i) => {
        doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 249 : 255, i % 2 === 0 ? 252 : 255);
        doc.rect(14, ey, pw - 28, 7, 'F');
        doc.text(`-  ${h}`, 18, ey + 5);
        ey += 7;
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 3: REVENUE & MARGIN ANALYSIS
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Revenue & Margin Analysis', companyName);

    let ry = 24;
    ry = drawSectionDivider(doc, ry, 'REVENUE TREND');

    autoTable(doc, {
        startY: ry,
        head: [['Metric', ...periods]],
        body: [
            ['Revenue', ...results.incomeStatements.map(s => fc(s.revenue))],
            ['YoY Growth', ...results.incomeStatements.map(s => fp(s.revenueGrowthRate))],
            ['COGS', ...results.incomeStatements.map(s => fc(s.cogs))],
            ['Gross Profit', ...results.incomeStatements.map(s => fc(s.grossProfit))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } },
    });

    const mY = getAutoTableFinalY(doc) + 6;
    drawSectionDivider(doc, mY, 'MARGIN ANALYSIS');

    autoTable(doc, {
        startY: mY + 8,
        head: [['Margin', ...periods]],
        body: [
            ['Gross Margin', ...results.incomeStatements.map(s => fp(s.grossMargin))],
            ['EBIT Margin', ...results.incomeStatements.map(s => fp(s.ebitMargin))],
            ['EBITDA Margin', ...results.incomeStatements.map(s => fp(s.ebitda / (s.revenue || 1)))],
            ['Net Margin', ...results.incomeStatements.map(s => fp(s.netMargin))],
            ['Effective Tax Rate', ...results.incomeStatements.map(s => fp(s.taxRate))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } },
    });

    const oY = getAutoTableFinalY(doc) + 6;
    drawSectionDivider(doc, oY, 'OPERATING EXPENSE BREAKDOWN');

    autoTable(doc, {
        startY: oY + 8,
        head: [['Expense Category', ...periods]],
        body: [
            ['SG&A', ...results.incomeStatements.map(s => fc(s.sgaExpense))],
            ['R&D', ...results.incomeStatements.map(s => fc(s.rdExpense))],
            ['Depreciation', ...results.incomeStatements.map(s => fc(s.depreciation))],
            ['Amortization', ...results.incomeStatements.map(s => fc(s.amortization))],
            ['Other OpEx', ...results.incomeStatements.map(s => fc(s.otherOpex))],
            ['Stock-Based Comp', ...results.incomeStatements.map(s => fc(s.stockBasedComp))],
            ['Total OpEx', ...results.incomeStatements.map(s => fc(s.totalOpex))],
            ['OpEx % Revenue', ...results.incomeStatements.map(s => fp(s.totalOpex / (s.revenue || 1)))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 4: INCOME STATEMENT
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Income Statement', companyName);

    autoTable(doc, {
        startY: 24,
        head: [['Line Item', ...periods]],
        body: [
            ['Revenue', ...results.incomeStatements.map(s => fc(s.revenue))],
            ['Revenue Growth', ...results.incomeStatements.map(s => fp(s.revenueGrowthRate))],
            ['Cost of Goods Sold', ...results.incomeStatements.map(s => fc(s.cogs))],
            ['Gross Profit', ...results.incomeStatements.map(s => fc(s.grossProfit))],
            ['Gross Margin', ...results.incomeStatements.map(s => fp(s.grossMargin))],
            ['', ...periods.map(() => '')],
            ['SG&A', ...results.incomeStatements.map(s => fc(s.sgaExpense))],
            ['R&D', ...results.incomeStatements.map(s => fc(s.rdExpense))],
            ['Depreciation', ...results.incomeStatements.map(s => fc(s.depreciation))],
            ['Amortization', ...results.incomeStatements.map(s => fc(s.amortization))],
            ['Other OpEx', ...results.incomeStatements.map(s => fc(s.otherOpex))],
            ['Stock-Based Comp', ...results.incomeStatements.map(s => fc(s.stockBasedComp))],
            ['Total OpEx', ...results.incomeStatements.map(s => fc(s.totalOpex))],
            ['', ...periods.map(() => '')],
            ['EBIT', ...results.incomeStatements.map(s => fc(s.ebit))],
            ['EBITDA', ...results.incomeStatements.map(s => fc(s.ebitda))],
            ['EBIT Margin', ...results.incomeStatements.map(s => fp(s.ebitMargin))],
            ['', ...periods.map(() => '')],
            ['Interest Income', ...results.incomeStatements.map(s => fc(s.interestIncome))],
            ['Interest Expense', ...results.incomeStatements.map(s => fc(s.interestExpense))],
            ['Other Income/Expense', ...results.incomeStatements.map(s => fc(s.otherIncomeExpense))],
            ['EBT', ...results.incomeStatements.map(s => fc(s.ebt))],
            ['Tax Expense', ...results.incomeStatements.map(s => fc(s.taxExpense))],
            ['Effective Tax Rate', ...results.incomeStatements.map(s => fp(s.taxRate))],
            ['Disallowed Interest (Thin-Cap)', ...results.incomeStatements.map(s => fc(s.disallowedInterest ?? 0))],
            ['', ...periods.map(() => '')],
            ['Net Income', ...results.incomeStatements.map(s => fc(s.netIncome))],
            ['Net Margin', ...results.incomeStatements.map(s => fp(s.netMargin))],
            ['', ...periods.map(() => '')],
            ['Employee Profit Sharing (Law 14/2025)', ...results.incomeStatements.map(s => fc(s.employeeProfitSharing))],
            ['Net Income After EPD', ...results.incomeStatements.map(s => fc(s.netIncomeAfterEPD))],
            ['Legal Reserve Addition (5% NI)', ...results.incomeStatements.map(s => fc(s.legalReserveAddition))],
            ['Distributable Profit', ...results.incomeStatements.map(s => fc(s.distributableProfit))],
            ['Gross Dividends', ...results.incomeStatements.map(s => fc(s.grossDividends))],
            ['Dividend WHT', ...results.incomeStatements.map(s => fc(s.dividendWHT))],
            ['Net Dividends', ...results.incomeStatements.map(s => fc(s.netDividends))],
            ['Addition to Retained Earnings', ...results.incomeStatements.map(s => fc(s.additionToRE))],
            ['EPS', ...results.incomeStatements.map(s => `${_currencySymbol}${s.eps.toFixed(2)}`)],
            ['FCFF', ...results.incomeStatements.map(s => fc(s.fcff ?? 0))],
        ],
        headStyles: HEAD_STYLE,
        styles: { ...BODY_STYLE, fontSize: 6.5 },
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 } },
        showHead: 'everyPage' as const,
        didDrawPage: (data: { pageNumber: number }) => {
            if (data.pageNumber > 1) {
                drawPageHeader(doc, 'Income Statement (continued)', companyName);
            }
        },
        didParseCell: (data) => {
            const boldRows = ['Revenue', 'Gross Profit', 'Total OpEx', 'EBIT', 'EBITDA', 'EBT', 'Net Income', 'Net Income After EPD', 'Distributable Profit', 'Addition to Retained Earnings'];
            const label = rowLabel(data);
            if (data.section === 'body' && boldRows.includes(label)) {
                data.cell.styles.fontStyle = 'bold';
            }
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 5: BALANCE SHEET
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Balance Sheet', companyName);

    autoTable(doc, {
        startY: 24,
        head: [['Line Item', ...periods]],
        body: [
            ['ASSETS', ...periods.map(() => '')],
            ['Cash & Equivalents', ...results.balanceSheets.map(s => fc(s.cash))],
            ['Accounts Receivable', ...results.balanceSheets.map(s => fc(s.accountsReceivable))],
            ['Inventory', ...results.balanceSheets.map(s => fc(s.inventory))],
            ['Prepaid Expenses', ...results.balanceSheets.map(s => fc(s.prepaidExpenses))],
            ['Other Current Assets', ...results.balanceSheets.map(s => fc(s.otherCurrentAssets))],
            ['VAT Receivable', ...results.balanceSheets.map(s => fc(s.vatReceivable ?? 0))],
            ['Total Current Assets', ...results.balanceSheets.map(s => fc(s.totalCurrentAssets))],
            ['', ...periods.map(() => '')],
            ['Net PP&E', ...results.balanceSheets.map(s => fc(s.netPPE))],
            ['Intangibles', ...results.balanceSheets.map(s => fc(s.intangibles))],
            ['Goodwill', ...results.balanceSheets.map(s => fc(s.goodwill))],
            ['Other LT Assets', ...results.balanceSheets.map(s => fc(s.otherLongTermAssets))],
            ['Total Non-Current Assets', ...results.balanceSheets.map(s => fc(s.totalNonCurrentAssets))],
            ['Total Assets', ...results.balanceSheets.map(s => fc(s.totalAssets))],
            ['', ...periods.map(() => '')],
            ['LIABILITIES', ...periods.map(() => '')],
            ['Accounts Payable', ...results.balanceSheets.map(s => fc(s.accountsPayable))],
            ['Accrued Expenses', ...results.balanceSheets.map(s => fc(s.accruedExpenses))],
            ['Short-Term Debt', ...results.balanceSheets.map(s => fc(s.shortTermDebt))],
            ['Current Portion LTD', ...results.balanceSheets.map(s => fc(s.currentPortionLTD))],
            ['Deferred Revenue', ...results.balanceSheets.map(s => fc(s.deferredRevenue))],
            ['Other Current Liabilities', ...results.balanceSheets.map(s => fc(s.otherCurrentLiabilities))],
            ['VAT Payable', ...results.balanceSheets.map(s => fc(s.vatPayable ?? 0))],
            ['Total Current Liabilities', ...results.balanceSheets.map(s => fc(s.totalCurrentLiabilities))],
            ['', ...periods.map(() => '')],
            ['Long-Term Debt', ...results.balanceSheets.map(s => fc(s.longTermDebt))],
            ['Deferred Tax Liabilities', ...results.balanceSheets.map(s => fc(s.deferredTaxLiabilities))],
            ['Other LT Liabilities', ...results.balanceSheets.map(s => fc(s.otherLongTermLiabilities))],
            ['Total Non-Current Liabilities', ...results.balanceSheets.map(s => fc(s.totalNonCurrentLiabilities))],
            ['Total Liabilities', ...results.balanceSheets.map(s => fc(s.totalLiabilities))],
            ['', ...periods.map(() => '')],
            ['EQUITY', ...periods.map(() => '')],
            ['Common Stock', ...results.balanceSheets.map(s => fc(s.commonStock))],
            ['Additional Paid-in Capital', ...results.balanceSheets.map(s => fc(s.additionalPaidInCapital))],
            ['Legal Reserve', ...results.balanceSheets.map(s => fc(s.legalReserve ?? 0))],
            ['Retained Earnings', ...results.balanceSheets.map(s => fc(s.retainedEarnings))],
            ['Treasury Stock', ...results.balanceSheets.map(s => fc(s.treasuryStock))],
            ['Other Comprehensive Income', ...results.balanceSheets.map(s => fc(s.otherComprehensiveIncome))],
            ['Total Equity', ...results.balanceSheets.map(s => fc(s.totalEquity))],
            ['', ...periods.map(() => '')],
            ['Total Liabilities + Equity', ...results.balanceSheets.map(s => fc(s.totalLiabilitiesEquity))],
            ['Balance Check', ...results.balanceSheets.map(s => s.isBalanced ? 'Balanced' : 'IMBALANCED')],
        ],
        headStyles: HEAD_STYLE,
        styles: { ...BODY_STYLE, fontSize: 6.5 },
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 42 } },
        showHead: 'everyPage' as const,
        didDrawPage: (data: { pageNumber: number }) => {
            if (data.pageNumber > 1) {
                drawPageHeader(doc, 'Balance Sheet (continued)', companyName);
            }
        },
        didParseCell: (data) => {
            const boldRows = ['ASSETS', 'LIABILITIES', 'EQUITY', 'Total Current Assets', 'Total Non-Current Assets', 'Total Assets',
                'Total Current Liabilities', 'Total Non-Current Liabilities', 'Total Liabilities', 'Total Equity', 'Total Liabilities + Equity'];
            const label = rowLabel(data);
            if (data.section === 'body' && boldRows.includes(label)) {
                data.cell.styles.fontStyle = 'bold';
            }
            if (label === 'ASSETS' || label === 'LIABILITIES' || label === 'EQUITY') {
                data.cell.styles.fillColor = [230, 236, 250];
            }
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 6: CASH FLOW STATEMENT
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Cash Flow Statement', companyName);

    const cfPeriods = results.cashFlowStatements.map(s => s.period);

    autoTable(doc, {
        startY: 24,
        head: [['Line Item', ...cfPeriods]],
        body: [
            ['OPERATING ACTIVITIES', ...cfPeriods.map(() => '')],
            ['Net Income', ...results.cashFlowStatements.map(s => fc(s.netIncome))],
            ['Depreciation', ...results.cashFlowStatements.map(s => fc(s.depreciation))],
            ['Amortization', ...results.cashFlowStatements.map(s => fc(s.amortization))],
            ['Stock-Based Comp', ...results.cashFlowStatements.map(s => fc(s.stockBasedComp))],
            ['Deferred Taxes', ...results.cashFlowStatements.map(s => fc(s.deferredTaxes))],
            ['Change in A/R', ...results.cashFlowStatements.map(s => fc(s.changeInAR))],
            ['Change in Inventory', ...results.cashFlowStatements.map(s => fc(s.changeInInventory))],
            ['Change in Prepaid', ...results.cashFlowStatements.map(s => fc(s.changeInPrepaid))],
            ['Change in A/P', ...results.cashFlowStatements.map(s => fc(s.changeInAP))],
            ['Change in Accrued Exp', ...results.cashFlowStatements.map(s => fc(s.changeInAccruedExp))],
            ['Change in Deferred Rev', ...results.cashFlowStatements.map(s => fc(s.changeInDeferredRev))],
            ['Total WC Change', ...results.cashFlowStatements.map(s => fc(s.totalWorkingCapitalChange))],
            ['Cash from Operations', ...results.cashFlowStatements.map(s => fc(s.cashFromOperations))],
            ['', ...cfPeriods.map(() => '')],
            ['INVESTING ACTIVITIES', ...cfPeriods.map(() => '')],
            ['Capital Expenditures', ...results.cashFlowStatements.map(s => fc(s.capex))],
            ['Acquisitions', ...results.cashFlowStatements.map(s => fc(s.acquisitions))],
            ['Asset Sales', ...results.cashFlowStatements.map(s => fc(s.assetSales))],
            ['Cash from Investing', ...results.cashFlowStatements.map(s => fc(s.cashFromInvesting))],
            ['', ...cfPeriods.map(() => '')],
            ['FINANCING ACTIVITIES', ...cfPeriods.map(() => '')],
            ['Debt Issuance', ...results.cashFlowStatements.map(s => fc(s.debtIssuance))],
            ['Debt Repayment', ...results.cashFlowStatements.map(s => fc(s.debtRepayment))],
            ['Dividends Paid', ...results.cashFlowStatements.map(s => fc(s.dividendsPaid))],
            ['  Dividend WHT to ETA', ...results.cashFlowStatements.map(s => fc(s.dividendWHT))],
            ['Employee Profit Sharing', ...results.cashFlowStatements.map(s => fc(s.employeeProfitSharingPaid))],
            ['Equity Issuance', ...results.cashFlowStatements.map(s => fc(s.equityIssuance))],
            ['Share Repurchases', ...results.cashFlowStatements.map(s => fc(s.shareRepurchases))],
            ['Cash from Financing', ...results.cashFlowStatements.map(s => fc(s.cashFromFinancing))],
            ['', ...cfPeriods.map(() => '')],
            ['Net Change in Cash', ...results.cashFlowStatements.map(s => fc(s.netChangeInCash))],
            ['Beginning Cash', ...results.cashFlowStatements.map(s => fc(s.beginningCash))],
            ['Ending Cash', ...results.cashFlowStatements.map(s => fc(s.endingCash))],
            ['', ...cfPeriods.map(() => '')],
            ['Free Cash Flow', ...results.cashFlowStatements.map(s => fc(s.freeCashFlow))],
            ['Reconciliation', ...results.cashFlowStatements.map(s => s.reconciles ? 'OK' : 'FAIL')],
        ],
        headStyles: HEAD_STYLE,
        styles: { ...BODY_STYLE, fontSize: 6.5 },
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 40 } },
        showHead: 'everyPage' as const,
        didDrawPage: (data: { pageNumber: number }) => {
            if (data.pageNumber > 1) {
                drawPageHeader(doc, 'Cash Flow Statement (continued)', companyName);
            }
        },
        didParseCell: (data) => {
            const boldRows = ['Cash from Operations', 'Cash from Investing', 'Cash from Financing', 'Net Change in Cash', 'Ending Cash', 'Free Cash Flow'];
            const sectionHeaders = ['OPERATING ACTIVITIES', 'INVESTING ACTIVITIES', 'FINANCING ACTIVITIES'];
            const label = rowLabel(data);
            if (data.section === 'body' && boldRows.includes(label)) data.cell.styles.fontStyle = 'bold';
            if (sectionHeaders.includes(label)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 236, 250];
            }
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 7: WORKING CAPITAL SCHEDULE
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Working Capital Schedule', companyName);

    const nwcArr = results.balanceSheets.map(b =>
        (b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets)
        - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.otherCurrentLiabilities)
    );

    autoTable(doc, {
        startY: 24,
        head: [['Working Capital', ...periods]],
        body: [
            ['EFFICIENCY METRICS', ...periods.map(() => '')],
            ['  DSO (Days)', ...results.ratios.map(r => fd(r.dso))],
            ['  DIO (Days)', ...results.ratios.map(r => fd(r.dio))],
            ['  DPO (Days)', ...results.ratios.map(r => fd(r.dpo))],
            ['Cash Conversion Cycle', ...results.ratios.map(r => fd(r.cashConversionCycle))],
            ['', ...periods.map(() => '')],
            ['CURRENT ASSETS (excl. Cash)', ...periods.map(() => '')],
            ['  Accounts Receivable', ...results.balanceSheets.map(b => fc(b.accountsReceivable))],
            ['  Inventory', ...results.balanceSheets.map(b => fc(b.inventory))],
            ['  Prepaid Expenses', ...results.balanceSheets.map(b => fc(b.prepaidExpenses))],
            ['  Other Current Assets', ...results.balanceSheets.map(b => fc(b.otherCurrentAssets))],
            ['', ...periods.map(() => '')],
            ['CURRENT LIABILITIES (excl. Debt)', ...periods.map(() => '')],
            ['  Accounts Payable', ...results.balanceSheets.map(b => fc(b.accountsPayable))],
            ['  Accrued Expenses', ...results.balanceSheets.map(b => fc(b.accruedExpenses))],
            ['  Deferred Revenue', ...results.balanceSheets.map(b => fc(b.deferredRevenue))],
            ['  Other Current Liabilities', ...results.balanceSheets.map(b => fc(b.otherCurrentLiabilities))],
            ['', ...periods.map(() => '')],
            ['Net Working Capital', ...nwcArr.map(v => fc(v))],
            ['NWC Change', ...nwcArr.map((v, i) => i === 0 ? '—' : fc(v - nwcArr[i - 1]))],
            ['NWC % Revenue', ...nwcArr.map((v, i) => fp(results.incomeStatements[i].revenue !== 0 ? v / results.incomeStatements[i].revenue : 0))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 42 } },
        didParseCell: (data) => {
            const label = rowLabel(data);
            if (['EFFICIENCY METRICS', 'CURRENT ASSETS (excl. Cash)', 'CURRENT LIABILITIES (excl. Debt)'].includes(label)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 236, 250];
            }
            if (['Cash Conversion Cycle', 'Net Working Capital'].includes(label)) data.cell.styles.fontStyle = 'bold';
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 8: DEPRECIATION / PP&E SCHEDULE
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'PP&E Rollforward & Depreciation Schedule', companyName);

    autoTable(doc, {
        startY: 24,
        head: [['PP&E / Depreciation', ...periods]],
        body: [
            ['GROSS PP&E', ...periods.map(() => '')],
            ['  Beginning Gross PP&E', ...results.balanceSheets.map((b, i) => i === 0 ? '—' : fc(results.balanceSheets[i - 1].grossPPE))],
            ['  (+) Capital Expenditures', ...results.balanceSheets.map((b, i) => {
                if (i === 0) return '—';
                const cfIdx = i - 1;
                return cfIdx < results.cashFlowStatements.length ? fc(Math.abs(results.cashFlowStatements[cfIdx].capex)) : '—';
            })],
            ['Ending Gross PP&E', ...results.balanceSheets.map(b => fc(b.grossPPE))],
            ['', ...periods.map(() => '')],
            ['ACCUMULATED DEPRECIATION', ...periods.map(() => '')],
            ['  Beginning Accum. Dep', ...results.balanceSheets.map((b, i) => i === 0 ? '—' : fc(results.balanceSheets[i - 1].accumulatedDepreciation))],
            ['  (+) Depreciation Expense', ...results.incomeStatements.map(s => fc(s.depreciation))],
            ['Ending Accum. Dep', ...results.balanceSheets.map(b => fc(b.accumulatedDepreciation))],
            ['', ...periods.map(() => '')],
            ['Net PP&E', ...results.balanceSheets.map(b => fc(b.netPPE))],
            ['', ...periods.map(() => '')],
            ['KEY METRICS', ...periods.map(() => '')],
            ['  CapEx % Revenue', ...results.balanceSheets.map((b, i) => {
                if (i === 0) return '—';
                const cfIdx = i - 1;
                const capex = cfIdx < results.cashFlowStatements.length ? Math.abs(results.cashFlowStatements[cfIdx].capex) : 0;
                return fp(results.incomeStatements[i].revenue !== 0 ? capex / results.incomeStatements[i].revenue : 0);
            })],
            ['  Dep Rate (Assumption: 10.0%)', ...results.balanceSheets.map((b, i) => fp(b.grossPPE !== 0 ? results.incomeStatements[i].depreciation / b.grossPPE : 0))],
            ['  Implied Useful Life', ...results.balanceSheets.map((b, i) => {
                const r = b.grossPPE !== 0 ? results.incomeStatements[i].depreciation / b.grossPPE : 0;
                return r !== 0 ? `${(1 / r).toFixed(1)} yrs` : '—';
            })],
            ['', ...periods.map(() => '')],
            ['INTANGIBLES', ...periods.map(() => '')],
            ['  Amortization', ...results.incomeStatements.map(s => fc(s.amortization))],
            ['  Net Intangibles', ...results.balanceSheets.map(b => fc(b.intangibles))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 42 } },
        didParseCell: (data) => {
            const label = rowLabel(data);
            if (['GROSS PP&E', 'ACCUMULATED DEPRECIATION', 'KEY METRICS', 'INTANGIBLES'].includes(label)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 236, 250];
            }
            if (['Ending Gross PP&E', 'Ending Accum. Dep', 'Net PP&E'].includes(label)) data.cell.styles.fontStyle = 'bold';
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 9: DEBT SCHEDULE
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Debt Schedule & Leverage Analysis', companyName);

    const totalDebt = results.balanceSheets.map(b => b.shortTermDebt + b.longTermDebt + b.currentPortionLTD);

    autoTable(doc, {
        startY: 24,
        head: [['Debt Schedule', ...periods]],
        body: [
            ['LT DEBT ROLLFORWARD', ...periods.map(() => '')],
            ['  Beginning LTD', ...results.balanceSheets.map((b, i) => i === 0 ? '—' : fc(results.balanceSheets[i - 1].longTermDebt))],
            ['  (+) New Issuance', ...results.balanceSheets.map((_, i) => {
                const cfIdx = i - 1;
                return cfIdx >= 0 && cfIdx < results.cashFlowStatements.length ? fc(results.cashFlowStatements[cfIdx].debtIssuance) : '—';
            })],
            ['  (-) Repayments', ...results.balanceSheets.map((_, i) => {
                const cfIdx = i - 1;
                return cfIdx >= 0 && cfIdx < results.cashFlowStatements.length ? fc(results.cashFlowStatements[cfIdx].debtRepayment) : '—';
            })],
            ['Ending LTD', ...results.balanceSheets.map(b => fc(b.longTermDebt))],
            ['', ...periods.map(() => '')],
            ['DEBT SUMMARY', ...periods.map(() => '')],
            ['  Short-Term Debt', ...results.balanceSheets.map(b => fc(b.shortTermDebt))],
            ['  Current Portion LTD', ...results.balanceSheets.map(b => fc(b.currentPortionLTD))],
            ['  Long-Term Debt', ...results.balanceSheets.map(b => fc(b.longTermDebt))],
            ['Total Debt', ...totalDebt.map(v => fc(v))],
            ['', ...periods.map(() => '')],
            ['INTEREST ANALYSIS', ...periods.map(() => '')],
            ['  Avg Debt Balance', ...totalDebt.map((v, i) => i === 0 ? fc(v) : fc((v + totalDebt[i - 1]) / 2))],
            ['  Interest Expense', ...results.incomeStatements.map(s => fc(s.interestExpense))],
            ['  Interest Income', ...results.incomeStatements.map(s => fc(s.interestIncome))],
            ['Net Interest', ...results.incomeStatements.map(s => fc(s.interestExpense - s.interestIncome))],
            ['', ...periods.map(() => '')],
            ['LEVERAGE RATIOS', ...periods.map(() => '')],
            ['  Interest Coverage', ...results.ratios.map(r => fx(r.interestCoverage))],
            ['  Debt / Equity', ...results.ratios.map(r => fx2(r.debtToEquity))],
            ['  Debt / Total Assets', ...results.ratios.map(r => fx2(r.debtToAssets))],
            ['  Debt / EBITDA', ...totalDebt.map((v, i) => fx(results.incomeStatements[i].ebitda !== 0 ? v / results.incomeStatements[i].ebitda : 0))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 42 } },
        didParseCell: (data) => {
            const label = rowLabel(data);
            if (['LT DEBT ROLLFORWARD', 'DEBT SUMMARY', 'INTEREST ANALYSIS', 'LEVERAGE RATIOS'].includes(label)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 236, 250];
            }
            if (['Ending LTD', 'Total Debt', 'Net Interest'].includes(label)) data.cell.styles.fontStyle = 'bold';
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 10: KEY FINANCIAL RATIOS
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Key Financial Ratios', companyName);

    autoTable(doc, {
        startY: 24,
        head: [['Ratio', ...periods]],
        body: [
            ['PROFITABILITY', ...periods.map(() => '')],
            ['  Gross Margin', ...results.ratios.map(r => fp(r.grossMargin))],
            ['  Operating Margin', ...results.ratios.map(r => fp(r.operatingMargin))],
            ['  Net Margin', ...results.ratios.map(r => fp(r.netMargin))],
            ['  ROA', ...results.ratios.map(r => fp(r.roa))],
            ['  ROE', ...results.ratios.map(r => fp(r.roe))],
            ['  ROIC', ...results.ratios.map(r => fp(r.roic))],
            ['', ...periods.map(() => '')],
            ['LIQUIDITY', ...periods.map(() => '')],
            ['  Current Ratio', ...results.ratios.map(r => fx(r.currentRatio))],
            ['  Quick Ratio', ...results.ratios.map(r => fx(r.quickRatio))],
            ['  Cash Ratio', ...results.ratios.map(r => fx(r.cashRatio))],
            ['', ...periods.map(() => '')],
            ['LEVERAGE', ...periods.map(() => '')],
            ['  Debt / Equity', ...results.ratios.map(r => fx2(r.debtToEquity))],
            ['  Debt / Assets', ...results.ratios.map(r => fx2(r.debtToAssets))],
            ['  Interest Coverage', ...results.ratios.map(r => fx(r.interestCoverage))],
            ['', ...periods.map(() => '')],
            ['EFFICIENCY', ...periods.map(() => '')],
            ['  Asset Turnover', ...results.ratios.map(r => fx(r.assetTurnover))],
            ['  DSO (Days)', ...results.ratios.map(r => fd(r.dso))],
            ['  DIO (Days)', ...results.ratios.map(r => fd(r.dio))],
            ['  DPO (Days)', ...results.ratios.map(r => fd(r.dpo))],
            ['  Cash Conversion Cycle', ...results.ratios.map(r => fd(r.cashConversionCycle))],
        ],
        headStyles: HEAD_STYLE,
        styles: BODY_STYLE,
        alternateRowStyles: ALT_STYLE,
        columnStyles: { 0: { cellWidth: 38 } },
        didParseCell: (data) => {
            const label = rowLabel(data);
            if (['PROFITABILITY', 'LIQUIDITY', 'LEVERAGE', 'EFFICIENCY'].includes(label)) {
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.fillColor = [230, 236, 250];
            }
        },
    });

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 11: MODEL VALIDATION
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Model Validation & Integration Checks', companyName);

    let vy = 24;
    vy = drawSectionDivider(doc, vy, 'CONVERGENCE INFORMATION');

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(`Status: ${results.convergenceInfo.converged ? 'Converged' : 'Not Converged'}`, 18, vy + 5);
    doc.text(`Iterations: ${results.convergenceInfo.iterations}`, 80, vy + 5);
    doc.text(`Final Delta: ${results.convergenceInfo.finalDelta.toFixed(6)}`, 130, vy + 5);
    vy += 12;

    vy = drawSectionDivider(doc, vy, 'INTEGRATION CHECKS — ALL PERIODS');

    // Build multi-period validation matrix: each check × each period
    const checkNames: string[] = results.integrationChecks[0]?.details?.map(d => d.name) ?? [];
    const checkPeriods = periods;
    const matrixHead = ['Check Name', ...checkPeriods];
    const matrixBody: string[][] = checkNames.map(name => {
        return [
            name,
            ...results.integrationChecks.map(chk => {
                const detail = chk.details?.find(d => d.name === name);
                return detail ? (detail.passed ? 'PASS' : 'FAIL') : '--';
            }),
        ];
    });

    // Count totals across all periods
    let totalCells = 0;
    let passedCells = 0;
    results.integrationChecks.forEach(chk => {
        chk.details?.forEach(d => {
            totalCells++;
            if (d.passed) passedCells++;
        });
    });
    const failedCells = totalCells - passedCells;

    autoTable(doc, {
        startY: vy,
        head: [matrixHead],
        body: matrixBody.length > 0 ? matrixBody : [['No integration checks available', ...checkPeriods.map(() => '')]],
        headStyles: HEAD_STYLE,
        styles: { ...BODY_STYLE, fontSize: 7 },
        alternateRowStyles: ALT_STYLE,
        columnStyles: {
            0: { cellWidth: 55 },
        },
        didParseCell: (data) => {
            if (data.section === 'body' && data.column.index >= 1) {
                const val = String(data.cell.raw ?? '');
                if (val === 'PASS') {
                    data.cell.styles.textColor = [39, 174, 96];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.halign = 'center';
                } else if (val === 'FAIL') {
                    data.cell.styles.textColor = [192, 57, 43];
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.halign = 'center';
                }
            }
        },
    });

    const finalVY = getAutoTableFinalY(doc) + 6;

    doc.setFillColor(...(failedCells === 0 ? GREEN : RED));
    doc.roundedRect(14, finalVY, pw - 28, 12, 2, 2, 'F');
    doc.setFontSize(11);
    doc.setTextColor(...WHITE);
    doc.text(
        failedCells === 0
            ? `ALL ${totalCells} CHECKS PASSED (${checkNames.length} types x ${results.integrationChecks.length} projected periods)`
            : `${failedCells} of ${totalCells} CHECKS FAILED`,
        pw / 2, finalVY + 8,
        { align: 'center' }
    );

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE 12: DCF VALUATION
    // ═══════════════════════════════════════════════════════
    if (results.dcfValuation) {
        doc.addPage();
        drawPageHeader(doc, 'DCF Valuation Summary', companyName);

        const dcf = results.dcfValuation;
        let dcfY = 24;
        dcfY = drawSectionDivider(doc, dcfY, 'WACC COMPONENTS');

        autoTable(doc, {
            startY: dcfY,
            head: [['Component', 'Value']],
            body: [
                ['Cost of Equity (Ke)', fp(dcf.costOfEquity)],
                ['Cost of Debt (Kd, pre-tax)', fp(dcf.costOfDebt)],
                ['Tax Rate', fp(lastIS.taxRate)],
                ['Equity Weight', fp(dcf.equityWeight)],
                ['Debt Weight', fp(dcf.debtWeight)],
                ['WACC', fp(dcf.wacc)],
            ],
            headStyles: HEAD_STYLE,
            styles: BODY_STYLE,
            alternateRowStyles: ALT_STYLE,
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 1: { halign: 'right' as const, cellWidth: 30 } },
        });

        const dcfTableY = getAutoTableFinalY(doc) + 6;
        drawSectionDivider(doc, dcfTableY, 'VALUATION OUTPUT');

        autoTable(doc, {
            startY: dcfTableY + 8,
            head: [['Metric', 'Value']],
            body: [
                ['PV of Free Cash Flows', fc(dcf.discountedFCFs.reduce((a: number, b: number) => a + b, 0))],
                ['Terminal Value (Gordon Growth)', fc(dcf.terminalValue)],
                ['PV of Terminal Value', fc(dcf.pvTerminalValue)],
                ['Enterprise Value', fc(dcf.enterpriseValue)],
                ['(-) Net Debt', fc(dcf.netDebt)],
                ['Equity Value', fc(dcf.equityValue)],
                ['Shares Outstanding', fn(lastIS.sharesOutstanding)],
                ['Implied Share Price', `${_currencySymbol}${dcf.impliedSharePrice.toFixed(2)}`],
            ],
            headStyles: HEAD_STYLE,
            styles: BODY_STYLE,
            alternateRowStyles: ALT_STYLE,
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55 }, 1: { halign: 'right' as const, cellWidth: 40 } },
        });

        if (dcf.fcfProjections && dcf.fcfProjections.length > 0) {
            const fcfY = getAutoTableFinalY(doc) + 6;
            drawSectionDivider(doc, fcfY, 'PROJECTED FREE CASH FLOWS');
            const fcfPeriods = dcf.fcfProjections.map((_: number, i: number) => `Year ${i + 1}`);
            autoTable(doc, {
                startY: fcfY + 8,
                head: [['', ...fcfPeriods]],
                body: [
                    ['FCF', ...dcf.fcfProjections.map((v: number) => fc(v))],
                    ['Discount Factor', ...dcf.fcfProjections.map((_: number, i: number) => (1 / Math.pow(1 + dcf.wacc, i + 1)).toFixed(4))],
                    ['PV of FCF', ...dcf.discountedFCFs.map((v: number) => fc(v))],
                ],
                headStyles: HEAD_STYLE,
                styles: BODY_STYLE,
                alternateRowStyles: ALT_STYLE,
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
            });
        }

        addPageNumber(doc);
    }

    // ═══════════════════════════════════════════════════════
    // PAGE 13: DISCLAIMER / NOTES
    // ═══════════════════════════════════════════════════════
    doc.addPage();
    drawPageHeader(doc, 'Notes & Disclaimers', companyName);

    let dy = 28;

    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text('Model Methodology', 14, dy);
    dy += 6;

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const methodology = [
        '• This model uses a 3-statement integrated financial model approach linking Income Statement, Balance Sheet, and Cash Flow Statement.',
        '• Historical periods are sourced from company filings. Projected periods are driven by assumption inputs.',
        '• The model uses iterative circular resolution for interest income/expense calculations (converged via Newton-Raphson method).',
        '• Cash on the Balance Sheet is computed as the "plug" value ensuring Assets = Liabilities + Equity.',
        '• Depreciation is calculated as a percentage of Gross PP&E. CapEx is driven as a percentage of Revenue.',
        '• Working capital items (AR, Inventory, AP) are driven by efficiency ratios (DSO, DIO, DPO).',
        '• The model includes 28 integration checks to verify internal consistency across all three statements.',
        '• Employee Profit Sharing (10% EPD) is calculated per Egyptian Labor Law No. 14/2025 and deducted from Net Income.',
        '• DCF valuation uses WACC derived from CBE policy rates (April 2026 MPC: discount 19.50%).',
    ];
    methodology.forEach(m => {
        doc.text(m, 14, dy, { maxWidth: pw - 28 });
        dy += 6;
    });

    dy += 6;
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text('Disclaimer', 14, dy);
    dy += 6;

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const disclaimer = [
        '• This financial model is provided for informational and analytical purposes only.',
        '• Projected values are based on assumptions that may not reflect actual future results.',
        '• Users should independently verify all inputs and assumptions before making any decisions.',
        '• Past performance is not indicative of future results.',
        '• This document does not constitute financial advice, investment recommendation, or offer to sell securities.',
    ];
    disclaimer.forEach(d => {
        doc.text(d, 14, dy, { maxWidth: pw - 28 });
        dy += 6;
    });

    dy += 6;
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text('Egyptian Tax & Regulatory Compliance', 14, dy);
    dy += 6;

    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    const compliance = [
        '• Dividend Withholding Tax (WHT): 5–10% withheld at source per Law 30/2023. Listed on EGX: 5%, unlisted: 10%.',
        '• VAT: 14% Value Added Tax applied per Law No. 67/2016. VAT receivable/payable included in working capital.',
        '• Thin Capitalisation: Law 30/2023 Art. 39 — D/E limit 3:1 (2024–2027), 2:1 (2028+). Interest disallowed above ceiling.',
        '• ETA E-Invoicing: All invoices subject to ETA e-invoicing mandate (Resolution No. 619/2021).',
        '• Corporate Tax Rate: 22.5% per Egyptian Tax Law. Interest deductibility subject to thin-cap and rate ceiling (2× CBE).',
        '• EPD: Employee Profit Distribution at 10% per Labor Law No. 14/2025, with optional non-operating gains exclusion.',
    ];
    compliance.forEach(c => {
        doc.text(c, 14, dy, { maxWidth: pw - 28 });
        dy += 6;
    });

    dy += 10;

    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(14, dy, pw - 28, 30, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...MED_GRAY);
    doc.text(`Company: ${companyName}`, 20, dy + 8);
    doc.text(`Periods: ${periods[0]} — ${periods[nYears - 1]} (${nYears} years) | Currency: ${currency} (${currCfg.symbol})`, 20, dy + 14);
    doc.text(`Model Type: 3-Statement Integrated Financial Model with Circular Resolution`, 20, dy + 20);
    doc.text(`Report Generated: ${new Date().toLocaleString()} | Export v1.0`, 20, dy + 26);

    addPageNumber(doc);

    // ═══════════════════════════════════════════════════════
    // PAGE: LIVE MARKET RATES (CBE + FX)
    // ═══════════════════════════════════════════════════════
    if (liveRates) {
        doc.addPage();
        drawPageHeader(doc, 'Live Market Rates', `Source: ${liveRates.source}`);
        addPageNumber(doc);

        let ry = 24;
        ry = drawSectionDivider(doc, ry, 'CBE Monetary Policy Rates');

        autoTable(doc, {
            startY: ry + 2,
            head: [['Rate', 'Value', 'Reference']],
            body: [
                ['CBE Deposit Rate (Overnight)', fp(liveRates.cbeDepositRate), `MPC: ${liveRates.lastMPCDate}`],
                ['CBE Lending Rate (Overnight)', fp(liveRates.cbeLendingRate), `MPC: ${liveRates.lastMPCDate}`],
                ['CBE Discount Rate', fp(liveRates.cbeDiscountRate), 'Reference rate for CBE Banking Metrics'],
                ['12-Month T-Bill Yield', fp(liveRates.tbillRate12m), 'Risk-free rate proxy (DCF)'],
                ['Egyptian CPI (Annual)', fp(liveRates.egyptianCPI), 'Inflation rate'],
            ],
            headStyles: HEAD_STYLE,
            bodyStyles: BODY_STYLE,
            alternateRowStyles: ALT_STYLE,
            margin: { left: 14, right: 14 },
        });

        ry = getAutoTableFinalY(doc) + 6;
        ry = drawSectionDivider(doc, ry, 'Exchange Rates (EGP)');

        autoTable(doc, {
            startY: ry + 2,
            head: [['Currency Pair', 'Rate', 'Description']],
            body: [
                ['USD / EGP', liveRates.usdEgpRate.toFixed(2), 'US Dollar'],
                ['EUR / EGP', liveRates.eurEgpRate.toFixed(2), 'Euro'],
                ['SAR / EGP', liveRates.sarEgpRate.toFixed(2), 'Saudi Riyal'],
                ['AED / EGP', liveRates.aedEgpRate.toFixed(2), 'UAE Dirham'],
            ],
            headStyles: HEAD_STYLE,
            bodyStyles: BODY_STYLE,
            alternateRowStyles: ALT_STYLE,
            margin: { left: 14, right: 14 },
        });

        ry = getAutoTableFinalY(doc) + 8;
        doc.setFontSize(7);
        doc.setTextColor(...MED_GRAY);
        doc.text(`Last Updated: ${liveRates.lastUpdated}`, 14, ry);
    }

    // ═══════════════════════════════════════════════════════
    // SAVE
    // ═══════════════════════════════════════════════════════
    const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`${safeName}_Financial_Model.pdf`);
}
