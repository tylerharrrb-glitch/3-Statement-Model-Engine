import { Ctx, D, Y } from './common';

/** USD/EGP path. With the module off the rate is frozen, so nothing revalues. */
export function fxRates(p: Y, d: D, c: Ctx): Y {
  const fx_close = c.s.fxOn === 1 ? d.fx_close : p.fx_close;
  const fx_avg = (p.fx_close + fx_close) / 2;
  return { fx_close, fx_avg, fx_move: fx_close / p.fx_close - 1, fx_index: fx_avg / p.fx_avg };
}

/** Revaluation of opening USD monetary items. y must hold fx_move. */
export function fxRevaluation(p: Y, y: Y, c: Ctx): Y {
  const u = c.s.usd;
  const m = y.fx_move;
  const fxg_cash = p.cash * u.cash * m;
  const fxg_inv_nc = p.inv_nc * u.inv_nc * m;
  const fxg_inv_cur = p.inv_cur * u.inv_cur * m;
  const fxg_fvtpl = p.fvtpl * u.fvtpl * m;
  const fxg_ofa = p.ofa * u.ofa * m;
  const fxg_wc = (p.ar * u.ar + p.debtors * u.debtors - p.ap * u.ap - p.creditors * u.creditors - p.cust_adv * u.cust_adv) * m;
  return { fxg_cash, fxg_inv_nc, fxg_inv_cur, fxg_fvtpl, fxg_ofa, fxg_wc };
}
