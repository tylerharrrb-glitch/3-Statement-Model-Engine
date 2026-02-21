/**
 * Quick diagnostic: print periods and Optimistic key values
 * Run:  npx tsx scripts/quick-diag.ts
 */
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '@/types/assumptions';
import { getScenarioAssumptions, ScenarioEnum } from '@/lib/scenarios';
import { runFullModel } from '@/lib/engines/integrator';

const a = getScenarioAssumptions(getDefaultAssumptions(), ScenarioEnum.OPTIMISTIC);
const r = runFullModel(a, getDefaultHistoricalInputs());

console.log('=== OPTIMISTIC SCENARIO ENGINE OUTPUT ===');
console.log('\nPeriods:');
r.incomeStatements.forEach((is, i) => {
    console.log(`  [${i}] ${is.period} (${is.periodType}) — Rev: ${Math.round(is.revenue)}`);
});

console.log('\nCash Flow:');
r.cashFlowStatements.forEach((cf, i) => {
    console.log(`  [${i}] ${cf.period} (${cf.periodType}) — CFO: ${Math.round(cf.cashFromOperations)}, FCF: ${Math.round(cf.freeCashFlow)}, EndCash: ${Math.round(cf.endingCash)}, DivPaid: ${Math.round(cf.dividendsPaid)}, CapEx: ${Math.round(cf.capex)}`);
});

console.log('\nConverged:', r.convergenceInfo?.converged, 'Iters:', r.convergenceInfo?.iterations);
