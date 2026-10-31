// Rates registry: schema, staleness, merge(auto, manual), bounds validation, snapshot and diff.
// Pure functions only. "now" is always an argument. No React, no fetch, no Date.now().

export type RateNature = 'official' | 'statutory' | 'market_quote' | 'estimate';
export type RateMethod = 'auto' | 'scraped' | 'manual';
export type UpdateCycle = 'daily' | 'weekly_auction' | 'mpc' | 'monthly' | 'semiannual' | 'event';
export type RateStatus = 'ok' | 'stale' | 'fetch_failed' | 'unconfirmed';
export type RateValue = number | string | number[] | string[] | null;

export interface RateEntry {
  id: string;
  label: string;
  value: RateValue;
  unit: string;
  nature: RateNature;
  sourceName: string;
  /** Primary URL or the literal TO_VERIFY. */
  sourceUrl: string;
  asOf: string | null;
  fetchedAt: string | null;
  verifiedAt: string | null;
  method: RateMethod;
  updateCycle: UpdateCycle;
  bounds: { min: number; max: number } | null;
  status: RateStatus;
  notes?: string;
}

export interface RatesFile {
  schemaVersion: 1;
  generatedAt: string;
  entries: RateEntry[];
}

export interface RatesSnapshot {
  hash: string;
  frozenAt: string;
  entries: RateEntry[];
}

export interface StalenessContext {
  /** ISO date, supplied by the caller. */
  today: string;
  /** Scheduled MPC meeting dates (ISO). Unconfirmed dates must be left out. */
  mpcCalendar: string[];
}

export interface StalenessResult { stale: boolean; reason: string }

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / DAY);

/** Maximum age in days per cycle. MPC is event-driven and handled separately. */
export const MAX_AGE_DAYS: Record<Exclude<UpdateCycle, 'mpc' | 'event'>, number> = {
  daily: 4, weekly_auction: 10, monthly: 40, semiannual: 200,
};

export function computeStaleness(e: RateEntry, ctx: StalenessContext): StalenessResult {
  const ref = e.verifiedAt ?? e.asOf;
  if (!ref) return { stale: true, reason: 'No verification date' };
  if (e.updateCycle === 'event') return { stale: false, reason: 'Event-driven: changes only when the law or rating changes' };
  if (e.updateCycle === 'mpc') {
    const passed = ctx.mpcCalendar.filter(d => d <= ctx.today && d >= ref && d !== ref).sort();
    // An MPC-cycle item goes stale the day after a scheduled meeting until re-verified.
    const missed = passed.filter(d => days(d, ctx.today) >= 1);
    if (missed.length) return { stale: true, reason: `MPC met ${missed[missed.length - 1]}; last verified ${ref}` };
    return { stale: false, reason: `Verified ${ref}; no scheduled MPC meeting since` };
  }
  const age = days(ref, ctx.today);
  const limit = MAX_AGE_DAYS[e.updateCycle];
  if (age > limit) return { stale: true, reason: `${age} days old; limit for ${e.updateCycle} is ${limit}` };
  return { stale: false, reason: `${age} days old; limit for ${e.updateCycle} is ${limit}` };
}

/** Status shown to users. unconfirmed and fetch_failed are never upgraded by a date check. */
export function effectiveStatus(e: RateEntry, ctx: StalenessContext): RateStatus {
  if (e.status === 'unconfirmed' || e.status === 'fetch_failed') return e.status;
  return computeStaleness(e, ctx).stale ? 'stale' : 'ok';
}

export function withinBounds(value: RateValue, bounds: RateEntry['bounds']): boolean {
  if (!bounds || typeof value !== 'number') return true;
  return Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
}

/**
 * Apply a fetched value to the last good entry. Out of bounds or failed: keep the last good
 * value and set fetch_failed. A value is never relabelled as auto unless it was fetched.
 */
export function applyFetch(prev: RateEntry, fetched: { value: RateValue; asOf: string; fetchedAt: string } | { error: string; fetchedAt: string }): RateEntry {
  if ('error' in fetched) {
    return { ...prev, status: 'fetch_failed', fetchedAt: fetched.fetchedAt, notes: `Fetch failed: ${fetched.error}` };
  }
  if (!withinBounds(fetched.value, prev.bounds)) {
    return { ...prev, status: 'fetch_failed', fetchedAt: fetched.fetchedAt, notes: `Rejected: ${String(fetched.value)} outside bounds` };
  }
  return { ...prev, value: fetched.value, asOf: fetched.asOf, fetchedAt: fetched.fetchedAt, verifiedAt: fetched.fetchedAt.slice(0, 10), method: 'auto', status: 'ok', notes: undefined };
}

/** A policy-rate change is accepted only when two CBE pages agree. */
export function confirmPolicyRate(a: number | null, b: number | null, last: number | null): { accept: boolean; value: number | null; reason: string } {
  if (a === null || b === null) return { accept: false, value: last, reason: 'Only one or no CBE page could be read' };
  if (a !== b) return { accept: false, value: last, reason: `CBE pages disagree: ${a} vs ${b}` };
  return { accept: true, value: a, reason: 'Two CBE pages agree' };
}

/** merge(auto, manual): auto wins only when its status is ok. */
export function merge(auto: RateEntry[], manual: RateEntry[]): RateEntry[] {
  const out = new Map<string, RateEntry>();
  for (const m of manual) out.set(m.id, m);
  for (const a of auto) {
    const m = out.get(a.id);
    if (a.status === 'ok' || !m) out.set(a.id, a);
    else out.set(a.id, { ...m, notes: [m.notes, `Auto source status: ${a.status}. ${a.notes ?? ''}`].filter(Boolean).join(' ') });
  }
  return [...out.values()].sort((x, y) => x.id.localeCompare(y.id));
}

/** Deterministic FNV-1a over canonical JSON. Identifies a snapshot; not a security hash. */
export function hashEntries(entries: RateEntry[]): string {
  const canon = JSON.stringify([...entries].sort((a, b) => a.id.localeCompare(b.id)).map(e => [e.id, e.value, e.asOf, e.status, e.method]));
  let h1 = 0x811c9dc5; let h2 = 0x01000193;
  for (let i = 0; i < canon.length; i++) {
    h1 = Math.imul(h1 ^ canon.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + canon.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function freezeSnapshot(entries: RateEntry[], frozenAt: string): RatesSnapshot {
  return { hash: hashEntries(entries), frozenAt, entries: entries.map(e => ({ ...e })) };
}

export interface RateDiffRow { id: string; old: RateValue; new: RateValue; source: string }

/** Rows for the "Update to current rates" table. */
export function diffSnapshot(snapshot: RatesSnapshot, current: RateEntry[]): RateDiffRow[] {
  const prev = new Map(snapshot.entries.map(e => [e.id, e]));
  const rows: RateDiffRow[] = [];
  for (const c of current) {
    const p = prev.get(c.id);
    if (!p || JSON.stringify(p.value) !== JSON.stringify(c.value)) rows.push({ id: c.id, old: p ? p.value : null, new: c.value, source: c.sourceName });
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export function getRate(entries: RateEntry[], id: string): RateEntry | undefined {
  return entries.find(e => e.id === id);
}

/** Honest label. A manual value is never described as live or auto. */
export function provenanceLabel(e: RateEntry): string {
  const fmt = (iso: string | null, withTime: boolean) => {
    if (!iso) return 'date unknown';
    const d = new Date(iso);
    const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    const base = `${String(d.getUTCDate()).padStart(2, '0')}-${m}-${d.getUTCFullYear()}`;
    return withTime ? `${base} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : base;
  };
  if (e.method === 'auto') return `auto, fetched ${fmt(e.fetchedAt, true)}`;
  if (e.method === 'scraped') return `scraped, fetched ${fmt(e.fetchedAt, true)}`;
  return e.verifiedAt ? `manual, verified ${fmt(e.verifiedAt, false)}` : 'manual, not verified';
}
