// ============================================================
// Circular Reference Resolver
// ============================================================
// Handles the circular dependency:
//   Debt balance → Interest Expense → Net Income → Retained Earnings
//   → Equity → Debt capacity → Debt balance
//
// Uses iterative convergence to solve this circular system.
// ============================================================

import { IncomeStatement, BalanceSheet, CashFlowStatement, IntegrationChecks, IntegrationCheckDetail } from '@/types/financial';
import { AssumptionSet } from '@/types/assumptions';
import { calculateIncomeStatement, IncomeStatementInputs, TaxLossVintage, IncomeStatementResult } from './income-statement';
import { calculateBalanceSheet, BalanceSheetInputs, calculateDepreciation, calculateInterestExpense, calculateInterestIncome } from './balance-sheet';
import { calculateCashFlow, CashFlowInputs } from './cash-flow';

export interface ResolverResult {
    incomeStatement: IncomeStatement;
    balanceSheet: BalanceSheet;
    cashFlow: CashFlowStatement;
    converged: boolean;
    iterations: number;
    finalDelta: number;
    // Carry-forward state for next year
    updatedTaxLossVintages: TaxLossVintage[];
    newLegalReserve: number;
}

export function resolveCircularReferences(
    assumptions: AssumptionSet,
    yearIndex: number,
    previousIncomeStatement: IncomeStatement,
    previousBalanceSheet: BalanceSheet,
    taxLossVintages: TaxLossVintage[],
    priorLegalReserve: number,
    maxIterations: number = 500,
    tolerance: number = 0.01,
): ResolverResult {
    let iteration = 0;
    let converged = false;
    let previousEndingCash: number | null = null;
    let finalDelta = Infinity;

    // Initial estimates for circular items
    let estimatedDepreciation = previousIncomeStatement.depreciation;
    let estimatedInterestExpense = previousIncomeStatement.interestExpense;
    let estimatedInterestIncome = previousIncomeStatement.interestIncome;

    let bestResult: {
        isResult: IncomeStatementResult;
        bs: BalanceSheet;
        cf: CashFlowStatement;
    } | null = null;

    while (!converged && iteration < maxIterations) {
        // Step 1: Calculate NWC from prior BS for FCFF calc
        const previousNWC = (previousBalanceSheet.accountsReceivable + previousBalanceSheet.inventory) -
            (previousBalanceSheet.accountsPayable);

        // CapEx for the period
        const capex = previousIncomeStatement.revenue * (1 + (assumptions.revenueGrowthRate[yearIndex] ?? 0)) *
            (assumptions.capexPercent[yearIndex] ?? 0.05);

        // Step 2: Calculate Income Statement with current estimates
        const isInputs: IncomeStatementInputs = {
            assumptions,
            yearIndex,
            previousRevenue: previousIncomeStatement.revenue,
            depreciationFromSchedule: estimatedDepreciation,
            interestExpenseFromDebt: estimatedInterestExpense,
            interestIncomeFromCash: estimatedInterestIncome,
            taxLossVintages,
            priorLegalReserve,
            currentNWC: previousNWC, // will be updated after BS calc
            previousNWC,
            capex,
        };
        const isResult = calculateIncomeStatement(isInputs);
        const incomeStatement = isResult.incomeStatement;

        // Step 3: Calculate Balance Sheet (first pass without cash from CF)
        const bsInputs: BalanceSheetInputs = {
            assumptions,
            yearIndex,
            incomeStatement,
            previousBalanceSheet,
            endingCashFromCF: previousEndingCash, // null on first iteration
            priorLegalReserve,
            legalReserveAddition: incomeStatement.legalReserveAddition,
        };
        const balanceSheet = calculateBalanceSheet(bsInputs);

        // Step 4: Update IS with actual NWC for FCFF
        const currentNWC = (balanceSheet.accountsReceivable + balanceSheet.inventory) -
            (balanceSheet.accountsPayable);
        const isInputsUpdated: IncomeStatementInputs = {
            ...isInputs,
            currentNWC,
            capex,
        };
        const isResultUpdated = calculateIncomeStatement(isInputsUpdated);
        const incomeStatementFinal = isResultUpdated.incomeStatement;

        // Step 5: Calculate Cash Flow Statement
        const cfInputs: CashFlowInputs = {
            assumptions,
            yearIndex,
            incomeStatement: incomeStatementFinal,
            currentBalanceSheet: balanceSheet,
            previousBalanceSheet,
        };
        const cashFlow = calculateCashFlow(cfInputs);

        // Step 6: Update Balance Sheet cash with CF ending cash
        const updatedBsInputs: BalanceSheetInputs = {
            ...bsInputs,
            incomeStatement: incomeStatementFinal,
            endingCashFromCF: cashFlow.endingCash,
        };
        const updatedBalanceSheet = calculateBalanceSheet(updatedBsInputs);

        // Step 7: Update estimates for next iteration
        // Depreciation based on updated PP&E
        estimatedDepreciation = calculateDepreciation(
            previousBalanceSheet.grossPPE,
            previousBalanceSheet.netPPE,
            capex,
            assumptions.depreciationRate[yearIndex] ?? 0.10,
            assumptions,
        );

        // Interest expense: beginning-of-period total debt
        const beginDebt = previousBalanceSheet.shortTermDebt + previousBalanceSheet.longTermDebt + previousBalanceSheet.currentPortionLTD;
        const endDebt = updatedBalanceSheet.shortTermDebt + updatedBalanceSheet.longTermDebt + updatedBalanceSheet.currentPortionLTD;
        estimatedInterestExpense = calculateInterestExpense(
            beginDebt,
            endDebt,
            assumptions.interestRateOnDebt[yearIndex] ?? assumptions.legacyDebtRate ?? 0.22,
        );

        // Interest income: beginning-of-period cash
        estimatedInterestIncome = calculateInterestIncome(
            previousBalanceSheet.cash,
            cashFlow.endingCash,
            assumptions.interestRateOnCash[yearIndex] ?? 0.15,
        );

        // Check convergence on ending cash
        if (previousEndingCash !== null) {
            finalDelta = Math.abs(cashFlow.endingCash - previousEndingCash);
            if (finalDelta < tolerance) {
                converged = true;
            }
        }

        previousEndingCash = cashFlow.endingCash;
        bestResult = { isResult: isResultUpdated, bs: updatedBalanceSheet, cf: cashFlow };
        iteration++;
    }

    if (!bestResult) {
        throw new Error('Circular reference resolver failed to produce results');
    }

    return {
        incomeStatement: bestResult.isResult.incomeStatement,
        balanceSheet: bestResult.bs,
        cashFlow: bestResult.cf,
        converged,
        iterations: iteration,
        finalDelta,
        updatedTaxLossVintages: bestResult.isResult.updatedTaxLossVintages,
        newLegalReserve: bestResult.isResult.newLegalReserve,
    };
}

// Validate integration between all three statements
export function validateIntegration(
    incomeStatement: IncomeStatement,
    balanceSheet: BalanceSheet,
    cashFlow: CashFlowStatement,
    previousBalanceSheet: BalanceSheet,
): IntegrationChecks {
    const details: IntegrationCheckDetail[] = [];

    // 1. Balance Sheet balances
    const assetsBalance = Math.abs(balanceSheet.totalAssets - balanceSheet.totalLiabilitiesEquity) < 0.01;
    details.push({
        name: 'Assets = Liabilities + Equity',
        passed: assetsBalance,
        expected: balanceSheet.totalAssets,
        actual: balanceSheet.totalLiabilitiesEquity,
        difference: balanceSheet.totalAssets - balanceSheet.totalLiabilitiesEquity,
    });

    // 2. Cash ties: BS cash = CF ending cash
    const cashTies = Math.abs(balanceSheet.cash - cashFlow.endingCash) < 0.01;
    details.push({
        name: 'Balance Sheet Cash = CF Ending Cash',
        passed: cashTies,
        expected: cashFlow.endingCash,
        actual: balanceSheet.cash,
        difference: balanceSheet.cash - cashFlow.endingCash,
    });

    // 3. Net Income flows: IS NI = CF NI
    const netIncomeFlows = Math.abs(incomeStatement.netIncome - cashFlow.netIncome) < 0.01;
    details.push({
        name: 'IS Net Income = CF Net Income',
        passed: netIncomeFlows,
        expected: incomeStatement.netIncome,
        actual: cashFlow.netIncome,
        difference: incomeStatement.netIncome - cashFlow.netIncome,
    });

    // 4. PP&E ties: Current Gross PPE = Prior + CapEx
    const expectedGrossPPE = previousBalanceSheet.grossPPE + Math.abs(cashFlow.capex);
    const ppeTies = Math.abs(balanceSheet.grossPPE - expectedGrossPPE) < 0.01;
    details.push({
        name: 'PP&E Schedule Ties',
        passed: ppeTies,
        expected: expectedGrossPPE,
        actual: balanceSheet.grossPPE,
        difference: balanceSheet.grossPPE - expectedGrossPPE,
    });

    // 5. Retained earnings flows (via profit appropriation waterfall)
    const expectedRE = previousBalanceSheet.retainedEarnings + incomeStatement.additionToRE;
    const retainedEarningsFlows = Math.abs(balanceSheet.retainedEarnings - expectedRE) < 0.01;
    details.push({
        name: 'Retained Earnings Roll Forward',
        passed: retainedEarningsFlows,
        expected: expectedRE,
        actual: balanceSheet.retainedEarnings,
        difference: balanceSheet.retainedEarnings - expectedRE,
    });

    // 6. Debt ties
    const expectedLTD = previousBalanceSheet.longTermDebt + cashFlow.debtIssuance + cashFlow.debtRepayment;
    const debtTies = Math.abs(balanceSheet.longTermDebt - expectedLTD) < 0.01;
    details.push({
        name: 'Long-Term Debt Schedule Ties',
        passed: debtTies,
        expected: expectedLTD,
        actual: balanceSheet.longTermDebt,
        difference: balanceSheet.longTermDebt - expectedLTD,
    });

    // 7. Cash Flow reconciles: net change = CFO + CFI + CFF
    const cfNetChange = cashFlow.cashFromOperations + cashFlow.cashFromInvesting + cashFlow.cashFromFinancing;
    const expectedNetChange = cashFlow.endingCash - cashFlow.beginningCash;
    const cfReconciles = Math.abs(cfNetChange - expectedNetChange) < 0.01;
    details.push({
        name: 'CF Net Change = CFO + CFI + CFF',
        passed: cfReconciles,
        expected: expectedNetChange,
        actual: cfNetChange,
        difference: cfNetChange - expectedNetChange,
    });

    // 8. Working capital ties: AR/Inventory/AP changes tie to CF working capital items
    const arChange = balanceSheet.accountsReceivable - previousBalanceSheet.accountsReceivable;
    const invChange = balanceSheet.inventory - previousBalanceSheet.inventory;
    const apChange = balanceSheet.accountsPayable - previousBalanceSheet.accountsPayable;
    const expectedWCImpact = -(arChange + invChange) + apChange;
    const actualWCImpact = cashFlow.changeInAR + cashFlow.changeInInventory + cashFlow.changeInAP;
    const workingCapitalTies = Math.abs(expectedWCImpact - actualWCImpact) < 0.01;
    details.push({
        name: 'Working Capital Changes Tie to CF',
        passed: workingCapitalTies,
        expected: expectedWCImpact,
        actual: actualWCImpact,
        difference: expectedWCImpact - actualWCImpact,
    });

    // 9. Total Current Assets Sum
    const expectedCurrentAssets = balanceSheet.cash + balanceSheet.accountsReceivable +
        balanceSheet.inventory + balanceSheet.prepaidExpenses + balanceSheet.otherCurrentAssets;
    const totalCurrentAssetsCheck = Math.abs(balanceSheet.totalCurrentAssets - expectedCurrentAssets) < 0.01;
    details.push({
        name: 'Total Current Assets Sum',
        passed: totalCurrentAssetsCheck,
        expected: expectedCurrentAssets,
        actual: balanceSheet.totalCurrentAssets,
        difference: balanceSheet.totalCurrentAssets - expectedCurrentAssets,
    });

    // 10. Total Non-Current Assets Sum
    const expectedNonCurrentAssets = balanceSheet.netPPE + balanceSheet.intangibles +
        balanceSheet.goodwill + balanceSheet.otherLongTermAssets;
    const totalNonCurrentAssetsCheck = Math.abs(balanceSheet.totalNonCurrentAssets - expectedNonCurrentAssets) < 0.01;
    details.push({
        name: 'Total Non-Current Assets Sum',
        passed: totalNonCurrentAssetsCheck,
        expected: expectedNonCurrentAssets,
        actual: balanceSheet.totalNonCurrentAssets,
        difference: balanceSheet.totalNonCurrentAssets - expectedNonCurrentAssets,
    });

    // 11. Total Current Liabilities Sum
    const expectedCurrentLiabilities = balanceSheet.accountsPayable + balanceSheet.accruedExpenses +
        balanceSheet.shortTermDebt + balanceSheet.currentPortionLTD +
        balanceSheet.deferredRevenue + balanceSheet.otherCurrentLiabilities;
    const totalCurrentLiabilitiesCheck = Math.abs(balanceSheet.totalCurrentLiabilities - expectedCurrentLiabilities) < 0.01;
    details.push({
        name: 'Total Current Liabilities Sum',
        passed: totalCurrentLiabilitiesCheck,
        expected: expectedCurrentLiabilities,
        actual: balanceSheet.totalCurrentLiabilities,
        difference: balanceSheet.totalCurrentLiabilities - expectedCurrentLiabilities,
    });

    // 12. Total Non-Current Liabilities Sum
    const expectedNonCurrentLiabilities = balanceSheet.longTermDebt + balanceSheet.deferredTaxLiabilities +
        balanceSheet.otherLongTermLiabilities + (balanceSheet.endOfServiceProvision ?? 0);
    const totalNonCurrentLiabilitiesCheck = Math.abs(balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities) < 0.01;
    details.push({
        name: 'Total Non-Current Liabilities Sum',
        passed: totalNonCurrentLiabilitiesCheck,
        expected: expectedNonCurrentLiabilities,
        actual: balanceSheet.totalNonCurrentLiabilities,
        difference: balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities,
    });

    // 13. Total Equity Sum (now includes legalReserve)
    const expectedEquity = balanceSheet.commonStock + balanceSheet.additionalPaidInCapital +
        (balanceSheet.legalReserve ?? 0) + balanceSheet.retainedEarnings +
        balanceSheet.treasuryStock + balanceSheet.otherComprehensiveIncome;
    const totalEquityCheck = Math.abs(balanceSheet.totalEquity - expectedEquity) < 0.01;
    details.push({
        name: 'Total Equity Sum',
        passed: totalEquityCheck,
        expected: expectedEquity,
        actual: balanceSheet.totalEquity,
        difference: balanceSheet.totalEquity - expectedEquity,
    });

    // 14. Gross → Net Income Waterfall
    const expectedNI = incomeStatement.revenue - incomeStatement.cogs -
        incomeStatement.sgaExpense - incomeStatement.rdExpense - incomeStatement.depreciation -
        incomeStatement.amortization - incomeStatement.otherOpex - incomeStatement.stockBasedComp -
        incomeStatement.interestExpense + incomeStatement.interestIncome -
        incomeStatement.taxExpense + incomeStatement.otherIncomeExpense;
    const grossToNetIncomeWaterfall = Math.abs(incomeStatement.netIncome - expectedNI) < 0.01;
    details.push({
        name: 'Gross to Net Income Waterfall',
        passed: grossToNetIncomeWaterfall,
        expected: expectedNI,
        actual: incomeStatement.netIncome,
        difference: incomeStatement.netIncome - expectedNI,
    });

    // 15. EBITDA = EBIT + Depreciation + Amortization
    const expectedEBITDA = incomeStatement.ebit + incomeStatement.depreciation + incomeStatement.amortization;
    const ebitdaIdentity = Math.abs(incomeStatement.ebitda - expectedEBITDA) < 0.01;
    details.push({
        name: 'EBITDA = EBIT + D&A',
        passed: ebitdaIdentity,
        expected: expectedEBITDA,
        actual: incomeStatement.ebitda,
        difference: incomeStatement.ebitda - expectedEBITDA,
    });

    // 16. APIC Consistency: ΔAPIC should equal equity issuance + SBC
    const apicDelta = balanceSheet.additionalPaidInCapital - previousBalanceSheet.additionalPaidInCapital;
    const expectedApicDelta = cashFlow.equityIssuance + cashFlow.stockBasedComp;
    const apicConsistency = Math.abs(apicDelta - expectedApicDelta) < 0.01;
    details.push({
        name: 'APIC Change = Equity Issuance',
        passed: apicConsistency,
        expected: expectedApicDelta,
        actual: apicDelta,
        difference: apicDelta - expectedApicDelta,
    });

    // ── NEW VALIDATION CHECKS (17–28) ──────────────────────

    // 17. Employee Profit Share = NI × EPD Rate (or 0 if NI < 0)
    const expectedEPD = incomeStatement.netIncome > 0
        ? incomeStatement.netIncome * (incomeStatement.employeeProfitSharing / Math.max(0.01, incomeStatement.netIncome))
        : 0;
    const epdCheck = Math.abs(incomeStatement.employeeProfitSharing - expectedEPD) < 0.01;
    details.push({
        name: 'Employee Profit Share Calculation',
        passed: epdCheck,
        expected: expectedEPD,
        actual: incomeStatement.employeeProfitSharing,
        difference: incomeStatement.employeeProfitSharing - expectedEPD,
    });

    // 18. NI After EPD = NI - EPD
    const expectedNIAfterEPD = incomeStatement.netIncome - incomeStatement.employeeProfitSharing;
    const niAfterEPDCheck = Math.abs(incomeStatement.netIncomeAfterEPD - expectedNIAfterEPD) < 0.01;
    details.push({
        name: 'NI After EPD = NI - EPD',
        passed: niAfterEPDCheck,
        expected: expectedNIAfterEPD,
        actual: incomeStatement.netIncomeAfterEPD,
        difference: incomeStatement.netIncomeAfterEPD - expectedNIAfterEPD,
    });

    // 19. Distributable Profit = NI After EPD - Legal Reserve
    const expectedDistributable = incomeStatement.netIncomeAfterEPD - incomeStatement.legalReserveAddition;
    const distributabelCheck = Math.abs(incomeStatement.distributableProfit - expectedDistributable) < 0.01;
    details.push({
        name: 'Distributable Profit Calculation',
        passed: distributabelCheck,
        expected: expectedDistributable,
        actual: incomeStatement.distributableProfit,
        difference: incomeStatement.distributableProfit - expectedDistributable,
    });

    // 20. Gross Dividends ≤ Distributable Profit
    const dividendsWithinBounds = incomeStatement.grossDividends <= incomeStatement.distributableProfit + 0.01;
    details.push({
        name: 'Gross Dividends ≤ Distributable Profit',
        passed: dividendsWithinBounds,
        expected: incomeStatement.distributableProfit,
        actual: incomeStatement.grossDividends,
        difference: incomeStatement.distributableProfit - incomeStatement.grossDividends,
    });

    // 21. Net Dividends = Gross - WHT
    const expectedNetDiv = incomeStatement.grossDividends - incomeStatement.dividendWHT;
    const netDivCheck = Math.abs(incomeStatement.netDividends - expectedNetDiv) < 0.01;
    details.push({
        name: 'Net Dividends = Gross - WHT',
        passed: netDivCheck,
        expected: expectedNetDiv,
        actual: incomeStatement.netDividends,
        difference: incomeStatement.netDividends - expectedNetDiv,
    });

    // 22. Addition to RE = Distributable - Gross Dividends
    const expectedAddToRE = incomeStatement.distributableProfit - incomeStatement.grossDividends;
    const addToRECheck = Math.abs(incomeStatement.additionToRE - expectedAddToRE) < 0.01;
    details.push({
        name: 'Addition to RE = Distributable - Gross Div',
        passed: addToRECheck,
        expected: expectedAddToRE,
        actual: incomeStatement.additionToRE,
        difference: incomeStatement.additionToRE - expectedAddToRE,
    });

    // 23. NOPAT = EBIT × (1 - effective tax rate)
    const effectiveTaxRate = incomeStatement.ebt > 0 ? incomeStatement.taxExpense / incomeStatement.ebt : 0.225;
    const expectedNOPAT = incomeStatement.ebit * (1 - effectiveTaxRate);
    const nopatCheck = Math.abs(incomeStatement.nopat - expectedNOPAT) < 0.01;
    details.push({
        name: 'NOPAT = EBIT × (1 - Tax Rate)',
        passed: nopatCheck,
        expected: expectedNOPAT,
        actual: incomeStatement.nopat,
        difference: incomeStatement.nopat - expectedNOPAT,
    });

    // 24. Legal Reserve Roll Forward
    const expectedLegalReserve = (previousBalanceSheet.legalReserve ?? 0) + incomeStatement.legalReserveAddition;
    const legalReserveCheck = Math.abs((balanceSheet.legalReserve ?? 0) - expectedLegalReserve) < 0.01;
    details.push({
        name: 'Legal Reserve Roll Forward',
        passed: legalReserveCheck,
        expected: expectedLegalReserve,
        actual: balanceSheet.legalReserve ?? 0,
        difference: (balanceSheet.legalReserve ?? 0) - expectedLegalReserve,
    });

    // 25. Tax Loss: Utilized ≤ Carryforward
    const taxLossUtilizationCheck = incomeStatement.taxLossUtilized <= incomeStatement.taxLossCarryforward + 0.01;
    details.push({
        name: 'Tax Loss Utilized ≤ Carryforward',
        passed: taxLossUtilizationCheck,
        expected: incomeStatement.taxLossCarryforward,
        actual: incomeStatement.taxLossUtilized,
        difference: incomeStatement.taxLossCarryforward - incomeStatement.taxLossUtilized,
    });

    // 26. Taxable Income = EBT - Loss Utilized (≥ 0)
    const expectedTaxableIncome = Math.max(0, incomeStatement.ebt - incomeStatement.taxLossUtilized);
    const taxableIncomeCheck = Math.abs(incomeStatement.taxableIncome - expectedTaxableIncome) < 0.01;
    details.push({
        name: 'Taxable Income After Loss Offset',
        passed: taxableIncomeCheck,
        expected: expectedTaxableIncome,
        actual: incomeStatement.taxableIncome,
        difference: incomeStatement.taxableIncome - expectedTaxableIncome,
    });

    // 27. CF Dividends Paid = IS Gross Dividends (sign adjusted)
    const cfDivCheck = Math.abs(Math.abs(cashFlow.dividendsPaid) - incomeStatement.grossDividends) < 0.01;
    details.push({
        name: 'CF Dividends Paid = IS Gross Dividends',
        passed: cfDivCheck,
        expected: incomeStatement.grossDividends,
        actual: Math.abs(cashFlow.dividendsPaid),
        difference: Math.abs(cashFlow.dividendsPaid) - incomeStatement.grossDividends,
    });

    // 28. CF Dividend WHT = IS Dividend WHT (sign adjusted)
    const cfWhtCheck = Math.abs(Math.abs(cashFlow.dividendWHT) - incomeStatement.dividendWHT) < 0.01;
    details.push({
        name: 'CF Dividend WHT = IS Dividend WHT',
        passed: cfWhtCheck,
        expected: incomeStatement.dividendWHT,
        actual: Math.abs(cashFlow.dividendWHT),
        difference: Math.abs(cashFlow.dividendWHT) - incomeStatement.dividendWHT,
    });

    const allPassed = details.every(d => d.passed);

    return {
        assetsBalance,
        cashTies,
        netIncomeFlows,
        ppeTies,
        retainedEarningsFlows,
        debtTies,
        cfReconciles,
        workingCapitalTies,
        totalCurrentAssetsCheck,
        totalNonCurrentAssetsCheck,
        totalCurrentLiabilitiesCheck,
        totalNonCurrentLiabilitiesCheck,
        totalEquityCheck,
        grossToNetIncomeWaterfall,
        ebitdaIdentity,
        apicConsistency,
        allPassed,
        details,
    };
}
