// ============================================================
// Indirect Cash Flow Method (Feature 2)
// ============================================================
// This module provides a clean entry point for the indirect method
// cash flow calculation. The core implementation lives in
// lib/engines/cash-flow.ts; this module re-exports it and adds
// reconciliation utilities.
// ============================================================

import { CashFlowStatement, BalanceSheet } from '@/types/financial';

/**
 * Check whether a cash flow statement reconciles to the balance sheet.
 * CF ending cash must equal BS cash within $0.01.
 */
export function calculateReconciliation(
    cf: CashFlowStatement,
    bsCash: number,
): boolean {
    return Math.abs(cf.endingCash - bsCash) < 0.01;
}

/**
 * Validate reconciliation for all cash flow periods against balance sheets.
 * Returns an array of { period, reconciles, difference } objects.
 */
export function validateAllReconciliations(
    cashFlows: CashFlowStatement[],
    balanceSheets: BalanceSheet[],
): { period: string; reconciles: boolean; difference: number }[] {
    return cashFlows.map((cf, i) => {
        // CF periods may be offset from BS periods (CF needs prior BS for deltas)
        // Find matching BS period by period name
        const matchingBS = balanceSheets.find(bs => bs.period === cf.period);
        const bsCash = matchingBS?.cash ?? 0;
        const difference = cf.endingCash - bsCash;
        return {
            period: cf.period,
            reconciles: Math.abs(difference) < 0.01,
            difference,
        };
    });
}

// Re-export the core indirect method implementation
export { calculateCashFlow, buildHistoricalCashFlows } from '@/lib/engines/cash-flow';
