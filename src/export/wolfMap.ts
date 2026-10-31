// Export to WOLF: one table from engine line to WOLF key, in the key order of WOLF's CompanyData.
// Reads historical lines and reported totals only. Nothing is recomputed; a total is taken as reported.
// Forecast years are not exported. WOLF treats the last year in the file as the latest actual and
// allows five years (ValuationEngine: src/domain/company.ts:196, src/engine/company.ts:105).
import { accountsForYear } from '../engine/historicals';
import type { ModelInputs } from '../engine/types';

/** acc: sum of standard accounts times sign. rep: a reported total. zero: no such line in the engine. */
type Src = { acc: string[]; sign: 1 | -1; optional?: boolean } | { rep: string } | { zero: true };
const a = (id: string | string[], sign: 1 | -1 = 1, optional = false): Src => ({ acc: Array.isArray(id) ? id : [id], sign, optional });
const opt = (id: string | string[], sign: 1 | -1 = 1): Src => a(id, sign, true);
const r = (id: string): Src => ({ rep: id });
const Z: Src = { zero: true };

export const WOLF_MAP: { income: [string, Src][]; balance: [string, Src][]; cashFlow: [string, Src][] } = {
  income: [
    ['revenue', r('revenue')],
    ['exportRevenue', a('rev_export')],
    ['costOfSales', a('cogs', -1)],
    ['grossProfit', r('gross_profit')],
    ['otherIncome', a('other_income_total')],
    ['provisionsReleased', a('prov_reversed')],
    ['sellingMarketing', a('selling', -1)],
    ['generalAdmin', a('ga', -1)],
    ['capitalGains', a('cap_gains')],
    ['otherExpenses', a('other_exp_total', -1)],
    ['impairmentReversal', a('impairment')],
    ['eclReversal', a('ecl')],
    ['otherOperating', Z],
    ['operatingProfit', r('op_profit')],
    ['financeIncome', a('fin_income')],
    ['financeCostDebt', opt('debt_int', -1)],
    ['financeCostLease', a('lease_int', -1)],
    ['financeCostEmployeeBenefit', a('ebo_int', -1)],
    ['financeCostOther', Z],
    ['fxGainLoss', a('fx_line')],
    ['shareOfAssociates', Z],
    ['otherNonOperating', Z],
    ['profitBeforeTax', r('pbt')],
    ['currentTax', a('current_tax', -1)],
    ['deferredTax', a('deferred_tax', -1)],
    ['totalTax', a(['current_tax', 'deferred_tax'], -1)],
    ['netProfit', r('net_profit')],
    ['minorityShareOfProfit', Z],
    ['depreciation', a('dep')],
    ['amortization', a('amort')],
    ['epsReported', r('eps')],
  ],
  balance: [
    ['ppe', a('fixed_assets')],
    ['intangibleAndOtherAssets', a('other_assets')],
    ['rightOfUseAssets', a('rou')],
    ['goodwill', Z],
    ['associates', a('associates')],
    ['amortizedCostNonCurrent', a('inv_nc')],
    ['restrictedCashNonCurrent', a('ofa')],
    ['deferredTaxAsset', Z],
    ['otherNonCurrentAssets', Z],
    ['inventory', a('inventory')],
    ['receivables', a('ar')],
    ['amortizedCostCurrent', a('inv_cur')],
    ['fvtplSecurities', a('fvtpl')],
    ['otherCurrentAssets', a('debtors')],
    ['dueFromRelatedParties', a('rp')],
    ['supplierAdvances', a('sup_adv')],
    ['restrictedCashCurrent', Z],
    ['cash', a('cash')],
    ['totalAssets', r('total_assets')],
    ['shareCapital', a('capital')],
    ['legalReserve', a('legal_reserve')],
    ['otherReserves', a('general_reserve')],
    ['retainedEarnings', a('re')],
    ['otherEquity', a('merger_reserve')],
    ['minorityInterest', Z],
    ['preferredEquity', Z],
    ['totalEquity', r('total_equity')],
    ['bankDebtNonCurrent', opt('debt_nc')],
    ['bondsNonCurrent', Z],
    ['leaseNonCurrent', a('lease_nc')],
    ['deferredTaxLiability', a('dtl')],
    ['employeeBenefitsNonCurrent', a('ebo_nc')],
    ['otherNonCurrentLiabilities', Z],
    ['bankDebtCurrent', opt('debt_cur')],
    ['leaseCurrent', a('lease_cur')],
    ['currentTaxPayable', a('tax_payable')],
    ['tradePayables', a('ap')],
    ['otherPayables', a('creditors')],
    ['customerAdvances', a('cust_adv')],
    ['employeeBenefitsCurrent', a('ebo_cur')],
    ['provisions', a('provisions')],
    ['dueToRelatedParties', Z],
    ['otherCurrentLiabilities', opt('dividends_payable')],
    ['totalLiabilities', r('total_liabilities')],
  ],
  cashFlow: [
    ['cashGeneratedFromOperations', r('cf_before_dist')],
    ['employeeBoardDistributions', a(['cf_dist_op', 'cf_dist_fin'])],
    ['taxesPaid', a('cf_tax_paid')],
    ['employeeBenefitsPaid', a('cf_ebo_paid')],
    ['otherOperatingCashFlows', a(['cf_int_rec_op', 'cf_int_paid_op'])],
    ['netCashFromOperating', r('cf_cfo')],
    ['interestReceived', a(['cf_int_rec_inv', 'cf_int_rec_op'])],
    ['capex', a('cf_capex')],
    ['dividendsToShareholders', a('cf_div')],
    ['leasePayments', a('cf_leases')],
    ['netChangeInCash', r('cf_net')],
  ],
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Reasons the file would not import. WOLF requires valuationDate, price and priceDate (src/engine/company.ts:100-102). */
export function wolfExportIssues(inp: ModelInputs): string[] {
  const out: string[] = [];
  const w = inp.company.wolf;
  if (!w) return ['Company has no WOLF profile. Complete the WOLF export fields on the Company page.'];
  if (!ISO.test(w.valuationDate)) out.push('Valuation date is required (YYYY-MM-DD).');
  if (!(w.price > 0)) out.push('Share price must be positive.');
  if (!ISO.test(w.priceDate)) out.push('Price date is required (YYYY-MM-DD).');
  const h = inp.historicals;
  const last = h.years[h.years.length - 1];
  if (!(accountsForYear(h, last).shares > 0)) out.push(`Shares outstanding are not loaded for ${last}.`);
  for (const year of h.years) {
    for (const group of Object.values(WOLF_MAP)) {
      for (const [key, src] of group) if (lookup(inp, year, src) === null) out.push(`${key} is not loaded for ${year}.`);
    }
  }
  return out;
}

function lookup(inp: ModelInputs, year: number, src: Src): number | null {
  if ('zero' in src) return 0;
  if ('rep' in src) return inp.historicals.reported.find(x => x.id === src.rep)?.values[String(year)] ?? null;
  const acc = accountsForYear(inp.historicals, year);
  let sum = 0;
  for (const id of src.acc) {
    const v = acc[id];
    // Combined keys carry a policy split, so one side may be absent; a single required line may not.
    if (v === undefined) { if (src.optional || src.acc.length > 1) continue; return null; }
    sum += v;
  }
  if (src.acc.length > 1 && src.acc.every(id => acc[id] === undefined)) return null;
  return src.sign * sum + 0;
}

function group(inp: ModelInputs, year: number, table: [string, Src][]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, src] of table) {
    const v = lookup(inp, year, src) as number;
    out[key] = key === 'epsReported' ? Math.round(v * 100) / 100 : Math.round(v) + 0;
  }
  return out;
}

/** Builds the file. Throws when wolfExportIssues reports anything. */
export function buildWolfCompany(inp: ModelInputs): Record<string, unknown> {
  const issues = wolfExportIssues(inp);
  if (issues.length) throw new Error(issues.join(' '));
  const w = inp.company.wolf!;
  const h = inp.historicals;
  const month = inp.company.fiscalYearEndMonth;
  const mmdd = month === 12 ? '12-31' : '06-30';
  const lastYear = h.years[h.years.length - 1];
  return {
    schemaVersion: 1,
    name: w.name,
    shortName: w.shortName,
    ticker: inp.company.ticker,
    exchange: w.exchange,
    country: w.country,
    currency: 'EGP',
    fiscalYearEnd: mmdd,
    valuationDate: w.valuationDate,
    price: w.price,
    priceDate: w.priceDate,
    priceSource: w.priceSource,
    shares: { basic: accountsForYear(h, lastYear).shares, dilutiveItems: [], note: w.sharesNote },
    years: h.years.map(year => ({
      fiscalYear: year,
      periodEnd: `${year}-${mmdd}`,
      audited: true,
      income: group(inp, year, WOLF_MAP.income),
      balance: group(inp, year, WOLF_MAP.balance),
      cashFlow: group(inp, year, WOLF_MAP.cashFlow),
    })),
    damodaranIndustry: w.damodaranIndustry,
    segments: [],
    facts: [],
    statementsSource: { description: w.statementsDescription, auditor: w.auditor, reportDate: w.reportDate },
  };
}
