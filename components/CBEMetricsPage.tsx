'use client';

import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

const CBE_POLICY_RATE = 0.2725; // Q1 2026

interface CBEMetric {
    label: string;
    compute: (yr: number) => number;
    threshold: number;
    direction: 'above' | 'below';
    unit: 'x' | '%';
    description: string;
}

export default function CBEMetricsPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const results = scenario?.results;
    const a = scenario?.assumptions;

    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const is = results.incomeStatements;
    const bs = results.balanceSheets;
    const cf = results.cashFlowStatements;
    const nYears = is.length;

    const sd = (n: number, d: number) => d !== 0 ? n / d : 0;

    const totalDebt = (yr: number) => (bs[yr]?.shortTermDebt ?? 0) + (bs[yr]?.currentPortionLTD ?? 0) + (bs[yr]?.longTermDebt ?? 0);
    const ebitda = (yr: number) => (is[yr]?.ebit ?? 0) + (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0);

    const metrics: CBEMetric[] = [
        { label: 'Current Ratio', compute: yr => sd(bs[yr]?.totalCurrentAssets ?? 0, bs[yr]?.totalCurrentLiabilities ?? 0), threshold: 1.2, direction: 'above', unit: 'x', description: 'Minimum 1.2x per CBE regulatory requirements' },
        { label: 'Debt-to-Equity', compute: yr => sd(totalDebt(yr), bs[yr]?.totalEquity ?? 0), threshold: 2.0, direction: 'below', unit: 'x', description: 'Maximum 2.0x per CBE lending covenants' },
        { label: 'Interest Coverage', compute: yr => sd(is[yr]?.ebit ?? 0, is[yr]?.interestExpense ?? 0), threshold: 2.0, direction: 'above', unit: 'x', description: 'Minimum 2.0x EBIT / Interest Expense' },
        {
            label: 'Net Debt / EBITDA', compute: yr => {
                const nd = totalDebt(yr) - (bs[yr]?.cash ?? 0);
                const eb = ebitda(yr);
                return eb !== 0 ? nd / eb : 0;
            }, threshold: 3.0, direction: 'below', unit: 'x', description: 'Maximum 3.0x net leverage'
        },
        {
            label: 'DSCR', compute: yr => {
                if (yr >= cf.length) return 999;
                const dna = (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0);
                const debtService = Math.abs(cf[yr]?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0);
                return debtService !== 0 ? ((is[yr]?.netIncome ?? 0) + dna) / debtService : 999;
            }, threshold: 1.25, direction: 'above', unit: 'x', description: 'Minimum 1.25x Debt Service Coverage Ratio'
        },
    ];

    const checkPass = (value: number, metric: CBEMetric): boolean => {
        if (metric.direction === 'above') return value >= metric.threshold;
        return value <= metric.threshold;
    };

    const formatVal = (v: number, unit: string) => {
        if (unit === 'x') return v >= 100 ? 'N/A' : v.toFixed(2) + 'x';
        return (v * 100).toFixed(1) + '%';
    };

    // CBE rate warning
    const modelDebtRate = a?.interestRateOnDebt?.[0] ?? 0;
    const debtRateWarning = modelDebtRate < 0.20;

    // Summary counts
    const allChecks = metrics.flatMap(m =>
        Array.from({ length: nYears }, (_, yr) => checkPass(m.compute(yr), m))
    );
    const totalChecks = allChecks.length;
    const passed = allChecks.filter(Boolean).length;
    const failed = totalChecks - passed;

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🏦 CBE Banking Metrics</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                Central Bank of Egypt regulatory compliance metrics with live PASS/FAIL status
            </p>

            {/* Summary Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <div className="metric-card" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Checks</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{totalChecks}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{metrics.length} metrics × {nYears} periods</div>
                </div>
                <div className="metric-card" style={{ borderLeft: '4px solid var(--accent-emerald)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Passed</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-emerald)' }}>{passed}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(passed / totalChecks * 100).toFixed(0)}% pass rate</div>
                </div>
                <div className="metric-card" style={{ borderLeft: `4px solid ${failed === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}` }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Failed</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: failed === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>{failed}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{failed === 0 ? 'All clear!' : 'Needs attention'}</div>
                </div>
                <div className="metric-card" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>CBE Policy Rate</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{(CBE_POLICY_RATE * 100).toFixed(2)}%</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Q1 2026 overnight deposit</div>
                </div>
            </div>

            {/* Debt Rate Warning */}
            {debtRateWarning && (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Debt Rate Below Market</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                Model debt rate ({(modelDebtRate * 100).toFixed(1)}%) is below current Egyptian market rates (CBE: {(CBE_POLICY_RATE * 100).toFixed(2)}%).
                                Commercial lending rates are typically CBE + 2–3% spread (29–30%).
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Metrics Heat Map */}
            <div className="metric-card" style={{ overflow: 'auto', marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Compliance Matrix</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 180 }}>Metric</th>
                            <th style={{ minWidth: 80 }}>Threshold</th>
                            {is.map(s => <th key={s.period}>{s.period}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.map(metric => (
                            <tr key={metric.label}>
                                <td style={{ fontWeight: 500 }}>
                                    {metric.label}
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{metric.description}</div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {metric.direction === 'above' ? '≥' : '≤'} {metric.threshold.toFixed(metric.unit === 'x' ? 2 : 0)}{metric.unit}
                                </td>
                                {Array.from({ length: nYears }, (_, yr) => {
                                    const val = metric.compute(yr);
                                    const pass = checkPass(val, metric);
                                    return (
                                        <td key={yr} style={{
                                            textAlign: 'center',
                                            fontWeight: 600,
                                            color: pass ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                            background: pass ? 'rgba(16,185,129,0.06)' : 'rgba(244,63,94,0.06)',
                                        }}>
                                            <div>{pass ? '✓' : '✗'} {formatVal(val, metric.unit)}</div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Reference Information */}
            <div className="metric-card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Market Reference Rates</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Rate</th>
                            <th>Value</th>
                            <th>Source</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 500 }}>CBE Overnight Deposit Rate</td>
                            <td style={{ textAlign: 'right' }}>{(CBE_POLICY_RATE * 100).toFixed(2)}%</td>
                            <td style={{ color: 'var(--text-muted)' }}>CBE Q1 2026</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Commercial Lending Rate</td>
                            <td style={{ textAlign: 'right' }}>29–30%</td>
                            <td style={{ color: 'var(--text-muted)' }}>CBE + 2–3% spread</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Savings Certificate Rate</td>
                            <td style={{ textAlign: 'right' }}>22–25%</td>
                            <td style={{ color: 'var(--text-muted)' }}>Major Egyptian banks</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Model Debt Rate</td>
                            <td style={{ textAlign: 'right', color: debtRateWarning ? '#f59e0b' : 'var(--accent-emerald)', fontWeight: 600 }}>
                                {(modelDebtRate * 100).toFixed(1)}%
                                {debtRateWarning && ' ⚠'}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>User assumption</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Corporate Tax Rate (ETA)</td>
                            <td style={{ textAlign: 'right' }}>22.5%</td>
                            <td style={{ color: 'var(--text-muted)' }}>Egyptian Tax Authority standard</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ETA Compliance Note */}
            <div className="metric-card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Note:</strong> Revenue figures exclude 14% Egyptian VAT (Law 67/2016). Company is subject to ETA e-invoicing requirements for all B2B transactions.
                All projected tax calculations use the 22.5% ETA standard corporate tax rate.
            </div>
        </div>
    );
}
