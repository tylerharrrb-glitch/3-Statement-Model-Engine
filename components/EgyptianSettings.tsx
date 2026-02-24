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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Corporate Tax (%)</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="0.1"
                        value={((a.taxRate[0] || 0) * 100).toFixed(1)}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) / 100 || 0;
                            const newRates = a.taxRate.map(() => val);
                            updateAssumption('taxRate', newRates);
                        }}
                        style={{ width: 80, textAlign: 'right' }}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 13, minWidth: 120 }}>Div. Withholding (%)</label>
                    <input
                        className="fin-input"
                        type="number"
                        step="0.1"
                        value={((a.dividendWithholdingTaxRate || 0) * 100).toFixed(1)}
                        onChange={(e) => updateAssumption('dividendWithholdingTaxRate', parseFloat(e.target.value) / 100 || 0)}
                        style={{ width: 80, textAlign: 'right' }}
                    />
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
