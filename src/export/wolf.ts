// WOLF-compatible JSON. Reads ModelRun only; recalculates nothing.
import type { WolfExport } from '../../packages/rates-registry/src/wolf-schema';
import type { ModelInputs, ModelRun } from '../engine/types';

export function buildWolfExport(run: ModelRun, inp: ModelInputs): WolfExport {
  const last = run.years.length - 1;
  const base = run.nHist - 1;
  const at = (id: string, i: number) => (run.rows[id]?.[i] ?? 0) as number;
  return {
    schemaVersion: 1,
    source: '3SM',
    company: { name: inp.company.name, ticker: inp.company.ticker },
    scenario: run.scenario,
    currency: 'EGP',
    units: 'absolute',
    ratesSnapshotHash: run.rates.hash,
    fcffByYear: run.periodLabels.slice(run.nHist).map((period, k) => ({ period, value: at('fcff', run.nHist + k) })),
    netDebt: {
      period: run.periodLabels[base],
      borrowings: at('total_debt', base),
      leaseLiabilities: at('lease_liab', base),
      cash: at('cash', base),
      investments: at('liquid', base) - at('cash', base),
      netDebt: at('net_debt', base),
    },
    debtLikeItems: {
      leaseLiabilities: at('lease_liab', base),
      employeeBenefitObligations: at('ebo_total', base),
      provisions: at('provisions', base),
      dividendsPayable: at('dividends_payable', base),
    },
    cashAndInvestmentsByLiquidity: {
      cash: at('cash', base),
      fvtpl: at('fvtpl', base),
      amortizedCostCurrent: at('inv_cur', base),
      amortizedCostNonCurrent: at('inv_nc', base),
      restrictedOtherFinancialAssets: at('ofa', base),
    },
    shares: at('shares', base),
  };
}
