// Part 1 gate. Opens docs/AUDIT.md and the cited source lines as they stood at the audited commit
// (the old code was deleted in Part 2); prints PASS/FAIL per check.
// Usage: node scripts/verify-part1.mjs   (writes docs/verify/part1.txt)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const out = [];
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const path = 'docs/AUDIT.md';
check('docs/AUDIT.md exists', existsSync(path));
const doc = existsSync(path) ? readFileSync(path, 'utf8') : '';

const sections = [
  ['1. File tree', /^## 1\. File tree with line counts$/m],
  ['2. Every calculation', /^## 2\. Every calculation$/m],
  ['3. Duplicated calculations', /^## 3\. Duplicated calculations$/m],
  ['4. Hardcoded rates and constants', /^## 4\. Hardcoded rates and constants$/m],
  ['5. Statement links', /^## 5\. How the statements link$/m],
  ['6. Balance check and circularity', /^## 6\. Balance check and circularity$/m],
  ['7. Network and storage', /^## 7\. Network calls, storage and data leaving the browser$/m],
  ['8. Excel exporter', /^## 8\. Excel exporter$/m],
  ['9. Module inventory', /^## 9\. Module inventory$/m],
  ['10. Test results', /^## 10\. Current test results, verbatim$/m],
];
const parts = doc.split(/^(?=## )/m);
for (const [name, re] of sections) {
  const body = parts.find(p => re.test(p)) ?? '';
  check(`Section present and non-empty: ${name}`, body.length > 400, `${body.length} chars`);
}

const required = [
  ['Section 8 lists sheets', '### 8.1 Sheets'],
  ['Section 8 lists hardcoded numbers', '### 8.2 Hardcoded numbers'],
  ['Section 8 lists literal constants', '### 8.3 Literal constants'],
  ['Section 8 lists 30 longest formulas', '### 8.4 Thirty longest formulas'],
  ['Section 8 reports function use', '### 8.5 Function use'],
  ['Section 8 lists number formats', '### 8.6 Number formats'],
  ['Section 8 reports recalculation', '### 8.7 Hard recalculation'],
  ['Section 7 covers the AI Analyst', 'AI Analyst'],
  ['Section 4 flags the stale banner', 'components/CBERateBanner.tsx:50,53'],
  ['Section 10 records npm test', 'npm error Missing script: "test"'],
];
for (const [name, text] of required) check(name, doc.includes(text));

const longest = doc.split('### 8.4 Thirty longest formulas')[1]?.split('### 8.5')[0] ?? '';
check('Exactly 30 formulas listed in 8.4', (longest.match(/^\| \d+ \|/gm) ?? []).length === 30);

// Cited lines must say what the audit says they say.
const citations = [
  ['lib/services/analyst.ts', 29, 'NEXT_PUBLIC_GROQ_API_KEY'],
  ['lib/services/analyst.ts', 189, 'api.groq.com'],
  ['lib/services/liveRates.ts', 63, 'exchangerate-api.com'],
  ['lib/engines/income-statement.ts', 416, 'statRate != null'],
  ['lib/engines/cash-flow.ts', 231, 'prev.retainedEarnings + is.netIncome'],
  ['lib/engines/balance-sheet.ts', 235, 'beginningTotalDebt * interestRate'],
  ['lib/engines/balance-sheet.ts', 246, 'beginningCash + endingCash'],
  ['lib/engines/balance-sheet.ts', 330, 'legalReserve: 0'],
  ['lib/engines/circular-resolver.ts', 36, 'maxIterations: number = 500'],
  ['lib/engines/circular-resolver.ts', 37, 'tolerance: number = 0.01'],
  ['lib/ratios.ts', 63, 'totalDebt !== 0 ? bookEquity / totalDebt : 0'],
  ['lib/ratios.ts', 72, '6.56 * x1'],
  ['lib/agents/validation-agent.ts', 191, 'totalChecks = 40'],
  ['lib/export/excel.ts', 139, 'fullCalcOnLoad: false'],
  ['lib/export/excel.ts', 2390, '2.9'],
  ['lib/export/build-company-info.ts', 102, '12345-Cairo-2010'],
  ['components/CBERateBanner.tsx', 50, 'Deposit 19.00%'],
  ['lib/store.ts', 538, 'financial-model-storage'],
];
for (const [file, line, text] of citations) {
  const l = execFileSync('git', ['show', `8ba8ab2:${file}`], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n')[line - 1] ?? '';
  check(`Citation ${file}:${line}`, l.includes(text));
}

// Part 1 changes nothing except audit outputs.
const changed = execFileSync('git', ['diff', '--name-only', '8ba8ab2', '6a897d3', '--', 'app', 'components', 'lib', 'types', 'fixtures', 'package.json', 'next.config.ts'], { encoding: 'utf8' }).trim();
check('The audit commit changed no source file', changed === '', changed);

// House rules for the audit outputs.
const nonAscii = (doc.match(/[^\x00-\x7F]/g) ?? []).length;
check('AUDIT.md has no emoji or non-ASCII characters', nonAscii === 0, `${nonAscii} found`);
check('AUDIT.md contains no API key', !/gsk_[A-Za-z0-9]{10,}/.test(doc));

out.push('', `${pass} PASS, ${fail} FAIL`);
const text = out.join('\n') + '\n';
writeFileSync('docs/verify/part1.txt', text);
process.stdout.write(text);
process.exit(fail ? 1 : 0);
