// Grouping of output rows for display. Calculation lives in outputs/index.ts.
export const OUTPUT_GROUPS: { title: string; ids: string[] }[] = [
  { title: 'Profitability', ids: ['gross_margin', 'op_margin', 'ebitda_margin', 'net_margin'] },
  { title: 'Returns', ids: ['roe', 'roa', 'roic'] },
  { title: 'Liquidity', ids: ['current_ratio', 'quick_ratio', 'cash_ratio'] },
  { title: 'Leverage', ids: ['net_debt', 'debt_equity', 'liab_assets', 'net_debt_ebitda', 'debt_ebitda'] },
  { title: 'Coverage', ids: ['interest_cover', 'ebitda_cover'] },
  { title: 'Efficiency', ids: ['asset_turnover', 'inventory_turnover', 'dso_calc', 'dio_calc', 'dpo_calc', 'ccc'] },
  { title: 'DuPont 3-step', ids: ['net_margin', 'asset_turnover', 'dupont_em', 'dupont3_roe'] },
  { title: 'DuPont 5-step', ids: ['dupont_tax_burden', 'dupont_int_burden', 'op_margin', 'asset_turnover', 'dupont_em', 'dupont5_roe'] },
  { title: 'Cash conversion', ids: ['fcf', 'cfo_ebitda', 'fcf_np', 'fcf_debt'] },
  { title: 'Covenants (1 = pass)', ids: ['cov_leverage', 'cov_cover', 'cov_current'] },
  { title: 'FCFF bridge', ids: ['fcff_nopat', 'fcff_da', 'fcff_noncash', 'fcff_wc', 'fcff_dist', 'fcff_capex', 'fcff'] },
  { title: 'FCFE bridge', ids: ['fcff', 'fcfe_fin_income', 'fcfe_interest', 'fcfe_leases', 'fcfe_borrow', 'fcfe'] },
  { title: "Altman Z''-EM (zones unconfirmed)", ids: ['alt_x1', 'alt_x2', 'alt_x3', 'alt_x4', 'altman_z', 'altman_zone'] },
  { title: 'Piotroski F-score', ids: ['f_roa', 'f_cfo', 'f_droa', 'f_accrual', 'f_lever', 'f_liquid', 'f_shares', 'f_margin', 'f_turn', 'piotroski'] },
  { title: 'Per share', ids: ['eps', 'eps_restated'] },
];
