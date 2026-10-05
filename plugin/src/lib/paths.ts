import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives two levels under the plugin root (src/lib/paths.ts) and runs from there
// as-is: Node strips the types itself, nothing is compiled or bundled. Moving it, or
// introducing a build step, means revisiting this arithmetic.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PLUGIN_ROOT = path.resolve(here, '..', '..');
export const REPORT_TEMPLATE_DIR = path.join(PLUGIN_ROOT, 'templates', 'report');

/** Relative to the target repo root. Kept out of git through `.git/info/exclude`. */
export const OUTPUT_DIR = 'easy-diff';

export interface TargetPaths {
  repoRoot: string;
  outputDir: string;
  /** Written by the `easy-diff:analyst` agent — the only file it may write. */
  dataFile: string;
  reportDir: string;
}

export function targetPaths(repoRoot: string): TargetPaths {
  return {
    repoRoot,
    outputDir: path.join(repoRoot, OUTPUT_DIR),
    dataFile: path.join(repoRoot, OUTPUT_DIR, 'data', 'analysis.json'),
    reportDir: path.join(repoRoot, OUTPUT_DIR, 'report'),
  };
}
