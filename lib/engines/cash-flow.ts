// ============================================================
// Cash Flow Statement Calculation Engine (Indirect Method)
// ============================================================

import { CashFlowStatement, IncomeStatement, BalanceSheet } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';

export interface CashFlowInputs {
    assumptions: AssumptionSet;
    yearIndex: number;
    incomeStatement: IncomeStatement;
    currentBalanceSheet: BalanceSheet;
    previousBalanceSheet: BalanceSheet;
}

export function calculateCashFlow(inputs: CashFlowInputs): CashFlowStatement {
    const { assumptions, yearIndex, incomeStatement, currentBalanceSheet, previousBalanceSheet } = inputs;
    const yr = yearIndex;
    const period = `${assumptions.startYear + yr}E`;
    const curr = currentBalanceSheet;
    const prev = previousBalanceSheet;

    // ── OPERATING ACTIVITIES ────────────────────────────
    const netIncome = incomeStatement.netIncome;

    // Non-Cash Adjustments
    const depreciation = incomeStatement.depreciation;
    const amortization = incomeStatement.amortization;
    const stockBasedComp = assumptions.stockBasedCompAmount[yr] ?? 0;
    const deferredTaxes = curr.deferredTaxLiabilities - prev.deferredTaxLiabilities;

    // Working Capital Changes (increase in asset = cash outflow = negative)
    const changeInAR = -(curr.accountsReceivable - prev.accountsReceivable);
    const changeInInventory = -(curr.inventory - prev.inventory);
    const changeInPrepaid = -(curr.prepaidExpenses - prev.prepaidExpenses);
    const changeInAP = curr.accountsPayable - prev.accountsPayable;
    const changeInAccruedExp = curr.accruedExpenses - prev.accruedExpenses;
    const changeInDeferredRev = curr.deferredRevenue - prev.deferredRevenue;

    const totalWorkingCapitalChange = changeInAR + changeInInventory + changeInPrepaid +
        changeInAP + changeInAccruedExp + changeInDeferredRev;

    const cashFromOperations = netIncome + depreciation + amortization +
        stockBasedComp + deferredTaxes + totalWorkingCapitalChange;

    // ── INVESTING ACTIVITIES ────────────────────────────
    const capex = -(incomeStatement.revenue * (assumptions.capexPercent[yr] ?? 0.05));
    const acquisitions = -(assumptions.acquisitions[yr] ?? 0);
    const assetSales = assumptions.assetSales[yr] ?? 0;
    const investmentPurchases = -(assumptions.investmentPurchases[yr] ?? 0);
    const investmentSales = assumptions.investmentSales[yr] ?? 0;

    const cashFromInvesting = capex + acquisitions + assetSales + investmentPurchases + investmentSales;

    // ── FINANCING ACTIVITIES ────────────────────────────
    const debtIssuance = assumptions.longTermDebtIssuance[yr] ?? 0;
    const debtRepayment = -(assumptions.longTermDebtRepayment[yr] ?? 0);
    const equityIssuance = assumptions.equityIssuance[yr] ?? 0;

    // Dividends: from IS profit appropriation waterfall
    const dividendsPaid = -(incomeStatement.grossDividends);
    const shareRepurchases = -(assumptions.shareRepurchaseAmount[yr] ?? 0);

    // Employee Profit Sharing paid as cash outflow
    const employeeProfitSharingPaid = -(incomeStatement.employeeProfitSharing);

    // Dividend withholding tax — memo line showing ETA's portion of grossDividends
    // NOT a separate cash outflow: dividendsPaid = grossDividends already includes
    // both the net amount to shareholders AND the WHT remitted to ETA.
    // Total cash out = grossDividends = netDividends + dividendWHT
    const dividendWHT = -(incomeStatement.dividendWHT);

    const cashFromFinancing = debtIssuance + debtRepayment + equityIssuance +
        dividendsPaid + employeeProfitSharingPaid + shareRepurchases;

    // ── NET CASH FLOW ───────────────────────────────────
    const netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing;
    const beginningCash = prev.cash;
    const endingCash = beginningCash + netChangeInCash;

    // Free Cash Flow
    const freeCashFlow = cashFromOperations + capex; // capex is already negative

    // Reconciliation check: does CF ending cash match BS cash?
    const reconciles = Math.abs(endingCash - curr.cash) < 0.01;

    return {
        period,
        periodType: 'projected',
        netIncome,
        depreciation,
        amortization,
        stockBasedComp,
        deferredTaxes,
        changeInAR,
        changeInInventory,
        changeInPrepaid,
        changeInAP,
        changeInAccruedExp,
        changeInDeferredRev,
        totalWorkingCapitalChange,
        cashFromOperations,
        capex,
        acquisitions,
        assetSales,
        investmentPurchases,
        investmentSales,
        cashFromInvesting,
        debtIssuance,
        debtRepayment,
        equityIssuance,
        dividendsPaid,
        dividendWHT,
        employeeProfitSharingPaid,
        shareRepurchases,
        cashFromFinancing,
        netChangeInCash,
        beginningCash,
        endingCash,
        freeCashFlow,
        reconciles,
    };
}

// Build historical cash flow statements from period-over-period balance sheet changes
export function buildHistoricalCashFlows(
    incomeStatements: IncomeStatement[],
    balanceSheets: BalanceSheet[],
): CashFlowStatement[] {
    const results: CashFlowStatement[] = [];

    for (let i = 1; i < balanceSheets.length; i++) {
        const is = incomeStatements[i];
        const curr = balanceSheets[i];
        const prev = balanceSheets[i - 1];

        // ── OPERATING ACTIVITIES ────────────────────────────
        const changeInAR = -(curr.accountsReceivable - prev.accountsReceivable);
        const changeInInventory = -(curr.inventory - prev.inventory);
        const changeInPrepaid = -(curr.prepaidExpenses - prev.prepaidExpenses);
        const changeInAP = curr.accountsPayable - prev.accountsPayable;
        const changeInAccruedExp = curr.accruedExpenses - prev.accruedExpenses;
        const changeInDeferredRev = curr.deferredRevenue - prev.deferredRevenue;
        const totalWorkingCapitalChange = changeInAR + changeInInventory + changeInPrepaid +
            changeInAP + changeInAccruedExp + changeInDeferredRev;

        // SBC: use the IS depreciation/amortization for non-cash adjustments,
        // and estimate SBC from the equity change not explained by NI, dividends, etc.
        // For simplicity, use 0 if not available from IS; the reconciliation plug is dividends.
        const stockBasedComp = 0; // SBC is accounted for in equity issuance calc below

        const cashFromOperations = is.netIncome + is.depreciation + is.amortization +
            stockBasedComp + totalWorkingCapitalChange;

        // ── INVESTING ACTIVITIES ────────────────────────────
        const capex = -(curr.grossPPE - prev.grossPPE);
        const cashFromInvesting = capex;

        // ── FINANCING ACTIVITIES ────────────────────────────
        // Debt: back-solve from BS
        const debtChange = (curr.longTermDebt + curr.shortTermDebt) - (prev.longTermDebt + prev.shortTermDebt);
        const debtIssuance = Math.max(0, debtChange);
        const debtRepayment = -Math.max(0, -debtChange);

        // Dividends: back-solve from retained earnings changes
        // RE_curr = RE_prev + NI - Dividends  =>  Dividends = RE_prev + NI - RE_curr
        const dividendsPaid = -((prev.retainedEarnings + is.netIncome) - curr.retainedEarnings);

        // Stock Issuance: back-solve from APIC + Common Stock changes minus SBC
        // Cash from equity = (APIC_curr + CS_curr) - (APIC_prev + CS_prev) - SBC
        // SBC is non-cash compensation that increases APIC but doesn't bring in cash
        const prevEquityPaid = prev.additionalPaidInCapital + prev.commonStock;
        const currEquityPaid = curr.additionalPaidInCapital + curr.commonStock;
        // Estimate SBC from the assumption or IS if available; for historical, approximate
        // by looking at other comprehensive income or just assume 0 SBC for the cash calc
        const historicalSBC = 0; // If SBC data is available on IS, use it here
        const equityIssuance = (currEquityPaid - prevEquityPaid) - historicalSBC;

        const shareRepurchases = -(prev.treasuryStock - curr.treasuryStock);

        const cashFromFinancing = debtIssuance + debtRepayment + dividendsPaid + equityIssuance + shareRepurchases;

        // ── NET CASH FLOW ───────────────────────────────────
        const netChangeInCash = curr.cash - prev.cash;
        const beginningCash = prev.cash;
        const endingCash = curr.cash;
        const freeCashFlow = cashFromOperations + capex;
        const reconciles = Math.abs((beginningCash + (cashFromOperations + cashFromInvesting + cashFromFinancing)) - endingCash) < 0.01;

        results.push({
            period: is.period,
            periodType: 'historical',
            netIncome: is.netIncome,
            depreciation: is.depreciation,
            amortization: is.amortization,
            stockBasedComp,
            deferredTaxes: 0,
            changeInAR,
            changeInInventory,
            changeInPrepaid,
            changeInAP,
            changeInAccruedExp,
            changeInDeferredRev,
            totalWorkingCapitalChange,
            cashFromOperations,
            capex,
            acquisitions: 0,
            assetSales: 0,
            investmentPurchases: 0,
            investmentSales: 0,
            cashFromInvesting,
            debtIssuance,
            debtRepayment,
            equityIssuance,
            dividendsPaid,
            dividendWHT: 0,                   // Historical — not retroactively modeled
            employeeProfitSharingPaid: 0,      // Historical — not retroactively modeled
            shareRepurchases,
            cashFromFinancing,
            netChangeInCash,
            beginningCash,
            endingCash,
            freeCashFlow,
            reconciles,
        });
    }

    return results;
}
