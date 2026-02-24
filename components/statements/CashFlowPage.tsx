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
    const sections: { title: string; rows: { label: string; key: CFKey; bold?: boolean }[] }[] = [
        {
            title: 'OPERATING ACTIVITIES', rows: [
                { label: 'Net Income', key: 'netIncome' }, { label: 'Depreciation', key: 'depreciation' },
                { label: 'Amortization', key: 'amortization' }, { label: 'Stock-Based Comp', key: 'stockBasedComp' },
                { label: 'Deferred Taxes', key: 'deferredTaxes' },
            ]
        },
        {
            title: 'WORKING CAPITAL CHANGES', rows: [
                { label: 'Δ Accounts Receivable', key: 'changeInAR' }, { label: 'Δ Inventory', key: 'changeInInventory' },
                { label: 'Δ Prepaid Expenses', key: 'changeInPrepaid' }, { label: 'Δ Accounts Payable', key: 'changeInAP' },
                { label: 'Δ Accrued Expenses', key: 'changeInAccruedExp' }, { label: 'Δ Deferred Revenue', key: 'changeInDeferredRev' },
                { label: 'Total WC Change', key: 'totalWorkingCapitalChange', bold: true },
                { label: 'Cash from Operations', key: 'cashFromOperations', bold: true },
            ]
        },
        {
            title: 'INVESTING ACTIVITIES', rows: [
                { label: 'Capital Expenditures', key: 'capex' }, { label: 'Acquisitions', key: 'acquisitions' },
                { label: 'Asset Sales', key: 'assetSales' },
                { label: 'Cash from Investing', key: 'cashFromInvesting', bold: true },
            ]
        },
        {
            title: 'FINANCING ACTIVITIES', rows: [
                { label: 'Debt Issuance', key: 'debtIssuance' }, { label: 'Debt Repayment', key: 'debtRepayment' },
                { label: 'Dividends Paid', key: 'dividendsPaid' },
                { label: 'Dividend WHT', key: 'dividendWHT' },
                { label: 'EPD Paid', key: 'employeeProfitSharingPaid' },
                { label: 'Equity Issuance', key: 'equityIssuance' },
                { label: 'Share Repurchases', key: 'shareRepurchases' },
                { label: 'Cash from Financing', key: 'cashFromFinancing', bold: true },
            ]
        },
        {
            title: 'NET CASH FLOW', rows: [
                { label: 'Net Change in Cash', key: 'netChangeInCash', bold: true },
                { label: 'Beginning Cash', key: 'beginningCash' }, { label: 'Ending Cash', key: 'endingCash', bold: true },
            ]
        },
        { title: '', rows: [{ label: 'Free Cash Flow', key: 'freeCashFlow', bold: true }] },
    ];

    function colClass(idx: number, s: typeof statements[0]): string {
        const base = s.periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>💵 Cash Flow Statement</h1>
            <div className="metric-card" style={{ overflow: 'auto' }}>
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
                                {section.rows.map((row, ri) => (
                                    <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                                        <td>{row.label}</td>
                                        {statements.map((s, idx) => {
                                            const val = s[row.key] as number;
                                            return (
                                                <td key={s.period} className={colClass(idx, s)} style={{ color: val < 0 ? 'var(--accent-rose)' : undefined }}>
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
                                    color: s.reconciles ? 'var(--accent-green, #16a34a)' : 'var(--accent-rose, #dc2626)',
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
