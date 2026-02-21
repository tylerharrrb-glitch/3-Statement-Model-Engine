'use client';
import { useState } from 'react';
import { useModelStore } from '@/lib/store';
import { oneWaySensitivity, generateRange } from '@/lib/sensitivity';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { OutputMetric } from '@/types/scenario';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const variables = [
    { value: 'revenueGrowthRate', label: 'Revenue Growth Rate' },
    { value: 'cogsPercent', label: 'COGS %' },
    { value: 'sgaPercent', label: 'SG&A %' },
    { value: 'taxRate', label: 'Tax Rate' },
    { value: 'capexPercent', label: 'CapEx %' },
    { value: 'interestRate', label: 'Interest Rate' },
];

const metrics: { value: OutputMetric; label: string }[] = [
    { value: 'netIncome', label: 'Net Income' },
    { value: 'fcf', label: 'Free Cash Flow' },
    { value: 'eps', label: 'EPS' },
    { value: 'ebitda', label: 'EBITDA' },
    { value: 'revenue', label: 'Revenue' },
];

export default function SensitivityPage() {
    const { scenarios, activeScenarioId, historicalInputs, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const [selectedVar, setSelectedVar] = useState('revenueGrowthRate');
    const [selectedMetric, setSelectedMetric] = useState<OutputMetric>('netIncome');
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<{ inputValue: number; outputValue: number }[] | null>(null);

    if (!scenario) return null;

    const runSensitivity = () => {
        setIsRunning(true);
        setTimeout(() => {
            try {
                const assumptions = scenario.assumptions as unknown as Record<string, unknown>;
                const baseVal = getBaseValue(assumptions, selectedVar);
                const range = generateRange(baseVal, 5, baseVal * 0.1 || 0.01);
                const res = oneWaySensitivity(scenario.assumptions, historicalInputs, selectedVar, range, selectedMetric);
                setResults(res);
            } catch (e) {
                console.error(e);
            }
            setIsRunning(false);
        }, 100);
    };

    const chartData = results?.map(r => ({
        input: selectedVar.includes('Percent') || selectedVar.includes('Rate') || selectedVar.includes('Ratio')
            ? formatPercent(r.inputValue) : r.inputValue.toFixed(2),
        value: Math.round(r.outputValue),
        isBase: Math.abs(r.inputValue - getBaseValue(scenario.assumptions as unknown as Record<string, unknown>, selectedVar)) < 0.001,
    }));

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>📈 Sensitivity Analysis</h1>

            <div className="metric-card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Variable</label>
                        <select className="fin-select" value={selectedVar} onChange={e => setSelectedVar(e.target.value)}>
                            {variables.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Output Metric</label>
                        <select className="fin-select" value={selectedMetric} onChange={e => setSelectedMetric(e.target.value as OutputMetric)}>
                            {metrics.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <button className="btn-primary" onClick={runSensitivity} disabled={isRunning}>
                        {isRunning ? '⏳ Running...' : '▶ Run Analysis'}
                    </button>
                </div>
            </div>

            {chartData && (
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>
                        Impact of {variables.find(v => v.value === selectedVar)?.label} on {metrics.find(m => m.value === selectedMetric)?.label}
                    </h3>
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={chartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
                            <XAxis type="number" tick={{ fill: '#a0a0b8', fontSize: 11 }} tickFormatter={v => formatCurrency(v, currency, true)} />
                            <YAxis dataKey="input" type="category" tick={{ fill: '#a0a0b8', fontSize: 11 }} width={80} />
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            <Tooltip contentStyle={{ background: '#16161e', border: '1px solid #2a2a3e', borderRadius: 8 }} formatter={(v: any) => formatCurrency(v, currency)} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {chartData.map((entry, i) => (
                                    <Cell key={i} fill={entry.isBase ? '#fbbf24' : entry.value >= (chartData.find(d => d.isBase)?.value ?? 0) ? '#34d399' : '#f43f5e'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

function getBaseValue(assumptions: Record<string, unknown>, key: string): number {
    const val = assumptions[key];
    if (Array.isArray(val)) return val[0] as number;
    return val as number;
}
