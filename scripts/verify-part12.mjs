// Part 12 gate: required documents exist, have content and follow the house rules.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const docs = ['README.md', 'docs/METHODOLOGY.md', 'docs/DATA_SOURCES.md', 'docs/RATES_RUNBOOK.md', 'CHANGELOG.md', 'CLAUDE.md', 'docs/MONOREPO_PLAN.md'];
const out = [];
let p = 0, f = 0;
const c = (n, ok, d = '') => { ok ? p++ : f++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  [${d}]` : ''}`); };
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{FE0F}\u{2713}\u{2717}]/u;
const BANNED = /institutional-grade|comprehensive|robust|cutting-edge|seamless|powerful|state-of-the-art|AI-powered/i;
for (const d of docs) {
  const ok = existsSync(d);
  c(`${d} exists`, ok);
  if (!ok) continue;
  const t = readFileSync(d, 'utf8');
  c(`${d} has content`, t.length > 400, `${t.length} chars`);
  c(`${d} has no emoji`, !EMOJI.test(t));
  // CLAUDE.md lists the banned words as a rule, so it is exempt.
  if (d !== 'CLAUDE.md') c(`${d} has no banned words`, !BANNED.test(t));
}
const readme = existsSync('README.md') ? readFileSync('README.md', 'utf8') : '';
c('README covers what it is, how to run, how to add a company', /what the engine is/i.test(readme) && /run/i.test(readme) && /add a company/i.test(readme));
const claude = existsSync('CLAUDE.md') ? readFileSync('CLAUDE.md', 'utf8') : '';
c('CLAUDE.md carries the standards', /Reporting order/i.test(claude) && /No invented data/i.test(claude) && /gate/i.test(claude));
const m = existsSync('docs/METHODOLOGY.md') ? readFileSync('docs/METHODOLOGY.md', 'utf8') : '';
c('METHODOLOGY lists every model equation', /net_profit = /.test(m) && /cf_close = /.test(m) && /altman_z = /.test(m));
const mono = existsSync('docs/MONOREPO_PLAN.md') ? readFileSync('docs/MONOREPO_PLAN.md', 'utf8') : '';
c('Monorepo work is a plan only', /plan only/i.test(mono) && !existsSync('apps'));
out.push('', `${p} PASS, ${f} FAIL`);
writeFileSync('docs/verify/part12.txt', out.join('\n') + '\n');
console.log(out.filter(l => l.startsWith('FAIL') || /PASS, \d+ FAIL/.test(l)).join('\n'));
process.exit(f ? 1 : 0);
