import { Ctx, D, Y } from './common';

/** Investment balances: opening + net purchases + FX revaluation. y must hold fxg_* rows. */
export function investments(p: Y, y: Y, d: D): Y {
  return {
    inv_nc: p.inv_nc + d.inv_nc_net + y.fxg_inv_nc,
    inv_cur: p.inv_cur + d.inv_cur_net + y.fxg_inv_cur,
    fvtpl: p.fvtpl + d.fvtpl_net + y.fxg_fvtpl,
    ofa: p.ofa + d.ofa_mov + y.fxg_ofa,
    associates: p.associates + d.assoc_mov,
  };
}

/** Liquid balance earning finance income, in EGP, with its USD part. */
export function liquidBalances(cash: number, inv_nc: number, inv_cur: number, fvtpl: number, c: Ctx): { liquid: number; usd: number } {
  const u = c.s.usd;
  return { liquid: cash + inv_nc + inv_cur + fvtpl, usd: cash * u.cash + inv_nc * u.inv_nc + inv_cur * u.inv_cur + fvtpl * u.fvtpl };
}

/** Finance income on opening or average balances per the circularity switch. */
export function financeIncome(open: { liquid: number; usd: number }, close: { liquid: number; usd: number }, d: D, c: Ctx): Y {
  const yield_egp = c.yieldBase + d.yield_delta + d.yield_spread;
  const fin_base = c.s.circularity === 1 ? (open.liquid + close.liquid) / 2 : open.liquid;
  const fin_base_usd = c.s.circularity === 1 ? (open.usd + close.usd) / 2 : open.usd;
  return {
    liquid_open: open.liquid, usd_liquid_open: open.usd, yield_egp, fin_base, fin_base_usd,
    fin_income: (fin_base - fin_base_usd) * yield_egp + fin_base_usd * d.usd_yield,
  };
}
