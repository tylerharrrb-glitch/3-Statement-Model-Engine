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
        return <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>
            <div style={{ fontFamily: 'var(--ff-display)', fontSize: '2rem', color: 'var(--accent-gold)', marginBottom: 16 }}>No Results Yet</div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: '.82rem' }}>Click &quot;Calc&quot; in the navbar to run your model.</p>
        </div>;
    }

    const lastIS = results.incomeStatements[results.incomeStatements.length - 1];
    const lastBS = results.balanceSheets[results.balanceSheets.length - 1];
    const lastCF = results.cashFlowStatements[results.cashFlowStatements.length - 1];
    const allChecks = results.integrationChecks.every(c => c.allPassed);
    const totalDebt = lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD;

    const metrics = [
        { label: 'Revenue', value: formatCurrency(lastIS.revenue, currency, true), sub: formatPercent(lastIS.revenueGrowthRate) + ' growth' },
        { label: 'EBITDA', value: formatCurrency(lastIS.ebitda, currency, true), sub: formatPercent(lastIS.ebitda / lastIS.revenue) + ' margin' },
        { label: 'Net Income', value: formatCurrency(lastIS.netIncome, currency, true), sub: formatPercent(lastIS.netMargin) + ' margin' },
        { label: 'Free Cash Flow', value: formatCurrency(lastCF.freeCashFlow, currency, true), sub: `FCF yield: ${formatPercent(lastIS.revenue !== 0 ? lastCF.freeCashFlow / lastIS.revenue : 0)}` },
        { label: 'Total Assets', value: formatCurrency(lastBS.totalAssets, currency, true), sub: `Equity: ${formatCurrency(lastBS.totalEquity, currency, true)}` },
        { label: 'Total Debt', value: formatCurrency(totalDebt, currency, true), sub: `D/E: ${(lastBS.totalEquity !== 0 ? totalDebt / lastBS.totalEquity : 0).toFixed(2)}x` },
        { label: 'Net Debt', value: formatCurrency(totalDebt - lastBS.cash, currency, true), sub: totalDebt - lastBS.cash < 0 ? 'Net cash position ✓' : `${formatPercent(lastBS.totalAssets !== 0 ? (totalDebt - lastBS.cash) / lastBS.totalAssets : 0)} of assets` },
        { label: 'Total Equity', value: formatCurrency(lastBS.totalEquity, currency, true), sub: `ROE: ${formatPercent(results.ratios[results.ratios.length - 1]?.roe ?? 0)}` },
        { label: 'EPS', value: formatEPS(lastIS.eps, currency), sub: `Shares: ${(lastIS.sharesOutstanding / 1e6).toFixed(1)}M` },
    ];

    const periodChecks = results.integrationChecks.map((c, i) => {
        const period = results.incomeStatements[i + 1]?.period ?? `Period ${i + 1}`;
        const passed = c.details.filter(d => d.passed).length;
        const total = c.details.length;
        return { period, passed, total, allPassed: c.allPassed };
    });

    return (
        <div>
            {/* Company header + status badges */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: 'clamp(1.4rem, 3vw, 1.8rem)', fontWeight: 700, marginBottom: 4 }}>{companyName}</h2>
                    <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--ff-mono)', fontSize: '.78rem' }}>{scenario?.name} — {lastIS.period} Projections</p>
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

            {/* Metric Cards — Gold stat styling */}
            <div className="dashboard-grid" style={{ marginBottom: 32 }}>
                {metrics.map((m, i) => (
                    <div key={i} className="stat-card">
                        <div className="stat-label">{m.label}</div>
                        <div className="stat-value">{m.value}</div>
                        <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{m.sub}</div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                <div className="card">
                    <div className="section-label" style={{ marginBottom: 12 }}>REVENUE TREND</div>
                    <RevenueChart data={results.incomeStatements} />
                </div>
                <div className="card">
                    <div className="section-label" style={{ marginBottom: 12 }}>MARGIN ANALYSIS</div>
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
                    <div className="table-card" style={{ marginBottom: 32 }}>
                        <div style={{ padding: '16px 20px 0' }}>
                            <div className="section-label">SCENARIO COMPARISON</div>
                            <div style={{ fontFamily: 'var(--ff-body)', fontSize: '.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>Final Projected Year</div>
                        </div>
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
                                            <td>{m.label}</td>
                                            {calcScenarios.map(s => (
                                                <td key={s.id}>{formatCurrency(m.fn(s.results!), currency, true)}</td>
                                            ))}
                                            {calcScenarios.slice(1).map(s => {
                                                const delta = m.fn(s.results!) - baseVal;
                                                const pct = baseVal !== 0 ? (delta / Math.abs(baseVal)) * 100 : 0;
                                                return (
                                                    <td key={s.id + '-d'} style={{ color: delta >= 0 ? 'var(--color-optimistic)' : 'var(--color-conservative)' }}>
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
                );
            })()}

            {/* Integration Health */}
            <div className="card" style={{ marginBottom: 32 }}>
                <div className="section-label" style={{ marginBottom: 16 }}>INTEGRATION HEALTH</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {periodChecks.map((pc, i) => (
                        <div key={i} style={{
                            padding: '10px 20px',
                            borderRadius: 4,
                            background: pc.allPassed ? 'rgba(74,222,128,.06)' : 'rgba(248,113,113,.06)',
                            border: `1px solid ${pc.allPassed ? 'rgba(74,222,128,.2)' : 'rgba(248,113,113,.2)'}`,
                            minWidth: 100,
                            textAlign: 'center' as const,
                        }}>
                            <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '.72rem', fontWeight: 500, marginBottom: 4, color: 'var(--text-secondary)' }}>{pc.period}</div>
                            <div style={{
                                fontFamily: 'var(--ff-display)', fontSize: '1.2rem', fontWeight: 700,
                                color: pc.allPassed ? 'var(--color-optimistic)' : 'var(--color-conservative)',
                            }}>
                                {pc.allPassed ? '✓' : '✗'}
                            </div>
                            <div style={{ fontFamily: 'var(--ff-mono)', fontSize: '.65rem', color: 'var(--text-muted)' }}>{pc.passed}/{pc.total}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Key Ratios */}
            <div className="table-card">
                <div style={{ padding: '16px 20px 0' }}>
                    <div className="section-label">KEY FINANCIAL RATIOS</div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table className="fin-table" style={{ marginTop: 12 }}>
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
                                    <td>{row.label}</td>
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
