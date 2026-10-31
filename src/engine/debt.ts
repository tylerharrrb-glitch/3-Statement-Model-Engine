// Tranches and revolver. Every tranche: Beginning -> Borrowed -> Repaid -> Ending. No plugs.
import { Ctx, D, Y } from './forecast/common';
import type { Tranche } from './types';

export interface TrancheStep {
  open: number; fx: number; borrow: number; repay: number; afterSched: number; rate: number;
}

/** Scheduled movements, before the sweep. Amounts in tranche currency convert at the average rate. */
export function trancheSchedule(tr: Tranche, i: number, open: number, y: Y, d: D, c: Ctx): TrancheStep {
  const isUsd = tr.currency === 'USD';
  const conv = isUsd ? y.fx_avg : 1;
  const fx = isUsd ? open * y.fx_move : 0;
  const borrow = tr.borrow[i] * conv;
  const repay = Math.min(tr.repay[i] * conv, open + fx + borrow);
  const rate = tr.rateType === 'fixed' ? tr.fixedRate : c.floatBase + d.base_delta + tr.spread;
  return { open, fx, borrow, repay, afterSched: open + fx + borrow - repay, rate };
}

export const interestOn = (open: number, close: number, circ: 0 | 1) => (circ === 1 ? (open + close) / 2 : open);

/** Revolver draws when cash would fall below the minimum and repays first when there is surplus. */
export function revolver(preCash: number, open: number, minCash: number, on: 0 | 1): { net: number; close: number; surplus: number } {
  const net = on === 1 ? Math.max(minCash - preCash, -open) : 0;
  return { net, close: open + net, surplus: Math.max(0, preCash + net - minCash) };
}

/** Sweep allocates in tranche order. */
export function allocateSweep(surplus: number, sweepPct: number, afterSched: number[]): number[] {
  let avail = surplus * sweepPct;
  return afterSched.map(bal => {
    const take = Math.min(avail, bal);
    avail -= take;
    return take;
  });
}
