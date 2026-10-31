import { D, Y } from './common';

/** DSO on revenue; DIO and DPO on COGS; others % of revenue. y must hold revenue and cogs. */
export function nwc(y: Y, d: D): Y {
  return {
    ar: d.dso * y.revenue / 365,
    inventory: d.dio * y.cogs / 365,
    ap: d.dpo * y.cogs / 365,
    debtors: d.debtors_pct * y.revenue,
    sup_adv: d.sup_adv_pct * y.revenue,
    creditors: d.creditors_pct * y.revenue,
    cust_adv: d.cust_adv_pct * y.revenue,
    rp: d.rp_balance,
  };
}
