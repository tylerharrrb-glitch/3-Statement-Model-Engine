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
    // Thin Capitalization (Law 30/2023) — balance sheet data for D/E check
    totalDebt: number;     // STD + LTD + CPLTD from prior BS
    totalEquity: number;   // from prior BS
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

// ── Thin Capitalization Compliance (Law No. 30 of 2023) ──────────────
// Restricts interest deductibility based on D/E ratio and CBE rate ceiling.
// 2024–2027: Max D/E = 3:1 | 2028+: Max D/E = 2:1
// Rate ceiling: deductible rate ≤ 2× CBE discount rate at year-start
function calculateThinCapCompliance(
    interestExpense: number,
    totalDebt: number,
    totalEquity: number,
    cbeRate: number,
    calendarYear: number,
    enableThinCap: boolean,
): { deductible: number; disallowed: number; deRatioLimit: number; rateCeiling: number } {
    if (!enableThinCap || totalDebt <= 0 || totalEquity <= 0 || interestExpense <= 0) {
        return {
            deductible: interestExpense,
            disallowed: 0,
            deRatioLimit: calendarYear >= 2028 ? 2.0 : 3.0,
            rateCeiling: cbeRate * 2,
        };
    }
    const deRatioLimit = calendarYear >= 2028 ? 2.0 : 3.0;
    const rateCeiling = cbeRate * 2; // e.g. 0.195 * 2 = 0.39 (39%)

    // Step 1: Rate cap — compute interest at capped rate
    const effectiveRate = interestExpense / totalDebt;
    const cappedRate = Math.min(effectiveRate, rateCeiling);
    const rateCapInterest = totalDebt * cappedRate;

    // Step 2: D/E cap — limit deductible debt
    const currentDE = totalDebt / totalEquity;
    let deductibleInterest = rateCapInterest;
    if (currentDE > deRatioLimit) {
        const deductibleDebtFraction = (totalEquity * deRatioLimit) / totalDebt;
        deductibleInterest = rateCapInterest * deductibleDebtFraction;
    }

    const disallowed = Math.max(0, interestExpense - deductibleInterest);
    return {
        deductible: interestExpense - disallowed,
        disallowed,
        deRatioLimit,
        rateCeiling,
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
        totalDebt, totalEquity,
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
    // Tax rate — regime-aware (Fix 2: removed blanket clamp that broke SME)
    let taxRate = assumptions.taxRate[yr] ?? 0.225;
    const taxRegime = assumptions.taxRegime ?? 'standard';
    if (taxRegime === 'standard' && taxRate > 0 && taxRate < 0.05) {
        console.warn(`[Tax] Standard regime taxRate ${(taxRate * 100).toFixed(2)}% below 5% for year ${yr} — verify intentional.`);
    }

    // ── Thin Capitalization Compliance (Law 30/2023) ──────────────────
    const thinCap = calculateThinCapCompliance(
        interestExpense, totalDebt, totalEquity,
        assumptions.cbeRate, currentYear,
        assumptions.enableThinCapRule ?? true,
    );

    // Tax with carryforward (C1) — adjusted for thin-cap disallowance
    const taxResult = calculateTaxWithCarryforward(
        ebt + thinCap.disallowed, // add back non-deductible interest to taxable base
        taxRate, taxLossVintages, currentYear,
        assumptions.taxLossCarryforwardYears ?? 5,
        assumptions.enableTaxLossCarryforward ?? true,
    );
    const taxExpense = taxResult.tax;

    // Net Income
    const netIncome = ebt - taxExpense;
    const netMargin = revenue !== 0 ? netIncome / revenue : 0;

    // ── Profit Appropriation (Egyptian Law — Labor Law No. 14/2025 + Companies Law Art.40-42) ──
    // Both EPD and Legal Reserve are computed INDEPENDENTLY on Net Income.
    // Neither is deducted before computing the other.

    // Step 1: Net Income (already computed above)

    // Step 2: Legal Reserve = 5% × Net Income (Companies Law Art.40)
    const legalReserve = calculateLegalReserveAddition(
        netIncome,
        priorLegalReserve,
        assumptions.paidUpCapital ?? 10_000,
        assumptions.legalReservePercent ?? 0.05,
        assumptions.legalReserveCap ?? 0.50,
        assumptions.enableLegalReserve ?? true,
    );

    // Step 3: EPD = 10% × NI base (Labor Law No. 14/2025 — replaces Law 137/1981)
    // When enableNonOperatingExclusion is true, exclude non-operating gains from EPD base
    // Capped at total annual payroll (if provided)
    const epdBase = (assumptions.enableNonOperatingExclusion ?? false)
        ? Math.max(0, netIncome - Math.max(0, otherIncomeExpense))
        : netIncome;
    const rawEPD = (
        (assumptions.enableEmployeeProfitShare ?? true) && epdBase > 0
    ) ? epdBase * (assumptions.employeeProfitSharingRate ?? 0.10) : 0;
    const epdPayrollCap = assumptions.totalAnnualPayroll;
    const employeeProfitSharing = epdPayrollCap != null && epdPayrollCap > 0
        ? Math.min(rawEPD, epdPayrollCap)
        : rawEPD;

    // Step 4: NI After EPD = NI − EPD
    const netIncomeAfterEPD = netIncome - employeeProfitSharing;

    // Step 5: Distributable Profit = NI − EPD − Legal Reserve
    const distributableProfit = netIncome - employeeProfitSharing - legalReserve.addition;

    // Step 6–9: Dividends with WHT (Law 30/2023: 5% EGX-listed, 10% unlisted)
    // IMP #10: Block dividends if cumulative RE is negative (Companies Law Art. 53)
    const canPayDividends = distributableProfit > 0 && (previousRetainedEarnings ?? 0) >= 0;
    const dividendPayoutRatio = assumptions.dividendPayoutRatio[yr] ?? 0;
    const grossDividends = canPayDividends ? distributableProfit * dividendPayoutRatio : 0;
    const dividendWHTRate = assumptions.isEGXListed
        ? 0.05  // EGX-listed: 5% WHT
        : (assumptions.dividendWithholdingTaxRate ?? 0.10);  // Unlisted: 10% WHT
    const dividendWHT = grossDividends * dividendWHTRate;
    const netDividends = grossDividends - dividendWHT;
    const additionToRE = distributableProfit - grossDividends;

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
        // Thin Capitalization (Law 30/2023)
        disallowedInterest: thinCap.disallowed,
        adjustedTaxableIncome: taxResult.taxableIncome,
        thinCapDeRatioLimit: thinCap.deRatioLimit,
        thinCapRateCeiling: thinCap.rateCeiling,
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
    },
    retainedEarnings?: number[],  // Fix 8: optional BS RE array for actual additionToRE
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
            // Profit appropriation — historical: use actual BS RE change (Fix 8)
            legalReserveAddition: 0,
            distributableProfit: netIncome,
            grossDividends: 0,
            dividendWHT: 0,
            netDividends: 0,
            additionToRE: retainedEarnings && i > 0
                ? retainedEarnings[i] - retainedEarnings[i - 1]  // actual RE change
                : netIncome,  // fallback: assume all NI flows to RE
            // Memo
            nopat: ebit * (1 - (ebt !== 0 ? taxExpense / ebt : 0.225)),
            fcff: 0, // historical FCFF not computed here
            sharesOutstanding,
            eps: sharesOutstanding !== 0 ? netIncome / sharesOutstanding : 0,
        };
    });
}
