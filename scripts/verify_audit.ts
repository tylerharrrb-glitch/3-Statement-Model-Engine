// Quick verification script for audit fixes
// Run: npx tsx /tmp/verify_audit.ts

import { runFullModel } from '../lib/engines/integrator';
import { getDefaultHistoricalData, convertToHistoricalInputs } from '../types/historical';
import { getDefaultAssumptions } from '../types/assumptions';

const historicalData = getDefaultHistoricalData();
const historicalInputs = convertToHistoricalInputs(historicalData);
const assumptions = getDefaultAssumptions();
const results = runFullModel(assumptions, historicalInputs);

console.log('\n========================================');
console.log('AUDIT FIX VERIFICATION');
console.log('========================================\n');

// BUG-1: Period Labels
console.log('--- BUG-1: Period Labels ---');
results.incomeStatements.forEach((is, i) => {
    console.log(`  IS[${i}]: period="${is.period}" periodType="${is.periodType}" revenue=${is.revenue.toLocaleString()}`);
});
const period0 = results.incomeStatements[0].period;
const period1 = results.incomeStatements[1].period;
console.log(`  ✓ First period = "${period0}" (expected "2024"): ${period0 === '2024' ? 'PASS' : 'FAIL'}`);
console.log(`  ✓ Second period = "${period1}" (expected "2025"): ${period1 === '2025' ? 'PASS' : 'FAIL'}`);

// BUG-2: ROIC  
console.log('\n--- BUG-2: ROIC (should use end-of-period IC) ---');
const expectedROIC = [0.16191, 0.16058, 0.15605, 0.14888, 0.13958];
results.ratios.forEach((r, i) => {
    const bs = results.balanceSheets[i];
    const is_stmt = results.incomeStatements[i];
    const totalDebt = bs.shortTermDebt + bs.longTermDebt + bs.currentPortionLTD;
    const ic = bs.totalEquity + totalDebt;
    const nopat_manual = is_stmt.ebit * (1 - is_stmt.taxRate);
    const roic_manual = nopat_manual / ic;

    if (is_stmt.periodType === 'projected') {
        const projIdx = i - 2; // 2 historical periods
        const expected = expectedROIC[projIdx];
        const diff = Math.abs(r.roic - expected);
        console.log(`  ${r.period}: ROIC=${(r.roic * 100).toFixed(2)}% | Manual=${(roic_manual * 100).toFixed(2)}% | EBIT=${is_stmt.ebit.toFixed(0)} | NOPAT=${nopat_manual.toFixed(0)} | IC=${ic.toFixed(0)} | Expected=${(expected * 100).toFixed(2)}% | ${diff < 0.002 ? 'PASS' : 'FAIL (' + diff.toFixed(4) + ')'}`);
    } else {
        console.log(`  ${r.period}: ROIC=${(r.roic * 100).toFixed(2)}% (historical)`);
    }
});

// BUG-3: FCFF
console.log('\n--- BUG-3: FCFF (should use full NWC) ---');
const expectedFCFF = [89801, 99268, 107961, 116283, 124052];
const numHist = results.incomeStatements.filter(s => s.periodType === 'historical').length;
results.incomeStatements.forEach((is, i) => {
    if (is.periodType === 'projected') {
        const projIdx = i - numHist;
        const cf = results.cashFlowStatements[projIdx]; // CF is aligned
        const diff = Math.abs(is.fcff - expectedFCFF[projIdx]);
        console.log(`  ${is.period}: FCFF=${is.fcff.toFixed(0)} | Expected=${expectedFCFF[projIdx]} | Diff=${diff.toFixed(0)} | ${diff < 100 ? 'PASS' : 'FAIL'}`);
    }
});

// Integration Checks
console.log('\n--- Integration Checks ---');
results.integrationChecks.forEach((checks, i) => {
    console.log(`  Period ${i}: allPassed=${checks.allPassed} | passed=${checks.details.filter(d => d.passed).length}/${checks.details.length}`);
});

// Balance Check
console.log('\n--- Balance Sheet ---');
results.balanceSheets.forEach((bs, i) => {
    const diff = Math.abs(bs.totalAssets - bs.totalLiabilitiesEquity);
    console.log(`  ${bs.period}: Assets=${bs.totalAssets.toFixed(0)} | L+E=${bs.totalLiabilitiesEquity.toFixed(0)} | Diff=${diff.toExponential(2)} | ${bs.isBalanced ? 'BALANCED' : 'UNBALANCED'}`);
});

// Convergence
console.log(`\n--- Convergence: ${results.convergenceInfo.converged ? 'YES' : 'NO'} | ${results.convergenceInfo.iterations} iterations | delta=${results.convergenceInfo.finalDelta.toExponential(2)} ---`);
