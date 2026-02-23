// ============================================================
// Scenario Type Definitions
// ============================================================

import { AssumptionSet, HistoricalInputs } from './assumptions';
import { ModelResults } from './financial';

export type ScenarioType = 'base' | 'optimistic' | 'conservative' | 'custom';

export interface Scenario {
    id: string;
    name: string;
    type: ScenarioType;
    description: string;
    assumptions: AssumptionSet;
    results: ModelResults | null;
    createdAt: string;
    updatedAt: string;
}

export interface ModelState {
    // Company info
    companyName: string;
    ticker: string;
    industry: string;
    currency: string;
    country: string;
    fiscalYearEnd: string;
    valuationDate: string;

    // Historical data
    historicalInputs: HistoricalInputs;

    // Scenarios
    scenarios: Scenario[];
    activeScenarioId: string;

    // UI State
    isDarkMode: boolean;
    activeTab: 'dashboard' | 'model' | 'income' | 'balance' | 'cashflow' | 'scenarios' | 'sensitivity' | 'montecarlo' | 'import' | 'historicaldata' | 'working-capital' | 'depreciation' | 'debt-schedule' | 'validation' | 'company-settings' | 'dcf' | 'valuation' | 'ratios' | 'cbe-metrics';
    isCalculating: boolean;
    lastSaved: string | null;

    // Undo/Redo
    undoStack: UndoEntry[];
    redoStack: UndoEntry[];

    // Error state
    errors: ModelError[];
    warnings: ModelWarning[];
}

export interface UndoEntry {
    timestamp: string;
    description: string;
    previousAssumptions: AssumptionSet;
    scenarioId: string;
}

export interface ModelError {
    id: string;
    type: 'balance' | 'convergence' | 'validation' | 'integration';
    message: string;
    field?: string;
    severity: 'error' | 'warning';
}

export interface ModelWarning {
    id: string;
    type: 'unrealistic' | 'missing' | 'inconsistent';
    message: string;
    field?: string;
}

// Sensitivity analysis types
export interface SensitivityConfig {
    variable: string;
    label: string;
    baseValue: number;
    range: number[];
    outputMetric: OutputMetric;
}

export interface TwoWaySensitivityConfig {
    variable1: SensitivityConfig;
    variable2: SensitivityConfig;
    outputMetric: OutputMetric;
}

export type OutputMetric = 'fcf' | 'netIncome' | 'roe' | 'eps' | 'ebitda' | 'revenue' | 'interestCoverage';

export interface SensitivityResult {
    inputValue: number;
    outputValue: number;
}

export interface TwoWaySensitivityResult {
    matrix: number[][];
    row1Values: number[];
    row2Values: number[];
}

// Monte Carlo types
export type DistributionType = 'normal' | 'uniform' | 'triangular' | 'lognormal';

export interface Distribution {
    type: DistributionType;
    params: {
        mean?: number;
        stdDev?: number;
        min?: number;
        max?: number;
        mode?: number;
    };
}

export interface MonteCarloConfig {
    iterations: number;
    variables: Map<string, Distribution>;
    outputMetrics: OutputMetric[];
}

export interface MonteCarloResult {
    metric: OutputMetric;
    values: number[];
    statistics: {
        mean: number;
        median: number;
        stdDev: number;
        p10: number;
        p25: number;
        p50: number;
        p75: number;
        p90: number;
        min: number;
        max: number;
    };
}
