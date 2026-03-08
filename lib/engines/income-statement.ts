// ============================================================
// Income Statement Calculation Engine
// ============================================================

import { IncomeStatement } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';

// Tax Loss Carryforward vintage tracking
export interface TaxLossVintage {
    year: number;
    amount: number;
    expiresAfterYear: number; // year + carryforwardYears
}

export interface IncomeStatementInputs {
    assumptions: AssumptionSet;
    yearIndex: number;
    previousRevenue: number;
    depreciationFromSchedule: number;
    interestExpenseFromDebt: number;
    interestIncomeFromCash: number;
    // Tax loss carryforward
    taxLossVintages: TaxLossVintage[];
    // Legal reserve
    priorLegalReserve: number;
    // NWC for FCFF calculation
    currentNWC: number;
    previousNWC: number;
    capex: number;
    // Retained earnings from prior period (for dividend blocking per Companies Law Art. 53)
    previousRetainedEarnings: number;
}

export interface IncomeStatementResult {
    incomeStatement: IncomeStatement;
    updatedTaxLossVintages: TaxLossVintage[];
    newLegalReserve: number;
}

function calculateTaxWithCarryforward(
    ebt: number,
    taxRate: number,
    lossVintages: TaxLossVintage[],
    currentYear: number,
    carryforwardYears: number,
    enabled: boolean,
): {
    tax: number;
    taxableIncome: number;
    taxLossUtilized: number;
    taxLossRemaining: number;
    updatedVintages: TaxLossVintage[];
    taxLossCarryforward: number;
} {
    // 1. Expire vintages older than allowed years
    const activeVintages = lossVintages.filter(v => v.expiresAfterYear >= currentYear);
    const taxLossCarryforward = activeVintages.reduce((s, v) => s + v.amount, 0);

    if (!enabled || ebt <= 0) {
        // Add new loss vintage if EBT < 0
        const newVintages = ebt < 0
            ? [...activeVintages, { year: currentYear, amount: Math.abs(ebt), expiresAfterYear: currentYear + carryforwardYears }]
            : activeVintages;
        return {
            tax: 0,
            taxableIncome: ebt,
            taxLossUtilized: 0,
            taxLossRemaining: newVintages.reduce((s, v) => s + v.amount, 0),
            updatedVintages: newVintages,
            taxLossCarryforward,
        };
    }

    // 2. Utilize oldest losses first (FIFO)
    let remainingProfit = ebt;
    let utilized = 0;
    const updatedVintages = activeVintages.map(v => {
        if (remainingProfit <= 0) return v;
        const use = Math.min(remainingProfit, v.amount);
        remainingProfit -= use;
        utilized += use;
        return { ...v, amount: v.amount - use };
    }).filter(v => v.amount > 0.01);

    const taxableIncome = Math.max(0, ebt - utilized);
    const tax = taxableIncome * taxRate;

    return {
        tax,
        taxableIncome,
        taxLossUtilized: utilized,
        taxLossRemaining: updatedVintages.reduce((s, v) => s + v.amount, 0),
        updatedVintages,
        taxLossCarryforward,
    };
}

function calculateLegalReserveAddition(
    netIncome: number,
    priorLegalReserve: number,
    paidUpCapital: number,
    reservePercent: number = 0.05,
    reserveCap: number = 0.50,
    enabled: boolean = true,
): { addition: number; newBalance: number } {
    // Legal Reserve = 5% of Net Income (Law 159/1981 Art. 40)
    // Cap: cumulative reserve must not exceed 50% of ISSUED (paid-up) capital
    if (!enabled) return { addition: 0, newBalance: priorLegalReserve };
    const maxReserve = paidUpCapital * reserveCap;
    if (priorLegalReserve >= maxReserve || netIncome <= 0) {
        return { addition: 0, newBalance: priorLegalReserve };
    }
    const proposed = netIncome * reservePercent;
    const room = maxReserve - priorLegalReserve;
    const addition = Math.min(proposed, room);
    return { addition, newBalance: priorLegalReserve + addition };
}

export function calculateIncomeStatement(inputs: IncomeStatementInputs): IncomeStatementResult {
    const {
        assumptions, yearIndex, previousRevenue, depreciationFromSchedule,
        interestExpenseFromDebt, interestIncomeFromCash,
        taxLossVintages, priorLegalReserve,
        currentNWC, previousNWC, capex, previousRetainedEarnings,
    } = inputs;
    const yr = yearIndex;
    const currentYear = assumptions.startYear + yr;
    const period = `${currentYear}E`;

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

    // Pre-Tax
    const ebt = ebit + interestIncome - interestExpense + otherIncomeExpense;
    const taxRate = assumptions.taxRate[yr] ?? 0.225;

    // Tax with carryforward (C1)
    const taxResult = calculateTaxWithCarryforward(
        ebt, taxRate, taxLossVintages, currentYear,
        assumptions.taxLossCarryforwardYears ?? 5,
        assumptions.enableTaxLossCarryforward ?? true,
    );
    const taxExpense = taxResult.tax;

    // Net Income
    const netIncome = ebt - taxExpense;
    const netMargin = revenue !== 0 ? netIncome / revenue : 0;

    // ── Profit Appropriation (EAS Correct Sequence — Law 159/1981) ──
    // Step 1: Net Income (already computed above)
    // Step 2: Legal Reserve = 5% × Net Income (FIRST deduction)
    const legalReserve = calculateLegalReserveAddition(
        netIncome,
        priorLegalReserve,
        assumptions.paidUpCapital ?? 10_000,
        assumptions.legalReservePercent ?? 0.05,
        assumptions.legalReserveCap ?? 0.50,
        assumptions.enableLegalReserve ?? true,
    );

    // Step 3: Distributable Profit = NI − Legal Reserve
    const distributableProfit = netIncome - legalReserve.addition;

    // Step 4: EPD = 10% × MAX(0, Distributable Profit) (SECOND deduction)
    // Capped at total annual payroll (if provided)
    const rawEPD = (
        (assumptions.enableEmployeeProfitShare ?? true) && distributableProfit > 0
    ) ? distributableProfit * (assumptions.employeeProfitSharingRate ?? 0.10) : 0;
    const epdPayrollCap = assumptions.totalAnnualPayroll;
    const employeeProfitSharing = epdPayrollCap != null && epdPayrollCap > 0
        ? Math.min(rawEPD, epdPayrollCap)
        : rawEPD;

    // Step 5: NI After EPD = Distributable Profit − EPD
    const netIncomeAfterEPD = distributableProfit - employeeProfitSharing;

    // Step 6–9: Dividends with WHT (Law 30/2023: 5% EGX-listed, 10% unlisted)
    // IMP #10: Block dividends if cumulative RE is negative (Companies Law Art. 53)
    const canPayDividends = netIncomeAfterEPD > 0 && (previousRetainedEarnings ?? 0) >= 0;
    const dividendPayoutRatio = assumptions.dividendPayoutRatio[yr] ?? 0;
    const grossDividends = canPayDividends ? netIncomeAfterEPD * dividendPayoutRatio : 0;
    const dividendWHTRate = assumptions.isEGXListed
        ? 0.05  // EGX-listed: 5% WHT
        : (assumptions.dividendWithholdingTaxRate ?? 0.10);  // Unlisted: 10% WHT
    const dividendWHT = grossDividends * dividendWHTRate;
    const netDividends = grossDividends - dividendWHT;
    const additionToRE = netIncomeAfterEPD - grossDividends;

    // NOPAT (C7 memo)
    const effectiveTaxRate = ebt > 0 ? taxExpense / ebt : taxRate;
    const nopat = ebit * (1 - effectiveTaxRate);

    // FCFF (C7 memo)
    const changeInNWC = currentNWC - previousNWC;
    const fcff = nopat + depreciation + amortization - capex - changeInNWC;

    // Per Share — EPS uses NI After EPD (distributable to shareholders)
    const sharesOutstanding = assumptions.sharesOutstanding[yr] ?? 100_000;
    const eps = sharesOutstanding !== 0 ? netIncomeAfterEPD / sharesOutstanding : 0;

    // VAT memo (Egyptian market)
    let revenueInclVAT: number | undefined;
    let revenueExclVAT: number | undefined;
    let vatCollected: number | undefined;
    if (assumptions.enableVAT && assumptions.vatRate) {
        revenueExclVAT = revenue;
        vatCollected = revenue * assumptions.vatRate;
        revenueInclVAT = revenue + vatCollected;
    }

    const incomeStatement: IncomeStatement = {
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
        // Tax Loss Carryforward
        taxLossCarryforward: taxResult.taxLossCarryforward,
        taxLossUtilized: taxResult.taxLossUtilized,
        taxLossRemaining: taxResult.taxLossRemaining,
        taxableIncome: taxResult.taxableIncome,
        // Profit Appropriation
        legalReserveAddition: legalReserve.addition,
        distributableProfit,
        grossDividends,
        dividendWHT,
        netDividends,
        additionToRE,
        // Memo
        nopat,
        fcff,
        sharesOutstanding,
        eps,
        // VAT memo
        ...(revenueInclVAT !== undefined && { revenueInclVAT, revenueExclVAT, vatCollected }),
    };

    return {
        incomeStatement,
        updatedTaxLossVintages: taxResult.updatedVintages,
        newLegalReserve: legalReserve.newBalance,
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
        const stockBasedComp = 0;
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
            employeeProfitSharing: 0,
            netIncomeAfterEPD: netIncome,
            // Tax loss — historical: no carryforward modeled
            taxLossCarryforward: 0,
            taxLossUtilized: 0,
            taxLossRemaining: 0,
            taxableIncome: ebt,
            // Profit appropriation — historical: not modeled
            legalReserveAddition: 0,
            distributableProfit: netIncome,
            grossDividends: 0,
            dividendWHT: 0,
            netDividends: 0,
            additionToRE: netIncome,
            // Memo
            nopat: ebit * (1 - (ebt !== 0 ? taxExpense / ebt : 0.225)),
            fcff: 0, // historical FCFF not computed here
            sharesOutstanding,
            eps: sharesOutstanding !== 0 ? netIncome / sharesOutstanding : 0,
        };
    });
}
