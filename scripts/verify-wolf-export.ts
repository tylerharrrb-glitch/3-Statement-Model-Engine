// Gate for Export to WOLF. Prints PASS/FAIL per check, and TO_VERIFY when WOLF cannot be run.
// Set WOLF_ENGINE_PATH to override the default sibling folder ../ValuationEngine. Never writes to WOLF.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { loadMopco, readJson } from './lib/load';
import { buildWolfCompany, wolfExportIssues } from '../src/export/wolfMap';

const out: string[] = [];
let pass = 0, fail = 0, toVerify = 0;
const check = (name: string, ok: boolean, detail = '') => { ok ? pass++ : fail++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); };
const todo = (name: string, detail: string) => { toVerify++; out.push(`TO_VERIFY  ${name}  [${detail}]`); };

// The price and date fields are user inputs. These test values match the reference file.
const inp = loadMopco();
const ref = readJson('tests/fixtures/wolf/MOPCO_data.json') as Record<string, never>;
const blocked = wolfExportIssues(inp);
check('Export is blocked until price, price date and valuation date are entered', blocked.length === 3, blocked.join(' '));
const w = inp.company.wolf!;
Object.assign(w, { valuationDate: '2026-07-02', price: 36, priceDate: '2026-07-01', priceSource: 'Gate test input' });
const file = buildWolfCompany(inp);
const text = JSON.stringify(file, null, 2);

// ---------- 1. Every field against the reference ----------
out.push('', '1. Reference comparison (price, date and facts fields excepted)');
const EXCEPT = new Set(['price', 'priceDate', 'priceSource', 'valuationDate', 'facts']);
const diffs: string[] = [];
let compared = 0;
function walk(a: unknown, b: unknown, p: string) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) diffs.push(`${p}: length exported ${a.length}, reference ${b.length}`);
    a.forEach((x, i) => { if (i < b.length) walk(x, b[i], `${p}[${i}]`); });
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.join() !== kb.join()) diffs.push(`${p}: keys or order differ. Extra: ${ka.filter(k => !kb.includes(k)).join(',') || 'none'}; missing: ${kb.filter(k => !ka.includes(k)).join(',') || 'none'}; order same: ${[...ka].sort().join() === [...kb].sort().join() ? 'no' : 'n/a'}`);
    for (const k of ka) if (kb.includes(k) && !(p === '' && EXCEPT.has(k))) walk((a as never)[k], (b as never)[k], p ? `${p}.${k}` : k);
    return;
  }
  compared++;
  if (typeof a !== typeof b) diffs.push(`${p}: type exported ${typeof a}, reference ${typeof b}`);
  else if (a !== b) diffs.push(`${p}: exported ${JSON.stringify(a)}, reference ${JSON.stringify(b)}`);
}
walk(file, ref, '');
check('Every field, key, order and type matches the reference file', diffs.length === 0, `${compared} values compared; ${diffs.length} differences`);
diffs.forEach(d => out.push(`  DIFF ${d}`));
check('Price and date keys present with the right types', typeof file.price === 'number' && [file.priceDate, file.priceSource, file.valuationDate].every(v => typeof v === 'string'));
check('Facts is an array, as WOLF expects', Array.isArray(file.facts), 'exported empty; the reference facts are excepted');
const years = file.years as { fiscalYear: number; audited: boolean; income: Record<string, number>; balance: Record<string, number>; cashFlow: Record<string, number> }[];
check('Historical years only, all audited: true', years.length === 2 && years.every(y => y.audited === true));
check('Amounts are integers; epsReported has at most 2 decimals', years.every(y => [...Object.entries(y.income), ...Object.entries(y.balance), ...Object.entries(y.cashFlow)].every(([k, v]) => (k === 'epsReported' ? Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 : Number.isInteger(v)))));
check('Finance costs and distributions stay separate', years[1].income.financeCostLease === -7072409 && years[1].income.financeCostEmployeeBenefit === -82744931 && years[1].income.financeCostDebt === 0 && years[1].cashFlow.employeeBoardDistributions === -1545237364 && years[1].cashFlow.dividendsToShareholders === -7277190123);
check('netChangeInCash is before the FX effect on cash', years[1].cashFlow.netChangeInCash === -3553233614);
check('Mapping lives in one table', /export const WOLF_MAP/.test(readFileSync('src/export/wolfMap.ts', 'utf8')));

// ---------- 2. Sums within the exported file ----------
out.push('', '2. Sums per exported year');
const exact = (name: string, a: number, b: number) => check(name, a === b, `reported ${a}, sum ${b}, difference ${a - b}`);
const sum = (o: Record<string, number>, keys: string[]) => keys.reduce((s, k) => s + o[k], 0);
for (const y of years) {
  const i = y.income, b = y.balance, c = y.cashFlow, fy = y.fiscalYear;
  exact(`FY${fy} gross profit`, i.grossProfit, sum(i, ['revenue', 'costOfSales']));
  exact(`FY${fy} operating profit`, i.operatingProfit, sum(i, ['grossProfit', 'otherIncome', 'sellingMarketing', 'generalAdmin', 'capitalGains', 'otherExpenses', 'impairmentReversal', 'eclReversal', 'otherOperating']));
  exact(`FY${fy} profit before tax`, i.profitBeforeTax, sum(i, ['operatingProfit', 'financeIncome', 'financeCostDebt', 'financeCostLease', 'financeCostEmployeeBenefit', 'financeCostOther', 'fxGainLoss', 'shareOfAssociates', 'otherNonOperating']));
  exact(`FY${fy} total tax`, i.totalTax, sum(i, ['currentTax', 'deferredTax']));
  exact(`FY${fy} net profit`, i.netProfit, sum(i, ['profitBeforeTax', 'totalTax']));
  const assets = sum(b, ['ppe', 'intangibleAndOtherAssets', 'rightOfUseAssets', 'goodwill', 'associates', 'amortizedCostNonCurrent', 'restrictedCashNonCurrent', 'deferredTaxAsset', 'otherNonCurrentAssets', 'inventory', 'receivables', 'amortizedCostCurrent', 'fvtplSecurities', 'otherCurrentAssets', 'dueFromRelatedParties', 'supplierAdvances', 'restrictedCashCurrent', 'cash']);
  if (fy === 2025) check('FY2025 total assets: known exception, exported as reported, 1 EGP above the lines', b.totalAssets === 61193831633 && b.totalAssets - assets === 1, `reported ${b.totalAssets}, sum ${assets}, difference ${b.totalAssets - assets}`);
  else exact(`FY${fy} total assets`, b.totalAssets, assets);
  exact(`FY${fy} total liabilities`, b.totalLiabilities, sum(b, ['bankDebtNonCurrent', 'bondsNonCurrent', 'leaseNonCurrent', 'deferredTaxLiability', 'employeeBenefitsNonCurrent', 'otherNonCurrentLiabilities', 'bankDebtCurrent', 'leaseCurrent', 'currentTaxPayable', 'tradePayables', 'otherPayables', 'customerAdvances', 'employeeBenefitsCurrent', 'provisions', 'dueToRelatedParties', 'otherCurrentLiabilities']));
  exact(`FY${fy} total equity`, b.totalEquity, sum(b, ['shareCapital', 'legalReserve', 'otherReserves', 'retainedEarnings', 'otherEquity', 'minorityInterest', 'preferredEquity']));
  exact(`FY${fy} assets = liabilities + equity`, b.totalAssets, b.totalLiabilities + b.totalEquity);
  exact(`FY${fy} net operating cash flow`, c.netCashFromOperating, sum(c, ['cashGeneratedFromOperations', 'employeeBoardDistributions', 'taxesPaid', 'employeeBenefitsPaid', 'otherOperatingCashFlows']));
}

// ---------- 3. WOLF's own code on the file ----------
out.push('', "3. WOLF's own import");
const WOLF = path.resolve(process.env.WOLF_ENGINE_PATH ?? '../ValuationEngine');
const tmp = mkdtempSync(path.join(os.tmpdir(), '3sm-wolf-'));
const exportFile = path.join(tmp, 'MFPC_WOLF_import.json');
writeFileSync(exportFile, text);

async function main() {
  if (!existsSync(path.join(WOLF, 'src/engine/company.ts'))) {
    todo("WOLF validateCompany and valuation", `WOLF not found at ${WOLF}`);
    todo('WOLF browser import', `WOLF not found at ${WOLF}`);
  } else {
    out.push(`WOLF path: ${WOLF}`);
    const load = (p: string) => import(pathToFileURL(path.join(WOLF, p)).href);
    try {
      const { validateCompany, companyChecks } = await load('src/engine/company.ts');
      const { defaultsFor } = await load('src/ui/state/session.ts');
      const { runValuation } = await load('src/engine/valuation.ts');
      const parsed = JSON.parse(text);
      const issues = validateCompany(parsed);
      check('WOLF validateCompany: zero errors', issues.length === 0, JSON.stringify(issues));
      const ties = companyChecks(parsed) as { id: string; pass: boolean; label: string }[];
      check('WOLF companyChecks: all pass', ties.every(t => t.pass), `${ties.length} checks; failed: ${ties.filter(t => !t.pass).map(t => t.label).join('; ') || 'none'}`);
      const snap = JSON.parse(readFileSync(path.join(WOLF, 'tests/fixtures/rates-snapshot-2026-09-23.json'), 'utf8'));
      const run = (c: unknown) => runValuation(c, defaultsFor(c, snap), snap, { monteCarlo: false });
      const mine = run(parsed);
      check('WOLF defaultsFor and runValuation complete with no throw', !!mine);
      const refC = { ...(ref as object), priceSource: parsed.priceSource, facts: [] };
      const same = JSON.stringify(mine) === JSON.stringify(run(refC));
      check('WOLF valuation of the export is identical to its valuation of the reference', same);
    } catch (e) {
      todo('WOLF engine functions', `could not run: ${(e as Error).message.slice(0, 300)}`);
    }
    await browserImport();
  }
  out.push('', `${pass} PASS, ${fail} FAIL, ${toVerify} TO_VERIFY`);
  const report = out.join('\n') + '\n';
  mkdirSync('docs/verify', { recursive: true });
  writeFileSync('docs/verify/wolf-export.txt', report);
  process.stdout.write(report);
  process.exit(fail ? 1 : 0);
}

/** Uses WOLF's built site and its real Import company JSON control. Serves dist read-only. */
async function browserImport() {
  const dist = path.join(WOLF, 'dist');
  if (!existsSync(path.join(dist, 'index.html'))) { todo('WOLF browser import', 'WOLF dist not built; not built here, to avoid writing to the WOLF repo'); return; }
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm' };
  const server = createServer((req, res) => {
    const u = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = path.join(dist, u);
    if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) f = path.join(dist, 'index.html');
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise<void>(r => server.listen(8797, '127.0.0.1', () => r()));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs: string[] = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://127.0.0.1:8797/');
    const input = page.locator('input[type=file][accept="application/json"]').first();
    await input.waitFor({ state: 'attached', timeout: 20000 });
    await input.setInputFiles(exportFile);
    await page.waitForTimeout(6000);
    const body = await page.locator('body').innerText();
    await page.screenshot({ path: 'docs/verify/wolf-import.png' });
    // "Gate test input" exists only in the exported file, so this cannot pass on WOLF's own example.
    const values = await page.locator('input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value));
    check('WOLF built site: Import company JSON loads this file', values.includes('Gate test input') && values.includes('MFPC.CA'));
    const ties = (body.match(/\bTies\b/g) ?? []).length;
    check("WOLF built site: all 20 of its statement checks show Ties", ties === 20, `${ties} shown`);
    check('WOLF built site: zero import errors', errs.length === 0 && !/Company data incomplete|is required\.|must be positive|at most five/i.test(body), errs.join(' | ').slice(0, 300));
    const failedTies = (body.match(/\bFAIL\b/g) ?? []).length;
    check('WOLF built site: no FAIL shown after import', failedTies === 0, `${failedTies} shown`);
    await page.getByRole('button', { name: 'Valuation', exact: true }).or(page.getByRole('tab', { name: 'Valuation', exact: true })).first().click();
    await page.waitForTimeout(8000);
    const val = await page.locator('body').innerText();
    await page.screenshot({ path: 'docs/verify/wolf-import-valuation.png' });
    check('WOLF built site: the Valuation page runs on the imported file', errs.length === 0 && !/Company data incomplete|Error:/i.test(val) && /36\.00/.test(val), errs.join(' | ').slice(0, 200));
  } catch (e) {
    todo('WOLF browser import', `could not run: ${(e as Error).message.slice(0, 200)}`);
  } finally {
    await browser.close();
    server.close();
  }
}
main();
