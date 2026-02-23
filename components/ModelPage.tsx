'use client';
import { useState } from 'react';
import { useModelStore } from '@/lib/store';
import EgyptianSettings from './EgyptianSettings';

interface AssumptionItem {
    label: string;
    path: string;
    type: 'single' | 'array';
    pct?: boolean;
}

const assumptionGroups: { title: string; items: AssumptionItem[] }[] = [
    {
        title: 'Revenue', items: [
            { label: 'Base Revenue ($)', path: 'revenueBase', type: 'single' as const },
            { label: 'Revenue Growth (%)', path: 'revenueGrowthRate', type: 'array' as const, pct: true },
        ]
    },
    {
        title: 'Margins (% of Revenue)', items: [
            { label: 'COGS %', path: 'cogsPercent', type: 'array' as const, pct: true },
            { label: 'SG&A %', path: 'sgaPercent', type: 'array' as const, pct: true },
            { label: 'R&D %', path: 'rdPercent', type: 'array' as const, pct: true },
            { label: 'Other OpEx %', path: 'otherOpexPercent', type: 'array' as const, pct: true },
        ]
    },
    {
        title: 'Working Capital (Days)', items: [
            { label: 'DSO', path: 'dso', type: 'array' as const },
            { label: 'DIO', path: 'dio', type: 'array' as const },
            { label: 'DPO', path: 'dpo', type: 'array' as const },
        ]
    },
    {
        title: 'CapEx & Depreciation', items: [
            { label: 'CapEx % Rev', path: 'capexPercent', type: 'array' as const, pct: true },
            { label: 'Dep Rate %', path: 'depreciationRate', type: 'array' as const, pct: true },
            { label: 'Amort ($)', path: 'amortizationAmount', type: 'array' as const },
        ]
    },
    {
        title: 'Debt & Tax', items: [
            { label: 'Interest Rate (Debt)', path: 'interestRateOnDebt', type: 'array' as const, pct: true },
            { label: 'Interest Rate (Cash)', path: 'interestRateOnCash', type: 'array' as const, pct: true },
            { label: 'Tax Rate', path: 'taxRate', type: 'array' as const, pct: true },
            { label: 'Dividend Payout', path: 'dividendPayoutRatio', type: 'array' as const, pct: true },
        ]
    },
    {
        title: 'DCF & Valuation', items: [
            { label: 'CBE Rate', path: 'cbeRate', type: 'single' as const, pct: true },
            { label: 'Terminal Growth', path: 'terminalGrowthRate', type: 'single' as const, pct: true },
            { label: 'Equity Risk Premium', path: 'equityRiskPremium', type: 'single' as const, pct: true },
            { label: 'Beta', path: 'beta', type: 'single' as const },
        ]
    },
];

export default function ModelPage() {
    const { scenarios, activeScenarioId, updateAssumption, calculateModel, isCalculating } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const [openGroup, setOpenGroup] = useState(0);
    if (!scenario) return null;

    const assumptions = scenario.assumptions;
    const years = assumptions.projectionYears;

    const handleChange = (path: string, value: string, index?: number) => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        const item = assumptionGroups.flatMap(g => g.items).find((it: AssumptionItem) => it.path === path);
        const actualVal = item?.pct ? num / 100 : num;
        if (index !== undefined) {
            updateAssumption(`${path}[${index}]`, actualVal);
        } else {
            updateAssumption(path, actualVal);
        }
    };

    const getValue = (path: string): unknown => {
        return (assumptions as unknown as Record<string, unknown>)[path];
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>⚙️ Model Assumptions — {scenario.name}</h1>
                <button className="btn-primary" onClick={calculateModel} disabled={isCalculating}>
                    {isCalculating ? '⏳ Calculating...' : '▶ Recalculate'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
                {assumptionGroups.map((g, i) => (
                    <button key={i} className={`tab-item ${openGroup === i ? 'active' : ''}`} onClick={() => setOpenGroup(i)}>{g.title}</button>
                ))}
            </div>

            <div className="metric-card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent-blue)' }}>
                    {assumptionGroups[openGroup].title}
                </h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Assumption</th>
                            {Array.from({ length: years }, (_, i) => (
                                <th key={i}>Year {i + 1} ({assumptions.startYear + i}E)</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {assumptionGroups[openGroup].items.map(item => (
                            <tr key={item.path}>
                                <td>{item.label}</td>
                                {item.type === 'array' ? (
                                    Array.from({ length: years }, (_, i) => {
                                        const arr = getValue(item.path) as number[] | undefined;
                                        const rawVal = arr?.[i] ?? 0;
                                        const displayVal = item.pct ? (rawVal * 100).toFixed(1) : rawVal.toFixed(0);
                                        return (
                                            <td key={i}>
                                                <input
                                                    className="fin-input"
                                                    type="number"
                                                    step={item.pct ? '0.1' : '1'}
                                                    value={displayVal}
                                                    onChange={e => handleChange(item.path, e.target.value, i)}
                                                    style={{ width: 90, textAlign: 'right' }}
                                                />
                                            </td>
                                        );
                                    })
                                ) : (
                                    <td colSpan={years}>
                                        <input
                                            className="fin-input"
                                            type="number"
                                            step={item.pct ? '0.1' : '1000'}
                                            value={item.pct ? (((getValue(item.path) as number | undefined) ?? 0) * 100).toFixed(1) : ((getValue(item.path) as number | undefined) ?? 0).toFixed(0)}
                                            onChange={e => handleChange(item.path, e.target.value)}
                                            style={{ width: 150, textAlign: 'right' }}
                                        />
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Egyptian Market Settings */}
            <EgyptianSettings />
        </div>
    );
}
