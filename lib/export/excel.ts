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
const LIGHT_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3460' } };
const INPUT_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } }; // light yellow = input cell
const WHITE_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const BOLD_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 };
const NUM_FMT = '#,##0';
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

export async function exportToExcel(
    results: ModelResults,
    assumptions: AssumptionSet,
    companyName: string,
    allScenarios?: Scenario[],
    historicalInputs?: HistoricalInputs,
): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FinModel Engine';
    workbook.created = new Date();

    // ⭐ Workbook calculation properties
    // fullCalcOnLoad is TRUE — all formulas are live.
    // Balance is guaranteed by the Cash "plug" formula on the BS tab:
    //   Cash = Total L+E − Non-Cash Current Assets − Total Non-Current Assets
    // This is the standard Wall Street financial modeling approach.
    // Iterative calculation is enabled as a safety net for any residual circular references.
    // Bug 1 fix (beginning-of-period cash for Interest Income) removes the main circularity.
    workbook.calcProperties = {
        fullCalcOnLoad: true,
        calcOnSave: true,
        calcMode: 'auto',
    } as ExcelJS.CalculationProperties;
    // Force iterative calculation in OOXML calcPr attributes
    // ExcelJS types don't include iterate/iterateCount/iterateDelta, but they are
    // written to <calcPr> when present on the object.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calcProps = workbook.calcProperties as any;
    calcProps.iterate = true;
    calcProps.iterateCount = 100;
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
        const GLOBAL_KEYS: (keyof AssumptionSet)[] = [
            'taxRate', 'vatRate', 'enableVAT', 'dividendWithholdingRate',
            'useEgyptianRates', 'countryPreset', 'fiscalYearPreset', 'fiscalYearEnd',
            'projectionYears', 'historicalYears',
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

    // ── Back-compute historical assumption values from results ──
    // So the Assumptions tab has values for ALL years and formulas work everywhere.
    const histIS = results.incomeStatements.slice(0, numHistorical);
    const histBS = results.balanceSheets.slice(0, numHistorical);
    // CF has numHistorical-1 entries (needs prior BS for deltas)
    const numHistoricalCF = results.cashFlowStatements.filter(s => s.periodType === 'historical').length;
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
    const allTaxRate = allIS.map(is => is.taxRate);
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

    const allInterestRate = Array(nYears).fill(assumptions.interestRate);
    const allInterestIncRate = Array(nYears).fill(assumptions.interestIncomeRate);
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
    // Dividend payout ratio: back-compute from engine CF dividends / IS net income
    const allDivPayout = allIS.map((is, i) => {
        // CF index for IS year i is i-1 (CF offset = 1)
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
    buildCompanyInfoSheet(workbook, companyName);

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

    function addAssumptionRow(label: string, key: string, values: number[], fmt: string = NUM_FMT) {
        aRows[key] = aRow;
        aSheet.getCell(aRow, 1).value = label;
        for (let i = 0; i < nYears; i++) {
            aSheet.getCell(aRow, i + 2).value = values[i] ?? 0;
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
    aSheet.getCell(aRow, 1).value = 'Revenue Base (Historical)';
    aSheet.getCell(aRow, 2).value = engineRevenues[0] ?? assumptions.revenueBase;
    styleRow(aSheet.getRow(aRow), { input: true, numFmt: NUM_FMT });
    aRow++;

    // Revenue Base (Projection) — the user's projection anchor (drives first projected year)
    aRows['revenueBaseProjection'] = aRow;
    aSheet.getCell(aRow, 1).value = 'Revenue Base (Projection)';
    aSheet.getCell(aRow, 2).value = assumptions.revenueBase;
    styleRow(aSheet.getRow(aRow), { input: true, numFmt: NUM_FMT });
    aRow++;

    addAssumptionRow('Revenue Growth Rate', 'revenueGrowthRate', allRevenueGrowth, PCT_FMT);
    addAssumptionRow('COGS % of Revenue', 'cogsPercent', allCogsPercent, PCT_FMT);
    addAssumptionRow('SG&A % of Revenue', 'sgaPercent', allSgaPercent, PCT_FMT);
    addAssumptionRow('R&D % of Revenue', 'rdPercent', allRdPercent, PCT_FMT);
    addAssumptionRow('Other OpEx % of Revenue', 'otherOpexPercent', allOtherOpexPct, PCT_FMT);
    addAssumptionRow('Tax Rate', 'taxRate', allTaxRate, PCT_FMT);
    addAssumptionRow('Other Income / Expense', 'otherIncomeExpense', allOtherIncome, NUM_FMT);
    addAssumptionRow('Shares Outstanding', 'sharesOutstanding', allShares, '#,##0');
    addAssumptionRow('Stock-Based Comp Amount', 'stockBasedCompAmount', allSBC, NUM_FMT);

    // ── Balance Sheet / WC Drivers ──
    aSheet.getCell(aRow, 1).value = '── Balance Sheet / WC Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('DSO (Days)', 'dso', allDSO, '#,##0');
    addAssumptionRow('DIO (Days)', 'dio', allDIO, '#,##0');
    addAssumptionRow('DPO (Days)', 'dpo', allDPO, '#,##0');
    addAssumptionRow('Prepaid % of Revenue', 'prepaidPercent', allPrepaid, PCT_FMT);
    addAssumptionRow('Accrued Exp % of Revenue', 'accruedExpPercent', allAccrued, PCT_FMT);
    addAssumptionRow('Deferred Rev % of Revenue', 'deferredRevPercent', allDefRev, PCT_FMT);

    // ── CapEx & D&A Drivers ──
    aSheet.getCell(aRow, 1).value = '── CapEx & Depreciation Drivers ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('CapEx % of Revenue', 'capexPercent', allCapex, PCT_FMT);
    addAssumptionRow('Depreciation Rate (% Gross PPE)', 'depreciationRate', allDepRate, PCT_FMT);
    addAssumptionRow('Amortization Amount', 'amortizationAmount', allAmort, NUM_FMT);

    // ── Debt & Financing Drivers ──
    aSheet.getCell(aRow, 1).value = '── Debt & Financing ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Interest Rate (on Debt)', 'interestRate', allInterestRate, PCT_FMT);
    addAssumptionRow('Interest Income Rate (on Cash)', 'interestIncomeRate', allInterestIncRate, PCT_FMT);
    addAssumptionRow('Short-Term Debt', 'shortTermDebtAmount', allSTDebt, NUM_FMT);
    addAssumptionRow('LT Debt Issuance', 'longTermDebtIssuance', allLTDIssuance, NUM_FMT);
    addAssumptionRow('LT Debt Repayment', 'longTermDebtRepayment', allLTDRepayment, NUM_FMT);
    addAssumptionRow('Current Portion LTD', 'currentPortionLTD', allCPLTD, NUM_FMT);
    addAssumptionRow('Dividend Payout Ratio', 'dividendPayoutRatio', allDivPayout, PCT_FMT);
    addAssumptionRow('Share Repurchase Amount', 'shareRepurchaseAmount', allShareRepurch, NUM_FMT);

    // Equity issuance: derive from engine CF results for all periods
    const allEquityIssuance = allIS.map((_, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            return results.cashFlowStatements[cfIdx].equityIssuance;
        }
        return 0;
    });
    addAssumptionRow('Equity Issuance', 'equityIssuance', allEquityIssuance, NUM_FMT);

    // ── Balance Sheet Direct Values ──
    aSheet.getCell(aRow, 1).value = '── BS / Equity Direct Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Goodwill', 'goodwill', allGoodwill, NUM_FMT);
    addAssumptionRow('Other Current Assets', 'otherCurrentAssets', allOCA, NUM_FMT);
    addAssumptionRow('Other Long-Term Assets', 'otherLongTermAssets', allOLTA, NUM_FMT);
    addAssumptionRow('Other Current Liabilities', 'otherCurrentLiabilities', allOCL, NUM_FMT);
    addAssumptionRow('Deferred Tax Liabilities', 'deferredTaxLiabilities', allDTL, NUM_FMT);
    addAssumptionRow('Other LT Liabilities', 'otherLongTermLiabilities', allOLTL, NUM_FMT);
    addAssumptionRow('Common Stock', 'commonStock', allCS, NUM_FMT);
    addAssumptionRow('APIC', 'apic', allAPIC, NUM_FMT);
    addAssumptionRow('Other Comprehensive Income', 'oci', allOCI, NUM_FMT);

    // ── Engine-Computed Values (circular/chain resolved) ──
    aSheet.getCell(aRow, 1).value = '── Engine-Computed Values ──';
    styleRow(aSheet.getRow(aRow), { subheader: true });
    aRow++;

    addAssumptionRow('Interest Income (Computed)', 'interestIncomeComputed', allInterestIncome, NUM_FMT);
    addAssumptionRow('Interest Expense (Computed)', 'interestExpenseComputed', allInterestExpense, NUM_FMT);
    addAssumptionRow('Depreciation (Computed)', 'depreciationComputed', allDepreciation, NUM_FMT);
    addAssumptionRow('Gross PP&E (Computed)', 'grossPPEComputed', allGrossPPE, NUM_FMT);
    addAssumptionRow('Accum Depreciation (Computed)', 'accumDepComputed', allAccumDep, NUM_FMT);
    addAssumptionRow('Net PP&E (Computed)', 'netPPEComputed', allNetPPE, NUM_FMT);
    addAssumptionRow('Intangibles (Computed)', 'intangiblesComputed', allIntangibles, NUM_FMT);
    addAssumptionRow('Long-Term Debt (Computed)', 'ltdComputed', allLTD, NUM_FMT);
    addAssumptionRow('Retained Earnings (Computed)', 'reComputed', allRE, NUM_FMT);
    addAssumptionRow('Treasury Stock (Computed)', 'tsComputed', allTS, NUM_FMT);
    addAssumptionRow('APIC (Computed)', 'apicComputed', allAPICValues, NUM_FMT);

    // Engine-computed CF values (padded to nYears: index 0 = IS year 0 with no CF entry)
    const allDividendsPaidPadded = [0, ...results.cashFlowStatements.map(cf => cf.dividendsPaid)];
    addAssumptionRow('Dividends Paid (Computed)', 'dividendsPaidComputed', allDividendsPaidPadded, NUM_FMT);
    const allEquityIssuancePadded = [0, ...results.cashFlowStatements.map(cf => cf.equityIssuance)];
    addAssumptionRow('Equity Issuance (Computed)', 'equityIssuanceComputed', allEquityIssuancePadded, NUM_FMT);
    const allShareRepurchasesPadded = [0, ...results.cashFlowStatements.map(cf => cf.shareRepurchases)];
    addAssumptionRow('Share Repurchases (Computed)', 'shareRepurchasesComputed', allShareRepurchasesPadded, NUM_FMT);
    const allAcquisitionsPadded = [0, ...results.cashFlowStatements.map(cf => cf.acquisitions)];
    addAssumptionRow('Acquisitions (Computed)', 'acquisitionsComputed', allAcquisitionsPadded, NUM_FMT);
    const allAssetSalesPadded = [0, ...results.cashFlowStatements.map(cf => cf.assetSales)];
    addAssumptionRow('Asset Sales (Computed)', 'assetSalesComputed', allAssetSalesPadded, NUM_FMT);

    // Helper: get Assumptions cell reference like "Assumptions!B3"
    function aRef(key: string, yearIdx: number): string {
        const r = aRows[key];
        const c = colLetter(yearIdx + 2); // col B = year 0
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

    // Revenue: Year 0 = revenueBase, all subsequent = chain from prior year * (1 + growth)
    // This matches the engine: revenue = previousRevenue * (1 + growthRate)
    isRows['revenue'] = isRow;
    isSheet.getCell(isRow, 1).value = 'Revenue';
    for (let i = 0; i < nYears; i++) {
        const cell = isSheet.getCell(isRow, i + 2);
        const result = results.incomeStatements[i]?.revenue ?? 0;
        if (i === 0) {
            // First historical year: = revenueBase
            cell.value = { formula: `${aRef('revenueBase', 0)}`, result };
        } else {
            // All other years (historical 1+ and ALL projected): chain from prior year
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

    // Net Margin
    addISRow('Net Margin', 'netMargin', {
        formula: (c) => `IF(${c}${isRows['revenue']}=0,0,${c}${isRows['netIncome']}/${c}${isRows['revenue']})`,
        value: yr => results.incomeStatements[yr]?.netMargin ?? 0,
        pct: true,
    });

    // EPS = Net Income / Shares Outstanding
    addISRow('EPS', 'eps', {
        formula: (c, yr) => `IF(${aRef('sharesOutstanding', yr)}=0,0,${c}${isRows['netIncome']}/${aRef('sharesOutstanding', yr)})`,
        value: yr => results.incomeStatements[yr]?.eps ?? 0,
        numFmt: EPS_FMT,
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

    // Total Current Assets = sum
    addBSRow('Total Current Assets', 'totalCurrentAssets', {
        formula: (c) => `SUM(${c}${bsRows['cash']}:${c}${bsRows['otherCurrentAssets']})`,
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

    addBSRow('Total Current Liabilities', 'totalCurrentLiabilities', {
        formula: (c) => `SUM(${c}${bsRows['accountsPayable']}:${c}${bsRows['otherCurrentLiabilities']})`,
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
    // Retained Earnings — live rollforward: prev + NI - dividends
    addBSRow('Retained Earnings', 'retainedEarnings', {
        formula: (c, yr) => {
            if (yr < numHistorical) {
                return `${aRef('reComputed', yr)}`;
            }
            const prevC = colLetter(yr + 1);
            return `${prevC}${bsRows['retainedEarnings']}+'Income Statement'!${c}${isRows['netIncome']}-MAX(0,'Income Statement'!${c}${isRows['netIncome']}*${aRef('dividendPayoutRatio', yr)})`;
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
    // Replace Scenarios tab COMPUTED + DASHBOARD rows with formulas
    // referencing the calc sheets
    // ════════════════════════════════════════════════════════
    {
        const scenSheet = workbook.getWorksheet('Scenarios');
        if (scenSheet) {
            // Map: ROW_SPEC key → calc sheet row number
            const COMPUTED_KEY_TO_CALC: Record<string, number> = {
                // Engine-Computed Values (IS items)
                'interestIncomeComputed': calcSheets.base?.rows.interestIncome ?? 0,
                'interestExpenseComputed': calcSheets.base?.rows.interestExpense ?? 0,
                'depreciationComputed': calcSheets.base?.rows.depreciation ?? 0,
                // Engine-Computed Values (BS items)
                'grossPPEComputed': calcSheets.base?.rows.grossPPE ?? 0,
                'accumDepComputed': calcSheets.base?.rows.accumDep ?? 0,
                'netPPEComputed': calcSheets.base?.rows.netPPE ?? 0,
                'intangiblesComputed': calcSheets.base?.rows.intangibles ?? 0,
                'ltdComputed': calcSheets.base?.rows.longTermDebt ?? 0,
                'reComputed': calcSheets.base?.rows.retainedEarnings ?? 0,
                'tsComputed': calcSheets.base?.rows.treasuryStock ?? 0,
                'apicComputed': calcSheets.base?.rows.apic ?? 0,
                // Engine-Computed CF items
                'dividendsPaidComputed': calcSheets.base?.rows.cf_dividends ?? 0,
                'equityIssuanceComputed': calcSheets.base?.rows.cf_equityIssuance ?? 0,
                'shareRepurchasesComputed': calcSheets.base?.rows.cf_shareRepurchases ?? 0,
                'acquisitionsComputed': calcSheets.base?.rows.cf_acquisitions ?? 0,
                'assetSalesComputed': calcSheets.base?.rows.cf_assetSales ?? 0,
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
                'out_roa': 0,
            };

            // Only Dashboard Output rows ('out_' prefix) get formulas referencing _Calc_* sheets.
            // Engine-Computed rows ('*Computed' suffix) stay as plain numeric values written by
            // buildScenariosSheet() — overwriting them with _Calc_* formulas would create ~240
            // circular loops because _Calc_* Interest Income/Expense read those same rows back.
            const isDashboardOutput = (key: string) =>
                key.startsWith('out_');

            // Scenario block info
            const SCENARIO_BLOCKS = [
                { blockName: 'Base Case', sheetName: calcSheets.base?.sheetName ?? '_Calc_Base' },
                { blockName: 'Optimistic', sheetName: calcSheets.optimistic?.sheetName ?? '_Calc_Opt' },
                { blockName: 'Conservative', sheetName: calcSheets.conservative?.sheetName ?? '_Calc_Con' },
            ];

            for (const spec of ROW_SPECS) {
                if (!isDashboardOutput(spec.key)) continue; // Skip input rows and computed rows
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
                                    formula = `'${cs}'!${c}${base.netIncome}/Scenarios!${c}${scenarioRows[`${block.blockName}_sharesOutstanding`] ?? 1}`;
                                    break;
                                case 'out_totalDebt': {
                                    const stDebt2 = base.shortTermDebt ?? 0;
                                    const ltd2 = base.longTermDebt ?? 0;
                                    formula = `'${cs}'!${c}${stDebt2}+'${cs}'!${c}${ltd2}`;
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

    // Total WC Change
    addCFRow('Total WC Change', 'totalWorkingCapitalChange', {
        formula: (cfCol) => `SUM(${cfCol}${cfRows['changeInAR']}:${cfCol}${cfRows['changeInDeferredRev']})`,
        value: j => results.cashFlowStatements[j]?.totalWorkingCapitalChange ?? 0,
    });

    // CFO = NI + D&A + SBC + DeferredTax + WC
    addCFRow('Cash from Operations', 'cashFromOperations', {
        formula: (cfCol) => `${cfCol}${cfRows['netIncome']}+${cfCol}${cfRows['depreciation']}+${cfCol}${cfRows['amortization']}+${cfCol}${cfRows['stockBasedComp']}+${cfCol}${cfRows['deferredTaxes']}+${cfCol}${cfRows['totalWorkingCapitalChange']}`,
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

    addCFRow('Acquisitions', 'acquisitions', {
        formula: (_cfCol, _isCol, isYr) => `${aRef('acquisitionsComputed', isYr)}`,
        value: j => results.cashFlowStatements[j]?.acquisitions ?? 0,
    });
    addCFRow('Asset Sales', 'assetSales', {
        formula: (_cfCol, _isCol, isYr) => `${aRef('assetSalesComputed', isYr)}`,
        value: j => results.cashFlowStatements[j]?.assetSales ?? 0,
    });

    addCFRow('Cash from Investing', 'cashFromInvesting', {
        formula: (cfCol) => `${cfCol}${cfRows['capex']}+${cfCol}${cfRows['acquisitions']}+${cfCol}${cfRows['assetSales']}`,
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

    // Dividends: historical = engine back-solved (from RE changes), projected = NI * PayoutRatio
    addCFRow('Dividends Paid', 'dividendsPaid', {
        formula: (_cfCol, isCol, isYr) => {
            if (isYr < numHistorical) {
                // Historical: use engine-computed value from Assumptions tab
                return `${aRef('dividendsPaidComputed', isYr)}`;
            }
            // Projected: -MAX(0, NetIncome * PayoutRatio)
            return `-MAX(0,'Income Statement'!${isCol}${isRows['netIncome']}*${aRef('dividendPayoutRatio', isYr)})`;
        },
        value: j => results.cashFlowStatements[j]?.dividendsPaid ?? 0,
    });

    // Equity Issuance: historical = engine back-solved (from APIC/CS changes), projected = assumption
    addCFRow('Equity Issuance', 'equityIssuance', {
        formula: (_cfCol, _isCol, isYr) => {
            if (isYr < numHistorical) {
                return `${aRef('equityIssuanceComputed', isYr)}`;
            }
            return `${aRef('equityIssuance', isYr)}`;
        },
        value: j => results.cashFlowStatements[j]?.equityIssuance ?? 0,
    });

    // Share Repurchases: historical = engine back-solved (from TS changes), projected = -ABS(assumption)
    addCFRow('Share Repurchases', 'shareRepurchases', {
        formula: (_cfCol, _isCol, isYr) => {
            if (isYr < numHistorical) {
                return `${aRef('shareRepurchasesComputed', isYr)}`;
            }
            return `-ABS(${aRef('shareRepurchaseAmount', isYr)})`;
        },
        value: j => results.cashFlowStatements[j]?.shareRepurchases ?? 0,
    });

    addCFRow('Cash from Financing', 'cashFromFinancing', {
        formula: (cfCol) => `${cfCol}${cfRows['debtIssuance']}+${cfCol}${cfRows['debtRepayment']}+${cfCol}${cfRows['dividendsPaid']}+${cfCol}${cfRows['equityIssuance']}+${cfCol}${cfRows['shareRepurchases']}`,
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

    // Profitability
    ratioSheet.getCell(rRow, 1).value = '── Profitability ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Gross Margin', (c) =>
        `IF('Income Statement'!${c}${isRows['revenue']}=0,0,'Income Statement'!${c}${isRows['grossProfit']}/'Income Statement'!${c}${isRows['revenue']})`,
        'grossMargin');

    addRatioRow('Operating Margin', (c) =>
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

    // Liquidity
    ratioSheet.getCell(rRow, 1).value = '── Liquidity ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Current Ratio', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']}=0,0,'Balance Sheet'!${c}${bsRows['totalCurrentAssets']}/'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})`,
        'currentRatio', '#,##0.00x');

    addRatioRow('Debt to Equity', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,'Balance Sheet'!${c}${bsRows['totalLiabilities']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
        'debtToEquity', '#,##0.00x');

    // Efficiency
    ratioSheet.getCell(rRow, 1).value = '── Efficiency ──';
    styleRow(ratioSheet.getRow(rRow), { subheader: true });
    rRow++;

    addRatioRow('Asset Turnover', (c) =>
        `IF('Balance Sheet'!${c}${bsRows['totalAssets']}=0,0,'Income Statement'!${c}${isRows['revenue']}/'Balance Sheet'!${c}${bsRows['totalAssets']})`,
        'assetTurnover', '#,##0.00x');

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

    addDebtRow('  Average Debt Balance', 'avgDebt', {
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

    // ════════════════════════════════════════════════════════
    // CBE BANKING METRICS (Egyptian market only)
    // ════════════════════════════════════════════════════════
    let allSheets = [aSheet, isSheet, bsSheet, cfSheet, ratioSheet, wcSheet, depSheet, debtSheet];

    if (assumptions.countryPreset === 'egypt') {
        const cbeSheet = workbook.addWorksheet('CBE Banking Metrics');
        styleHeader(cbeSheet);

        // Header row
        cbeSheet.getCell(1, 1).value = 'CBE Compliance Metric';
        cbeSheet.getColumn(1).width = 32;
        for (let i = 0; i < nYears; i++) {
            cbeSheet.getCell(1, i + 2).value = periods[i] ?? `Year ${i + 1}`;
        }
        cbeSheet.getCell(1, nYears + 2).value = 'CBE Min';
        cbeSheet.getCell(1, nYears + 3).value = 'CBE Max';

        let cbeRow = 2;

        // Section header
        cbeSheet.getCell(cbeRow, 1).value = 'CBE COMPLIANCE DASHBOARD';
        styleRow(cbeSheet.getRow(cbeRow), { subheader: true }); cbeRow++;

        // 1. Current Ratio (≥ 1.2x)
        cbeSheet.getCell(cbeRow, 1).value = 'Current Ratio';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = {
                formula: `IF('Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']}=0,0,'Balance Sheet'!${c}${bsRows['totalCurrentAssets']}/'Balance Sheet'!${c}${bsRows['totalCurrentLiabilities']})`,
                result: results.ratios[i]?.currentRatio ?? 0,
            };
            cell.numFmt = '0.00"x"';
        }
        cbeSheet.getCell(cbeRow, nYears + 2).value = '1.20x';
        cbeSheet.getCell(cbeRow, nYears + 3).value = '—';
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // Status row
        cbeSheet.getCell(cbeRow, 1).value = '  └ Status';
        for (let i = 0; i < nYears; i++) {
            const cr = results.ratios[i]?.currentRatio ?? 0;
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = cr >= 1.2 ? '✓ PASS' : '✗ FAIL';
            cell.font = { color: { argb: cr >= 1.2 ? 'FF00AA55' : 'FFFF4444' }, bold: true, size: 10 };
        }
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // 2. Debt-to-Equity (≤ 2.5x)
        cbeSheet.getCell(cbeRow, 1).value = ''; cbeRow++;
        cbeSheet.getCell(cbeRow, 1).value = 'Debt-to-Equity';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = {
                formula: `IF('Balance Sheet'!${c}${bsRows['totalEquity']}=0,0,'Debt Schedule'!${c}${dbtRows['totalDebt']}/'Balance Sheet'!${c}${bsRows['totalEquity']})`,
                result: results.ratios[i]?.debtToEquity ?? 0,
            };
            cell.numFmt = '0.00"x"';
        }
        cbeSheet.getCell(cbeRow, nYears + 2).value = '—';
        cbeSheet.getCell(cbeRow, nYears + 3).value = '2.50x';
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // Status row
        cbeSheet.getCell(cbeRow, 1).value = '  └ Status';
        for (let i = 0; i < nYears; i++) {
            const de = results.ratios[i]?.debtToEquity ?? 0;
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = de <= 2.5 ? '✓ PASS' : '✗ FAIL';
            cell.font = { color: { argb: de <= 2.5 ? 'FF00AA55' : 'FFFF4444' }, bold: true, size: 10 };
        }
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // 3. Interest Coverage (≥ 2.0x)
        cbeSheet.getCell(cbeRow, 1).value = ''; cbeRow++;
        cbeSheet.getCell(cbeRow, 1).value = 'Interest Coverage (EBIT / Interest Expense)';
        for (let i = 0; i < nYears; i++) {
            const c = colLetter(i + 2);
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = {
                formula: `IF('Income Statement'!${c}${isRows['interestExpense']}=0,0,'Income Statement'!${c}${isRows['ebit']}/'Income Statement'!${c}${isRows['interestExpense']})`,
                result: results.ratios[i]?.interestCoverage ?? 0,
            };
            cell.numFmt = '0.00"x"';
        }
        cbeSheet.getCell(cbeRow, nYears + 2).value = '2.00x';
        cbeSheet.getCell(cbeRow, nYears + 3).value = '—';
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // Status row
        cbeSheet.getCell(cbeRow, 1).value = '  └ Status';
        for (let i = 0; i < nYears; i++) {
            const ic = results.ratios[i]?.interestCoverage ?? 0;
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = ic >= 2.0 ? '✓ PASS' : '✗ FAIL';
            cell.font = { color: { argb: ic >= 2.0 ? 'FF00AA55' : 'FFFF4444' }, bold: true, size: 10 };
        }
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        // Summary
        cbeSheet.getCell(cbeRow, 1).value = ''; cbeRow++;
        cbeSheet.getCell(cbeRow, 1).value = 'OVERALL COMPLIANCE';
        styleRow(cbeSheet.getRow(cbeRow), { subheader: true }); cbeRow++;

        cbeSheet.getCell(cbeRow, 1).value = '  Compliance Score';
        for (let i = 0; i < nYears; i++) {
            const cr = results.ratios[i]?.currentRatio ?? 0;
            const de = results.ratios[i]?.debtToEquity ?? 0;
            const ic = results.ratios[i]?.interestCoverage ?? 0;
            const passed = (cr >= 1.2 ? 1 : 0) + (de <= 2.5 ? 1 : 0) + (ic >= 2.0 ? 1 : 0);
            const cell = cbeSheet.getCell(cbeRow, i + 2);
            cell.value = `${passed}/3`;
            cell.font = { bold: true, size: 11, color: { argb: passed === 3 ? 'FF00AA55' : passed >= 2 ? 'FFFFAA00' : 'FFFF4444' } };
        }
        styleRow(cbeSheet.getRow(cbeRow), {}); cbeRow++;

        applyHistoricalStyling(cbeSheet, numHistorical, nYears);
        allSheets.push(cbeSheet);
    }

    // ════════════════════════════════════════════════════════
    // DASHBOARD  (cross-sheet formula references)
    // ════════════════════════════════════════════════════════
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
    // TAB REORDERING & TAB COLORS
    // ════════════════════════════════════════════════════════
    const DESIRED_ORDER = [
        'Dashboard', 'Company Info', 'Scenarios', 'Assumptions',
        'Income Statement', 'Balance Sheet', 'Cash Flow Statement', 'Ratios',
        'Working Capital', 'Depreciation Schedule', 'Debt Schedule', 'CBE Banking Metrics',
    ];
    const TAB_COLORS: Record<string, string> = {
        'Dashboard': 'FF1F3864', 'Company Info': 'FF2E75B6', 'Scenarios': 'FF1A7A4A',
        'Assumptions': 'FF7F7F7F', 'Income Statement': 'FF4472C4', 'Balance Sheet': 'FF4472C4',
        'Cash Flow Statement': 'FF4472C4', 'Ratios': 'FF4472C4', 'Working Capital': 'FF8B4000',
        'Depreciation Schedule': 'FF8B4000', 'Debt Schedule': 'FF8B4000', 'CBE Banking Metrics': 'FFC0392B',
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

    // ════════════════════════════════════════════════════════
    // DOWNLOAD
    // ════════════════════════════════════════════════════════
    const buffer = await workbook.xlsx.writeBuffer();
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
