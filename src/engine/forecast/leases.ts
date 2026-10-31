import { D, Y } from './common';

/** EAS 49. Lease interest is on the opening liability under both switch settings (see METHODOLOGY). */
export function leases(p: Y, d: D): Y {
  const rou_amort = d.rou_amort_rate * p.rou;
  const lease_int = d.lease_rate * p.lease_total;
  const lease_total = p.lease_total + d.rou_new + lease_int - d.lease_pay;
  const lease_cur = lease_total * d.lease_cur_share;
  return { rou_amort, rou: p.rou + d.rou_new - rou_amort, lease_int, lease_total, lease_cur, lease_nc: lease_total - lease_cur };
}
