'use client';
import { useMemo } from 'react';
import { useModelStore } from '@/lib/store';
import { calculateMultiples, calculateImpliedPrices, getEGXBenchmarks } from '@/lib/engines/valuation';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

export default function ValuationPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const set = useModelStore.setState;

    const sharePrice = scenario?.assumptions.sharePrice ?? 0;

    const benchmarks = useMemo(() => getEGXBenchmarks(), []);

    const multiples = useMemo(() => {
        if (!scenario?.results) return null;
        return calculateMultiples(scenario.results, scenario.assumptions);
    }, [scenario]);

    const implied = useMemo(() => {
        if (!scenario?.results) return null;
        return calculateImpliedPrices(scenario.results, benchmarks);
    }, [scenario, benchmarks]);

    if (!scenario?.results) {
        return <div className="metric-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculate the model first to see Valuation Multiples.
        </div>;
    }

    const card = { background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border-color)', marginBottom: 16 };

    const impliedData = implied ? [
        { name: 'P/E Implied', value: implied.fromPE, fill: '#4f8cff' },
        { name: 'EV/EBITDA Implied', value: implied.fromEVEBITDA, fill: '#8b5cf6' },
        { name: 'P/B Implied', value: implied.fromPB, fill: '#34d399' },
    ] : [];

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>📊 Valuation Multiples</h1>

            {/* Share Price Input */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Share Price ({currency})</label>
                    <input
                        className="fin-input"
                        type="number"
                        value={sharePrice || ''}
                        placeholder="Enter share price..."
                        style={{ width: 200 }}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updatedScenarios = scenarios.map(s =>
                                s.id === activeScenarioId
                                    ? { ...s, assumptions: { ...s.assumptions, sharePrice: val } }
                                    : s
                            );
                            set({ scenarios: updatedScenarios });
                        }}
                    />
                    {sharePrice <= 0 && (
                        <span style={{ fontSize: 11, color: '#fbbf24' }}>⚠ Enter a share price to calculate market multiples</span>
                    )}
                </div>
            </div>

            {/* Trading Multiples */}
            {multiples && sharePrice > 0 && (
                <div style={card}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Trading Multiples</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
                        {[
                            { label: 'P/E Ratio', value: multiples.pe, fmt: (v: number) => v.toFixed(1) + 'x' },
                            { label: 'EV/EBITDA', value: multiples.evEbitda, fmt: (v: number) => v.toFixed(1) + 'x' },
                            { label: 'P/Book', value: multiples.priceBook, fmt: (v: number) => v.toFixed(2) + 'x' },
                            { label: 'FCF Yield', value: multiples.fcfYield, fmt: (v: number) => formatPercent(v) },
                            { label: 'Div Yield', value: multiples.dividendYield, fmt: (v: number) => formatPercent(v) },
                        ].map(m => (
                            <div key={m.label} style={{ textAlign: 'center', padding: '12px 0' }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent-emerald)' }}>
                                    {m.value != null ? m.fmt(m.value) : '—'}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{m.label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 24, justifyContent: 'center', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                        <span>Market Cap: {formatCurrency(multiples.marketCap ?? 0, currency, true)}</span>
                        <span>EV (Market): {formatCurrency(multiples.enterpriseValueMarket ?? 0, currency, true)}</span>
                    </div>
                </div>
            )}

            {/* EGX 30 Benchmarks */}
            <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>EGX 30 Benchmark Comparison</h3>
                        <span style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                            background: 'rgba(52, 211, 153, 0.12)', color: '#34d399',
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                        }}>Q1 2026</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            Source: EGX 30 constituents · Bloomberg consensus · March 2026
                        </span>
                        <button
                            onClick={() => console.log('[EGX Benchmarks] Manual refresh triggered — update EGX30_BENCHMARKS_Q1_2026 in valuation.ts')}
                            style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                                color: 'var(--text-muted)', cursor: 'pointer',
                            }}
                        >🔄 Refresh</button>
                    </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-muted)' }}>Multiple</th>
                            <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>EGX Low</th>
                            <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>EGX Avg</th>
                            <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>EGX High</th>
                            <th style={{ textAlign: 'right', padding: 8, color: '#fbbf24' }}>Company</th>
                            <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>vs EGX Avg</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            { label: 'P/E', bench: benchmarks.pe, company: multiples?.pe },
                            { label: 'EV/EBITDA', bench: benchmarks.evEbitda, company: multiples?.evEbitda },
                            { label: 'P/Book', bench: benchmarks.priceBook, company: multiples?.priceBook },
                        ].map(r => {
                            const prem = r.company != null && r.bench.avg > 0 ? ((r.company - r.bench.avg) / r.bench.avg) : null;
                            const premColor = prem != null ? (prem > 0.1 ? '#f43f5e' : prem < -0.1 ? '#34d399' : 'var(--text-primary)') : 'var(--text-muted)';
                            const premLabel = prem != null ? (prem > 0 ? `+${(prem * 100).toFixed(0)}% Premium` : `${(prem * 100).toFixed(0)}% Discount`) : '—';
                            return (
                                <tr key={r.label} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: 8, fontWeight: 600 }}>{r.label}</td>
                                    <td style={{ textAlign: 'right', padding: 8 }}>{r.bench.low.toFixed(1)}x</td>
                                    <td style={{ textAlign: 'right', padding: 8 }}>{r.bench.avg.toFixed(1)}x</td>
                                    <td style={{ textAlign: 'right', padding: 8 }}>{r.bench.high.toFixed(1)}x</td>
                                    <td style={{ textAlign: 'right', padding: 8, color: '#fbbf24', fontWeight: 600 }}>
                                        {r.company != null ? r.company.toFixed(1) + 'x' : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right', padding: 8, color: premColor, fontWeight: 600, fontSize: 11 }}>
                                        {premLabel}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {multiples && (() => {
                    const avgPrem = [
                        multiples.pe && benchmarks.pe.avg > 0 ? (multiples.pe - benchmarks.pe.avg) / benchmarks.pe.avg : null,
                        multiples.evEbitda && benchmarks.evEbitda.avg > 0 ? (multiples.evEbitda - benchmarks.evEbitda.avg) / benchmarks.evEbitda.avg : null,
                        multiples.priceBook && benchmarks.priceBook.avg > 0 ? (multiples.priceBook - benchmarks.priceBook.avg) / benchmarks.priceBook.avg : null,
                    ].filter(v => v != null) as number[];
                    if (avgPrem.length === 0) return null;
                    const avg = avgPrem.reduce((a, b) => a + b, 0) / avgPrem.length;
                    return (
                        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, padding: '8px 12px', borderRadius: 6, background: avg > 0 ? 'rgba(244,63,94,0.06)' : 'rgba(52,211,153,0.06)', color: avg > 0 ? '#f43f5e' : '#34d399' }}>
                            Company trades at an average <strong>{avg > 0 ? `${(avg * 100).toFixed(0)}% premium` : `${Math.abs(avg * 100).toFixed(0)}% discount`}</strong> to EGX 30 benchmarks
                        </div>
                    );
                })()}
            </div>

            {/* Implied Prices */}
            {implied && (
                <div style={card}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Implied Share Price from EGX Avg Multiples</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                        {[
                            { label: 'From P/E (10.0x)', value: implied.fromPE },
                            { label: 'From EV/EBITDA (7.5x)', value: implied.fromEVEBITDA },
                            { label: 'From P/B (1.6x)', value: implied.fromPB },
                        ].map(m => (
                            <div key={m.label} style={{ textAlign: 'center', padding: 16, background: 'var(--bg-primary)', borderRadius: 8 }}>
                                <div style={{ fontSize: 24, fontWeight: 700, color: '#34d399' }}>{formatCurrency(m.value, currency)}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{m.label}</div>
                            </div>
                        ))}
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={impliedData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                            <XAxis dataKey="name" tick={{ fill: '#a0a0b8', fontSize: 11 }} />
                            <YAxis tick={{ fill: '#a0a0b8', fontSize: 11 }} tickFormatter={v => formatCurrency(v, currency, true)} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8 }} formatter={(v: any) => formatCurrency(v, currency)} />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {impliedData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}
