'use client';

import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent, formatEPS } from '@/lib/utils';
import RevenueChart from '@/components/charts/RevenueChart';
import MarginChart from '@/components/charts/MarginChart';

export default function Dashboard() {
    const { scenarios, activeScenarioId, companyName, currency, validationReport } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    const results = scenario?.results;

    if (!results) {
        return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>No Results Yet</h2>
            <p>Click &quot;Calculate&quot; in the sidebar to run your model.</p>
        </div>;
    }

    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];
    const allChecks = results.integrationChecks.every(c => c.allPassed);
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;

    // 8 metric cards
    const metrics = [
        { label: 'Revenue', value: formatCurrency(lastIS.revenue, currency, true), sub: formatPercent(lastIS.revenueGrowthRate) + ' growth', gradient: 'var(--gradient-1)', icon: '💰' },
        { label: 'EBITDA', value: formatCurrency(lastIS.ebitda, currency, true), sub: formatPercent(lastIS.ebitda / lastIS.revenue) + ' margin', gradient: 'var(--gradient-2)', icon: '📈' },
        { label: 'Net Income', value: formatCurrency(lastIS.netIncome, currency, true), sub: formatPercent(lastIS.netMargin) + ' margin', gradient: 'var(--gradient-3)', icon: '💵' },
        { label: 'Free Cash Flow', value: formatCurrency(lastCF.freeCashFlow, currency, true), sub: `FCF yield: ${formatPercent(lastIS.revenue !== 0 ? lastCF.freeCashFlow / lastIS.revenue : 0)}`, gradient: 'var(--gradient-4)', icon: '🏦' },
        { label: 'Total Assets', value: formatCurrency(lastBS.totalAssets, currency, true), sub: `Equity: ${formatCurrency(lastBS.totalEquity, currency, true)}`, gradient: 'var(--gradient-1)', icon: '🏢' },
        { label: 'Total Debt', value: formatCurrency(totalDebt, currency, true), sub: `D/E: ${(lastBS.totalEquity !== 0 ? totalDebt / lastBS.totalEquity : 0).toFixed(2)}x`, gradient: 'var(--gradient-2)', icon: '🏛️' },
        { label: 'Net Debt', value: formatCurrency(totalDebt - lastBS.cash, currency, true), sub: totalDebt - lastBS.cash < 0 ? 'Net cash position ✓' : `${formatPercent(lastBS.totalAssets !== 0 ? (totalDebt - lastBS.cash) / lastBS.totalAssets : 0)} of assets`, gradient: 'var(--gradient-3)', icon: '📉' },
        { label: 'Total Equity', value: formatCurrency(lastBS.totalEquity, currency, true), sub: `ROE: ${formatPercent(results.ratios[results.ratios.length - 1]?.roe ?? 0)}`, gradient: 'var(--gradient-3)', icon: '📊' },
        { label: 'EPS', value: formatEPS(lastIS.eps, currency), sub: `Shares: ${(lastIS.sharesOutstanding / 1e6).toFixed(1)}M`, gradient: 'var(--gradient-4)', icon: '🎯' },
    ];

    // Integration health per period
    const periodChecks = results.integrationChecks.map((c, i) => {
        const period = results.incomeStatements[i + 1]?.period ?? `Period ${i + 1}`;
        const passed = c.details.filter(d => d.passed).length;
        const total = c.details.length;
        return { period, passed, total, allPassed: c.allPassed };
    });

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>{companyName}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{scenario?.name} — {lastIS.period} Projections</p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${allChecks ? 'badge-success' : 'badge-error'}`}>
                        {allChecks ? '✓ All 15 Checks Passed' : '✗ Integration Errors'}
                    </span>
                    <span className={`badge ${lastBS.isBalanced ? 'badge-success' : 'badge-error'}`}>
                        {lastBS.isBalanced ? '✓ Balanced' : '✗ Imbalanced'}
                    </span>
                    <span className="badge badge-info">
                        {results.convergenceInfo.converged ? `✓ Converged (${results.convergenceInfo.iterations} iter)` : '✗ Did Not Converge'}
                    </span>
                    {validationReport && (
                        <span className={`badge ${validationReport.passed ? 'badge-success' : 'badge-error'}`}>
                            {validationReport.passed
                                ? `✓ AI Audit (${validationReport.statistics.passed}/${validationReport.statistics.totalChecks})`
                                : `✗ ${validationReport.criticalErrors.length} Critical`}
                        </span>
                    )}
                </div>
            </div>

            {/* 8 Metric Cards (2 rows of 4) */}
            <div className="dashboard-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {metrics.map((m, i) => (
                    <div key={i} className="metric-card" style={{ position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, background: m.gradient, opacity: 0.08, borderRadius: '0 12px 0 80px' }} />
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{m.icon}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{m.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{m.value}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{m.sub}</div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Revenue Trend</h3>
                    <RevenueChart data={results.incomeStatements} />
                </div>
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Margin Analysis</h3>
                    <MarginChart data={results.incomeStatements} />
                </div>
            </div>

            {/* Scenario Comparison Matrix */}
            {scenarios.filter(s => s.results).length > 1 && (() => {
                const calcScenarios = scenarios.filter(s => s.results);
                const base = calcScenarios[0];
                const baseR = base.results!;
                const scMetrics = [
                    { label: 'Revenue', fn: (r: typeof baseR) => r.incomeStatements[r.incomeStatements.length - 1]?.revenue ?? 0 },
                    { label: 'EBITDA', fn: (r: typeof baseR) => r.incomeStatements[r.incomeStatements.length - 1]?.ebitda ?? 0 },
                    { label: 'Net Income', fn: (r: typeof baseR) => r.incomeStatements[r.incomeStatements.length - 1]?.netIncome ?? 0 },
                    { label: 'FCF', fn: (r: typeof baseR) => r.cashFlowStatements[r.cashFlowStatements.length - 1]?.freeCashFlow ?? 0 },
                    { label: 'Cash', fn: (r: typeof baseR) => r.balanceSheets[r.balanceSheets.length - 1]?.cash ?? 0 },
                ];
                return (
                    <div className="metric-card" style={{ marginBottom: 24 }}>
                        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Scenario Comparison (Final Projected Year)</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="fin-table">
                                <thead>
                                    <tr>
                                        <th>Metric</th>
                                        {calcScenarios.map(s => <th key={s.id}>{s.name}</th>)}
                                        {calcScenarios.length > 1 && calcScenarios.slice(1).map(s => (
                                            <th key={s.id + '-d'} style={{ color: 'var(--text-muted)' }}>Δ {s.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {scMetrics.map((m, mi) => {
                                        const baseVal = m.fn(baseR);
                                        return (
                                            <tr key={mi}>
                                                <td style={{ fontWeight: 500 }}>{m.label}</td>
                                                {calcScenarios.map(s => (
                                                    <td key={s.id}>{formatCurrency(m.fn(s.results!), currency, true)}</td>
                                                ))}
                                                {calcScenarios.slice(1).map(s => {
                                                    const delta = m.fn(s.results!) - baseVal;
                                                    const pct = baseVal !== 0 ? (delta / Math.abs(baseVal)) * 100 : 0;
                                                    return (
                                                        <td key={s.id + '-d'} style={{ color: delta >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                                            {delta >= 0 ? '+' : ''}{formatCurrency(delta, currency, true)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* Integration Health Per Period */}
            <div className="metric-card" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Integration Health by Period</h3>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {periodChecks.map((pc, i) => (
                        <div key={i} style={{
                            padding: '8px 16px',
                            borderRadius: 8,
                            background: pc.allPassed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: `1px solid ${pc.allPassed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            minWidth: 100,
                            textAlign: 'center' as const,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{pc.period}</div>
                            <div style={{
                                fontSize: 18, fontWeight: 700,
                                color: pc.allPassed ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            }}>
                                {pc.allPassed ? '✓' : '✗'}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pc.passed}/{pc.total}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Key Ratios — ALL Periods */}
            <div className="metric-card">
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Key Financial Ratios</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table className="fin-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                {results.ratios.map((r, i) => {
                                    const periodType = results.incomeStatements.find(s => s.period === r.period)?.periodType;
                                    return <th key={i} className={periodType === 'historical' ? 'col-historical' : 'col-projected'}>{r.period}</th>;
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                { label: 'ROE', fn: (r: typeof results.ratios[0]) => formatPercent(r.roe) },
                                { label: 'ROA', fn: (r: typeof results.ratios[0]) => formatPercent(r.roa) },
                                { label: 'ROIC', fn: (r: typeof results.ratios[0]) => formatPercent(r.roic) },
                                { label: 'Debt/Equity', fn: (r: typeof results.ratios[0]) => r.debtToEquity.toFixed(2) + 'x' },
                                { label: 'Current Ratio', fn: (r: typeof results.ratios[0]) => r.currentRatio.toFixed(2) + 'x' },
                                { label: 'Int. Coverage', fn: (r: typeof results.ratios[0]) => r.interestCoverage >= 50 ? '>50x' : r.interestCoverage.toFixed(1) + 'x' },
                                { label: 'Asset Turnover', fn: (r: typeof results.ratios[0]) => r.assetTurnover.toFixed(2) + 'x' },
                                { label: 'DSO', fn: (r: typeof results.ratios[0]) => r.dso.toFixed(0) + 'd' },
                                { label: 'CCC', fn: (r: typeof results.ratios[0]) => r.cashConversionCycle.toFixed(0) + 'd' },
                            ].map((row, ri) => (
                                <tr key={ri}>
                                    <td style={{ fontWeight: 500 }}>{row.label}</td>
                                    {results.ratios.map((r, i) => {
                                        const periodType = results.incomeStatements.find(s => s.period === r.period)?.periodType;
                                        return <td key={i} className={periodType === 'historical' ? 'col-historical' : 'col-projected'}>{row.fn(r)}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
