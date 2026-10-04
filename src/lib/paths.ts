import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file always lives two levels under the package root, both in dev
// (src/lib/paths.ts) and after compilation (dist/lib/paths.js) — tsc preserves the
// directory layout, so the arithmetic below holds in both cases.
const here = path.dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = path.resolve(here, '..', '..');
export const TEMPLATES_DIR = path.join(PACKAGE_ROOT, 'templates');
export const PROMPT_FILE = path.join(TEMPLATES_DIR, 'analysis-prompt.md');
export const SCHEMA_FILE = path.join(TEMPLATES_DIR, 'analysis.schema.json');
export const HOOKS_DIR = path.join(TEMPLATES_DIR, 'hooks');

/** Relative to the target repo root. Gitignored — generated output only. */
export const OUTPUT_DIR = 'easy-diff';
/** Relative to the target repo root. Gitignored — per-developer settings. */
export const CONFIG_FILE = 'config-easy-diff.json';

export interface TargetPaths {
  repoRoot: string;
  outputDir: string;
  dataFile: string;
  /** The rendered report's data (`ReportData`), read by the Claude Code plugin's pane. */
  reportDataFile: string;
  reportDir: string;
  configFile: string;
  gitignoreFile: string;
  /** Scaffolded by the git-installed versions, before the prompt, schema and hooks shipped with the package. */
  legacyFiles: string[];
}

export function targetPaths(repoRoot: string): TargetPaths {
  return {
    repoRoot,
    outputDir: path.join(repoRoot, OUTPUT_DIR),
    dataFile: path.join(repoRoot, OUTPUT_DIR, 'data', 'analysis.json'),
    reportDataFile: path.join(repoRoot, OUTPUT_DIR, 'data', 'report.json'),
    reportDir: path.join(repoRoot, OUTPUT_DIR, 'report'),
    configFile: path.join(repoRoot, CONFIG_FILE),
    gitignoreFile: path.join(repoRoot, '.gitignore'),
    legacyFiles: [
      path.join(repoRoot, '.claude', 'commands', 'easy-diff-report.md'),
      path.join(repoRoot, '.claude', 'easy-diff'),
    ],
  };
}
