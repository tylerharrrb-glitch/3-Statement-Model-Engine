'use client';

import { useEffect } from 'react';
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

export default function Home() {
  const { activeTab, calculateAllScenarios, scenarios } = useModelStore();

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
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [calculateAllScenarios]);

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
      <main className="main-content animate-fade-in" key={activeTab}>
        {showScenarioSelector && <ScenarioSelector />}
        {renderPage()}
      </main>
    </div>
  );
}

