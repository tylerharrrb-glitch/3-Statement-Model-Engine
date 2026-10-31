// Load, map and tie out historicals. Reported values are loaded as reported, never re-derived.
import { ACCOUNT_IDS } from './coa';
import type { CheckResult, Historicals, LineItem } from './types';

export type YearAccounts = Record<string, number>;

export function unmappedLines(h: Historicals): LineItem[] {
  return h.lines.filter(l => l.mapsTo === null || !ACCOUNT_IDS.has(l.mapsTo));
}

/** Aggregate mapped lines into standard accounts for one year. Accounts with no value stay absent. */
export function accountsForYear(h: Historicals, year: number): YearAccounts {
  const out: YearAccounts = {};
  for (const l of h.lines) {
    const v = l.values[String(year)];
    if (v === undefined || l.mapsTo === null) continue;
    out[l.mapsTo] = (out[l.mapsTo] ?? 0) + l.sign * v;
  }
  return out;
}

const sum = (y: YearAccounts, ids: string[]) => ids.reduce((s, id) => s + (y[id] ?? 0), 0);

export const IDS = {
  revenue: ['rev_export', 'rev_domestic'],
  segments: ['seg_urea', 'seg_ammonia', 'seg_other'],
  otherOpPlus: ['other_income_total', 'cap_gains', 'impairment', 'ecl'],
  otherOpMinus: ['selling', 'ga', 'other_exp_total'],
  finCosts: ['lease_int', 'ebo_int', 'debt_int'],
  nca: ['fixed_assets', 'other_assets', 'rou', 'associates', 'inv_nc', 'ofa'],
  ca: ['inventory', 'ar', 'inv_cur', 'fvtpl', 'debtors', 'rp', 'sup_adv', 'cash'],
  equity: ['capital', 'legal_reserve', 'general_reserve', 'merger_reserve', 're'],
  ncl: ['lease_nc', 'debt_nc', 'dtl', 'ebo_nc'],
  cl: ['tax_payable', 'lease_cur', 'debt_cur', 'ap', 'creditors', 'dividends_payable', 'cust_adv', 'ebo_cur', 'provisions'],
};

/** Subtotals computed from the historical lines. */
export function historicalSubtotals(y: YearAccounts): YearAccounts {
  const revenue = sum(y, IDS.revenue);
  const gross_profit = revenue - (y.cogs ?? 0);
  const op_profit = gross_profit + sum(y, IDS.otherOpPlus) - sum(y, IDS.otherOpMinus);
  const fin_costs = sum(y, IDS.finCosts);
  const pbt = op_profit + (y.fin_income ?? 0) - fin_costs + (y.fx_line ?? 0);
  const net_profit = pbt - (y.current_tax ?? 0) - (y.deferred_tax ?? 0);
  const total_nca = sum(y, IDS.nca);
  const total_ca = sum(y, IDS.ca);
  const total_assets = total_nca + total_ca;
  const total_equity = sum(y, IDS.equity);
  const total_ncl = sum(y, IDS.ncl);
  const total_cl = sum(y, IDS.cl);
  const total_liabilities = total_ncl + total_cl;
  return {
    revenue, gross_profit, op_profit, fin_costs, pbt, net_profit,
    oci_net: (y.oci_gross ?? 0) + (y.oci_dt ?? 0),
    total_nca, total_ca, total_assets, total_equity, total_ncl, total_cl, total_liabilities,
    total_le: total_liabilities + total_equity,
    balance_check: total_assets - total_liabilities - total_equity,
  };
}

const check = (out: CheckResult[], id: string, label: string, period: string, a: number, b: number, tolerance = 0) => {
  const diff = a - b;
  out.push({ id, label, period, pass: Math.abs(diff) <= tolerance + 1e-6, diff, tolerance });
};

/**
 * Part 4 tie-outs for one year. Only equations whose inputs are loaded are tested; the caller
 * reports the rest as not loaded. Tolerance 1 EGP applies only where a documented source rounding
 * exists (see sourceNotes).
 */
export function tieOuts(h: Historicals, year: number, opening: YearAccounts | null): { checks: CheckResult[]; notLoaded: string[] } {
  const y = accountsForYear(h, year);
  const t = historicalSubtotals(y);
  const per = String(year);
  const rep = (id: string): number | undefined => h.reported.find(r => r.id === id)?.values[per];
  const out: CheckResult[] = [];
  const notLoaded: string[] = [];
  const need = (name: string, ok: boolean) => { if (!ok) notLoaded.push(name); return ok; };
  const vs = (id: string, label: string, calc: number, tol = 0) => {
    const r = rep(id);
    if (need(label, r !== undefined)) check(out, `tie.${id}`, label, per, calc, r as number, tol);
  };

  const ncaTol = rep('nca_rounding') ?? 0;
  check(out, 'tie.bs', 'BS: total assets = total liabilities + equity', per, t.total_assets, t.total_le, ncaTol);
  vs('total_assets', 'BS: total assets vs reported', t.total_assets, ncaTol);
  vs('total_nca', 'BS: non-current assets vs reported', t.total_nca, ncaTol);
  vs('total_ca', 'BS: current assets vs reported', t.total_ca);
  vs('total_equity', 'BS: equity vs reported', t.total_equity);
  vs('total_ncl', 'BS: non-current liabilities vs reported', t.total_ncl);
  vs('total_cl', 'BS: current liabilities vs reported', t.total_cl);
  vs('total_liabilities', 'BS: total liabilities vs reported', t.total_liabilities);
  vs('revenue', 'IS: net sales (markets) vs reported', t.revenue);
  check(out, 'tie.segments', 'IS: segments sum to net sales', per, sum(y, IDS.segments), t.revenue);
  vs('gross_profit', 'IS: gross profit from lines', t.gross_profit);
  vs('op_profit', 'IS: operating profit from lines', t.op_profit);
  vs('pbt', 'IS: profit before tax from lines', t.pbt);
  vs('net_profit', 'IS: net profit from lines', t.net_profit);
  vs('fin_costs', 'IS: finance costs from lines', t.fin_costs);

  // Cash flow as reported.
  const cfo = rep('cf_cfo'), cfi = rep('cf_cfi'), cff = rep('cf_cff'), net = rep('cf_net'), fx = rep('cf_fx_cash'), cOpen = rep('cf_open'), cClose = y.cash;
  if (need('CF: section totals', cfo !== undefined && cfi !== undefined && cff !== undefined && net !== undefined)) {
    check(out, 'tie.cf_net', 'CF: CFO + CFI + CFF = net change', per, (cfo as number) + (cfi as number) + (cff as number), net as number);
    if (need('CF: cash bridge', cOpen !== undefined && fx !== undefined)) {
      const closing = (cOpen as number) + (net as number) + (fx as number) + (rep('cf_ecl_cash') ?? 0);
      check(out, 'tie.cf_close', 'CF: opening + net change + FX + other reported = closing = BS cash', per, closing, cClose);
    }
  }
  if (need('CF: line items', y.cf_pbt !== undefined)) {
    const adj = sum(y, ['cf_pbt', 'cf_dep', 'cf_amort', 'cf_prov_rev', 'cf_prov_formed', 'cf_ebo_cost', 'cf_cap_losses', 'cf_cap_gains', 'cf_other_adj', 'cf_ecl', 'cf_impairment', 'cf_net_fin', 'cf_fx_unreal']);
    vs('cf_before_wc', 'CF: subtotal before working capital from lines', adj);
    const wc = adj + sum(y, ['cf_ofa', 'cf_inventory', 'cf_ar', 'cf_debtors', 'cf_rp', 'cf_sup_adv', 'cf_ap', 'cf_creditors', 'cf_cust_adv', 'cf_prov_used']);
    vs('cf_before_dist', 'CF: cash before distributions from lines', wc);
    vs('cf_cfo', 'CF: net operating from lines', wc + sum(y, ['cf_dist_op', 'cf_tax_paid', 'cf_ebo_paid', 'cf_int_rec_op', 'cf_int_paid_op']));
    vs('cf_cfi', 'CF: net investing from lines', sum(y, ['cf_int_rec_inv', 'cf_assoc', 'cf_fvtpl', 'cf_ac', 'cf_proceeds', 'cf_capex', 'cf_oa_add']));
    vs('cf_cff', 'CF: net financing from lines', sum(y, ['cf_div', 'cf_leases', 'cf_dist_fin', 'cf_borrow', 'cf_repay', 'cf_revolver', 'cf_int_paid_fin']));
  }

  // Equity roll-forwards.
  if (need('RE roll-forward', opening !== null && y.lr_transfer !== undefined && y.declared_dividends !== undefined && y.distributions !== undefined)) {
    const o = opening as YearAccounts;
    const re = o.re + t.net_profit + t.oci_net - y.lr_transfer - y.distributions - y.declared_dividends - (y.bonus_re ?? 0);
    check(out, 'tie.re', 'RE roll-forward', per, re, y.re);
    check(out, 'tie.lr', 'Legal reserve roll-forward', per, o.legal_reserve + y.lr_transfer, y.legal_reserve);
    check(out, 'tie.lr5', 'Legal reserve transfer = 5% of prior-year net profit', per, y.lr_transfer, 0.05 * historicalSubtotals(o).net_profit, 1);
  } else if (y.lr_transfer !== undefined && y.declared_dividends !== undefined && y.distributions !== undefined) {
    // First loaded year: the opening balances are reported lines rather than a prior column.
    const oRe = rep('re_opening'), oLr = rep('lr_opening');
    if (oRe !== undefined && oLr !== undefined) {
      notLoaded.pop();
      check(out, 'tie.re', 'RE roll-forward', per, oRe + t.net_profit + t.oci_net - y.lr_transfer - y.distributions - y.declared_dividends - (y.bonus_re ?? 0), y.re);
      check(out, 'tie.lr', 'Legal reserve roll-forward', per, oLr + y.lr_transfer, y.legal_reserve);
    }
  }
  const capMove = rep('capital_movement');
  const capOpen = opening?.capital ?? rep('capital_opening');
  if (need('Capital roll-forward', capOpen !== undefined && capMove !== undefined)) {
    check(out, 'tie.capital', 'Capital roll-forward', per, (capOpen as number) + (capMove as number), y.capital);
  }
  if (need('PP&E roll-forward (Note 3)', y.ppe_accum !== undefined && rep('note3_cost_open') !== undefined)) {
    const costClose = (rep('note3_cost_open') as number) + (y.capex_total ?? 0) - (y.disposal_cost ?? 0);
    check(out, 'tie.ppe_cost', 'PP&E: cost roll-forward (incl. PUC)', per, costClose, (y.ppe_gross ?? 0) + (y.puc ?? 0));
    const accClose = (rep('note3_accum_open') as number) + (y.dep ?? 0) - (y.disposal_accum ?? 0);
    check(out, 'tie.ppe_accum', 'PP&E: accumulated depreciation roll-forward (1 EGP per source note 3)', per, accClose, y.ppe_accum, 1);
    check(out, 'tie.ppe_net', 'PP&E: net cost less accumulated = BS (1 EGP per source note 10 in FY2024)', per, (y.ppe_gross ?? 0) + (y.puc ?? 0) - y.ppe_accum, y.fixed_assets, rep('ppe_net_rounding') ?? 0);
  }
  if (need('EPS', rep('eps') !== undefined && rep('shares_basis') !== undefined)) {
    check(out, 'tie.eps', 'EPS: net profit / restated shares (2 dp as reported)', per, Math.round((t.net_profit / (rep('shares_basis') as number)) * 100) / 100, rep('eps') as number, 0.005);
  }
  return { checks: out, notLoaded };
}

/** BS change vs CF line, for information only. Never used to derive a cash flow line. */
export function reconciliationTable(h: Historicals, year: number): { line: string; bsChange: number; cfLine: number; difference: number }[] {
  const y = accountsForYear(h, year), o = accountsForYear(h, year - 1);
  const pairs: [string, string, string, number][] = [
    ['Inventory', 'inventory', 'cf_inventory', -1], ['Accounts receivable', 'ar', 'cf_ar', -1], ['Debtors and other debit balances', 'debtors', 'cf_debtors', -1],
    ['Related parties', 'rp', 'cf_rp', -1], ['Supplier advances', 'sup_adv', 'cf_sup_adv', -1], ['Trade payables', 'ap', 'cf_ap', 1], ['Creditors', 'creditors', 'cf_creditors', 1], ['Customer advances', 'cust_adv', 'cf_cust_adv', 1],
  ];
  return pairs.filter(([, , cf]) => y[cf] !== undefined).map(([line, bs, cf, sg]) => {
    const bsChange = sg * ((y[bs] ?? 0) - (o[bs] ?? 0));
    return { line, bsChange, cfLine: y[cf], difference: y[cf] - bsChange };
  });
}
