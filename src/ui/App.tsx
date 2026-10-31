// Thin views over ModelRun. No calculation here: every figure comes from the engine.
import { useEffect, useMemo, useState } from 'react';
import { computeStaleness, diffSnapshot, effectiveStatus, getRate, provenanceLabel, type RateEntry, type RatesSnapshot } from '@registry';
import { ACCOUNT_IDS, CHART_OF_ACCOUNTS, checkSector } from '../engine/coa';
import { reconciliationTable, tieOuts, accountsForYear, unmappedLines } from '../engine/historicals';
import { OUTPUT_GROUPS } from '../engine/outputs/ratios';
import { sensitivity } from '../engine/outputs/sensitivity';
import { runModel, ModelBlockedError } from '../engine/run';
import { SCENARIO_KEYS, type WolfProfile, type DriverKey, type ModelInputs, type ModelRun, type ScenarioKey, type Sector } from '../engine/types';
import { DRIVERS } from '../export/excel/catalog';
import { buildRows, type RowSpec } from '../export/excel/rows';
import { buildWolfExport } from '../export/wolf';
import { buildWolfCompany, wolfExportIssues } from '../export/wolfMap';
import methodology from '../../docs/METHODOLOGY.md?raw';
import { clearLocalData, deleteModel, download, fetchRates, freeze, listModels, mopcoInputs, saveModel, type SavedModel } from './store';
import { fmt } from './format';

const TABS = ['Company', 'Historicals', 'Drivers', 'Income statement', 'Balance sheet', 'Cash flow', 'Schedules', 'Ratios', 'Scenarios', 'Sensitivity', 'Checks', 'Rates', 'Exports', 'Saved models', 'Methodology', 'Data sources'] as const;
type Tab = typeof TABS[number];
const today = () => new Date().toISOString().slice(0, 10);

export function App() {
  const [tab, setTab] = useState<Tab>('Income statement');
  const [inputs, setInputs] = useState<ModelInputs>(mopcoInputs);
  const [latest, setLatest] = useState<RateEntry[] | null>(null);
  const [lastRun, setLastRun] = useState<Awaited<ReturnType<typeof fetchRates>>['lastRun']>(null);
  const [source, setSource] = useState<'api' | 'bundled'>('bundled');
  const [snapshot, setSnapshot] = useState<RatesSnapshot | null>(null);
  const [audit, setAudit] = useState<{ id: string; i: number } | null>(null);

  useEffect(() => {
    fetchRates().then(r => { setLatest(r.entries); setLastRun(r.lastRun); setSource(r.source); setSnapshot(s => s ?? freeze(r.entries)); });
  }, []);

  const { run, error } = useMemo(() => {
    if (!snapshot) return { run: null, error: null };
    try { return { run: runModel(inputs, snapshot), error: null }; }
    catch (e) { if (e instanceof ModelBlockedError) return { run: null, error: e.message }; throw e; }
  }, [inputs, snapshot]);
  const specs = useMemo(() => buildRows(inputs), [inputs]);
  const specOf = useMemo(() => new Map(specs.map(s => [s.id, s])), [specs]);
  const update = (f: (c: ModelInputs) => void) => setInputs(prev => { const c: ModelInputs = JSON.parse(JSON.stringify(prev)); f(c); return c; });
  const fails = run ? run.checks.filter(c => !c.pass).length : 0;

  const props = { inputs, run, specs, specOf, update, snapshot, latest, lastRun, source, setSnapshot, setInputs, onCell: (id: string, i: number) => setAudit({ id, i }) };
  return (
    <div className="flex min-h-screen">
      <nav className="w-48 shrink-0 border-r" style={{ borderColor: 'var(--line)' }}>
        <div className="p-3"><div className="font-semibold">3-Statement Model</div><div style={{ color: 'var(--muted)' }}>{inputs.company.name.split(' (')[0]}</div></div>
        {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </nav>
      <main className="flex-1 p-5 overflow-x-auto min-w-0">
        <div className="mb-3 flex gap-4 items-center flex-wrap">
          <label>Scenario{' '}
            <select aria-label="Scenario" value={inputs.activeScenario} onChange={e => update(c => { c.activeScenario = e.target.value as ScenarioKey; })}>
              {SCENARIO_KEYS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label>Circularity{' '}
            <select aria-label="Circularity" value={inputs.settings.circularity} onChange={e => update(c => { c.settings.circularity = Number(e.target.value) as 0 | 1; })}>
              <option value={0}>0: opening balances</option><option value={1}>1: average balances</option>
            </select>
          </label>
          <label>Forecast years{' '}
            <select aria-label="Forecast years" value={inputs.nYears} onChange={e => update(c => { c.nYears = Number(e.target.value); })}>
              {[5, 6, 7, 8, 9, 10].map(n => <option key={n}>{n}</option>)}
            </select>
          </label>
          {run && <span className={fails ? 'fail' : 'pass'}>{fails ? `FAIL: ${fails} checks` : 'PASS: all checks'}</span>}
          {run && <span style={{ color: 'var(--muted)' }}>iterations per year: {run.iterations.join(', ')}</span>}
        </div>
        {error && <div className="fail mb-3" role="alert">{error}</div>}
        {run && run.warnings.length > 0 && !['Rates', 'Methodology', 'Data sources'].includes(tab) && (
          <details className="warn mb-3"><summary>{run.warnings.length} warnings</summary>
            <ul>{dedupe(run.warnings).map(w => <li key={w}>{w}</li>)}</ul>
          </details>
        )}
        {tab === 'Company' && <CompanyPage {...props} />}
        {tab === 'Historicals' && <HistoricalsPage {...props} />}
        {tab === 'Drivers' && <DriversPage {...props} />}
        {tab === 'Income statement' && <Statement title="Income statement" section="Income statement" {...props} />}
        {tab === 'Balance sheet' && <Statement title="Balance sheet" section="Balance sheet" {...props} />}
        {tab === 'Cash flow' && <Statement title="Cash flow statement" section="Cash flow statement (indirect, EAS 4)" sub="Historical years are as reported and are never re-derived." {...props} />}
        {tab === 'Schedules' && <SchedulesPage {...props} />}
        {tab === 'Ratios' && <RatiosPage {...props} />}
        {tab === 'Scenarios' && <ScenariosPage {...props} />}
        {tab === 'Sensitivity' && <SensitivityPage {...props} />}
        {tab === 'Checks' && <ChecksPage {...props} />}
        {tab === 'Rates' && <RatesPage {...props} />}
        {tab === 'Exports' && <ExportsPage {...props} />}
        {tab === 'Saved models' && <SavedPage {...props} />}
        {tab === 'Methodology' && <Markdown text={methodology} />}
        {tab === 'Data sources' && <DataSourcesPage {...props} />}
      </main>
      {audit && run && <AuditPanel {...audit} run={run} specOf={specOf} inputs={inputs} snapshot={snapshot} onClose={() => setAudit(null)} />}
    </div>
  );
}

const dedupe = (w: { id: string; message: string; period: string }[]) => {
  const m = new Map<string, string[]>();
  w.forEach(x => m.set(x.message, [...(m.get(x.message) ?? []), x.period]));
  return [...m].map(([k, v]) => `${k} (${v.join(', ')})`);
};

type P = {
  inputs: ModelInputs; run: ModelRun | null; specs: RowSpec[]; specOf: Map<string, RowSpec>; update: (f: (c: ModelInputs) => void) => void;
  snapshot: RatesSnapshot | null; latest: RateEntry[] | null; lastRun: Awaited<ReturnType<typeof fetchRates>>['lastRun']; source: 'api' | 'bundled';
  setSnapshot: (s: RatesSnapshot) => void; setInputs: (i: ModelInputs) => void; onCell: (id: string, i: number) => void;
};

function Grid({ run, rows, onCell }: { run: ModelRun; rows: RowSpec[]; onCell: P['onCell'] }) {
  return (
    <table className="tbl"><thead><tr><th>EGP unless stated</th>{run.periodLabels.map(l => <th key={l}>{l}</th>)}</tr></thead>
      <tbody>{rows.filter(s => run.rows[s.id]).map(s => (
        <tr key={s.id} className={s.total ? 'total' : ''}><td>{s.label}</td>
          {run.rows[s.id].map((v, i) => <td key={i} className="num" data-row={s.id} onClick={() => onCell(s.id, i)}>{fmt(v, s.fmt)}</td>)}
        </tr>))}
      </tbody></table>
  );
}

function Statement({ title, section, sub, run, specs, onCell }: P & { title: string; section: string; sub?: string }) {
  if (!run) return null;
  return <><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}<p className="sub">Click any figure for its formula, inputs and source.</p><Grid run={run} rows={specs.filter(s => s.section === section)} onCell={onCell} /></>;
}

function SchedulesPage({ run, specs, onCell }: P) {
  if (!run) return null;
  const sections = [...new Set(specs.filter(s => s.sheet === 'Schedules').map(s => s.section))];
  return <><h1>Schedules</h1>{sections.map(sc => <div key={sc}><h2>{sc}</h2><Grid run={run} rows={specs.filter(s => s.section === sc && s.sheet === 'Schedules')} onCell={onCell} /></div>)}</>;
}

function RatiosPage({ run, specOf, specs, onCell }: P) {
  if (!run) return null;
  const extra = [...new Set(specs.filter(s => s.section.startsWith('Common size') || s.section === 'Year on year').map(s => s.section))];
  return <><h1>Ratios and outputs</h1><p className="sub">ROIC uses one definition: NOPAT over average invested capital (equity + borrowings + leases - cash and investments). Altman coefficients and zones are unconfirmed until verified against Altman (2005). Zone: 1 safe, 2 grey, 3 distress.</p>
    {OUTPUT_GROUPS.map(g => <div key={g.title}><h2>{g.title}</h2><Grid run={run} rows={g.ids.map(i => specOf.get(i)).filter(Boolean) as RowSpec[]} onCell={onCell} /></div>)}
    {extra.map(sc => <div key={sc}><h2>{sc}</h2><Grid run={run} rows={specs.filter(s => s.section === sc)} onCell={onCell} /></div>)}
  </>;
}

function setWolf<K extends keyof WolfProfile>(update: P['update'], key: K, value: WolfProfile[K]) {
  update(x => {
    x.company.wolf ??= { name: x.company.name, shortName: x.company.ticker, exchange: 'EGX', country: 'EG', damodaranIndustry: '', sharesNote: '', statementsDescription: '', auditor: '', reportDate: '', valuationDate: '', price: 0, priceDate: '', priceSource: '' };
    x.company.wolf[key] = value;
  });
}

function CompanyPage({ inputs, update }: P) {
  const c = inputs.company;
  const sec = checkSector(c.sector);
  const pol = (k: keyof typeof c.policy, label: string, a: string, b: string) => (
    <label className="block mb-2">{label}{' '}
      <select value={c.policy[k]} onChange={e => update(x => { x.company.policy[k] = Number(e.target.value) as 0 | 1; })}><option value={1}>{a}</option><option value={0}>{b}</option></select>
    </label>);
  return <><h1>Company</h1>
    <label className="block mb-2">Name <input value={c.name} size={50} onChange={e => update(x => { x.company.name = e.target.value; })} /></label>
    <label className="block mb-2">Ticker <input value={c.ticker} onChange={e => update(x => { x.company.ticker = e.target.value; })} /></label>
    <label className="block mb-2">Sector{' '}
      <select aria-label="Sector" value={c.sector} onChange={e => update(x => { x.company.sector = e.target.value as Sector; })}>
        <option value="industrial">Industrial</option><option value="commercial">Commercial</option><option value="bank">Bank</option><option value="insurance">Insurance</option>
      </select></label>
    {!sec.allowed && <p className="fail" role="alert">{sec.reason}</p>}
    <label className="block mb-2">Fiscal year end{' '}
      <select value={c.fiscalYearEndMonth} onChange={e => update(x => { x.company.fiscalYearEndMonth = Number(e.target.value) as 6 | 12; })}><option value={12}>December</option><option value={6}>June</option></select></label>
    <h2>Classification policy (EAS)</h2>
    {pol('interestReceivedOperating', 'Interest received', 'Operating', 'Investing')}
    {pol('interestPaidOperating', 'Interest paid', 'Operating', 'Financing')}
    {pol('distributionsOperating', 'Employee and board distributions', 'Operating', 'Financing')}
    <h2>WOLF export</h2>
    <p className="sub">User inputs. WOLF requires the valuation date, price and price date. EGX has no free official price feed.</p>
    <label className="block mb-2">Valuation date <input aria-label="Valuation date" placeholder="YYYY-MM-DD" value={c.wolf?.valuationDate ?? ''} onChange={e => setWolf(update, 'valuationDate', e.target.value)} /></label>
    <label className="block mb-2">Share price, EGP <input aria-label="Share price" value={c.wolf?.price || ''} onChange={e => setWolf(update, 'price', Number(e.target.value) || 0)} /></label>
    <label className="block mb-2">Price date <input aria-label="Price date" placeholder="YYYY-MM-DD" value={c.wolf?.priceDate ?? ''} onChange={e => setWolf(update, 'priceDate', e.target.value)} /></label>
    <label className="block mb-2">Price source <input aria-label="Price source" size={50} value={c.wolf?.priceSource ?? ''} onChange={e => setWolf(update, 'priceSource', e.target.value)} /></label>
    <h2>Modules</h2>
    <label className="block mb-2">FX module{' '}<select value={inputs.settings.fxOn} onChange={e => update(x => { x.settings.fxOn = Number(e.target.value) as 0 | 1; })}><option value={1}>On</option><option value={0}>Off (earns only in EGP)</option></select></label>
    <label className="block mb-2">Natural-gas Schedule Tax applies{' '}<select value={inputs.settings.schedTaxOn} onChange={e => update(x => { x.settings.schedTaxOn = Number(e.target.value) as 0 | 1; })}><option value={0}>No (unconfirmed)</option><option value={1}>Yes</option></select></label>
    <label className="block mb-2">Revenue basis{' '}<select value={inputs.settings.revenueBasis} onChange={e => update(x => { x.settings.revenueBasis = Number(e.target.value) as 1 | 2 | 3; })}><option value={1}>By market</option><option value={2}>By segment</option><option value={3}>Volume x price</option></select></label>
  </>;
}

function HistoricalsPage({ inputs, update, run }: P) {
  const h = inputs.historicals;
  const unmapped = unmappedLines(h);
  const accounts = CHART_OF_ACCOUNTS;
  const allYears = h.years;
  const ties = allYears.flatMap((y, k) => { const t = tieOuts(h, y, k > 0 ? accountsForYear(h, allYears[k - 1]) : null); return [{ y, t }]; });
  return <><h1>Historicals and mapping</h1>
    <p className="sub">Full absolute EGP. Each line maps to a standard account. Unmapped items block the run. The cash flow is loaded as reported.</p>
    {unmapped.length > 0 && <div className="fail mb-3" role="alert">Run blocked. Unmapped: {unmapped.map(u => u.label).join('; ')}</div>}
    <button className="btn mb-2" onClick={() => update(c => { c.historicals.lines.push({ label: 'New line', statement: 'BS', mapsTo: null, sign: 1, values: {} }); })}>Add line</button>
    <table className="tbl"><thead><tr><th>Line as reported</th><th>Maps to</th><th>Sign</th>{allYears.map(y => <th key={y}>{y}</th>)}</tr></thead>
      <tbody>{h.lines.map((l, i) => (
        <tr key={i}><td>{l.label}</td>
          <td><select aria-label={`Mapping ${l.label}`} value={l.mapsTo ?? ''} onChange={e => update(c => { c.historicals.lines[i].mapsTo = e.target.value || null; })}>
            <option value="">Unmapped</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.statement}: {a.label}</option>)}{l.mapsTo && !ACCOUNT_IDS.has(l.mapsTo) && <option value={l.mapsTo}>{l.mapsTo}</option>}
          </select></td>
          <td>{l.sign === 1 ? '+' : '-'}</td>
          {allYears.map(y => <td key={y}><input className="cell" aria-label={`${l.label} ${y}`} value={l.values[y] ?? ''} onChange={e => update(c => { const v = e.target.value; if (v === '') delete c.historicals.lines[i].values[y]; else if (Number.isFinite(Number(v))) c.historicals.lines[i].values[y] = Number(v); })} /></td>)}
        </tr>))}
      </tbody></table>
    <h2>Tie-outs</h2>
    {ties.map(({ y, t }) => <div key={y} className="mb-2"><b>FY{y}</b>: {t.checks.filter(c => c.pass).length} PASS, {t.checks.filter(c => !c.pass).length} FAIL
      {t.checks.filter(c => !c.pass).map(c => <div key={c.id} className="fail">FAIL {c.label}: difference {fmt(c.diff, 'egp')}</div>)}
      {t.notLoaded.map(n => <div key={n} className="warn">NOT LOADED {n}</div>)}</div>)}
    <h2>BS change vs CF line, FY{allYears[allYears.length - 1]} (information only)</h2>
    <table className="tbl"><thead><tr><th>Line</th><th>BS change</th><th>CF line</th><th>Difference</th></tr></thead><tbody>
      {reconciliationTable(h, allYears[allYears.length - 1]).map(r => <tr key={r.line}><td>{r.line}</td><td className="num">{fmt(r.bsChange, 'egp')}</td><td className="num">{fmt(r.cfLine, 'egp')}</td><td className="num">{fmt(r.difference, 'egp')}</td></tr>)}
    </tbody></table>
    <h2>Source discrepancies, recorded and not fixed</h2>
    <ol>{h.sourceNotes.map(n => <li key={n.id} className="mb-1 sub">{n.id}. {n.text}</li>)}</ol>
    {!run && <p className="warn">No run: fix the items above.</p>}
  </>;
}

function DriversPage({ inputs, update }: P) {
  const [sc, setSc] = useState<ScenarioKey>('base');
  const groups = [...new Set(DRIVERS.map(d => d.group))];
  const H = inputs.historicals.years;
  const years = Array.from({ length: inputs.nYears }, (_, i) => `${H[H.length - 1] + i + 1}E`);
  return <><h1>Drivers</h1><p className="sub">Per-year drivers. Bear, base and bull are explicit sets. MOPCO ratios come from the FY2025 notes; forward paths are analyst assumptions to review. Percentages are decimals (0.05 = 5%).</p>
    <label>Editing set <select aria-label="Editing set" value={sc} onChange={e => setSc(e.target.value as ScenarioKey)}>{SCENARIO_KEYS.map(s => <option key={s}>{s}</option>)}</select></label>
    {groups.map(g => <div key={g}><h2>{g}</h2><table className="tbl"><thead><tr><th>Driver</th>{years.map(y => <th key={y}>{y}</th>)}<th style={{ textAlign: 'left' }}>Note</th></tr></thead><tbody>
      {DRIVERS.filter(d => d.group === g).map(d => <tr key={d.key}><td>{d.label}</td>
        {years.map((_, i) => <td key={i}><input className="cell" aria-label={`${d.label} ${years[i]}`} defaultValue={inputs.scenarios[sc][d.key][i]} key={`${sc}-${d.key}-${i}`} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v)) update(c => { c.scenarios[sc][d.key as DriverKey][i] = v; }); }} /></td>)}
        <td className="wrap" style={{ color: 'var(--muted)' }}>{d.tag}: {d.note}</td></tr>)}
    </tbody></table></div>)}
  </>;
}

function ScenariosPage({ inputs, snapshot, specOf }: P) {
  const runs = useMemo(() => {
    if (!snapshot) return null;
    try { return SCENARIO_KEYS.map(k => runModel({ ...inputs, activeScenario: k }, snapshot)); } catch { return null; }
  }, [inputs, snapshot]);
  if (!runs) return null;
  const n = runs[0].years.length;
  const key = ['g_export', 'g_domestic', 'gas_pct', 'other_cogs_pct', 'sell_pct', 'ga_pct', 'capex_direct', 'capex_puc', 'payout', 'fx_close'] as DriverKey[];
  const outs = ['revenue', 'gross_profit', 'ebitda', 'net_profit', 'cash', 'net_debt', 'fcff', 'roic'];
  const nH = runs[0].nHist;
  return <><h1>Scenarios</h1><p className="sub">Each scenario is a full re-run of an explicit driver set.</p>
    <h2>Drivers, first forecast year</h2>
    <table className="tbl"><thead><tr><th>Driver</th>{SCENARIO_KEYS.map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>
      {key.map(k => { const d = DRIVERS.find(x => x.key === k)!; return <tr key={k}><td>{d.label}</td>{SCENARIO_KEYS.map(s => <td key={s} className="num">{fmt(inputs.scenarios[s][k][0], d.fmt)}</td>)}</tr>; })}
    </tbody></table>
    <h2>Outputs, final forecast year ({runs[0].periodLabels[n - 1]})</h2>
    <table className="tbl"><thead><tr><th>Output</th>{SCENARIO_KEYS.map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>
      {outs.map(o => <tr key={o}><td>{specOf.get(o)?.label}</td>{runs.map((r, k) => <td key={k} className="num">{fmt(r.rows[o][n - 1], specOf.get(o)?.fmt ?? 'egp')}</td>)}</tr>)}
    </tbody></table>
    <h2>Checks</h2>
    <table className="tbl"><tbody>{runs.map(r => { const f = r.checks.filter(c => !c.pass).length; return <tr key={r.scenario}><td>{r.scenario}</td><td className={f ? 'fail' : 'pass'}>{f ? `FAIL ${f}` : 'PASS'}</td></tr>; })}</tbody></table>
    {nH === 0 && null}
  </>;
}

function SensitivityPage({ inputs, snapshot }: P) {
  const grid = useMemo(() => { if (!snapshot) return null; try { return sensitivity(inputs, snapshot); } catch { return null; } }, [inputs, snapshot]);
  if (!grid) return null;
  const block = (title: string, m: number[][]) => <div key={title}><h2>{title}, {grid.period}</h2>
    <table className="tbl"><thead><tr><th>Growth shift (down), margin shift (across)</th>{grid.marginShifts.map(x => <th key={x}>{fmt(x, 'pct')}</th>)}</tr></thead><tbody>
      {m.map((r, a) => <tr key={a}><td>{fmt(grid.growthShifts[a], 'pct')}</td>{r.map((v, b) => <td key={b} className={`num ${a === 2 && b === 2 ? 'key' : ''}`}>{fmt(v, 'egp')}</td>)}</tr>)}
    </tbody></table></div>;
  return <><h1>Sensitivity</h1><p className="sub">Revenue growth x gross margin. Each cell is a full engine re-run. Base case in the centre.</p>{block('Net profit', grid.netProfit)}{block('Ending cash', grid.endingCash)}{block('Net debt', grid.netDebt)}</>;
}

function ChecksPage({ run, inputs }: P) {
  if (!run) return null;
  const y = inputs.historicals.years;
  return <><h1>Checks</h1>
    <table className="tbl"><thead><tr><th style={{ textAlign: 'left' }}>Check</th><th>Period</th><th>Difference</th><th>Tolerance</th><th>Result</th></tr></thead><tbody>
      {run.checks.map((c, i) => <tr key={i}><td>{c.label}</td><td style={{ textAlign: 'right' }}>{c.period}</td><td className="num">{fmt(c.diff, 'ps')}</td><td className="num">{c.tolerance}</td><td style={{ textAlign: 'right' }} className={c.pass ? 'pass' : 'fail'}>{c.pass ? 'PASS' : 'FAIL'}</td></tr>)}
      {y.flatMap((yr, k) => tieOuts(inputs.historicals, yr, k > 0 ? accountsForYear(inputs.historicals, y[k - 1]) : null).checks).map((c, i) => <tr key={`h${i}`}><td>{c.label}</td><td style={{ textAlign: 'right' }}>{c.period}</td><td className="num">{fmt(c.diff, 'ps')}</td><td className="num">{c.tolerance}</td><td style={{ textAlign: 'right' }} className={c.pass ? 'pass' : 'fail'}>{c.pass ? 'PASS' : 'FAIL'}</td></tr>)}
    </tbody></table>
    <h2>Iterations per forecast year</h2><p>{run.iterations.join(', ')} (cap 100). Converged: {run.converged.every(Boolean) ? 'yes' : 'no'}.</p>
  </>;
}

const mpcCal = (entries: RateEntry[]) => { const v = getRate(entries, 'mpc_calendar_2026')?.value; return Array.isArray(v) ? (v as string[]) : []; };
const statusClass = (s: string) => (s === 'ok' ? 'pass' : s === 'fetch_failed' ? 'fail' : 'warn');

function RatesPage({ latest, snapshot, setSnapshot, lastRun, source }: P) {
  if (!latest || !snapshot) return null;
  const ctx = { today: today(), mpcCalendar: mpcCal(latest) };
  const diff = diffSnapshot(snapshot, latest);
  return <><h1>Rates</h1>
    <p className="sub">{source === 'api' ? 'Served by /api/rates.' : '/api/rates is not available here; showing the manual file bundled with the app.'} This model is frozen to snapshot {snapshot.hash}, taken {snapshot.frozenAt.slice(0, 16).replace('T', ' ')}.</p>
    <h2>Update to current rates</h2>
    {diff.length === 0 ? <p>No difference from the frozen snapshot.</p> : <>
      <table className="tbl"><thead><tr><th>id</th><th>Old</th><th>New</th><th style={{ textAlign: 'left' }}>Source</th></tr></thead><tbody>{diff.map(d => <tr key={d.id}><td>{d.id}</td><td className="num">{String(d.old)}</td><td className="num">{String(d.new)}</td><td>{d.source}</td></tr>)}</tbody></table>
      <button className="btn btn-primary mt-2" onClick={() => setSnapshot(freeze(latest))}>Apply</button></>}
    <h2>Registry</h2>
    <table className="tbl"><thead><tr><th>Item</th><th>Value</th><th>Unit</th><th>As of</th><th style={{ textAlign: 'left' }}>Provenance</th><th>Status</th><th style={{ textAlign: 'left' }}>Reason</th></tr></thead><tbody>
      {latest.map(e => { const st = effectiveStatus(e, ctx); return <tr key={e.id}><td>{e.label}</td><td className="num">{Array.isArray(e.value) ? e.value.join(', ') : String(e.value ?? 'n/a')}</td><td>{e.unit}</td><td style={{ textAlign: 'right' }}>{e.asOf ?? 'n/a'}</td><td>{provenanceLabel(e)}</td><td style={{ textAlign: 'right' }} className={statusClass(st)}>{st.toUpperCase()}</td><td className="wrap" style={{ color: 'var(--muted)' }}>{computeStaleness(e, ctx).reason}</td></tr>; })}
    </tbody></table>
    {lastRun && <><h2>Last Worker run, {lastRun.ranAt}</h2><table className="tbl"><tbody>{lastRun.adapters.map(a => <tr key={a.adapter}><td>{a.adapter}</td><td className={a.error ? 'fail' : 'pass'}>{a.error ? `FAILED: ${a.error}` : 'PASS'}</td></tr>)}</tbody></table></>}
  </>;
}

function ExportsPage({ inputs, run, snapshot }: P) {
  const [busy, setBusy] = useState(false);
  if (!run || !snapshot) return null;
  const base = inputs.company.ticker.replace(/[^A-Za-z0-9]/g, '_');
  const wolfIssues = wolfExportIssues(inputs);
  const excel = async () => {
    setBusy(true);
    try {
      const { buildWorkbook } = await import('../export/excel/writer');
      const d = new Date();
      const date = `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-US', { month: 'short' })}-${d.getFullYear()}`;
      const { buffer } = await buildWorkbook({ ...inputs, settings: { ...inputs.settings, circularity: 0 } }, snapshot, { generatedDate: date, grid: sensitivity({ ...inputs, settings: { ...inputs.settings, circularity: 0 } }, snapshot) });
      download(`${base}_3SM.xlsx`, buffer as BlobPart, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } finally { setBusy(false); }
  };
  return <><h1>Exports</h1><p className="sub">Files are built in this browser and saved to this device. Nothing is uploaded.</p>
    <p className="mb-2"><button className="btn btn-primary" disabled={busy} onClick={excel}>Download Excel</button> Formula-driven; ships with the circularity switch at 0.</p>
    <p className="mb-2"><button className="btn" onClick={() => download(`${base}_WOLF.json`, JSON.stringify(buildWolfExport(run, inputs), null, 2), 'application/json')}>Download WOLF JSON</button> FCFF, net debt, debt-like items, cash split, shares, rates hash.</p>
    <p className="mb-2"><button className="btn" disabled={wolfIssues.length > 0} onClick={() => download(`${base}_WOLF_import.json`, JSON.stringify(buildWolfCompany(inputs), null, 2), 'application/json')}>Export to WOLF (.json)</button> Audited historical years, ready to import into the WOLF valuation engine. WOLF does not accept forecast years.</p>
    {wolfIssues.length > 0 && <p className="warn mb-2" role="status">Export to WOLF is not available yet: {wolfIssues.join(' ')} Enter the WOLF export fields on the Company page.</p>}
  </>;
}

function SavedPage({ inputs, snapshot, setInputs, setSnapshot }: P) {
  const [list, setList] = useState<SavedModel[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = () => listModels().then(setList).catch(() => setList([]));
  useEffect(() => { refresh(); }, []);
  const save = async () => { if (!snapshot) return; const savedAt = new Date().toISOString(); await saveModel({ id: `${inputs.company.ticker}-${savedAt}`, name: inputs.company.name, savedAt, inputs, snapshot }); refresh(); };
  return <><h1>Saved models</h1><p className="sub">Stored in this browser's IndexedDB with the rates snapshot frozen. Company financials never leave the browser.</p>
    <div className="flex gap-2 mb-3">
      <button className="btn btn-primary" onClick={save}>Save current model</button>
      <button className="btn" onClick={() => snapshot && download(`${inputs.company.ticker}_model.json`, JSON.stringify({ inputs, snapshot }, null, 1), 'application/json')}>Export JSON</button>
      <label className="btn cursor-pointer">Import JSON<input type="file" accept=".json" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const j = JSON.parse(await f.text()); setInputs(j.inputs); setSnapshot(j.snapshot); setMsg('Imported.'); } catch { setMsg('Not a valid model file.'); } }} /></label>
      <button className="btn" onClick={async () => { await clearLocalData(); refresh(); setMsg('Local data cleared.'); }}>Clear local data</button>
    </div>
    {msg && <p className="mb-2">{msg}</p>}
    <table className="tbl"><thead><tr><th>Name</th><th>Saved</th><th>Rates hash</th><th></th></tr></thead><tbody>
      {list.map(m => <tr key={m.id}><td>{m.name}</td><td style={{ textAlign: 'right' }}>{m.savedAt.slice(0, 16).replace('T', ' ')}</td><td style={{ textAlign: 'right' }}>{m.snapshot.hash}</td><td style={{ textAlign: 'right' }}><button className="btn" onClick={() => { setInputs(m.inputs); setSnapshot(m.snapshot); }}>Open</button> <button className="btn" onClick={async () => { await deleteModel(m.id); refresh(); }}>Delete</button></td></tr>)}
    </tbody></table>
  </>;
}

function DataSourcesPage({ latest }: P) {
  if (!latest) return null;
  return <><h1>Data sources</h1><p className="sub">Free official sources only. Generated from the registry.</p>
    <table className="tbl"><thead><tr><th style={{ textAlign: 'left' }}>Item</th><th style={{ textAlign: 'left' }}>Nature</th><th style={{ textAlign: 'left' }}>Source</th><th style={{ textAlign: 'left' }}>URL</th><th style={{ textAlign: 'left' }}>Notes</th></tr></thead><tbody>
      {latest.map(e => <tr key={e.id}><td>{e.label}</td><td>{e.nature}</td><td className="wrap">{e.sourceName}</td><td className="wrap">{e.sourceUrl}</td><td className="wrap" style={{ color: 'var(--muted)' }}>{e.notes}</td></tr>)}
    </tbody></table></>;
}

function Markdown({ text }: { text: string }) {
  return <div className="md">{text.split('\n').map((l, i) => {
    if (l.startsWith('# ')) return <h1 key={i}>{l.slice(2)}</h1>;
    if (l.startsWith('## ')) return <h2 key={i}>{l.slice(3)}</h2>;
    if (l.startsWith('### ')) return <h3 key={i} className="font-semibold mt-3">{l.slice(4)}</h3>;
    if (l.startsWith('- ')) return <li key={i}><code>{l.slice(2)}</code></li>;
    return l.trim() ? <p key={i}>{l}</p> : null;
  })}</div>;
}

function AuditPanel({ id, i, run, specOf, inputs, snapshot, onClose }: { id: string; i: number; run: ModelRun; specOf: Map<string, RowSpec>; inputs: ModelInputs; snapshot: RatesSnapshot | null; onClose: () => void }) {
  const s = specOf.get(id);
  if (!s) return null;
  const isHist = i < run.nHist;
  const tpl = isHist ? (s.h === 'same' ? s.f : s.h) : s.f;
  const label = (x: string) => specOf.get(x)?.label ?? DRIVERS.find(d => `d_${d.key}` === x)?.label ?? x;
  const words = tpl && !tpl.startsWith('INPUT') && tpl !== 'ZERO' ? tpl.replace(/([+*/-])(?=\[|[A-Z(])/g, ' $1 ').replace(/\[([a-z0-9_]+)(@-1|@first|@last)?\]/gi, (_, a, m) => `${label(a)}${m === '@-1' ? ' (prior year)' : m === '@last' ? ' (final year)' : ''}`) : null;
  const refs = tpl ? [...tpl.matchAll(/\[([a-z0-9_]+)(@-1|@first|@last)?\]/gi)] : [];
  const seen = new Set<string>();
  const valueOf = (rid: string, m?: string) => {
    const at = m === '@-1' ? i - 1 : m === '@last' ? run.years.length - 1 : m === '@first' ? run.nHist : i;
    if (rid.startsWith('d_')) { const d = DRIVERS.find(x => `d_${x.key}` === rid); return d ? fmt(inputs.scenarios[inputs.activeScenario][d.key][at - run.nHist], d.fmt) : ''; }
    const sp = specOf.get(rid);
    return fmt(run.rows[rid]?.[at] ?? null, sp?.fmt ?? 'egp');
  };
  const line = inputs.historicals.lines.find(l => l.mapsTo === id);
  const names = tpl ? [...new Set(tpl.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [])].filter(n => !['IF', 'MAX', 'MIN', 'SUM', 'AVERAGE', 'CHOOSE', 'ABS'].includes(n)) : [];
  const source = isHist ? (tpl && tpl !== 'ZERO' ? 'Formula on historical lines' : line ? `Historical line: ${line.label} (audited statements via Appendix B)` : 'Historical line') : 'Formula on drivers and prior-year balances';
  const regId: Record<string, string> = { TAX_RATE: 'cit_rate', YIELD_BASE: inputs.settings.yieldBaseId, FLOAT_BASE: inputs.settings.floatBaseId, SCHED_RATE: 'natural_gas_schedule_tax' };
  return <aside className="panel" role="dialog" aria-label="Audit panel">
    <div className="flex justify-between"><b>{s.label}</b><button className="btn" onClick={onClose}>Close</button></div>
    <p className="key mt-2">{run.periodLabels[i]}: {fmt(run.rows[id][i], s.fmt)}</p>
    <h2>Formula in words</h2><p>{words ?? 'As reported.'}</p>
    <h2>Inputs</h2>
    <table className="tbl"><tbody>{refs.map(m => { const k = m[1] + (m[2] ?? ''); if (seen.has(k)) return null; seen.add(k); return <tr key={k}><td className="wrap">{label(m[1])}{m[2] === '@-1' ? ' (prior year)' : ''}</td><td className="num">{valueOf(m[1], m[2])}</td></tr>; })}</tbody></table>
    {names.length > 0 && <><h2>Settings and registry</h2><ul>{names.map(n => <li key={n} style={{ marginLeft: 0, listStyle: 'none' }}>{n}{regId[n] && snapshot ? `: registry ${regId[n]} = ${getRate(snapshot.entries, regId[n])?.value}` : ''}</li>)}</ul></>}
    <h2>Source</h2><p>{source}</p>
  </aside>;
}
