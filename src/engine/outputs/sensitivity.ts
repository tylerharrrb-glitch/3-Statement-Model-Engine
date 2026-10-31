// 5x5 grid, revenue growth x gross margin. Each cell is a full engine re-run. Base case in the centre.
import type { RatesSnapshot } from '@registry';
import { runModel } from '../run';
import type { ModelInputs } from '../types';

export interface SensitivityGrid {
  growthShifts: number[];
  marginShifts: number[];
  period: string;
  netProfit: number[][];
  endingCash: number[][];
  netDebt: number[][];
}

const OFFSETS = [-2, -1, 0, 1, 2];

export function sensitivity(inp: ModelInputs, rates: RatesSnapshot): SensitivityGrid {
  const growthShifts = OFFSETS.map(o => o * inp.settings.sensGrowthStep);
  const marginShifts = OFFSETS.map(o => o * inp.settings.sensMarginStep);
  const netProfit: number[][] = [], endingCash: number[][] = [], netDebt: number[][] = [];
  let period = '';
  for (const g of growthShifts) {
    const a: number[] = [], b: number[] = [], c: number[] = [];
    for (const m of marginShifts) {
      const run = runModel({ ...inp, overlay: { growth: g, margin: m } }, rates);
      const last = run.years.length - 1;
      period = run.periodLabels[last];
      a.push(run.rows.net_profit[last] as number);
      b.push(run.rows.cash[last] as number);
      c.push(run.rows.net_debt[last] as number);
    }
    netProfit.push(a); endingCash.push(b); netDebt.push(c);
  }
  return { growthShifts, marginShifts, period, netProfit, endingCash, netDebt };
}
