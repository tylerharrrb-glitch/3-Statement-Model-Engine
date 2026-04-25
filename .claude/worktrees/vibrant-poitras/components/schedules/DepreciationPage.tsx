'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function DepreciationPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const bs = results.balanceSheets;
    const is = results.incomeStatements;
    const cf = results.cashFlowStatements;
    const lastHistIdx = bs.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    function colClass(idx: number): string {
        const base = bs[idx].periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    // Build PP&E rollforward data
    const ppeData = bs.map((b, i) => {
        const prev = i > 0 ? bs[i - 1] : null;
        // CF has one fewer entry — CF[0] corresponds to BS[1]
        const cfIdx = i - 1; // CF index for this period (needs prior BS)
        const capex = cfIdx >= 0 && cfIdx < cf.length ? Math.abs(cf[cfIdx].capex) : 0;
        const dep = is[i].depreciation;
        const depRate = b.grossPPE !== 0 ? dep / b.grossPPE : 0;
        const usefulLife = depRate !== 0 ? 1 / depRate : 0;
        const capexPctRev = is[i].revenue !== 0 ? capex / is[i].revenue : 0;

        return {
            period: b.period,
            beginGrossPPE: prev?.grossPPE ?? null,
            capex,
            endGrossPPE: b.grossPPE,
            beginAccumDep: prev?.accumulatedDepreciation ?? null,
            depExpense: dep,
            endAccumDep: b.accumulatedDepreciation,
            netPPE: b.netPPE,
            capexPctRev,
            depRate,
            usefulLife,
            amortization: is[i].amortization,
            intangibles: b.intangibles,
        };
    });

    const lastPPE = ppeData[ppeData.length - 1];

    const cards = [
        { label: 'Net PP&E', value: formatCurrency(lastPPE.netPPE, currency), icon: '🏭', sub: `Gross: ${formatCurrency(lastPPE.endGrossPPE, currency)}` },
        { label: 'Depreciation Rate', value: `${(lastPPE.depRate * 100).toFixed(1)}%`, icon: '📉', sub: `Useful Life ≈ ${lastPPE.usefulLife.toFixed(1)} yrs` },
        { label: 'CapEx % Revenue', value: `${(lastPPE.capexPctRev * 100).toFixed(1)}%`, icon: '🔧', sub: `CapEx: ${formatCurrency(lastPPE.capex, currency)}` },
    ];

    type RowDef = { label: string; key: keyof typeof ppeData[0]; bold?: boolean; pct?: boolean; years?: boolean; indent?: boolean };

    const grossPPERows: RowDef[] = [
        { label: 'Beginning Gross PP&E', key: 'beginGrossPPE', indent: true },
        { label: '(+) Capital Expenditures', key: 'capex', indent: true },
        { label: 'Ending Gross PP&E', key: 'endGrossPPE', bold: true },
    ];

    const accumDepRows: RowDef[] = [
        { label: 'Beginning Accum. Depreciation', key: 'beginAccumDep', indent: true },
        { label: '(+) Depreciation Expense', key: 'depExpense', indent: true },
        { label: 'Ending Accum. Depreciation', key: 'endAccumDep', bold: true },
    ];

    const netRows: RowDef[] = [
        { label: 'Net PP&E', key: 'netPPE', bold: true },
    ];

    const metricsRows: RowDef[] = [
        { label: 'CapEx % of Revenue', key: 'capexPctRev', pct: true },
        { label: 'Effective Dep Rate (on Ending PP&E)', key: 'depRate', pct: true },
        { label: 'Implied Useful Life (yrs)', key: 'usefulLife', years: true },
    ];

    const intangibleRows: RowDef[] = [
        { label: 'Amortization Expense', key: 'amortization', indent: true },
        { label: 'Net Intangibles', key: 'intangibles', bold: true },
    ];

    function formatVal(val: number | null, opts?: { pct?: boolean; years?: boolean }) {
        if (val === null) return '—';
        if (opts?.pct) return formatPercent(val);
        if (opts?.years) return `${val.toFixed(1)}`;
        return formatCurrency(val, currency);
    }

    function renderRows(rows: RowDef[]) {
        return rows.map((row, ri) => (
            <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                <td style={{ paddingLeft: row.indent ? 24 : undefined }}>{row.label}</td>
                {ppeData.map((d, i) => (
                    <td key={d.period} className={colClass(i)}>
                        {formatVal(d[row.key] as number | null, { pct: row.pct, years: row.years })}
                    </td>
                ))}
            </tr>
        ));
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>🏭 Depreciation Schedule (PP&E Rollforward)</h1>

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

            {/* PP&E Rollforward */}
            <div className="metric-card" style={{ overflow: 'auto', marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>PP&E Rollforward</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Line Item</th>
                            {ppeData.map((d, i) => <th key={d.period} className={colClass(i)}>{d.period}</th>)}
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
                        <tr className="row-subheader"><td colSpan={ppeData.length + 1}>GROSS PP&E</td></tr>
                        {renderRows(grossPPERows)}

                        <tr className="row-separator"><td colSpan={ppeData.length + 1}></td></tr>
                        <tr className="row-subheader"><td colSpan={ppeData.length + 1}>ACCUMULATED DEPRECIATION</td></tr>
                        {renderRows(accumDepRows)}

                        <tr className="row-separator"><td colSpan={ppeData.length + 1}></td></tr>
                        {renderRows(netRows)}

                        <tr className="row-separator"><td colSpan={ppeData.length + 1}></td></tr>
                        <tr className="row-subheader"><td colSpan={ppeData.length + 1}>KEY METRICS</td></tr>
                        {renderRows(metricsRows)}

                        <tr className="row-separator"><td colSpan={ppeData.length + 1}></td></tr>
                        <tr className="row-subheader"><td colSpan={ppeData.length + 1}>INTANGIBLES</td></tr>
                        {renderRows(intangibleRows)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
