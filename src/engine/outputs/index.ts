// Output rows computed over every period. A row is null when any input is null, so a historical
// year with partly loaded statements shows blanks rather than guesses.
import type { Cell, ModelInputs, Rows } from '../types';

type Fn = (...a: number[]) => number;
type Def = [id: string, deps: string[], fn: Fn];
const sd = (a: number, b: number) => (b === 0 ? 0 : a / b);
const avg = (a: number, b: number) => (a + b) / 2;
const bit = (x: boolean) => (x ? 1 : 0);

export const CS_IS = ['revenue', 'cogs', 'gross_profit', 'selling', 'ga', 'op_profit', 'fin_income', 'fin_costs', 'fx_line', 'pbt', 'net_profit'];
export const CS_BS = ['fixed_assets', 'inv_nc', 'inventory', 'ar', 'inv_cur', 'fvtpl', 'debtors', 'cash', 'total_ca', 'total_assets', 'capital', 're', 'total_equity', 'dtl', 'tax_payable', 'ap', 'creditors', 'cust_adv', 'total_liabilities'];

export function outputDefs(inp: ModelInputs): Def[] {
  const cov = inp.settings.covenants;
  const defs: Def[] = [
    ['ebit', ['op_profit'], a => a],
    ['ebitda', ['op_profit', 'dep', 'amort'], (a, b, c) => a + b + c],
    ['gross_margin', ['gross_profit', 'revenue'], sd],
    ['op_margin', ['op_profit', 'revenue'], sd],
    ['ebitda_margin', ['ebitda', 'revenue'], sd],
    ['net_margin', ['net_profit', 'revenue'], sd],
    ['lease_liab', ['lease_cur', 'lease_nc'], (a, b) => a + b],
    ['total_debt', ['debt_cur', 'debt_nc'], (a, b) => a + b],
    ['liquid', ['cash', 'inv_nc', 'inv_cur', 'fvtpl'], (a, b, c, d) => a + b + c + d],
    ['net_debt', ['total_debt', 'lease_liab', 'liquid'], (a, b, c) => a + b - c],
    ['working_capital', ['total_ca', 'total_cl'], (a, b) => a - b],
    ['current_ratio', ['total_ca', 'total_cl'], sd],
    ['quick_ratio', ['total_ca', 'inventory', 'total_cl'], (a, b, c) => sd(a - b, c)],
    ['cash_ratio', ['cash', 'total_cl'], sd],
    ['debt_equity', ['total_debt', 'lease_liab', 'total_equity'], (a, b, c) => sd(a + b, c)],
    ['liab_assets', ['total_liabilities', 'total_assets'], sd],
    ['net_debt_ebitda', ['net_debt', 'ebitda'], sd],
    ['debt_ebitda', ['total_debt', 'lease_liab', 'ebitda'], (a, b, c) => sd(a + b, c)],
    ['interest_cover', ['ebit', 'fin_costs'], sd],
    ['ebitda_cover', ['ebitda', 'fin_costs'], sd],
    ['dso_calc', ['ar', 'revenue'], (a, b) => sd(a, b) * 365],
    ['dio_calc', ['inventory', 'cogs'], (a, b) => sd(a, b) * 365],
    ['dpo_calc', ['ap', 'cogs'], (a, b) => sd(a, b) * 365],
    ['ccc', ['dso_calc', 'dio_calc', 'dpo_calc'], (a, b, c) => a + b - c],
    ['avg_assets', ['total_assets', 'total_assets@-1'], avg],
    ['avg_equity', ['total_equity', 'total_equity@-1'], avg],
    ['asset_turnover', ['revenue', 'avg_assets'], sd],
    ['inventory_turnover', ['cogs', 'inventory', 'inventory@-1'], (a, b, c) => sd(a, avg(b, c))],
    ['roe', ['net_profit', 'avg_equity'], sd],
    ['roa', ['net_profit', 'avg_assets'], sd],
    ['invested_capital', ['total_equity', 'total_debt', 'lease_liab', 'liquid'], (a, b, c, d) => a + b + c - d],
    ['nopat', ['ebit', 'tax_rate'], (a, t) => a * (1 - t)],
    ['roic', ['nopat', 'invested_capital', 'invested_capital@-1'], (a, b, c) => sd(a, avg(b, c))],
    // DuPont
    ['dupont_em', ['avg_assets', 'avg_equity'], sd],
    ['dupont3_roe', ['net_margin', 'asset_turnover', 'dupont_em'], (a, b, c) => a * b * c],
    ['dupont_tax_burden', ['net_profit', 'pbt'], sd],
    ['dupont_int_burden', ['pbt', 'ebit'], sd],
    ['dupont5_roe', ['dupont_tax_burden', 'dupont_int_burden', 'op_margin', 'asset_turnover', 'dupont_em'], (a, b, c, d, e) => a * b * c * d * e],
    // Cash conversion and credit
    ['fcf', ['cf_cfo', 'cf_capex', 'cf_oa_add'], (a, b, c) => a + b + c],
    ['cfo_ebitda', ['cf_cfo', 'ebitda'], sd],
    ['fcf_np', ['fcf', 'net_profit'], sd],
    ['fcf_debt', ['fcf', 'total_debt', 'lease_liab'], (a, b, c) => sd(a, b + c)],
    ['cov_leverage', ['net_debt_ebitda'], a => bit(a <= cov.maxNetDebtEbitda)],
    ['cov_cover', ['interest_cover'], a => bit(a >= cov.minInterestCover)],
    ['cov_current', ['current_ratio'], a => bit(a >= cov.minCurrentRatio)],
    // FCFF and FCFE bridge
    ['fcff_nopat', ['nopat'], a => a],
    ['fcff_da', ['cf_dep', 'cf_amort'], (a, b) => a + b],
    ['fcff_noncash', ['cf_prov_rev', 'cf_prov_formed', 'cf_ebo_cost', 'cf_cap_losses', 'cf_cap_gains', 'cf_other_adj', 'cf_ecl', 'cf_impairment'], (...v) => v.reduce((s, x) => s + x, 0)],
    ['fcff_wc', ['cf_ofa', 'cf_inventory', 'cf_ar', 'cf_debtors', 'cf_rp', 'cf_sup_adv', 'cf_ap', 'cf_creditors', 'cf_cust_adv', 'cf_prov_used', 'cf_ebo_paid'], (...v) => v.reduce((s, x) => s + x, 0)],
    ['fcff_dist', ['cf_dist_op', 'cf_dist_fin'], (a, b) => a + b],
    ['fcff_capex', ['cf_capex', 'cf_oa_add', 'cf_proceeds'], (a, b, c) => a + b + c],
    ['fcff', ['fcff_nopat', 'fcff_da', 'fcff_noncash', 'fcff_wc', 'fcff_dist', 'fcff_capex'], (...v) => v.reduce((s, x) => s + x, 0)],
    ['fcfe_fin_income', ['fin_income', 'tax_rate'], (a, t) => a * (1 - t)],
    ['fcfe_interest', ['debt_int', 'tax_rate'], (a, t) => -a * (1 - t)],
    ['fcfe_leases', ['cf_leases'], a => a],
    ['fcfe_borrow', ['cf_borrow', 'cf_repay', 'cf_revolver'], (a, b, c) => a + b + c],
    ['fcfe', ['fcff', 'fcfe_fin_income', 'fcfe_interest', 'fcfe_leases', 'fcfe_borrow'], (...v) => v.reduce((s, x) => s + x, 0)],
    // Altman Z''-EM. X4 is book equity / total liabilities.
    ['alt_x1', ['working_capital', 'total_assets'], sd],
    ['alt_x2', ['re', 'total_assets'], sd],
    ['alt_x3', ['ebit', 'total_assets'], sd],
    ['alt_x4', ['total_equity', 'total_liabilities'], sd],
    ['altman_z', ['alt_x1', 'alt_x2', 'alt_x3', 'alt_x4'], (a, b, c, d) => 3.25 + 6.56 * a + 3.26 * b + 6.72 * c + 1.05 * d],
    ['altman_zone', ['altman_z'], z => (z > 5.85 ? 1 : z >= 4.35 ? 2 : 3)],
    // Piotroski F-score. Bonus shares are not dilution.
    ['f_roa', ['net_profit'], a => bit(a > 0)],
    ['f_cfo', ['cf_cfo'], a => bit(a > 0)],
    ['roa_close', ['net_profit', 'total_assets'], sd],
    ['f_droa', ['roa_close', 'roa_close@-1'], (a, b) => bit(a > b)],
    ['f_accrual', ['cf_cfo', 'net_profit'], (a, b) => bit(a > b)],
    ['lt_leverage', ['debt_nc', 'lease_nc', 'total_assets'], (a, b, c) => sd(a + b, c)],
    ['f_lever', ['lt_leverage', 'lt_leverage@-1'], (a, b) => bit(a <= b)],
    ['f_liquid', ['current_ratio', 'current_ratio@-1'], (a, b) => bit(a > b)],
    ['shares_ex_bonus', ['shares', 'bonus_total'], (a, b) => a - sd(b, inp.company.parValue)],
    ['f_shares', ['shares_ex_bonus', 'shares@-1'], (a, b) => bit(a <= b + 1)],
    ['f_margin', ['gross_margin', 'gross_margin@-1'], (a, b) => bit(a > b)],
    ['turn_close', ['revenue', 'total_assets'], sd],
    ['f_turn', ['turn_close', 'turn_close@-1'], (a, b) => bit(a > b)],
    ['piotroski', ['f_roa', 'f_cfo', 'f_droa', 'f_accrual', 'f_lever', 'f_liquid', 'f_shares', 'f_margin', 'f_turn'], (...v) => v.reduce((s, x) => s + x, 0)],
    ['eps', ['net_profit', 'shares'], sd],
    ['eps_restated', ['net_profit', 'shares@last'], sd],
  ];
  for (const id of CS_IS) {
    defs.push([`cs_${id}`, [id, 'revenue'], sd]);
    defs.push([`yoy_${id}`, [id, `${id}@-1`], (a, b) => sd(a, b) === 0 && b === 0 ? 0 : sd(a, b) - 1]);
  }
  for (const id of CS_BS) {
    defs.push([`cs_${id}`, [id, 'total_assets'], sd]);
    defs.push([`yoy_${id}`, [id, `${id}@-1`], (a, b) => sd(a, b) === 0 && b === 0 ? 0 : sd(a, b) - 1]);
  }
  return defs;
}

export function applyOutputs(rows: Rows, n: number, inp: ModelInputs): void {
  for (const [id, deps, fn] of outputDefs(inp)) {
    const out: Cell[] = [];
    for (let i = 0; i < n; i++) {
      const args: number[] = [];
      let ok = true;
      for (const dep of deps) {
        let v: Cell | undefined;
        if (dep.endsWith('@-1')) v = i === 0 ? null : rows[dep.slice(0, -3)]?.[i - 1];
        else if (dep.endsWith('@last')) v = rows[dep.slice(0, -5)]?.[n - 1];
        else v = rows[dep]?.[i];
        if (v === null || v === undefined) { ok = false; break; }
        args.push(v);
      }
      out.push(ok ? fn(...args) : null);
    }
    rows[id] = out;
  }
}
