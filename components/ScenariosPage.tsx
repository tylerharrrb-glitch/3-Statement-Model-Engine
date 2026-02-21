'use client';
import { useState } from 'react';
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
        return { name: s.name, type: s.type, revenue: lastIS.revenue, ebitda: lastIS.ebitda, netIncome: lastIS.netIncome, eps: lastIS.eps, fcf: lastCF.freeCashFlow, grossMargin: lastIS.grossMargin, netMargin: lastIS.netMargin };
    });

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
                <div className="metric-card">
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
        </div>
    );
}
