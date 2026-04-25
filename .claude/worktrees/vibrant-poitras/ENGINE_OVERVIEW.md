# WOLF 3-Statement Financial Model Engine — Complete Technical Reference

> **Stack**: Next.js 16 + TypeScript + ExcelJS + Zustand  
> **Market**: Egypt (EGX / CIT / VAT / Labor Law)  
> **Engine Version**: 3SM-v9 (April 2026)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Circular Reference Solver](#2-circular-reference-solver)
3. [Income Statement Engine](#3-income-statement-engine)
4. [Balance Sheet Engine](#4-balance-sheet-engine)
5. [Cash Flow Engine](#5-cash-flow-engine)
6. [Financial Ratios](#6-financial-ratios)
7. [DCF Valuation Engine](#7-dcf-valuation-engine)
8. [Assumptions Structure](#8-assumptions-structure)
9. [Egyptian Regulatory Constants](#9-egyptian-regulatory-constants)
10. [Store & State Management](#10-store--state-management)
11. [Excel Export Architecture](#11-excel-export-architecture)
12. [CSV & JSON Export](#12-csv--json-export)
13. [UI Components](#13-ui-components)
14. [Type Interfaces](#14-type-interfaces)
15. [Integration Checks](#15-integration-checks)
16. [File Map](#16-file-map)

---

## 1. Architecture Overview

**File**: `lib/engines/integrator.ts`

The engine builds financial statements in two phases:

### Phase 1 — Historical Periods

```
1. Correct period labels:  period[i] = startYear - numHistorical + i
2. Build Historical Income Statements  (from HistoricalInputs arrays)
3. Build Historical Balance Sheets      (from HistoricalInputs arrays)
4. Build Historical Cash Flows          (back-computed from BS Δ)
```

### Phase 2 — Projected Periods (per year, sequentially)

```
For each projection year (0 .. projectionYears-1):
    resolveCircularReferences(assumptions, yearIndex, prevIS, prevBS, taxLossVintages, legalReserve)
    → Returns converged {IS, BS, CF} + updated carry-forward state
    Accumulate into results arrays
```

### Post-Processing

```
1. Calculate Financial Ratios       (per period)
2. Run DCF Valuation                (over projected FCFF)
3. Run 28 Integration Checks        (per projected period)
4. Return ModelResults
```

---

## 2. Circular Reference Solver

**File**: `lib/engines/circular-resolver.ts`

### The Circular Loop

```
Debt Balance → Interest Expense → Net Income → Retained Earnings
→ Equity → Total L+E → Cash Plug → Interest Income → Net Income → ...
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxIterations` | 500 | Max solver loops |
| `tolerance` | 0.01 | Convergence threshold on ending cash (absolute) |

### Algorithm

```
Initialize estimates:
    estimatedDepreciation   = previousIS.depreciation
    estimatedInterestExpense = previousIS.interestExpense
    estimatedInterestIncome  = previousIS.interestIncome

While NOT converged AND iteration < 500:
    1. Calculate Income Statement (with estimated interest, depreciation)
    2. Calculate Balance Sheet    (first pass, cash = null → uses prev cash)
    3. Calculate Cash Flow        (from IS + BS deltas)
    4. Update Balance Sheet       (with CF ending cash as the cash plug)
    5. Re-estimate for next iteration:
       depreciation    = f(previousGrossPPE, capex, depRate)
       interestExpense = beginningTotalDebt × effectiveDebtRate
       interestIncome  = previousCash × effectiveCashRate
    6. Check: |endingCash_current - endingCash_previous| < 0.01 → converged
```

### Interest Rate Resolution

```javascript
if (useFormulaRates && cbeRateProjection[yr] exists):
    effectiveDebtRate = cbeRateProjection[yr] + corporateCreditSpread + 0.005
    effectiveCashRate = cbeRateProjection[yr] - 0.005
else:
    effectiveDebtRate = interestRateOnDebt[yr]
    effectiveCashRate = interestRateOnCash[yr]
```

---

## 3. Income Statement Engine

**File**: `lib/engines/income-statement.ts`

### 3.1 Revenue & Gross Profit

```
revenue         = previousRevenue × (1 + revenueGrowthRate[yr])
cogs            = revenue × cogsPercent[yr]
grossProfit     = revenue - cogs
grossMargin     = grossProfit / revenue
```

### 3.2 Operating Expenses

```
sgaExpense      = revenue × sgaPercent[yr]
rdExpense       = revenue × rdPercent[yr]
depreciation    = (from circular resolver — see §2)
amortization    = amortizationAmount[yr]
otherOpex       = revenue × otherOpexPercent[yr]
stockBasedComp  = stockBasedCompAmount[yr]
totalOpex       = sga + rd + depreciation + amortization + otherOpex + sbc
```

### 3.3 Operating & Pre-Tax Income

```
ebit                = grossProfit - totalOpex
ebitda              = ebit + depreciation + amortization
ebitMargin          = ebit / revenue
interestIncome      = (from circular resolver)
interestExpense     = (from circular resolver)
otherIncomeExpense  = otherIncomeExpense[yr]
ebt                 = ebit + interestIncome - interestExpense + otherIncomeExpense
```

### 3.4 Thin Capitalization (Law No. 30 of 2023)

Restricts interest deductibility when leverage exceeds limits.

```
deRatioLimit = (calendarYear >= 2028) ? 2.0 : 3.0
rateCeiling  = cbeRate × 2    // e.g., 0.195 × 2 = 0.39

// Step 1: Rate cap
effectiveRate     = interestExpense / totalDebt
cappedRate        = MIN(effectiveRate, rateCeiling)
rateCapInterest   = totalDebt × cappedRate

// Step 2: D/E cap
currentDE         = totalDebt / totalEquity
if (currentDE > deRatioLimit):
    deductibleFraction = (totalEquity × deRatioLimit) / totalDebt
    deductibleInterest = rateCapInterest × deductibleFraction
else:
    deductibleInterest = rateCapInterest

disallowedInterest    = MAX(0, interestExpense - deductibleInterest)
adjustedTaxableIncome = ebt + disallowedInterest
```

### 3.5 Tax Loss Carryforward (Tax Law Art. 29)

```
carryforwardYears = 5

// Expire old vintages
activeVintages = vintages.filter(v => v.expiresAfterYear >= currentYear)
taxLossCarryforward = SUM(activeVintage.amounts)

if (ebt <= 0):
    taxExpense = 0
    Add new vintage: {year: currentYear, amount: |ebt|, expires: currentYear + 5}
else:
    // FIFO depletion
    remainingProfit = ebt
    for each vintage (oldest first):
        use = MIN(remainingProfit, vintage.amount)
        remainingProfit -= use
        vintage.amount  -= use
    taxableIncome = MAX(0, ebt - totalUtilized)
    taxExpense    = taxableIncome × taxRate[yr]
```

### 3.6 Employee Profit Sharing — EPD (Labor Law 14/2025)

```
epdRate = 0.10  (10% of Net Income)

epdBase = enableNonOperatingExclusion
    ? MAX(0, netIncome - MAX(0, otherIncomeExpense))
    : netIncome

rawEPD = (enableEmployeeProfitShare && epdBase > 0)
    ? epdBase × epdRate
    : 0

employeeProfitSharing = epdPayrollCap
    ? MIN(rawEPD, totalAnnualPayroll)
    : rawEPD
```

### 3.7 Legal Reserve (Companies Law Art. 40)

```
reservePercent = 0.05  (5% of Net Income)
reserveCap     = 0.50  (50% of paidUpCapital)

maxReserve = paidUpCapital × reserveCap
if (priorLegalReserve >= maxReserve): addition = 0
else:
    proposed  = netIncome × reservePercent
    room      = maxReserve - priorLegalReserve
    addition  = MIN(proposed, room)
newBalance = priorLegalReserve + addition
```

### 3.8 Profit Appropriation Waterfall

EPD and Legal Reserve are computed **independently** on Net Income (neither deducted before the other):

```
Step 1:  netIncomeAfterEPD  = netIncome - employeeProfitSharing
Step 2:  distributableProfit = netIncome - EPD - legalReserveAddition
Step 3:  canPayDividends     = (distributableProfit > 0) AND (previousRE >= 0)
Step 4:  grossDividends      = canPayDividends ? distributableProfit × payoutRatio : 0
Step 5:  dividendWHTRate     = isEGXListed ? 0.05 : 0.10
Step 6:  dividendWHT         = grossDividends × dividendWHTRate
Step 7:  netDividends        = grossDividends - dividendWHT
Step 8:  additionToRE        = distributableProfit - grossDividends
```

### 3.9 Memo Items

```
effectiveTaxRate = ebt > 0 ? taxExpense / ebt : taxRate
nopat            = ebit × (1 - statutoryTaxRate)
fcff             = nopat + depreciation + amortization - capex - ΔNWC
eps              = netIncomeAfterEPD / sharesOutstanding
```

### 3.10 Historical Income Statement

Historical IS is formula-driven when `statutoryTaxRate` is passed:

```
taxExpense = (statRate != null)
    ? MAX(0, ebt) × statRate         // formula-driven
    : data.taxExpense[i]              // raw input fallback
netIncome  = ebt - taxExpense
nopat      = ebit × (1 - statRate)   // uses statutory, not effective
```

---

## 4. Balance Sheet Engine

**File**: `lib/engines/balance-sheet.ts`

### 4.1 Current Assets

```
cash               = endingCashFromCF ?? previousCash   // plug — see §4.6
accountsReceivable = (dso[yr] × revenue) / 365
inventory          = (dio[yr] × cogs) / 365
prepaidExpenses    = revenue × prepaidPercent[yr]
otherCurrentAssets = otherCurrentAssets[yr] ?? previous

// VAT (FIX-07)
vatReceivable      = enableVAT ? ABS(capex) × vatRate : 0

totalCurrentAssets = cash + AR + inventory + prepaid + otherCA + vatReceivable
```

### 4.2 Non-Current Assets

```
capex                  = revenue × capexPercent[yr]
grossPPE               = previousGrossPPE + capex
accumulatedDepreciation = previousAccDep + depreciation
netPPE                 = grossPPE - accumulatedDepreciation
intangibles            = MAX(0, previousIntangibles - amortization)
goodwill               = goodwill[yr] ?? previousGoodwill
otherLongTermAssets    = otherLongTermAssets[yr] ?? previous
totalNonCurrentAssets  = netPPE + intangibles + goodwill + otherLTA
```

### 4.3 Current Liabilities

```
accountsPayable       = (dpo[yr] × cogs) / 365
accruedExpenses       = revenue × accruedExpPercent[yr]
shortTermDebt         = shortTermDebtAmount[yr] ?? previous
currentPortionLTD     = currentPortionLTD[yr] ?? previous
deferredRevenue       = revenue × deferredRevPercent[yr]
otherCurrentLiabilities = otherCurrentLiabilities[yr] ?? previous

// VAT (FIX-07)
vatPayable            = enableVAT ? MAX(0, revenue × vatRate - ABS(capex) × vatRate) : 0

totalCurrentLiabilities = AP + accrued + STD + CPLTD + deferred + otherCL + vatPayable
```

### 4.4 Non-Current Liabilities

```
longTermDebt              = previousLTD + ltDebtIssuance[yr] - ltDebtRepayment[yr]
deferredTaxLiabilities    = deferredTaxLiabilities[yr] ?? previous
endOfServiceProvision     = previousEOS + (avgMonthlyBasicSalary / 2) × employees[yr]
otherLongTermLiabilities  = otherLongTermLiabilities[yr] ?? previous
totalNonCurrentLiabilities = LTD + DTL + EOS + otherLTL
totalLiabilities          = totalCL + totalNCL
```

### 4.5 Equity

```
commonStock               = commonStock[yr] ?? previous
additionalPaidInCapital   = previousAPIC + equityIssuance[yr] + stockBasedComp[yr]
legalReserve              = priorLegalReserve + legalReserveAddition
retainedEarnings          = previousRE + additionToRE
treasuryStock             = previousTreasuryStock - shareRepurchaseAmount[yr]
otherComprehensiveIncome  = oci[yr] ?? previous
totalEquity               = CS + APIC + legalReserve + RE + treasuryStock + OCI

totalLiabilitiesEquity    = totalLiabilities + totalEquity
```

### 4.6 Cash Plug (Balancing Mechanism)

Cash is the balancing plug — standard Wall Street modeling approach:

```
totalAssets_raw = totalCurrentAssets + totalNonCurrentAssets
imbalance       = totalAssets_raw - totalLiabilitiesEquity

if (ABS(imbalance) > 0.001):
    cash_final = cash - imbalance
    Recalculate totalCurrentAssets, totalAssets

isBalanced      = ABS(totalAssets_final - totalLE) < 0.01
balanceDifference = totalAssets_final - totalLE
```

### 4.7 Depreciation Methods

**Egyptian Tax Depreciation** (declining-balance on NBV, Tax Law 91/2005 Art. 25-26):

```
Default asset mix:
    buildings:  30% @ 5%/yr
    machinery:  35% @ 25%/yr
    vehicles:   15% @ 25%/yr
    computers:  10% @ 50%/yr
    furniture:  10% @ 20%/yr

For each asset class:
    classNBV        = (previousNetPPE + capex) × classWeight
    classDepreciation = classNBV × classRate
totalDepreciation = SUM(classDepreciation)
```

**Straight-Line Depreciation**:

```
avgGrossPPE   = previousGrossPPE + capex / 2
depreciation  = avgGrossPPE × depreciationRate[yr]
```

### 4.8 Interest Calculations

```
interestExpense = beginningTotalDebt × interestRateOnDebt[yr]
interestIncome  = beginningCash × interestRateOnCash[yr]
```

Where `beginningTotalDebt = previousBS.shortTermDebt + previousBS.longTermDebt + previousBS.currentPortionLTD`

---

## 5. Cash Flow Engine

**File**: `lib/engines/cash-flow.ts`

### 5.1 Operating Activities

```
// Non-cash adjustments
depreciation    = IS.depreciation
amortization    = IS.amortization
stockBasedComp  = stockBasedCompAmount[yr]
deferredTaxes   = currentBS.deferredTaxLiabilities - previousBS.deferredTaxLiabilities

// Working capital changes (increase in asset = negative)
changeInAR             = -(currentAR - previousAR)
changeInInventory      = -(currentInv - previousInv)
changeInPrepaid        = -(currentPrepaid - previousPrepaid)
changeInAP             =  (currentAP - previousAP)
changeInAccruedExp     =  (currentAccrued - previousAccrued)
changeInDeferredRev    =  (currentDeferred - previousDeferred)
changeInVATReceivable  = -(currentVATRec - previousVATRec)
changeInVATPayable     =  (currentVATPay - previousVATPay)

totalWC = SUM(all WC changes above)
cashFromOperations = netIncome + D&A + SBC + deferredTaxes + totalWC
```

### 5.2 Investing Activities

```
capex               = -(revenue × capexPercent[yr])     // negative = outflow
acquisitions        = -(acquisitions[yr])
assetSales          = assetSales[yr]
investmentPurchases = -(investmentPurchases[yr])
investmentSales     = investmentSales[yr]

cashFromInvesting = capex + acquisitions + assetSales + investmentPurchases + investmentSales
```

### 5.3 Financing Activities

```
debtIssuance               = longTermDebtIssuance[yr]
debtRepayment              = -(longTermDebtRepayment[yr])
equityIssuance             = equityIssuance[yr]
dividendsPaid              = -(IS.grossDividends)
dividendWHT                = -(IS.dividendWHT)            // memo line
employeeProfitSharingPaid  = -(IS.employeeProfitSharing)
shareRepurchases           = -(shareRepurchaseAmount[yr])

cashFromFinancing = debtIssuance + debtRepayment + equityIssuance
                  + dividendsPaid + EPDPaid + shareRepurchases
```

### 5.4 Net Cash Flow

```
netChangeInCash = CFO + CFI + CFF
beginningCash   = previousBS.cash
endingCash      = beginningCash + netChangeInCash
freeCashFlow    = CFO + capex             // capex is already negative
reconciles      = ABS(endingCash - currentBS.cash) < 0.01
```

### 5.5 Historical Cash Flow (Back-Computed from BS)

Historical CF is derived from period-over-period BS changes:

```
changeInAR = -(currentBS.AR - previousBS.AR)
...same pattern for all WC items including VAT...

capex         = -(currentBS.grossPPE - previousBS.grossPPE)
debtChange    = (currentDebt) - (previousDebt)
debtIssuance  = MAX(0, debtChange)
debtRepayment = -MAX(0, -debtChange)
dividendsPaid = -((previousRE + netIncome) - currentRE)
equityIssuance = (currentAPIC+CS) - (previousAPIC+CS)

netChangeInCash = currentBS.cash - previousBS.cash   // known from BS
```

---

## 6. Financial Ratios

**File**: `lib/ratios.ts`

### 6.1 Profitability

| Ratio | Formula |
|-------|---------|
| Gross Margin | `grossProfit / revenue` |
| EBITDA Margin | `ebitda / revenue` |
| Operating Margin | `ebit / revenue` |
| Net Margin | `netIncome / revenue` |
| ROE | `netIncome / totalEquity` |
| ROA | `netIncome / totalAssets` |
| ROIC | `nopat / (totalEquity + totalDebt - cash)` |
| FCF Margin | `freeCashFlow / revenue` |
| FCF / EBITDA | `freeCashFlow / ebitda` |

### 6.2 Liquidity

| Ratio | Formula |
|-------|---------|
| Current Ratio | `totalCurrentAssets / totalCurrentLiabilities` |
| Quick Ratio | `(totalCurrentAssets - inventory) / totalCurrentLiabilities` |
| Cash Ratio | `cash / totalCurrentLiabilities` |

### 6.3 Leverage

| Ratio | Formula |
|-------|---------|
| Debt / Equity | `totalDebt / totalEquity` |
| Debt / Assets | `totalDebt / totalAssets` |
| Interest Coverage | `ebit / interestExpense` |
| Net Debt | `totalDebt - cash` |
| Net Debt / EBITDA | `netDebt / ebitda` |
| DSCR | `ebitda / (interestExpense + ABS(cf.debtRepayment))` |

### 6.4 Efficiency

| Ratio | Formula |
|-------|---------|
| DSO | `(AR / revenue) × 365` |
| DIO | `(inventory / cogs) × 365` |
| DPO | `(AP / cogs) × 365` |
| Cash Conversion Cycle | `DSO + DIO - DPO` |
| Asset Turnover | `revenue / totalAssets` |
| Inventory Turnover | `cogs / inventory` |
| Receivables Turnover | `revenue / AR` |

### 6.5 Per Share

| Ratio | Formula |
|-------|---------|
| EPS | `netIncomeAfterEPD / sharesOutstanding` |
| Book Value Per Share | `totalEquity / sharesOutstanding` |
| FCF Per Share | `fcff / sharesOutstanding` |
| Revenue Per Share | `revenue / sharesOutstanding` |

### 6.6 DuPont Analysis (3-Factor)

```
ROE = Net Margin × Asset Turnover × Equity Multiplier
    = (NI / Revenue) × (Revenue / Assets) × (Assets / Equity)
```

### 6.7 DuPont Analysis (5-Factor)

```
ROE = Tax Burden × Interest Burden × Op Margin × Asset Turnover × Equity Multiplier
    = (NI / EBT) × (EBT / EBIT) × (EBIT / Revenue) × (Revenue / Assets) × (Assets / Equity)
```

### 6.8 Altman Z'-Score (Private Companies)

```
Z' = 0.717×X1 + 0.847×X2 + 3.107×X3 + 0.420×X4 + 0.998×X5

X1 = Working Capital / Total Assets
X2 = Retained Earnings / Total Assets
X3 = EBIT / Total Assets
X4 = Book Equity / Total Debt
X5 = Revenue / Total Assets

Zones: Safe > 2.90 | Grey 1.23–2.90 | Distress < 1.23
```

### 6.9 Altman EM Z-Score (Emerging Markets — Altman et al. 2005)

```
Z_EM = 6.56×X1 + 3.26×X2 + 6.72×X3 + 1.05×X4

(Same X variables, no X5)

Zones: Safe > 2.60 | Grey 1.10–2.60 | Distress < 1.10
```

### 6.10 Break-Even Analysis

```
variableCostRatio       = cogs / revenue
contributionMarginRatio = 1 - variableCostRatio
fixedCosts              = sga + depreciation + amortization + otherOpex + sbc + rd
breakEvenRevenue        = fixedCosts / contributionMarginRatio
marginOfSafety          = (revenue - breakEvenRevenue) / revenue
operatingLeverage       = (revenue - cogs) / ebit
```

---

## 7. DCF Valuation Engine

**File**: `lib/engines/dcf.ts`

### 7.1 WACC (Weighted Average Cost of Capital)

```
// Cost of Equity (CAPM)
Ke = riskFreeRate + beta × equityRiskPremium

// Cost of Debt (after-tax)
Kd = interestRateOnDebt × (1 - taxRate)

// Capital Structure (from last projected BS)
totalDebt    = STD + LTD + CPLTD
totalEquity  = MAX(totalEquity, 1)
totalCapital = totalDebt + totalEquity
Wd = totalDebt / totalCapital
We = totalEquity / totalCapital

WACC = We × Ke + Wd × Kd
```

### 7.2 Enterprise & Equity Value

```
// Discount projected FCFF
discountedFCF[i] = FCFF[i] / (1 + WACC)^(i+1)

// Terminal Value (Gordon Growth Model)
TV = lastFCFF × (1 + g) / (WACC - g)
pvTerminalValue = TV / (1 + WACC)^nPeriods

// Enterprise Value
EV = SUM(discountedFCFs) + pvTerminalValue

// Equity Value
netDebt     = totalDebt - cash
equityValue = EV - netDebt

// Implied Share Price
impliedSharePrice = equityValue / sharesOutstanding
```

### 7.3 Default Egyptian Market Parameters

| Parameter | Default | Source |
|-----------|---------|--------|
| Risk-Free Rate | 23.5% | 12M T-bill yield Q1 2026 |
| Equity Risk Premium | 10.5% | Damodaran Egypt Jan 2025 |
| Beta | 1.0 | Unlevered proxy |
| Terminal Growth Rate | 7.0% | ~CBE target inflation |
| CBE Main Rate | 19.5% | April 2, 2026 MPC decision |

### 7.4 Sanity Checks

- WACC ≤ 0 or > 50%: warning
- Ke ≤ Kd: unusual risk pricing
- Debt weight > 90%: extreme leverage
- Terminal growth ≥ WACC: TV undefined (negative)
- TV as % of EV > 85%: extend projection horizon
- Implied share price < 0: insolvent entity

---

## 8. Assumptions Structure

**File**: `types/assumptions.ts`

### AssumptionSet — Complete Field List

#### Revenue & Cost Drivers (arrays — one per projection year)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `revenueBase` | `number` | 1,000,000 | Base revenue (Year 0 actual) |
| `revenueGrowthRate` | `number[]` | [0.10, 0.08, 0.07, 0.06, 0.05] | Annual growth |
| `cogsPercent` | `number[]` | 0.60 | COGS as % of revenue |
| `sgaPercent` | `number[]` | 0.15 | SG&A as % of revenue |
| `rdPercent` | `number[]` | 0.05 | R&D as % of revenue |
| `otherOpexPercent` | `number[]` | 0.02 | Other OpEx as % |

#### Working Capital (days)

| Field | Type | Default |
|-------|------|---------|
| `dso` | `number[]` | 45 |
| `dio` | `number[]` | 30 |
| `dpo` | `number[]` | 40 |
| `prepaidPercent` | `number[]` | 0.01 |
| `accruedExpPercent` | `number[]` | 0.03 |
| `deferredRevPercent` | `number[]` | 0.02 |

#### CapEx & Depreciation

| Field | Type | Default |
|-------|------|---------|
| `capexPercent` | `number[]` | 0.05 |
| `depreciationRate` | `number[]` | per asset mix |
| `amortizationAmount` | `number[]` | 5,000 |
| `depreciationMethod` | `string` | `'egyptian-tax'` |
| `assetMix` | `object` | `{buildings:0.30, machinery:0.35, vehicles:0.15, computers:0.10, furniture:0.10}` |

#### Debt & Interest (CBE-linked)

| Field | Type | Default |
|-------|------|---------|
| `cbeRate` | `number` | 0.195 (19.5%) |
| `interestRateOnDebt` | `number[]` | [0.22, 0.20, 0.18, 0.17, 0.16] |
| `interestRateOnCash` | `number[]` | [0.19, 0.17, 0.15, 0.14, 0.13] |
| `shortTermDebtAmount` | `number[]` | 0 |
| `longTermDebtIssuance` | `number[]` | 0 |
| `longTermDebtRepayment` | `number[]` | 20,000 |
| `currentPortionLTD` | `number[]` | 0 |

#### Formula-Driven Rate Schedule

| Field | Type | Default |
|-------|------|---------|
| `useFormulaRates` | `boolean` | false |
| `cbeRateProjection` | `number[]` | [0.195, 0.175, 0.155, 0.140, 0.130] |
| `corporateCreditSpread` | `number` | 0.02 (200bps) |

#### Tax (Egyptian CIT)

| Field | Type | Default |
|-------|------|---------|
| `taxRate` | `number[]` | 0.225 (22.5%) |
| `taxRegime` | `string` | `'standard'` |
| `enableTaxLossCarryforward` | `boolean` | true |
| `taxLossCarryforwardYears` | `number` | 5 |
| `enableThinCapRule` | `boolean` | true |

#### Employee Profit Sharing (Labor Law)

| Field | Type | Default |
|-------|------|---------|
| `enableEmployeeProfitShare` | `boolean` | true |
| `employeeProfitSharingRate` | `number` | 0.10 (10%) |
| `enableNonOperatingExclusion` | `boolean` | false |
| `totalAnnualPayroll` | `number` | (cap, optional) |

#### Legal Reserve (Companies Law Art. 40)

| Field | Type | Default |
|-------|------|---------|
| `enableLegalReserve` | `boolean` | true |
| `legalReservePercent` | `number` | 0.05 (5%) |
| `legalReserveCap` | `number` | 0.50 (50% of capital) |
| `paidUpCapital` | `number` | 500,000 |
| `initialLegalReserve` | `number` | 0 |

#### Dividends

| Field | Type | Default |
|-------|------|---------|
| `dividendPayoutRatio` | `number[]` | 0.30 (30%) |
| `dividendWithholdingTaxRate` | `number` | 0.10 (10%) |
| `isEGXListed` | `boolean` | false |

#### VAT

| Field | Type | Default |
|-------|------|---------|
| `enableVAT` | `boolean` | true (Egypt) |
| `vatRate` | `number` | 0.14 (14%) |

#### DCF

| Field | Type | Default |
|-------|------|---------|
| `riskFreeRate` | `number` | 0.235 |
| `equityRiskPremium` | `number` | 0.105 |
| `beta` | `number` | 1.0 |
| `terminalGrowthRate` | `number` | 0.07 |

#### Time

| Field | Type | Default |
|-------|------|---------|
| `startYear` | `number` | 2026 |
| `projectionYears` | `number` | 5 |
| `historicalYears` | `number` | 2 |

---

## 9. Egyptian Regulatory Constants

### Corporate Income Tax

| Rule | Value | Law |
|------|-------|-----|
| Standard CIT Rate | 22.5% | Income Tax Law 91/2005 |
| Tax Loss Carryforward | 5 years, FIFO | Tax Law Art. 29 |
| Thin-Cap D/E Limit (2024-2027) | 3:1 | Law No. 30/2023 |
| Thin-Cap D/E Limit (2028+) | 2:1 | Law No. 30/2023 |
| Thin-Cap Rate Ceiling | 2× CBE discount rate | Law No. 30/2023 |

### VAT

| Rule | Value | Law |
|------|-------|-----|
| Standard VAT Rate | 14% | Law No. 67/2016 |
| VAT Receivable | Input VAT on CapEx | |
| VAT Payable | MAX(0, Output VAT - Input VAT) | |

### Labor & Distribution

| Rule | Value | Law |
|------|-------|-----|
| Employee Profit Distribution | 10% of Net Income | Labor Law No. 14/2025 |
| Legal Reserve | 5% of NI, cap at 50% of capital | Companies Law Art. 40 |
| Dividend WHT (EGX-listed) | 5% | Tax Law Art. 56 bis |
| Dividend WHT (unlisted) | 10% | Tax Law Art. 56 bis |
| No dividends if RE < 0 | Blocked | Companies Law Art. 53 |
| End of Service | (avg monthly basic / 2) × years | Labor Law + EAS 38 |

### Tax Depreciation (Declining-Balance on NBV)

| Asset Class | Rate | Law |
|-------------|------|-----|
| Buildings | 5% | Tax Law 91/2005 Art. 25-26 |
| Machinery & Equipment | 25% | " |
| Vehicles & Transport | 25% | " |
| Computers & IT | 50% | " (accelerated) |
| Furniture & Fixtures | 20% | " |

### CBE Policy Rates (April 2, 2026 MPC Decision)

| Rate | Value |
|------|-------|
| Overnight Deposit | 19.00% |
| Overnight Lending | 20.00% |
| Main Operation / Discount | 19.50% |
| 12M T-Bill Yield (Q1 2026) | ~23.5% |

---

## 10. Store & State Management

**File**: `lib/store.ts`  
**Pattern**: Zustand + `persist` middleware (localStorage)

### State Shape

```typescript
{
    // Company
    companyName, ticker, industry, currency, country, fiscalYearEnd, valuationDate

    // Historical
    historicalData: HistoricalDataInput[]    // per-year format
    historicalInputs: HistoricalInputs       // array format (derived)

    // Scenarios
    scenarios: Scenario[]                    // each has {id, name, type, assumptions, results}
    activeScenarioId: string

    // UI
    isDarkMode, activeTab, isCalculating, sidebarOpen
    lastSaved, errors[], warnings[], calculationError

    // Undo/Redo (50 entries max)
    undoStack, redoStack

    // Live Market Data
    liveRates: LiveRates | null
    lastRatesFetch: string | null

    // Data Version
    dataVersion: number                      // migration tracking (v1-v9)
}
```

### Key Actions

| Action | Description |
|--------|-------------|
| `calculateModel()` | Runs full model on active scenario |
| `calculateAllScenarios()` | Recalculates all scenarios |
| `updateAssumption(key, value)` | Supports array indexing (e.g., `"revenueGrowthRate[0]"`) |
| `addScenario()` | Create new scenario (copies active assumptions) |
| `deleteScenario()` / `duplicateScenario()` | Manage scenarios |
| `setCountryPreset(preset)` | Apply Egypt/US/Custom defaults |
| `refreshLiveRates()` | Fetch CBE/T-bill/FX from external API |
| `undo()` / `redo()` | 50-entry undo stack |

### Migration History

| Version | Change |
|---------|--------|
| v1-v3 | Initial schema, tax regime corrections |
| v4 | Force-reset interest rates from US defaults to Egyptian; fix startYear 2025→2026; fix historical period labels |
| v5 | Fix erroneous tax rates (< 10% → 22.5%) |
| v6 | Historical period label dedup fix |
| v7 | Force recalc for new ratio fields (DSCR, netDebt, etc.) |
| v8 | CBE rate correction (27.25% → 19.50%); declining rate arrays |
| v9 | Force recalc for formula-driven historical tax/NOPAT |

---

## 11. Excel Export Architecture

**Files**: `lib/export/excel.ts`, `lib/export/build-calc-sheets.ts`, `lib/export/build-scenarios.ts`

### Tab Structure

| # | Sheet Name | Visibility | Purpose |
|---|-----------|------------|---------|
| 1 | Assumptions | Visible | All driver inputs in known rows |
| 2 | Income Statement | Visible | Live formulas referencing Assumptions |
| 3 | Balance Sheet | Visible | Live formulas; Cash = plug |
| 4 | Cash Flow | Visible | Live formulas from IS + BS deltas |
| 5 | Ratios | Visible | Formulas referencing IS/BS/CF |
| 6 | Company Info | Visible | Metadata |
| 7 | Scenarios | Visible | Multi-scenario dashboard |
| 8 | Dashboard | Visible | Charts + KPI |
| 9 | _Calc_Base | Hidden | Full 3-statement calc (Base scenario) |
| 10 | _Calc_Opt | Hidden | Full 3-statement calc (Optimistic) |
| 11 | _Calc_Con | Hidden | Full 3-statement calc (Conservative) |

### Workbook Calculation Properties

```javascript
fullCalcOnLoad: false    // Prevents wrong first-pass from circular refs
calcOnSave: false
calcMode: 'auto'
iterate: true
iterateCount: 1000
iterateDelta: 0.001
```

**Important**: `fullCalcOnLoad=false` ensures engine-cached values display on first open. Users trigger recalculation with `Ctrl+Alt+F9`.

### Formula Cross-References

```
IS formulas → Assumptions!$B$4 (via aRef helper)
BS formulas → IS + Assumptions
CF formulas → IS + BS (period deltas)
Scenarios   → _Calc_Base/Opt/Con (hidden sheets)
```

### Historical vs Projected Handling

- **Historical periods**: Static engine values (frozen actuals)
- **Projected periods**: Live Excel formulas referencing Assumptions tab
- Pattern used by all IS/BS/CF rows:

```javascript
if (i < numHistorical) {
    cell.value = engineValue;           // static
} else {
    cell.value = { formula: ..., result: engineValue };  // live formula + cached result
}
```

### _Calc Sheet R Constant Map (111 rows)

```
// Income Statement (rows 4-34)
R.revenue: 4,  R.cogs: 6,  R.grossProfit: 7,
R.ebit: 15,  R.ebt: 19,  R.tax: 20,  R.netIncome: 21,
R.employeeProfitSharing: 22,  R.legalReserveAddition: 24,
R.grossDividends: 27,  R.dividendWHT: 28,  R.additionToRE: 30,
R.nopat: 33,  R.fcff: 34

// Balance Sheet (rows 36-77)
R.cash: 36,  R.accountsReceivable: 37,  R.inventory: 38,
R.vatReceivable: 40,  R.totalCA: 42,
R.grossPPE: 44,  R.netPPE: 46,
R.accountsPayable: 53,  R.vatPayable: 58,  R.totalCL: 60,
R.longTermDebt: 62,  R.retainedEarnings: 71,
R.totalEquity: 74,  R.totalLE: 76,  R.balanceCheck: 77

// Cash Flow (rows 79-111)
R.cf_netIncome: 79,  R.cf_changeAR: 84,
R.cf_changeVATRec: 90,  R.cf_changeVATPay: 91,
R.cf_totalWC: 92,  R.cf_cfo: 93,
R.cf_capex: 95,  R.cf_cfi: 98,
R.cf_dividends: 102,  R.cf_cff: 106,
R.cf_endCash: 110,  R.cf_fcf: 111
```

### Assumptions Sheet Keys

The `aRef(key, yearIndex)` helper maps to Assumptions sheet rows:

```
Revenue: revenueGrowthRate, cogsPercent, sgaPercent, rdPercent, otherOpexPercent
Tax:     taxRate, enableVAT, vatRate
WC:      dso, dio, dpo, prepaidPercent, accruedExpPercent, deferredRevPercent
CapEx:   capexPercent, depreciationRate, amortizationAmount
Debt:    interestRateOnDebt, interestRateOnCash
Equity:  sharesOutstanding, dividendPayoutRatio, stockBasedCompAmount
Other:   otherIncomeExpense, acquisitions, assetSales, etc.
```

---

## 12. CSV & JSON Export

**File**: `lib/export/csv-json.ts`

### JSON Export

Dumps the full engine state — all arrays from `ModelResults` are included:

```javascript
{
    engineVersion: '3SM-v9',
    companyInfo: { ... },
    assumptions: { ... },           // active scenario
    historicalInputs: { ... },      // with corrected period labels
    scenarios: [ ... ],             // all scenarios with results
    incomeStatements: [ ... ],      // full IS array (historical + projected)
    balanceSheets: [ ... ],         // full BS array
    cashFlowStatements: [ ... ],    // full CF array
    ratios: [ ... ],                // all ratios
    convergenceInfo: { ... },
    integrationChecks: [ ... ],
    dcfValuation: { ... },
    valuationMultiples: { ... },
    validationReport: { ... },
    liveRates: { ... }
}
```

### CSV Export

Line-item rows matching engine 1:1:

- **Income Statement**: 41 rows (all margins, tax fields, appropriation waterfall, NOPAT, FCFF)
- **Balance Sheet**: 37 rows (all line items including VAT, checks)
- **Cash Flow**: 33 rows (all WC including VAT, all investing/financing, reconciles)
- **Ratios**: 36 rows (profitability, liquidity, leverage, DuPont, Altman, break-even, per-share)
- **DCF**: 7 summary rows

---

## 13. UI Components

**File**: `components/`

### Main Statement Views

| Component | Tab | Content |
|-----------|-----|---------|
| `IncomeStatementPage.tsx` | `income` | Full IS with all periods |
| `BalanceSheetPage.tsx` | `balance` | BS with balance check badges |
| `CashFlowPage.tsx` | `cashflow` | CF with reconciliation check |
| `RatiosPage.tsx` | `ratios` | All ratio categories |

### Model Input

| Component | Tab | Content |
|-----------|-----|---------|
| `ModelPage.tsx` | `model` | Assumption editor (tabbed) |
| `HistoricalDataInput.tsx` | `historicaldata` | Per-year IS/BS data entry |
| `HistoricalImportPage.tsx` | `import` | Excel/CSV import |

### Analysis

| Component | Tab | Content |
|-----------|-----|---------|
| `Dashboard.tsx` | `dashboard` | KPI cards, summary |
| `ScenariosPage.tsx` | `scenarios` | Create/compare scenarios |
| `DCFPage.tsx` | `dcf` | DCF inputs & valuation |
| `ValuationPage.tsx` | `valuation` | Multiples (P/E, EV/EBITDA) |
| `SensitivityPage.tsx` | `sensitivity` | 1-way & 2-way tables |
| `MonteCarloPage.tsx` | `montecarlo` | Monte Carlo simulation |
| `ValidationPage.tsx` | `validation` | AI validation results |

### Schedules

| Component | Tab | Content |
|-----------|-----|---------|
| `WorkingCapitalPage.tsx` | `working-capital` | DSO/DIO/DPO/CCC |
| `DepreciationPage.tsx` | `depreciation` | Egyptian asset class schedule |
| `DebtSchedulePage.tsx` | `debt-schedule` | Debt amortization table |

### Settings & Market

| Component | Tab | Content |
|-----------|-----|---------|
| `CompanySettings.tsx` | `company-settings` | Company metadata |
| `CBEMetricsPage.tsx` | `cbe-metrics` | CBE rate tracker, inflation |
| `LiveRatesPanel.tsx` | `live-rates` | Live CBE/T-bill/FX rates |

### Navigation

| Component | Description |
|-----------|-------------|
| `Navbar.tsx` | Top nav with live rates badge |
| `Sidebar.tsx` | Collapsible side menu |

---

## 14. Type Interfaces

**File**: `types/financial.ts`

### IncomeStatement (40+ fields)

```typescript
period, periodType,
revenue, revenueGrowthRate,
cogs, grossProfit, grossMargin,
sgaExpense, rdExpense, depreciation, amortization, otherOpex, stockBasedComp, totalOpex,
ebit, ebitda, ebitMargin,
interestIncome, interestExpense, otherIncomeExpense,
ebt, taxRate, taxExpense,
netIncome, netMargin,
employeeProfitSharing, netIncomeAfterEPD,
taxLossCarryforward, taxLossUtilized, taxLossRemaining, taxableIncome,
disallowedInterest?, adjustedTaxableIncome?, thinCapDeRatioLimit?, thinCapRateCeiling?,
legalReserveAddition, distributableProfit, grossDividends, dividendWHT, netDividends, additionToRE,
nopat, fcff, sharesOutstanding, eps
```

### BalanceSheet (35+ fields)

```typescript
period, periodType,
cash, accountsReceivable, inventory, prepaidExpenses, otherCurrentAssets, totalCurrentAssets,
grossPPE, accumulatedDepreciation, netPPE, intangibles, goodwill, otherLongTermAssets, totalNonCurrentAssets,
totalAssets,
accountsPayable, accruedExpenses, shortTermDebt, currentPortionLTD, deferredRevenue, otherCurrentLiabilities, totalCurrentLiabilities,
longTermDebt, deferredTaxLiabilities, otherLongTermLiabilities, totalNonCurrentLiabilities,
totalLiabilities,
commonStock, additionalPaidInCapital, legalReserve, retainedEarnings, treasuryStock, otherComprehensiveIncome, totalEquity,
endOfServiceProvision,
totalLiabilitiesEquity, isBalanced, balanceDifference,
vatReceivable?, vatPayable?
```

### CashFlowStatement (30+ fields)

```typescript
period, periodType,
netIncome, depreciation, amortization, stockBasedComp, deferredTaxes,
changeInAR, changeInInventory, changeInPrepaid, changeInAP, changeInAccruedExp, changeInDeferredRev,
changeInVATReceivable, changeInVATPayable,
totalWorkingCapitalChange, cashFromOperations,
capex, acquisitions, assetSales, investmentPurchases, investmentSales, cashFromInvesting,
debtIssuance, debtRepayment, equityIssuance, dividendsPaid, dividendWHT, employeeProfitSharingPaid, shareRepurchases, cashFromFinancing,
netChangeInCash, beginningCash, endingCash,
freeCashFlow, reconciles
```

### FinancialRatios (40+ fields)

```typescript
// Profitability
grossMargin, ebitdaMargin, operatingMargin, netMargin, roe, roa, roic
// Liquidity
currentRatio, quickRatio, cashRatio
// Leverage
debtToEquity, debtToAssets, interestCoverage, netDebt?, netDebtToEbitda?, dscr?
// Efficiency
assetTurnover, inventoryTurnover, receivablesTurnover, dso, dio, dpo, cashConversionCycle, fcfMargin?, fcfToEbitda?
// DuPont
dupontROE_3F?, dupontROE_5F?
// Altman
altmanZScore?, altmanZone?, altmanZScoreEM?, altmanZoneEM?
// Break-Even
breakEvenRevenue?, marginOfSafety?, operatingLeverage?
// Per Share
bookValuePerShare?, fcfPerShare?, revenuePerShare?, eps?
```

---

## 15. Integration Checks

**28 assertions** run per projected period to validate IS-BS-CF ties:

| # | Check | Formula |
|---|-------|---------|
| 1 | Assets = L + E | `ABS(totalAssets - totalLE) < 0.01` |
| 2 | BS Cash = CF Ending Cash | `ABS(bs.cash - cf.endingCash) < 0.01` |
| 3 | IS NI = CF NI | `ABS(is.netIncome - cf.netIncome) < 0.01` |
| 4 | PP&E Schedule | `grossPPE = prevGrossPPE + capex` |
| 5 | RE Rollforward | `RE = prevRE + additionToRE` |
| 6 | LTD Schedule | `LTD = prevLTD + issuance - repayment` |
| 7 | CF Net = CFO+CFI+CFF | `netChange = cfo + cfi + cff` |
| 8 | WC ties to CF | WC changes match BS deltas |
| 9-13 | Subtotal sums | CA, NCA, CL, NCL, Equity sums |
| 14 | Gross→Net Income | Waterfall arithmetic |
| 15 | EBITDA = EBIT + D&A | Identity check |
| 16 | APIC change = SBC + equity | Equity bridge |
| 17 | EPD = NI × rate | Labor Law compliance |
| 18 | NI after EPD | Subtraction check |
| 19 | Distributable = NI-EPD-LR | Appropriation check |
| 20 | Dividends ≤ Distributable | Cap check |
| 21 | Net Div = Gross - WHT | WHT arithmetic |
| 22 | Addition to RE | RE bridge |
| 23 | NOPAT = EBIT×(1-t) | Memo check |
| 24 | Legal Reserve rollforward | Accumulation check |
| 25 | Tax loss utilized ≤ carried | FIFO bound |
| 26 | Taxable income after loss | Offset check |
| 27 | CF dividends = IS dividends | Cross-statement tie |
| 28 | CF WHT = IS WHT | Cross-statement tie |

---

## 16. File Map

```
lib/
├── engines/
│   ├── integrator.ts              # Orchestrates full model build
│   ├── circular-resolver.ts       # 500-iteration convergence solver
│   ├── income-statement.ts        # IS calc (historical + projected)
│   ├── balance-sheet.ts           # BS calc + depreciation + interest
│   ├── cash-flow.ts               # CF calc (projected + historical back-compute)
│   └── dcf.ts                     # DCF valuation (WACC, TV, EV, equity value)
├── export/
│   ├── excel.ts                   # Main Excel workbook builder
│   ├── build-calc-sheets.ts       # Hidden _Calc sheets (R constant map)
│   ├── build-scenarios.ts         # Scenarios tab with multi-scenario formulas
│   ├── build-company-info.ts      # Company Info tab
│   ├── csv-json.ts                # CSV & JSON export
│   └── pdf.ts                     # PDF export
├── schedules/
│   └── egyptian-depreciation.ts   # Egyptian tax depreciation (declining-balance)
├── services/
│   └── liveRates.ts               # CBE/T-bill/FX rate fetcher
├── ratios.ts                      # 40+ financial ratios
├── store.ts                       # Zustand store (state + persistence + migrations v1-v9)
└── utils.ts                       # Formatting helpers (formatCurrency, etc.)

components/
├── statements/
│   ├── IncomeStatementPage.tsx
│   ├── BalanceSheetPage.tsx
│   └── CashFlowPage.tsx
├── Dashboard.tsx
├── ModelPage.tsx
├── ScenariosPage.tsx
├── DCFPage.tsx
├── RatiosPage.tsx
├── LiveRatesPanel.tsx
├── Navbar.tsx
├── Sidebar.tsx
└── ... (20+ more)

types/
├── financial.ts                   # IS, BS, CF, Ratios, DCF interfaces
├── assumptions.ts                 # AssumptionSet + HistoricalInputs + defaults
├── scenario.ts                    # Scenario type + tab union
└── historical.ts                  # HistoricalDataInput defaults

app/
├── page.tsx                       # Main page (tab router)
└── api/validate/route.ts          # AI validation endpoint
```

---

*Generated April 11, 2026 — Engine Version 3SM-v9*
