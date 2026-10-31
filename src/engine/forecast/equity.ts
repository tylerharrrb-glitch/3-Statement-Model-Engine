import { Ctx, D, Y, div } from './common';

/**
 * Appropriations of prior-year profit, declared in the current year. Dividends declared and paid
 * are separate, bridged by dividends payable. y must hold net_profit and oci_net.
 */
export function equity(p: Y, y: Y, d: D, c: Ctx): Y {
  const s = c.s;
  const lr_cap = s.lrCapPct * p.capital;
  const lr_transfer = Math.max(0, Math.min(s.lrPct * Math.max(0, p.net_profit), lr_cap - p.legal_reserve));
  const distributable = p.net_profit - lr_transfer;
  const declared_dividends = s.divMode === 1 ? d.payout * Math.max(0, distributable) : d.dps * p.shares;
  const emp_calc = d.emp_pct * declared_dividends;
  const emp_dist = d.wages > 0 ? Math.min(emp_calc, d.wages) : emp_calc;
  const board_dist = d.board_pct * Math.max(0, distributable);
  const distributions = emp_dist + board_dist;
  const dividends_paid = p.dividends_payable + d.div_pay_pct * declared_dividends;
  const bonus_total = d.bonus_re + d.bonus_res;
  const capital = p.capital + bonus_total;
  const re = p.re + y.net_profit + y.oci_net - lr_transfer - distributions - declared_dividends - d.bonus_re;
  const shares = p.shares + div(bonus_total, c.par);
  return {
    lr_cap, lr_transfer, distributable, declared_dividends, emp_calc, emp_dist, board_dist, distributions, dividends_paid,
    dividends_payable: p.dividends_payable + declared_dividends - dividends_paid,
    bonus_re: d.bonus_re, bonus_res: d.bonus_res, bonus_total,
    capital,
    legal_reserve: p.legal_reserve + lr_transfer,
    general_reserve: p.general_reserve - d.bonus_res,
    merger_reserve: p.merger_reserve,
    re,
    shares,
    emp_floor: s.empFloorPct * declared_dividends,
    board_cap: s.boardCapPct * Math.max(0, distributable - s.boardMinDistPct * p.capital),
  };
}
