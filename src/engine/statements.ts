// IS, BS and CF assembly plus checks. Balance check tolerance is 1 EGP.
import { IDS } from './historicals';
import type { Y } from './forecast/common';
import type { CheckResult } from './types';

export const BALANCE_TOLERANCE = 1;
const sum = (y: Y, ids: string[]) => ids.reduce((s, id) => s + (y[id] ?? 0), 0);

export function assembleBalanceSheet(y: Y): Y {
  const total_nca = sum(y, IDS.nca);
  const total_ca = sum(y, IDS.ca);
  const total_assets = total_nca + total_ca;
  const total_equity = sum(y, IDS.equity);
  const total_ncl = sum(y, IDS.ncl);
  const total_cl = sum(y, IDS.cl);
  const total_liabilities = total_ncl + total_cl;
  const total_le = total_liabilities + total_equity;
  return { total_nca, total_ca, total_assets, total_equity, total_ncl, total_cl, total_liabilities, total_le, balance_check: total_assets - total_le };
}

/** openingGap: a documented historical gap carried in the opening balance sheet, not created by the forecast. */
export function forecastChecks(p: Y, y: Y, period: string, openingGap = 0): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (id: string, label: string, diff: number, tolerance = BALANCE_TOLERANCE) =>
    out.push({ id, label, period, diff, tolerance, pass: Math.abs(diff) <= tolerance });
  add('bs.balance', 'Total assets = total liabilities + equity, net of documented opening gap', y.balance_check - openingGap);
  add('cf.cash', 'CF closing cash = BS cash', y.cf_close - y.cash);
  add('re.roll', 'RE roll-forward', y.re - (p.re + y.net_profit + y.oci_net - y.lr_transfer - y.distributions - y.declared_dividends - y.bonus_re));
  add('lr.roll', 'Legal reserve roll-forward', y.legal_reserve - (p.legal_reserve + y.lr_transfer));
  add('cap.roll', 'Capital roll-forward', y.capital - (p.capital + y.bonus_total));
  add('ppe.roll', 'PP&E net + PUC = BS fixed assets', y.ppe_nbv + y.puc - y.fixed_assets);
  add('lease.split', 'Lease current + non-current = total', y.lease_cur + y.lease_nc - y.lease_total);
  add('ebo.split', 'Employee benefits current + non-current = total', y.ebo_cur + y.ebo_nc - y.ebo_total);
  add('debt.split', 'Borrowings current + non-current = total', y.debt_cur + y.debt_nc - y.debt_total);
  return out;
}
