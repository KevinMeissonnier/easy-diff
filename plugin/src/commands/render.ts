import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/git.ts';
import { targetPaths } from '../lib/paths.ts';
import { validateAnalysis, type Analysis } from '../lib/analysis.ts';
import type { Language } from '../lib/language.ts';
import { buildReportData, writeReport } from '../render/report.ts';

/** Renders the analysis the agent wrote into the HTML report and returns its index file. */
export function render(base: string, language: Language): string {
  const root = repoRoot();
  const paths = targetPaths(root);

  const analysis = readAnalysis(paths.dataFile);
  writeReport(paths.reportDir, buildReportData(analysis, base, root, language));
  return path.join(paths.reportDir, 'index.html');
}

function readAnalysis(file: string): Analysis {
  if (!fs.existsSync(file)) {
    throw new Error(`No analysis at ${file}: the easy-diff:analyst agent did not write one.`);
  }
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
  const errors = validateAnalysis(value);
  if (errors.length > 0) {
    throw new Error(`${file} is not a valid analysis:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
  return value as Analysis;
}
