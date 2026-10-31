// Part 11 gate: engine vs Python vs recalculated Excel on the MOPCO base case and a hand-built debt case;
// the MOPCO golden file; a tie-out test for every Part 4 equation.
import ExcelJS from 'exceljs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gate, loadMopco, loadSnapshot, readJson } from './lib/load';
import { recalc, recalcConverged } from './lib/recalc';
import { getRate } from '../packages/rates-registry/src/index';
import { accountsForYear, tieOuts } from '../src/engine/historicals';
import { sensitivity } from '../src/engine/outputs/sensitivity';
import { runModel } from '../src/engine/run';
import { buildWorkbook } from '../src/export/excel/writer';
import { amortizing } from '../tests/cases';
import type { ModelInputs } from '../src/engine/types';

const g = new Gate('part11');
const snap = loadSnapshot();
const tmp = mkdtempSync(path.join(os.tmpdir(), '3sm-11-'));
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
const TOL: Record<string, number> = { egp: 1, usd: 1, ps: 0.01, pct: 0.0001, x: 0.0001, num: 0.0001, fx: 0.0001, days: 0.0001, int: 1 };
const val = (v: ExcelJS.CellValue): unknown => (v && typeof v === 'object' && 'formula' in (v as object) ? ((v as ExcelJS.CellFormulaValue).result ?? 0) : v);

function dump(inp: ModelInputs): object {
  const accounts: Record<string, (number | null)[]> = {};
  const ids = new Set<string>();
  const accs = inp.historicals.years.map(y => accountsForYear(inp.historicals, y));
  accs.forEach(a => Object.keys(a).forEach(k => ids.add(k)));
  inp.historicals.reported.filter(r => r.id.startsWith('cf_')).forEach(r => ids.add(r.id));
  for (const id of ids) {
    accounts[id] = inp.historicals.years.map((y, i) => {
      if (id.startsWith('cf_')) { const r = inp.historicals.reported.find(x => x.id === id)?.values[String(y)]; if (r !== undefined) return r; }
      return accs[i][id] ?? null;
    });
  }
  const num = (id: string) => getRate(snap.entries, id)?.value as number;
  return {
    years: inp.historicals.years, nYears: inp.nYears, accounts, settings: inp.settings, tranches: inp.tranches, drivers: inp.scenarios[inp.activeScenario],
    taxRate: num('cit_rate') / 100, yieldBase: num(inp.settings.yieldBaseId) / 100, floatBase: num(inp.settings.floatBaseId) / 100, schedRate: num('natural_gas_schedule_tax'),
    par: inp.company.parValue, policy: inp.company.policy, overlayGrowth: 0, overlayMargin: 0,
  };
}

async function threeWay(tag: string, inp: ModelInputs, table: string[]) {
  const run = runModel(inp, snap);
  const fi = path.join(tmp, `${tag}.json`), fo = path.join(tmp, `${tag}.out.json`);
  writeFileSync(fi, JSON.stringify(dump(inp)));
  execFileSync(python, ['tests/python/reference.py', fi, fo], { stdio: 'pipe' });
  const py = JSON.parse(readFileSync(fo, 'utf8')) as Record<string, (number | null)[]>;
  const { buffer, layout } = await buildWorkbook(inp, snap, { generatedDate: '31-Oct-2026', grid: sensitivity(inp, snap) });
  const fx = path.join(tmp, `${tag}.xlsx`);
  writeFileSync(fx, buffer);
  const cc = layout.cells.cash;
  const file = inp.settings.circularity === 1
    ? (await recalcConverged(fx, path.join(tmp, `o-${tag}`), async f => { const w = new ExcelJS.Workbook(); await w.xlsx.readFile(f); return val(w.getWorksheet(cc.sheet)!.getCell(cc.row, layout.cols.first + run.years.length - 1).value) as number; })).file
    : recalc(fx, path.join(tmp, `o-${tag}`));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  let compared = 0, pyDiffs = 0, xlDiffs = 0, missingPy = 0, missingXl = 0;
  const samples: string[] = [];
  for (const [id, values] of Object.entries(run.rows)) {
    const cell = layout.cells[id];
    const fmt = cell?.fmt ?? (/(pct|rate|margin|share)/.test(id) ? 'pct' : 'egp');
    if (!(id in py)) { if (values.some(v => v !== null)) { missingPy++; samples.push(`python lacks ${id}`); } }
    if (!cell) missingXl++;
    let maxPy = 0, maxXl = 0;
    values.forEach((v, i) => {
      const p = py[id]?.[i] ?? null;
      if (v === null) { if (id in py && p !== null) { pyDiffs++; samples.push(`${id} ${run.periodLabels[i]}: engine blank, python ${p}`); } return; }
      compared++;
      if (id in py) {
        if (p === null || Math.abs(p - v) > TOL[fmt]) { pyDiffs++; samples.push(`${id} ${run.periodLabels[i]}: engine ${v}, python ${p}`); }
        else maxPy = Math.max(maxPy, Math.abs(p - v));
      }
      if (cell) {
        const x = val(wb.getWorksheet(cell.sheet)!.getCell(cell.row, layout.cols.first + i).value);
        if (typeof x !== 'number' || Math.abs(x - v) > TOL[fmt]) { xlDiffs++; samples.push(`${id} ${run.periodLabels[i]}: engine ${v}, excel ${JSON.stringify(x)}`); }
        else maxXl = Math.max(maxXl, Math.abs(x - v));
      }
    });
    if (['revenue', 'gross_profit', 'op_profit', 'fin_income', 'pbt', 'net_profit', 'cash', 'total_assets', 'total_equity', 'cf_cfo', 'cf_cfi', 'cf_cff', 'net_debt', 'fcff', 'fcfe', 'debt_total', 'roic', 'altman_z', 'piotroski', 'eps'].includes(id)) {
      const last = values.length - 1;
      table.push(`${tag.padEnd(16)}${id.padEnd(14)}${String(values[last]).padEnd(24)}${String(py[id]?.[last]).padEnd(24)}${String(val(wb.getWorksheet(cell.sheet)!.getCell(cell.row, layout.cols.first + last).value)).padEnd(24)}${maxPy.toFixed(6).padEnd(14)}${maxXl.toFixed(6)}`);
    }
  }
  g.check(`${tag}: engine = Python on every line`, pyDiffs === 0 && missingPy === 0, `${compared} values; ${pyDiffs} differences; ${samples.slice(0, 4).join(' | ')}`);
  g.check(`${tag}: engine = recalculated Excel on every line`, xlDiffs === 0, `${compared} values; ${xlDiffs} differences`);
  return { run, compared, internalOnly: missingXl };
}

async function main() {
  const table = [`${'case'.padEnd(16)}${'row, last yr'.padEnd(14)}${'engine'.padEnd(24)}${'python'.padEnd(24)}${'excel'.padEnd(24)}${'max|py-eng|'.padEnd(14)}max|xl-eng|`];
  const base = await threeWay('mopco-base-sw0', loadMopco(), table);
  await threeWay('mopco-base-sw1', loadMopco({ circ: 1 }), table);
  await threeWay('debt-case-sw0', amortizing(loadMopco()), table);
  await threeWay('debt-case-sw1', amortizing(loadMopco({ circ: 1 })), table);
  mkdirSync('docs/verify', { recursive: true });
  writeFileSync('docs/verify/three-way.txt', table.join('\n') + '\n');

  // Golden file. Rewritten only with UPDATE_GOLDEN=1, so a change in numbers fails until reviewed.
  const goldenPath = 'tests/golden/mopco-base.json';
  const current = JSON.stringify(base.run.rows, null, 0);
  if (process.env.UPDATE_GOLDEN || !existsSync(goldenPath)) { mkdirSync('tests/golden', { recursive: true }); writeFileSync(goldenPath, current); g.note('Golden file written.'); }
  const golden = readJson(goldenPath) as Record<string, (number | null)[]>;
  let goldenDiffs = 0;
  for (const [k, v] of Object.entries(base.run.rows)) v.forEach((x, i) => { const y = golden[k]?.[i]; if ((x === null) !== (y === null || y === undefined) || (x !== null && Math.abs(x - (y as number)) > 1e-6)) goldenDiffs++; });
  g.check('MOPCO golden file matches', goldenDiffs === 0, `${goldenDiffs} differences`);

  // Tie-out test for every Part 4 equation.
  const h = loadMopco().historicals;
  const fy25 = tieOuts(h, 2025, accountsForYear(h, 2024));
  const need = ['tie.bs', 'tie.cf_net', 'tie.cf_close', 'tie.re', 'tie.lr', 'tie.capital', 'tie.ppe_cost', 'tie.ppe_accum', 'tie.ppe_net', 'tie.gross_profit', 'tie.op_profit', 'tie.pbt', 'tie.net_profit'];
  for (const id of need) { const c = fy25.checks.find(x => x.id === id); g.check(`FY2025 tie-out ${id}`, !!c && c.pass, c ? `diff ${c.diff}` : 'missing'); }
  g.note('Independence: the Python model was written from docs/METHODOLOGY.md, in one flow, not as a translation of the TypeScript structure. It has the same author as the engine, so a misreading of the brief could appear in both.');
  g.done();
}
main();
