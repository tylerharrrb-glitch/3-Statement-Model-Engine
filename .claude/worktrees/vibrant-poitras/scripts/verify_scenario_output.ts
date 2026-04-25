#!/usr/bin/env npx tsx
// ============================================================
// Verification: Scenario Output Rows vs Engine (All 3 Scenarios)
// ============================================================
// Reads the exported Excel file and verifies that the Scenarios
// sheet output rows match the engine for Base Case, Optimistic,
// and Conservative. Also verifies Dashboard IF formulas.
// ============================================================

import ExcelJS from 'exceljs';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { runFullModel } from '@/lib/engines/integrator';
import { getScenarioAssumptions, ScenarioEnum } from '@/lib/scenarios';
import * as path from 'path';

const FILE = path.resolve(__dirname, '..', 'Demo_Company_Inc__Financial_Model.xlsx');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

async function main() {
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}${CYAN}  SCENARIO OUTPUT VERIFICATION${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}\n`);

    const baseAssumptions = getDefaultAssumptions();
    const historicalInputs = getDefaultHistoricalInputs();

    // Compute engine results for all 3 scenarios
    const scenarioConfigs = [
        { name: 'Base Case', enum: ScenarioEnum.BASE },
        { name: 'Optimistic', enum: ScenarioEnum.OPTIMISTIC },
        { name: 'Conservative', enum: ScenarioEnum.CONSERVATIVE },
    ];

    interface ScenarioData {
        name: string;
        results: ReturnType<typeof runFullModel>;
    }

    const scenarios: ScenarioData[] = scenarioConfigs.map(cfg => {
        const assumptions = getScenarioAssumptions(baseAssumptions, cfg.enum);
        const results = runFullModel(assumptions, historicalInputs);
        console.log(`${GREEN}✓${RESET} Engine: ${cfg.name} (${results.incomeStatements.length} periods, converged=${results.convergenceInfo.converged})`);
        return { name: cfg.name, results };
    });

    const nYears = scenarios[0].results.incomeStatements.length;
    console.log(`\n  File: ${FILE}\n`);

    // Read the Excel file
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);

    const scenSheet = wb.getWorksheet('Scenarios');
    const dashSheet = wb.getWorksheet('Dashboard');
    if (!scenSheet) { console.error('  ✗ Scenarios sheet not found'); return; }
    if (!dashSheet) { console.error('  ✗ Dashboard sheet not found'); return; }

    // Define output metrics to check
    const outputMetrics: { key: string; label: string; getValue: (s: ScenarioData, yr: number) => number }[] = [
        { key: 'Revenue', label: 'Revenue', getValue: (s, yr) => s.results.incomeStatements[yr]?.revenue ?? 0 },
        { key: 'Gross Profit', label: 'Gross Profit', getValue: (s, yr) => s.results.incomeStatements[yr]?.grossProfit ?? 0 },
        { key: 'EBITDA', label: 'EBITDA', getValue: (s, yr) => s.results.incomeStatements[yr]?.ebitda ?? 0 },
        { key: 'EBIT', label: 'EBIT', getValue: (s, yr) => s.results.incomeStatements[yr]?.ebit ?? 0 },
        { key: 'Net Income', label: 'Net Income', getValue: (s, yr) => s.results.incomeStatements[yr]?.netIncome ?? 0 },
        { key: 'EPS', label: 'EPS', getValue: (s, yr) => s.results.incomeStatements[yr]?.eps ?? 0 },
        { key: 'Cash from Operations', label: 'CFO', getValue: (s, yr) => yr === 0 ? 0 : (s.results.cashFlowStatements[yr - 1]?.cashFromOperations ?? 0) },
        { key: 'Free Cash Flow', label: 'FCF', getValue: (s, yr) => yr === 0 ? 0 : (s.results.cashFlowStatements[yr - 1]?.freeCashFlow ?? 0) },
        { key: 'Ending Cash', label: 'Ending Cash', getValue: (s, yr) => yr === 0 ? 0 : (s.results.cashFlowStatements[yr - 1]?.endingCash ?? 0) },
        { key: 'Total Assets', label: 'Total Assets', getValue: (s, yr) => s.results.balanceSheets[yr]?.totalAssets ?? 0 },
        { key: 'Total Equity', label: 'Total Equity', getValue: (s, yr) => s.results.balanceSheets[yr]?.totalEquity ?? 0 },
        { key: 'Cash Balance', label: 'Cash', getValue: (s, yr) => s.results.balanceSheets[yr]?.cash ?? 0 },
    ];

    let passed = 0;
    let failed = 0;

    // Find each metric's row in each scenario block by scanning the Scenarios sheet
    for (const scenario of scenarios) {
        console.log(`${BOLD}${CYAN}── Checking ${scenario.name} ──${RESET}`);

        // Find the scenario block header
        let blockStart = -1;
        let blockEnd = scenSheet.rowCount + 1;

        for (let r = 1; r <= scenSheet.rowCount; r++) {
            const val = String(scenSheet.getCell(r, 1).value ?? '');
            if (val.includes('▎') && val.toUpperCase().includes(scenario.name.toUpperCase())) {
                blockStart = r;
            } else if (blockStart > 0 && val.includes('▎') && !val.toUpperCase().includes(scenario.name.toUpperCase())) {
                blockEnd = r;
                break;
            }
        }

        if (blockStart < 0) {
            console.log(`  ${RED}✗${RESET} Block for ${scenario.name} not found in Scenarios sheet`);
            failed += outputMetrics.length;
            continue;
        }

        for (const metric of outputMetrics) {
            // Find the metric row within this scenario block
            let foundRow = -1;
            for (let r = blockStart; r < blockEnd; r++) {
                const val = String(scenSheet.getCell(r, 1).value ?? '').trim();
                if (val === metric.key) {
                    foundRow = r;
                    break;
                }
            }

            if (foundRow < 0) {
                console.log(`  ${RED}✗ ${metric.label}:${RESET} row not found in ${scenario.name} block`);
                failed++;
                continue;
            }

            let allMatch = true;
            let details = '';
            for (let yr = 0; yr < nYears; yr++) {
                const expected = metric.getValue(scenario, yr);
                const actual = Number(scenSheet.getCell(foundRow, yr + 2).value) || 0;
                const diff = Math.abs(expected - actual);

                if (diff > 1.5) { // tolerance for rounding
                    details += `  yr${yr}: exp=${Math.round(expected)}, got=${Math.round(actual)}, diff=${diff.toFixed(0)} `;
                    allMatch = false;
                }
            }

            if (allMatch) {
                passed++;
            } else {
                console.log(`  ${RED}✗ ${metric.label}:${RESET} ${details}`);
                failed++;
            }
        }
        if (failed === 0) console.log(`  ${GREEN}✓ All ${outputMetrics.length} metrics match engine${RESET}`);
        console.log();
    }

    // Check Dashboard IF formulas
    console.log(`${BOLD}${CYAN}── Dashboard IF Formula Check ──${RESET}`);
    let dashOk = 0;
    let dashFail = 0;

    for (let r = 10; r <= 50; r++) {
        const label = String(dashSheet.getCell(r, 1).value ?? '').trim();
        if (!label || label.startsWith('📗') || label.startsWith('💵') || label.startsWith('🏦') || label.startsWith('📊')) continue;

        // Check projection year column (e.g., col 5 = year index 3 = first projection)
        const cell = dashSheet.getCell(r, 5);
        const cellVal = cell.value;
        let formula = '';
        if (cellVal && typeof cellVal === 'object' && 'formula' in cellVal) {
            formula = (cellVal as any).formula || '';
        }
        if (!formula) continue;

        const hasIF = formula.includes('IF(Dashboard!$B$6=');
        const hasScenarios = formula.includes('Scenarios!');

        if (hasIF && hasScenarios) {
            dashOk++;
        } else {
            console.log(`  ${RED}✗ Row ${r} (${label}):${RESET} missing IF/Scenarios ref`);
            dashFail++;
        }
    }
    console.log(`  Dashboard IF formulas: ${GREEN}${dashOk}${RESET} valid, ${dashFail > 0 ? RED : ''}${dashFail}${RESET} missing\n`);

    // Summary
    const totalPassed = passed + dashOk;
    const totalFailed = failed + dashFail;

    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}  RESULTS${RESET}`);
    console.log(`${BOLD}${CYAN}══════════════════════════════════════════════════════${RESET}\n`);
    console.log(`  Scenario output: ${passed}/${passed + failed} passed`);
    console.log(`  Dashboard IF formulas: ${dashOk} valid`);
    console.log(`\n  Total: ${totalPassed}/${totalPassed + totalFailed} passed\n`);

    if (totalFailed === 0) {
        console.log(`${BOLD}${GREEN}  ✓ ALL CHECKS PASSED — scenarios match engine${RESET}\n`);
    } else {
        console.log(`${BOLD}${RED}  ✗ SOME CHECKS FAILED${RESET}\n`);
        process.exit(1);
    }
}

main().catch(console.error);
