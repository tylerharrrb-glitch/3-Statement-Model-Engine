import { Ctx, D, Y, div } from './common';

/** PP&E and projects under construction roll-forwards. Land is not depreciated. */
export function ppe(p: Y, d: D, c: Ctx): Y {
  const capex_total = d.capex_direct + d.capex_puc;
  const puc = p.puc + d.capex_puc - d.puc_transfer;
  const ppe_gross = p.ppe_gross + d.capex_direct + d.puc_transfer - d.disposal_cost;
  const dep_base = Math.max(0, p.ppe_gross - d.land - d.fully_dep);
  const dep_calc = c.s.depMode === 1 ? div(dep_base, d.useful_life) : d.dep_rate * dep_base;
  const ppe_nbv_open = p.ppe_gross - p.ppe_accum;
  const dep = Math.min(dep_calc, Math.max(0, ppe_nbv_open - d.land));
  const disposal_accum = d.disposal_cost - d.disposal_nbv;
  const ppe_accum = p.ppe_accum + dep - disposal_accum - d.impairment;
  const ppe_nbv = ppe_gross - ppe_accum;
  return {
    capex_total, puc, ppe_gross, dep_base, dep_calc, ppe_nbv_open, dep, disposal_accum, ppe_accum, ppe_nbv,
    fixed_assets: ppe_nbv + puc,
    cap_gains: d.disposal_proceeds - d.disposal_nbv,
  };
}
