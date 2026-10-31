// Shared forecast helpers. Y is the row bag for one year; P is the prior year's.
import type { Settings } from '../types';

export type Y = Record<string, number>;
export type D = Record<string, number>;
export const div = (a: number, b: number) => (b === 0 ? 0 : a / b);

export interface Ctx {
  s: Settings;
  overlay: { growth: number; margin: number };
  taxRate: number;
  yieldBase: number;
  floatBase: number;
  par: number;
  schedRate: number;
  distributionsOp: 0 | 1;
  interestRecOp: 0 | 1;
  interestPaidOp: 0 | 1;
}

/** Estimates fed into the circular items under switch = 1. */
export interface Guess { liquidClose: number; usdLiquidClose: number; trancheClose: number[]; revolverClose: number }
