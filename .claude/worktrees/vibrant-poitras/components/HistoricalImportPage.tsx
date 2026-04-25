'use client';

import { useState, useRef } from 'react';
import { useModelStore } from '@/lib/store';
import { HistoricalInputs } from '@/types/assumptions';

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error';

export default function HistoricalImportPage() {
    const { setHistoricalInputs, historicalInputs, calculateModel } = useModelStore();
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<HistoricalInputs | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStatus('parsing');
        setError('');

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                let parsed: HistoricalInputs;

                if (file.name.endsWith('.json')) {
                    parsed = parseJSON(text);
                } else if (file.name.endsWith('.csv')) {
                    parsed = parseCSV(text);
                } else {
                    throw new Error('Unsupported file format. Use .json or .csv');
                }

                validateHistoricalInputs(parsed);
                setPreview(parsed);
                setStatus('success');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to parse file');
                setStatus('error');
            }
        };
        reader.onerror = () => {
            setError('Failed to read file');
            setStatus('error');
        };
        reader.readAsText(file);
    };

    const handleApply = () => {
        if (!preview) return;
        setHistoricalInputs(preview);
        calculateModel();
        setStatus('idle');
        setPreview(null);
    };

    const handleDownloadTemplate = () => {
        const template: HistoricalInputs = historicalInputs;
        const json = JSON.stringify(template, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'historical_data_template.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>📥 Import Historical Data</h1>
            </div>

            {/* Instructions */}
            <div className="metric-card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-blue)' }}>
                    How to Import
                </h3>
                <ol style={{ paddingLeft: 20, lineHeight: 2, fontSize: 13, color: 'var(--text-secondary)' }}>
                    <li>Download the <strong>JSON template</strong> below to see the expected format</li>
                    <li>Fill in your historical financial data (3 periods recommended)</li>
                    <li>Upload the file (.json or .csv)</li>
                    <li>Review the preview, then click <strong>Apply</strong></li>
                </ol>
                <button
                    className="btn-secondary"
                    style={{ marginTop: 12, fontSize: 12 }}
                    onClick={handleDownloadTemplate}
                >
                    📋 Download JSON Template
                </button>
            </div>

            {/* Upload */}
            <div className="metric-card" style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-blue)' }}>
                    Upload File
                </h3>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.csv"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />
                <button
                    className="btn-primary"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ marginBottom: 12 }}
                >
                    📂 Choose File (.json or .csv)
                </button>

                {status === 'error' && (
                    <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: 'var(--accent-rose)', fontSize: 13, marginTop: 8 }}>
                        ❌ {error}
                    </div>
                )}
            </div>

            {/* Preview */}
            {preview && status === 'success' && (
                <div className="metric-card" style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--accent-emerald)' }}>
                        ✓ Preview — {preview.periods.length} periods detected
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="fin-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    {preview.periods.map(p => <th key={p}>{p}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows(preview).map((row, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: row.bold ? 700 : 400 }}>{row.label}</td>
                                        {row.values.map((v, j) => (
                                            <td key={j}>${v.toLocaleString()}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                        <button className="btn-primary" onClick={handleApply}>
                            ✓ Apply & Recalculate
                        </button>
                        <button className="btn-secondary" onClick={() => { setPreview(null); setStatus('idle'); }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Parsing helpers ──────────────────────────────────────────

function parseJSON(text: string): HistoricalInputs {
    const data = JSON.parse(text);
    if (!data.periods || !Array.isArray(data.periods)) {
        throw new Error('JSON must have a "periods" array');
    }
    return data as HistoricalInputs;
}

function parseCSV(text: string): HistoricalInputs {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) throw new Error('CSV must have at least a header row and data rows');

    const headers = lines[0].split(',').map(h => h.trim());
    const periods = headers.slice(1);
    const numPeriods = periods.length;

    const data: Record<string, number[]> = {};
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim());
        const key = camelCase(cells[0].replace(/['"]/g, ''));
        const values = cells.slice(1).map(c => parseFloat(c.replace(/[$,%"]/g, '')) || 0);
        if (values.length === numPeriods) {
            data[key] = values;
        }
    }

    return {
        periods,
        revenue: data.revenue || arr(numPeriods, 0),
        cogs: data.cogs || data.costOfGoodsSold || arr(numPeriods, 0),
        sgaExpense: data.sgaExpense || data.sga || arr(numPeriods, 0),
        rdExpense: data.rdExpense || data.rd || arr(numPeriods, 0),
        depreciation: data.depreciation || arr(numPeriods, 0),
        amortization: data.amortization || arr(numPeriods, 0),
        otherOpex: data.otherOpex || arr(numPeriods, 0),
        interestIncome: data.interestIncome || arr(numPeriods, 0),
        interestExpense: data.interestExpense || arr(numPeriods, 0),
        otherIncomeExpense: data.otherIncomeExpense || arr(numPeriods, 0),
        taxExpense: data.taxExpense || arr(numPeriods, 0),
        sharesOutstanding: data.sharesOutstanding || arr(numPeriods, 100000),
        cash: data.cash || arr(numPeriods, 0),
        accountsReceivable: data.accountsReceivable || arr(numPeriods, 0),
        inventory: data.inventory || arr(numPeriods, 0),
        prepaidExpenses: data.prepaidExpenses || arr(numPeriods, 0),
        otherCurrentAssets: data.otherCurrentAssets || arr(numPeriods, 0),
        grossPPE: data.grossPpe || data.grossPPE || arr(numPeriods, 0),
        accumulatedDepreciation: data.accumulatedDepreciation || arr(numPeriods, 0),
        intangibles: data.intangibles || arr(numPeriods, 0),
        goodwill: data.goodwill || arr(numPeriods, 0),
        otherLongTermAssets: data.otherLongTermAssets || arr(numPeriods, 0),
        accountsPayable: data.accountsPayable || arr(numPeriods, 0),
        accruedExpenses: data.accruedExpenses || arr(numPeriods, 0),
        shortTermDebt: data.shortTermDebt || arr(numPeriods, 0),
        currentPortionLTD: data.currentPortionLtd || data.currentPortionLTD || arr(numPeriods, 0),
        deferredRevenue: data.deferredRevenue || arr(numPeriods, 0),
        otherCurrentLiabilities: data.otherCurrentLiabilities || arr(numPeriods, 0),
        longTermDebt: data.longTermDebt || arr(numPeriods, 0),
        deferredTaxLiabilities: data.deferredTaxLiabilities || arr(numPeriods, 0),
        otherLongTermLiabilities: data.otherLongTermLiabilities || arr(numPeriods, 0),
        commonStock: data.commonStock || arr(numPeriods, 10000),
        additionalPaidInCapital: data.additionalPaidInCapital || arr(numPeriods, 0),
        retainedEarnings: data.retainedEarnings || arr(numPeriods, 0),
        treasuryStock: data.treasuryStock || arr(numPeriods, 0),
        otherComprehensiveIncome: data.otherComprehensiveIncome || arr(numPeriods, 0),
    };
}

function validateHistoricalInputs(data: HistoricalInputs) {
    const n = data.periods.length;
    if (n < 1) throw new Error('At least 1 historical period is required');
    if (n > 10) throw new Error('Maximum 10 historical periods');

    const requiredArrays: (keyof HistoricalInputs)[] = [
        'revenue', 'cash', 'accountsReceivable', 'inventory',
        'accountsPayable', 'longTermDebt', 'retainedEarnings',
    ];
    for (const key of requiredArrays) {
        const arr = data[key] as number[];
        if (!Array.isArray(arr) || arr.length !== n) {
            throw new Error(`"${key}" must be an array of length ${n}`);
        }
    }
}

function previewRows(data: HistoricalInputs) {
    return [
        { label: 'Revenue', values: data.revenue, bold: true },
        { label: 'COGS', values: data.cogs },
        { label: 'Cash', values: data.cash, bold: true },
        { label: 'Accounts Receivable', values: data.accountsReceivable },
        { label: 'Inventory', values: data.inventory },
        { label: 'Total Debt', values: data.longTermDebt.map((v, i) => v + data.shortTermDebt[i]) },
        { label: 'Retained Earnings', values: data.retainedEarnings },
    ];
}

function camelCase(str: string): string {
    return str.replace(/[\s-_]+(.)/g, (_, c) => c.toUpperCase())
        .replace(/^[A-Z]/, c => c.toLowerCase());
}

function arr(n: number, v: number): number[] {
    return Array(n).fill(v);
}
