'use client';

import React, { useState, useRef } from 'react';
import { useModelStore } from '@/lib/store';
import { HistoricalDataInput as HistoricalDataInputType, validateHistoricalBalance } from '@/types/historical';

// ── Field definitions for form & CSV ────────────────────────
const IS_FIELDS: { label: string; key: keyof HistoricalDataInputType }[] = [
    { label: 'Revenue', key: 'revenue' },
    { label: 'COGS', key: 'cogs' },
    { label: 'SG&A Expense', key: 'sgaExpense' },
    { label: 'R&D Expense', key: 'rdExpense' },
    { label: 'Depreciation', key: 'depreciation' },
    { label: 'Amortization', key: 'amortization' },
    { label: 'Other OpEx', key: 'otherOpex' },
    { label: 'Interest Income', key: 'interestIncome' },
    { label: 'Interest Expense', key: 'interestExpense' },
    { label: 'Other Income/Expense', key: 'otherIncomeExpense' },
    { label: 'Tax Expense', key: 'taxExpense' },
    { label: 'Shares Outstanding', key: 'sharesOutstanding' },
];

const BS_FIELDS: { label: string; key: keyof HistoricalDataInputType; section?: string }[] = [
    { label: 'Cash', key: 'cash', section: 'CURRENT ASSETS' },
    { label: 'Accounts Receivable', key: 'accountsReceivable' },
    { label: 'Inventory', key: 'inventory' },
    { label: 'Prepaid Expenses', key: 'prepaidExpenses' },
    { label: 'Other Current Assets', key: 'otherCurrentAssets' },
    { label: 'Gross PP&E', key: 'grossPPE', section: 'NON-CURRENT ASSETS' },
    { label: 'Accumulated Depreciation', key: 'accumulatedDepreciation' },
    { label: 'Intangible Assets', key: 'intangibleAssets' },
    { label: 'Goodwill', key: 'goodwill' },
    { label: 'Other LT Assets', key: 'otherLTAssets' },
    { label: 'Accounts Payable', key: 'accountsPayable', section: 'CURRENT LIABILITIES' },
    { label: 'Accrued Expenses', key: 'accruedExpenses' },
    { label: 'Short-Term Debt', key: 'shortTermDebt' },
    { label: 'Current Portion LTD', key: 'currentPortionLTD' },
    { label: 'Deferred Revenue', key: 'deferredRevenue' },
    { label: 'Other Current Liabilities', key: 'otherCurrentLiabilities' },
    { label: 'Long-Term Debt', key: 'longTermDebt', section: 'NON-CURRENT LIABILITIES' },
    { label: 'Deferred Tax Liabilities', key: 'deferredTaxLiabilities' },
    { label: 'Other LT Liabilities', key: 'otherLTLiabilities' },
    { label: 'Common Stock', key: 'commonStock', section: 'EQUITY' },
    { label: 'Additional Paid-In Capital', key: 'additionalPaidInCapital' },
    { label: 'Retained Earnings', key: 'retainedEarnings' },
    { label: 'Treasury Stock', key: 'treasuryStock' },
    { label: 'Other Comprehensive Income', key: 'otherComprehensiveIncome' },
];

// ── All CSV keys in order ───────────────────────────────────
const ALL_CSV_KEYS: { label: string; key: keyof HistoricalDataInputType }[] = [...IS_FIELDS, ...BS_FIELDS];

function emptyYear(year: number): HistoricalDataInputType {
    return {
        year,
        period: String(year),
        revenue: 0, cogs: 0, grossProfit: 0, sgaExpense: 0, rdExpense: 0,
        depreciation: 0, amortization: 0, otherOpex: 0, interestIncome: 0, interestExpense: 0,
        otherIncomeExpense: 0, taxExpense: 0, netIncome: 0, sharesOutstanding: 100_000,
        cash: 0, accountsReceivable: 0, inventory: 0, prepaidExpenses: 0, otherCurrentAssets: 0,
        grossPPE: 0, accumulatedDepreciation: 0, netPPE: 0, intangibleAssets: 0, goodwill: 0,
        otherLTAssets: 0, totalCurrentAssets: 0, totalNonCurrentAssets: 0, totalAssets: 0,
        accountsPayable: 0, accruedExpenses: 0, shortTermDebt: 0, currentPortionLTD: 0,
        deferredRevenue: 0, otherCurrentLiabilities: 0, totalCurrentLiabilities: 0,
        longTermDebt: 0, deferredTaxLiabilities: 0, otherLTLiabilities: 0,
        totalNonCurrentLiabilities: 0, totalLiabilities: 0,
        commonStock: 0, additionalPaidInCapital: 0, retainedEarnings: 0, treasuryStock: 0,
        otherComprehensiveIncome: 0, totalEquity: 0,
    };
}

function recalcDerived(d: HistoricalDataInputType): HistoricalDataInputType {
    const grossProfit = d.revenue - d.cogs;
    const totalOpex = d.sgaExpense + d.rdExpense + d.depreciation + d.amortization + d.otherOpex;
    const ebit = grossProfit - totalOpex;
    const ebt = ebit + d.interestIncome - d.interestExpense + d.otherIncomeExpense;
    const netIncome = ebt - d.taxExpense;
    const netPPE = d.grossPPE - d.accumulatedDepreciation;
    const totalCurrentAssets = d.cash + d.accountsReceivable + d.inventory + d.prepaidExpenses + d.otherCurrentAssets;
    const totalNonCurrentAssets = netPPE + d.intangibleAssets + d.goodwill + d.otherLTAssets;
    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const totalCurrentLiabilities = d.accountsPayable + d.accruedExpenses + d.shortTermDebt + d.currentPortionLTD + d.deferredRevenue + d.otherCurrentLiabilities;
    const totalNonCurrentLiabilities = d.longTermDebt + d.deferredTaxLiabilities + d.otherLTLiabilities;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    const totalEquity = d.commonStock + d.additionalPaidInCapital + d.retainedEarnings + d.treasuryStock + d.otherComprehensiveIncome;
    return {
        ...d, grossProfit, netIncome, netPPE, totalCurrentAssets, totalNonCurrentAssets,
        totalAssets, totalCurrentLiabilities, totalNonCurrentLiabilities, totalLiabilities, totalEquity,
    };
}

export default function HistoricalDataInputComponent() {
    const { historicalData, setHistoricalData } = useModelStore();
    const [data, setData] = useState<HistoricalDataInputType[]>(
        historicalData.length > 0
            ? historicalData.map(d => recalcDerived(d))
            : [recalcDerived(emptyYear(2023)), recalcDerived(emptyYear(2024))]
    );
    const [activeYear, setActiveYear] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const current = data[activeYear];

    function updateField(key: keyof HistoricalDataInputType, value: number) {
        const updated = [...data];
        updated[activeYear] = recalcDerived({ ...updated[activeYear], [key]: value });
        setData(updated);
        setSaved(false);
    }

    function handleSave() {
        const validationErrors: string[] = [];
        data.forEach(d => {
            const err = validateHistoricalBalance(d);
            if (err) validationErrors.push(err);
        });
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }
        setErrors([]);
        setHistoricalData(data);
        setSaved(true);
    }

    // ── CSV Template Download ─────────────────────────────
    function handleDownloadTemplate() {
        const header = ['Field', ...data.map(d => d.period)].join(',');
        const rows = ALL_CSV_KEYS.map(f => [f.label, ...data.map(d => d[f.key])].join(','));
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'historical_template.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── CSV Import ────────────────────────────────────────
    function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const text = ev.target?.result as string;
                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length < 2) throw new Error('CSV must have header + data rows');

                const headers = lines[0].split(',').map(h => h.trim());
                const periods = headers.slice(1);
                const numPeriods = periods.length;
                if (numPeriods < 1 || numPeriods > 5) throw new Error('CSV must have 1-5 periods');

                // Build lookup: label → key
                const labelToKey = new Map<string, keyof HistoricalDataInputType>();
                ALL_CSV_KEYS.forEach(f => labelToKey.set(f.label.toLowerCase(), f.key));

                const imported: HistoricalDataInputType[] = periods.map((p, i) => {
                    const year = parseInt(p) || (2023 + i);
                    return emptyYear(year);
                });

                for (let i = 1; i < lines.length; i++) {
                    const cells = lines[i].split(',').map(c => c.trim());
                    const label = cells[0].replace(/['"]/g, '').toLowerCase();
                    const key = labelToKey.get(label);
                    if (!key) continue;
                    for (let j = 0; j < numPeriods; j++) {
                        const val = parseFloat(cells[j + 1]?.replace(/[$,%"]/g, '') || '0') || 0;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (imported[j] as any)[key] = val;
                    }
                }

                const final = imported.map(d => recalcDerived(d));
                setData(final);
                setSaved(false);
                setErrors([]);
            } catch (err) {
                setErrors([err instanceof Error ? err.message : 'CSV parse error']);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    const balanceDiff = current.totalAssets - (current.totalLiabilities + current.totalEquity);
    const isBalanced = Math.abs(balanceDiff) < 0.01;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>📊 Historical Data (Actuals)</h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {/* Historical/Forecast Toggle (FIX #12) */}
                    <label
                        id="historical-toggle"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8,
                            padding: '4px 12px', borderRadius: 8,
                            background: 'rgba(79,140,255,0.1)', border: '1px solid var(--border-color)',
                            fontSize: 12, cursor: 'default', color: 'var(--accent-blue)',
                        }}
                        aria-label="Data mode: Historical actuals"
                    >
                        <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                            background: 'var(--accent-blue)',
                        }} />
                        Historical Mode
                    </label>
                    <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
                    <button className="btn-secondary" onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}
                        aria-label="Import historical data from CSV file">
                        📂 Import CSV
                    </button>
                    <button className="btn-secondary" onClick={handleDownloadTemplate} style={{ fontSize: 12 }}
                        aria-label="Download CSV template for historical data">
                        📋 Download Template
                    </button>
                </div>
            </div>

            {/* Error display */}
            {errors.length > 0 && (
                <div className="metric-card" style={{ marginBottom: 16, background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.3)' }}>
                    {errors.map((err, i) => (
                        <div key={i} style={{ color: 'var(--accent-rose)', fontSize: 13, padding: '4px 0' }}>❌ {err}</div>
                    ))}
                </div>
            )}

            {saved && (
                <div className="metric-card" style={{ marginBottom: 16, background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)' }}>
                    <div style={{ color: 'var(--accent-emerald)', fontSize: 13 }}>✓ Historical data saved and model recalculated</div>
                </div>
            )}

            {/* Year tabs */}
            <div className="tab-list" style={{ marginBottom: 20, width: 'fit-content' }}>
                {data.map((d, i) => (
                    <button
                        key={d.period}
                        className={`tab-item ${i === activeYear ? 'active' : ''}`}
                        onClick={() => setActiveYear(i)}
                    >
                        {d.period} (Actual)
                    </button>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Income Statement */}
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-blue)' }}>
                        Income Statement — {current.period}
                    </h3>
                    <table className="fin-table" style={{ fontSize: 12 }}>
                        <tbody>
                            {IS_FIELDS.map(f => (
                                <tr key={f.key}>
                                    <td style={{ width: '50%' }}>{f.label}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="fin-input"
                                            value={current[f.key] || ''}
                                            onChange={e => updateField(f.key, parseFloat(e.target.value) || 0)}
                                            style={{ textAlign: 'right' }}
                                        />
                                    </td>
                                </tr>
                            ))}
                            <tr className="row-bold">
                                <td>Net Income</td>
                                <td style={{ textAlign: 'right', padding: '8px 14px' }}>
                                    ${current.netIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Balance Sheet */}
                <div className="metric-card">
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-blue)' }}>
                        Balance Sheet — {current.period}
                    </h3>
                    <table className="fin-table" style={{ fontSize: 12 }}>
                        <tbody>
                            {BS_FIELDS.map((f, i) => (
                                <React.Fragment key={f.key}>
                                    {f.section && (
                                        <tr className="row-subheader">
                                            <td colSpan={2}>{f.section}</td>
                                        </tr>
                                    )}
                                    <tr key={i}>
                                        <td style={{ width: '50%' }}>{f.label}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="fin-input"
                                                value={current[f.key] || ''}
                                                onChange={e => updateField(f.key, parseFloat(e.target.value) || 0)}
                                                style={{ textAlign: 'right' }}
                                            />
                                        </td>
                                    </tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>

                    {/* Balance check */}
                    <div style={{
                        marginTop: 12,
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: isBalanced ? 'rgba(52,211,153,0.1)' : 'rgba(244,63,94,0.1)',
                        border: `1px solid ${isBalanced ? 'rgba(52,211,153,0.3)' : 'rgba(244,63,94,0.3)'}`,
                        fontSize: 13,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total Assets:</span>
                            <span style={{ fontWeight: 600 }}>${current.totalAssets.toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Total L + E:</span>
                            <span style={{ fontWeight: 600 }}>${(current.totalLiabilities + current.totalEquity).toLocaleString()}</span>
                        </div>
                        <div style={{
                            marginTop: 4,
                            fontWeight: 700,
                            color: isBalanced ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                        }}>
                            {isBalanced ? '✓ Balanced' : `✗ Difference: $${balanceDiff.toFixed(2)}`}
                        </div>
                    </div>
                </div>
            </div>

            {/* Save button */}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleSave} style={{ padding: '10px 24px', fontSize: 14 }}>
                    💾 Save Historical Data
                </button>
            </div>
        </div>
    );
}
