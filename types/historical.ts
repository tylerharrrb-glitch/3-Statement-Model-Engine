// ============================================================
// Historical Data Type Definitions (Feature 1)
// ============================================================

import { IncomeStatement, BalanceSheet, CashFlowStatement } from './financial';

/**
 * Per-year historical data input. Users provide actual data
 * for each historical year via form or CSV import.
 */
export interface HistoricalDataInput {
  year: number;
  period: string; // e.g. "2023", "2024"

  // ── Income Statement ─────────────────────────────────
  revenue: number;
  cogs: number;
  grossProfit: number;
  sgaExpense: number;
  rdExpense: number;
  depreciation: number;
  amortization: number;
  otherOpex: number;
  interestIncome: number;
  interestExpense: number;
  otherIncomeExpense: number;
  taxExpense: number;
  netIncome: number;
  sharesOutstanding: number;

  // ── Balance Sheet ────────────────────────────────────
  cash: number;
  accountsReceivable: number;
  inventory: number;
  prepaidExpenses: number;
  otherCurrentAssets: number;
  grossPPE: number;
  accumulatedDepreciation: number;
  netPPE: number;
  intangibleAssets: number;
  goodwill: number;
  otherLTAssets: number;
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalAssets: number;

  accountsPayable: number;
  accruedExpenses: number;
  shortTermDebt: number;
  currentPortionLTD: number;
  deferredRevenue: number;
  otherCurrentLiabilities: number;
  totalCurrentLiabilities: number;
  longTermDebt: number;
  deferredTaxLiabilities: number;
  otherLTLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalLiabilities: number;

  commonStock: number;
  additionalPaidInCapital: number;
  retainedEarnings: number;
  treasuryStock: number;
  otherComprehensiveIncome: number;
  totalEquity: number;
}

/**
 * Historical period with fully-built statements.
 */
export interface HistoricalPeriod {
  year: number;
  period: string;
  isHistorical: true;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

/**
 * Projected period with fully-built statements.
 */
export interface ProjectedPeriod {
  year: number;
  period: string;
  isHistorical: false;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
}

/**
 * Combined model results with historical + projected.
 */
export interface CombinedModelResults {
  historicalPeriods: HistoricalPeriod[];
  projectedPeriods: ProjectedPeriod[];
  allIncomeStatements: IncomeStatement[];
  allBalanceSheets: BalanceSheet[];
  allCashFlows: CashFlowStatement[];
}

// ── Converter: HistoricalDataInput[] → HistoricalInputs ──────
// Bridges new per-year format into the array-based format
// that the existing engine expects.
import { HistoricalInputs } from './assumptions';

export function convertToHistoricalInputs(data: HistoricalDataInput[]): HistoricalInputs {
  return {
    periods: data.map(d => d.period),
    revenue: data.map(d => d.revenue),
    cogs: data.map(d => d.cogs),
    sgaExpense: data.map(d => d.sgaExpense),
    rdExpense: data.map(d => d.rdExpense),
    depreciation: data.map(d => d.depreciation),
    amortization: data.map(d => d.amortization),
    otherOpex: data.map(d => d.otherOpex),
    interestIncome: data.map(d => d.interestIncome),
    interestExpense: data.map(d => d.interestExpense),
    otherIncomeExpense: data.map(d => d.otherIncomeExpense),
    taxExpense: data.map(d => d.taxExpense),
    sharesOutstanding: data.map(d => d.sharesOutstanding),
    cash: data.map(d => d.cash),
    accountsReceivable: data.map(d => d.accountsReceivable),
    inventory: data.map(d => d.inventory),
    prepaidExpenses: data.map(d => d.prepaidExpenses),
    otherCurrentAssets: data.map(d => d.otherCurrentAssets),
    grossPPE: data.map(d => d.grossPPE),
    accumulatedDepreciation: data.map(d => d.accumulatedDepreciation),
    intangibles: data.map(d => d.intangibleAssets),
    goodwill: data.map(d => d.goodwill),
    otherLongTermAssets: data.map(d => d.otherLTAssets),
    accountsPayable: data.map(d => d.accountsPayable),
    accruedExpenses: data.map(d => d.accruedExpenses),
    shortTermDebt: data.map(d => d.shortTermDebt),
    currentPortionLTD: data.map(d => d.currentPortionLTD),
    deferredRevenue: data.map(d => d.deferredRevenue),
    otherCurrentLiabilities: data.map(d => d.otherCurrentLiabilities),
    longTermDebt: data.map(d => d.longTermDebt),
    deferredTaxLiabilities: data.map(d => d.deferredTaxLiabilities),
    otherLongTermLiabilities: data.map(d => d.otherLTLiabilities),
    commonStock: data.map(d => d.commonStock),
    additionalPaidInCapital: data.map(d => d.additionalPaidInCapital),
    retainedEarnings: data.map(d => d.retainedEarnings),
    treasuryStock: data.map(d => d.treasuryStock),
    otherComprehensiveIncome: data.map(d => d.otherComprehensiveIncome),
  };
}

/**
 * Build default 2-year historical data for demo purposes.
 * Balance sheets are guaranteed to balance (Assets = Liabilities + Equity).
 */
export function getDefaultHistoricalData(): HistoricalDataInput[] {
  return [
    buildHistoricalYear({
      year: 2024,
      period: '2024',
      revenue: 850_000,
      cogs: 510_000,
      sgaExpense: 127_500,
      rdExpense: 42_500,
      depreciation: 28_000,
      amortization: 5_000,
      otherOpex: 17_000,
      interestIncome: 2_500,
      interestExpense: 14_000,
      otherIncomeExpense: 0,
      taxExpense: 27_375,
      sharesOutstanding: 100_000,
      cash: 175_000,
      accountsReceivable: 104_795,
      inventory: 41_918,
      prepaidExpenses: 8_500,
      otherCurrentAssets: 10_000,
      grossPPE: 340_000,
      accumulatedDepreciation: 128_000,
      intangibleAssets: 45_000,
      goodwill: 100_000,
      otherLTAssets: 20_000,
      accountsPayable: 55_890,
      accruedExpenses: 25_500,
      shortTermDebt: 50_000,
      currentPortionLTD: 20_000,
      deferredRevenue: 17_000,
      otherCurrentLiabilities: 15_000,
      longTermDebt: 230_000,
      deferredTaxLiabilities: 30_000,
      otherLTLiabilities: 25_000,
      commonStock: 10_000,
      additionalPaidInCapital: 210_000,
      treasuryStock: 0,
      otherComprehensiveIncome: 0,
    }),
    buildHistoricalYear({
      year: 2025,
      period: '2025',
      revenue: 950_000,
      cogs: 570_000,
      sgaExpense: 142_500,
      rdExpense: 47_500,
      depreciation: 32_000,
      amortization: 5_000,
      otherOpex: 19_000,
      interestIncome: 3_000,
      interestExpense: 13_000,
      otherIncomeExpense: 0,
      taxExpense: 31_250,
      sharesOutstanding: 100_000,
      cash: 200_000,
      accountsReceivable: 117_123,
      inventory: 46_849,
      prepaidExpenses: 9_500,
      otherCurrentAssets: 10_000,
      grossPPE: 385_000,
      accumulatedDepreciation: 160_000,
      intangibleAssets: 40_000,
      goodwill: 100_000,
      otherLTAssets: 20_000,
      accountsPayable: 62_466,
      accruedExpenses: 28_500,
      shortTermDebt: 50_000,
      currentPortionLTD: 20_000,
      deferredRevenue: 19_000,
      otherCurrentLiabilities: 15_000,
      longTermDebt: 210_000,
      deferredTaxLiabilities: 30_000,
      otherLTLiabilities: 25_000,
      commonStock: 10_000,
      additionalPaidInCapital: 220_000,
      treasuryStock: 0,
      otherComprehensiveIncome: 0,
    }),
  ];
}

/**
 * Helper: compute derived totals and retained earnings plug so BS always balances.
 */
function buildHistoricalYear(raw: Omit<HistoricalDataInput, 'netIncome' | 'grossProfit' | 'netPPE' | 'totalCurrentAssets' | 'totalNonCurrentAssets' | 'totalAssets' | 'totalCurrentLiabilities' | 'totalNonCurrentLiabilities' | 'totalLiabilities' | 'totalEquity' | 'retainedEarnings'> & { retainedEarnings?: number }): HistoricalDataInput {
  // IS derivations
  const grossProfit = raw.revenue - raw.cogs;
  const totalOpex = raw.sgaExpense + raw.rdExpense + raw.depreciation + raw.amortization + raw.otherOpex;
  const ebit = grossProfit - totalOpex;
  const ebt = ebit + raw.interestIncome - raw.interestExpense + raw.otherIncomeExpense;
  const netIncome = ebt - raw.taxExpense;

  // BS derivations
  const netPPE = raw.grossPPE - raw.accumulatedDepreciation;
  const totalCurrentAssets = raw.cash + raw.accountsReceivable + raw.inventory + raw.prepaidExpenses + raw.otherCurrentAssets;
  const totalNonCurrentAssets = netPPE + raw.intangibleAssets + raw.goodwill + raw.otherLTAssets;
  const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiabilities = raw.accountsPayable + raw.accruedExpenses + raw.shortTermDebt + raw.currentPortionLTD + raw.deferredRevenue + raw.otherCurrentLiabilities;
  const totalNonCurrentLiabilities = raw.longTermDebt + raw.deferredTaxLiabilities + raw.otherLTLiabilities;
  const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

  // Retained earnings as plug so A = L + E
  const otherEquity = raw.commonStock + raw.additionalPaidInCapital + raw.treasuryStock + raw.otherComprehensiveIncome;
  const retainedEarnings = raw.retainedEarnings ?? (totalAssets - totalLiabilities - otherEquity);
  const totalEquity = otherEquity + retainedEarnings;

  return {
    ...raw,
    grossProfit,
    netIncome,
    netPPE,
    totalCurrentAssets,
    totalNonCurrentAssets,
    totalAssets,
    totalCurrentLiabilities,
    totalNonCurrentLiabilities,
    totalLiabilities,
    retainedEarnings,
    totalEquity,
  };
}

/**
 * Validate that a HistoricalDataInput's balance sheet balances.
 * Returns null if valid, error string if not.
 */
export function validateHistoricalBalance(data: HistoricalDataInput): string | null {
  const diff = Math.abs(data.totalAssets - (data.totalLiabilities + data.totalEquity));
  if (diff > 0.01) {
    return `${data.period}: Balance sheet does not balance. Assets=${data.totalAssets.toLocaleString()}, L+E=${(data.totalLiabilities + data.totalEquity).toLocaleString()}, Diff=${diff.toFixed(2)}`;
  }
  return null;
}
