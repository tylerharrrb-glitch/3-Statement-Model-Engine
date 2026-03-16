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
    { id: 'sensitivity', label: 'Sensitivity' },
    { id: 'dcf', label: 'DCF Valuation' },
    { id: 'valuation', label: 'Valuation Multiples' },
    { id: 'ratios', label: 'Financial Ratios' },
    { id: 'cbe-metrics', label: 'CBE Banking Metrics' },
    { id: 'montecarlo', label: 'Monte Carlo' },
    { id: 'validation', label: 'Validation' },
    { id: 'historicaldata', label: 'Historical Data' },
    { id: 'import', label: 'Import Data' },
    { id: 'company-settings', label: 'Company Settings' },
];

const allItems = [...primaryItems, ...moreItems];

export default function Navbar() {
    const {
        activeTab, setActiveTab, companyName, currency,
        scenarios, activeScenarioId, calculateModel, isCalculating,
        undo, redo, undoStack, redoStack,
        setCompanyInfo, industry, ticker,
        sidebarOpen, setSidebarOpen,
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
        exportToExcel(baseScenario.results, baseScenario.assumptions, state.companyName, state.scenarios, state.historicalInputs);
    };

    const handleExportPDF = async () => {
        setExportOpen(false);
        if (!activeScenario?.results) return;
        const { exportToPDF } = await import('@/lib/export/pdf');
        exportToPDF(activeScenario.results, companyName, currency);
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
        const { exportToJSON } = await import('@/lib/export/csv-json');
        exportToJSON(activeScenario.results, companyName, currency);
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
                    </div>

                    {/* Right side actions */}
                    <div className="navbar-actions">
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
