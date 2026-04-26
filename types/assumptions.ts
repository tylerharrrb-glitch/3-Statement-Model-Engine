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
    // Intangibles CapEx (Fix 6) — telecom-relevant: spectrum licenses, software
    intangiblesCapExPercent?: number[]; // % of revenue, default 0.02 (2.0%)

    // Debt & Financing — per-year rates (Egyptian market: CBE-linked)
    cbeRate: number;                    // CBE overnight rate (master input)
    interestRateOnDebt: number[];       // Per projected year, e.g. [0.22, 0.20, 0.18, 0.17, 0.16]
    interestRateOnCash: number[];       // Per projected year, e.g. [0.19, 0.17, 0.15, 0.13, 0.12]
    historicalInterestRateOnDebt: number[];  // Per historical year, e.g. [0.295, 0.245] for 2024, 2025
    historicalInterestRateOnCash: number[];  // Per historical year, e.g. [0.255, 0.215] for 2024, 2025
    legacyDebtRate: number;             // Rate on existing historical debt tranches
    shortTermDebtAmount: number[];
    longTermDebtIssuance: number[];
    longTermDebtRepayment: number[];
    currentPortionLTD: number[];
    // LT Debt Schedule Mode (Fix 5)
    // 'manual' uses longTermDebtRepayment array as-is.
    // 'flat' = no principal movement (carry-forward).
    // 'bullet' = single principal payment in final year (or specified year).
    // 'amortizing' = straight-line over amortizingTermYears.
    // 'interest-only' = no principal repayments during projection.
    debtScheduleMode?: 'manual' | 'flat' | 'bullet' | 'amortizing' | 'interest-only';
    amortizingTermYears?: number;        // for 'amortizing' mode

    // Equity
    sharesOutstanding: number[];
    dividendPayoutRatio: number[];
    shareRepurchaseAmount: number[];
    stockBasedCompAmount: number[];

    // Tax & Employee Distribution
    taxRate: number[];
    taxRegime: 'standard' | 'oil' | 'strategic' | 'sme'; // default: 'standard'
    employeeProfitSharingRate: number;  // EPD rate (Law 14/2025) — default 0.10
    enableEmployeeProfitShare: boolean; // default: true
    enableNonOperatingExclusion: boolean; // Law 14/2025: exclude non-operating gains from EPD base
    totalAnnualPayroll: number;         // EPD cap: EPD cannot exceed total annual payroll

    // Tax Loss Carryforward (Tax Law Art. 29)
    enableTaxLossCarryforward: boolean; // default: true
    taxLossCarryforwardYears: number;   // default: 5

    // Thin Capitalization (Law No. 30 of 2023)
    enableThinCapRule: boolean;         // default: true (always true for Egyptian entities)

    // Formula-Driven Rate Schedule (FIX-04)
    corporateCreditSpread: number;      // default: 0.02 (200bps)
    useFormulaRates: boolean;           // default: false (manual rates by default)
    cbeRateProjection: number[];        // default: [0.195, 0.175, 0.155, 0.140, 0.130]

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

    // End of Service Benefits (Labor Law + EAS 38) / EOS Provision (Art. 110)
    enableEndOfServiceBenefit: boolean; // default: false (optional)
    averageMonthlyBasicSalary: number;  // EGP
    numberOfEmployees: number[];        // per projection year
    // Egyptian Labor Law Art. 110 — EOS provision as % of SG&A (Fix 7)
    eosProvisionPctOfSGA?: number[];    // default: fill(0.015) → 1.5% of SG&A
    eosPaymentsEstimate?: number[];     // EGP cash outflow per year (default 0)

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
        rdPercent: fill(0),               // off by default — R&D atypical for telecom (Fix 9)
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
        intangiblesCapExPercent: fill(0),  // 0 = pure winddown (intangibles_t = prev - amort)

        cbeRate: 0.195,                       // CBE main operation / discount rate (April 2, 2026 MPC)
        interestRateOnDebt: [0.22, 0.20, 0.18, 0.17, 0.16],  // CBE lending + 250bps spread, declining
        interestRateOnCash: [0.19, 0.17, 0.15, 0.13, 0.12],  // CBE deposit rate, declining path
        // Historical rates: period-appropriate CBE policy rate + typical corporate spread
        historicalInterestRateOnDebt: [0.295, 0.245],  // 2024: CBE 27.25%+spread, 2025: CBE blended ~23%+spread
        historicalInterestRateOnCash: [0.255, 0.215],  // 2024: CBE deposit corridor, 2025: declining
        legacyDebtRate: 0.045,
        shortTermDebtAmount: fill(50_000),
        longTermDebtIssuance: fill(0),
        longTermDebtRepayment: fill(0),    // 0 by default — user inputs real schedule (Fix 5)
        currentPortionLTD: fill(0),
        debtScheduleMode: 'flat',          // default: carry forward unchanged
        amortizingTermYears: 10,           // default if 'amortizing' is selected

        sharesOutstanding: fill(100_000),
        dividendPayoutRatio: fill(0.30),
        shareRepurchaseAmount: fill(0),
        stockBasedCompAmount: fill(10_000),

        taxRate: fill(0.225),
        taxRegime: 'standard',
        employeeProfitSharingRate: 0.10,
        enableEmployeeProfitShare: true,
        enableNonOperatingExclusion: false,  // Law 14/2025: toggle for non-operating gains exclusion
        totalAnnualPayroll: 0,           // 0 = no cap enforced

        // Tax Loss Carryforward
        enableTaxLossCarryforward: true,
        taxLossCarryforwardYears: 5,

        // Thin Capitalization (Law 30/2023)
        enableThinCapRule: true,

        // Formula-Driven Rate Schedule
        corporateCreditSpread: 0.02,     // 200bps
        useFormulaRates: false,
        cbeRateProjection: [0.195, 0.175, 0.155, 0.140, 0.130],

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
        depreciationMethod: 'straight-line',
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
        eosProvisionPctOfSGA: fill(0.015),  // 1.5% of SG&A (Egyptian Labor Law Art. 110)
        eosPaymentsEstimate: fill(0),

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
        riskFreeRate: 0.235,             // 12-month Egyptian T-bill average auction yield, Q1 2026
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
        taxExpense: [24_413, 27_900],  // EBT × 22.5% Egypt CIT
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
