// Parts 9 and 10 gate. Usage: npx tsx scripts/verify-part9-10.ts. Writes docs/verify/part9.txt and part10.txt.
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const lines9: string[] = [], lines10: string[] = [];
let p9 = 0, f9 = 0, p10 = 0, f10 = 0;
const c9 = (n: string, ok: boolean, d = '') => { ok ? p9++ : f9++; lines9.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  [${d}]` : ''}`); };
const c10 = (n: string, ok: boolean, d = '') => { ok ? p10++ : f10++; lines10.push(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? `  [${d}]` : ''}`); };

execSync('npm run build', { stdio: 'pipe' });
const pw = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], { encoding: 'utf8', timeout: 400000 });
const tail = (pw.stdout + pw.stderr).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().split('\n').slice(-25).join('\n');
const rep = existsSync('docs/verify/playwright-report.json') ? JSON.parse(readFileSync('docs/verify/playwright-report.json', 'utf8')) : null;
c9('Playwright smoke test passes (every page opens, audit panel, bank block, unmapped block, exports)', pw.status === 0, pw.status === 0 ? '' : tail.slice(-900));
c9('No console errors on any page', !!rep && rep.consoleErrors.length === 0, rep ? JSON.stringify(rep.consoleErrors).slice(0, 400) : 'no report');
const shots = existsSync('docs/verify/screens') ? readdirSync('docs/verify/screens').filter(f => f.endsWith('.png')) : [];
c9('Screenshot set saved', shots.length >= 18, `${shots.length} files`);

const src = walk('src').filter(f => /\.(ts|tsx|css)$/.test(f));
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{FE0F}\u{2190}-\u{21FF}\u{2713}\u{2717}]/u;
const BANNED = /institutional-grade|comprehensive|robust|cutting-edge|seamless|powerful|state-of-the-art|AI-powered/i;
const emojiHits = src.filter(f => EMOJI.test(readFileSync(f, 'utf8')));
const bannedHits = src.filter(f => BANNED.test(readFileSync(f, 'utf8')));
c9('No emoji code points in src/', emojiHits.length === 0, emojiHits.join(', '));
c9('No banned words in src/', bannedHits.length === 0, bannedHits.join(', '));
const css = readFileSync('src/ui/styles.css', 'utf8');
c9('WOLF identity: dark and gold tokens', css.includes('--gold') && css.includes('--bg: #0d0f12'));
const app = readFileSync('src/ui/App.tsx', 'utf8');
c9('No stale CBE banner; rates only from the registry', !/19\.00|CBERateBanner|IN SYNC|AI Audit/.test(app));
c9('Status shown as text', /PASS/.test(app) && /FAIL/.test(app) && /toUpperCase/.test(app));
c9('Methodology page generated from docs/METHODOLOGY.md', /METHODOLOGY\.md\?raw/.test(app) && existsSync('docs/METHODOLOGY.md'));
const uiNoCalc = !/[a-z]\.rows\.[a-z_]+\[[^\]]+\]\s*[-+*/]\s*/i.test(app);
c9('UI does not calculate statement figures', uiNoCalc);

if (rep) {
  c10('No request contains a fixture value (revenue, cash, net profit digits)', rep.leaks.length === 0, JSON.stringify(rep.leaks).slice(0, 300));
  c10('No request to any other host', rep.foreign.length === 0, JSON.stringify(rep.foreign).slice(0, 300));
  c10('No POST or other non-GET request', rep.nonGet.length === 0, JSON.stringify(rep.nonGet).slice(0, 300));
  c10('The only API request is GET /api/rates', rep.apis.length === 0, JSON.stringify(rep.apis).slice(0, 300));
  c10('All other requests are static assets', rep.statics.length === 0, JSON.stringify(rep.statics).slice(0, 300));
  lines10.push('', 'Requests seen:', ...rep.urls.map((u: string) => `  ${u}`));
} else c10('Playwright network report exists', false);
const code = src.map(f => readFileSync(f, 'utf8')).join('\n');
c10('Only one fetch call site in src/, to /api/rates', (code.match(/\bfetch\(/g) ?? []).length === 1 && /fetch\('\/api\/rates'\)/.test(code));
c10('No analytics, Groq or external fonts', !/gtag|analytics|groq|fonts\.googleapis/i.test(code + readFileSync('index.html', 'utf8')));
c10('Saved models use IndexedDB; a clear control exists', /indexedDB\.open/.test(code) && /Clear local data/.test(code));
c10('JSON export and import exist', /Export JSON/.test(code) && /Import JSON/.test(code));

const footer = (l: string[], p: number, f: number) => [...l, '', `${p} PASS, ${f} FAIL`].join('\n') + '\n';
writeFileSync('docs/verify/part9.txt', footer(lines9, p9, f9));
writeFileSync('docs/verify/part10.txt', footer(lines10, p10, f10));
for (const [l, p, f] of [[lines9, p9, f9], [lines10, p10, f10]] as const) console.log([...l.filter(x => x.startsWith('FAIL')), `${p} PASS, ${f} FAIL`].join('\n'));
process.exit(f9 + f10 ? 1 : 0);
