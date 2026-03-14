'use client';

import { useEffect, useState } from 'react';
import { AnalystPanel } from '@/components/AnalystPanel';
import { useModelStore } from '@/lib/store';
import Sidebar from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import ModelPage from '@/components/ModelPage';
import IncomeStatementPage from '@/components/statements/IncomeStatementPage';
import BalanceSheetPage from '@/components/statements/BalanceSheetPage';
import CashFlowPage from '@/components/statements/CashFlowPage';
import ScenariosPage from '@/components/ScenariosPage';
import SensitivityPage from '@/components/SensitivityPage';
import MonteCarloPage from '@/components/MonteCarloPage';
import HistoricalImportPage from '@/components/HistoricalImportPage';
import HistoricalDataInput from '@/components/HistoricalDataInput';
import ScenarioSelector from '@/components/ScenarioSelector';
import WorkingCapitalPage from '@/components/schedules/WorkingCapitalPage';
import DepreciationPage from '@/components/schedules/DepreciationPage';
import DebtSchedulePage from '@/components/schedules/DebtSchedulePage';
import ValidationPage from '@/components/ValidationPage';
import CompanySettings from '@/components/CompanySettings';
import DCFPage from '@/components/DCFPage';
import ValuationPage from '@/components/ValuationPage';
import RatiosPage from '@/components/RatiosPage';
import CBEMetricsPage from '@/components/CBEMetricsPage';
import ErrorBanner from '@/components/ErrorBanner';
import ConflictModal from '@/components/ConflictModal';

export default function Home() {
  const { activeTab, calculateAllScenarios, scenarios, activeScenarioId, calculationError, conflictDetected, dataVersion } = useModelStore();
  const [analystOpen, setAnalystOpen] = useState(false);

  // Build modelData for AI Analyst panel from active scenario
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

  useEffect(() => {
    const hasResults = scenarios.some(s => s.results !== null);
    if (!hasResults) {
      calculateAllScenarios();
    }
  }, []);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        calculateAllScenarios();
      }
      // Undo/Redo keyboard shortcuts
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

  // Conflict detection via localStorage 'storage' event (FIX #13)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'financial-model-storage' && e.newValue) {
        // Another tab modified the data
        useModelStore.setState({ conflictDetected: true });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Show ScenarioSelector on statement, dashboard, and schedule tabs
  const showScenarioSelector = ['dashboard', 'income', 'balance', 'cashflow', 'working-capital', 'depreciation', 'debt-schedule'].includes(activeTab);

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
      case 'sensitivity': return <SensitivityPage />;
      case 'dcf': return <DCFPage />;
      case 'valuation': return <ValuationPage />;
      case 'ratios': return <RatiosPage />;
      case 'cbe-metrics': return <CBEMetricsPage />;
      case 'montecarlo': return <MonteCarloPage />;
      case 'import': return <HistoricalImportPage />;
      case 'historicaldata': return <HistoricalDataInput />;
      case 'validation': return <ValidationPage />;
      case 'company-settings': return <CompanySettings />;
      default: return <Dashboard />;
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main className="main-content animate-fade-in" key={activeTab} role="main" aria-label="Main content area">
        {/* Error banner (FIX #11) */}
        <ErrorBanner />
        {/* Conflict modal (FIX #13) */}
        <ConflictModal />
        {showScenarioSelector && <ScenarioSelector />}
        {renderPage()}
      </main>

      {/* AI Analyst toggle button */}
      <button
        onClick={() => setAnalystOpen(prev => !prev)}
        style={{
          position: 'fixed',
          top: '16px',
          right: analystOpen ? '436px' : '16px',
          zIndex: 1001,
          padding: '8px 16px',
          background: 'var(--accent-blue, #4f8cff)',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600,
          transition: 'right 0.2s ease',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}
      >
        🧮 {analystOpen ? 'Close Analyst' : 'AI Analyst'}
      </button>

      {/* AI Analyst chat panel */}
      <AnalystPanel
        modelData={modelData}
        isOpen={analystOpen}
        onClose={() => setAnalystOpen(false)}
      />

      {/* Skip to content link for accessibility (FIX #10) */}
      <a href="#" className="sr-only" style={{ position: 'absolute', top: -9999, left: -9999 }}>
        Skip to main content
      </a>
    </div>
  );
}
