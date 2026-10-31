// Hand-built debt cases (Decision 10). MOPCO has no bank debt and the Telecom fixture is synthetic.
// A borrowing of 1,000,000,000 is added to the opening balance sheet with matching cash.
import type { ModelInputs, Tranche } from '../src/engine/types';

export const LOAN = 1_000_000_000;
const tr = (o: Partial<Tranche>): Tranche => ({ id: 't1', name: 'Term loan', currency: 'EGP', rateType: 'fixed', fixedRate: 0.20, spread: 0, openingEgp: LOAN, borrow: Array(10).fill(0), repay: Array(10).fill(0), ...o });

export function withDebt(base: ModelInputs, tranche: Partial<Tranche>): ModelInputs {
  const c: ModelInputs = JSON.parse(JSON.stringify(base));
  c.historicals.lines.push({ label: 'Hand-built term loan', statement: 'BS', mapsTo: 'debt_nc', sign: 1, values: { 2024: 0, 2025: LOAN } });
  const cash = c.historicals.lines.find(l => l.mapsTo === 'cash')!;
  cash.values['2025'] += LOAN;
  // Keep the historical cash flow tied: the loan is drawn in FY2025.
  c.historicals.lines.find(l => l.mapsTo === 'cf_borrow')!.values['2025'] = LOAN;
  for (const id of ['cf_cff', 'cf_net']) c.historicals.reported.find(r => r.id === id)!.values['2025'] += LOAN;
  c.tranches = [tr(tranche)];
  return c;
}
const each = (c: ModelInputs, f: (d: ModelInputs['scenarios']['base']) => void) => { for (const k of ['bear', 'base', 'bull'] as const) f(c.scenarios[k]); };

export const amortizing = (b: ModelInputs) => withDebt(b, { repay: Array(10).fill(LOAN / 5) });
export const floating = (b: ModelInputs) => {
  const c = withDebt(b, { name: 'Floating loan', rateType: 'floating', spread: 0.02 });
  each(c, d => { d.base_delta = [0, -0.03, -0.03, -0.03, -0.03, -0.03, -0.03, -0.03, -0.03, -0.03]; });
  return c;
};
export const revolverCase = (b: ModelInputs) => {
  const c = withDebt(b, {});
  // Year 1 minimum cash forces a draw; from year 2 the surplus repays it first.
  each(c, d => { d.min_cash = [20_000_000_000, 0, 0, 0, 0, 0, 0, 0, 0, 0]; });
  return c;
};
export const sweep = (b: ModelInputs) => {
  const c = withDebt(b, {});
  each(c, d => { d.sweep_pct = Array(10).fill(0.1); });
  return c;
};
export const usdLoan = (b: ModelInputs) => {
  const c = withDebt(b, { name: 'USD loan', currency: 'USD', fixedRate: 0.08, repay: Array(10).fill(1_000_000) });
  c.settings.usd.cash = 0.5;
  each(c, d => { d.fx_close = Array.from({ length: 10 }, (_, i) => 56.0429 * 1.1 ** (i + 1)); });
  return c;
};
