// ============================================================
// Financial Ratio Calculations
// ============================================================
// Includes standard ratios + DuPont Analysis (3F & 5F),
// Altman Z'-Score (private companies), and Break-Even Analysis.

import { FinancialRatios, IncomeStatement, BalanceSheet, CashFlowStatement } from '@/types/financial';

export function calculateFinancialRatios(
    is: IncomeStatement,
    bs: BalanceSheet,
    previousBS: BalanceSheet,
    cf?: CashFlowStatement | null,
): FinancialRatios {
    const avgTotalAssets = (bs.totalAssets + previousBS.totalAssets) / 2;
    const avgEquity = (bs.totalEquity + previousBS.totalEquity) / 2;
    const avgInventory = (bs.inventory + previousBS.inventory) / 2;
    const avgAR = (bs.accountsReceivable + previousBS.accountsReceivable) / 2;

    // Invested Capital = Total Equity + Total Interest-Bearing Debt
    // Per EAS and standard practice — Cash is NOT netted; it's an operating asset
    const totalDebt = bs.shortTermDebt + bs.longTermDebt + bs.currentPortionLTD;
    const investedCapital = bs.totalEquity + totalDebt;
    const prevTotalDebt = previousBS.shortTermDebt + previousBS.longTermDebt + previousBS.currentPortionLTD;
    const avgInvestedCapital = (investedCapital + (previousBS.totalEquity + prevTotalDebt)) / 2;

    // NOPAT = EBIT * (1 - tax rate)
    const nopat = is.ebit * (1 - is.taxRate);

    // Efficiency — compute locally so CCC can reference them
    const dso = is.revenue !== 0 ? (bs.accountsReceivable / is.revenue) * 365 : 0;
    const dio = is.cogs !== 0 ? (bs.inventory / is.cogs) * 365 : 0;
    const dpo = is.cogs !== 0 ? (bs.accountsPayable / is.cogs) * 365 : 0;

    // ROE and ROA — use AVERAGE balances (standard practice)
    const roe = avgEquity !== 0 ? is.netIncome / avgEquity : 0;
    const roa = avgTotalAssets !== 0 ? is.netIncome / avgTotalAssets : 0;
    const assetTurnover = avgTotalAssets !== 0 ? is.revenue / avgTotalAssets : 0;
    const equityMultiplier = bs.totalEquity !== 0 ? bs.totalAssets / bs.totalEquity : 0;

    // ── DuPont Analysis (I2) ────────────────────────────
    // 3-Factor: ROE = Net Margin × Asset Turnover × Equity Multiplier
    const dupontNetMargin = is.netMargin;
    const dupontAssetTurnover = assetTurnover;
    const dupontEquityMultiplier = equityMultiplier;
    const dupontROE_3F = dupontNetMargin * dupontAssetTurnover * dupontEquityMultiplier;

    // 5-Factor: ROE = Tax Burden × Interest Burden × Operating Margin × Asset Turnover × Equity Multiplier
    const dupontTaxBurden = is.ebt !== 0 ? is.netIncome / is.ebt : 1;
    const dupontInterestBurden = is.ebit !== 0 ? is.ebt / is.ebit : 1;
    const dupontOperatingMargin = is.revenue !== 0 ? is.ebit / is.revenue : 0;
    const dupontROE_5F = dupontTaxBurden * dupontInterestBurden * dupontOperatingMargin *
        dupontAssetTurnover * dupontEquityMultiplier;

    // ── Altman Z'-Score for Private Companies (I3) ──────
    // Z' = 0.717×X1 + 0.847×X2 + 3.107×X3 + 0.420×X4 + 0.998×X5
    const workingCapital = bs.totalCurrentAssets - bs.totalCurrentLiabilities;
    const x1 = bs.totalAssets !== 0 ? workingCapital / bs.totalAssets : 0;
    const x2 = bs.totalAssets !== 0 ? bs.retainedEarnings / bs.totalAssets : 0;
    const x3 = bs.totalAssets !== 0 ? is.ebit / bs.totalAssets : 0;
    const bookEquity = bs.totalEquity;
    const x4 = totalDebt !== 0 ? bookEquity / totalDebt : 0;
    const x5 = bs.totalAssets !== 0 ? is.revenue / bs.totalAssets : 0;
    const altmanZScore = 0.717 * x1 + 0.847 * x2 + 3.107 * x3 + 0.420 * x4 + 0.998 * x5;
    const altmanZone: 'safe' | 'grey' | 'distress' =
        altmanZScore > 2.90 ? 'safe' : altmanZScore > 1.23 ? 'grey' : 'distress';

    // ── Altman EM Z-Score for Emerging Markets (Altman et al. 2005) ──
    // Z_EM = 6.56×X1 + 3.26×X2 + 6.72×X3 + 1.05×X4
    // (no X5 — revenue/assets omitted for EM model)
    const altmanZScoreEM = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * x4;
    const altmanZoneEM: 'safe' | 'grey' | 'distress' =
        altmanZScoreEM > 2.60 ? 'safe' : altmanZScoreEM > 1.10 ? 'grey' : 'distress';

    // ── Break-Even Analysis (I4) ────────────────────────
    // Assume: Variable Costs = COGS, Fixed Costs = SGA + D&A + Other OpEx
    const variableCostRatio = is.revenue !== 0 ? is.cogs / is.revenue : 0;
    const contributionMarginRatio = 1 - variableCostRatio;
    const fixedCosts = is.sgaExpense + is.depreciation + is.amortization +
        is.otherOpex + is.stockBasedComp + is.rdExpense;
    const breakEvenRevenue = contributionMarginRatio !== 0 ? fixedCosts / contributionMarginRatio : 0;
    const marginOfSafety = is.revenue !== 0 ? (is.revenue - breakEvenRevenue) / is.revenue : 0;
    // Operating Leverage = % change in EBIT / % change in Revenue ≈ Contribution Margin / EBIT
    const contributionMargin = is.revenue - is.cogs;
    const operatingLeverage = is.ebit !== 0 ? contributionMargin / is.ebit : 0;

    // ── Leverage (extended) ─────────────────────────────
    const netDebt = totalDebt - bs.cash;
    const netDebtToEbitda = is.ebitda !== 0 ? netDebt / is.ebitda : 0;
    // DSCR = EBITDA / (Interest Expense + Scheduled Principal)
    // Use actual debt repayment from CF (absolute value, since CF stores it negative)
    const scheduledPrincipal = cf ? Math.abs(cf.debtRepayment) : 0;
    const debtService = is.interestExpense + scheduledPrincipal;
    const dscr = !cf ? null : (debtService > 0 ? is.ebitda / debtService : null);

    // ── Efficiency (extended) ───────────────────────────
    const fcfMargin = cf ? (is.revenue !== 0 ? cf.freeCashFlow / is.revenue : 0) : null;
    const fcfToEbitda = cf ? (is.ebitda !== 0 ? cf.freeCashFlow / is.ebitda : 0) : null;

    // ── Per Share (extended) ────────────────────────────
    const bookValuePerShare = is.sharesOutstanding !== 0 ? bs.totalEquity / is.sharesOutstanding : 0;
    const fcfPerShare = is.sharesOutstanding !== 0 ? is.fcff / is.sharesOutstanding : 0;
    const revenuePerShare = is.sharesOutstanding !== 0 ? is.revenue / is.sharesOutstanding : 0;
    const eps = is.sharesOutstanding !== 0 ? is.netIncomeAfterEPD / is.sharesOutstanding : 0;

    return {
        period: is.period,

        // Profitability
        grossMargin: is.grossMargin,
        ebitdaMargin: is.revenue !== 0 ? is.ebitda / is.revenue : 0,
        operatingMargin: is.ebitMargin,
        netMargin: is.netMargin,
        roe,
        roa,
        // ROIC uses AVERAGE Net IC (equity + debt − cash) — standard practice
        roic: (avgInvestedCapital - (bs.cash + previousBS.cash) / 2) !== 0
            ? nopat / (avgInvestedCapital - (bs.cash + previousBS.cash) / 2)
            : 0,

        // Liquidity
        currentRatio: bs.totalCurrentLiabilities !== 0
            ? bs.totalCurrentAssets / bs.totalCurrentLiabilities : 0,
        // Quick Ratio = (TCA - Inventory) / TCL — standard definition
        quickRatio: bs.totalCurrentLiabilities !== 0
            ? (bs.totalCurrentAssets - bs.inventory) / bs.totalCurrentLiabilities : 0,
        cashRatio: bs.totalCurrentLiabilities !== 0
            ? bs.cash / bs.totalCurrentLiabilities : 0,

        // Leverage
        debtToEquity: bs.totalEquity !== 0 ? totalDebt / bs.totalEquity : 0,
        debtToAssets: bs.totalAssets !== 0 ? totalDebt / bs.totalAssets : 0,
        interestCoverage: is.interestExpense !== 0 ? is.ebit / is.interestExpense : 0,
        netDebt,
        netDebtToEbitda,
        dscr,

        // Efficiency
        assetTurnover,
        inventoryTurnover: avgInventory !== 0 ? is.cogs / avgInventory : 0,
        receivablesTurnover: avgAR !== 0 ? is.revenue / avgAR : 0,
        dso,
        dio,
        dpo,
        cashConversionCycle: dso + dio - dpo,
        fcfMargin,
        fcfToEbitda,

        // Per Share (extended)
        bookValuePerShare,
        fcfPerShare,
        revenuePerShare,
        eps,

        // DuPont Analysis (I2)
        dupontNetMargin,
        dupontAssetTurnover,
        dupontEquityMultiplier,
        dupontROE_3F,
        dupontTaxBurden,
        dupontInterestBurden,
        dupontOperatingMargin,
        dupontROE_5F,

        // Altman Z'-Score (I3)
        altmanZScore,
        altmanZone,

        // Altman EM Z-Score (I3b — Emerging Markets)
        altmanZScoreEM,
        altmanZoneEM,

        // Break-Even (I4)
        breakEvenRevenue,
        marginOfSafety,
        operatingLeverage,
    };
}

// Post-process to add derived ratios
export function enrichRatios(ratios: FinancialRatios): FinancialRatios {
    return {
        ...ratios,
        cashConversionCycle: ratios.dso + ratios.dio - ratios.dpo,
    };
}
