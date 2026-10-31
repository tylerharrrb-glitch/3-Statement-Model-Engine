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

  CF('Profit before tax', 'cf_pbt', 14028144451, 19058310405),
  CF('Depreciation', 'cf_dep', 2283209560, 2219254113),
  CF('Amortization', 'cf_amort', 35519470, 18900491),
  CF('Provisions no longer required', 'cf_prov_rev', -160216876, -19299728),
  CF('Provisions formed', 'cf_prov_formed', 668304, 194831582),
  CF('Employee benefit obligations', 'cf_ebo_cost', 30494385, 106869737),
  CF('Capital losses', 'cf_cap_losses', 4378362, 196093),
  CF('Capital gains', 'cf_cap_gains', -17534400, -3816000),
  CF('Adjustment on other revenues', 'cf_other_adj', -2704250, -3488490),
  CF('ECL reversal', 'cf_ecl', -357037587, 390502424),
  CF('Impairment', 'cf_impairment', 0, -310962888),
  CF('Net finance income and cost', 'cf_net_fin', -2161430375, -2225691578),
  CF('Unrealized FX loss', 'cf_fx_unreal', 982480426, -6619976512),
  CF('Other financial assets', 'cf_ofa', 75437796, -197327079),
  CF('Inventory', 'cf_inventory', -213445319, -478480293),
  CF('Receivables', 'cf_ar', -899820862, 173958084),
  CF('Debtors', 'cf_debtors', 113856513, -370945365),
  CF('Related parties', 'cf_rp', 267150, 665027),
  CF('Supplier advances', 'cf_sup_adv', -34512064, 36464343),
  CF('Trade payables', 'cf_ap', 173398437, 156236100),
  CF('Creditors', 'cf_creditors', 152019271, 4481672),
  CF('Customer advances (source labels this "lease liability"; see source note 6)', 'cf_cust_adv', 250753316, -56838820),
  CF('Provisions used', 'cf_prov_used', -41362731, -201878213),
  CF('Dividends to employees and board', 'cf_dist_op', -1545237364, -977311347),
  CF('Income taxes paid', 'cf_tax_paid', -2997048224, -2735903582),
  CF('Employee benefits paid', 'cf_ebo_paid', -14889098, -7650510),
  CF('Interest received', 'cf_int_rec_inv', 2046816410, 1520913784),
  CF('Investment in associate', 'cf_assoc', -16519, -841326),
  CF('FVTPL, net', 'cf_fvtpl', 635719918, -1804007195),
  CF('Amortized-cost investments, net', 'cf_ac', -2775425169, 1753638359),
  CF('Proceeds from asset sales', 'cf_proceeds', 17534400, 3816000),
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
  SC('PP&E cost excl. PUC (Note 3 cost less PUC)', 'ppe_gross', 53298293853, 52768961464),
  SC('Accumulated depreciation (roll-forward value; note states ...948, source note 3)', 'ppe_accum', 21492392949, 19229575610),
  SC('Projects under construction', 'puc', 6386587177, 1092621142),
  SC('Additions incl. PUC', 'capex_total', 5848069006, 1248933200),
  SC('Disposals at cost', 'disposal_cost', 24770582, 8278168),
  SC('Depreciation released on disposal', 'disposal_accum', 20392221, 4172451),
  SC('Service cost', 'ebo_service', 30494385, 106869737),
  SC('Benefits paid', 'ebo_paid_s', 14889098, 7650510),
  SC('Provisions formed', 'prov_formed', 668304, 194831582),
  SC('Provisions used', 'prov_used', 41362731, 201878213),
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
  rep('cf_before_wc', 'Subtotal before working capital', 14665971470, 12805629649),
  rep('cf_before_dist', 'Cash from operations before distributions and taxes', 14242562977, 11871965105),
  rep('cf_cfo', 'Net operating', 9685388291, 8151099666),
  rep('cf_cfi', 'Net investing', -5923439966, 197533062),
  rep('cf_cff', 'Net financing', -7315181939, -11988611109),
  rep('cf_net', 'Net change in cash', -3553233614, -3639978381),
  rep('cf_fx_cash', 'FX effect on cash', -165397694, 2505134901),
  rep('cf_ecl_cash', 'ECL on cash', 10382262, 0),
  rep('cf_open', 'Opening cash', 6679913892, 7814757372),
  rep('re_opening', 'Opening retained earnings (equity statement)', 15132261531, 13484740108),
  rep('lr_opening', 'Opening legal reserve', 1212315306, 734200772),
  rep('capital_movement', 'Capital movement: FY2025 merger result 7,889,562,509 + 11 from RE; FY2024 none', 7889562520, 0),
  rep('capital_opening', 'Opening capital', 20791840110, 20791840110),
  rep('note3_cost_open', 'Note 3 cost incl. PUC, opening', 53861582606, 52620927574),
  rep('note3_accum_open', 'Note 3 accumulated depreciation, opening', 19229575610, 17014493948),
  rep('ppe_net_rounding', 'Documented 1 EGP gap in Note 3 net at 31-Dec-2024 (source note 10)', 0, 1),
  rep('note3_accum_stated', 'Note 3 accumulated depreciation as stated', 21492392948),
  rep('note3_fully_dep', 'Fully depreciated assets still in use', 330458692),
  rep('eps', 'EPS as reported (FY2024 restated for bonus shares)', 3.94, 5.27),
  rep('nca_rounding', 'Documented 1 EGP gap between non-current asset lines and stated totals (source note 9)', 1, 0),
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
  { id: 9, text: 'FY2025 statement of financial position, PDF page 5: the six non-current asset lines sum to 50,015,842,514, but the printed total is 50,015,842,515, and total assets 61,193,831,633. Confirmed in the PDF: this is in the source, not a transcription gap. The balance sheet ties within this documented 1 EGP.', amount: 1 },
  { id: 10, text: 'Note 3, PDF page 13: at 31-Dec-2024, total cost 53,861,582,606 less accumulated depreciation 19,229,575,610 gives 34,632,006,996; the printed net, which the column sum and the balance sheet support, is 34,632,006,997.', amount: 1 },
  { id: 11, text: 'Note 34, PDF page 29: shareholders dividends shown as 7,277,144,039; the equity statement shows 7,277,144,038.', amount: 1 },
  { id: 12, text: 'Note 34, PDF page 29: the FY2024 column prints 6,927,357,966 after distributions, but the lines give 6,297,357,965, and neither produces the printed EPS of 5.27. EPS 5.27 = 15,119,739,368 / 2,868,140,263, with no distributions deducted.', amount: 630000001 },
  { id: 13, text: 'FY2024 legal reserve transfer 478,114,534 is not 5% of reported FY2023 net profit 5,974,356,398 (298,717,820), because the FY2023 income statement excludes the merged company. The implied base is 9,562,290,680.', amount: 179396714 },
  { id: 14, text: 'Merger: resolved by EGM 4-Nov-2023, approved by GAFI 21-Sep-2023, base date 31-Dec-2022, entered in the commercial register 13-Dec-2023 (Note 1). So FY2023 is mixed: the balance sheet is post-merger and the income statement is MOPCO before the merger. Not comparable with FY2024 and FY2025.' },
  { id: 15, text: 'FY2024 CF additions line 1,275,986,560 includes other assets (Note 3 additions 1,248,933,200). The FY2025 line equals Note 3 additions exactly (see note 7).' },
  { id: 16, text: 'Employee distribution paid in 2025, 1,511,973,937, equals 10% of FY2024 net profit, not 10% of dividends. It exceeds salaries in cost of sales (858,088,584). Whether it breaches the Art. 41 wages cap needs total wages and the Arabic text. No cap is applied in the model.', amount: 1511973937 },
  { id: 8, text: 'Debtors and other debit balances: BS change +603,590,502 does not match the CF line +113,856,513. Shown in the reconciliation table; the CF line is not derived from it.' },
];

const fixture = {
  _meta: {
    company: 'Misr Fertilizers Production Company (MOPCO)',
    source: 'Audited FY2025 financial statements; Crowe Dr. A. M. Hegazy & Co.; report dated 9-Mar-2026; published at mopco-eg.com, Investor Relations, Financial Reports',
    sourceFiles: {
      FY2025: 'http://www.mopco-eg.com/images/gallery/files/gallery_file_761512307.pdf',
      FY2024: 'http://www.mopco-eg.com/images/gallery/files/gallery_file_1105043101.pdf',
      FY2023: 'http://www.mopco-eg.com/images/gallery/files/gallery_file_1789109249.pdf',
    },
    pdfCrossCheck: 'Primary statements, equity statement and Note 3 in the FY2025 PDF were read page by page on 31-Oct-2026 and agree with Appendix B line by line. FY2024 CF lines and Note 3 comparatives were transcribed from the FY2025 PDF. The scans were read by eye, without OCR software; every transcribed section sums to its printed total. The separate FY2024 PDF was downloaded but not compared line by line with the FY2025 comparatives.',
    mergerEffectiveDate: 'Registered 13-Dec-2023; base date 31-Dec-2022 (Note 1). See source note 14.',
    units: 'Full absolute EGP',
    segmentByMarket: 'Note 23 discloses segment by market. FY2025 export: urea 20,069,830,298, ammonia 1,396,781,754. Domestic: urea 3,600,332,114, ammonia 1,776,815,820, other 315,590.',
  },
  company: {
    name: 'Misr Fertilizers Production Company (MOPCO)', ticker: 'MFPC.CA', sector: 'industrial', fiscalYearEndMonth: 12, parValue: 10,
    policy: { interestReceivedOperating: 0, interestPaidOperating: 1, distributionsOperating: 1 },
    wolf: {
      name: 'Misr Fertilizers Production Company', shortName: 'MOPCO', exchange: 'EGX', country: 'EG', damodaranIndustry: 'Chemical (Basic)',
      sharesNote: 'After the 2025 bonus issue; EPS for both years computed on this count.',
      statementsDescription: 'Audited financial statements for the year ended 31 December 2025 (with FY2024 comparatives). All amounts in EGP.',
      auditor: 'Crowe - Dr. A. M. Hegazy & Co.', reportDate: '2026-03-09',
      valuationDate: '', price: 0, priceDate: '', priceSource: '',
    },
  },
  historicals: { years: [2024, 2025], referenceYears: [2023], lines, reported, sourceNotes },
  reference: {
    FY2023: {
      label: 'Reference only: balance sheet post-merger, income statement pre-merger, not comparable (source note 14).',
      page: 'FY2023 PDF, text layer, statements section',
      net_sales: 5959553344, cost_of_sales: 2735322554, gross_profit: 3224230790, other_income: 155257336, selling: 160487452, ga: 213266360, other_expenses: 36607935, capital_losses: 97672, ecl: -4418140,
      operating_profit: 2964610567, finance_income: 879572186, finance_costs: 31046190, fx: 2119579834, net_finance: 2968105830, subsidiary_dividends: 1530854436, pbt: 7463570833, income_tax: 1489214435, net_profit: 5974356398, eps: 2.87,
      total_nca: 39007539808, total_ca: 15181857927, total_assets: 54189397735, capital: 20791840110, legal_reserve: 734200772, general_reserve: 352383742, merger_reserve: 7889562509, re: 13484740108, total_equity: 43252727241,
      total_ncl: 7287780564, total_cl: 3648889930, total_liabilities: 10936670494, cash: 7814757372,
    },
  },
};
writeFileSync('tests/fixtures/mopco-fy2025.json', JSON.stringify(fixture, null, 1) + '\n');

// Driver sets. Ratios and balances come from the FY2025 notes; forward views are analyst assumptions,
// tagged as such on Inputs, for the owner to review. Bear, base and bull are explicit sets, not multipliers.
const N = 10;
const f = v => Array(N).fill(v);
const yrs = (...a) => Array.from({ length: N }, (_, i) => a[Math.min(i, a.length - 1)]);
const SPOT = 56.0429; // CBE official mid, 29-Oct-2026.
const fxPath = (first, step) => Array.from({ length: N }, (_, i) => +(first * (1 + step) ** i).toFixed(4));
const base = {
  g_export: yrs(0.05, 0.03), g_domestic: yrs(0.15, 0.12, 0.10, 0.08), g_urea: yrs(0.05), g_ammonia: yrs(0.05), g_other: f(0),
  mix_urea: f(0.8818), mix_ammonia: f(0.1182), mix_other: f(0), export_share: f(0.80),
  vol_urea: f(0), vol_ammonia: f(0), vol_other: f(0), price_urea: f(0), price_ammonia: f(0), price_other: f(0),
  gas_pct: f(0.33), gas_price_usd: f(0), gas_mmbtu: f(0), gas_kcf: f(0),
  other_cogs_pct: f(0.0883), gm_pct: f(0.50), depr_cogs_share: f(0.95),
  sell_pct: f(0.0196), sell_g: f(0.05), ga_pct: f(0.0186), ga_g: f(0.05),
  other_income: f(100000000), prov_reversed: f(0), other_exp: f(40000000), prov_formed: f(0), impairment: f(0), ecl: f(0),
  capex_direct: f(300000000), capex_puc: yrs(5000000000, 3000000000, 500000000), puc_transfer: yrs(0, 0, 14000000000, 500000000),
  disposal_cost: f(0), disposal_nbv: f(0), disposal_proceeds: f(0),
  land: f(262021195), fully_dep: f(330458692), dep_rate: f(0.0438), useful_life: f(23), tax_dep_rate: f(0.0438),
  oa_add: f(30000000), oa_amort_rate: f(0.25), rou_new: f(0), rou_amort_rate: f(0.18),
  lease_rate: f(0.0369), lease_pay: f(38000000), lease_cur_share: f(0.2),
  dso: f(19.7), dio: f(52.9), dpo: f(15.7), debtors_pct: f(0.054), sup_adv_pct: f(0.0028),
  creditors_pct: f(0.0411), cust_adv_pct: f(0.0144), rp_balance: f(0),
  ebo_service: f(31000000), ebo_rate: f(0.155), ebo_paid: f(15000000), ebo_cur_share: f(0.11), oci_gross: f(0), prov_used: f(0),
  tax_pay_pct: f(1),
  yield_delta: yrs(0, -0.02, -0.04, -0.06), yield_spread: f(0), usd_yield: f(0.08), base_delta: yrs(0, -0.02, -0.04, -0.06),
  fx_close: fxPath(SPOT, 0.05),
  inv_nc_net: f(0), inv_cur_net: f(0), fvtpl_net: f(0), ofa_mov: f(0), assoc_mov: f(0),
  payout: f(0.5066), dps: f(0), emp_pct: f(0.2078), wages: f(0), board_pct: f(0.0023), div_pay_pct: f(1),
  bonus_re: f(0), bonus_res: f(0),
  min_cash: f(500000000), sweep_pct: f(0), debt_cur_share: f(0.2),
};
// For an exporter a stronger pound hurts, so bear has the slower depreciation.
const bear = { ...base, g_export: yrs(-0.10, -0.05, 0), g_domestic: yrs(0.10, 0.08, 0.05), gas_pct: f(0.38), other_cogs_pct: f(0.095), sell_pct: f(0.021), ga_pct: f(0.021), capex_puc: yrs(5000000000, 2000000000, 300000000), puc_transfer: yrs(0, 0, 13000000000, 300000000), payout: f(0.40), fx_close: fxPath(52, 0.02) };
const bull = { ...base, g_export: yrs(0.15, 0.08, 0.05), g_domestic: yrs(0.20, 0.15, 0.12), gas_pct: f(0.30), other_cogs_pct: f(0.082), sell_pct: f(0.019), ga_pct: f(0.017), payout: f(0.60), fx_close: fxPath(SPOT, 0.08) };
const settings = {
  circularity: 0, fxOn: 1, revenueBasis: 1, cogsMode: 1, gasMode: 2, sellMode: 1, gaMode: 1, depMode: 2, divMode: 1,
  revolverOn: 1, revolverSpread: 0.02, schedTaxOn: 0, yieldBaseId: 'tbill_364d', floatBaseId: 'cbe_overnight_lending',
  fxHistClose: 47.6607, fxHistAvg: 49.3637,
  usd: { cash: 0.7483, inv_nc: 0.7483, inv_cur: 0.7483, fvtpl: 0.7483, ofa: 0.7483, ar: 0.7483, debtors: 0.7483, ap: 0.1665, creditors: 0.1665, cust_adv: 0.1665 },
  lrPct: 0.05, lrCapPct: 0.5, empFloorPct: 0.10, boardCapPct: 0.10, boardMinDistPct: 0.05,
  sanityUpperPp: 0.10, sanityLowerPp: 0.10,
  covenants: { maxNetDebtEbitda: 3, minInterestCover: 2, minCurrentRatio: 1 },
  sensGrowthStep: 0.02, sensMarginStep: 0.02,
};
writeFileSync('tests/fixtures/mopco-drivers.json', JSON.stringify({
  _meta: {
    status: 'Ratios and balances from the FY2025 notes. Forward views are analyst assumptions prepared by Claude for the owner to review; they are not investment advice or a house view.',
    sourced: ['fxHistClose 47.6607 and fxHistAvg 49.3637: note 35', 'USD financial assets 15,597,077,984 of 20,844,777,782 and USD liabilities 342,946,952: notes 35 and 36', 'land 262,021,195 and fully depreciated 330,458,692: note 3', 'employee 1,511,973,937 and board 33,263,427: note 34', 'capital commitments: note 38'],
    estimated: ['USD shares apply one rate to every class, because the note gives only the total', 'usd_yield 8% is implied by FY2025 finance income, assuming the EGP part earns the T-bill yield', 'capex and PUC paths are based on 5.9bn spent to date and about 7.7bn of incomplete contracts at the FX rates in note 35', 'depr_cogs_share 0.95 approximates note 24, which combines depreciation and amortization'],
    openingFxEffect: 'The first forecast year revalues USD balances from 47.6607 to the 2026 closing rate. Base case: a gain of about EGP 2.6bn on USD balances.',
  },
  settings, scenarios: { bear, base, bull }, tranches: [],
}, null, 1) + '\n');
console.log(`lines=${lines.length} reported=${reported.length}`);
