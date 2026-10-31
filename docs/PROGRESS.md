# 3SM v2 Progress

Read this first in every session. Brief: the "3SM v2 Rebuild Brief". Standards: `CLAUDE.md`.

## Open FAILs

All from `docs/verify/part4.txt`. Each needs the audited PDFs, which are not on this machine:

- FY2024 CF line items: only the Appendix B totals are loaded.
- FY2024 capital roll-forward.
- FY2024 PP&E roll-forward (Note 3).
- FY2023 reference year: not loaded.
- Fixture transcription from the PDF: not done. The fixture is built from Appendix B, so the fixture-vs-Appendix B comparison is not an independent check.
- Merger effective date: unconfirmed.

The owner told the session to finish all Parts, so later Parts proceeded past these. Part 0's rule was not silently dropped: `verify-all` exits non-zero until they are closed, and CI stays red.

## Status

| Part | Status | Gate output |
|---|---|---|
| 1 Audit | Done | `docs/verify/part1.txt` |
| 2 Architecture | Done | `part2.txt` |
| 3 Rates, Worker | Done; not deployed | `part3.txt` |
| 4 Data, MOPCO | Open FAILs above | `part4.txt` |
| 5 Forecast | Done | `part5.txt` |
| 6 Debt, circularity | Done, hand-built cases only (Decision 10) | `part6.txt` |
| 7 Statements, outputs | Done | `part7.txt` |
| 8 Excel | Done in LibreOffice; real Excel and Google Sheets untested | `part8.txt`, `google-sheets-manual.md` |
| 9 UI | Done | `part9.txt`, `screens/` |
| 10 Confidentiality | Done | `part10.txt` |
| 11 Tests | Done locally; CI result depends on Part 4 | `part11.txt`, `three-way.txt` |
| 12 Documentation | Done | `part12.txt` |
| 13 Monorepo | Plan only; needs written approval | `docs/MONOREPO_PLAN.md` |

Last commit: run `git log -1 rebuild/v2`.

## Actions for the owner

1. Rotate the Groq API key. It was built into the old static bundle (`docs/AUDIT.md` 0.1). The old deployment on main still carries whatever was built then, and deleting the code does not revoke a published key.
2. Supply the MOPCO audited PDFs (FY2025, FY2023). This closes every open FAIL.
3. Replace the placeholder drivers in `tests/fixtures/mopco-drivers.json`.
4. Run `docs/verify/google-sheets-manual.md`, and open the file in real Excel with the switch at 1.
5. To deploy: `wrangler login`, create the KV namespace, put its id in `worker/wrangler.toml`, then `npm run build` and `wrangler versions upload` from `worker/` for a preview URL. No preview URL exists yet, because this machine has no Cloudflare login.
6. Decide the Proposed items below.

## Unconfirmed values

Source: `data/rates.manual.json`; the full table is in `docs/verify/part3.txt`.

- 91-day T-bill (seed from a secondary source, before the hike); 273-day and T-bond tenors other than 3-year.
- IMF growth and inflation: the IMF site returns 403 to the Worker. The upper revenue sanity flag stays inactive until inflation is loaded.
- CIT article number. Statutory rules in Art. 40, 41, 88: confirm in the Arabic text. Schedule Tax applicability to feedstock. Dividend exclusion conditions. Listed CGT detail. MPC calendar except 29-Oct (the CBE schedule table loads by script).
- Altman zones: secondary sources agree (2.6 and 1.1 before the 3.25 constant), but the 2005 paper was not read.
- MOPCO inputs not in Appendix B: USD balance shares (0), land (0), depreciation split, employee and board split, actual FY2025 USD/EGP. The FX module has nothing to revalue until the USD shares are entered.

## Corrections to the brief

- CBE does not block every automated request. Browser-style headers worked from this machine on 31-Oct-2026. The Worker reads the corridor, CPI, CONIA, T-bills, the 3-year bond and FX. Cloudflare egress is untested, so failures remain a normal path.
- 364-day T-bill: CBE shows 26.076 on 29-Oct; Appendix A had 25.912 from 27-Oct. 182-day: 25.457, was 25.166.
- USD/EGP mid 56.0429 on 29-Oct.
- Inflation target: 7% +/- 2pp in Q4 2026; 5% +/- 2pp in Q4 2028.
- Appendix B: non-current asset lines sum 1 EGP below the stated total (source note 9). Check against the PDF.

## Design decisions taken during the build

- Vite replaces Next.js. The registry package and manual snapshot were built in Part 2, ahead of Part 3.
- Revenue basis switch: by market, by segment, or volume x price. Appendix B gives no segment-by-market matrix, so the non-driving view is allocated by mix or export share.
- Engine tolerance is 0.01 EGP, stricter than the 1 EGP ceiling, so comparisons stay inside 1 EGP after compounding.
- Lease and benefit interest always use the opening balance, under both switch settings.
- Balance check excludes the documented 1 EGP opening gap from source note 9.
- LibreOffice ignores the file's iterate settings. Switch 1 is recalculated in repeated passes until stable (17 for MOPCO). Excel should need one calculation; untested.
- Scenarios sheet: only the active scenario's outputs are live. The UI shows all three.
- Dropped from the old audit's "keep" list: Recharts charts, because no Part asks for charts.

## Proposed (not in the brief; needs owner approval)

| Item | Recommendation | Why |
|---|---|---|
| Tax-loss carryforward | Add | Tax after a loss year is overstated without it. The term needs a source. |
| Thin-cap rule | Leave out | Ratios and ceiling unconfirmed; MOPCO has no bank debt. |
| VAT schedule | Leave out | Not in the brief. |
| PDF and CSV exports | Leave out | Excel and JSON are the deliverables. |

## Environment

Node 22, Python 3.14. LibreOffice at `C:\Program Files\LibreOffice\program\soffice.exe`, not on PATH. `npx playwright install chromium` on a new machine. `wrangler dev` works locally without login.

## Next step

Wait for the PDFs. Then transcribe FY2024 and FY2023, close the Part 4 FAILs, and get the owner's decision on merging.
