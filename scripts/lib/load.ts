// Shared loaders for gates and golden files.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { freezeSnapshot, type RatesFile, type RatesSnapshot } from '../../packages/rates-registry/src/index';
import type { ModelInputs, ScenarioKey } from '../../src/engine/types';

export const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
export function loadSnapshot(): RatesSnapshot {
  const file = readJson('data/rates.manual.json') as RatesFile;
  return freezeSnapshot(file.entries, '2026-10-31T00:00:00Z');
}
export function loadMopco(opts: { scenario?: ScenarioKey; circ?: 0 | 1; nYears?: number } = {}): ModelInputs {
  const fx = readJson('tests/fixtures/mopco-fy2025.json');
  const dr = readJson('tests/fixtures/mopco-drivers.json');
  return {
    company: fx.company, historicals: fx.historicals, settings: { ...dr.settings, circularity: opts.circ ?? dr.settings.circularity },
    scenarios: dr.scenarios, tranches: dr.tranches, activeScenario: opts.scenario ?? 'base', nYears: opts.nYears ?? 5,
  };
}
export class Gate {
  lines: string[] = []; pass = 0; fail = 0;
  constructor(public part: string) {}
  check(name: string, ok: boolean, detail = '') { ok ? this.pass++ : this.fail++; this.lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`); }
  note(s: string) { this.lines.push(s); }
  done() {
    this.lines.push('', `${this.pass} PASS, ${this.fail} FAIL`);
    const text = this.lines.join('\n') + '\n';
    mkdirSync('docs/verify', { recursive: true });
    writeFileSync(`docs/verify/${this.part}.txt`, text);
    console.log(this.lines.filter(l => l.startsWith('FAIL') || /PASS, \d+ FAIL/.test(l)).join('\n'));
    process.exit(this.fail ? 1 : 0);
  }
}
