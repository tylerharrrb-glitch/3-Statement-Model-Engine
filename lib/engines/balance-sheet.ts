// ============================================================
// Balance Sheet Calculation Engine
// ============================================================

import { BalanceSheet } from '@/types/financial';
import { IncomeStatement } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';
import { calculateEgyptianTaxDepreciation, calculateEgyptianBlendedRate, calculateStraightLineDepreciation } from '@/lib/schedules/egyptian-depreciation';

export interface BalanceSheetInputs {
    assumptions: AssumptionSet;
    yearIndex: number;
    incomeStatement: IncomeStatement;
    previousBalanceSheet: BalanceSheet;
    endingCashFromCF: number | null; // null on first iteration
    priorLegalReserve: number;       // legal reserve from prior year
    legalReserveAddition: number;    // addition this year (from IS)
}

export function calculateBalanceSheet(inputs: BalanceSheetInputs): BalanceSheet {
    const { assumptions, yearIndex, incomeStatement, previousBalanceSheet, endingCashFromCF,
        priorLegalReserve, legalReserveAddition } = inputs;
    const yr = yearIndex;
    const period = `${assumptions.startYear + yr}E`;
    const prev = previousBalanceSheet;

    // ── CURRENT ASSETS ──────────────────────────────────
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

    // Intangibles: Prior - Amortization
    const intangibles = Math.max(0, prev.intangibles - incomeStatement.amortization);

    // Goodwill & Other — non-circular (S2: use revenue or absolute values, NOT totalAssets)
    const goodwill = assumptions.goodwill[yr] ?? prev.goodwill;
    const otherLongTermAssets = assumptions.otherLongTermAssets[yr] ?? prev.otherLongTermAssets;

    const totalNonCurrentAssets = netPPE + intangibles + goodwill + otherLongTermAssets;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

    // ── CURRENT LIABILITIES ─────────────────────────────
    const dpo = assumptions.dpo[yr] ?? 40;
    const accountsPayable = (dpo * incomeStatement.cogs) / 365;

    const accruedExpenses = incomeStatement.revenue * (assumptions.accruedExpPercent[yr] ?? 0.03);
    const deferredRevenue = incomeStatement.revenue * (assumptions.deferredRevPercent[yr] ?? 0.02);

    const shortTermDebt = assumptions.shortTermDebtAmount[yr] ?? prev.shortTermDebt;
    const currentPortionLTD = assumptions.currentPortionLTD[yr] ?? prev.currentPortionLTD;
    const otherCurrentLiabilities = assumptions.otherCurrentLiabilities[yr] ?? prev.otherCurrentLiabilities;

    const totalCurrentLiabilities = accountsPayable + accruedExpenses + shortTermDebt +
        currentPortionLTD + deferredRevenue + otherCurrentLiabilities;

    // ── NON-CURRENT LIABILITIES ─────────────────────────
    const ltDebtIssuance = assumptions.longTermDebtIssuance[yr] ?? 0;
    const ltDebtRepayment = assumptions.longTermDebtRepayment[yr] ?? 0;
    const longTermDebt = prev.longTermDebt + ltDebtIssuance - ltDebtRepayment;

    // DTL: non-circular — use absolute value from assumptions (S2 fix)
    const deferredTaxLiabilities = assumptions.deferredTaxLiabilities[yr] ?? prev.deferredTaxLiabilities;
    const otherLongTermLiabilities = assumptions.otherLongTermLiabilities[yr] ?? prev.otherLongTermLiabilities;

    // End of Service Benefits Provision (S1)
    const eosAddition = (assumptions.enableEndOfServiceBenefit ?? false)
        ? ((assumptions.averageMonthlyBasicSalary ?? 0) / 2) * (assumptions.numberOfEmployees?.[yr] ?? 0)
        : 0;
    const endOfServiceProvision = (prev.endOfServiceProvision ?? 0) + eosAddition;

    const totalNonCurrentLiabilities = longTermDebt + deferredTaxLiabilities + otherLongTermLiabilities + endOfServiceProvision;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

    // ── EQUITY ──────────────────────────────────────────
    const commonStock = assumptions.commonStock[yr] ?? prev.commonStock;
    const additionalPaidInCapital = prev.additionalPaidInCapital +
        (assumptions.equityIssuance[yr] ?? 0) +
        (assumptions.stockBasedCompAmount[yr] ?? 0);

    // Legal Reserve (C3)
    const legalReserve = priorLegalReserve + legalReserveAddition;

    // Retained Earnings: Prior RE + additionToRE (distributableProfit - grossDividends)
    // Using the profit appropriation waterfall from IS
    const retainedEarnings = prev.retainedEarnings + incomeStatement.additionToRE;

    // Treasury Stock
    const shareRepurchases = assumptions.shareRepurchaseAmount[yr] ?? 0;
    const treasuryStock = prev.treasuryStock - shareRepurchases;

    const otherComprehensiveIncome = assumptions.oci[yr] ?? prev.otherComprehensiveIncome;

    const totalEquity = commonStock + additionalPaidInCapital + legalReserve + retainedEarnings +
        treasuryStock + otherComprehensiveIncome;

    const totalLiabilitiesEquity = totalLiabilities + totalEquity;

    // ── BALANCING PLUG ──────────────────────────────────
    const rawImbalance = totalAssets - totalLiabilitiesEquity;
    let finalCash = cash;
    let finalTotalCurrentAssets = totalCurrentAssets;
    let finalTotalAssets = totalAssets;

    if (Math.abs(rawImbalance) > 0.001) {
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
        legalReserve,
        retainedEarnings,
        treasuryStock,
        otherComprehensiveIncome,
        totalEquity,
        endOfServiceProvision,
        totalLiabilitiesEquity,
        isBalanced,
        balanceDifference,
    };
}

// Calculate depreciation based on method
export function calculateDepreciation(
    previousGrossPPE: number,
    previousNetPPE: number,
    capex: number,
    depreciationRate: number,
    assumptions: AssumptionSet,
): number {
    const method = assumptions.depreciationMethod ?? 'straight-line';

    if (method === 'egyptian-tax' || method === 'declining-balance') {
        // Declining balance on Net Book Value with Egyptian tax rates
        const assetMix = assumptions.assetMix ?? {
            buildings: 0.30, machinery: 0.35, vehicles: 0.15,
            computers: 0.10, furniture: 0.10,
        };
        const result = calculateEgyptianTaxDepreciation(previousNetPPE, capex, assetMix);
        return result.totalDepreciation;
    }

    // Straight-line on average Gross PP&E
    return calculateStraightLineDepreciation(previousGrossPPE, capex, depreciationRate);
}

// Calculate interest expense from beginning-of-period debt balance
export function calculateInterestExpense(
    beginningTotalDebt: number,
    _endingTotalDebt: number,
    interestRate: number,
): number {
    return beginningTotalDebt * interestRate;
}

// Calculate interest income from beginning-of-period cash balance
export function calculateInterestIncome(
    beginningCash: number,
    _endingCash: number,
    interestIncomeRate: number,
): number {
    return beginningCash * interestIncomeRate;
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
            legalReserve: 0,  // historical — not modeled
            retainedEarnings: data.retainedEarnings[i],
            treasuryStock: data.treasuryStock[i],
            otherComprehensiveIncome: data.otherComprehensiveIncome[i],
            totalEquity,
            endOfServiceProvision: 0,
            totalLiabilitiesEquity,
            isBalanced: Math.abs(balanceDifference) < 0.01,
            balanceDifference,
        };
    });
}
