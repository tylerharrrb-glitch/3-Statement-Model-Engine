// Standardized chart of accounts for EAS-presented industrial and commercial companies.
// Account ids double as ModelRun row ids. Costs are positive in the model.
import type { Sector, Statement } from './types';

export interface Account { id: string; label: string; statement: Statement; section: string }

const a = (statement: Statement, section: string, list: [string, string][]): Account[] =>
  list.map(([id, label]) => ({ id, label, statement, section }));

export const CHART_OF_ACCOUNTS: Account[] = [
  ...a('IS', 'Revenue', [['rev_export', 'Net sales - export'], ['rev_domestic', 'Net sales - domestic'], ['seg_urea', 'Segment - urea'], ['seg_ammonia', 'Segment - ammonia'], ['seg_other', 'Segment - other']]),
  ...a('IS', 'Costs', [['cogs', 'Cost of sales'], ['gas_cost', 'of which natural gas (memo)'], ['selling', 'Selling and marketing'], ['ga', 'General and administrative'], ['dep', 'Depreciation (memo)'], ['amort', 'Amortization (memo)']]),
  ...a('IS', 'Other operating', [['other_income_total', 'Other income'], ['prov_reversed', 'of which provisions no longer required (memo)'], ['cap_gains', 'Capital gains'], ['other_exp_total', 'Other expenses'], ['impairment', 'Impairment reversal'], ['ecl', 'ECL reversal / (charge)']]),
  ...a('IS', 'Finance', [['fin_income', 'Finance income'], ['lease_int', 'Finance cost - lease interest'], ['ebo_int', 'Finance cost - employee benefit interest'], ['debt_int', 'Finance cost - borrowings'], ['fx_line', 'FX translation gain / (loss)']]),
  ...a('IS', 'Tax', [['current_tax', 'Current tax'], ['deferred_tax', 'Deferred tax expense / (income)'], ['oci_gross', 'OCI actuarial, gross'], ['oci_dt', 'OCI deferred tax']]),
  ...a('BS', 'Non-current assets', [['fixed_assets', 'Fixed assets and projects under construction'], ['other_assets', 'Other assets and PUC'], ['rou', 'Right-of-use assets'], ['associates', 'Investments in associates'], ['inv_nc', 'Amortized-cost investments, non-current'], ['ofa', 'Other financial assets']]),
  ...a('BS', 'Current assets', [['inventory', 'Inventory'], ['ar', 'Accounts receivable'], ['inv_cur', 'Amortized-cost investments, current'], ['fvtpl', 'Investments at FVTPL'], ['debtors', 'Debtors and other debit balances'], ['rp', 'Due from related parties'], ['sup_adv', 'Supplier advances'], ['cash', 'Cash and cash equivalents']]),
  ...a('BS', 'Equity', [['capital', 'Issued capital'], ['legal_reserve', 'Legal reserve'], ['general_reserve', 'General reserve'], ['merger_reserve', 'Result of merging process'], ['re', 'Retained earnings']]),
  ...a('BS', 'Non-current liabilities', [['lease_nc', 'Lease liabilities, non-current'], ['debt_nc', 'Borrowings, non-current'], ['dtl', 'Deferred tax liabilities'], ['ebo_nc', 'Employee benefits, non-current']]),
  ...a('BS', 'Current liabilities', [['tax_payable', 'Current income tax'], ['lease_cur', 'Lease liabilities, current'], ['debt_cur', 'Borrowings, current'], ['ap', 'Trade payables'], ['creditors', 'Creditors and other credit balances'], ['dividends_payable', 'Dividends payable'], ['cust_adv', 'Customer advances (contract liabilities)'], ['ebo_cur', 'Employee benefits, current'], ['provisions', 'Provisions']]),
  ...a('CF', 'Operating adjustments', [['cf_pbt', 'Profit before tax'], ['cf_dep', 'Depreciation'], ['cf_amort', 'Amortization'], ['cf_prov_rev', 'Provisions no longer required'], ['cf_prov_formed', 'Provisions formed'], ['cf_ebo_cost', 'Employee benefit obligations'], ['cf_cap_losses', 'Capital losses'], ['cf_cap_gains', 'Capital gains'], ['cf_other_adj', 'Adjustment on other revenues'], ['cf_ecl', 'ECL (reversal) / charge'], ['cf_impairment', 'Impairment (reversal) / charge'], ['cf_net_fin', 'Net finance (income) and cost'], ['cf_fx_unreal', 'Unrealized FX loss / (gain)'], ['cf_before_wc', 'Subtotal before working capital']]),
  ...a('CF', 'Working capital', [['cf_ofa', 'Other financial assets'], ['cf_inventory', 'Inventory'], ['cf_ar', 'Receivables'], ['cf_debtors', 'Debtors'], ['cf_rp', 'Related parties'], ['cf_sup_adv', 'Supplier advances'], ['cf_ap', 'Trade payables'], ['cf_creditors', 'Creditors'], ['cf_cust_adv', 'Customer advances'], ['cf_prov_used', 'Provisions used'], ['cf_before_dist', 'Cash from operations before distributions and taxes']]),
  ...a('CF', 'Operating other', [['cf_dist_op', 'Distributions to employees and board'], ['cf_tax_paid', 'Income taxes paid'], ['cf_ebo_paid', 'Employee benefits paid'], ['cf_int_rec_op', 'Interest received (operating policy)'], ['cf_int_paid_op', 'Interest paid (operating policy)'], ['cf_cfo', 'Net cash from operating activities']]),
  ...a('CF', 'Investing', [['cf_int_rec_inv', 'Interest received'], ['cf_assoc', 'Investment in associates'], ['cf_fvtpl', 'FVTPL, net'], ['cf_ac', 'Amortized-cost investments, net'], ['cf_proceeds', 'Proceeds from asset sales'], ['cf_capex', 'Capital expenditure'], ['cf_oa_add', 'Other assets additions'], ['cf_cfi', 'Net cash from investing activities']]),
  ...a('CF', 'Financing', [['cf_div', 'Dividends to shareholders'], ['cf_leases', 'Lease payments'], ['cf_dist_fin', 'Distributions to employees and board (financing policy)'], ['cf_borrow', 'Borrowings drawn'], ['cf_repay', 'Borrowings repaid'], ['cf_revolver', 'Revolver, net'], ['cf_int_paid_fin', 'Interest paid (financing policy)'], ['cf_cff', 'Net cash from financing activities']]),
  ...a('CF', 'Cash bridge', [['cf_net', 'Net change in cash'], ['cf_fx_cash', 'FX effect on cash'], ['cf_ecl_cash', 'ECL on cash'], ['cf_open', 'Opening cash'], ['cf_close', 'Closing cash']]),
  ...a('SCHED', 'Equity roll-forward', [['declared_dividends', 'Dividends declared'], ['lr_transfer', 'Legal reserve transfer'], ['distributions', 'Employee and board distributions'], ['bonus_re', 'Bonus shares from retained earnings'], ['bonus_res', 'Bonus shares from reserves'], ['re_other', 'Other RE movement'], ['shares', 'Shares outstanding']]),
  ...a('SCHED', 'Fixed assets', [['ppe_gross', 'PP&E cost excl. PUC'], ['ppe_accum', 'Accumulated depreciation'], ['puc', 'Projects under construction'], ['capex_total', 'Additions incl. PUC'], ['disposal_cost', 'Disposals at cost'], ['disposal_accum', 'Depreciation released on disposal']]),
  ...a('SCHED', 'Employee benefits', [['ebo_service', 'Service cost'], ['ebo_paid_s', 'Benefits paid']]),
  ...a('SCHED', 'Provisions', [['prov_formed', 'Provisions formed'], ['prov_used', 'Provisions used']]),
];

export const ACCOUNT_IDS = new Set(CHART_OF_ACCOUNTS.map(x => x.id));

export interface ScopeResult { allowed: boolean; reason: string | null }

/** Decision 3: banks and insurers are hard-blocked. */
export function checkSector(sector: Sector): ScopeResult {
  if (sector === 'bank' || sector === 'insurance') {
    return { allowed: false, reason: 'Blocked: for banks and insurers the balance sheet is the business, so working-capital days and capex-driven PP&E do not apply.' };
  }
  return { allowed: true, reason: null };
}
