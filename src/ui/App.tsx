// Thin views over ModelRun. No calculation here: every figure comes from the engine.
// Layout and components follow the WOLF valuation engine.
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { computeStaleness, diffSnapshot, effectiveStatus, getRate, provenanceLabel, type RateEntry, type RateStatus, type RatesSnapshot } from '@registry';
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

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="panel" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h2 className="section-title" style={{ flex: 1 }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 280px) minmax(0, 1fr)', gap: 12, alignItems: 'center', marginBottom: 8 }}>
      <label>{label}{hint && <div className="muted" style={{ fontSize: 11 }}>{hint}</div>}</label>
      <div>{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: RateStatus }) {
  const label = status === 'ok' ? 'Current' : status === 'stale' ? 'Stale' : status === 'fetch_failed' ? 'Fetch failed' : 'Unconfirmed';
  return <span className={`badge ${status}`}>{label}</span>;
}

function useTheme() {
  const [light, setLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light');
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('wolf-theme', next ? 'light' : 'dark'); } catch { /* storage unavailable */ }
  };
  return { light, toggle };
}

export function App() {
  const [tab, setTab] = useState<Tab>('Income statement');
  const [inputs, setInputs] = useState<ModelInputs>(mopcoInputs);
  const [latest, setLatest] = useState<RateEntry[] | null>(null);
  const [lastRun, setLastRun] = useState<Awaited<ReturnType<typeof fetchRates>>['lastRun']>(null);
  const [source, setSource] = useState<'api' | 'bundled'>('bundled');
  const [snapshot, setSnapshot] = useState<RatesSnapshot | null>(null);
  const [audit, setAudit] = useState<{ id: string; i: number } | null>(null);
  const theme = useTheme();

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
    <>
      <header style={{ borderBottom: '1px solid var(--border)', background: 'var(--panel)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div className="display" style={{ fontSize: 22, letterSpacing: '0.12em' }}>WOLF</div>
          <div className="muted" style={{ fontSize: 12 }}>3-Statement Engine</div>
          <div style={{ fontSize: 13 }}>
            <strong>{inputs.company.name.split(' (')[0]}</strong> {inputs.company.ticker && <span className="muted">({inputs.company.ticker})</span>}
          </div>
          <div style={{ flex: 1 }} />
          {snapshot && <span className="muted" style={{ fontSize: 12 }}>{source === 'api' ? 'Rates snapshot' : 'Offline rates snapshot'} {snapshot.hash.slice(0, 8)}</span>}
          <button className="btn" onClick={theme.toggle} aria-label="Toggle light and dark theme">{theme.light ? 'Dark theme' : 'Light theme'}</button>
        </div>
        <nav style={{ maxWidth: 1400, margin: '0 auto', padding: '0 8px', display: 'flex', overflowX: 'auto' }} aria-label="Sections">
          {TABS.map(t => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
      </header>
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: 16 }}>
        <div className="panel" style={{ marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="label">Scenario{' '}
            <select className="input" aria-label="Scenario" value={inputs.activeScenario} onChange={e => update(c => { c.activeScenario = e.target.value as ScenarioKey; })}>
              {SCENARIO_KEYS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="label">Circularity{' '}
            <select className="input" aria-label="Circularity" value={inputs.settings.circularity} onChange={e => update(c => { c.settings.circularity = Number(e.target.value) as 0 | 1; })}>
              <option value={0}>0: opening balances</option><option value={1}>1: average balances</option>
            </select>
          </label>
          <label className="label">Forecast years{' '}
            <select className="input" aria-label="Forecast years" value={inputs.nYears} onChange={e => update(c => { c.nYears = Number(e.target.value); })}>
              {[5, 6, 7, 8, 9, 10].map(n => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div style={{ flex: 1 }} />
          {run && <span className={`badge ${fails ? 'fetch_failed' : 'ok'}`}>{fails ? `FAIL: ${fails} checks` : 'PASS: all checks'}</span>}
          {run && <span className="muted" style={{ fontSize: 12 }}>Iterations per year: {run.iterations.join(', ')}</span>}
        </div>
        {error && <div className="msg error" role="alert"><span className="neg">Error</span>: {error}</div>}
        {run && run.warnings.length > 0 && !['Rates', 'Methodology', 'Data sources'].includes(tab) && (
          <div style={{ margin: '0 0 16px' }}>{dedupe(run.warnings).map(w => <div key={w} className="msg warning"><span className="warn">Warning</span>: {w}</div>)}</div>
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
        {tab === 'Methodology' && <Section title="Methodology"><Markdown text={methodology} /></Section>}
        {tab === 'Data sources' && <DataSourcesPage {...props} />}
      </main>
      <footer style={{ maxWidth: 1400, margin: '24px auto', padding: '12px 16px', borderTop: '1px solid var(--border)' }} className="muted">
        <span style={{ fontSize: 12 }}>Analytical only. Not investment advice. Company data stays in this browser.</span>
      </footer>
      {audit && run && <AuditPanel {...audit} run={run} specOf={specOf} inputs={inputs} snapshot={snapshot} onClose={() => setAudit(null)} />}
    </>
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
    <div className="scroll"><table className="tbl"><thead><tr><th>EGP unless stated</th>{run.periodLabels.map(l => <th key={l} className="num">{l}</th>)}</tr></thead>
      <tbody>{rows.filter(s => run.rows[s.id]).map(s => (
        <tr key={s.id} className={s.total ? 'total' : ''}><td>{s.label}</td>
          {run.rows[s.id].map((v, i) => <td key={i} className="num" data-row={s.id} onClick={() => onCell(s.id, i)}>{v !== null && <span className="fig">{fmt(v, s.fmt)}</span>}</td>)}
        </tr>))}
      </tbody></table></div>
  );
}

function Statement({ title, section, sub, run, specs, onCell }: P & { title: string; section: string; sub?: string }) {
  if (!run) return null;
  return <Section title={title}>{sub && <p className="muted" style={{ marginBottom: 8 }}>{sub}</p>}<p className="muted" style={{ marginBottom: 8, fontSize: 12 }}>Click any figure for its formula, inputs and source.</p><Grid run={run} rows={specs.filter(s => s.section === section)} onCell={onCell} /></Section>;
}

function SchedulesPage({ run, specs, onCell }: P) {
  if (!run) return null;
  const sections = [...new Set(specs.filter(s => s.sheet === 'Schedules').map(s => s.section))];
  return <>{sections.map(sc => <Section key={sc} title={sc}><Grid run={run} rows={specs.filter(s => s.section === sc && s.sheet === 'Schedules')} onCell={onCell} /></Section>)}</>;
}

function RatiosPage({ run, specOf, specs, onCell }: P) {
  if (!run) return null;
  const extra = [...new Set(specs.filter(s => s.section.startsWith('Common size') || s.section === 'Year on year').map(s => s.section))];
  return <><p className="muted" style={{ marginBottom: 16 }}>ROIC uses one definition: NOPAT over average invested capital (equity + borrowings + leases - cash and investments). Altman coefficients and zones are unconfirmed until verified against Altman (2005). Zone: 1 safe, 2 grey, 3 distress.</p>
    {OUTPUT_GROUPS.map(g => <Section key={g.title} title={g.title}><Grid run={run} rows={g.ids.map(i => specOf.get(i)).filter(Boolean) as RowSpec[]} onCell={onCell} /></Section>)}
    {extra.map(sc => <Section key={sc} title={sc}><Grid run={run} rows={specs.filter(s => s.section === sc)} onCell={onCell} /></Section>)}
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
    <Field label={label}>
      <select className="input" value={c.policy[k]} onChange={e => update(x => { x.company.policy[k] = Number(e.target.value) as 0 | 1; })}><option value={1}>{a}</option><option value={0}>{b}</option></select>
    </Field>);
  const text = { width: '100%' };
  return <>
    <Section title="Company">
      <Field label="Company name"><input className="input" style={text} value={c.name} onChange={e => update(x => { x.company.name = e.target.value; })} /></Field>
      <Field label="Ticker"><input className="input" style={text} value={c.ticker} onChange={e => update(x => { x.company.ticker = e.target.value; })} /></Field>
      <Field label="Sector">
        <select className="input" aria-label="Sector" value={c.sector} onChange={e => update(x => { x.company.sector = e.target.value as Sector; })}>
          <option value="industrial">Industrial</option><option value="commercial">Commercial</option><option value="bank">Bank</option><option value="insurance">Insurance</option>
        </select></Field>
      {!sec.allowed && <div className="msg error" role="alert"><span className="neg">Blocked</span>: {sec.reason}</div>}
      <Field label="Fiscal year end">
        <select className="input" value={c.fiscalYearEndMonth} onChange={e => update(x => { x.company.fiscalYearEndMonth = Number(e.target.value) as 6 | 12; })}><option value={12}>December</option><option value={6}>June</option></select></Field>
    </Section>
    <Section title="Classification policy (EAS)">
      {pol('interestReceivedOperating', 'Interest received', 'Operating', 'Investing')}
      {pol('interestPaidOperating', 'Interest paid', 'Operating', 'Financing')}
      {pol('distributionsOperating', 'Employee and board distributions', 'Operating', 'Financing')}
    </Section>
    <Section title="WOLF export">
      <p className="muted" style={{ marginBottom: 8 }}>User inputs. WOLF requires the valuation date, price and price date.</p>
      <Field label="Valuation date" hint="Mandatory"><input className="input" style={text} aria-label="Valuation date" placeholder="YYYY-MM-DD" value={c.wolf?.valuationDate ?? ''} onChange={e => setWolf(update, 'valuationDate', e.target.value)} /></Field>
      <Field label="Share price (EGP)" hint="User input. EGX has no free official price feed."><input className="input" style={text} aria-label="Share price" value={c.wolf?.price || ''} onChange={e => setWolf(update, 'price', Number(e.target.value) || 0)} /></Field>
      <Field label="Price date" hint="Mandatory"><input className="input" style={text} aria-label="Price date" placeholder="YYYY-MM-DD" value={c.wolf?.priceDate ?? ''} onChange={e => setWolf(update, 'priceDate', e.target.value)} /></Field>
      <Field label="Price source"><input className="input" style={text} aria-label="Price source" value={c.wolf?.priceSource ?? ''} onChange={e => setWolf(update, 'priceSource', e.target.value)} /></Field>
    </Section>
    <Section title="Modules">
      <Field label="FX module"><select className="input" value={inputs.settings.fxOn} onChange={e => update(x => { x.settings.fxOn = Number(e.target.value) as 0 | 1; })}><option value={1}>On</option><option value={0}>Off (earns only in EGP)</option></select></Field>
      <Field label="Natural-gas Schedule Tax applies"><select className="input" value={inputs.settings.schedTaxOn} onChange={e => update(x => { x.settings.schedTaxOn = Number(e.target.value) as 0 | 1; })}><option value={0}>No (unconfirmed)</option><option value={1}>Yes</option></select></Field>
      <Field label="Revenue basis"><select className="input" value={inputs.settings.revenueBasis} onChange={e => update(x => { x.settings.revenueBasis = Number(e.target.value) as 1 | 2 | 3; })}><option value={1}>By market</option><option value={2}>By segment</option><option value={3}>Volume x price</option></select></Field>
    </Section>
  </>;
}

function HistoricalsPage({ inputs, update, run }: P) {
  const h = inputs.historicals;
  const unmapped = unmappedLines(h);
  const allYears = h.years;
  const ties = allYears.flatMap((y, k) => { const t = tieOuts(h, y, k > 0 ? accountsForYear(h, allYears[k - 1]) : null); return [{ y, t }]; });
  const last = allYears[allYears.length - 1];
  return <>
    <Section title="Historicals and mapping" right={<button className="btn" onClick={() => update(c => { c.historicals.lines.push({ label: 'New line', statement: 'BS', mapsTo: null, sign: 1, values: {} }); })}>Add line</button>}>
      <p className="muted" style={{ marginBottom: 8 }}>Full absolute EGP. Each line maps to a standard account. Unmapped items block the run. The cash flow is loaded as reported.</p>
      {unmapped.length > 0 && <div className="msg error" role="alert"><span className="neg">Run blocked</span>. Unmapped: {unmapped.map(u => u.label).join('; ')}</div>}
      <div className="scroll"><table className="tbl"><thead><tr><th>Line as reported</th><th>Maps to</th><th>Sign</th>{allYears.map(y => <th key={y} className="num">{y}</th>)}</tr></thead>
        <tbody>{h.lines.map((l, i) => (
          <tr key={i}><td>{l.label}</td>
            <td><select className="input" aria-label={`Mapping ${l.label}`} value={l.mapsTo ?? ''} onChange={e => update(c => { c.historicals.lines[i].mapsTo = e.target.value || null; })}>
              <option value="">Unmapped</option>{CHART_OF_ACCOUNTS.map(a => <option key={a.id} value={a.id}>{a.statement}: {a.label}</option>)}{l.mapsTo && !ACCOUNT_IDS.has(l.mapsTo) && <option value={l.mapsTo}>{l.mapsTo}</option>}
            </select></td>
            <td>{l.sign === 1 ? '+' : '-'}</td>
            {allYears.map(y => <td key={y}><input className="input cell" aria-label={`${l.label} ${y}`} value={l.values[y] ?? ''} onChange={e => update(c => { const v = e.target.value; if (v === '') delete c.historicals.lines[i].values[y]; else if (Number.isFinite(Number(v))) c.historicals.lines[i].values[y] = Number(v); })} /></td>)}
          </tr>))}
        </tbody></table></div>
    </Section>
    <Section title="Tie-outs">
      {ties.map(({ y, t }) => <div key={y} style={{ marginBottom: 8 }}><strong>FY{y}</strong>: {t.checks.filter(c => c.pass).length} PASS, {t.checks.filter(c => !c.pass).length} FAIL
        {t.checks.filter(c => !c.pass).map(c => <div key={c.id} className="msg error">FAIL {c.label}: difference {fmt(c.diff, 'egp')}</div>)}
        {t.notLoaded.map(n => <div key={n} className="msg warning">NOT LOADED {n}</div>)}</div>)}
    </Section>
    <Section title={`BS change vs CF line, FY${last} (information only)`}>
      <div className="scroll"><table className="tbl"><thead><tr><th>Line</th><th className="num">BS change</th><th className="num">CF line</th><th className="num">Difference</th></tr></thead><tbody>
        {reconciliationTable(h, last).map(r => <tr key={r.line}><td>{r.line}</td><td className="num">{fmt(r.bsChange, 'egp')}</td><td className="num">{fmt(r.cfLine, 'egp')}</td><td className="num">{fmt(r.difference, 'egp')}</td></tr>)}
      </tbody></table></div>
    </Section>
    <Section title="Source discrepancies, recorded and not fixed">
      <ol>{h.sourceNotes.map(n => <li key={n.id} className="muted" style={{ marginBottom: 4 }}>{n.id}. {n.text}</li>)}</ol>
    </Section>
    {!run && <p className="warn">No run: fix the items above.</p>}
  </>;
}

function DriversPage({ inputs, update }: P) {
  const [sc, setSc] = useState<ScenarioKey>('base');
  const groups = [...new Set(DRIVERS.map(d => d.group))];
  const H = inputs.historicals.years;
  const years = Array.from({ length: inputs.nYears }, (_, i) => `${H[H.length - 1] + i + 1}E`);
  return <>
    <Section title="Drivers" right={<label className="label">Editing set <select className="input" aria-label="Editing set" value={sc} onChange={e => setSc(e.target.value as ScenarioKey)}>{SCENARIO_KEYS.map(s => <option key={s}>{s}</option>)}</select></label>}>
      <p className="muted">Per-year drivers. Bear, base and bull are explicit sets. MOPCO ratios come from the FY2025 notes; forward paths are analyst assumptions to review. Percentages are decimals (0.05 = 5%).</p>
    </Section>
    {groups.map(g => <Section key={g} title={g}><div className="scroll"><table className="tbl"><thead><tr><th>Driver</th>{years.map(y => <th key={y} className="num">{y}</th>)}<th>Note</th></tr></thead><tbody>
      {DRIVERS.filter(d => d.group === g).map(d => <tr key={d.key}><td>{d.label}</td>
        {years.map((_, i) => <td key={i}><input className="input cell" aria-label={`${d.label} ${years[i]}`} defaultValue={inputs.scenarios[sc][d.key][i]} key={`${sc}-${d.key}-${i}`} onBlur={e => { const v = Number(e.target.value); if (Number.isFinite(v)) update(c => { c.scenarios[sc][d.key as DriverKey][i] = v; }); }} /></td>)}
        <td className="wrap muted">{d.tag}: {d.note}</td></tr>)}
    </tbody></table></div></Section>)}
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
  return <>
    <Section title="Drivers, first forecast year">
      <p className="muted" style={{ marginBottom: 8 }}>Each scenario is a full re-run of an explicit driver set.</p>
      <div className="scroll"><table className="tbl"><thead><tr><th>Driver</th>{SCENARIO_KEYS.map(s => <th key={s} className="num">{s}</th>)}</tr></thead><tbody>
        {key.map(k => { const d = DRIVERS.find(x => x.key === k)!; return <tr key={k}><td>{d.label}</td>{SCENARIO_KEYS.map(s => <td key={s} className="num">{fmt(inputs.scenarios[s][k][0], d.fmt)}</td>)}</tr>; })}
      </tbody></table></div>
    </Section>
    <Section title={`Outputs, final forecast year (${runs[0].periodLabels[n - 1]})`}>
      <div className="scroll"><table className="tbl"><thead><tr><th>Output</th>{SCENARIO_KEYS.map(s => <th key={s} className="num">{s}</th>)}</tr></thead><tbody>
        {outs.map(o => <tr key={o}><td>{specOf.get(o)?.label}</td>{runs.map((r, k) => <td key={k} className="num">{fmt(r.rows[o][n - 1], specOf.get(o)?.fmt ?? 'egp')}</td>)}</tr>)}
      </tbody></table></div>
    </Section>
    <Section title="Checks">
      <table className="tbl"><tbody>{runs.map(r => { const f = r.checks.filter(c => !c.pass).length; return <tr key={r.scenario}><td>{r.scenario}</td><td className={f ? 'neg' : 'pos'}>{f ? `FAIL ${f}` : 'PASS'}</td></tr>; })}</tbody></table>
    </Section>
  </>;
}

function SensitivityPage({ inputs, snapshot }: P) {
  const grid = useMemo(() => { if (!snapshot) return null; try { return sensitivity(inputs, snapshot); } catch { return null; } }, [inputs, snapshot]);
  if (!grid) return null;
  const block = (title: string, m: number[][]) => <Section key={title} title={`${title}, ${grid.period}`}>
    <div className="scroll"><table className="tbl"><thead><tr><th>Growth shift (down), margin shift (across)</th>{grid.marginShifts.map(x => <th key={x} className="num">{fmt(x, 'pct')}</th>)}</tr></thead><tbody>
      {m.map((r, a) => <tr key={a}><td>{fmt(grid.growthShifts[a], 'pct')}</td>{r.map((v, b) => <td key={b} className={`num ${a === 2 && b === 2 ? 'key-figure' : ''}`}>{fmt(v, 'egp')}</td>)}</tr>)}
    </tbody></table></div></Section>;
  return <><p className="muted" style={{ marginBottom: 16 }}>Revenue growth x gross margin. Each cell is a full engine re-run. Base case in the centre.</p>{block('Net profit', grid.netProfit)}{block('Ending cash', grid.endingCash)}{block('Net debt', grid.netDebt)}</>;
}

function ChecksPage({ run, inputs }: P) {
  if (!run) return null;
  const y = inputs.historicals.years;
  const row = (c: { label: string; period: string; diff: number | null; tolerance: number; pass: boolean }, k: string) => <tr key={k}><td>{c.label}</td><td className="num">{c.period}</td><td className="num">{fmt(c.diff, 'ps')}</td><td className="num">{c.tolerance}</td><td className={`num ${c.pass ? 'pos' : 'neg'}`}>{c.pass ? 'PASS' : 'FAIL'}</td></tr>;
  return <>
    <Section title="Checks">
      <div className="scroll"><table className="tbl"><thead><tr><th>Check</th><th className="num">Period</th><th className="num">Difference</th><th className="num">Tolerance</th><th className="num">Result</th></tr></thead><tbody>
        {run.checks.map((c, i) => row(c, `f${i}`))}
        {y.flatMap((yr, k) => tieOuts(inputs.historicals, yr, k > 0 ? accountsForYear(inputs.historicals, y[k - 1]) : null).checks).map((c, i) => row(c, `h${i}`))}
      </tbody></table></div>
    </Section>
    <Section title="Iterations per forecast year"><p>{run.iterations.join(', ')} (cap 100). Converged: {run.converged.every(Boolean) ? 'yes' : 'no'}.</p></Section>
  </>;
}

const mpcCal = (entries: RateEntry[]) => { const v = getRate(entries, 'mpc_calendar_2026')?.value; return Array.isArray(v) ? (v as string[]) : []; };

function RatesPage({ latest, snapshot, setSnapshot, lastRun, source }: P) {
  if (!latest || !snapshot) return null;
  const ctx = { today: today(), mpcCalendar: mpcCal(latest) };
  const diff = diffSnapshot(snapshot, latest);
  return <>
    <Section title="This model's rates snapshot" right={diff.length > 0 ? <button className="btn btn-primary" onClick={() => setSnapshot(freeze(latest))}>Apply</button> : undefined}>
      <p className="muted" style={{ marginBottom: 8 }}>{source === 'api' ? 'Served by /api/rates.' : '/api/rates is not available here; showing the manual file bundled with the app.'} This model is frozen to snapshot {snapshot.hash}, taken {snapshot.frozenAt.slice(0, 16).replace('T', ' ')}.</p>
      {diff.length === 0 ? <p>No difference from the frozen snapshot.</p> :
        <div className="scroll"><table className="tbl"><thead><tr><th>id</th><th className="num">Old</th><th className="num">New</th><th>Source</th></tr></thead><tbody>{diff.map(d => <tr key={d.id}><td>{d.id}</td><td className="num">{String(d.old)}</td><td className="num">{String(d.new)}</td><td>{d.source}</td></tr>)}</tbody></table></div>}
    </Section>
    <Section title="Rates registry">
      <div className="scroll"><table className="tbl"><thead><tr><th>Item</th><th className="num">Value</th><th>Unit</th><th className="num">As of</th><th>Provenance</th><th>Status</th><th>Reason</th></tr></thead><tbody>
        {latest.map(e => { const st = effectiveStatus(e, ctx); return <tr key={e.id}><td className="wrap">{e.label}</td><td className="num">{Array.isArray(e.value) ? e.value.join(', ') : String(e.value ?? 'n/a')}</td><td>{e.unit}</td><td className="num">{e.asOf ?? 'n/a'}</td><td>{provenanceLabel(e)}</td><td><StatusBadge status={st} /></td><td className="wrap muted">{computeStaleness(e, ctx).reason}</td></tr>; })}
      </tbody></table></div>
    </Section>
    {lastRun && <Section title={`Last Worker run, ${lastRun.ranAt}`}><table className="tbl"><tbody>{lastRun.adapters.map(a => <tr key={a.adapter}><td>{a.adapter}</td><td className={a.error ? 'neg' : 'pos'}>{a.error ? `FAILED: ${a.error}` : 'PASS'}</td></tr>)}</tbody></table></Section>}
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
  const row: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' };
  return <Section title="Exports">
    <p className="muted" style={{ marginBottom: 12 }}>Files are built in this browser and saved to this device. Nothing is uploaded.</p>
    <div style={row}><button className="btn btn-primary" disabled={busy} onClick={excel}>Download Excel</button><span>Formula-driven; ships with the circularity switch at 0.</span></div>
    <div style={row}><button className="btn" onClick={() => download(`${base}_WOLF.json`, JSON.stringify(buildWolfExport(run, inputs), null, 2), 'application/json')}>Download WOLF JSON</button><span>FCFF, net debt, debt-like items, cash split, shares, rates hash.</span></div>
    <div style={row}><button className="btn" disabled={wolfIssues.length > 0} onClick={() => download(`${base}_WOLF_import.json`, JSON.stringify(buildWolfCompany(inputs), null, 2), 'application/json')}>Export to WOLF (.json)</button><span>Audited historical years, ready to import into the WOLF valuation engine. WOLF does not accept forecast years.</span></div>
    {wolfIssues.length > 0 && <div className="msg warning" role="status"><span className="warn">Export to WOLF is not available yet</span>: {wolfIssues.join(' ')} Enter the WOLF export fields on the Company page.</div>}
  </Section>;
}

function SavedPage({ inputs, snapshot, setInputs, setSnapshot }: P) {
  const [list, setList] = useState<SavedModel[]>([]);
  const [msg, setMsg] = useState('');
  const refresh = () => listModels().then(setList).catch(() => setList([]));
  useEffect(() => { refresh(); }, []);
  const save = async () => { if (!snapshot) return; const savedAt = new Date().toISOString(); await saveModel({ id: `${inputs.company.ticker}-${savedAt}`, name: inputs.company.name, savedAt, inputs, snapshot }); refresh(); };
  return <Section title="Saved models">
    <p className="muted" style={{ marginBottom: 12 }}>Stored in this browser's IndexedDB with the rates snapshot frozen. Company financials never leave the browser.</p>
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <button className="btn btn-primary" onClick={save}>Save current model</button>
      <button className="btn" onClick={() => snapshot && download(`${inputs.company.ticker}_model.json`, JSON.stringify({ inputs, snapshot }, null, 1), 'application/json')}>Export JSON</button>
      <label className="btn">Import JSON<input type="file" accept=".json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const j = JSON.parse(await f.text()); setInputs(j.inputs); setSnapshot(j.snapshot); setMsg('Imported.'); } catch { setMsg('Not a valid model file.'); } }} /></label>
      <button className="btn" onClick={async () => { await clearLocalData(); refresh(); setMsg('Local data cleared.'); }}>Clear local data</button>
    </div>
    {msg && <p style={{ marginBottom: 8 }}>{msg}</p>}
    <div className="scroll"><table className="tbl"><thead><tr><th>Name</th><th className="num">Saved</th><th className="num">Rates hash</th><th></th></tr></thead><tbody>
      {list.map(m => <tr key={m.id}><td>{m.name}</td><td className="num">{m.savedAt.slice(0, 16).replace('T', ' ')}</td><td className="num">{m.snapshot.hash}</td><td className="num"><button className="btn" onClick={() => { setInputs(m.inputs); setSnapshot(m.snapshot); }}>Open</button> <button className="btn" onClick={async () => { await deleteModel(m.id); refresh(); }}>Delete</button></td></tr>)}
    </tbody></table></div>
  </Section>;
}

function DataSourcesPage({ latest }: P) {
  if (!latest) return null;
  return <Section title="Data sources">
    <p className="muted" style={{ marginBottom: 8 }}>Free official sources only. Generated from the registry.</p>
    <div className="scroll"><table className="tbl"><thead><tr><th>Item</th><th>Nature</th><th>Source</th><th>URL</th><th>Notes</th></tr></thead><tbody>
      {latest.map(e => <tr key={e.id}><td className="wrap">{e.label}</td><td>{e.nature}</td><td className="wrap">{e.sourceName}</td><td className="wrap">{e.sourceUrl}</td><td className="wrap muted">{e.notes}</td></tr>)}
    </tbody></table></div>
  </Section>;
}

function Markdown({ text }: { text: string }) {
  return <div className="markdown">{text.split('\n').map((l, i) => {
    if (l.startsWith('# ')) return <h1 key={i} style={{ fontSize: 20, margin: '4px 0 8px' }}>{l.slice(2)}</h1>;
    if (l.startsWith('## ')) return <h2 key={i} style={{ fontSize: 17, margin: '16px 0 6px' }}>{l.slice(3)}</h2>;
    if (l.startsWith('### ')) return <h3 key={i} style={{ margin: '12px 0 4px' }}>{l.slice(4)}</h3>;
    if (l.startsWith('- ')) return <div key={i} style={{ marginLeft: 12, marginBottom: 2 }}><code style={{ fontSize: 12 }}>{l.slice(2)}</code></div>;
    return l.trim() ? <p key={i} style={{ margin: '6px 0', maxWidth: 900 }}>{l}</p> : null;
  })}</div>;
}

function AuditPanel({ id, i, run, specOf, inputs, snapshot, onClose }: { id: string; i: number; run: ModelRun; specOf: Map<string, RowSpec>; inputs: ModelInputs; snapshot: RatesSnapshot | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
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
  const source = isHist ? (tpl && tpl !== 'ZERO' ? 'Formula on historical lines' : line ? `Historical line: ${line.label} (audited statements)` : 'Historical line') : 'Formula on drivers and prior-year balances';
  const regId: Record<string, string> = { TAX_RATE: 'cit_rate', YIELD_BASE: inputs.settings.yieldBaseId, FLOAT_BASE: inputs.settings.floatBaseId, SCHED_RATE: 'natural_gas_schedule_tax' };
  return <aside className="drawer" role="dialog" aria-label="Audit panel">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
      <h2 className="section-title" style={{ flex: 1 }}>{s.label}</h2>
      <button className="btn" onClick={onClose}>Close</button>
    </div>
    <div className="display key-figure" style={{ fontSize: 26, margin: '4px 0 12px' }}>{fmt(run.rows[id][i], s.fmt)}</div>
    <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{run.periodLabels[i]}</div>
    <div className="label">Formula in words</div>
    <p style={{ marginTop: 4 }}>{words ?? 'As reported.'}</p>
    {refs.length > 0 && <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Input</th><th className="num">Value</th></tr></thead><tbody>{refs.map(m => { const k = m[1] + (m[2] ?? ''); if (seen.has(k)) return null; seen.add(k); return <tr key={k}><td className="wrap">{label(m[1])}{m[2] === '@-1' ? ' (prior year)' : ''}</td><td className="num">{valueOf(m[1], m[2])}</td></tr>; })}</tbody></table>}
    {names.length > 0 && <div style={{ marginTop: 12 }}><div className="label">Settings and registry</div>{names.map(n => <div key={n} style={{ fontSize: 13 }}>{n}{regId[n] && snapshot ? `: registry ${regId[n]} = ${getRate(snapshot.entries, regId[n])?.value}` : ''}</div>)}</div>}
    <div className="label" style={{ marginTop: 12 }}>Source</div>
    <p style={{ marginTop: 4 }}>{source}</p>
  </aside>;
}
