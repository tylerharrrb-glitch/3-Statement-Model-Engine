// runModel(inputs, ratesSnapshot) -> ModelRun. Pure and deterministic: no Date.now, no fetch, no React.
import { getRate, type RatesSnapshot } from '@registry';
import { checkSector } from './coa';
import { accountsForYear, historicalSubtotals, unmappedLines, type YearAccounts } from './historicals';
import { allocateSweep, interestOn, revolver, trancheSchedule } from './debt';
import { closeCashFlow, cashFlowBeforeRevolver } from './cash';
import { iterate } from './circularity';
import { costs } from './forecast/costs';
import { Ctx, D, Guess, Y } from './forecast/common';
import { equity } from './forecast/equity';
import { fxRates, fxRevaluation } from './forecast/fx';
import { intangibles } from './forecast/intangibles';
import { financeIncome, investments, liquidBalances } from './forecast/investments';
import { leases } from './forecast/leases';
import { nwc } from './forecast/nwc';
import { ppe } from './forecast/ppe';
import { provisions } from './forecast/provisions';
import { revenue } from './forecast/revenue';
import { tax } from './forecast/tax';
import { assembleBalanceSheet, forecastChecks } from './statements';
import { applyOutputs } from './outputs/index';
import { modelWarnings } from './warnings';
import type { CheckResult, Drivers, ModelInputs, ModelRun, Rows, Warning } from './types';

export class ModelBlockedError extends Error {}

const num = (entries: RatesSnapshot, id: string): number => {
  const r = getRate(entries.entries, id);
  if (!r || typeof r.value !== 'number') throw new ModelBlockedError(`Registry value missing or not numeric: ${id}`);
  return r.value;
};

export function buildContext(inp: ModelInputs, rates: RatesSnapshot): Ctx {
  const s = inp.settings;
  return {
    s,
    overlay: inp.overlay ?? { growth: 0, margin: 0 },
    taxRate: num(rates, 'cit_rate') / 100,
    yieldBase: num(rates, s.yieldBaseId) / 100,
    floatBase: num(rates, s.floatBaseId) / 100,
    schedRate: num(rates, 'natural_gas_schedule_tax'),
    par: inp.company.parValue,
    distributionsOp: inp.company.policy.distributionsOperating,
    interestRecOp: inp.company.policy.interestReceivedOperating,
    interestPaidOp: inp.company.policy.interestPaidOperating,
  };
}

const driversFor = (dr: Drivers, i: number): D => {
  const d: D = {};
  for (const k of Object.keys(dr) as (keyof Drivers)[]) {
    const v = dr[k][i];
    if (v === undefined) throw new ModelBlockedError(`Driver ${k} has no value for forecast year ${i + 1}`);
    d[k] = v;
  }
  return d;
};

/** Historical rows plus the opening state the first forecast year rolls from. */
export function historicalRow(acc: YearAccounts, year: number, inp: ModelInputs, c: Ctx, isLast: boolean, d0: D): Y {
  const y: Y = { ...acc, ...historicalSubtotals(acc) };
  y.tax_rate = c.taxRate;
  // The historical cash flow totals are loaded as reported, never re-derived.
  for (const r of inp.historicals.reported) {
    const v = r.values[String(year)];
    if (r.id.startsWith('cf_') && v !== undefined) y[r.id] = v;
  }
  if (y.cf_open !== undefined) y.cf_close = acc.cash;
  y.lease_total = (acc.lease_cur ?? 0) + (acc.lease_nc ?? 0);
  y.ebo_total = (acc.ebo_cur ?? 0) + (acc.ebo_nc ?? 0);
  y.debt_total = (acc.debt_cur ?? 0) + (acc.debt_nc ?? 0);
  if (acc.ppe_gross !== undefined && acc.ppe_accum !== undefined) y.ppe_nbv = acc.ppe_gross - acc.ppe_accum;
  y.dividends_payable = acc.dividends_payable ?? 0;
  y.debt_cur = acc.debt_cur ?? 0;
  y.debt_nc = acc.debt_nc ?? 0;
  y.debt_int = acc.debt_int ?? 0;
  y.ga_cash = (acc.ga ?? 0) - (acc.amort ?? 0) - (acc.dep ?? 0) * (1 - d0.depr_cogs_share);
  if (acc.bonus_re !== undefined || acc.bonus_res !== undefined) y.bonus_total = (acc.bonus_re ?? 0) + (acc.bonus_res ?? 0);
  if (isLast) {
    y.fx_close = inp.settings.fxHistClose;
    y.fx_avg = inp.settings.fxHistAvg;
    y.rev_close = 0;
    inp.tranches.forEach((tr, i) => { y[`tr${i}_close`] = tr.openingEgp; });
    const trOpen = inp.tranches.reduce((s, t) => s + t.openingEgp, 0);
    if (Math.abs(trOpen - y.debt_total) > 1) throw new ModelBlockedError(`Tranche openings ${trOpen} do not equal historical borrowings ${y.debt_total}`);
  }
  return y;
}

/** Compute one forecast year given estimates of the circular closing balances. */
export function computeYear(p: Y, d: D, c: Ctx, inp: ModelInputs, i: number, g: Guess): { y: Y; next: Guess } {
  const y: Y = {};
  const add = (o: Y) => Object.assign(y, o);
  const circ = c.s.circularity;
  add(fxRates(p, d, c));
  add(fxRevaluation(p, y, c));
  add(revenue(p, y, d, c));
  add(ppe(p, d, c));
  add(intangibles(p, d));
  add(leases(p, d));
  add(costs(p, y, d, c));
  add(nwc(y, d));
  add(provisions(p, d));
  add(investments(p, y, d));

  // Debt: scheduled movements and interest.
  const steps = inp.tranches.map((tr, k) => trancheSchedule(tr, i, p[`tr${k}_close`], y, d, c));
  y.debt_borrow = steps.reduce((s, t) => s + t.borrow, 0);
  y.debt_repay_sched = steps.reduce((s, t) => s + t.repay, 0);
  y.fxg_debt = -steps.reduce((s, t) => s + t.fx, 0);
  let trInt = 0;
  steps.forEach((t, k) => {
    const interest = t.rate * interestOn(t.open, g.trancheClose[k], circ);
    trInt += interest;
    add({ [`tr${k}_open`]: t.open, [`tr${k}_fx`]: t.fx, [`tr${k}_borrow`]: t.borrow, [`tr${k}_repay`]: t.repay, [`tr${k}_after`]: t.afterSched, [`tr${k}_rate`]: t.rate, [`tr${k}_int`]: interest });
  });
  y.rev_open = p.rev_close;
  y.rev_rate = c.floatBase + d.base_delta + c.s.revolverSpread;
  y.rev_int = y.rev_rate * interestOn(p.rev_close, g.revolverClose, circ);
  y.debt_int = trInt + y.rev_int;

  // Finance income.
  const open = liquidBalances(p.cash, p.inv_nc, p.inv_cur, p.fvtpl, c);
  add(financeIncome(open, { liquid: g.liquidClose, usd: g.usdLiquidClose }, d, c));

  y.fin_costs = y.lease_int + y.ebo_int + y.debt_int;
  y.fx_unreal = y.fxg_cash + y.fxg_inv_nc + y.fxg_inv_cur + y.fxg_fvtpl + y.fxg_ofa + y.fxg_debt;
  y.fx_line = y.fx_unreal + y.fxg_wc;
  y.pbt = y.op_profit + y.fin_income - y.fin_costs + y.fx_line;

  add(tax(p, y, d, c));
  add(equity(p, y, d, c));
  add(cashFlowBeforeRevolver(p, y, d, c));
  y.cf_cap_losses = 0;
  y.cf_other_adj = 0;

  const rev = revolver(y.pre_rev_cash, p.rev_close, d.min_cash, c.s.revolverOn);
  y.rev_net = rev.net;
  y.rev_close = rev.close;
  y.surplus = rev.surplus;
  const sweeps = allocateSweep(rev.surplus, d.sweep_pct, steps.map(t => t.afterSched));
  const closes = steps.map((t, k) => t.afterSched - sweeps[k]);
  sweeps.forEach((sw, k) => { y[`tr${k}_sweep`] = sw; y[`tr${k}_close`] = closes[k]; });
  y.sweep_total = sweeps.reduce((s, v) => s + v, 0);
  add(closeCashFlow(y, rev.net, y.sweep_total));

  y.debt_total = closes.reduce((s, v) => s + v, 0) + rev.close;
  y.debt_cur = y.debt_total * d.debt_cur_share;
  y.debt_nc = y.debt_total - y.debt_cur;
  add(assembleBalanceSheet(y));

  const close = liquidBalances(y.cash, y.inv_nc, y.inv_cur, y.fvtpl, c);
  return { y, next: { liquidClose: close.liquid, usdLiquidClose: close.usd, trancheClose: closes, revolverClose: rev.close } };
}

const distance = (a: Guess, b: Guess) => {
  let m = Math.max(Math.abs(a.liquidClose - b.liquidClose), Math.abs(a.revolverClose - b.revolverClose));
  a.trancheClose.forEach((v, k) => { m = Math.max(m, Math.abs(v - b.trancheClose[k])); });
  return m;
};

export function runModel(inp: ModelInputs, rates: RatesSnapshot): ModelRun {
  const sector = checkSector(inp.company.sector);
  if (!sector.allowed) throw new ModelBlockedError(sector.reason as string);
  const unmapped = unmappedLines(inp.historicals);
  if (unmapped.length) throw new ModelBlockedError(`Unmapped line items: ${unmapped.map(u => u.label).join('; ')}`);
  if (inp.historicals.years.length < 2 || inp.historicals.years.length > 5) throw new ModelBlockedError('Historical years must be 2 to 5');
  if (inp.nYears < 1 || inp.nYears > 10) throw new ModelBlockedError('Forecast years must be 1 to 10');
  if (inp.settings.revenueBasis === 3) {
    const dr0 = inp.scenarios[inp.activeScenario];
    if (dr0.vol_urea.every(v => v === 0) && dr0.vol_ammonia.every(v => v === 0)) throw new ModelBlockedError('Volume x price mode is off until volumes are entered');
  }

  const c = buildContext(inp, rates);
  const dr = inp.scenarios[inp.activeScenario];
  const H = inp.historicals.years;
  const nH = H.length;
  const n = nH + inp.nYears;
  const bags: Y[] = [];
  const d0 = driversFor(dr, 0);
  H.forEach((yr, idx) => bags.push(historicalRow(accountsForYear(inp.historicals, yr), yr, inp, c, idx === nH - 1, d0)));

  const iterations: number[] = [];
  const converged: boolean[] = [];
  const checks: CheckResult[] = [];
  const warnings: Warning[] = [];
  const labels = H.map(y => `${y}A`);

  for (let i = 0; i < inp.nYears; i++) {
    const p = bags[bags.length - 1];
    const d = driversFor(dr, i);
    const year = H[nH - 1] + i + 1;
    labels.push(`${year}E`);
    const open = liquidBalances(p.cash, p.inv_nc, p.inv_cur, p.fvtpl, c);
    const initial: Guess = { liquidClose: open.liquid, usdLiquidClose: open.usd, trancheClose: inp.tranches.map((_, k) => p[`tr${k}_close`]), revolverClose: p.rev_close };
    const res = iterate(initial, g => { const r = computeYear(p, d, c, inp, i, g); return { result: r.y, next: r.next }; }, distance, c.s.circularity === 1);
    iterations.push(res.iterations);
    converged.push(res.converged);
    bags.push(res.result);
    checks.push(...forecastChecks(p, res.result, `${year}E`, bags[nH - 1].balance_check));
    warnings.push(...modelWarnings(p, res.result, d, c, inp, rates, `${year}E`));
  }

  const ids = new Set<string>();
  bags.forEach(b => Object.keys(b).forEach(k => ids.add(k)));
  const rows: Rows = {};
  for (const id of [...ids].sort()) rows[id] = bags.map(b => (b[id] === undefined ? null : b[id]));
  applyOutputs(rows, n, inp);

  return {
    schemaVersion: 1,
    company: { name: inp.company.name, ticker: inp.company.ticker },
    scenario: inp.activeScenario,
    switches: { circularity: inp.settings.circularity, fxOn: inp.settings.fxOn },
    years: [...H, ...Array.from({ length: inp.nYears }, (_, i) => H[nH - 1] + i + 1)],
    nHist: nH,
    periodLabels: labels,
    rows,
    checks,
    warnings,
    iterations,
    converged,
    rates: { hash: rates.hash, frozenAt: rates.frozenAt },
  };
}
