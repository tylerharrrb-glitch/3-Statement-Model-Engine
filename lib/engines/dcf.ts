// ============================================================
// DCF Valuation Engine
// ============================================================
// Calculates intrinsic value using Discounted Cash Flow (DCF)
// with WACC derived from CAPM and Egyptian market inputs.
// Uses FCFF (Free Cash Flow to Firm) for consistency.

import { AssumptionSet } from '@/types/assumptions';
import { ModelResults, DCFValuation } from '@/types/financial';

// CBE Policy Rates (April 2, 2026 MPC Decision):
// Overnight Deposit: 19.00% | Overnight Lending: 20.00%
// Main Operation / Discount: 19.50% ← this is cbeRate
// Risk-Free Rate: ~23.50% (12M T-bill average auction yield, Q1 2026)
// Corporate Credit Spread (typical): +200bps over CBE lending rate

/**
 * Calculate WACC using CAPM for cost of equity and after-tax cost of debt.
 * Capital structure weights derived from the last projected balance sheet.
 */
export function calculateWACC(
    assumptions: AssumptionSet,
    results: ModelResults,
): { wacc: number; costOfEquity: number; costOfDebt: number; debtWeight: number; equityWeight: number; warnings: string[] } {
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const warnings: string[] = [];

    // Cost of Equity (CAPM): ke = rf + β × ERP
    // riskFreeRate decoupled from CBE rate — default 20% for Egyptian market
    const riskFreeRate = assumptions.riskFreeRate ?? assumptions.cbeRate;
    const costOfEquity = riskFreeRate + assumptions.beta * assumptions.equityRiskPremium;

    // Cost of Debt (after-tax): kd = rate × (1 - tax)
    // Use the AVERAGE of the projection-period debt rates rather than the
    // terminal-year rate — the terminal rate is frequently stepped down,
    // which under-prices debt if used alone and under-states WACC.
    const projectionYears = assumptions.projectionYears ?? assumptions.interestRateOnDebt.length;
    const rateSlice = assumptions.interestRateOnDebt.slice(0, projectionYears);
    const avgDebtRate = rateSlice.length > 0
        ? rateSlice.reduce((a, b) => a + b, 0) / rateSlice.length
        : (assumptions.legacyDebtRate ?? 0.18);
    const debtRate = avgDebtRate;
    const taxRate = lastIS.taxRate;
    const costOfDebt = debtRate * (1 - taxRate);

    // Capital structure weights
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;
    const totalEquity = Math.max(lastBS.totalEquity, 1); // avoid div by zero
    const totalCapital = totalDebt + totalEquity;
    const debtWeight = totalDebt / totalCapital;
    const equityWeight = totalEquity / totalCapital;

    // WACC
    const wacc = equityWeight * costOfEquity + debtWeight * costOfDebt;

    // ── SANITY CHECKS (S4) ──────────────────────────────
    if (wacc <= 0) {
        warnings.push('WACC is non-positive — check inputs');
    }
    if (wacc > 0.50) {
        warnings.push(`WACC (${(wacc * 100).toFixed(1)}%) exceeds 50% — unusually high`);
    }
    if (costOfEquity <= costOfDebt) {
        warnings.push('Cost of Equity ≤ Cost of Debt — unusual risk pricing');
    }
    if (debtWeight > 0.90) {
        warnings.push(`Debt weight (${(debtWeight * 100).toFixed(1)}%) exceeds 90% — extreme leverage`);
    }
    if (costOfEquity > 0.60) {
        warnings.push(`Cost of Equity (${(costOfEquity * 100).toFixed(1)}%) exceeds 60% — check ERP/beta`);
    }

    return { wacc, costOfEquity, costOfDebt, debtWeight, equityWeight, warnings };
}

/**
 * Full DCF valuation using FCFF (Free Cash Flow to Firm).
 * FCFF = NOPAT + D&A − CapEx − ΔNWC (computed on IS as memo item).
 */
export function calculateDCF(
    assumptions: AssumptionSet,
    results: ModelResults,
): DCFValuation {
    const { wacc, costOfEquity, costOfDebt, debtWeight, equityWeight, warnings } = calculateWACC(assumptions, results);

    // Extract projected FCFF from Income Statement memo items (C7 fix)
    const numHistorical = results.incomeStatements.filter(s => s.periodType === 'historical').length;
    const projectedISs = results.incomeStatements.slice(numHistorical);
    const fcfProjections = projectedISs.map(is => is.fcff);

    // Terminal growth rate sanity check (S4)
    const g = assumptions.terminalGrowthRate;
    if (g >= wacc) {
        warnings.push(`Terminal growth rate (${(g * 100).toFixed(1)}%) ≥ WACC (${(wacc * 100).toFixed(1)}%) — terminal value is undefined`);
    }

    // Discount each FCFF to present value
    const discountedFCFs = fcfProjections.map((fcf, i) => fcf / Math.pow(1 + wacc, i + 1));

    // Terminal Value (Gordon Growth Model): TV = FCFF_n × (1+g) / (WACC - g)
    const lastFCFF = fcfProjections[fcfProjections.length - 1] ?? 0;
    const terminalValue = wacc > g ? (lastFCFF * (1 + g)) / (wacc - g) : 0;

    // PV of terminal value
    const nPeriods = fcfProjections.length;
    const pvTerminalValue = terminalValue / Math.pow(1 + wacc, nPeriods);

    // Enterprise Value
    const sumDiscountedFCFs = discountedFCFs.reduce((a, b) => a + b, 0);
    const enterpriseValue = sumDiscountedFCFs + pvTerminalValue;

    // TV as % of EV (S4 warning)
    const tvAsPercentOfEV = enterpriseValue !== 0 ? pvTerminalValue / enterpriseValue : 0;
    if (tvAsPercentOfEV > 0.85) {
        warnings.push(`Terminal Value is ${(tvAsPercentOfEV * 100).toFixed(0)}% of EV — consider extending projection period`);
    }

    // Equity bridge
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;
    const netDebt = totalDebt - lastBS.cash;
    const equityValue = enterpriseValue - netDebt;

    // Implied share price
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const shares = lastIS.sharesOutstanding || 1;
    const impliedSharePrice = equityValue / shares;

    if (impliedSharePrice < 0) {
        warnings.push('Implied share price is negative — entity may be insolvent');
    }

    return {
        fcfProjections,
        discountedFCFs,
        terminalValue,
        pvTerminalValue,
        enterpriseValue,
        netDebt,
        equityValue,
        impliedSharePrice,
        wacc,
        costOfEquity,
        costOfDebt,
        debtWeight,
        equityWeight,
        dcfWarnings: warnings,
        tvAsPercentOfEV,
    };
}
