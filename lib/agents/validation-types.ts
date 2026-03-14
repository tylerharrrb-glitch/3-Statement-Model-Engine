// ============================================================
// AI Validation Agent — Type Definitions
// ============================================================

export type Severity = 'critical' | 'major' | 'advisory';

export interface ValidationFinding {
  rule: number;
  severity: Severity;
  period: string;
  scenario: string;
  field: string;
  expected: number | null;
  actual: number;
  difference?: number;
  explanation: string;
  fixInstruction: string;
}

export interface EgyptianLawCompliance {
  epdCompliant: boolean;
  legalReserveCompliant: boolean;
  dividendBaseCompliant: boolean;
  whtCompliant: boolean;
  overallCompliant: boolean;
}

export interface ValidationStatistics {
  periodsAudited: number;
  scenariosAudited: number;
  totalChecks: number;
  passed: number;
  criticalFailed: number;
  majorFailed: number;
  advisoryFailed: number;
}

export interface ValidationReport {
  auditId: string;
  passed: boolean;
  summary: string;
  criticalErrors: ValidationFinding[];
  majorWarnings: ValidationFinding[];
  advisoryNotes: ValidationFinding[];
  statistics: ValidationStatistics;
  egyptianLawCompliance: EgyptianLawCompliance;
  rawAIResponse?: string;
  localChecksReport?: LocalCheckResult[];
  timestamp: string;
  durationMs: number;
}

export interface LocalCheckResult {
  checkName: string;
  passed: boolean;
  findings: ValidationFinding[];
}

export interface ValidationConfig {
  blockExportOnCritical: boolean;
  runLocalChecksFirst: boolean;
  runAIChecks: boolean;
  onlyRunAIIfLocalFails: boolean;
  scenarios: ('base' | 'optimistic' | 'conservative')[];
  tolerance: number;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  blockExportOnCritical: true,
  runLocalChecksFirst: true,
  runAIChecks: true,
  onlyRunAIIfLocalFails: true,  // Free when model is clean
  scenarios: ['base', 'optimistic', 'conservative'],
  tolerance: 0.01,
};
