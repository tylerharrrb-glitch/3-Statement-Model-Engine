# 3SM v2 Progress

Read this first in every session. Brief: the pasted "3SM v2 - Rebuild Brief". Rules: Part 0 of that brief.

## Status

| Part | Status | Gate |
|---|---|---|
| 0 | In force | Branch `rebuild/v2` created locally, not pushed |
| 1 | Complete, waiting for owner go-ahead | `docs/verify/part1.txt` |
| 2 onward | Not started | |
| 13 | Blocked: needs written approval | |

Last commit: run `git log -1 rebuild/v2`. A commit cannot contain its own hash.

## Open FAILs

Gate: none. Audit findings are listed in `docs/AUDIT.md` Section 0.

## Actions for the owner

1. Rotate the Groq API key now. It was built into the static bundle (`docs/AUDIT.md` 0.1). Rotation is the only fix for a key already published; deleting the code later does not revoke it.
2. Provide the paths to the MOPCO audited PDFs: FY2025 and FY2023. Neither was found (unknown U1). Blocks Part 4.
3. Answer the decisions below.

## Decisions needed before Part 2

| # | Question | Recommendation |
|---|---|---|
| D1 | The repo is Next.js 16 static export; the brief says Vite. | Move to Vite in Part 2. |
| D2 | `runModel` needs a rates snapshot in Part 2, but Part 3 is later in the order. | Build the registry package and a manual snapshot with all values `unconfirmed` in Part 2. Leave Worker and verification in Part 3. |

## Unknowns

- U1 MOPCO audited PDFs not located.
- U2 Whether the deployed site contains the key.
- U3 Real Excel behaviour; only LibreOffice was tested.
- U4 Appendix A seeds not re-verified; Part 3 does this.
- U5 Legal citations in the old code are all `unconfirmed`.

## Proposed (not in the brief; needs owner approval)

| Item | Recommendation | Why |
|---|---|---|
| Tax-loss carryforward | Keep, as an input-driven schedule | Part 5's gate includes zero revenue and negative growth. Without it, tax after a loss year is overstated. The 5-year term needs a source. |
| Thin-cap rule | Drop | Not in the brief; ratios and ceiling unconfirmed; MOPCO has no bank debt. |
| VAT schedule | Drop | Not in the brief. It adds a VAT payable and receivable that are not tied to any reported line. |
| PDF export | Drop | Not in the brief; Excel and JSON are the deliverables. |
| CSV export | Drop | Same. |

## Environment

- Node 22.22.0, Python 3.14.2, openpyxl 3.1.5.
- LibreOffice: `C:\Program Files\LibreOffice\program\soffice.exe`, not on PATH.
- Not installed: Playwright (Part 9), wrangler (Part 3).
- To force a hard recalculation, set `OOXMLRecalcMode` to 0 in a dedicated LibreOffice profile. The default profile does not recalculate on load, so a conversion without this proves nothing.

## Notes that are easy to lose

- `audit:sync` compares cached values with the engine, so it passes even when formulas are wrong. Do not reuse its approach.
- Several old scripts exit 0 while printing failures.

## Next step

Wait for the owner's go-ahead on Part 1. Then, per Decision 13: Part 2.
