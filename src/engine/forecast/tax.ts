import { Ctx, D, Y } from './common';

/** Decision 8. Deferred tax = (tax dep - book dep + unrealized FX) x rate. y must hold pbt, dep, dep_base, fx_unreal. */
export function tax(p: Y, y: Y, d: D, c: Ctx): Y {
  const t = c.taxRate;
  const tax_dep = d.tax_dep_rate * y.dep_base;
  const dtl_mov_ppe = (tax_dep - y.dep) * t;
  const dtl_mov_fx = y.fx_unreal * t;
  const deferred_tax = dtl_mov_ppe + dtl_mov_fx;
  const taxable = y.pbt - (tax_dep - y.dep) - y.fx_unreal;
  const current_tax = Math.max(0, taxable) * t;
  const net_profit = y.pbt - current_tax - deferred_tax;
  const oci_dt = -d.oci_gross * t;
  const tax_paid = d.tax_pay_pct * p.tax_payable;
  return {
    tax_rate: t, tax_dep, dtl_mov_ppe, dtl_mov_fx, deferred_tax, taxable, current_tax, net_profit,
    effective_tax: y.pbt === 0 ? 0 : (current_tax + deferred_tax) / y.pbt,
    oci_gross: d.oci_gross, oci_dt, oci_net: d.oci_gross + oci_dt,
    dtl: p.dtl + deferred_tax - oci_dt,
    tax_paid,
    tax_payable: p.tax_payable + current_tax - tax_paid,
  };
}
