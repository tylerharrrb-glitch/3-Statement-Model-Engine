'use client';

import { useState, useRef, useEffect } from 'react';
import { useModelStore } from '@/lib/store';
import { ModelState } from '@/types/scenario';
import { CURRENCY_MAP } from '@/lib/utils';

// Primary nav items shown directly in nav bar
const primaryItems: { id: ModelState['activeTab']; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'model', label: 'Assumptions' },
    { id: 'income', label: 'Income Statement' },
    { id: 'balance', label: 'Balance Sheet' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'scenarios', label: 'Scenarios' },
];

// Secondary nav items in "More" dropdown
const moreItems: { id: ModelState['activeTab']; label: string }[] = [
    { id: 'working-capital', label: 'Working Capital' },
    { id: 'depreciation', label: 'Depreciation' },
    { id: 'debt-schedule', label: 'Debt Schedule' },
    { id: 'ratios', label: 'Financial Ratios' },
    { id: 'validation', label: 'Validation' },
    { id: 'historicaldata', label: 'Historical Data' },
    { id: 'import', label: 'Import Data' },
    { id: 'company-settings', label: 'Company Settings' },
    { id: 'live-rates', label: 'Live Rates' },
];

// Cross-engine portfolio links (open in new tab) — Fix 8
const engineLinks: { label: string; href: string }[] = [
    { label: 'WOLF Valuation Engine', href: 'https://wolf-valuation-engine.pages.dev' },
    { label: 'VALOR M&A Engine', href: 'https://valor-ma-engine.pages.dev' },
];

const allItems = [...primaryItems, ...moreItems];

export default function Navbar() {
    const {
        activeTab, setActiveTab, companyName, currency,
        scenarios, activeScenarioId, calculateModel, isCalculating,
        undo, redo, undoStack, redoStack,
        setCompanyInfo, industry, ticker,
        sidebarOpen, setSidebarOpen,
        liveRates, refreshLiveRates,
    } = useModelStore();

    const [moreOpen, setMoreOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);
    const exportRef = useRef<HTMLDivElement>(null);

    const activeScenario = scenarios.find(s => s.id === activeScenarioId);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
            if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleExportExcel = async () => {
        setExportOpen(false);
        useModelStore.getState().calculateAllScenarios();
        const state = useModelStore.getState();
        const baseScenario = state.scenarios.find(s => s.type === 'base')
            ?? state.scenarios.find(s => s.id === state.activeScenarioId);
        if (!baseScenario?.results) return;
        const { exportToExcel } = await import('@/lib/export/excel');
        exportToExcel(baseScenario.results, baseScenario.assumptions, state.companyName, state.scenarios, state.historicalInputs, state.liveRates);
    };

    const handleExportPDF = async () => {
        setExportOpen(false);
        if (!activeScenario?.results) return;
        const state = useModelStore.getState();
        const { exportToPDF } = await import('@/lib/export/pdf');
        exportToPDF(activeScenario.results, companyName, currency, state.liveRates);
    };

    const handleExportCSV = async () => {
        setExportOpen(false);
        if (!activeScenario?.results) return;
        const { exportToCSV } = await import('@/lib/export/csv-json');
        exportToCSV(activeScenario.results, companyName, currency);
    };

    const handleExportJSON = async () => {
        setExportOpen(false);
        if (!activeScenario?.results) return;
        const state = useModelStore.getState();
        const { exportToJSON } = await import('@/lib/export/csv-json');
        exportToJSON({
            companyName: state.companyName,
            ticker: state.ticker,
            industry: state.industry,
            currency: state.currency,
            country: state.country,
            fiscalYearEnd: state.fiscalYearEnd,
            valuationDate: state.valuationDate,
            activeScenarioId: state.activeScenarioId,
            assumptions: activeScenario.assumptions,
            historicalInputs: state.historicalInputs,
            scenarios: state.scenarios,
            results: activeScenario.results,
            liveRates: state.liveRates,
        });
    };

    const handleNavClick = (tab: ModelState['activeTab']) => {
        setActiveTab(tab);
        setMoreOpen(false);
        setSidebarOpen(false);
    };

    const isMoreActive = moreItems.some(m => m.id === activeTab);

    return (
        <>
            {/* Hamburger — mobile only */}
            <button
                id="hamburger-menu"
                className="hamburger-btn"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={sidebarOpen}
            >
                <span className="hamburger-icon">{sidebarOpen ? '✕' : '☰'}</span>
            </button>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Mobile nav panel */}
            <div className={`mobile-nav ${sidebarOpen ? 'open' : ''}`}>
                {allItems.map(item => (
                    <button
                        key={item.id}
                        className={`mobile-nav-link ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => handleNavClick(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', padding: '12px 0' }}>
                    <button className="btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={calculateModel} disabled={isCalculating}>
                        {isCalculating ? '⏳ Calculating...' : '▶ Calculate'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn-outline" style={{ flex: 1, fontSize: '.72rem', padding: '6px' }} onClick={undo} disabled={undoStack.length === 0}>↩ Undo</button>
                        <button className="btn-outline" style={{ flex: 1, fontSize: '.72rem', padding: '6px' }} onClick={redo} disabled={redoStack.length === 0}>↪ Redo</button>
                    </div>
                </div>
            </div>

            {/* Desktop Navbar */}
            <nav className="navbar" role="navigation" aria-label="Main navigation">
                <div className="navbar-inner">
                    {/* Brand */}
                    <div className="navbar-brand">
                        <span className="navbar-logo">3SM</span>
                        <span className="navbar-subtitle">Financial Model Engine</span>
                    </div>

                    {/* Navigation */}
                    <div className="navbar-nav">
                        {primaryItems.map(item => (
                            <button
                                key={item.id}
                                className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                                onClick={() => handleNavClick(item.id)}
                            >
                                {item.label}
                            </button>
                        ))}

                        {/* More dropdown */}
                        <div className="nav-dropdown" ref={moreRef}>
                            <button
                                className={`nav-link ${isMoreActive ? 'active' : ''}`}
                                onClick={() => setMoreOpen(!moreOpen)}
                            >
                                More ▾
                            </button>
                            <div className={`nav-dropdown-menu ${moreOpen ? 'show' : ''}`}>
                                {moreItems.map(item => (
                                    <button
                                        key={item.id}
                                        className={`nav-dropdown-item ${activeTab === item.id ? 'active' : ''}`}
                                        onClick={() => handleNavClick(item.id)}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Engines dropdown — sibling tools (DCF/M&A live there) */}
                        <div className="nav-dropdown">
                            <button className="nav-link" onClick={(e) => {
                                const m = (e.currentTarget.nextSibling as HTMLElement | null);
                                if (m) m.classList.toggle('show');
                            }}>
                                Engines ▾
                            </button>
                            <div className="nav-dropdown-menu">
                                <button className="nav-dropdown-item active" disabled>
                                    3-Statement Model (current)
                                </button>
                                {engineLinks.map(l => (
                                    <a
                                        key={l.href}
                                        href={l.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="nav-dropdown-item"
                                        style={{ display: 'block', textDecoration: 'none' }}
                                    >
                                        {l.label} ↗
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right side actions */}
                    <div className="navbar-actions">
                        {/* Live Rates Badge */}
                        {liveRates && (
                            <button
                                className="btn-outline"
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '.68rem',
                                    fontFamily: 'monospace',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                                onClick={() => { refreshLiveRates(); }}
                                title="Click to refresh live rates"
                            >
                                <span style={{ color: 'var(--accent)' }}>CBE {(liveRates.cbeDepositRate * 100).toFixed(1)}%</span>
                                <span style={{ opacity: 0.5 }}>|</span>
                                <span>USD/EGP {liveRates.usdEgpRate.toFixed(1)}</span>
                                <span style={{ opacity: 0.5 }}>|</span>
                                <span style={{ fontSize: '.62rem', opacity: 0.7 }}>⟳</span>
                            </button>
                        )}

                        {/* Undo/Redo */}
                        <button
                            className="btn-outline"
                            style={{ padding: '6px 10px', fontSize: '.72rem' }}
                            onClick={undo}
                            disabled={undoStack.length === 0}
                            title="Undo (Ctrl+Z)"
                        >
                            ↩
                        </button>
                        <button
                            className="btn-outline"
                            style={{ padding: '6px 10px', fontSize: '.72rem' }}
                            onClick={redo}
                            disabled={redoStack.length === 0}
                            title="Redo (Ctrl+Shift+Z)"
                        >
                            ↪
                        </button>

                        {/* Calculate */}
                        <button
                            className="btn-primary"
                            style={{ padding: '6px 14px', fontSize: '.72rem' }}
                            onClick={calculateModel}
                            disabled={isCalculating}
                        >
                            {isCalculating ? '⏳' : '▶'} Calc
                        </button>

                        {/* Export dropdown */}
                        <div className="nav-dropdown" ref={exportRef}>
                            <button
                                className="btn-outline"
                                style={{ padding: '6px 14px', fontSize: '.72rem' }}
                                onClick={() => setExportOpen(!exportOpen)}
                            >
                                Export ▾
                            </button>
                            <div className={`nav-dropdown-menu ${exportOpen ? 'show' : ''}`} style={{ right: 0, left: 'auto', transform: 'none', minWidth: 150 }}>
                                <button className="nav-dropdown-item" onClick={handleExportExcel} disabled={!activeScenario?.results}>📗 Excel</button>
                                <button className="nav-dropdown-item" onClick={handleExportPDF} disabled={!activeScenario?.results}>📕 PDF</button>
                                <button className="nav-dropdown-item" onClick={handleExportCSV} disabled={!activeScenario?.results}>📄 CSV</button>
                                <button className="nav-dropdown-item" onClick={handleExportJSON} disabled={!activeScenario?.results}>📋 JSON</button>
                            </div>
                        </div>

                        {/* Back to portfolio */}
                        <a
                            href="https://ahmedwael.pages.dev/"
                            className="nav-back-link"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ← Portfolio
                        </a>
                    </div>
                </div>
            </nav>
        </>
    );
}
