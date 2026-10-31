// Formula writer. Takes inputs and the rates snapshot; never reads ModelRun for calculation cells.
// The only values written from an engine run are the static Sensitivity block (Part 8).
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { getRate, type RatesSnapshot } from '@registry';
import { accountsForYear } from '../../engine/historicals';
import type { ModelInputs } from '../../engine/types';
import type { SensitivityGrid } from '../../engine/outputs/sensitivity';
import { DRIVERS } from './catalog';
import { buildRows, type Fmt, type RowSpec } from './rows';

const BLUE = 'FF0000FF', BLACK = 'FF000000', RED = 'FFFF0000';
const FMT: Record<Fmt, string> = {
  egp: '_(#,##0_);(#,##0);"–"_)', pct: '0.0%', x: '0.0"x"', num: '0.0000', fx: '0.0000', days: '0.0', ps: '0.00', int: '#,##0', usd: '_(#,##0_);(#,##0);"–"_)',
};
const FIRST_COL = 4; // D
const colName = (c: number): string => { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - m - 1) / 26; } return s; };

export interface Layout {
  cols: { first: number; nHist: number; nYears: number };
  cells: Record<string, { sheet: string; row: number; fmt: Fmt }>;
  names: Record<string, string>;
  whitelistValueBlock: { sheet: string; from: number; to: number };
  inputSheets: string[];
}

export interface WorkbookOptions { generatedDate: string; scenarioIndex?: 1 | 2 | 3; grid: SensitivityGrid; centreValid?: boolean }

const SCEN = ['bear', 'base', 'bull'] as const;
const LEGEND = 'Blue = hardcoded input | Black = formula';

interface SheetCtx { ws: ExcelJS.Worksheet; row: number }

function head(ws: ExcelJS.Worksheet, company: string, title: string, subtitle: string) {
  ws.getCell('B1').value = title; ws.getCell('B1').font = { name: 'Calibri', size: 14, bold: true };
  ws.getCell('B2').value = subtitle; ws.getCell('B2').font = { name: 'Calibri', size: 11 };
  ws.getCell('B3').value = LEGEND; ws.getCell('B3').font = { name: 'Calibri', size: 11 };
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  ws.headerFooter = { oddFooter: `&L${company.replace(/&/g, '&&')}&C&A&RPage &P` };
  ws.getColumn(1).width = 2;
}

const setFont = (c: ExcelJS.Cell, color: string, bold = false) => { c.font = { name: 'Calibri', size: 11, color: { argb: color }, bold }; };

export async function buildWorkbook(inp: ModelInputs, rates: RatesSnapshot, opt: WorkbookOptions): Promise<{ buffer: Uint8Array; layout: Layout }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '3SM';
  const company = inp.company.name;
  const H = inp.historicals.years, nH = H.length, nY = inp.nYears, n = nH + nY;
  const col = (i: number) => FIRST_COL + i;
  const notesCol = FIRST_COL + n + 1;
  const labels = [...H.map(y => `${y}A`), ...Array.from({ length: nY }, (_, i) => `${H[nH - 1] + i + 1}E`)];
  const specs = buildRows(inp);
  const layout: Layout = { cols: { first: FIRST_COL, nHist: nH, nYears: nY }, cells: {}, names: {}, whitelistValueBlock: { sheet: 'Sensitivity', from: 0, to: 0 }, inputSheets: ['Inputs', 'Sources'] };

  const sheets = ['Cover', 'Summary', 'Inputs', 'Sources', 'Model', 'Schedules', 'Ratios', 'Scenarios', 'Sensitivity', 'Checks'];
  const S: Record<string, ExcelJS.Worksheet> = {};
  for (const s of sheets) S[s] = wb.addWorksheet(s);
  const sub: Record<string, string> = {
    Cover: 'Company, master check and contents. Limitation: forward drivers are analyst assumptions for the owner to review.',
    Summary: 'Key lines for the active scenario. Limitation: forward drivers are analyst assumptions.',
    Inputs: 'Switches, historicals and drivers. Limitation: USD shares apply one rate per side because the FX note gives totals only.',
    Sources: 'Every registry value with URL, as-of date and status. Limitation: unconfirmed values are not verified at their primary source.',
    Model: 'Income statement, balance sheet and cash flow. Limitation: historical cash flow is as reported and is not re-derived.',
    Schedules: 'FX, revenue, costs, PP&E, leases, benefits, tax, equity and debt. Limitation: lease interest is always on the opening liability.',
    Ratios: "Ratios, DuPont, credit, FCFF/FCFE, Altman Z''-EM, Piotroski. Limitation: Altman zones are unconfirmed.",
    Scenarios: 'Drivers side by side, then active-scenario outputs. Limitation: only the active scenario is live; change the selector on Inputs.',
    Sensitivity: 'Revenue growth x gross margin. Limitation: static engine output; a 25-cell live grid would need 25 copies of the model.',
    Checks: 'All integrity checks. Limitation: a documented 1 EGP opening gap (source note 9) is excluded from the balance check.',
  };
  for (const s of sheets) head(S[s], company, `${company} - ${s}`, sub[s]);

  const headerRow = (ws: ExcelJS.Worksheet, row: number, notes = true, unitHead = 'Unit') => {
    const set = (c: number, v: string) => { const x = ws.getCell(row, c); x.value = v; setFont(x, BLACK, true); x.border = { bottom: { style: 'thin' } }; x.alignment = { horizontal: c >= FIRST_COL ? 'right' : 'left' }; };
    set(2, 'EGP unless stated'); set(3, unitHead);
    labels.forEach((l, i) => set(col(i), l));
    if (notes) { const x = ws.getCell(row, notesCol); x.value = 'Notes'; setFont(x, BLACK, true); x.border = { bottom: { style: 'thin' } }; }
  };
  const unitOf = (f: Fmt) => ({ egp: 'EGP', pct: '%', x: 'x', num: 'n', fx: 'EGP/USD', days: 'days', ps: 'EGP/sh', int: 'n', usd: 'USD' })[f];

  // ---------- Sources ----------
  const srcCols = ['id', 'Label', 'Value', 'Unit', 'Nature', 'Source', 'URL', 'As of', 'Method', 'Status', 'Notes'];
  srcCols.forEach((t, i) => { const c = S.Sources.getCell(5, 2 + i); c.value = t; setFont(c, BLACK, true); c.border = { bottom: { style: 'thin' } }; });
  const srcRow: Record<string, number> = {};
  rates.entries.forEach((e, i) => {
    const row = 6 + i;
    srcRow[e.id] = row;
    const vals = [e.id, e.label, Array.isArray(e.value) ? e.value.join(', ') : e.value ?? 'n/a', e.unit, e.nature, e.sourceName, e.sourceUrl, e.asOf ?? 'n/a', e.method, e.status, e.notes ?? ''];
    vals.forEach((v, k) => { const c = S.Sources.getCell(row, 2 + k); c.value = v as ExcelJS.CellValue; setFont(c, k === 2 ? BLUE : BLACK); });
  });
  [16, 44, 12, 12, 12, 34, 40, 12, 9, 12, 60].forEach((w, i) => { S.Sources.getColumn(2 + i).width = w; });

  // ---------- Inputs ----------
  const inW = S.Inputs;
  let rI = 5;
  const name = (nm: string, sheet: string, row: number, c = 4) => {
    wb.definedNames.add(`'${sheet}'!$${colName(c)}$${row}`, nm);
    layout.names[nm] = `${sheet}!${colName(c)}${row}`;
  };
  const scalarHead = (t: string) => { const c = inW.getCell(rI, 2); c.value = t; setFont(c, BLACK, true); c.border = { bottom: { style: 'thin' } }; rI++; };
  const scalar = (nm: string, label: string, value: number, fmt: Fmt | 'plain', note: string, tag = 'Analyst assumption', formula?: string) => {
    inW.getCell(rI, 2).value = label; setFont(inW.getCell(rI, 2), BLACK);
    const c = inW.getCell(rI, 4);
    if (formula) { c.value = { formula } as ExcelJS.CellFormulaValue; setFont(c, BLACK); } else { c.value = value; setFont(c, BLUE); }
    c.numFmt = fmt === 'plain' ? '0' : FMT[fmt];
    const nCell = inW.getCell(rI, notesCol); nCell.value = `${tag}: ${note}`; setFont(nCell, BLACK);
    name(nm, 'Inputs', rI);
    rI++;
  };
  const st = inp.settings;
  const idx = opt.scenarioIndex ?? (SCEN.indexOf(inp.activeScenario) + 1) as 1 | 2 | 3;
  scalarHead('Switches');
  scalar('SCENARIO', 'Scenario selector: 1 bear, 2 base, 3 bull', idx, 'plain', 'Selects the active driver set.');
  scalar('SW_CIRC', 'Circularity: 1 average balances, 0 opening balances', st.circularity, 'plain', 'Ships at 0. Iterative calculation is enabled in the workbook.');
  scalar('FX_ON', 'FX module: 1 on, 0 off', st.fxOn, 'plain', 'Off freezes USD/EGP.');
  scalar('REV_BASIS', 'Revenue: 1 market, 2 segment, 3 volume x price', st.revenueBasis, 'plain', 'Volume x price stays off until volumes are entered.');
  scalar('COGS_MODE', 'Cost of sales: 1 by line, 2 gross margin', st.cogsMode, 'plain', 'Modelling choice.');
  scalar('GAS_MODE', 'Gas: 1 USD price x consumption, 2 % of sales', st.gasMode, 'plain', 'Consumption not disclosed, so 2.');
  scalar('SELL_MODE', 'Selling: 1 % of sales, 2 growth', st.sellMode, 'plain', 'Modelling choice.');
  scalar('GA_MODE', 'G&A: 1 % of sales, 2 growth', st.gaMode, 'plain', 'Modelling choice.');
  scalar('DEP_MODE', 'Depreciation: 1 useful life, 2 % of base', st.depMode, 'plain', 'Modelling choice.');
  scalar('DIV_MODE', 'Dividends: 1 payout, 2 DPS', st.divMode, 'plain', 'Modelling choice.');
  scalar('REV_ON', 'Revolver: 1 on, 0 off', st.revolverOn, 'plain', 'Only balancing mechanism in the model.');
  scalar('SCHED_ON', 'Natural-gas Schedule Tax: 1 applies, 0 not', st.schedTaxOn, 'plain', 'Applicability to feedstock unconfirmed.', 'Estimate');
  scalar('OV_GROWTH', 'Growth overlay (sensitivity axis)', inp.overlay?.growth ?? 0, 'pct', 'Added to every growth rate; 0 in the delivered file.');
  scalar('OV_MARGIN', 'Gross margin overlay (sensitivity axis)', inp.overlay?.margin ?? 0, 'pct', 'Added to gross margin; 0 in the delivered file.');
  const pol = inp.company.policy;
  scalarHead('Classification policy (1 = operating)');
  scalar('INT_REC_OP', 'Interest received in operating', pol.interestReceivedOperating, 'plain', 'FY2025 statements: investing.', 'Sourced fact');
  scalar('INT_PAID_OP', 'Interest paid in operating', pol.interestPaidOperating, 'plain', 'No borrowings to observe.', 'Estimate');
  scalar('DIST_OP', 'Employee and board distributions in operating', pol.distributionsOperating, 'plain', 'FY2025 statements: operating.', 'Sourced fact');
  scalarHead('Rates, from Sources');
  const srcNum = (id: string) => `Sources!$D$${srcRow[id]}`;
  scalar('TAX_RATE', 'Corporate tax rate', 0, 'pct', 'Registry cit_rate.', 'Sourced fact', `${srcNum('cit_rate')}/100`);
  scalar('YIELD_BASE', `EGP yield base (${st.yieldBaseId})`, 0, 'pct', 'Registry; unconfirmed.', 'Sourced fact', `${srcNum(st.yieldBaseId)}/100`);
  scalar('FLOAT_BASE', `Floating debt base (${st.floatBaseId})`, 0, 'pct', 'Registry; unconfirmed.', 'Sourced fact', `${srcNum(st.floatBaseId)}/100`);
  scalar('SCHED_RATE', 'Schedule Tax, EGP per thousand cubic feet', 0, 'days', 'Registry; Law 149/2026 per PwC.', 'Sourced fact', srcNum('natural_gas_schedule_tax'));
  scalarHead('Statutory and company');
  scalar('PAR', 'Par value per share', inp.company.parValue, 'ps', 'Audited statements.', 'Sourced fact');
  scalar('LR_PCT', 'Legal reserve rate', st.lrPct, 'pct', 'Art. 40 as translated; confirm in Arabic text.', 'Sourced fact');
  scalar('LR_CAP', 'Legal reserve cap, % of issued capital', st.lrCapPct, 'pct', 'Art. 40 as translated.', 'Sourced fact');
  scalar('EMP_FLOOR', 'Employee share floor, % of profits distributed', st.empFloorPct, 'pct', 'Art. 41 as translated.', 'Sourced fact');
  scalar('BOARD_CAP', 'Board remuneration cap', st.boardCapPct, 'pct', 'Art. 88 as translated.', 'Sourced fact');
  scalar('BOARD_MIN', 'Minimum distribution before board, % of capital', st.boardMinDistPct, 'pct', 'Art. 88 as translated.', 'Sourced fact');
  scalar('REV_SPREAD', 'Revolver spread', st.revolverSpread, 'pct', 'Assumption.');
  scalarHead('USD share of balances');
  const U = st.usd;
  ([['USD_CASH', 'Cash', U.cash], ['USD_INV_NC', 'Investments, non-current', U.inv_nc], ['USD_INV_CUR', 'Investments, current', U.inv_cur], ['USD_FVTPL', 'FVTPL', U.fvtpl], ['USD_OFA', 'Other financial assets', U.ofa], ['USD_AR', 'Receivables', U.ar], ['USD_DEBTORS', 'Debtors', U.debtors], ['USD_AP', 'Payables', U.ap], ['USD_CREDITORS', 'Creditors', U.creditors], ['USD_CUST_ADV', 'Customer advances', U.cust_adv]] as [string, string, number][])
    .forEach(([a, b, v]) => scalar(a, `USD share: ${b}`, v, 'pct', 'Notes 35-36: USD assets 15,597,077,984 of 20,844,777,782; USD liabilities 342,946,952 of 2,060,181,086. Same share per class.', 'Estimate'));
  scalarHead('Thresholds');
  scalar('COV_LEV', 'Covenant: maximum net debt / EBITDA', st.covenants.maxNetDebtEbitda, 'x', 'User-defined.');
  scalar('COV_COVER', 'Covenant: minimum interest cover', st.covenants.minInterestCover, 'x', 'User-defined.');
  scalar('COV_CURRENT', 'Covenant: minimum current ratio', st.covenants.minCurrentRatio, 'x', 'User-defined.');
  scalar('TOL', 'Check tolerance, EGP', 1, 'ps', 'Part 0.', 'Sourced fact');
  scalar('VP_CODE', 'Code for the volume x price revenue basis', 3, 'plain', 'Label code.', 'Sourced fact');
  scalar('ZONE_GREY', 'Altman zone code: grey', 2, 'plain', 'Label code.', 'Sourced fact');
  scalar('ZONE_DIST', 'Altman zone code: distress', 3, 'plain', 'Label code.', 'Sourced fact');
  scalar('ALT_C', "Z''-EM constant", 3.25, 'ps', 'Altman (2005) per brief; unconfirmed until verified.', 'Estimate');
  scalar('ALT_1', "Z''-EM coefficient X1", 6.56, 'ps', 'Unconfirmed until verified.', 'Estimate');
  scalar('ALT_2', "Z''-EM coefficient X2", 3.26, 'ps', 'Unconfirmed until verified.', 'Estimate');
  scalar('ALT_3', "Z''-EM coefficient X3", 6.72, 'ps', 'Unconfirmed until verified.', 'Estimate');
  scalar('ALT_4', "Z''-EM coefficient X4", 1.05, 'ps', 'Unconfirmed until verified.', 'Estimate');
  scalar('ALT_SAFE', "Z''-EM safe zone above", 5.85, 'ps', 'Unconfirmed until verified.', 'Estimate');
  scalar('ALT_GREY', "Z''-EM grey zone from", 4.35, 'ps', 'Unconfirmed until verified.', 'Estimate');
  inp.tranches.forEach((t, k) => {
    scalarHead(`Tranche: ${t.name}`);
    scalar(`TR${k}_USD`, 'USD denominated: 1 yes', t.currency === 'USD' ? 1 : 0, 'plain', 'Hand-built debt case or user input.');
    scalar(`TR${k}_FLOAT`, 'Floating: 1 yes', t.rateType === 'floating' ? 1 : 0, 'plain', 'Hand-built debt case or user input.');
    scalar(`TR${k}_FIXED`, 'Fixed rate', t.fixedRate, 'pct', 'Hand-built debt case or user input.');
    scalar(`TR${k}_SPREAD`, 'Spread over floating base', t.spread, 'pct', 'Hand-built debt case or user input.');
  });

  rI += 1;
  const histTitle = rI;
  headerRow(inW, rI); inW.getCell(rI, 2).value = 'Historicals, as reported in the model sign'; rI++;
  // One line per standard account, summing mapped company lines.
  const acc = H.map(y => accountsForYear(inp.historicals, y));
  const repVal = (id: string, y: number) => inp.historicals.reported.find(x => x.id === id)?.values[String(y)];
  const histRowOf: Record<string, number> = {};
  const histIds = new Set<string>();
  acc.forEach(a => Object.keys(a).forEach(k => histIds.add(k)));
  inp.historicals.reported.filter(x => x.id.startsWith('cf_')).forEach(x => histIds.add(x.id));
  const labelOf = new Map(specs.map(x => [x.id, x.label]));
  const lineLabel = new Map(inp.historicals.lines.map(l => [l.mapsTo as string, l.label]));
  for (const id of [...histIds, 'fx_close', 'fx_avg', 'rev_close', ...inp.tranches.map((_, k) => `tr${k}_close`)]) {
    histRowOf[id] = rI;
    const l = inW.getCell(rI, 2); l.value = labelOf.get(id) ?? lineLabel.get(id) ?? id; setFont(l, BLACK);
    inW.getCell(rI, 3).value = id === 'fx_close' || id === 'fx_avg' ? 'EGP/USD' : id === 'shares' ? 'n' : 'EGP'; setFont(inW.getCell(rI, 3), BLACK);
    H.forEach((y, i) => {
      let v: number | undefined = acc[i][id];
      if (id.startsWith('cf_') && v === undefined) v = repVal(id, y);
      if (i === nH - 1) {
        if (id === 'fx_close') v = st.fxHistClose;
        if (id === 'fx_avg') v = st.fxHistAvg;
        if (id === 'rev_close') v = 0;
        const m = id.match(/^tr(\d+)_close$/);
        if (m) v = inp.tranches[+m[1]].openingEgp;
      }
      if (v !== undefined) { const c = inW.getCell(rI, col(i)); c.value = v; setFont(c, BLUE); c.numFmt = id === 'fx_close' || id === 'fx_avg' ? FMT.fx : id === 'shares' ? FMT.int : FMT.egp; }
    });
    const nc = inW.getCell(rI, notesCol);
    nc.value = id === 'fx_close' || id === 'fx_avg' ? 'Sourced fact: note 35 of the FY2025 statements.' : 'Sourced fact: audited statements, read from the PDF.';
    setFont(nc, BLACK);
    rI++;
  }
  void histTitle;

  rI += 1;
  headerRow(inW, rI); inW.getCell(rI, 2).value = 'Drivers: three explicit sets and the active row'; rI++;
  let lastGroup = '';
  for (const spec of DRIVERS) {
    if (spec.group !== lastGroup) { const c = inW.getCell(rI, 2); c.value = spec.group; setFont(c, BLACK, true); rI++; lastGroup = spec.group; }
    const start = rI;
    SCEN.forEach(sc => {
      const l = inW.getCell(rI, 2); l.value = `${spec.label} - ${sc}`; setFont(l, BLACK);
      inW.getCell(rI, 3).value = unitOf(spec.fmt); setFont(inW.getCell(rI, 3), BLACK);
      for (let i = 0; i < nY; i++) { const c = inW.getCell(rI, col(nH + i)); c.value = inp.scenarios[sc][spec.key][i]; setFont(c, BLUE); c.numFmt = FMT[spec.fmt]; }
      rI++;
    });
    const l = inW.getCell(rI, 2); l.value = `${spec.label} - active`; setFont(l, BLACK, true);
    inW.getCell(rI, 3).value = unitOf(spec.fmt); setFont(inW.getCell(rI, 3), BLACK);
    for (let i = 0; i < nY; i++) {
      const cl = colName(col(nH + i));
      const c = inW.getCell(rI, col(nH + i));
      c.value = { formula: `CHOOSE(SCENARIO,${cl}${start},${cl}${start + 1},${cl}${start + 2})` } as ExcelJS.CellFormulaValue;
      setFont(c, BLACK); c.numFmt = FMT[spec.fmt]; c.border = { top: { style: 'thin' } };
    }
    const nc = inW.getCell(rI, notesCol); nc.value = `${spec.tag}: ${spec.note}`; setFont(nc, BLACK);
    layout.cells[`d_${spec.key}`] = { sheet: 'Inputs', row: rI, fmt: spec.fmt };
    rI++;
  }
  inp.tranches.forEach((t, k) => {
    for (const [key, lab] of [['borrow', 'borrowed'], ['repay', 'scheduled repayment']] as const) {
      const l = inW.getCell(rI, 2); l.value = `${t.name}: ${lab}, tranche currency`; setFont(l, BLACK);
      for (let i = 0; i < nY; i++) { const c = inW.getCell(rI, col(nH + i)); c.value = t[key][i]; setFont(c, BLUE); c.numFmt = FMT.egp; }
      layout.cells[`in_tr${k}_${key}`] = { sheet: 'Inputs', row: rI, fmt: 'egp' };
      rI++;
    }
  });

  // ---------- Assign rows on calculation sheets ----------
  const cursor: Record<string, number> = { Model: 5, Schedules: 5, Ratios: 5 };
  const place: { spec: RowSpec; row: number }[] = [];
  const sectionRows: Record<string, { row: number; title: string }[]> = { Model: [], Schedules: [], Ratios: [] };
  let lastSec = '';
  for (const s of specs) {
    if (s.section !== lastSec) {
      if (lastSec) cursor[s.sheet] += 1;
      sectionRows[s.sheet].push({ row: cursor[s.sheet], title: s.section });
      cursor[s.sheet] += 2;
      lastSec = s.section;
    }
    layout.cells[s.id] = { sheet: s.sheet, row: cursor[s.sheet], fmt: s.fmt };
    place.push({ spec: s, row: cursor[s.sheet] });
    cursor[s.sheet]++;
  }

  const resolve = (tpl: string, sheetName: string, i: number): string | null => {
    let failed = false;
    const ref = (id: string, at: number, abs = false): string => {
      if (at < 0 || at >= n) { failed = true; return '#'; }
      const cell = layout.cells[id];
      if (!cell) throw new Error(`Unknown row ${id} in ${tpl}`);
      const cl = colName(col(at));
      const a = abs ? `$${cl}$${cell.row}` : `${cl}${cell.row}`;
      return cell.sheet === sheetName ? a : `${cell.sheet}!${a}`;
    };
    const out = tpl.replace(/\[([a-z0-9_]+)(@-1|@first|@last)?\]:\[([a-z0-9_]+)\]/gi, (_, a, _m, b) => `${ref(a, i)}:${ref(b, i).replace(/^.*!/, '')}`)
      .replace(/\[([a-z0-9_]+)(@-1|@first|@last)?\]/gi, (_, id, m) => {
        if (m === '@-1') return ref(id, i - 1);
        if (m === '@first') return ref(id, nH, true);
        if (m === '@last') return ref(id, n - 1, true);
        return ref(id, i);
      });
    return failed ? null : out;
  };
  // A historical formula exists only when every referenced row has a value in that column.
  const available: Record<string, boolean[]> = {};
  const specById = new Map(specs.map(s => [s.id, s]));
  const histValue = (id: string, i: number) => { const r = histRowOf[id]; return r !== undefined && inW.getCell(r, col(i)).value !== null && inW.getCell(r, col(i)).value !== undefined; };
  const isAvail = (id: string, i: number): boolean => {
    if (i < 0) return false;
    if (i >= nH) return true;
    available[id] ??= [];
    if (available[id][i] !== undefined) return available[id][i];
    available[id][i] = false;
    const s = specById.get(id);
    let res = false;
    if (!s) res = histValue(id, i);
    else if (s.h === undefined) res = histValue(id, i);
    else if (s.h === 'ZERO') res = true;
    else if (s.h.startsWith('INPUT:')) res = histValue(s.h.slice(6), i);
    else {
      const tpl = s.h === 'same' ? (s.f as string) : s.h;
      res = true;
      if (/\[[a-z0-9_]+\]:\[/i.test(tpl)) {
        const [, a, b] = tpl.match(/\[([a-z0-9_]+)\]:\[([a-z0-9_]+)\]/i) as RegExpMatchArray;
        const ra = layout.cells[a].row, rb = layout.cells[b].row;
        for (const x of specs) { const c = layout.cells[x.id]; if (c.sheet === layout.cells[a].sheet && c.row >= ra && c.row <= rb && !isAvail(x.id, i)) res = false; }
      }
      for (const m of tpl.matchAll(/\[([a-z0-9_]+)(@-1|@first|@last)?\]/gi)) {
        if (m[1].startsWith('d_') || m[1].startsWith('in_')) continue;
        const at = m[2] === '@-1' ? i - 1 : m[2] === '@last' ? n - 1 : m[2] === '@first' ? nH : i;
        if (!isAvail(m[1], at)) { res = false; break; }
      }
    }
    available[id][i] = res;
    return res;
  };

  // ---------- Write calculation sheets ----------
  for (const shName of ['Model', 'Schedules', 'Ratios']) {
    headerRow(S[shName], 4);
    for (const sr of sectionRows[shName]) { const c = S[shName].getCell(sr.row, 2); c.value = sr.title; setFont(c, BLACK, true); }
  }
  for (const { spec, row } of place) {
    const ws = S[spec.sheet];
    const l = ws.getCell(row, 2); l.value = spec.label; setFont(l, BLACK, !!spec.total);
    const u = ws.getCell(row, 3); u.value = unitOf(spec.fmt); setFont(u, BLACK);
    for (let i = 0; i < n; i++) {
      const c = ws.getCell(row, col(i));
      let formula: string | null = null;
      if (i < nH) {
        if (!isAvail(spec.id, i)) continue;
        if (spec.h === undefined) { const hr = histRowOf[spec.id]; formula = `Inputs!${colName(col(i))}${hr}`; }
        else if (spec.h === 'ZERO') { const hr = histRowOf[spec.id]; formula = hr !== undefined && histValue(spec.id, i) ? `Inputs!${colName(col(i))}${hr}` : '0'; }
        else if (spec.h.startsWith('INPUT:')) { const hr = histRowOf[spec.h.slice(6)]; formula = `Inputs!${colName(col(i))}${hr}`; }
        else formula = resolve(spec.h === 'same' ? (spec.f as string) : spec.h, spec.sheet, i);
      } else if (spec.f !== undefined) {
        formula = resolve(spec.f, spec.sheet, i);
      }
      if (formula === null) continue;
      c.value = { formula } as ExcelJS.CellFormulaValue;
      setFont(c, BLACK, !!spec.total);
      c.numFmt = FMT[spec.fmt];
      if (spec.total) c.border = { top: { style: 'thin' } };
    }
    if (spec.total) { l.border = { top: { style: 'thin' } }; u.border = { top: { style: 'thin' } }; }
  }

  // ---------- Summary ----------
  headerRow(S.Summary, 4, false);
  const summaryIds = ['revenue', 'gross_profit', 'ebitda', 'op_profit', 'net_profit', 'eps', 'cash', 'total_assets', 'total_equity', 'net_debt', 'cf_cfo', 'fcff', 'gross_margin', 'net_margin', 'roic', 'current_ratio', 'altman_z', 'piotroski'];
  summaryIds.forEach((id, k) => {
    const row = 5 + k; const cell = layout.cells[id];
    const l = S.Summary.getCell(row, 2); l.value = specById.get(id)?.label; setFont(l, BLACK);
    const u = S.Summary.getCell(row, 3); u.value = unitOf(cell.fmt); setFont(u, BLACK);
    for (let i = 0; i < n; i++) {
      if (!isAvail(id, i)) continue;
      const c = S.Summary.getCell(row, col(i));
      c.value = { formula: `${cell.sheet}!${colName(col(i))}${cell.row}` } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.numFmt = FMT[cell.fmt];
    }
  });

  // ---------- Scenarios ----------
  headerRow(S.Scenarios, 4, false);
  let rS = 5;
  const keyDrivers = ['g_export', 'g_domestic', 'gas_pct', 'other_cogs_pct', 'sell_pct', 'ga_pct', 'capex_direct', 'capex_puc', 'payout', 'fx_close'];
  const titleS = (t: string) => { const c = S.Scenarios.getCell(rS, 2); c.value = t; setFont(c, BLACK, true); rS++; };
  titleS('Drivers side by side');
  for (const key of keyDrivers) {
    const spec = DRIVERS.find(x => x.key === key)!;
    const activeRow = layout.cells[`d_${key}`].row;
    SCEN.forEach((sc, k) => {
      const l = S.Scenarios.getCell(rS, 2); l.value = `${spec.label} - ${sc}`; setFont(l, BLACK);
      S.Scenarios.getCell(rS, 3).value = unitOf(spec.fmt); setFont(S.Scenarios.getCell(rS, 3), BLACK);
      for (let i = 0; i < nY; i++) { const cl = colName(col(nH + i)); const c = S.Scenarios.getCell(rS, col(nH + i)); c.value = { formula: `Inputs!${cl}${activeRow - 3 + k}` } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.numFmt = FMT[spec.fmt]; }
      rS++;
    });
  }
  rS++;
  titleS('Outputs, active scenario only (live)');
  for (const id of ['revenue', 'ebitda', 'net_profit', 'cash', 'net_debt', 'fcff']) {
    const cell = layout.cells[id];
    const l = S.Scenarios.getCell(rS, 2); l.value = specById.get(id)?.label; setFont(l, BLACK);
    S.Scenarios.getCell(rS, 3).value = unitOf(cell.fmt); setFont(S.Scenarios.getCell(rS, 3), BLACK);
    for (let i = 0; i < n; i++) { if (!isAvail(id, i)) continue; const c = S.Scenarios.getCell(rS, col(i)); c.value = { formula: `${cell.sheet}!${colName(col(i))}${cell.row}` } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.numFmt = FMT[cell.fmt]; }
    rS++;
  }

  // ---------- Sensitivity: the only static engine block ----------
  const SE = S.Sensitivity;
  const g = opt.grid;
  const hdr = SE.getCell(4, 2); hdr.value = `Engine output – static, generated ${opt.generatedDate}`; setFont(hdr, BLACK, true);
  let rE = 6;
  const blockFrom = rE;
  const blocks: [string, number[][]][] = [[`Net profit, ${g.period}`, g.netProfit], [`Ending cash, ${g.period}`, g.endingCash], [`Net debt, ${g.period}`, g.netDebt]];
  const centreRows: number[] = [];
  for (const [title, m] of blocks) {
    const t = SE.getCell(rE, 2); t.value = `${title}: revenue growth shift (down) x gross margin shift (across)`; setFont(t, BLACK, true); rE++;
    g.marginShifts.forEach((v, k) => { const c = SE.getCell(rE, 4 + k); c.value = v; c.numFmt = FMT.pct; setFont(c, BLACK, true); c.border = { bottom: { style: 'thin' } }; });
    rE++;
    m.forEach((row, a) => {
      const lab = SE.getCell(rE, 3); lab.value = g.growthShifts[a]; lab.numFmt = FMT.pct; setFont(lab, BLACK, true);
      row.forEach((v, b) => { const c = SE.getCell(rE, 4 + b); c.value = v; c.numFmt = FMT.egp; setFont(c, BLUE); });
      if (a === 2) centreRows.push(rE);
      rE++;
    });
    rE++;
  }
  layout.whitelistValueBlock = { sheet: 'Sensitivity', from: blockFrom, to: rE };
  SE.getColumn(2).width = 22; SE.getColumn(3).width = 10;
  for (let k = 0; k < 5; k++) SE.getColumn(4 + k).width = 20;

  // ---------- Checks ----------
  const CK = S.Checks;
  headerRow(CK, 4, false);
  let rC = 5;
  const lastHist = colName(col(nH - 1));
  const bsRow = layout.cells.balance_check.row;
  const ckRows: number[] = [];
  const checkRow = (label: string, tpl: string) => {
    const l = CK.getCell(rC, 2); l.value = label; setFont(l, BLACK);
    const u = CK.getCell(rC, 3); u.value = 'pass'; setFont(u, BLACK);
    for (let i = nH; i < n; i++) {
      const c = CK.getCell(rC, col(i));
      c.value = { formula: resolve(tpl, 'Checks', i) as string } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.alignment = { horizontal: 'right' };
    }
    ckRows.push(rC); rC++;
  };
  checkRow('Total assets = liabilities + equity, net of the opening gap', `ABS([balance_check]-Model!$${lastHist}$${bsRow})<=TOL`);
  checkRow('CF closing cash = BS cash', 'ABS([cf_close]-[cash])<=TOL');
  checkRow('RE roll-forward', 'ABS([re]-[s_re])<=TOL');
  checkRow('Legal reserve roll-forward', 'ABS([legal_reserve]-[legal_reserve@-1]-[s_lr_transfer])<=TOL');
  checkRow('Capital roll-forward', 'ABS([capital]-[capital@-1]-[bonus_total])<=TOL');
  checkRow('PP&E net + PUC = BS fixed assets', 'ABS([ppe_nbv]+[puc]-[fixed_assets])<=TOL');
  checkRow('Lease current + non-current = total', 'ABS([lease_cur]+[lease_nc]-[lease_total])<=TOL');
  checkRow('Benefits current + non-current = total', 'ABS([ebo_cur]+[ebo_nc]-[ebo_total])<=TOL');
  checkRow('Borrowings current + non-current = total', 'ABS([debt_cur]+[debt_nc]-[debt_total])<=TOL');
  checkRow('Segments sum to net sales', 'ABS([seg_urea]+[seg_ammonia]+[seg_other]-[revenue])<=TOL');
  checkRow('Markets sum to net sales', 'ABS([rev_export]+[rev_domestic]-[revenue])<=TOL');
  checkRow('IS revenue = schedule revenue', 'ABS([revenue]-[s_revenue])<=TOL');
  // Historical tie-outs as formulas, for each year that has the lines loaded.
  rC++;
  const histHead = CK.getCell(rC, 2); histHead.value = 'Historical tie-outs'; setFont(histHead, BLACK, true); rC++;
  const histCheck = (label: string, tpl: string, ids: string[], tol = 'TOL') => {
    const l = CK.getCell(rC, 2); l.value = label; setFont(l, BLACK);
    const u = CK.getCell(rC, 3); u.value = 'pass'; setFont(u, BLACK);
    let any = false;
    for (let i = 0; i < nH; i++) {
      if (!ids.every(id => isAvail(id, i))) continue;
      const c = CK.getCell(rC, col(i));
      c.value = { formula: `ABS(${resolve(tpl, 'Checks', i)})<=${tol}` } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.alignment = { horizontal: 'right' }; any = true;
    }
    if (any) ckRows.push(rC);
    rC++;
  };
  histCheck('BS balances (1 EGP documented, source note 9)', '[total_assets]-[total_le]', ['total_assets', 'total_le']);
  histCheck('Segments sum to net sales', '[seg_urea]+[seg_ammonia]+[seg_other]-[revenue]', ['seg_urea', 'seg_ammonia', 'seg_other', 'revenue']);
  histCheck('CFO + CFI + CFF = net change', '[cf_cfo]+[cf_cfi]+[cf_cff]-[cf_net]', ['cf_cfo', 'cf_cfi', 'cf_cff', 'cf_net']);
  histCheck('Cash bridge = BS cash', '[cf_open]+[cf_net]+[cf_fx_cash]+[cf_ecl_cash]-[cash]', ['cf_open', 'cf_net', 'cf_fx_cash', 'cf_ecl_cash', 'cash']);
  rC++;
  const sensCheckRow = rC;
  {
    const l = CK.getCell(rC, 2); l.value = 'Sensitivity centre = live Model (net profit, cash, net debt); valid for the exported scenario and overlay 0'; setFont(l, BLACK);
    const ids: [string, number][] = [['net_profit', centreRows[0]], ['cash', centreRows[1]], ['net_debt', centreRows[2]]];
    ids.forEach(([id, sr], k) => {
      const cell = layout.cells[id];
      const c = CK.getCell(rC, 4 + k);
      c.value = { formula: `ABS(Sensitivity!F${sr}-${cell.sheet}!${colName(col(n - 1))}${cell.row})<=TOL` } as ExcelJS.CellFormulaValue; setFont(c, BLACK); c.alignment = { horizontal: 'right' };
    });
    rC += 2;
  }
  const master = CK.getCell(rC, 2); master.value = 'Master check'; setFont(master, BLACK, true);
  const firstC = colName(FIRST_COL), lastC = colName(FIRST_COL + n - 1);
  const parts = ckRows.map(r => `${firstC}${r}:${lastC}${r}`);
  parts.push(`D${sensCheckRow}:F${sensCheckRow}`);
  const mCell = CK.getCell(rC, 4);
  mCell.value = { formula: `AND(${parts.join(',')})` } as ExcelJS.CellFormulaValue; setFont(mCell, BLACK, true); mCell.alignment = { horizontal: 'right' };
  name('MASTER_CHECK', 'Checks', rC);
  // Red only for a failed check.
  CK.addConditionalFormatting({ ref: `D5:${lastC}${rC}`, rules: [{ type: 'cellIs', operator: 'equal', formulae: ['FALSE'], priority: 1, style: { font: { color: { argb: RED } } } }] });

  // ---------- Cover ----------
  const C = S.Cover;
  const coverRows: [string, ExcelJS.CellValue][] = [
    ['Company', company], ['Ticker', inp.company.ticker], ['Fiscal year end', inp.company.fiscalYearEndMonth === 12 ? 'December' : 'June'],
    ['Units', 'Full absolute EGP'], ['Rates snapshot hash', rates.hash], ['Rates snapshot frozen', rates.frozenAt.slice(0, 10)],
    ['Generated', opt.generatedDate],
  ];
  coverRows.forEach(([a, b], k) => { const l = C.getCell(5 + k, 2); l.value = a; setFont(l, BLACK); const v = C.getCell(5 + k, 4); v.value = b; setFont(v, BLACK); });
  const ml = C.getCell(13, 2); ml.value = 'Master check'; setFont(ml, BLACK, true);
  const mv = C.getCell(13, 4); mv.value = { formula: 'MASTER_CHECK' } as ExcelJS.CellFormulaValue; setFont(mv, BLACK, true);
  C.addConditionalFormatting({ ref: 'D13', rules: [{ type: 'cellIs', operator: 'equal', formulae: ['FALSE'], priority: 1, style: { font: { color: { argb: RED } } } }] });
  const al = C.getCell(14, 2); al.value = 'Active scenario'; setFont(al, BLACK);
  const av = C.getCell(14, 4); av.value = { formula: 'CHOOSE(SCENARIO,"Bear","Base","Bull")' } as ExcelJS.CellFormulaValue; setFont(av, BLACK);
  const sl = C.getCell(15, 2); sl.value = 'Circularity switch'; setFont(sl, BLACK);
  const sv = C.getCell(15, 4); sv.value = { formula: 'SW_CIRC' } as ExcelJS.CellFormulaValue; setFont(sv, BLACK); sv.numFmt = '0';
  const cl = C.getCell(17, 2); cl.value = 'Contents'; setFont(cl, BLACK, true); cl.border = { bottom: { style: 'thin' } };
  sheets.slice(1).forEach((s, k) => { const a = C.getCell(18 + k, 2); a.value = s; setFont(a, BLACK); const b = C.getCell(18 + k, 4); b.value = sub[s]; setFont(b, BLACK); });
  C.getColumn(2).width = 28; C.getColumn(3).width = 4; C.getColumn(4).width = 120;

  // ---------- Widths ----------
  for (const shName of ['Summary', 'Inputs', 'Model', 'Schedules', 'Ratios', 'Scenarios', 'Checks']) {
    const ws = S[shName];
    let maxLabel = 20;
    ws.eachRow((row, rn) => { if (rn >= 4) { const v = row.getCell(2).value; if (typeof v === 'string') maxLabel = Math.max(maxLabel, v.length); } });
    ws.getColumn(2).width = Math.min(90, maxLabel + 2);
    ws.getColumn(3).width = 9;
    for (let i = 0; i < n; i++) ws.getColumn(col(i)).width = 21;
    if (shName !== 'Summary' && shName !== 'Scenarios' && shName !== 'Checks') ws.getColumn(notesCol).width = 80;
  }

  const raw = await wb.xlsx.writeBuffer();
  // ExcelJS does not write the iterate attributes; patch calcPr.
  const zip = await JSZip.loadAsync(raw as ArrayBuffer);
  let xml = await zip.file('xl/workbook.xml')!.async('string');
  const calcPr = '<calcPr calcId="191029" fullCalcOnLoad="1" iterate="1" iterateCount="100" iterateDelta="0.001"/>';
  xml = /<calcPr[^>]*\/>/.test(xml) ? xml.replace(/<calcPr[^>]*\/>/, calcPr) : xml.replace('</workbook>', `${calcPr}</workbook>`);
  zip.file('xl/workbook.xml', xml);
  const buffer = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  void getRate;
  return { buffer, layout };
}
