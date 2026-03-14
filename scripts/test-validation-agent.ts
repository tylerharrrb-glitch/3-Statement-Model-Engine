// ============================================================
// Test Script: AI Validation Agent (Local-Only)
// ============================================================
// Run: npx tsx scripts/test-validation-agent.ts
// ============================================================

import { FinancialValidationAgent } from '../lib/agents/validation-agent';
import { runFullModel } from '../lib/engines/integrator';
import { getDefaultAssumptions, getDefaultHistoricalInputs } from '../types/assumptions';

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AI VALIDATION AGENT — LOCAL-ONLY TEST       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Run the engine with default data
  const assumptions = getDefaultAssumptions();
  const historical = getDefaultHistoricalInputs();

  console.log('Running engine with default assumptions...');
  const results = runFullModel(assumptions, historical);
  console.log(`✓ Engine produced ${results.incomeStatements.length} IS periods, ${results.balanceSheets.length} BS periods\n`);

  // Run local-only validation (fast, free)
  const agent = new FinancialValidationAgent({
    runLocalChecksFirst: true,
    runAIChecks: false,  // Local-only for speed
  });

  console.log('Running validation...');
  const report = await agent.validate(results, assumptions, 'Base Case');

  // Print results
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  STATUS: ${report.passed ? '✅ ALL CHECKS PASSED' : '❌ VALIDATION FAILED'}`);
  console.log('═══════════════════════════════════════════════\n');
  console.log(`Summary: ${report.summary}`);
  console.log(`Runtime: ${report.durationMs}ms\n`);

  // Statistics
  console.log('── Statistics ──');
  console.log(`  Total Checks:  ${report.statistics.totalChecks}`);
  console.log(`  Passed:        ${report.statistics.passed}`);
  console.log(`  Critical:      ${report.statistics.criticalFailed}`);
  console.log(`  Major:         ${report.statistics.majorFailed}`);
  console.log(`  Advisory:      ${report.statistics.advisoryFailed}\n`);

  // Egyptian Law Compliance
  console.log('── Egyptian Law Compliance ──');
  console.log(`  EPD Compliant:       ${report.egyptianLawCompliance.epdCompliant ? '✅' : '❌'}`);
  console.log(`  Legal Reserve:       ${report.egyptianLawCompliance.legalReserveCompliant ? '✅' : '❌'}`);
  console.log(`  Dividend Base:       ${report.egyptianLawCompliance.dividendBaseCompliant ? '✅' : '❌'}`);
  console.log(`  WHT Compliant:       ${report.egyptianLawCompliance.whtCompliant ? '✅' : '❌'}`);
  console.log(`  Overall:             ${report.egyptianLawCompliance.overallCompliant ? '✅' : '❌'}\n`);

  // Critical Errors
  if (report.criticalErrors.length > 0) {
    console.log('── Critical Errors ──');
    report.criticalErrors.forEach(e => {
      console.log(`  [${e.period}] Rule ${e.rule}: ${e.field}`);
      console.log(`    ${e.explanation}`);
      console.log(`    Fix: ${e.fixInstruction}`);
      if (e.expected !== null) {
        console.log(`    Expected: ${e.expected?.toFixed(2)} | Actual: ${e.actual?.toFixed(2)}`);
      }
      console.log('');
    });
  }

  // Major Warnings
  if (report.majorWarnings.length > 0) {
    console.log('── Major Warnings ──');
    report.majorWarnings.forEach(w => {
      console.log(`  [${w.period}] Rule ${w.rule}: ${w.field}`);
      console.log(`    ${w.explanation}`);
      console.log('');
    });
  }

  // Advisory Notes
  if (report.advisoryNotes.length > 0) {
    console.log('── Advisory Notes ──');
    report.advisoryNotes.forEach(n => {
      console.log(`  [${n.period}] Rule ${n.rule}: ${n.explanation}`);
    });
    console.log('');
  }

  // Local check breakdown
  if (report.localChecksReport) {
    console.log('── Local Check Breakdown ──');
    report.localChecksReport.forEach(c => {
      const icon = c.passed ? '✅' : '❌';
      console.log(`  ${icon} ${c.checkName} (${c.findings.length} findings)`);
    });
  }

  console.log('\nDone.');
}

main().catch(console.error);
