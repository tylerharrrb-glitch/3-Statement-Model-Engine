// ============================================================
// Financial Ratio Calculations
// ============================================================

import { FinancialRatios, IncomeStatement, BalanceSheet } from '@/types/financial';

export function calculateFinancialRatios(
    is: IncomeStatement,
    bs: BalanceSheet,
    previousBS: BalanceSheet,
): FinancialRatios {
    const avgTotalAssets = (bs.totalAssets + previousBS.totalAssets) / 2;
    const avgEquity = (bs.totalEquity + previousBS.totalEquity) / 2;
    const avgInventory = (bs.inventory + previousBS.inventory) / 2;
    const avgAR = (bs.accountsReceivable + previousBS.accountsReceivable) / 2;

    // Invested Capital = Total Equity + Total Debt - Cash
    const totalDebt = bs.shortTermDebt + bs.longTermDebt + bs.currentPortionLTD;
    const investedCapital = bs.totalEquity + totalDebt - bs.cash;
    const avgInvestedCapital = (investedCapital +
        (previousBS.totalEquity + previousBS.shortTermDebt + previousBS.longTermDebt +
            previousBS.currentPortionLTD - previousBS.cash)) / 2;

    // NOPAT = EBIT * (1 - tax rate)
    const nopat = is.ebit * (1 - is.taxRate);

    // Efficiency — compute locally so CCC can reference them
    const dso = is.revenue !== 0 ? (bs.accountsReceivable / is.revenue) * 365 : 0;
    const dio = is.cogs !== 0 ? (bs.inventory / is.cogs) * 365 : 0;
    const dpo = is.cogs !== 0 ? (bs.accountsPayable / is.cogs) * 365 : 0;

    return {
        period: is.period,

        // Profitability
        grossMargin: is.grossMargin,
        operatingMargin: is.ebitMargin,
        netMargin: is.netMargin,
        roe: avgEquity !== 0 ? is.netIncome / avgEquity : 0,
        roa: avgTotalAssets !== 0 ? is.netIncome / avgTotalAssets : 0,
        roic: avgInvestedCapital !== 0 ? nopat / avgInvestedCapital : 0,

        // Liquidity
        currentRatio: bs.totalCurrentLiabilities !== 0
            ? bs.totalCurrentAssets / bs.totalCurrentLiabilities : 0,
        quickRatio: bs.totalCurrentLiabilities !== 0
            ? (bs.totalCurrentAssets - bs.inventory) / bs.totalCurrentLiabilities : 0,
        cashRatio: bs.totalCurrentLiabilities !== 0
            ? bs.cash / bs.totalCurrentLiabilities : 0,

        // Leverage
        debtToEquity: bs.totalEquity !== 0 ? totalDebt / bs.totalEquity : 0,
        debtToAssets: bs.totalAssets !== 0 ? totalDebt / bs.totalAssets : 0,
        interestCoverage: is.interestExpense !== 0 ? is.ebit / is.interestExpense : 999,

        // Efficiency
        assetTurnover: avgTotalAssets !== 0 ? is.revenue / avgTotalAssets : 0,
        inventoryTurnover: avgInventory !== 0 ? is.cogs / avgInventory : 0,
        receivablesTurnover: avgAR !== 0 ? is.revenue / avgAR : 0,
        dso,
        dio,
        dpo,
        cashConversionCycle: dso + dio - dpo,
    };
}

// Post-process to add derived ratios
export function enrichRatios(ratios: FinancialRatios): FinancialRatios {
    return {
        ...ratios,
        cashConversionCycle: ratios.dso + ratios.dio - ratios.dpo,
    };
}
