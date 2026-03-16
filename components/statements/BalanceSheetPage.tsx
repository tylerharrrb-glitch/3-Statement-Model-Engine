'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

export default function BalanceSheetPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const statements = results.balanceSheets;
    const lastHistIdx = statements.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    type BSKey = keyof typeof statements[0];
    const sections: { title: string; rows: { label: string; key: BSKey; bold?: boolean }[] }[] = [
        {
            title: 'CURRENT ASSETS', rows: [
                { label: 'Cash', key: 'cash' }, { label: 'Accounts Receivable', key: 'accountsReceivable' },
                { label: 'Inventory', key: 'inventory' }, { label: 'Prepaid Expenses', key: 'prepaidExpenses' },
                { label: 'Other Current Assets', key: 'otherCurrentAssets' },
                { label: 'Total Current Assets', key: 'totalCurrentAssets', bold: true },
            ]
        },
        {
            title: 'NON-CURRENT ASSETS', rows: [
                { label: 'Gross PP&E', key: 'grossPPE' }, { label: 'Accumulated Depreciation', key: 'accumulatedDepreciation' },
                { label: 'Net PP&E', key: 'netPPE', bold: true }, { label: 'Intangibles', key: 'intangibles' },
                { label: 'Goodwill', key: 'goodwill' }, { label: 'Other LT Assets', key: 'otherLongTermAssets' },
                { label: 'Total Non-Current Assets', key: 'totalNonCurrentAssets', bold: true },
            ]
        },
        { title: '', rows: [{ label: 'TOTAL ASSETS', key: 'totalAssets', bold: true }] },
        {
            title: 'CURRENT LIABILITIES', rows: [
                { label: 'Accounts Payable', key: 'accountsPayable' }, { label: 'Accrued Expenses', key: 'accruedExpenses' },
                { label: 'Short-Term Debt', key: 'shortTermDebt' }, { label: 'Current Portion LTD', key: 'currentPortionLTD' },
                { label: 'Deferred Revenue', key: 'deferredRevenue' }, { label: 'Other Current Liabilities', key: 'otherCurrentLiabilities' },
                { label: 'Total Current Liabilities', key: 'totalCurrentLiabilities', bold: true },
            ]
        },
        {
            title: 'NON-CURRENT LIABILITIES', rows: [
                { label: 'Long-Term Debt', key: 'longTermDebt' }, { label: 'Deferred Tax Liabilities', key: 'deferredTaxLiabilities' },
                { label: 'End of Service Provision', key: 'endOfServiceProvision' },
                { label: 'Other LT Liabilities', key: 'otherLongTermLiabilities' },
                { label: 'Total Non-Current Liabilities', key: 'totalNonCurrentLiabilities', bold: true },
            ]
        },
        { title: '', rows: [{ label: 'TOTAL LIABILITIES', key: 'totalLiabilities', bold: true }] },
        {
            title: 'EQUITY', rows: [
                { label: 'Common Stock', key: 'commonStock' }, { label: 'Additional Paid-In Capital', key: 'additionalPaidInCapital' },
                { label: 'Legal Reserve', key: 'legalReserve' },
                { label: 'Retained Earnings', key: 'retainedEarnings' }, { label: 'Treasury Stock', key: 'treasuryStock' },
                { label: 'Other Comprehensive Income', key: 'otherComprehensiveIncome' },
                { label: 'Total Equity', key: 'totalEquity', bold: true },
            ]
        },
        { title: '', rows: [{ label: 'TOTAL LIABILITIES + EQUITY', key: 'totalLiabilitiesEquity', bold: true }] },
    ];

    function colClass(idx: number, s: typeof statements[0]): string {
        const base = s.periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 'clamp(1.3rem, 3vw, 1.6rem)', fontWeight: 700 }}>Balance Sheet</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {statements.filter(s => s.periodType === 'projected').map(s => (
                        <span key={s.period} className={`badge ${s.isBalanced ? 'badge-success' : 'badge-error'}`}>
                            {s.period}: {s.isBalanced ? '✓ Balanced' : `✗ Diff: ${formatCurrency(s.balanceDifference, currency)}`}
                        </span>
                    ))}
                </div>
            </div>
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
                                {section.rows.map((row, ri) => (
                                    <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                                        <td>{row.label}</td>
                                        {statements.map((s, idx) => (
                                            <td key={s.period} className={colClass(idx, s)}>
                                                {formatCurrency(s[row.key] as number, currency)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {si < sections.length - 1 && <tr className="row-separator"><td colSpan={statements.length + 1}></td></tr>}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
