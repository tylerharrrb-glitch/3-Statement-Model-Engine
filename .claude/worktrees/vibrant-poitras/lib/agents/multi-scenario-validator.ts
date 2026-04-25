// ============================================================
// Multi-Scenario Validation Agent
// ============================================================
// Validates all three scenarios in parallel, plus cross-scenario
// sanity checks (revenue/NI ordering).
// ============================================================

import { validationAgent } from './validation-agent';
import type { ModelResults } from '@/types/financial';
import type { AssumptionSet } from '@/types/assumptions';
import type { ValidationReport } from './validation-types';

export interface CrossScenarioCheck {
  metric: string;
  period: string;
  baseValue: number;
  optimisticValue: number;
  conservativeValue: number;
  passed: boolean;
  issue?: string;
}

export interface MultiScenarioValidationReport {
  allPassed: boolean;
  base: ValidationReport;
  optimistic: ValidationReport;
  conservative: ValidationReport;
  crossScenarioChecks: CrossScenarioCheck[];
  summary: string;
}

export async function validateAllScenarios(
  baseResults: ModelResults,
  optResults: ModelResults,
  conResults: ModelResults,
  baseAssumptions: AssumptionSet,
  optAssumptions: AssumptionSet,
  conAssumptions: AssumptionSet
): Promise<MultiScenarioValidationReport> {

  const [baseReport, optReport, conReport] = await Promise.all([
    validationAgent.validate(baseResults, baseAssumptions, 'Base Case'),
    validationAgent.validate(optResults, optAssumptions, 'Optimistic'),
    validationAgent.validate(conResults, conAssumptions, 'Conservative'),
  ]);

  // Cross-scenario sanity checks
  const crossChecks = runCrossScenarioChecks(baseResults, optResults, conResults);

  const allPassed = baseReport.passed && optReport.passed && conReport.passed
    && crossChecks.every(c => c.passed);

  return {
    allPassed,
    base: baseReport,
    optimistic: optReport,
    conservative: conReport,
    crossScenarioChecks: crossChecks,
    summary: `All-scenario validation: ${allPassed ? 'PASSED' : 'FAILED'}. ` +
      `Base: ${baseReport.passed ? '✅' : '❌'} | ` +
      `Optimistic: ${optReport.passed ? '✅' : '❌'} | ` +
      `Conservative: ${conReport.passed ? '✅' : '❌'}`,
  };
}

function runCrossScenarioChecks(
  base: ModelResults,
  opt: ModelResults,
  con: ModelResults
): CrossScenarioCheck[] {
  const checks: CrossScenarioCheck[] = [];
  const projPeriods = base.incomeStatements.filter(p => p.periodType === 'projected');

  for (const period of projPeriods) {
    const optIS = opt.incomeStatements.find(p => p.period === period.period);
    const conIS = con.incomeStatements.find(p => p.period === period.period);
    if (!optIS || !conIS) continue;

    // Check: Optimistic NI > Base NI > Conservative NI
    const niCheck = optIS.netIncome > period.netIncome && period.netIncome > conIS.netIncome;
    checks.push({
      metric: 'Net Income Ordering',
      period: period.period,
      baseValue: period.netIncome,
      optimisticValue: optIS.netIncome,
      conservativeValue: conIS.netIncome,
      passed: niCheck,
      issue: niCheck ? undefined : 'Scenario ordering violated: Optimistic NI should > Base NI > Conservative NI',
    });

    // Check: Optimistic Revenue > Base Revenue > Conservative Revenue
    const revCheck = optIS.revenue > period.revenue && period.revenue > conIS.revenue;
    checks.push({
      metric: 'Revenue Ordering',
      period: period.period,
      baseValue: period.revenue,
      optimisticValue: optIS.revenue,
      conservativeValue: conIS.revenue,
      passed: revCheck,
      issue: revCheck ? undefined : 'Revenue scenario ordering violated',
    });
  }

  return checks;
}
