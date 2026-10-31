// Inline warnings. Flags only; they never block a run.
import { getRate, type RatesSnapshot } from '@registry';
import { Ctx, D, Y } from './forecast/common';
import type { ModelInputs, Warning } from './types';

export function modelWarnings(p: Y, y: Y, d: D, c: Ctx, inp: ModelInputs, rates: RatesSnapshot, period: string): Warning[] {
  const out: Warning[] = [];
  const w = (id: string, message: string) => out.push({ id, period, message });
  const s = c.s;
  const growth = p.revenue === 0 ? 0 : y.revenue / p.revenue - 1;
  const gdp = getRate(rates.entries, 'imf_real_gdp_growth')?.value;
  const inflation = getRate(rates.entries, 'imf_inflation_forecast')?.value;
  const cpi = getRate(rates.entries, 'cpi_urban_headline_yoy')?.value;
  if (typeof gdp === 'number' && typeof inflation === 'number') {
    const nominal = (gdp + inflation) / 100;
    if (growth > nominal + s.sanityUpperPp) w('revenue.high', `Revenue growth ${(growth * 100).toFixed(1)}% exceeds nominal GDP growth + ${(s.sanityUpperPp * 100).toFixed(0)}pp`);
  }
  if (typeof cpi === 'number' && growth < cpi / 100 - s.sanityLowerPp) w('revenue.low', `Revenue growth ${(growth * 100).toFixed(1)}% is below CPI - ${(s.sanityLowerPp * 100).toFixed(0)}pp`);
  if (p.net_profit > 0 && y.lr_transfer < s.lrPct * p.net_profit) w('reserve.cap', 'Legal reserve cap reached: transfer limited to 50% of issued capital');
  if (y.emp_dist < y.emp_floor - 1) w('employee.floor', 'Employee share is below the statutory floor of 10% of profits distributed');
  if (y.board_dist > y.board_cap + 1) w('board.cap', 'Board remuneration exceeds the statutory cap');
  const u = s.usd;
  const hasUsd = u.cash + u.inv_nc + u.inv_cur + u.fvtpl + u.ofa + u.ar + u.debtors + u.ap + u.creditors + u.cust_adv > 0 || inp.tranches.some(t => t.currency === 'USD');
  if (s.fxOn === 0 && hasUsd) w('fx.off', 'FX module is off while USD balances exist');
  if (s.fxOn === 1 && !hasUsd) w('fx.no_balances', 'FX module is on but no USD balance shares are entered, so nothing revalues');
  if (y.cash < d.min_cash - 1) w('cash.min', 'Cash is below the minimum balance');
  if (y.provisions < 0) w('provisions.negative', 'Provisions balance is negative');
  if (Math.abs(d.mix_urea + d.mix_ammonia + d.mix_other - 1) > 1e-9) w('mix.sum', 'Segment mix does not sum to 100%');
  return out;
}
