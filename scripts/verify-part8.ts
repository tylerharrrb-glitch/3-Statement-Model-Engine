// Part 8 gate: recalculate with LibreOffice at switch 0 and 1 for all scenarios, compare every row with
// the engine, then lint the delivered file.
import ExcelJS from 'exceljs';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gate, loadMopco, loadSnapshot } from './lib/load';
import { recalc, recalcConverged } from './lib/recalc';
import { runModel } from '../src/engine/run';
import { sensitivity } from '../src/engine/outputs/sensitivity';
import { buildWorkbook, type Layout } from '../src/export/excel/writer';
import { amortizing, revolverCase } from '../tests/cases';
import type { ModelInputs, ModelRun, ScenarioKey } from '../src/engine/types';

const g = new Gate('part8');
const snap = loadSnapshot();
const tmp = mkdtempSync(path.join(os.tmpdir(), '3sm-x-'));
const DATE = '31-Oct-2026';
const TOL: Record<string, number> = { egp: 1, usd: 1, ps: 0.01, pct: 0.0001, x: 0.0001, num: 0.0001, fx: 0.0001, days: 0.0001, int: 1 };
const colName = (c: number): string => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };
const cellNum = (v: ExcelJS.CellValue): unknown => {
  // ExcelJS drops a cached result of 0 or FALSE, leaving only the formula.
  if (v && typeof v === 'object' && 'formula' in (v as object)) { const r = (v as ExcelJS.CellFormulaValue).result; return r === undefined ? 0 : r; }
  return v;
};

async function compare(tag: string, inp: ModelInputs): Promise<{ compared: number; diffs: string[]; errors: number; master: unknown; run: ModelRun; file: string; layout: Layout; passes: number }> {
  const run = runModel(inp, snap);
  const grid = sensitivity(inp, snap);
  const { buffer, layout } = await buildWorkbook(inp, snap, { generatedDate: DATE, grid });
  const file = path.join(tmp, `${tag}.xlsx`);
  writeFileSync(file, buffer);
  let out: string;
  let passes = 1;
  if (inp.settings.circularity === 1) {
    const cc = layout.cells.cash;
    const r = await recalcConverged(file, path.join(tmp, `out-${tag}`), async f => {
      const w = new ExcelJS.Workbook(); await w.xlsx.readFile(f);
      return cellNum(w.getWorksheet(cc.sheet)!.getCell(cc.row, layout.cols.first + run.years.length - 1).value) as number;
    });
    out = r.file; passes = r.passes;
  } else out = recalc(file, path.join(tmp, 'out'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  let compared = 0, errors = 0;
  const diffs: string[] = [];
  wb.eachSheet(ws => ws.eachRow(row => row.eachCell(c => {
    const v = cellNum(c.value);
    if ((v && typeof v === 'object' && 'error' in (v as object)) || (typeof v === 'string' && /^(#|Err:)/.test(v))) { errors++; diffs.push(`ERROR ${ws.name}!${c.address} ${JSON.stringify(v)}`); }
  })));
  for (const [id, values] of Object.entries(run.rows)) {
    const cell = layout.cells[id];
    if (!cell) continue;
    const ws = wb.getWorksheet(cell.sheet)!;
    values.forEach((val, i) => {
      const v = cellNum(ws.getCell(cell.row, layout.cols.first + i).value);
      if (val === null) {
        if (typeof v === 'number') diffs.push(`${id} ${run.periodLabels[i]} engine blank, excel ${v}`);
        return;
      }
      compared++;
      if (typeof v !== 'number') { diffs.push(`${id} ${run.periodLabels[i]} engine ${val}, excel ${JSON.stringify(v)} (${cell.sheet}!${colName(layout.cols.first + i)}${cell.row})`); return; }
      if (Math.abs(v - val) > (TOL[cell.fmt] ?? 1)) diffs.push(`${id} ${run.periodLabels[i]} engine ${val}, excel ${v} (${cell.sheet}!${colName(layout.cols.first + i)}${cell.row})`);
    });
  }
  const masterRef = layout.names.MASTER_CHECK.split('!');
  const master = cellNum(wb.getWorksheet(masterRef[0])!.getCell(masterRef[1]).value);
  return { compared, diffs, errors, master, run, file, layout, passes };
}

async function main() {
  const summary: string[] = [];
  for (const c of [0, 1] as const) for (const s of ['bear', 'base', 'bull'] as ScenarioKey[]) {
    const r = await compare(`mopco-${s}-${c}`, loadMopco({ circ: c, scenario: s }));
    g.check(`MOPCO ${s}, switch ${c}: every output equals the engine`, r.diffs.length === 0, `${r.compared} values; ${r.diffs.length} diffs${r.diffs.length ? `; first: ${r.diffs.slice(0, 3).join(' | ')}` : ''}`);
    g.check(`MOPCO ${s}, switch ${c}: master check TRUE`, r.master === true, JSON.stringify(r.master));
    g.check(`MOPCO ${s}, switch ${c}: zero error values`, r.errors === 0, String(r.errors));
    summary.push(`${s}/${c}: ${r.compared} values compared, ${r.passes} LibreOffice pass(es)`);
  }
  for (const [name, f] of [['term loan', amortizing], ['revolver', revolverCase]] as const) for (const c of [0, 1] as const) {
    const r = await compare(`debt-${name.replace(' ', '')}-${c}`, f(loadMopco({ circ: c })));
    g.check(`${name}, switch ${c}: every output equals the engine`, r.diffs.length === 0, `${r.compared} values; ${r.diffs.length} diffs${r.diffs.length ? `; first: ${r.diffs.slice(0, 3).join(' | ')}` : ''}`);
    g.check(`${name}, switch ${c}: master check TRUE`, r.master === true, String(r.master));
  }
  for (const n of [10]) {
    const r = await compare(`mopco-10y`, loadMopco({ nYears: n }));
    g.check('10-year run: every output equals the engine', r.diffs.length === 0, `${r.compared} values; ${r.diffs.length} diffs`);
  }

  // ---------- Lint on the delivered file ----------
  const inp = loadMopco();
  const grid = sensitivity(inp, snap);
  const { buffer, layout } = await buildWorkbook(inp, snap, { generatedDate: DATE, grid });
  mkdirSync('docs/verify', { recursive: true });
  const shipped = path.join(tmp, 'shipped.xlsx');
  writeFileSync(shipped, buffer);
  const raw = new ExcelJS.Workbook();
  await raw.xlsx.readFile(shipped);
  const recalced = new ExcelJS.Workbook();
  await recalced.xlsx.readFile(recalc(shipped, path.join(tmp, 'shipout')));
  const report: string[] = [];
  const expected = ['Cover', 'Summary', 'Inputs', 'Sources', 'Model', 'Schedules', 'Ratios', 'Scenarios', 'Sensitivity', 'Checks'];
  g.check('Sheet list as specified', raw.worksheets.map(w => w.name).join() === expected.join());
  const swName = layout.names.SW_CIRC.split('!');
  g.check('File ships with the switch at 0', raw.getWorksheet(swName[0])!.getCell(swName[1]).value === 0);
  const zipXml = await (await import('jszip')).default.loadAsync(buffer).then(z => z.file('xl/workbook.xml')!.async('string'));
  g.check('Iterative calculation enabled (calcPr iterate="1")', /iterate="1"/.test(zipXml));
  g.check('Named ranges for key drivers and switches', ['SW_CIRC', 'SCENARIO', 'FX_ON', 'TAX_RATE', 'MASTER_CHECK'].every(n => zipXml.includes(`name="${n}"`)));

  const BANNED = /\b(OFFSET|INDIRECT|LET|LAMBDA|FILTER|SORT|UNIQUE|SEQUENCE|XLOOKUP|TEXTJOIN)\s*\(/i;
  let formulas = 0, over80 = 0, banned = 0, deepIf = 0, literals = 0, hardcodes = 0, styleBad = 0, merged = 0, freeze = 0, gridOn = 0, fillBad = 0, printBad = 0, legendBad = 0, widthBad = 0, fmtBad = 0;
  const litUse: Record<string, number> = {};
  const samples: Record<string, string[]> = { over80: [], literal: [], hardcode: [], style: [], width: [], pattern: [] };
  const push = (k: string, s: string) => { if (samples[k].length < 15) samples[k].push(s); };
  const ALLOWED = new Set(['0', '1', '12', '365', '100']);
  const unitUse: Record<string, number> = {};
  const fmts = new Set(['0', '0.0%', '0.0"x"', '0.0000', '0.0', '0.00', '#,##0', '_(#,##0_);(#,##0);"–"_)', 'General']);

  for (const ws of raw.worksheets) {
    if ((ws.model as unknown as { merges?: unknown[] }).merges?.length) merged++;
    const view = ws.views?.[0];
    if (view?.state === 'frozen') freeze++;
    if (view?.showGridLines !== false) gridOn++;
    if (ws.pageSetup.orientation !== 'landscape' || ws.pageSetup.fitToWidth !== 1) printBad++;
    if (!ws.headerFooter?.oddFooter?.includes('&P')) printBad++;
    if (ws.getCell('B3').value !== 'Blue = hardcoded input | Black = formula') legendBad++;
    if ((ws.getCell('B1').font?.size ?? 0) !== 14 || !ws.getCell('B1').font?.bold) styleBad++;
    const rv = recalced.getWorksheet(ws.name)!;
    ws.eachRow((row, rn) => row.eachCell((c, cn) => {
      if (c.fill && (c.fill as ExcelJS.FillPattern).pattern && (c.fill as ExcelJS.FillPattern).pattern !== 'none') fillBad++;
      if (c.font?.name !== 'Calibri') { styleBad++; push('style', `${ws.name}!${c.address} font ${c.font?.name}`); }
      if (c.numFmt && !fmts.has(c.numFmt)) { fmtBad++; push('style', `${ws.name}!${c.address} format ${c.numFmt}`); }
      const v = c.value as ExcelJS.CellValue;
      const color = c.font?.color?.argb;
      if (v && typeof v === 'object' && 'formula' in (v as object)) {
        formulas++;
        const f = String((v as ExcelJS.CellFormulaValue).formula);
        if (color && color !== 'FF000000') { styleBad++; push('style', `${ws.name}!${c.address} formula not black`); }
        if (f.length > 80) { over80++; push('over80', `${ws.name}!${c.address} (${f.length}): ${f}`); }
        if (BANNED.test(f)) banned++;
        let depth = 0, max = 0;
        for (const tok of f.match(/IF\(|\(|\)/g) ?? []) { if (tok === 'IF(') { depth++; max = Math.max(max, depth); } }
        const stack: boolean[] = []; let cur = 0; max = 0;
        for (const tok of f.match(/\bIF\(|\(|\)/g) ?? []) { if (tok === 'IF(') { stack.push(true); cur++; max = Math.max(max, cur); } else if (tok === '(') stack.push(false); else if (stack.pop()) cur--; }
        if (max > 2) deepIf++;
        const stripped = f.replace(/"[^"]*"/g, '').replace(/\$?[A-Z]{1,3}\$?\d+/g, 'R').replace(/\b[A-Z_]+[A-Z0-9_]*\b/g, 'N');
        for (const m of stripped.match(/(?<![A-Za-z_\d.])\d+(\.\d+)?/g) ?? []) {
          if (ALLOWED.has(m)) unitUse[m] = (unitUse[m] ?? 0) + 1;
          else { literals++; litUse[m] = (litUse[m] ?? 0) + 1; push('literal', `${ws.name}!${c.address}: ${f}`); }
        }
      } else if (typeof v === 'number') {
        const isInput = ws.name === 'Inputs' || ws.name === 'Sources';
        const inBlock = ws.name === layout.whitelistValueBlock.sheet && rn >= layout.whitelistValueBlock.from && rn <= layout.whitelistValueBlock.to;
        if (!isInput && !inBlock) { hardcodes++; push('hardcode', `${ws.name}!${c.address} = ${v}`); }
        if (isInput && color !== 'FF0000FF') { styleBad++; push('style', `${ws.name}!${c.address} input not blue`); }
      }
      // Column width must fit the formatted value plus padding, so parentheses never clip.
      if (cn >= 4 && !['Cover', 'Sources'].includes(ws.name)) {
        const rc = rv.getCell(rn, cn).value;
        const val = cellNum(rc);
        if (typeof val === 'number' && (c.numFmt ?? '').includes('#,##0')) {
          const text = Math.abs(Math.round(val)).toLocaleString('en-US');
          const need = text.length + 4;
          const w = ws.getColumn(cn).width ?? 8;
          if (w < need) { widthBad++; push('width', `${ws.name}!${c.address} needs ${need}, has ${w}`); }
        }
      }
    }));
  }
  // Row pattern across forecast columns, in relative form.
  let patternBad = 0;
  const { first, nHist, nYears } = layout.cols;
  const rel = (f: string, col: number) => f.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/g, (m, a, cl, b, rw) => {
    if (a === '$') return m;
    let n = 0; for (const ch of cl) n = n * 26 + ch.charCodeAt(0) - 64;
    return `C[${n - col}]${b}${rw}`;
  });
  for (const shName of ['Model', 'Schedules', 'Ratios', 'Checks']) {
    const ws = raw.getWorksheet(shName)!;
    ws.eachRow((row, rn) => {
      let base: string | null = null;
      for (let k = 0; k < nYears; k++) {
        const col = first + nHist + k;
        const v = row.getCell(col).value;
        if (!v || typeof v !== 'object' || !('formula' in (v as object))) continue;
        const f = rel(String((v as ExcelJS.CellFormulaValue).formula), col);
        if (base === null) base = f; else if (base !== f) { patternBad++; push('pattern', `${shName} row ${rn}: ${base} vs ${f}`); break; }
      }
    });
  }
  g.check('No fills', fillBad === 0, String(fillBad));
  g.check('Fonts, colours by cell type, title size', styleBad === 0, String(styleBad));
  g.check('Number formats from the approved list', fmtBad === 0, String(fmtBad));
  g.check('No merged cells', merged === 0);
  g.check('No freeze panes', freeze === 0);
  g.check('Gridlines hidden', gridOn === 0);
  g.check('Print setup on every sheet', printBad === 0);
  g.check('Legend on every sheet', legendBad === 0);
  g.check('Column widths fit formatted values with padding', widthBad === 0, String(widthBad));
  g.check('No hardcodes in calculation cells (Sensitivity block whitelisted)', hardcodes === 0, String(hardcodes));
  g.check('No literal constants in formulas outside 0, 1, 12, 365, 100', literals === 0, JSON.stringify(litUse));
  g.check('No banned functions', banned === 0);
  g.check('No nested IF deeper than 2', deepIf === 0);
  g.check('Every row has one formula pattern across forecast columns', patternBad === 0, String(patternBad));
  g.note('', );
  report.push('EXCEL LINT REPORT', `Formulas: ${formulas}`, `Formulas over 80 characters (flag, not a failure): ${over80}`, `Unit constants used: ${JSON.stringify(unitUse)}`, `Literal constants outside the allowed list: ${literals} ${JSON.stringify(litUse)}`, `Hardcodes in calculation cells: ${hardcodes}`, `Banned functions: ${banned}`, `Nested IF deeper than 2: ${deepIf}`, `Row-pattern breaks: ${patternBad}`, `Style issues: ${styleBad}; fills: ${fillBad}; formats: ${fmtBad}; widths: ${widthBad}`);
  for (const [k, v] of Object.entries(samples)) if (v.length) report.push(`Samples, ${k}:`, ...v.map(x => `  ${x}`));
  report.forEach(l => g.note(l));
  summary.forEach(l => g.note(l));
  g.note('LibreOffice ignores the iterate settings in the file and advances only part of the iteration per load, so switch 1 is recalculated in repeated passes until stable. Real Excel was not available to test.');
  g.note('Google Sheets is not tested headlessly; see docs/verify/google-sheets-manual.md.');
  g.done();
}
main();
