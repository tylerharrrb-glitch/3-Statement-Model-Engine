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
import { calculateIncomeStatement, IncomeStatementInputs } from './income-statement';
import { calculateBalanceSheet, BalanceSheetInputs, calculateDepreciation, calculateInterestExpense, calculateInterestIncome } from './balance-sheet';
import { calculateCashFlow, CashFlowInputs } from './cash-flow';

export interface ResolverResult {
    incomeStatement: IncomeStatement;
    balanceSheet: BalanceSheet;
    cashFlow: CashFlowStatement;
    converged: boolean;
    iterations: number;
    finalDelta: number;
}

export function resolveCircularReferences(
    assumptions: AssumptionSet,
    yearIndex: number,
    previousIncomeStatement: IncomeStatement,
    previousBalanceSheet: BalanceSheet,
    maxIterations: number = 100,
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

    let bestResult: { is: IncomeStatement; bs: BalanceSheet; cf: CashFlowStatement } | null = null;

    while (!converged && iteration < maxIterations) {
        // Step 1: Calculate Income Statement with current estimates
        const isInputs: IncomeStatementInputs = {
            assumptions,
            yearIndex,
            previousRevenue: previousIncomeStatement.revenue,
            depreciationFromSchedule: estimatedDepreciation,
            interestExpenseFromDebt: estimatedInterestExpense,
            interestIncomeFromCash: estimatedInterestIncome,
        };
        const incomeStatement = calculateIncomeStatement(isInputs);

        // Step 2: Calculate Balance Sheet (first pass without cash from CF)
        const bsInputs: BalanceSheetInputs = {
            assumptions,
            yearIndex,
            incomeStatement,
            previousBalanceSheet,
            endingCashFromCF: previousEndingCash, // null on first iteration
        };
        const balanceSheet = calculateBalanceSheet(bsInputs);

        // Step 3: Calculate Cash Flow Statement
        const cfInputs: CashFlowInputs = {
            assumptions,
            yearIndex,
            incomeStatement,
            currentBalanceSheet: balanceSheet,
            previousBalanceSheet,
        };
        const cashFlow = calculateCashFlow(cfInputs);

        // Step 4: Update Balance Sheet cash with CF ending cash
        const updatedBsInputs: BalanceSheetInputs = {
            ...bsInputs,
            endingCashFromCF: cashFlow.endingCash,
        };
        const updatedBalanceSheet = calculateBalanceSheet(updatedBsInputs);

        // Step 5: Update estimates for next iteration
        // Depreciation based on updated PP&E
        const capex = incomeStatement.revenue * (assumptions.capexPercent[yearIndex] ?? 0.05);
        estimatedDepreciation = calculateDepreciation(
            previousBalanceSheet.grossPPE,
            capex,
            assumptions.depreciationRate[yearIndex] ?? 0.10,
        );

        // Interest expense: average of beginning & ending total debt
        const beginDebt = previousBalanceSheet.shortTermDebt + previousBalanceSheet.longTermDebt + previousBalanceSheet.currentPortionLTD;
        const endDebt = updatedBalanceSheet.shortTermDebt + updatedBalanceSheet.longTermDebt + updatedBalanceSheet.currentPortionLTD;
        estimatedInterestExpense = calculateInterestExpense(
            beginDebt,
            endDebt,
            assumptions.interestRate,
        );

        // Interest income: average of beginning & ending cash
        estimatedInterestIncome = calculateInterestIncome(
            previousBalanceSheet.cash,
            cashFlow.endingCash,
            assumptions.interestIncomeRate,
        );

        // Check convergence on ending cash
        if (previousEndingCash !== null) {
            finalDelta = Math.abs(cashFlow.endingCash - previousEndingCash);
            if (finalDelta < tolerance) {
                converged = true;
            }
        }

        previousEndingCash = cashFlow.endingCash;
        bestResult = { is: incomeStatement, bs: updatedBalanceSheet, cf: cashFlow };
        iteration++;
    }

    if (!bestResult) {
        throw new Error('Circular reference resolver failed to produce results');
    }

    return {
        incomeStatement: bestResult.is,
        balanceSheet: bestResult.bs,
        cashFlow: bestResult.cf,
        converged,
        iterations: iteration,
        finalDelta,
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

    // 5. Retained earnings flows
    const expectedRE = previousBalanceSheet.retainedEarnings + incomeStatement.netIncome + cashFlow.dividendsPaid;
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
    const expectedWCImpact = -(arChange + invChange) + apChange; // negative for uses, positive for sources
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
    const expectedNonCurrentLiabilities = balanceSheet.longTermDebt + balanceSheet.deferredTaxLiabilities + balanceSheet.otherLongTermLiabilities;
    const totalNonCurrentLiabilitiesCheck = Math.abs(balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities) < 0.01;
    details.push({
        name: 'Total Non-Current Liabilities Sum',
        passed: totalNonCurrentLiabilitiesCheck,
        expected: expectedNonCurrentLiabilities,
        actual: balanceSheet.totalNonCurrentLiabilities,
        difference: balanceSheet.totalNonCurrentLiabilities - expectedNonCurrentLiabilities,
    });

    // 13. Total Equity Sum
    const expectedEquity = balanceSheet.commonStock + balanceSheet.additionalPaidInCapital +
        balanceSheet.retainedEarnings + balanceSheet.treasuryStock + balanceSheet.otherComprehensiveIncome;
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
