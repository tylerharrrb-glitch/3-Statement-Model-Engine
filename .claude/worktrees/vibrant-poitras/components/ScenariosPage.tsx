'use client';
import { useState, useMemo } from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent, formatEPS } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ScenariosPage() {
    const { scenarios, activeScenarioId, setActiveScenario, addScenario, deleteScenario, duplicateScenario, calculateAllScenarios, isCalculating, currency } = useModelStore();
    const [newName, setNewName] = useState('');

    const comparison = scenarios.filter(s => s.results).map(s => {
        const r = s.results!;
        const lastIS = r.incomeStatements[r.incomeStatements.length - 1];
        const lastCF = r.cashFlowStatements[r.cashFlowStatements.length - 1];
        const lastBS = r.balanceSheets[r.balanceSheets.length - 1];
        const firstIS = r.incomeStatements.find(is => is.periodType === 'projected') ?? r.incomeStatements[0];
        const years = r.incomeStatements.filter(is => is.periodType === 'projected').length;
        const cagr = years > 1 && firstIS.revenue > 0 ? Math.pow(lastIS.revenue / firstIS.revenue, 1 / (years - 1)) - 1 : 0;
        const ic = lastIS.interestExpense !== 0 ? lastIS.ebit / lastIS.interestExpense : 0;
        return {
            name: s.name, type: s.type,
            revenue: lastIS.revenue, ebitda: lastIS.ebitda, netIncome: lastIS.netIncome,
            eps: lastIS.eps, fcf: lastCF.freeCashFlow, grossMargin: lastIS.grossMargin,
            netMargin: lastIS.netMargin, endingCash: lastBS.cash, cagr, interestCoverage: ic,
        };
    });

    // Find best/worst for color coding
    const bestWorst = (key: string, higherBetter = true) => {
        const vals = comparison.map(c => (c as unknown as Record<string, number>)[key]);
        const best = higherBetter ? Math.max(...vals) : Math.min(...vals);
        const worst = higherBetter ? Math.min(...vals) : Math.max(...vals);
        return { best, worst };
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>🔀 Scenario Manager</h1>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input className="fin-input" placeholder="New scenario name..." value={newName} onChange={e => setNewName(e.target.value)} style={{ width: 200 }} />
                    <button className="btn-secondary" onClick={() => { if (newName) { addScenario(newName, 'custom'); setNewName(''); } }}>+ Add</button>
                    <button className="btn-primary" onClick={calculateAllScenarios} disabled={isCalculating}>{isCalculating ? '⏳...' : '▶ Calculate All'}</button>
                </div>
            </div>

            {/* Scenario Cards */}
            <div className="dashboard-grid" style={{ marginBottom: 24 }}>
                {scenarios.map(s => (
                    <div key={s.id} className="metric-card glass-hover" onClick={() => setActiveScenario(s.id)} style={{ cursor: 'pointer', border: s.id === activeScenarioId ? '1px solid var(--accent-blue)' : undefined }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontWeight: 600 }}>{s.name}</span>
                            <span className={`badge badge-${s.type === 'optimistic' ? 'success' : s.type === 'conservative' ? 'error' : 'info'}`}>{s.type}</span>
                        </div>
                        {s.results ? (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'grid', gap: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Revenue</span><span>{formatCurrency(s.results.incomeStatements[s.results.incomeStatements.length - 1].revenue, currency, true)}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Net Income</span><span>{formatCurrency(s.results.incomeStatements[s.results.incomeStatements.length - 1].netIncome, currency, true)}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>EPS</span><span>{formatEPS(s.results.incomeStatements[s.results.incomeStatements.length - 1].eps, currency)}</span></div>
                            </div>
                        ) : <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not yet calculated</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, fontSize: 12 }}>
                            <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={e => { e.stopPropagation(); duplicateScenario(s.id, `${s.name} (Copy)`); }}>Duplicate</button>
                            {scenarios.length > 1 && <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent-rose)' }} onClick={e => { e.stopPropagation(); deleteScenario(s.id); }}>Delete</button>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Comparison Chart */}
            {comparison.length > 0 && (
                <div className="metric-card" style={{ marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Scenario Comparison</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={comparison}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                            <XAxis dataKey="name" tick={{ fill: '#a0a0b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#a0a0b8', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                            <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8 }} />
                            <Bar dataKey="revenue" name="Revenue" fill="#4f8cff" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="ebitda" name="EBITDA" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="netIncome" name="Net Income" fill="#34d399" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="fcf" name="FCF" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Side-by-side Comparison Table */}
            {comparison.length > 0 && (
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Side-by-Side Comparison (Terminal Year)</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                                <th style={{ textAlign: 'left', padding: 10, color: 'var(--text-muted)' }}>Metric</th>
                                {comparison.map(c => (
                                    <th key={c.name} style={{ textAlign: 'right', padding: 10, color: c.type === 'optimistic' ? '#34d399' : c.type === 'conservative' ? '#f43f5e' : '#4f8cff' }}>
                                        {c.name}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'Revenue', key: 'revenue', fmt: (v: number) => formatCurrency(v, currency, true), higherBetter: true },
                                { label: 'EBITDA', key: 'ebitda', fmt: (v: number) => formatCurrency(v, currency, true), higherBetter: true },
                                { label: 'Net Income', key: 'netIncome', fmt: (v: number) => formatCurrency(v, currency, true), higherBetter: true },
                                { label: 'EPS', key: 'eps', fmt: (v: number) => formatEPS(v, currency), higherBetter: true },
                                { label: 'Free Cash Flow', key: 'fcf', fmt: (v: number) => formatCurrency(v, currency, true), higherBetter: true },
                                { label: 'Ending Cash', key: 'endingCash', fmt: (v: number) => formatCurrency(v, currency, true), higherBetter: true },
                                { label: 'Net Margin', key: 'netMargin', fmt: (v: number) => formatPercent(v), higherBetter: true },
                                { label: '5Y Revenue CAGR', key: 'cagr', fmt: (v: number) => formatPercent(v), higherBetter: true },
                                { label: 'Interest Coverage', key: 'interestCoverage', fmt: (v: number) => v.toFixed(1) + 'x', higherBetter: true },
                            ].map(row => {
                                const bw = bestWorst(row.key, row.higherBetter);
                                return (
                                    <tr key={row.label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: 10, fontWeight: 600 }}>{row.label}</td>
                                        {comparison.map(c => {
                                            const val = (c as unknown as Record<string, number>)[row.key];
                                            const isBest = val === bw.best && comparison.length > 1;
                                            const isWorst = val === bw.worst && comparison.length > 1;
                                            return (
                                                <td key={c.name} style={{
                                                    textAlign: 'right', padding: 10,
                                                    color: isBest ? '#34d399' : isWorst ? '#f43f5e' : 'var(--text-primary)',
                                                    fontWeight: isBest ? 700 : 400,
                                                }}>
                                                    {row.fmt(val)}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
