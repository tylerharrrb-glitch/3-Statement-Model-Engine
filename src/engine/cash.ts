// Cash flow by the indirect method (EAS 4). Cash comes from this statement; nothing is plugged.
import { Ctx, D, Y } from './forecast/common';

/** Operating and investing flows, plus financing before the revolver and sweep. */
export function cashFlowBeforeRevolver(p: Y, y: Y, d: D, c: Ctx): Y {
  const cf_pbt = y.pbt;
  const cf_dep = y.dep;
  const cf_amort = y.amort;
  const cf_prov_rev = -d.prov_reversed;
  const cf_prov_formed = d.prov_formed;
  const cf_ebo_cost = d.ebo_service;
  const cf_cap_gains = -y.cap_gains;
  const cf_ecl = -d.ecl;
  const cf_impairment = -d.impairment;
  const cf_net_fin = y.fin_costs - y.fin_income;
  const cf_fx_unreal = -y.fx_unreal;
  const cf_before_wc = cf_pbt + cf_dep + cf_amort + cf_prov_rev + cf_prov_formed + cf_ebo_cost + cf_cap_gains + cf_ecl + cf_impairment + cf_net_fin + cf_fx_unreal;

  const cf_ofa = -d.ofa_mov;
  const cf_inventory = -(y.inventory - p.inventory);
  const cf_ar = -(y.ar - p.ar) - cf_ecl;
  const cf_debtors = -(y.debtors - p.debtors);
  const cf_rp = -(y.rp - p.rp);
  const cf_sup_adv = -(y.sup_adv - p.sup_adv);
  const cf_ap = y.ap - p.ap;
  const cf_creditors = y.creditors - p.creditors;
  const cf_cust_adv = y.cust_adv - p.cust_adv;
  const cf_prov_used = -d.prov_used;
  const cf_before_dist = cf_before_wc + cf_ofa + cf_inventory + cf_ar + cf_debtors + cf_rp + cf_sup_adv + cf_ap + cf_creditors + cf_cust_adv + cf_prov_used;

  const cf_dist_op = -y.distributions * c.distributionsOp;
  const cf_tax_paid = -y.tax_paid;
  const cf_ebo_paid = -d.ebo_paid;
  const cf_int_rec_op = y.fin_income * c.interestRecOp;
  const cf_int_paid_op = -y.debt_int * c.interestPaidOp;
  const cf_cfo = cf_before_dist + cf_dist_op + cf_tax_paid + cf_ebo_paid + cf_int_rec_op + cf_int_paid_op;

  const cf_int_rec_inv = y.fin_income * (1 - c.interestRecOp);
  const cf_assoc = -d.assoc_mov;
  const cf_fvtpl = -d.fvtpl_net;
  const cf_ac = -(d.inv_nc_net + d.inv_cur_net);
  const cf_proceeds = d.disposal_proceeds;
  const cf_capex = -y.capex_total;
  const cf_oa_add = -d.oa_add;
  const cf_cfi = cf_int_rec_inv + cf_assoc + cf_fvtpl + cf_ac + cf_proceeds + cf_capex + cf_oa_add;

  const cf_div = -y.dividends_paid;
  const cf_leases = -d.lease_pay;
  const cf_dist_fin = -y.distributions * (1 - c.distributionsOp);
  const cf_int_paid_fin = -y.debt_int * (1 - c.interestPaidOp);
  const cf_borrow = y.debt_borrow;
  const cf_repay_sched = -y.debt_repay_sched;

  const cf_open = p.cash;
  const cf_fx_cash = y.fxg_cash;
  const cf_ecl_cash = 0;
  const pre_rev_cash = cf_open + cf_cfo + cf_cfi + cf_div + cf_leases + cf_dist_fin + cf_int_paid_fin + cf_borrow + cf_repay_sched + cf_fx_cash + cf_ecl_cash;
  return {
    cf_pbt, cf_dep, cf_amort, cf_prov_rev, cf_prov_formed, cf_ebo_cost, cf_cap_gains, cf_ecl, cf_impairment, cf_net_fin, cf_fx_unreal, cf_before_wc,
    cf_ofa, cf_inventory, cf_ar, cf_debtors, cf_rp, cf_sup_adv, cf_ap, cf_creditors, cf_cust_adv, cf_prov_used, cf_before_dist,
    cf_dist_op, cf_tax_paid, cf_ebo_paid, cf_int_rec_op, cf_int_paid_op, cf_cfo,
    cf_int_rec_inv, cf_assoc, cf_fvtpl, cf_ac, cf_proceeds, cf_capex, cf_oa_add, cf_cfi,
    cf_div, cf_leases, cf_dist_fin, cf_int_paid_fin, cf_borrow, cf_repay_sched, cf_open, cf_fx_cash, cf_ecl_cash, pre_rev_cash,
  };
}

/** Close the statement once the revolver and sweep are known. */
export function closeCashFlow(y: Y, revolverNet: number, sweepTotal: number): Y {
  const cf_revolver = revolverNet;
  const cf_sweep = -sweepTotal;
  const cf_repay = y.cf_repay_sched + cf_sweep;
  const cf_cff = y.cf_div + y.cf_leases + y.cf_dist_fin + y.cf_borrow + cf_repay + cf_revolver + y.cf_int_paid_fin;
  const cf_net = y.cf_cfo + y.cf_cfi + cf_cff;
  const cf_close = y.cf_open + cf_net + y.cf_fx_cash + y.cf_ecl_cash;
  return { cf_revolver, cf_sweep, cf_repay, cf_cff, cf_net, cf_close, cash: cf_close };
}
