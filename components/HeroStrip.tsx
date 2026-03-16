'use client';

import { useModelStore } from '@/lib/store';

export default function HeroStrip() {
    const { scenarios, activeScenarioId } = useModelStore();
    const activeScenario = scenarios.find(s => s.id === activeScenarioId);
    const converged = activeScenario?.results?.convergenceInfo.converged;
    const iterations = activeScenario?.results?.convergenceInfo.iterations;

    return (
        <div className="hero-strip">
            <div className="hero-inner">
                <div className="hero-label">
                    FINANCIAL MODELING · 5-YEAR PROJECTION
                </div>
                <h1 className="hero-title">3-Statement Model Engine</h1>
                <p className="hero-subtitle">
                    Income Statement · Balance Sheet · Cash Flow · Circular Reference Solver
                </p>
                <div className="hero-badges">
                    <span className="hero-badge">5-Year Projection</span>
                    <span className="hero-badge">3 Scenarios</span>
                    <span className="hero-badge">Iterative Solver</span>
                    <span className="hero-badge">Full Balance Sheet Reconciliation</span>
                    {activeScenario?.results && (
                        <span className={`solver-badge ${converged ? '' : 'error'}`}>
                            <span className="dot" />
                            <span>
                                {converged
                                    ? `Iterative Solver Active — Converged (${iterations} iter)`
                                    : 'Solver — Not Converged'}
                            </span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
