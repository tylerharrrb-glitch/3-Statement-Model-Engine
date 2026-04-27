// ============================================================
// Scenario Manager
// ============================================================

import { v4 as uuidv4 } from 'uuid';
import { Scenario, ScenarioType } from '@/types/scenario';
import { AssumptionSet, getDefaultAssumptions } from '@/types/assumptions';

export function createScenario(
    name: string,
    type: ScenarioType,
    assumptions: AssumptionSet,
    description: string = '',
): Scenario {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        name,
        type,
        description,
        assumptions,
        results: null,
        createdAt: now,
        updatedAt: now,
    };
}

export function createDefaultScenarios(): Scenario[] {
    const base = getDefaultAssumptions();

    // Scenario differences are restricted to revenue/margin/capex drivers (Fix 10).
    // All other structural fields (debt schedule, EOS, intangibles capex, paidUpCapital, etc.)
    // are inherited from `base` so structural assumptions stay synchronized.
    const baseCase: AssumptionSet = {
        ...base,
        revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05],
        cogsPercent: [0.60, 0.60, 0.60, 0.60, 0.60],
        sgaPercent: [0.15, 0.15, 0.15, 0.15, 0.15],
        rdPercent: base.rdPercent,
        capexPercent: [0.05, 0.05, 0.05, 0.05, 0.05],
    };

    const optimistic: AssumptionSet = {
        ...base,
        revenueGrowthRate: [0.15, 0.12, 0.10, 0.09, 0.08],
        cogsPercent: [0.55, 0.54, 0.53, 0.52, 0.51],
        sgaPercent: [0.13, 0.12, 0.12, 0.11, 0.11],
        rdPercent: base.rdPercent,
        capexPercent: [0.06, 0.06, 0.06, 0.06, 0.06],
    };

    const conservative: AssumptionSet = {
        ...base,
        revenueGrowthRate: [0.03, 0.02, 0.02, 0.01, 0.01],
        cogsPercent: [0.65, 0.66, 0.67, 0.67, 0.68],
        sgaPercent: [0.18, 0.19, 0.19, 0.20, 0.20],
        rdPercent: base.rdPercent,
        capexPercent: [0.04, 0.04, 0.04, 0.04, 0.04],
    };

    return [
        createScenario('Base Case', 'base', baseCase, 'Moderate growth with stable margins'),
        createScenario('Optimistic Case', 'optimistic', optimistic, 'High growth with margin expansion'),
        createScenario('Conservative Case', 'conservative', conservative, 'Slow growth with margin pressure'),
    ];
}

