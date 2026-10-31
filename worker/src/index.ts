// Daily rates pipeline: adapter -> bounds validation -> KV (latest, daily snapshot, changelog).
// GET /api/rates merges auto and manual; auto wins only when its status is ok.
import { applyFetch, confirmPolicyRate, merge, type RateEntry, type RatesFile } from '../../packages/rates-registry/src/index';
import manualFile from '../../data/rates.manual.json';
import { cbeCorridorPage, cbeFx, cbeHomeStats, cbeLatestPressRelease, cbeTbills, cbeTbonds, CBE_HOME, CBE_MPC, imf, treasury, type AdapterResult, type Fetcher } from './adapters';

interface KV { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void> }
export interface Env { RATES: KV; ASSETS?: { fetch(r: Request): Promise<Response> } }

const manual = (manualFile as unknown as RatesFile).entries;
const byId = (list: RateEntry[]) => new Map(list.map(e => [e.id, e]));

export interface RunReport { ranAt: string; adapters: { adapter: string; url: string; values: number; error: string | null }[]; policy: string }

export async function runPipeline(env: Env, f: Fetcher, now: Date): Promise<RunReport> {
  const fetchedAt = now.toISOString();
  const today = fetchedAt.slice(0, 10);
  const prevAuto: RateEntry[] = JSON.parse((await env.RATES.get('latest')) ?? '[]');
  const prev = byId(prevAuto);
  const man = byId(manual);
  const base = (id: string): RateEntry => prev.get(id) ?? (man.get(id) as RateEntry);
  const out = new Map<string, RateEntry>();
  const results: AdapterResult[] = [];

  // Policy corridor: two CBE pages must agree.
  const a = await cbeCorridorPage(f, CBE_HOME, 'cbe_corridor_home');
  let prUrl: string | null = null;
  try { prUrl = await cbeLatestPressRelease(f, null); } catch { /* reported by the page adapter below */ }
  const b = await cbeCorridorPage(f, prUrl ?? CBE_MPC, 'cbe_corridor_press_release');
  results.push(a.result, b.result);
  let policy = '';
  const fields: [string, 'deposit' | 'lending' | 'main' | 'discount'][] = [['cbe_overnight_deposit', 'deposit'], ['cbe_overnight_lending', 'lending'], ['cbe_main_operation', 'main'], ['cbe_discount_rate', 'discount']];
  for (const [id, k] of fields) {
    const lastVal = base(id).value as number | null;
    const res = confirmPolicyRate(a.corridor?.[k] ?? null, b.corridor?.[k] ?? null, lastVal);
    policy = res.reason;
    out.set(id, res.accept ? applyFetch(base(id), { value: res.value, asOf: today, fetchedAt }) : applyFetch(base(id), { error: res.reason, fetchedAt }));
  }
  results.push(await cbeHomeStats(f, today), await cbeTbills(f), await cbeTbonds(f), await cbeFx(f, today), await treasury(f, now.getUTCFullYear()),
    await imf(f, 'NGDP_RPCH', 'imf_real_gdp_growth', now.getUTCFullYear(), today), await imf(f, 'PCPIPCH', 'imf_inflation_forecast', now.getUTCFullYear(), today));

  const expected: Record<string, string[]> = { cbe_home_stats: ['cpi_urban_headline_yoy', 'cpi_core_yoy', 'conia'], cbe_tbonds: ['tbond_3y'], cbe_fx: ['usdegp_cbe_official'], us_treasury: ['us_10y'], imf_NGDP_RPCH: ['imf_real_gdp_growth'], imf_PCPIPCH: ['imf_inflation_forecast'] };
  for (const r of results) {
    if (r.adapter.startsWith('cbe_corridor')) continue; // handled above by the two-page rule
    for (const v of r.values) out.set(v.id, applyFetch(base(v.id), { value: v.value, asOf: v.asOf, fetchedAt }));
    if (r.adapter === 'cbe_tbills' && r.error) for (const id of ['tbill_182d', 'tbill_364d']) out.set(id, applyFetch(base(id), { error: r.error, fetchedAt }));
    for (const id of expected[r.adapter] ?? []) if (!out.has(id)) out.set(id, applyFetch(base(id), { error: r.error ?? 'No value', fetchedAt }));
  }

  // Changelog records accepted value changes.
  const log: { id: string; old: unknown; new: unknown; at: string }[] = JSON.parse((await env.RATES.get('changelog')) ?? '[]');
  for (const e of out.values()) {
    const p = prev.get(e.id);
    if (e.status === 'ok' && p && JSON.stringify(p.value) !== JSON.stringify(e.value)) log.push({ id: e.id, old: p.value, new: e.value, at: fetchedAt });
  }
  const list = [...out.values()];
  const report: RunReport = { ranAt: fetchedAt, adapters: results.map(r => ({ adapter: r.adapter, url: r.url, values: r.values.length, error: r.error ?? null })), policy };
  await env.RATES.put('latest', JSON.stringify(list));
  await env.RATES.put(`snapshot:${today}`, JSON.stringify(list));
  await env.RATES.put('changelog', JSON.stringify(log));
  await env.RATES.put('last_run', JSON.stringify(report));
  for (const r of report.adapters) console.log(`[rates] ${r.adapter}: ${r.error ? `FAILED ${r.error}` : `${r.values} value(s)`}`);
  return report;
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' } });

export default {
  async scheduled(_e: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(runPipeline(env, (u, i) => fetch(u, i), new Date()));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/rates') {
      if (req.method !== 'GET') return json({ error: 'GET only' }, 405);
      const auto: RateEntry[] = JSON.parse((await env.RATES.get('latest')) ?? '[]');
      const lastRun = JSON.parse((await env.RATES.get('last_run')) ?? 'null');
      return json({ schemaVersion: 1, generatedAt: new Date().toISOString(), entries: merge(auto, manual), lastRun });
    }
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('Not found', { status: 404 });
  },
};
