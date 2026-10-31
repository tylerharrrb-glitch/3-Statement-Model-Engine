// Headless hard recalculation through LibreOffice. A dedicated profile forces recalculation on load;
// the default profile does not recalculate, so a plain conversion proves nothing.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function findSoffice(): string {
  const c = [process.env.SOFFICE, 'C:\\Program Files\\LibreOffice\\program\\soffice.exe', '/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/lib/libreoffice/program/soffice'].filter(Boolean) as string[];
  for (const p of c) if (existsSync(p)) return p;
  throw new Error('LibreOffice not found');
}

let profile: string | null = null;
function ensureProfile(): string {
  if (profile) return profile;
  profile = mkdtempSync(path.join(os.tmpdir(), '3sm-lo-'));
  mkdirSync(path.join(profile, 'user'), { recursive: true });
  writeFileSync(path.join(profile, 'user', 'registrymodifications.xcu'), `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>`);
  return profile;
}

export function recalc(xlsx: string, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const prof = ensureProfile().replace(/\\/g, '/');
  const uri = process.platform === 'win32' ? `file:///${prof}` : `file://${prof}`;
  execFileSync(findSoffice(), [`-env:UserInstallation=${uri}`, '--headless', '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', outDir, xlsx], { stdio: 'pipe', timeout: 240000 });
  return path.join(outDir, path.basename(xlsx));
}

/**
 * LibreOffice runs only part of the iteration on each load and ignores the file's iterate settings.
 * With the circularity switch at 1, feed each output back in until the probe value stops moving.
 * Each pass is a hard recalculation of the file's own formulas, seeded by the previous pass.
 */
export async function recalcConverged(xlsx: string, outDir: string, probe: (file: string) => Promise<number>, maxPasses = 40): Promise<{ file: string; passes: number; converged: boolean }> {
  let file = xlsx, last = NaN;
  for (let p = 1; p <= maxPasses; p++) {
    file = recalc(file, path.join(outDir, `pass${p}`));
    const v = await probe(file);
    if (Math.abs(v - last) < 0.001) return { file, passes: p, converged: true };
    last = v;
  }
  return { file, passes: maxPasses, converged: false };
}
