import { Ctx, D, Y } from './common';

/** y must hold revenue, fx_avg, dep, oa_amort, rou_amort, cap_gains. */
export function costs(p: Y, y: Y, d: D, c: Ctx): Y {
  const s = c.s;
  const gas_cost = s.gasMode === 1 ? d.gas_price_usd * d.gas_mmbtu * y.fx_avg : d.gas_pct * y.revenue;
  const gas_sched_tax = s.schedTaxOn * c.schedRate * d.gas_kcf;
  const depr_cogs = y.dep * d.depr_cogs_share;
  const other_cogs = d.other_cogs_pct * y.revenue;
  const cogs_lines = gas_cost + gas_sched_tax + depr_cogs + other_cogs;
  const cogs_gm = y.revenue * (1 - d.gm_pct);
  const cogs = (s.cogsMode === 1 ? cogs_lines : cogs_gm) - c.overlay.margin * y.revenue;
  const gross_profit = y.revenue - cogs;
  const selling = s.sellMode === 1 ? d.sell_pct * y.revenue : p.selling * (1 + d.sell_g);
  const ga_cash = s.gaMode === 1 ? d.ga_pct * y.revenue : p.ga_cash * (1 + d.ga_g);
  const amort = y.oa_amort + y.rou_amort;
  const depr_ga = y.dep - depr_cogs;
  const ga = ga_cash + amort + depr_ga;
  const other_income_total = d.other_income + d.prov_reversed;
  const other_exp_total = d.other_exp + d.prov_formed;
  const op_profit = gross_profit + other_income_total - selling - ga + y.cap_gains - other_exp_total + d.impairment + d.ecl;
  return {
    gas_cost, gas_sched_tax, depr_cogs, other_cogs, cogs_lines, cogs_gm, cogs, gross_profit, selling, ga_cash, amort, depr_ga, ga,
    other_income_total, prov_reversed: d.prov_reversed, other_exp_total, impairment: d.impairment, ecl: d.ecl, op_profit,
  };
}
