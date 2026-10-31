# Methodology

Every equation in the order the engine computes it. Generated from the row table by scripts/gen-docs.ts; do not edit by hand. Amounts are full absolute EGP. Costs are positive in the model.

## Notation

`[x]` is row x in the same year. `[x@-1]` is the prior year. `[x@first]` is the first forecast year. `[x@last]` is the final year. `[d_x]` is driver x of the active scenario. Capitalized names are settings on Inputs: SW_CIRC (circularity), FX_ON, TAX_RATE (registry cit_rate / 100), YIELD_BASE, FLOAT_BASE, SCHED_RATE, PAR, LR_PCT, LR_CAP, OV_GROWTH, OV_MARGIN, USD_* shares of balances, and the mode switches. IF(b=0,0,a/b) protects every division.

## Calculation order within a forecast year

1. FX rates and revaluation of opening USD items.
2. Revenue.
3. PP&E, PUC, other assets, leases.
4. Cost of sales and operating costs, to operating profit.
5. Working capital, provisions, employee benefits, investments.
6. Debt schedule to scheduled movements; interest on each tranche and the revolver.
7. Finance income, finance costs, FX line, profit before tax.
8. Tax, net profit, OCI, tax payable, deferred tax.
9. Equity: appropriations of prior-year profit, dividends declared and paid, bonus shares, retained earnings.
10. Cash flow before the revolver and sweep.
11. Revolver, then cash sweep in tranche order, then closing cash.
12. Balance sheet totals and checks.
13. Output rows over every period.

## Circularity

One switch. SW_CIRC = 0: interest and finance income use opening balances, one pass, no circularity. SW_CIRC = 1: they use the average of opening and closing balances. The engine repeats steps 1 to 12 for the year, feeding back closing liquid balances, tranche balances and the revolver, until the largest change is under 0.01 EGP, with a cap of 100 iterations, and reports the count per year. 0.01 is stricter than the 1 EGP ceiling in the brief, so that three-way comparisons stay inside 1 EGP after compounding. Lease interest and employee benefit interest always use the opening balance. The Excel file has the same switch, ships at 0, and has iterative calculation enabled.

## No plugs

Cash comes from the cash flow statement. The revolver is the only balancing mechanism: it draws when cash before the revolver would fall below the minimum and repays first from surplus. With the revolver off, cash can fall below the minimum and a warning shows. Nothing is back-solved. The historical cash flow is loaded as reported and never derived from balance-sheet changes.

## Decisions built into the equations

Deferred tax (Decision 8): movement = (tax depreciation - book depreciation) x tax rate, plus unrealized FX x tax rate. There is no full temporary-difference schedule. OCI deferred tax is on the actuarial result.
Current tax is (MAX(0, taxable profit) - losses used) x rate. Tax losses carry forward 5 years, oldest first (Income Tax Law 91/2005 per Andersen; article and Arabic text unconfirmed). A loss of year s can be used in years s+1 to s+5. No deferred tax asset is booked on losses, in keeping with Decision 8.
FX: only balances on opening USD shares revalue. Revaluation on cash, investments, other financial assets and USD debt is unrealized and added back in the cash flow. Revaluation on working capital is treated as realized through the working capital movement.
Legal reserve: 5% of prior-year net profit until the reserve reaches 50% of issued capital. FY2025 check: 755,986,968 = 5% x 15,119,739,368.
Statutory rules (Law 159/1981 Art. 40, 41, 88) are from a secondary English translation and must be confirmed against the official Arabic text.
EPS uses closing shares. eps_restated uses the final-year share count, so a bonus issue restates earlier years. MOPCO FY2024 reported EPS of 5.27 is on the restated basis.
Altman Z''-EM: 3.25 + 6.56 X1 + 3.26 X2 + 6.72 X3 + 1.05 X4. Zones 5.85 and 4.35 are unconfirmed: secondary sources give 2.6 and 1.1 before the 3.25 constant, which agrees, but Altman (2005) itself was not read.
Net debt = borrowings + leases - cash and investments (non-current, current, FVTPL). ROIC = NOPAT / average invested capital, one definition everywhere.

## Debt tranches

For tranche k: open = prior close. conv = average FX if USD, else 1. fx = open x FX move if USD, else 0. borrow = input x conv. repay = MIN(input x conv, open + fx + borrow). after = open + fx + borrow - repay. rate = FLOAT_BASE + base delta + spread if floating, else the fixed rate. sweep available = surplus x sweep % for the first tranche, then less prior sweeps. sweep = MIN(available, after). close = after - sweep. interest = rate x IF(SW_CIRC=1, average(open, close), open).


## Income statement

- rev_export = [s_rev_export]
- rev_domestic = [s_revenue]-[s_rev_export]
- revenue = [s_revenue]  [historical: [rev_export]+[rev_domestic]]
- cogs = [s_cogs]
- gross_profit = [revenue]-[cogs]  [historical: same]
- other_income_total = [d_other_income]+[d_prov_reversed]
- selling = [s_selling]
- ga = [ga_cash]+[amort]+[depr_ga]
- cap_gains = [d_disposal_proceeds]-[d_disposal_nbv]
- other_exp_total = [d_other_exp]+[d_prov_formed]
- impairment = [d_impairment]
- ecl = [d_ecl]
- op_profit = [gross_profit]+[other_income_total]-[selling]-[ga]+[cap_gains]-[other_exp_total]+[impairment]+[ecl]  [historical: same]
- fin_income = [s_fin_income]
- lease_int = [s_lease_int]
- ebo_int = [s_ebo_int]
- debt_int = [s_debt_int]  [historical: reported line or 0]
- fin_costs = [lease_int]+[ebo_int]+[debt_int]  [historical: same]
- fx_line = [fx_unreal]+[fxg_wc]
- pbt = [op_profit]+[fin_income]-[fin_costs]+[fx_line]  [historical: same]
- current_tax = [s_current_tax]
- deferred_tax = [dtl_mov_ppe]+[dtl_mov_fx]
- net_profit = [pbt]-[current_tax]-[deferred_tax]  [historical: same]
- oci_gross = [d_oci_gross]
- oci_dt = -[d_oci_gross]*TAX_RATE
- oci_net = [oci_gross]+[oci_dt]  [historical: same]
- dep = [s_dep]
- amort = [oa_amort]+[rou_amort]
- gas_cost = [s_gas_cost]
- prov_reversed = [d_prov_reversed]
- effective_tax = IF([pbt]=0,0,([current_tax]+[deferred_tax])/[pbt])

## Balance sheet

- fixed_assets = [ppe_nbv]+[puc]
- other_assets = [other_assets@-1]+[d_oa_add]-[oa_amort]
- rou = [rou@-1]+[d_rou_new]-[rou_amort]
- associates = [associates@-1]+[d_assoc_mov]
- inv_nc = [inv_nc@-1]+[d_inv_nc_net]+[fxg_inv_nc]
- ofa = [ofa@-1]+[d_ofa_mov]+[fxg_ofa]
- total_nca = SUM([fixed_assets]:[ofa])  [historical: same]
- inventory = [d_dio]*[cogs]/365
- ar = [d_dso]*[revenue]/365
- inv_cur = [inv_cur@-1]+[d_inv_cur_net]+[fxg_inv_cur]
- fvtpl = [fvtpl@-1]+[d_fvtpl_net]+[fxg_fvtpl]
- debtors = [d_debtors_pct]*[revenue]
- rp = [d_rp_balance]
- sup_adv = [d_sup_adv_pct]*[revenue]
- cash = [cf_close]
- total_ca = SUM([inventory]:[cash])  [historical: same]
- total_assets = [total_nca]+[total_ca]  [historical: same]
- capital = [capital@-1]+[bonus_total]
- legal_reserve = [legal_reserve@-1]+[s_lr_transfer]
- general_reserve = [general_reserve@-1]-[d_bonus_res]
- merger_reserve = [merger_reserve@-1]
- re = [s_re]
- total_equity = SUM([capital]:[re])  [historical: same]
- lease_nc = [lease_total]-[lease_cur]
- debt_nc = [debt_total]-[debt_cur]  [historical: reported line or 0]
- dtl = [dtl@-1]+[deferred_tax]-[oci_dt]
- ebo_nc = [ebo_total]-[ebo_cur]
- total_ncl = SUM([lease_nc]:[ebo_nc])  [historical: same]
- tax_payable = [tax_payable@-1]+[current_tax]-[tax_paid]
- lease_cur = [lease_total]*[d_lease_cur_share]
- debt_cur = [debt_total]*[d_debt_cur_share]  [historical: reported line or 0]
- ap = [d_dpo]*[cogs]/365
- creditors = [d_creditors_pct]*[revenue]
- dividends_payable = [dividends_payable@-1]+[declared_dividends]-[dividends_paid]  [historical: reported line or 0]
- cust_adv = [d_cust_adv_pct]*[revenue]
- ebo_cur = [ebo_total]*[d_ebo_cur_share]
- provisions = [provisions@-1]+[d_prov_formed]-[d_prov_reversed]-[d_prov_used]
- total_cl = SUM([tax_payable]:[provisions])  [historical: same]
- total_liabilities = [total_ncl]+[total_cl]  [historical: same]
- total_le = [total_liabilities]+[total_equity]  [historical: same]
- balance_check = [total_assets]-[total_le]  [historical: same]

## Cash flow statement (indirect, EAS 4)

- cf_pbt = [pbt]
- cf_dep = [dep]
- cf_amort = [amort]
- cf_prov_rev = -[d_prov_reversed]
- cf_prov_formed = [d_prov_formed]
- cf_ebo_cost = [d_ebo_service]
- cf_cap_losses = 0
- cf_cap_gains = -[cap_gains]
- cf_other_adj = 0
- cf_ecl = -[d_ecl]
- cf_impairment = -[d_impairment]
- cf_net_fin = [fin_costs]-[fin_income]
- cf_fx_unreal = -[fx_unreal]
- cf_before_wc = SUM([cf_pbt]:[cf_fx_unreal])
- cf_ofa = -[d_ofa_mov]
- cf_inventory = [inventory@-1]-[inventory]
- cf_ar = [ar@-1]-[ar]-[cf_ecl]
- cf_debtors = [debtors@-1]-[debtors]
- cf_rp = [rp@-1]-[rp]
- cf_sup_adv = [sup_adv@-1]-[sup_adv]
- cf_ap = [ap]-[ap@-1]
- cf_creditors = [creditors]-[creditors@-1]
- cf_cust_adv = [cust_adv]-[cust_adv@-1]
- cf_prov_used = -[d_prov_used]
- cf_before_dist = [cf_before_wc]+SUM([cf_ofa]:[cf_prov_used])
- cf_dist_op = -[distributions]*DIST_OP
- cf_tax_paid = -[tax_paid]
- cf_ebo_paid = -[d_ebo_paid]
- cf_int_rec_op = [fin_income]*INT_REC_OP
- cf_int_paid_op = -[debt_int]*INT_PAID_OP
- cf_cfo = [cf_before_dist]+SUM([cf_dist_op]:[cf_int_paid_op])
- cf_int_rec_inv = [fin_income]*(1-INT_REC_OP)
- cf_assoc = -[d_assoc_mov]
- cf_fvtpl = -[d_fvtpl_net]
- cf_ac = -([d_inv_nc_net]+[d_inv_cur_net])
- cf_proceeds = [d_disposal_proceeds]
- cf_capex = -[capex_total]
- cf_oa_add = -[d_oa_add]
- cf_cfi = SUM([cf_int_rec_inv]:[cf_oa_add])
- cf_div = -[dividends_paid]
- cf_leases = -[d_lease_pay]
- cf_dist_fin = -[distributions]*(1-DIST_OP)
- cf_borrow = [debt_borrow]
- cf_repay = -[debt_repay_sched]-[sweep_total]
- cf_revolver = [rev_net]
- cf_int_paid_fin = -[debt_int]*(1-INT_PAID_OP)
- cf_cff = SUM([cf_div]:[cf_int_paid_fin])
- cf_net = [cf_cfo]+[cf_cfi]+[cf_cff]
- cf_fx_cash = [fxg_cash]
- cf_ecl_cash = 0
- cf_open = [cash@-1]
- cf_close = [cf_open]+[cf_net]+[cf_fx_cash]+[cf_ecl_cash]  [historical: [cash]]

## FX

- fx_close = IF(FX_ON=1,[d_fx_close],[fx_close@-1])
- fx_avg = AVERAGE([fx_close@-1],[fx_close])
- fx_move = [fx_close]/[fx_close@-1]-1
- fx_index = [fx_avg]/[fx_avg@-1]
- fxg_cash = [cash@-1]*USD_CASH*[fx_move]
- fxg_inv_nc = [inv_nc@-1]*USD_INV_NC*[fx_move]
- fxg_inv_cur = [inv_cur@-1]*USD_INV_CUR*[fx_move]
- fxg_fvtpl = [fvtpl@-1]*USD_FVTPL*[fx_move]
- fxg_ofa = [ofa@-1]*USD_OFA*[fx_move]
- s_fxg_ar = [ar@-1]*USD_AR*[fx_move]
- s_fxg_debtors = [debtors@-1]*USD_DEBTORS*[fx_move]
- s_fxg_ap = -[ap@-1]*USD_AP*[fx_move]
- s_fxg_cred = -[creditors@-1]*USD_CREDITORS*[fx_move]
- s_fxg_cust = -[cust_adv@-1]*USD_CUST_ADV*[fx_move]
- fxg_wc = SUM([s_fxg_ar]:[s_fxg_cust])
- fxg_debt = 0
- fx_unreal = [fxg_cash]+[fxg_inv_nc]+[fxg_inv_cur]+[fxg_fvtpl]+[fxg_ofa]+[fxg_debt]

## Revenue

- s_fx_factor = IF(FX_ON=1,[fx_index],1)
- rev_export_m = [rev_export@-1]*(1+[d_g_export]+OV_GROWTH)*[s_fx_factor]
- rev_domestic_m = [rev_domestic@-1]*(1+[d_g_domestic]+OV_GROWTH)
- rev_market_total = [rev_export_m]+[rev_domestic_m]
- s_seg_urea_g = [seg_urea@-1]*(1+[d_g_urea]+OV_GROWTH)
- s_seg_urea_v = [d_vol_urea]*[d_price_urea]
- seg_urea_b = IF(REV_BASIS=VP_CODE,[s_seg_urea_v],[s_seg_urea_g])
- s_seg_ammonia_g = [seg_ammonia@-1]*(1+[d_g_ammonia]+OV_GROWTH)
- s_seg_ammonia_v = [d_vol_ammonia]*[d_price_ammonia]
- seg_ammonia_b = IF(REV_BASIS=VP_CODE,[s_seg_ammonia_v],[s_seg_ammonia_g])
- s_seg_other_g = [seg_other@-1]*(1+[d_g_other]+OV_GROWTH)
- s_seg_other_v = [d_vol_other]*[d_price_other]
- seg_other_b = IF(REV_BASIS=VP_CODE,[s_seg_other_v],[s_seg_other_g])
- rev_seg_total = [seg_urea_b]+[seg_ammonia_b]+[seg_other_b]
- s_revenue = IF(REV_BASIS=1,[rev_market_total],[rev_seg_total])
- s_rev_export = IF(REV_BASIS=1,[rev_export_m],[s_revenue]*[d_export_share])
- seg_urea = IF(REV_BASIS=1,[s_revenue]*[d_mix_urea],[seg_urea_b])
- seg_ammonia = IF(REV_BASIS=1,[s_revenue]*[d_mix_ammonia],[seg_ammonia_b])
- seg_other = IF(REV_BASIS=1,[s_revenue]*[d_mix_other],[seg_other_b])
- rev_export_usd = IF([fx_avg]=0,0,[s_rev_export]/[fx_avg])

## Cost of sales and operating costs

- s_gas_usd = [d_gas_price_usd]*[d_gas_mmbtu]*[fx_avg]
- s_gas_pct = [d_gas_pct]*[s_revenue]
- s_gas_cost = IF(GAS_MODE=1,[s_gas_usd],[s_gas_pct])
- gas_sched_tax = SCHED_ON*SCHED_RATE*[d_gas_kcf]
- depr_cogs = [s_dep]*[d_depr_cogs_share]
- other_cogs = [d_other_cogs_pct]*[s_revenue]
- cogs_lines = [s_gas_cost]+[gas_sched_tax]+[depr_cogs]+[other_cogs]
- cogs_gm = [s_revenue]*(1-[d_gm_pct])
- s_cogs_base = IF(COGS_MODE=1,[cogs_lines],[cogs_gm])
- s_cogs = [s_cogs_base]-OV_MARGIN*[s_revenue]
- s_selling = IF(SELL_MODE=1,[d_sell_pct]*[s_revenue],[selling@-1]*(1+[d_sell_g]))
- ga_cash = IF(GA_MODE=1,[d_ga_pct]*[s_revenue],[ga_cash@-1]*(1+[d_ga_g]))  [historical: [ga]-[amort]-[dep]*(1-[d_depr_cogs_share@first])]
- depr_ga = [s_dep]-[depr_cogs]

## PP&E and projects under construction

- capex_total = [d_capex_direct]+[d_capex_puc]
- puc = [puc@-1]+[d_capex_puc]-[d_puc_transfer]
- ppe_gross = [ppe_gross@-1]+[d_capex_direct]+[d_puc_transfer]-[d_disposal_cost]
- dep_base = MAX(0,[ppe_gross@-1]-[d_land]-[d_fully_dep])
- s_dep_life = IF([d_useful_life]=0,0,[dep_base]/[d_useful_life])
- s_dep_rate = [d_dep_rate]*[dep_base]
- dep_calc = IF(DEP_MODE=1,[s_dep_life],[s_dep_rate])
- ppe_nbv_open = [ppe_gross@-1]-[ppe_accum@-1]
- s_dep = MIN([dep_calc],MAX(0,[ppe_nbv_open]-[d_land]))
- disposal_accum = [d_disposal_cost]-[d_disposal_nbv]
- ppe_accum = [ppe_accum@-1]+[s_dep]-[disposal_accum]-[d_impairment]
- ppe_nbv = [ppe_gross]-[ppe_accum]  [historical: [ppe_gross]-[ppe_accum]]

## Other assets and leases

- oa_amort = [d_oa_amort_rate]*[other_assets@-1]
- rou_amort = [d_rou_amort_rate]*[rou@-1]
- s_lease_int = [d_lease_rate]*[lease_total@-1]
- lease_total = [lease_total@-1]+[d_rou_new]+[s_lease_int]-[d_lease_pay]  [historical: [lease_cur]+[lease_nc]]

## Employee benefit obligations

- s_ebo_int = [d_ebo_rate]*[ebo_total@-1]
- ebo_total = [ebo_total@-1]+[d_ebo_service]+[s_ebo_int]-[d_oci_gross]-[d_ebo_paid]  [historical: [ebo_cur]+[ebo_nc]]

## Investments and finance income

- liquid_open = [cash@-1]+[inv_nc@-1]+[inv_cur@-1]+[fvtpl@-1]
- s_liquid_close = [cash]+[inv_nc]+[inv_cur]+[fvtpl]
- s_usd_o1 = [cash@-1]*USD_CASH+[inv_nc@-1]*USD_INV_NC
- s_usd_o2 = [inv_cur@-1]*USD_INV_CUR+[fvtpl@-1]*USD_FVTPL
- usd_liquid_open = [s_usd_o1]+[s_usd_o2]
- s_usd_c1 = [cash]*USD_CASH+[inv_nc]*USD_INV_NC
- s_usd_c2 = [inv_cur]*USD_INV_CUR+[fvtpl]*USD_FVTPL
- s_usd_close = [s_usd_c1]+[s_usd_c2]
- yield_egp = YIELD_BASE+[d_yield_delta]+[d_yield_spread]
- fin_base = IF(SW_CIRC=1,AVERAGE([liquid_open],[s_liquid_close]),[liquid_open])
- fin_base_usd = IF(SW_CIRC=1,AVERAGE([usd_liquid_open],[s_usd_close]),[usd_liquid_open])
- s_fin_income = ([fin_base]-[fin_base_usd])*[yield_egp]+[fin_base_usd]*[d_usd_yield]

## Tax

- tax_rate = TAX_RATE  [historical: same]
- tax_dep = [d_tax_dep_rate]*[dep_base]
- dtl_mov_ppe = ([tax_dep]-[s_dep])*TAX_RATE
- dtl_mov_fx = [fx_unreal]*TAX_RATE
- taxable = [pbt]-([tax_dep]-[s_dep])-[fx_unreal]
- tl_created = MAX(0,-[taxable])
- tl_cum_created = [tl_cum_created@-1]+[tl_created]  [historical: reported line or 0]
- tl_lag1 = [tl_cum_created@-1]  [historical: reported line or 0]
- tl_lag2 = [tl_lag1@-1]  [historical: reported line or 0]
- tl_lag3 = [tl_lag2@-1]  [historical: reported line or 0]
- tl_lag4 = [tl_lag3@-1]  [historical: reported line or 0]
- tl_lag5 = [tl_lag4@-1]  [historical: reported line or 0]
- tl_lag6 = [tl_lag5@-1]  [historical: reported line or 0]
- tl_cum_expired = MAX([tl_cum_expired@-1],[tl_lag6]-[tl_cum_used@-1])  [historical: reported line or 0]
- tl_avail = [tl_lag1]-[tl_cum_used@-1]-[tl_cum_expired]
- tl_used = MIN([tl_avail],MAX(0,[taxable]))
- tl_cum_used = [tl_cum_used@-1]+[tl_used]  [historical: reported line or 0]
- s_current_tax = (MAX(0,[taxable])-[tl_used])*TAX_RATE
- tax_paid = [d_tax_pay_pct]*[tax_payable@-1]

## Equity and distributions

- lr_cap = LR_CAP*[capital@-1]
- s_lr_room = [lr_cap]-[legal_reserve@-1]
- s_lr_calc = LR_PCT*MAX(0,[net_profit@-1])
- s_lr_transfer = MAX(0,MIN([s_lr_calc],[s_lr_room]))
- distributable = [net_profit@-1]-[s_lr_transfer]
- s_div_payout = [d_payout]*MAX(0,[distributable])
- s_div_dps = [d_dps]*[shares@-1]
- declared_dividends = IF(DIV_MODE=1,[s_div_payout],[s_div_dps])
- emp_calc = [d_emp_pct]*[declared_dividends]
- emp_dist = IF([d_wages]>0,MIN([emp_calc],[d_wages]),[emp_calc])
- board_dist = [d_board_pct]*MAX(0,[distributable])
- distributions = [emp_dist]+[board_dist]
- dividends_paid = [dividends_payable@-1]+[d_div_pay_pct]*[declared_dividends]
- bonus_total = [d_bonus_re]+[d_bonus_res]  [historical: [s_h_bonus_re]+[s_h_bonus_res]]
- s_h_bonus_re = [d_bonus_re]  [historical: INPUT:bonus_re]
- s_h_bonus_res = [d_bonus_res]  [historical: INPUT:bonus_res]
- s_re1 = [re@-1]+[net_profit]+[oci_net]
- s_re2 = [s_lr_transfer]+[distributions]+[declared_dividends]+[d_bonus_re]
- s_re = [s_re1]-[s_re2]
- shares = [shares@-1]+IF(PAR=0,0,[bonus_total]/PAR)
- emp_floor = EMP_FLOOR*[declared_dividends]
- board_cap = BOARD_CAP*MAX(0,[distributable]-BOARD_MIN*[capital@-1])

## Debt and cash management

- debt_borrow = 0
- debt_repay_sched = 0
- sweep_total = 0
- s_cf_pre1 = [cf_open]+[cf_cfo]+[cf_cfi]+[cf_fx_cash]+[cf_ecl_cash]
- s_cf_pre2 = [cf_div]+[cf_leases]+[cf_dist_fin]+[cf_int_paid_fin]
- pre_rev_cash = [s_cf_pre1]+[s_cf_pre2]+[debt_borrow]-[debt_repay_sched]
- rev_open = [rev_close@-1]
- rev_net = IF(REV_ON=1,MAX([d_min_cash]-[pre_rev_cash],-[rev_open]),0)
- rev_close = [rev_open]+[rev_net]
- surplus = MAX(0,[pre_rev_cash]+[rev_net]-[d_min_cash])
- rev_rate = FLOAT_BASE+[d_base_delta]+REV_SPREAD
- s_rev_base = IF(SW_CIRC=1,AVERAGE([rev_open],[rev_close]),[rev_open])
- rev_int = [rev_rate]*[s_rev_base]
- s_debt_int = [rev_int]
- debt_total = [rev_close]  [historical: [debt_cur]+[debt_nc]]

## Margins and aggregates

- ebit = [op_profit]  [historical: same]
- ebitda = [op_profit]+[dep]+[amort]  [historical: same]
- gross_margin = IF([revenue]=0,0,[gross_profit]/[revenue])  [historical: same]
- op_margin = IF([revenue]=0,0,[op_profit]/[revenue])  [historical: same]
- ebitda_margin = IF([revenue]=0,0,[ebitda]/[revenue])  [historical: same]
- net_margin = IF([revenue]=0,0,[net_profit]/[revenue])  [historical: same]
- lease_liab = [lease_cur]+[lease_nc]  [historical: same]
- total_debt = [debt_cur]+[debt_nc]  [historical: same]
- liquid = [cash]+[inv_nc]+[inv_cur]+[fvtpl]  [historical: same]
- net_debt = [total_debt]+[lease_liab]-[liquid]  [historical: same]
- working_capital = [total_ca]-[total_cl]  [historical: same]

## Liquidity, leverage, coverage, efficiency

- current_ratio = IF([total_cl]=0,0,[total_ca]/[total_cl])  [historical: same]
- quick_ratio = IF([total_cl]=0,0,([total_ca]-[inventory])/[total_cl])  [historical: same]
- cash_ratio = IF([total_cl]=0,0,[cash]/[total_cl])  [historical: same]
- debt_equity = IF([total_equity]=0,0,([total_debt]+[lease_liab])/[total_equity])  [historical: same]
- liab_assets = IF([total_assets]=0,0,[total_liabilities]/[total_assets])  [historical: same]
- net_debt_ebitda = IF([ebitda]=0,0,[net_debt]/[ebitda])  [historical: same]
- debt_ebitda = IF([ebitda]=0,0,([total_debt]+[lease_liab])/[ebitda])  [historical: same]
- interest_cover = IF([fin_costs]=0,0,[ebit]/[fin_costs])  [historical: same]
- ebitda_cover = IF([fin_costs]=0,0,[ebitda]/[fin_costs])  [historical: same]
- dso_calc = IF([revenue]=0,0,[ar]/[revenue])*365  [historical: same]
- dio_calc = IF([cogs]=0,0,[inventory]/[cogs])*365  [historical: same]
- dpo_calc = IF([cogs]=0,0,[ap]/[cogs])*365  [historical: same]
- ccc = [dso_calc]+[dio_calc]-[dpo_calc]  [historical: same]
- avg_assets = AVERAGE([total_assets],[total_assets@-1])  [historical: same]
- avg_equity = AVERAGE([total_equity],[total_equity@-1])  [historical: same]
- asset_turnover = IF([avg_assets]=0,0,[revenue]/[avg_assets])  [historical: same]
- s_avg_inv = AVERAGE([inventory],[inventory@-1])  [historical: same]
- inventory_turnover = IF([s_avg_inv]=0,0,[cogs]/[s_avg_inv])  [historical: same]

## Returns

- roe = IF([avg_equity]=0,0,[net_profit]/[avg_equity])  [historical: same]
- roa = IF([avg_assets]=0,0,[net_profit]/[avg_assets])  [historical: same]
- invested_capital = [total_equity]+[total_debt]+[lease_liab]-[liquid]  [historical: same]
- nopat = [ebit]*(1-[tax_rate])  [historical: same]
- s_avg_ic = AVERAGE([invested_capital],[invested_capital@-1])  [historical: same]
- roic = IF([s_avg_ic]=0,0,[nopat]/[s_avg_ic])  [historical: same]

## DuPont

- dupont_em = IF([avg_equity]=0,0,[avg_assets]/[avg_equity])  [historical: same]
- dupont3_roe = [net_margin]*[asset_turnover]*[dupont_em]  [historical: same]
- dupont_tax_burden = IF([pbt]=0,0,[net_profit]/[pbt])  [historical: same]
- dupont_int_burden = IF([ebit]=0,0,[pbt]/[ebit])  [historical: same]
- dupont5_roe = [dupont_tax_burden]*[dupont_int_burden]*[op_margin]*[asset_turnover]*[dupont_em]  [historical: same]

## Cash conversion and covenants

- fcf = [cf_cfo]+[cf_capex]+[cf_oa_add]  [historical: same]
- cfo_ebitda = IF([ebitda]=0,0,[cf_cfo]/[ebitda])  [historical: same]
- fcf_np = IF([net_profit]=0,0,[fcf]/[net_profit])  [historical: same]
- fcf_debt = IF(([total_debt]+[lease_liab])=0,0,[fcf]/([total_debt]+[lease_liab]))  [historical: same]
- cov_leverage = IF([net_debt_ebitda]<=COV_LEV,1,0)  [historical: same]
- cov_cover = IF([interest_cover]>=COV_COVER,1,0)  [historical: same]
- cov_current = IF([current_ratio]>=COV_CURRENT,1,0)  [historical: same]

## FCFF and FCFE bridge

- fcff_nopat = [nopat]  [historical: same]
- fcff_da = [cf_dep]+[cf_amort]  [historical: same]
- s_nc1 = [cf_prov_rev]+[cf_prov_formed]+[cf_ebo_cost]  [historical: same]
- s_nc2 = [cf_cap_losses]+[cf_cap_gains]+[cf_other_adj]+[cf_ecl]+[cf_impairment]  [historical: same]
- fcff_noncash = [s_nc1]+[s_nc2]  [historical: same]
- fcff_wc = SUM([cf_ofa]:[cf_prov_used])+[cf_ebo_paid]  [historical: same]
- fcff_dist = [cf_dist_op]+[cf_dist_fin]  [historical: same]
- fcff_capex = [cf_capex]+[cf_oa_add]+[cf_proceeds]  [historical: same]
- s_fcff_1 = [fcff_nopat]+[fcff_da]+[fcff_noncash]  [historical: same]
- fcff = [s_fcff_1]+[fcff_wc]+[fcff_dist]+[fcff_capex]  [historical: same]
- fcfe_fin_income = [fin_income]*(1-[tax_rate])  [historical: same]
- fcfe_interest = -[debt_int]*(1-[tax_rate])  [historical: same]
- fcfe_leases = [cf_leases]  [historical: same]
- fcfe_borrow = [cf_borrow]+[cf_repay]+[cf_revolver]  [historical: same]
- fcfe = [fcff]+[fcfe_fin_income]+[fcfe_interest]+[fcfe_leases]+[fcfe_borrow]  [historical: same]

## Altman Z''-EM (coefficients and zones unconfirmed until verified against Altman 2005)

- alt_x1 = IF([total_assets]=0,0,[working_capital]/[total_assets])  [historical: same]
- alt_x2 = IF([total_assets]=0,0,[re]/[total_assets])  [historical: same]
- alt_x3 = IF([total_assets]=0,0,[ebit]/[total_assets])  [historical: same]
- alt_x4 = IF([total_liabilities]=0,0,[total_equity]/[total_liabilities])  [historical: same]
- s_alt_a = ALT_C+ALT_1*[alt_x1]+ALT_2*[alt_x2]  [historical: same]
- altman_z = [s_alt_a]+ALT_3*[alt_x3]+ALT_4*[alt_x4]  [historical: same]
- altman_zone = IF([altman_z]>ALT_SAFE,1,IF([altman_z]>=ALT_GREY,ZONE_GREY,ZONE_DIST))  [historical: same]

## Piotroski F-score (bonus shares are not dilution)

- f_roa = IF([net_profit]>0,1,0)  [historical: same]
- f_cfo = IF([cf_cfo]>0,1,0)  [historical: same]
- roa_close = IF([total_assets]=0,0,[net_profit]/[total_assets])  [historical: same]
- f_droa = IF([roa_close]>[roa_close@-1],1,0)  [historical: same]
- f_accrual = IF([cf_cfo]>[net_profit],1,0)  [historical: same]
- lt_leverage = IF([total_assets]=0,0,([debt_nc]+[lease_nc])/[total_assets])  [historical: same]
- f_lever = IF([lt_leverage]<=[lt_leverage@-1],1,0)  [historical: same]
- f_liquid = IF([current_ratio]>[current_ratio@-1],1,0)  [historical: same]
- shares_ex_bonus = [shares]-IF(PAR=0,0,[bonus_total]/PAR)  [historical: same]
- f_shares = IF([shares_ex_bonus]<=[shares@-1]+1,1,0)  [historical: same]
- f_margin = IF([gross_margin]>[gross_margin@-1],1,0)  [historical: same]
- turn_close = IF([total_assets]=0,0,[revenue]/[total_assets])  [historical: same]
- f_turn = IF([turn_close]>[turn_close@-1],1,0)  [historical: same]
- piotroski = [f_roa]+[f_cfo]+[f_droa]+[f_accrual]+[f_lever]+[f_liquid]+[f_shares]+[f_margin]+[f_turn]  [historical: same]

## Per share

- eps = IF([shares]=0,0,[net_profit]/[shares])  [historical: same]
- eps_restated = IF([shares@last]=0,0,[net_profit]/[shares@last])  [historical: same]

## Common size, income statement (% of net sales)

- cs_revenue = IF([revenue]=0,0,[revenue]/[revenue])  [historical: same]
- cs_cogs = IF([revenue]=0,0,[cogs]/[revenue])  [historical: same]
- cs_gross_profit = IF([revenue]=0,0,[gross_profit]/[revenue])  [historical: same]
- cs_selling = IF([revenue]=0,0,[selling]/[revenue])  [historical: same]
- cs_ga = IF([revenue]=0,0,[ga]/[revenue])  [historical: same]
- cs_op_profit = IF([revenue]=0,0,[op_profit]/[revenue])  [historical: same]
- cs_fin_income = IF([revenue]=0,0,[fin_income]/[revenue])  [historical: same]
- cs_fin_costs = IF([revenue]=0,0,[fin_costs]/[revenue])  [historical: same]
- cs_fx_line = IF([revenue]=0,0,[fx_line]/[revenue])  [historical: same]
- cs_pbt = IF([revenue]=0,0,[pbt]/[revenue])  [historical: same]
- cs_net_profit = IF([revenue]=0,0,[net_profit]/[revenue])  [historical: same]

## Common size, balance sheet (% of total assets)

- cs_fixed_assets = IF([total_assets]=0,0,[fixed_assets]/[total_assets])  [historical: same]
- cs_inv_nc = IF([total_assets]=0,0,[inv_nc]/[total_assets])  [historical: same]
- cs_inventory = IF([total_assets]=0,0,[inventory]/[total_assets])  [historical: same]
- cs_ar = IF([total_assets]=0,0,[ar]/[total_assets])  [historical: same]
- cs_inv_cur = IF([total_assets]=0,0,[inv_cur]/[total_assets])  [historical: same]
- cs_fvtpl = IF([total_assets]=0,0,[fvtpl]/[total_assets])  [historical: same]
- cs_debtors = IF([total_assets]=0,0,[debtors]/[total_assets])  [historical: same]
- cs_cash = IF([total_assets]=0,0,[cash]/[total_assets])  [historical: same]
- cs_total_ca = IF([total_assets]=0,0,[total_ca]/[total_assets])  [historical: same]
- cs_total_assets = IF([total_assets]=0,0,[total_assets]/[total_assets])  [historical: same]
- cs_capital = IF([total_assets]=0,0,[capital]/[total_assets])  [historical: same]
- cs_re = IF([total_assets]=0,0,[re]/[total_assets])  [historical: same]
- cs_total_equity = IF([total_assets]=0,0,[total_equity]/[total_assets])  [historical: same]
- cs_dtl = IF([total_assets]=0,0,[dtl]/[total_assets])  [historical: same]
- cs_tax_payable = IF([total_assets]=0,0,[tax_payable]/[total_assets])  [historical: same]
- cs_ap = IF([total_assets]=0,0,[ap]/[total_assets])  [historical: same]
- cs_creditors = IF([total_assets]=0,0,[creditors]/[total_assets])  [historical: same]
- cs_cust_adv = IF([total_assets]=0,0,[cust_adv]/[total_assets])  [historical: same]
- cs_total_liabilities = IF([total_assets]=0,0,[total_liabilities]/[total_assets])  [historical: same]

## Year on year

- yoy_revenue = IF([revenue@-1]=0,0,[revenue]/[revenue@-1]-1)  [historical: same]
- yoy_cogs = IF([cogs@-1]=0,0,[cogs]/[cogs@-1]-1)  [historical: same]
- yoy_gross_profit = IF([gross_profit@-1]=0,0,[gross_profit]/[gross_profit@-1]-1)  [historical: same]
- yoy_selling = IF([selling@-1]=0,0,[selling]/[selling@-1]-1)  [historical: same]
- yoy_ga = IF([ga@-1]=0,0,[ga]/[ga@-1]-1)  [historical: same]
- yoy_op_profit = IF([op_profit@-1]=0,0,[op_profit]/[op_profit@-1]-1)  [historical: same]
- yoy_fin_income = IF([fin_income@-1]=0,0,[fin_income]/[fin_income@-1]-1)  [historical: same]
- yoy_fin_costs = IF([fin_costs@-1]=0,0,[fin_costs]/[fin_costs@-1]-1)  [historical: same]
- yoy_fx_line = IF([fx_line@-1]=0,0,[fx_line]/[fx_line@-1]-1)  [historical: same]
- yoy_pbt = IF([pbt@-1]=0,0,[pbt]/[pbt@-1]-1)  [historical: same]
- yoy_net_profit = IF([net_profit@-1]=0,0,[net_profit]/[net_profit@-1]-1)  [historical: same]
- yoy_fixed_assets = IF([fixed_assets@-1]=0,0,[fixed_assets]/[fixed_assets@-1]-1)  [historical: same]
- yoy_inv_nc = IF([inv_nc@-1]=0,0,[inv_nc]/[inv_nc@-1]-1)  [historical: same]
- yoy_inventory = IF([inventory@-1]=0,0,[inventory]/[inventory@-1]-1)  [historical: same]
- yoy_ar = IF([ar@-1]=0,0,[ar]/[ar@-1]-1)  [historical: same]
- yoy_inv_cur = IF([inv_cur@-1]=0,0,[inv_cur]/[inv_cur@-1]-1)  [historical: same]
- yoy_fvtpl = IF([fvtpl@-1]=0,0,[fvtpl]/[fvtpl@-1]-1)  [historical: same]
- yoy_debtors = IF([debtors@-1]=0,0,[debtors]/[debtors@-1]-1)  [historical: same]
- yoy_cash = IF([cash@-1]=0,0,[cash]/[cash@-1]-1)  [historical: same]
- yoy_total_ca = IF([total_ca@-1]=0,0,[total_ca]/[total_ca@-1]-1)  [historical: same]
- yoy_total_assets = IF([total_assets@-1]=0,0,[total_assets]/[total_assets@-1]-1)  [historical: same]
- yoy_capital = IF([capital@-1]=0,0,[capital]/[capital@-1]-1)  [historical: same]
- yoy_re = IF([re@-1]=0,0,[re]/[re@-1]-1)  [historical: same]
- yoy_total_equity = IF([total_equity@-1]=0,0,[total_equity]/[total_equity@-1]-1)  [historical: same]
- yoy_dtl = IF([dtl@-1]=0,0,[dtl]/[dtl@-1]-1)  [historical: same]
- yoy_tax_payable = IF([tax_payable@-1]=0,0,[tax_payable]/[tax_payable@-1]-1)  [historical: same]
- yoy_ap = IF([ap@-1]=0,0,[ap]/[ap@-1]-1)  [historical: same]
- yoy_creditors = IF([creditors@-1]=0,0,[creditors]/[creditors@-1]-1)  [historical: same]
- yoy_cust_adv = IF([cust_adv@-1]=0,0,[cust_adv]/[cust_adv@-1]-1)  [historical: same]
- yoy_total_liabilities = IF([total_liabilities@-1]=0,0,[total_liabilities]/[total_liabilities@-1]-1)  [historical: same]

## Drivers

- d_g_export: Export growth in USD (pct)
- d_g_domestic: Domestic growth (pct)
- d_g_urea: Urea growth (segment basis) (pct)
- d_g_ammonia: Ammonia growth (segment basis) (pct)
- d_g_other: Other growth (segment basis) (pct)
- d_mix_urea: Urea share of sales (market basis) (pct)
- d_mix_ammonia: Ammonia share of sales (market basis) (pct)
- d_mix_other: Other share of sales (market basis) (pct)
- d_export_share: Export share (segment basis) (pct)
- d_vol_urea: Urea volume, tonnes (num)
- d_vol_ammonia: Ammonia volume, tonnes (num)
- d_vol_other: Other volume (num)
- d_price_urea: Urea price, EGP per tonne (num)
- d_price_ammonia: Ammonia price, EGP per tonne (num)
- d_price_other: Other price (num)
- d_gas_pct: Gas, % of sales (pct)
- d_gas_price_usd: Gas price, USD per MMBtu (num)
- d_gas_mmbtu: Gas consumption, MMBtu (num)
- d_gas_kcf: Gas consumption, thousand cubic feet (num)
- d_other_cogs_pct: Other cost of sales, % of sales (pct)
- d_gm_pct: Gross margin (gross margin mode) (pct)
- d_depr_cogs_share: Depreciation share in cost of sales (pct)
- d_sell_pct: Selling and marketing, % of sales (pct)
- d_sell_g: Selling and marketing growth (pct)
- d_ga_pct: G&A excl. D&A, % of sales (pct)
- d_ga_g: G&A excl. D&A growth (pct)
- d_other_income: Other income excl. reversals (egp)
- d_prov_reversed: Provisions no longer required (egp)
- d_other_exp: Other expenses excl. formed (egp)
- d_prov_formed: Provisions formed (egp)
- d_impairment: Impairment reversal (egp)
- d_ecl: ECL reversal / (charge) (egp)
- d_capex_direct: Capex direct to PP&E (egp)
- d_capex_puc: Capex to PUC (egp)
- d_puc_transfer: Transfers from PUC (egp)
- d_disposal_cost: Disposals at cost (egp)
- d_disposal_nbv: Disposals, net book value (egp)
- d_disposal_proceeds: Disposal proceeds (egp)
- d_land: Land at cost (not depreciated) (egp)
- d_fully_dep: Fully depreciated assets still in use (egp)
- d_dep_rate: Depreciation, % of depreciable base (pct)
- d_useful_life: Useful life, years (num)
- d_tax_dep_rate: Tax depreciation rate (pct)
- d_oa_add: Other assets additions (egp)
- d_oa_amort_rate: Other assets amortization rate (pct)
- d_rou_new: New leases (egp)
- d_rou_amort_rate: ROU amortization rate (pct)
- d_lease_rate: Lease interest rate (pct)
- d_lease_pay: Lease payments (egp)
- d_lease_cur_share: Current share of lease liability (pct)
- d_dso: DSO on revenue (days)
- d_dio: DIO on COGS (days)
- d_dpo: DPO on COGS (days)
- d_debtors_pct: Debtors, % of sales (pct)
- d_sup_adv_pct: Supplier advances, % of sales (pct)
- d_creditors_pct: Creditors, % of sales (pct)
- d_cust_adv_pct: Customer advances, % of sales (pct)
- d_rp_balance: Due from related parties (egp)
- d_ebo_service: Benefit service cost (egp)
- d_ebo_rate: Benefit interest rate (pct)
- d_ebo_paid: Benefits paid (egp)
- d_ebo_cur_share: Current share of benefits (pct)
- d_oci_gross: Actuarial result, gross (loss negative) (egp)
- d_prov_used: Provisions used (egp)
- d_tax_pay_pct: Share of opening tax payable paid in the year (pct)
- d_yield_delta: EGP yield path vs registry base (pct)
- d_yield_spread: EGP yield spread (pct)
- d_usd_yield: USD deposit yield (pct)
- d_base_delta: Floating base path vs registry base (pct)
- d_fx_close: USD/EGP closing path (fx)
- d_inv_nc_net: Investments, non-current: net purchases (egp)
- d_inv_cur_net: Investments, current: net purchases (egp)
- d_fvtpl_net: FVTPL: net purchases (egp)
- d_ofa_mov: Other financial assets: movement (egp)
- d_assoc_mov: Associates: movement (egp)
- d_payout: Payout of prior-year distributable (pct)
- d_dps: DPS (DPS mode) (ps)
- d_emp_pct: Employee share, % of dividends (pct)
- d_wages: Total annual wages (cap; 0 = not entered) (egp)
- d_board_pct: Board remuneration, % of distributable (pct)
- d_div_pay_pct: Share of declared dividends paid in the year (pct)
- d_bonus_re: Bonus shares from retained earnings (egp)
- d_bonus_res: Bonus shares from general reserve (egp)
- d_min_cash: Minimum cash balance (egp)
- d_sweep_pct: Cash sweep, % of surplus (pct)
- d_debt_cur_share: Current share of borrowings (pct)
