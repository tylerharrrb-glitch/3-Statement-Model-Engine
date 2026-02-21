// ============================================================
// Zustand Store — Global State Management
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelState, Scenario, UndoEntry } from '@/types/scenario';
import { AssumptionSet, getDefaultAssumptions, getDefaultHistoricalInputs, HistoricalInputs } from '@/types/assumptions';
import { ModelResults } from '@/types/financial';
import { EGYPTIAN_TAX_DEFAULTS } from '@/lib/schedules/egyptian-depreciation';
import { createDefaultScenarios, createScenario } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';
import { ScenarioType } from '@/types/scenario';
import { HistoricalDataInput, getDefaultHistoricalData, convertToHistoricalInputs } from '@/types/historical';

interface ModelStore extends ModelState {
    // Historical data (Feature 1: per-year format)
    historicalData: HistoricalDataInput[];

    // Actions
    setCompanyInfo: (name: string, ticker: string, industry: string, currency: string, country?: string, fiscalYearEnd?: string, valuationDate?: string) => void;
    setHistoricalInputs: (inputs: HistoricalInputs) => void;
    setHistoricalData: (data: HistoricalDataInput[]) => void;
    setActiveScenario: (id: string) => void;
    updateAssumption: (path: string, value: number | number[]) => void;
    addScenario: (name: string, type: ScenarioType, assumptions?: AssumptionSet) => void;
    deleteScenario: (id: string) => void;
    duplicateScenario: (id: string, newName: string) => void;
    calculateModel: () => void;
    calculateAllScenarios: () => void;
    toggleDarkMode: () => void;
    setActiveTab: (tab: ModelState['activeTab']) => void;
    undo: () => void;
    redo: () => void;
    resetToDefaults: () => void;
    setCountryPreset: (preset: 'us' | 'egypt' | 'custom') => void;
}

const defaultScenarios = createDefaultScenarios();

export const useModelStore = create<ModelStore>()(
    persist(
        (set, get) => ({
            // Initial state
            companyName: 'Demo Company Inc.',
            ticker: 'DEMO',
            industry: 'Technology',
            currency: 'EGP',
            country: 'Egypt',
            fiscalYearEnd: 'Dec 31',
            valuationDate: 'Dec 31, 2023',
            historicalData: getDefaultHistoricalData(),
            historicalInputs: getDefaultHistoricalInputs(),
            scenarios: defaultScenarios,
            activeScenarioId: defaultScenarios[0].id,
            isDarkMode: true,
            activeTab: 'dashboard',
            isCalculating: false,
            lastSaved: null,
            undoStack: [],
            redoStack: [],
            errors: [],
            warnings: [],

            // Actions
            setCompanyInfo: (name, ticker, industry, currency, country, fiscalYearEnd, valuationDate) => {
                set({
                    companyName: name,
                    ticker,
                    industry,
                    currency,
                    ...(country !== undefined && { country }),
                    ...(fiscalYearEnd !== undefined && { fiscalYearEnd }),
                    ...(valuationDate !== undefined && { valuationDate }),
                });
            },

            setHistoricalInputs: (inputs) => {
                set({ historicalInputs: inputs });
            },

            setHistoricalData: (data) => {
                // Convert per-year format → array format for engine, then recalculate
                const inputs = convertToHistoricalInputs(data);
                set({ historicalData: data, historicalInputs: inputs });
                get().calculateAllScenarios();
            },

            setActiveScenario: (id) => {
                set({ activeScenarioId: id });
            },

            updateAssumption: (path, value) => {
                const state = get();
                const scenarioIndex = state.scenarios.findIndex(s => s.id === state.activeScenarioId);
                if (scenarioIndex === -1) return;

                const scenario = state.scenarios[scenarioIndex];

                // Save to undo stack
                const undoEntry: UndoEntry = {
                    timestamp: new Date().toISOString(),
                    description: `Changed ${path}`,
                    previousAssumptions: { ...scenario.assumptions },
                    scenarioId: scenario.id,
                };

                const updatedAssumptions = { ...scenario.assumptions };

                // Handle array indexing: "revenueGrowthRate[0]"
                const arrayMatch = path.match(/^(\w+)\[(\d+)\]$/);
                if (arrayMatch) {
                    const key = arrayMatch[1] as keyof AssumptionSet;
                    const index = parseInt(arrayMatch[2]);
                    const arr = [...(updatedAssumptions[key] as number[])];
                    arr[index] = value as number;
                    (updatedAssumptions as unknown as Record<string, unknown>)[key] = arr;
                } else {
                    (updatedAssumptions as unknown as Record<string, unknown>)[path] = value;
                }

                const updatedScenarios = [...state.scenarios];
                updatedScenarios[scenarioIndex] = {
                    ...scenario,
                    assumptions: updatedAssumptions,
                    results: null, // invalidate
                    updatedAt: new Date().toISOString(),
                };

                set({
                    scenarios: updatedScenarios,
                    undoStack: [...state.undoStack.slice(-49), undoEntry],
                    redoStack: [],
                });
            },

            addScenario: (name, type, assumptions) => {
                const state = get();
                const newScenario = createScenario(
                    name,
                    type,
                    assumptions ?? getDefaultAssumptions(),
                );
                set({
                    scenarios: [...state.scenarios, newScenario],
                    activeScenarioId: newScenario.id,
                });
            },

            deleteScenario: (id) => {
                const state = get();
                if (state.scenarios.length <= 1) return;
                const filtered = state.scenarios.filter(s => s.id !== id);
                set({
                    scenarios: filtered,
                    activeScenarioId: state.activeScenarioId === id ? filtered[0].id : state.activeScenarioId,
                });
            },

            duplicateScenario: (id, newName) => {
                const state = get();
                const source = state.scenarios.find(s => s.id === id);
                if (!source) return;
                const newScenario = createScenario(
                    newName,
                    'custom',
                    { ...source.assumptions },
                    `Duplicated from ${source.name}`,
                );
                set({
                    scenarios: [...state.scenarios, newScenario],
                    activeScenarioId: newScenario.id,
                });
            },

            calculateModel: () => {
                const state = get();
                const scenario = state.scenarios.find(s => s.id === state.activeScenarioId);
                if (!scenario) return;

                set({ isCalculating: true, errors: [], warnings: [] });

                try {
                    const results = runFullModel(scenario.assumptions, state.historicalInputs);

                    const updatedScenarios = state.scenarios.map(s =>
                        s.id === scenario.id ? { ...s, results, updatedAt: new Date().toISOString() } : s,
                    );

                    // Check for warnings
                    const warnings = [];
                    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
                    if (lastIS.grossMargin > 0.95) {
                        warnings.push({
                            id: 'high-margin',
                            type: 'unrealistic' as const,
                            message: 'Gross margin exceeds 95% - this seems unrealistic',
                            field: 'cogsPercent',
                        });
                    }
                    if (lastIS.netMargin < -0.5) {
                        warnings.push({
                            id: 'neg-margin',
                            type: 'unrealistic' as const,
                            message: 'Net margin is below -50% - check your assumptions',
                            field: 'netMargin',
                        });
                    }

                    set({
                        scenarios: updatedScenarios,
                        isCalculating: false,
                        lastSaved: new Date().toISOString(),
                        warnings,
                    });
                } catch (error) {
                    set({
                        isCalculating: false,
                        errors: [{
                            id: 'calc-error',
                            type: 'convergence',
                            message: error instanceof Error ? error.message : 'Calculation failed',
                            severity: 'error',
                        }],
                    });
                }
            },

            calculateAllScenarios: () => {
                const state = get();
                set({ isCalculating: true, errors: [] });

                // Sync global settings from Base Case to all other scenarios.
                // Tax rate, VAT, fiscal year, etc. are global parameters that
                // should be consistent — they don't vary by scenario.
                const baseScenario = state.scenarios.find(s => s.type === 'base');
                const GLOBAL_KEYS = [
                    'taxRate', 'vatRate', 'enableVAT', 'dividendWithholdingRate',
                    'useEgyptianRates', 'countryPreset', 'fiscalYearPreset', 'fiscalYearEnd',
                    'projectionYears', 'historicalYears',
                ] as const;

                // Compute each scenario INDEPENDENTLY — if one fails, others still succeed
                const updatedScenarios = state.scenarios.map(scenario => {
                    try {
                        // Sync global settings from Base Case
                        const syncedAssumptions = { ...scenario.assumptions };
                        if (baseScenario && scenario.type !== 'base') {
                            for (const key of GLOBAL_KEYS) {
                                if (baseScenario.assumptions[key] !== undefined) {
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    (syncedAssumptions as any)[key] = baseScenario.assumptions[key];
                                }
                            }
                        }

                        const results = runFullModel(syncedAssumptions, state.historicalInputs);
                        return { ...scenario, assumptions: syncedAssumptions, results, updatedAt: new Date().toISOString() };
                    } catch (error) {
                        console.warn(`Failed to compute scenario '${scenario.name}':`, error);
                        // Keep existing results (if any) for this scenario
                        return scenario;
                    }
                });

                set({
                    scenarios: updatedScenarios,
                    isCalculating: false,
                    lastSaved: new Date().toISOString(),
                });
            },

            toggleDarkMode: () => {
                set(state => ({ isDarkMode: !state.isDarkMode }));
            },

            setActiveTab: (tab) => {
                set({ activeTab: tab });
            },

            undo: () => {
                const state = get();
                if (state.undoStack.length === 0) return;

                const entry = state.undoStack[state.undoStack.length - 1];
                const scenario = state.scenarios.find(s => s.id === entry.scenarioId);
                if (!scenario) return;

                const redoEntry: UndoEntry = {
                    timestamp: new Date().toISOString(),
                    description: `Redo: ${entry.description}`,
                    previousAssumptions: { ...scenario.assumptions },
                    scenarioId: entry.scenarioId,
                };

                const updatedScenarios = state.scenarios.map(s =>
                    s.id === entry.scenarioId
                        ? { ...s, assumptions: entry.previousAssumptions, results: null }
                        : s,
                );

                set({
                    scenarios: updatedScenarios,
                    undoStack: state.undoStack.slice(0, -1),
                    redoStack: [...state.redoStack, redoEntry],
                });
            },

            redo: () => {
                const state = get();
                if (state.redoStack.length === 0) return;

                const entry = state.redoStack[state.redoStack.length - 1];
                const scenario = state.scenarios.find(s => s.id === entry.scenarioId);
                if (!scenario) return;

                const undoEntry: UndoEntry = {
                    timestamp: new Date().toISOString(),
                    description: entry.description,
                    previousAssumptions: { ...scenario.assumptions },
                    scenarioId: entry.scenarioId,
                };

                const updatedScenarios = state.scenarios.map(s =>
                    s.id === entry.scenarioId
                        ? { ...s, assumptions: entry.previousAssumptions, results: null }
                        : s,
                );

                set({
                    scenarios: updatedScenarios,
                    redoStack: state.redoStack.slice(0, -1),
                    undoStack: [...state.undoStack, undoEntry],
                });
            },

            resetToDefaults: () => {
                const defaults = createDefaultScenarios();
                const defaultHistData = getDefaultHistoricalData();
                set({
                    historicalData: defaultHistData,
                    historicalInputs: getDefaultHistoricalInputs(),
                    scenarios: defaults,
                    activeScenarioId: defaults[0].id,
                    undoStack: [],
                    redoStack: [],
                    errors: [],
                    warnings: [],
                });
            },

            setCountryPreset: (preset) => {
                const state = get();

                // Apply country preset to ALL scenarios — not just the active one.
                // Tax rate, VAT, and fiscal year settings are global parameters
                // that should be consistent across all scenarios.
                const updatedScenarios = state.scenarios.map(scenario => {
                    const updatedAssumptions = { ...scenario.assumptions };

                    if (preset === 'egypt') {
                        updatedAssumptions.countryPreset = 'egypt';
                        updatedAssumptions.taxRate = updatedAssumptions.taxRate.map(() => EGYPTIAN_TAX_DEFAULTS.corporateTaxRate);
                        updatedAssumptions.vatRate = EGYPTIAN_TAX_DEFAULTS.vatRate;
                        updatedAssumptions.enableVAT = true;
                        updatedAssumptions.dividendWithholdingRate = EGYPTIAN_TAX_DEFAULTS.dividendWithholdingRate;
                        updatedAssumptions.useEgyptianRates = true;
                        updatedAssumptions.fiscalYearPreset = 'egyptian-govt';
                        updatedAssumptions.fiscalYearEnd = 6;
                    } else if (preset === 'us') {
                        updatedAssumptions.countryPreset = 'us';
                        updatedAssumptions.taxRate = updatedAssumptions.taxRate.map(() => 0.25);
                        updatedAssumptions.vatRate = 0;
                        updatedAssumptions.enableVAT = false;
                        updatedAssumptions.dividendWithholdingRate = 0;
                        updatedAssumptions.useEgyptianRates = false;
                        updatedAssumptions.fiscalYearPreset = 'calendar';
                        updatedAssumptions.fiscalYearEnd = 12;
                    } else {
                        updatedAssumptions.countryPreset = 'custom';
                    }

                    return {
                        ...scenario,
                        assumptions: updatedAssumptions,
                        results: null, // Invalidate results so they get recomputed
                        updatedAt: new Date().toISOString(),
                    };
                });

                set({ scenarios: updatedScenarios });
            },
        }),
        {
            name: 'financial-model-storage',
            partialize: (state) => ({
                companyName: state.companyName,
                ticker: state.ticker,
                industry: state.industry,
                currency: state.currency,
                country: state.country,
                fiscalYearEnd: state.fiscalYearEnd,
                valuationDate: state.valuationDate,
                historicalData: state.historicalData,
                historicalInputs: state.historicalInputs,
                scenarios: state.scenarios,
                activeScenarioId: state.activeScenarioId,
                isDarkMode: state.isDarkMode,
            }),
        },
    ),
);
