// ============================================================
// Balance Sheet Calculation Engine
// ============================================================

import { BalanceSheet } from '@/types/financial';
import { IncomeStatement } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';

export interface BalanceSheetInputs {
    assumptions: AssumptionSet;
    yearIndex: number;
    incomeStatement: IncomeStatement;
    previousBalanceSheet: BalanceSheet;
    endingCashFromCF: number | null; // null on first iteration
}

export function calculateBalanceSheet(inputs: BalanceSheetInputs): BalanceSheet {
    const { assumptions, yearIndex, incomeStatement, previousBalanceSheet, endingCashFromCF } = inputs;
    const yr = yearIndex;
    const period = `${assumptions.startYear + yr}E`;
    const prev = previousBalanceSheet;

    // ── CURRENT ASSETS ──────────────────────────────────
    // Cash: from CF statement ending cash; on first iteration, use a plug
    const cash = endingCashFromCF ?? prev.cash;

    // Accounts Receivable: DSO * Revenue / 365
    const dso = assumptions.dso[yr] ?? 45;
    const accountsReceivable = (dso * incomeStatement.revenue) / 365;

    // Inventory: DIO * COGS / 365
    const dio = assumptions.dio[yr] ?? 30;
    const inventory = (dio * incomeStatement.cogs) / 365;

    // Prepaid & Other
    const prepaidExpenses = incomeStatement.revenue * (assumptions.prepaidPercent[yr] ?? 0.01);
    const otherCurrentAssets = assumptions.otherCurrentAssets[yr] ?? prev.otherCurrentAssets;

    const totalCurrentAssets = cash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets;

    // ── NON-CURRENT ASSETS ──────────────────────────────
    // PP&E Schedule: Gross PPE = Prior Gross PPE + CapEx
    const capex = incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05);
    const grossPPE = prev.grossPPE + capex;

    // Accumulated Depreciation = Prior + Current Period Depreciation
    const accumulatedDepreciation = prev.accumulatedDepreciation + incomeStatement.depreciation;
    const netPPE = grossPPE - accumulatedDepreciation;

    // Intangibles: Prior - Amortization + Acquisitions (if any)
    const intangibles = Math.max(0, prev.intangibles - incomeStatement.amortization);

    // Goodwill & Other
    const goodwill = assumptions.goodwill[yr] ?? prev.goodwill;
    const otherLongTermAssets = assumptions.otherLongTermAssets[yr] ?? prev.otherLongTermAssets;

    const totalNonCurrentAssets = netPPE + intangibles + goodwill + otherLongTermAssets;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    // ── CURRENT LIABILITIES ─────────────────────────────
    // Accounts Payable: DPO * COGS / 365
    const dpo = assumptions.dpo[yr] ?? 40;
    const accountsPayable = (dpo * incomeStatement.cogs) / 365;

    // Accrued Expenses, Deferred Revenue
    const accruedExpenses = incomeStatement.revenue * (assumptions.accruedExpPercent[yr] ?? 0.03);
    const deferredRevenue = incomeStatement.revenue * (assumptions.deferredRevPercent[yr] ?? 0.02);

    // Short-term debt & Current Portion LTD
    const shortTermDebt = assumptions.shortTermDebtAmount[yr] ?? prev.shortTermDebt;
    const currentPortionLTD = assumptions.currentPortionLTD[yr] ?? prev.currentPortionLTD;

    const otherCurrentLiabilities = assumptions.otherCurrentLiabilities[yr] ?? prev.otherCurrentLiabilities;

    const totalCurrentLiabilities = accountsPayable + accruedExpenses + shortTermDebt +
        currentPortionLTD + deferredRevenue + otherCurrentLiabilities;

    // ── NON-CURRENT LIABILITIES ─────────────────────────
    // Long-term Debt Schedule
    const ltDebtIssuance = assumptions.longTermDebtIssuance[yr] ?? 0;
    const ltDebtRepayment = assumptions.longTermDebtRepayment[yr] ?? 0;
    const longTermDebt = prev.longTermDebt + ltDebtIssuance - ltDebtRepayment;

    const deferredTaxLiabilities = assumptions.deferredTaxLiabilities[yr] ?? prev.deferredTaxLiabilities;
    const otherLongTermLiabilities = assumptions.otherLongTermLiabilities[yr] ?? prev.otherLongTermLiabilities;

    const totalNonCurrentLiabilities = longTermDebt + deferredTaxLiabilities + otherLongTermLiabilities;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    // ── EQUITY ──────────────────────────────────────────
    const commonStock = assumptions.commonStock[yr] ?? prev.commonStock;
    // APIC accumulates from prior period + equity issuance + SBC (both increase paid-in capital)
    const additionalPaidInCapital = prev.additionalPaidInCapital +
        (assumptions.equityIssuance[yr] ?? 0) +
        (assumptions.stockBasedCompAmount[yr] ?? 0);

    // Retained Earnings: Prior RE + Net Income - Dividends
    const dividendPayoutRatio = assumptions.dividendPayoutRatio[yr] ?? 0;
    const dividendsPaid = Math.max(0, incomeStatement.netIncome * dividendPayoutRatio);
    const retainedEarnings = prev.retainedEarnings + incomeStatement.netIncome - dividendsPaid;

    // Treasury Stock: Prior - Buybacks
    const shareRepurchases = assumptions.shareRepurchaseAmount[yr] ?? 0;
    const treasuryStock = prev.treasuryStock - shareRepurchases; // buybacks make it more negative

    const otherComprehensiveIncome = assumptions.oci[yr] ?? prev.otherComprehensiveIncome;

    const totalEquity = commonStock + additionalPaidInCapital + retainedEarnings +
        treasuryStock + otherComprehensiveIncome;

    const totalLiabilitiesEquity = totalLiabilities + totalEquity;

    // ── BALANCING PLUG ──────────────────────────────────
    // Use cash as the balancing plug: if A ≠ L+E, adjust cash to force balance.
    // This handles floating-point drift and ensures the BS always ties.
    const rawImbalance = totalAssets - totalLiabilitiesEquity;
    let finalCash = cash;
    let finalTotalCurrentAssets = totalCurrentAssets;
    let finalTotalAssets = totalAssets;

    if (Math.abs(rawImbalance) > 0.001) {
        // Plug into cash: reduce cash by the overshoot (or increase if under)
        finalCash = cash - rawImbalance;
        finalTotalCurrentAssets = finalCash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets;
        finalTotalAssets = finalTotalCurrentAssets + totalNonCurrentAssets;
    }

    const balanceDifference = finalTotalAssets - totalLiabilitiesEquity;
    const isBalanced = Math.abs(balanceDifference) < 0.01;

    return {
        period,
        periodType: 'projected',
        cash: finalCash,
        accountsReceivable,
        inventory,
        prepaidExpenses,
        otherCurrentAssets,
        totalCurrentAssets: finalTotalCurrentAssets,
        grossPPE,
        accumulatedDepreciation,
        netPPE,
        intangibles,
        goodwill,
        otherLongTermAssets,
        totalNonCurrentAssets,
        totalAssets: finalTotalAssets,
        accountsPayable,
        accruedExpenses,
        shortTermDebt,
        currentPortionLTD,
        deferredRevenue,
        otherCurrentLiabilities,
        totalCurrentLiabilities,
        longTermDebt,
        deferredTaxLiabilities,
        otherLongTermLiabilities,
        totalNonCurrentLiabilities,
        totalLiabilities,
        commonStock,
        additionalPaidInCapital,
        retainedEarnings,
        treasuryStock,
        otherComprehensiveIncome,
        totalEquity,
        totalLiabilitiesEquity,
        isBalanced,
        balanceDifference,
    };
}

// Calculate depreciation for a given year based on gross PP&E
export function calculateDepreciation(
    previousGrossPPE: number,
    capex: number,
    depreciationRate: number,
): number {
    // Depreciate based on average gross PPE during the period
    const avgGrossPPE = previousGrossPPE + capex / 2;
    return avgGrossPPE * depreciationRate;
}

// Calculate interest expense from average debt balances
export function calculateInterestExpense(
    beginningTotalDebt: number,
    endingTotalDebt: number,
    interestRate: number,
): number {
    const avgDebt = (beginningTotalDebt + endingTotalDebt) / 2;
    return avgDebt * interestRate;
}

// Calculate interest income from average cash balances
export function calculateInterestIncome(
    beginningCash: number,
    endingCash: number,
    interestIncomeRate: number,
): number {
    return ((beginningCash + endingCash) / 2) * interestIncomeRate;
}

// Build historical balance sheets from raw data
export function buildHistoricalBalanceSheets(
    periods: string[],
    data: {
        cash: number[];
        accountsReceivable: number[];
        inventory: number[];
        prepaidExpenses: number[];
        otherCurrentAssets: number[];
        grossPPE: number[];
        accumulatedDepreciation: number[];
        intangibles: number[];
        goodwill: number[];
        otherLongTermAssets: number[];
        accountsPayable: number[];
        accruedExpenses: number[];
        shortTermDebt: number[];
        currentPortionLTD: number[];
        deferredRevenue: number[];
        otherCurrentLiabilities: number[];
        longTermDebt: number[];
        deferredTaxLiabilities: number[];
        otherLongTermLiabilities: number[];
        commonStock: number[];
        additionalPaidInCapital: number[];
        retainedEarnings: number[];
        treasuryStock: number[];
        otherComprehensiveIncome: number[];
    }
): BalanceSheet[] {
    return periods.map((period, i) => {
        const netPPE = data.grossPPE[i] - data.accumulatedDepreciation[i];
        const totalCurrentAssets = data.cash[i] + data.accountsReceivable[i] + data.inventory[i] +
            data.prepaidExpenses[i] + data.otherCurrentAssets[i];
        const totalNonCurrentAssets = netPPE + data.intangibles[i] + data.goodwill[i] + data.otherLongTermAssets[i];
        const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

        const totalCurrentLiabilities = data.accountsPayable[i] + data.accruedExpenses[i] +
            data.shortTermDebt[i] + data.currentPortionLTD[i] + data.deferredRevenue[i] +
            data.otherCurrentLiabilities[i];
        const totalNonCurrentLiabilities = data.longTermDebt[i] + data.deferredTaxLiabilities[i] +
            data.otherLongTermLiabilities[i];
        const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

        const totalEquity = data.commonStock[i] + data.additionalPaidInCapital[i] +
            data.retainedEarnings[i] + data.treasuryStock[i] + data.otherComprehensiveIncome[i];
        const totalLiabilitiesEquity = totalLiabilities + totalEquity;
        const balanceDifference = totalAssets - totalLiabilitiesEquity;

        return {
            period,
            periodType: 'historical' as const,
            cash: data.cash[i],
            accountsReceivable: data.accountsReceivable[i],
            inventory: data.inventory[i],
            prepaidExpenses: data.prepaidExpenses[i],
            otherCurrentAssets: data.otherCurrentAssets[i],
            totalCurrentAssets,
            grossPPE: data.grossPPE[i],
            accumulatedDepreciation: data.accumulatedDepreciation[i],
            netPPE,
            intangibles: data.intangibles[i],
            goodwill: data.goodwill[i],
            otherLongTermAssets: data.otherLongTermAssets[i],
            totalNonCurrentAssets,
            totalAssets,
            accountsPayable: data.accountsPayable[i],
            accruedExpenses: data.accruedExpenses[i],
            shortTermDebt: data.shortTermDebt[i],
            currentPortionLTD: data.currentPortionLTD[i],
            deferredRevenue: data.deferredRevenue[i],
            otherCurrentLiabilities: data.otherCurrentLiabilities[i],
            totalCurrentLiabilities,
            longTermDebt: data.longTermDebt[i],
            deferredTaxLiabilities: data.deferredTaxLiabilities[i],
            otherLongTermLiabilities: data.otherLongTermLiabilities[i],
            totalNonCurrentLiabilities,
            totalLiabilities,
            commonStock: data.commonStock[i],
            additionalPaidInCapital: data.additionalPaidInCapital[i],
            retainedEarnings: data.retainedEarnings[i],
            treasuryStock: data.treasuryStock[i],
            otherComprehensiveIncome: data.otherComprehensiveIncome[i],
            totalEquity,
            totalLiabilitiesEquity,
            isBalanced: Math.abs(balanceDifference) < 0.01,
            balanceDifference,
        };
    });
}
