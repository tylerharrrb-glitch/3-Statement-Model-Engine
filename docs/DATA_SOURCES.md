# Data Sources

Generated from data/rates.manual.json by scripts/gen-docs.ts. Free official sources only: no LSEG or Bloomberg.

| id | Value | Nature | Source | URL | As of | Verified | Method | Status |
|---|---|---|---|---|---|---|---|---|
| cbe_overnight_deposit | 20 | official | Central Bank of Egypt, MPC press release and homepage | https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026 | 2026-10-29 | 2026-10-31 | manual | ok |
| cbe_overnight_lending | 21 | official | Central Bank of Egypt, MPC press release and homepage | https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026 | 2026-10-29 | 2026-10-31 | manual | ok |
| cbe_main_operation | 20.5 | official | Central Bank of Egypt, MPC press release and homepage | https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026 | 2026-10-29 | 2026-10-31 | manual | ok |
| cbe_discount_rate | 20.5 | official | Central Bank of Egypt, MPC press release | https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026 | 2026-10-29 | 2026-10-31 | manual | ok |
| cbe_corridor_prior | 19, 20, 19.5 | official | Implied by the CBE press release: a 100 bps raise to 20.0 / 21.0 / 20.5 | https://www.cbe.org.eg/en/news-publications/news/2026/10/29/13/08/mpc-press-release-29-october-2026 | 2026-10-28 | 2026-10-31 | manual | ok |
| cpi_urban_headline_yoy | 13.9 | official | Central Bank of Egypt, inflation rates | https://www.cbe.org.eg/en/economic-research/statistics/inflation-rates | 2026-09-30 | 2026-10-31 | manual | ok |
| cpi_core_yoy | 14.1 | official | Central Bank of Egypt, inflation rates | https://www.cbe.org.eg/en/economic-research/statistics/inflation-rates | 2026-09-30 | 2026-10-31 | manual | ok |
| cpi_urban_mom | 1.3 | official | Central Bank of Egypt, inflation rates | https://www.cbe.org.eg/en/economic-research/statistics/inflation-rates | 2026-09-30 | 2026-10-31 | manual | ok |
| cbe_inflation_target | 7 | official | Central Bank of Egypt, inflation target page | https://www.cbe.org.eg/en/monetary-policy/inflation-target | 2024-12-26 | 2026-10-31 | manual | ok |
| tbill_91d | 24.316 | market_quote | Afronomics citing CBE | TO_VERIFY | 2026-10-27 | no | manual | unconfirmed |
| tbill_182d | 25.457 | market_quote | Central Bank of Egypt, EGP T-bill auction results | https://www.cbe.org.eg/en/auctions/egp-t-bills | 2026-10-29 | 2026-10-31 | manual | ok |
| tbill_273d | n/a | market_quote | Not reported in that auction | TO_VERIFY | n/a | no | manual | unconfirmed |
| tbill_364d | 26.076 | market_quote | Central Bank of Egypt, EGP T-bill auction results | https://www.cbe.org.eg/en/auctions/egp-t-bills | 2026-10-29 | 2026-10-31 | manual | ok |
| tbond_yields_by_tenor | n/a | market_quote | Not checked | TO_VERIFY | n/a | no | manual | unconfirmed |
| usdegp_cbe_official | 56.0429 | official | Central Bank of Egypt, official exchange rates | https://www.cbe.org.eg/en/economic-research/statistics/exchange-rates | 2026-10-29 | 2026-10-31 | manual | ok |
| conia | 19.468 | official | Central Bank of Egypt, homepage key statistics | https://www.cbe.org.eg/en/ | 2026-10-29 | 2026-10-31 | manual | ok |
| cit_rate | 22.5 | statutory | Income Tax Law 91/2005 | https://www.mof.gov.eg/ | n/a | no | manual | unconfirmed |
| vat_standard | 14 | statutory | PwC summary of Law 149/2026 | TO_VERIFY | 2026-07-29 | no | manual | ok |
| natural_gas_schedule_tax | 20 | statutory | PwC, Law 149/2026 | TO_VERIFY | 2026-07-29 | no | manual | unconfirmed |
| div_wht_listed | 5 | statutory | PwC, Laws 148-155/2026 | TO_VERIFY | 2026-07-29 | no | manual | ok |
| div_wht_general | 10 | statutory | PwC, Laws 148-155/2026 | TO_VERIFY | 2026-07-29 | no | manual | ok |
| intercompany_dividend_exclusion | Excluded; conditions not listed | statutory | PwC | TO_VERIFY | 2026-07-29 | no | manual | unconfirmed |
| listed_cgt | Exempt, except disposals causing delisting | statutory | PwC | TO_VERIFY | 2026-07-29 | no | manual | unconfirmed |
| egx_stamp_duty | 0.05 | statutory | PwC, Law 153/2026 | TO_VERIFY | n/a | no | manual | ok |
| legal_reserve_rule | 5, 50 | statutory | Law 159/1981 Art. 40, Andersen English translation | TO_VERIFY | n/a | no | manual | unconfirmed |
| employee_profit_share_rule | 10 | statutory | Law 159/1981 Art. 41, Andersen English translation | TO_VERIFY | n/a | no | manual | unconfirmed |
| board_remuneration_cap | 10, 5 | statutory | Law 159/1981 Art. 88, Andersen English translation | TO_VERIFY | n/a | no | manual | unconfirmed |
| epd_law_14_2025 | n/a | statutory | Not verified | TO_VERIFY | n/a | no | manual | unconfirmed |
| sp_egypt_rating | B / B, stable | market_quote | Arab News 11-Oct-2026 | TO_VERIFY | 2026-10-10 | no | manual | ok |
| egypt_cds_5y | 343 | market_quote | Zawya/Reuters | TO_VERIFY | 2026-10-29 | no | manual | unconfirmed |
| imf_real_gdp_growth | 5.1 | estimate | IMF Regional Economic Outlook Oct-2026, via Business Today Egypt 22-Oct-2026 | https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/EGY | 2026-10-22 | no | manual | unconfirmed |
| imf_inflation_forecast | n/a | estimate | IMF DataMapper | https://www.imf.org/external/datamapper/api/v1/PCPIPCH/EGY | n/a | no | manual | unconfirmed |
| mpc_calendar_2026 | 2026-04-02, 2026-05-21, 2026-07-09, 2026-08-20, 2026-09-24, 2026-10-29 | official | Zawya/Reuters 29-Oct-2026 | https://www.cbe.org.eg/en/ | n/a | no | manual | unconfirmed |
| us_10y | 4.94 | market_quote | US Treasury daily par yield curve | https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve | 2026-10-30 | 2026-10-31 | manual | ok |
| tbond_3y | 24.432 | market_quote | Central Bank of Egypt, fixed coupon bond results | https://www.cbe.org.eg/en/auctions/egp-t-bonds-fixed-coupon | 2026-10-26 | 2026-10-31 | manual | ok |

Company data: MOPCO audited FY2025 statements, Crowe Dr. A. M. Hegazy & Co., report dated 9-Mar-2026, as transcribed by the owner. Not cross-checked against the PDF, which was not available.
