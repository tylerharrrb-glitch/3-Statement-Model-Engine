import { Ctx, D, Y } from './common';

/** Revenue by market or segment growth, or volume x price. y must hold fx_index. */
export function revenue(p: Y, y: Y, d: D, c: Ctx): Y {
  const ov = c.overlay.growth;
  const basis = c.s.revenueBasis;
  const fxIndex = c.s.fxOn === 1 ? y.fx_index : 1;
  const rev_export_m = p.rev_export * (1 + d.g_export + ov) * fxIndex;
  const rev_domestic_m = p.rev_domestic * (1 + d.g_domestic + ov);
  const rev_market_total = rev_export_m + rev_domestic_m;
  const built = (prior: number, g: number, vol: number, price: number) => (basis === 3 ? vol * price : prior * (1 + g + ov));
  const seg_urea_b = built(p.seg_urea, d.g_urea, d.vol_urea, d.price_urea);
  const seg_ammonia_b = built(p.seg_ammonia, d.g_ammonia, d.vol_ammonia, d.price_ammonia);
  const seg_other_b = built(p.seg_other, d.g_other, d.vol_other, d.price_other);
  const rev_seg_total = seg_urea_b + seg_ammonia_b + seg_other_b;
  const revenue = basis === 1 ? rev_market_total : rev_seg_total;
  const rev_export = basis === 1 ? rev_export_m : revenue * d.export_share;
  return {
    rev_export_m, rev_domestic_m, rev_market_total, seg_urea_b, seg_ammonia_b, seg_other_b, rev_seg_total,
    revenue,
    seg_urea: basis === 1 ? revenue * d.mix_urea : seg_urea_b,
    seg_ammonia: basis === 1 ? revenue * d.mix_ammonia : seg_ammonia_b,
    seg_other: basis === 1 ? revenue * d.mix_other : seg_other_b,
    rev_export,
    rev_domestic: revenue - rev_export,
    rev_export_usd: y.fx_avg === 0 ? 0 : rev_export / y.fx_avg,
  };
}
