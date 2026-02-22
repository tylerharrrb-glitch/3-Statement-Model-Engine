'use client';
import { useState, useMemo } from 'react';
import { useModelStore } from '@/lib/store';
import { oneWaySensitivity, twoWaySensitivity, generateRange } from '@/lib/sensitivity';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { OutputMetric } from '@/types/scenario';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

const variables = [
    { value: 'revenueGrowthRate', label: 'Revenue Growth Rate' },
    { value: 'cogsPercent', label: 'COGS %' },
    { value: 'sgaPercent', label: 'SG&A %' },
    { value: 'taxRate', label: 'Tax Rate' },
    { value: 'capexPercent', label: 'CapEx %' },
    { value: 'interestRateOnDebt', label: 'Interest Rate (Debt)' },
    { value: 'interestRateOnCash', label: 'Interest Rate (Cash)' },
];

const metrics: { value: OutputMetric; label: string }[] = [
    { value: 'netIncome', label: 'Net Income' },
    { value: 'fcf', label: 'Free Cash Flow' },
    { value: 'eps', label: 'EPS' },
    { value: 'ebitda', label: 'EBITDA' },
    { value: 'revenue', label: 'Revenue' },
    { value: 'interestCoverage', label: 'Interest Coverage' },
];

export default function SensitivityPage() {
    const { scenarios, activeScenarioId, historicalInputs, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const [selectedVar, setSelectedVar] = useState('revenueGrowthRate');
    const [selectedMetric, setSelectedMetric] = useState<OutputMetric>('netIncome');
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState<{ inputValue: number; outputValue: number }[] | null>(null);

    // Two-way sensitivity tables (pre-computed on render)
    const niSensitivity = useMemo(() => {
        if (!scenario) return null;
        const revGrowthBase = getBaseValue(scenario.assumptions as unknown as Record<string, unknown>, 'revenueGrowthRate');
        const cogsBase = getBaseValue(scenario.assumptions as unknown as Record<string, unknown>, 'cogsPercent');
        const revRange = [revGrowthBase - 0.04, revGrowthBase - 0.02, revGrowthBase, revGrowthBase + 0.02, revGrowthBase + 0.04];
        const cogsRange = [cogsBase - 0.04, cogsBase - 0.02, cogsBase, cogsBase + 0.02, cogsBase + 0.04];
        return twoWaySensitivity(scenario.assumptions, historicalInputs, 'revenueGrowthRate', revRange, 'cogsPercent', cogsRange, 'netIncome');
    }, [scenario, historicalInputs]);

    const icSensitivity = useMemo(() => {
        if (!scenario) return null;
        const revGrowthBase = getBaseValue(scenario.assumptions as unknown as Record<string, unknown>, 'revenueGrowthRate');
        const debtRateBase = getBaseValue(scenario.assumptions as unknown as Record<string, unknown>, 'interestRateOnDebt');
        const revRange = [revGrowthBase - 0.04, revGrowthBase - 0.02, revGrowthBase, revGrowthBase + 0.02, revGrowthBase + 0.04];
        const debtRange = [0.16, 0.18, 0.20, 0.22, 0.25];
        return twoWaySensitivity(scenario.assumptions, historicalInputs, 'revenueGrowthRate', revRange, 'interestRateOnDebt', debtRange, 'interestCoverage');
    }, [scenario, historicalInputs]);

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

    const card = { background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border-color)', marginBottom: 16 };

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>📈 Sensitivity Analysis</h1>

            {/* One-Way Analysis */}
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
                <div className="metric-card" style={{ marginBottom: 24 }}>
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

            {/* Two-Way Table 1: NI Sensitivity */}
            {niSensitivity && (
                <div style={card}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                        Net Income Sensitivity (Revenue Growth × COGS %)
                    </h3>
                    <HeatMapTable
                        matrix={niSensitivity.matrix}
                        rowValues={niSensitivity.row1Values}
                        colValues={niSensitivity.row2Values}
                        rowLabel="Rev Growth ↓"
                        colLabel="COGS % →"
                        baseRow={2}
                        baseCol={2}
                        currency={currency}
                        formatVal={(v) => formatCurrency(v, currency, true)}
                        colorMode="absolute"
                    />
                </div>
            )}

            {/* Two-Way Table 2: Interest Coverage Sensitivity */}
            {icSensitivity && (
                <div style={card}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                        Interest Coverage Sensitivity (Revenue Growth × Debt Rate)
                    </h3>
                    <HeatMapTable
                        matrix={icSensitivity.matrix}
                        rowValues={icSensitivity.row1Values}
                        colValues={icSensitivity.row2Values}
                        rowLabel="Rev Growth ↓"
                        colLabel="Debt Rate →"
                        baseRow={2}
                        baseCol={3}
                        currency={currency}
                        formatVal={(v) => v.toFixed(1) + 'x'}
                        colorMode="coverage"
                    />
                </div>
            )}
        </div>
    );
}

function HeatMapTable({ matrix, rowValues, colValues, rowLabel, colLabel, baseRow, baseCol, currency, formatVal, colorMode }: {
    matrix: number[][]; rowValues: number[]; colValues: number[];
    rowLabel: string; colLabel: string; baseRow: number; baseCol: number;
    currency: string; formatVal: (v: number) => string;
    colorMode: 'absolute' | 'coverage';
}) {
    const baseValue = matrix[baseRow]?.[baseCol] ?? 0;

    const getCellColor = (v: number, ri: number, ci: number) => {
        if (ri === baseRow && ci === baseCol) return 'rgba(251, 191, 36, 0.2)';
        if (colorMode === 'coverage') {
            if (v >= 3) return 'rgba(52, 211, 153, 0.15)';
            if (v >= 2) return 'rgba(52, 211, 153, 0.08)';
            if (v >= 1.5) return 'transparent';
            return 'rgba(244, 63, 94, 0.15)';
        }
        if (v > baseValue * 1.05) return 'rgba(52, 211, 153, 0.1)';
        if (v < baseValue * 0.95) return 'rgba(244, 63, 94, 0.1)';
        return 'transparent';
    };

    const getTextColor = (v: number, ri: number, ci: number) => {
        if (ri === baseRow && ci === baseCol) return '#fbbf24';
        if (colorMode === 'coverage') {
            if (v < 1.5) return '#f43f5e';
            if (v >= 3) return '#34d399';
            return 'var(--text-primary)';
        }
        if (v > baseValue * 1.05) return '#34d399';
        if (v < baseValue * 0.95) return '#f43f5e';
        return 'var(--text-primary)';
    };

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: 8, textAlign: 'left', color: 'var(--text-muted)', fontSize: 11 }}>{rowLabel} / {colLabel}</th>
                    {colValues.map((c, i) => (
                        <th key={i} style={{ padding: 8, textAlign: 'right', color: i === baseCol ? '#fbbf24' : 'var(--text-muted)' }}>
                            {formatPercent(c)}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {matrix.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: 8, fontWeight: ri === baseRow ? 700 : 400, color: ri === baseRow ? '#fbbf24' : 'var(--text-primary)' }}>
                            {formatPercent(rowValues[ri])}
                        </td>
                        {row.map((v, ci) => (
                            <td key={ci} style={{
                                padding: 8, textAlign: 'right',
                                fontWeight: (ri === baseRow && ci === baseCol) ? 700 : 400,
                                color: getTextColor(v, ri, ci),
                                background: getCellColor(v, ri, ci),
                            }}>
                                {formatVal(v)}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function getBaseValue(assumptions: Record<string, unknown>, key: string): number {
    const val = assumptions[key];
    if (Array.isArray(val)) return val[0] as number;
    return val as number;
}
