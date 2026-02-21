'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent, formatEPS } from '@/lib/utils';
import RevenueChart from '@/components/charts/RevenueChart';

export default function IncomeStatementPage() {
    const { scenarios, activeScenarioId, currency, setCellOverride, calculateModel } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;

    // ── Search / Filter (FIX #8) ──
    const [searchTerm, setSearchTerm] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Read search from URL on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const q = params.get('search');
            if (q) setSearchTerm(q);
        }
    }, []);

    // Sync search to URL
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (searchTerm) url.searchParams.set('search', searchTerm);
            else url.searchParams.delete('search');
            window.history.replaceState({}, '', url.toString());
        }
    }, [searchTerm]);

    // ── Inline Cell Editing (FIX #7) ──
    const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
    const [editValue, setEditValue] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingCell && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingCell]);

    // ── Pagination for mobile (FIX #14) ──
    const [colPage, setColPage] = useState(0);
    const COLS_PER_PAGE = 5;
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Persist scroll position
    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        const saved = typeof window !== 'undefined' ? sessionStorage.getItem('is-scroll-x') : null;
        if (saved) el.scrollLeft = parseInt(saved);
        const handler = () => {
            if (typeof window !== 'undefined') sessionStorage.setItem('is-scroll-x', String(el.scrollLeft));
        };
        el.addEventListener('scroll', handler, { passive: true });
        return () => el.removeEventListener('scroll', handler);
    }, []);

    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const statements = results.incomeStatements;
    const lastHistIdx = statements.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

    // Pagination
    const totalPages = Math.ceil(statements.length / COLS_PER_PAGE);
    const visibleStatements = statements.slice(colPage * COLS_PER_PAGE, (colPage + 1) * COLS_PER_PAGE);
    const visibleStartIdx = colPage * COLS_PER_PAGE;

    type ISKey = keyof typeof statements[0];
    const rows: { label: string; key: ISKey; format: 'currency' | 'percent' | 'eps'; bold?: boolean; subheader?: boolean; separator?: boolean }[] = [
        { label: 'Revenue', key: 'revenue', format: 'currency', bold: true },
        { label: 'YoY Growth', key: 'revenueGrowthRate', format: 'percent' },
        { label: 'COGS', key: 'cogs', format: 'currency' },
        { label: 'Gross Profit', key: 'grossProfit', format: 'currency', bold: true },
        { label: 'Gross Margin', key: 'grossMargin', format: 'percent' },
        { label: '', key: 'revenue', format: 'currency', separator: true },
        { label: 'OPERATING EXPENSES', key: 'revenue', format: 'currency', subheader: true },
        { label: 'SG&A', key: 'sgaExpense', format: 'currency' },
        { label: 'R&D', key: 'rdExpense', format: 'currency' },
        { label: 'Depreciation', key: 'depreciation', format: 'currency' },
        { label: 'Amortization', key: 'amortization', format: 'currency' },
        { label: 'Other OpEx', key: 'otherOpex', format: 'currency' },
        { label: 'Stock-Based Comp', key: 'stockBasedComp', format: 'currency' },
        { label: 'Total OpEx', key: 'totalOpex', format: 'currency', bold: true },
        { label: '', key: 'revenue', format: 'currency', separator: true },
        { label: 'EBIT', key: 'ebit', format: 'currency', bold: true },
        { label: 'EBITDA', key: 'ebitda', format: 'currency', bold: true },
        { label: 'EBIT Margin', key: 'ebitMargin', format: 'percent' },
        { label: '', key: 'revenue', format: 'currency', separator: true },
        { label: 'Interest Income', key: 'interestIncome', format: 'currency' },
        { label: 'Interest Expense', key: 'interestExpense', format: 'currency' },
        { label: 'Other Income/Exp', key: 'otherIncomeExpense', format: 'currency' },
        { label: 'EBT', key: 'ebt', format: 'currency', bold: true },
        { label: 'Tax Expense', key: 'taxExpense', format: 'currency' },
        { label: 'Tax Rate', key: 'taxRate', format: 'percent' },
        { label: '', key: 'revenue', format: 'currency', separator: true },
        { label: 'Net Income', key: 'netIncome', format: 'currency', bold: true },
        { label: 'Net Margin', key: 'netMargin', format: 'percent' },
        { label: 'EPS', key: 'eps', format: 'eps' },
    ];

    // Search filter
    const filteredRows = searchTerm
        ? rows.filter(r => r.separator || r.subheader || r.label.toLowerCase().includes(searchTerm.toLowerCase()))
        : rows;

    /** Highlight matching text */
    function highlightLabel(label: string) {
        if (!searchTerm || !label) return label;
        const idx = label.toLowerCase().indexOf(searchTerm.toLowerCase());
        if (idx === -1) return label;
        return (
            <>
                {label.slice(0, idx)}
                <mark style={{ background: 'rgba(79,140,255,0.3)', color: 'inherit', padding: '0 2px', borderRadius: 2 }}>
                    {label.slice(idx, idx + searchTerm.length)}
                </mark>
                {label.slice(idx + searchTerm.length)}
            </>
        );
    }

    /** Get column CSS class for historical/projected visual distinction */
    function colClass(idx: number, s: typeof statements[0]): string {
        const base = s.periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    /** Handle double-click to start editing */
    function handleCellDoubleClick(rowIdx: number, colIdx: number, s: typeof statements[0], row: typeof rows[0]) {
        if (s.periodType === 'historical') return; // Only edit projected cells
        if (row.format === 'percent' || row.separator || row.subheader) return; // Skip non-editable
        const val = s[row.key] as number;
        setEditingCell({ rowIdx, colIdx });
        setEditValue(String(Math.round(val)));
    }

    /** Handle edit save */
    function handleEditSave(row: typeof rows[0], s: typeof statements[0]) {
        const num = parseFloat(editValue);
        if (!isNaN(num)) {
            setCellOverride(activeScenarioId, row.key as string, s.period, num);
            calculateModel();
        }
        setEditingCell(null);
    }

    /** Handle edit cancel */
    function handleEditCancel() {
        setEditingCell(null);
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>💰 Income Statement</h1>
                {/* Search input (FIX #8) */}
                <div style={{ position: 'relative', minWidth: 220 }}>
                    <input
                        ref={searchInputRef}
                        id="is-search"
                        type="text"
                        className="fin-input"
                        placeholder="Search line items…"
                        aria-label="Search income statement line items"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ paddingRight: 28 }}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            aria-label="Clear search"
                            style={{
                                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
                                fontSize: 16, lineHeight: 1,
                            }}
                        >×</button>
                    )}
                </div>
            </div>
            <div className="metric-card" style={{ marginBottom: 24 }}>
                <RevenueChart data={statements} />
            </div>

            {/* Pagination controls (FIX #14) */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'flex-end' }}>
                    <button
                        className="btn-secondary"
                        disabled={colPage === 0}
                        onClick={() => setColPage(p => p - 1)}
                        aria-label="Previous columns"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                    >← Prev</button>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Page {colPage + 1} of {totalPages}
                    </span>
                    <button
                        className="btn-secondary"
                        disabled={colPage >= totalPages - 1}
                        onClick={() => setColPage(p => p + 1)}
                        aria-label="Next columns"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                    >Next →</button>
                </div>
            )}

            <div className="metric-card table-scroll-container" ref={scrollContainerRef} style={{ overflow: 'auto' }}>
                <table className="fin-table" role="table" aria-label="Income Statement">
                    <thead>
                        <tr>
                            <th scope="col" className="sticky-col">Line Item</th>
                            {visibleStatements.map((s, i) => (
                                <th key={s.period} scope="col" className={colClass(visibleStartIdx + i, s)}>
                                    {s.period}
                                </th>
                            ))}
                        </tr>
                        {/* Period type label row */}
                        <tr className="period-type-row">
                            <td className="sticky-col"></td>
                            {visibleStatements.map((s, i) => (
                                <td key={s.period} className={
                                    (s.periodType === 'historical' ? 'type-actual' : 'type-estimate') +
                                    ((visibleStartIdx + i) === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '')
                                }>
                                    {s.periodType === 'historical' ? 'Actual' : 'Estimate'}
                                </td>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row, rowIdx) => {
                            if (row.separator) return <tr key={rowIdx} className="row-separator"><td colSpan={visibleStatements.length + 1}></td></tr>;
                            if (row.subheader) return <tr key={rowIdx} className="row-subheader"><td colSpan={visibleStatements.length + 1}>{row.label}</td></tr>;
                            return (
                                <tr key={rowIdx} className={row.bold ? 'row-bold' : ''}>
                                    <td className="sticky-col">{highlightLabel(row.label)}</td>
                                    {visibleStatements.map((s, si) => {
                                        const globalColIdx = visibleStartIdx + si;
                                        const val = s[row.key] as number;
                                        const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === globalColIdx;
                                        const isProjected = s.periodType === 'projected';
                                        const isEditable = isProjected && row.format === 'currency';
                                        const formatted = row.format === 'percent' ? formatPercent(val) : row.format === 'eps' ? formatEPS(val, currency) : formatCurrency(val, currency);

                                        if (isEditing) {
                                            return (
                                                <td key={s.period} className={colClass(globalColIdx, s)}>
                                                    <input
                                                        ref={editInputRef}
                                                        type="number"
                                                        className="fin-input"
                                                        value={editValue}
                                                        onChange={e => setEditValue(e.target.value)}
                                                        onBlur={() => handleEditSave(row, s)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleEditSave(row, s);
                                                            if (e.key === 'Escape') handleEditCancel();
                                                        }}
                                                        aria-label={`Edit ${row.label} for ${s.period}`}
                                                        style={{ width: 90, padding: '2px 4px', fontSize: 12, textAlign: 'right' }}
                                                    />
                                                </td>
                                            );
                                        }

                                        return (
                                            <td
                                                key={s.period}
                                                className={colClass(globalColIdx, s) + (isEditable ? ' editable-cell' : '')}
                                                onDoubleClick={isEditable ? () => handleCellDoubleClick(rowIdx, globalColIdx, s, row) : undefined}
                                                title={isEditable ? 'Double-click to edit' : undefined}
                                            >
                                                {formatted}
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
}
