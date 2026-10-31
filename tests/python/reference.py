"""Independent reference model, written from docs/METHODOLOGY.md. Standard library only.

Usage: python reference.py inputs.json output.json
Input: resolved inputs dumped by scripts/verify-part11.ts. Output: {row id: [value per period]}.
"""
import json
import sys


def safe(a, b):
    return 0.0 if b == 0 else a / b


class Model:
    def __init__(self, cfg):
        self.cfg = cfg
        self.years_h = cfg["years"]
        self.n_h = len(self.years_h)
        self.n_y = cfg["nYears"]
        self.s = cfg["settings"]
        self.tr = cfg["tranches"]
        self.t = cfg["taxRate"]
        self.periods = []

    def driver(self, key, i):
        return self.cfg["drivers"][key][i]

    def history(self):
        cfg = self.cfg
        d0 = cfg["drivers"]["depr_cogs_share"][0]
        for idx, _ in enumerate(self.years_h):
            a = {k: v[idx] for k, v in cfg["accounts"].items() if v[idx] is not None}
            get = lambda k: a.get(k, 0.0)
            r = dict(a)
            r["revenue"] = get("rev_export") + get("rev_domestic")
            r["gross_profit"] = r["revenue"] - get("cogs")
            r["op_profit"] = (r["gross_profit"] + get("other_income_total") - get("selling") - get("ga")
                              + get("cap_gains") - get("other_exp_total") + get("impairment") + get("ecl"))
            r["debt_int"] = get("debt_int")
            r["fin_costs"] = get("lease_int") + get("ebo_int") + r["debt_int"]
            r["pbt"] = r["op_profit"] + get("fin_income") - r["fin_costs"] + get("fx_line")
            r["net_profit"] = r["pbt"] - get("current_tax") - get("deferred_tax")
            r["oci_net"] = get("oci_gross") + get("oci_dt")
            r["total_nca"] = sum(get(k) for k in ["fixed_assets", "other_assets", "rou", "associates", "inv_nc", "ofa"])
            r["total_ca"] = sum(get(k) for k in ["inventory", "ar", "inv_cur", "fvtpl", "debtors", "rp", "sup_adv", "cash"])
            r["total_assets"] = r["total_nca"] + r["total_ca"]
            r["total_equity"] = sum(get(k) for k in ["capital", "legal_reserve", "general_reserve", "merger_reserve", "re"])
            r["debt_cur"], r["debt_nc"] = get("debt_cur"), get("debt_nc")
            r["dividends_payable"] = get("dividends_payable")
            r["total_ncl"] = get("lease_nc") + r["debt_nc"] + get("dtl") + get("ebo_nc")
            r["total_cl"] = sum(get(k) for k in ["tax_payable", "lease_cur", "ap", "creditors", "cust_adv", "ebo_cur", "provisions"]) + r["debt_cur"] + r["dividends_payable"]
            r["total_liabilities"] = r["total_ncl"] + r["total_cl"]
            r["total_le"] = r["total_liabilities"] + r["total_equity"]
            r["balance_check"] = r["total_assets"] - r["total_le"]
            r["tax_rate"] = self.t
            r["lease_total"] = get("lease_cur") + get("lease_nc")
            r["ebo_total"] = get("ebo_cur") + get("ebo_nc")
            r["debt_total"] = r["debt_cur"] + r["debt_nc"]
            r["ga_cash"] = get("ga") - get("amort") - get("dep") * (1 - d0)
            if "ppe_gross" in a and "ppe_accum" in a:
                r["ppe_nbv"] = a["ppe_gross"] - a["ppe_accum"]
            if "bonus_re" in a or "bonus_res" in a:
                r["bonus_total"] = get("bonus_re") + get("bonus_res")
            if "cf_open" in a:
                r["cf_close"] = get("cash")
            if idx == self.n_h - 1:
                r["fx_close"] = self.s["fxHistClose"]
                r["fx_avg"] = self.s["fxHistAvg"]
                r["rev_close"] = 0.0
                for k, tr in enumerate(self.tr):
                    r["tr%d_close" % k] = tr["openingEgp"]
            self.periods.append(r)

    def year(self, i, p, g):
        s, u, t = self.s, self.s["usd"], self.t
        D = lambda key: self.driver(key, i)
        y = {}
        circ = s["circularity"] == 1
        ov_g, ov_m = self.cfg["overlayGrowth"], self.cfg["overlayMargin"]
        # FX
        y["fx_close"] = D("fx_close") if s["fxOn"] == 1 else p["fx_close"]
        y["fx_avg"] = (p["fx_close"] + y["fx_close"]) / 2
        y["fx_move"] = y["fx_close"] / p["fx_close"] - 1
        y["fx_index"] = y["fx_avg"] / p["fx_avg"]
        m = y["fx_move"]
        y["fxg_cash"] = p["cash"] * u["cash"] * m
        y["fxg_inv_nc"] = p["inv_nc"] * u["inv_nc"] * m
        y["fxg_inv_cur"] = p["inv_cur"] * u["inv_cur"] * m
        y["fxg_fvtpl"] = p["fvtpl"] * u["fvtpl"] * m
        y["fxg_ofa"] = p["ofa"] * u["ofa"] * m
        y["fxg_wc"] = (p["ar"] * u["ar"] + p["debtors"] * u["debtors"] - p["ap"] * u["ap"]
                       - p["creditors"] * u["creditors"] - p["cust_adv"] * u["cust_adv"]) * m
        # Revenue
        factor = y["fx_index"] if s["fxOn"] == 1 else 1.0
        y["rev_export_m"] = p["rev_export"] * (1 + D("g_export") + ov_g) * factor
        y["rev_domestic_m"] = p["rev_domestic"] * (1 + D("g_domestic") + ov_g)
        y["rev_market_total"] = y["rev_export_m"] + y["rev_domestic_m"]
        for seg in ("urea", "ammonia", "other"):
            grown = p["seg_" + seg] * (1 + D("g_" + seg) + ov_g)
            y["seg_%s_b" % seg] = D("vol_" + seg) * D("price_" + seg) if s["revenueBasis"] == 3 else grown
        y["rev_seg_total"] = y["seg_urea_b"] + y["seg_ammonia_b"] + y["seg_other_b"]
        by_market = s["revenueBasis"] == 1
        rev = y["rev_market_total"] if by_market else y["rev_seg_total"]
        y["revenue"] = rev
        for seg in ("urea", "ammonia", "other"):
            y["seg_" + seg] = rev * D("mix_" + seg) if by_market else y["seg_%s_b" % seg]
        y["rev_export"] = y["rev_export_m"] if by_market else rev * D("export_share")
        y["rev_domestic"] = rev - y["rev_export"]
        y["rev_export_usd"] = safe(y["rev_export"], y["fx_avg"])
        # PP&E
        y["capex_total"] = D("capex_direct") + D("capex_puc")
        y["puc"] = p["puc"] + D("capex_puc") - D("puc_transfer")
        y["ppe_gross"] = p["ppe_gross"] + D("capex_direct") + D("puc_transfer") - D("disposal_cost")
        y["dep_base"] = max(0.0, p["ppe_gross"] - D("land") - D("fully_dep"))
        y["dep_calc"] = safe(y["dep_base"], D("useful_life")) if s["depMode"] == 1 else D("dep_rate") * y["dep_base"]
        y["ppe_nbv_open"] = p["ppe_gross"] - p["ppe_accum"]
        y["dep"] = min(y["dep_calc"], max(0.0, y["ppe_nbv_open"] - D("land")))
        y["disposal_accum"] = D("disposal_cost") - D("disposal_nbv")
        y["ppe_accum"] = p["ppe_accum"] + y["dep"] - y["disposal_accum"] - D("impairment")
        y["ppe_nbv"] = y["ppe_gross"] - y["ppe_accum"]
        y["fixed_assets"] = y["ppe_nbv"] + y["puc"]
        y["cap_gains"] = D("disposal_proceeds") - D("disposal_nbv")
        # Other assets and leases
        y["oa_amort"] = D("oa_amort_rate") * p["other_assets"]
        y["other_assets"] = p["other_assets"] + D("oa_add") - y["oa_amort"]
        y["rou_amort"] = D("rou_amort_rate") * p["rou"]
        y["rou"] = p["rou"] + D("rou_new") - y["rou_amort"]
        y["lease_int"] = D("lease_rate") * p["lease_total"]
        y["lease_total"] = p["lease_total"] + D("rou_new") + y["lease_int"] - D("lease_pay")
        y["lease_cur"] = y["lease_total"] * D("lease_cur_share")
        y["lease_nc"] = y["lease_total"] - y["lease_cur"]
        y["amort"] = y["oa_amort"] + y["rou_amort"]
        # Costs
        y["gas_cost"] = D("gas_price_usd") * D("gas_mmbtu") * y["fx_avg"] if s["gasMode"] == 1 else D("gas_pct") * rev
        y["gas_sched_tax"] = s["schedTaxOn"] * self.cfg["schedRate"] * D("gas_kcf")
        y["depr_cogs"] = y["dep"] * D("depr_cogs_share")
        y["other_cogs"] = D("other_cogs_pct") * rev
        y["cogs_lines"] = y["gas_cost"] + y["gas_sched_tax"] + y["depr_cogs"] + y["other_cogs"]
        y["cogs_gm"] = rev * (1 - D("gm_pct"))
        y["cogs"] = (y["cogs_lines"] if s["cogsMode"] == 1 else y["cogs_gm"]) - ov_m * rev
        y["gross_profit"] = rev - y["cogs"]
        y["selling"] = D("sell_pct") * rev if s["sellMode"] == 1 else p["selling"] * (1 + D("sell_g"))
        y["ga_cash"] = D("ga_pct") * rev if s["gaMode"] == 1 else p["ga_cash"] * (1 + D("ga_g"))
        y["depr_ga"] = y["dep"] - y["depr_cogs"]
        y["ga"] = y["ga_cash"] + y["amort"] + y["depr_ga"]
        y["other_income_total"] = D("other_income") + D("prov_reversed")
        y["prov_reversed"] = D("prov_reversed")
        y["other_exp_total"] = D("other_exp") + D("prov_formed")
        y["impairment"], y["ecl"] = D("impairment"), D("ecl")
        y["op_profit"] = (y["gross_profit"] + y["other_income_total"] - y["selling"] - y["ga"] + y["cap_gains"]
                          - y["other_exp_total"] + y["impairment"] + y["ecl"])
        # Working capital
        y["ar"] = D("dso") * rev / 365
        y["inventory"] = D("dio") * y["cogs"] / 365
        y["ap"] = D("dpo") * y["cogs"] / 365
        y["debtors"] = D("debtors_pct") * rev
        y["sup_adv"] = D("sup_adv_pct") * rev
        y["creditors"] = D("creditors_pct") * rev
        y["cust_adv"] = D("cust_adv_pct") * rev
        y["rp"] = D("rp_balance")
        # Provisions and benefits
        y["provisions"] = p["provisions"] + D("prov_formed") - D("prov_reversed") - D("prov_used")
        y["ebo_int"] = D("ebo_rate") * p["ebo_total"]
        y["ebo_total"] = p["ebo_total"] + D("ebo_service") + y["ebo_int"] - D("oci_gross") - D("ebo_paid")
        y["ebo_cur"] = y["ebo_total"] * D("ebo_cur_share")
        y["ebo_nc"] = y["ebo_total"] - y["ebo_cur"]
        # Investments
        y["inv_nc"] = p["inv_nc"] + D("inv_nc_net") + y["fxg_inv_nc"]
        y["inv_cur"] = p["inv_cur"] + D("inv_cur_net") + y["fxg_inv_cur"]
        y["fvtpl"] = p["fvtpl"] + D("fvtpl_net") + y["fxg_fvtpl"]
        y["ofa"] = p["ofa"] + D("ofa_mov") + y["fxg_ofa"]
        y["associates"] = p["associates"] + D("assoc_mov")
        # Debt schedule
        steps = []
        float_base = self.cfg["floatBase"] + D("base_delta")
        for k, tr in enumerate(self.tr):
            usd = tr["currency"] == "USD"
            conv = y["fx_avg"] if usd else 1.0
            o = p["tr%d_close" % k]
            fx = o * m if usd else 0.0
            bor = tr["borrow"][i] * conv
            rep = min(tr["repay"][i] * conv, o + fx + bor)
            rate = float_base + tr["spread"] if tr["rateType"] == "floating" else tr["fixedRate"]
            aft = o + fx + bor - rep
            intr = rate * ((o + g["tr"][k]) / 2 if circ else o)
            steps.append((o, fx, bor, rep, aft, rate))
            y.update({"tr%d_open" % k: o, "tr%d_fx" % k: fx, "tr%d_borrow" % k: bor, "tr%d_repay" % k: rep,
                      "tr%d_after" % k: aft, "tr%d_rate" % k: rate, "tr%d_int" % k: intr})
        y["debt_borrow"] = sum(x[2] for x in steps)
        y["debt_repay_sched"] = sum(x[3] for x in steps)
        y["fxg_debt"] = -sum(x[1] for x in steps)
        y["rev_open"] = p["rev_close"]
        y["rev_rate"] = float_base + s["revolverSpread"]
        y["rev_int"] = y["rev_rate"] * ((p["rev_close"] + g["rev"]) / 2 if circ else p["rev_close"])
        y["debt_int"] = sum(y["tr%d_int" % k] for k in range(len(self.tr))) + y["rev_int"]
        # Finance income
        liquid = lambda c, n, cu, f: c + n + cu + f
        usdliq = lambda c, n, cu, f: c * u["cash"] + n * u["inv_nc"] + cu * u["inv_cur"] + f * u["fvtpl"]
        y["liquid_open"] = liquid(p["cash"], p["inv_nc"], p["inv_cur"], p["fvtpl"])
        y["usd_liquid_open"] = usdliq(p["cash"], p["inv_nc"], p["inv_cur"], p["fvtpl"])
        y["yield_egp"] = self.cfg["yieldBase"] + D("yield_delta") + D("yield_spread")
        y["fin_base"] = (y["liquid_open"] + g["liq"]) / 2 if circ else y["liquid_open"]
        y["fin_base_usd"] = (y["usd_liquid_open"] + g["usd"]) / 2 if circ else y["usd_liquid_open"]
        y["fin_income"] = (y["fin_base"] - y["fin_base_usd"]) * y["yield_egp"] + y["fin_base_usd"] * D("usd_yield")
        y["fin_costs"] = y["lease_int"] + y["ebo_int"] + y["debt_int"]
        y["fx_unreal"] = y["fxg_cash"] + y["fxg_inv_nc"] + y["fxg_inv_cur"] + y["fxg_fvtpl"] + y["fxg_ofa"] + y["fxg_debt"]
        y["fx_line"] = y["fx_unreal"] + y["fxg_wc"]
        y["pbt"] = y["op_profit"] + y["fin_income"] - y["fin_costs"] + y["fx_line"]
        # Tax
        y["tax_rate"] = t
        y["tax_dep"] = D("tax_dep_rate") * y["dep_base"]
        y["dtl_mov_ppe"] = (y["tax_dep"] - y["dep"]) * t
        y["dtl_mov_fx"] = y["fx_unreal"] * t
        y["deferred_tax"] = y["dtl_mov_ppe"] + y["dtl_mov_fx"]
        y["taxable"] = y["pbt"] - (y["tax_dep"] - y["dep"]) - y["fx_unreal"]
        y["current_tax"] = max(0.0, y["taxable"]) * t
        y["net_profit"] = y["pbt"] - y["current_tax"] - y["deferred_tax"]
        y["effective_tax"] = safe(y["current_tax"] + y["deferred_tax"], y["pbt"])
        y["oci_gross"] = D("oci_gross")
        y["oci_dt"] = -D("oci_gross") * t
        y["oci_net"] = y["oci_gross"] + y["oci_dt"]
        y["dtl"] = p["dtl"] + y["deferred_tax"] - y["oci_dt"]
        y["tax_paid"] = D("tax_pay_pct") * p["tax_payable"]
        y["tax_payable"] = p["tax_payable"] + y["current_tax"] - y["tax_paid"]
        # Equity: appropriations of prior-year profit
        y["lr_cap"] = s["lrCapPct"] * p["capital"]
        y["lr_transfer"] = max(0.0, min(s["lrPct"] * max(0.0, p["net_profit"]), y["lr_cap"] - p["legal_reserve"]))
        y["distributable"] = p["net_profit"] - y["lr_transfer"]
        y["declared_dividends"] = D("payout") * max(0.0, y["distributable"]) if s["divMode"] == 1 else D("dps") * p["shares"]
        y["emp_calc"] = D("emp_pct") * y["declared_dividends"]
        y["emp_dist"] = min(y["emp_calc"], D("wages")) if D("wages") > 0 else y["emp_calc"]
        y["board_dist"] = D("board_pct") * max(0.0, y["distributable"])
        y["distributions"] = y["emp_dist"] + y["board_dist"]
        y["dividends_paid"] = p["dividends_payable"] + D("div_pay_pct") * y["declared_dividends"]
        y["dividends_payable"] = p["dividends_payable"] + y["declared_dividends"] - y["dividends_paid"]
        y["bonus_re"], y["bonus_res"] = D("bonus_re"), D("bonus_res")
        y["bonus_total"] = y["bonus_re"] + y["bonus_res"]
        y["capital"] = p["capital"] + y["bonus_total"]
        y["legal_reserve"] = p["legal_reserve"] + y["lr_transfer"]
        y["general_reserve"] = p["general_reserve"] - y["bonus_res"]
        y["merger_reserve"] = p["merger_reserve"]
        y["re"] = p["re"] + y["net_profit"] + y["oci_net"] - y["lr_transfer"] - y["distributions"] - y["declared_dividends"] - y["bonus_re"]
        y["shares"] = p["shares"] + safe(y["bonus_total"], self.cfg["par"])
        y["emp_floor"] = s["empFloorPct"] * y["declared_dividends"]
        y["board_cap"] = s["boardCapPct"] * max(0.0, y["distributable"] - s["boardMinDistPct"] * p["capital"])
        # Cash flow
        pol = self.cfg["policy"]
        y["cf_pbt"], y["cf_dep"], y["cf_amort"] = y["pbt"], y["dep"], y["amort"]
        y["cf_prov_rev"], y["cf_prov_formed"], y["cf_ebo_cost"] = -D("prov_reversed"), D("prov_formed"), D("ebo_service")
        y["cf_cap_losses"], y["cf_other_adj"] = 0.0, 0.0
        y["cf_cap_gains"], y["cf_ecl"], y["cf_impairment"] = -y["cap_gains"], -D("ecl"), -D("impairment")
        y["cf_net_fin"], y["cf_fx_unreal"] = y["fin_costs"] - y["fin_income"], -y["fx_unreal"]
        y["cf_before_wc"] = sum(y[k] for k in ["cf_pbt", "cf_dep", "cf_amort", "cf_prov_rev", "cf_prov_formed", "cf_ebo_cost", "cf_cap_losses", "cf_cap_gains", "cf_other_adj", "cf_ecl", "cf_impairment", "cf_net_fin", "cf_fx_unreal"])
        y["cf_ofa"] = -D("ofa_mov")
        y["cf_inventory"] = p["inventory"] - y["inventory"]
        y["cf_ar"] = p["ar"] - y["ar"] - y["cf_ecl"]
        y["cf_debtors"] = p["debtors"] - y["debtors"]
        y["cf_rp"] = p["rp"] - y["rp"]
        y["cf_sup_adv"] = p["sup_adv"] - y["sup_adv"]
        y["cf_ap"] = y["ap"] - p["ap"]
        y["cf_creditors"] = y["creditors"] - p["creditors"]
        y["cf_cust_adv"] = y["cust_adv"] - p["cust_adv"]
        y["cf_prov_used"] = -D("prov_used")
        wc = ["cf_ofa", "cf_inventory", "cf_ar", "cf_debtors", "cf_rp", "cf_sup_adv", "cf_ap", "cf_creditors", "cf_cust_adv", "cf_prov_used"]
        y["cf_before_dist"] = y["cf_before_wc"] + sum(y[k] for k in wc)
        y["cf_dist_op"] = -y["distributions"] * pol["distributionsOperating"]
        y["cf_tax_paid"] = -y["tax_paid"]
        y["cf_ebo_paid"] = -D("ebo_paid")
        y["cf_int_rec_op"] = y["fin_income"] * pol["interestReceivedOperating"]
        y["cf_int_paid_op"] = -y["debt_int"] * pol["interestPaidOperating"]
        y["cf_cfo"] = y["cf_before_dist"] + y["cf_dist_op"] + y["cf_tax_paid"] + y["cf_ebo_paid"] + y["cf_int_rec_op"] + y["cf_int_paid_op"]
        y["cf_int_rec_inv"] = y["fin_income"] * (1 - pol["interestReceivedOperating"])
        y["cf_assoc"] = -D("assoc_mov")
        y["cf_fvtpl"] = -D("fvtpl_net")
        y["cf_ac"] = -(D("inv_nc_net") + D("inv_cur_net"))
        y["cf_proceeds"] = D("disposal_proceeds")
        y["cf_capex"] = -y["capex_total"]
        y["cf_oa_add"] = -D("oa_add")
        y["cf_cfi"] = sum(y[k] for k in ["cf_int_rec_inv", "cf_assoc", "cf_fvtpl", "cf_ac", "cf_proceeds", "cf_capex", "cf_oa_add"])
        y["cf_div"] = -y["dividends_paid"]
        y["cf_leases"] = -D("lease_pay")
        y["cf_dist_fin"] = -y["distributions"] * (1 - pol["distributionsOperating"])
        y["cf_int_paid_fin"] = -y["debt_int"] * (1 - pol["interestPaidOperating"])
        y["cf_borrow"] = y["debt_borrow"]
        y["cf_open"] = p["cash"]
        y["cf_fx_cash"] = y["fxg_cash"]
        y["cf_ecl_cash"] = 0.0
        y["pre_rev_cash"] = (y["cf_open"] + y["cf_cfo"] + y["cf_cfi"] + y["cf_fx_cash"] + y["cf_ecl_cash"] + y["cf_div"]
                             + y["cf_leases"] + y["cf_dist_fin"] + y["cf_int_paid_fin"] + y["debt_borrow"] - y["debt_repay_sched"])
        # Revolver, then sweep
        y["rev_net"] = max(D("min_cash") - y["pre_rev_cash"], -y["rev_open"]) if s["revolverOn"] == 1 else 0.0
        y["rev_close"] = y["rev_open"] + y["rev_net"]
        y["surplus"] = max(0.0, y["pre_rev_cash"] + y["rev_net"] - D("min_cash"))
        avail = y["surplus"] * D("sweep_pct")
        total_sweep = 0.0
        closes = []
        for k in range(len(self.tr)):
            sw = min(avail, y["tr%d_after" % k])
            avail -= sw
            total_sweep += sw
            y["tr%d_sweep" % k] = sw
            y["tr%d_close" % k] = y["tr%d_after" % k] - sw
            closes.append(y["tr%d_close" % k])
        y["sweep_total"] = total_sweep
        y["cf_repay_sched"] = -y["debt_repay_sched"]
        y["cf_sweep"] = -total_sweep
        y["cf_repay"] = y["cf_repay_sched"] + y["cf_sweep"]
        y["cf_revolver"] = y["rev_net"]
        y["cf_cff"] = y["cf_div"] + y["cf_leases"] + y["cf_dist_fin"] + y["cf_borrow"] + y["cf_repay"] + y["cf_revolver"] + y["cf_int_paid_fin"]
        y["cf_net"] = y["cf_cfo"] + y["cf_cfi"] + y["cf_cff"]
        y["cf_close"] = y["cf_open"] + y["cf_net"] + y["cf_fx_cash"] + y["cf_ecl_cash"]
        y["cash"] = y["cf_close"]
        y["debt_total"] = sum(closes) + y["rev_close"]
        y["debt_cur"] = y["debt_total"] * D("debt_cur_share")
        y["debt_nc"] = y["debt_total"] - y["debt_cur"]
        # Totals
        y["total_nca"] = y["fixed_assets"] + y["other_assets"] + y["rou"] + y["associates"] + y["inv_nc"] + y["ofa"]
        y["total_ca"] = y["inventory"] + y["ar"] + y["inv_cur"] + y["fvtpl"] + y["debtors"] + y["rp"] + y["sup_adv"] + y["cash"]
        y["total_assets"] = y["total_nca"] + y["total_ca"]
        y["total_equity"] = y["capital"] + y["legal_reserve"] + y["general_reserve"] + y["merger_reserve"] + y["re"]
        y["total_ncl"] = y["lease_nc"] + y["debt_nc"] + y["dtl"] + y["ebo_nc"]
        y["total_cl"] = y["tax_payable"] + y["lease_cur"] + y["debt_cur"] + y["ap"] + y["creditors"] + y["dividends_payable"] + y["cust_adv"] + y["ebo_cur"] + y["provisions"]
        y["total_liabilities"] = y["total_ncl"] + y["total_cl"]
        y["total_le"] = y["total_liabilities"] + y["total_equity"]
        y["balance_check"] = y["total_assets"] - y["total_le"]
        nxt = {"liq": liquid(y["cash"], y["inv_nc"], y["inv_cur"], y["fvtpl"]), "usd": usdliq(y["cash"], y["inv_nc"], y["inv_cur"], y["fvtpl"]), "tr": closes, "rev": y["rev_close"]}
        return y, nxt

    def forecast(self):
        circ = self.s["circularity"] == 1
        for i in range(self.n_y):
            p = self.periods[-1]
            u = self.s["usd"]
            g = {"liq": p["cash"] + p["inv_nc"] + p["inv_cur"] + p["fvtpl"],
                 "usd": p["cash"] * u["cash"] + p["inv_nc"] * u["inv_nc"] + p["inv_cur"] * u["inv_cur"] + p["fvtpl"] * u["fvtpl"],
                 "tr": [p["tr%d_close" % k] for k in range(len(self.tr))], "rev": p["rev_close"]}
            y, nxt = self.year(i, p, g)
            n = 1
            while circ and n < 100:
                delta = max([abs(g["liq"] - nxt["liq"]), abs(g["rev"] - nxt["rev"])] + [abs(a - b) for a, b in zip(g["tr"], nxt["tr"])])
                if delta < 0.01:
                    break
                g = nxt
                y, nxt = self.year(i, p, g)
                n += 1
            self.periods.append(y)

    def outputs(self):
        n = len(self.periods)
        s = self.s
        P = self.periods

        class Missing(Exception):
            pass

        def v(k, i):
            if i < 0 or i >= n or k not in P[i] or P[i][k] is None:
                raise Missing()
            return P[i][k]

        def bit(c):
            return 1.0 if c else 0.0

        def add(key, fn):
            for i in range(n):
                try:
                    P[i][key] = fn(i)
                except Missing:
                    P[i][key] = None

        cov = s["covenants"]
        add("ebit", lambda i: v("op_profit", i))
        add("ebitda", lambda i: v("op_profit", i) + v("dep", i) + v("amort", i))
        add("gross_margin", lambda i: safe(v("gross_profit", i), v("revenue", i)))
        add("op_margin", lambda i: safe(v("op_profit", i), v("revenue", i)))
        add("ebitda_margin", lambda i: safe(v("ebitda", i), v("revenue", i)))
        add("net_margin", lambda i: safe(v("net_profit", i), v("revenue", i)))
        add("lease_liab", lambda i: v("lease_cur", i) + v("lease_nc", i))
        add("total_debt", lambda i: v("debt_cur", i) + v("debt_nc", i))
        add("liquid", lambda i: v("cash", i) + v("inv_nc", i) + v("inv_cur", i) + v("fvtpl", i))
        add("net_debt", lambda i: v("total_debt", i) + v("lease_liab", i) - v("liquid", i))
        add("working_capital", lambda i: v("total_ca", i) - v("total_cl", i))
        add("current_ratio", lambda i: safe(v("total_ca", i), v("total_cl", i)))
        add("quick_ratio", lambda i: safe(v("total_ca", i) - v("inventory", i), v("total_cl", i)))
        add("cash_ratio", lambda i: safe(v("cash", i), v("total_cl", i)))
        add("debt_equity", lambda i: safe(v("total_debt", i) + v("lease_liab", i), v("total_equity", i)))
        add("liab_assets", lambda i: safe(v("total_liabilities", i), v("total_assets", i)))
        add("net_debt_ebitda", lambda i: safe(v("net_debt", i), v("ebitda", i)))
        add("debt_ebitda", lambda i: safe(v("total_debt", i) + v("lease_liab", i), v("ebitda", i)))
        add("interest_cover", lambda i: safe(v("ebit", i), v("fin_costs", i)))
        add("ebitda_cover", lambda i: safe(v("ebitda", i), v("fin_costs", i)))
        add("dso_calc", lambda i: safe(v("ar", i), v("revenue", i)) * 365)
        add("dio_calc", lambda i: safe(v("inventory", i), v("cogs", i)) * 365)
        add("dpo_calc", lambda i: safe(v("ap", i), v("cogs", i)) * 365)
        add("ccc", lambda i: v("dso_calc", i) + v("dio_calc", i) - v("dpo_calc", i))
        add("avg_assets", lambda i: (v("total_assets", i) + v("total_assets", i - 1)) / 2)
        add("avg_equity", lambda i: (v("total_equity", i) + v("total_equity", i - 1)) / 2)
        add("asset_turnover", lambda i: safe(v("revenue", i), v("avg_assets", i)))
        add("inventory_turnover", lambda i: safe(v("cogs", i), (v("inventory", i) + v("inventory", i - 1)) / 2))
        add("roe", lambda i: safe(v("net_profit", i), v("avg_equity", i)))
        add("roa", lambda i: safe(v("net_profit", i), v("avg_assets", i)))
        add("invested_capital", lambda i: v("total_equity", i) + v("total_debt", i) + v("lease_liab", i) - v("liquid", i))
        add("nopat", lambda i: v("ebit", i) * (1 - v("tax_rate", i)))
        add("roic", lambda i: safe(v("nopat", i), (v("invested_capital", i) + v("invested_capital", i - 1)) / 2))
        add("dupont_em", lambda i: safe(v("avg_assets", i), v("avg_equity", i)))
        add("dupont3_roe", lambda i: v("net_margin", i) * v("asset_turnover", i) * v("dupont_em", i))
        add("dupont_tax_burden", lambda i: safe(v("net_profit", i), v("pbt", i)))
        add("dupont_int_burden", lambda i: safe(v("pbt", i), v("ebit", i)))
        add("dupont5_roe", lambda i: v("dupont_tax_burden", i) * v("dupont_int_burden", i) * v("op_margin", i) * v("asset_turnover", i) * v("dupont_em", i))
        add("fcf", lambda i: v("cf_cfo", i) + v("cf_capex", i) + v("cf_oa_add", i))
        add("cfo_ebitda", lambda i: safe(v("cf_cfo", i), v("ebitda", i)))
        add("fcf_np", lambda i: safe(v("fcf", i), v("net_profit", i)))
        add("fcf_debt", lambda i: safe(v("fcf", i), v("total_debt", i) + v("lease_liab", i)))
        add("cov_leverage", lambda i: bit(v("net_debt_ebitda", i) <= cov["maxNetDebtEbitda"]))
        add("cov_cover", lambda i: bit(v("interest_cover", i) >= cov["minInterestCover"]))
        add("cov_current", lambda i: bit(v("current_ratio", i) >= cov["minCurrentRatio"]))
        add("fcff_nopat", lambda i: v("nopat", i))
        add("fcff_da", lambda i: v("cf_dep", i) + v("cf_amort", i))
        add("fcff_noncash", lambda i: sum(v(k, i) for k in ["cf_prov_rev", "cf_prov_formed", "cf_ebo_cost", "cf_cap_losses", "cf_cap_gains", "cf_other_adj", "cf_ecl", "cf_impairment"]))
        add("fcff_wc", lambda i: sum(v(k, i) for k in ["cf_ofa", "cf_inventory", "cf_ar", "cf_debtors", "cf_rp", "cf_sup_adv", "cf_ap", "cf_creditors", "cf_cust_adv", "cf_prov_used", "cf_ebo_paid"]))
        add("fcff_dist", lambda i: v("cf_dist_op", i) + v("cf_dist_fin", i))
        add("fcff_capex", lambda i: v("cf_capex", i) + v("cf_oa_add", i) + v("cf_proceeds", i))
        add("fcff", lambda i: sum(v(k, i) for k in ["fcff_nopat", "fcff_da", "fcff_noncash", "fcff_wc", "fcff_dist", "fcff_capex"]))
        add("fcfe_fin_income", lambda i: v("fin_income", i) * (1 - v("tax_rate", i)))
        add("fcfe_interest", lambda i: -v("debt_int", i) * (1 - v("tax_rate", i)))
        add("fcfe_leases", lambda i: v("cf_leases", i))
        add("fcfe_borrow", lambda i: v("cf_borrow", i) + v("cf_repay", i) + v("cf_revolver", i))
        add("fcfe", lambda i: sum(v(k, i) for k in ["fcff", "fcfe_fin_income", "fcfe_interest", "fcfe_leases", "fcfe_borrow"]))
        add("alt_x1", lambda i: safe(v("working_capital", i), v("total_assets", i)))
        add("alt_x2", lambda i: safe(v("re", i), v("total_assets", i)))
        add("alt_x3", lambda i: safe(v("ebit", i), v("total_assets", i)))
        add("alt_x4", lambda i: safe(v("total_equity", i), v("total_liabilities", i)))
        add("altman_z", lambda i: 3.25 + 6.56 * v("alt_x1", i) + 3.26 * v("alt_x2", i) + 6.72 * v("alt_x3", i) + 1.05 * v("alt_x4", i))
        add("altman_zone", lambda i: 1.0 if v("altman_z", i) > 5.85 else (2.0 if v("altman_z", i) >= 4.35 else 3.0))
        add("f_roa", lambda i: bit(v("net_profit", i) > 0))
        add("f_cfo", lambda i: bit(v("cf_cfo", i) > 0))
        add("roa_close", lambda i: safe(v("net_profit", i), v("total_assets", i)))
        add("f_droa", lambda i: bit(v("roa_close", i) > v("roa_close", i - 1)))
        add("f_accrual", lambda i: bit(v("cf_cfo", i) > v("net_profit", i)))
        add("lt_leverage", lambda i: safe(v("debt_nc", i) + v("lease_nc", i), v("total_assets", i)))
        add("f_lever", lambda i: bit(v("lt_leverage", i) <= v("lt_leverage", i - 1)))
        add("f_liquid", lambda i: bit(v("current_ratio", i) > v("current_ratio", i - 1)))
        add("shares_ex_bonus", lambda i: v("shares", i) - safe(v("bonus_total", i), self.cfg["par"]))
        add("f_shares", lambda i: bit(v("shares_ex_bonus", i) <= v("shares", i - 1) + 1))
        add("f_margin", lambda i: bit(v("gross_margin", i) > v("gross_margin", i - 1)))
        add("turn_close", lambda i: safe(v("revenue", i), v("total_assets", i)))
        add("f_turn", lambda i: bit(v("turn_close", i) > v("turn_close", i - 1)))
        add("piotroski", lambda i: sum(v(k, i) for k in ["f_roa", "f_cfo", "f_droa", "f_accrual", "f_lever", "f_liquid", "f_shares", "f_margin", "f_turn"]))
        add("eps", lambda i: safe(v("net_profit", i), v("shares", i)))
        add("eps_restated", lambda i: safe(v("net_profit", i), v("shares", n - 1)))
        cs_is = ["revenue", "cogs", "gross_profit", "selling", "ga", "op_profit", "fin_income", "fin_costs", "fx_line", "pbt", "net_profit"]
        cs_bs = ["fixed_assets", "inv_nc", "inventory", "ar", "inv_cur", "fvtpl", "debtors", "cash", "total_ca", "total_assets", "capital", "re", "total_equity", "dtl", "tax_payable", "ap", "creditors", "cust_adv", "total_liabilities"]
        for k in cs_is:
            add("cs_" + k, lambda i, k=k: safe(v(k, i), v("revenue", i)))
        for k in cs_bs:
            add("cs_" + k, lambda i, k=k: safe(v(k, i), v("total_assets", i)))
        for k in cs_is + cs_bs:
            add("yoy_" + k, lambda i, k=k: 0.0 if v(k, i - 1) == 0 else v(k, i) / v(k, i - 1) - 1)

    def rows(self):
        keys = set()
        for p in self.periods:
            keys.update(p.keys())
        return {k: [p.get(k) for p in self.periods] for k in sorted(keys)}


def main():
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    m = Model(cfg)
    m.history()
    m.forecast()
    m.outputs()
    json.dump(m.rows(), open(sys.argv[2], "w", encoding="utf-8"))


if __name__ == "__main__":
    main()
