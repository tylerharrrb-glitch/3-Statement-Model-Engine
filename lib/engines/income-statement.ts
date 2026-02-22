// ============================================================
// Income Statement Calculation Engine
// ============================================================

import { IncomeStatement } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';

export interface IncomeStatementInputs {
    assumptions: AssumptionSet;
    yearIndex: number;
    previousRevenue: number;
    depreciationFromSchedule: number;
    interestExpenseFromDebt: number;
    interestIncomeFromCash: number;
}

export function calculateIncomeStatement(inputs: IncomeStatementInputs): IncomeStatement {
    const { assumptions, yearIndex, previousRevenue, depreciationFromSchedule, interestExpenseFromDebt, interestIncomeFromCash } = inputs;
    const yr = yearIndex;
    const period = `${assumptions.startYear + yr}E`;

    // Revenue — always grow from prior period (historical last → projected chain)
    const growthRate = assumptions.revenueGrowthRate[yr] ?? 0;
    const revenue = previousRevenue * (1 + growthRate);

    // Cost of Revenue
    const cogsPercent = assumptions.cogsPercent[yr] ?? 0.6;
    const cogs = revenue * cogsPercent;
    const grossProfit = revenue - cogs;
    const grossMargin = revenue !== 0 ? grossProfit / revenue : 0;

    // Operating Expenses
    const sgaExpense = revenue * (assumptions.sgaPercent[yr] ?? 0.15);
    const rdExpense = revenue * (assumptions.rdPercent[yr] ?? 0.05);
    const depreciation = depreciationFromSchedule;
    const amortization = assumptions.amortizationAmount[yr] ?? 0;
    const otherOpex = revenue * (assumptions.otherOpexPercent[yr] ?? 0.02);
    const stockBasedComp = assumptions.stockBasedCompAmount[yr] ?? 0;
    const totalOpex = sgaExpense + rdExpense + depreciation + amortization + otherOpex + stockBasedComp;

    // Operating Income
    const ebit = grossProfit - totalOpex;
    const ebitda = ebit + depreciation + amortization;
    const ebitMargin = revenue !== 0 ? ebit / revenue : 0;

    // Non-Operating Items
    const interestIncome = interestIncomeFromCash;
    const interestExpense = interestExpenseFromDebt;
    const otherIncomeExpense = assumptions.otherIncomeExpense[yr] ?? 0;

    // Pre-Tax & Tax
    const ebt = ebit + interestIncome - interestExpense + otherIncomeExpense;
    const taxRate = assumptions.taxRate[yr] ?? 0.25;
    const taxExpense = Math.max(0, ebt * taxRate);

    // Net Income
    const netIncome = ebt - taxExpense;
    const netMargin = revenue !== 0 ? netIncome / revenue : 0;

    // Employee Profit Sharing (Art. 47, Law 159/1981)
    // EPD is an appropriation of profit (not tax-deductible), applied after tax
    const employeeProfitSharing = Math.max(0, netIncome * (assumptions.employeeProfitSharingRate ?? 0));
    const netIncomeAfterEPD = netIncome - employeeProfitSharing;

    // Per Share — EPS uses post-EPD income
    const sharesOutstanding = assumptions.sharesOutstanding[yr] ?? 100_000;
    const eps = sharesOutstanding !== 0 ? netIncomeAfterEPD / sharesOutstanding : 0;

    // VAT memo (Egyptian market) — revenue stays exclusive-of-VAT throughout the model
    let revenueInclVAT: number | undefined;
    let revenueExclVAT: number | undefined;
    let vatCollected: number | undefined;
    if (assumptions.enableVAT && assumptions.vatRate) {
        revenueExclVAT = revenue;
        vatCollected = revenue * assumptions.vatRate;
        revenueInclVAT = revenue + vatCollected;
    }

    return {
        period,
        periodType: 'projected',
        revenue,
        revenueGrowthRate: growthRate,
        cogs,
        grossProfit,
        grossMargin,
        sgaExpense,
        rdExpense,
        depreciation,
        amortization,
        otherOpex,
        stockBasedComp,
        totalOpex,
        ebit,
        ebitda,
        ebitMargin,
        interestIncome,
        interestExpense,
        otherIncomeExpense,
        ebt,
        taxRate,
        taxExpense,
        netIncome,
        netMargin,
        employeeProfitSharing,
        netIncomeAfterEPD,
        sharesOutstanding,
        eps,
        // VAT memo (only present when VAT is enabled)
        ...(revenueInclVAT !== undefined && { revenueInclVAT, revenueExclVAT, vatCollected }),
    };
}

// Build historical income statements from raw data
export function buildHistoricalIncomeStatements(
    periods: string[],
    data: {
        revenue: number[];
        cogs: number[];
        sgaExpense: number[];
        rdExpense: number[];
        depreciation: number[];
        amortization: number[];
        otherOpex: number[];
        interestIncome: number[];
        interestExpense: number[];
        otherIncomeExpense: number[];
        taxExpense: number[];
        sharesOutstanding: number[];
    }
): IncomeStatement[] {
    return periods.map((period, i) => {
        const revenue = data.revenue[i];
        const cogs = data.cogs[i];
        const grossProfit = revenue - cogs;
        const sgaExpense = data.sgaExpense[i];
        const rdExpense = data.rdExpense[i];
        const depreciation = data.depreciation[i];
        const amortization = data.amortization[i];
        const otherOpex = data.otherOpex[i];
        const stockBasedComp = 0; // Historical SBC is not broken out — captured in other OpEx
        const totalOpex = sgaExpense + rdExpense + depreciation + amortization + otherOpex + stockBasedComp;
        const ebit = grossProfit - totalOpex;
        const ebitda = ebit + depreciation + amortization;
        const interestIncome = data.interestIncome[i];
        const interestExpense = data.interestExpense[i];
        const otherIncomeExpense = data.otherIncomeExpense[i];
        const ebt = ebit + interestIncome - interestExpense + otherIncomeExpense;
        const taxExpense = data.taxExpense[i];
        const netIncome = ebt - taxExpense;
        const sharesOutstanding = data.sharesOutstanding[i];

        const prevRevenue = i > 0 ? data.revenue[i - 1] : revenue;
        const revenueGrowthRate = prevRevenue !== 0 ? (revenue - prevRevenue) / prevRevenue : 0;

        return {
            period,
            periodType: 'historical' as const,
            revenue,
            revenueGrowthRate,
            cogs,
            grossProfit,
            grossMargin: revenue !== 0 ? grossProfit / revenue : 0,
            sgaExpense,
            rdExpense,
            depreciation,
            amortization,
            otherOpex,
            stockBasedComp,
            totalOpex,
            ebit,
            ebitda,
            ebitMargin: revenue !== 0 ? ebit / revenue : 0,
            interestIncome,
            interestExpense,
            otherIncomeExpense,
            ebt,
            taxRate: ebt !== 0 ? taxExpense / ebt : 0,
            taxExpense,
            netIncome,
            netMargin: revenue !== 0 ? netIncome / revenue : 0,
            employeeProfitSharing: 0,   // Historical — not modeled retroactively
            netIncomeAfterEPD: netIncome,
            sharesOutstanding,
            eps: sharesOutstanding !== 0 ? netIncome / sharesOutstanding : 0,
        };
    });
}
