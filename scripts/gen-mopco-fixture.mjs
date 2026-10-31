// Builds tests/fixtures/mopco-fy2025.json from the brief's Appendix B.
// Status: transcribed from the owner's Appendix B. The audited PDF was not available, so no
// independent OCR cross-check was possible. See _meta.pdfCrossCheck.
import { writeFileSync } from 'node:fs';

const Y1 = '2024', Y2 = '2025';
const line = (statement, label, mapsTo, sign, v25, v24) => {
  const values = {};
  if (v24 !== null && v24 !== undefined) values[Y1] = v24;
  if (v25 !== null && v25 !== undefined) values[Y2] = v25;
  return { label, statement, mapsTo, sign, values };
};
const IS = (l, m, s, a, b) => line('IS', l, m, s, a, b);
const BS = (l, m, a, b) => line('BS', l, m, 1, a, b);
const CF = (l, m, a, b) => line('CF', l, m, 1, a, b ?? null);
const SC = (l, m, a, b) => line('SCHED', l, m, 1, a, b ?? null);

const lines = [
  IS('Net sales - export', 'rev_export', 1, 21466612052, 15069860384),
  IS('Net sales - domestic', 'rev_domestic', 1, 5377463524, 4580460474),
  IS('Urea', 'seg_urea', 1, 23670162412, 17267262750),
  IS('Ammonia', 'seg_ammonia', 1, 3173597574, 2382529609),
  IS('Other', 'seg_other', 1, 315590, 528499),
  IS('Cost of sales', 'cogs', -1, -13307578650, -10802884928),
  IS('of which natural gas', 'gas_cost', 1, 8737924386, 6534605802),
  IS('Other income', 'other_income_total', 1, 273707416, 173469168),
  IS('of which provisions no longer required', 'prov_reversed', 1, 160216876, 19299728),
  IS('Selling and marketing', 'selling', -1, -526930783, -531853525),
  IS('General and administrative', 'ga', -1, -648542515, -591253894),
  IS('Capital gains', 'cap_gains', 1, 13156038, 3619907),
  IS('Other expenses', 'other_exp_total', -1, -44594149, -233949210),
  IS('Impairment reversal', 'impairment', 1, 0, 310962888),
  IS('ECL reversal / (charge)', 'ecl', 1, 357037587, -390502424),
  IS('Finance income', 'fin_income', 1, 2251247715, 2278100869),
  IS('Lease interest', 'lease_int', -1, -7072409, -7271719),
  IS('Employee benefit interest', 'ebo_int', -1, -82744931, -45137572),
  IS('FX translation (loss) / gain', 'fx_line', 1, -1093616444, 9244689987),
  IS('Current tax', 'current_tax', -1, -3315742675, -3006164058),
  IS('Deferred tax', 'deferred_tax', -1, 584138511, -932406979),
  IS('OCI actuarial, gross', 'oci_gross', 1, -59294377, -79334195),
  IS('OCI deferred tax', 'oci_dt', 1, 13341234, 17850194),
  IS('Depreciation', 'dep', 1, 2283209560, 2219254113),
  IS('Amortization (other assets + ROU)', 'amort', 1, 35519470, 18900491),

  BS('Fixed assets and projects under construction', 'fixed_assets', 38192488081, 34632006997),
  BS('Other assets and PUC', 'other_assets', 79638512, 68215075),
  BS('Right-of-use assets', 'rou', 72034336, 88041967),
  BS('Associates', 'associates', 2424170, 2407651),
  BS('Amortized-cost investments, non-current', 'inv_nc', 10659141927, 5562646156),
  BS('Other financial assets (pledged / restricted)', 'ofa', 1010115488, 1131212791),
  BS('Inventory', 'inventory', 1927396704, 1713951385),
  BS('Accounts receivable', 'ar', 1446674104, 541148818),
  BS('Amortized-cost investments, current', 'inv_cur', 734010745, 3827217186),
  BS('FVTPL', 'fvtpl', 2573762308, 2869467104),
  BS('Debtors and other debit balances', 'debtors', 1449408364, 845817862),
  BS('Due from related parties', 'rp', 0, 42873),
  BS('Supplier advances', 'sup_adv', 75072047, 40559983),
  BS('Cash', 'cash', 2971664846, 6679913892),
  BS('Issued capital', 'capital', 28681402630, 20791840110),
  BS('Legal reserve', 'legal_reserve', 1968302274, 1212315306),
  BS('General reserve', 'general_reserve', 352383742, 352383742),
  BS('Result of merging process', 'merger_reserve', 0, 7889562509),
  BS('Retained earnings', 're', 16804480294, 15132261531),
  BS('Lease liabilities, non-current', 'lease_nc', 119068258, 165150556),
  BS('Deferred tax liabilities', 'dtl', 7169688279, 7767168024),
  BS('Employee benefits, non-current', 'ebo_nc', 616126433, 531376168),
  BS('Current income tax', 'tax_payable', 3260993930, 2913267306),
  BS('Lease liabilities, current', 'lease_cur', 30901794, 26425248),
  BS('Trade payables', 'ap', 571060350, 397661913),
  BS('Creditors and other credit balances', 'creditors', 1102966124, 429516144),
  BS('Customer advances (contract liability)', 'cust_adv', 386154612, 135401296),
  BS('Employee benefits, current', 'ebo_cur', 75958208, 3063879),
  BS('Provisions', 'provisions', 54344705, 255256008),

  CF('Profit before tax', 'cf_pbt', 14028144451),
  CF('Depreciation', 'cf_dep', 2283209560),
  CF('Amortization', 'cf_amort', 35519470),
  CF('Provisions no longer required', 'cf_prov_rev', -160216876),
  CF('Provisions formed', 'cf_prov_formed', 668304),
  CF('Employee benefit obligations', 'cf_ebo_cost', 30494385),
  CF('Capital losses', 'cf_cap_losses', 4378362),
  CF('Capital gains', 'cf_cap_gains', -17534400),
  CF('Adjustment on other revenues', 'cf_other_adj', -2704250),
  CF('ECL reversal', 'cf_ecl', -357037587),
  CF('Impairment', 'cf_impairment', 0),
  CF('Net finance income and cost', 'cf_net_fin', -2161430375),
  CF('Unrealized FX loss', 'cf_fx_unreal', 982480426),
  CF('Other financial assets', 'cf_ofa', 75437796),
  CF('Inventory', 'cf_inventory', -213445319),
  CF('Receivables', 'cf_ar', -899820862),
  CF('Debtors', 'cf_debtors', 113856513),
  CF('Related parties', 'cf_rp', 267150),
  CF('Supplier advances', 'cf_sup_adv', -34512064),
  CF('Trade payables', 'cf_ap', 173398437),
  CF('Creditors', 'cf_creditors', 152019271),
  CF('Customer advances (source labels this "lease liability"; see source note 6)', 'cf_cust_adv', 250753316),
  CF('Provisions used', 'cf_prov_used', -41362731),
  CF('Dividends to employees and board', 'cf_dist_op', -1545237364, -977311347),
  CF('Income taxes paid', 'cf_tax_paid', -2997048224, -2735903582),
  CF('Employee benefits paid', 'cf_ebo_paid', -14889098, -7650510),
  CF('Interest received', 'cf_int_rec_inv', 2046816410, 1520913784),
  CF('Investment in associate', 'cf_assoc', -16519),
  CF('FVTPL, net', 'cf_fvtpl', 635719918),
  CF('Amortized-cost investments, net', 'cf_ac', -2775425169),
  CF('Proceeds from asset sales', 'cf_proceeds', 17534400),
  CF('Capital expenditure', 'cf_capex', -5848069006, -1275986560),
  CF('Dividends to shareholders', 'cf_div', -7277190123, -11955401802),
  CF('Lease payments', 'cf_leases', -37991816, -33209307),

  // No such line is reported, and MOPCO has no borrowings: recorded as explicit zeros, not inferred balances.
  CF('Other assets additions (no separate line reported)', 'cf_oa_add', 0, 0),
  CF('Distributions, financing (policy: operating)', 'cf_dist_fin', 0, 0),
  CF('Interest received, operating (policy: investing)', 'cf_int_rec_op', 0, 0),
  CF('Interest paid, operating (no borrowings)', 'cf_int_paid_op', 0, 0),
  CF('Interest paid, financing (no borrowings)', 'cf_int_paid_fin', 0, 0),
  CF('Borrowings drawn (no borrowings)', 'cf_borrow', 0, 0),
  CF('Borrowings repaid (no borrowings)', 'cf_repay', 0, 0),
  CF('Revolver (no borrowings)', 'cf_revolver', 0, 0),
  SC('Dividends declared', 'declared_dividends', 7277144038, 11955308063),
  SC('Legal reserve transfer', 'lr_transfer', 755986968, 478114534),
  SC('Employee and board distributions', 'distributions', 1545237364, 977311347),
  SC('Bonus shares from retained earnings', 'bonus_re', 11, 0),
  SC('Bonus shares from merger result', 'bonus_res', 7889562509, 0),
  SC('Shares outstanding', 'shares', 2868140263, 2079184011),
  SC('PP&E cost excl. PUC (Note 3 cost less PUC)', 'ppe_gross', 53298293853),
  SC('Accumulated depreciation (roll-forward value; note states ...948, source note 3)', 'ppe_accum', 21492392949),
  SC('Projects under construction', 'puc', 6386587177),
  SC('Additions incl. PUC', 'capex_total', 5848069006),
  SC('Disposals at cost', 'disposal_cost', 24770582),
  SC('Depreciation released on disposal', 'disposal_accum', 20392221),
  SC('Service cost', 'ebo_service', 30494385),
  SC('Benefits paid', 'ebo_paid_s', 14889098, 7650510),
  SC('Provisions formed', 'prov_formed', 668304),
  SC('Provisions used', 'prov_used', 41362731),
];

const rep = (id, label, v25, v24) => {
  const values = {};
  if (v24 !== null && v24 !== undefined) values[Y1] = v24;
  if (v25 !== null && v25 !== undefined) values[Y2] = v25;
  return { id, label, values };
};
const reported = [
  rep('revenue', 'Net sales', 26844075576, 19650320858),
  rep('gross_profit', 'Gross profit', 13536496926, 8847435930),
  rep('op_profit', 'Operating profit', 12960330520, 7587928840),
  rep('fin_costs', 'Finance costs', 89817340, 52409291),
  rep('pbt', 'Profit before tax', 14028144451, 19058310405),
  rep('net_profit', 'Net profit', 11296540287, 15119739368),
  rep('oci_net_stated', 'OCI per OCI statement', -45953144, -61484001),
  rep('total_nca', 'Total non-current assets', 50015842515, 41484530637),
  rep('total_ca', 'Total current assets', 11177989118, 16518119103),
  rep('total_assets', 'Total assets', 61193831633, 58002649740),
  rep('total_equity', 'Total equity', 47806568940, 45378363198),
  rep('total_ncl', 'Total non-current liabilities', 7904882970, 8463694748),
  rep('total_cl', 'Total current liabilities', 5482379723, 4160591794),
  rep('total_liabilities', 'Total liabilities', 13387262693, 12624286542),
  rep('cf_before_wc', 'Subtotal before working capital', 14665971470),
  rep('cf_before_dist', 'Cash from operations before distributions and taxes', 14242562977, 11871965105),
  rep('cf_cfo', 'Net operating', 9685388291, 8151099666),
  rep('cf_cfi', 'Net investing', -5923439966, 197533062),
  rep('cf_cff', 'Net financing', -7315181939, -11988611109),
  rep('cf_net', 'Net change in cash', -3553233614, -3639978381),
  rep('cf_fx_cash', 'FX effect on cash', -165397694, 2505134901),
  rep('cf_ecl_cash', 'ECL on cash', 10382262),
  rep('cf_open', 'Opening cash', 6679913892, 7814757372),
  rep('re_opening', 'Opening retained earnings (equity statement)', 15132261531, 13484740108),
  rep('lr_opening', 'Opening legal reserve', 1212315306, 734200772),
  rep('capital_movement', 'Capital movement: merger result 7,889,562,509 + 11 from RE', 7889562520),
  rep('note3_cost_open', 'Note 3 cost incl. PUC, opening', 53861582606),
  rep('note3_accum_open', 'Note 3 accumulated depreciation, opening', 19229575610),
  rep('note3_accum_stated', 'Note 3 accumulated depreciation as stated', 21492392948),
  rep('note3_fully_dep', 'Fully depreciated assets still in use', 330458692),
  rep('eps', 'EPS as reported (FY2024 restated for bonus shares)', 3.94, 5.27),
  rep('nca_rounding', 'Documented 1 EGP gap between non-current asset lines and stated totals (source note 9)', 1),
  rep('shares_basis', 'Shares used for reported EPS', 2868140263, 2868140263),
];

const sourceNotes = [
  { id: 1, text: 'OCI statement shows (45,953,144); its own lines give (59,294,377) + 13,341,234 = (45,953,143). The equity statement uses (45,953,143).', amount: 1 },
  { id: 2, text: 'Dividends declared 7,277,144,038 (equity statement) differ from dividends paid 7,277,190,123 (CF) by 46,085. Handled through a dividends-payable bridge.', amount: 46085 },
  { id: 3, text: 'Note 3 accumulated depreciation at 31-Dec-2025 stated as 21,492,392,948; the roll-forward gives ...949. The balance-sheet net figure 38,192,488,081 agrees with ...949.', amount: 1 },
  { id: 4, text: 'Note 3, computers: disposal at cost (1,214,605) vs accumulated depreciation released (1,214,606), a 1 EGP gap.', amount: 1 },
  { id: 5, text: 'CF line "Formed of expected credit losses on cash" +10,382,262 is added to cash despite the word "formed". Taken as reported.', amount: 10382262 },
  { id: 6, text: 'The CF labels customer advances "(lease liability)"; it is the contract liability. Label error in the source.' },
  { id: 7, text: 'Capex in the CF (5,848,069,006) equals Note 3 additions including PUC exactly. Other assets also moved, 68.2M to 79.6M.' },
  { id: 9, text: 'NEW, found in Part 4: the six non-current asset lines in Appendix B sum to 50,015,842,514, but total non-current assets is stated as 50,015,842,515 and total assets as 61,193,831,633. Lines give total assets 61,193,831,632. Either source rounding or a transcription gap; check against the PDF. Balance sheet ties within this documented 1 EGP.', amount: 1 },
  { id: 8, text: 'Debtors and other debit balances: BS change +603,590,502 does not match the CF line +113,856,513. Shown in the reconciliation table; the CF line is not derived from it.' },
];

const fixture = {
  _meta: {
    company: 'Misr Fertilizers Production Company (MOPCO)',
    source: 'Audited FY2025 financial statements; Crowe Dr. A. M. Hegazy & Co.; report dated 9-Mar-2026; as transcribed by the owner in Appendix B of the rebuild brief',
    pdfCrossCheck: 'NOT DONE: the audited PDFs were not available on this machine. FY2024 cash flow is loaded at the totals supplied in Appendix B only. FY2023 is not loaded.',
    mergerEffectiveDate: 'unconfirmed: confirm from FY2024 notes',
    units: 'Full absolute EGP',
    deviation: 'cf_ecl_cash reported FY2025 only.',
  },
  company: {
    name: 'Misr Fertilizers Production Company (MOPCO)', ticker: 'MFPC.CA', sector: 'industrial', fiscalYearEndMonth: 12, parValue: 10,
    policy: { interestReceivedOperating: 0, interestPaidOperating: 1, distributionsOperating: 1 },
  },
  historicals: { years: [2024, 2025], referenceYears: [], lines, reported, sourceNotes },
};
writeFileSync('tests/fixtures/mopco-fy2025.json', JSON.stringify(fixture, null, 1) + '\n');

// Driver sets. Every number is an analyst placeholder derived from FY2025 ratios unless noted;
// the owner replaces them. Bear, base and bull are explicit sets, not multipliers.
const N = 10;
const f = v => Array(N).fill(v);
const rev = 26844075576;
const base = {
  g_export: f(0.03), g_domestic: f(0.10), g_urea: f(0.05), g_ammonia: f(0.05), g_other: f(0),
  mix_urea: f(0.8818), mix_ammonia: f(0.1182), mix_other: f(0), export_share: f(0.8),
  vol_urea: f(0), vol_ammonia: f(0), vol_other: f(0), price_urea: f(0), price_ammonia: f(0), price_other: f(0),
  gas_pct: f(0.3255), gas_price_usd: f(0), gas_mmbtu: f(0), gas_kcf: f(0),
  other_cogs_pct: f(0.085), gm_pct: f(0.50), depr_cogs_share: f(1),
  sell_pct: f(0.0196), sell_g: f(0.05), ga_pct: f(0.0228), ga_g: f(0.05),
  other_income: f(100000000), prov_reversed: f(0), other_exp: f(40000000), prov_formed: f(0), impairment: f(0), ecl: f(0),
  capex_direct: f(1000000000), capex_puc: f(1500000000), puc_transfer: f(1000000000),
  disposal_cost: f(0), disposal_nbv: f(0), disposal_proceeds: f(0),
  land: f(0), fully_dep: f(330458692), dep_rate: f(0.0434), useful_life: f(23), tax_dep_rate: f(0.0434),
  oa_add: f(30000000), oa_amort_rate: f(0.25), rou_new: f(0), rou_amort_rate: f(0.18),
  lease_rate: f(0.0369), lease_pay: f(38000000), lease_cur_share: f(0.2),
  dso: f(19.7), dio: f(52.9), dpo: f(15.7), debtors_pct: f(0.054), sup_adv_pct: f(0.0028),
  creditors_pct: f(0.0411), cust_adv_pct: f(0.0144), rp_balance: f(0),
  ebo_service: f(31000000), ebo_rate: f(0.155), ebo_paid: f(15000000), ebo_cur_share: f(0.11), oci_gross: f(0), prov_used: f(0),
  tax_pay_pct: f(1),
  yield_delta: f(0), yield_spread: f(-0.13), usd_yield: f(0.04), base_delta: f(0),
  fx_close: f(56.0429),
  inv_nc_net: f(0), inv_cur_net: f(0), fvtpl_net: f(0), ofa_mov: f(0), assoc_mov: f(0),
  payout: f(0.5), dps: f(0), emp_pct: f(0.10), wages: f(0), board_pct: f(0.03), div_pay_pct: f(1),
  bonus_re: f(0), bonus_res: f(0),
  min_cash: f(500000000), sweep_pct: f(0), debt_cur_share: f(0.2),
};
const path = (s, step) => Array.from({ length: N }, (_, i) => +(s * (1 + step) ** (i + 1)).toFixed(4));
const bear = { ...base, g_export: f(-0.05), g_domestic: f(0.05), g_urea: f(-0.03), g_ammonia: f(-0.03), gas_pct: f(0.38), other_cogs_pct: f(0.09), sell_pct: f(0.021), ga_pct: f(0.025), capex_direct: f(800000000), capex_puc: f(1000000000), payout: f(0.4), fx_close: path(56.0429, 0.10) };
const bull = { ...base, g_export: f(0.08), g_domestic: f(0.15), g_urea: f(0.10), g_ammonia: f(0.10), gas_pct: f(0.30), other_cogs_pct: f(0.08), sell_pct: f(0.019), ga_pct: f(0.021), capex_direct: f(1200000000), capex_puc: f(2000000000), payout: f(0.6), fx_close: path(56.0429, 0.03) };
const settings = {
  circularity: 0, fxOn: 1, revenueBasis: 1, cogsMode: 1, gasMode: 2, sellMode: 1, gaMode: 1, depMode: 2, divMode: 1,
  revolverOn: 1, revolverSpread: 0.02, schedTaxOn: 0, yieldBaseId: 'tbill_364d', floatBaseId: 'cbe_overnight_lending',
  fxHistClose: 56.0429, fxHistAvg: 56.0429,
  usd: { cash: 0, inv_nc: 0, inv_cur: 0, fvtpl: 0, ofa: 0, ar: 0, debtors: 0, ap: 0, creditors: 0, cust_adv: 0 },
  lrPct: 0.05, lrCapPct: 0.5, empFloorPct: 0.10, boardCapPct: 0.10, boardMinDistPct: 0.05,
  sanityUpperPp: 0.10, sanityLowerPp: 0.10,
  covenants: { maxNetDebtEbitda: 3, minInterestCover: 2, minCurrentRatio: 1 },
  sensGrowthStep: 0.02, sensMarginStep: 0.02,
};
writeFileSync('tests/fixtures/mopco-drivers.json', JSON.stringify({
  _meta: {
    status: 'Analyst placeholders derived from FY2025 ratios. Not a forecast view; the owner replaces them.',
    unconfirmed: ['USD balance shares are 0: the FX-risk note was not available', 'fxHistClose and fxHistAvg use the registry USD/EGP of 29-Oct-2026, not the actual FY2025 rates', 'land is 0: not in Appendix B', 'depr_cogs_share is 1: split not in Appendix B', 'employee and board split: only the combined figure is reported in Appendix B'],
  },
  settings, scenarios: { bear, base, bull }, tranches: [],
}, null, 1) + '\n');
console.log(`lines=${lines.length} reported=${reported.length}`);
