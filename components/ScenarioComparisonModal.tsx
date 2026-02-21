'use client';

import React from 'react';
import { useModelStore } from '@/lib/store';
import { SCENARIOS, ScenarioEnum } from '@/lib/scenarios';
import { formatCurrency, formatPercent } from '@/lib/utils';

// ============================================================
// ScenarioComparisonModal — Side-by-side metrics for all scenarios
// Feature 3: Three Scenario Toggle
// ============================================================

interface MetricRow {
    label: string;
    getValue: (is: { revenue: number; ebitda: number; ebitdaMargin: number; netIncome: number; netMargin: number; grossMargin: number; eps: number }, cf: { freeCashFlow: number }, bs: { totalAssets: number }) => string;
    getRange?: (opt: number, cons: number) => string;
    isPercent?: boolean;
}

export default function ScenarioComparisonModal({ onClose }: { onClose: () => void }) {
    const { scenarios, currency } = useModelStore();

    // Extract terminal-year metrics for each scenario
    const getMetrics = (scenarioId: string) => {
        const scenario = scenarios.find(s => s.id === scenarioId);
        if (!scenario?.results) return null;

        const r = scenario.results;
        const lastIS = r.incomeStatements[r.incomeStatements.length - 1];
        const lastCF = r.cashFlowStatements[r.cashFlowStatements.length - 1];
        const lastBS = r.balanceSheets[r.balanceSheets.length - 1];
        const lastPeriod = lastIS.period;

        return {
            name: scenario.name,
            type: scenario.type,
            period: lastPeriod,
            revenue: lastIS.revenue,
            ebitda: lastIS.ebitda,
            ebitdaMargin: lastIS.revenue !== 0 ? lastIS.ebitda / lastIS.revenue : 0,
            netIncome: lastIS.netIncome,
            netMargin: lastIS.netMargin,
            grossMargin: lastIS.grossMargin,
            eps: lastIS.eps,
            fcf: lastCF.freeCashFlow,
            totalAssets: lastBS.totalAssets,
        };
    };

    // Order: Base, Optimistic, Conservative
    const orderedScenarios = [
        scenarios.find(s => s.type === 'base'),
        scenarios.find(s => s.type === 'optimistic'),
        scenarios.find(s => s.type === 'conservative'),
    ].filter(Boolean);

    const metrics = orderedScenarios.map(s => s ? getMetrics(s.id) : null);
    const [base, opt, cons] = metrics;

    const scenarioDefs = [
        SCENARIOS[ScenarioEnum.BASE],
        SCENARIOS[ScenarioEnum.OPTIMISTIC],
        SCENARIOS[ScenarioEnum.CONSERVATIVE],
    ];

    const lastPeriod = base?.period ?? opt?.period ?? cons?.period ?? 'Terminal';

    const rows: { label: string; values: (string | null)[]; range: string | null }[] = [
        {
            label: 'Revenue',
            values: metrics.map(m => m ? formatCurrency(m.revenue, currency, true) : '—'),
            range: opt && cons ? formatCurrency(opt.revenue - cons.revenue, currency, true) : null,
        },
        {
            label: 'EBITDA',
            values: metrics.map(m => m ? formatCurrency(m.ebitda, currency, true) : '—'),
            range: opt && cons ? formatCurrency(opt.ebitda - cons.ebitda, currency, true) : null,
        },
        {
            label: 'EBITDA Margin',
            values: metrics.map(m => m ? formatPercent(m.ebitdaMargin) : '—'),
            range: opt && cons ? `${((opt.ebitdaMargin - cons.ebitdaMargin) * 100).toFixed(1)}pp` : null,
        },
        {
            label: 'Net Income',
            values: metrics.map(m => m ? formatCurrency(m.netIncome, currency, true) : '—'),
            range: opt && cons ? formatCurrency(opt.netIncome - cons.netIncome, currency, true) : null,
        },
        {
            label: 'Net Margin',
            values: metrics.map(m => m ? formatPercent(m.netMargin) : '—'),
            range: opt && cons ? `${((opt.netMargin - cons.netMargin) * 100).toFixed(1)}pp` : null,
        },
        {
            label: 'Free Cash Flow',
            values: metrics.map(m => m ? formatCurrency(m.fcf, currency, true) : '—'),
            range: opt && cons ? formatCurrency(opt.fcf - cons.fcf, currency, true) : null,
        },
        {
            label: 'EPS',
            values: metrics.map(m => m ? `${currency === 'USD' ? '$' : ''}${m.eps.toFixed(2)}` : '—'),
            range: opt && cons ? `${(opt.eps - cons.eps).toFixed(2)}` : null,
        },
        {
            label: 'Total Assets',
            values: metrics.map(m => m ? formatCurrency(m.totalAssets, currency, true) : '—'),
            range: opt && cons ? formatCurrency(opt.totalAssets - cons.totalAssets, currency, true) : null,
        },
    ];

    const anyCalculated = metrics.some(m => m !== null);

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                className="metric-card"
                style={{
                    width: '90%', maxWidth: 900,
                    maxHeight: '85vh', overflowY: 'auto',
                    padding: 28,
                    animation: 'fadeIn 0.2s ease-out',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                        📊 Scenario Comparison ({lastPeriod})
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', color: 'var(--text-muted)',
                            fontSize: 24, cursor: 'pointer', lineHeight: 1,
                        }}
                    >
                        ✕
                    </button>
                </div>

                {!anyCalculated ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                        No scenarios have been calculated yet. Click &quot;Calculate All&quot; first.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="fin-table" style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left', minWidth: 130 }}>Metric</th>
                                    {scenarioDefs.map((def, i) => (
                                        <th key={def.type} style={{ textAlign: 'right', color: def.color, minWidth: 120 }}>
                                            {def.emoji} {def.name}
                                        </th>
                                    ))}
                                    <th style={{ textAlign: 'right', minWidth: 100, color: 'var(--text-muted)' }}>Range</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.label}>
                                        <td style={{ fontWeight: 500 }}>{row.label}</td>
                                        {row.values.map((val, i) => (
                                            <td key={i} style={{ textAlign: 'right', color: scenarioDefs[i]?.color }}>
                                                {val}
                                            </td>
                                        ))}
                                        <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                                            {row.range ?? '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Assumption Comparison */}
                <div style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Key Assumption Differences
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        {scenarioDefs.map(def => (
                            <div key={def.type} style={{
                                padding: 14,
                                background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                                borderRadius: 10,
                                borderTop: `3px solid ${def.color}`,
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: 8, color: def.color }}>
                                    {def.emoji} {def.name}
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Growth</span>
                                        <span style={{ fontWeight: 600 }}>{((def.assumptions.revenueGrowthRate?.[0] ?? 0) * 100).toFixed(0)}% → {((def.assumptions.revenueGrowthRate?.[4] ?? 0) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>COGS %</span>
                                        <span style={{ fontWeight: 600 }}>{((def.assumptions.cogsPercent?.[0] ?? 0) * 100).toFixed(0)}% → {((def.assumptions.cogsPercent?.[4] ?? 0) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>SG&A %</span>
                                        <span style={{ fontWeight: 600 }}>{((def.assumptions.sgaPercent?.[0] ?? 0) * 100).toFixed(0)}% → {((def.assumptions.sgaPercent?.[4] ?? 0) * 100).toFixed(0)}%</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>CapEx %</span>
                                        <span style={{ fontWeight: 600 }}>{((def.assumptions.capexPercent?.[0] ?? 0) * 100).toFixed(0)}% → {((def.assumptions.capexPercent?.[4] ?? 0) * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    {def.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Close Button */}
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                    <button className="btn-secondary" onClick={onClose} style={{ padding: '10px 32px' }}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
