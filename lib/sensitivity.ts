// ============================================================
// Sensitivity Analysis
// ============================================================

import { AssumptionSet, HistoricalInputs } from '@/types/assumptions';
import { SensitivityResult, TwoWaySensitivityResult, OutputMetric } from '@/types/scenario';
import { runFullModel } from './engines/integrator';

function getOutputValue(
    assumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
    metric: OutputMetric,
): number {
    const results = runFullModel(assumptions, historicalInputs);
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];

    switch (metric) {
        case 'revenue': return lastIS.revenue;
        case 'ebitda': return lastIS.ebitda;
        case 'netIncome': return lastIS.netIncome;
        case 'eps': return lastIS.eps;
        case 'fcf': return lastCF.freeCashFlow;
        case 'roe': return lastBS.totalEquity !== 0 ? lastIS.netIncome / lastBS.totalEquity : 0;
        default: return lastIS.netIncome;
    }
}

export function oneWaySensitivity(
    baseAssumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
    variable: string,
    range: number[],
    outputMetric: OutputMetric,
): SensitivityResult[] {
    return range.map(value => {
        const modified = { ...baseAssumptions };

        // Handle array assumptions (apply to all years)
        const key = variable as keyof AssumptionSet;
        const currentVal = modified[key];
        if (Array.isArray(currentVal)) {
            (modified as Record<string, unknown>)[key] = (currentVal as number[]).map(() => value);
        } else {
            (modified as Record<string, unknown>)[key] = value;
        }

        const outputValue = getOutputValue(modified, historicalInputs, outputMetric);
        return { inputValue: value, outputValue };
    });
}

export function twoWaySensitivity(
    baseAssumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
    variable1: string,
    range1: number[],
    variable2: string,
    range2: number[],
    outputMetric: OutputMetric,
): TwoWaySensitivityResult {
    const matrix: number[][] = [];

    for (const val1 of range1) {
        const row: number[] = [];
        for (const val2 of range2) {
            const modified = { ...baseAssumptions };

            // Set variable 1
            const key1 = variable1 as keyof AssumptionSet;
            const curr1 = modified[key1];
            if (Array.isArray(curr1)) {
                (modified as Record<string, unknown>)[key1] = (curr1 as number[]).map(() => val1);
            } else {
                (modified as Record<string, unknown>)[key1] = val1;
            }

            // Set variable 2
            const key2 = variable2 as keyof AssumptionSet;
            const curr2 = modified[key2];
            if (Array.isArray(curr2)) {
                (modified as Record<string, unknown>)[key2] = (curr2 as number[]).map(() => val2);
            } else {
                (modified as Record<string, unknown>)[key2] = val2;
            }

            row.push(getOutputValue(modified, historicalInputs, outputMetric));
        }
        matrix.push(row);
    }

    return {
        matrix,
        row1Values: range1,
        row2Values: range2,
    };
}

// Generate a range of values centered on a base value
export function generateRange(baseValue: number, steps: number = 5, stepSize: number = 0.01): number[] {
    const result: number[] = [];
    for (let i = -steps; i <= steps; i++) {
        result.push(baseValue + i * stepSize);
    }
    return result;
}
