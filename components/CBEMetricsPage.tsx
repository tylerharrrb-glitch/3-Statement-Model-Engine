'use client';

import React from 'react';
import { useModelStore } from '@/lib/store';

const CBE_POLICY_RATE = 0.2725; // Q1 2026

// ── 3-Tier Threshold System ──────────────────────────
type Tier = 'strong' | 'adequate' | 'weak';

interface TieredThreshold {
    greenThreshold: number;   // ≥ this = GREEN (or ≤ for inverted)
    amberThreshold: number;   // ≥ this = AMBER (or ≤ for inverted)
    direction: 'above' | 'below';  // 'above' = higher is better, 'below' = lower is better
}

function getTier(value: number, t: TieredThreshold): Tier {
    if (t.direction === 'above') {
        if (value >= t.greenThreshold) return 'strong';
        if (value >= t.amberThreshold) return 'adequate';
        return 'weak';
    }
    // direction === 'below': lower is better
    if (value <= t.greenThreshold) return 'strong';
    if (value <= t.amberThreshold) return 'adequate';
    return 'weak';
}

const TIER_COLORS: Record<Tier, string> = {
    strong: '#22c55e',
    adequate: '#f59e0b',
    weak: '#ef4444',
};
const TIER_BG: Record<Tier, string> = {
    strong: 'rgba(34,197,94,0.08)',
    adequate: 'rgba(245,158,11,0.08)',
    weak: 'rgba(239,68,68,0.08)',
};
const TIER_ICON: Record<Tier, string> = {
    strong: '✓',
    adequate: '⚠',
    weak: '✗',
};
const TIER_LABEL: Record<Tier, string> = {
    strong: 'Strong',
    adequate: 'Adequate',
    weak: 'Weak',
};

// ── Metric Definitions ────────────────────────────────
interface CBEMetric {
    label: string;
    compute: (yr: number) => number;
    threshold: TieredThreshold;
    unit: 'x' | '%';
    description: string;
    isSecondary?: boolean;  // secondary/alternative metric (display but don't count)
}

export default function CBEMetricsPage() {
    const { scenarios, activeScenarioId } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const results = scenario?.results;
    const a = scenario?.assumptions;

    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const is = results.incomeStatements;
    const bs = results.balanceSheets;
    const cf = results.cashFlowStatements;
    const nYears = is.length;

    const sd = (n: number, d: number) => d !== 0 ? n / d : 0;

    const totalDebt = (yr: number) => (bs[yr]?.shortTermDebt ?? 0) + (bs[yr]?.currentPortionLTD ?? 0) + (bs[yr]?.longTermDebt ?? 0);
    const ebitda = (yr: number) => (is[yr]?.ebit ?? 0) + (is[yr]?.depreciation ?? 0) + (is[yr]?.amortization ?? 0);

    // CF array is 1 shorter than IS/BS (historical CF requires 2 consecutive BS periods).
    // IS[0]=2024 has no CF entry; IS[1]=2025 maps to CF[0]; IS[6]=2030E maps to CF[5].
    const cfForYear = (yr: number) => cf[yr - 1] ?? null;

    // ── Core CBE Metrics (with corrected formulas) ────────
    const metrics: CBEMetric[] = [
        // 1. Interest Coverage Ratio (EBIT-based — primary)
        {
            label: 'Interest Coverage (EBIT)',
            compute: yr => sd(is[yr]?.ebit ?? 0, is[yr]?.interestExpense ?? 0),
            threshold: { greenThreshold: 2.50, amberThreshold: 1.50, direction: 'above' },
            unit: 'x',
            description: 'EBIT / Interest Expense — Egypt-calibrated tiered thresholds',
        },
        // ICR (EBITDA-based — secondary, IMP #5)
        {
            label: 'Interest Coverage (EBITDA)',
            compute: yr => sd(ebitda(yr), is[yr]?.interestExpense ?? 0),
            threshold: { greenThreshold: 3.00, amberThreshold: 2.00, direction: 'above' },
            unit: 'x',
            description: 'EBITDA / Interest Expense — cash-adjusted interest coverage',
            isSecondary: true,
        },
        // 2. DSCR (EBITDA-based — FIX #1: was NI+D&A, now EBITDA)
        {
            label: 'DSCR (EBITDA)',
            compute: yr => {
                const eb = ebitda(yr);
                const c = cfForYear(yr);
                const debtService = Math.abs(c?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0);
                return debtService > 0 ? eb / debtService : 0;
            },
            threshold: { greenThreshold: 1.50, amberThreshold: 1.10, direction: 'above' },
            unit: 'x',
            description: 'EBITDA / (Interest + Principal) — Egyptian banking standard',
        },
        // DSCR (CFO-based — secondary, more conservative)
        {
            label: 'DSCR (CFO)',
            compute: yr => {
                const c = cfForYear(yr);
                const cfo = c?.cashFromOperations ?? 0;
                const debtService = Math.abs(c?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0);
                return debtService > 0 ? cfo / debtService : 0;
            },
            threshold: { greenThreshold: 1.20, amberThreshold: 0.90, direction: 'above' },
            unit: 'x',
            description: 'Cash From Operations / Total Debt Service — most conservative',
            isSecondary: true,
        },
        // 3. Debt-to-Equity
        {
            label: 'Debt-to-Equity',
            compute: yr => sd(totalDebt(yr), bs[yr]?.totalEquity ?? 0),
            threshold: { greenThreshold: 1.50, amberThreshold: 2.00, direction: 'below' },
            unit: 'x',
            description: 'Total Debt / Total Equity — ≤1.50x strong, ≤2.00x adequate',
        },
        // 4. Current Ratio
        {
            label: 'Current Ratio',
            compute: yr => sd(bs[yr]?.totalCurrentAssets ?? 0, bs[yr]?.totalCurrentLiabilities ?? 0),
            threshold: { greenThreshold: 1.50, amberThreshold: 1.20, direction: 'above' },
            unit: 'x',
            description: 'TCA / TCL — ≥1.50x strong liquidity',
        },
        // 5. Net Debt / EBITDA
        {
            label: 'Net Debt / EBITDA',
            compute: yr => {
                const nd = totalDebt(yr) - (bs[yr]?.cash ?? 0);
                const eb = ebitda(yr);
                // Negative net debt (net cash) is always strong
                if (nd <= 0) return nd / Math.max(eb, 1); // preserve sign, avoid /0
                return eb !== 0 ? nd / eb : 99;
            },
            threshold: { greenThreshold: 2.00, amberThreshold: 3.50, direction: 'below' },
            unit: 'x',
            description: '(Total Debt − Cash) / EBITDA — negative = net cash position',
        },
        // IMP #7a: Equity Ratio
        {
            label: 'Equity Ratio',
            compute: yr => sd(bs[yr]?.totalEquity ?? 0, bs[yr]?.totalAssets ?? 0),
            threshold: { greenThreshold: 0.35, amberThreshold: 0.20, direction: 'above' },
            unit: '%',
            description: 'Total Equity / Total Assets — self-funding measure',
            isSecondary: true,
        },
        // IMP #7d: FCF Coverage
        {
            label: 'FCF Coverage',
            compute: yr => {
                const c = cfForYear(yr);
                const fcf = c?.freeCashFlow ?? 0;
                const debtService = Math.abs(c?.debtRepayment ?? 0) + (is[yr]?.interestExpense ?? 0);
                return debtService > 0 ? fcf / debtService : 0;
            },
            threshold: { greenThreshold: 1.00, amberThreshold: 0.70, direction: 'above' },
            unit: 'x',
            description: 'Free Cash Flow / Total Debt Service — strictest test',
            isSecondary: true,
        },
    ];

    // Primary metrics (counted in summary)
    const primaryMetrics = metrics.filter(m => !m.isSecondary);

    // ── Summary Counts (IMP #9) ────────────────────────
    const tierCounts = { strong: 0, adequate: 0, weak: 0 };
    const totalChecks = primaryMetrics.length * nYears;

    primaryMetrics.forEach(m => {
        for (let yr = 0; yr < nYears; yr++) {
            const val = m.compute(yr);
            const tier = getTier(val, m.threshold);
            tierCounts[tier]++;
        }
    });

    const passRate = totalChecks > 0
        ? ((tierCounts.strong + tierCounts.adequate) / totalChecks * 100).toFixed(0)
        : '0';

    // ── Format helper ─────────────────────────────────
    const formatVal = (v: number, unit: string) => {
        if (unit === 'x') return v >= 100 || v <= -100 ? 'N/A' : v.toFixed(2) + 'x';
        if (unit === '%') return (v * 100).toFixed(1) + '%';
        return v.toFixed(2);
    };

    // ── Model vs Market analysis ──────────────────────
    const modelDebtRate = a?.interestRateOnDebt?.[0] ?? 0;
    const debtRateWarning = modelDebtRate < 0.20;
    const impliedSpread = modelDebtRate - CBE_POLICY_RATE;
    const scenarioType = scenario?.type ?? 'base';
    const scenarioName = scenario?.name ?? 'Base Case';

    // Tax rate validation (IMP #1)
    const projectedTaxRates = is.filter(s => s.periodType === 'projected').map(s => s.taxRate);
    const lowTaxRate = projectedTaxRates.find(r => r < 0.20);
    const taxRateWarning = lowTaxRate !== undefined;

    // Break-even interest rate: what rate would cause ICR to fall to 1.5x?
    const projIS = is.filter(s => s.periodType === 'projected');
    const projBS = bs.filter(s => s.periodType === 'projected');
    const firstProjIdx = is.findIndex(s => s.periodType === 'projected');
    const breakEvenRate = firstProjIdx >= 0 && totalDebt(firstProjIdx) > 0
        ? (is[firstProjIdx].ebit / (totalDebt(firstProjIdx) * 1.5))
        : null;

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>🏦 CBE Banking Metrics</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                Central Bank of Egypt-aligned credit metrics with 3-tier compliance scoring
            </p>

            {/* Summary Cards (IMP #9: STRONG/WARNINGS/FAILURES) */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(5, 1fr)' }}>
                <div className="metric-card" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Checks</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{totalChecks}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{primaryMetrics.length} metrics × {nYears} periods</div>
                </div>
                <div className="metric-card" style={{ borderLeft: '4px solid #22c55e' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Strong</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: '#22c55e' }}>{tierCounts.strong}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>All thresholds exceeded</div>
                </div>
                <div className="metric-card" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Warnings</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: tierCounts.adequate > 0 ? '#f59e0b' : '#22c55e' }}>{tierCounts.adequate}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Adequate but monitor</div>
                </div>
                <div className="metric-card" style={{ borderLeft: `4px solid ${tierCounts.weak === 0 ? '#22c55e' : '#ef4444'}` }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Failed</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: tierCounts.weak === 0 ? '#22c55e' : '#ef4444' }}>{tierCounts.weak}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tierCounts.weak === 0 ? 'All clear!' : 'Below minimum'}</div>
                </div>
                <div className="metric-card" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Pass Rate</div>
                    <div style={{ fontSize: 28, fontWeight: 700 }}>{passRate}%</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Above minimum threshold</div>
                </div>
            </div>

            {/* Scenario Risk Commentary (IMP #8) */}
            {tierCounts.weak > 0 ? (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #ef4444', background: 'rgba(239,68,68,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{scenarioName} Risk Alert</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                This scenario shows {tierCounts.weak} metric{tierCounts.weak > 1 ? 's' : ''} below minimum thresholds,
                                indicating potential debt service difficulties.
                                {scenarioType === 'conservative' && (
                                    <> This is expected in a conservative downside scenario and represents genuine financial risk
                                        that should be considered in credit decisions.</>
                                )}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                                <strong>Mitigation options:</strong> (1) Debt reduction/early repayment, (2) Refinancing to longer tenor,
                                (3) Revenue enhancement, (4) Cost restructuring to improve EBIT margins.
                            </div>
                        </div>
                    </div>
                </div>
            ) : tierCounts.adequate > 0 ? (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>ℹ️</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{scenarioName} Credit Profile: Adequate</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                All metrics meet minimum thresholds. {tierCounts.adequate} metric{tierCounts.adequate > 1 ? 's are' : ' is'} in
                                the adequate (amber) zone — typically due to the transition from historical effective debt rates (~4.5%)
                                to projected market rates ({((modelDebtRate) * 100).toFixed(0)}%).
                                From later projection years, all metrics return to the strong zone.
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #22c55e', background: 'rgba(34,197,94,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>✅</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{scenarioName} Credit Profile: Strong</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                All {totalChecks} checks in the strong zone. Company demonstrates comfortable debt service capacity.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tax Rate Validation Warning (IMP #1) */}
            {taxRateWarning && (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #ef4444', background: 'rgba(239,68,68,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>🚨</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Tax Rate Below 20% Detected</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                Projected tax rate is {((lowTaxRate ?? 0) * 100).toFixed(1)}% — Egyptian corporate income tax is 22.5%
                                per ETL 91/2005 Art. 47. Verify this is intentional (e.g., free zone entity, tax holiday, BOT incentive).
                                NI-based metrics may be overstated if tax rate is incorrectly low.
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Debt Rate Warning */}
            {debtRateWarning && (
                <div className="metric-card" style={{ marginBottom: 20, borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 20 }}>⚠️</span>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>Debt Rate Below Market</div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                Model debt rate ({(modelDebtRate * 100).toFixed(1)}%) is below CBE overnight rate ({(CBE_POLICY_RATE * 100).toFixed(2)}%).
                                Commercial lending rates are typically CBE + 2–3% spread (29–30%).
                                {modelDebtRate > 0 && <> Implied credit spread: {(impliedSpread * 100).toFixed(1)}% — {impliedSpread < 0 ? 'below CBE rate (implies subsidized/legacy debt)' : 'above CBE rate'}.</>}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Compliance Matrix — 3-Tier Heat Map */}
            <div className="metric-card" style={{ overflow: 'auto', marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--text-secondary)' }}>Compliance Matrix</h3>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
                    <span style={{ color: '#22c55e' }}>● Strong</span> &nbsp;
                    <span style={{ color: '#f59e0b' }}>● Adequate</span> &nbsp;
                    <span style={{ color: '#ef4444' }}>● Weak</span> &nbsp;
                    {metrics.some(m => m.isSecondary) && <span style={{ fontStyle: 'italic' }}>· Italicized = secondary (not counted in summary)</span>}
                </div>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th style={{ minWidth: 200 }}>Metric</th>
                            <th style={{ minWidth: 120 }}>Thresholds</th>
                            {is.map(s => <th key={s.period}>{s.period}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.map(metric => (
                            <tr key={metric.label} style={metric.isSecondary ? { fontStyle: 'italic', opacity: 0.85 } : undefined}>
                                <td style={{ fontWeight: metric.isSecondary ? 400 : 500 }}>
                                    {metric.isSecondary && '↳ '}{metric.label}
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, fontStyle: 'normal' }}>{metric.description}</div>
                                </td>
                                <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                                    <div style={{ color: '#22c55e' }}>
                                        {metric.threshold.direction === 'above' ? '≥' : '≤'} {metric.unit === '%' ? (metric.threshold.greenThreshold * 100).toFixed(0) + '%' : metric.threshold.greenThreshold.toFixed(2) + 'x'}
                                    </div>
                                    <div style={{ color: '#f59e0b' }}>
                                        {metric.threshold.direction === 'above' ? '≥' : '≤'} {metric.unit === '%' ? (metric.threshold.amberThreshold * 100).toFixed(0) + '%' : metric.threshold.amberThreshold.toFixed(2) + 'x'}
                                    </div>
                                </td>
                                {Array.from({ length: nYears }, (_, yr) => {
                                    const val = metric.compute(yr);
                                    const tier = getTier(val, metric.threshold);
                                    return (
                                        <td key={yr} style={{
                                            textAlign: 'center',
                                            fontWeight: 600,
                                            color: TIER_COLORS[tier],
                                            background: TIER_BG[tier],
                                        }}>
                                            <div>{TIER_ICON[tier]} {formatVal(val, metric.unit)}</div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Market Reference Rates (IMP #6: Enhanced) */}
            <div className="metric-card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Market Reference Rates</h3>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Rate</th>
                            <th>Value</th>
                            <th>Source / Note</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ fontWeight: 500 }}>CBE Overnight Deposit Rate</td>
                            <td style={{ textAlign: 'right' }}>{(CBE_POLICY_RATE * 100).toFixed(2)}%</td>
                            <td style={{ color: 'var(--text-muted)' }}>CBE Q1 2026</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Commercial Lending Rate</td>
                            <td style={{ textAlign: 'right' }}>29–30%</td>
                            <td style={{ color: 'var(--text-muted)' }}>CBE + 2–3% spread</td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Savings Certificate Rate</td>
                            <td style={{ textAlign: 'right' }}>22–25%</td>
                            <td style={{ color: 'var(--text-muted)' }}>Major Egyptian banks</td>
                        </tr>
                        <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                            <td style={{ fontWeight: 500 }}>Model Debt Rate</td>
                            <td style={{ textAlign: 'right', color: debtRateWarning ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                                {(modelDebtRate * 100).toFixed(1)}%
                                {debtRateWarning && ' ⚠'}
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>
                                User assumption — {modelDebtRate > 0 ? `${((1 - modelDebtRate / 0.295) * 100).toFixed(0)}% below commercial rate` : 'not set'}
                            </td>
                        </tr>
                        <tr>
                            <td style={{ fontWeight: 500 }}>Implied Credit Spread vs CBE</td>
                            <td style={{ textAlign: 'right', color: impliedSpread < 0 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                                {impliedSpread >= 0 ? '+' : ''}{(impliedSpread * 100).toFixed(1)}%
                            </td>
                            <td style={{ color: 'var(--text-muted)' }}>
                                {impliedSpread < 0 ? '⚠ Below CBE rate — implies subsidized/legacy debt' : 'Model rate above CBE — reasonable spread'}
                            </td>
                        </tr>
                        {breakEvenRate !== null && (
                            <tr>
                                <td style={{ fontWeight: 500 }}>Break-Even Interest Rate</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                    {(breakEvenRate * 100).toFixed(1)}%
                                </td>
                                <td style={{ color: 'var(--text-muted)' }}>
                                    Rate at which ICR falls to 1.5x — {breakEvenRate > modelDebtRate ? `${((breakEvenRate - modelDebtRate) * 100).toFixed(0)}pp headroom` : 'already breached'}
                                </td>
                            </tr>
                        )}
                        <tr>
                            <td style={{ fontWeight: 500 }}>Corporate Tax Rate (ETA)</td>
                            <td style={{ textAlign: 'right' }}>22.5%</td>
                            <td style={{ color: 'var(--text-muted)' }}>Egyptian Tax Authority standard</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Interest Rate Note */}
            <div className="metric-card" style={{ marginBottom: 20, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Interest Rate Transition Note:</strong> Historical interest expense reflects the company&apos;s actual locked-in rates (~4–5%).
                Projected years use the model debt rate assumption ({(modelDebtRate * 100).toFixed(1)}%). If existing loans have fixed rates,
                use per-year interest rate inputs in the Debt Assumptions section (already available as per-year arrays) to model a gradual
                transition from historical to market rates.
            </div>

            {/* ETA Compliance Note */}
            <div className="metric-card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong>Methodology Note:</strong> DSCR uses EBITDA / (Interest + Principal) per Egyptian banking practice (CBE/CIB credit methodology).
                ICR thresholds are calibrated for Egypt&apos;s high-rate environment — CBE does not mandate a specific ICR threshold for corporate borrowers.
                Tiers: Strong (≥2.50x), Adequate (1.50–2.49x), Weak (&lt;1.50x). Revenue figures exclude 14% VAT (Law 67/2016).
            </div>
        </div>
    );
}
