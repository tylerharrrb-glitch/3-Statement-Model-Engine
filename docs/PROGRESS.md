# 3SM v2 Progress

Read this first in every session. Standards: `CLAUDE.md`. Gate output: `docs/verify/`. Final report: `docs/FINAL_REPORT.md`.

## Open items

No gate has a FAIL. These are outside the gates and need the owner:

1. Rotate the Groq key. https://3-statement-model-engine.pages.dev still serves it. Groq console, API Keys, revoke. Old deployments stay reachable at their own Cloudflare hash URLs until removed in the dashboard, and they still have the AI Analyst. The local `.env.local` copy was deleted, because nothing uses it.
2. Clear the GitHub billing lock so CI can run. Until then the Part 11 "PASS in CI" requirement is unmet, and the gates have run on Windows only.
3. Deploy the rates Worker when wanted: see "Deployment" below. The preview itself works.
4. Review the driver sets in `tests/fixtures/mopco-drivers.json`. Ratios come from the notes. Forward paths are assumptions prepared by Claude.
5. Run `docs/verify/google-sheets-manual.md`, and open the file in real Excel with the switch at 1.
6. The GitHub repo is public: never commit client data.

## Status

| Part | Status | Gate output |
|---|---|---|
| 1 Audit | Done | `part1.txt` |
| 2 Architecture | Done | `part2.txt` |
| 3 Rates, Worker | Done locally; not deployed | `part3.txt` |
| 4 Data, MOPCO | Done; PDFs obtained from mopco-eg.com | `part4.txt` |
| 5 Forecast | Done | `part5.txt` |
| 6 Debt, circularity | Done, hand-built cases only (Decision 10) | `part6.txt` |
| 7 Statements, outputs | Done | `part7.txt` |
| 8 Excel | Done in LibreOffice; real Excel and Google Sheets untested | `part8.txt` |
| 9 UI | Done | `part9.txt`, `screens/` |
| 10 Confidentiality | Done | `part10.txt` |
| 11 Tests | Local PASS; CI blocked by GitHub billing | `part11.txt`, `three-way.txt` |
| 12 Documentation | Done | `part12.txt` |
| 13 Monorepo | Plan only; needs written approval | `docs/MONOREPO_PLAN.md` |

## Deployment

Production: https://3-statement-model-engine.pages.dev, from `main`, released on the owner's instruction on 31-Oct-2026 as a fast-forward of `rebuild/v2`. Preview: https://rebuild-v2.3-statement-model-engine.pages.dev. Pages alone has no `/api/rates`, so the app uses the bundled manual rates and says so. For the Worker: `wrangler login`, `wrangler kv namespace create RATES`, put the id in `worker/wrangler.toml`, `npm run build`, then `wrangler versions upload` from `worker/`.

## Limits of the evidence

- The scanned PDFs were read by eye, without OCR software. Each transcribed section sums to its printed total, which catches most digit errors.
- The separate FY2024 PDF was downloaded but not compared line by line with the FY2025 comparatives.
- The PDFs came from mopco-eg.com. Its pages contain 271 external spam links, which suggests the site has been compromised. The numbers agree with Appendix B and tie out, but tell MOPCO IR, and prefer an EGX copy for formal use.
- Worker reads of CBE worked from this machine with browser-style headers. Cloudflare egress is untested. IMF returns 403 to the Worker.
- The Python model has the same author as the engine.

## Unconfirmed values

See `docs/verify/part3.txt`. Main ones: 91-day and 273-day T-bills, other T-bond tenors, IMF growth and inflation (upper revenue sanity flag inactive), CIT article, tax-loss term article, Law 159 Art. 40, 41, 88 in the Arabic text, Schedule Tax applicability to feedstock, MPC calendar except 29-Oct, Altman zones (formula and zones agree with secondary sources; the 2005 paper was not read).

## Corrections to the brief

- Decision 5: FY2023 is mixed. The balance sheet is post-merger (registered 13-Dec-2023), the income statement is MOPCO before the merger. Label updated.
- CBE is readable with browser-style headers. The 29-Oct change is confirmed in the press release.
- 364-day T-bill 26.076 (29-Oct), not 25.912. 182-day 25.457, not 25.166. USD/EGP 56.0429. Inflation target 7% +/- 2pp Q4 2026, 5% +/- 2pp Q4 2028.
- Decision 6: tonnes are not disclosed, as the brief says, but Note 23 does disclose segment by market. It is recorded in the fixture `_meta`. The model still allocates the non-driving view; a segment-by-market matrix would be a small change if wanted.
- Source notes 9 to 16 are new findings; see the fixture and `docs/FINAL_REPORT.md`.

## Export to WOLF

Exports page, "Export to WOLF (.json)". Mapping: `src/export/wolfMap.ts`. Gate: `npx tsx scripts/verify-wolf-export.ts`, output `docs/verify/wolf-export.txt`. Historical years only: WOLF reads the last year in the file as the latest actual and allows five years. Price and dates are user inputs on the Company page, and WOLF rejects blanks. The older "Download WOLF JSON" button uses a different schema and does not import into WOLF.

## Brand

The UI uses the WOLF valuation engine's design: colour tokens copied unchanged from `ValuationEngine/src/index.css` (gated), Spectral and IBM Plex Sans self-hosted, the same header, tabs, panels, badges, drawer and footer, and the same light mode toggle and `wolf-theme` key. The Excel file keeps its own Part 8 style.

## Design decisions

- Vite replaced Next.js. The registry package was built in Part 2, ahead of Part 3.
- Engine tolerance is 0.01 EGP, stricter than the 1 EGP ceiling.
- Lease and benefit interest always use the opening balance.
- The balance check excludes the documented 1 EGP opening gap in source note 9.
- LibreOffice ignores the file's iterate settings. Switch 1 is recalculated in repeated passes until stable.
- Tax-loss carryforward added on the owner's instruction: fixed 5-year term, oldest first, no deferred tax asset.
- Thin-cap, VAT schedule, PDF and CSV exports stay out, on the audit recommendation.
- The first forecast year revalues USD balances from 47.6607 to 56.0429 in the base case, which adds a one-off FX gain of about EGP 2.7bn to 2026 profit. Look at this when reviewing 2026.

## Environment

Node 22, Python 3.14. LibreOffice at `C:\Program Files\LibreOffice\program\soffice.exe`. `npx playwright install chromium` on a new machine. `wrangler dev` works locally without login.

## Next step

Owner actions above.
