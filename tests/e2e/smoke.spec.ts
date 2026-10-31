// Parts 9 and 10. Opens every page, collects console errors and screenshots, and records all network requests.
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const TABS = ['Company', 'Historicals', 'Drivers', 'Income statement', 'Balance sheet', 'Cash flow', 'Schedules', 'Ratios', 'Scenarios', 'Sensitivity', 'Checks', 'Rates', 'Exports', 'Saved models', 'Methodology', 'Data sources'];
const report: Record<string, unknown> = {};

test('every page opens with no console errors, and data stays in the browser', async ({ page }) => {
  mkdirSync('docs/verify/screens', { recursive: true });
  const errors: string[] = [];
  const requests: { url: string; method: string; body: string }[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => requests.push({ url: r.url(), method: r.method(), body: r.postData() ?? '' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Income statement' })).toBeVisible();
  await expect(page.locator('td[data-row="revenue"]').nth(1)).toHaveText('26,844,075,576');
  // Table layout: each period header must sit over its column of figures.
  const head = await page.locator('table.tbl th').nth(2).boundingBox();
  const cell = await page.locator('td[data-row="revenue"]').nth(1).boundingBox();
  expect(Math.abs((head!.x + head!.width) - (cell!.x + cell!.width))).toBeLessThan(2);
  for (const t of TABS) {
    await page.getByRole('button', { name: t, exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/verify/screens/${t.toLowerCase().replace(/ /g, '-')}.png`, fullPage: false });
  }
  // Audit panel.
  await page.getByRole('button', { name: 'Income statement', exact: true }).click();
  await page.locator('td[data-row="gross_profit"]').nth(2).click();
  const panel = page.getByRole('dialog', { name: 'Audit panel' });
  await expect(panel).toContainText('Formula in words');
  await expect(panel).toContainText('Net sales');
  await page.screenshot({ path: 'docs/verify/screens/audit-panel.png' });
  await panel.getByRole('button', { name: 'Close' }).click();
  // Negative with parentheses, same as Excel: cost cash flow lines.
  await page.getByRole('button', { name: 'Cash flow', exact: true }).click();
  await expect(page.locator('td[data-row="cf_capex"]').nth(1)).toHaveText('(5,848,069,006)');
  // Run model at switch 1 and in another scenario.
  await page.getByLabel('Circularity').selectOption('1');
  await page.getByLabel('Scenario', { exact: true }).selectOption('bear');
  await expect(page.getByText('PASS: all checks')).toBeVisible();
  await page.getByLabel('Circularity').selectOption('0');
  await page.getByLabel('Scenario', { exact: true }).selectOption('base');
  // Bank block.
  await page.getByRole('button', { name: 'Company', exact: true }).click();
  await page.getByLabel('Sector').selectOption('bank');
  await expect(page.getByRole('alert').first()).toContainText('the balance sheet is the business');
  await page.screenshot({ path: 'docs/verify/screens/bank-blocked.png' });
  await page.getByLabel('Sector').selectOption('industrial');
  // Unmapped line blocks the run.
  await page.getByRole('button', { name: 'Historicals', exact: true }).click();
  await page.getByRole('button', { name: 'Add line' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Unmapped');
  await page.reload();
  // Excel and JSON exports, and local save, all inside the browser.
  await page.getByRole('button', { name: 'Exports', exact: true }).click();
  const dl1 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel' }).click();
  expect((await dl1).suggestedFilename()).toContain('.xlsx');
  const dl2 = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download WOLF JSON' }).click();
  expect((await dl2).suggestedFilename()).toContain('WOLF');
  await page.getByRole('button', { name: 'Saved models', exact: true }).click();
  await page.getByRole('button', { name: 'Save current model' }).click();
  await expect(page.getByRole('button', { name: 'Open' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear local data' }).click();
  await expect(page.getByText('Local data cleared.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open' })).toHaveCount(0);

  // Part 10: scan every request for fixture values, and allow only /api/rates and static assets.
  const FIXTURE = ['26844075576', '26,844,075,576', '11296540287', '2971664846', '61193831633', '15119739368'];
  const base = 'http://127.0.0.1:8798';
  const leaks = requests.filter(r => FIXTURE.some(v => r.url.includes(v) || r.body.includes(v)));
  const foreign = requests.filter(r => !r.url.startsWith(base) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
  const nonGet = requests.filter(r => r.method !== 'GET');
  const apis = requests.filter(r => r.url.startsWith(`${base}/api/`) && r.url !== `${base}/api/rates`);
  const statics = requests.filter(r => r.url.startsWith(base) && !r.url.startsWith(`${base}/api/`) && !/\/($|assets\/|index\.html|favicon|src\/)/.test(r.url.slice(base.length)));
  Object.assign(report, { consoleErrors: errors, requestCount: requests.length, leaks, foreign, nonGet, apis, statics, urls: [...new Set(requests.map(r => r.url))] });
  writeFileSync('docs/verify/playwright-report.json', JSON.stringify(report, null, 1));
  expect(errors).toEqual([]);
});
