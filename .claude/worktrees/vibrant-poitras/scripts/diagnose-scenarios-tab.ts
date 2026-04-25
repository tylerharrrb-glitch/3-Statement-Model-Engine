/**
 * Diagnostic: Print exactly what buildAllArrays produces for each scenario,
 * specifically the fields the user flagged (capexPercent, dividendPayoutRatio, cogsPercent).
 * 
 * Run:  npx tsx scripts/diagnose-scenarios-tab.ts
 */
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { SCENARIOS, ScenarioEnum, getScenarioAssumptions } from '@/lib/scenarios';
import { runFullModel } from '@/lib/engines/integrator';

const hi = getDefaultHistoricalInputs();
const baseAsm = getDefaultAssumptions();

console.log('=== lib/scenarios.ts GROUND TRUTH ===');
for (const [key, def] of Object.entries(SCENARIOS)) {
    console.log(`\n${def.name} (${key}):`);
    const a = def.assumptions;
    console.log(`  revenueGrowthRate: ${JSON.stringify(a.revenueGrowthRate)}`);
    console.log(`  cogsPercent:       ${JSON.stringify(a.cogsPercent)}`);
    console.log(`  sgaPercent:        ${JSON.stringify(a.sgaPercent)}`);
    console.log(`  rdPercent:         ${JSON.stringify(a.rdPercent)}`);
    console.log(`  capexPercent:      ${JSON.stringify(a.capexPercent)}`);
}

console.log('\n\n=== Merged scenario assumptions (what buildAllArrays receives) ===');
for (const scenType of [ScenarioEnum.BASE, ScenarioEnum.OPTIMISTIC, ScenarioEnum.CONSERVATIVE]) {
    const merged = getScenarioAssumptions(baseAsm, scenType);
    console.log(`\n${scenType}:`);
    console.log(`  revenueGrowthRate:    ${JSON.stringify(merged.revenueGrowthRate)}`);
    console.log(`  cogsPercent:          ${JSON.stringify(merged.cogsPercent)}`);
    console.log(`  sgaPercent:           ${JSON.stringify(merged.sgaPercent)}`);
    console.log(`  rdPercent:            ${JSON.stringify(merged.rdPercent)}`);
    console.log(`  capexPercent:         ${JSON.stringify(merged.capexPercent)}`);
    console.log(`  dividendPayoutRatio:  ${JSON.stringify(merged.dividendPayoutRatio)}`);
    console.log(`  depreciationRate:     ${JSON.stringify(merged.depreciationRate)}`);
}

console.log('\n\n=== Engine-computed results for each scenario ===');
for (const scenType of [ScenarioEnum.BASE, ScenarioEnum.OPTIMISTIC, ScenarioEnum.CONSERVATIVE]) {
    const merged = getScenarioAssumptions(baseAsm, scenType);
    const results = runFullModel(merged, hi);
    const sd = (a: number, b: number) => b !== 0 ? a / b : 0;

    console.log(`\n${scenType}:`);

    // What buildAllArrays CURRENTLY writes (the bug):  uses ...a.capexPercent, ...a.dividendPayoutRatio
    const numHist = results.incomeStatements.filter(is => is.periodType === 'historical').length;

    // CapEx% - back-calc from engine results
    const engineCapex = results.balanceSheets.map((bs, i) => {
        if (i === 0) return 0;
        const capex = bs.grossPPE - results.balanceSheets[i - 1].grossPPE;
        return sd(capex, results.incomeStatements[i]?.revenue ?? 1);
    });

    console.log(`  CapEx% from assumptions:     ${JSON.stringify(merged.capexPercent.map(v => (v * 100).toFixed(1) + '%'))}`);
    console.log(`  CapEx% from engine results:  ${JSON.stringify(engineCapex.map(v => (v * 100).toFixed(1) + '%'))}`);

    // DivPayout - engine
    const engineDivPayout = results.incomeStatements.map((is, i) => {
        const cfIdx = i - 1;
        if (cfIdx >= 0 && cfIdx < results.cashFlowStatements.length) {
            return is.netIncome !== 0 ? Math.abs(results.cashFlowStatements[cfIdx].dividendsPaid) / is.netIncome : 0;
        }
        return 0;
    });
    console.log(`  DivPayout from assumptions:  ${JSON.stringify(merged.dividendPayoutRatio.map(v => (v * 100).toFixed(1) + '%'))}`);
    console.log(`  DivPayout from engine:       ${JSON.stringify(engineDivPayout.map(v => (v * 100).toFixed(1) + '%'))}`);

    // Dividends Paid
    console.log(`  Dividends Paid (CF):         ${JSON.stringify([0, ...results.cashFlowStatements.map(cf => Math.round(cf.dividendsPaid))])}`);

    // CFO
    console.log(`  CFO:                         ${JSON.stringify([0, ...results.cashFlowStatements.map(cf => Math.round(cf.cashFromOperations))])}`);

    // Ending Cash
    console.log(`  Ending Cash:                 ${JSON.stringify([0, ...results.cashFlowStatements.map(cf => Math.round(cf.endingCash))])}`);

    // Revenue
    console.log(`  Revenue:                     ${JSON.stringify(results.incomeStatements.map(is => Math.round(is.revenue)))}`);

    // Convergence
    console.log(`  Converged: ${results.convergenceInfo?.converged ?? 'N/A'}, Iterations: ${results.convergenceInfo?.iterations ?? 'N/A'}`);
}

console.log('\n\n=== createDefaultScenarios() — what store would have ===');
const scenarios = createDefaultScenarios();
for (const s of scenarios) {
    console.log(`\n${s.name} (${s.type}):`);
    console.log(`  capexPercent:        ${JSON.stringify(s.assumptions.capexPercent)}`);
    console.log(`  dividendPayoutRatio: ${JSON.stringify(s.assumptions.dividendPayoutRatio)}`);
    console.log(`  cogsPercent:         ${JSON.stringify(s.assumptions.cogsPercent)}`);
}
