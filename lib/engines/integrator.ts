// ============================================================
// Cross-Statement Integration Engine
// ============================================================
// This is the master orchestrator that runs the full 3-statement
// model across all projection periods with circular reference
// resolution at each step.
// ============================================================

import { IncomeStatement, BalanceSheet, CashFlowStatement, ModelResults, IntegrationChecks } from '@/types/financial';
import { AssumptionSet, HistoricalInputs } from '@/types/assumptions';
import { buildHistoricalIncomeStatements } from './income-statement';
import { buildHistoricalBalanceSheets } from './balance-sheet';
import { buildHistoricalCashFlows } from './cash-flow';
import { resolveCircularReferences, validateIntegration } from './circular-resolver';
import { calculateFinancialRatios } from '@/lib/ratios';

export function runFullModel(
    assumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
): ModelResults {
    // ── BUILD HISTORICAL STATEMENTS ─────────────────────
    const historicalIS = buildHistoricalIncomeStatements(
        historicalInputs.periods,
        historicalInputs,
    );

    const historicalBS = buildHistoricalBalanceSheets(
        historicalInputs.periods,
        historicalInputs,
    );

    const historicalCF = buildHistoricalCashFlows(historicalIS, historicalBS);

    // ── PROJECTED STATEMENTS ────────────────────────────
    const projectedIS: IncomeStatement[] = [];
    const projectedBS: BalanceSheet[] = [];
    const projectedCF: CashFlowStatement[] = [];
    const integrationChecks: IntegrationChecks[] = [];

    let totalIterations = 0;
    let maxDelta = 0;
    let allConverged = true;

    for (let yr = 0; yr < assumptions.projectionYears; yr++) {
        // Get previous period statements
        const prevIS = yr === 0
            ? historicalIS[historicalIS.length - 1]
            : projectedIS[yr - 1];
        const prevBS = yr === 0
            ? historicalBS[historicalBS.length - 1]
            : projectedBS[yr - 1];

        // Resolve circular references for this period
        const result = resolveCircularReferences(
            assumptions,
            yr,
            prevIS,
            prevBS,
        );

        projectedIS.push(result.incomeStatement);
        projectedBS.push(result.balanceSheet);
        projectedCF.push(result.cashFlow);

        // Validate integration
        const checks = validateIntegration(
            result.incomeStatement,
            result.balanceSheet,
            result.cashFlow,
            prevBS,
        );
        integrationChecks.push(checks);

        totalIterations += result.iterations;
        maxDelta = Math.max(maxDelta, result.finalDelta);
        if (!result.converged) allConverged = false;
    }

    // ── COMBINE HISTORICAL + PROJECTED ──────────────────
    const allIS = [...historicalIS, ...projectedIS];
    const allBS = [...historicalBS, ...projectedBS];
    const allCF = [...historicalCF, ...projectedCF];

    // ── CALCULATE RATIOS ────────────────────────────────
    const ratios = allIS.map((is, i) => {
        const bs = allBS[i];
        const prevBS = i > 0 ? allBS[i - 1] : bs;
        return calculateFinancialRatios(is, bs, prevBS);
    });

    return {
        incomeStatements: allIS,
        balanceSheets: allBS,
        cashFlowStatements: allCF,
        ratios,
        integrationChecks,
        convergenceInfo: {
            converged: allConverged,
            iterations: totalIterations,
            finalDelta: maxDelta,
        },
    };
}

// Get a summary of key metrics from model results
export function getModelSummary(results: ModelResults) {
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];

    const projectedIS = results.incomeStatements.filter(s => s.periodType === 'projected');
    const projectedCF = results.cashFlowStatements.filter(s => s.periodType === 'projected');

    return {
        // Latest period
        revenue: lastIS.revenue,
        ebitda: lastIS.ebitda,
        netIncome: lastIS.netIncome,
        eps: lastIS.eps,
        freeCashFlow: lastCF.freeCashFlow,
        totalAssets: lastBS.totalAssets,
        totalDebt: lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD,
        totalEquity: lastBS.totalEquity,
        cash: lastBS.cash,
        isBalanced: lastBS.isBalanced,

        // Averages over projection period
        avgRevenueGrowth: projectedIS.reduce((sum, s) => sum + s.revenueGrowthRate, 0) / projectedIS.length,
        avgNetMargin: projectedIS.reduce((sum, s) => sum + s.netMargin, 0) / projectedIS.length,
        avgFCF: projectedCF.reduce((sum, s) => sum + s.freeCashFlow, 0) / projectedCF.length,

        // Convergence
        converged: results.convergenceInfo.converged,
        iterations: results.convergenceInfo.iterations,

        // Integration health
        allIntegrationsPassed: results.integrationChecks.every(c => c.allPassed),
    };
}
