// Thin state layer. Saved models live in IndexedDB on this device; nothing is sent anywhere.
import { freezeSnapshot, type RateEntry, type RatesFile, type RatesSnapshot } from '@registry';
import mopcoFx from '../../tests/fixtures/mopco-fy2025.json';
import mopcoDr from '../../tests/fixtures/mopco-drivers.json';
import manual from '../../data/rates.manual.json';
import type { ModelInputs } from '../engine/types';

export const bundledRates = (manual as unknown as RatesFile).entries;

export function mopcoInputs(): ModelInputs {
  const fx = JSON.parse(JSON.stringify(mopcoFx));
  const dr = JSON.parse(JSON.stringify(mopcoDr));
  return { company: fx.company, historicals: fx.historicals, settings: dr.settings, scenarios: dr.scenarios, tranches: dr.tranches, activeScenario: 'base', nYears: 5 };
}

export interface SavedModel { id: string; name: string; savedAt: string; inputs: ModelInputs; snapshot: RatesSnapshot }

const DB = '3sm-local', STORE = 'models';
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open();
  return new Promise((res, rej) => {
    const q = f(db.transaction(STORE, mode).objectStore(STORE));
    // Close each connection so Clear local data is not blocked by an open handle.
    q.onsuccess = () => { res(q.result); db.close(); };
    q.onerror = () => { rej(q.error); db.close(); };
  });
};
export const saveModel = (m: SavedModel) => tx('readwrite', s => s.put(m));
export const listModels = () => tx<SavedModel[]>('readonly', s => s.getAll() as IDBRequest<SavedModel[]>);
export const deleteModel = (id: string) => tx('readwrite', s => s.delete(id));
export const clearLocalData = () => new Promise<void>((res, rej) => {
  const r = indexedDB.deleteDatabase(DB);
  r.onsuccess = () => { try { localStorage.clear(); sessionStorage.clear(); } catch { /* storage may be blocked */ } res(); };
  r.onerror = () => rej(r.error);
  r.onblocked = () => res();
});

/** The only server request the app makes. */
export async function fetchRates(): Promise<{ entries: RateEntry[]; lastRun: { adapters: { adapter: string; error: string | null }[]; ranAt: string } | null; source: 'api' | 'bundled' }> {
  try {
    const r = await fetch('/api/rates');
    const type = r.headers.get('content-type') ?? '';
    if (r.ok && type.includes('json')) { const j = await r.json(); return { entries: j.entries, lastRun: j.lastRun, source: 'api' }; }
  } catch { /* falls through to the bundled manual file */ }
  return { entries: bundledRates, lastRun: null, source: 'bundled' };
}
export const freeze = (entries: RateEntry[]) => freezeSnapshot(entries, new Date().toISOString());

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
