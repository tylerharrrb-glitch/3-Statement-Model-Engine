import { describe, expect, it } from 'vitest';
import { applyFetch, computeStaleness, confirmPolicyRate, diffSnapshot, effectiveStatus, freezeSnapshot, merge, provenanceLabel, withinBounds, type RateEntry } from '@registry';

const e = (o: Partial<RateEntry>): RateEntry => ({ id: 'x', label: 'x', value: 20, unit: 'pct', nature: 'official', sourceName: 's', sourceUrl: 'u', asOf: '2026-10-29', fetchedAt: null, verifiedAt: '2026-09-25', method: 'manual', updateCycle: 'mpc', bounds: { min: 0, max: 60 }, status: 'ok', ...o });
const cal = ['2026-09-24', '2026-10-29'];

describe('staleness', () => {
  it('MPC items are fine on the meeting day and stale the day after until re-verified', () => {
    expect(computeStaleness(e({}), { today: '2026-10-29', mpcCalendar: cal }).stale).toBe(false);
    const r = computeStaleness(e({}), { today: '2026-10-30', mpcCalendar: cal });
    expect(r.stale).toBe(true); expect(r.reason).toContain('2026-10-29');
    expect(computeStaleness(e({ verifiedAt: '2026-10-30' }), { today: '2026-10-31', mpcCalendar: cal }).stale).toBe(false);
  });
  it('per-cycle age limits', () => {
    expect(computeStaleness(e({ updateCycle: 'daily', verifiedAt: '2026-10-20' }), { today: '2026-10-31', mpcCalendar: [] }).stale).toBe(true);
    expect(computeStaleness(e({ updateCycle: 'monthly', verifiedAt: '2026-10-20' }), { today: '2026-10-31', mpcCalendar: [] }).stale).toBe(false);
    expect(computeStaleness(e({ updateCycle: 'event', verifiedAt: '2020-01-01' }), { today: '2026-10-31', mpcCalendar: [] }).stale).toBe(false);
  });
  it('unconfirmed is never upgraded', () => { expect(effectiveStatus(e({ status: 'unconfirmed' }), { today: '2026-10-01', mpcCalendar: [] })).toBe('unconfirmed'); });
});
describe('fetch pipeline', () => {
  it('rejects out of bounds and keeps the last good value', () => {
    expect(withinBounds(99, { min: 0, max: 60 })).toBe(false);
    const r = applyFetch(e({}), { value: 99, asOf: '2026-10-30', fetchedAt: '2026-10-30T06:00:00Z' });
    expect(r.value).toBe(20); expect(r.status).toBe('fetch_failed');
  });
  it('failure keeps the value and sets fetch_failed', () => { const r = applyFetch(e({}), { error: 'WAF', fetchedAt: '2026-10-30T06:00:00Z' }); expect(r.value).toBe(20); expect(r.status).toBe('fetch_failed'); });
  it('accepts a good value as auto', () => { const r = applyFetch(e({}), { value: 21, asOf: '2026-10-30', fetchedAt: '2026-10-30T06:00:00Z' }); expect(r.method).toBe('auto'); expect(r.status).toBe('ok'); });
  it('a policy-rate change needs two CBE pages to agree', () => {
    expect(confirmPolicyRate(21, 21, 20)).toMatchObject({ accept: true, value: 21 });
    expect(confirmPolicyRate(21, 20, 20)).toMatchObject({ accept: false, value: 20 });
    expect(confirmPolicyRate(21, null, 20).accept).toBe(false);
  });
});
describe('merge, snapshot, labels', () => {
  it('auto wins only when ok', () => {
    expect(merge([e({ method: 'auto', value: 1 })], [e({ value: 2 })])[0].value).toBe(1);
    expect(merge([e({ method: 'auto', value: 1, status: 'fetch_failed' })], [e({ value: 2 })])[0].value).toBe(2);
  });
  it('snapshot hash is stable and the diff lists changes', () => {
    const a = freezeSnapshot([e({})], 't');
    expect(freezeSnapshot([e({})], 'other').hash).toBe(a.hash);
    expect(diffSnapshot(a, [e({ value: 21 })])).toEqual([{ id: 'x', old: 20, new: 21, source: 's' }]);
    expect(freezeSnapshot([e({ value: 21 })], 't').hash).not.toBe(a.hash);
  });
  it('never calls a manual value live', () => {
    expect(provenanceLabel(e({}))).toBe('manual, verified 25-Sep-2026');
    expect(provenanceLabel(e({ method: 'auto', fetchedAt: '2026-10-30T06:05:00Z' }))).toBe('auto, fetched 30-Oct-2026 06:05');
    expect(provenanceLabel(e({ verifiedAt: null }))).toBe('manual, not verified');
  });
});
