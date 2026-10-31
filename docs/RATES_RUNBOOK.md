# Rates Runbook

The manual file is `data/rates.manual.json`, versioned in git. Set `method: manual`. Set `verifiedAt` only after reading the primary source yourself. Set `status: ok` only then. Never mark a manual value as auto.

## After each MPC meeting (schedule in `mpc_calendar_2026`)

1. Read the CBE statement at cbe.org.eg. The site rejects automated requests, so a browser is needed.
2. Update `cbe_overnight_deposit`, `cbe_overnight_lending`, `cbe_main_operation`, `cbe_discount_rate`: value, `asOf`, `verifiedAt`, `status`.
3. MPC-cycle items show STALE from the day after a scheduled meeting until re-verified.
4. Add newly published meeting dates, including the February and December 2026 dates and the 2027 calendar, once confirmed. Unconfirmed dates are left out, because they would trigger false staleness.

## After each CPI release (around the 10th of each month)

Update `cpi_urban_headline_yoy`, `cpi_core_yoy`, `cpi_urban_mom` from CAPMAS or CBE.

## Each week

T-bill items go stale after 10 days. Read the CBE auction results and update `tbill_*` and `tbond_yields_by_tenor`, unless the Worker reports them as `ok`.

## Daily, automatic

`us_10y` comes from the US Treasury par yield curve. `usdegp_cbe_official` is attempted at CBE and normally fails on the firewall, so update it by hand from the CBE official rates page. Other sources are never labelled official.

## After each tax-law change

Update `cit_rate` (confirm the article of Law 91/2005), `vat_standard`, `natural_gas_schedule_tax`, `div_wht_*`, `egx_stamp_duty`, `intercompany_dividend_exclusion`, `listed_cgt`. Confirm whether the Schedule Tax applies to feedstock and is recoverable before setting the Inputs switch to 1.

## Statutory rules

`legal_reserve_rule`, `employee_profit_share_rule`, `board_remuneration_cap` come from a secondary English translation. Confirm them against the official Arabic text of Law 159/1981.

## After each rating action

Update `sp_egypt_rating`.

## Semiannual (WEO: April and October)

`imf_real_gdp_growth`, `imf_inflation_forecast`. Record whether the Egypt series is on a fiscal-year basis. The upper revenue sanity flag stays inactive until inflation is loaded.

## Failure handling

On any adapter failure the Worker keeps the last good value and sets `fetch_failed`. `/api/rates` then serves the manual value, with the failure in its notes and in `lastRun`. The Rates page shows both.

## Deploying the Worker

`wrangler kv namespace create RATES`, put the id in `worker/wrangler.toml`, then `npm run build` and `wrangler deploy` from `worker/`. Test locally with `wrangler dev --test-scheduled`, then `GET /__scheduled`.
