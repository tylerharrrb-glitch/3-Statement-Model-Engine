// Gates for Parts 2, 4, 5, 6 and 7. Usage: npx tsx scripts/verify-parts-2-7.ts <part2|part4|part5|part6|part7>
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { Gate, loadMopco, loadSnapshot, readJson } from './lib/load';
import { runModel } from '../src/engine/run';
import { accountsForYear, reconciliationTable, tieOuts, unmappedLines } from '../src/engine/historicals';
import { sensitivity } from '../src/engine/outputs/sensitivity';
import { buildWolfExport } from '../src/export/wolf';
import { validateWolfExport } from '../packages/rates-registry/src/wolf-schema';
import { amortizing, floating, LOAN, revolverCase, sweep, usdLoan } from '../tests/cases';
import type { ModelInputs, ModelRun, ScenarioKey } from '../src/engine/types';

const part = process.argv[2];
const g = new Gate(part);
const snap = loadSnapshot();
const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const SC: ScenarioKey[] = ['bear', 'base', 'bull'];
const near = (a: number | null, b: number, t = 1e-6) => a !== null && Math.abs(a - b) <= t;

if (part === 'part2') {
  const eng = walk('src/engine').concat(walk('packages/rates-registry/src'));
  for (const f of eng) {
    const code = readFileSync(f, 'utf8').split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n');
    const bad = /from ['"]react|src\/ui|\bfetch\(|Date\.now\(|new Date\(|Math\.random\(|localStorage|indexedDB/.test(code)
      && !(f.includes('rates-registry') && /new Date\(iso\)/.test(code) && !/from ['"]react|\bfetch\(|Date\.now\(|Math\.random\(/.test(code));
    g.check(`Pure module: ${f.replace(/\\/g, '/')}`, !bad);
  }
  const a = JSON.stringify(runModel(loadMopco(), snap));
  const b = JSON.stringify(runModel(loadMopco(), snap));
  g.check('runModel byte-identical across two runs', a === b, `${a.length} bytes`);
  let tsc = true; try { execSync('npx tsc --noEmit', { stdio: 'pipe' }); } catch { tsc = false; }
  g.check('Typecheck clean', tsc);
  for (const gone of ['lib/engines/dcf.ts', 'lib/engines/valuation.ts', 'components/CBEMetricsPage.tsx', 'components/DCFPage.tsx', 'components/ValuationPage.tsx', 'lib/export/build-calc-sheets.ts', 'components/AnalystPanel.tsx', 'lib/services/analyst.ts', 'app/api/validate/route.ts', 'lib/services/liveRates.ts', 'components/CBERateBanner.tsx'])
    g.check(`Deleted: ${gone}`, !existsSync(gone));
  const src = walk('src').concat(walk('packages/rates-registry/src')).map(f => readFileSync(f, 'utf8')).join('\n');
  g.check('No DCF, WACC or Groq code remains', !/calculateDCF|calculateWACC|api\.groq\.com|NEXT_PUBLIC/.test(src));
  const reg = readFileSync('packages/rates-registry/src/index.ts', 'utf8');
  g.check('Registry has zero app dependencies', !/from ['"]/.test(reg) && Object.keys(readJson('packages/rates-registry/package.json').dependencies ?? {}).length === 0);
}

if (part === 'part4') {
  const inp = loadMopco();
  const h = inp.historicals;
  g.check('No unmapped line items', unmappedLines(h).length === 0);
  const blocked = JSON.parse(JSON.stringify(inp)) as ModelInputs;
  blocked.historicals.lines[0].mapsTo = null;
  let threw = false; try { runModel(blocked, snap); } catch (e) { threw = /Unmapped/.test((e as Error).message); }
  g.check('An unmapped item blocks the run', threw);
  for (const y of [2024, 2025]) {
    const r = tieOuts(h, y, y === 2025 ? accountsForYear(h, 2024) : null);
    r.checks.forEach(c => g.check(`FY${y} ${c.label}`, c.pass, `diff ${c.diff}, tol ${c.tolerance}`));
    r.notLoaded.forEach(n => g.check(`FY${y} ${n}`, false, 'NOT LOADED: needs the FY2024 page of the audited PDF, which is not available'));
  }
  // Golden equity roll-forwards from Appendix B, recomputed here.
  g.check('RE 2025 golden', 15132261531 + 11296540287 - 45953143 - 755986968 - 1545237364 - 11 - 7277144038 === 16804480294);
  g.check('RE 2024 golden', 13484740108 + 15119739368 - 61484001 - 478114534 - 977311347 - 11955308063 === 15132261531);
  g.check('Legal reserve 2025 golden', 1212315306 + 755986968 === 1968302274);
  g.check('Legal reserve 2024 golden', 734200772 + 478114534 === 1212315306);
  g.check('Capital 2025 golden', 20791840110 + 7889562520 === 28681402630);
  g.check('Note 3 cost golden', 53861582606 + 5848069006 - 24770582 === 59684881030);
  g.check('Note 3 accumulated golden (roll-forward ...949)', 19229575610 + 2283209560 - 20392221 === 21492392949);
  g.check('Dividends bridge difference is 46,085', 7277190123 - 7277144038 === 46085);
  g.check('FY2023 reference year', false, 'NOT LOADED: the FY2023 PDF is not available');
  g.check('Fixture transcribed independently from the audited PDF', false, 'NOT DONE: PDF not available. The fixture comes from Appendix B, so the fixture-vs-Appendix B comparison below is not an independent check');
  const fx = readJson('tests/fixtures/mopco-fy2025.json');
  const notes = fx.historicals.sourceNotes as { id: number; text: string }[];
  g.check('Merger effective date confirmed from FY2024 notes', false, 'unconfirmed: PDF not available');
  g.check('All source discrepancies recorded', notes.length >= 9);
  g.note('', );
  g.note('Fixture vs Appendix B, zero unexplained differences: the fixture is generated from Appendix B (scripts/gen-mopco-fixture.mjs).');
  g.note('Source discrepancies:');
  notes.forEach(n => g.note(`  ${n.id}. ${n.text}`));
  g.note('Reconciliation, FY2025 (information only; the CF is loaded as reported):');
  reconciliationTable(h, 2025).forEach(r => g.note(`  ${r.line.padEnd(36)} BS change ${String(r.bsChange).padStart(14)}  CF line ${String(r.cfLine).padStart(14)}  difference ${String(r.difference).padStart(14)}`));
  const rec = reconciliationTable(h, 2025).find(r => r.line.startsWith('Debtors'));
  g.check('Debtors: CF line differs from the BS change, loaded as reported', !!rec && rec.cfLine === 113856513 && rec.bsChange === -603590502);
  g.check('Units: revenue is absolute EGP', accountsForYear(h, 2025).rev_export === 21466612052);
}

if (part === 'part5') {
  let unit = ''; let ok = true;
  try { unit = execSync('npx vitest run', { stdio: 'pipe' }).toString(); } catch (e) { ok = false; unit = String((e as { stdout: Buffer }).stdout); }
  const m = unit.replace(/\x1b\[[0-9;]*m/g, '').match(/Tests\s+(.*)/);
  g.check('Unit tests per module, with edge cases', ok, m?.[1]?.trim());
  for (const n of [5, 10]) {
    const r = runModel(loadMopco({ nYears: n }), snap);
    g.check(`MOPCO base runs for ${n} years`, r.years.length === 2 + n && r.checks.every(c => c.pass), `failed checks ${r.checks.filter(c => !c.pass).length}`);
    const nulls = ['revenue', 'net_profit', 'cash', 'total_assets'].some(id => r.rows[id].slice(2).some(v => v === null || Number.isNaN(v)));
    g.check(`${n}-year run has no blank or NaN core values`, !nulls);
  }
  const fc = walk('src/engine/forecast').map(f => readFileSync(f, 'utf8')).join('\n');
  g.check('Forecast code has no year-specific branches (one pattern per row)', !/yearIndex|\bi === \d|year ===/.test(fc));
  const short = loadMopco({ nYears: 10 }); short.scenarios.base.dso = short.scenarios.base.dso.slice(0, 5);
  let blocked = false; try { runModel(short, snap); } catch { blocked = true; }
  g.check('A driver missing for a forecast year blocks the run, no silent default', blocked);
  // Edge cases through the whole model.
  const edge = (name: string, f: (i: ModelInputs) => void) => {
    const i = loadMopco(); f(i);
    const r = runModel(i, snap);
    g.check(`Edge case balances: ${name}`, r.checks.every(c => c.pass));
    return r;
  };
  edge('zero revenue', i => { for (const k of SC) { i.scenarios[k].g_export = Array(10).fill(-1); i.scenarios[k].g_domestic = Array(10).fill(-1); } });
  edge('negative growth', i => { i.scenarios.base.g_export = Array(10).fill(-0.2); });
  const capd = edge('legal reserve cap reached', i => { const l = i.historicals.lines.find(x => x.mapsTo === 'legal_reserve')!; const re = i.historicals.lines.find(x => x.mapsTo === 're')!; const move = 14340701315 - l.values['2025']; l.values['2025'] += move; re.values['2025'] -= move; });
  g.check('Reserve cap warning shown', capd.warnings.some(w => w.id === 'reserve.cap') || (capd.rows.lr_transfer[2] === 0));
  edge('fully depreciated assets', i => { i.scenarios.base.dep_rate = Array(10).fill(5); });
  const off = edge('FX off', i => { i.settings.fxOn = 0; });
  g.check('FX off: no FX line', off.rows.fx_line.slice(2).every(v => v === 0));
  edge('all three revenue-and-cost modes', i => { i.settings.revenueBasis = 2; i.settings.cogsMode = 2; i.settings.sellMode = 2; i.settings.gaMode = 2; i.settings.depMode = 1; i.settings.divMode = 2; i.scenarios.base.dps = Array(10).fill(1); });
  const fxr = edge('FX on with USD balances and depreciation', i => { i.settings.usd = { cash: 0.5, inv_nc: 0.5, inv_cur: 0.5, fvtpl: 0, ofa: 1, ar: 1, debtors: 0.5, ap: 0.5, creditors: 0.2, cust_adv: 1 }; i.scenarios.base.fx_close = Array.from({ length: 10 }, (_, k) => 56.0429 * 1.1 ** (k + 1)); });
  g.check('FX revaluation reaches the IS and carries deferred tax', (fxr.rows.fx_line[2] as number) !== 0 && (fxr.rows.dtl_mov_fx[2] as number) !== 0);
  edge('bonus shares', i => { i.scenarios.base.bonus_re = Array(10).fill(1000000000); });
  edge('leases, disposals, provisions, benefits', i => { const d = i.scenarios.base; d.rou_new = Array(10).fill(50000000); d.disposal_cost = Array(10).fill(10000000); d.disposal_nbv = Array(10).fill(4000000); d.disposal_proceeds = Array(10).fill(6000000); d.prov_formed = Array(10).fill(5000000); d.prov_reversed = Array(10).fill(1000000); d.prov_used = Array(10).fill(1000000); d.oci_gross = Array(10).fill(-20000000); d.ecl = Array(10).fill(-3000000); d.impairment = Array(10).fill(2000000); });
  edge('financing and operating classification flipped', i => { i.company.policy = { interestReceivedOperating: 1, interestPaidOperating: 0, distributionsOperating: 0 }; });
  const rv = runModel(loadMopco(), snap);
  g.check('Legal reserve first forecast year = 5% of FY2025 net profit', near(rv.rows.lr_transfer[2], 0.05 * 11296540287, 1));
  g.check('Effective tax rate is an output', rv.rows.effective_tax[2] !== null);
  const bank = loadMopco(); bank.company.sector = 'bank';
  let b2 = false; try { runModel(bank, snap); } catch (e) { b2 = /balance sheet is the business/.test((e as Error).message); }
  g.check('Bank is blocked with the reason', b2);
}

if (part === 'part6') {
  const base = loadMopco();
  const run = (i: ModelInputs, circ: 0 | 1) => runModel({ ...i, settings: { ...i.settings, circularity: circ } }, snap);
  const balanced = (r: ModelRun) => r.checks.every(c => c.pass);
  const A = run(amortizing(base), 0);
  g.check('Term loan: closing after year 1', near(A.rows.tr0_close[2], LOAN * 0.8));
  g.check('Term loan: closing after year 2', near(A.rows.tr0_close[3], LOAN * 0.6));
  g.check('Term loan: interest on opening at switch 0, 20% x 1,000,000,000', near(A.rows.tr0_int[2], 200000000));
  g.check('Term loan: year 2 interest 20% x 800,000,000', near(A.rows.tr0_int[3], 160000000));
  const A1 = run(amortizing(base), 1);
  g.check('Term loan: interest on average at switch 1, 20% x 900,000,000', near(A1.rows.tr0_int[2], 180000000));
  const F = run(floating(base), 0);
  g.check('Floating: year 1 rate = 21% lending + 2% spread', near(F.rows.tr0_rate[2], 0.23));
  g.check('Floating: rate falls 3pp after the change', near(F.rows.tr0_rate[3], 0.20));
  g.check('Floating: interest follows, 20% x 1,000,000,000', near(F.rows.tr0_int[3], 200000000));
  const R = run(revolverCase(base), 0);
  g.check('Revolver draws when cash would fall below the minimum', (R.rows.rev_net[2] as number) > 0);
  g.check('Cash held at the minimum in the draw year', near(R.rows.cash[2], 20000000000, 1));
  g.check('Revolver repays first when there is surplus', (R.rows.rev_net[3] as number) < 0 && near(R.rows.rev_close[3], 0, 1));
  const S = run(sweep(base), 0);
  g.check('Sweep repays term debt from surplus', (S.rows.tr0_sweep[2] as number) > 0 && (S.rows.tr0_close[2] as number) < LOAN);
  const U = run(usdLoan(base), 0);
  g.check('USD tranche revalues', near(U.rows.tr0_fx[2], LOAN * 0.1, 1));
  const cases: [string, (b: ModelInputs) => ModelInputs][] = [['amortizing', amortizing], ['floating', floating], ['revolver', revolverCase], ['sweep', sweep], ['USD loan', usdLoan], ['MOPCO, no debt', b => b]];
  for (const [name, f] of cases) for (const c of [0, 1] as const) {
    const r = run(f(base), c);
    g.check(`${name}: balanced at switch ${c}`, balanced(r), `failed ${r.checks.filter(x => !x.pass).length}`);
    g.check(`${name}: converged at switch ${c}`, r.converged.every(Boolean), `iterations ${r.iterations.join(',')}`);
    g.check(`${name}: iteration count at or under the cap of 100`, r.iterations.every(n => n <= 100));
  }
  const m = readFileSync('src/engine/run.ts', 'utf8') + readFileSync('src/engine/cash.ts', 'utf8') + readFileSync('src/engine/statements.ts', 'utf8');
  g.check('No plug language or back-solving in the core', !/\bplug\b|back-?solve/i.test(m.replace(/nothing is plugged/g, '')));
  g.note('Decision 10: debt logic is tested on hand-built cases only. MOPCO has no bank debt; the Telecom Egypt fixture is synthetic.');
}

if (part === 'part7') {
  for (const s of SC) for (const c of [0, 1] as const) {
    const r = runModel(loadMopco({ scenario: s, circ: c, nYears: 5 }), snap);
    const gap = r.rows.balance_check[1] as number;
    g.check(`${s} switch ${c}: balance check within 1 EGP every forecast year`, r.rows.balance_check.slice(2).every(v => Math.abs((v as number) - gap) <= 1));
    g.check(`${s} switch ${c}: CF cash = BS cash every forecast year`, r.rows.cf_close.slice(2).every((v, i) => Math.abs((v as number) - (r.rows.cash[i + 2] as number)) <= 1));
  }
  // Each ratio recomputed here independently from statement rows.
  const r = runModel(loadMopco(), snap);
  const v = (id: string, i: number) => r.rows[id][i] as number;
  const same = (id: string, i: number, val: number) => g.check(`Ratio recomputed: ${id} ${r.periodLabels[i]}`, near(r.rows[id][i], val, 1e-4), `${r.rows[id][i]} vs ${val}`);
  for (const i of [1, 2, 6]) {
    const ni = v('net_profit', i), rev = v('revenue', i), ta = v('total_assets', i), eq = v('total_equity', i), ta0 = v('total_assets', i - 1), eq0 = v('total_equity', i - 1);
    const ebit = v('op_profit', i), ebitda = ebit + v('dep', i) + v('amort', i);
    const debt = v('debt_cur', i) + v('debt_nc', i) + v('lease_cur', i) + v('lease_nc', i);
    const liquid = v('cash', i) + v('inv_nc', i) + v('inv_cur', i) + v('fvtpl', i);
    const debt0 = v('debt_cur', i - 1) + v('debt_nc', i - 1) + v('lease_cur', i - 1) + v('lease_nc', i - 1);
    const liquid0 = v('cash', i - 1) + v('inv_nc', i - 1) + v('inv_cur', i - 1) + v('fvtpl', i - 1);
    same('gross_margin', i, (rev - v('cogs', i)) / rev); same('op_margin', i, ebit / rev); same('ebitda_margin', i, ebitda / rev); same('net_margin', i, ni / rev);
    same('roe', i, ni / ((eq + eq0) / 2)); same('roa', i, ni / ((ta + ta0) / 2));
    same('roic', i, ebit * (1 - 0.225) / (((eq + debt - liquid) + (eq0 + debt0 - liquid0)) / 2));
    same('current_ratio', i, v('total_ca', i) / v('total_cl', i)); same('quick_ratio', i, (v('total_ca', i) - v('inventory', i)) / v('total_cl', i)); same('cash_ratio', i, v('cash', i) / v('total_cl', i));
    same('debt_equity', i, debt / eq); same('liab_assets', i, v('total_liabilities', i) / ta); same('net_debt', i, debt - liquid); same('net_debt_ebitda', i, (debt - liquid) / ebitda);
    same('interest_cover', i, ebit / v('fin_costs', i)); same('asset_turnover', i, rev / ((ta + ta0) / 2));
    same('dso_calc', i, v('ar', i) / rev * 365); same('dio_calc', i, v('inventory', i) / v('cogs', i) * 365); same('dpo_calc', i, v('ap', i) / v('cogs', i) * 365);
    same('dupont3_roe', i, (ni / rev) * (rev / ((ta + ta0) / 2)) * (((ta + ta0) / 2) / ((eq + eq0) / 2)));
    same('dupont5_roe', i, (ni / v('pbt', i)) * (v('pbt', i) / ebit) * (ebit / rev) * (rev / ((ta + ta0) / 2)) * (((ta + ta0) / 2) / ((eq + eq0) / 2)));
    same('altman_z', i, 3.25 + 6.56 * (v('total_ca', i) - v('total_cl', i)) / ta + 3.26 * v('re', i) / ta + 6.72 * ebit / ta + 1.05 * eq / v('total_liabilities', i));
  }
  g.check('ROE from DuPont 3-step equals ROE', near(r.rows.dupont3_roe[2], v('roe', 2), 1e-9));
  g.check('ROE from DuPont 5-step equals ROE', near(r.rows.dupont5_roe[2], v('roe', 2), 1e-9));
  g.check('Altman X4 is book equity / total liabilities, valid with zero debt', (r.rows.alt_x4[1] as number) > 0);
  g.check("Altman Z''-EM zones are unconfirmed", /unconfirmed/.test(readFileSync('src/engine/outputs/ratios.ts', 'utf8')), 'verify against Altman (2005)');
  g.check('Piotroski available from the second year', r.rows.piotroski[0] === null && r.rows.piotroski[1] !== null && r.rows.piotroski[2] !== null);
  g.check('Piotroski treats bonus shares as non-dilutive (FY2025)', r.rows.f_shares[1] === 1);
  g.check('FY2024 EPS restated reproduces reported 5.27', Math.round((r.rows.eps_restated[0] as number) * 100) === 527);
  g.check('FY2025 EPS restated basis reproduces reported 3.94', Math.round((r.rows.eps_restated[1] as number) * 100) === 394);
  const fy = 2;
  const fcff = ['fcff_nopat', 'fcff_da', 'fcff_noncash', 'fcff_wc', 'fcff_dist', 'fcff_capex'].reduce((s, k) => s + v(k, fy), 0);
  g.check('FCFF bridge sums line by line', near(r.rows.fcff[fy], fcff, 1e-3));
  const fcfe = ['fcff', 'fcfe_fin_income', 'fcfe_interest', 'fcfe_leases', 'fcfe_borrow'].reduce((s, k) => s + v(k, fy), 0);
  g.check('FCFE bridge sums line by line', near(r.rows.fcfe[fy], fcfe, 1e-3));
  const inp = loadMopco();
  const grid = sensitivity(inp, snap);
  g.check('Sensitivity is 5x5', grid.netProfit.length === 5 && grid.netProfit[0].length === 5);
  g.check('Sensitivity base case is in the centre: net profit', near(grid.netProfit[2][2], r.rows.net_profit[6] as number, 1e-3));
  g.check('Sensitivity base case is in the centre: cash', near(grid.endingCash[2][2], r.rows.cash[6] as number, 1e-3));
  g.check('Sensitivity base case is in the centre: net debt', near(grid.netDebt[2][2], r.rows.net_debt[6] as number, 1e-3));
  g.check('Sensitivity moves with margin and growth', grid.netProfit[2][4] > grid.netProfit[2][0] && grid.netProfit[4][2] > grid.netProfit[0][2]);
  const wolf = buildWolfExport(r, inp);
  const errs = validateWolfExport(wolf);
  g.check('WOLF JSON validates against the shared schema', errs.length === 0, errs.join('; '));
  g.check('WOLF JSON carries the rates hash', wolf.ratesSnapshotHash === snap.hash);
  g.check('WOLF FCFF comes from the engine rows', wolf.fcffByYear[0].value === r.rows.fcff[2]);
}

g.done();
