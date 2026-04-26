'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AnalystPanel } from '@/components/AnalystPanel';
import { useModelStore } from '@/lib/store';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Dashboard from '@/components/Dashboard';
import ModelPage from '@/components/ModelPage';
import IncomeStatementPage from '@/components/statements/IncomeStatementPage';
import BalanceSheetPage from '@/components/statements/BalanceSheetPage';
import CashFlowPage from '@/components/statements/CashFlowPage';
import ScenariosPage from '@/components/ScenariosPage';
import HistoricalImportPage from '@/components/HistoricalImportPage';
import HistoricalDataInput from '@/components/HistoricalDataInput';
import ScenarioSelector from '@/components/ScenarioSelector';
import WorkingCapitalPage from '@/components/schedules/WorkingCapitalPage';
import DepreciationPage from '@/components/schedules/DepreciationPage';
import DebtSchedulePage from '@/components/schedules/DebtSchedulePage';
import ValidationPage from '@/components/ValidationPage';
import CompanySettings from '@/components/CompanySettings';
import RatiosPage from '@/components/RatiosPage';
import LiveRatesPanel from '@/components/LiveRatesPanel';
import CBERateBanner from '@/components/CBERateBanner';
import ErrorBanner from '@/components/ErrorBanner';
import ConflictModal from '@/components/ConflictModal';

// Section labels for each tab — 3SM scope: pure 3-statement projection.
// DCF/valuation/sensitivity/Monte-Carlo/CBE-metrics moved to sibling engines.
const SECTION_LABELS: Record<string, { num: string; label: string }> = {
    dashboard: { num: '01', label: 'SUMMARY DASHBOARD' },
    model: { num: '02', label: 'ASSUMPTIONS' },
    income: { num: '03', label: 'INCOME STATEMENT' },
    balance: { num: '04', label: 'BALANCE SHEET' },
    cashflow: { num: '05', label: 'CASH FLOW STATEMENT' },
    scenarios: { num: '06', label: 'SCENARIO MANAGEMENT' },
    'working-capital': { num: '07', label: 'WORKING CAPITAL' },
    depreciation: { num: '08', label: 'DEPRECIATION SCHEDULE' },
    'debt-schedule': { num: '09', label: 'DEBT SCHEDULE' },
    ratios: { num: '10', label: 'FINANCIAL RATIOS' },
    validation: { num: '11', label: 'MODEL VALIDATION' },
    historicaldata: { num: '12', label: 'HISTORICAL DATA' },
    import: { num: '13', label: 'DATA IMPORT' },
    'company-settings': { num: '14', label: 'COMPANY SETTINGS' },
    'live-rates': { num: '15', label: 'LIVE MARKET RATES' },
};

export default function Home() {
    const { activeTab, calculateAllScenarios, scenarios, activeScenarioId } = useModelStore();
    const [analystOpen, setAnalystOpen] = useState(false);
    const mainRef = useRef<HTMLDivElement>(null);

    // Build modelData for AI Analyst panel
    const activeScenario = scenarios.find(s => s.id === activeScenarioId);
    const modelData = activeScenario?.results
        ? {
            companyName: useModelStore.getState().companyName,
            currency: useModelStore.getState().currency ?? 'EGP',
            incomeStatements: activeScenario.results.incomeStatements,
            balanceSheets: activeScenario.results.balanceSheets,
            cashFlows: activeScenario.results.cashFlowStatements,
            ratios: activeScenario.results.ratios,
            integrationChecks: activeScenario.results.integrationChecks,
            convergenceInfo: activeScenario.results.convergenceInfo,
        }
        : null;

    // Initial calculation
    useEffect(() => {
        const hasResults = scenarios.some(s => s.results !== null);
        if (!hasResults) {
            calculateAllScenarios();
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                calculateAllScenarios();
            }
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                useModelStore.getState().undo();
            }
            if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
                e.preventDefault();
                useModelStore.getState().redo();
            }
        };
        window.addEventListener('keydown', handleKeyboard);
        return () => window.removeEventListener('keydown', handleKeyboard);
    }, [calculateAllScenarios]);

    // Conflict detection
    useEffect(() => {
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'financial-model-storage' && e.newValue) {
                useModelStore.setState({ conflictDetected: true });
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);



    // Show ScenarioSelector on statement, dashboard, and schedule tabs
    const showScenarioSelector = ['dashboard', 'income', 'balance', 'cashflow', 'working-capital', 'depreciation', 'debt-schedule'].includes(activeTab);

    const sectionInfo = SECTION_LABELS[activeTab];

    const renderPage = () => {
        switch (activeTab) {
            case 'dashboard': return <Dashboard />;
            case 'model': return <ModelPage />;
            case 'income': return <IncomeStatementPage />;
            case 'balance': return <BalanceSheetPage />;
            case 'cashflow': return <CashFlowPage />;
            case 'working-capital': return <WorkingCapitalPage />;
            case 'depreciation': return <DepreciationPage />;
            case 'debt-schedule': return <DebtSchedulePage />;
            case 'scenarios': return <ScenariosPage />;
            case 'ratios': return <RatiosPage />;
            case 'import': return <HistoricalImportPage />;
            case 'historicaldata': return <HistoricalDataInput />;
            case 'validation': return <ValidationPage />;
            case 'company-settings': return <CompanySettings />;
            case 'live-rates': return <LiveRatesPanel />;
            default: return <Dashboard />;
        }
    };

    return (
        <div style={{ paddingTop: 56 }}>
            <Navbar />
            <CBERateBanner />

            {showScenarioSelector && <ScenarioSelector />}

            {/* Error banner */}
            <ErrorBanner />
            <ConflictModal />

            {/* Section Label + Content */}
            <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 24px' }} ref={mainRef}>
                {sectionInfo && (
                    <div style={{ padding: '16px 0 8px' }} key={`label-${activeTab}`}>
                        <div className="section-label">{sectionInfo.num} — {sectionInfo.label}</div>
                    </div>
                )}

                <div key={activeTab} role="main" aria-label="Main content area">
                    {renderPage()}
                </div>

                <Footer />
            </div>

            {/* AI Analyst toggle */}
            <button
                onClick={() => setAnalystOpen(prev => !prev)}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: analystOpen ? '436px' : '20px',
                    zIndex: 1001,
                    padding: '10px 18px',
                    background: 'var(--accent-gold)',
                    color: 'var(--bg-primary)',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontFamily: 'var(--ff-mono)',
                    fontSize: '.78rem',
                    fontWeight: 600,
                    transition: 'right 0.2s ease',
                    boxShadow: '0 4px 16px rgba(201,168,76,.3)',
                }}
            >
                {analystOpen ? 'Close Analyst' : 'AI Analyst'}
            </button>

            {/* AI Analyst chat panel */}
            <AnalystPanel
                modelData={modelData}
                isOpen={analystOpen}
                onClose={() => setAnalystOpen(false)}
            />

            {/* Skip to content */}
            <a href="#" className="sr-only" style={{ position: 'absolute', top: -9999, left: -9999 }}>
                Skip to main content
            </a>
        </div>
    );
}
