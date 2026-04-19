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
import { calculateDCF } from './dcf';

/**
 * Seed carry-forward assumption arrays from the last historical period.
 * Fixes placeholder-default bug where `getDefaultAssumptions()` returns
 * small numbers (e.g. commonStock 10_000, sharesOutstanding 100_000) that
 * override real historical balances (e.g. 17B commonStock) because the
 * balance-sheet engine reads `assumptions.X[yr] ?? prev.X` and the
 * assumption array is always populated.
 *
 * Rule: if the first-year assumption value is materially smaller than the
 * last historical value (<10% of it), treat the assumption as a placeholder
 * and replace the entire array with the last historical value.
 */
function seedAssumptionsFromHistorical(
    assumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
): AssumptionSet {
    const n = historicalInputs.cash.length;
    if (n === 0) return assumptions;
    const last = n - 1;
    const years = assumptions.projectionYears;
    const fill = <T>(v: T): T[] => Array(years).fill(v);

    const isPlaceholder = (arr: number[] | undefined, histVal: number): boolean => {
        if (!arr || arr.length === 0) return true;
        const first = arr[0] ?? 0;
        // Treat as placeholder when historical is materially larger
        return Math.abs(histVal) > 0 && Math.abs(first) < Math.abs(histVal) * 0.1;
    };

    const seeded: AssumptionSet = { ...assumptions };

    // Balance-sheet stock items — carry last historical value forward
    const carryFields: Array<{ key: keyof AssumptionSet; hist: number }> = [
        { key: 'commonStock', hist: historicalInputs.commonStock[last] },
        { key: 'apic', hist: historicalInputs.additionalPaidInCapital[last] },
        { key: 'goodwill', hist: historicalInputs.goodwill[last] },
        { key: 'otherLongTermAssets', hist: historicalInputs.otherLongTermAssets[last] },
        { key: 'otherCurrentAssets', hist: historicalInputs.otherCurrentAssets[last] },
        { key: 'otherCurrentLiabilities', hist: historicalInputs.otherCurrentLiabilities[last] },
        { key: 'otherLongTermLiabilities', hist: historicalInputs.otherLongTermLiabilities[last] },
        { key: 'deferredTaxLiabilities', hist: historicalInputs.deferredTaxLiabilities[last] },
        { key: 'shortTermDebtAmount', hist: historicalInputs.shortTermDebt[last] },
        { key: 'currentPortionLTD', hist: historicalInputs.currentPortionLTD[last] },
        { key: 'oci', hist: historicalInputs.otherComprehensiveIncome[last] },
    ];
    for (const { key, hist } of carryFields) {
        if (isPlaceholder(seeded[key] as number[] | undefined, hist)) {
            (seeded as unknown as Record<string, unknown>)[key as string] = fill(hist);
        }
    }

    // Shares outstanding — carry last historical forward
    if (historicalInputs.sharesOutstanding && historicalInputs.sharesOutstanding.length > 0) {
        const histShares = historicalInputs.sharesOutstanding[last] ?? 0;
        if (isPlaceholder(seeded.sharesOutstanding, histShares)) {
            seeded.sharesOutstanding = fill(histShares);
        }
    }

    // Paid-up capital — default to opening common stock (for legal-reserve cap)
    const histCommon = historicalInputs.commonStock[last] ?? 0;
    if (Math.abs(histCommon) > 0 && Math.abs(seeded.paidUpCapital ?? 0) < Math.abs(histCommon) * 0.1) {
        seeded.paidUpCapital = histCommon;
    }

    // Stock-based comp — default to 0 to prevent APIC drift from the 10k placeholder
    if (seeded.stockBasedCompAmount && seeded.stockBasedCompAmount.every(v => v === 10_000)) {
        seeded.stockBasedCompAmount = fill(0);
    }

    // Working-capital % drivers — seed from last historical ratios if placeholder
    if (n >= 1) {
        const rev = historicalInputs.revenue?.[last] ?? 0;
        if (rev > 0) {
            const prepaidRatio = (historicalInputs.prepaidExpenses[last] ?? 0) / rev;
            const accruedRatio = (historicalInputs.accruedExpenses[last] ?? 0) / rev;
            const defRevRatio = (historicalInputs.deferredRevenue[last] ?? 0) / rev;
            // Replace only if default is suspiciously round (0.01/0.03/0.02) and historical differs
            const closeTo = (a: number, b: number) => Math.abs(a - b) < 1e-6;
            if (seeded.prepaidPercent?.every(v => closeTo(v, 0.01)) && !closeTo(prepaidRatio, 0.01)) {
                seeded.prepaidPercent = fill(prepaidRatio);
            }
            if (seeded.accruedExpPercent?.every(v => closeTo(v, 0.03)) && !closeTo(accruedRatio, 0.03)) {
                seeded.accruedExpPercent = fill(accruedRatio);
            }
            if (seeded.deferredRevPercent?.every(v => closeTo(v, 0.02)) && !closeTo(defRevRatio, 0.02)) {
                seeded.deferredRevPercent = fill(defRevRatio);
            }
        }
    }

    return seeded;
}

export function runFullModel(
    rawAssumptions: AssumptionSet,
    historicalInputs: HistoricalInputs,
): ModelResults {
    const assumptions = seedAssumptionsFromHistorical(rawAssumptions, historicalInputs);
    // ── SANITIZE HISTORICAL PERIOD LABELS ─────────────────
    // Ensure labels count BACK from projectionStartYear:
    // With startYear=2026 and 2 periods → ["2024", "2025"]
    const numHistorical = historicalInputs.periods.length;
    const correctedPeriods = historicalInputs.periods.map((_: string, index: number) => {
        return `${assumptions.startYear - numHistorical + index}`;
    });

    // ── BUILD HISTORICAL STATEMENTS ─────────────────────
    const historicalIS = buildHistoricalIncomeStatements(
        correctedPeriods,
        historicalInputs,
        historicalInputs.retainedEarnings,  // Fix 8: actual RE for additionToRE
        assumptions.taxRate,                 // Statutory tax rate for display
    );

    const historicalBS = buildHistoricalBalanceSheets(
        correctedPeriods,
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

    // Carry-forward state between projection years
    let taxLossVintages: import('./income-statement').TaxLossVintage[] = [];
    let currentLegalReserve = assumptions.initialLegalReserve ?? 0;

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
            taxLossVintages,
            currentLegalReserve,
        );

        // Update carry-forward state for next year
        taxLossVintages = result.updatedTaxLossVintages;
        currentLegalReserve = result.newLegalReserve;

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
        // CF array starts at IS index 1 (no CF for first historical period)
        const cf = i > 0 && i - 1 < allCF.length ? allCF[i - 1] : null;
        return calculateFinancialRatios(is, bs, prevBS, cf);
    });

    // ── DCF VALUATION ────────────────────────────────
    // Compute DCF inside runFullModel so it's always attached to ModelResults
    // and serialized correctly in JSON/Excel exports (FIX-02)
    try {
        const dcfResult = calculateDCF(assumptions, {
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
            dcfValuation: dcfResult,
        };
    } catch (dcfError) {
        console.warn('[WOLF] DCF calculation failed:', dcfError);
    }

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
