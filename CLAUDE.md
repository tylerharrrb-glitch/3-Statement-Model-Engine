# Project standards

Read `docs/PROGRESS.md` at the start of every session.

## Purpose

3SM produces linked historical and forecast statements for EAS-presented industrial and commercial companies. Valuation is in WOLF; 3SM exports a WOLF-compatible JSON. The quality bar is a bulge-bracket model. Accuracy and honesty come before completion. If a request is wrong or impossible, say so and propose the alternative.

## Decisions (do not reopen without telling the owner why)

- Confidentiality: company financials never leave the browser. The only server request is `GET /api/rates`.
- Data: free official sources only (CBE, MoF, CAPMAS, EGX, IMF, US Treasury, FRED).
- Scope: banks and insurers are hard-blocked.
- Periods: annual; 5-year forecast, extendable to 10; December or June year end; 2 to 5 historical years.
- Circularity: one switch. 1 = average balances, 0 = opening balances. Excel ships at 0.
- Deferred tax: (tax depreciation - book depreciation) x rate, plus unrealized FX x rate. No full temporary-difference schedule.
- FX is first-class and can be switched off.
- Debt is tested on hand-built cases until the owner supplies a real indebted company.
- Part 13 (monorepo) needs written approval. `packages/rates-registry` stays publishable with zero app dependencies.

## Execution rules

- Work on branch `rebuild/v2`. Preview deploys only. The owner approves the merge to main.
- Gates: each Part has a script printing PASS or FAIL per check plus a final count. Full output goes to `docs/verify/`. In chat, print the summary counts and every FAIL line verbatim.
- Progress: keep `docs/PROGRESS.md` current so a new session can resume from it alone.
- Proof is a script that opens the real artifact: engine output, or the `.xlsx` after LibreOffice recalculation with `OOXMLRecalcMode` forced. Never report a fix as done without its gate line.
- Reporting order: failures and unknowns first, then successes.
- No invented data: a value not verified is `unconfirmed`; a URL not loaded is `TO_VERIFY`. Never fill a gap with a plausible number.
- No AI look: no emojis or decorative symbols in UI, Excel, docs or commits. No filler. No marketing chips. Banned in user-facing text: institutional-grade, comprehensive, robust, cutting-edge, seamless, powerful, state-of-the-art, AI-powered.
- One source of truth: one core, one registry, one data model. UI, Excel and JSON only consume them.
- Scope discipline: no features outside the brief. Put them under "Proposed" in `docs/PROGRESS.md` and ask.
- Keep chat output short; details go into files.

## Engineering rules

- `src/engine` is pure: no React, no fetch, no `Date.now()`. Rates are an argument.
- A missing driver blocks the run. There are no silent defaults.
- Historical statements are loaded as reported, never re-derived. Discrepancies are recorded as `sourceNotes`, never fixed.
- No plugs. The revolver is the only balancing mechanism.
- Excel: formulas only. Calibri 11. Blue input, black formula, red only for a failed check. No fills, merges or freeze panes. Accounting format with parentheses and a dash for zero. No OFFSET, INDIRECT, arrays, LET or LAMBDA. Nested IF at most 2. No literals except 0, 1, 12, 365, 100. One pattern per row. The Sensitivity block is the only place engine values appear.
- A change to the model has four places to keep in step: `src/engine`, `src/export/excel/rows.ts`, `tests/python/reference.py`, then regenerate `docs/METHODOLOGY.md` with `npx tsx scripts/gen-docs.ts`.

## Errors that must not repeat

- The US Treasury `avg_interest_rates` endpoint is not the 10-year yield.
- Unofficial FX APIs must not be labelled official.
- Shareholder dividends must not be mixed with employee or board distributions.
- Cost of debt is not total finance costs divided by lease debt.
- Net income comes from the statements, never EBIT - interest - tax.
- A sync audit that compares cached values with the engine proves nothing. Recalculate.
- Excel negatives must not look positive because columns are too narrow.
