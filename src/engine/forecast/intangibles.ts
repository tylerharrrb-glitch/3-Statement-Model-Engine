import { D, Y } from './common';

/** Other assets (intangibles) amortization schedule. */
export function intangibles(p: Y, d: D): Y {
  const oa_amort = d.oa_amort_rate * p.other_assets;
  return { oa_amort, other_assets: p.other_assets + d.oa_add - oa_amort };
}
