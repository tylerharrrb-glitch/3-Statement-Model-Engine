'use client';

import React, { useState } from 'react';
import { useModelStore } from '@/lib/store';
import ScenarioComparisonModal from './ScenarioComparisonModal';

// ============================================================
// ScenarioSelector — Sticky tab bar (Base / Optimistic / Conservative)
// ============================================================

export default function ScenarioSelector() {
    const { scenarios, activeScenarioId, setActiveScenario, calculateAllScenarios, isCalculating } = useModelStore();
    const [showComparison, setShowComparison] = useState(false);

    return (
        <>
            <div className="scenario-bar">
                <div className="scenario-bar-inner">
                    <div className="scenario-tabs">
                        {scenarios.map(s => {
                            const isActive = s.id === activeScenarioId;
                            const typeClass = s.type === 'optimistic' ? 'optimistic' : s.type === 'conservative' ? 'conservative' : '';
                            return (
                                <button
                                    key={s.id}
                                    className={`scenario-tab ${typeClass} ${isActive ? 'active' : ''}`}
                                    onClick={() => setActiveScenario(s.id)}
                                    aria-label={`Switch to ${s.name} scenario`}
                                    aria-current={isActive ? 'true' : undefined}
                                >
                                    {s.name}
                                </button>
                            );
                        })}
                    </div>
                    <div className="scenario-bar-actions">
                        <button
                            className="btn-scenario"
                            onClick={calculateAllScenarios}
                            disabled={isCalculating}
                            style={{ padding: '8px 16px', fontSize: '.72rem' }}
                        >
                            {isCalculating ? '⏳ Calculating...' : '▶ Calculate All'}
                        </button>
                        <button
                            className="btn-outline"
                            onClick={() => setShowComparison(true)}
                            style={{ padding: '8px 16px', fontSize: '.72rem' }}
                        >
                            Compare
                        </button>
                    </div>
                </div>
            </div>

            {/* Comparison Modal */}
            {showComparison && (
                <ScenarioComparisonModal onClose={() => setShowComparison(false)} />
            )}
        </>
    );
}
