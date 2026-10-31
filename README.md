# 3-Statement Model Engine

## What the engine is

It produces linked historical and forecast statements for industrial and commercial companies presenting under EAS: income statement, balance sheet, cash flow, schedules, ratios, scenarios and a sensitivity grid. Valuation lives in WOLF; this engine exports a WOLF-compatible JSON. Banks and insurers are blocked, because for them the balance sheet is the business.

The engine (`src/engine`) is pure and deterministic. The UI, the Excel writer and the JSON export only consume it. Company financials never leave the browser. The only server request is `GET /api/rates`.

## How to run it

```
npm install
npm run dev              # Vite dev server
npm test                 # unit tests
npm run verify-all       # every Part gate; needs LibreOffice and Python
```

To run the app with the rates API, build it and start the Worker:

```
npm run build
cd worker && npx wrangler dev --test-scheduled
```

Without the Worker the app uses the manual rates file and says so on the Rates page.

## How to add a company

1. Open Historicals. Enter each line as reported and map it to a standard account. Unmapped lines block the run. Full absolute EGP only.
2. Enter 2 to 5 historical years. Load the cash flow as reported. Never derive it from balance-sheet changes.
3. On Company, set the sector, fiscal year end and the classification policy (interest received, interest paid, distributions).
4. On Drivers, enter bear, base and bull sets for each forecast year.
5. Check the Historicals tie-outs and record source discrepancies. Do not fix them.

For a file-based fixture, copy the pattern in `scripts/gen-mopco-fixture.mjs`. It is loaded through the mapping layer in the same way.

## Layout

```
packages/rates-registry/   schema, staleness, merge, snapshot, WOLF export schema; no React, no IO
src/engine/                calculation core
src/export/excel/          formula writer and the row table
src/export/wolf.ts         WOLF JSON
src/ui/                    React views
worker/                    Cloudflare Worker: daily rates pipeline and /api/rates
data/rates.manual.json     manual registry values, versioned
tests/                     unit, fixtures, golden, python reference, e2e
scripts/verify-*           Part gates
docs/                      methodology, sources, runbook, audit, progress, gate output
```

## Status

See `docs/PROGRESS.md`. Open items are listed there first.
