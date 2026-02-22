// ============================================================
// DCF Valuation Engine
// ============================================================
// Calculates intrinsic value using Discounted Cash Flow (DCF)
// with WACC derived from CAPM and Egyptian market inputs.

import { AssumptionSet } from '@/types/assumptions';
import { ModelResults, DCFValuation } from '@/types/financial';

/**
 * Calculate WACC using CAPM for cost of equity and after-tax cost of debt.
 * Capital structure weights derived from the last projected balance sheet.
 */
export function calculateWACC(
    assumptions: AssumptionSet,
    results: ModelResults,
): { wacc: number; costOfEquity: number; costOfDebt: number; debtWeight: number; equityWeight: number } {
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];

    // Cost of Equity (CAPM): ke = rf + β × ERP
    const riskFreeRate = assumptions.cbeRate;      // CBE rate as proxy
    const costOfEquity = riskFreeRate + assumptions.beta * assumptions.equityRiskPremium;

    // Cost of Debt (after-tax): kd = rate × (1 - tax)
    const projIdx = results.incomeStatements.length - results.balanceSheets.filter(b => b.periodType === 'historical').length - 1;
    const debtRate = assumptions.interestRateOnDebt[Math.max(0, projIdx)] ?? assumptions.interestRateOnDebt[assumptions.interestRateOnDebt.length - 1] ?? 0.18;
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

    return { wacc, costOfEquity, costOfDebt, debtWeight, equityWeight };
}

/**
 * Full DCF valuation: project FCFs, discount, terminal value, equity bridge.
 */
export function calculateDCF(
    assumptions: AssumptionSet,
    results: ModelResults,
): DCFValuation {
    const { wacc, costOfEquity, costOfDebt, debtWeight, equityWeight } = calculateWACC(assumptions, results);

    // Extract projected FCFs
    const numHistorical = results.incomeStatements.filter(s => s.periodType === 'historical').length;
    const projectedCFs = results.cashFlowStatements.slice(numHistorical > 0 ? numHistorical - 1 : 0);
    const fcfProjections = projectedCFs.map(cf => cf.freeCashFlow);

    // Discount each FCF to present value
    const discountedFCFs = fcfProjections.map((fcf, i) => fcf / Math.pow(1 + wacc, i + 1));

    // Terminal Value (Gordon Growth Model): TV = FCF_n × (1+g) / (WACC - g)
    const lastFCF = fcfProjections[fcfProjections.length - 1] ?? 0;
    const g = assumptions.terminalGrowthRate;
    const terminalValue = wacc > g ? (lastFCF * (1 + g)) / (wacc - g) : 0;

    // PV of terminal value
    const nPeriods = fcfProjections.length;
    const pvTerminalValue = terminalValue / Math.pow(1 + wacc, nPeriods);

    // Enterprise Value
    const sumDiscountedFCFs = discountedFCFs.reduce((a, b) => a + b, 0);
    const enterpriseValue = sumDiscountedFCFs + pvTerminalValue;

    // Equity bridge
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;
    const netDebt = totalDebt - lastBS.cash;
    const equityValue = enterpriseValue - netDebt;

    // Implied share price
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const shares = lastIS.sharesOutstanding || 1;
    const impliedSharePrice = equityValue / shares;

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
    };
}
