# Changelog

## 2.0.0, branch rebuild/v2, not merged

Rebuild per the 3SM v2 brief.

Removed: Next.js; DCF; valuation multiples; AI Analyst and the Groq call; the `/api/validate` AI route; ExchangeRate-API; the CBE banner and its IN SYNC chip; the invented company data in Excel; the 40-check count; the historical cash flow derived from balance-sheet changes; the override of reported historical tax; thin-cap, VAT schedule, PDF and CSV exports; 44 one-off scripts; the accidentally committed worktree.

Added: Vite and React; a pure engine with `runModel(inputs, ratesSnapshot)`; a chart of accounts and mapping layer; a MOPCO fixture from Appendix B; FX as a first-class module; segment and market revenue; leases, provisions, benefits, investments; tranches, revolver and sweep; one circularity switch; DuPont, credit, FCFF and FCFE, Altman Z''-EM, Piotroski; a 5x5 sensitivity; a formula-driven workbook with no hardcodes in calculation cells; a rates registry package, Worker and snapshots; IndexedDB saved models; a Python reference model; Part gates and CI.

Added after the audited PDFs were obtained from mopco-eg.com: FY2024 cash flow lines and Note 3, FY2023 reference totals, real FX rates and USD exposure, land, employee and board split, driver sets based on the notes, and a 5-year tax-loss carryforward.

Corrected facts at the primary source on 31-Oct-2026: CBE corridor 20.00 / 21.00 / 20.50 confirmed; 364-day T-bill 26.076 (29-Oct auction); USD/EGP mid 56.0429; inflation target 7% +/- 2pp in Q4 2026 and 5% +/- 2pp in Q4 2028.
