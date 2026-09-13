import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, currentBranch, detectBaseBranch, changedFiles } from '../lib/git.js';
import { promptChoice } from '../lib/prompt.js';
import { targetPaths } from '../lib/paths.js';
import { runAnalysis } from '../lib/claude-runner.js';
import { extractAnalysis } from '../lib/schema.js';
import { readReportLanguage } from '../lib/config.js';
import { buildReportData, writeReport } from '../render/report.js';

async function resolveBase(root: string): Promise<string> {
  const detection = detectBaseBranch(root);
  if (detection.status === 'found') return detection.base;

  if (detection.status === 'not-found') {
    throw new Error(
      'Could not auto-detect a base branch (no upstream tracking branch, no remote or local ' +
        'branches to compare against). Pass one explicitly: easy-diff generate <base-branch>'
    );
  }

  const refs = detection.candidates.map((c) => c.ref);
  if (!process.stdin.isTTY) {
    throw new Error(
      'Multiple branches are equally likely candidates for the base:\n' +
        refs.map((ref) => `  - ${ref}`).join('\n') +
        '\nPass one explicitly: easy-diff generate <base-branch>'
    );
  }

  return promptChoice('Could not confidently detect a single base branch — pick one:', refs);
}

export interface GenerateOptions {
  base?: string;
}

export async function generate(options: GenerateOptions = {}): Promise<void> {
  const root = repoRoot();
  const paths = targetPaths(root);

  const requiredFiles: Array<[string, string]> = [
    ['command', paths.commandFile],
    ['settings', paths.settingsFile],
    ['hook', paths.hookFile],
    ['validate-hook', paths.validateHookFile],
    ['validate-language-hook', paths.validateLanguageHookFile],
    ['schema', paths.schemaFile],
    ['config', paths.configFile],
  ];
  for (const [label, file] of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Missing easy-diff ${label} file (${path.relative(root, file)}). Run \`easy-diff init\` first.`
      );
    }
  }

  const base = options.base ?? (await resolveBase(root));
  const branch = currentBranch(root);
  if (branch === base) {
    throw new Error(`Current branch is the same as the base branch (${base}). Nothing to review.`);
  }

  const files = changedFiles(base, root);
  if (files.length === 0) {
    throw new Error(`No differences between ${base} and ${branch}.`);
  }

  console.log(`Analyzing ${files.length} changed file(s) between ${base}...${branch}…`);
  const raw = await runAnalysis({
    cwd: root,
    base,
    settingsFile: paths.settingsFile,
    schemaFile: paths.schemaFile,
  });

  const analysis = extractAnalysis(raw);

  fs.mkdirSync(path.dirname(paths.dataFile), { recursive: true });
  fs.writeFileSync(paths.dataFile, JSON.stringify(analysis, null, 2));

  const reportLanguage = readReportLanguage(paths.configFile);
  const reportData = buildReportData(analysis, base, root, reportLanguage);
  writeReport(paths.reportDir, reportData);

  const indexFile = path.join(paths.reportDir, 'index.html');
  console.log(`\nReport ready: ${path.relative(root, indexFile)}`);
  console.log(`Open it in your browser to start the review.`);
}
