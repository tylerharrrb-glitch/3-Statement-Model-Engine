// Headless Excel export — runs runFullModel + buildWorkbook for all 3
// scenarios and writes one .xlsx per scenario to disk. No browser, no DOM,
// no Next.js runtime.
//
// Usage: npm run export:audit
//        (or: npx tsx scripts/run-export.ts)
//
// Outputs to project root:
//   out-base.xlsx
//   out-optimistic.xlsx
//   out-conservative.xlsx
//
// Prints a sanity readout of key cells per scenario for fast diff against
// the engine UI.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runFullModel } from '../lib/engines/integrator';
import { buildWorkbook, workbookToBuffer } from '../lib/export/excel';
import { createDefaultScenarios } from '../lib/scenario-manager';
import { getDefaultHistoricalInputs } from '../types/assumptions';
import type { ModelResults } from '../types/financial';

const fmt = (n: number | undefined | null) =>
    n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 0 });

function findPeriod<T extends { period: string }>(arr: T[], period: string): T | undefined {
    return arr.find(p => p.period === period || p.period === `${period}E`);
}

function reportScenario(name: string, results: ModelResults) {
    const bs = results.balanceSheets;
    const cf = results.cashFlowStatements;

    const bs2026 = findPeriod(bs, '2026');
    const bs2030 = findPeriod(bs, '2030');
    const cf2025 = findPeriod(cf, '2025');
    const cf2030 = findPeriod(cf, '2030');

    console.log(`\n=== ${name} ===`);
    console.log(`  Total Assets 2026E:        ${fmt(bs2026?.totalAssets)}`);
    console.log(`  Total Assets 2030E:        ${fmt(bs2030?.totalAssets)}`);
    console.log(`  Total Equity 2026E:        ${fmt(bs2026?.totalEquity)}`);
    console.log(`  Total Equity 2030E:        ${fmt(bs2030?.totalEquity)}`);
    console.log(`  CFO 2025:                  ${fmt(cf2025?.cashFromOperations)}`);
    console.log(`  CFO 2030E:                 ${fmt(cf2030?.cashFromOperations)}`);
    console.log(`  Net Change in Cash 2025:   ${fmt(cf2025?.netChangeInCash)}`);
    console.log(`  Cash 2026E (BS):           ${fmt(bs2026?.cash)}`);
    console.log(`  BS balance check 2030E:    ${
        bs2030 ? (Math.abs(bs2030.balanceDifference) < 1 ? '✓ balanced' : `✗ off by ${fmt(bs2030.balanceDifference)}`) : 'n/a'
    }`);
}

async function main() {
    const root = path.resolve(__dirname, '..');
    const historicalInputs = getDefaultHistoricalInputs();
    const scenarios = createDefaultScenarios();

    // Compute results for every scenario
    for (const s of scenarios) {
        s.results = runFullModel(s.assumptions, historicalInputs);
    }

    const slug: Record<string, string> = {
        base: 'out-base.xlsx',
        optimistic: 'out-optimistic.xlsx',
        conservative: 'out-conservative.xlsx',
    };

    for (const s of scenarios) {
        if (!s.results) continue;
        reportScenario(s.name, s.results);

        // Hand the FULL scenario list so the Scenarios tab + IF wiring works.
        const wb = await buildWorkbook(
            s.results,
            s.assumptions,
            'Demo Company Inc.',
            scenarios,
            historicalInputs,
            null,
        );
        const buf = await workbookToBuffer(wb);
        const filename = slug[s.type] ?? `out-${s.type}.xlsx`;
        const outPath = path.join(root, filename);
        await writeFile(outPath, Buffer.from(buf));
        console.log(`  → wrote ${filename} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
    }

    console.log('\nDone.');
}

main().catch(err => {
    console.error('export failed:', err);
    process.exit(1);
});
