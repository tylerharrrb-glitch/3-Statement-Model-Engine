// ============================================================
// Scenario Definitions (Feature 3)
// ============================================================
// Three pre-defined scenarios with instant toggle switching.
// ============================================================

import { AssumptionSet } from '@/types/assumptions';

export enum ScenarioEnum {
    BASE = 'base',
    OPTIMISTIC = 'optimistic',
    CONSERVATIVE = 'conservative',
}

export interface ScenarioDefinition {
    type: ScenarioEnum;
    name: string;
    emoji: string;
    description: string;
    color: string;
    assumptions: Partial<AssumptionSet>;
}

export const SCENARIOS: Record<ScenarioEnum, ScenarioDefinition> = {
    [ScenarioEnum.BASE]: {
        type: ScenarioEnum.BASE,
        name: 'Base Case',
        emoji: '📊',
        description: 'Moderate growth with stable margins',
        color: '#2563eb',
        assumptions: {
            revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05],
            cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60],
            sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15],
            rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
            capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
        },
    },

    [ScenarioEnum.OPTIMISTIC]: {
        type: ScenarioEnum.OPTIMISTIC,
        name: 'Optimistic Case',
        emoji: '🚀',
        description: 'High growth with margin expansion',
        color: '#16a34a',
        assumptions: {
            revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08],
            cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51],
            sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11],
            rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
            capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
            interestRate: 0.05,
            dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30],
        },
    },

    [ScenarioEnum.CONSERVATIVE]: {
        type: ScenarioEnum.CONSERVATIVE,
        name: 'Conservative Case',
        emoji: '📉',
        description: 'Slow growth with margin pressure',
        color: '#dc2626',
        assumptions: {
            revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01],
            cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68],
            sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20],
            rdPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
            capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
            interestRate: 0.05,
            dividendPayoutRatio: [0.30, 0.30, 0.30, 0.30, 0.30],
        },
    },
};

/**
 * Get a full AssumptionSet for a scenario by merging scenario overrides
 * onto the provided base assumptions.
 */
export function getScenarioAssumptions(
    baseAssumptions: AssumptionSet,
    scenarioType: ScenarioEnum,
): AssumptionSet {
    return {
        ...baseAssumptions,
        ...SCENARIOS[scenarioType].assumptions,
    };
}
