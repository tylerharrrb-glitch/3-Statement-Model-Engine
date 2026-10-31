import { describe, expect, it } from 'vitest';
import { fxRates, fxRevaluation } from '../../src/engine/forecast/fx';
import { revenue } from '../../src/engine/forecast/revenue';
import { ppe } from '../../src/engine/forecast/ppe';
import { intangibles } from '../../src/engine/forecast/intangibles';
import { leases } from '../../src/engine/forecast/leases';
import { costs } from '../../src/engine/forecast/costs';
import { nwc } from '../../src/engine/forecast/nwc';
import { provisions } from '../../src/engine/forecast/provisions';
import { investments, financeIncome, liquidBalances } from '../../src/engine/forecast/investments';
import { tax, taxLosses } from '../../src/engine/forecast/tax';
import { equity } from '../../src/engine/forecast/equity';
import { allocateSweep, interestOn, revolver } from '../../src/engine/debt';
import { iterate } from '../../src/engine/circularity';
import { checkSector } from '../../src/engine/coa';
import type { Ctx } from '../../src/engine/forecast/common';

const usd = { cash: 0, inv_nc: 0, inv_cur: 0, fvtpl: 0, ofa: 0, ar: 0, debtors: 0, ap: 0, creditors: 0, cust_adv: 0 };
const ctx = (s: object = {}, o: Partial<Ctx> = {}): Ctx => ({
  s: { fxOn: 1, revenueBasis: 1, cogsMode: 1, gasMode: 2, sellMode: 1, gaMode: 1, depMode: 2, divMode: 1, circularity: 0, schedTaxOn: 0, usd, lrPct: 0.05, lrCapPct: 0.5, empFloorPct: 0.1, boardCapPct: 0.1, boardMinDistPct: 0.05, ...s } as never,
  overlay: { growth: 0, margin: 0 }, taxRate: 0.225, yieldBase: 0.25, floatBase: 0.21, par: 10, schedRate: 20, distributionsOp: 1, interestRecOp: 0, interestPaidOp: 1, ...o,
});

describe('fx', () => {
  it('moves the path and revalues opening USD items', () => {
    const c = ctx({ usd: { ...usd, cash: 0.5, ap: 1 } });
    const p = { fx_close: 50, fx_avg: 50, cash: 100, inv_nc: 0, inv_cur: 0, fvtpl: 0, ofa: 0, ar: 0, debtors: 0, ap: 10, creditors: 0, cust_adv: 0 };
    const y = fxRates(p, { fx_close: 55 }, c);
    expect(y.fx_move).toBeCloseTo(0.1); expect(y.fx_avg).toBe(52.5); expect(y.fx_index).toBe(1.05);
    const r = fxRevaluation(p, y, c);
    expect(r.fxg_cash).toBeCloseTo(5); expect(r.fxg_wc).toBeCloseTo(-1);
  });
  it('FX off freezes the rate so nothing revalues', () => {
    const y = fxRates({ fx_close: 50, fx_avg: 50 }, { fx_close: 99 }, ctx({ fxOn: 0 }));
    expect(y.fx_close).toBe(50); expect(y.fx_move).toBe(0);
  });
});
describe('revenue', () => {
  const p = { rev_export: 80, rev_domestic: 20, seg_urea: 90, seg_ammonia: 10, seg_other: 0 };
  const d = { g_export: 0.1, g_domestic: -0.5, g_urea: 0, g_ammonia: 0, g_other: 0, mix_urea: 0.9, mix_ammonia: 0.1, mix_other: 0, export_share: 0.5, vol_urea: 2, price_urea: 3, vol_ammonia: 0, price_ammonia: 0, vol_other: 0, price_other: 0 };
  const y = { fx_index: 1.1, fx_avg: 55 };
  it('by market applies USD growth x FX, including negative growth', () => {
    const r = revenue(p, y, d, ctx());
    expect(r.rev_export).toBeCloseTo(96.8); expect(r.rev_domestic).toBeCloseTo(10); expect(r.seg_urea).toBeCloseTo(106.8 * 0.9);
  });
  it('by segment uses export share', () => {
    const r = revenue(p, y, d, ctx({ revenueBasis: 2 }));
    expect(r.revenue).toBe(100); expect(r.rev_export).toBe(50);
  });
  it('volume x price', () => { expect(revenue(p, y, d, ctx({ revenueBasis: 3 })).seg_urea).toBe(6); });
  it('zero revenue passes through without error', () => {
    const r = revenue({ rev_export: 0, rev_domestic: 0, seg_urea: 0, seg_ammonia: 0, seg_other: 0 }, y, d, ctx());
    expect(r.revenue).toBe(0);
  });
});
describe('ppe', () => {
  const p = { puc: 50, ppe_gross: 1000, ppe_accum: 400 };
  const d = { capex_direct: 10, capex_puc: 20, puc_transfer: 5, disposal_cost: 30, disposal_nbv: 10, disposal_proceeds: 15, land: 100, fully_dep: 0, dep_rate: 0.1, useful_life: 10, impairment: 0 };
  it('rolls forward and leaves land undepreciated', () => {
    const r = ppe(p, d, ctx());
    expect(r.dep).toBe(90); expect(r.puc).toBe(65); expect(r.ppe_gross).toBe(985); expect(r.ppe_accum).toBe(470); expect(r.cap_gains).toBe(5);
    expect(r.fixed_assets).toBe(985 - 470 + 65);
  });
  it('useful life mode', () => { expect(ppe(p, d, ctx({ depMode: 1 })).dep).toBe(90); });
  it('fully depreciated asset stops depreciating', () => {
    const r = ppe({ puc: 0, ppe_gross: 100, ppe_accum: 100 }, { ...d, land: 0, capex_direct: 0, capex_puc: 0, puc_transfer: 0, disposal_cost: 0, disposal_nbv: 0, disposal_proceeds: 0 }, ctx());
    expect(r.dep).toBe(0);
  });
});
describe('intangibles and leases', () => {
  it('amortizes', () => { expect(intangibles({ other_assets: 100 }, { oa_add: 10, oa_amort_rate: 0.2 })).toEqual({ oa_amort: 20, other_assets: 90 }); });
  it('rolls lease liability', () => {
    const r = leases({ rou: 100, lease_total: 200 }, { rou_new: 10, rou_amort_rate: 0.1, lease_rate: 0.05, lease_pay: 30, lease_cur_share: 0.25 });
    expect(r.rou).toBe(100); expect(r.lease_total).toBe(190); expect(r.lease_cur + r.lease_nc).toBe(190);
  });
});
describe('costs', () => {
  const p = { selling: 10, ga_cash: 20 };
  const y = { revenue: 100, fx_avg: 50, dep: 10, oa_amort: 1, rou_amort: 1, cap_gains: 2 };
  const d = { gas_pct: 0.3, gas_price_usd: 2, gas_mmbtu: 1, gas_kcf: 10, other_cogs_pct: 0.1, gm_pct: 0.4, depr_cogs_share: 0.5, sell_pct: 0.02, sell_g: 0.1, ga_pct: 0.03, ga_g: 0.1, other_income: 1, prov_reversed: 1, other_exp: 1, prov_formed: 1, impairment: 0, ecl: 0 };
  it('builds COGS by line', () => {
    const r = costs(p, y, d, ctx());
    expect(r.cogs).toBeCloseTo(45); expect(r.ga).toBeCloseTo(10);
    expect(r.op_profit).toBeCloseTo(55 + 2 - 2 - 10 + 2 - 2);
  });
  it('gas by USD price x consumption x FX', () => { expect(costs(p, y, d, ctx({ gasMode: 1 })).gas_cost).toBe(100); });
  it('Schedule Tax stays 0 until switched on', () => {
    expect(costs(p, y, d, ctx()).gas_sched_tax).toBe(0);
    expect(costs(p, y, d, ctx({ schedTaxOn: 1 })).gas_sched_tax).toBe(200);
  });
  it('gross margin mode and margin overlay', () => {
    expect(costs(p, y, d, ctx({ cogsMode: 2 })).cogs).toBeCloseTo(60);
    expect(costs(p, y, d, ctx({}, { overlay: { growth: 0, margin: 0.01 } })).cogs).toBeCloseTo(44);
  });
  it('growth mode for opex', () => { expect(costs(p, y, d, ctx({ sellMode: 2 })).selling).toBeCloseTo(11); });
});
describe('nwc and provisions', () => {
  it('uses days', () => {
    const r = nwc({ revenue: 365, cogs: 730 }, { dso: 10, dio: 5, dpo: 2, debtors_pct: 0, sup_adv_pct: 0, creditors_pct: 0, cust_adv_pct: 0, rp_balance: 0 });
    expect([r.ar, r.inventory, r.ap]).toEqual([10, 10, 4]);
  });
  it('reproduces the MOPCO FY2025 provisions and benefit roll-forwards', () => {
    expect(provisions({ provisions: 255256008, ebo_total: 0 }, { prov_formed: 668304, prov_reversed: 160216876, prov_used: 41362731, ebo_rate: 0, ebo_service: 0, oci_gross: 0, ebo_paid: 0, ebo_cur_share: 0 }).provisions).toBe(54344705);
    const r = provisions({ provisions: 0, ebo_total: 534440047 }, { prov_formed: 0, prov_reversed: 0, prov_used: 0, ebo_rate: 82744931 / 534440047, ebo_service: 30494385, oci_gross: -59294377, ebo_paid: 14889098, ebo_cur_share: 0.1 });
    expect(r.ebo_total).toBeCloseTo(692084642, 3);
  });
});
describe('investments', () => {
  it('rolls balances', () => {
    const r = investments({ inv_nc: 1, inv_cur: 2, fvtpl: 3, ofa: 4, associates: 5 }, { fxg_inv_nc: 1, fxg_inv_cur: 1, fxg_fvtpl: 1, fxg_ofa: 1 }, { inv_nc_net: 1, inv_cur_net: 1, fvtpl_net: 1, ofa_mov: 1, assoc_mov: 1 });
    expect(r).toEqual({ inv_nc: 3, inv_cur: 4, fvtpl: 5, ofa: 6, associates: 6 });
  });
  it('finance income follows the switch', () => {
    const d = { yield_delta: 0, yield_spread: -0.05, usd_yield: 0.04 };
    const open = { liquid: 100, usd: 20 }, close = { liquid: 200, usd: 20 };
    expect(financeIncome(open, close, d, ctx()).fin_income).toBeCloseTo(80 * 0.2 + 20 * 0.04);
    expect(financeIncome(open, close, d, ctx({ circularity: 1 })).fin_income).toBeCloseTo(130 * 0.2 + 20 * 0.04);
    expect(liquidBalances(1, 2, 3, 4, ctx()).liquid).toBe(10);
  });
});
const TL0 = { tl_cum_created: 0, tl_cum_used: 0, tl_cum_expired: 0, tl_lag1: 0, tl_lag2: 0, tl_lag3: 0, tl_lag4: 0, tl_lag5: 0 };
describe('tax losses', () => {
  const roll = (series: number[]) => { let p: Record<string, number> = TL0; const out: Record<string, number>[] = []; for (const x of series) { p = taxLosses(p, x); out.push(p); } return out; };
  it('a loss shields later profit', () => {
    const r = roll([-100, 40, 100]);
    expect(r[0].tl_created).toBe(100); expect(r[1].tl_used).toBe(40); expect(r[2].tl_used).toBe(60);
  });
  it('a loss can be used for five years and expires in the sixth', () => {
    expect(roll([-100, 0, 0, 0, 0, 100])[5].tl_used).toBe(100);
    const late = roll([-100, 0, 0, 0, 0, 0, 100]);
    expect(late[6].tl_used).toBe(0); expect(late[6].tl_cum_expired).toBe(100);
  });
  it('uses oldest first, so only the unused part of an old loss expires', () => {
    // Year 6: the first loss has expired net of the 30 used. The second is still usable.
    const r = roll([-100, -50, 30, 0, 0, 0, 200]);
    expect(r[6].tl_cum_expired).toBe(70);
    expect(r[6].tl_used).toBe(50);
    // Year 7: both have expired.
    expect(roll([-100, -50, 30, 0, 0, 0, 0, 200])[7].tl_cum_expired).toBe(120);
  });
});
describe('tax', () => {
  const d = { tax_dep_rate: 0.2, oci_gross: -59294377, tax_pay_pct: 1 };
  it('applies Decision 8 and the OCI tax', () => {
    const r = tax({ ...TL0, tax_payable: 50, dtl: 1000 }, { pbt: 1000, dep: 80, dep_base: 500, fx_unreal: 40 }, d, ctx());
    expect(r.dtl_mov_ppe).toBeCloseTo(4.5); expect(r.dtl_mov_fx).toBeCloseTo(9);
    expect(r.current_tax).toBeCloseTo((1000 - 20 - 40) * 0.225);
    expect(r.net_profit).toBeCloseTo(1000 - r.current_tax - 13.5);
    expect(r.oci_dt).toBeCloseTo(13341234.8, 0); expect(r.tax_paid).toBe(50);
  });
  it('no tax on a loss', () => { expect(tax({ ...TL0, tax_payable: 0, dtl: 0 }, { pbt: -100, dep: 0, dep_base: 0, fx_unreal: 0 }, { ...d, oci_gross: 0 }, ctx()).current_tax).toBe(0); });
});
describe('equity', () => {
  const p = { net_profit: 15119739368, capital: 20791840110, legal_reserve: 1212315306, general_reserve: 1, merger_reserve: 0, re: 0, shares: 100, dividends_payable: 0 };
  const y = { net_profit: 0, oci_net: 0 };
  const d = { payout: 0.5, dps: 1, emp_pct: 0.1, wages: 0, board_pct: 0.02, div_pay_pct: 1, bonus_re: 10, bonus_res: 0 };
  it('reproduces the MOPCO FY2025 legal reserve transfer', () => { expect(Math.round(equity(p, y, d, ctx()).lr_transfer)).toBe(755986968); });
  it('stops at the reserve cap', () => {
    expect(equity({ ...p, legal_reserve: p.capital * 0.5 }, y, d, ctx()).lr_transfer).toBe(0);
    expect(equity({ ...p, legal_reserve: p.capital * 0.5 - 100 }, y, d, ctx()).lr_transfer).toBe(100);
  });
  it('no appropriations from a loss', () => {
    const r = equity({ ...p, net_profit: -5 }, y, d, ctx());
    expect([r.lr_transfer, r.declared_dividends, r.board_dist]).toEqual([0, 0, 0]);
  });
  it('bonus shares move RE to capital with no cash and raise the share count', () => {
    const r = equity(p, y, d, ctx());
    expect(r.capital).toBe(p.capital + 10); expect(r.shares).toBe(101);
  });
  it('caps the employee share at wages and bridges dividends payable', () => {
    const r = equity({ ...p, dividends_payable: 7 }, y, { ...d, wages: 3, div_pay_pct: 0.5 }, ctx());
    expect(r.emp_dist).toBe(3);
    expect(r.dividends_payable).toBeCloseTo(r.declared_dividends * 0.5);
  });
  it('DPS mode', () => { expect(equity(p, y, d, ctx({ divMode: 2 })).declared_dividends).toBe(100); });
});
describe('debt helpers', () => {
  it('interest basis follows the switch', () => { expect(interestOn(100, 50, 0)).toBe(100); expect(interestOn(100, 50, 1)).toBe(75); });
  it('revolver draws then repays first', () => {
    expect(revolver(-10, 0, 50, 1)).toEqual({ net: 60, close: 60, surplus: 0 });
    expect(revolver(100, 60, 50, 1)).toEqual({ net: -50, close: 10, surplus: 0 });
    expect(revolver(200, 60, 50, 1)).toEqual({ net: -60, close: 0, surplus: 90 });
    expect(revolver(-10, 0, 50, 0).net).toBe(0);
  });
  it('sweep allocates in tranche order', () => { expect(allocateSweep(100, 0.5, [30, 40])).toEqual([30, 20]); });
});
describe('circularity', () => {
  it('single pass at switch 0', () => { expect(iterate(0, g => ({ result: g, next: g + 1 }), (a, b) => Math.abs(a - b), false).iterations).toBe(1); });
  it('converges at switch 1', () => {
    const r = iterate(0, g => ({ result: g, next: 10 + 0.1 * g }), (a, b) => Math.abs(a - b), true);
    expect(r.converged).toBe(true); expect(r.iterations).toBeLessThan(100);
  });
  it('reports non-convergence at the cap', () => {
    const r = iterate(0, g => ({ result: g, next: g + 1 }), (a, b) => Math.abs(a - b), true);
    expect(r.converged).toBe(false); expect(r.iterations).toBe(100);
  });
});
describe('scope', () => {
  it('blocks banks and insurers with a one-line reason', () => {
    for (const s of ['bank', 'insurance'] as const) { const r = checkSector(s); expect(r.allowed).toBe(false); expect(r.reason).toContain('balance sheet is the business'); }
    expect(checkSector('industrial').allowed).toBe(true);
  });
});
