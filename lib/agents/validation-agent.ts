// ============================================================
// AI Validation Agent — Main Orchestrator
// ============================================================
// Runs local deterministic checks first (free, instant).
// Optionally calls Claude API for deeper analysis.
// Merges findings and returns a structured report.
// ============================================================

import type { ModelResults, FinancialRatios } from '@/types/financial';
import type { AssumptionSet } from '@/types/assumptions';
import { VALIDATION_AGENT_SYSTEM_PROMPT } from './validation-prompt';
import type {
  ValidationReport,
  ValidationConfig,
  LocalCheckResult,
  ValidationFinding,
} from './validation-types';
import { DEFAULT_VALIDATION_CONFIG } from './validation-types';
import { runAllLocalChecks } from './validation-rules';

// ─────────────────────────────────────────────────────
// MAIN VALIDATION AGENT CLASS
// ─────────────────────────────────────────────────────

export class FinancialValidationAgent {
  private config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  // ─── Primary entry point ───────────────────────────
  async validate(
    results: ModelResults,
    assumptions: AssumptionSet,
    scenarioName: string = 'Base Case'
  ): Promise<ValidationReport> {
    const startTime = Date.now();
    const auditId = `audit-${Date.now()}`;

    const { incomeStatements: is, balanceSheets: bs, cashFlowStatements: cf, ratios } = results;

    // PHASE 1: Fast deterministic local checks (free, instant)
    const localCheckResults: LocalCheckResult[] = [];

    if (this.config.runLocalChecksFirst) {
      localCheckResults.push(
        ...runAllLocalChecks(is, bs, cf, ratios, assumptions, scenarioName)
      );
    }

    const localCritical = localCheckResults.flatMap(r =>
      r.findings.filter(f => f.severity === 'critical')
    );
    const localMajor = localCheckResults.flatMap(r =>
      r.findings.filter(f => f.severity === 'major')
    );
    const localAdvisory = localCheckResults.flatMap(r =>
      r.findings.filter(f => f.severity === 'advisory')
    );

    // If local checks pass and we're not forced to run AI, return early
    const localPassed = localCritical.length === 0;
    if (!this.config.runAIChecks || (this.config.onlyRunAIIfLocalFails && localPassed)) {
      return this.buildReport(
        auditId, localCritical, localMajor, localAdvisory, localCheckResults,
        localCritical.length === 0,
        `Local deterministic checks ${localPassed ? 'PASSED' : 'FAILED'}. ` +
        `${localCritical.length} critical errors, ${localMajor.length} warnings, ${localAdvisory.length} advisory notes found.`,
        null, startTime
      );
    }

    // PHASE 2: AI deep-check via Claude API
    let aiReport: {
      criticalErrors?: ValidationFinding[];
      majorWarnings?: ValidationFinding[];
      advisoryNotes?: ValidationFinding[];
      summary?: string;
      egyptianLawCompliance?: ValidationReport['egyptianLawCompliance'];
    } | null = null;
    let rawAIResponse: string | undefined;

    try {
      const payload = this.buildPayload(is, bs, cf, ratios, assumptions, scenarioName);
      aiReport = await this.callClaudeAPI(payload);
      rawAIResponse = JSON.stringify(aiReport);
    } catch (error) {
      console.error('[ValidationAgent] AI check failed:', error);
      // Fall back to local results if AI fails
    }

    // Merge local + AI findings
    const aiCritical: ValidationFinding[] = aiReport?.criticalErrors ?? [];
    const aiMajor: ValidationFinding[] = aiReport?.majorWarnings ?? [];
    const aiAdvisory: ValidationFinding[] = aiReport?.advisoryNotes ?? [];

    const allCritical = this.deduplicateFindings([...localCritical, ...aiCritical]);
    const allMajor = this.deduplicateFindings([...localMajor, ...aiMajor]);
    const allAdvisory = this.deduplicateFindings([...localAdvisory, ...aiAdvisory]);

    const passed = allCritical.length === 0;
    const summary = aiReport?.summary ??
      `Validation complete. ${allCritical.length} critical errors, ${allMajor.length} warnings.`;

    return this.buildReport(
      auditId, allCritical, allMajor, allAdvisory,
      localCheckResults, passed, summary, rawAIResponse ?? null, startTime,
      aiReport?.egyptianLawCompliance
    );
  }

  // ─── Build the user message for Claude ───────────────
  private buildPayload(
    is: ModelResults['incomeStatements'],
    bs: ModelResults['balanceSheets'],
    cf: ModelResults['cashFlowStatements'],
    ratios: ModelResults['ratios'],
    assumptions: AssumptionSet,
    scenario: string
  ) {
    return {
      scenario,
      assumptions: {
        taxRate: assumptions.taxRate,
        employeeProfitSharingRate: assumptions.employeeProfitSharingRate,
        legalReservePercent: assumptions.legalReservePercent,
        paidUpCapital: assumptions.paidUpCapital,
        legalReserveCap: assumptions.legalReserveCap,
        dividendPayoutRatio: assumptions.dividendPayoutRatio,
        dividendWithholdingTaxRate: assumptions.dividendWithholdingTaxRate,
        interestRateOnDebt: assumptions.interestRateOnDebt,
        interestRateOnCash: assumptions.interestRateOnCash,
        revenueGrowthRate: assumptions.revenueGrowthRate,
        cogsPercent: assumptions.cogsPercent,
      },
      incomeStatements: is,
      balanceSheets: bs,
      cashFlows: cf,
      ratios: ratios,
    };
  }

  // ─── Claude API call ──────────────────────────────────
  private async callClaudeAPI(payload: unknown): Promise<{
    criticalErrors?: ValidationFinding[];
    majorWarnings?: ValidationFinding[];
    advisoryNotes?: ValidationFinding[];
    summary?: string;
    egyptianLawCompliance?: ValidationReport['egyptianLawCompliance'];
  }> {
    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: VALIDATION_AGENT_SYSTEM_PROMPT,
        userMessage: `Please audit this financial model data and return your analysis in the specified JSON format:\n\n${JSON.stringify(payload, null, 2)}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Validation API error: ${response.status}`);
    }

    const data = await response.json();
    // Parse JSON from Claude's text response
    const text = data.content?.[0]?.text ?? '';
    try {
      return JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks
      const match = text.match(/```(?:json)?\n?([\s\S]+?)\n?```/);
      if (match) return JSON.parse(match[1]);
      throw new Error('Could not parse AI response as JSON');
    }
  }

  // ─── Build final report ───────────────────────────────
  private buildReport(
    auditId: string,
    criticalErrors: ValidationFinding[],
    majorWarnings: ValidationFinding[],
    advisoryNotes: ValidationFinding[],
    localChecks: LocalCheckResult[],
    passed: boolean,
    summary: string,
    rawAIResponse: string | null,
    startTime: number,
    egyptianLawCompliance?: ValidationReport['egyptianLawCompliance']
  ): ValidationReport {
    const totalChecks = 40; // total rules

    return {
      auditId,
      passed,
      summary,
      criticalErrors,
      majorWarnings,
      advisoryNotes,
      statistics: {
        periodsAudited: localChecks.length > 0 ? localChecks[0].findings.length > 0 ? new Set(localChecks.flatMap(c => c.findings.map(f => f.period))).size : 7 : 7,
        scenariosAudited: 1,
        totalChecks,
        passed: totalChecks - criticalErrors.length - majorWarnings.length - advisoryNotes.length,
        criticalFailed: criticalErrors.length,
        majorFailed: majorWarnings.length,
        advisoryFailed: advisoryNotes.length,
      },
      egyptianLawCompliance: egyptianLawCompliance ?? {
        epdCompliant: !criticalErrors.some(f => f.rule === 6),
        legalReserveCompliant: !criticalErrors.some(f => f.rule === 7),
        dividendBaseCompliant: !criticalErrors.some(f => f.rule === 9),
        whtCompliant: !criticalErrors.some(f => f.rule === 10),
        overallCompliant: criticalErrors.filter(f => [6, 7, 8, 9, 10, 11].includes(f.rule)).length === 0,
      },
      rawAIResponse: rawAIResponse ?? undefined,
      localChecksReport: localChecks,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }

  // ─── Remove duplicate findings ────────────────────────
  private deduplicateFindings(findings: ValidationFinding[]): ValidationFinding[] {
    const seen = new Set<string>();
    return findings.filter(f => {
      const key = `${f.rule}-${f.period}-${f.scenario}-${f.field}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Singleton export
export const validationAgent = new FinancialValidationAgent();
