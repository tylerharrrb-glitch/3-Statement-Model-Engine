// Domain types. Pure data only. Amounts are full absolute EGP. Rates are decimals (0.225).
import type { RatesSnapshot } from '@registry';

export type Sector = 'industrial' | 'commercial' | 'bank' | 'insurance';
export type ScenarioKey = 'bear' | 'base' | 'bull';
export const SCENARIO_KEYS: ScenarioKey[] = ['bear', 'base', 'bull'];

/** EAS allows choices. 1 = operating, 0 = the alternative (investing for interest received, financing otherwise). */
export interface ClassificationPolicy {
  interestReceivedOperating: 0 | 1;
  interestPaidOperating: 0 | 1;
  distributionsOperating: 0 | 1;
}

/** Fields WOLF needs that the model does not use. Price and dates are user inputs. */
export interface WolfProfile {
  name: string; shortName: string; exchange: string; country: string; damodaranIndustry: string; sharesNote: string;
  statementsDescription: string; auditor: string; reportDate: string;
  valuationDate: string; price: number; priceDate: string; priceSource: string;
}

export interface Company {
  name: string;
  ticker: string;
  sector: Sector;
  fiscalYearEndMonth: 6 | 12;
  parValue: number;
  policy: ClassificationPolicy;
  wolf?: WolfProfile;
}

export type Statement = 'IS' | 'BS' | 'CF' | 'SCHED';

/** One line as the company reports it, with its mapping to a standard account. */
export interface LineItem {
  label: string;
  statement: Statement;
  /** Standard account id, or null when not yet mapped. Unmapped lines block the run. */
  mapsTo: string | null;
  /** Converts the reported sign to the model sign. */
  sign: 1 | -1;
  /** Year -> reported value. A missing year means not loaded. */
  values: Record<string, number>;
  page?: string;
}

/** A reported total, used only for tie-outs. Never fed into the model. */
export interface ReportedTotal { id: string; values: Record<string, number>; label: string }

export interface SourceNote { id: number; text: string; amount?: number; page?: string }

export interface Historicals {
  /** Ascending, 2 to 5 years. */
  years: number[];
  /** Years carried for reference only and excluded from the model base. */
  referenceYears?: number[];
  lines: LineItem[];
  reported: ReportedTotal[];
  sourceNotes: SourceNote[];
}

/** Every per-year driver. Arrays have one entry per forecast year. */
export interface Drivers {
  g_export: number[]; g_domestic: number[]; g_urea: number[]; g_ammonia: number[]; g_other: number[];
  mix_urea: number[]; mix_ammonia: number[]; mix_other: number[]; export_share: number[];
  vol_urea: number[]; vol_ammonia: number[]; vol_other: number[];
  price_urea: number[]; price_ammonia: number[]; price_other: number[];
  gas_pct: number[]; gas_price_usd: number[]; gas_mmbtu: number[]; gas_kcf: number[];
  other_cogs_pct: number[]; gm_pct: number[]; depr_cogs_share: number[];
  sell_pct: number[]; sell_g: number[]; ga_pct: number[]; ga_g: number[];
  other_income: number[]; prov_reversed: number[]; other_exp: number[]; prov_formed: number[]; impairment: number[]; ecl: number[];
  capex_direct: number[]; capex_puc: number[]; puc_transfer: number[];
  disposal_cost: number[]; disposal_nbv: number[]; disposal_proceeds: number[];
  land: number[]; fully_dep: number[]; dep_rate: number[]; useful_life: number[]; tax_dep_rate: number[];
  oa_add: number[]; oa_amort_rate: number[]; rou_new: number[]; rou_amort_rate: number[];
  lease_rate: number[]; lease_pay: number[]; lease_cur_share: number[];
  dso: number[]; dio: number[]; dpo: number[]; debtors_pct: number[]; sup_adv_pct: number[];
  creditors_pct: number[]; cust_adv_pct: number[]; rp_balance: number[];
  ebo_service: number[]; ebo_rate: number[]; ebo_paid: number[]; ebo_cur_share: number[]; oci_gross: number[]; prov_used: number[];
  tax_pay_pct: number[];
  yield_delta: number[]; yield_spread: number[]; usd_yield: number[]; base_delta: number[];
  fx_close: number[];
  inv_nc_net: number[]; inv_cur_net: number[]; fvtpl_net: number[]; ofa_mov: number[]; assoc_mov: number[];
  payout: number[]; dps: number[]; emp_pct: number[]; wages: number[]; board_pct: number[]; div_pay_pct: number[];
  bonus_re: number[]; bonus_res: number[];
  min_cash: number[]; sweep_pct: number[]; debt_cur_share: number[];
}

export type DriverKey = keyof Drivers;

export interface Tranche {
  id: string;
  name: string;
  currency: 'EGP' | 'USD';
  rateType: 'fixed' | 'floating';
  fixedRate: number;
  /** Added to the floating base. */
  spread: number;
  /** Opening balance in EGP at the last historical year end. */
  openingEgp: number;
  /** Tranche currency amounts per forecast year. */
  borrow: number[];
  repay: number[];
}

export interface Settings {
  /** 1 = interest on average balances (engine iterates); 0 = on opening balances. */
  circularity: 0 | 1;
  /** 1 = FX module on. */
  fxOn: 0 | 1;
  /** 1 = by market, 2 = by segment growth, 3 = volume x price. */
  revenueBasis: 1 | 2 | 3;
  /** 1 = by line, 2 = gross margin. */
  cogsMode: 1 | 2;
  /** 1 = USD price x consumption x FX, 2 = % of sales. */
  gasMode: 1 | 2;
  /** 1 = % of revenue, 2 = growth. */
  sellMode: 1 | 2;
  gaMode: 1 | 2;
  /** 1 = useful life, 2 = % of opening gross. */
  depMode: 1 | 2;
  /** 1 = payout of prior-year distributable, 2 = DPS x shares. */
  divMode: 1 | 2;
  revolverOn: 0 | 1;
  revolverSpread: number;
  /** Natural-gas Schedule Tax applies to feedstock: 0 until confirmed. */
  schedTaxOn: 0 | 1;
  /** Registry id for the EGP yield base. */
  yieldBaseId: string;
  /** Registry id for the floating debt base. */
  floatBaseId: string;
  fxHistClose: number;
  fxHistAvg: number;
  usd: { cash: number; inv_nc: number; inv_cur: number; fvtpl: number; ofa: number; ar: number; debtors: number; ap: number; creditors: number; cust_adv: number };
  lrPct: number;
  lrCapPct: number;
  /** Statutory checks from Decision 14. */
  empFloorPct: number;
  boardCapPct: number;
  boardMinDistPct: number;
  sanityUpperPp: number;
  sanityLowerPp: number;
  covenants: { maxNetDebtEbitda: number; minInterestCover: number; minCurrentRatio: number };
  /** Sensitivity axis steps. */
  sensGrowthStep: number;
  sensMarginStep: number;
}

export interface ModelInputs {
  company: Company;
  historicals: Historicals;
  settings: Settings;
  scenarios: Record<ScenarioKey, Drivers>;
  tranches: Tranche[];
  activeScenario: ScenarioKey;
  nYears: number;
  /** Used only by sensitivity re-runs. */
  overlay?: { growth: number; margin: number };
}

export type Cell = number | null;
export type Rows = Record<string, Cell[]>;

export interface CheckResult { id: string; label: string; period: string; pass: boolean; diff: number | null; tolerance: number }
export interface Warning { id: string; period: string; message: string }

export interface ModelRun {
  schemaVersion: 1;
  company: { name: string; ticker: string };
  scenario: ScenarioKey;
  switches: { circularity: 0 | 1; fxOn: 0 | 1 };
  years: number[];
  nHist: number;
  periodLabels: string[];
  /** Every intermediate row, one value per period (historical then forecast). */
  rows: Rows;
  checks: CheckResult[];
  warnings: Warning[];
  iterations: number[];
  converged: boolean[];
  rates: { hash: string; frozenAt: string };
}

export type RunArgs = [ModelInputs, RatesSnapshot];
