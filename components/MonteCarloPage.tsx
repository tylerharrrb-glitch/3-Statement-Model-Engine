'use client';

import { useState, useCallback } from 'react';
import { useModelStore } from '@/lib/store';
import { runMonteCarloSimulation, getDefaultMonteCarloConfig } from '@/lib/monte-carlo';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { MonteCarloResult, OutputMetric } from '@/types/scenario';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const metricLabels: Record<OutputMetric, string> = {
    netIncome: 'Net Income',
    fcf: 'Free Cash Flow',
    eps: 'Earnings Per Share',
    revenue: 'Revenue',
    ebitda: 'EBITDA',
    roe: 'Return on Equity',
    interestCoverage: 'Interest Coverage',
};

function buildHistogramData(values: number[], bins: number = 40) {
    if (values.length === 0) return [];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binWidth = (max - min) / bins;
    if (binWidth === 0) return [{ binCenter: min, count: values.length }];

    const histogram = Array.from({ length: bins }, (_, i) => ({
        binCenter: min + (i + 0.5) * binWidth,
        count: 0,
    }));

    for (const v of values) {
        const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
        histogram[idx].count++;
    }
    return histogram;
}

export default function MonteCarloPage() {
    const { scenarios, activeScenarioId, historicalInputs, currency } = useModelStore();
    const activeScenario = scenarios.find(s => s.id === activeScenarioId);

    const [iterations, setIterations] = useState(10000);
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<MonteCarloResult[]>([]);
    const [selectedMetric, setSelectedMetric] = useState<OutputMetric>('netIncome');

    const handleRun = useCallback(() => {
        if (!activeScenario) return;
        setIsRunning(true);
        setResults([]);

        // Run async-like with setTimeout to unblock the UI
        setTimeout(() => {
            try {
                const config = getDefaultMonteCarloConfig();
                config.iterations = iterations;
                const mcResults = runMonteCarloSimulation(
                    activeScenario.assumptions,
                    historicalInputs,
                    config,
                );
                setResults(mcResults);
            } catch (err) {
                console.error('Monte Carlo simulation failed:', err);
            } finally {
                setIsRunning(false);
            }
        }, 50);
    }, [activeScenario, historicalInputs, iterations]);

    const activeResult = results.find(r => r.metric === selectedMetric);
    const histogramData = activeResult ? buildHistogramData(activeResult.values) : [];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>🎲 Monte Carlo Simulation</h1>
            </div>

            {/* Controls */}
            <div className="metric-card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Iterations:
                    <input
                        className="fin-input"
                        type="number"
                        min={100}
                        max={10000}
                        step={100}
                        value={iterations}
                        onChange={e => setIterations(Math.max(100, parseInt(e.target.value) || 100))}
                        style={{ width: 100, textAlign: 'right' }}
                    />
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    Output Metric:
                    <select
                        className="fin-select"
                        value={selectedMetric}
                        onChange={e => setSelectedMetric(e.target.value as OutputMetric)}
                    >
                        {(['netIncome', 'fcf', 'eps', 'revenue', 'ebitda'] as OutputMetric[]).map(m => (
                            <option key={m} value={m}>{metricLabels[m]}</option>
                        ))}
                    </select>
                </label>
                <button className="btn-primary" onClick={handleRun} disabled={isRunning || !activeScenario}>
                    {isRunning ? '⏳ Simulating...' : '▶ Run Simulation'}
                </button>
            </div>

            {/* Histogram */}
            {activeResult && (
                <>
                    <div className="metric-card" style={{ marginBottom: 20 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent-blue)' }}>
                            Distribution — {metricLabels[selectedMetric]}
                        </h3>
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={histogramData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                                <XAxis
                                    dataKey="binCenter"
                                    tick={{ fill: '#8b8fa3', fontSize: 10 }}
                                    tickFormatter={v => formatCurrency(v, currency, true)}
                                />
                                <YAxis tick={{ fill: '#8b8fa3', fontSize: 10 }} />
                                { }
                                <Tooltip
                                    contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8, fontSize: 12 }}
                                    labelFormatter={v => formatCurrency(Number(v), currency)}
                                    formatter={(count: number | undefined) => [count ?? 0, 'Frequency']}
                                />
                                <ReferenceLine x={activeResult.statistics.mean} stroke="var(--accent-amber)" strokeDasharray="4 4" label={{ value: 'Mean', fill: 'var(--accent-amber)', fontSize: 10 }} />
                                <Bar dataKey="count" fill="var(--accent-blue)" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Statistics Table */}
                    <div className="metric-card">
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent-blue)' }}>
                            Summary Statistics
                        </h3>
                        <table className="fin-table">
                            <thead>
                                <tr>
                                    <th>Statistic</th>
                                    <th>Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { label: 'Mean', value: activeResult.statistics.mean },
                                    { label: 'Median (P50)', value: activeResult.statistics.median },
                                    { label: 'Std Dev', value: activeResult.statistics.stdDev },
                                    { label: 'Min', value: activeResult.statistics.min },
                                    { label: 'P10', value: activeResult.statistics.p10 },
                                    { label: 'P25', value: activeResult.statistics.p25 },
                                    { label: 'P75', value: activeResult.statistics.p75 },
                                    { label: 'P90', value: activeResult.statistics.p90 },
                                    { label: 'Max', value: activeResult.statistics.max },
                                    { label: 'Simulations', value: activeResult.values.length },
                                ].map(row => (
                                    <tr key={row.label}>
                                        <td>{row.label}</td>
                                        <td>{row.label === 'Simulations' ? formatNumber(row.value) : formatCurrency(row.value, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {!activeResult && !isRunning && (
                <div className="metric-card" style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🎲</div>
                    <div style={{ fontSize: 14 }}>Run a simulation to see the probability distribution of financial outcomes</div>
                    <div style={{ fontSize: 12, marginTop: 8 }}>Variables: Revenue Growth, COGS %, Interest Rate</div>
                </div>
            )}
        </div>
    );
}
