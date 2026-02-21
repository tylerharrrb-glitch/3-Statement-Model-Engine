'use client';

import React, { useState } from 'react';
import { useModelStore } from '@/lib/store';
import { SCENARIOS, ScenarioEnum } from '@/lib/scenarios';
import { formatPercent } from '@/lib/utils';
import ScenarioComparisonModal from './ScenarioComparisonModal';

// ============================================================
// ScenarioSelector — Dropdown + assumption cards + compare button
// Feature 3: Three Scenario Toggle
// ============================================================

export default function ScenarioSelector() {
    const { scenarios, activeScenarioId, setActiveScenario, calculateAllScenarios, isCalculating } = useModelStore();
    const [showComparison, setShowComparison] = useState(false);

    const activeScenario = scenarios.find(s => s.id === activeScenarioId);
    const activeType = activeScenario?.type ?? 'base';

    // Map from existing scenario type to SCENARIOS definition
    const scenarioDef = SCENARIOS[activeType as ScenarioEnum] ?? SCENARIOS[ScenarioEnum.BASE];

    // Key assumption previews from the active scenario's actual assumptions
    const assumptions = activeScenario?.assumptions;
    const previewCards = assumptions ? [
        { label: 'Revenue Growth (Yr 1)', value: formatPercent(assumptions.revenueGrowthRate[0]) },
        { label: 'COGS % (Yr 1)', value: formatPercent(assumptions.cogsPercent[0]) },
        { label: 'SG&A % (Yr 1)', value: formatPercent(assumptions.sgaPercent[0]) },
        { label: 'CapEx % (Yr 1)', value: formatPercent(assumptions.capexPercent[0]) },
    ] : [];

    return (
        <>
            <div className="metric-card" style={{ marginBottom: 20, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    {/* Left: Label + Dropdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            Active Scenario:
                        </label>
                        <select
                            className="fin-select"
                            style={{ minWidth: 200, padding: '8px 12px', fontSize: 14, fontWeight: 500 }}
                            value={activeScenarioId}
                            onChange={(e) => setActiveScenario(e.target.value)}
                        >
                            {scenarios.map(s => {
                                const def = SCENARIOS[s.type as ScenarioEnum];
                                const emoji = def?.emoji ?? '📋';
                                return (
                                    <option key={s.id} value={s.id}>
                                        {emoji} {s.name}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    {/* Right: Buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn-primary"
                            onClick={calculateAllScenarios}
                            disabled={isCalculating}
                            style={{ padding: '8px 16px', fontSize: 13 }}
                        >
                            {isCalculating ? '⏳ Calculating...' : '▶ Calculate All'}
                        </button>
                        <button
                            className="btn-secondary"
                            onClick={() => setShowComparison(true)}
                            style={{ padding: '8px 16px', fontSize: 13 }}
                        >
                            📊 Compare All Scenarios
                        </button>
                    </div>
                </div>

                {/* Description */}
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    {scenarioDef.emoji} {scenarioDef.description}
                </div>

                {/* Assumption Preview Cards */}
                {previewCards.length > 0 && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 10,
                        marginTop: 12,
                    }}>
                        {previewCards.map(card => (
                            <div key={card.label} style={{
                                padding: '10px 12px',
                                background: 'var(--bg-tertiary, rgba(255,255,255,0.04))',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                            }}>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    {card.label}
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: scenarioDef.color }}>
                                    {card.value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Comparison Modal */}
            {showComparison && (
                <ScenarioComparisonModal onClose={() => setShowComparison(false)} />
            )}
        </>
    );
}
