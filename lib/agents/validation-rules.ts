// ============================================================
// AI Validation Agent — Deterministic Validation Rules
// ============================================================
// These run instantly, for FREE, before calling the AI.
// They catch the most common errors deterministically.
// ============================================================

import type {
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  FinancialRatios,
} from '@/types/financial';
import type { AssumptionSet } from '@/types/assumptions';
import type { ValidationFinding, LocalCheckResult } from './validation-types';

const TOL = 0.01; // tolerance for monetary comparisons

function findingBuilder(
  rule: number,
  severity: ValidationFinding['severity'],
  period: string,
  scenario: string,
  field: string,
  expected: number,
  actual: number,
  explanation: string,
  fixInstruction: string
): ValidationFinding {
  return {
    rule, severity, period, scenario, field,
    expected, actual,
    difference: actual - expected,
    explanation, fixInstruction,
  };
}

// ─────────────────────────────────────────
// RULE 1: Balance Sheet must balance
// ─────────────────────────────────────────
export function checkBalanceSheetBalance(
  bs: BalanceSheet[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of bs) {
    const diff = Math.abs(period.totalAssets - period.totalLiabilitiesEquity);
    if (diff > TOL) {
      findings.push(findingBuilder(
        1, 'critical', period.period, scenario,
        'totalAssets vs totalLiabilitiesEquity',
        period.totalLiabilitiesEquity, period.totalAssets,
        `Balance sheet is imbalanced by ${diff.toFixed(4)}. ` +
        `This means Cash (the plug) has the wrong value, or Equity is incorrectly computed.`,
        `Ensure: Cash = TotalL+E − AR − Inventory − Prepaid − OCA − TotalNCA. ` +
        `Also verify Retained Earnings roll: RE_t = RE_{t-1} + AdditionToRE.`
      ));
    }
  }
  return { checkName: 'Balance Sheet Balance (Rule 1)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 2: CF Ending Cash = BS Cash
// ─────────────────────────────────────────
export function checkCashReconciliation(
  bs: BalanceSheet[],
  cf: CashFlowStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const cfPeriod of cf) {
    if (cfPeriod.periodType !== 'projected') continue;
    const bsPeriod = bs.find(b => b.period === cfPeriod.period);
    if (!bsPeriod) continue;
    const diff = Math.abs(cfPeriod.endingCash - bsPeriod.cash);
    if (diff > TOL) {
      findings.push(findingBuilder(
        2, 'critical', cfPeriod.period, scenario,
        'endingCash (CF) vs cash (BS)',
        bsPeriod.cash, cfPeriod.endingCash,
        `CF ending cash (${cfPeriod.endingCash.toFixed(2)}) ≠ BS cash (${bsPeriod.cash.toFixed(2)}). ` +
        `Difference: ${diff.toFixed(4)}. Model does not reconcile.`,
        `Check that Dividends Paid in CFF uses Distributable Profit (not NI After EPD) as base. ` +
        `Verify EPD Paid, Debt Repayment, and Equity Issuance are all correctly included in CFF.`
      ));
    }
  }
  return { checkName: 'CF Ending Cash = BS Cash (Rule 2)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 3: Revenue Chain Integrity
// ─────────────────────────────────────────
export function checkRevenueChain(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (let i = 1; i < is.length; i++) {
    const prev = is[i - 1];
    const curr = is[i];
    if (curr.periodType !== 'projected') continue;
    const expected = prev.revenue * (1 + curr.revenueGrowthRate);
    if (Math.abs(curr.revenue - expected) > TOL) {
      findings.push(findingBuilder(
        3, 'critical', curr.period, scenario,
        'revenue',
        expected, curr.revenue,
        `Revenue (${curr.revenue}) ≠ prior_revenue × (1 + growth_rate) = ${expected.toFixed(2)}. ` +
        `Growth rate used: ${(curr.revenueGrowthRate * 100).toFixed(2)}%.`,
        `Revenue must always chain: Revenue_t = Revenue_{t-1} × (1 + growthRate_t). ` +
        `Check that growthRate is correctly read from assumptions for period ${curr.period}.`
      ));
    }
  }
  return { checkName: 'Revenue Chain (Rule 3)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 4: Net Income Math (EBT - Tax = NI)
// ─────────────────────────────────────────
export function checkNetIncomeMath(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    const expected = period.ebt - period.taxExpense;
    if (Math.abs(period.netIncome - expected) > TOL) {
      findings.push(findingBuilder(
        4, 'critical', period.period, scenario,
        'netIncome',
        expected, period.netIncome,
        `NI (${period.netIncome.toFixed(2)}) ≠ EBT - Tax = ${expected.toFixed(2)}`,
        `netIncome = ebt − taxExpense`
      ));
    }
  }
  return { checkName: 'Net Income Math (Rule 4)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULES 6–11: Egyptian Profit Appropriation
// ─────────────────────────────────────────
export function checkEgyptianProfitAppropriation(
  is: IncomeStatement[],
  assumptions: AssumptionSet,
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  const numHistorical = is.filter(p => p.periodType === 'historical').length;
  let cumulativeLR = assumptions.initialLegalReserve ?? 0;

  for (let idx = 0; idx < is.length; idx++) {
    const period = is[idx];
    const p = period.period;
    const ni = period.netIncome;
    const epdRate = assumptions.employeeProfitSharingRate ?? 0.10;
    const whtRate = assumptions.dividendWithholdingTaxRate ?? 0.10;
    const lrRate = assumptions.legalReservePercent ?? 0.05;
    // paidUpCapital must trace to opening common stock — fall back to first BS commonStock if assumption is missing
    const effectivePaidUpCapital = (assumptions.paidUpCapital && assumptions.paidUpCapital > 0)
      ? assumptions.paidUpCapital
      : 0;
    const lrCap = effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50);

    // Get per-year payout ratio (arrays are zero-indexed from projection year 0)
    const projIdx = idx - numHistorical;
    const payoutRate = projIdx >= 0 && Array.isArray(assumptions.dividendPayoutRatio)
      ? (assumptions.dividendPayoutRatio[projIdx] ?? 0.30)
      : 0.30;

    // Rule 6: EPD
    const expectedEPD = period.periodType === 'historical' ? period.employeeProfitSharing
      : Math.max(0, ni * epdRate);
    if (Math.abs(period.employeeProfitSharing - expectedEPD) > TOL) {
      findings.push(findingBuilder(6, 'critical', p, scenario,
        'employeeProfitSharing',
        expectedEPD, period.employeeProfitSharing,
        `EPD should be max(0, NI × ${(epdRate * 100).toFixed(0)}%) = ${expectedEPD.toFixed(2)}`,
        `EPD = max(0, netIncome × employeeProfitSharingRate)`
      ));
    }

    // Rule 7: Legal Reserve
    const expectedLRAdd = period.periodType === 'historical' ? period.legalReserveAddition
      : (ni <= 0 ? 0 : Math.min(ni * lrRate, Math.max(0, lrCap - cumulativeLR)));
    if (Math.abs(period.legalReserveAddition - expectedLRAdd) > TOL) {
      findings.push(findingBuilder(7, 'critical', p, scenario,
        'legalReserveAddition',
        expectedLRAdd, period.legalReserveAddition,
        `Legal Reserve addition should be min(NI × 5%, max(0, cap − cumulative)) = ${expectedLRAdd.toFixed(2)}. ` +
        `Current cumulative before this period: ${cumulativeLR.toFixed(2)}, cap: ${lrCap.toFixed(2)}`,
        `legalReserveAddition = min(netIncome × 0.05, max(0, paidUpCapital × 0.50 − cumulativeLR))`
      ));
    }
    cumulativeLR += period.legalReserveAddition;

    // Rule 8: Distributable Profit
    const niAfterEPD = ni - period.employeeProfitSharing;
    const expectedDistributable = niAfterEPD - period.legalReserveAddition;
    if (Math.abs(period.distributableProfit - expectedDistributable) > TOL) {
      findings.push(findingBuilder(8, 'critical', p, scenario,
        'distributableProfit',
        expectedDistributable, period.distributableProfit,
        `Distributable = NI_after_EPD − Legal_Reserve_addition = ${expectedDistributable.toFixed(2)}`,
        `distributableProfit = netIncomeAfterEPD − legalReserveAddition`
      ));
    }

    // Rule 9: DIVIDEND BASE — THE CRITICAL CHECK
    if (period.periodType === 'projected') {
      const expectedGrossDivs = Math.max(0, period.distributableProfit * payoutRate);
      if (Math.abs(period.grossDividends - expectedGrossDivs) > TOL) {
        findings.push(findingBuilder(9, 'critical', p, scenario,
          'grossDividends',
          expectedGrossDivs, period.grossDividends,
          `DIVIDEND BASE ERROR: Gross Dividends (${period.grossDividends.toFixed(2)}) ≠ ` +
          `Distributable × payout (${period.distributableProfit.toFixed(2)} × ${payoutRate} = ${expectedGrossDivs.toFixed(2)}). ` +
          `Egyptian Law 159/1981: dividends must be based on Distributable Profit, NOT NI After EPD.`,
          `grossDividends = max(0, distributableProfit × dividendPayoutRatio). ` +
          `NOT: netIncomeAfterEPD × payoutRatio. This is the root cause of BS imbalance.`
        ));
      }
    }

    // Rule 10: Dividend WHT
    const expectedWHT = period.grossDividends * whtRate;
    if (Math.abs(period.dividendWHT - expectedWHT) > TOL) {
      findings.push(findingBuilder(10, 'critical', p, scenario,
        'dividendWHT',
        expectedWHT, period.dividendWHT,
        `WHT = Gross_Dividends × ${(whtRate * 100).toFixed(0)}% = ${expectedWHT.toFixed(2)}`,
        `dividendWHT = grossDividends × dividendWithholdingTaxRate`
      ));
    }

    // Rule 11: Addition to Retained Earnings
    // Only check for projected periods — historical additionToRE = actual BS RE change,
    // which includes prior-year dividend payments and is NOT formula-driven
    if (period.periodType === 'projected') {
      const expectedAddToRE = period.distributableProfit - period.grossDividends;
      if (Math.abs(period.additionToRE - expectedAddToRE) > TOL) {
        findings.push(findingBuilder(11, 'critical', p, scenario,
          'additionToRE',
          expectedAddToRE, period.additionToRE,
          `Addition to RE = Distributable − Gross_Dividends = ${expectedAddToRE.toFixed(2)}`,
          `additionToRE = distributableProfit − grossDividends`
        ));
      }
    }
  }

  return {
    checkName: 'Egyptian Profit Appropriation (Rules 6–11)',
    passed: findings.length === 0,
    findings
  };
}

// ─────────────────────────────────────────
// RULE 12: Retained Earnings Roll
// ─────────────────────────────────────────
export function checkRetainedEarningsRoll(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (let i = 1; i < bs.length; i++) {
    if (bs[i].periodType !== 'projected') continue;
    const expectedRE = bs[i - 1].retainedEarnings + is[i].additionToRE;
    const diff = Math.abs(bs[i].retainedEarnings - expectedRE);
    if (diff > 1.0) { // wider tolerance for RE roll due to rounding
      findings.push(findingBuilder(
        12, 'critical', bs[i].period, scenario,
        'retainedEarnings',
        expectedRE, bs[i].retainedEarnings,
        `RE roll: RE_t (${bs[i].retainedEarnings.toFixed(2)}) ≠ RE_{t-1} (${bs[i - 1].retainedEarnings.toFixed(2)}) + AddRE (${is[i].additionToRE.toFixed(2)}) = ${expectedRE.toFixed(2)}`,
        `retainedEarnings_t = retainedEarnings_{t-1} + additionToRE_t`
      ));
    }
  }
  return { checkName: 'Retained Earnings Roll (Rule 12)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 13: Tax Calculation
// ─────────────────────────────────────────
export function checkTaxCalculation(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    if (period.periodType !== 'projected') continue;
    const expected = Math.max(0, period.ebt * period.taxRate);
    if (Math.abs(period.taxExpense - expected) > TOL) {
      findings.push(findingBuilder(13, 'critical', period.period, scenario,
        'taxExpense', expected, period.taxExpense,
        `Tax = max(0, EBT × taxRate) = max(0, ${period.ebt.toFixed(2)} × ${period.taxRate}) = ${expected.toFixed(2)}`,
        `taxExpense = max(0, ebt × taxRate)`
      ));
    }
  }
  return { checkName: 'Tax Calculation (Rule 13)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 15: CF Net Change = CFO + CFI + CFF
// ─────────────────────────────────────────
export function checkCFNetChange(
  cf: CashFlowStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of cf) {
    const cfo = period.cashFromOperations;
    const cfi = period.cashFromInvesting;
    const cff = period.cashFromFinancing;
    const expected = cfo + cfi + cff;
    // Scale tolerance to magnitude — EGP values run into billions, so 0.01 absolute
    // tolerance produces false positives from floating-point error.
    // Allow max(TOL, 1e-6 × Σ|component|).
    const tolerance = Math.max(TOL, 1e-6 * (Math.abs(cfo) + Math.abs(cfi) + Math.abs(cff)));
    if (Math.abs(period.netChangeInCash - expected) > tolerance) {
      findings.push(findingBuilder(
        15, 'critical', period.period, scenario,
        'netChangeInCash',
        expected, period.netChangeInCash,
        `Net Change (${period.netChangeInCash.toFixed(2)}) ≠ CFO + CFI + CFF = ${expected.toFixed(2)} ` +
        `(CFO=${cfo.toFixed(2)}, CFI=${cfi.toFixed(2)}, CFF=${cff.toFixed(2)})`,
        `netChangeInCash = cashFromOperations + cashFromInvesting + cashFromFinancing`
      ));
    }
  }
  return { checkName: 'CF Net Change (Rule 15)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 16: Ending Cash = Beginning + Net Change
// ─────────────────────────────────────────
export function checkEndingCash(
  cf: CashFlowStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of cf) {
    const expected = period.beginningCash + period.netChangeInCash;
    const tolerance = Math.max(TOL, 1e-6 * (Math.abs(period.beginningCash) + Math.abs(period.netChangeInCash)));
    if (Math.abs(period.endingCash - expected) > tolerance) {
      findings.push(findingBuilder(
        16, 'critical', period.period, scenario,
        'endingCash',
        expected, period.endingCash,
        `Ending Cash (${period.endingCash.toFixed(2)}) ≠ Beginning + Net Change = ${expected.toFixed(2)}`,
        `endingCash = beginningCash + netChangeInCash`
      ));
    }
  }
  return { checkName: 'Ending Cash (Rule 16)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 17: NOPAT Formula
// ─────────────────────────────────────────
export function checkNOPAT(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    if (period.periodType !== 'projected') continue;
    const expected = period.ebit * (1 - period.taxRate);
    if (Math.abs(period.nopat - expected) > 1.0) {
      findings.push(findingBuilder(
        17, 'major', period.period, scenario,
        'nopat', expected, period.nopat,
        `NOPAT should be EBIT × (1 − taxRate) = ${expected.toFixed(2)}`,
        `nopat = ebit × (1 − taxRate)`
      ));
    }
  }
  return { checkName: 'NOPAT Formula (Rule 17)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 20: EBITDA Consistency
// ─────────────────────────────────────────
export function checkEBITDA(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    const expected = period.ebit + period.depreciation + period.amortization;
    if (Math.abs(period.ebitda - expected) > 0.5) {
      findings.push(findingBuilder(20, 'major', period.period, scenario,
        'ebitda', expected, period.ebitda,
        `EBITDA should be EBIT + D + A = ${expected.toFixed(2)}`,
        `ebitda = ebit + depreciation + amortization`
      ));
    }
  }
  return { checkName: 'EBITDA Consistency (Rule 20)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 26: ROIC Formula
// ─────────────────────────────────────────
export function checkROIC(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  ratios: FinancialRatios[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < is.length; i++) {
    const isp = is[i];
    const bsp = bs[i];
    const r = ratios[i];
    if (!r || !bsp) continue;
    // Unified ROIC formula:
    //   investedCapital[t] = totalDebt[t] + totalEquity[t] − cash[t]
    //   avgInvestedCapital[t] = (IC[t] + IC[t-1]) / 2 (or IC[0] for first period)
    //   NOPAT = EBIT × (1 − effectiveTaxRate)
    //   ROIC = NOPAT / avgInvestedCapital
    const effectiveTaxRate = isp.ebt > 0 ? isp.taxExpense / isp.ebt : isp.taxRate;
    const nopat = isp.ebit * (1 - effectiveTaxRate);
    const debtCurr = bsp.shortTermDebt + bsp.longTermDebt + bsp.currentPortionLTD;
    const icCurr = bsp.totalEquity + debtCurr - bsp.cash;
    let avgIC = icCurr;
    if (i > 0) {
      const prevBs = bs[i - 1];
      const debtPrev = prevBs.shortTermDebt + prevBs.longTermDebt + prevBs.currentPortionLTD;
      const icPrev = prevBs.totalEquity + debtPrev - prevBs.cash;
      avgIC = (icCurr + icPrev) / 2;
    }
    if (avgIC === 0) continue;
    const expectedROIC = nopat / avgIC;
    if (r.roic !== undefined && Math.abs(r.roic - expectedROIC) > 0.001) {
      findings.push(findingBuilder(26, 'major', isp.period, scenario,
        'roic', expectedROIC, r.roic,
        `ROIC should be NOPAT / avg(InvestedCapital) where IC = Debt + Equity − Cash. ` +
        `Expected: ${nopat.toFixed(2)} / ${avgIC.toFixed(2)} = ${expectedROIC.toFixed(4)}`,
        `roic = EBIT × (1 − effectiveTaxRate) / avg(totalDebt + totalEquity − cash). ` +
        `Use period-specific effective tax rate (taxExpense / ebt).`
      ));
    }
  }
  return { checkName: 'ROIC Formula (Rule 26)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 27: ROE Formula
// ─────────────────────────────────────────
export function checkROE(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  ratios: FinancialRatios[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < is.length; i++) {
    const r = ratios[i];
    const bsp = bs[i];
    if (!r || !bsp || bsp.totalEquity === 0) continue;
    // Use average equity (matching engine): (prevEquity + currEquity) / 2
    const prevEquity = i > 0 ? bs[i - 1].totalEquity : bsp.totalEquity;
    const avgEquity = (prevEquity + bsp.totalEquity) / 2;
    const expected = avgEquity !== 0 ? is[i].netIncome / avgEquity : 0;
    if (Math.abs(r.roe - expected) > 0.001) {
      findings.push(findingBuilder(27, 'major', is[i].period, scenario,
        'roe', expected, r.roe,
        `ROE should be NI / Avg_Equity = ${is[i].netIncome.toFixed(2)} / ${avgEquity.toFixed(2)} = ${expected.toFixed(4)}`,
        `roe = netIncome / ((prevEquity + currEquity) / 2)`
      ));
    }
  }
  return { checkName: 'ROE Formula (Rule 27)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 28: ROA Formula
// ─────────────────────────────────────────
export function checkROA(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  ratios: FinancialRatios[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (let i = 0; i < is.length; i++) {
    const r = ratios[i];
    const bsp = bs[i];
    if (!r || !bsp || bsp.totalAssets === 0) continue;
    // Use average assets (matching engine): (prevAssets + currAssets) / 2
    const prevAssets = i > 0 ? bs[i - 1].totalAssets : bsp.totalAssets;
    const avgAssets = (prevAssets + bsp.totalAssets) / 2;
    const expected = avgAssets !== 0 ? is[i].netIncome / avgAssets : 0;
    if (Math.abs(r.roa - expected) > 0.001) {
      findings.push(findingBuilder(28, 'major', is[i].period, scenario,
        'roa', expected, r.roa,
        `ROA should be NI / Avg_Assets = ${is[i].netIncome.toFixed(2)} / ${avgAssets.toFixed(2)} = ${expected.toFixed(4)}`,
        `roa = netIncome / ((prevAssets + currAssets) / 2)`
      ));
    }
  }
  return { checkName: 'ROA Formula (Rule 28)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 31: EPD Zero in Loss Years
// ─────────────────────────────────────────
export function checkEPDInLossYears(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    if (period.periodType !== 'projected') continue;
    if (period.netIncome <= 0 && period.employeeProfitSharing > TOL) {
      findings.push(findingBuilder(31, 'advisory', period.period, scenario,
        'employeeProfitSharing', 0, period.employeeProfitSharing,
        `EPD should be 0 when Net Income ≤ 0 (NI = ${period.netIncome.toFixed(2)})`,
        `If net income is negative or zero, EPD must be zero per Egyptian Labor Law.`
      ));
    }
  }
  return { checkName: 'EPD Zero in Loss Years (Rule 31)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 32: LR Zero in Loss Years
// ─────────────────────────────────────────
export function checkLRInLossYears(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  for (const period of is) {
    if (period.periodType !== 'projected') continue;
    if (period.netIncome <= 0 && period.legalReserveAddition > TOL) {
      findings.push(findingBuilder(32, 'advisory', period.period, scenario,
        'legalReserveAddition', 0, period.legalReserveAddition,
        `Legal Reserve should be 0 when Net Income ≤ 0 (NI = ${period.netIncome.toFixed(2)})`,
        `Legal Reserve additions are only made from positive net income.`
      ));
    }
  }
  return { checkName: 'LR Zero in Loss Years (Rule 32)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 33: Legal Reserve Cap Enforcement
// ─────────────────────────────────────────
export function checkLRCap(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  assumptions: AssumptionSet,
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  const effectivePaidUpCapital = (assumptions.paidUpCapital && assumptions.paidUpCapital > 0)
    ? assumptions.paidUpCapital
    : 0;
  const lrCap = effectivePaidUpCapital * (assumptions.legalReserveCap ?? 0.50);

  for (const bsPeriod of bs) {
    if (bsPeriod.legalReserve > lrCap + 1.0) {
      findings.push(findingBuilder(33, 'advisory', bsPeriod.period, scenario,
        'legalReserve', lrCap, bsPeriod.legalReserve,
        `Cumulative Legal Reserve (${bsPeriod.legalReserve.toFixed(2)}) exceeds cap ` +
        `(${lrCap.toFixed(2)} = PaidUpCapital × 50%)`,
        `Legal Reserve additions should stop once cumulative LR reaches 50% of paid-up capital.`
      ));
    }
  }
  return { checkName: 'LR Cap Enforcement (Rule 33)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 37: Revenue Growth Deceleration
// ─────────────────────────────────────────
export function checkRevenueGrowthDeceleration(
  is: IncomeStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  const projected = is.filter(p => p.periodType === 'projected');
  for (let i = 1; i < projected.length; i++) {
    if (projected[i].revenueGrowthRate > projected[i - 1].revenueGrowthRate + 0.001) {
      findings.push(findingBuilder(
        37, 'advisory', projected[i].period, scenario,
        'revenueGrowthRate', projected[i - 1].revenueGrowthRate, projected[i].revenueGrowthRate,
        `Revenue growth accelerated from ${(projected[i - 1].revenueGrowthRate * 100).toFixed(1)}% ` +
        `to ${(projected[i].revenueGrowthRate * 100).toFixed(1)}%. ` +
        `Growth acceleration in later years is unusual for most businesses.`,
        `Consider whether revenue growth acceleration is realistic. Most mature models assume deceleration.`
      ));
    }
  }
  return { checkName: 'Revenue Growth Deceleration (Rule 37)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// RULE 38: FCF Inflection Check
// ─────────────────────────────────────────
export function checkFCFInflection(
  cf: CashFlowStatement[],
  scenario: string
): LocalCheckResult {
  const findings: ValidationFinding[] = [];
  const projected = cf.filter(p => p.periodType === 'projected');
  for (const period of projected) {
    if (period.freeCashFlow < 0) {
      findings.push(findingBuilder(
        38, 'advisory', period.period, scenario,
        'freeCashFlow', 0, period.freeCashFlow,
        `Free Cash Flow is negative (${period.freeCashFlow.toFixed(2)}) — cash drain risk.`,
        `Negative FCF may indicate excessive CapEx or working capital needs. Review assumptions.`
      ));
    }
  }
  return { checkName: 'FCF Inflection (Rule 38)', passed: findings.length === 0, findings };
}

// ─────────────────────────────────────────
// MASTER: Run all local checks
// ─────────────────────────────────────────
export function runAllLocalChecks(
  is: IncomeStatement[],
  bs: BalanceSheet[],
  cf: CashFlowStatement[],
  ratios: FinancialRatios[],
  assumptions: AssumptionSet,
  scenario: string
): LocalCheckResult[] {
  return [
    // Tier 1 — Critical
    checkBalanceSheetBalance(bs, scenario),
    checkCashReconciliation(bs, cf, scenario),
    checkRevenueChain(is, scenario),
    checkNetIncomeMath(is, scenario),
    checkEgyptianProfitAppropriation(is, assumptions, scenario),
    checkRetainedEarningsRoll(is, bs, scenario),
    checkTaxCalculation(is, scenario),
    checkCFNetChange(cf, scenario),
    checkEndingCash(cf, scenario),

    // Tier 2 — Major
    checkNOPAT(is, scenario),
    checkEBITDA(is, scenario),
    checkROIC(is, bs, ratios, scenario),
    checkROE(is, bs, ratios, scenario),
    checkROA(is, bs, ratios, scenario),

    // Tier 3 — Advisory
    checkEPDInLossYears(is, scenario),
    checkLRInLossYears(is, scenario),
    checkLRCap(is, bs, assumptions, scenario),
    checkRevenueGrowthDeceleration(is, scenario),
    checkFCFInflection(cf, scenario),
  ];
}
