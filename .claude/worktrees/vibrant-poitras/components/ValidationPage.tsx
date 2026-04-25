'use client';
import React from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency } from '@/lib/utils';
import type { ValidationFinding } from '@/lib/agents/validation-types';

export default function ValidationPage() {
    const { scenarios, activeScenarioId, currency, validationReport, isValidating } = useModelStore();
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

    const checkNames = [...new Set(allDetails.map(d => d.name))];
    const periods = [...new Set(allDetails.map(d => d.period))];

    const totalChecks = allDetails.length;
    const passedChecks = allDetails.filter(d => d.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const passRate = totalChecks > 0 ? (passedChecks / totalChecks * 100).toFixed(1) : '0';

    const report = validationReport;

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>✅ Model Validation</h1>

            {/* ═══════════════════════════════════════════════ */}
            {/* AI VALIDATION AGENT REPORT                     */}
            {/* ═══════════════════════════════════════════════ */}
            {isValidating && (
                <div className="metric-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent-primary)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 20, height: 20, border: '3px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    <p style={{ margin: 0, color: 'var(--text-secondary)' }}>AI Validation Agent running audit…</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {report && (
                <>
                    {/* Header + Pass/Fail */}
                    <div className="metric-card" style={{
                        marginBottom: 24,
                        borderLeft: `4px solid ${report.passed ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                                {report.passed ? '✅' : '🚨'} AI Validation Report
                            </h3>
                            <span style={{
                                fontWeight: 700,
                                fontSize: 13,
                                color: report.passed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                background: report.passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                padding: '4px 12px',
                                borderRadius: 6,
                            }}>
                                {report.passed ? 'ALL CHECKS PASSED' : `${report.criticalErrors.length} CRITICAL ERRORS`}
                            </span>
                        </div>

                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>{report.summary}</p>

                        {/* Statistics Cards */}
                        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                            {[
                                { label: 'Total Checks', value: report.statistics.totalChecks, color: 'var(--accent-primary)', bg: 'rgba(99,102,241,0.08)' },
                                { label: 'Passed', value: report.statistics.passed, color: 'var(--accent-emerald)', bg: 'rgba(16,185,129,0.08)' },
                                { label: 'Critical', value: report.statistics.criticalFailed, color: 'var(--accent-rose)', bg: 'rgba(239,68,68,0.08)' },
                                { label: 'Warnings', value: report.statistics.majorFailed, color: 'var(--accent-amber, #F59E0B)', bg: 'rgba(245,158,11,0.08)' },
                            ].map((s, i) => (
                                <div key={i} style={{ background: s.bg, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.3 }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* Egyptian Law Compliance */}
                        <div style={{
                            background: report.egyptianLawCompliance.overallCompliant ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                            border: `1px solid ${report.egyptianLawCompliance.overallCompliant ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                            borderRadius: 8,
                            padding: '10px 14px',
                            fontSize: 13,
                        }}>
                            <strong>🇪🇬 Egyptian Law Compliance: </strong>
                            {report.egyptianLawCompliance.overallCompliant
                                ? <span style={{ color: 'var(--accent-emerald)' }}>✅ Fully compliant with Law 159/1981</span>
                                : <span style={{ color: 'var(--accent-rose)' }}>
                                    ⚠️ Issues: {[
                                        !report.egyptianLawCompliance.epdCompliant && 'EPD',
                                        !report.egyptianLawCompliance.legalReserveCompliant && 'Legal Reserve',
                                        !report.egyptianLawCompliance.dividendBaseCompliant && 'Dividend Base',
                                        !report.egyptianLawCompliance.whtCompliant && 'WHT',
                                    ].filter(Boolean).join(', ')}
                                </span>
                            }
                        </div>

                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 8 }}>
                            Runtime: {report.durationMs}ms | {report.timestamp}
                        </div>
                    </div>

                    {/* Critical Errors Detail */}
                    {report.criticalErrors.length > 0 && (
                        <div className="metric-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent-rose)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-rose)' }}>🔴 Critical Errors (Export Blocked)</h3>
                            {report.criticalErrors.map((err: ValidationFinding, i: number) => (
                                <div key={i} style={{
                                    background: 'rgba(239,68,68,0.04)',
                                    border: '1px solid rgba(239,68,68,0.15)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    marginBottom: 8,
                                    fontSize: 12,
                                }}>
                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                        [{err.period}] Rule {err.rule}: {err.field}
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{err.explanation}</div>
                                    <div style={{ color: 'var(--accent-primary)', fontSize: 11 }}>💡 Fix: {err.fixInstruction}</div>
                                    {err.expected !== null && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            Expected: <span style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>{err.expected?.toFixed(2)}</span>
                                            {' | '}Actual: <span style={{ color: 'var(--accent-rose)', fontFamily: 'monospace' }}>{err.actual?.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Major Warnings */}
                    {report.majorWarnings.length > 0 && (
                        <div className="metric-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent-amber, #F59E0B)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-amber, #F59E0B)' }}>🟡 Warnings</h3>
                            {report.majorWarnings.map((w: ValidationFinding, i: number) => (
                                <div key={i} style={{
                                    background: 'rgba(245,158,11,0.04)',
                                    border: '1px solid rgba(245,158,11,0.15)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    marginBottom: 8,
                                    fontSize: 12,
                                }}>
                                    <div style={{ fontWeight: 600, marginBottom: 4 }}>[{w.period}] Rule {w.rule}: {w.field}</div>
                                    <div style={{ color: 'var(--text-secondary)' }}>{w.explanation}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Advisory Notes */}
                    {report.advisoryNotes.length > 0 && (
                        <div className="metric-card" style={{ marginBottom: 24, borderLeft: '4px solid var(--accent-primary)' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>ℹ️ Advisory Notes</h3>
                            {report.advisoryNotes.map((n: ValidationFinding, i: number) => (
                                <div key={i} style={{
                                    background: 'rgba(99,102,241,0.04)',
                                    border: '1px solid rgba(99,102,241,0.15)',
                                    borderRadius: 8,
                                    padding: '8px 14px',
                                    marginBottom: 6,
                                    fontSize: 12,
                                }}>
                                    <div style={{ fontWeight: 600 }}>[{n.period}] Rule {n.rule}</div>
                                    <div style={{ color: 'var(--text-secondary)' }}>{n.explanation}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ═══════════════════════════════════════════════ */}
            {/* EXISTING INTEGRATION CHECKS (15 checks)        */}
            {/* ═══════════════════════════════════════════════ */}
            <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 32, marginBottom: 16 }}>🔍 Engine Integration Checks (15 Checks)</h2>

            {/* Summary Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                    { label: 'Total Checks', value: `${totalChecks}`, icon: '🔍', sub: `${checkNames.length} types × ${periods.length} periods`, color: 'var(--accent-primary)' },
                    { label: 'Passed', value: `${passedChecks}`, icon: '✅', sub: `${passRate}% pass rate`, color: 'var(--accent-emerald)' },
                    { label: 'Failed', value: `${failedChecks}`, icon: failedChecks === 0 ? '🎉' : '❌', sub: failedChecks === 0 ? 'All clear!' : 'Needs attention', color: failedChecks === 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' },
                ].map((c, i) => (
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
