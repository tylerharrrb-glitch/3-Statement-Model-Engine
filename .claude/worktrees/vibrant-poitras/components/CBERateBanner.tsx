'use client';

import { useModelStore } from '@/lib/store';

/**
 * CBE Rate Live Banner (FIX-10)
 * Displays the latest CBE Monetary Policy Committee rates below the Navbar.
 * April 2, 2026: Rates on hold — Deposit 19.00% | Lending 20.00% | Discount 19.50%
 */
export default function CBERateBanner() {
    const { scenarios, activeScenarioId, calculateAllScenarios } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const currentCBE = scenario?.assumptions.cbeRate ?? 0.195;
    const isStale = Math.abs(currentCBE - 0.195) > 0.001;

    const handleSync = () => {
        // Update CBE rate across all scenarios and recalculate
        const state = useModelStore.getState();
        const updated = state.scenarios.map(s => ({
            ...s,
            assumptions: {
                ...s.assumptions,
                cbeRate: 0.195,
                riskFreeRate: 0.235,
                interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16],
                interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12],
            },
            results: null,
        }));
        useModelStore.setState({ scenarios: updated });
        setTimeout(() => calculateAllScenarios(), 50);
    };

    return (
        <div style={{
            background: isStale ? 'rgba(245, 158, 11, 0.08)' : 'rgba(52, 211, 153, 0.06)',
            borderBottom: `1px solid ${isStale ? 'rgba(245, 158, 11, 0.2)' : 'rgba(52, 211, 153, 0.12)'}`,
            padding: '6px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            fontSize: 11,
            fontFamily: 'var(--ff-mono)',
            color: isStale ? '#f59e0b' : 'var(--text-muted)',
        }}>
            <span style={{ fontWeight: 600 }}>
                📊 CBE Rate: Deposit 19.00% | Lending 20.00% | Discount 19.50%
            </span>
            <span style={{ color: 'var(--text-muted)' }}>
                April 2, 2026 MPC — Rates on hold
            </span>
            {isStale && (
                <button
                    onClick={handleSync}
                    style={{
                        fontSize: 10,
                        padding: '2px 10px',
                        borderRadius: 4,
                        background: '#f59e0b',
                        color: '#1a1a2e',
                        border: 'none',
                        cursor: 'pointer',
                        fontWeight: 600,
                    }}
                >
                    ⚡ Sync Model to Latest
                </button>
            )}
            {!isStale && (
                <span style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    borderRadius: 8,
                    background: 'rgba(52, 211, 153, 0.12)',
                    color: '#34d399',
                    fontWeight: 600,
                }}>
                    ✓ IN SYNC
                </span>
            )}
        </div>
    );
}
