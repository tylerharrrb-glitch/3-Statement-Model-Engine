'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

export default function CashFlowPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const statements = results.cashFlowStatements;
    const lastHistIdx = statements.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    type CFKey = keyof typeof statements[0];
    type CFRow = { label: string; key: CFKey; bold?: boolean; alwaysShow?: boolean; tooltip?: string };
    const sections: { title: string; rows: CFRow[] }[] = [
        {
            title: 'OPERATING ACTIVITIES', rows: [
                { label: 'Net Income', key: 'netIncome', alwaysShow: true }, { label: 'Depreciation', key: 'depreciation' },
                { label: 'Amortization', key: 'amortization' }, { label: 'Stock-Based Comp', key: 'stockBasedComp' },
                { label: 'Deferred Taxes', key: 'deferredTaxes' },
                { label: 'Δ Other LT Liabilities', key: 'changeInOtherLTLiabilities' },
                { label: 'Δ OCI (non-cash)', key: 'changeInOCI' },
                { label: 'EOS Provision Δ', key: 'endOfServiceProvisionAddition' },
            ]
        },
        {
            title: 'WORKING CAPITAL CHANGES', rows: [
                { label: 'Δ Accounts Receivable', key: 'changeInAR' }, { label: 'Δ Inventory', key: 'changeInInventory' },
                { label: 'Δ Prepaid Expenses', key: 'changeInPrepaid' }, { label: 'Δ Accounts Payable', key: 'changeInAP' },
                { label: 'Δ Accrued Expenses', key: 'changeInAccruedExp' }, { label: 'Δ Deferred Revenue', key: 'changeInDeferredRev' },
                { label: 'Δ VAT Receivable', key: 'changeInVATReceivable' }, { label: 'Δ VAT Payable', key: 'changeInVATPayable' },
                { label: 'Total WC Change', key: 'totalWorkingCapitalChange', bold: true, alwaysShow: true },
                { label: 'Cash from Operations', key: 'cashFromOperations', bold: true, alwaysShow: true },
            ]
        },
        {
            title: 'INVESTING ACTIVITIES', rows: [
                { label: 'Capital Expenditures', key: 'capex' },
                { label: 'Purchase of Intangibles', key: 'purchaseOfIntangibles' },
                { label: 'Δ Other LT Assets', key: 'changeInOtherLongTermAssets' },
                { label: 'Δ Goodwill', key: 'changeInGoodwill' },
                { label: 'Acquisitions', key: 'acquisitions' },
                { label: 'Asset Sales', key: 'assetSales' },
                { label: 'Investment Purchases', key: 'investmentPurchases' },
                { label: 'Investment Sales', key: 'investmentSales' },
                { label: 'Cash from Investing', key: 'cashFromInvesting', bold: true, alwaysShow: true },
            ]
        },
        {
            title: 'FINANCING ACTIVITIES', rows: [
                { label: 'Debt Issuance', key: 'debtIssuance' }, { label: 'Debt Repayment', key: 'debtRepayment' },
                { label: 'Dividends Paid', key: 'dividendsPaid' },
                { label: 'Dividend WHT', key: 'dividendWHT' },
                { label: 'EPD Paid', key: 'employeeProfitSharingPaid' },
                { label: 'Equity Issuance', key: 'equityIssuance', tooltip: 'Computed from Δ APIC + Δ Common Stock vs prior period (historical years) or equityIssuance assumption (projection years).' },
                { label: 'Share Repurchases', key: 'shareRepurchases' },
                { label: 'Cash from Financing', key: 'cashFromFinancing', bold: true, alwaysShow: true },
            ]
        },
        {
            title: 'NET CASH FLOW', rows: [
                { label: 'Net Change in Cash', key: 'netChangeInCash', bold: true, alwaysShow: true },
                { label: 'Beginning Cash', key: 'beginningCash', alwaysShow: true },
                { label: 'Ending Cash', key: 'endingCash', bold: true, alwaysShow: true },
            ]
        },
        { title: '', rows: [{ label: 'Free Cash Flow', key: 'freeCashFlow', bold: true, alwaysShow: true }] },
    ];

    // Hide rows that are 0 across ALL displayed periods (Fix 8) — keep totals/subtotals always visible.
    const isRowVisible = (row: CFRow) => {
        if (row.alwaysShow) return true;
        return statements.some(s => {
            const v = s[row.key] as number | undefined;
            return typeof v === 'number' && Math.abs(v) > 0.005;
        });
    };

    function colClass(idx: number, s: typeof statements[0]): string {
        const base = s.periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    return (
        <div>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 'clamp(1.3rem, 3vw, 1.6rem)', fontWeight: 700, marginBottom: 20 }}>Cash Flow Statement</h2>
            <div className="table-card" style={{ overflow: 'auto' }}>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Line Item</th>
                            {statements.map((s, i) => (
                                <th key={s.period} className={colClass(i, s)}>
                                    {s.period}
                                </th>
                            ))}
                        </tr>
                        <tr className="period-type-row">
                            <td></td>
                            {statements.map((s, i) => (
                                <td key={s.period} className={
                                    (s.periodType === 'historical' ? 'type-actual' : 'type-estimate') +
                                    (i === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '')
                                }>
                                    {s.periodType === 'historical' ? 'Actual' : 'Estimate'}
                                </td>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sections.map((section, si) => (
                            <React.Fragment key={si}>
                                {section.title && <tr className="row-subheader"><td colSpan={statements.length + 1}>{section.title}</td></tr>}
                                {section.rows.filter(isRowVisible).map((row, ri) => (
                                    <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                                        <td title={row.tooltip}>
                                            {row.label}
                                            {row.tooltip && <span style={{ marginLeft: 4, color: 'var(--text-muted)', fontSize: '0.75em', cursor: 'help' }} title={row.tooltip}>ⓘ</span>}
                                        </td>
                                        {statements.map((s, idx) => {
                                            const val = (s[row.key] ?? 0) as number;
                                            return (
                                                <td key={s.period} className={colClass(idx, s)} style={{ color: val < 0 ? '#f87171' : undefined }}>
                                                    {formatCurrency(val, currency)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {si < sections.length - 1 && <tr className="row-separator"><td colSpan={statements.length + 1}></td></tr>}
                            </React.Fragment>
                        ))}
                        {/* Reconciliation Check Row */}
                        <tr className="row-separator"><td colSpan={statements.length + 1}></td></tr>
                        <tr>
                            <td style={{ fontWeight: 600 }}>Reconciliation Check</td>
                            {statements.map((s, idx) => (
                                <td key={s.period} className={colClass(idx, s)} style={{
                                    fontWeight: 700,
                                    color: s.reconciles ? '#4ade80' : '#f87171',
                                    background: s.reconciles
                                        ? 'rgba(22, 163, 74, 0.08)'
                                        : 'rgba(220, 38, 38, 0.08)',
                                }}>
                                    {s.reconciles ? '✓ Reconciles' : '✗ Error'}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
