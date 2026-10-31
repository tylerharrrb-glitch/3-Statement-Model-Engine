// Part 3 gate: run the Worker locally with wrangler dev --test-scheduled, trigger the cron, read /api/rates.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Gate, readJson } from './lib/load';
import { applyFetch, computeStaleness, confirmPolicyRate, diffSnapshot, effectiveStatus, freezeSnapshot, provenanceLabel, type RateEntry } from '../packages/rates-registry/src/index';
import { parseCorridor, parseTbills, parseTreasuryCsv } from '../worker/src/adapters';
import { runPipeline } from '../worker/src/index';

const g = new Gate('part3');
const PORT = 8799;
const today = '2026-10-31';
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const manual = readJson('data/rates.manual.json').entries as RateEntry[];
  const cal = (manual.find(e => e.id === 'mpc_calendar_2026')!.value as string[]);

  // Offline pipeline tests with a fake fetcher.
  const store = new Map<string, string>();
  const env = { RATES: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v); } } };
  const page = (dep: number) => `<p>Overnight Deposit Rate 20.00% ${dep}</p>`.replace('20.00%', `${dep.toFixed(2)}%`) + '<p>Overnight Lending Rate 21.00%</p><p>Main Operation 20.50%</p><p>Discount Rate 20.50%</p>';
  const fake = (home: string, mpc: string) => async (u: string) => {
    if (u.endsWith('/en/')) return new Response(`${home}<a href="/en/news-publications/news/x/mpc-press-release-x">x</a>`);
    if (u.includes('mpc-press-release')) return new Response(mpc);
    if (u.includes('treasury')) return new Response('Date,"10 Yr"\n10/30/2026,99.9\n');
    return new Response('blocked', { status: 403 });
  };
  await runPipeline(env, fake(page(20), page(20)) as never, new Date('2026-10-31T06:00:00Z'));
  let latest = JSON.parse(store.get('latest') as string) as RateEntry[];
  const dep = latest.find(e => e.id === 'cbe_overnight_deposit')!;
  g.check('Policy rate accepted when two CBE pages agree', dep.value === 20 && dep.method === 'auto' && dep.status === 'ok');
  g.check('Bounds rejection: 99.9 on the US 10-year is rejected and the last value kept', latest.find(e => e.id === 'us_10y')!.status === 'fetch_failed' && latest.find(e => e.id === 'us_10y')!.value !== 99.9);
  await runPipeline(env, fake(page(25), page(20)) as never, new Date('2026-11-01T06:00:00Z'));
  latest = JSON.parse(store.get('latest') as string);
  const dep2 = latest.find(e => e.id === 'cbe_overnight_deposit')!;
  g.check('Policy rate change rejected when CBE pages disagree; last good kept', dep2.value === 20 && dep2.status === 'fetch_failed');
  g.check('KV holds latest, daily snapshots, changelog', ['latest', 'snapshot:2026-10-31', 'snapshot:2026-11-01', 'changelog'].every(k => store.has(k)));
  g.check('Corridor parser reads labelled percentages', parseCorridor(page(20)).lending === 21);
  g.check('Corridor parser reads the press release sentence', parseCorridor('the overnight deposit rate, overnight lending rate, and the rate of the main operation were raised to 20.0 percent, 21.0 percent, and 20.5 percent, respectively. The discount rate was also raised to 20.5 percent.').discount === 20.5);
  g.check('T-bill parser takes accepted bids', parseTbills('Results EGP Treasury Bill Auction Tenor (days) 364 182 Auction Date 29/10/2026 29/10/2026 Submitted Bids Weighted Avg. Yield (%) 26.453 25.675 Accepted Bids Weighted Avg. Yield (%) 26.076 25.457 View')[0].value === 26.076);
  g.check('Treasury parser takes the 10 Yr column of the par yield curve', parseTreasuryCsv('Date,"1 Mo","10 Yr"\n10/30/2026,4.06,4.94\n')?.value === 4.94);

  const mpcItem = manual.find(e => e.id === 'cbe_overnight_deposit')!;
  const verified = { ...mpcItem, status: 'ok' as const, verifiedAt: '2026-09-25' };
  g.check('Staleness: MPC item is stale the day after the 29-Oct meeting', computeStaleness(verified, { today: '2026-10-30', mpcCalendar: cal }).stale);
  g.check('Staleness: MPC item is not stale on the meeting day', !computeStaleness(verified, { today: '2026-10-29', mpcCalendar: cal }).stale);
  g.check('Staleness: the shipped corridor, verified 31-Oct-2026, is fresh', !computeStaleness(mpcItem, { today: '2026-10-31', mpcCalendar: cal }).stale);
  g.check('Staleness: re-verified item is fresh', !computeStaleness({ ...verified, verifiedAt: '2026-10-30' }, { today: '2026-10-31', mpcCalendar: cal }).stale);
  g.check('A failed value keeps its value', applyFetch(verified, { error: 'x', fetchedAt: 't' }).value === verified.value);
  const snap = freezeSnapshot(manual, '2026-10-31T00:00:00Z');
  g.check('Snapshot freeze: hash stable', freezeSnapshot(manual, 'later').hash === snap.hash);
  const changed = manual.map(e => (e.id === 'cbe_overnight_lending' ? { ...e, value: 22 } : e));
  const diff = diffSnapshot(snap, changed);
  g.check('Diff table lists id, old, new, source', diff.length === 1 && diff[0].id === 'cbe_overnight_lending' && diff[0].old === 21 && diff[0].new === 22 && !!diff[0].source);
  g.check('Manual value never labelled auto or live', manual.every(e => !/live|auto/.test(provenanceLabel(e))));
  g.check('Two-page rule helper', !confirmPolicyRate(21, null, 20).accept);

  // Real Worker, real network, local KV.
  if (!existsSync('out/index.html')) { mkdirSync('out', { recursive: true }); writeFileSync('out/index.html', '<!doctype html><title>placeholder</title>'); }
  const bin = path.resolve('node_modules/wrangler/bin/wrangler.js');
  const child = spawn(process.execPath, [bin, 'dev', '--test-scheduled', '--port', String(PORT), '--local'], { cwd: 'worker', stdio: 'pipe' });
  let logs = '';
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await sleep(1000); try { up = (await fetch(`http://127.0.0.1:${PORT}/api/rates`)).ok; } catch { /* waiting */ } }
    g.check('Worker runs locally (wrangler dev --test-scheduled)', up);
    if (up) {
      const trigger = new Date().toISOString();
      const sch = await fetch(`http://127.0.0.1:${PORT}/__scheduled?cron=0+6+*+*+*`);
      g.check('Cron trigger fires', sch.ok, String(sch.status));
      let body: { entries: RateEntry[]; lastRun: { adapters: { adapter: string; values: number; error: string | null }[] } | null } = { entries: [], lastRun: null };
      for (let i = 0; i < 90; i++) { await sleep(1500); body = await (await fetch(`http://127.0.0.1:${PORT}/api/rates`)).json(); if (body.lastRun && (body.lastRun as unknown as { ranAt: string }).ranAt >= trigger) break; }
      g.check('Pipeline run recorded for this trigger', !!body.lastRun && (body.lastRun as unknown as { ranAt: string }).ranAt >= trigger);
      for (const a of body.lastRun?.adapters ?? []) {
        g.check(`Adapter ${a.adapter} returns a value or a logged failure`, a.values > 0 || !!a.error, a.error ? `failure: ${a.error}` : `${a.values} value(s)`);
      }
      g.check('US Treasury adapter returned a live value', (body.lastRun?.adapters ?? []).some(a => a.adapter === 'us_treasury' && a.values > 0));
      const u10 = body.entries.find(e => e.id === 'us_10y');
      g.check('/api/rates: auto value wins when ok', u10?.method === 'auto' && typeof u10.value === 'number', JSON.stringify(u10?.value));
      const dp = body.entries.find(e => e.id === 'imf_real_gdp_growth');
      g.check('/api/rates: manual stays when the auto source failed, and is not relabelled', dp?.method === 'manual' && /fetch_failed/.test(dp?.notes ?? ''));
      g.note('');
      g.note('REGISTRY TABLE (from /api/rates; today = 31-Oct-2026)');
      g.note(`${'id'.padEnd(34)}${'value'.padEnd(28)}${'as of'.padEnd(12)}${'method'.padEnd(8)}${'status'.padEnd(13)}label`);
      for (const e of body.entries) {
        const st = effectiveStatus(e, { today, mpcCalendar: cal });
        g.note(`${e.id.padEnd(34)}${String(Array.isArray(e.value) ? e.value.join('/') : e.value).slice(0, 26).padEnd(28)}${String(e.asOf).padEnd(12)}${e.method.padEnd(8)}${st.padEnd(13)}${provenanceLabel(e)}`);
      }
      g.note('29-Oct-2026 MPC change: 19.00 / 20.00 / 19.50 to 20.00 / 21.00 / 20.50, discount 20.50. Confirmed at CBE (press release and homepage) on 31-Oct-2026.');
      for (const e of body.entries) if (e.status === 'unconfirmed') g.note(`unconfirmed: ${e.id}`);
    }
  } finally {
    child.kill();
  }
  g.note(logs.split('\n').filter(l => l.includes('[rates]')).join('\n'));
  g.done();
}
main();
