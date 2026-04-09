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

  // Employee Profit Sharing (Art. 47, Law 159/1981)
  employeeProfitSharing: number;   // 10% of NI (Egyptian mandatory)
  netIncomeAfterEPD: number;       // NI minus EPD

  // Tax Loss Carryforward (Tax Law Art. 29)
  taxLossCarryforward: number;     // cumulative unused losses brought forward
  taxLossUtilized: number;         // losses offset against this year's EBT
  taxLossRemaining: number;        // available for future years
  taxableIncome: number;           // EBT after loss offset

  // Thin Capitalization (Law No. 30 of 2023)
  disallowedInterest?: number;      // non-deductible interest portion
  adjustedTaxableIncome?: number;   // EBT + disallowedInterest - NOL
  thinCapDeRatioLimit?: number;     // 3:1 (2024-2027) or 2:1 (2028+)
  thinCapRateCeiling?: number;      // 2× CBE discount rate

  // Profit Appropriation Waterfall
  legalReserveAddition: number;    // 5% of NI after EPS, stops at 50% of capital
  distributableProfit: number;     // NI after EPS - legal reserve
  grossDividends: number;          // distributable × payout ratio
  dividendWHT: number;             // gross dividends × 10%
  netDividends: number;            // gross - WHT
  additionToRE: number;            // distributable - gross dividends

  // Memo Items
  nopat: number;                   // EBIT × (1 − effective tax rate)
  fcff: number;                    // NOPAT + D&A − CapEx − ΔNWC

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
  legalReserve: number;            // cumulative legal reserve (Companies Law Art. 40)
  retainedEarnings: number;
  treasuryStock: number;
  otherComprehensiveIncome: number;
  totalEquity: number;

  // NON-CURRENT LIABILITIES (additional)
  endOfServiceProvision: number;   // EOS benefit provision (Labor Law + EAS 38)

  totalLiabilitiesEquity: number;

  // Check
  isBalanced: boolean;
  balanceDifference: number;

  // VAT Working Capital (Egyptian market — FIX-07)
  vatReceivable?: number;   // input VAT (included in totalCurrentAssets)
  vatPayable?: number;      // output VAT net of input (included in totalCurrentLiabilities)
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
  dividendWHT: number;              // Dividend withholding tax (memo, 10% ETA)
  employeeProfitSharingPaid: number; // EPD cash outflow
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
  ebitdaMargin: number;
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

  // DuPont Analysis
  dupontNetMargin?: number;
  dupontAssetTurnover?: number;
  dupontEquityMultiplier?: number;
  dupontROE_3F?: number;
  dupontTaxBurden?: number;
  dupontInterestBurden?: number;
  dupontOperatingMargin?: number;
  dupontROE_5F?: number;

  // Altman Z'-Score (Private Companies)
  altmanZScore?: number;
  altmanZone?: 'safe' | 'grey' | 'distress';

  // Altman EM Z-Score (Emerging Markets — Altman et al. 2005)
  altmanZScoreEM?: number;
  altmanZoneEM?: 'safe' | 'grey' | 'distress';

  // Break-Even
  breakEvenRevenue?: number;
  marginOfSafety?: number;
  operatingLeverage?: number;

  // Leverage (extended)
  netDebt?: number;
  netDebtToEbitda?: number;
  dscr?: number | null;

  // Efficiency (extended)
  fcfMargin?: number | null;
  fcfToEbitda?: number | null;

  // Per Share (extended)
  bookValuePerShare?: number;
  fcfPerShare?: number;
  revenuePerShare?: number;
  eps?: number;
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
  dcfValuation?: DCFValuation;
  valuationMultiples?: ValuationMultiples;

  // AI Validation Agent results
  validationReport?: import('@/lib/agents/validation-types').ValidationReport;
  validationPassed?: boolean;
}

// ── DCF Valuation ──
export interface DCFValuation {
  fcfProjections: number[];           // FCFF for each projection year
  discountedFCFs: number[];           // PV of each FCFF
  terminalValue: number;              // TV = FCFF_n × (1+g) / (WACC - g)
  pvTerminalValue: number;            // PV of terminal value
  enterpriseValue: number;            // Sum of discounted FCFFs + PV(TV)
  netDebt: number;                    // Total debt − cash
  equityValue: number;                // EV − Net Debt
  impliedSharePrice: number;          // Equity Value / shares outstanding
  wacc: number;                       // Weighted average cost of capital
  costOfEquity: number;               // CAPM: rf + β × ERP
  costOfDebt: number;                 // After-tax: rate × (1 − tax)
  debtWeight: number;                 // D / (D+E)
  equityWeight: number;               // E / (D+E)
  dcfWarnings: string[];              // Sanity check warnings
  tvAsPercentOfEV: number;            // TV% of EV
}

// ── Trading Multiples ──
export interface ValuationMultiples {
  pe: number | null;                  // Price / EPS (null if no share price)
  evEbitda: number | null;            // EV / EBITDA
  priceBook: number | null;           // Price / Book Value per Share
  fcfYield: number | null;            // FCF / Market Cap
  dividendYield: number | null;       // DPS / Share Price
  marketCap: number | null;           // Share Price × Shares
  enterpriseValueMarket: number | null; // Market Cap + Net Debt
}

// ── EGX 30 Benchmarks (Q1 2026 reference) ──
export interface EGXBenchmarks {
  pe: { low: number; high: number; avg: number };
  evEbitda: { low: number; high: number; avg: number };
  priceBook: { low: number; high: number; avg: number };
}
