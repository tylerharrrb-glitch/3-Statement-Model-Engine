import { D, Y } from './common';

/** Provisions and employee benefit obligations. */
export function provisions(p: Y, d: D): Y {
  const ebo_int = d.ebo_rate * p.ebo_total;
  const ebo_total = p.ebo_total + d.ebo_service + ebo_int - d.oci_gross - d.ebo_paid;
  const ebo_cur = ebo_total * d.ebo_cur_share;
  return {
    provisions: p.provisions + d.prov_formed - d.prov_reversed - d.prov_used,
    ebo_int, ebo_total, ebo_cur, ebo_nc: ebo_total - ebo_cur,
  };
}
