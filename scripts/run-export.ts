// Headless Excel export — runs runFullModel + buildWorkbook for all 3
// scenarios and writes one .xlsx per scenario to disk. No browser, no DOM,
// no Next.js runtime.
//
// Usage:
//   npm run export:audit
//     → runs against getDefaultHistoricalInputs() (Demo Company)
//
//   npm run export:audit -- --input fixtures/telecom-egypt.json
//     → loads { historicalInputs, assumptions: {base,optimistic,conservative} }
//        from the JSON and overrides the corresponding scenario assumptions.
//
// Outputs to project root:
//   out-base.xlsx, out-optimistic.xlsx, out-conservative.xlsx
//
// Validation: if --input is provided, every required HistoricalInputs field
// must be present and an array of `periods.length`. Missing/wrong-shape
// fields fail loudly with the exact path; no silent defaults.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runFullModel } from '../lib/engines/integrator';
import { buildWorkbook, workbookToBuffer } from '../lib/export/excel';
import { createDefaultScenarios } from '../lib/scenario-manager';
import type { Scenario, ScenarioType } from '../types/scenario';
import { getDefaultHistoricalInputs, type AssumptionSet, type HistoricalInputs } from '../types/assumptions';
import type { ModelResults } from '../types/financial';

// ─── Required HistoricalInputs fields ────────────────────────────
// Keep in sync with types/assumptions.ts → HistoricalInputs.
const REQUIRED_HIST_FIELDS = [
    'periods', 'revenue', 'cogs', 'sgaExpense', 'rdExpense', 'depreciation',
    'amortization', 'otherOpex', 'interestIncome', 'interestExpense',
    'otherIncomeExpense', 'taxExpense', 'sharesOutstanding',
    'cash', 'accountsReceivable', 'inventory', 'prepaidExpenses',
    'otherCurrentAssets', 'grossPPE', 'accumulatedDepreciation', 'intangibles',
    'goodwill', 'otherLongTermAssets', 'accountsPayable', 'accruedExpenses',
    'shortTermDebt', 'currentPortionLTD', 'deferredRevenue',
    'otherCurrentLiabilities', 'longTermDebt', 'deferredTaxLiabilities',
    'otherLongTermLiabilities', 'commonStock', 'additionalPaidInCapital',
    'retainedEarnings', 'treasuryStock', 'otherComprehensiveIncome',
] as const;

interface FixtureFile {
    _meta?: Record<string, unknown>;
    historicalInputs: Record<string, unknown>;
    assumptions?: Partial<Record<ScenarioType, Partial<AssumptionSet>>>;
}

function fail(msg: string): never {
    console.error(`✗ ${msg}`);
    process.exit(1);
}

function validateFixture(raw: unknown, sourcePath: string): FixtureFile {
    if (!raw || typeof raw !== 'object') {
        fail(`Fixture at ${sourcePath} is not a JSON object.`);
    }
    const file = raw as FixtureFile;
    if (!file.historicalInputs || typeof file.historicalInputs !== 'object') {
        fail(`Fixture at ${sourcePath} is missing 'historicalInputs'.`);
    }
    const hist = file.historicalInputs as Record<string, unknown>;
    const periods = hist.periods;
    if (!Array.isArray(periods) || periods.length === 0) {
        fail(`Fixture historicalInputs.periods must be a non-empty array.`);
    }
    const n = periods.length;

    for (const k of REQUIRED_HIST_FIELDS) {
        if (!(k in hist)) {
            fail(`Fixture historicalInputs is missing required field: '${k}'.`);
        }
        if (k === 'periods') continue;
        const v = hist[k];
        if (!Array.isArray(v)) {
            fail(`Fixture historicalInputs.${k} must be an array (got ${typeof v}).`);
        }
        if (v.length !== n) {
            fail(`Fixture historicalInputs.${k} length ${v.length} ≠ periods length ${n}.`);
        }
        for (let i = 0; i < v.length; i++) {
            if (typeof v[i] !== 'number' || !Number.isFinite(v[i])) {
                fail(`Fixture historicalInputs.${k}[${i}] must be a finite number (got ${JSON.stringify(v[i])}).`);
            }
        }
    }
    return file;
}

function parseArgs(argv: string[]): { inputPath: string | null } {
    let inputPath: string | null = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--input' && argv[i + 1]) {
            inputPath = argv[i + 1];
            i++;
        } else if (argv[i].startsWith('--input=')) {
            inputPath = argv[i].slice('--input='.length);
        }
    }
    return { inputPath };
}

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
    const { inputPath } = parseArgs(process.argv.slice(2));

    let historicalInputs: HistoricalInputs;
    let scenarioOverrides: Partial<Record<ScenarioType, Partial<AssumptionSet>>> = {};
    let fixtureLabel = 'Demo Company defaults';

    if (inputPath) {
        const abs = path.isAbsolute(inputPath) ? inputPath : path.join(root, inputPath);
        let raw: unknown;
        try {
            raw = JSON.parse(readFileSync(abs, 'utf-8'));
        } catch (e) {
            fail(`Could not read/parse ${abs}: ${(e as Error).message}`);
        }
        const fixture = validateFixture(raw, abs);
        historicalInputs = fixture.historicalInputs as unknown as HistoricalInputs;
        scenarioOverrides = fixture.assumptions ?? {};
        fixtureLabel = (fixture._meta?.company as string | undefined) ?? path.basename(abs);
        console.log(`▶ Loaded fixture: ${fixtureLabel}  (${abs})`);
    } else {
        historicalInputs = getDefaultHistoricalInputs();
        console.log(`▶ Using ${fixtureLabel} (no --input)`);
    }

    // Apply scenario-specific overrides on top of the canonical default scenarios.
    const scenarios: Scenario[] = createDefaultScenarios();
    for (const s of scenarios) {
        const overrides = scenarioOverrides[s.type as ScenarioType];
        if (overrides && typeof overrides === 'object') {
            s.assumptions = { ...s.assumptions, ...overrides };
        }
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

        const wb = await buildWorkbook(
            s.results,
            s.assumptions,
            fixtureLabel,
            scenarios,
            historicalInputs,
            null,
        );
        const buf = await workbookToBuffer(wb);
        const filename = slug[s.type] ?? `out-${s.type}.xlsx`;
        const outPath = path.join(root, filename);
        writeFileSync(outPath, Buffer.from(buf));
        console.log(`  → wrote ${filename} (${(buf.byteLength / 1024).toFixed(1)} KB)`);
    }

    console.log('\nDone.');
}

main().catch(err => {
    console.error('export failed:', err);
    process.exit(1);
});
