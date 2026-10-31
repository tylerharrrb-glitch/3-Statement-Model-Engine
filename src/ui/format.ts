// Display only. Negatives use parentheses, the same as the Excel file.
import type { Fmt } from '../export/excel/rows';

export function fmt(v: number | null | undefined, f: Fmt): string {
  if (v === null || v === undefined) return '';
  if (!Number.isFinite(v)) return 'n/a';
  const paren = (s: string, neg: boolean) => (neg ? `(${s})` : s);
  const n = (d: number) => Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (f) {
    case 'egp': case 'usd': return Math.round(v) === 0 ? '–' : paren(n(0), v < 0);
    case 'pct': return paren(`${(Math.abs(v) * 100).toFixed(1)}%`, v < 0);
    case 'x': return paren(`${n(1)}x`, v < 0);
    case 'num': case 'fx': return paren(n(4), v < 0);
    case 'days': return paren(n(1), v < 0);
    case 'ps': return paren(n(2), v < 0);
    case 'int': return paren(n(0), v < 0);
  }
}
