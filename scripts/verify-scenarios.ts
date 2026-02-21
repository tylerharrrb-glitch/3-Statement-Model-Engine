/**
 * Verification script: confirms all 3 scenarios produce the correct engine-computed revenue values.
 * Run with: npx tsx scripts/verify-scenarios.ts
 */
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { createDefaultScenarios } from '@/lib/scenario-manager';
import { runFullModel } from '@/lib/engines/integrator';

const scenarios = createDefaultScenarios();
const hi = getDefaultHistoricalInputs();

const EXPECTED_2028_REV: Record<string, number> = {
    'Base Case': 1_344_061,
    'Optimistic Case': 1_584_464,
    'Conservative Case': 1_122_589,
};

let allPassed = true;

for (const s of scenarios) {
    const results = runFullModel(s.assumptions, hi);
    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const expected = EXPECTED_2028_REV[s.name];
    const rev = Math.round(lastIS.revenue);
    const diff = Math.abs(rev - expected);
    const match = diff <= 1;
    const icon = match ? '✅' : '❌';

    console.log(`${icon}  ${s.name.padEnd(20)} | 2028E Revenue: Engine=${rev}  Expected=${expected}  Δ=${diff}`);

    // Print all years
    for (const is of results.incomeStatements) {
        console.log(`     ${is.period}: Revenue=${Math.round(is.revenue)}, Growth=${(is.revenueGrowthRate * 100).toFixed(1)}%, GP Margin=${(is.grossMargin * 100).toFixed(1)}%`);
    }

    // Integration checks
    for (const chk of results.integrationChecks) {
        if (!chk.allPassed) {
            allPassed = false;
            console.log(`     ⚠️  Integration checks FAILED`);
            chk.details.filter(d => !d.passed).forEach(d => {
                console.log(`        ✗ ${d.name}: expected=${d.expected}, actual=${d.actual}, diff=${d.difference}`);
            });
        } else {
            console.log(`     ✓  All integration checks passed`);
        }
    }

    if (!match) allPassed = false;
    console.log('');
}

console.log(allPassed ? '\n🎉 ALL SCENARIOS MATCH!' : '\n⚠️ SOME SCENARIOS DO NOT MATCH');
process.exit(allPassed ? 0 : 1);
