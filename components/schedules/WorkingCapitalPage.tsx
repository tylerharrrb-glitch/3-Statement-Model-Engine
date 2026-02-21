'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function WorkingCapitalPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const bs = results.balanceSheets;
    const is = results.incomeStatements;
    const ratios = results.ratios;
    const lastHistIdx = bs.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    function colClass(idx: number): string {
        const base = bs[idx].periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    // Compute per-period working capital data
    const wcData = bs.map((b, i) => {
        const prev = i > 0 ? bs[i - 1] : null;
        const nwc = (b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets)
            - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.otherCurrentLiabilities);
        const prevNwc = prev
            ? (prev.accountsReceivable + prev.inventory + prev.prepaidExpenses + prev.otherCurrentAssets)
              - (prev.accountsPayable + prev.accruedExpenses + prev.deferredRevenue + prev.otherCurrentLiabilities)
            : null;
        const nwcChange = prevNwc !== null ? nwc - prevNwc : null;
        const nwcPctRev = is[i].revenue !== 0 ? nwc / is[i].revenue : 0;

        return {
            period: b.period,
            ar: b.accountsReceivable,
            inventory: b.inventory,
            prepaid: b.prepaidExpenses,
            otherCA: b.otherCurrentAssets,
            ap: b.accountsPayable,
            accrued: b.accruedExpenses,
            deferredRev: b.deferredRevenue,
            otherCL: b.otherCurrentLiabilities,
            nwc,
            nwcChange,
            nwcPctRev,
            dso: ratios[i]?.dso ?? 0,
            dio: ratios[i]?.dio ?? 0,
            dpo: ratios[i]?.dpo ?? 0,
            ccc: ratios[i]?.cashConversionCycle ?? 0,
        };
    });

    const lastWC = wcData[wcData.length - 1];

    // Summary cards
    const cards = [
        { label: 'Net Working Capital', value: formatCurrency(lastWC.nwc, currency), icon: '📦', sub: `${(lastWC.nwcPctRev * 100).toFixed(1)}% of Revenue` },
        { label: 'Cash Conversion Cycle', value: `${lastWC.ccc.toFixed(0)} days`, icon: '🔄', sub: `DSO ${lastWC.dso.toFixed(0)} + DIO ${lastWC.dio.toFixed(0)} − DPO ${lastWC.dpo.toFixed(0)}` },
        { label: 'NWC Change (Last Yr)', value: lastWC.nwcChange !== null ? formatCurrency(lastWC.nwcChange, currency) : '—', icon: '📊', sub: lastWC.nwcChange !== null && lastWC.nwcChange > 0 ? 'Cash use ↑' : 'Cash source ↓' },
    ];

    type Row = { label: string; key: keyof typeof wcData[0]; bold?: boolean; separator?: boolean; pct?: boolean; days?: boolean; indent?: boolean };

    const efficiencyRows: Row[] = [
        { label: 'Days Sales Outstanding (DSO)', key: 'dso', days: true },
        { label: 'Days Inventory Outstanding (DIO)', key: 'dio', days: true },
        { label: 'Days Payables Outstanding (DPO)', key: 'dpo', days: true },
        { label: 'Cash Conversion Cycle', key: 'ccc', bold: true, days: true },
    ];

    const balanceRows: Row[] = [
        { label: 'Accounts Receivable', key: 'ar', indent: true },
        { label: 'Inventory', key: 'inventory', indent: true },
        { label: 'Prepaid Expenses', key: 'prepaid', indent: true },
        { label: 'Other Current Assets', key: 'otherCA', indent: true },
        { label: 'Accounts Payable', key: 'ap', indent: true },
        { label: 'Accrued Expenses', key: 'accrued', indent: true },
        { label: 'Deferred Revenue', key: 'deferredRev', indent: true },
        { label: 'Other Current Liabilities', key: 'otherCL', indent: true },
        { label: 'Net Working Capital', key: 'nwc', bold: true },
        { label: 'NWC Change', key: 'nwcChange' },
        { label: 'NWC % of Revenue', key: 'nwcPctRev', pct: true },
    ];

    function formatVal(val: number | null, opts?: { pct?: boolean; days?: boolean }) {
        if (val === null) return '—';
        if (opts?.pct) return formatPercent(val);
        if (opts?.days) return `${val.toFixed(0)}d`;
        return formatCurrency(val, currency);
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>📦 Working Capital Schedule</h1>

            {/* Summary Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {cards.map((c, i) => (
                    <div key={i} className="metric-card">
                        <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{c.sub}</div>
                    </div>
                ))}
            </div>

            {/* Efficiency Metrics */}
            <div className="metric-card" style={{ overflow: 'auto', marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Working Capital Efficiency</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Metric</th>
                            {wcData.map((d, i) => <th key={d.period} className={colClass(i)}>{d.period}</th>)}
                        </tr>
                        <tr className="period-type-row">
                            <td></td>
                            {bs.map((s, i) => (
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
                        {efficiencyRows.map((row, ri) => (
                            <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                                <td>{row.label}</td>
                                {wcData.map((d, i) => (
                                    <td key={d.period} className={colClass(i)}>
                                        {formatVal(d[row.key] as number, { days: row.days })}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Balance Detail */}
            <div className="metric-card" style={{ overflow: 'auto' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Working Capital Balances</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Line Item</th>
                            {wcData.map((d, i) => <th key={d.period} className={colClass(i)}>{d.period}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Current Assets header */}
                        <tr className="row-subheader"><td colSpan={wcData.length + 1}>CURRENT ASSETS (excl. Cash)</td></tr>
                        {balanceRows.slice(0, 4).map((row, ri) => (
                            <tr key={ri}>
                                <td style={{ paddingLeft: row.indent ? 24 : undefined }}>{row.label}</td>
                                {wcData.map((d, i) => (
                                    <td key={d.period} className={colClass(i)}>
                                        {formatVal(d[row.key] as number)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {/* Current Liabilities header */}
                        <tr className="row-subheader"><td colSpan={wcData.length + 1}>CURRENT LIABILITIES (excl. Debt)</td></tr>
                        {balanceRows.slice(4, 8).map((row, ri) => (
                            <tr key={ri}>
                                <td style={{ paddingLeft: row.indent ? 24 : undefined }}>{row.label}</td>
                                {wcData.map((d, i) => {
                                    const val = d[row.key] as number;
                                    return (
                                        <td key={d.period} className={colClass(i)} style={{ color: val < 0 ? 'var(--accent-rose)' : undefined }}>
                                            {formatVal(val)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        <tr className="row-separator"><td colSpan={wcData.length + 1}></td></tr>
                        {/* NWC Summary */}
                        {balanceRows.slice(8).map((row, ri) => (
                            <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                                <td>{row.label}</td>
                                {wcData.map((d, i) => {
                                    const val = d[row.key] as number | null;
                                    return (
                                        <td key={d.period} className={colClass(i)} style={{ color: val !== null && val < 0 ? 'var(--accent-rose)' : undefined }}>
                                            {formatVal(val, { pct: row.pct })}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
