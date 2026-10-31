import { Ctx, D, Y } from './common';

/**
 * Tax-loss carryforward, oldest first, 5 years. Cumulative tracking keeps one formula per row:
 * losses from six or more years ago can no longer be used.
 */
export function taxLosses(p: Y, taxable: number): Y {
  const tl_created = Math.max(0, -taxable);
  const tl_cum_created = p.tl_cum_created + tl_created;
  const tl_lag1 = p.tl_cum_created, tl_lag2 = p.tl_lag1, tl_lag3 = p.tl_lag2, tl_lag4 = p.tl_lag3, tl_lag5 = p.tl_lag4, tl_lag6 = p.tl_lag5;
  const tl_cum_expired = Math.max(p.tl_cum_expired, tl_lag6 - p.tl_cum_used);
  const tl_avail = tl_lag1 - p.tl_cum_used - tl_cum_expired;
  const tl_used = Math.min(tl_avail, Math.max(0, taxable));
  return { tl_created, tl_cum_created, tl_lag1, tl_lag2, tl_lag3, tl_lag4, tl_lag5, tl_lag6, tl_cum_expired, tl_avail, tl_used, tl_cum_used: p.tl_cum_used + tl_used };
}

/** Decision 8. Deferred tax = (tax dep - book dep + unrealized FX) x rate. y must hold pbt, dep, dep_base, fx_unreal. */
export function tax(p: Y, y: Y, d: D, c: Ctx): Y {
  const t = c.taxRate;
  const tax_dep = d.tax_dep_rate * y.dep_base;
  const dtl_mov_ppe = (tax_dep - y.dep) * t;
  const dtl_mov_fx = y.fx_unreal * t;
  const deferred_tax = dtl_mov_ppe + dtl_mov_fx;
  const taxable = y.pbt - (tax_dep - y.dep) - y.fx_unreal;
  const tl = taxLosses(p, taxable);
  const current_tax = (Math.max(0, taxable) - tl.tl_used) * t;
  const net_profit = y.pbt - current_tax - deferred_tax;
  const oci_dt = -d.oci_gross * t;
  const tax_paid = d.tax_pay_pct * p.tax_payable;
  return {
    ...tl, tax_rate: t, tax_dep, dtl_mov_ppe, dtl_mov_fx, deferred_tax, taxable, current_tax, net_profit,
    effective_tax: y.pbt === 0 ? 0 : (current_tax + deferred_tax) / y.pbt,
    oci_gross: d.oci_gross, oci_dt, oci_net: d.oci_gross + oci_dt,
    dtl: p.dtl + deferred_tax - oci_dt,
    tax_paid,
    tax_payable: p.tax_payable + current_tax - tax_paid,
  };
}
