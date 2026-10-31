import { loadMopco, loadSnapshot } from './lib/load';
import { runModel } from '../src/engine/run';
import { tieOuts, accountsForYear } from '../src/engine/historicals';
const snap = loadSnapshot();
const inp = loadMopco();
for (const y of [2024, 2025]) { const r = tieOuts(inp.historicals, y, y === 2025 ? accountsForYear(inp.historicals, 2024) : null);
  console.log(y, r.checks.filter(c => !c.pass).map(c => `${c.label}: ${c.diff}`), 'pass', r.checks.filter(c => c.pass).length, 'notloaded', r.notLoaded); }
for (const circ of [0, 1] as const) for (const sc of ['bear','base','bull'] as const) {
  const run = runModel(loadMopco({ circ, scenario: sc }), snap);
  const f = (id: string) => run.rows[id].map(v => v === null ? 'null' : Math.round(v as number).toLocaleString()).join(' | ');
  console.log(circ, sc, 'checks fail', run.checks.filter(c => !c.pass).map(c => `${c.period} ${c.id} ${c.diff}`).slice(0,6), 'iter', run.iterations.join());
  if (sc === 'base' && circ === 0) { for (const id of ['revenue','gross_profit','op_profit','fin_income','pbt','net_profit','cash','total_assets','balance_check','cf_cfo','cf_cfi','cf_cff','re','fcff','altman_z','piotroski','dep']) console.log(id.padEnd(14), f(id)); console.log(run.warnings.slice(0,5)); }
}
