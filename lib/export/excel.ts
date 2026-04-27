// ============================================================
// Excel Export — ExcelJS  (with LIVE FORMULAS + Scenario Dashboard)
// ============================================================
//
// Architecture
// ────────────
// Tab 1  "Assumptions"  → All driver inputs in known cells.
// Tab 2  "Income Statement" → Formulas referencing Assumptions + intra-sheet maths.
// Tab 3  "Balance Sheet"    → Formulas referencing Assumptions + IS tab.
// Tab 4  "Cash Flow"        → Formulas referencing IS + BS tabs + Assumptions.
// Tab 5  "Ratios"           → Formulas referencing the statement tabs.
//
// Users can tweak any Assumptions cell and all three statements + ratios
// will recalculate automatically.
// ============================================================

import ExcelJS from 'exceljs';
import { ModelResults } from '@/types/financial';
import { AssumptionSet, HistoricalInputs } from '@/types/assumptions';
import { Scenario, ScenarioType } from '@/types/scenario';
import { runFullModel } from '@/lib/engines/integrator';
import { SCENARIOS, ScenarioEnum, getScenarioAssumptions } from '@/lib/scenarios';
import { buildCompanyInfoSheet } from './build-company-info';
import { buildScenariosSheet, ROW_SPECS } from './build-scenarios';
import { buildDashboardSheet } from './build-dashboard';
import { buildCalcSheets } from './build-calc-sheets';
import JSZip from 'jszip';

// ── Helpers ──────────────────────────────────────────────────

/** Column letter for 1-based column index (1→A, 2→B, … 27→AA) */
function colLetter(col: number): string {
    let s = '';
    while (col > 0) {
        const rem = (col - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        col = Math.floor((col - 1) / 26);
    }
    return s;
}

// Style constants
const DARK_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
const MED_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16213E' } };
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const LIGHT_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
const INPUT_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } }; // light yellow = input cell
const WHITE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const BOLD_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 };
const NUM_FMT = '#,##0;(#,##0);0';
const PCT_FMT = '0.0%';
const EPS_FMT = '$#,##0.00';
const BORDER_THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF333333' } };
const BORDERS: Partial<ExcelJS.Borders> = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

function styleHeader(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).eachCell(cell => {
        cell.fill = DARK_BG;
        cell.font = WHITE_FONT;
        cell.border = BORDERS;
        cell.alignment = { horizontal: 'center' };
    });
    sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
}

function styleRow(row: ExcelJS.Row, opts?: { bold?: boolean; subheader?: boolean; input?: boolean; numFmt?: string }) {
    row.eachCell((cell, colNumber) => {
        cell.border = BORDERS;
        if (opts?.bold) cell.font = BOLD_FONT;
        if (opts?.subheader) {
            cell.fill = MED_BG;
            cell.font = { bold: true, color: { argb: 'FFE0E0E0' } };
        }
        if (opts?.input && colNumber > 1) cell.fill = INPUT_BG;
        if (opts?.numFmt && colNumber > 1) cell.numFmt = opts.numFmt;
    });
}

// Zebra-stripe alternate data rows for readability
const ZEBRA_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
const NEG_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFCC0000' } };

function applyZebraAndNegatives(sheet: ExcelJS.Worksheet) {
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 1) return; // skip header
        // Zebra stripe on even rows (excluding subheader/header-styled rows)
        const firstCell = row.getCell(1);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hasFill = firstCell.fill && (firstCell.fill as any).pattern === 'solid' && (firstCell.fill as any).fgColor?.argb;
        if (!hasFill && rowNumber % 2 === 0) {
            row.eachCell(cell => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cf = cell.fill as any;
                if (!cf || cf.pattern !== 'solid' || !cf.fgColor?.argb) {
                    cell.fill = ZEBRA_BG;
                }
            });
        }
        // Negative numbers: red color
        row.eachCell((cell, colNumber) => {
            if (colNumber > 1 && typeof cell.value === 'number' && cell.value < 0) {
                cell.font = { ...cell.font, ...NEG_FONT };
            }
        });
    });
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════

type ExportLiveRates = { cbeDepositRate: number; cbeLendingRate: number; cbeDiscountRate: number; tbillRate12m: number; usdEgpRate: number; eurEgpRate: number; sarEgpRate: number; aedEgpRate: number; egyptianCPI: number; lastUpdated: string; lastMPCDate: string; source: string } | null;

/**
 * Pure workbook builder — runnable in Node (no Blob, no document).
 * Returns the populated ExcelJS.Workbook so callers can either trigger a
 * browser download (exportToExcel) or write to disk (scripts/run-export.mjs).
 */
export async function buildWorkbook(
    results: ModelResults,
    assumptions: AssumptionSet,
    companyName: string,
    allScenarios?: Scenario[],
    historicalInputs?: HistoricalInputs,
    liveRates?: ExportLiveRates,
): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FinModel Engine';
    workbook.created = new Date();

    // ⭐ Workbook calculation properties
    // fullCalcOnLoad = FALSE — Excel displays the pre-computed cached engine values.
    // This prevents Excel from overwriting correct converged values with wrong
    // first-pass results when iterative calculation is not enabled in user's Excel settings.
    // The circular reference (Cash → Interest Income → NI → CF → Cash) requires
    // iterative calculation to converge. If the user's Excel has iterative calc off,
    // fullCalcOnLoad=true would produce wrong values (e.g. 39,387 instead of 61,771).
    // With fullCalcOnLoad=false, cached engine values display correctly on first open.
    workbook.calcProperties = {
        fullCalcOnLoad: false,
        calcOnSave: false,
        calcMode: 'auto',
    } as ExcelJS.CalculationProperties;
    // Iterative calculation settings — used IF user manually recalculates (Ctrl+Alt+F9)
    // ExcelJS types don't include iterate/iterateCount/iterateDelta, but they are
    // written to <calcPr> when present on the object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calcProps = workbook.calcProperties as any;
    calcProps.iterate = true;
    calcProps.iterateCount = 1000;
    calcProps.iterateDelta = 0.001;

    const nYears = results.incomeStatements.length;
    // Period labels come from results (could be "2024E", "2025E", etc.)
    const periods = results.incomeStatements.map(s => s.period);
    const numHistorical = results.incomeStatements.filter(s => s.periodType === 'historical').length;

    // ── GUARANTEE ALL 3 SCENARIOS (Single Source of Truth) ──
    // Uses SCENARIOS from scenarios.ts — the same definitions the engine uses.
    // If a scenario type is missing from the store or lacks results,
    // create it using getScenarioAssumptions() and compute via runFullModel().
    // This ensures the Excel numbers EXACTLY match the engine.
    const REQUIRED_SCENARIO_TYPES: { type: ScenarioType; enum: ScenarioEnum; name: string }[] = [
        { type: 'base', enum: ScenarioEnum.BASE, name: 'Base Case' },
        { type: 'optimistic', enum: ScenarioEnum.OPTIMISTIC, name: 'Optimistic Case' },
        { type: 'conservative', enum: ScenarioEnum.CONSERVATIVE, name: 'Conservative Case' },
    ];

    // Start with whatever the store provides, or empty array
    const guaranteedScenarios: Scenario[] = allScenarios ? [...allScenarios] : [];

    console.log('=== Scenario Guarantee (Single Source of Truth) ===');
    console.log(`  Store provided ${guaranteedScenarios.length} scenario(s)`);
    guaranteedScenarios.forEach((s, i) => {
        console.log(`    [${i}] name="${s.name}" type="${s.type}" hasResults=${!!s.results}`);
    });

    for (const req of REQUIRED_SCENARIO_TYPES) {
        let scenario = guaranteedScenarios.find(s => s.type === req.type);

        if (!scenario) {
            // Create using the canonical definitions from scenarios.ts
            const scenDef = SCENARIOS[req.enum];
            // getScenarioAssumptions merges the canonical overrides onto the base assumptions
            const scenarioAssumptions = getScenarioAssumptions(assumptions, req.enum);
            console.log(`  → Creating missing scenario type="${req.type}" ("${scenDef.name}")`);
            console.log(`    Overrides applied:`, Object.keys(scenDef.assumptions));

            scenario = {
                id: `export-${req.type}`,
                name: scenDef.name,
                type: req.type,
                description: scenDef.description,
                assumptions: scenarioAssumptions,
                results: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            guaranteedScenarios.push(scenario);
        }

        // ── Sync global settings from Base Case ──
        // Country-level settings (tax rate, VAT, fiscal year, etc.) are global
        // and should be consistent across all scenarios. The Base Case's
        // `assumptions` parameter is the single source of truth for these.
        // MUST match the GLOBAL_KEYS list in lib/store.ts calculateAllScenarios.
        const GLOBAL_KEYS: (keyof AssumptionSet)[] = [
            'taxRate', 'taxRegime', 'vatRate', 'enableVAT', 'dividendWithholdingRate', 'dividendWithholdingTaxRate',
            'isEGXListed', 'useEgyptianRates', 'countryPreset', 'fiscalYearPreset', 'fiscalYearEnd',
            'projectionYears', 'historicalYears',
            'cbeRate', 'riskFreeRate', 'legacyDebtRate', 'employeeProfitSharingRate',
            'enableEmployeeProfitShare', 'enableTaxLossCarryforward', 'taxLossCarryforwardYears',
            'enableLegalReserve', 'legalReservePercent', 'paidUpCapital', 'legalReserveCap',
            'initialLegalReserve', 'priorPeriodDividendsPaidFromRE',
            'depreciationMethod', 'enableEndOfServiceBenefit',
            'interestRateOnDebt', 'interestRateOnCash',
            'historicalInterestRateOnDebt', 'historicalInterestRateOnCash',
        ];
        for (const key of GLOBAL_KEYS) {
            if (assumptions[key] !== undefined) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (scenario.assumptions as any)[key] = assumptions[key];
            }
        }

        // Compute or RE-COMPUTE results to guarantee they match the engine
        // Always recompute to ensure the results match the current assumptions
        if (historicalInputs) {
            try {
                console.log(`  → Computing results for "${scenario.name}"...`);
                console.log(`    taxRate: ${JSON.stringify(scenario.assumptions.taxRate)}`);
                const computed = runFullModel(scenario.assumptions, historicalInputs);
                scenario.results = computed;
                console.log(`  → ✓ Computed successfully`);
            } catch (e) {
                console.warn(`  → ✗ Failed to compute scenario '${scenario.name}':`, e);
            }
        }
    }

    console.log(`  Final: ${guaranteedScenarios.filter(s => s.results).length}/${guaranteedScenarios.length} with results`);

    // Use the guaranteed scenarios for the rest of the export
    allScenarios = guaranteedScenarios;

    // hdRows: tracks Historical Data sheet row numbers so other sheets can
    // formula-reference them. Populated when the Historical Data tab is built.
    const hdRows: Record<string, number> = {};

    // ── Back-compute historical assumption values from results ──
    // So the Assumptions tab has values for ALL years and formulas work everywhere.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const histIS = results.incomeStatements.slice(0, numHistorical);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const histBS = results.balanceSheets.slice(0, numHistorical);
    // CF has numHistorical-1 entries (needs prior BS for deltas)
    const numHistoricalCF = results.cashFlowStatements.filter(s => s.periodType === 'historical').length;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const histCF = results.cashFlowStatements.slice(0, numHistoricalCF);
    const safeDiv = (a: number, b: number) => b !== 0 ? a / b : 0;

    // Combined arrays: derive ALL values (historical + projected) from engine results.
    // This ensures the Assumptions tab always reflects the correct scenario's values,
    // since `results` is already recomputed per-scenario via runFullModel().
    const allIS = results.incomeStatements;
    const allBS = results.balanceSheets;
    const engineRevenues = allIS.map(is => is.revenue);

    // Revenue growth: compute YoY from actual engine revenue (ensures chain matches exactly)
    const allRevenueGrowth = engineRevenues.map((rev, i) => {
        if (i === 0) return 0;
        return safeDiv(rev - engineRevenues[i - 1], engineRevenues[i - 1]);
    });
    const allCogsPercent = allIS.map(is => safeDiv(is.cogs, is.revenue));
    const allSgaPercent = allIS.map(is => safeDiv(is.sgaExpense, is.revenue));
    const allRdPercent = allIS.map(is => safeDiv(is.rdExpense, is.revenue));
    const allOtherOpexPct = allIS.map(is => safeDiv(is.otherOpex, is.revenue));
    // Use statutory assumption rate for ALL periods (not back-computed effective rate).
    // Egypt's statutory CIT = 22.5%; the effective rate from historical data may differ.
    const allTaxRate = Array.from({ length: nYears }, (_, i) => {
        if (i < numHistorical) {
            return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[0] ?? 0.225) : 0.225;
        }
        const projIdx = i - numHistorical;
        return Array.isArray(assumptions.taxRate) ? (assumptions.taxRate[projIdx] ?? 0.225) : 0.225;
    });
    const allOtherIncome = allIS.map(is => is.otherIncomeExpense);
    const allShares = allIS.map(is => is.sharesOutstanding);
    // SBC: derive from IS or CF engine results
    const allSBC = allIS.map((is, i) => {
        // Use IS stockBasedComp directly (engine-computed for all periods)
        if (is.stockBasedComp !== undefined && is.stockBasedComp !== 0) return is.stockBasedComp;
        // Fallback: CF SBC (CF index = IS index - 1)
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            return results.cashFlowStatements[cfIdx].stockBasedComp;
        }
        return 0;
    });

    // Working capital days: back-calculate from BS/IS for all periods
    const allDSO = allBS.map((bs, i) => safeDiv(bs.accountsReceivable, allIS[i]?.revenue ?? 1) * 365);
    const allDIO = allBS.map((bs, i) => safeDiv(bs.inventory, allIS[i]?.cogs ?? 1) * 365);
    const allDPO = allBS.map((bs, i) => safeDiv(bs.accountsPayable, allIS[i]?.cogs ?? 1) * 365);
    const allPrepaid = allBS.map((bs, i) => safeDiv(bs.prepaidExpenses, allIS[i]?.revenue ?? 1));
    const allAccrued = allBS.map((bs, i) => safeDiv(bs.accruedExpenses, allIS[i]?.revenue ?? 1));
    const allDefRev = allBS.map((bs, i) => safeDiv(bs.deferredRevenue, allIS[i]?.revenue ?? 1));

    // CapEx % — back-compute from BS gross PPE changes for all periods
    const allCapex = allBS.map((bs, i) => {
        if (i === 0) return 0; // no prior period — cannot compute CapEx
        const capexPositive = bs.grossPPE - allBS[i - 1].grossPPE;
        return safeDiv(capexPositive, allIS[i]?.revenue ?? 1);
    });
    // Depreciation rate — back-compute: dep / grossPPE
    const allDepRate = allIS.map((is, i) => safeDiv(is.depreciation, allBS[i]?.grossPPE ?? 1));
    const allAmort = allIS.map(is => is.amortization);

    // Period-indexed interest rate schedule:
    // Historical years use historicalInterestRateOnDebt (CBE + spread for that period)
    // Projected years use interestRateOnDebt (forward assumption, user-editable)
    const allInterestRate = Array.from({ length: nYears }, (_, i) =>
        i < numHistorical
            ? (assumptions.historicalInterestRateOnDebt?.[i] ?? assumptions.interestRateOnDebt[0] ?? 0.22)
            : (assumptions.interestRateOnDebt[i - numHistorical] ?? assumptions.interestRateOnDebt[assumptions.interestRateOnDebt.length - 1] ?? 0.22)
    );
    const allInterestIncRate = Array.from({ length: nYears }, (_, i) =>
        i < numHistorical
            ? (assumptions.historicalInterestRateOnCash?.[i] ?? assumptions.interestRateOnCash[0] ?? 0.18)
            : (assumptions.interestRateOnCash[i - numHistorical] ?? assumptions.interestRateOnCash[assumptions.interestRateOnCash.length - 1] ?? 0.18)
    );
    const allSTDebt = allBS.map(bs => bs.shortTermDebt);
    // LTD Issuance/Repayment — back-compute from BS LTD changes
    const allLTDIssuance = allBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - allBS[i - 1].longTermDebt;
        return change > 0 ? change : 0;
    });
    const allLTDRepayment = allBS.map((bs, i) => {
        if (i === 0) return 0;
        const change = bs.longTermDebt - allBS[i - 1].longTermDebt;
        return change < 0 ? Math.abs(change) : 0;
    });
    const allCPLTD = allBS.map(bs => bs.currentPortionLTD);
    // Dividend payout ratio: historical = back-computed, projected = assumption value
    const allDivPayout = allIS.map((is, i) => {
        if (i >= numHistorical) {
            // Projected: use the assumption value directly (e.g. 0.30)
            const projIdx = i - numHistorical;
            return assumptions.dividendPayoutRatio?.[projIdx] ?? assumptions.dividendPayoutRatio?.[0] ?? 0.30;
        }
        // Historical: back-compute from engine CF dividends / IS net income
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            const ni = is.netIncome;
            const divPaid = results.cashFlowStatements[cfIdx]?.dividendsPaid ?? 0;
            return ni !== 0 ? Math.abs(divPaid) / ni : 0;
        }
        return 0; // year 0 has no CF
    });

    // Share repurchases: back-compute from treasury stock changes
    const allShareRepurch = allBS.map((bs, i) => {
        if (i === 0) return 0;
        // Treasury stock increases (more negative) = repurchases
        return Math.abs(bs.treasuryStock - allBS[i - 1].treasuryStock);
    });

    // BS direct-value assumptions — derive from engine results for all periods
    const allGoodwill = allBS.map(bs => bs.goodwill);
    const allOCA = allBS.map(bs => bs.otherCurrentAssets);
    const allOLTA = allBS.map(bs => bs.otherLongTermAssets);
    const allOCL = allBS.map(bs => bs.otherCurrentLiabilities);
    const allDTL = allBS.map(bs => bs.deferredTaxLiabilities);
    const allOLTL = allBS.map(bs => bs.otherLongTermLiabilities);
    const allCS = allBS.map(bs => bs.commonStock);
    const allAPIC = allBS.map(bs => bs.additionalPaidInCapital);
    const allOCI = allBS.map(bs => bs.otherComprehensiveIncome);

    // Engine-computed values for circular/chain items (stored in Assumptions, referenced by formulas)
    const allInterestIncome = results.incomeStatements.map(is => is.interestIncome);
    const allInterestExpense = results.incomeStatements.map(is => is.interestExpense);
    const allDepreciation = results.incomeStatements.map(is => is.depreciation);
    const allGrossPPE = results.balanceSheets.map(bs => bs.grossPPE);
    const allAccumDep = results.balanceSheets.map(bs => bs.accumulatedDepreciation);
    const allNetPPE = results.balanceSheets.map(bs => bs.netPPE);
    const allIntangibles = results.balanceSheets.map(bs => bs.intangibles);
    const allLTD = results.balanceSheets.map(bs => bs.longTermDebt);
    const allRE = results.balanceSheets.map(bs => bs.retainedEarnings);
    const allTS = results.balanceSheets.map(bs => bs.treasuryStock);
    const allAPICValues = results.balanceSheets.map(bs => bs.additionalPaidInCapital);

    // ════════════════════════════════════════════════════════
    // TAB: COMPANY INFO  (always created)
    // ════════════════════════════════════════════════════════
    buildCompanyInfoSheet(workbook, companyName, {
        startYear: assumptions.startYear ?? 2024,
        historicalYears: numHistorical,
        projectionYears: nYears - numHistorical,
        taxRate: assumptions.taxRate?.[0] ?? 0.225,
        vatRate: assumptions.vatRate ?? 0.14,
        dividendWithholdingTaxRate: assumptions.dividendWithholdingTaxRate ?? 0.10,
        cbeRate: assumptions.cbeRate ?? 0.195,
        riskFreeRate: assumptions.riskFreeRate ?? 0.235,
        liveRates: liveRates ?? undefined,
    });

    // ════════════════════════════════════════════════════════
    // TAB: HISTORICAL DATA  (locked engine values for all historical periods)
    // ════════════════════════════════════════════════════════
    if (numHistorical > 0) {
        const hdSheet = workbook.addWorksheet('Historical Data');
        hdSheet.properties.tabColor = { argb: 'FF2E75B6' }; // Blue
        hdSheet.getColumn(1).width = 32;
        for (let i = 0; i < numHistorical; i++) hdSheet.getColumn(i + 2).width = 18;

        // Title
        hdSheet.mergeCells(1, 1, 1, numHistorical + 1);
        const hdTitle = hdSheet.getCell(1, 1);
        hdTitle.value = `${companyName} — Historical Data (${periods.slice(0, numHistorical).join('–')})`;
        hdTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        hdTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
        hdTitle.alignment = { vertical: 'middle', horizontal: 'center' };

        // Period headers
        let hdRow = 2;
        hdSheet.getCell(hdRow, 1).value = '';
        for (let i = 0; i < numHistorical; i++) {
            const hc = hdSheet.getCell(hdRow, i + 2);
            hc.value = periods[i];
            hc.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            hc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF444444' } };
            hc.alignment = { horizontal: 'center' };
        }
        hdRow++;

        // Section header helper
        const hdSection = (label: string) => {
            hdSheet.getCell(hdRow, 1).value = label;
            hdSheet.getCell(hdRow, 1).font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            hdSheet.getCell(hdRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
            for (let i = 0; i < numHistorical; i++) {
                hdSheet.getCell(hdRow, i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
            }
            hdRow++;
        };

        // Value row helper (locked engine values — no formulas)
        // Optional `key` registers the row in hdRows for cross-sheet referencing.
        const hdVal = (label: string, values: number[], fmt: string = NUM_FMT, key?: string) => {
            if (key) hdRows[key] = hdRow;
            hdSheet.getCell(hdRow, 1).value = label;
            hdSheet.getCell(hdRow, 1).font = { size: 10 };
            for (let i = 0; i < numHistorical; i++) {
                const cell = hdSheet.getCell(hdRow, i + 2);
                cell.value = values[i] ?? 0;
                cell.numFmt = fmt;
                cell.alignment = { horizontal: 'right' };
            }
            hdRow++;
        };

        // Formula row helper
        const hdFormula = (label: string, formulaFn: (col: string, yr: number) => string, fmt: string = NUM_FMT) => {
            hdSheet.getCell(hdRow, 1).value = label;
            hdSheet.getCell(hdRow, 1).font = { size: 10, italic: true, color: { argb: 'FF666666' } };
            for (let i = 0; i < numHistorical; i++) {
                const c = colLetter(i + 2);
                const cell = hdSheet.getCell(hdRow, i + 2);
                const result = 0;
                cell.value = { formula: formulaFn(c, i), result };
                cell.numFmt = fmt;
                cell.alignment = { horizontal: 'right' };
            }
            hdRow++;
        };

        const hIS = results.incomeStatements.slice(0, numHistorical);
        const hBS = results.balanceSheets.slice(0, numHistorical);

        // ── Income Statement ──
        hdSection('INCOME STATEMENT');
        const hdISRevRow = hdRow; hdVal('Revenue', hIS.map(s => s.revenue), NUM_FMT, 'revenue');
        const hdISCogsRow = hdRow; hdVal('COGS', hIS.map(s => s.cogs), NUM_FMT, 'cogs');
        hdVal('Gross Profit', hIS.map(s => s.grossProfit), NUM_FMT, 'grossProfit');
        hdVal('SG&A', hIS.map(s => s.sgaExpense), NUM_FMT, 'sgaExpense');
        hdVal('R&D', hIS.map(s => s.rdExpense), NUM_FMT, 'rdExpense');
        hdVal('Depreciation', hIS.map(s => s.depreciation), NUM_FMT, 'depreciation');
        hdVal('Amortization', hIS.map(s => s.amortization), NUM_FMT, 'amortization');
        hdVal('Other OpEx', hIS.map(s => s.otherOpex), NUM_FMT, 'otherOpex');
        hdVal('Total OpEx', hIS.map(s => s.totalOpex), NUM_FMT, 'totalOpex');
        hdVal('EBIT', hIS.map(s => s.ebit), NUM_FMT, 'ebit');
        hdVal('Interest Expense', hIS.map(s => s.interestExpense), NUM_FMT, 'interestExpense');
        hdVal('Interest Income', hIS.map(s => s.interestIncome), NUM_FMT, 'interestIncome');
        const hdISEbtRow = hdRow; hdVal('EBT', hIS.map(s => s.ebt), NUM_FMT, 'ebt');
        const hdISTaxRow = hdRow; hdVal('Tax Expense', hIS.map(s => s.taxExpense), NUM_FMT, 'taxExpense');
        hdVal('Net Income', hIS.map(s => s.netIncome), NUM_FMT, 'netIncome');
        hdVal('Other Income / Expense', hIS.map(s => s.otherIncomeExpense), NUM_FMT, 'otherIncomeExpense');
        hdVal('Shares Outstanding', hIS.map(s => s.sharesOutstanding), '#,##0', 'sharesOutstanding');
        hdVal('Stock-Based Comp', hIS.map(s => s.stockBasedComp), NUM_FMT, 'stockBasedComp');

        hdRow++; // spacer

        // ── Balance Sheet ──
        hdSection('BALANCE SHEET');
        hdVal('Cash & Equivalents', hBS.map(s => s.cash), NUM_FMT, 'cash');
        const hdBSArRow = hdRow; hdVal('Accounts Receivable', hBS.map(s => s.accountsReceivable), NUM_FMT, 'accountsReceivable');
        const hdBSInvRow = hdRow; hdVal('Inventory', hBS.map(s => s.inventory), NUM_FMT, 'inventory');
        hdVal('Prepaid Expenses', hBS.map(s => s.prepaidExpenses), NUM_FMT, 'prepaidExpenses');
        hdVal('Other Current Assets', hBS.map(s => s.otherCurrentAssets), NUM_FMT, 'otherCurrentAssets');
        const hdBSGrossPPERow = hdRow; hdVal('Gross PP&E', hBS.map(s => s.grossPPE), NUM_FMT, 'grossPPE');
        hdVal('Accum. Depreciation', hBS.map(s => s.accumulatedDepreciation), NUM_FMT, 'accumulatedDepreciation');
        hdVal('Net PP&E', hBS.map(s => s.netPPE), NUM_FMT, 'netPPE');
        hdVal('Intangibles', hBS.map(s => s.intangibles), NUM_FMT, 'intangibles');
        hdVal('Goodwill', hBS.map(s => s.goodwill), NUM_FMT, 'goodwill');
        hdVal('Other LT Assets', hBS.map(s => s.otherLongTermAssets), NUM_FMT, 'otherLongTermAssets');
        hdVal('Total Assets', hBS.map(s => s.totalAssets), NUM_FMT, 'totalAssets');
        const hdBSApRow = hdRow; hdVal('Accounts Payable', hBS.map(s => s.accountsPayable), NUM_FMT, 'accountsPayable');
        hdVal('Accrued Expenses', hBS.map(s => s.accruedExpenses), NUM_FMT, 'accruedExpenses');
        hdVal('Short-Term Debt', hBS.map(s => s.shortTermDebt), NUM_FMT, 'shortTermDebt');
        hdVal('Current Portion LTD', hBS.map(s => s.currentPortionLTD), NUM_FMT, 'currentPortionLTD');
        hdVal('Deferred Revenue', hBS.map(s => s.deferredRevenue), NUM_FMT, 'deferredRevenue');
        hdVal('Other Current Liabilities', hBS.map(s => s.otherCurrentLiabilities), NUM_FMT, 'otherCurrentLiabilities');
        hdVal('Long-Term Debt', hBS.map(s => s.longTermDebt), NUM_FMT, 'longTermDebt');
        hdVal('Deferred Tax Liabilities', hBS.map(s => s.deferredTaxLiabilities), NUM_FMT, 'deferredTaxLiabilities');
        hdVal('Other LT Liabilities', hBS.map(s => s.otherLongTermLiabilities), NUM_FMT, 'otherLongTermLiabilities');
        hdVal('Common Stock', hBS.map(s => s.commonStock), NUM_FMT, 'commonStock');
        hdVal('APIC', hBS.map(s => s.additionalPaidInCapital), NUM_FMT, 'additionalPaidInCapital');
        hdVal('Legal Reserve', hBS.map(s => s.legalReserve ?? 0), NUM_FMT, 'legalReserve');
        hdVal('Retained Earnings', hBS.map(s => s.retainedEarnings), NUM_FMT, 'retainedEarnings');
        hdVal('Treasury Stock', hBS.map(s => s.treasuryStock), NUM_FMT, 'treasuryStock');
        hdVal('Other Comprehensive Income', hBS.map(s => s.otherComprehensiveIncome), NUM_FMT, 'otherComprehensiveIncome');
        hdVal('EOS Provision', hBS.map(s => s.endOfServiceProvision ?? 0), NUM_FMT, 'endOfServiceProvision');
        hdVal('Total Equity', hBS.map(s => s.totalEquity), NUM_FMT, 'totalEquity');
        hdVal('Total L+E', hBS.map(s => s.totalLiabilitiesEquity), NUM_FMT, 'totalLiabilitiesEquity');

        hdRow++; // spacer

        // ── Derived Ratios (reference only — Excel formulas) ──
        hdSection('DERIVED ASSUMPTIONS (for reference)');
        hdFormula('Gross Margin %',
            (c) => `IF(${c}${hdISRevRow}=0,0,(${c}${hdISRevRow}-${c}${hdISCogsRow})/${c}${hdISRevRow})`,
            PCT_FMT);
        hdFormula('Effective Tax Rate %',
            (c) => `IF(${c}${hdISEbtRow}=0,0,${c}${hdISTaxRow}/${c}${hdISEbtRow})`,
            PCT_FMT);
        hdFormula('DSO (Days)',
            (c) => `IF(${c}${hdISRevRow}=0,0,ROUND(${c}${hdBSArRow}/${c}${hdISRevRow}*365,1))`,
            '0.0');
        hdFormula('DIO (Days)',
            (c) => `IF(${c}${hdISCogsRow}=0,0,ROUND(${c}${hdBSInvRow}/${c}${hdISCogsRow}*365,1))`,
            '0.0');
        hdFormula('DPO (Days)',
            (c) => `IF(${c}${hdISCogsRow}=0,0,ROUND(${c}${hdBSApRow}/${c}${hdISCogsRow}*365,1))`,
            '0.0');
    }

    // ════════════════════════════════════════════════════════
    // TAB: SCENARIOS  (complete engine data for all scenarios)
    // ════════════════════════════════════════════════════════
    const { scenarioRows } = buildScenariosSheet(workbook, periods, allScenarios, numHistorical, nYears);

    // ── Calc sheets are built AFTER IS/BS row maps are known (deferred) ──
    // Placeholder — the actual call happens after IS/BS sheets are built,
    // since we need isRows/bsRows for historical anchors.
    // See the "BUILD CALC SHEETS" block below.

    // ════════════════════════════════════════════════════════
    // TAB 1 — ASSUMPTIONS  (all driver inputs live here)
    // ════════════════════════════════════════════════════════
    const aSheet = workbook.addWorksheet('Assumptions');
    aSheet.properties.tabColor = { argb: 'FFFFD700' }; // Gold
    // Column A = label, Columns B.. = Year 1, Year 2, …
    aSheet.getColumn(1).width = 32;
    for (let i = 0; i < nYears; i++) {
        aSheet.getColumn(i + 2).width = 16;
    }

    // Header row
    aSheet.getCell(1, 1).value = 'Assumption';
    for (let i = 0; i < nYears; i++) {
        aSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    }
    styleHeader(aSheet);

    // We'll track which row each assumption lands on so formulas can reference them.
    // Assumption rows (1-indexed, row 1 = header, data starts row 2)
    const aRows: Record<string, number> = {};
    let aRow = 2;

    // Historical Data formula reference: returns "='Historical Data'!{col}{row}" for
    // a given hdRows key and historical year index. Used to make Assumptions sheet
    // historical cells live formulas rather than hardcoded numbers.
    const hdRef = (key: string, histYearIdx: number): string | null => {
        const r = hdRows[key];
        if (!r) return null;
        const c = colLetter(histYearIdx + 2); // first historical year is column B in Historical Data
        return `'Historical Data'!${c}${r}`;
    };

    /**
     * addAssumptionRow — writes a row into the Assumptions sheet.
     *
     * For historical years, prefers a formula reference to the Historical Data sheet
     * (when `historicalKey` resolves to an hdRows entry). For projected years (or when
     * no historical link is available) it falls back to the numeric value from `values`.
     *
     * `historicalFormula` lets callers express a back-derivation (e.g. AR/Revenue*365)
     * referencing Historical Data — used for driver rows where the raw value isn't a
     * direct line on Historical Data.
     */
    function addAssumptionRow(
        label: string,
        key: string,
        values: number[],
        fmt: string = NUM_FMT,
        opts: {
            historicalKey?: string;
            historicalFormula?: (histCol: string, histYr: number) => string | null;
            driverOnly?: boolean;  // Item 1: skip writing historical cells (5-col-only drivers)
        } = {},
    ) {
        aRows[key] = aRow;
        aSheet.getCell(aRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const cell = aSheet.getCell(aRow, i + 2);
            const isHistorical = i < numHistorical;
            if (isHistorical && opts.driverOnly) {
                // Leave the historical cell empty — driver values exist only for
                // projected periods. Historical-year IS/BS formulas reroute to
                // Historical Data via aRef's histResolvers map.
                continue;
            }
            let wroteFormula = false;
            if (isHistorical) {
                if (opts.historicalKey) {
                    const ref = hdRef(opts.historicalKey, i);
                    if (ref) {
                        cell.value = { formula: ref, result: values[i] ?? 0 };
                        wroteFormula = true;
                    }
                }
                if (!wroteFormula && opts.historicalFormula) {
                    const f = opts.historicalFormula(colLetter(i + 2), i);
                    if (f) {
                        cell.value = {
                            formula: f.startsWith('=') ? f.slice(1) : f,
                            result: values[i] ?? 0,
                        };
                        wroteFormula = true;
                    }
                }
            }
            if (!wroteFormula) {
                cell.value = values[i] ?? 0;
            }
        }
        const row = aSheet.getRow(aRow);
        styleRow(row, { input: true, numFmt: fmt });
        aRow++;
    }

    // ── Income Statement Drivers ──
    aSheet.getCell(aRow, 1).value = '── Income Statement Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    // Revenue Base — first historical year revenue (drives the historical revenue chain)
    aRows['revenueBase'] = aRow;
    aSheet.getCell(aRow, 1).value = 'Revenue (Year 1 Historical)';
    aSheet.getCell(aRow, 2).value = engineRevenues[0] ?? assumptions.revenueBase;
    styleRow(aSheet.getRow(aRow), { input: true, numFmt: NUM_FMT });
    aRow++;

    // Helpers for back-derivation formulas referencing Historical Data sheet.
    // safeDiv(A,B) ≈ IF(B=0, 0, A/B) in Excel.
    const hdSafeRatio = (numKey: string, denKey: string) =>
        (c: string): string | null => {
            const nr = hdRows[numKey], dr = hdRows[denKey];
            if (!nr || !dr) return null;
            return `IF('Historical Data'!${c}${dr}=0,0,'Historical Data'!${c}${nr}/'Historical Data'!${c}${dr})`;
        };
    const hdYoYGrowth = (key: string) =>
        (c: string, yr: number): string | null => {
            const r = hdRows[key];
            if (!r || yr === 0) return null; // no prior period
            const prev = colLetter(yr + 1); // previous column
            return `IF('Historical Data'!${prev}${r}=0,0,('Historical Data'!${c}${r}-'Historical Data'!${prev}${r})/'Historical Data'!${prev}${r})`;
        };
    const hdDays = (numKey: string, denKey: string) =>
        (c: string): string | null => {
            const nr = hdRows[numKey], dr = hdRows[denKey];
            if (!nr || !dr) return null;
            return `IF('Historical Data'!${c}${dr}=0,0,'Historical Data'!${c}${nr}/'Historical Data'!${c}${dr}*365)`;
        };

    addAssumptionRow('Revenue Growth Rate', 'revenueGrowthRate', allRevenueGrowth, PCT_FMT, { driverOnly: true });
    addAssumptionRow('COGS % of Revenue', 'cogsPercent', allCogsPercent, PCT_FMT, { driverOnly: true });
    addAssumptionRow('SG&A % of Revenue', 'sgaPercent', allSgaPercent, PCT_FMT, { driverOnly: true });
    addAssumptionRow('R&D % of Revenue', 'rdPercent', allRdPercent, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Other OpEx % of Revenue', 'otherOpexPercent', allOtherOpexPct, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Tax Rate', 'taxRate', allTaxRate, PCT_FMT, { driverOnly: true });
    addAssumptionRow('VAT Enabled (1=Yes)', 'enableVAT', Array(nYears).fill(assumptions.enableVAT ? 1 : 0), '0', { driverOnly: true });
    addAssumptionRow('VAT Rate', 'vatRate', Array(nYears).fill(assumptions.vatRate ?? 0.14), PCT_FMT, { driverOnly: true });
    addAssumptionRow('Other Income / Expense', 'otherIncomeExpense', allOtherIncome, NUM_FMT, { driverOnly: true });
    addAssumptionRow('Shares Outstanding', 'sharesOutstanding', allShares, '#,##0', { driverOnly: true });
    addAssumptionRow('Stock-Based Comp Amount', 'stockBasedCompAmount', allSBC, NUM_FMT, { driverOnly: true });

    // ── Balance Sheet / WC Drivers ──
    aSheet.getCell(aRow, 1).value = '── Balance Sheet / WC Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('DSO (Days)', 'dso', allDSO, '#,##0', { driverOnly: true });
    addAssumptionRow('DIO (Days)', 'dio', allDIO, '#,##0', { driverOnly: true });
    addAssumptionRow('DPO (Days)', 'dpo', allDPO, '#,##0', { driverOnly: true });
    addAssumptionRow('Prepaid % of Revenue', 'prepaidPercent', allPrepaid, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Accrued Exp % of Revenue', 'accruedExpPercent', allAccrued, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Deferred Rev % of Revenue', 'deferredRevPercent', allDefRev, PCT_FMT, { driverOnly: true });

    // ── CapEx & D&A Drivers ──
    aSheet.getCell(aRow, 1).value = '── CapEx & Depreciation Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('CapEx % of Revenue', 'capexPercent', allCapex, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Depreciation Rate (% Gross PPE)', 'depreciationRate', allDepRate, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Amortization Amount', 'amortizationAmount', allAmort, NUM_FMT, { driverOnly: true });

    // ── Debt & Financing Drivers ──
    aSheet.getCell(aRow, 1).value = '── Debt & Financing ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Interest Rate (on Debt)', 'interestRate', allInterestRate, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Interest Income Rate (on Cash)', 'interestIncomeRate', allInterestIncRate, PCT_FMT, { driverOnly: true });
    addAssumptionRow('EPD Rate (Employee Profit Sharing)', 'employeeProfitSharingRate',
        Array(nYears).fill(assumptions.employeeProfitSharingRate ?? 0.10), PCT_FMT, { driverOnly: true });
    addAssumptionRow('Short-Term Debt', 'shortTermDebtAmount', allSTDebt, NUM_FMT, { driverOnly: true });
    addAssumptionRow('LT Debt Issuance', 'longTermDebtIssuance', allLTDIssuance, NUM_FMT, { driverOnly: true });
    addAssumptionRow('LT Debt Repayment', 'longTermDebtRepayment', allLTDRepayment, NUM_FMT, { driverOnly: true });
    addAssumptionRow('Current Portion LTD', 'currentPortionLTD', allCPLTD, NUM_FMT, { driverOnly: true });
    addAssumptionRow('Dividend Payout Ratio', 'dividendPayoutRatio', allDivPayout, PCT_FMT, { driverOnly: true });
    addAssumptionRow('Share Repurchase Amount', 'shareRepurchaseAmount', allShareRepurch, NUM_FMT, { driverOnly: true });
    addAssumptionRow('Legal Reserve %', 'legalReservePercent',
        Array(nYears).fill(assumptions.legalReservePercent ?? 0.05), PCT_FMT, { driverOnly: true });
    addAssumptionRow('Paid-Up Capital', 'paidUpCapital',
        Array(nYears).fill(assumptions.paidUpCapital ?? 0), NUM_FMT, { driverOnly: true });
    addAssumptionRow('Dividend WHT Rate', 'dividendWHTRate',
        Array(nYears).fill(assumptions.dividendWithholdingTaxRate ?? 0.10), PCT_FMT, { driverOnly: true });

    // Equity issuance: derive from engine CF results for all periods
    const allEquityIssuance = allIS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            return results.cashFlowStatements[cfIdx].equityIssuance;
        }
        return 0;
    });
    addAssumptionRow('Equity Issuance', 'equityIssuance', allEquityIssuance, NUM_FMT, { driverOnly: true });

    // ── Balance Sheet Direct Values ──
    aSheet.getCell(aRow, 1).value = '── BS / Equity Direct Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Goodwill', 'goodwill', allGoodwill, NUM_FMT,
        { historicalKey: 'goodwill' });
    addAssumptionRow('Other Current Assets', 'otherCurrentAssets', allOCA, NUM_FMT,
        { historicalKey: 'otherCurrentAssets' });
    addAssumptionRow('Other Long-Term Assets', 'otherLongTermAssets', allOLTA, NUM_FMT,
        { historicalKey: 'otherLongTermAssets' });
    addAssumptionRow('Other Current Liabilities', 'otherCurrentLiabilities', allOCL, NUM_FMT,
        { historicalKey: 'otherCurrentLiabilities' });
    addAssumptionRow('Deferred Tax Liabilities', 'deferredTaxLiabilities', allDTL, NUM_FMT,
        { historicalKey: 'deferredTaxLiabilities' });
    addAssumptionRow('Other LT Liabilities', 'otherLongTermLiabilities', allOLTL, NUM_FMT,
        { historicalKey: 'otherLongTermLiabilities' });
    addAssumptionRow('Common Stock', 'commonStock', allCS, NUM_FMT,
        { historicalKey: 'commonStock' });
    addAssumptionRow('APIC', 'apic', allAPIC, NUM_FMT,
        { historicalKey: 'additionalPaidInCapital' });
    addAssumptionRow('Other Comprehensive Income', 'oci', allOCI, NUM_FMT,
        { historicalKey: 'otherComprehensiveIncome' });

    // ── Engine-Computed Values (circular/chain resolved) ──
    aSheet.getCell(aRow, 1).value = '── Engine-Computed Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Interest Income (Computed)', 'interestIncomeComputed', allInterestIncome, NUM_FMT,
        { historicalKey: 'interestIncome' });
    addAssumptionRow('Interest Expense (Computed)', 'interestExpenseComputed', allInterestExpense, NUM_FMT,
        { historicalKey: 'interestExpense' });
    addAssumptionRow('Depreciation (Computed)', 'depreciationComputed', allDepreciation, NUM_FMT,
        { historicalKey: 'depreciation' });
    addAssumptionRow('Gross PP&E (Computed)', 'grossPPEComputed', allGrossPPE, NUM_FMT,
        { historicalKey: 'grossPPE' });
    addAssumptionRow('Accum Depreciation (Computed)', 'accumDepComputed', allAccumDep, NUM_FMT,
        { historicalKey: 'accumulatedDepreciation' });
    addAssumptionRow('Net PP&E (Computed)', 'netPPEComputed', allNetPPE, NUM_FMT,
        { historicalKey: 'netPPE' });
    addAssumptionRow('Intangibles (Computed)', 'intangiblesComputed', allIntangibles, NUM_FMT,
        { historicalKey: 'intangibles' });
    addAssumptionRow('Long-Term Debt (Computed)', 'ltdComputed', allLTD, NUM_FMT,
        { historicalKey: 'longTermDebt' });
    addAssumptionRow('Retained Earnings (Computed)', 'reComputed', allRE, NUM_FMT,
        { historicalKey: 'retainedEarnings' });
    addAssumptionRow('Treasury Stock (Computed)', 'tsComputed', allTS, NUM_FMT,
        { historicalKey: 'treasuryStock' });
    addAssumptionRow('APIC (Computed)', 'apicComputed', allAPICValues, NUM_FMT,
        { historicalKey: 'additionalPaidInCapital' });
    // Legal Reserve and EOS Provision computed values
    const allLegalReserve = allBS.map(bs => bs.legalReserve ?? 0);
    addAssumptionRow('Legal Reserve (Computed)', 'legalReserveComputed', allLegalReserve, NUM_FMT,
        { historicalKey: 'legalReserve' });
    const allEOSProvision = allBS.map(bs => bs.endOfServiceProvision ?? 0);
    addAssumptionRow('EOS Provision (Computed)', 'eosProvisionComputed', allEOSProvision, NUM_FMT,
        { historicalKey: 'endOfServiceProvision' });

    // Dividends Paid (computed): historical = NI − ΔRE; projected = engine state.
    const allDividendsPaidPadded = [0, ...results.cashFlowStatements.map(cf => cf.dividendsPaid)];
    addAssumptionRow('Dividends Paid (Computed)', 'dividendsPaidComputed', allDividendsPaidPadded, NUM_FMT,
        {
            historicalFormula: (c, yr) => {
                if (yr === 0) return null;
                const ni = hdRows['netIncome'], re = hdRows['retainedEarnings'];
                if (!ni || !re) return null;
                const prev = colLetter(yr + 1);
                return `'Historical Data'!${c}${ni}-('Historical Data'!${c}${re}-'Historical Data'!${prev}${re})`;
            },
        });
    // Removed: Equity Issuance (Computed), Share Repurchases (Computed),
    //          Acquisitions (Computed), Asset Sales (Computed).
    // No engine driver exists for these; they were always 0. Per Fix 3.

    // Item 1: 5-column driver rewrite.
    // For historical years, aRef redirects to Historical Data sheet (back-derived
    // formula or direct line ref). For projected years, it returns the regular
    // Assumptions sheet reference. This keeps every IS/BS/CF formula
    // year-uniform while letting the Assumptions sheet driver rows be visually
    // 5-projected-only — historical driver cells can be blanked without breaking
    // the formula network.
    const histResolvers: Record<string, (c: string, yr: number) => string | null> = {
        // direct linkage to a Historical Data row
        revenue: (c) => hdRows['revenue'] ? `'Historical Data'!${c}${hdRows['revenue']}` : null,
        otherIncomeExpense: (c) => hdRows['otherIncomeExpense'] ? `'Historical Data'!${c}${hdRows['otherIncomeExpense']}` : null,
        sharesOutstanding: (c) => hdRows['sharesOutstanding'] ? `'Historical Data'!${c}${hdRows['sharesOutstanding']}` : null,
        stockBasedCompAmount: (c) => hdRows['stockBasedComp'] ? `'Historical Data'!${c}${hdRows['stockBasedComp']}` : null,
        amortizationAmount: (c) => hdRows['amortization'] ? `'Historical Data'!${c}${hdRows['amortization']}` : null,
        shortTermDebtAmount: (c) => hdRows['shortTermDebt'] ? `'Historical Data'!${c}${hdRows['shortTermDebt']}` : null,
        currentPortionLTD: (c) => hdRows['currentPortionLTD'] ? `'Historical Data'!${c}${hdRows['currentPortionLTD']}` : null,
        goodwill: (c) => hdRows['goodwill'] ? `'Historical Data'!${c}${hdRows['goodwill']}` : null,
        otherCurrentAssets: (c) => hdRows['otherCurrentAssets'] ? `'Historical Data'!${c}${hdRows['otherCurrentAssets']}` : null,
        otherLongTermAssets: (c) => hdRows['otherLongTermAssets'] ? `'Historical Data'!${c}${hdRows['otherLongTermAssets']}` : null,
        otherCurrentLiabilities: (c) => hdRows['otherCurrentLiabilities'] ? `'Historical Data'!${c}${hdRows['otherCurrentLiabilities']}` : null,
        deferredTaxLiabilities: (c) => hdRows['deferredTaxLiabilities'] ? `'Historical Data'!${c}${hdRows['deferredTaxLiabilities']}` : null,
        otherLongTermLiabilities: (c) => hdRows['otherLongTermLiabilities'] ? `'Historical Data'!${c}${hdRows['otherLongTermLiabilities']}` : null,
        commonStock: (c) => hdRows['commonStock'] ? `'Historical Data'!${c}${hdRows['commonStock']}` : null,
        apic: (c) => hdRows['additionalPaidInCapital'] ? `'Historical Data'!${c}${hdRows['additionalPaidInCapital']}` : null,
        oci: (c) => hdRows['otherComprehensiveIncome'] ? `'Historical Data'!${c}${hdRows['otherComprehensiveIncome']}` : null,
        // engine-computed — link directly to Historical Data line items
        interestIncomeComputed: (c) => hdRows['interestIncome'] ? `'Historical Data'!${c}${hdRows['interestIncome']}` : null,
        interestExpenseComputed: (c) => hdRows['interestExpense'] ? `'Historical Data'!${c}${hdRows['interestExpense']}` : null,
        depreciationComputed: (c) => hdRows['depreciation'] ? `'Historical Data'!${c}${hdRows['depreciation']}` : null,
        grossPPEComputed: (c) => hdRows['grossPPE'] ? `'Historical Data'!${c}${hdRows['grossPPE']}` : null,
        accumDepComputed: (c) => hdRows['accumulatedDepreciation'] ? `'Historical Data'!${c}${hdRows['accumulatedDepreciation']}` : null,
        netPPEComputed: (c) => hdRows['netPPE'] ? `'Historical Data'!${c}${hdRows['netPPE']}` : null,
        intangiblesComputed: (c) => hdRows['intangibles'] ? `'Historical Data'!${c}${hdRows['intangibles']}` : null,
        ltdComputed: (c) => hdRows['longTermDebt'] ? `'Historical Data'!${c}${hdRows['longTermDebt']}` : null,
        reComputed: (c) => hdRows['retainedEarnings'] ? `'Historical Data'!${c}${hdRows['retainedEarnings']}` : null,
        tsComputed: (c) => hdRows['treasuryStock'] ? `'Historical Data'!${c}${hdRows['treasuryStock']}` : null,
        apicComputed: (c) => hdRows['additionalPaidInCapital'] ? `'Historical Data'!${c}${hdRows['additionalPaidInCapital']}` : null,
        legalReserveComputed: (c) => hdRows['legalReserve'] ? `'Historical Data'!${c}${hdRows['legalReserve']}` : null,
        eosProvisionComputed: (c) => hdRows['endOfServiceProvision'] ? `'Historical Data'!${c}${hdRows['endOfServiceProvision']}` : null,
        // back-derivation formulas (ratios)
        revenueGrowthRate: (c, yr) => {
            if (yr === 0) return '0';
            const r = hdRows['revenue']; if (!r) return null;
            const prev = colLetter(yr + 1);
            return `IF('Historical Data'!${prev}${r}=0,0,('Historical Data'!${c}${r}-'Historical Data'!${prev}${r})/'Historical Data'!${prev}${r})`;
        },
        cogsPercent: (c) => {
            const cR = hdRows['cogs'], rR = hdRows['revenue']; if (!cR || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${cR}/'Historical Data'!${c}${rR})`;
        },
        sgaPercent: (c) => {
            const sR = hdRows['sgaExpense'], rR = hdRows['revenue']; if (!sR || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${sR}/'Historical Data'!${c}${rR})`;
        },
        rdPercent: (c) => {
            const dR = hdRows['rdExpense'], rR = hdRows['revenue']; if (!dR || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${dR}/'Historical Data'!${c}${rR})`;
        },
        otherOpexPercent: (c) => {
            const oR = hdRows['otherOpex'], rR = hdRows['revenue']; if (!oR || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${oR}/'Historical Data'!${c}${rR})`;
        },
        taxRate: (c) => {
            const tR = hdRows['taxExpense'], eR = hdRows['ebt']; if (!tR || !eR) return null;
            return `IF('Historical Data'!${c}${eR}=0,0,'Historical Data'!${c}${tR}/'Historical Data'!${c}${eR})`;
        },
        dso: (c) => {
            const ar = hdRows['accountsReceivable'], rR = hdRows['revenue']; if (!ar || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${ar}/'Historical Data'!${c}${rR}*365)`;
        },
        dio: (c) => {
            const inv = hdRows['inventory'], cR = hdRows['cogs']; if (!inv || !cR) return null;
            return `IF('Historical Data'!${c}${cR}=0,0,'Historical Data'!${c}${inv}/'Historical Data'!${c}${cR}*365)`;
        },
        dpo: (c) => {
            const ap = hdRows['accountsPayable'], cR = hdRows['cogs']; if (!ap || !cR) return null;
            return `IF('Historical Data'!${c}${cR}=0,0,'Historical Data'!${c}${ap}/'Historical Data'!${c}${cR}*365)`;
        },
        prepaidPercent: (c) => {
            const p = hdRows['prepaidExpenses'], rR = hdRows['revenue']; if (!p || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${p}/'Historical Data'!${c}${rR})`;
        },
        accruedExpPercent: (c) => {
            const a = hdRows['accruedExpenses'], rR = hdRows['revenue']; if (!a || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${a}/'Historical Data'!${c}${rR})`;
        },
        deferredRevPercent: (c) => {
            const d = hdRows['deferredRevenue'], rR = hdRows['revenue']; if (!d || !rR) return null;
            return `IF('Historical Data'!${c}${rR}=0,0,'Historical Data'!${c}${d}/'Historical Data'!${c}${rR})`;
        },
        capexPercent: (c, yr) => {
            if (yr === 0) return '0';
            const g = hdRows['grossPPE'], rR = hdRows['revenue']; if (!g || !rR) return null;
            const prev = colLetter(yr + 1);
            return `IF('Historical Data'!${c}${rR}=0,0,('Historical Data'!${c}${g}-'Historical Data'!${prev}${g})/'Historical Data'!${c}${rR})`;
        },
        depreciationRate: (c) => {
            const d = hdRows['depreciation'], g = hdRows['grossPPE']; if (!d || !g) return null;
            return `IF('Historical Data'!${c}${g}=0,0,'Historical Data'!${c}${d}/'Historical Data'!${c}${g})`;
        },
        interestRate: (c, yr) => {
            if (yr === 0) return '0';
            const ie = hdRows['interestExpense'], ltd = hdRows['longTermDebt']; if (!ie || !ltd) return null;
            const prev = colLetter(yr + 1);
            return `IF(AVERAGE('Historical Data'!${c}${ltd},'Historical Data'!${prev}${ltd})=0,0,'Historical Data'!${c}${ie}/AVERAGE('Historical Data'!${c}${ltd},'Historical Data'!${prev}${ltd}))`;
        },
        interestIncomeRate: (c, yr) => {
            if (yr === 0) return '0';
            const ii = hdRows['interestIncome'], cash = hdRows['cash']; if (!ii || !cash) return null;
            const prev = colLetter(yr + 1);
            return `IF(AVERAGE('Historical Data'!${c}${cash},'Historical Data'!${prev}${cash})=0,0,'Historical Data'!${c}${ii}/AVERAGE('Historical Data'!${c}${cash},'Historical Data'!${prev}${cash}))`;
        },
    };

    /** Resolves the right cell reference for an assumption key + year.
     *  - Historical year + resolver present → Historical Data formula.
     *  - Otherwise → Assumptions!{col}{row}.
     */
    function aRef(key: string, yearIdx: number): string {
        const c = colLetter(yearIdx + 2);
        if (yearIdx < numHistorical && histResolvers[key]) {
            const ref = histResolvers[key](c, yearIdx);
            if (ref) return ref;
        }
        const r = aRows[key];
        return `Assumptions!${c}${r}`;
    }

    // ════════════════════════════════════════════════════════
    // TAB 2 — INCOME STATEMENT  (live formulas)
    // ════════════════════════════════════════════════════════
    const isSheet = workbook.addWorksheet('Income Statement');
    isSheet.properties.tabColor = { argb: 'FF4472C4' }; // Blue
    isSheet.getColumn(1).width = 32;
    for (let i = 0; i < nYears; i++) isSheet.getColumn(i + 2).width = 18;

    isSheet.getCell(1, 1).value = companyName + ' — Income Statement';
    for (let i = 0; i < nYears; i++) isSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(isSheet);

    const isRows: Record<string, number> = {};
    let isRow = 2;

    function addISRow(label: string, key: string, opts?: {
        formula?: (col: string, yr: number) => string;
        value?: (yr: number) => number;
        bold?: boolean; pct?: boolean; subheader?: boolean; numFmt?: string;
    }) {
        isRows[key] = isRow;
        isSheet.getCell(isRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = isSheet.getCell(isRow, i + 2);
            if (opts?.formula) {
                const raw = opts?.value?.(i) ?? results.incomeStatements[i]?.[key as keyof typeof results.incomeStatements[0]] as number ?? 0;
                cell.value = { formula: opts.formula(c, i), result: Number(raw) || 0 };
            } else if (opts?.value) {
                const raw = opts.value(i);
                cell.value = Number(raw) || 0;
            }
        }
        const row = isSheet.getRow(isRow);
        styleRow(row, {
            bold: opts?.bold,
            subheader: opts?.subheader,
            numFmt: opts?.pct ? PCT_FMT : (opts?.numFmt ?? NUM_FMT),
        });
        isRow++;
    }

    // Revenue: Historical = formula link to Historical Data; Projected = chain from prior × (1 + growth)
    isRows['revenue'] = isRow;
    isSheet.getCell(isRow, 1).value = 'Revenue';
    for (let i = 0; i < nYears; i++) {
        const cell = isSheet.getCell(isRow, i + 2);
        const result = results.incomeStatements[i]?.revenue ?? 0;
        if (i < numHistorical) {
            // Historical: live link to Historical Data sheet
            const c = colLetter(i + 2);
            const r = hdRows['revenue'];
            if (r) {
                cell.value = { formula: `'Historical Data'!${c}${r}`, result };
            } else {
                cell.value = result;
            }
        } else {
            // Projected: chain from prior year × (1 + growth rate)
            const prevC = colLetter(i + 1);
            cell.value = { formula: `${prevC}${isRow}*(1+${aRef('revenueGrowthRate', i)})`, result };
        }
        cell.numFmt = NUM_FMT;
    }
    styleRow(isSheet.getRow(isRow), { bold: true, numFmt: NUM_FMT });
    isRow++;

    // Revenue Growth %
    addISRow('Revenue Growth %', 'revenueGrowthRate', {
        formula: (_c, yr) => `${aRef('revenueGrowthRate', yr)}`,
        value: yr => results.incomeStatements[yr]?.revenueGrowthRate ?? 0,
        pct: true,
    });

    // COGS = Revenue * COGS%
    addISRow('Cost of Goods Sold', 'cogs', {
        formula: (c, yr) => `${c}${isRows['revenue']}*${aRef('cogsPercent', yr)}`,
        value: yr => results.incomeStatements[yr]?.cogs ?? 0,
    });

    // Gross Profit = Revenue - COGS
    addISRow('Gross Profit', 'grossProfit', {
        formula: (c) => `${c}${isRows['revenue']}-${c}${isRows['cogs']}`,
        value: yr => results.incomeStatements[yr]?.grossProfit ?? 0,
        bold: true,
    });

    // Gross Margin = GP / Revenue
    addISRow('Gross Margin', 'grossMargin', {
        formula: (c) => `IF(${c}${isRows['revenue']}=0,0,${c}${isRows['grossProfit']}/${c}${isRows['revenue']})`,
        value: yr => results.incomeStatements[yr]?.grossMargin ?? 0,
        pct: true,
    });

    // Blank + subheader
    isSheet.getCell(isRow, 1).value = '';
    isRow++;
    isSheet.getCell(isRow, 1).value = 'Operating Expenses';
    styleRow(isSheet.getRow(isRow), { subheader: true });
    isRow++;

    // SG&A = Revenue * SG&A%
    addISRow('SG&A', 'sgaExpense', {
        formula: (c, yr) => `${c}${isRows['revenue']}*${aRef('sgaPercent', yr)}`,
        value: yr => results.incomeStatements[yr]?.sgaExpense ?? 0,
    });

    // R&D = Revenue * R&D%
    addISRow('R&D', 'rdExpense', {
        formula: (c, yr) => `${c}${isRows['revenue']}*${aRef('rdPercent', yr)}`,
        value: yr => results.incomeStatements[yr]?.rdExpense ?? 0,
    });

    // Depreciation — live formula for projections: (prevGrossPPE + capex/2) * depRate
    // Historical: keep engine-computed reference
    addISRow('Depreciation', 'depreciation', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('depreciationComputed', yr)}`;
            }
            // Projection: (prevGrossPPE + Revenue*CapEx%/2) * depRate
            const prevC = colLetter(yr + 1); // prior period column in BS
            return `(Assumptions!${prevC}${aRows['grossPPEComputed']}+'Income Statement'!${c}${isRows['revenue']}*${aRef('capexPercent', yr)}/2)*${aRef('depreciationRate', yr)}`;
        },
        value: yr => results.incomeStatements[yr]?.depreciation ?? 0,
    });

    // Amortization = from assumptions
    addISRow('Amortization', 'amortization', {
        formula: (_c, yr) => `${aRef('amortizationAmount', yr)}`,
        value: yr => results.incomeStatements[yr]?.amortization ?? 0,
    });

    // Other OpEx = Revenue * otherOpEx%
    addISRow('Other OpEx', 'otherOpex', {
        formula: (c, yr) => `${c}${isRows['revenue']}*${aRef('otherOpexPercent', yr)}`,
        value: yr => results.incomeStatements[yr]?.otherOpex ?? 0,
    });

    // Stock-Based Compensation = from assumptions
    addISRow('Stock-Based Comp', 'stockBasedComp', {
        formula: (_c, yr) => `${aRef('stockBasedCompAmount', yr)}`,
        value: yr => results.incomeStatements[yr]?.stockBasedComp ?? 0,
    });

    // Total OpEx = SGA + RD + Dep + Amort + Other + SBC
    addISRow('Total OpEx', 'totalOpex', {
        formula: (c) => `${c}${isRows['sgaExpense']}+${c}${isRows['rdExpense']}+${c}${isRows['depreciation']}+${c}${isRows['amortization']}+${c}${isRows['otherOpex']}+${c}${isRows['stockBasedComp']}`,
        value: yr => results.incomeStatements[yr]?.totalOpex ?? 0,
        bold: true,
    });

    isSheet.getCell(isRow, 1).value = '';
    isRow++;

    // EBIT = GP - Total OpEx
    addISRow('EBIT', 'ebit', {
        formula: (c) => `${c}${isRows['grossProfit']}-${c}${isRows['totalOpex']}`,
        value: yr => results.incomeStatements[yr]?.ebit ?? 0,
        bold: true,
    });

    // EBITDA = EBIT + D&A
    addISRow('EBITDA', 'ebitda', {
        formula: (c) => `${c}${isRows['ebit']}+${c}${isRows['depreciation']}+${c}${isRows['amortization']}`,
        value: yr => results.incomeStatements[yr]?.ebitda ?? 0,
        bold: true,
    });

    // EBIT Margin
    addISRow('EBIT Margin', 'ebitMargin', {
        formula: (c) => `IF(${c}${isRows['revenue']}=0,0,${c}${isRows['ebit']}/${c}${isRows['revenue']})`,
        value: yr => results.incomeStatements[yr]?.ebitMargin ?? 0,
        pct: true,
    });

    isSheet.getCell(isRow, 1).value = '';
    isRow++;

    // Interest Income — placeholder (overwritten with live avg-balance formula AFTER BS is built)
    addISRow('Interest Income', 'interestIncome', {
        formula: (_c, yr) => `${aRef('interestIncomeComputed', yr)}`,
        value: yr => results.incomeStatements[yr]?.interestIncome ?? 0,
    });

    // Interest Expense — placeholder (overwritten with live avg-balance formula AFTER BS is built)
    addISRow('Interest Expense', 'interestExpense', {
        formula: (_c, yr) => `${aRef('interestExpenseComputed', yr)}`,
        value: yr => results.incomeStatements[yr]?.interestExpense ?? 0,
    });

    // Other Income/Expense
    addISRow('Other Income/Expense', 'otherIncomeExpense', {
        formula: (_c, yr) => `${aRef('otherIncomeExpense', yr)}`,
        value: yr => results.incomeStatements[yr]?.otherIncomeExpense ?? 0,
    });

    // EBT = EBIT + InterestIncome - InterestExpense + OtherIncome
    addISRow('EBT', 'ebt', {
        formula: (c) => `${c}${isRows['ebit']}+${c}${isRows['interestIncome']}-${c}${isRows['interestExpense']}+${c}${isRows['otherIncomeExpense']}`,
        value: yr => results.incomeStatements[yr]?.ebt ?? 0,
        bold: true,
    });

    // Tax Expense = EBT * Tax Rate
    addISRow('Tax Expense', 'taxExpense', {
        formula: (c, yr) => `MAX(0,${c}${isRows['ebt']}*${aRef('taxRate', yr)})`,
        value: yr => results.incomeStatements[yr]?.taxExpense ?? 0,
    });

    // Effective Tax Rate
    addISRow('Tax Rate', 'taxRate_display', {
        formula: (_c, yr) => `${aRef('taxRate', yr)}`,
        value: yr => results.incomeStatements[yr]?.taxRate ?? 0,
        pct: true,
    });

    isSheet.getCell(isRow, 1).value = '';
    isRow++;

    // Net Income = EBT - Tax
    addISRow('Net Income', 'netIncome', {
        formula: (c) => `${c}${isRows['ebt']}-${c}${isRows['taxExpense']}`,
        value: yr => results.incomeStatements[yr]?.netIncome ?? 0,
        bold: true,
    });

    // ── Profit Appropriation (Law 159/1981 — correct EAS order) ──
    // Egyptian law mandates: EPD first, then Legal Reserve, then Distributable

    // Step 1: EPD = NI × 10% (FIRST deduction — Egyptian Labor Law Art.41)
    isRows['employeeProfitSharing'] = isRow;
    isSheet.getCell(isRow, 1).value = 'Employee Profit Sharing (EPD)';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = isSheet.getCell(isRow, i + 2);
        const raw = results.incomeStatements[i]?.employeeProfitSharing ?? 0;
        if (i < numHistorical) {
            cell.value = { formula: '0', result: 0 };
        } else {
            cell.value = { formula: `MAX(0,${c}${isRows['netIncome']}*${aRef('employeeProfitSharingRate', i)})`, result: Number(raw) || 0 };
        }
    }
    styleRow(isSheet.getRow(isRow), { numFmt: NUM_FMT });
    isRow++;

    // Step 2: NI After EPD = NI − EPD
    addISRow('Net Income After EPD', 'netIncomeAfterEPD', {
        formula: (c) => `${c}${isRows['netIncome']}-${c}${isRows['employeeProfitSharing']}`,
        value: yr => results.incomeStatements[yr]?.netIncomeAfterEPD ?? 0,
        bold: true,
    });

    // Step 3: Legal Reserve Addition — link to engine state (Item 3).
    // Historical = back-derived ΔlegalReserve from Historical Data; projected
    // = engine-resolved value via Assumptions sheet (legalReserveComputed
    // stores the cumulative balance, so addition is the year-over-year delta).
    addISRow('Legal Reserve Addition (5% NI)', 'legalReserveAddition', {
        formula: (c, yr) => {
            const lrCum = aRef('legalReserveComputed', yr);
            if (yr === 0) return lrCum;
            const prevCum = aRef('legalReserveComputed', yr - 1);
            return `${lrCum}-${prevCum}`;
        },
        value: yr => results.incomeStatements[yr]?.legalReserveAddition ?? 0,
    });

    // Step 4: Cumulative Legal Reserve — direct link to engine state.
    addISRow('Cumulative Legal Reserve', 'cumulativeLegalReserve', {
        formula: (_c, yr) => `${aRef('legalReserveComputed', yr)}`,
        value: yr => results.balanceSheets[yr]?.legalReserve ?? 0,
    });

    // Step 5: Distributable Profit = NI − EPD − Legal Reserve Addition
    addISRow('Distributable Profit', 'distributableProfit', {
        formula: (c) => `${c}${isRows['netIncome']}-${c}${isRows['employeeProfitSharing']}-${c}${isRows['legalReserveAddition']}`,
        value: yr => results.incomeStatements[yr]?.distributableProfit ?? 0,
        bold: true,
    });

    // Step 5: Gross Dividends = Distributable Profit × Payout Ratio
    // Historical columns: hardcode 0 (dividends declared are 0 for historical years)
    isRows['grossDividends'] = isRow;
    isSheet.getCell(isRow, 1).value = 'Gross Dividends';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = isSheet.getCell(isRow, i + 2);
        const raw = results.incomeStatements[i]?.grossDividends ?? 0;
        if (i < numHistorical) {
            cell.value = { formula: '0', result: 0 };
        } else {
            cell.value = { formula: `MAX(0,${c}${isRows['distributableProfit']}*${aRef('dividendPayoutRatio', i)})`, result: Number(raw) || 0 };
        }
    }
    styleRow(isSheet.getRow(isRow), { numFmt: NUM_FMT });
    isRow++;

    // Dividend WHT = Gross Dividends × WHT Rate
    addISRow('Dividend WHT (10%)', 'dividendWHT', {
        formula: (c, yr) => `${c}${isRows['grossDividends']}*${aRef('dividendWHTRate', yr)}`,
        value: yr => results.incomeStatements[yr]?.dividendWHT ?? 0,
    });

    // Net Dividends = Gross - WHT
    addISRow('Net Dividends', 'netDividends', {
        formula: (c) => `${c}${isRows['grossDividends']}-${c}${isRows['dividendWHT']}`,
        value: yr => results.incomeStatements[yr]?.netDividends ?? 0,
    });

    // Step 6: Addition to RE = Distributable Profit - Gross Dividends
    // Fix 4 (S20): For historical periods, stamp engine value directly
    // (can't use BS formula reference here because bsRows isn't initialized yet)
    isRows['additionToRE'] = isRow;
    isSheet.getCell(isRow, 1).value = 'Addition to Retained Earnings';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = isSheet.getCell(isRow, i + 2);
        const engineVal = results.incomeStatements[i]?.additionToRE ?? 0;
        if (i < numHistorical) {
            // Historical: stamp engine value (already correct from Fix 8 — uses actual BS RE change)
            cell.value = engineVal;
        } else {
            // Projected: formula-based
            cell.value = { formula: `${c}${isRows['distributableProfit']}-${c}${isRows['grossDividends']}`, result: engineVal };
        }
    }
    styleRow(isSheet.getRow(isRow), { bold: true, numFmt: NUM_FMT });
    isRow++;

    isSheet.getCell(isRow, 1).value = '';
    isRow++;

    // Net Margin
    addISRow('Net Margin', 'netMargin', {
        formula: (c) => `IF(${c}${isRows['revenue']}=0,0,${c}${isRows['netIncome']}/${c}${isRows['revenue']})`,
        value: yr => results.incomeStatements[yr]?.netMargin ?? 0,
        pct: true,
    });

    // EPS = Net Income After EPD / Shares Outstanding
    addISRow('EPS', 'eps', {
        formula: (c, yr) => `IF(${aRef('sharesOutstanding', yr)}=0,0,${c}${isRows['netIncomeAfterEPD']}/${aRef('sharesOutstanding', yr)})`,
        value: yr => results.incomeStatements[yr]?.eps ?? 0,
        numFmt: EPS_FMT,
    });

    isSheet.getCell(isRow, 1).value = '';
    isRow++;
    isSheet.getCell(isRow, 1).value = 'MEMO ITEMS';
    styleRow(isSheet.getRow(isRow), { subheader: true });
    isRow++;

    // NOPAT = EBIT * (1 - Tax Rate)
    addISRow('NOPAT', 'nopat', {
        formula: (c, yr) => `${c}${isRows['ebit']}*(1-${aRef('taxRate', yr)})`,
        value: yr => results.incomeStatements[yr]?.nopat ?? 0,
    });

    // FCFF = NOPAT + D&A - ΔWC - CapEx (engine-computed value for accuracy)
    addISRow('FCFF', 'fcff', {
        value: yr => results.incomeStatements[yr]?.fcff ?? 0,
        bold: true,
    });

    // Thin-Cap compliance memo (Law 30/2023)
    addISRow('Disallowed Interest (Thin-Cap)', 'disallowedInterest', {
        value: yr => results.incomeStatements[yr]?.disallowedInterest ?? 0,
    });
    addISRow('Adjusted Taxable Income', 'adjustedTaxableIncome', {
        value: yr => results.incomeStatements[yr]?.adjustedTaxableIncome ?? results.incomeStatements[yr]?.ebt ?? 0,
    });

    // SBC (for reference / CF use) — use combined array to cover all years
    addISRow('Stock-Based Compensation', 'sbc', {
        formula: (_c, yr) => `${aRef('stockBasedCompAmount', yr)}`,
        value: yr => allSBC[yr] ?? 0,
    });

    // ════════════════════════════════════════════════════════
    // TAB 3 — BALANCE SHEET  (live formulas)
    // ════════════════════════════════════════════════════════
    // Balance is guaranteed by the Cash "plug" formula:
    //   Cash = Total L+E − Non-Cash Current Assets − Total Non-Current Assets
    // This is the standard Wall Street financial modeling approach.
    // It works because: Total Assets = Cash + NonCashCA + NonCA
    //                                = (TotalLE − NonCashCA − NonCA) + NonCashCA + NonCA
    //                                = TotalLE  ✓ always balanced
    const bsSheet = workbook.addWorksheet('Balance Sheet');
    bsSheet.properties.tabColor = { argb: 'FF70AD47' }; // Green
    bsSheet.getColumn(1).width = 35;
    for (let i = 0; i < nYears; i++) bsSheet.getColumn(i + 2).width = 18;
    bsSheet.getCell(1, 1).value = companyName + ' — Balance Sheet';
    for (let i = 0; i < nYears; i++) bsSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(bsSheet);

    const bsRows: Record<string, number> = {};
    let bsRow = 2;

    function addBSRow(label: string, key: string, opts?: {
        formula?: (col: string, yr: number) => string;
        value?: (yr: number) => number;
        bold?: boolean; subheader?: boolean;
    }) {
        bsRows[key] = bsRow;
        bsSheet.getCell(bsRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = bsSheet.getCell(bsRow, i + 2);
            if (opts?.formula) {
                const raw = opts?.value?.(i) ?? results.balanceSheets[i]?.[key as keyof typeof results.balanceSheets[0]] as number ?? 0;
                cell.value = { formula: opts.formula(c, i), result: Number(raw) || 0 };
            } else if (opts?.value) {
                const raw = opts.value(i);
                cell.value = Number(raw) || 0;
            } else {
                const raw = results.balanceSheets[i]?.[key as keyof typeof results.balanceSheets[0]] as number ?? 0;
                cell.value = Number(raw) || 0;
            }
            cell.numFmt = NUM_FMT;
        }
        styleRow(bsSheet.getRow(bsRow), { bold: opts?.bold, subheader: opts?.subheader });
        bsRow++;
    }

    // ── ASSETS ──
    bsSheet.getCell(bsRow, 1).value = 'ASSETS';
    styleRow(bsSheet.getRow(bsRow), { subheader: true });
    bsRow++;

    // Cash — placeholder (formula set AFTER Total L+E row is placed, see below)
    // Cash is the "balancing plug": Cash = Total L+E − Non-Cash CA − Non-Current Assets
    addBSRow('Cash & Equivalents', 'cash', { value: yr => results.balanceSheets[yr]?.cash ?? 0 });

    // A/R = Revenue * DSO / 365
    addBSRow('Accounts Receivable', 'accountsReceivable', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['revenue']}*${aRef('dso', yr)}/365`,
        value: yr => results.balanceSheets[yr]?.accountsReceivable ?? 0,
    });

    // Inventory = COGS * DIO / 365
    addBSRow('Inventory', 'inventory', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['cogs']}*${aRef('dio', yr)}/365`,
        value: yr => results.balanceSheets[yr]?.inventory ?? 0,
    });

    // Prepaid = Revenue * prepaidPercent
    addBSRow('Prepaid Expenses', 'prepaidExpenses', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['revenue']}*${aRef('prepaidPercent', yr)}`,
        value: yr => results.balanceSheets[yr]?.prepaidExpenses ?? 0,
    });

    // Other Current Assets
    addBSRow('Other Current Assets', 'otherCurrentAssets', {
        formula: (_c, yr) => `${aRef('otherCurrentAssets', yr)}`,
        value: yr => results.balanceSheets[yr]?.otherCurrentAssets ?? 0,
    });

    // VAT Receivable (FIX-07: VAT on CapEx)
    // VAT Receivable: historical = engine actuals; projected = live formula
    bsRows['vatReceivable'] = bsRow;
    bsSheet.getCell(bsRow, 1).value = 'VAT Receivable';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = bsSheet.getCell(bsRow, i + 2);
        const raw = results.balanceSheets[i]?.vatReceivable ?? 0;
        if (i < numHistorical) {
            cell.value = Number(raw) || 0;
        } else {
            cell.value = { formula: `IF(${aRef('enableVAT', i)}=0,0,ABS('Income Statement'!${c}${isRows['revenue']}*${aRef('capexPercent', i)})*${aRef('vatRate', i)})`, result: Number(raw) || 0 };
        }
        cell.numFmt = NUM_FMT;
    }
    styleRow(bsSheet.getRow(bsRow), {});
    bsRow++;

    // Total Current Assets = sum
    addBSRow('Total Current Assets', 'totalCurrentAssets', {
        formula: (c) => `SUM(${c}${bsRows['cash']}:${c}${bsRows['vatReceivable']})`,
        value: yr => results.balanceSheets[yr]?.totalCurrentAssets ?? 0,
        bold: true,
    });

    bsSheet.getCell(bsRow, 1).value = '';
    bsRow++;

    // Gross PP&E — live rollforward for projections: prev + Revenue * CapEx%
    addBSRow('Gross PP&E', 'grossPPE', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('grossPPEComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['grossPPE']}+'Income Statement'!${c}${isRows['revenue']}*${aRef('capexPercent', yr)}`;
        },
        value: yr => results.balanceSheets[yr]?.grossPPE ?? 0,
    });
    // Accumulated Depreciation — live rollforward: prev + IS Depreciation
    addBSRow('Accumulated Depreciation', 'accumulatedDepreciation', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('accumDepComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['accumulatedDepreciation']}+'Income Statement'!${c}${isRows['depreciation']}`;
        },
        value: yr => results.balanceSheets[yr]?.accumulatedDepreciation ?? 0,
    });
    // Net PP&E = Gross PPE - Accumulated Depreciation
    addBSRow('Net PP&E', 'netPPE', {
        formula: (c) => `${c}${bsRows['grossPPE']}-${c}${bsRows['accumulatedDepreciation']}`,
        value: yr => results.balanceSheets[yr]?.netPPE ?? 0,
    });
    // Intangibles — live rollforward for projections: MAX(0, prev - Amortization)
    addBSRow('Intangibles', 'intangibles', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('intangiblesComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `MAX(0,${prevC}${bsRows['intangibles']}-'Income Statement'!${c}${isRows['amortization']})`;
        },
        value: yr => results.balanceSheets[yr]?.intangibles ?? 0,
    });
    addBSRow('Goodwill', 'goodwill', {
        formula: (_c, yr) => `${aRef('goodwill', yr)}`,
        value: yr => results.balanceSheets[yr]?.goodwill ?? 0,
    });
    addBSRow('Other Long-Term Assets', 'otherLongTermAssets', {
        formula: (_c, yr) => `${aRef('otherLongTermAssets', yr)}`,
        value: yr => results.balanceSheets[yr]?.otherLongTermAssets ?? 0,
    });

    // Total Non-Current Assets = sum of all non-current asset rows
    addBSRow('Total Non-Current Assets', 'totalNonCurrentAssets', {
        formula: (c) => `${c}${bsRows['netPPE']}+${c}${bsRows['intangibles']}+${c}${bsRows['goodwill']}+${c}${bsRows['otherLongTermAssets']}`,
        value: yr => results.balanceSheets[yr]?.totalNonCurrentAssets ?? 0,
        bold: true,
    });

    // Total Assets
    addBSRow('Total Assets', 'totalAssets', {
        formula: (c) => `${c}${bsRows['totalCurrentAssets']}+${c}${bsRows['totalNonCurrentAssets']}`,
        value: yr => results.balanceSheets[yr]?.totalAssets ?? 0,
        bold: true,
    });

    bsSheet.getCell(bsRow, 1).value = '';
    bsRow++;
    bsSheet.getCell(bsRow, 1).value = 'LIABILITIES';
    styleRow(bsSheet.getRow(bsRow), { subheader: true });
    bsRow++;

    // A/P = COGS * DPO / 365
    addBSRow('Accounts Payable', 'accountsPayable', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['cogs']}*${aRef('dpo', yr)}/365`,
        value: yr => results.balanceSheets[yr]?.accountsPayable ?? 0,
    });

    // Accrued Expenses = Revenue * accruedExpPercent
    addBSRow('Accrued Expenses', 'accruedExpenses', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['revenue']}*${aRef('accruedExpPercent', yr)}`,
        value: yr => results.balanceSheets[yr]?.accruedExpenses ?? 0,
    });

    addBSRow('Short-Term Debt', 'shortTermDebt', {
        formula: (_c, yr) => `${aRef('shortTermDebtAmount', yr)}`,
        value: yr => results.balanceSheets[yr]?.shortTermDebt ?? 0,
    });

    addBSRow('Current Portion LTD', 'currentPortionLTD', {
        formula: (_c, yr) => `${aRef('currentPortionLTD', yr)}`,
        value: yr => results.balanceSheets[yr]?.currentPortionLTD ?? 0,
    });

    // Deferred Revenue = Revenue * deferredRevPercent
    addBSRow('Deferred Revenue', 'deferredRevenue', {
        formula: (c, yr) => `'Income Statement'!${c}${isRows['revenue']}*${aRef('deferredRevPercent', yr)}`,
        value: yr => results.balanceSheets[yr]?.deferredRevenue ?? 0,
    });

    addBSRow('Other Current Liabilities', 'otherCurrentLiabilities', {
        formula: (_c, yr) => `${aRef('otherCurrentLiabilities', yr)}`,
        value: yr => results.balanceSheets[yr]?.otherCurrentLiabilities ?? 0,
    });

    // VAT Payable (FIX-07: net VAT liability on revenue)
    // VAT Payable: historical = engine actuals; projected = live formula
    bsRows['vatPayable'] = bsRow;
    bsSheet.getCell(bsRow, 1).value = 'VAT Payable';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = bsSheet.getCell(bsRow, i + 2);
        const raw = results.balanceSheets[i]?.vatPayable ?? 0;
        if (i < numHistorical) {
            cell.value = Number(raw) || 0;
        } else {
            cell.value = { formula: `IF(${aRef('enableVAT', i)}=0,0,MAX(0,'Income Statement'!${c}${isRows['revenue']}*${aRef('vatRate', i)}-ABS('Income Statement'!${c}${isRows['revenue']}*${aRef('capexPercent', i)})*${aRef('vatRate', i)}))`, result: Number(raw) || 0 };
        }
        cell.numFmt = NUM_FMT;
    }
    styleRow(bsSheet.getRow(bsRow), {});
    bsRow++;

    addBSRow('Total Current Liabilities', 'totalCurrentLiabilities', {
        formula: (c) => `SUM(${c}${bsRows['accountsPayable']}:${c}${bsRows['vatPayable']})`,
        value: yr => results.balanceSheets[yr]?.totalCurrentLiabilities ?? 0,
        bold: true,
    });

    bsSheet.getCell(bsRow, 1).value = '';
    bsRow++;

    // Long-Term Debt — live rollforward for projections: prev + issuance - repayment
    addBSRow('Long-Term Debt', 'longTermDebt', {
        formula: (_c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('ltdComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['longTermDebt']}+${aRef('longTermDebtIssuance', yr)}-${aRef('longTermDebtRepayment', yr)}`;
        },
        value: yr => results.balanceSheets[yr]?.longTermDebt ?? 0,
    });
    addBSRow('Deferred Tax Liabilities', 'deferredTaxLiabilities', {
        formula: (_c, yr) => `${aRef('deferredTaxLiabilities', yr)}`,
        value: yr => results.balanceSheets[yr]?.deferredTaxLiabilities ?? 0,
    });
    // End of Service Provision (Labor Law)
    addBSRow('End of Service Provision', 'endOfServiceProvision', {
        formula: (_c, yr) => `${aRef('eosProvisionComputed', yr)}`,
        value: yr => results.balanceSheets[yr]?.endOfServiceProvision ?? 0,
    });
    addBSRow('Other LT Liabilities', 'otherLongTermLiabilities', {
        formula: (_c, yr) => `${aRef('otherLongTermLiabilities', yr)}`,
        value: yr => results.balanceSheets[yr]?.otherLongTermLiabilities ?? 0,
    });

    addBSRow('Total Non-Current Liabilities', 'totalNonCurrentLiabilities', {
        formula: (c) => `SUM(${c}${bsRows['longTermDebt']}:${c}${bsRows['otherLongTermLiabilities']})`,
        value: yr => results.balanceSheets[yr]?.totalNonCurrentLiabilities ?? 0,
        bold: true,
    });

    addBSRow('Total Liabilities', 'totalLiabilities', {
        formula: (c) => `${c}${bsRows['totalCurrentLiabilities']}+${c}${bsRows['totalNonCurrentLiabilities']}`,
        value: yr => results.balanceSheets[yr]?.totalLiabilities ?? 0,
        bold: true,
    });

    bsSheet.getCell(bsRow, 1).value = '';
    bsRow++;
    bsSheet.getCell(bsRow, 1).value = 'EQUITY';
    styleRow(bsSheet.getRow(bsRow), { subheader: true });
    bsRow++;

    addBSRow('Common Stock', 'commonStock', {
        formula: (_c, yr) => `${aRef('commonStock', yr)}`,
        value: yr => results.balanceSheets[yr]?.commonStock ?? 0,
    });
    // APIC — live rollforward for projections: prev + equityIssuance + SBC
    addBSRow('Additional Paid-in Capital', 'additionalPaidInCapital', {
        formula: (_c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('apicComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['additionalPaidInCapital']}+${aRef('equityIssuance', yr)}+${aRef('stockBasedCompAmount', yr)}`;
        },
        value: yr => results.balanceSheets[yr]?.additionalPaidInCapital ?? 0,
    });
    // Legal Reserve — rollforward: prev + IS Legal Reserve Addition
    addBSRow('Legal Reserve', 'legalReserve', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('legalReserveComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['legalReserve']}+'Income Statement'!${c}${isRows['legalReserveAddition']}`;
        },
        value: yr => results.balanceSheets[yr]?.legalReserve ?? 0,
    });
    // Retained Earnings — live rollforward: prev + Addition to RE (from IS profit appropriation)
    addBSRow('Retained Earnings', 'retainedEarnings', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('reComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['retainedEarnings']}+'Income Statement'!${c}${isRows['additionToRE']}`;
        },
        value: yr => results.balanceSheets[yr]?.retainedEarnings ?? 0,
    });
    // Treasury Stock — live rollforward: prev - shareRepurchaseAmount
    addBSRow('Treasury Stock', 'treasuryStock', {
        formula: (_c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('tsComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['treasuryStock']}-${aRef('shareRepurchaseAmount', yr)}`;
        },
        value: yr => results.balanceSheets[yr]?.treasuryStock ?? 0,
    });
    addBSRow('Other Comprehensive Income', 'otherComprehensiveIncome', {
        formula: (_c, yr) => `${aRef('oci', yr)}`,
        value: yr => results.balanceSheets[yr]?.otherComprehensiveIncome ?? 0,
    });

    addBSRow('Total Equity', 'totalEquity', {
        formula: (c) => `SUM(${c}${bsRows['commonStock']}:${c}${bsRows['otherComprehensiveIncome']})`,
        value: yr => results.balanceSheets[yr]?.totalEquity ?? 0,
        bold: true,
    });

    bsSheet.getCell(bsRow, 1).value = '';
    bsRow++;

    addBSRow('Total Liabilities + Equity', 'totalLiabilitiesEquity', {
        formula: (c) => `${c}${bsRows['totalLiabilities']}+${c}${bsRows['totalEquity']}`,
        value: yr => results.balanceSheets[yr]?.totalLiabilitiesEquity ?? 0,
        bold: true,
    });

    // ── SET CASH FORMULA for ALL years ──
    // Historical: plug formula (Cash = TotalLE - non-cash CA - non-current assets)
    // Projection: link to CF Ending Cash (requires CF to be built; formula set here after BS)
    // Note: projection Cash formulas will be overwritten AFTER CF is built (deferred)
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = bsSheet.getCell(bsRows['cash'], i + 2);
        // Use plug formula as initial pass for all years (projections overwritten later)
        const formula = `${c}${bsRows['totalLiabilitiesEquity']}`
            + `-${c}${bsRows['accountsReceivable']}`
            + `-${c}${bsRows['inventory']}`
            + `-${c}${bsRows['prepaidExpenses']}`
            + `-${c}${bsRows['otherCurrentAssets']}`
            + `-${c}${bsRows['vatReceivable']}`
            + `-${c}${bsRows['totalNonCurrentAssets']}`;
        cell.value = { formula, result: results.balanceSheets[i]?.cash ?? 0 };
        cell.numFmt = NUM_FMT;
    }

    // Balance Check formula (for all years)
    bsRows['balanceCheck'] = bsRow;
    bsSheet.getCell(bsRow, 1).value = 'Balance Check (A − L+E)';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = bsSheet.getCell(bsRow, i + 2);
        cell.value = { formula: `${c}${bsRows['totalAssets']}-${c}${bsRows['totalLiabilitiesEquity']}`, result: 0 };
        cell.numFmt = NUM_FMT;
    }
    styleRow(bsSheet.getRow(bsRow), { bold: true });
    bsRow++;

    // Balanced? row
    bsSheet.getCell(bsRow, 1).value = 'Balanced?';
    for (let i = 0; i < nYears; i++) {
        const c = colLetter(i + 2);
        const cell = bsSheet.getCell(bsRow, i + 2);
        cell.value = { formula: `IF(ABS(${c}${bsRows['balanceCheck']})<1,"✓ Balanced","✗ Imbalanced")`, result: '✓ Balanced' };
    }
    bsRow++;

    // ════════════════════════════════════════════════════════
    // BUILD CALC SHEETS — 3 hidden formula worksheets
    // ════════════════════════════════════════════════════════
    // Must happen after IS + BS tabs so isRows / bsRows are populated.
    const calcSheets = buildCalcSheets({
        workbook,
        scenarioRows,
        isRows,
        bsRows,
        periods,
        numHistorical,
        nYears,
        allScenarios: allScenarios.map(s => ({ type: s.type, results: s.results })),
    });

    // ════════════════════════════════════════════════════════
    // Replace Scenarios tab DASHBOARD rows with formulas
    // referencing the calc sheets.
    //
    // IMPORTANT: Engine-Computed Values (keys ending with "Computed")
    // are kept as STATIC engine values. The _Calc sheets use
    // non-iterative formulas that cannot accurately resolve the
    // circular IS↔BS dependencies (interest income ↔ cash,
    // retained earnings ↔ dividends). The engine's iterative
    // circular resolver (15+ iterations) produces correct values
    // (e.g. 61,771 interest income) while single-pass _Calc
    // formulas diverge (e.g. 39,387). Overwriting with formulas
    // would cause Excel to show wrong values on recalculation.
    // ════════════════════════════════════════════════════════
    {
        const scenSheet = workbook.getWorksheet('Scenarios');
        if (scenSheet) {
            // Map: ROW_SPEC key → calc sheet row number
            // Only Dashboard Output Metrics get formula overrides.
            // Engine-Computed rows stay as static engine values.
            const COMPUTED_KEY_TO_CALC: Record<string, number> = {
                // Dashboard Output Metrics — keys use out_ prefix per ROW_SPECS
                'out_revenue': calcSheets.base?.rows.revenue ?? 0,
                'out_grossProfit': calcSheets.base?.rows.grossProfit ?? 0,
                'out_ebit': calcSheets.base?.rows.ebit ?? 0,
                'out_netIncome': calcSheets.base?.rows.netIncome ?? 0,
                'out_totalAssets': calcSheets.base?.rows.totalAssets ?? 0,
                'out_totalEquity': calcSheets.base?.rows.totalEquity ?? 0,
                'out_fcf': calcSheets.base?.rows.cf_fcf ?? 0,
                'out_cfo': calcSheets.base?.rows.cf_cfo ?? 0,
                'out_endingCash': calcSheets.base?.rows.cf_endCash ?? 0,
                'out_cash': calcSheets.base?.rows.cash ?? 0,
                // Keys that need special formulas → 0 → handled in switch below
                'out_revenueGrowth': 0,
                'out_ebitda': 0,
                'out_grossMargin': 0,
                'out_ebitMargin': 0,
                'out_ebitdaMargin': 0,
                'out_netMargin': 0,
                'out_eps': 0,
                'out_totalDebt': 0,
                'out_currentRatio': 0,
                'out_debtToEquity': 0,
                'out_roe': 0,
                'out_roic': 0,
                'out_roa': 0,
            };

            // Only Dashboard Output Metrics (out_*) get formula overrides.
            // Engine-Computed rows (ending with "Computed") are kept as static
            // engine values to guarantee accuracy.
            const isDashboardOutput = (key: string) =>
                key.startsWith('out_');

            // Scenario block info
            const SCENARIO_BLOCKS = [
                { blockName: 'Base Case', sheetName: calcSheets.base?.sheetName ?? '_Calc_Base' },
                { blockName: 'Optimistic', sheetName: calcSheets.optimistic?.sheetName ?? '_Calc_Opt' },
                { blockName: 'Conservative', sheetName: calcSheets.conservative?.sheetName ?? '_Calc_Con' },
            ];

            for (const spec of ROW_SPECS) {
                if (!isDashboardOutput(spec.key)) continue; // Skip input + engine-computed rows
                const calcRow = COMPUTED_KEY_TO_CALC[spec.key];

                for (const block of SCENARIO_BLOCKS) {
                    const rowNum = scenarioRows[`${block.blockName}_${spec.key}`];
                    if (!rowNum) continue;

                    // Get the correct calc sheet name for this block
                    const cs = block.sheetName;

                    for (let yr = numHistorical; yr < nYears; yr++) {
                        const c = colLetter(yr + 2);
                        const cell = scenSheet.getCell(rowNum, yr + 2);
                        const currentVal = typeof cell.value === 'number' ? cell.value : 0;

                        let formula: string;

                        if (calcRow > 0) {
                            // Direct reference to calc sheet row
                            formula = `'${cs}'!${c}${calcRow}`;
                        } else {
                            // Special computed formulas
                            const base = calcSheets.base?.rows ?? ({} as Record<string, number>);
                            switch (spec.key) {
                                case 'out_ebitda':
                                    formula = `'${cs}'!${c}${base.ebit}+'${cs}'!${c}${base.depreciation}+'${cs}'!${c}${base.amortization}`;
                                    break;
                                case 'out_revenueGrowth':
                                    formula = `IF(${colLetter(yr + 1)}${scenarioRows[`${block.blockName}_out_revenue`] ?? 1}=0,0,(Scenarios!${c}${scenarioRows[`${block.blockName}_out_revenue`] ?? 1}-${colLetter(yr + 1)}${scenarioRows[`${block.blockName}_out_revenue`] ?? 1})/${colLetter(yr + 1)}${scenarioRows[`${block.blockName}_out_revenue`] ?? 1})`;
                                    break;
                                case 'out_grossMargin':
                                    formula = `IF('${cs}'!${c}${base.revenue}=0,0,'${cs}'!${c}${base.grossProfit}/'${cs}'!${c}${base.revenue})`;
                                    break;
                                case 'out_ebitMargin':
                                    formula = `IF('${cs}'!${c}${base.revenue}=0,0,'${cs}'!${c}${base.ebit}/'${cs}'!${c}${base.revenue})`;
                                    break;
                                case 'out_ebitdaMargin':
                                    formula = `IF('${cs}'!${c}${base.revenue}=0,0,('${cs}'!${c}${base.ebit}+'${cs}'!${c}${base.depreciation}+'${cs}'!${c}${base.amortization})/'${cs}'!${c}${base.revenue})`;
                                    break;
                                case 'out_netMargin':
                                    formula = `IF('${cs}'!${c}${base.revenue}=0,0,'${cs}'!${c}${base.netIncome}/'${cs}'!${c}${base.revenue})`;
                                    break;
                                case 'out_roe':
                                    formula = `IF('${cs}'!${c}${base.totalEquity}=0,0,'${cs}'!${c}${base.netIncome}/'${cs}'!${c}${base.totalEquity})`;
                                    break;
                                case 'out_roa':
                                    formula = `IF('${cs}'!${c}${base.totalAssets}=0,0,'${cs}'!${c}${base.netIncome}/'${cs}'!${c}${base.totalAssets})`;
                                    break;
                                case 'out_currentRatio':
                                    formula = `IF('${cs}'!${c}${base.totalCL}=0,0,'${cs}'!${c}${base.totalCA}/'${cs}'!${c}${base.totalCL})`;
                                    break;
                                case 'out_debtToEquity': {
                                    const stDebt = base.shortTermDebt ?? 0;
                                    const ltd = base.longTermDebt ?? 0;
                                    formula = `IF('${cs}'!${c}${base.totalEquity}=0,0,('${cs}'!${c}${stDebt}+'${cs}'!${c}${ltd})/'${cs}'!${c}${base.totalEquity})`;
                                    break;
                                }
                                case 'out_eps':
                                    formula = `'${cs}'!${c}${base.netIncomeAfterEPD}/Scenarios!${c}${scenarioRows[`${block.blockName}_sharesOutstanding`] ?? 1}`;
                                    break;
                                case 'out_totalDebt': {
                                    const stDebt2 = base.shortTermDebt ?? 0;
                                    const ltd2 = base.longTermDebt ?? 0;
                                    formula = `'${cs}'!${c}${stDebt2}+'${cs}'!${c}${ltd2}`;
                                    break;
                                }
                                case 'out_roic': {
                                    // Unified ROIC = NOPAT / (Equity + Debt − Cash)
                                    const stDebtR = base.shortTermDebt ?? 0;
                                    const ltdR = base.longTermDebt ?? 0;
                                    const cpltdR = base.currentPortionLTD ?? 0;
                                    const cashR = base.cash ?? 0;
                                    const ic = `('${cs}'!${c}${base.totalEquity}+'${cs}'!${c}${stDebtR}+'${cs}'!${c}${ltdR}+'${cs}'!${c}${cpltdR}-'${cs}'!${c}${cashR})`;
                                    formula = `IF(${ic}=0,0,'${cs}'!${c}${base.nopat}/${ic})`;
                                    break;
                                }
                                default:
                                    continue; // Skip if we can't map it
                            }
                        }

                        cell.value = { formula, result: currentVal };
                    }
                }
            }
            console.log('  ✓ Scenarios tab computed rows → calc sheet formulas');
        }
    }

    // ════════════════════════════════════════════════════════
    // TAB 4 — CASH FLOW STATEMENT  (formulas)
    // ════════════════════════════════════════════════════════
    // CF has fewer periods than IS/BS because it needs a prior balance sheet for changes.
    // CF entry 0 = 2022 (IS/BS entry 1), so CF column B maps to IS/BS column C.
    const nCF = results.cashFlowStatements.length;   // typically 7 (2 hist + 5 proj)
    const cfPeriods = results.cashFlowStatements.map(s => s.period);
    // numHistoricalCF already declared above
    const cfOffset = 1; // CF entry j corresponds to IS/BS entry j+1

    const cfSheet = workbook.addWorksheet('Cash Flow Statement');
    cfSheet.properties.tabColor = { argb: 'FF00B0F0' }; // Teal
    cfSheet.getColumn(1).width = 35;
    for (let j = 0; j < nCF; j++) cfSheet.getColumn(j + 2).width = 18;
    cfSheet.getCell(1, 1).value = companyName + ' — Cash Flow Statement';
    for (let j = 0; j < nCF; j++) cfSheet.getCell(1, j + 2).value = cfPeriods[j] ?? `Year ${j + 1}`;
    styleHeader(cfSheet);

    const cfRows: Record<string, number> = {};
    let cfRow = 2;

    function addCFRow(label: string, key: string, opts?: {
        formula?: (cfCol: string, isCol: string, isYr: number) => string;
        value?: (cfIdx: number) => number;
        bold?: boolean; subheader?: boolean;
    }) {
        cfRows[key] = cfRow;
        cfSheet.getCell(cfRow, 1).value = label;
        for (let j = 0; j < nCF; j++) {
            const cfCol = colLetter(j + 2);                      // CF column
            const isYr = j + cfOffset;                            // IS/BS year index
            const isCol = colLetter(isYr + 2);                   // IS/BS column
            const cell = cfSheet.getCell(cfRow, j + 2);
            if (opts?.formula) {
                // ALL years use formulas (Assumptions tab has back-computed historical values)
                const raw = opts?.value?.(j) ?? results.cashFlowStatements[j]?.[key as keyof typeof results.cashFlowStatements[0]] as number ?? 0;
                cell.value = { formula: opts.formula(cfCol, isCol, isYr), result: Number(raw) || 0 };
            } else if (opts?.value) {
                const raw = opts.value(j);
                cell.value = Number(raw) || 0;
            } else {
                const raw = results.cashFlowStatements[j]?.[key as keyof typeof results.cashFlowStatements[0]] as number ?? 0;
                cell.value = Number(raw) || 0;
            }
            cell.numFmt = NUM_FMT;
        }
        styleRow(cfSheet.getRow(cfRow), { bold: opts?.bold, subheader: opts?.subheader });
        cfRow++;
    }

    cfSheet.getCell(cfRow, 1).value = 'Operating Activities';
    styleRow(cfSheet.getRow(cfRow), { subheader: true });
    cfRow++;

    // Net Income = from IS (use isCol for cross-tab reference)
    addCFRow('Net Income', 'netIncome', {
        formula: (_cfCol, isCol) => `'Income Statement'!${isCol}${isRows['netIncome']}`,
        value: j => results.cashFlowStatements[j]?.netIncome ?? 0,
    });

    // D&A from IS
    addCFRow('Depreciation', 'depreciation', {
        formula: (_cfCol, isCol) => `'Income Statement'!${isCol}${isRows['depreciation']}`,
        value: j => results.cashFlowStatements[j]?.depreciation ?? 0,
    });
    addCFRow('Amortization', 'amortization', {
        formula: (_cfCol, isCol) => `'Income Statement'!${isCol}${isRows['amortization']}`,
        value: j => results.cashFlowStatements[j]?.amortization ?? 0,
    });

    // SBC
    addCFRow('Stock-Based Compensation', 'stockBasedComp', {
        formula: (_cfCol, isCol) => `'Income Statement'!${isCol}${isRows['sbc']}`,
        value: j => results.cashFlowStatements[j]?.stockBasedComp ?? 0,
    });

    // Deferred Taxes = change in DTL from BS (current - prior)
    addCFRow('Deferred Taxes', 'deferredTaxes', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1); // prior BS column = isYr-1+2 = isYr+1
            return `'Balance Sheet'!${isCol}${bsRows['deferredTaxLiabilities']}-'Balance Sheet'!${priorIsCol}${bsRows['deferredTaxLiabilities']}`;
        },
        value: j => results.cashFlowStatements[j]?.deferredTaxes ?? 0,
    });

    // Δ Other LT Liabilities — non-cash provisions etc.
    addCFRow('Δ Other LT Liabilities', 'changeInOtherLTLiabilities', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['otherLongTermLiabilities']}-'Balance Sheet'!${priorIsCol}${bsRows['otherLongTermLiabilities']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInOtherLTLiabilities ?? 0,
    });

    // Δ OCI — non-cash equity revaluation movements
    addCFRow('Δ OCI (non-cash)', 'changeInOCI', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['otherComprehensiveIncome']}-'Balance Sheet'!${priorIsCol}${bsRows['otherComprehensiveIncome']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInOCI ?? 0,
    });

    // Δ End of Service Provision — non-cash provision addition (Egyptian Labor Law Art. 110)
    addCFRow('Δ End of Service Provision', 'endOfServiceProvisionAddition', {
        formula: (_cfCol, _isCol, isYr) => {
            if (isYr === 0) return '0';
            return `${aRef('eosProvisionComputed', isYr)}-${aRef('eosProvisionComputed', isYr - 1)}`;
        },
        value: j => results.cashFlowStatements[j]?.endOfServiceProvisionAddition ?? 0,
    });

    // Working capital changes — formulas using BS deltas
    cfSheet.getCell(cfRow, 1).value = 'Working Capital Changes';
    styleRow(cfSheet.getRow(cfRow), { subheader: true });
    cfRow++;

    // Assets: increase = cash outflow (negative): -(current - prior)
    addCFRow('Change in A/R', 'changeInAR', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `-('Balance Sheet'!${isCol}${bsRows['accountsReceivable']}-'Balance Sheet'!${priorIsCol}${bsRows['accountsReceivable']})`;
        },
        value: j => results.cashFlowStatements[j]?.changeInAR ?? 0,
    });
    addCFRow('Change in Inventory', 'changeInInventory', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `-('Balance Sheet'!${isCol}${bsRows['inventory']}-'Balance Sheet'!${priorIsCol}${bsRows['inventory']})`;
        },
        value: j => results.cashFlowStatements[j]?.changeInInventory ?? 0,
    });
    addCFRow('Change in Prepaid', 'changeInPrepaid', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `-('Balance Sheet'!${isCol}${bsRows['prepaidExpenses']}-'Balance Sheet'!${priorIsCol}${bsRows['prepaidExpenses']})`;
        },
        value: j => results.cashFlowStatements[j]?.changeInPrepaid ?? 0,
    });
    // Liabilities: increase = cash inflow (positive): +(current - prior)
    addCFRow('Change in A/P', 'changeInAP', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['accountsPayable']}-'Balance Sheet'!${priorIsCol}${bsRows['accountsPayable']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInAP ?? 0,
    });
    addCFRow('Change in Accrued Exp', 'changeInAccruedExp', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['accruedExpenses']}-'Balance Sheet'!${priorIsCol}${bsRows['accruedExpenses']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInAccruedExp ?? 0,
    });
    addCFRow('Change in Deferred Rev', 'changeInDeferredRev', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['deferredRevenue']}-'Balance Sheet'!${priorIsCol}${bsRows['deferredRevenue']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInDeferredRev ?? 0,
    });
    // VAT Working Capital Changes
    addCFRow('Change in VAT Receivable', 'changeInVATReceivable', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `-('Balance Sheet'!${isCol}${bsRows['vatReceivable']}-'Balance Sheet'!${priorIsCol}${bsRows['vatReceivable']})`;
        },
        value: j => results.cashFlowStatements[j]?.changeInVATReceivable ?? 0,
    });
    addCFRow('Change in VAT Payable', 'changeInVATPayable', {
        formula: (_cfCol, isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1);
            return `'Balance Sheet'!${isCol}${bsRows['vatPayable']}-'Balance Sheet'!${priorIsCol}${bsRows['vatPayable']}`;
        },
        value: j => results.cashFlowStatements[j]?.changeInVATPayable ?? 0,
    });

    // Total WC Change (includes all WC items + VAT)
    addCFRow('Total WC Change', 'totalWorkingCapitalChange', {
        formula: (cfCol) => `SUM(${cfCol}${cfRows['changeInAR']}:${cfCol}${cfRows['changeInVATPayable']})`,
        value: j => results.cashFlowStatements[j]?.totalWorkingCapitalChange ?? 0,
    });

    // CFO = NI + D&A + SBC + DeferredTax + ΔOLT_Liab + ΔOCI + ΔEOS + WC
    addCFRow('Cash from Operations', 'cashFromOperations', {
        formula: (cfCol) => `${cfCol}${cfRows['netIncome']}+${cfCol}${cfRows['depreciation']}+${cfCol}${cfRows['amortization']}+${cfCol}${cfRows['stockBasedComp']}+${cfCol}${cfRows['deferredTaxes']}+${cfCol}${cfRows['changeInOtherLTLiabilities']}+${cfCol}${cfRows['changeInOCI']}+${cfCol}${cfRows['endOfServiceProvisionAddition']}+${cfCol}${cfRows['totalWorkingCapitalChange']}`,
        value: j => results.cashFlowStatements[j]?.cashFromOperations ?? 0,
        bold: true,
    });

    cfSheet.getCell(cfRow, 1).value = '';
    cfRow++;
    cfSheet.getCell(cfRow, 1).value = 'Investing Activities';
    styleRow(cfSheet.getRow(cfRow), { subheader: true });
    cfRow++;

    // CapEx = Revenue * CapEx%  (negative) — uses isCol for IS reference and isYr for aRef
    addCFRow('Capital Expenditures', 'capex', {
        formula: (_cfCol, isCol, isYr) => `-ABS('Income Statement'!${isCol}${isRows['revenue']}*${aRef('capexPercent', isYr)})`,
        value: j => results.cashFlowStatements[j]?.capex ?? 0,
    });

    // Purchase of Intangibles = -(Δintangibles_net + amortization)
    addCFRow('Purchase of Intangibles', 'purchaseOfIntangibles', {
        formula: (_cfCol, isCol, isYr) => {
            const prior = colLetter(isYr + 1);
            return `-(('Balance Sheet'!${isCol}${bsRows['intangibles']}-'Balance Sheet'!${prior}${bsRows['intangibles']})+'Income Statement'!${isCol}${isRows['amortization']})`;
        },
        value: j => results.cashFlowStatements[j]?.purchaseOfIntangibles ?? 0,
    });

    // Δ Other LT Assets — increase in assets is cash outflow
    addCFRow('Δ Other LT Assets', 'changeInOtherLongTermAssets', {
        formula: (_cfCol, isCol, isYr) => {
            const prior = colLetter(isYr + 1);
            return `-('Balance Sheet'!${isCol}${bsRows['otherLongTermAssets']}-'Balance Sheet'!${prior}${bsRows['otherLongTermAssets']})`;
        },
        value: j => results.cashFlowStatements[j]?.changeInOtherLongTermAssets ?? 0,
    });

    // Acquisitions / Asset Sales: no engine driver — always 0 (Fix 3).
    addCFRow('Acquisitions', 'acquisitions', {
        formula: () => `0`,
        value: j => results.cashFlowStatements[j]?.acquisitions ?? 0,
    });
    addCFRow('Asset Sales', 'assetSales', {
        formula: () => `0`,
        value: j => results.cashFlowStatements[j]?.assetSales ?? 0,
    });

    addCFRow('Cash from Investing', 'cashFromInvesting', {
        formula: (cfCol) => `${cfCol}${cfRows['capex']}+${cfCol}${cfRows['purchaseOfIntangibles']}+${cfCol}${cfRows['changeInOtherLongTermAssets']}+${cfCol}${cfRows['acquisitions']}+${cfCol}${cfRows['assetSales']}`,
        value: j => results.cashFlowStatements[j]?.cashFromInvesting ?? 0,
        bold: true,
    });

    cfSheet.getCell(cfRow, 1).value = '';
    cfRow++;
    cfSheet.getCell(cfRow, 1).value = 'Financing Activities';
    styleRow(cfSheet.getRow(cfRow), { subheader: true });
    cfRow++;

    addCFRow('Debt Issuance', 'debtIssuance', {
        formula: (_cfCol, _isCol, isYr) => `${aRef('longTermDebtIssuance', isYr)}`,
        value: j => results.cashFlowStatements[j]?.debtIssuance ?? 0,
    });
    addCFRow('Debt Repayment', 'debtRepayment', {
        formula: (_cfCol, _isCol, isYr) => `-ABS(${aRef('longTermDebtRepayment', isYr)})`,
        value: j => results.cashFlowStatements[j]?.debtRepayment ?? 0,
    });

    // Dividends: historical = engine back-solved (from RE changes), projected = Distributable Profit * PayoutRatio
    addCFRow('Dividends Paid', 'dividendsPaid', {
        formula: (_cfCol, isCol, isYr) => {
            if (isYr < numHistorical) {
                // Historical: use engine-computed value from Assumptions tab
                return `${aRef('dividendsPaidComputed', isYr)}`;
            }
            // Projected: -MAX(0, DistributableProfit * PayoutRatio)
            return `-MAX(0,'Income Statement'!${isCol}${isRows['distributableProfit']}*${aRef('dividendPayoutRatio', isYr)})`;
        },
        value: j => results.cashFlowStatements[j]?.dividendsPaid ?? 0,
    });

    // Employee Profit Sharing Paid — cash outflow equal to EPD from IS
    addCFRow('Employee Profit Sharing Paid', 'employeeProfitSharingPaid', {
        formula: (_cfCol, isCol) => `-'Income Statement'!${isCol}${isRows['employeeProfitSharing']}`,
        value: j => results.cashFlowStatements[j]?.employeeProfitSharingPaid ?? 0,
    });

    // Fix 10: WHT shown as memo — included in Dividends Paid total
    addCFRow('  └ Dividend WHT (memo, incl. above)', 'dividendWHT', {
        formula: (_cfCol, isCol) => `-'Income Statement'!${isCol}${isRows['dividendWHT']}`,
        value: j => results.cashFlowStatements[j]?.dividendWHT ?? 0,
    });

    // Equity Issuance: historical = ΔCS + ΔAPIC from Historical Data, projected = assumption
    addCFRow('Equity Issuance', 'equityIssuance', {
        formula: (_cfCol, _isCol, isYr) => {
            if (isYr < numHistorical) {
                if (isYr === 0) return `0`;
                const cs = hdRows['commonStock'], apic = hdRows['additionalPaidInCapital'];
                if (!cs || !apic) return `0`;
                const c = colLetter(isYr + 2);
                const prev = colLetter(isYr + 1);
                return `('Historical Data'!${c}${cs}-'Historical Data'!${prev}${cs})+('Historical Data'!${c}${apic}-'Historical Data'!${prev}${apic})`;
            }
            return `${aRef('equityIssuance', isYr)}`;
        },
        value: j => results.cashFlowStatements[j]?.equityIssuance ?? 0,
    });

    // Share Repurchases: historical = -ABS(ΔTreasury) from Historical Data, projected = -ABS(assumption)
    addCFRow('Share Repurchases', 'shareRepurchases', {
        formula: (_cfCol, _isCol, isYr) => {
            if (isYr < numHistorical) {
                if (isYr === 0) return `0`;
                const ts = hdRows['treasuryStock'];
                if (!ts) return `0`;
                const c = colLetter(isYr + 2);
                const prev = colLetter(isYr + 1);
                return `-ABS('Historical Data'!${c}${ts}-'Historical Data'!${prev}${ts})`;
            }
            return `-ABS(${aRef('shareRepurchaseAmount', isYr)})`;
        },
        value: j => results.cashFlowStatements[j]?.shareRepurchases ?? 0,
    });

    addCFRow('Cash from Financing', 'cashFromFinancing', {
        formula: (cfCol) => `${cfCol}${cfRows['debtIssuance']}+${cfCol}${cfRows['debtRepayment']}+${cfCol}${cfRows['dividendsPaid']}+${cfCol}${cfRows['employeeProfitSharingPaid']}+${cfCol}${cfRows['equityIssuance']}+${cfCol}${cfRows['shareRepurchases']}`,
        value: j => results.cashFlowStatements[j]?.cashFromFinancing ?? 0,
        bold: true,
    });

    cfSheet.getCell(cfRow, 1).value = '';
    cfRow++;

    // Net Change in Cash = CFO + CFI + CFF
    addCFRow('Net Change in Cash', 'netChangeInCash', {
        formula: (cfCol) => `${cfCol}${cfRows['cashFromOperations']}+${cfCol}${cfRows['cashFromInvesting']}+${cfCol}${cfRows['cashFromFinancing']}`,
        value: j => results.cashFlowStatements[j]?.netChangeInCash ?? 0,
        bold: true,
    });

    // Beginning Cash = prior period's BS Cash
    addCFRow('Beginning Cash', 'beginningCash', {
        formula: (_cfCol, _isCol, isYr) => {
            const priorIsCol = colLetter(isYr + 1); // prior BS column
            return `'Balance Sheet'!${priorIsCol}${bsRows['cash']}`;
        },
        value: j => results.cashFlowStatements[j]?.beginningCash ?? 0,
    });

    // Ending Cash = Beginning + Net Change
    addCFRow('Ending Cash', 'endingCash', {
        formula: (cfCol) => `${cfCol}${cfRows['beginningCash']}+${cfCol}${cfRows['netChangeInCash']}`,
        value: j => results.cashFlowStatements[j]?.endingCash ?? 0,
        bold: true,
    });

    cfSheet.getCell(cfRow, 1).value = '';
    cfRow++;

    // FCF = CFO + CapEx
    addCFRow('Free Cash Flow', 'freeCashFlow', {
        formula: (cfCol) => `${cfCol}${cfRows['cashFromOperations']}+${cfCol}${cfRows['capex']}`,
        value: j => results.cashFlowStatements[j]?.freeCashFlow ?? 0,
        bold: true,
    });

    // ── Reconciliation Check ────────────────────────────
    cfSheet.getCell(cfRow, 1).value = '';
    cfRow++;

    cfRows['reconciliationCheck'] = cfRow;
    cfSheet.getCell(cfRow, 1).value = 'Reconciliation Check';
    cfSheet.getCell(cfRow, 1).font = BOLD_FONT;
    for (let j = 0; j < nCF; j++) {
        const cfCol = colLetter(j + 2);
        const isYr = j + cfOffset;
        const isCol = colLetter(isYr + 2);
        const cell = cfSheet.getCell(cfRow, j + 2);
        const passes = results.cashFlowStatements[j]?.reconciles ?? false;
        const resultText = passes ? '✓ Reconciles' : '✗ Error';

        // Formula: compare CF ending cash to BS cash
        cell.value = {
            formula: `IF(ABS(${cfCol}${cfRows['endingCash']}-'Balance Sheet'!${isCol}${bsRows['cash']})<0.01,"✓ Reconciles","✗ Error")`,
            result: resultText,
        };

        // Conditional formatting: green for pass, red for fail
        if (passes) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
            cell.font = { bold: true, color: { argb: 'FF006100' } };
        } else {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
            cell.font = { bold: true, color: { argb: 'FF9C0006' } };
        }
        cell.border = BORDERS;
    }
    cfRow++;

    // ════════════════════════════════════════════════════════
    // DEFERRED FORMULA OVERWRITES
    // ════════════════════════════════════════════════════════
    // These formulas reference rows in sheets that were built AFTER the
    // initial pass. Now that IS, BS, and CF are all complete, we can
    // overwrite the placeholder formulas with live cross-sheet references.

    // (A) BS Cash — projection columns: link to CF Ending Cash
    for (let i = numHistorical; i < nYears; i++) {
        const cfJ = i - cfOffset; // CF index for this IS/BS year
        if (cfJ < 0 || cfJ >= nCF) continue;
        const cfCol = colLetter(cfJ + 2);
        const cell = bsSheet.getCell(bsRows['cash'], i + 2);
        cell.value = {
            formula: `'Cash Flow Statement'!${cfCol}${cfRows['endingCash']}`,
            result: results.balanceSheets[i]?.cash ?? 0,
        };
        cell.numFmt = NUM_FMT;
    }

    // NOTE: IS Interest Income and Interest Expense use the initial formulas set above
    // (referencing Assumptions!InterestIncomeComputed and InterestExpenseComputed).
    // These are engine-exact values with NO circular references.
    // Previously, avg-balance formulas referencing BS Cash/Debt were applied here,
    // but those created a circular chain: Interest → NI → CF → Cash → Interest
    // that Excel could not resolve, causing $0 values throughout.

    // (B) IS FCFF — replace hardcoded values with live formulas
    // The IS tab should switch FCFF by active scenario using IF formulas.
    {
        const fcffRow = isRows['fcff'];
        const bcs = calcSheets.base?.sheetName ?? '_Calc_Base';
        const ocs = calcSheets.optimistic?.sheetName ?? '_Calc_Opt';
        const ccs = calcSheets.conservative?.sheetName ?? '_Calc_Con';
        const calcFcffRow = calcSheets.base?.rows?.fcff ?? 32;
        // Dashboard!B6 is the scenario selector dropdown cell
        const selRef = 'Dashboard!$B$6';
        for (let i = numHistorical; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = isSheet.getCell(fcffRow, i + 2);
            const result = results.incomeStatements[i]?.fcff ?? 0;
            // Scenario-aware: picks from the correct _Calc sheet
            cell.value = {
                formula: `IF(${selRef}="Base Case",'${bcs}'!${c}${calcFcffRow},IF(${selRef}="Optimistic",'${ocs}'!${c}${calcFcffRow},'${ccs}'!${c}${calcFcffRow}))`,
                result: Number(result) || 0,
            };
            cell.numFmt = NUM_FMT;
        }
    }

    // ════════════════════════════════════════════════════════
    // TAB 5 — RATIO ANALYSIS  (formulas from statement tabs)
    // ════════════════════════════════════════════════════════
    const ratioSheet = workbook.addWorksheet('Ratios');
    ratioSheet.properties.tabColor = { argb: 'FF7030A0' }; // Purple
    ratioSheet.getColumn(1).width = 30;
    for (let i = 0; i < nYears; i++) ratioSheet.getColumn(i + 2).width = 16;
    ratioSheet.getCell(1, 1).value = 'Financial Ratios';
    for (let i = 0; i < nYears; i++) ratioSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(ratioSheet);

    let rRow = 2;
    const ratioRows: Record<string, number> = {};

    function addRatioRow(label: string, formula: (c: string, yr: number) => string, resultKey?: string, fmt: string = PCT_FMT) {
        if (resultKey) ratioRows[resultKey] = rRow;
        ratioSheet.getCell(rRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = ratioSheet.getCell(rRow, i + 2);
            const result = resultKey ? (results.ratios[i]?.[resultKey as keyof typeof results.ratios[0]] as number ?? 0) : 0;
            cell.value = { formula: formula(c, i), result: Number(result) || 0 };
            cell.numFmt = fmt;
            cell.border = BORDERS;
        }
        rRow++;
    }

    // ── Profitability ──
    ratioSheet.getCell(rRow, 1).value = '── Profitability ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Gross Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['grossProfit']}/'Income Statement'!${c}${isRows['revenue']})`,
        'grossMargin');

    addRatioRow('EBITDA Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['ebitda']}/'Income Statement'!${c}${isRows['revenue']})`,
        'ebitdaMargin');

    addRatioRow('EBIT Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['ebit']}/'Income Statement'!${c}${isRows['revenue']})`,
        'operatingMargin');

    addRatioRow('Net Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['netIncome']}/'Income Statement'!${c}${isRows['revenue']})`,
        'netMargin');

    addRatioRow('ROA', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Income Statement'!${c}${isRows['netIncome']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'roa');

    addRatioRow('ROE', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,'Income Statement'!${c}${isRows['netIncome']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        'roe');

    // ROIC = NOPAT / (Equity + Debt − Cash). NOPAT uses effective tax rate (taxExpense/EBT).
    addRatioRow('ROIC (Net IC)', (c) => {
        const eq = `'Balance Sheet'!${c}${bsRows['totalEquity']}`;
        const std = `'Balance Sheet'!${c}${bsRows['shortTermDebt']}`;
        const ltd = `'Balance Sheet'!${c}${bsRows['longTermDebt']}`;
        const cpltd = `'Balance Sheet'!${c}${bsRows['currentPortionLTD']}`;
        const cash = `'Balance Sheet'!${c}${bsRows['cash']}`;
        const ebit = `'Income Statement'!${c}${isRows['ebit']}`;
        const ebt = `'Income Statement'!${c}${isRows['ebt']}`;
        const taxExp = `'Income Statement'!${c}${isRows['taxExpense']}`;
        const ic = `(${eq}+${std}+${ltd}+${cpltd}-${cash})`;
        const effRate = `IF(${ebt}>0,${taxExp}/${ebt},0)`;
        return `IF(${ic}=0,0,(${ebit}*(1-${effRate}))/${ic})`;
    }, 'roic');

    // ── Liquidity ── (includes Quick Ratio, Cash Ratio — moved from Efficiency)
    ratioSheet.getCell(rRow, 1).value = '── Liquidity ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Current Ratio', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']}=0,0,'Balance Sheet'!${c}${bsRows['totalCurrentAssets']}/'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})`,
        'currentRatio', '#,##0.00x');

    addRatioRow('Quick Ratio', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']}=0,0,('Balance Sheet'!${c}${bsRows['totalCurrentAssets']}-'Balance Sheet'!${c}${bsRows['inventory']})/'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})`,
        'quickRatio', '#,##0.0000x');

    addRatioRow('Cash Ratio', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']}=0,0,'Balance Sheet'!${c}${bsRows['cash']}/'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})`,
        'cashRatio', '#,##0.0000x');

    addRatioRow('Total Liabilities / Equity', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,'Balance Sheet'!${c}${bsRows['totalLiabilities']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        'debtToEquity', '#,##0.00x');

    // ── Efficiency ── (Quick/Cash Ratio removed — now in Liquidity)
    ratioSheet.getCell(rRow, 1).value = '── Efficiency ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Asset Turnover', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Income Statement'!${c}${isRows['revenue']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'assetTurnover', '#,##0.00x');

    addRatioRow('Inventory Turnover (×)', (c, yr) => {
        if (yr === 0) {
            return `IF('Balance Sheet'!${c}${bsRows['inventory']}=0,0,'Income Statement'!${c}${isRows['cogs']}/'Balance Sheet'!${c}${bsRows['inventory']})`;
        }
        const pc = colLetter(yr + 1);
        return `IF(('Balance Sheet'!${pc}${bsRows['inventory']}+'Balance Sheet'!${c}${bsRows['inventory']})/2=0,0,'Income Statement'!${c}${isRows['cogs']}/(('Balance Sheet'!${pc}${bsRows['inventory']}+'Balance Sheet'!${c}${bsRows['inventory']})/2))`;
    }, 'inventoryTurnover', '#,##0.0000x');

    addRatioRow('Receivables Turnover (×)', (c, yr) => {
        if (yr === 0) {
            return `IF('Balance Sheet'!${c}${bsRows['accountsReceivable']}=0,0,'Income Statement'!${c}${isRows['revenue']}/'Balance Sheet'!${c}${bsRows['accountsReceivable']})`;
        }
        const pc = colLetter(yr + 1);
        return `IF(('Balance Sheet'!${pc}${bsRows['accountsReceivable']}+'Balance Sheet'!${c}${bsRows['accountsReceivable']})/2=0,0,'Income Statement'!${c}${isRows['revenue']}/(('Balance Sheet'!${pc}${bsRows['accountsReceivable']}+'Balance Sheet'!${c}${bsRows['accountsReceivable']})/2))`;
    }, 'receivablesTurnover', '#,##0.0000x');

    addRatioRow('DSO (Days)', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Balance Sheet'!${c}${bsRows['accountsReceivable']}/'Income Statement'!${c}${isRows['revenue']}*365)`,
        'dso', '#,##0.00');

    addRatioRow('DIO (Days)', (c) =>
        `IF('Income Statement'!${c}${isRows['cogs']}=0,0,'Balance Sheet'!${c}${bsRows['inventory']}/'Income Statement'!${c}${isRows['cogs']}*365)`,
        'dio', '#,##0.00');

    addRatioRow('DPO (Days)', (c) =>
        `IF('Income Statement'!${c}${isRows['cogs']}=0,0,'Balance Sheet'!${c}${bsRows['accountsPayable']}/'Income Statement'!${c}${isRows['cogs']}*365)`,
        'dpo', '#,##0.00');

    addRatioRow('Cash Conversion Cycle (Days)', (c) =>
        `${c}${ratioRows['dso']}+${c}${ratioRows['dio']}-${c}${ratioRows['dpo']}`,
        'cashConversionCycle', '#,##0.00');

    // ── Leverage ── (Interest Coverage moved here from Liquidity)
    ratioSheet.getCell(rRow, 1).value = '── Leverage ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Total Debt / Equity (D/E)', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']})/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        'debtToEquityFinancial', '#,##0.0000x');

    addRatioRow('Total Debt / Assets', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']})/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'debtToAssets', '#,##0.0000');

    addRatioRow('Net Debt (EGP)', (c) =>
        `('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']})-'Balance Sheet'!${c}${bsRows['cash']}`,
        'netDebt', NUM_FMT);

    addRatioRow('Net Debt / EBITDA (×)', (c) =>
        `IF('Income Statement'!${c}${isRows['ebitda']}=0,0,(('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']})-'Balance Sheet'!${c}${bsRows['cash']})/'Income Statement'!${c}${isRows['ebitda']})`,
        'netDebtToEbitda', '#,##0.0000x');

    addRatioRow('Interest Coverage (×)', (c) =>
        `IF('Income Statement'!${c}${isRows['interestExpense']}=0,0,'Income Statement'!${c}${isRows['ebit']}/'Income Statement'!${c}${isRows['interestExpense']})`,
        'interestCoverage', '#,##0.00x');

    // ── Per Share ──
    ratioSheet.getCell(rRow, 1).value = '── Per Share ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('EPS (After EPD)', (c) =>
        `'Income Statement'!${c}${isRows['eps']}`,
        'epsRatio', EPS_FMT);

    addRatioRow('Book Value Per Share (BVPS)', (c, yr) =>
        `IF(${aRef('sharesOutstanding', yr)}=0,0,'Balance Sheet'!${c}${bsRows['totalEquity']}/${aRef('sharesOutstanding', yr)})`,
        'bvps', '#,##0.0000');

    addRatioRow('Revenue Per Share', (c, yr) =>
        `IF(${aRef('sharesOutstanding', yr)}=0,0,'Income Statement'!${c}${isRows['revenue']}/${aRef('sharesOutstanding', yr)})`,
        'revenuePerShare', '#,##0.0000');

    addRatioRow('FCFF Per Share', (c, yr) =>
        `IF(${aRef('sharesOutstanding', yr)}=0,0,'Income Statement'!${c}${isRows['fcff']}/${aRef('sharesOutstanding', yr)})`,
        'fcffPerShare', '#,##0.0000');

    // ── DuPont Decomposition ── (ATO + EM use ending balances to match ROE)
    ratioSheet.getCell(rRow, 1).value = '── DuPont Decomposition ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Net Profit Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['netIncome']}/'Income Statement'!${c}${isRows['revenue']})`,
        'dupontNetMargin', PCT_FMT);

    addRatioRow('Asset Turnover', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Income Statement'!${c}${isRows['revenue']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'dupontAssetTurnover', '#,##0.0000x');

    addRatioRow('Equity Multiplier', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,'Balance Sheet'!${c}${bsRows['totalAssets']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        'dupontEquityMultiplier', '#,##0.0000x');

    addRatioRow('DuPont ROE (3-Factor)', (c) =>
        `${c}${ratioRows['dupontNetMargin']}*${c}${ratioRows['dupontAssetTurnover']}*${c}${ratioRows['dupontEquityMultiplier']}`,
        'dupontROE3F', PCT_FMT);

    addRatioRow('Tax Burden (NI / EBT)', (c) =>
        `IF('Income Statement'!${c}${isRows['ebt']}=0,0,'Income Statement'!${c}${isRows['netIncome']}/'Income Statement'!${c}${isRows['ebt']})`,
        'dupontTaxBurden', '#,##0.0000');

    addRatioRow('Interest Burden (EBT / EBIT)', (c) =>
        `IF('Income Statement'!${c}${isRows['ebit']}=0,0,'Income Statement'!${c}${isRows['ebt']}/'Income Statement'!${c}${isRows['ebit']})`,
        'dupontInterestBurden', '#,##0.0000');

    addRatioRow('Operating Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['ebit']}/'Income Statement'!${c}${isRows['revenue']})`,
        'dupontEBITMargin', PCT_FMT);

    addRatioRow('DuPont ROE (5-Factor)', (c) =>
        `${c}${ratioRows['dupontTaxBurden']}*${c}${ratioRows['dupontInterestBurden']}*${c}${ratioRows['dupontEBITMargin']}*${c}${ratioRows['dupontAssetTurnover']}*${c}${ratioRows['dupontEquityMultiplier']}`,
        'dupontROE5F', PCT_FMT);

    // ── Altman Z'-Score (Credit Risk) ──
    ratioSheet.getCell(rRow, 1).value = "── Altman Z'-Score (Credit Risk) ──";
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('X1 = Working Capital / Total Assets', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,('Balance Sheet'!${c}${bsRows['totalCurrentAssets']}-'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'altmanX1', '#,##0.0000');

    addRatioRow('X2 = Retained Earnings / Total Assets', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Balance Sheet'!${c}${bsRows['retainedEarnings']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'altmanX2', '#,##0.0000');

    addRatioRow('X3 = EBIT / Total Assets', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Income Statement'!${c}${isRows['ebit']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'altmanX3', '#,##0.0000');

    addRatioRow('X4 = Book Equity / Total Financial Debt', (c) =>
        `IF(('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']})=0,0,'Balance Sheet'!${c}${bsRows['totalEquity']}/('Balance Sheet'!${c}${bsRows['shortTermDebt']}+'Balance Sheet'!${c}${bsRows['longTermDebt']}+'Balance Sheet'!${c}${bsRows['currentPortionLTD']}))`,
        'altmanX4', '#,##0.0000');

    addRatioRow("Altman Z' Score (Emerging Markets)", (c) =>
        `6.56*${c}${ratioRows['altmanX1']}+3.26*${c}${ratioRows['altmanX2']}+6.72*${c}${ratioRows['altmanX3']}+1.05*${c}${ratioRows['altmanX4']}`,
        'altmanZEM', '#,##0.0000');

    addRatioRow('Zone', (c) =>
        `IF(${c}${ratioRows['altmanZEM']}>=2.9,"✅ Safe",IF(${c}${ratioRows['altmanZEM']}>=1.23,"⚠️ Grey","❌ Distress"))`,
        'altmanZone', '@');

    // ── Break-Even Analysis ──
    ratioSheet.getCell(rRow, 1).value = '── Break-Even Analysis ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Fixed Costs (Total OpEx)', (c) =>
        `'Income Statement'!${c}${isRows['totalOpex']}`,
        'fixedCosts', NUM_FMT);

    addRatioRow('Contribution Margin Ratio', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['grossProfit']}/'Income Statement'!${c}${isRows['revenue']})`,
        'contribMarginRatio', PCT_FMT);

    addRatioRow('Break-Even Revenue (EGP)', (c) =>
        `IF(${c}${ratioRows['contribMarginRatio']}=0,0,${c}${ratioRows['fixedCosts']}/${c}${ratioRows['contribMarginRatio']})`,
        'breakEvenRevenue', NUM_FMT);

    addRatioRow('Margin of Safety %', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,('Income Statement'!${c}${isRows['revenue']}-${c}${ratioRows['breakEvenRevenue']})/'Income Statement'!${c}${isRows['revenue']})`,
        'marginOfSafety', PCT_FMT);

    addRatioRow('Margin of Safety (EGP)', (c) =>
        `'Income Statement'!${c}${isRows['revenue']}-${c}${ratioRows['breakEvenRevenue']}`,
        'marginOfSafetyAbs', NUM_FMT);

    addRatioRow('Operating Leverage', (c) =>
        `IF('Income Statement'!${c}${isRows['ebit']}=0,0,'Income Statement'!${c}${isRows['grossProfit']}/'Income Statement'!${c}${isRows['ebit']})`,
        'operatingLeverage', '#,##0.0000x');

    applyZebraAndNegatives(ratioSheet);

    // ════════════════════════════════════════════════════════
    // HISTORICAL vs PROJECTED COLUMN STYLING (Feature 1)
    // ════════════════════════════════════════════════════════
    const HIST_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    const HIST_FONT_COLOR = { argb: 'FF1A56DB' }; // blue text
    const SEPARATOR_BORDER: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF1A56DB' } };

    function applyHistoricalStyling(sheet: ExcelJS.Worksheet, sheetNumHistorical: number, sheetTotalCols: number) {
        if (sheetNumHistorical === 0) return;
        // Column indices: 2 = first year column, sheetNumHistorical+1 = last historical column, sheetNumHistorical+2 = first projected column
        const lastHistColIdx = sheetNumHistorical + 1; // 1-based column index
        const firstProjColIdx = sheetNumHistorical + 2;

        sheet.eachRow((row, rowNumber) => {
            // Style historical columns with blue tint
            for (let col = 2; col <= lastHistColIdx; col++) {
                const cell = row.getCell(col);
                if (rowNumber === 1) {
                    // Header row: keep dark bg but add blue text
                    cell.font = { ...WHITE_FONT, color: { argb: 'FF93C5FD' } };
                } else {
                    // Data rows: light blue bg + blue font
                    cell.fill = HIST_BG;
                    cell.font = { ...(cell.font || {}), color: HIST_FONT_COLOR };
                }
            }
            // Add thick right border on last historical column for separator
            if (lastHistColIdx >= 2 && firstProjColIdx <= sheetTotalCols + 1) {
                const lastHistCell = row.getCell(lastHistColIdx);
                lastHistCell.border = {
                    ...(lastHistCell.border || BORDERS),
                    right: SEPARATOR_BORDER,
                };
            }
        });

        // Add Actual/Estimate label to header row
        // Period strings already contain "E" suffix for projected, so only add "(A)" for historical
        for (let i = 0; i < sheetTotalCols; i++) {
            const cell = sheet.getCell(1, i + 2);
            const currentVal = String(cell.value ?? '');
            if (i < sheetNumHistorical) {
                // Historical: append "(A)" if not already present
                if (!currentVal.includes('(A)')) {
                    cell.value = currentVal + ' (A)';
                }
            } else {
                // Projected: append "(E)" only if the period doesn't already end with "E" or "(E)"
                if (!currentVal.includes('(E)') && !currentVal.endsWith('E')) {
                    cell.value = currentVal + ' (E)';
                }
                // If period already has "E" (e.g. "2025E"), don't add "(E)" — it's clear enough
            }
        }
    }

    // Apply to all statement sheets with correct per-sheet historical counts
    applyHistoricalStyling(isSheet, numHistorical, nYears);
    applyHistoricalStyling(bsSheet, numHistorical, nYears);
    applyHistoricalStyling(cfSheet, numHistoricalCF, nCF);
    applyHistoricalStyling(ratioSheet, numHistorical, nYears);

    // ════════════════════════════════════════════════════════
    // TAB 6 — WORKING CAPITAL SCHEDULE  (live formulas)
    // ════════════════════════════════════════════════════════
    const wcSheet = workbook.addWorksheet('Working Capital');
    wcSheet.properties.tabColor = { argb: 'FFED7D31' }; // Orange
    wcSheet.getColumn(1).width = 35;
    for (let i = 0; i < nYears; i++) wcSheet.getColumn(i + 2).width = 18;
    wcSheet.getCell(1, 1).value = companyName + ' — Working Capital Schedule';
    for (let i = 0; i < nYears; i++) wcSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(wcSheet);

    const wcRows: Record<string, number> = {};
    let wcRow = 2;

    function addWCRow(label: string, key: string, opts: {
        formula?: (c: string, yr: number) => string;
        value?: (yr: number) => number;
        bold?: boolean; subheader?: boolean; numFmt?: string;
    }) {
        wcRows[key] = wcRow;
        wcSheet.getCell(wcRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = wcSheet.getCell(wcRow, i + 2);
            const raw = opts.value?.(i) ?? 0;
            if (opts.formula) {
                cell.value = { formula: opts.formula(c, i), result: Number(raw) || 0 };
            } else {
                cell.value = Number(raw) || 0;
            }
            cell.numFmt = opts.numFmt ?? NUM_FMT;
        }
        styleRow(wcSheet.getRow(wcRow), { bold: opts.bold, subheader: opts.subheader });
        wcRow++;
    }

    // Efficiency ratios
    wcSheet.getCell(wcRow, 1).value = 'EFFICIENCY METRICS';
    styleRow(wcSheet.getRow(wcRow), { subheader: true }); wcRow++;

    addWCRow('  Days Sales Outstanding (DSO)', 'dso', {
        formula: (c) => `Assumptions!${c}${aRows['dso']}`,
        value: yr => results.ratios[yr]?.dso ?? 0,
        numFmt: '0.0',
    });
    addWCRow('  Days Inventory Outstanding (DIO)', 'dio', {
        formula: (c) => `Assumptions!${c}${aRows['dio']}`,
        value: yr => results.ratios[yr]?.dio ?? 0,
        numFmt: '0.0',
    });
    addWCRow('  Days Payables Outstanding (DPO)', 'dpo', {
        formula: (c) => `Assumptions!${c}${aRows['dpo']}`,
        value: yr => results.ratios[yr]?.dpo ?? 0,
        numFmt: '0.0',
    });
    addWCRow('Cash Conversion Cycle (days)', 'ccc', {
        formula: (c) => `${c}${wcRows['dso']}+${c}${wcRows['dio']}-${c}${wcRows['dpo']}`,
        value: yr => results.ratios[yr]?.cashConversionCycle ?? 0,
        bold: true, numFmt: '0.0',
    });

    wcSheet.getCell(wcRow, 1).value = ''; wcRow++;

    wcSheet.getCell(wcRow, 1).value = 'CURRENT ASSETS (excl. Cash)';
    styleRow(wcSheet.getRow(wcRow), { subheader: true }); wcRow++;

    addWCRow('  Accounts Receivable', 'ar', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['accountsReceivable']}`,
        value: yr => results.balanceSheets[yr]?.accountsReceivable ?? 0,
    });
    addWCRow('  Inventory', 'inv', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['inventory']}`,
        value: yr => results.balanceSheets[yr]?.inventory ?? 0,
    });
    addWCRow('  Prepaid Expenses', 'prepaid', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['prepaidExpenses']}`,
        value: yr => results.balanceSheets[yr]?.prepaidExpenses ?? 0,
    });
    addWCRow('  Other Current Assets', 'oca', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['otherCurrentAssets']}`,
        value: yr => results.balanceSheets[yr]?.otherCurrentAssets ?? 0,
    });

    wcSheet.getCell(wcRow, 1).value = ''; wcRow++;
    wcSheet.getCell(wcRow, 1).value = 'CURRENT LIABILITIES (excl. Debt)';
    styleRow(wcSheet.getRow(wcRow), { subheader: true }); wcRow++;

    addWCRow('  Accounts Payable', 'ap', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['accountsPayable']}`,
        value: yr => results.balanceSheets[yr]?.accountsPayable ?? 0,
    });
    addWCRow('  Accrued Expenses', 'accExp', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['accruedExpenses']}`,
        value: yr => results.balanceSheets[yr]?.accruedExpenses ?? 0,
    });
    addWCRow('  Deferred Revenue', 'defRev', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['deferredRevenue']}`,
        value: yr => results.balanceSheets[yr]?.deferredRevenue ?? 0,
    });
    addWCRow('  Other Current Liabilities', 'ocl', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['otherCurrentLiabilities']}`,
        value: yr => results.balanceSheets[yr]?.otherCurrentLiabilities ?? 0,
    });

    wcSheet.getCell(wcRow, 1).value = ''; wcRow++;

    addWCRow('Net Working Capital', 'nwc', {
        formula: (c) => `(${c}${wcRows['ar']}+${c}${wcRows['inv']}+${c}${wcRows['prepaid']}+${c}${wcRows['oca']})-(${c}${wcRows['ap']}+${c}${wcRows['accExp']}+${c}${wcRows['defRev']}+${c}${wcRows['ocl']})`,
        value: yr => {
            const b = results.balanceSheets[yr];
            return (b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets)
                - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.otherCurrentLiabilities);
        },
        bold: true,
    });
    addWCRow('NWC Change', 'nwcChange', {
        formula: (c, yr) => {
            if (yr === 0) return '0';
            const prevC = colLetter(yr + 1);
            return `${c}${wcRows['nwc']}-${prevC}${wcRows['nwc']}`;
        },
        value: yr => {
            if (yr === 0) return 0;
            const b = results.balanceSheets[yr]; const pb = results.balanceSheets[yr - 1];
            const nwc = (b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.otherCurrentLiabilities);
            const pnwc = (pb.accountsReceivable + pb.inventory + pb.prepaidExpenses + pb.otherCurrentAssets) - (pb.accountsPayable + pb.accruedExpenses + pb.deferredRevenue + pb.otherCurrentLiabilities);
            return nwc - pnwc;
        },
    });
    addWCRow('NWC % of Revenue', 'nwcPctRev', {
        formula: (c) => `IF('Income Statement'!${c}${isRows['revenue']}=0,0,${c}${wcRows['nwc']}/'Income Statement'!${c}${isRows['revenue']})`,
        value: yr => {
            const b = results.balanceSheets[yr];
            const nwc = (b.accountsReceivable + b.inventory + b.prepaidExpenses + b.otherCurrentAssets) - (b.accountsPayable + b.accruedExpenses + b.deferredRevenue + b.otherCurrentLiabilities);
            return results.incomeStatements[yr].revenue !== 0 ? nwc / results.incomeStatements[yr].revenue : 0;
        },
        numFmt: PCT_FMT,
    });

    applyHistoricalStyling(wcSheet, numHistorical, nYears);

    // ════════════════════════════════════════════════════════
    // TAB 7 — DEPRECIATION SCHEDULE  (live formulas)
    // ════════════════════════════════════════════════════════
    const depSheet = workbook.addWorksheet('Depreciation Schedule');
    depSheet.properties.tabColor = { argb: 'FF8B4513' }; // Brown
    depSheet.getColumn(1).width = 35;
    for (let i = 0; i < nYears; i++) depSheet.getColumn(i + 2).width = 18;
    depSheet.getCell(1, 1).value = companyName + ' — PP&E Rollforward';
    for (let i = 0; i < nYears; i++) depSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(depSheet);

    const depRows: Record<string, number> = {};
    let depRow = 2;

    function addDepRow(label: string, key: string, opts: {
        formula?: (c: string, yr: number) => string | null;
        value?: (yr: number) => number | null;
        bold?: boolean; subheader?: boolean; numFmt?: string;
    }) {
        depRows[key] = depRow;
        depSheet.getCell(depRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = depSheet.getCell(depRow, i + 2);
            const raw = opts.value?.(i);
            const f = opts.formula?.(c, i);
            if (f !== null && f !== undefined && opts.formula) {
                cell.value = { formula: f, result: Number(raw) || 0 };
            } else {
                cell.value = raw !== null && raw !== undefined ? Number(raw) || 0 : '';
            }
            cell.numFmt = opts.numFmt ?? NUM_FMT;
        }
        styleRow(depSheet.getRow(depRow), { bold: opts.bold, subheader: opts.subheader });
        depRow++;
    }

    depSheet.getCell(depRow, 1).value = 'GROSS PP&E';
    styleRow(depSheet.getRow(depRow), { subheader: true }); depRow++;

    addDepRow('  Beginning Gross PP&E', 'begGrossPPE', {
        formula: (c, yr) => {
            if (yr === 0) return null; // no prior period
            const prevC = colLetter(yr + 1);
            return `'Balance Sheet'!${prevC}${bsRows['grossPPE']}`;
        },
        value: yr => yr === 0 ? null : results.balanceSheets[yr - 1]?.grossPPE ?? 0,
    });
    addDepRow('  (+) Capital Expenditures', 'capex', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            return `ABS('Income Statement'!${c}${isRows['revenue']}*Assumptions!${c}${aRows['capexPercent']})`;
        },
        value: yr => {
            if (yr === 0) return null;
            const cfIdx = yr - 1;
            return cfIdx < results.cashFlowStatements.length ? Math.abs(results.cashFlowStatements[cfIdx].capex) : 0;
        },
    });
    addDepRow('Ending Gross PP&E', 'endGrossPPE', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['grossPPE']}`,
        value: yr => results.balanceSheets[yr]?.grossPPE ?? 0,
        bold: true,
    });

    depSheet.getCell(depRow, 1).value = ''; depRow++;
    depSheet.getCell(depRow, 1).value = 'ACCUMULATED DEPRECIATION';
    styleRow(depSheet.getRow(depRow), { subheader: true }); depRow++;

    addDepRow('  Beginning Accum. Depreciation', 'begAccumDep', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            const prevC = colLetter(yr + 1);
            return `'Balance Sheet'!${prevC}${bsRows['accumulatedDepreciation']}`;
        },
        value: yr => yr === 0 ? null : results.balanceSheets[yr - 1]?.accumulatedDepreciation ?? 0,
    });
    addDepRow('  (+) Depreciation Expense', 'depExpense', {
        formula: (c) => `'Income Statement'!${c}${isRows['depreciation']}`,
        value: yr => results.incomeStatements[yr]?.depreciation ?? 0,
    });
    addDepRow('Ending Accum. Depreciation', 'endAccumDep', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['accumulatedDepreciation']}`,
        value: yr => results.balanceSheets[yr]?.accumulatedDepreciation ?? 0,
        bold: true,
    });

    depSheet.getCell(depRow, 1).value = ''; depRow++;
    addDepRow('Net PP&E', 'netPPE', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['netPPE']}`,
        value: yr => results.balanceSheets[yr]?.netPPE ?? 0,
        bold: true,
    });

    depSheet.getCell(depRow, 1).value = ''; depRow++;
    depSheet.getCell(depRow, 1).value = 'KEY METRICS';
    styleRow(depSheet.getRow(depRow), { subheader: true }); depRow++;

    addDepRow('CapEx % of Revenue', 'capexPctRev', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            return `IF('Income Statement'!${c}${isRows['revenue']}=0,0,${c}${depRows['capex']}/'Income Statement'!${c}${isRows['revenue']})`;
        },
        value: yr => {
            if (yr === 0) return null;
            const cfIdx = yr - 1;
            const capex = cfIdx < results.cashFlowStatements.length ? Math.abs(results.cashFlowStatements[cfIdx].capex) : 0;
            return results.incomeStatements[yr].revenue !== 0 ? capex / results.incomeStatements[yr].revenue : 0;
        },
        numFmt: PCT_FMT,
    });
    addDepRow('Depreciation Rate (% Gross PP&E)', 'depRate', {
        formula: (c) => `IF(${c}${depRows['endGrossPPE']}=0,0,${c}${depRows['depExpense']}/${c}${depRows['endGrossPPE']})`,
        value: yr => results.balanceSheets[yr].grossPPE !== 0 ? results.incomeStatements[yr].depreciation / results.balanceSheets[yr].grossPPE : 0,
        numFmt: PCT_FMT,
    });
    addDepRow('Implied Useful Life (yrs)', 'usefulLife', {
        formula: (c) => `IF(${c}${depRows['depRate']}=0,0,1/${c}${depRows['depRate']})`,
        value: yr => {
            const r = results.balanceSheets[yr].grossPPE !== 0 ? results.incomeStatements[yr].depreciation / results.balanceSheets[yr].grossPPE : 0;
            return r !== 0 ? 1 / r : 0;
        },
        numFmt: '0.0',
    });

    depSheet.getCell(depRow, 1).value = ''; depRow++;
    depSheet.getCell(depRow, 1).value = 'INTANGIBLES';
    styleRow(depSheet.getRow(depRow), { subheader: true }); depRow++;

    addDepRow('  Amortization Expense', 'amort', {
        formula: (c) => `'Income Statement'!${c}${isRows['amortization']}`,
        value: yr => results.incomeStatements[yr]?.amortization ?? 0,
    });
    addDepRow('Net Intangibles', 'netIntangibles', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['intangibles']}`,
        value: yr => results.balanceSheets[yr]?.intangibles ?? 0,
        bold: true,
    });

    applyHistoricalStyling(depSheet, numHistorical, nYears);

    // ════════════════════════════════════════════════════════
    // TAB 8 — DEBT SCHEDULE  (live formulas)
    // ════════════════════════════════════════════════════════
    const debtSheet = workbook.addWorksheet('Debt Schedule');
    debtSheet.properties.tabColor = { argb: 'FFFF0000' }; // Red
    debtSheet.getColumn(1).width = 38;
    for (let i = 0; i < nYears; i++) debtSheet.getColumn(i + 2).width = 18;
    debtSheet.getCell(1, 1).value = companyName + ' — Debt Schedule';
    for (let i = 0; i < nYears; i++) debtSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
    styleHeader(debtSheet);

    const dbtRows: Record<string, number> = {};
    let dbtRow = 2;

    function addDebtRow(label: string, key: string, opts: {
        formula?: (c: string, yr: number) => string | null;
        value?: (yr: number) => number | null;
        bold?: boolean; subheader?: boolean; numFmt?: string;
    }) {
        dbtRows[key] = dbtRow;
        debtSheet.getCell(dbtRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = debtSheet.getCell(dbtRow, i + 2);
            const raw = opts.value?.(i);
            const f = opts.formula?.(c, i);
            if (f !== null && f !== undefined && opts.formula) {
                cell.value = { formula: f, result: Number(raw) || 0 };
            } else {
                cell.value = raw !== null && raw !== undefined ? Number(raw) || 0 : '';
            }
            cell.numFmt = opts.numFmt ?? NUM_FMT;
        }
        styleRow(debtSheet.getRow(dbtRow), { bold: opts.bold, subheader: opts.subheader });
        dbtRow++;
    }

    debtSheet.getCell(dbtRow, 1).value = 'LONG-TERM DEBT ROLLFORWARD';
    styleRow(debtSheet.getRow(dbtRow), { subheader: true }); dbtRow++;

    addDebtRow('  Beginning Long-Term Debt', 'begLTD', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            const prevC = colLetter(yr + 1);
            return `'Balance Sheet'!${prevC}${bsRows['longTermDebt']}`;
        },
        value: yr => yr === 0 ? null : results.balanceSheets[yr - 1]?.longTermDebt ?? 0,
    });
    addDebtRow('  (+) New Issuance', 'debtIss', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            return `Assumptions!${c}${aRows['longTermDebtIssuance']}`;
        },
        value: yr => {
            const cfIdx = yr - 1;
            return cfIdx >= 0 && cfIdx < results.cashFlowStatements.length ? results.cashFlowStatements[cfIdx].debtIssuance : null;
        },
    });
    addDebtRow('  (-) Repayments', 'debtRep', {
        formula: (c, yr) => {
            if (yr === 0) return null;
            return `-ABS(Assumptions!${c}${aRows['longTermDebtRepayment']})`;
        },
        value: yr => {
            const cfIdx = yr - 1;
            return cfIdx >= 0 && cfIdx < results.cashFlowStatements.length ? results.cashFlowStatements[cfIdx].debtRepayment : null;
        },
    });
    addDebtRow('Ending Long-Term Debt', 'endLTD', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['longTermDebt']}`,
        value: yr => results.balanceSheets[yr]?.longTermDebt ?? 0,
        bold: true,
    });

    debtSheet.getCell(dbtRow, 1).value = ''; dbtRow++;
    debtSheet.getCell(dbtRow, 1).value = 'DEBT SUMMARY';
    styleRow(debtSheet.getRow(dbtRow), { subheader: true }); dbtRow++;

    addDebtRow('  Short-Term Debt', 'stDebt', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['shortTermDebt']}`,
        value: yr => results.balanceSheets[yr]?.shortTermDebt ?? 0,
    });
    addDebtRow('  Current Portion of LTD', 'cpltd', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['currentPortionLTD']}`,
        value: yr => results.balanceSheets[yr]?.currentPortionLTD ?? 0,
    });
    addDebtRow('  Long-Term Debt', 'ltdSummary', {
        formula: (c) => `'Balance Sheet'!${c}${bsRows['longTermDebt']}`,
        value: yr => results.balanceSheets[yr]?.longTermDebt ?? 0,
    });
    addDebtRow('Total Debt', 'totalDebt', {
        formula: (c) => `${c}${dbtRows['stDebt']}+${c}${dbtRows['cpltd']}+${c}${dbtRows['ltdSummary']}`,
        value: yr => {
            const b = results.balanceSheets[yr];
            return b.shortTermDebt + b.longTermDebt + b.currentPortionLTD;
        },
        bold: true,
    });

    debtSheet.getCell(dbtRow, 1).value = ''; dbtRow++;
    debtSheet.getCell(dbtRow, 1).value = 'INTEREST ANALYSIS';
    styleRow(debtSheet.getRow(dbtRow), { subheader: true }); dbtRow++;

    addDebtRow('  Beginning-of-Period Debt Balance', 'avgDebt', {
        formula: (c, yr) => {
            if (yr === 0) return `${c}${dbtRows['totalDebt']}`;
            const prevC = colLetter(yr + 1);
            return `(${c}${dbtRows['totalDebt']}+${prevC}${dbtRows['totalDebt']})/2`;
        },
        value: yr => {
            const b = results.balanceSheets[yr];
            const td = b.shortTermDebt + b.longTermDebt + b.currentPortionLTD;
            if (yr === 0) return td;
            const pb = results.balanceSheets[yr - 1];
            const ptd = pb.shortTermDebt + pb.longTermDebt + pb.currentPortionLTD;
            return (td + ptd) / 2;
        },
    });
    addDebtRow('  Interest Expense', 'intExp', {
        formula: (c) => `'Income Statement'!${c}${isRows['interestExpense']}`,
        value: yr => results.incomeStatements[yr]?.interestExpense ?? 0,
    });
    addDebtRow('  Interest Income', 'intInc', {
        formula: (c) => `'Income Statement'!${c}${isRows['interestIncome']}`,
        value: yr => results.incomeStatements[yr]?.interestIncome ?? 0,
    });
    addDebtRow('Net Interest', 'netInt', {
        formula: (c) => `${c}${dbtRows['intExp']}-${c}${dbtRows['intInc']}`,
        value: yr => results.incomeStatements[yr].interestExpense - results.incomeStatements[yr].interestIncome,
        bold: true,
    });

    debtSheet.getCell(dbtRow, 1).value = ''; dbtRow++;
    debtSheet.getCell(dbtRow, 1).value = 'LEVERAGE RATIOS';
    styleRow(debtSheet.getRow(dbtRow), { subheader: true }); dbtRow++;

    addDebtRow('Interest Coverage (EBIT / Int Exp)', 'intCoverage', {
        formula: (c) => `IF(${c}${dbtRows['intExp']}=0,0,'Income Statement'!${c}${isRows['ebit']}/${c}${dbtRows['intExp']})`,
        value: yr => results.ratios[yr]?.interestCoverage ?? 0,
        numFmt: '0.0"x"',
    });
    addDebtRow('Debt / Equity', 'debtEquity', {
        formula: (c) => `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,${c}${dbtRows['totalDebt']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        value: yr => results.ratios[yr]?.debtToEquity ?? 0,
        numFmt: '0.00"x"',
    });
    addDebtRow('Debt / Total Assets', 'debtAssets', {
        formula: (c) => `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,${c}${dbtRows['totalDebt']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        value: yr => results.ratios[yr]?.debtToAssets ?? 0,
        numFmt: '0.00"x"',
    });
    addDebtRow('Debt / EBITDA', 'debtEbitda', {
        formula: (c) => `IF('Income Statement'!${c}${isRows['ebitda']}=0,0,${c}${dbtRows['totalDebt']}/'Income Statement'!${c}${isRows['ebitda']})`,
        value: yr => results.incomeStatements[yr].ebitda !== 0
            ? (results.balanceSheets[yr].shortTermDebt + results.balanceSheets[yr].longTermDebt + results.balanceSheets[yr].currentPortionLTD) / results.incomeStatements[yr].ebitda
            : 0,
        numFmt: '0.00"x"',
    });

    applyHistoricalStyling(debtSheet, numHistorical, nYears);

    const allSheets = [aSheet, isSheet, bsSheet, cfSheet, ratioSheet, wcSheet, depSheet, debtSheet];

    // ════════════════════════════════════════════════════════
    // DASHBOARD  (cross-sheet formula references)
    // ════════════════════════════════════════════════════════
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const dashSheet = buildDashboardSheet(
        workbook,
        companyName,
        periods,
        results,
        { isRows, bsRows, cfRows, ratioRows, dbtRows },
        scenarioRows,
        numHistorical,
    );

    // ════════════════════════════════════════════════════════
    // SCENARIO WIRING — ALL Assumptions rows → Scenarios sheet
    // ════════════════════════════════════════════════════════
    // For EVERY assumption + engine-computed row, replace projection cells
    // with IF(scenario="Base Case", Scenarios!..., IF(...)) formulas.
    // Historical columns are NOT wired — they stay the same across scenarios.
    const scenarioControlRow = aRow + 2;
    aSheet.mergeCells(aRow + 1, 1, aRow + 1, nYears + 1);
    aSheet.getCell(aRow + 1, 1).value = '── SCENARIO CONTROL ──';
    aSheet.getCell(aRow + 1, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    aSheet.getCell(aRow + 1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    aSheet.getCell(aRow + 1, 1).alignment = { horizontal: 'center' };

    aSheet.getCell(scenarioControlRow, 1).value = 'Active Scenario';
    aSheet.getCell(scenarioControlRow, 1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F3864' } };
    aSheet.getCell(scenarioControlRow, 2).value = { formula: "Dashboard!B6", result: 'Base Case' };
    aSheet.getCell(scenarioControlRow, 2).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFB7791F' } };
    aSheet.mergeCells(scenarioControlRow, 2, scenarioControlRow, nYears + 1);

    aSheet.getCell(scenarioControlRow + 1, 1).value = '⚠ Change scenario via Dashboard!B6 dropdown only.';
    aSheet.getCell(scenarioControlRow + 1, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FFB7791F' } };
    aSheet.mergeCells(scenarioControlRow + 1, 1, scenarioControlRow + 1, nYears + 1);

    // Wire ALL assumption + computed rows for projection columns
    const scenCtrlRef = `Assumptions!$${colLetter(2)}$${scenarioControlRow}`;
    const nProj = nYears - numHistorical;

    for (const spec of ROW_SPECS) {
        const aRowNum = aRows[spec.key];
        if (!aRowNum) continue;

        const baseRow = scenarioRows[`Base Case_${spec.key}`];
        const optRow = scenarioRows[`Optimistic_${spec.key}`];
        const consRow = scenarioRows[`Conservative_${spec.key}`];
        if (!baseRow || !optRow || !consRow) continue;

        for (let pi = 0; pi < nProj; pi++) {
            const yearIdx = numHistorical + pi;      // 0-based year index
            const cellCol = yearIdx + 2;              // Excel column (1-based)
            const scenCol = colLetter(yearIdx + 2);   // Scenarios col matches periods

            const formula = `IF(${scenCtrlRef}="Base Case",Scenarios!${scenCol}${baseRow},IF(${scenCtrlRef}="Optimistic",Scenarios!${scenCol}${optRow},Scenarios!${scenCol}${consRow}))`;
            const cell = aSheet.getCell(aRowNum, cellCol);
            const currentVal = cell.value;
            const numResult = typeof currentVal === 'number' ? currentVal : 0;
            cell.value = { formula, result: numResult };
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF004400' } }; // dark green
        }
    }

    // ════════════════════════════════════════════════════════
    // DCF VALUATION SHEET
    // ════════════════════════════════════════════════════════
    {
        const dcfSheet = workbook.addWorksheet('DCF Valuation');
        dcfSheet.getColumn(1).width = 30;
        for (let i = 2; i <= 12; i++) dcfSheet.getColumn(i).width = 16;

        let dRow = 1;
        dcfSheet.getCell(dRow, 1).value = companyName + ' — DCF Valuation';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        dcfSheet.getCell(dRow, 1).fill = DARK_BG;
        dcfSheet.mergeCells(dRow, 1, dRow, 8);
        dRow += 2;

        // ── WACC Inputs ──
        dcfSheet.getCell(dRow, 1).value = '── WACC Calculation ──';
        styleRow(dcfSheet.getRow(dRow), { subheader: true });
        dRow++;

        const riskFreeRate = assumptions.riskFreeRate ?? 0.235;
        const erp = assumptions.equityRiskPremium ?? 0.07;
        const beta = assumptions.beta ?? 1.0;
        const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
        const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
        const projIdx = nYears - numHistorical - 1;
        const debtRate = assumptions.interestRateOnDebt?.[Math.max(0, projIdx)] ?? 0.18;
        const taxRate = lastIS?.taxRate ?? 0.225;
        const totalDebtVal = (lastBS?.shortTermDebt ?? 0) + (lastBS?.longTermDebt ?? 0) + (lastBS?.currentPortionLTD ?? 0);
        const totalEquityVal = Math.max(lastBS?.totalEquity ?? 1, 1);
        const totalCapital = totalDebtVal + totalEquityVal;

        const dcfRows: Record<string, number> = {};
        const addDCFInput = (label: string, key: string, value: number, fmt: string = PCT_FMT) => {
            dcfRows[key] = dRow;
            dcfSheet.getCell(dRow, 1).value = label;
            dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10 };
            const cell = dcfSheet.getCell(dRow, 2);
            cell.value = value;
            cell.numFmt = fmt;
            cell.border = BORDERS;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; // light yellow = editable
            dRow++;
        };

        addDCFInput('Risk-Free Rate (12M T-Bill)', 'rf', riskFreeRate);
        addDCFInput('Equity Risk Premium', 'erp', erp);
        addDCFInput('Beta (β)', 'beta', beta, '0.00');
        addDCFInput('Cost of Debt (pre-tax)', 'kd_pre', debtRate);
        addDCFInput('Tax Rate', 'tax', taxRate);
        addDCFInput('Debt Weight', 'wd', totalDebtVal / totalCapital);
        addDCFInput('Equity Weight', 'we', totalEquityVal / totalCapital);
        addDCFInput('Terminal Growth Rate', 'g', assumptions.terminalGrowthRate ?? 0.05);

        // Computed WACC lines
        dcfRows['ke'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'Cost of Equity (CAPM)';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold: true };
        const keC = colLetter(2);
        dcfSheet.getCell(dRow, 2).value = { formula: `${keC}${dcfRows['rf']}+${keC}${dcfRows['beta']}*${keC}${dcfRows['erp']}`, result: riskFreeRate + beta * erp };
        dcfSheet.getCell(dRow, 2).numFmt = PCT_FMT;
        dcfSheet.getCell(dRow, 2).border = BORDERS;
        dRow++;

        dcfRows['kd'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'Cost of Debt (after-tax)';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold: true };
        dcfSheet.getCell(dRow, 2).value = { formula: `${keC}${dcfRows['kd_pre']}*(1-${keC}${dcfRows['tax']})`, result: debtRate * (1 - taxRate) };
        dcfSheet.getCell(dRow, 2).numFmt = PCT_FMT;
        dcfSheet.getCell(dRow, 2).border = BORDERS;
        dRow++;

        dcfRows['wacc'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'WACC';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 11, bold: true };
        dcfSheet.getCell(dRow, 2).value = {
            formula: `${keC}${dcfRows['we']}*${keC}${dcfRows['ke']}+${keC}${dcfRows['wd']}*${keC}${dcfRows['kd']}`,
            result: (totalEquityVal / totalCapital) * (riskFreeRate + beta * erp) + (totalDebtVal / totalCapital) * debtRate * (1 - taxRate),
        };
        dcfSheet.getCell(dRow, 2).numFmt = PCT_FMT;
        dcfSheet.getCell(dRow, 2).font = { name: 'Calibri', size: 11, bold: true };
        dcfSheet.getCell(dRow, 2).border = BORDERS;
        dRow += 2;

        // ── FCF Projections ──
        dcfSheet.getCell(dRow, 1).value = '── FCF Projections ──';
        styleRow(dcfSheet.getRow(dRow), { subheader: true });
        dRow++;

        // Headers for projected periods
        const projPeriods = periods.slice(numHistorical);
        const nProj2 = projPeriods.length;
        dcfSheet.getCell(dRow, 1).value = 'Period';
        for (let p = 0; p < nProj2; p++) dcfSheet.getCell(dRow, p + 2).value = projPeriods[p];
        styleRow(dcfSheet.getRow(dRow), { bold: true });
        dRow++;

        // Fix 1 (S20): Use FCFF (unlevered) from IS, not levered FCF from CFS
        const projISs = results.incomeStatements.slice(numHistorical);
        dcfRows['fcf'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'FCFF (Unlevered Free Cash Flow)';
        for (let p = 0; p < nProj2 && p < projISs.length; p++) {
            dcfSheet.getCell(dRow, p + 2).value = projISs[p]?.fcff ?? 0;
            dcfSheet.getCell(dRow, p + 2).numFmt = NUM_FMT;
            dcfSheet.getCell(dRow, p + 2).border = BORDERS;
        }
        dRow++;

        // Discount factors
        dcfRows['df'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'Discount Factor';
        for (let p = 0; p < nProj2; p++) {
            const c = colLetter(p + 2);
            dcfSheet.getCell(dRow, p + 2).value = { formula: `1/(1+${keC}${dcfRows['wacc']})^${p + 1}`, result: 1 / Math.pow(1 + (riskFreeRate + beta * erp) * (totalEquityVal / totalCapital) + debtRate * (1 - taxRate) * (totalDebtVal / totalCapital), p + 1) };
            dcfSheet.getCell(dRow, p + 2).numFmt = '0.0000';
            dcfSheet.getCell(dRow, p + 2).border = BORDERS;
        }
        dRow++;

        // PV of FCFs
        dcfRows['pvfcf'] = dRow;
        dcfSheet.getCell(dRow, 1).value = 'PV of FCF';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold: true };
        for (let p = 0; p < nProj2; p++) {
            const c = colLetter(p + 2);
            dcfSheet.getCell(dRow, p + 2).value = { formula: `${c}${dcfRows['fcf']}*${c}${dcfRows['df']}`, result: (projISs[p]?.fcff ?? 0) / Math.pow(1.1, p + 1) };
            dcfSheet.getCell(dRow, p + 2).numFmt = NUM_FMT;
            dcfSheet.getCell(dRow, p + 2).border = BORDERS;
        }
        dRow += 2;

        // ── Terminal Value & Equity Bridge ──
        dcfSheet.getCell(dRow, 1).value = '── Valuation Summary ──';
        styleRow(dcfSheet.getRow(dRow), { subheader: true });
        dRow++;

        const lastFCFCol = colLetter(nProj2 + 1);
        const addBridgeRow = (label: string, key: string, formula: string, result: number, bold = false) => {
            dcfRows[key] = dRow;
            dcfSheet.getCell(dRow, 1).value = label;
            dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold };
            dcfSheet.getCell(dRow, 2).value = { formula, result };
            dcfSheet.getCell(dRow, 2).numFmt = NUM_FMT;
            dcfSheet.getCell(dRow, 2).border = BORDERS;
            if (bold) dcfSheet.getCell(dRow, 2).font = { name: 'Calibri', size: 11, bold: true };
            dRow++;
        };

        const waccEst = (totalEquityVal / totalCapital) * (riskFreeRate + beta * erp) + (totalDebtVal / totalCapital) * debtRate * (1 - taxRate);
        const lastFCF = projISs[projISs.length - 1]?.fcff ?? 0;
        const termGrowth = assumptions.terminalGrowthRate ?? 0.05;
        const tv = waccEst > termGrowth ? (lastFCF * (1 + termGrowth)) / (waccEst - termGrowth) : 0;
        const pvTV = tv / Math.pow(1 + waccEst, nProj2);
        const sumPVFCF = projISs.reduce((sum: number, isp: typeof projISs[0], i: number) => sum + (isp?.fcff ?? 0) / Math.pow(1 + waccEst, i + 1), 0);
        const ev = sumPVFCF + pvTV;
        const netDebtVal = totalDebtVal - (lastBS?.cash ?? 0);
        const equityVal = ev - netDebtVal;
        const shares = lastIS?.sharesOutstanding ?? 1;

        addBridgeRow('Terminal Value', 'tv', `${lastFCFCol}${dcfRows['fcf']}*(1+${keC}${dcfRows['g']})/(${keC}${dcfRows['wacc']}-${keC}${dcfRows['g']})`, tv);
        addBridgeRow('PV of Terminal Value', 'pvtv', `${keC}${dcfRows['tv']}/(1+${keC}${dcfRows['wacc']})^${nProj2}`, pvTV);
        addBridgeRow('Sum of PV(FCF)', 'sumpv', `SUM(${colLetter(2)}${dcfRows['pvfcf']}:${lastFCFCol}${dcfRows['pvfcf']})`, sumPVFCF);
        addBridgeRow('Enterprise Value', 'ev', `${keC}${dcfRows['pvtv']}+${keC}${dcfRows['sumpv']}`, ev, true);
        addBridgeRow('Less: Net Debt', 'nd', String(netDebtVal), netDebtVal);
        addBridgeRow('Equity Value', 'eqv', `${keC}${dcfRows['ev']}-${keC}${dcfRows['nd']}`, equityVal, true);
        addBridgeRow('Shares Outstanding', 'shares', String(shares), shares);
        addBridgeRow('Implied Share Price', 'price', `${keC}${dcfRows['eqv']}/${keC}${dcfRows['shares']}`, equityVal / shares, true);
        dRow++;

        // ── 5×5 Sensitivity Table (WACC × Terminal Growth) ──
        dcfSheet.getCell(dRow, 1).value = '── Sensitivity: WACC × Terminal Growth ──';
        styleRow(dcfSheet.getRow(dRow), { subheader: true });
        dRow++;

        const waccSteps = [-0.02, -0.01, 0, 0.01, 0.02];
        const growthSteps = [-0.02, -0.01, 0, 0.01, 0.02];
        dcfSheet.getCell(dRow, 1).value = 'Implied Share Price';
        dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold: true, italic: true };
        for (let g = 0; g < growthSteps.length; g++) {
            const gVal = termGrowth + growthSteps[g];
            dcfSheet.getCell(dRow, g + 2).value = gVal;
            dcfSheet.getCell(dRow, g + 2).numFmt = '0.00%';
            dcfSheet.getCell(dRow, g + 2).font = { name: 'Calibri', size: 10, bold: true };
            dcfSheet.getCell(dRow, g + 2).border = BORDERS;
        }
        dRow++;

        for (let w = 0; w < waccSteps.length; w++) {
            const wVal = waccEst + waccSteps[w];
            dcfSheet.getCell(dRow, 1).value = wVal;
            dcfSheet.getCell(dRow, 1).numFmt = '0.00%';
            dcfSheet.getCell(dRow, 1).font = { name: 'Calibri', size: 10, bold: true };
            dcfSheet.getCell(dRow, 1).border = BORDERS;
            for (let g = 0; g < growthSteps.length; g++) {
                const gVal = termGrowth + growthSteps[g];
                let impliedPrice = 0;
                if (wVal > gVal) {
                    const tvCalc = (lastFCF * (1 + gVal)) / (wVal - gVal);
                    const pvTVCalc = tvCalc / Math.pow(1 + wVal, nProj2);
                    const sumPV = projISs.reduce((sum: number, isp: typeof projISs[0], i: number) => sum + (isp?.fcff ?? 0) / Math.pow(1 + wVal, i + 1), 0);
                    impliedPrice = (sumPV + pvTVCalc - netDebtVal) / shares;
                }
                dcfSheet.getCell(dRow, g + 2).value = impliedPrice;
                dcfSheet.getCell(dRow, g + 2).numFmt = NUM_FMT;
                dcfSheet.getCell(dRow, g + 2).border = BORDERS;
                // Highlight the center cell
                if (w === 2 && g === 2) {
                    dcfSheet.getCell(dRow, g + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
                    dcfSheet.getCell(dRow, g + 2).font = { name: 'Calibri', size: 10, bold: true };
                }
            }
            dRow++;
        }

        applyZebraAndNegatives(dcfSheet);
    }

    // ════════════════════════════════════════════════════════
    // VALUATION MULTIPLES SHEET
    // ════════════════════════════════════════════════════════
    {
        const valSheet = workbook.addWorksheet('Valuation Multiples');
        valSheet.getColumn(1).width = 30;
        for (let i = 2; i <= nYears + 1; i++) valSheet.getColumn(i).width = 16;

        let vRow = 1;
        valSheet.getCell(vRow, 1).value = companyName + ' — Valuation Multiples';
        valSheet.getCell(vRow, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        valSheet.getCell(vRow, 1).fill = DARK_BG;
        valSheet.mergeCells(vRow, 1, vRow, nYears + 1);
        vRow += 2;

        // Market Inputs
        valSheet.getCell(vRow, 1).value = '── Market Inputs ──';
        styleRow(valSheet.getRow(vRow), { subheader: true });
        vRow++;

        const sharePrice = assumptions.sharePrice ?? 0;
        const sharesOut = results.incomeStatements[results.incomeStatements.length - 1]?.sharesOutstanding ?? 1;
        const marketCap = sharePrice * sharesOut;
        const lastBS2 = results.balanceSheets[results.balanceSheets.length - 1];
        const totalDebtV = (lastBS2?.shortTermDebt ?? 0) + (lastBS2?.longTermDebt ?? 0) + (lastBS2?.currentPortionLTD ?? 0);
        const evV = marketCap + totalDebtV - (lastBS2?.cash ?? 0);

        const valRows: Record<string, number> = {};
        const addValInput = (label: string, key: string, value: number, fmt: string = NUM_FMT) => {
            valRows[key] = vRow;
            valSheet.getCell(vRow, 1).value = label;
            valSheet.getCell(vRow, 2).value = value;
            valSheet.getCell(vRow, 2).numFmt = fmt;
            valSheet.getCell(vRow, 2).border = BORDERS;
            valSheet.getCell(vRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            vRow++;
        };
        addValInput('Share Price', 'sharePrice', sharePrice);
        addValInput('Shares Outstanding', 'shares', sharesOut);
        addValInput('Market Cap', 'mcap', marketCap);
        addValInput('Total Debt', 'debt', totalDebtV);
        addValInput('Cash', 'cash', lastBS2?.cash ?? 0);
        addValInput('Enterprise Value', 'ev', evV);
        vRow++;

        // Trading Multiples
        valSheet.getCell(vRow, 1).value = '── Trading Multiples ──';
        styleRow(valSheet.getRow(vRow), { subheader: true });
        vRow++;

        // Headers
        valSheet.getCell(vRow, 1).value = 'Multiple';
        for (let i = 0; i < nYears; i++) valSheet.getCell(vRow, i + 2).value = periods[i];
        styleRow(valSheet.getRow(vRow), { bold: true });
        vRow++;

        const addMultipleRow = (label: string, key: string, computeFn: (yr: number) => number, fmt: string = '0.0x') => {
            valRows[key] = vRow;
            valSheet.getCell(vRow, 1).value = label;
            for (let i = 0; i < nYears; i++) {
                const val = computeFn(i);
                valSheet.getCell(vRow, i + 2).value = isFinite(val) ? val : 0;
                valSheet.getCell(vRow, i + 2).numFmt = fmt;
                valSheet.getCell(vRow, i + 2).border = BORDERS;
            }
            vRow++;
        };

        addMultipleRow('EV / Revenue', 'evRev', yr => (results.incomeStatements[yr]?.revenue ?? 0) !== 0 ? evV / results.incomeStatements[yr].revenue : 0);
        addMultipleRow('EV / EBITDA', 'evEbitda', yr => {
            const ebitdaV = (results.incomeStatements[yr]?.ebit ?? 0) + (results.incomeStatements[yr]?.depreciation ?? 0) + (results.incomeStatements[yr]?.amortization ?? 0);
            return ebitdaV !== 0 ? evV / ebitdaV : 0;
        });
        addMultipleRow('P / E', 'pe', yr => results.incomeStatements[yr]?.netIncome !== 0 ? marketCap / results.incomeStatements[yr].netIncome : 0);
        addMultipleRow('P / Book', 'pb', yr => results.balanceSheets[yr]?.totalEquity !== 0 ? marketCap / results.balanceSheets[yr].totalEquity : 0);
        addMultipleRow('FCF Yield', 'fcfYield', yr => {
            const ci = yr - 1;
            if (ci < 0 || ci >= results.cashFlowStatements.length) return 0;
            return marketCap !== 0 ? results.cashFlowStatements[ci].freeCashFlow / marketCap : 0;
        }, '0.0%');
        addMultipleRow('Dividend Yield', 'divYield', yr => {
            const ci = yr - 1;
            if (ci < 0 || ci >= results.cashFlowStatements.length) return 0;
            return marketCap !== 0 ? Math.abs(results.cashFlowStatements[ci].dividendsPaid) / marketCap : 0;
        }, '0.0%');
        vRow++;

        // EGX Benchmark Reference
        valSheet.getCell(vRow, 1).value = '── EGX 30 Benchmark Reference ──';
        styleRow(valSheet.getRow(vRow), { subheader: true });
        vRow++;

        const egxRef: [string, string][] = [
            ['EGX 30 Avg P/E', '8.0–15.0x'],
            ['EGX 30 Avg P/B', '1.5–2.5x'],
            ['EGX 30 Avg Div Yield', '2.0–4.0%'],
            ['Egyptian Market EV/EBITDA', '6.0–10.0x'],
        ];
        for (const [label, value] of egxRef) {
            valSheet.getCell(vRow, 1).value = label;
            valSheet.getCell(vRow, 2).value = value;
            valSheet.getCell(vRow, 2).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
            valSheet.getCell(vRow, 2).border = BORDERS;
            vRow++;
        }

        applyZebraAndNegatives(valSheet);
    }

    // ════════════════════════════════════════════════════════
    // CBE BANKING METRICS SHEET
    // ════════════════════════════════════════════════════════
    {
        const cbeSheet = workbook.addWorksheet('CBE Banking Metrics');
        cbeSheet.getColumn(1).width = 28;
        cbeSheet.getColumn(2).width = 14;
        for (let i = 3; i <= nYears + 2; i++) cbeSheet.getColumn(i).width = 14;

        let cRow = 1;
        cbeSheet.getCell(cRow, 1).value = 'CBE Banking Metrics — Regulatory Compliance';
        cbeSheet.getCell(cRow, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        cbeSheet.getCell(cRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
        cbeSheet.mergeCells(cRow, 1, cRow, nYears + 2);
        cRow += 2;

        // Headers
        cbeSheet.getCell(cRow, 1).value = 'Metric';
        cbeSheet.getCell(cRow, 2).value = 'Threshold';
        for (let i = 0; i < nYears; i++) cbeSheet.getCell(cRow, i + 3).value = periods[i];
        styleRow(cbeSheet.getRow(cRow), { bold: true });
        cRow++;

        interface CBEMetricDef {
            label: string;
            threshold: string;
            compute: (yr: number) => number;
            passFormula: (col: string, row: number) => string; // formula for PASS/FAIL
        }

        const cbeMetricDefs: CBEMetricDef[] = [
            {
                label: 'Current Ratio',
                threshold: '≥ 1.20x',
                compute: yr => {
                    const ca = results.balanceSheets[yr]?.totalCurrentAssets ?? 0;
                    const cl = results.balanceSheets[yr]?.totalCurrentLiabilities ?? 0;
                    return cl !== 0 ? ca / cl : 0;
                },
                passFormula: (c, r) => `IF(${c}${r}>=1.2,"✓ PASS","✗ FAIL")`,
            },
            {
                label: 'Debt-to-Equity',
                threshold: '≤ 2.00x',
                compute: yr => {
                    const td = (results.balanceSheets[yr]?.shortTermDebt ?? 0) + (results.balanceSheets[yr]?.longTermDebt ?? 0) + (results.balanceSheets[yr]?.currentPortionLTD ?? 0);
                    const eq = results.balanceSheets[yr]?.totalEquity ?? 0;
                    return eq !== 0 ? td / eq : 0;
                },
                passFormula: (c, r) => `IF(${c}${r}<=2,"✓ PASS","✗ FAIL")`,
            },
            {
                label: 'Interest Coverage',
                threshold: '≥ 2.00x',
                compute: yr => {
                    const ebit = results.incomeStatements[yr]?.ebit ?? 0;
                    const ie = results.incomeStatements[yr]?.interestExpense ?? 0;
                    return ie !== 0 ? ebit / ie : 0;
                },
                passFormula: (c, r) => `IF(${c}${r}>=2,"✓ PASS","✗ FAIL")`,
            },
            {
                label: 'Net Debt / EBITDA',
                threshold: '≤ 3.00x',
                compute: yr => {
                    const td = (results.balanceSheets[yr]?.shortTermDebt ?? 0) + (results.balanceSheets[yr]?.longTermDebt ?? 0) + (results.balanceSheets[yr]?.currentPortionLTD ?? 0);
                    const nd = td - (results.balanceSheets[yr]?.cash ?? 0);
                    const ebitdaV = (results.incomeStatements[yr]?.ebit ?? 0) + (results.incomeStatements[yr]?.depreciation ?? 0) + (results.incomeStatements[yr]?.amortization ?? 0);
                    return ebitdaV !== 0 ? nd / ebitdaV : 0;
                },
                passFormula: (c, r) => `IF(${c}${r}<=3,"✓ PASS","✗ FAIL")`,
            },
            {
                label: 'DSCR',
                threshold: '≥ 1.25x',
                compute: yr => {
                    const isData = results.incomeStatements[yr];
                    if (!isData) return 0;
                    // EBITDA-based DSCR per CBE Circular 11/2020
                    const ebitda = isData.ebitda ?? 0;
                    const intExp = isData.interestExpense ?? 0;
                    // Scheduled principal: use engine LTD repayment (from assumptions)
                    const scheduledPrincipal = allLTDRepayment[yr] ?? 0;
                    const debtService = intExp + scheduledPrincipal;
                    if (debtService <= 0) return 0;
                    return ebitda / debtService;
                },
                passFormula: (c, r) => `IF(${c}${r}>=1.25,"✓ PASS","✗ FAIL")`,
            },
        ];

        for (const metric of cbeMetricDefs) {
            // Value row
            const valueRow = cRow;
            cbeSheet.getCell(cRow, 1).value = metric.label;
            cbeSheet.getCell(cRow, 1).font = { name: 'Calibri', size: 10, bold: true };
            cbeSheet.getCell(cRow, 2).value = metric.threshold;
            cbeSheet.getCell(cRow, 2).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF666666' } };
            cbeSheet.getCell(cRow, 2).border = BORDERS;
            for (let yr = 0; yr < nYears; yr++) {
                const val = metric.compute(yr);
                cbeSheet.getCell(cRow, yr + 3).value = isFinite(val) ? val : 0;
                cbeSheet.getCell(cRow, yr + 3).numFmt = '0.00x';
                cbeSheet.getCell(cRow, yr + 3).border = BORDERS;
            }
            cRow++;

            // Status row with dynamic IF formula
            cbeSheet.getCell(cRow, 1).value = '  Status';
            cbeSheet.getCell(cRow, 1).font = { name: 'Calibri', size: 10, italic: true };
            for (let yr = 0; yr < nYears; yr++) {
                const c = colLetter(yr + 3);
                const val = metric.compute(yr);
                const passStr = metric.passFormula(c, valueRow);
                const isPass = val !== 0;
                cbeSheet.getCell(cRow, yr + 3).value = { formula: passStr, result: isPass ? '✓ PASS' : '✗ FAIL' };
                cbeSheet.getCell(cRow, yr + 3).border = BORDERS;
                cbeSheet.getCell(cRow, yr + 3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: isPass ? 'FF006100' : 'FF9C0006' } };
                cbeSheet.getCell(cRow, yr + 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPass ? 'FFC6EFCE' : 'FFFFC7CE' } };
            }
            cRow++;
            cRow++; // blank between metrics
        }

        // Reference rates
        cRow++;
        cbeSheet.getCell(cRow, 1).value = '── Market Reference Rates ──';
        styleRow(cbeSheet.getRow(cRow), { subheader: true });
        cRow++;

        const cbeDiscount = assumptions.cbeRate ?? 0.195;
        const cbePct = (cbeDiscount * 100).toFixed(2);
        const taxPct = ((assumptions.taxRate?.[0] ?? 0.225) * 100).toFixed(1);
        const vatPct = ((assumptions.vatRate ?? 0.14) * 100).toFixed(0);
        const refs: [string, string][] = [
            ['CBE Discount Rate (Reference)', `${cbePct}% (MPC April 2, 2026)`],
            ['Commercial Lending Rate', `CBE + 2–3% spread`],
            ['Corporate Tax Rate (ETA)', `${taxPct}%`],
            ['Egyptian VAT Rate', `${vatPct}%`],
        ];
        for (const [label, value] of refs) {
            cbeSheet.getCell(cRow, 1).value = label;
            cbeSheet.getCell(cRow, 2).value = value;
            cbeSheet.getCell(cRow, 2).border = BORDERS;
            cRow++;
        }

        cRow++;
        cbeSheet.getCell(cRow, 1).value = 'Note: ETA e-invoicing compliance required for all B2B transactions.';
        cbeSheet.getCell(cRow, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };

        applyZebraAndNegatives(cbeSheet);
    }

    // ════════════════════════════════════════════════════════
    // VAT SCHEDULE (Live formulas referencing IS + BS)
    // ════════════════════════════════════════════════════════
    if (assumptions.enableVAT && (assumptions.vatRate ?? 0) > 0) {
        const vatSheet = workbook.addWorksheet('VAT Schedule');
        const vatRate = assumptions.vatRate ?? 0.14;

        vatSheet.getColumn(1).width = 32;
        for (let i = 0; i < nYears; i++) vatSheet.getColumn(i + 2).width = 16;

        // Title
        let vRow = 1;
        vatSheet.mergeCells(vRow, 1, vRow, nYears + 1);
        vatSheet.getCell(vRow, 1).value = companyName + ' — VAT Schedule';
        vatSheet.getCell(vRow, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        vatSheet.getCell(vRow, 1).fill = DARK_BG;
        vatSheet.getCell(vRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        vRow++;

        // Subtitle
        vatSheet.getCell(vRow, 1).value = `VAT Rate: ${(vatRate * 100).toFixed(0)}% (Egyptian standard — Law 67/2016)`;
        vatSheet.getCell(vRow, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };
        vRow++;

        // Period headers
        vatSheet.getCell(vRow, 1).value = 'Item';
        for (let i = 0; i < nYears; i++) vatSheet.getCell(vRow, i + 2).value = periods[i];
        styleHeader(vatSheet);
        vRow++;

        // VAT Rate row (editable input)
        const vatRateRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'VAT Rate';
        for (let i = 0; i < nYears; i++) {
            vatSheet.getCell(vRow, i + 2).value = vatRate;
            vatSheet.getCell(vRow, i + 2).numFmt = PCT_FMT;
            vatSheet.getCell(vRow, i + 2).fill = INPUT_BG;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        // Output VAT = Revenue × VAT Rate (formula referencing IS)
        const outputVATRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'VAT on Revenue (Output)';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const result = (results.incomeStatements[i]?.revenue ?? 0) * vatRate;
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `'Income Statement'!${c}${isRows['revenue']}*${c}${vatRateRow}`,
                result,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        // Input VAT = COGS × VAT Rate (formula referencing IS)
        const inputVATRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'VAT on Purchases (Input)';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const result = (results.incomeStatements[i]?.cogs ?? 0) * vatRate;
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `'Income Statement'!${c}${isRows['cogs']}*${c}${vatRateRow}`,
                result,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        // CapEx VAT = Revenue × CapEx% × VAT Rate
        const capexVATRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'VAT on CapEx (Input)';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const capex = (results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0);
            const result = capex * vatRate;
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `'Income Statement'!${c}${isRows['revenue']}*${aRef('capexPercent', i)}*${c}${vatRateRow}`,
                result,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        // Total Input VAT = Purchases + CapEx
        const totalInputVATRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'Total Input VAT';
        vatSheet.getCell(vRow, 1).font = BOLD_FONT;
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `${c}${inputVATRow}+${c}${capexVATRow}`,
                result: ((results.incomeStatements[i]?.cogs ?? 0) + (results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0)) * vatRate,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        styleRow(vatSheet.getRow(vRow), { bold: true, numFmt: NUM_FMT });
        vRow++;

        vRow++; // spacer

        // Net VAT Payable = Output - Total Input
        const netVATRow = vRow;
        vatSheet.getCell(vRow, 1).value = 'Net VAT Payable';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const outputV = (results.incomeStatements[i]?.revenue ?? 0) * vatRate;
            const inputV = ((results.incomeStatements[i]?.cogs ?? 0) + (results.incomeStatements[i]?.revenue ?? 0) * (allCapex[i] ?? 0)) * vatRate;
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `${c}${outputVATRow}-${c}${totalInputVATRow}`,
                result: outputV - inputV,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        styleRow(vatSheet.getRow(vRow), { bold: true, numFmt: NUM_FMT });
        vRow++;

        // Reconciliation with Balance Sheet
        vRow++; // spacer
        vatSheet.getCell(vRow, 1).value = '── BS Reconciliation ──';
        styleRow(vatSheet.getRow(vRow), { subheader: true });
        vRow++;

        // VAT Receivable from BS
        vatSheet.getCell(vRow, 1).value = 'BS: VAT Receivable';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `'Balance Sheet'!${c}${bsRows['vatReceivable']}`,
                result: results.balanceSheets[i]?.vatReceivable ?? 0,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        // VAT Payable from BS
        vatSheet.getCell(vRow, 1).value = 'BS: VAT Payable';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            vatSheet.getCell(vRow, i + 2).value = {
                formula: `'Balance Sheet'!${c}${bsRows['vatPayable']}`,
                result: results.balanceSheets[i]?.vatPayable ?? 0,
            };
            vatSheet.getCell(vRow, i + 2).numFmt = NUM_FMT;
            vatSheet.getCell(vRow, i + 2).border = BORDERS;
        }
        vRow++;

        vRow++;
        vatSheet.getCell(vRow, 1).value = 'Note: ETA e-invoicing compliance required for all B2B transactions.';
        vatSheet.getCell(vRow, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };

        applyZebraAndNegatives(vatSheet);
    }

    // ════════════════════════════════════════════════════════
    // LIVE RATES SHEET (CBE policy rates, FX, T-bill yields)
    // ════════════════════════════════════════════════════════
    if (liveRates) {
        const lrSheet = workbook.addWorksheet('Live Rates');
        lrSheet.getColumn(1).width = 32;
        lrSheet.getColumn(2).width = 20;
        lrSheet.getColumn(3).width = 30;

        let lrRow = 1;
        lrSheet.mergeCells(lrRow, 1, lrRow, 3);
        lrSheet.getCell(lrRow, 1).value = 'Live Market Rates — Central Bank of Egypt';
        lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
        lrSheet.getCell(lrRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };
        lrSheet.getCell(lrRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        lrRow++;

        lrSheet.getCell(lrRow, 1).value = `Source: ${liveRates.source}`;
        lrSheet.getCell(lrRow, 2).value = `Last Updated: ${liveRates.lastUpdated}`;
        lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };
        lrSheet.getCell(lrRow, 2).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF888888' } };
        lrRow += 2;

        // CBE Policy Rates
        lrSheet.getCell(lrRow, 1).value = '── CBE Policy Rates ──';
        lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        lrSheet.getCell(lrRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrRow++;

        const addLRRow = (label: string, value: number, fmt: string, note: string = '') => {
            lrSheet.getCell(lrRow, 1).value = label;
            lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 10 };
            lrSheet.getCell(lrRow, 2).value = value;
            lrSheet.getCell(lrRow, 2).numFmt = fmt;
            lrSheet.getCell(lrRow, 2).border = BORDERS;
            if (note) {
                lrSheet.getCell(lrRow, 3).value = note;
                lrSheet.getCell(lrRow, 3).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF666666' } };
            }
            lrRow++;
        };

        addLRRow('CBE Deposit Rate (Overnight)', liveRates.cbeDepositRate, '0.00%', `MPC: ${liveRates.lastMPCDate}`);
        addLRRow('CBE Lending Rate (Overnight)', liveRates.cbeLendingRate, '0.00%', `MPC: ${liveRates.lastMPCDate}`);
        addLRRow('CBE Discount Rate', liveRates.cbeDiscountRate, '0.00%', 'Used for CBE Banking Metrics');
        addLRRow('12-Month T-Bill Yield', liveRates.tbillRate12m, '0.00%', 'Risk-free rate proxy for DCF');
        addLRRow('Egyptian CPI (Annual)', liveRates.egyptianCPI, '0.0%', 'Inflation rate');
        lrRow++;

        // FX Rates
        lrSheet.getCell(lrRow, 1).value = '── Exchange Rates ──';
        lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        lrSheet.getCell(lrRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrRow++;

        addLRRow('USD / EGP', liveRates.usdEgpRate, '#,##0.00', 'US Dollar');
        addLRRow('EUR / EGP', liveRates.eurEgpRate, '#,##0.00', 'Euro');
        addLRRow('SAR / EGP', liveRates.sarEgpRate, '#,##0.00', 'Saudi Riyal');
        addLRRow('AED / EGP', liveRates.aedEgpRate, '#,##0.00', 'UAE Dirham');
        lrRow++;

        // Model Integration
        lrSheet.getCell(lrRow, 1).value = '── Model Integration ──';
        lrSheet.getCell(lrRow, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        lrSheet.getCell(lrRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrSheet.getCell(lrRow, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        lrRow++;

        addLRRow('Risk-Free Rate (DCF)', assumptions.riskFreeRate ?? 0.235, '0.00%', '→ DCF Valuation tab');
        addLRRow('CBE Rate (Assumptions)', assumptions.cbeRate ?? 0.195, '0.00%', '→ CBE Banking Metrics tab');
        addLRRow('Interest on Debt', assumptions.interestRateOnDebt?.[0] ?? 0.22, '0.00%', '→ Debt Schedule tab');
        addLRRow('Interest on Cash', assumptions.interestRateOnCash?.[0] ?? 0.18, '0.00%', '→ IS Interest Income');

        applyZebraAndNegatives(lrSheet);
    }

    // ════════════════════════════════════════════════════════
    // TAB REORDERING & TAB COLORS
    // ════════════════════════════════════════════════════════
    const DESIRED_ORDER = [
        'Dashboard', 'Company Info', 'Live Rates', 'Scenarios', 'Assumptions',
        'Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Ratios',
        'Working Capital', 'Depreciation Schedule', 'Debt Schedule',
        'DCF Valuation', 'Valuation Multiples', 'CBE Banking Metrics',
        'VAT Schedule',
    ];
    const TAB_COLORS: Record<string, string> = {
        'Dashboard': 'FF1F3864', 'Company Info': 'FF2E75B6', 'Live Rates': 'FFC0392B',
        'Scenarios': 'FF1A7A4A',
        'Assumptions': 'FF7F7F7F', 'Income Statement': 'FF4472C4', 'Balance Sheet': 'FF4472C4',
        'Cash Flow Statement': 'FF4472C4', 'Ratios': 'FF7030A0', 'Working Capital': 'FF8B4000',
        'Depreciation Schedule': 'FF8B4000', 'Debt Schedule': 'FF8B4000',
        'DCF Valuation': 'FF2E75B6', 'Valuation Multiples': 'FF2E75B6', 'CBE Banking Metrics': 'FFC0392B',
    };
    // Apply tab colors
    for (const [name, color] of Object.entries(TAB_COLORS)) {
        const s = workbook.getWorksheet(name);
        if (s) s.properties.tabColor = { argb: color };
    }
    // Reorder sheets: rebuild the internal _worksheets array AND update each sheet's id
    // so ExcelJS's XLSX writer outputs them in the correct order.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wsList = (workbook as any)._worksheets as (ExcelJS.Worksheet | undefined)[];
    if (wsList) {
        const ordered: (ExcelJS.Worksheet | undefined)[] = [undefined]; // index 0 is always undefined in ExcelJS
        for (const name of DESIRED_ORDER) {
            const ws = wsList.find(w => w?.name === name);
            if (ws) ordered.push(ws);
        }
        // Add any remaining sheets not in DESIRED_ORDER
        for (const ws of wsList) {
            if (ws && !ordered.includes(ws)) ordered.push(ws);
        }
        // Replace the array contents AND update each worksheet's id to match its position
        wsList.length = 0;
        ordered.forEach((w, idx) => {
            wsList.push(w);
            if (w) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (w as any).id = idx;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (w as any).orderNo = idx;
            }
        });
    }

    // ════════════════════════════════════════════════════════
    // FINAL POLISH — zebra striping + red negatives on all tabs
    // ════════════════════════════════════════════════════════
    allSheets.forEach(sheet => applyZebraAndNegatives(sheet));

    return workbook;
}

/**
 * Serialize a built workbook to an ArrayBuffer with the calcPr iterate
 * attributes patched in. Pure / no browser deps.
 */
export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<ArrayBuffer> {
    let buffer = await workbook.xlsx.writeBuffer() as ArrayBuffer;

    // ── Patch calcPr to ensure iterate attributes are in OOXML ──
    // ExcelJS doesn't reliably write iterate/iterateCount/iterateDelta
    // to <calcPr>, causing Excel to show a circular reference warning.
    try {
        const zip = await JSZip.loadAsync(buffer);
        const wbXmlFile = zip.file('xl/workbook.xml');
        if (wbXmlFile) {
            let wbXml = await wbXmlFile.async('string');
            wbXml = wbXml.replace(/\s+iterate="[^"]*"/g, '');
            wbXml = wbXml.replace(/\s+iterateCount="[^"]*"/g, '');
            wbXml = wbXml.replace(/\s+iterateDelta="[^"]*"/g, '');
            wbXml = wbXml.replace(
                /<calcPr([^/>]*)(\/?\s*>)/,
                '<calcPr$1 iterate="1" iterateCount="1000" iterateDelta="0.001"$2'
            );
            zip.file('xl/workbook.xml', wbXml);
            buffer = await zip.generateAsync({ type: 'arraybuffer' });
        }
    } catch (e) {
        console.warn('calcPr patch skipped (non-critical):', e);
    }
    return buffer;
}

/**
 * Browser entry point: build workbook → trigger download.
 * Calls into pure buildWorkbook + workbookToBuffer; only the final
 * Blob/document/URL.createObjectURL block requires a DOM.
 */
export async function exportToExcel(
    results: ModelResults,
    assumptions: AssumptionSet,
    companyName: string,
    allScenarios?: Scenario[],
    historicalInputs?: HistoricalInputs,
    liveRates?: ExportLiveRates,
): Promise<void> {
    const workbook = await buildWorkbook(results, assumptions, companyName, allScenarios, historicalInputs, liveRates);
    const buffer = await workbookToBuffer(workbook);

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = companyName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_Financial_Model.xlsx`;

    // In development mode, also save to disk via API route
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
        try {
            const resp = await fetch(`/api/dev-save-file?filename=${encodeURIComponent(filename)}`, {
                method: 'POST',
                body: buffer,
                headers: { 'Content-Type': 'application/octet-stream' },
            });
            if (resp.ok) {
                const result = await resp.json();
                console.log(`📁 Dev-saved Excel to: ${result.saved} (${result.bytes} bytes)`);
            }
        } catch (e) {
            console.warn('Dev-save failed (non-critical):', e);
        }
    }

    // Browser download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
