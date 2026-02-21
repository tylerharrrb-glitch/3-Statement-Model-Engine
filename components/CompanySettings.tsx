'use client';

import { useModelStore } from '@/lib/store';
import { CURRENCY_MAP } from '@/lib/utils';

const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px',
    fontSize: 14, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    border: '1px solid var(--border-color)', borderRadius: 8,
};

const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4,
};

export default function CompanySettings() {
    const {
        companyName, ticker, industry, currency, country, fiscalYearEnd, valuationDate,
    } = useModelStore();
    const set = useModelStore.setState;

    const field = (label: string, key: string, value: string) => (
        <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>{label}</label>
            <input
                style={inputStyle}
                value={value}
                onChange={(e) => set({ [key]: e.target.value })}
            />
        </div>
    );

    return (
        <div style={{ padding: '32px 40px', maxWidth: 640 }}>
            <h1 style={{
                fontSize: 24, fontWeight: 700, marginBottom: 8,
                background: 'var(--gradient-1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>Company Settings</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
                Information displayed on exports and report headers.
            </p>

            <div style={{
                background: 'var(--bg-secondary)', padding: 24, borderRadius: 12,
                border: '1px solid var(--border-color)',
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    {field('Company Name', 'companyName', companyName)}
                    {field('Ticker', 'ticker', ticker)}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {field('Industry', 'industry', industry)}
                    {field('Country', 'country', country)}
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={labelStyle}>Currency</label>
                    <select
                        style={{ ...inputStyle, cursor: 'pointer' }}
                        value={currency}
                        onChange={(e) => set({ currency: e.target.value })}
                    >
                        {Object.entries(CURRENCY_MAP).map(([code, cfg]) => (
                            <option key={code} value={code}>{cfg.label} ({code})</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {field('Fiscal Year End', 'fiscalYearEnd', fiscalYearEnd)}
                    {field('Valuation Date', 'valuationDate', valuationDate)}
                </div>
            </div>
        </div>
    );
}
