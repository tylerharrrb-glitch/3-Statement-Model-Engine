'use client';

import { useModelStore } from '@/lib/store';
import { EGYPTIAN_TAX_DEPRECIATION_RATES } from '@/lib/schedules/egyptian-depreciation';
import { FISCAL_YEAR_PRESETS } from '@/lib/schedules/egyptian-depreciation';
import { SECTOR_WC_PRESETS } from '@/lib/engines/valuation';

export default function EgyptianSettings() {
    const { scenarios, activeScenarioId, updateAssumption, setCountryPreset } = useModelStore();
    const scenario = scenarios.find(s => s.id === activeScenarioId);
    if (!scenario) return null;

    const a = scenario.assumptions;
    const isEgypt = a.countryPreset === 'egypt';

    const applySectorPreset = (sectorKey: string) => {
        const preset = SECTOR_WC_PRESETS[sectorKey];
        if (!preset) return;
        const fill = (v: number) => Array(a.projectionYears).fill(v);
        updateAssumption('dso', fill(preset.dso));
        updateAssumption('dio', fill(preset.dio));
        updateAssumption('dpo', fill(preset.dpo));
        // Store sectorPreset directly on assumptions via setState
        const store = useModelStore.getState();
        const updatedScenarios = store.scenarios.map(s =>
            s.id === activeScenarioId
                ? { ...s, assumptions: { ...s.assumptions, sectorPreset: sectorKey as typeof a.sectorPreset } }
                : s
        );
        useModelStore.setState({ scenarios: updatedScenarios });
    };

    return (
        <div className="metric-card" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--accent-blue)' }}>
                🇪🇬 Egyptian Market Settings
            </h3>

            {/* Country Preset */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 500, minWidth: 120 }}>Country Preset</label>
                <select
                    className="fin-select"
                    value={a.countryPreset || 'us'}
                    onChange={(e) => setCountryPreset(e.target.value as 'us' | 'egypt' | 'custom')}
                    style={{ flex: 1 }}
                >
                    <option value="us">🇺🇸 United States</option>
                    <option value="egypt">🇪🇬 Egypt</option>
                    <option value="custom">⚙️ Custom</option>
                </select>
            </div>

            {/* Sector WC Preset */}
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Working Capital Sector Preset
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Sector</label>
                    <select
                        className="fin-select"
                        value={a.sectorPreset || 'technology'}
                        onChange={(e) => applySectorPreset(e.target.value)}
                        style={{ flex: 1 }}
                    >
                        {Object.entries(SECTOR_WC_PRESETS).map(([key, p]) => (
                            <option key={key} value={key}>{p.label} (DSO:{p.dso} / DIO:{p.dio} / DPO:{p.dpo})</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* VAT Settings */}
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    VAT Settings
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Enable VAT</label>
                    <input
                        type="checkbox"
                        checked={a.enableVAT || false}
                        onChange={(e) => updateAssumption('enableVAT', e.target.checked ? 1 : 0)}
                        style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {a.enableVAT ? `Active at ${((a.vatRate || 0) * 100).toFixed(0)}%` : 'Disabled'}
                    </span>
                </div>
                {a.enableVAT && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: 13, minWidth: 120 }}>VAT Rate (%)</label>
                        <input
                            className="fin-input"
                            type="number"
                            step="0.1"
                            value={((a.vatRate || 0) * 100).toFixed(1)}
                            onChange={(e) => updateAssumption('vatRate', parseFloat(e.target.value) / 100 || 0)}
                            style={{ width: 80, textAlign: 'right' }}
                        />
                    </div>
                )}
            </div>

            {/* Tax Settings */}
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Tax Rates {isEgypt && <span style={{ color: 'var(--accent-emerald)' }}>· Egyptian Defaults Applied</span>}
                </div>

                {/* Tax Regime */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Tax Regime</label>
                    <select
                        className="fin-select"
                        value={a.taxRegime || 'standard'}
                        onChange={(e) => {
                            const regime = e.target.value;
                            const rateMap: Record<string, number> = {
                                standard: 0.225, oil: 0.4055, strategic: 0.40, sme: 0.015,
                            };
                            updateAssumption('taxRegime', regime === 'standard' ? 0 : regime === 'oil' ? 1 : regime === 'strategic' ? 2 : 3);
                            const rate = rateMap[regime] ?? 0.225;
                            updateAssumption('taxRate', a.taxRate.map(() => rate));
                        }}
                        style={{ flex: 1 }}
                    >
                        <option value="standard">Standard (22.5%) — Income Tax Law 91/2005</option>
                        <option value="oil">Oil Exploration (40.55%)</option>
                        <option value="strategic">Strategic Entities (40%)</option>
                        <option value="sme">SME Turnover Tax (Law 6/2025)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Corporate Tax (%)</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="0.1"
                        min="10"
                        value={((a.taxRate[0] || 0) * 100).toFixed(1)}
                        onChange={(e) => {
                            let val = parseFloat(e.target.value) / 100 || 0;
                            // Prevent clearly erroneous rates (< 10%)
                            if (val > 0 && val < 0.10) val = 0.225;
                            const newRates = a.taxRate.map(() => val);
                            updateAssumption('taxRate', newRates);
                        }}
                        style={{ width: 80, textAlign: 'right', borderColor: (a.taxRate[0] || 0) < 0.20 ? '#ef4444' : undefined }}
                    />
                    <span style={{ fontSize: 11, color: (a.taxRate[0] || 0) < 0.20 ? '#ef4444' : 'var(--text-muted)' }}>
                        {(a.taxRate[0] || 0) < 0.20
                            ? '⚠ Below 20% — Egyptian CIT is 22.5% (ETL 91/2005)'
                            : 'Source: Income Tax Law No. 91/2005'}
                    </span>
                </div>

                {/* EGX Listing Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Listed on EGX?</label>
                    <input
                        type="checkbox"
                        checked={a.isEGXListed || false}
                        onChange={(e) => {
                            const listed = e.target.checked;
                            updateAssumption('isEGXListed', listed ? 1 : 0);
                            updateAssumption('dividendWithholdingTaxRate', listed ? 0.05 : 0.10);
                        }}
                        style={{ width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {a.isEGXListed ? 'WHT: 5% (Law 30/2023)' : 'WHT: 10% (unlisted)'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Div. Withholding (%)</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="0.1"
                        value={((a.dividendWithholdingTaxRate || 0) * 100).toFixed(1)}
                        onChange={(e) => updateAssumption('dividendWithholdingTaxRate', parseFloat(e.target.value) / 100 || 0)}
                        style={{ width: 80, textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Source: Tax Law Art. 56 bis (Law 30/2023)</span>
                </div>

                {/* Risk-Free Rate for DCF */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Risk-Free Rate (%)</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="0.5"
                        value={((a.riskFreeRate ?? 0.20) * 100).toFixed(1)}
                        onChange={(e) => updateAssumption('riskFreeRate', parseFloat(e.target.value) / 100 || 0.20)}
                        style={{ width: 80, textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CBE deposit: 19% | T-Bill: ~25.7%</span>
                </div>
            </div>

            {/* Opening Balances (FIX #2 & #3) */}
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Opening Balance Adjustments
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    Use these fields to reconcile prior-period balances that precede the model start date.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 180 }}>Prior Cumulative Legal Reserve</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="1000"
                        value={a.initialLegalReserve ?? 0}
                        onChange={(e) => updateAssumption('initialLegalReserve', parseFloat(e.target.value) || 0)}
                        style={{ width: 100, textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Max: {((a.paidUpCapital ?? 10000) * (a.legalReserveCap ?? 0.50)).toLocaleString()} (50% of Issued Capital)
                    </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, paddingLeft: 192 }}>
                    Accumulated LR from periods before model start. Determines remaining room under the cap.
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
                    <label style={{ fontSize: 13, minWidth: 180 }}>Prior Period Dividends Paid</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="1000"
                        value={a.priorPeriodDividendsPaidFromRE ?? 0}
                        onChange={(e) => updateAssumption('priorPeriodDividendsPaidFromRE', parseFloat(e.target.value) || 0)}
                        style={{ width: 100, textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        EGP (reduces opening RE)
                    </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingLeft: 192 }}>
                    Dividends declared before model start, settled in the first historical period.
                    Reconciles the gap between computed and actual opening Retained Earnings.
                </div>
            </div>

            {/* Egyptian Depreciation Rates Reference */}
            {isEgypt && (
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Egyptian Tax Depreciation Rates (Fixed by Law)
                    </div>
                    <table className="fin-table" style={{ fontSize: 12 }}>
                        <thead>
                            <tr>
                                <th>Asset Class</th>
                                <th>Arabic</th>
                                <th>Rate</th>
                                <th>Method</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(EGYPTIAN_TAX_DEPRECIATION_RATES).map(([key, r]) => (
                                <tr key={key}>
                                    <td>{r.name}</td>
                                    <td style={{ direction: 'rtl' }}>{r.nameArabic}</td>
                                    <td style={{ fontWeight: 600 }}>{(r.rate * 100).toFixed(1)}%</td>
                                    <td>{r.method}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Fiscal Year */}
            <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Fiscal Year
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>FY Preset</label>
                    <select
                        className="fin-select"
                        value={a.fiscalYearPreset || 'calendar'}
                        onChange={(e) => {
                            const preset = e.target.value as 'calendar' | 'egyptian-govt' | 'custom';
                            const fy = FISCAL_YEAR_PRESETS[preset];
                            updateAssumption('fiscalYearPreset', preset === 'calendar' ? 0 : preset === 'egyptian-govt' ? 1 : 2);
                            updateAssumption('fiscalYearEnd', fy.endMonth);
                        }}
                        style={{ flex: 1 }}
                    >
                        <option value="calendar">📅 Calendar Year (Jan–Dec)</option>
                        <option value="egyptian-govt">🇪🇬 Egyptian Gov&apos;t (Jul–Jun)</option>
                        <option value="custom">⚙️ Custom</option>
                    </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    FY ends month: {a.fiscalYearEnd || 12}
                </div>
            </div>
        </div>
    );
}
