'use client';
import { useMemo } from 'react';
import { useModelStore } from '@/lib/store';
import { calculateDCF } from '@/lib/engines/dcf';
import { twoWaySensitivity } from '@/lib/sensitivity';
import { formatCurrency, formatPercent, CURRENCY_MAP, SupportedCurrency } from '@/lib/utils';

export default function DCFPage() {
    const { scenarios, activeScenarioId, historicalInputs, currency } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);

    // Safe defaults for DCF fields that may not exist in persisted store data
    const cbeRate = scenario?.assumptions.cbeRate ?? 0.2275;
    const beta = scenario?.assumptions.beta ?? 1.0;
    const erp = scenario?.assumptions.equityRiskPremium ?? 0.07;
    const termGrowth = scenario?.assumptions.terminalGrowthRate ?? 0.05;

    const dcf = useMemo(() => {
        if (!scenario?.results) return null;
        // Ensure DCF fields have defaults before calculating
        const safeAssumptions = {
            ...scenario.assumptions,
            cbeRate,
            beta,
            equityRiskPremium: erp,
            terminalGrowthRate: termGrowth,
        };
        return calculateDCF(safeAssumptions, scenario.results);
    }, [scenario, cbeRate, beta, erp, termGrowth]);

    const waccSensitivity = useMemo(() => {
        if (!scenario?.results || !dcf) return null;
        // WACC × Terminal Growth → implied share price
        const waccRange = [dcf.wacc - 0.04, dcf.wacc - 0.02, dcf.wacc, dcf.wacc + 0.02, dcf.wacc + 0.04];
        const gRange = [0.02, 0.03, 0.04, 0.05, 0.06];

        const matrix: number[][] = [];
        const lastCF = scenario.results.cashFlowStatements[scenario.results.cashFlowStatements.length - 1];
        const lastFCF = lastCF.freeCashFlow;
        const lastBS = scenario.results.balanceSheets[scenario.results.balanceSheets.length - 1];
        const lastIS = scenario.results.incomeStatements[scenario.results.incomeStatements.length - 1];
        const netDebt = (lastBS.shortTermDebt + lastBS.longTermDebt + lastBS.currentPortionLTD) - lastBS.cash;
        const shares = lastIS.sharesOutstanding || 1;
        const nPeriods = dcf.fcfProjections.length;

        for (const w of waccRange) {
            const row: number[] = [];
            for (const g of gRange) {
                if (w <= g) { row.push(0); continue; }
                const tv = (lastFCF * (1 + g)) / (w - g);
                const pvTV = tv / Math.pow(1 + w, nPeriods);
                const sumPV = dcf.fcfProjections.reduce((acc, fcf, i) => acc + fcf / Math.pow(1 + w, i + 1), 0);
                const ev = sumPV + pvTV;
                const equity = ev - netDebt;
                row.push(equity / shares);
            }
            matrix.push(row);
        }
        return { matrix, waccRange, gRange };
    }, [scenario, dcf]);

    if (!scenario?.results || !dcf) {
        return <div className="metric-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculate the model first to see DCF Valuation.
        </div>;
    }

    const card = { background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border-color)', marginBottom: 16 };
    const kpiStyle = { textAlign: 'center' as const, padding: '12px 0' };
    const kpiVal = { fontSize: 22, fontWeight: 700, color: 'var(--accent-emerald)' };
    const kpiLabel = { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 };

    return (
        <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>💰 DCF Valuation</h1>

            {/* WACC Builder */}
            <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>WACC Components</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
                    <div style={kpiStyle}><div style={kpiVal}>{formatPercent(dcf.costOfEquity)}</div><div style={kpiLabel}>Cost of Equity (ke)</div></div>
                    <div style={kpiStyle}><div style={kpiVal}>{formatPercent(dcf.costOfDebt)}</div><div style={kpiLabel}>Cost of Debt (kd)</div></div>
                    <div style={kpiStyle}><div style={kpiVal}>{formatPercent(dcf.equityWeight)}</div><div style={kpiLabel}>Equity Weight</div></div>
                    <div style={kpiStyle}><div style={kpiVal}>{formatPercent(dcf.debtWeight)}</div><div style={kpiLabel}>Debt Weight</div></div>
                    <div style={kpiStyle}><div style={{ ...kpiVal, color: '#fbbf24' }}>{formatPercent(dcf.wacc)}</div><div style={kpiLabel}>WACC</div></div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center' }}>
                    ke = Rf ({formatPercent(scenario.assumptions.riskFreeRate ?? 0.235)}) + β ({beta.toFixed(1)}) × ERP ({formatPercent(erp)})
                    &nbsp;|&nbsp; kd = Debt Rate × (1 − Tax)
                    &nbsp;|&nbsp; CBE: Deposit 19.00% | Lending 20.00% | Discount 19.50% (April 2, 2026)
                </div>
            </div>

            {/* Rate Warning */}
            {(() => {
                const rates: number[] = scenario.assumptions.interestRateOnDebt ?? [];
                const py = scenario.assumptions.projectionYears ?? rates.length;
                const slice = rates.slice(0, py);
                const modelDebtRate = slice.length > 0
                    ? slice.reduce((a: number, b: number) => a + b, 0) / slice.length
                    : 0.18;
                const CBE_RATE = 0.195; // CBE discount rate (April 2, 2026 MPC)
                if (modelDebtRate < 0.20) {
                    return (
                        <div style={{ ...card, borderLeft: '4px solid #f59e0b', background: 'rgba(245,158,11,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 20 }}>⚠️</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>Debt Rate Below Egyptian Market</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        Model debt rate ({formatPercent(modelDebtRate)}) is below the CBE overnight deposit rate ({formatPercent(CBE_RATE)}).
                                        Commercial lending rates are typically CBE + 2–3% spread (29–30%).
                                        Consider adjusting the debt rate in Assumptions to reflect current Egyptian market conditions.
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                }
                return null;
            })()}

            {/* FCF Projection */}
            <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>Free Cash Flow Projections</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ textAlign: 'left', padding: 8, color: 'var(--text-muted)' }}>Year</th>
                            {dcf.fcfProjections.map((_, i) => (
                                <th key={i} style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>Year {i + 1}</th>
                            ))}
                            <th style={{ textAlign: 'right', padding: 8, color: '#fbbf24' }}>Terminal</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: 8, fontWeight: 600 }}>FCFF (Unlevered)</td>
                            {dcf.fcfProjections.map((v, i) => <td key={i} style={{ textAlign: 'right', padding: 8 }}>{formatCurrency(v, currency, true)}</td>)}
                            <td style={{ textAlign: 'right', padding: 8, color: '#fbbf24' }}>—</td>
                        </tr>
                        <tr>
                            <td style={{ padding: 8, fontWeight: 600 }}>PV of FCF</td>
                            {dcf.discountedFCFs.map((v, i) => <td key={i} style={{ textAlign: 'right', padding: 8 }}>{formatCurrency(v, currency, true)}</td>)}
                            <td style={{ textAlign: 'right', padding: 8, color: '#fbbf24' }}>{formatCurrency(dcf.pvTerminalValue, currency, true)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Equity Bridge */}
            <div style={card}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-secondary)' }}>Enterprise Value → Equity Value</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
                    <div style={kpiStyle}><div style={kpiVal}>{formatCurrency(dcf.enterpriseValue, currency, true)}</div><div style={kpiLabel}>Enterprise Value</div></div>
                    <div style={kpiStyle}><div style={{ fontSize: 18, color: 'var(--text-muted)' }}>−</div></div>
                    <div style={kpiStyle}><div style={{ ...kpiVal, color: dcf.netDebt > 0 ? '#f43f5e' : '#34d399' }}>{formatCurrency(dcf.netDebt, currency, true)}</div><div style={kpiLabel}>Net Debt</div></div>
                    <div style={kpiStyle}><div style={{ fontSize: 18, color: 'var(--text-muted)' }}>=</div></div>
                    <div style={kpiStyle}><div style={kpiVal}>{formatCurrency(dcf.equityValue, currency, true)}</div><div style={kpiLabel}>Equity Value</div></div>
                </div>
                <div style={{ textAlign: 'center', marginTop: 16, padding: 16, background: 'var(--bg-primary)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Implied Share Price</div>
                    <div style={{ fontSize: 32, fontWeight: 800, background: 'var(--gradient-1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {formatCurrency(dcf.impliedSharePrice, currency)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Terminal Value: {formatCurrency(dcf.terminalValue, currency, true)} ({formatPercent(dcf.pvTerminalValue / dcf.enterpriseValue)} of EV)
                    </div>
                </div>
            </div>

            {/* WACC × Growth Sensitivity */}
            {waccSensitivity && (
                <div style={card}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
                        Implied Share Price Sensitivity (WACC × Terminal Growth)
                    </h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: 8, textAlign: 'left', color: 'var(--text-muted)' }}>WACC ↓ / g →</th>
                                {waccSensitivity.gRange.map(g => (
                                    <th key={g} style={{ padding: 8, textAlign: 'right', color: g === termGrowth ? '#fbbf24' : 'var(--text-muted)' }}>
                                        {formatPercent(g)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {waccSensitivity.matrix.map((row, wi) => {
                                const isBaseWACC = Math.abs(waccSensitivity.waccRange[wi] - dcf.wacc) < 0.001;
                                return (
                                    <tr key={wi} style={{ borderBottom: '1px solid var(--border-color)', background: isBaseWACC ? 'rgba(251, 191, 36, 0.05)' : undefined }}>
                                        <td style={{ padding: 8, fontWeight: isBaseWACC ? 700 : 400, color: isBaseWACC ? '#fbbf24' : 'var(--text-primary)' }}>
                                            {formatPercent(waccSensitivity.waccRange[wi])}
                                        </td>
                                        {row.map((v, gi) => {
                                            const isBase = isBaseWACC && Math.abs(waccSensitivity.gRange[gi] - termGrowth) < 0.001;
                                            return (
                                                <td key={gi} style={{
                                                    padding: 8, textAlign: 'right',
                                                    fontWeight: isBase ? 700 : 400,
                                                    color: v > dcf.impliedSharePrice * 1.2 ? '#34d399' : v < dcf.impliedSharePrice * 0.8 ? '#f43f5e' : 'var(--text-primary)',
                                                    background: isBase ? 'rgba(251, 191, 36, 0.15)' : undefined,
                                                }}>
                                                    {v > 0 ? `${CURRENCY_MAP[currency as SupportedCurrency]?.symbol ?? '$'}${v.toFixed(1)}` : '—'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
