'use client';

import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

/* ── Ratio Definitions ── */
interface RatioDef {
    label: string;
    compute: (yr: number) => number | null;
    fmt: 'pct' | 'x' | 'currency' | 'number';
    threshold?: { good: number; direction: 'above' | 'below' };
}

export default function RatiosPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const results = scenario?.results;

    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const is = results.incomeStatements;
    const bs = results.balanceSheets;
    const cf = results.cashFlowStatements;
    const nYears = is.length;

    const sd = (n: number, d: number) => d !== 0 ? n / d : null;

    const totalDebt = (yr: number) => (bs[yr]?.shortTermDebt ?? 0) + (bs[yr]?.currentPortionLTD ?? 0) + (bs[yr]?.longTermDebt ?? 0);
    const ebitda = (yr: number) => (is[yr]?.ebit ?? 0) + (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0);
    const cfIdx = (yr: number) => yr - 1;

    const sections: { title: string; icon: string; ratios: RatioDef[] }[] = [
        {
            title: 'Profitability',
            icon: '💰',
            ratios: [
                { label: 'Gross Margin', compute: yr => sd(is[yr]?.grossProfit ?? 0, is[yr]?.revenue ?? 0), fmt: 'pct', threshold: { good: 0.3, direction: 'above' } },
                { label: 'EBIT Margin', compute: yr => sd(is[yr]?.ebit ?? 0, is[yr]?.revenue ?? 0), fmt: 'pct', threshold: { good: 0.1, direction: 'above' } },
                { label: 'EBITDA Margin', compute: yr => sd(ebitda(yr), is[yr]?.revenue ?? 0), fmt: 'pct', threshold: { good: 0.15, direction: 'above' } },
                { label: 'Net Margin', compute: yr => sd(is[yr]?.netIncome ?? 0, is[yr]?.revenue ?? 0), fmt: 'pct', threshold: { good: 0.05, direction: 'above' } },
                { label: 'ROE', compute: yr => sd(is[yr]?.netIncome ?? 0, bs[yr]?.totalEquity ?? 0), fmt: 'pct', threshold: { good: 0.12, direction: 'above' } },
                { label: 'ROA', compute: yr => sd(is[yr]?.netIncome ?? 0, bs[yr]?.totalAssets ?? 0), fmt: 'pct', threshold: { good: 0.05, direction: 'above' } },
                { label: 'ROIC', compute: yr => sd(is[yr]?.ebit * (1 - is[yr]?.taxRate), bs[yr]?.totalEquity + totalDebt(yr) - bs[yr]?.cash), fmt: 'pct', threshold: { good: 0.1, direction: 'above' } },
            ],
        },
        {
            title: 'Liquidity',
            icon: '💧',
            ratios: [
                { label: 'Current Ratio', compute: yr => sd(bs[yr]?.totalCurrentAssets ?? 0, bs[yr]?.totalCurrentLiabilities ?? 0), fmt: 'x', threshold: { good: 1.2, direction: 'above' } },
                { label: 'Quick Ratio', compute: yr => sd((bs[yr]?.totalCurrentAssets ?? 0) - (bs[yr]?.inventory ?? 0), bs[yr]?.totalCurrentLiabilities ?? 0), fmt: 'x', threshold: { good: 1.0, direction: 'above' } },
                { label: 'Cash Ratio', compute: yr => sd(bs[yr]?.cash ?? 0, bs[yr]?.totalCurrentLiabilities ?? 0), fmt: 'x', threshold: { good: 0.5, direction: 'above' } },
            ],
        },
        {
            title: 'Leverage',
            icon: '⚖️',
            ratios: [
                { label: 'Debt-to-Equity', compute: yr => sd(totalDebt(yr), bs[yr]?.totalEquity ?? 0), fmt: 'x', threshold: { good: 2.0, direction: 'below' } },
                { label: 'Net Debt / EBITDA', compute: yr => sd(totalDebt(yr) - (bs[yr]?.cash ?? 0), ebitda(yr)), fmt: 'x', threshold: { good: 3.0, direction: 'below' } },
                { label: 'Interest Coverage', compute: yr => sd(is[yr]?.ebit ?? 0, is[yr]?.interestExpense ?? 0), fmt: 'x', threshold: { good: 2.0, direction: 'above' } },
                {
                    label: 'DSCR', compute: yr => {
                        const ci = cfIdx(yr);
                        if (ci < 0 || ci >= cf.length) return null;
                        const dna = (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0);
                        const debtService = Math.abs(cf[ci]?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0);
                        return debtService !== 0 ? ((is[yr]?.netIncome ?? 0) + dna) / debtService : null;
                    }, fmt: 'x', threshold: { good: 1.25, direction: 'above' }
                },
            ],
        },
        {
            title: 'Efficiency',
            icon: '⚡',
            ratios: [
                { label: 'Asset Turnover', compute: yr => sd(is[yr]?.revenue ?? 0, bs[yr]?.totalAssets ?? 0), fmt: 'x' },
                { label: 'FCF Margin', compute: yr => { const ci = cfIdx(yr); if (ci < 0 || ci >= cf.length) return null; return sd(cf[ci]?.freeCashFlow ?? 0, is[yr]?.revenue ?? 0); }, fmt: 'pct', threshold: { good: 0.05, direction: 'above' } },
                { label: 'FCF / EBITDA', compute: yr => { const ci = cfIdx(yr); if (ci < 0 || ci >= cf.length) return null; return sd(cf[ci]?.freeCashFlow ?? 0, ebitda(yr)); }, fmt: 'pct' },
            ],
        },
        {
            title: 'Per Share',
            icon: '📊',
            ratios: [
                { label: 'EPS', compute: yr => sd(is[yr]?.netIncome ?? 0, is[yr]?.sharesOutstanding ?? 0), fmt: 'currency' },
                { label: 'Book Value / Share', compute: yr => sd(bs[yr]?.totalEquity ?? 0, is[yr]?.sharesOutstanding ?? 0), fmt: 'currency' },
                { label: 'FCF / Share', compute: yr => { const ci = cfIdx(yr); if (ci < 0 || ci >= cf.length) return null; return sd(cf[ci]?.freeCashFlow ?? 0, is[yr]?.sharesOutstanding ?? 0); }, fmt: 'currency' },
            ],
        },
    ];

    const formatVal = (v: number | null, fmt: string): string => {
        if (v === null || !isFinite(v)) return '—';
        switch (fmt) {
            case 'pct': return (v * 100).toFixed(1) + '%';
            case 'x': return v.toFixed(2) + 'x';
            case 'currency': return formatCurrency(v, currency);
            case 'number': return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
            default: return v.toFixed(2);
        }
    };

    const getColor = (v: number | null, threshold?: RatioDef['threshold']): string => {
        if (v === null || !threshold || !isFinite(v)) return 'var(--text-primary)';
        if (threshold.direction === 'above') return v >= threshold.good ? 'var(--accent-emerald)' : v >= threshold.good * 0.7 ? 'var(--text-primary)' : 'var(--accent-rose)';
        return v <= threshold.good ? 'var(--accent-emerald)' : v <= threshold.good * 1.3 ? 'var(--text-primary)' : 'var(--accent-rose)';
    };

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>📈 Financial Ratios</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                Comprehensive ratio analysis across all {nYears} periods with conditional formatting
            </p>

            {sections.map(section => (
                <div key={section.title} className="metric-card" style={{ marginBottom: 20, overflow: 'auto' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{section.icon}</span> {section.title}
                    </h3>
                    <table className="fin-table">
                        <thead>
                            <tr>
                                <th style={{ minWidth: 180 }}>Metric</th>
                                {is.map(s => <th key={s.period}>{s.period}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {section.ratios.map((ratio) => (
                                <tr key={ratio.label}>
                                    <td style={{ fontWeight: 500 }}>{ratio.label}</td>
                                    {Array.from({ length: nYears }, (_, yr) => {
                                        const v = ratio.compute(yr);
                                        return (
                                            <td key={yr} style={{ textAlign: 'right', color: getColor(v, ratio.threshold), fontWeight: v !== null && ratio.threshold && getColor(v, ratio.threshold) !== 'var(--text-primary)' ? 600 : 400 }}>
                                                {formatVal(v, ratio.fmt)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}
