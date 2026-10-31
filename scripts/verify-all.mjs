// Runs every Part gate. Exit code is non-zero if anything fails. Output goes to docs/verify/verify-all.txt.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const tsx = ['node_modules/tsx/dist/cli.mjs'];
const gates = [
  ['part1', ['scripts/verify-part1.mjs']],
  ['part2', [...tsx, 'scripts/verify-parts-2-7.ts', 'part2']],
  ['part4', [...tsx, 'scripts/verify-parts-2-7.ts', 'part4']],
  ['part5', [...tsx, 'scripts/verify-parts-2-7.ts', 'part5']],
  ['part6', [...tsx, 'scripts/verify-parts-2-7.ts', 'part6']],
  ['part7', [...tsx, 'scripts/verify-parts-2-7.ts', 'part7']],
  ['part8', [...tsx, 'scripts/verify-part8.ts']],
  ['part3', [...tsx, 'scripts/verify-part3.ts']],
  ['part9+10', [...tsx, 'scripts/verify-part9-10.ts']],
  ['part12', ['scripts/verify-part12.mjs']],
  ['part11', [...tsx, 'scripts/verify-part11.ts']],
  ['wolf-export', [...tsx, 'scripts/verify-wolf-export.ts']],
];
const only = process.argv.slice(2);
const out = [];
let failed = 0;
for (const [name, args] of gates) {
  if (only.length && !only.includes(name)) continue;
  const t = Date.now();
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (r.stdout + r.stderr).split('\n').filter(l => /^FAIL|\d+ PASS, \d+ FAIL/.test(l)).join('\n');
  const crash = !/\d+ PASS, \d+ FAIL/.test(text);
  if (r.status !== 0) failed++;
  out.push(`=== ${name} (${Math.round((Date.now() - t) / 1000)} s)`, crash ? `FAIL  gate did not finish: ${(r.stderr || r.stdout).slice(-500)}` : text);
  console.log(out.slice(-2).join('\n'));
}
out.push('', failed ? `${failed} gate(s) with FAIL lines` : 'ALL GATES PASS');
console.log(out[out.length - 1]);
writeFileSync('docs/verify/verify-all.txt', out.join('\n') + '\n');
process.exit(failed ? 1 : 0);
