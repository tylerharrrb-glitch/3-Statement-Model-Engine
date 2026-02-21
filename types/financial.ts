// ============================================================
// Financial Statement Type Definitions
// ============================================================

export interface IncomeStatement {
  period: string; // e.g., "2024", "2025E"
  periodType: 'historical' | 'projected';

  // Revenue Block
  revenue: number;
  revenueGrowthRate: number;

  // Cost of Revenue
  cogs: number;
  grossProfit: number;
  grossMargin: number;

  // Operating Expenses
  sgaExpense: number;
  rdExpense: number;
  depreciation: number;
  amortization: number;
  otherOpex: number;
  stockBasedComp: number;
  totalOpex: number;

  // Operating Income
  ebit: number;
  ebitda: number;
  ebitMargin: number;

  // Non-Operating Items
  interestIncome: number;
  interestExpense: number;
  otherIncomeExpense: number;

  // Pre-Tax Income
  ebt: number;

  // Taxes
  taxRate: number;
  taxExpense: number;

  // Net Income
  netIncome: number;
  netMargin: number;

  // Per Share Metrics
  sharesOutstanding: number;
  eps: number;

  // VAT memo fields (Egyptian market)
  revenueInclVAT?: number;
  revenueExclVAT?: number;
  vatCollected?: number;
}

export interface BalanceSheet {
  period: string;
  periodType: 'historical' | 'projected';

  // CURRENT ASSETS
  cash: number;
  accountsReceivable: number;
  inventory: number;
  prepaidExpenses: number;
  otherCurrentAssets: number;
  totalCurrentAssets: number;

  // NON-CURRENT ASSETS
  grossPPE: number;
  accumulatedDepreciation: number;
  netPPE: number;
  intangibles: number;
  goodwill: number;
  otherLongTermAssets: number;
  totalNonCurrentAssets: number;

  totalAssets: number;

  // CURRENT LIABILITIES
  accountsPayable: number;
  accruedExpenses: number;
  shortTermDebt: number;
  currentPortionLTD: number;
  deferredRevenue: number;
  otherCurrentLiabilities: number;
  totalCurrentLiabilities: number;

  // NON-CURRENT LIABILITIES
  longTermDebt: number;
  deferredTaxLiabilities: number;
  otherLongTermLiabilities: number;
  totalNonCurrentLiabilities: number;

  totalLiabilities: number;

  // EQUITY
  commonStock: number;
  additionalPaidInCapital: number;
  retainedEarnings: number;
  treasuryStock: number;
  otherComprehensiveIncome: number;
  totalEquity: number;

  totalLiabilitiesEquity: number;

  // Check
  isBalanced: boolean;
  balanceDifference: number;
}

export interface CashFlowStatement {
  period: string;
  periodType: 'historical' | 'projected';

  // OPERATING ACTIVITIES
  netIncome: number;
  depreciation: number;
  amortization: number;
  stockBasedComp: number;
  deferredTaxes: number;

  // Working Capital Changes
  changeInAR: number;
  changeInInventory: number;
  changeInPrepaid: number;
  changeInAP: number;
  changeInAccruedExp: number;
  changeInDeferredRev: number;
  totalWorkingCapitalChange: number;

  cashFromOperations: number;

  // INVESTING ACTIVITIES
  capex: number;
  acquisitions: number;
  assetSales: number;
  investmentPurchases: number;
  investmentSales: number;
  cashFromInvesting: number;

  // FINANCING ACTIVITIES
  debtIssuance: number;
  debtRepayment: number;
  equityIssuance: number;
  dividendsPaid: number;
  shareRepurchases: number;
  cashFromFinancing: number;

  // NET CASH FLOW
  netChangeInCash: number;
  beginningCash: number;
  endingCash: number;

  // Free Cash Flow (non-GAAP)
  freeCashFlow: number;

  // Reconciliation check: does CF ending cash match BS cash?
  reconciles: boolean;
}

export interface FinancialRatios {
  period: string;

  // Profitability
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  roic: number;

  // Liquidity
  currentRatio: number;
  quickRatio: number;
  cashRatio: number;

  // Leverage
  debtToEquity: number;
  debtToAssets: number;
  interestCoverage: number;

  // Efficiency
  assetTurnover: number;
  inventoryTurnover: number;
  receivablesTurnover: number;
  dso: number;
  dio: number;
  dpo: number;
  cashConversionCycle: number;

  // Valuation (optional)
  pe?: number;
  priceToBook?: number;
  evToEbitda?: number;
}

export interface IntegrationChecks {
  assetsBalance: boolean;
  cashTies: boolean;
  netIncomeFlows: boolean;
  ppeTies: boolean;
  retainedEarningsFlows: boolean;
  debtTies: boolean;
  // New checks (Feature 8)
  cfReconciles: boolean;
  workingCapitalTies: boolean;
  totalCurrentAssetsCheck: boolean;
  totalNonCurrentAssetsCheck: boolean;
  totalCurrentLiabilitiesCheck: boolean;
  totalNonCurrentLiabilitiesCheck: boolean;
  totalEquityCheck: boolean;
  grossToNetIncomeWaterfall: boolean;
  ebitdaIdentity: boolean;
  apicConsistency: boolean;
  allPassed: boolean;
  details: IntegrationCheckDetail[];
}

export interface IntegrationCheckDetail {
  name: string;
  passed: boolean;
  expected: number;
  actual: number;
  difference: number;
}

export interface ModelResults {
  incomeStatements: IncomeStatement[];
  balanceSheets: BalanceSheet[];
  cashFlowStatements: CashFlowStatement[];
  ratios: FinancialRatios[];
  integrationChecks: IntegrationChecks[];
  convergenceInfo: {
    converged: boolean;
    iterations: number;
    finalDelta: number;
  };
}
