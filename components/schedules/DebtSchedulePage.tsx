'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent } from '@/lib/utils';

export default function DebtSchedulePage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const bs = results.balanceSheets;
    const is = results.incomeStatements;
    const cf = results.cashFlowStatements;
    const ratios = results.ratios;
    const lastHistIdx = bs.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    function colClass(idx: number): string {
        const base = bs[idx].periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    // Build debt schedule data
    const debtData = bs.map((b, i) => {
        const prev = i > 0 ? bs[i - 1] : null;
        const cfIdx = i - 1;
        const debtIssuance = cfIdx >= 0 && cfIdx < cf.length ? cf[cfIdx].debtIssuance : 0;
        const debtRepayment = cfIdx >= 0 && cfIdx < cf.length ? cf[cfIdx].debtRepayment : 0;
        const totalDebt = b.shortTermDebt + b.longTermDebt + b.currentPortionLTD;
        const prevTotalDebt = prev ? prev.shortTermDebt + prev.longTermDebt + prev.currentPortionLTD : null;
        const avgDebt = prevTotalDebt !== null ? (totalDebt + prevTotalDebt) / 2 : totalDebt;
        const debtToEbitda = is[i].ebitda !== 0 ? totalDebt / is[i].ebitda : 0;

        return {
            period: b.period,
            // Short-term
            stDebt: b.shortTermDebt,
            prevSTDebt: prev?.shortTermDebt ?? null,
            // Long-term
            beginLTD: prev?.longTermDebt ?? null,
            debtIssuance,
            debtRepayment,
            endLTD: b.longTermDebt,
            // Totals
            cpltd: b.currentPortionLTD,
            totalDebt,
            // Interest
            avgDebt,
            interestExpense: is[i].interestExpense,
            interestIncome: is[i].interestIncome,
            netInterest: is[i].interestExpense - is[i].interestIncome,
            // Ratios
            interestCoverage: ratios[i]?.interestCoverage ?? 0,
            debtToEquity: ratios[i]?.debtToEquity ?? 0,
            debtToAssets: ratios[i]?.debtToAssets ?? 0,
            debtToEbitda,
        };
    });

    const lastDebt = debtData[debtData.length - 1];

    const cards = [
        { label: 'Total Debt', value: formatCurrency(lastDebt.totalDebt, currency), icon: '🏛️', sub: `LTD: ${formatCurrency(lastDebt.endLTD, currency)}` },
        { label: 'Debt / EBITDA', value: `${lastDebt.debtToEbitda.toFixed(2)}x`, icon: '📊', sub: `D/E: ${lastDebt.debtToEquity.toFixed(2)}x` },
        { label: 'Interest Coverage', value: `${lastDebt.interestCoverage.toFixed(1)}x`, icon: '🛡️', sub: `Int Exp: ${formatCurrency(lastDebt.interestExpense, currency)}` },
    ];

    type RowDef = { label: string; getValue: (d: typeof debtData[0]) => number | null; bold?: boolean; pct?: boolean; ratio?: boolean; indent?: boolean };

    const ltdRows: RowDef[] = [
        { label: 'Beginning Long-Term Debt', getValue: d => d.beginLTD, indent: true },
        { label: '(+) New Issuance', getValue: d => d.debtIssuance, indent: true },
        { label: '(-) Repayments', getValue: d => d.debtRepayment, indent: true },
        { label: 'Ending Long-Term Debt', getValue: d => d.endLTD, bold: true },
    ];

    const summaryRows: RowDef[] = [
        { label: 'Short-Term Debt', getValue: d => d.stDebt, indent: true },
        { label: 'Current Portion of LTD', getValue: d => d.cpltd, indent: true },
        { label: 'Long-Term Debt', getValue: d => d.endLTD, indent: true },
        { label: 'Total Debt', getValue: d => d.totalDebt, bold: true },
    ];

    const interestRows: RowDef[] = [
        { label: 'Average Debt Balance', getValue: d => d.avgDebt, indent: true },
        { label: 'Interest Expense', getValue: d => d.interestExpense, indent: true },
        { label: 'Interest Income', getValue: d => d.interestIncome, indent: true },
        { label: 'Net Interest', getValue: d => d.netInterest, bold: true },
    ];

    const leverageRows: RowDef[] = [
        { label: 'Interest Coverage (EBIT / Int Exp)', getValue: d => d.interestCoverage, ratio: true },
        { label: 'Debt / Equity', getValue: d => d.debtToEquity, ratio: true },
        { label: 'Debt / Total Assets', getValue: d => d.debtToAssets, ratio: true },
        { label: 'Debt / EBITDA', getValue: d => d.debtToEbitda, ratio: true },
    ];

    function formatVal(val: number | null, opts?: { pct?: boolean; ratio?: boolean }) {
        if (val === null) return '—';
        if (opts?.pct) return formatPercent(val);
        if (opts?.ratio) return `${val.toFixed(2)}x`;
        return formatCurrency(val, currency);
    }

    function renderSection(title: string, rows: RowDef[]) {
        return (
            <>
                <tr className="row-subheader"><td colSpan={debtData.length + 1}>{title}</td></tr>
                {rows.map((row, ri) => (
                    <tr key={ri} className={row.bold ? 'row-bold' : ''}>
                        <td style={{ paddingLeft: row.indent ? 24 : undefined }}>{row.label}</td>
                        {debtData.map((d, i) => {
                            const val = row.getValue(d);
                            return (
                                <td key={d.period} className={colClass(i)} style={{ color: val !== null && val < 0 ? 'var(--accent-rose)' : undefined }}>
                                    {formatVal(val, { pct: row.pct, ratio: row.ratio })}
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </>
        );
    }

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>🏛️ Debt Schedule</h1>

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

            {/* Debt Rollforward */}
            <div className="metric-card" style={{ overflow: 'auto' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Debt Rollforward & Interest Analysis</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Line Item</th>
                            {debtData.map((d, i) => <th key={d.period} className={colClass(i)}>{d.period}</th>)}
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
                        {renderSection('LONG-TERM DEBT ROLLFORWARD', ltdRows)}
                        <tr className="row-separator"><td colSpan={debtData.length + 1}></td></tr>
                        {renderSection('DEBT SUMMARY', summaryRows)}
                        <tr className="row-separator"><td colSpan={debtData.length + 1}></td></tr>
                        {renderSection('INTEREST ANALYSIS', interestRows)}
                        <tr className="row-separator"><td colSpan={debtData.length + 1}></td></tr>
                        {renderSection('LEVERAGE RATIOS', leverageRows)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
