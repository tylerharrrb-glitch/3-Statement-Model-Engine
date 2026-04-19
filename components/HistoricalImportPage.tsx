'use client';

import { useState, useRef } from 'react';
import { useModelStore } from '@/lib/store';
import { HistoricalInputs } from '@/types/assumptions';
import { HistoricalDataInput } from '@/types/historical';

type ImportStatus = 'idle' | 'parsing' | 'success' | 'error';

// A preview payload — may be just historical inputs, or a full model export
interface ImportPreview {
    historicalInputs: HistoricalInputs;
    assumptions?: unknown;           // AssumptionSet, loosely typed (may come from older exports)
    scenarios?: unknown[];           // Scenario[]
    companyInfo?: {
        companyName?: string;
        ticker?: string;
        industry?: string;
        currency?: string;
        country?: string;
        fiscalYearEnd?: string;
        valuationDate?: string;
    };
    isFullModel: boolean;
}

export default function HistoricalImportPage() {
    const { setHistoricalInputs, historicalInputs, calculateAllScenarios } = useModelStore();
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<ImportPreview | null>(null);
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
                let parsed: ImportPreview;

                if (file.name.endsWith('.json')) {
                    parsed = parseJSON(text);
                } else if (file.name.endsWith('.csv')) {
                    parsed = {
                        historicalInputs: parseCSV(text),
                        isFullModel: false,
                    };
                } else {
                    throw new Error('Unsupported file format. Use .json or .csv');
                }

                validateHistoricalInputs(parsed.historicalInputs);
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

        // Clear input so re-uploading the same file still fires onChange
        e.target.value = '';
    };

    const handleApply = () => {
        if (!preview) return;

        // Infer startYear from scenario assumptions (fall back to current active scenario)
        // so we can repair duplicated/blank period labels (a known historical export bug
        // produced ["2025","2025"] instead of ["2024","2025"]).
        const state = useModelStore.getState();
        const activeScenario = state.scenarios.find(s => s.id === state.activeScenarioId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const firstImportedAssumptions = (preview.scenarios?.[0] as any)?.assumptions ?? preview.assumptions;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inferredStartYear: number = (firstImportedAssumptions as any)?.startYear
            ?? activeScenario?.assumptions?.startYear
            ?? 2026;

        const repairedInputs = repairPeriodLabels(preview.historicalInputs, inferredStartYear);

        // 1. Rebuild per-year historical data so the UI (which reads historicalData)
        //    actually reflects the imported numbers.
        const perYear = convertFromHistoricalInputs(repairedInputs);

        // 2. Build the state patch — full-model JSONs also replace scenarios & companyInfo.
        const patch: Record<string, unknown> = {
            historicalData: perYear,
            historicalInputs: repairedInputs,
        };

        if (preview.isFullModel) {
            if (preview.scenarios && Array.isArray(preview.scenarios) && preview.scenarios.length > 0) {
                const now = new Date().toISOString();
                patch.scenarios = preview.scenarios.map((raw, idx) => {
                    const s = raw as Record<string, unknown>;
                    return {
                        id: (s.id as string) ?? `imported-${idx}-${now}`,
                        name: (s.name as string) ?? `Imported ${idx + 1}`,
                        type: (s.type as string) ?? 'custom',
                        description: (s.description as string) ?? '',
                        assumptions: s.assumptions,
                        results: null, // force recompute
                        createdAt: (s.createdAt as string) ?? now,
                        updatedAt: now,
                    };
                });
                const firstId = (patch.scenarios as Array<{ id: string }>)[0].id;
                patch.activeScenarioId = firstId;
            } else if (preview.assumptions) {
                // No scenarios array → patch every scenario's assumptions with the import.
                patch.scenarios = state.scenarios.map(s => ({
                    ...s,
                    assumptions: preview.assumptions as typeof s.assumptions,
                    results: null,
                    updatedAt: new Date().toISOString(),
                }));
            }

            if (preview.companyInfo) {
                const ci = preview.companyInfo;
                if (ci.companyName !== undefined) patch.companyName = ci.companyName;
                if (ci.ticker !== undefined) patch.ticker = ci.ticker;
                if (ci.industry !== undefined) patch.industry = ci.industry;
                if (ci.currency !== undefined) patch.currency = ci.currency;
                if (ci.country !== undefined) patch.country = ci.country;
                if (ci.fiscalYearEnd !== undefined) patch.fiscalYearEnd = ci.fiscalYearEnd;
                if (ci.valuationDate !== undefined) patch.valuationDate = ci.valuationDate;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useModelStore.setState(patch as any);
        void setHistoricalInputs;

        // Recalculate ALL scenarios (not just active) so imported scenarios all refresh.
        calculateAllScenarios();
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
                    <li>Upload the file (.json or .csv) — full-model JSON exports are also accepted</li>
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
                        ✓ Preview — {preview.historicalInputs.periods.length} period(s) detected
                        {preview.isFullModel && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-blue)' }}>
                                · Full-model export (assumptions{preview.scenarios ? ` + ${(preview.scenarios as unknown[]).length} scenario(s)` : ''}{preview.companyInfo ? ' + company info' : ''})
                            </span>
                        )}
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table className="fin-table">
                            <thead>
                                <tr>
                                    <th>Item</th>
                                    {preview.historicalInputs.periods.map(p => <th key={p}>{p}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {previewRows(preview.historicalInputs).map((row, i) => (
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

function parseJSON(text: string): ImportPreview {
    const data = JSON.parse(text);

    // Shape A: flat HistoricalInputs — has top-level "periods" array
    if (data.periods && Array.isArray(data.periods)) {
        return {
            historicalInputs: data as HistoricalInputs,
            isFullModel: false,
        };
    }

    // Shape B: full-model export — has "historicalInputs" nested object
    if (data.historicalInputs && Array.isArray(data.historicalInputs.periods)) {
        return {
            historicalInputs: data.historicalInputs as HistoricalInputs,
            assumptions: data.assumptions,
            scenarios: data.scenarios,
            companyInfo: data.companyInfo,
            isFullModel: true,
        };
    }

    throw new Error(
        'JSON must either (a) match the historical template (have a "periods" array at the top level), ' +
        'or (b) be a full-model export with a "historicalInputs" object.'
    );
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

// ── Period-label sanitizer ─────────────────────────────────────
// Some historical JSON exports (a known v6 migration bug) carry duplicated
// labels like ["2025","2025"]. Rebuild labels by back-counting from the
// projection start year so the UI shows e.g. "2024" and "2025" correctly.
function repairPeriodLabels(h: HistoricalInputs, startYear: number): HistoricalInputs {
    const n = h.periods.length;
    const existing = h.periods.map(p => String(p));
    const unique = new Set(existing);
    const allNumeric = existing.every(p => /^\d{4}$/.test(p));
    const strictlyIncreasing = existing.every((p, i) => i === 0 || parseInt(p, 10) > parseInt(existing[i - 1], 10));

    // Keep the existing labels only when they're clean: unique, 4-digit, and increasing.
    if (unique.size === n && allNumeric && strictlyIncreasing) {
        return h;
    }

    const repaired = Array.from({ length: n }, (_, i) => String(startYear - n + i));
    return { ...h, periods: repaired };
}

// ── Reverse converter: HistoricalInputs → HistoricalDataInput[] ──────
// The per-year form UI reads historicalData; without this rebuild, the
// imported values won't appear in the input form.
function convertFromHistoricalInputs(h: HistoricalInputs): HistoricalDataInput[] {
    return h.periods.map((period, i) => {
        const get = (key: keyof HistoricalInputs, fallback = 0): number => {
            const v = h[key];
            return Array.isArray(v) ? ((v[i] as number) ?? fallback) : fallback;
        };

        const revenue = get('revenue');
        const cogs = get('cogs');
        const grossProfit = revenue - cogs;
        const sgaExpense = get('sgaExpense');
        const rdExpense = get('rdExpense');
        const depreciation = get('depreciation');
        const amortization = get('amortization');
        const otherOpex = get('otherOpex');
        const interestIncome = get('interestIncome');
        const interestExpense = get('interestExpense');
        const otherIncomeExpense = get('otherIncomeExpense');
        const taxExpense = get('taxExpense');
        const ebit = grossProfit - sgaExpense - rdExpense - depreciation - amortization - otherOpex;
        const ebt = ebit + interestIncome - interestExpense + otherIncomeExpense;
        const netIncome = ebt - taxExpense;

        const cash = get('cash');
        const accountsReceivable = get('accountsReceivable');
        const inventory = get('inventory');
        const prepaidExpenses = get('prepaidExpenses');
        const otherCurrentAssets = get('otherCurrentAssets');
        const grossPPE = get('grossPPE');
        const accumulatedDepreciation = get('accumulatedDepreciation');
        const netPPE = grossPPE - accumulatedDepreciation;
        const intangibleAssets = get('intangibles');
        const goodwill = get('goodwill');
        const otherLTAssets = get('otherLongTermAssets');
        const totalCurrentAssets = cash + accountsReceivable + inventory + prepaidExpenses + otherCurrentAssets;
        const totalNonCurrentAssets = netPPE + intangibleAssets + goodwill + otherLTAssets;
        const totalAssets = totalCurrentAssets + totalNonCurrentAssets;

        const accountsPayable = get('accountsPayable');
        const accruedExpenses = get('accruedExpenses');
        const shortTermDebt = get('shortTermDebt');
        const currentPortionLTD = get('currentPortionLTD');
        const deferredRevenue = get('deferredRevenue');
        const otherCurrentLiabilities = get('otherCurrentLiabilities');
        const longTermDebt = get('longTermDebt');
        const deferredTaxLiabilities = get('deferredTaxLiabilities');
        const otherLTLiabilities = get('otherLongTermLiabilities');
        const totalCurrentLiabilities = accountsPayable + accruedExpenses + shortTermDebt + currentPortionLTD + deferredRevenue + otherCurrentLiabilities;
        const totalNonCurrentLiabilities = longTermDebt + deferredTaxLiabilities + otherLTLiabilities;
        const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;

        const commonStock = get('commonStock');
        const additionalPaidInCapital = get('additionalPaidInCapital');
        const retainedEarnings = get('retainedEarnings');
        const treasuryStock = get('treasuryStock');
        const otherComprehensiveIncome = get('otherComprehensiveIncome');
        const totalEquity = commonStock + additionalPaidInCapital + retainedEarnings + treasuryStock + otherComprehensiveIncome;

        const yearNum = parseInt(period.replace(/\D/g, ''), 10);

        return {
            year: Number.isFinite(yearNum) ? yearNum : i,
            period,
            revenue,
            cogs,
            grossProfit,
            sgaExpense,
            rdExpense,
            depreciation,
            amortization,
            otherOpex,
            interestIncome,
            interestExpense,
            otherIncomeExpense,
            taxExpense,
            netIncome,
            sharesOutstanding: get('sharesOutstanding'),
            cash,
            accountsReceivable,
            inventory,
            prepaidExpenses,
            otherCurrentAssets,
            grossPPE,
            accumulatedDepreciation,
            netPPE,
            intangibleAssets,
            goodwill,
            otherLTAssets,
            totalCurrentAssets,
            totalNonCurrentAssets,
            totalAssets,
            accountsPayable,
            accruedExpenses,
            shortTermDebt,
            currentPortionLTD,
            deferredRevenue,
            otherCurrentLiabilities,
            totalCurrentLiabilities,
            longTermDebt,
            deferredTaxLiabilities,
            otherLTLiabilities,
            totalNonCurrentLiabilities,
            totalLiabilities,
            commonStock,
            additionalPaidInCapital,
            retainedEarnings,
            treasuryStock,
            otherComprehensiveIncome,
            totalEquity,
        };
    });
}
