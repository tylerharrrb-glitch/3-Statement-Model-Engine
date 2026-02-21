// ============================================================
// Monte Carlo Simulation
// ============================================================

import { AssumptionSet, HistoricalInputs } from '@/types/assumptions';
import { MonteCarloResult, MonteCarloConfig, Distribution, OutputMetric } from '@/types/scenario';
import { runFullModel } from './engines/integrator';

// Random number generators for different distributions
function sampleNormal(mean: number, stdDev: number): number {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * z;
}

function sampleUniform(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

function sampleTriangular(min: number, max: number, mode: number): number {
    const u = Math.random();
    const fc = (mode - min) / (max - min);
    if (u < fc) {
        return min + Math.sqrt(u * (max - min) * (mode - min));
    } else {
        return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
    }
}

function sampleLognormal(mean: number, stdDev: number): number {
    return Math.exp(sampleNormal(mean, stdDev));
}

function sampleDistribution(dist: Distribution): number {
    switch (dist.type) {
        case 'normal':
            return sampleNormal(dist.params.mean ?? 0, dist.params.stdDev ?? 1);
        case 'uniform':
            return sampleUniform(dist.params.min ?? 0, dist.params.max ?? 1);
        case 'triangular':
            return sampleTriangular(
                dist.params.min ?? 0, dist.params.max ?? 1, dist.params.mode ?? 0.5,
            );
        case 'lognormal':
            return sampleLognormal(dist.params.mean ?? 0, dist.params.stdDev ?? 1);
        default:
            return dist.params.mean ?? 0;
    }
}

function getMetricValue(
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

function calculatePercentile(sorted: number[], p: number): number {
    const index = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function runMonteCarloSimulation(
    baseAssumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
    config: MonteCarloConfig,
): MonteCarloResult[] {
    const metricValues: Record<string, number[]> = {};
    for (const metric of config.outputMetrics) {
        metricValues[metric] = [];
    }

    for (let i = 0; i < config.iterations; i++) {
        // Sample from distributions and modify assumptions
        const sampledAssumptions = { ...baseAssumptions };

        config.variables.forEach((dist, variable) => {
            const key = variable as keyof AssumptionSet;
            const current = sampledAssumptions[key];
            const sampled = sampleDistribution(dist);

            if (Array.isArray(current)) {
                // Apply sampled value as a multiplier or direct replacement
                (sampledAssumptions as unknown as Record<string, unknown>)[key] =
                    (current as number[]).map(() => sampled);
            } else {
                (sampledAssumptions as unknown as Record<string, unknown>)[key] = sampled;
            }
        });

        // Calculate metrics
        try {
            for (const metric of config.outputMetrics) {
                const value = getMetricValue(sampledAssumptions, historicalInputs, metric);
                metricValues[metric].push(value);
            }
        } catch {
            // Skip failed iterations (e.g., convergence failures)
            continue;
        }
    }

    // Calculate statistics for each metric
    return config.outputMetrics.map(metric => {
        const values = metricValues[metric];
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

        return {
            metric,
            values,
            statistics: {
                mean,
                median: calculatePercentile(sorted, 50),
                stdDev: Math.sqrt(variance),
                p10: calculatePercentile(sorted, 10),
                p25: calculatePercentile(sorted, 25),
                p50: calculatePercentile(sorted, 50),
                p75: calculatePercentile(sorted, 75),
                p90: calculatePercentile(sorted, 90),
                min: sorted[0] ?? 0,
                max: sorted[sorted.length - 1] ?? 0,
            },
        };
    });
}

// Create a default Monte Carlo config
export function getDefaultMonteCarloConfig(): MonteCarloConfig {
    const variables = new Map<string, Distribution>();

    variables.set('revenueGrowthRate', {
        type: 'normal',
        params: { mean: 0.07, stdDev: 0.03 },
    });

    variables.set('cogsPercent', {
        type: 'normal',
        params: { mean: 0.60, stdDev: 0.03 },
    });

    variables.set('interestRate', {
        type: 'uniform',
        params: { min: 0.03, max: 0.08 },
    });

    return {
        iterations: 10_000,
        variables,
        outputMetrics: ['netIncome', 'fcf', 'eps'],
    };
}
