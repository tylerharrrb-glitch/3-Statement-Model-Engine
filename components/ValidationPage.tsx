'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';

export default function ValidationPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const results = scenario?.results;

    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const checks = results.integrationChecks;
    const allDetails = checks.flatMap((c, periodIdx) =>
        c.details.map(d => ({
            ...d,
            period: results.incomeStatements[periodIdx + 1]?.period ?? `Period ${periodIdx + 1}`,
            periodIdx,
        }))
    );

    // Group by check name
    const checkNames = [...new Set(allDetails.map(d => d.name))];
    const periods = [...new Set(allDetails.map(d => d.period))];

    const totalChecks = allDetails.length;
    const passedChecks = allDetails.filter(d => d.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const passRate = totalChecks > 0 ? (passedChecks / totalChecks * 100).toFixed(1) : '0';

    const cards = [
        { label: 'Total Checks', value: `${totalChecks}`, icon: '🔍', sub: `${checkNames.length} types × ${periods.length} periods`, color: 'var(--accent-primary)' },
        { label: 'Passed', value: `${passedChecks}`, icon: '✅', sub: `${passRate}% pass rate`, color: 'var(--accent-emerald)' },
        { label: 'Failed', value: `${failedChecks}`, icon: failedChecks === 0 ? '🎉' : '❌', sub: failedChecks === 0 ? 'All clear!' : 'Needs attention', color: failedChecks === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' },
    ];

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>✅ Model Validation (15 Checks)</h1>

            {/* Summary Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {cards.map((c, i) => (
                    <div key={i} className="metric-card" style={{ borderLeft: `4px solid ${c.color}` }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{c.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{c.sub}</div>
                    </div>
                ))}
            </div>

            {/* Check Matrix */}
            <div className="metric-card" style={{ overflow: 'auto' }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Validation Matrix</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 280 }}>Check</th>
                            {periods.map(p => <th key={p}>{p}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {checkNames.map((name, ri) => {
                            const allPassForCheck = periods.every(p => {
                                const d = allDetails.find(dd => dd.name === name && dd.period === p);
                                return d?.passed ?? true;
                            });
                            return (
                                <tr key={ri}>
                                    <td style={{ fontWeight: allPassForCheck ? 400 : 600 }}>{name}</td>
                                    {periods.map(p => {
                                        const d = allDetails.find(dd => dd.name === name && dd.period === p);
                                        if (!d) return <td key={p}>—</td>;
                                        return (
                                            <td key={p} style={{
                                                textAlign: 'center',
                                                color: d.passed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                                fontWeight: d.passed ? 400 : 700,
                                            }}>
                                                {d.passed ? '✓' : `✗ ${formatCurrency(d.difference, currency)}`}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Failed Details */}
            {failedChecks > 0 && (
                <div className="metric-card" style={{ marginTop: 24, borderLeft: '4px solid var(--accent-rose)' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-rose)' }}>⚠️ Failed Checks Detail</h3>
                    <table className="fin-table">
                        <thead>
                            <tr>
                                <th>Period</th>
                                <th>Check</th>
                                <th>Expected</th>
                                <th>Actual</th>
                                <th>Difference</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allDetails.filter(d => !d.passed).map((d, i) => (
                                <tr key={i}>
                                    <td>{d.period}</td>
                                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                                    <td>{formatCurrency(d.expected, currency)}</td>
                                    <td>{formatCurrency(d.actual, currency)}</td>
                                    <td style={{ color: 'var(--accent-rose)', fontWeight: 700 }}>{formatCurrency(d.difference, currency)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Convergence Info */}
            <div className="metric-card" style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Circular Reference Convergence</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Converged</th>
                            <th>Iterations</th>
                            <th>Final Delta</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Projected Periods</td>
                            <td style={{ color: results.convergenceInfo.converged ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                {results.convergenceInfo.converged ? '✓ Yes' : '✗ No'}
                            </td>
                            <td>{results.convergenceInfo.iterations}</td>
                            <td>{formatCurrency(results.convergenceInfo.finalDelta, currency)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
