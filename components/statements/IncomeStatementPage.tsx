'use client';
import { useModelStore } from '@/lib/store';
import { formatCurrency, formatPercent, formatEPS } from '@/lib/utils';
import RevenueChart from '@/components/charts/RevenueChart';

export default function IncomeStatementPage() {
    const { scenarios, activeScenarioId, currency } = useModelStore();
    const results = scenarios.find(s => s.id === activeScenarioId)?.results;
    if (!results) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Calculate model first</div>;

    const statements = results.incomeStatements;
    // Find the index of the last historical period for separator placement
    const lastHistIdx = statements.reduce((acc, s, i) => s.periodType === 'historical' ? i : acc, -1);

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

    /** Get column CSS class for historical/projected visual distinction */
    function colClass(idx: number, s: typeof statements[0]): string {
        const base = s.periodType === 'historical' ? 'col-historical' : 'col-projected';
        const sep = idx === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '';
        return base + sep;
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700 }}>💰 Income Statement</h1>
            </div>
            <div className="metric-card" style={{ marginBottom: 24 }}>
                <RevenueChart data={statements} />
            </div>
            <div className="metric-card" style={{ overflow: 'auto' }}>
                <table className="fin-table">
                    <thead>
                        <tr>
                            <th>Line Item</th>
                            {statements.map((s, i) => (
                                <th key={s.period} className={colClass(i, s)}>
                                    {s.period}
                                </th>
                            ))}
                        </tr>
                        {/* Period type label row */}
                        <tr className="period-type-row">
                            <td></td>
                            {statements.map((s, i) => (
                                <td key={s.period} className={
                                    (s.periodType === 'historical' ? 'type-actual' : 'type-estimate') +
                                    (i === lastHistIdx + 1 && lastHistIdx >= 0 ? ' col-separator-left' : '')
                                }>
                                    {s.periodType === 'historical' ? 'Actual' : 'Estimate'}
                                </td>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => {
                            if (row.separator) return <tr key={i} className="row-separator"><td colSpan={statements.length + 1}></td></tr>;
                            if (row.subheader) return <tr key={i} className="row-subheader"><td colSpan={statements.length + 1}>{row.label}</td></tr>;
                            return (
                                <tr key={i} className={row.bold ? 'row-bold' : ''}>
                                    <td>{row.label}</td>
                                    {statements.map((s, si) => {
                                        const val = s[row.key] as number;
                                        const formatted = row.format === 'percent' ? formatPercent(val) : row.format === 'eps' ? formatEPS(val, currency) : formatCurrency(val, currency);
                                        return <td key={s.period} className={colClass(si, s)}>{formatted}</td>;
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
