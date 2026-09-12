import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file always lives two levels under the package root, both in dev
// (src/lib/paths.ts) and after compilation (dist/lib/paths.js) — tsc preserves the
// directory layout, so the arithmetic below holds in both cases.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(here, '..', '..');
export const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'templates');

/** Relative to the target repo root. Gitignored — generated output only. */
export const OUTPUT_DIR = 'easy-diff';
/** Relative to the target repo root. Committed — config, not generated output. */
export const CONFIG_DIR = path.join('.claude', 'easy-diff');

export interface TargetPaths {
  repoRoot: string;
  outputDir: string;
  dataFile: string;
  reportDir: string;
  commandFile: string;
  configReadme: string;
  settingsFile: string;
  hookFile: string;
  validateHookFile: string;
  schemaFile: string;
  gitignoreFile: string;
}

export function targetPaths(repoRoot: string): TargetPaths {
  return {
    repoRoot,
    outputDir: path.join(repoRoot, OUTPUT_DIR),
    dataFile: path.join(repoRoot, OUTPUT_DIR, 'data', 'analysis.json'),
    reportDir: path.join(repoRoot, OUTPUT_DIR, 'report'),
    commandFile: path.join(repoRoot, '.claude', 'commands', 'easy-diff-report.md'),
    configReadme: path.join(repoRoot, CONFIG_DIR, 'README.md'),
    settingsFile: path.join(repoRoot, CONFIG_DIR, 'settings.json'),
    hookFile: path.join(repoRoot, CONFIG_DIR, 'hooks', 'guard.cjs'),
    validateHookFile: path.join(repoRoot, CONFIG_DIR, 'hooks', 'validate-analysis.cjs'),
    schemaFile: path.join(repoRoot, CONFIG_DIR, 'analysis.schema.json'),
    gitignoreFile: path.join(repoRoot, '.gitignore'),
  };
}
