// One-time generator for data/rates.manual.json from the brief's Appendix A.
// Every value starts unconfirmed unless a primary source was read. Never present these as auto.
import { writeFileSync } from 'node:fs';

const CBE = 'https://www.cbe.org.eg/en/';
const CAP = 'https://www.capmas.gov.eg/';
const MOF = 'https://www.mof.gov.eg/';
const e = (id, label, value, unit, nature, sourceName, sourceUrl, asOf, updateCycle, bounds, status, notes) => ({
  id, label, value, unit, nature, sourceName, sourceUrl, asOf, fetchedAt: null, verifiedAt: null, method: 'manual', updateCycle, bounds, status, notes,
});
const B = (min, max) => ({ min, max });
const SEC = 'Secondary source reported by owner on 31-Oct-2026; primary source not read.';

const entries = [
  e('cbe_overnight_deposit', 'CBE overnight deposit rate', 20, 'pct', 'official', 'EnterpriseAM 30-Oct-2026 reporting CBE statement', CBE, '2026-10-29', 'mpc', B(0, 60), 'unconfirmed', `MPC 29-Oct-2026. ${SEC} cbe.org.eg rejects automated access. A web search on 31-Oct-2026 found 19.00/20.00/19.50 reported through Aug-2026 and no independent report of the 29-Oct change.`),
  e('cbe_overnight_lending', 'CBE overnight lending rate', 21, 'pct', 'official', 'EnterpriseAM 30-Oct-2026 reporting CBE statement', CBE, '2026-10-29', 'mpc', B(0, 60), 'unconfirmed', `MPC 29-Oct-2026. ${SEC}`),
  e('cbe_main_operation', 'CBE main operation rate', 20.5, 'pct', 'official', 'EnterpriseAM 30-Oct-2026 reporting CBE statement', CBE, '2026-10-29', 'mpc', B(0, 60), 'unconfirmed', `MPC 29-Oct-2026. ${SEC}`),
  e('cbe_discount_rate', 'CBE discount rate', 20.5, 'pct', 'official', 'EnterpriseAM 30-Oct-2026 reporting CBE statement', CBE, '2026-10-29', 'mpc', B(0, 60), 'unconfirmed', `MPC 29-Oct-2026. ${SEC}`),
  e('cbe_corridor_prior', 'Prior CBE corridor: deposit / lending / main', [19, 20, 19.5], 'pct', 'official', 'Zawya/Reuters 29-Oct-2026', CBE, '2026-02-01', 'event', null, 'unconfirmed', 'History only: Feb-2026 to 29-Oct-2026. Start date within Feb-2026 not confirmed.'),
  e('cpi_urban_headline_yoy', 'Urban headline CPI, y/y', 13.9, 'pct', 'official', 'CBE via Zawya/Reuters 20-Oct-2026', CAP, '2026-09-30', 'monthly', B(-5, 80), 'unconfirmed', `Sep-2026; Aug 14.5. ${SEC}`),
  e('cpi_core_yoy', 'Core CPI, y/y', 14.1, 'pct', 'official', 'CBE via Zawya/Reuters 20-Oct-2026', CBE, '2026-09-30', 'monthly', B(-5, 80), 'unconfirmed', `Sep-2026; Aug 14.9. ${SEC}`),
  e('cpi_urban_mom', 'Urban CPI, m/m', 1.3, 'pct', 'official', 'CBE via Zawya/Reuters 20-Oct-2026', CAP, '2026-09-30', 'monthly', B(-10, 20), 'unconfirmed', `Sep-2026. ${SEC}`),
  e('cbe_inflation_target', 'CBE inflation target', 7, 'pct', 'official', 'Not verified', 'TO_VERIFY', null, 'event', null, 'unconfirmed', '7% +/- 2pp; target date unconfirmed.'),
  e('tbill_91d', 'T-bill yield, 91 days', 24.316, 'pct', 'market_quote', 'Afronomics citing CBE', 'TO_VERIFY', '2026-10-27', 'weekly_auction', B(0, 60), 'unconfirmed', 'Auction 27-Oct-2026, before the hike.'),
  e('tbill_182d', 'T-bill yield, 182 days', 25.166, 'pct', 'market_quote', 'Afronomics citing CBE', 'TO_VERIFY', '2026-10-27', 'weekly_auction', B(0, 60), 'unconfirmed', 'Auction 27-Oct-2026.'),
  e('tbill_273d', 'T-bill yield, 273 days', null, 'pct', 'market_quote', 'Not reported in that auction', 'TO_VERIFY', null, 'weekly_auction', B(0, 60), 'unconfirmed', 'No value obtained.'),
  e('tbill_364d', 'T-bill yield, 364 days', 25.912, 'pct', 'market_quote', 'Afronomics; HC Securities in Zawya 29-Oct-2026', 'TO_VERIFY', '2026-10-27', 'weekly_auction', B(0, 60), 'unconfirmed', 'Auction 27-Oct-2026.'),
  e('tbond_yields_by_tenor', 'T-bond yields by tenor', null, 'pct', 'market_quote', 'Not checked', 'TO_VERIFY', null, 'weekly_auction', null, 'unconfirmed', 'No value obtained.'),
  e('usdegp_cbe_official', 'USD/EGP, CBE official mid', 51.4281, 'EGP_per_USD', 'official', 'CBE official rate, read manually for the WOLF registry', 'https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates', '2026-09-23', 'daily', B(30, 120), 'unconfirmed', 'Latest figure available in the WOLF registry, 23-Sep-2026. The brief reports the pound passed 54.73 by 29-Oct-2026 (Zawya), so this value is out of date. Re-read at CBE.'),
  e('conia', 'CONIA', null, 'pct', 'official', 'Not checked', 'TO_VERIFY', null, 'daily', B(0, 60), 'unconfirmed', 'No value obtained.'),
  e('cit_rate', 'Corporate income tax rate', 22.5, 'pct', 'statutory', 'Income Tax Law 91/2005', MOF, null, 'event', B(0, 60), 'unconfirmed', 'Article number to confirm.'),
  e('vat_standard', 'VAT standard rate', 14, 'pct', 'statutory', 'PwC summary of Law 149/2026', 'TO_VERIFY', '2026-07-29', 'event', B(0, 30), 'ok', 'Standard rate unchanged. Secondary source accepted by owner.'),
  e('natural_gas_schedule_tax', 'Natural-gas Schedule Tax, EGP per thousand cubic feet', 20, 'EGP_per_kcf', 'statutory', 'PwC, Law 149/2026', 'TO_VERIFY', '2026-07-29', 'event', B(0, 1000), 'unconfirmed', 'Applicability to feedstock and recoverability unconfirmed. Model switch stays 0.'),
  e('div_wht_listed', 'Dividend WHT, listed', 5, 'pct', 'statutory', 'PwC, Laws 148-155/2026', 'TO_VERIFY', '2026-07-29', 'event', B(0, 30), 'ok', 'Secondary source accepted by owner.'),
  e('div_wht_general', 'Dividend WHT, general', 10, 'pct', 'statutory', 'PwC, Laws 148-155/2026', 'TO_VERIFY', '2026-07-29', 'event', B(0, 30), 'ok', 'Secondary source accepted by owner.'),
  e('intercompany_dividend_exclusion', 'Resident company-to-company dividends excluded from the base', 'Excluded; conditions not listed', 'text', 'statutory', 'PwC', 'TO_VERIFY', '2026-07-29', 'event', null, 'unconfirmed', 'The 25% holding and 2-year conditions are unconfirmed.'),
  e('listed_cgt', 'Capital gains on EGX-listed shares', 'Exempt, except disposals causing delisting', 'text', 'statutory', 'PwC', 'TO_VERIFY', '2026-07-29', 'event', null, 'unconfirmed', 'MCDR withholding unconfirmed.'),
  e('egx_stamp_duty', 'EGX stamp duty per side', 0.05, 'pct', 'statutory', 'PwC, Law 153/2026', 'TO_VERIFY', null, 'event', B(0, 2), 'ok', '0.025% same-session. Secondary source accepted by owner.'),
  e('legal_reserve_rule', 'Legal reserve: at least 5% of net profit until 50% of issued capital', [5, 50], 'pct', 'statutory', 'Law 159/1981 Art. 40, Andersen English translation', 'TO_VERIFY', null, 'event', null, 'unconfirmed', 'Confirm in the official Arabic text.'),
  e('employee_profit_share_rule', 'Employee share: at least 10% of profits distributed, capped at annual wages', 10, 'pct', 'statutory', 'Law 159/1981 Art. 41, Andersen English translation', 'TO_VERIFY', null, 'event', null, 'unconfirmed', 'Confirm in the official Arabic text.'),
  e('board_remuneration_cap', 'Board remuneration: at most 10% of net profit after depreciation and reserves, after a 5%-of-capital distribution', [10, 5], 'pct', 'statutory', 'Law 159/1981 Art. 88, Andersen English translation', 'TO_VERIFY', null, 'event', null, 'unconfirmed', 'Confirm in the official Arabic text.'),
  e('epd_law_14_2025', 'Old engine citation "Law No. 14 of 2025 (amended Labor Law)"', null, 'text', 'statutory', 'Not verified', 'TO_VERIFY', null, 'event', null, 'unconfirmed', 'Citation removed from the rebuilt engine; not used.'),
  e('sp_egypt_rating', 'S&P Egypt rating', 'B / B, stable', 'rating', 'market_quote', 'Arab News 11-Oct-2026', 'TO_VERIFY', '2026-10-10', 'event', null, 'ok', 'Affirmed about 10-Oct-2026.'),
  e('egypt_cds_5y', 'Egypt 5-year CDS', 343, 'bp', 'market_quote', 'Zawya/Reuters', 'TO_VERIFY', '2026-10-29', 'daily', B(0, 3000), 'unconfirmed', 'Secondary source.'),
  e('imf_real_gdp_growth', 'IMF real GDP growth, Egypt', 5.1, 'pct', 'estimate', 'IMF Regional Economic Outlook Oct-2026, via Business Today Egypt 22-Oct-2026', 'https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/EGY', '2026-10-22', 'semiannual', B(-20, 30), 'unconfirmed', '4.4% (2025), 5.1% (2026), 4.7% (2027). Fiscal-year basis unconfirmed.'),
  e('imf_inflation_forecast', 'IMF inflation forecast, Egypt', null, 'pct', 'estimate', 'IMF DataMapper', 'https://www.imf.org/external/datamapper/api/v1/PCPIPCH/EGY', null, 'semiannual', B(-5, 80), 'unconfirmed', 'No value obtained. The revenue upper-bound sanity flag stays inactive until loaded.'),
  e('mpc_calendar_2026', 'CBE MPC calendar 2026', ['2026-04-02', '2026-05-21', '2026-07-09', '2026-08-20', '2026-09-24', '2026-10-29'], 'date_list', 'official', 'Zawya/Reuters 29-Oct-2026', CBE, null, 'event', null, 'unconfirmed', 'February and December dates to be confirmed, so they are left out and cannot trigger staleness. 2027 calendar TO_VERIFY.'),
  { ...e('us_10y', 'US Treasury 10-year par yield', 4.94, 'pct', 'market_quote', 'US Treasury daily par yield curve', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve', '2026-10-30', 'daily', B(0, 20), 'ok', 'Read directly from the Treasury CSV on 31-Oct-2026. The Worker replaces this value when it runs.'), verifiedAt: '2026-10-31' },
];
// Read at the primary source on 31-Oct-2026 with browser-style request headers.
const PR = 'https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026';
const HOME = 'https://www.cbe.org.eg/en/';
const v = (id, patch) => { const x = entries.find(y => y.id === id); Object.assign(x, { verifiedAt: '2026-10-31', status: 'ok', ...patch }); };
const prNote = 'CBE MPC press release 29-Oct-2026: raised 100 bps to 20.0 / 21.0 / 20.5, discount 20.5. Also shown on the CBE homepage key statistics.';
for (const id of ['cbe_overnight_deposit', 'cbe_overnight_lending', 'cbe_main_operation']) v(id, { sourceName: 'Central Bank of Egypt, MPC press release and homepage', sourceUrl: PR, notes: prNote });
v('cbe_discount_rate', { sourceName: 'Central Bank of Egypt, MPC press release', sourceUrl: PR, notes: prNote });
v('cbe_corridor_prior', { sourceName: 'Implied by the CBE press release: a 100 bps raise to 20.0 / 21.0 / 20.5', sourceUrl: PR, asOf: '2026-10-28', notes: 'History only. Start date within Feb-2026 not read at CBE.' });
const INF = 'https://www.cbe.org.eg/en/economic-research/statistics/inflation-rates';
v('cpi_urban_headline_yoy', { sourceName: 'Central Bank of Egypt, inflation rates', sourceUrl: INF, notes: 'Sep-2026, page updated 11-Oct-2026.' });
v('cpi_core_yoy', { sourceName: 'Central Bank of Egypt, inflation rates', sourceUrl: INF, notes: 'Sep-2026, page updated 11-Oct-2026.' });
v('cpi_urban_mom', { sourceName: 'Central Bank of Egypt, inflation rates', sourceUrl: INF, notes: 'Sep-2026, page updated 11-Oct-2026.' });
v('cbe_inflation_target', { sourceName: 'Central Bank of Egypt, inflation target page', sourceUrl: 'https://www.cbe.org.eg/en/monetary-policy/inflation-target', asOf: '2024-12-26', notes: '7% +/- 2pp on average in Q4 2026; 5% +/- 2pp on average in Q4 2028, per the December 2024 MPC press release. Press release day not read.' });
const TB = 'https://www.cbe.org.eg/en/auctions/egp-t-bills';
v('tbill_182d', { value: 25.457, sourceName: 'Central Bank of Egypt, EGP T-bill auction results', sourceUrl: TB, asOf: '2026-10-29', notes: 'Accepted bids, weighted average yield, auction 29-Oct-2026. Replaces the owner seed 25.166 from 27-Oct-2026, before the hike.' });
v('tbill_364d', { value: 26.076, sourceName: 'Central Bank of Egypt, EGP T-bill auction results', sourceUrl: TB, asOf: '2026-10-29', notes: 'Accepted bids, weighted average yield, auction 29-Oct-2026. Replaces the owner seed 25.912 from 27-Oct-2026, before the hike.' });
Object.assign(entries.find(y => y.id === 'tbill_91d'), { notes: 'Auction 27-Oct-2026, before the hike; secondary source. Next 91-day and 273-day auctions are 1-Nov-2026 per CBE, so CBE results were not on the page.' });
Object.assign(entries.find(y => y.id === 'tbill_273d'), { notes: 'No value obtained. Next auction 1-Nov-2026 per CBE.' });
v('usdegp_cbe_official', { value: 56.0429, sourceName: 'Central Bank of Egypt, official exchange rates', sourceUrl: 'https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates', asOf: '2026-10-29', notes: 'Average market rate 29-Oct-2026: buy 55.9936, sell 56.0922; mid stored.' });
v('conia', { value: 19.468, sourceName: 'Central Bank of Egypt, homepage key statistics', sourceUrl: HOME, asOf: '2026-10-29', notes: 'Page read 31-Oct-2026; date of the observation not shown beside the value, last page update used.' });
entries.push(e('tbond_3y', 'T-bond 3-year fixed coupon, accepted weighted average yield', 24.432, 'pct', 'market_quote', 'Central Bank of Egypt, fixed coupon bond results', 'https://www.cbe.org.eg/en/auctions/egp-t-bonds-fixed-coupon', '2026-10-26', 'weekly_auction', B(0, 60), 'ok', 'Auction 26-Oct-2026, before the hike. Coupon 23.981%.'));
entries.find(y => y.id === 'tbond_3y').verifiedAt = '2026-10-31';
Object.assign(entries.find(y => y.id === 'tbond_yields_by_tenor'), { notes: 'Other tenors not read. See tbond_3y.' });
Object.assign(entries.find(y => y.id === 'mpc_calendar_2026'), { notes: '29-Oct confirmed by the CBE press release. Other dates from Zawya/Reuters: the CBE schedule table loads by script and could not be read. February and December dates to be confirmed, so they are left out and cannot trigger staleness. 2027 calendar TO_VERIFY.' });
writeFileSync('data/rates.manual.json', JSON.stringify({ schemaVersion: 1, generatedAt: '2026-10-31T00:00:00Z', entries }, null, 2) + '\n');
console.log(`${entries.length} entries`);
