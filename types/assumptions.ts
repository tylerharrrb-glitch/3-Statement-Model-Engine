// ============================================================
// Assumption Type Definitions
// ============================================================

export interface AssumptionSet {
    // Revenue Assumptions
    revenueBase: number;
    revenueGrowthRate: number[];        // [Year 1, Year 2, ...]

    // Margin Assumptions (% of revenue)
    cogsPercent: number[];
    sgaPercent: number[];
    rdPercent: number[];
    otherOpexPercent: number[];

    // Working Capital (days)
    dso: number[];                      // Days Sales Outstanding
    dio: number[];                      // Days Inventory Outstanding
    dpo: number[];                      // Days Payable Outstanding
    prepaidPercent: number[];           // % of revenue
    accruedExpPercent: number[];        // % of revenue
    deferredRevPercent: number[];       // % of revenue

    // CapEx & Depreciation
    capexPercent: number[];             // % of revenue
    depreciationRate: number[];         // % of gross PP&E
    amortizationAmount: number[];       // Absolute value

    // Debt & Financing — per-year rates (Egyptian market: CBE-linked)
    cbeRate: number;                    // CBE overnight rate (master input)
    interestRateOnDebt: number[];       // Per projected year, e.g. [0.22, 0.22, 0.20, 0.18, 0.18]
    interestRateOnCash: number[];       // Per projected year, e.g. [0.22, 0.20, 0.18, 0.16, 0.15]
    legacyDebtRate: number;             // Rate on existing historical debt tranches
    shortTermDebtAmount: number[];
    longTermDebtIssuance: number[];
    longTermDebtRepayment: number[];
    currentPortionLTD: number[];

    // Equity
    sharesOutstanding: number[];
    dividendPayoutRatio: number[];
    shareRepurchaseAmount: number[];
    stockBasedCompAmount: number[];

    // Tax & Employee Distribution
    taxRate: number[];
    taxRegime: 'standard' | 'oil' | 'strategic' | 'sme'; // default: 'standard'
    employeeProfitSharingRate: number;  // EPD rate (Art. 47, Law 159/1981) — default 0.10
    enableEmployeeProfitShare: boolean; // default: true
    totalAnnualPayroll: number;         // EPD cap: EPD cannot exceed total annual payroll

    // Tax Loss Carryforward (Tax Law Art. 29)
    enableTaxLossCarryforward: boolean; // default: true
    taxLossCarryforwardYears: number;   // default: 5

    // Legal Reserve (Companies Law Art. 40)
    enableLegalReserve: boolean;        // default: true
    legalReservePercent: number;        // default: 0.05
    paidUpCapital: number;              // for 50% cap calculation (ISSUED capital)
    legalReserveCap: number;            // default: 0.50
    initialLegalReserve: number;        // Prior cumulative legal reserve from periods before model start.
    // Determines how much additional reserve can still be added.
    // MAX = paidUpCapital × legalReserveCap (Law 159/1981 Art.40)

    // RE Opening Balance Reconciliation (FIX #3: transparency for prior-period dividends)
    priorPeriodDividendsPaidFromRE: number;  // Dividends declared before model start, settled in first
    // historical period. Reconciles the RE opening balance gap.

    // Dividend Withholding Tax (Tax Law Art. 56 bis, amended by Law 30/2023)
    dividendWithholdingTaxRate: number; // 0.10 unlisted, 0.05 EGX-listed
    isEGXListed: boolean;               // default: false — determines WHT rate

    // Depreciation Method
    depreciationMethod: 'straight-line' | 'declining-balance' | 'egyptian-tax';
    assetMix: {
        buildings: number;   // default: 0.30
        machinery: number;   // default: 0.35
        vehicles: number;    // default: 0.15
        computers: number;   // default: 0.10
        furniture: number;   // default: 0.10
    };

    // End of Service Benefits (Labor Law + EAS 38)
    enableEndOfServiceBenefit: boolean; // default: false (optional)
    averageMonthlyBasicSalary: number;  // EGP
    numberOfEmployees: number[];        // per projection year

    // Other
    otherIncomeExpense: number[];
    goodwill: number[];
    otherLongTermAssets: number[];
    otherCurrentAssets: number[];
    otherCurrentLiabilities: number[];
    deferredTaxLiabilities: number[];
    otherLongTermLiabilities: number[];
    commonStock: number[];
    apic: number[];
    oci: number[];
    acquisitions: number[];
    assetSales: number[];
    investmentPurchases: number[];
    investmentSales: number[];
    equityIssuance: number[];

    // Valuation
    sharePrice?: number;                // Optional — enables P/E, EV/EBITDA, FCF yield

    // DCF Valuation
    riskFreeRate: number;               // Decoupled from CBE rate — default 0.20 for Egypt
    terminalGrowthRate: number;         // Gordon Growth g (CBE target inflation ~7%), default 0.07
    equityRiskPremium: number;          // Damodaran Egypt ERP ~10.5%, default 0.105
    beta: number;                       // Company beta, default 1.0

    // Inflation
    inflationRate?: number[];           // Per projected year (Egyptian CPI)
    linkRevenueToInflation?: boolean;   // If true, revenue growth = real growth + inflation

    // Sector Working Capital Preset
    sectorPreset?: 'technology' | 'manufacturing' | 'retail' | 'government-contractor' | 'export-oriented' | 'real-estate' | 'custom';

    // Egyptian Market / Localization (all optional — backward compatible)
    countryPreset?: 'us' | 'egypt' | 'custom';
    vatRate?: number;                   // e.g. 0.14 for Egypt
    enableVAT?: boolean;
    dividendWithholdingRate?: number;   // e.g. 0.10 for Egypt
    useEgyptianRates?: boolean;
    assetClassBreakdown?: {
        buildings: number;   // fraction of gross PP&E
        machinery: number;
        vehicles: number;
        computers: number;
        furniture: number;
    };
    fiscalYearEnd?: number;             // month 1-12, default 12
    fiscalYearPreset?: 'calendar' | 'egyptian-govt' | 'custom';

    // Time Period
    projectionYears: number;
    historicalYears: number;
    startYear: number;
}

export interface HistoricalInputs {
    periods: string[];
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

    // Balance Sheet items
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

// Default assumptions for a typical company
export function getDefaultAssumptions(): AssumptionSet {
    const years = 5;
    const fill = <T>(val: T): T[] => Array(years).fill(val);

    return {
        revenueBase: 1_000_000,
        revenueGrowthRate: [0.10, 0.08, 0.07, 0.06, 0.05],

        cogsPercent: fill(0.60),
        sgaPercent: fill(0.15),
        rdPercent: fill(0.05),
        otherOpexPercent: fill(0.02),

        dso: fill(45),
        dio: fill(30),
        dpo: fill(40),
        prepaidPercent: fill(0.01),
        accruedExpPercent: fill(0.03),
        deferredRevPercent: fill(0.02),

        capexPercent: fill(0.05),
        depreciationRate: fill(0.10),
        amortizationAmount: fill(5_000),

        cbeRate: 0.2725,
        interestRateOnDebt: [0.22, 0.22, 0.20, 0.18, 0.18],
        interestRateOnCash: [0.22, 0.20, 0.18, 0.16, 0.15],
        legacyDebtRate: 0.045,
        shortTermDebtAmount: fill(50_000),
        longTermDebtIssuance: fill(0),
        longTermDebtRepayment: fill(20_000),
        currentPortionLTD: fill(20_000),

        sharesOutstanding: fill(100_000),
        dividendPayoutRatio: fill(0.30),
        shareRepurchaseAmount: fill(0),
        stockBasedCompAmount: fill(10_000),

        taxRate: fill(0.225),
        taxRegime: 'standard',
        employeeProfitSharingRate: 0.10,
        enableEmployeeProfitShare: true,
        totalAnnualPayroll: 0,           // 0 = no cap enforced

        // Tax Loss Carryforward
        enableTaxLossCarryforward: true,
        taxLossCarryforwardYears: 5,

        // Legal Reserve
        enableLegalReserve: true,
        legalReservePercent: 0.05,
        paidUpCapital: 10_000,
        legalReserveCap: 0.50,
        initialLegalReserve: 0,
        priorPeriodDividendsPaidFromRE: 0,

        // Dividend WHT (Law 30/2023)
        dividendWithholdingTaxRate: 0.10,  // 10% unlisted, 5% EGX-listed
        isEGXListed: false,

        // Depreciation
        depreciationMethod: 'egyptian-tax',
        assetMix: {
            buildings: 0.30,
            machinery: 0.35,
            vehicles: 0.15,
            computers: 0.10,
            furniture: 0.10,
        },

        // End of Service Benefits
        enableEndOfServiceBenefit: false,
        averageMonthlyBasicSalary: 5_000,
        numberOfEmployees: fill(50),

        otherIncomeExpense: fill(0),
        goodwill: fill(100_000),
        otherLongTermAssets: fill(20_000),
        otherCurrentAssets: fill(10_000),
        otherCurrentLiabilities: fill(15_000),
        deferredTaxLiabilities: fill(30_000),
        otherLongTermLiabilities: fill(25_000),
        commonStock: fill(10_000),
        apic: fill(200_000),
        oci: fill(0),
        acquisitions: fill(0),
        assetSales: fill(0),
        investmentPurchases: fill(0),
        investmentSales: fill(0),
        equityIssuance: fill(0),

        // Egyptian / localization defaults
        countryPreset: 'egypt',
        vatRate: 0.14,
        enableVAT: true,
        dividendWithholdingRate: 0.10,
        useEgyptianRates: true,
        fiscalYearEnd: 6,
        fiscalYearPreset: 'egyptian-govt',

        // DCF Valuation defaults (Egyptian market)
        riskFreeRate: 0.20,              // CBE T-Bill / risk-free rate proxy
        terminalGrowthRate: 0.07,        // CBE target inflation ~7%
        equityRiskPremium: 0.105,        // Damodaran Egypt ERP (Jan 2025)
        beta: 1.0,

        // Inflation defaults (Egyptian CPI path)
        inflationRate: [0.25, 0.18, 0.14, 0.10, 0.08],

        // Sector preset
        sectorPreset: 'technology',

        projectionYears: years,
        historicalYears: 2,
        startYear: 2026,
    };
}

// Default historical inputs — 2 periods to match Feature 1
// IMPORTANT: Retained earnings are calculated as the balancing plug so A = L + E
export function getDefaultHistoricalInputs(): HistoricalInputs {
    // ── Asset data ──
    const cash = [175_000, 200_000];
    const accountsReceivable = [104_795, 117_123];
    const inventory = [41_918, 46_849];
    const prepaidExpenses = [8_500, 9_500];
    const otherCurrentAssets = [10_000, 10_000];
    const grossPPE = [340_000, 385_000];
    const accumulatedDepreciation = [128_000, 160_000];
    const intangibles = [45_000, 40_000];
    const goodwill = [100_000, 100_000];
    const otherLongTermAssets = [20_000, 20_000];

    // ── Liability data ──
    const accountsPayable = [55_890, 62_466];
    const accruedExpenses = [25_500, 28_500];
    const shortTermDebt = [50_000, 50_000];
    const currentPortionLTD = [20_000, 20_000];
    const deferredRevenue = [17_000, 19_000];
    const otherCurrentLiabilities = [15_000, 15_000];
    const longTermDebt = [230_000, 210_000];
    const deferredTaxLiabilities = [30_000, 30_000];
    const otherLongTermLiabilities = [25_000, 25_000];

    // ── Equity (non-RE) data ──
    const commonStock = [10_000, 10_000];
    const additionalPaidInCapital = [210_000, 220_000]; // accumulates SBC
    const treasuryStock = [0, 0];
    const otherComprehensiveIncome = [0, 0];

    // ── Calculate retained earnings as plug: RE = TotalAssets - TotalLiabilities - OtherEquity ──
    const retainedEarnings = cash.map((_, i) => {
        const netPPE = grossPPE[i] - accumulatedDepreciation[i];
        const totalCA = cash[i] + accountsReceivable[i] + inventory[i] + prepaidExpenses[i] + otherCurrentAssets[i];
        const totalNCA = netPPE + intangibles[i] + goodwill[i] + otherLongTermAssets[i];
        const totalAssets = totalCA + totalNCA;

        const totalCL = accountsPayable[i] + accruedExpenses[i] + shortTermDebt[i] +
            currentPortionLTD[i] + deferredRevenue[i] + otherCurrentLiabilities[i];
        const totalNCL = longTermDebt[i] + deferredTaxLiabilities[i] + otherLongTermLiabilities[i];
        const totalLiabilities = totalCL + totalNCL;

        const otherEquity = commonStock[i] + additionalPaidInCapital[i] + treasuryStock[i] + otherComprehensiveIncome[i];
        return totalAssets - totalLiabilities - otherEquity;
    });

    return {
        periods: ['2024', '2025'],
        revenue: [850_000, 950_000],
        cogs: [510_000, 570_000],
        sgaExpense: [127_500, 142_500],
        rdExpense: [42_500, 47_500],
        depreciation: [28_000, 32_000],
        amortization: [5_000, 5_000],
        otherOpex: [17_000, 19_000],
        interestIncome: [2_500, 3_000],
        interestExpense: [14_000, 13_000],
        otherIncomeExpense: [0, 0],
        taxExpense: [27_375, 31_250],
        sharesOutstanding: [100_000, 100_000],
        cash,
        accountsReceivable,
        inventory,
        prepaidExpenses,
        otherCurrentAssets,
        grossPPE,
        accumulatedDepreciation,
        intangibles,
        goodwill,
        otherLongTermAssets,
        accountsPayable,
        accruedExpenses,
        shortTermDebt,
        currentPortionLTD,
        deferredRevenue,
        otherCurrentLiabilities,
        longTermDebt,
        deferredTaxLiabilities,
        otherLongTermLiabilities,
        commonStock,
        additionalPaidInCapital,
        retainedEarnings,
        treasuryStock,
        otherComprehensiveIncome,
    };
}
