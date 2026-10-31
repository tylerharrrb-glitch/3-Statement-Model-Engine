// Generates docs/METHODOLOGY.md (equations from the row table, in calculation order) and docs/DATA_SOURCES.md.
import { writeFileSync } from 'node:fs';
import { loadMopco, readJson } from './lib/load';
import { buildRows } from '../src/export/excel/rows';
import { DRIVERS } from '../src/export/excel/catalog';
import type { RatesFile } from '../packages/rates-registry/src/index';

const inp = loadMopco();
const rows = buildRows(inp);
const out: string[] = [];
const w = (s = '') => out.push(s);

w('# Methodology');
w();
w('Every equation in the order the engine computes it. Generated from the row table by scripts/gen-docs.ts; do not edit by hand. Amounts are full absolute EGP. Costs are positive in the model.');
w();
w('## Notation');
w();
w('`[x]` is row x in the same year. `[x@-1]` is the prior year. `[x@first]` is the first forecast year. `[x@last]` is the final year. `[d_x]` is driver x of the active scenario. Capitalized names are settings on Inputs: SW_CIRC (circularity), FX_ON, TAX_RATE (registry cit_rate / 100), YIELD_BASE, FLOAT_BASE, SCHED_RATE, PAR, LR_PCT, LR_CAP, OV_GROWTH, OV_MARGIN, USD_* shares of balances, and the mode switches. IF(b=0,0,a/b) protects every division.');
w();
w('## Calculation order within a forecast year');
w();
for (const s of ['1. FX rates and revaluation of opening USD items.', '2. Revenue.', '3. PP&E, PUC, other assets, leases.', '4. Cost of sales and operating costs, to operating profit.', '5. Working capital, provisions, employee benefits, investments.', '6. Debt schedule to scheduled movements; interest on each tranche and the revolver.', '7. Finance income, finance costs, FX line, profit before tax.', '8. Tax, net profit, OCI, tax payable, deferred tax.', '9. Equity: appropriations of prior-year profit, dividends declared and paid, bonus shares, retained earnings.', '10. Cash flow before the revolver and sweep.', '11. Revolver, then cash sweep in tranche order, then closing cash.', '12. Balance sheet totals and checks.', '13. Output rows over every period.']) w(s);
w();
w('## Circularity');
w();
w('One switch. SW_CIRC = 0: interest and finance income use opening balances, one pass, no circularity. SW_CIRC = 1: they use the average of opening and closing balances. The engine repeats steps 1 to 12 for the year, feeding back closing liquid balances, tranche balances and the revolver, until the largest change is under 0.01 EGP, with a cap of 100 iterations, and reports the count per year. 0.01 is stricter than the 1 EGP ceiling in the brief, so that three-way comparisons stay inside 1 EGP after compounding. Lease interest and employee benefit interest always use the opening balance. The Excel file has the same switch, ships at 0, and has iterative calculation enabled.');
w();
w('## No plugs');
w();
w('Cash comes from the cash flow statement. The revolver is the only balancing mechanism: it draws when cash before the revolver would fall below the minimum and repays first from surplus. With the revolver off, cash can fall below the minimum and a warning shows. Nothing is back-solved. The historical cash flow is loaded as reported and never derived from balance-sheet changes.');
w();
w('## Decisions built into the equations');
w();
w('Deferred tax (Decision 8): movement = (tax depreciation - book depreciation) x tax rate, plus unrealized FX x tax rate. There is no full temporary-difference schedule. OCI deferred tax is on the actuarial result.');
w('Current tax is MAX(0, taxable profit) x rate. Tax losses are not carried forward: a proposed item awaiting approval, so tax after a loss year is overstated.');
w('FX: only balances on opening USD shares revalue. Revaluation on cash, investments, other financial assets and USD debt is unrealized and added back in the cash flow. Revaluation on working capital is treated as realized through the working capital movement.');
w('Legal reserve: 5% of prior-year net profit until the reserve reaches 50% of issued capital. FY2025 check: 755,986,968 = 5% x 15,119,739,368.');
w('Statutory rules (Law 159/1981 Art. 40, 41, 88) are from a secondary English translation and must be confirmed against the official Arabic text.');
w('EPS uses closing shares. eps_restated uses the final-year share count, so a bonus issue restates earlier years. MOPCO FY2024 reported EPS of 5.27 is on the restated basis.');
w("Altman Z''-EM: 3.25 + 6.56 X1 + 3.26 X2 + 6.72 X3 + 1.05 X4. Zones 5.85 and 4.35 are unconfirmed: secondary sources give 2.6 and 1.1 before the 3.25 constant, which agrees, but Altman (2005) itself was not read.");
w('Net debt = borrowings + leases - cash and investments (non-current, current, FVTPL). ROIC = NOPAT / average invested capital, one definition everywhere.');
w();
w('## Debt tranches');
w();
w('For tranche k: open = prior close. conv = average FX if USD, else 1. fx = open x FX move if USD, else 0. borrow = input x conv. repay = MIN(input x conv, open + fx + borrow). after = open + fx + borrow - repay. rate = FLOAT_BASE + base delta + spread if floating, else the fixed rate. sweep available = surplus x sweep % for the first tranche, then less prior sweeps. sweep = MIN(available, after). close = after - sweep. interest = rate x IF(SW_CIRC=1, average(open, close), open).');
w();
let section = '';
for (const r of rows) {
  if (r.section !== section) { section = r.section; w(); w(`## ${section}`); w(); }
  const f = r.f ? `${r.id} = ${r.f}` : `${r.id}: historical only`;
  const h = r.h && r.h !== 'same' && r.h !== 'ZERO' ? `  [historical: ${r.h}]` : r.h === 'ZERO' ? '  [historical: reported line or 0]' : r.h === 'same' ? '  [historical: same]' : '';
  w(`- ${f}${h}`);
}
w();
w('## Drivers');
w();
for (const d of DRIVERS) w(`- d_${d.key}: ${d.label} (${d.fmt})`);
writeFileSync('docs/METHODOLOGY.md', out.join('\n') + '\n');

const reg = readJson('data/rates.manual.json') as RatesFile;
const ds = ['# Data Sources', '', 'Generated from data/rates.manual.json by scripts/gen-docs.ts. Free official sources only: no LSEG or Bloomberg.', '', '| id | Value | Nature | Source | URL | As of | Verified | Method | Status |', '|---|---|---|---|---|---|---|---|---|'];
for (const e of reg.entries) ds.push(`| ${e.id} | ${Array.isArray(e.value) ? e.value.join(', ') : e.value ?? 'n/a'} | ${e.nature} | ${e.sourceName} | ${e.sourceUrl} | ${e.asOf ?? 'n/a'} | ${e.verifiedAt ?? 'no'} | ${e.method} | ${e.status} |`);
ds.push('', 'Company data: MOPCO audited FY2025 statements, Crowe Dr. A. M. Hegazy & Co., report dated 9-Mar-2026, as transcribed by the owner. Not cross-checked against the PDF, which was not available.');
writeFileSync('docs/DATA_SOURCES.md', ds.join('\n') + '\n');
console.log(`methodology ${out.length} lines; sources ${reg.entries.length}`);
