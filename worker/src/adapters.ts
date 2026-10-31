// Source adapters. Each returns values or a logged failure; none throws to the pipeline.
// One request per page per day. CBE's firewall rejects plain clients but accepted these browser-style
// headers from the development machine on 31-Oct-2026. Cloudflare egress may be treated differently,
// so failure stays a normal path and data/rates.manual.json is the fallback.
export interface AdapterValue { id: string; value: number; asOf: string }
export interface AdapterResult { adapter: string; url: string; values: AdapterValue[]; error?: string }
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function get(f: Fetcher, url: string): Promise<string> {
  const r = await f(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (/Request Rejected|Access Denied/i.test(text.slice(0, 500))) throw new Error('Blocked by the site firewall');
  return text;
}

const stripTags = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const pctAfter = (text: string, label: RegExp): number | null => {
  const m = text.match(new RegExp(`${label.source}[^0-9]{0,40}(\\d{1,2}(?:\\.\\d{1,3})?)\\s*%`, 'i'));
  return m ? Number(m[1]) : null;
};

export const CBE_HOME = 'https://www.cbe.org.eg/en/';
export const CBE_MPC = 'https://www.cbe.org.eg/en/monetary-policy';
export const CBE_TBILL = 'https://www.cbe.org.eg/en/auctions/egp-t-bills';
export const CBE_TBOND = 'https://www.cbe.org.eg/en/auctions/egp-t-bonds-fixed-coupon';
export const CBE_FX = 'https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates';
export const TREASURY = (year: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
export const IMF = (ind: string) => `https://www.imf.org/external/datamapper/api/v1/${ind}/EGY`;

/** Policy corridor read from one page. The pipeline accepts a change only when two pages agree. */
export function parseCorridor(html: string): { deposit: number | null; lending: number | null; main: number | null; discount: number | null } {
  const t = stripTags(html);
  // Press releases state the three rates in one sentence.
  const pr = t.match(/overnight deposit rate, overnight lending rate,? and the rate of the main operation[^0-9]{0,40}(\d{1,2}(?:\.\d+)?) percent, (\d{1,2}(?:\.\d+)?) percent,? and (\d{1,2}(?:\.\d+)?) percent/i);
  if (pr) {
    const disc = t.match(/discount rate[^0-9]{0,40}(\d{1,2}(?:\.\d+)?) percent/i);
    return { deposit: Number(pr[1]), lending: Number(pr[2]), main: Number(pr[3]), discount: disc ? Number(disc[1]) : null };
  }
  return { deposit: pctAfter(t, /overnight deposit(?: rate)?/), lending: pctAfter(t, /overnight lending(?: rate)?/), main: pctAfter(t, /main operation(?: rate)?/), discount: pctAfter(t, /discount rate/) };
}

export async function cbeCorridorPage(f: Fetcher, url: string, adapter: string): Promise<{ result: AdapterResult; corridor: ReturnType<typeof parseCorridor> | null }> {
  try {
    const html = await get(f, url);
    const corridor = parseCorridor(html);
    if (corridor.deposit === null) return { result: { adapter, url, values: [], error: 'Page read, corridor not found' }, corridor: null };
    return { result: { adapter, url, values: [{ id: 'cbe_overnight_deposit', value: corridor.deposit, asOf: '' }] }, corridor };
  } catch (e) {
    return { result: { adapter, url, values: [], error: (e as Error).message }, corridor: null };
  }
}

export async function fetchText(f: Fetcher, url: string): Promise<string> { return get(f, url); }

export async function cbeHomeStats(f: Fetcher, today: string): Promise<AdapterResult> {
  try {
    const t = stripTags(await get(f, CBE_HOME));
    const values: AdapterValue[] = [];
    const cpi = pctAfter(t, /headline (?:inflation|cpi)/); if (cpi !== null) values.push({ id: 'cpi_urban_headline_yoy', value: cpi, asOf: today });
    const core = pctAfter(t, /core (?:inflation|cpi)/); if (core !== null) values.push({ id: 'cpi_core_yoy', value: core, asOf: today });
    const conia = pctAfter(t, /conia/); if (conia !== null) values.push({ id: 'conia', value: conia, asOf: today });
    return { adapter: 'cbe_home_stats', url: CBE_HOME, values, error: values.length ? undefined : 'Page read, statistics not found' };
  } catch (e) { return { adapter: 'cbe_home_stats', url: CBE_HOME, values: [], error: (e as Error).message }; }
}

/** Results table: tenors in one row, accepted weighted average yields later. Lists the latest auction only. */
export function parseTbills(html: string): AdapterValue[] {
  const t = stripTags(html);
  const r = t.slice(t.search(/Results EGP Treasury Bill Auction/));
  const tenors = r.match(/Tenor \(days\)((?: \d{2,3})+)/)?.[1].trim().split(' ') ?? [];
  const dates = r.match(/Auction Date((?: \d{2}\/\d{2}\/\d{4})+)/)?.[1].trim().split(' ') ?? [];
  const acc = r.slice(r.search(/Accepted Bids/));
  const ylds = acc.match(/Weighted Avg\. Yield \(%\)((?: \d{1,2}(?:\.\d+)?)+)/)?.[1].trim().split(' ') ?? [];
  const iso = (d: string) => d.split('/').reverse().join('-');
  return tenors.flatMap((days, i) => (ylds[i] && dates[i] ? [{ id: `tbill_${days}d`, value: Number(ylds[i]), asOf: iso(dates[i]) }] : []));
}

export async function cbeTbills(f: Fetcher): Promise<AdapterResult> {
  try {
    const values = parseTbills(await get(f, CBE_TBILL));
    return { adapter: 'cbe_tbills', url: CBE_TBILL, values, error: values.length ? undefined : 'Page read, yields not found' };
  } catch (e) { return { adapter: 'cbe_tbills', url: CBE_TBILL, values: [], error: (e as Error).message }; }
}

export function parseTbond3y(html: string): AdapterValue | null {
  const t = stripTags(html);
  const r = t.slice(t.search(/Results EGP Treasury Fixed Coupon/));
  const tenor = r.match(/Tenor \(Years\) (\d+)/)?.[1];
  const date = r.match(/Auction Date (\d{2}\/\d{2}\/\d{4})/)?.[1];
  const y = r.slice(r.search(/Accepted Bids/)).match(/Weighted Avg\. Yield \(%\) (\d{1,2}(?:\.\d+)?)/)?.[1];
  return tenor === '3' && date && y ? { id: 'tbond_3y', value: Number(y), asOf: date.split('/').reverse().join('-') } : null;
}

export async function cbeTbonds(f: Fetcher): Promise<AdapterResult> {
  try {
    const v = parseTbond3y(await get(f, CBE_TBOND));
    return { adapter: 'cbe_tbonds', url: CBE_TBOND, values: v ? [v] : [], error: v ? undefined : 'Page read; latest auction is not the 3-year tenor' };
  } catch (e) { return { adapter: 'cbe_tbonds', url: CBE_TBOND, values: [], error: (e as Error).message }; }
}

export async function cbeFx(f: Fetcher, today: string): Promise<AdapterResult> {
  try {
    const t = stripTags(await get(f, CBE_FX));
    const m = t.match(/US Dollar[^0-9]{0,40}(\d{2}\.\d{2,4})[^0-9]{0,20}(\d{2}\.\d{2,4})/i);
    const dm = t.match(/Average Market Rate in EGP (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const asOf = dm ? `${dm[3]}-${String(MON.indexOf(dm[2]) + 1).padStart(2, '0')}-${dm[1].padStart(2, '0')}` : today;
    if (!m) return { adapter: 'cbe_fx', url: CBE_FX, values: [], error: 'Page read, USD row not found' };
    return { adapter: 'cbe_fx', url: CBE_FX, values: [{ id: 'usdegp_cbe_official', value: (Number(m[1]) + Number(m[2])) / 2, asOf }] };
  } catch (e) { return { adapter: 'cbe_fx', url: CBE_FX, values: [], error: (e as Error).message }; }
}

/** Daily par yield curve, 10-year column. Not the avg_interest_rates endpoint. */
export function parseTreasuryCsv(csv: string): AdapterValue | null {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0]?.split(',').map(s => s.replace(/"/g, '').trim()) ?? [];
  const col = head.indexOf('10 Yr');
  if (col < 0 || lines.length < 2) return null;
  const row = lines[1].split(',');
  const [m, d, y] = row[0].split('/');
  const value = Number(row[col]);
  return Number.isFinite(value) ? { id: 'us_10y', value, asOf: `${y}-${m}-${d}` } : null;
}

export async function treasury(f: Fetcher, year: number): Promise<AdapterResult> {
  const url = TREASURY(year);
  try {
    const v = parseTreasuryCsv(await get(f, url));
    return v ? { adapter: 'us_treasury', url, values: [v] } : { adapter: 'us_treasury', url, values: [], error: '10 Yr column not found' };
  } catch (e) { return { adapter: 'us_treasury', url, values: [], error: (e as Error).message }; }
}

export async function imf(f: Fetcher, indicator: string, id: string, year: number, today: string): Promise<AdapterResult> {
  const url = IMF(indicator);
  try {
    const j = JSON.parse(await get(f, url));
    const v = j?.values?.[indicator]?.EGY?.[String(year)];
    if (typeof v !== 'number') return { adapter: `imf_${indicator}`, url, values: [], error: 'EGY value not in the response' };
    return { adapter: `imf_${indicator}`, url, values: [{ id, value: v, asOf: today }] };
  } catch (e) { return { adapter: `imf_${indicator}`, url, values: [], error: (e as Error).message }; }
}

/** The latest MPC press release is linked from the homepage. It is the second page for the two-page rule. */
export async function cbeLatestPressRelease(f: Fetcher, homeHtml: string | null): Promise<string | null> {
  const html = homeHtml ?? (await get(f, CBE_HOME));
  const m = html.match(/href="(\/en\/news-publications\/news\/[^"]*mpc-press-release[^"]*)"/i);
  return m ? `https://www.cbe.org.eg${m[1]}` : null;
}
