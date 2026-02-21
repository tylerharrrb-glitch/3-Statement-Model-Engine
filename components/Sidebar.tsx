'use client';

import { useModelStore } from '@/lib/store';
import { ModelState } from '@/types/scenario';
import { CURRENCY_MAP } from '@/lib/utils';

const navItems: { id: ModelState['activeTab']; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'model', label: 'Assumptions', icon: '⚙️' },
    { id: 'income', label: 'Income Statement', icon: '💰' },
    { id: 'balance', label: 'Balance Sheet', icon: '🏦' },
    { id: 'cashflow', label: 'Cash Flow', icon: '💵' },
    { id: 'working-capital', label: 'Working Capital', icon: '📦' },
    { id: 'depreciation', label: 'Depreciation', icon: '🏭' },
    { id: 'debt-schedule', label: 'Debt Schedule', icon: '🏛️' },
    { id: 'scenarios', label: 'Scenarios', icon: '🔀' },
    { id: 'sensitivity', label: 'Sensitivity', icon: '📈' },
    { id: 'montecarlo', label: 'Monte Carlo', icon: '🎲' },
    { id: 'validation', label: 'Validation', icon: '✅' },
    { id: 'historicaldata', label: 'Historical Data', icon: '📋' },
    { id: 'import', label: 'Import Data', icon: '📥' },
    { id: 'company-settings', label: 'Company Settings', icon: '🏢' },
];

export default function Sidebar() {
    const {
        activeTab, setActiveTab, companyName, ticker, isCalculating, currency,
        scenarios, activeScenarioId, setActiveScenario, calculateModel,
        undo, redo, undoStack, redoStack, setCompanyInfo, industry, setCountryPreset,
        sidebarOpen, setSidebarOpen,
    } = useModelStore();
    const activeScenario = scenarios.find(s => s.id === activeScenarioId);
    const countryPreset = activeScenario?.assumptions?.countryPreset || 'us';

    const handleExportExcel = async () => {
        useModelStore.getState().calculateAllScenarios();
        const state = useModelStore.getState();
        const baseScenario = state.scenarios.find(s => s.type === 'base')
            ?? state.scenarios.find(s => s.id === state.activeScenarioId);
        if (!baseScenario?.results) return;
        const results = baseScenario.results;
        const assumptions = baseScenario.assumptions;
        const { exportToExcel } = await import('@/lib/export/excel');
        exportToExcel(results, assumptions, state.companyName, state.scenarios, state.historicalInputs);
    };

    const handleExportPDF = async () => {
        if (!activeScenario?.results) return;
        const { exportToPDF } = await import('@/lib/export/pdf');
        exportToPDF(activeScenario.results, companyName, currency);
    };

    const handleNavClick = (tab: ModelState['activeTab']) => {
        setActiveTab(tab);
        // Close sidebar on mobile after navigation
        setSidebarOpen(false);
    };

    return (
        <>
            {/* Hamburger button — visible only on mobile (FIX #9) */}
            <button
                id="hamburger-menu"
                className="hamburger-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={sidebarOpen}
                aria-controls="sidebar-nav"
            >
                <span className="hamburger-icon">
                    {sidebarOpen ? '✕' : '☰'}
                </span>
            </button>

            {/* Mobile overlay backdrop */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            <nav
                id="sidebar-nav"
                className={`sidebar ${sidebarOpen ? 'open' : ''}`}
                role="navigation"
                aria-label="Main navigation"
                style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}
            >
                <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, background: 'var(--gradient-1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        FinModel Engine
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{companyName} ({ticker})</div>
                    <select
                        value={currency}
                        onChange={(e) => setCompanyInfo(companyName, ticker, industry, e.target.value)}
                        aria-label="Select currency"
                        style={{
                            marginTop: 8, width: '100%', padding: '4px 8px',
                            fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer',
                        }}
                    >
                        {Object.entries(CURRENCY_MAP).map(([code, cfg]) => (
                            <option key={code} value={code}>{cfg.label}</option>
                        ))}
                    </select>
                    <select
                        value={countryPreset}
                        onChange={(e) => setCountryPreset(e.target.value as 'us' | 'egypt' | 'custom')}
                        aria-label="Select country preset"
                        style={{
                            marginTop: 4, width: '100%', padding: '4px 8px',
                            fontSize: 11, background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                            border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer',
                        }}
                    >
                        <option value="us">🇺🇸 United States</option>
                        <option value="egypt">🇪🇬 Egypt</option>
                        <option value="custom">⚙️ Custom</option>
                    </select>
                </div>

                <div style={{ padding: '12px 8px' }}>
                    <div style={{ padding: '0 8px', marginBottom: 8, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Navigation
                    </div>
                    {navItems.map(item => (
                        <button
                            key={item.id}
                            className={`sidebar-link ${activeTab === item.id ? 'active' : ''}`}
                            onClick={() => handleNavClick(item.id)}
                            aria-label={`Navigate to ${item.label}`}
                            aria-current={activeTab === item.id ? 'page' : undefined}
                            style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'none', textAlign: 'left' }}
                        >
                            <span aria-hidden="true">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Active Scenario
                    </div>
                    <select
                        className="fin-select"
                        style={{ width: '100%', marginBottom: 8 }}
                        value={activeScenarioId}
                        onChange={(e) => setActiveScenario(e.target.value)}
                        aria-label="Select active scenario"
                    >
                        {scenarios.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>

                    <button
                        id="calculate-btn"
                        className="btn-primary"
                        style={{ width: '100%' }}
                        onClick={calculateModel}
                        disabled={isCalculating}
                        aria-label={isCalculating ? 'Calculating model' : 'Calculate financial model'}
                    >
                        {isCalculating ? '⏳ Calculating...' : '▶ Calculate'}
                    </button>

                    {activeScenario?.results && (
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--accent-emerald)' }} role="status">
                            ✓ {activeScenario.results.convergenceInfo.converged ? 'Converged' : 'Not converged'}
                            {' '}({activeScenario.results.convergenceInfo.iterations} iter)
                        </div>
                    )}
                </div>

                {/* Undo / Redo */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 6 }}>
                    <button
                        id="undo-btn"
                        className="btn-secondary"
                        style={{ flex: 1, fontSize: 12, padding: '6px 8px', opacity: undoStack.length === 0 ? 0.4 : 1 }}
                        onClick={undo}
                        disabled={undoStack.length === 0}
                        aria-disabled={undoStack.length === 0}
                        title="Undo (Ctrl+Z)"
                        aria-label={`Undo${undoStack.length > 0 ? `: ${undoStack[undoStack.length - 1].description}` : ''}`}
                    >
                        ↩ Undo
                    </button>
                    <button
                        id="redo-btn"
                        className="btn-secondary"
                        style={{ flex: 1, fontSize: 12, padding: '6px 8px', opacity: redoStack.length === 0 ? 0.4 : 1 }}
                        onClick={redo}
                        disabled={redoStack.length === 0}
                        aria-disabled={redoStack.length === 0}
                        title="Redo (Ctrl+Shift+Z)"
                        aria-label={`Redo${redoStack.length > 0 ? `: ${redoStack[redoStack.length - 1].description}` : ''}`}
                    >
                        ↪ Redo
                    </button>
                </div>

                {/* Export */}
                <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                        Export
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <button
                            id="export-excel"
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 8px' }}
                            onClick={handleExportExcel}
                            disabled={!activeScenario?.results}
                            aria-label="Export to Excel"
                        >
                            📗 Excel
                        </button>
                        <button
                            id="export-pdf"
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 8px' }}
                            onClick={handleExportPDF}
                            disabled={!activeScenario?.results}
                            aria-label="Export to PDF"
                        >
                            📕 PDF
                        </button>
                        <button
                            id="export-csv"
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 8px' }}
                            onClick={async () => {
                                if (!activeScenario?.results) return;
                                const { exportToCSV } = await import('@/lib/export/csv-json');
                                exportToCSV(activeScenario.results, companyName, currency);
                            }}
                            disabled={!activeScenario?.results}
                            aria-label="Export to CSV"
                        >
                            📄 CSV
                        </button>
                        <button
                            id="export-json"
                            className="btn-secondary"
                            style={{ fontSize: 12, padding: '6px 8px' }}
                            onClick={async () => {
                                if (!activeScenario?.results) return;
                                const { exportToJSON } = await import('@/lib/export/csv-json');
                                exportToJSON(activeScenario.results, companyName, currency);
                            }}
                            disabled={!activeScenario?.results}
                            aria-label="Export to JSON"
                        >
                            📋 JSON
                        </button>
                    </div>
                </div>
            </nav>
        </>
    );
}
