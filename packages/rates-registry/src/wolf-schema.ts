// Shared schema for the 3SM to WOLF hand-off. Plain validator with no dependencies.
export interface WolfExport {
  schemaVersion: 1;
  source: '3SM';
  company: { name: string; ticker: string };
  scenario: string;
  currency: 'EGP';
  units: 'absolute';
  ratesSnapshotHash: string;
  fcffByYear: { period: string; value: number }[];
  netDebt: { period: string; borrowings: number; leaseLiabilities: number; cash: number; investments: number; netDebt: number };
  debtLikeItems: { leaseLiabilities: number; employeeBenefitObligations: number; provisions: number; dividendsPayable: number };
  cashAndInvestmentsByLiquidity: { cash: number; fvtpl: number; amortizedCostCurrent: number; amortizedCostNonCurrent: number; restrictedOtherFinancialAssets: number };
  shares: number;
}

export function validateWolfExport(x: unknown): string[] {
  const e: string[] = [];
  const o = x as Record<string, unknown>;
  const num = (v: unknown, name: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) e.push(`${name} must be a finite number`); };
  const group = (name: string, keys: string[]) => {
    const g = o?.[name] as Record<string, unknown> | undefined;
    if (!g || typeof g !== 'object') { e.push(`${name} missing`); return; }
    keys.forEach(k => num(g[k], `${name}.${k}`));
  };
  if (!o || typeof o !== 'object') return ['Not an object'];
  if (o.schemaVersion !== 1) e.push('schemaVersion must be 1');
  if (o.source !== '3SM') e.push('source must be 3SM');
  if (o.currency !== 'EGP') e.push('currency must be EGP');
  if (o.units !== 'absolute') e.push('units must be absolute');
  if (typeof o.ratesSnapshotHash !== 'string' || !o.ratesSnapshotHash) e.push('ratesSnapshotHash missing');
  if (!Array.isArray(o.fcffByYear) || !o.fcffByYear.length) e.push('fcffByYear missing');
  else (o.fcffByYear as { period: string; value: unknown }[]).forEach((r, i) => num(r.value, `fcffByYear[${i}].value`));
  group('netDebt', ['borrowings', 'leaseLiabilities', 'cash', 'investments', 'netDebt']);
  group('debtLikeItems', ['leaseLiabilities', 'employeeBenefitObligations', 'provisions', 'dividendsPayable']);
  group('cashAndInvestmentsByLiquidity', ['cash', 'fvtpl', 'amortizedCostCurrent', 'amortizedCostNonCurrent', 'restrictedOtherFinancialAssets']);
  num(o.shares, 'shares');
  return e;
}
