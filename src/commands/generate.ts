import fs from 'node:fs';
import path from 'node:path';
import { repoRoot, currentBranch, detectBaseBranch, changedFiles } from '../lib/git.js';
import { targetPaths } from '../lib/paths.js';
import { runAnalysis } from '../lib/claude-runner.js';
import { extractAnalysis } from '../lib/schema.js';
import { buildReportData, writeReport } from '../render/report.js';

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
    ['schema', paths.schemaFile],
  ];
  for (const [label, file] of requiredFiles) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `Missing easy-diff ${label} file (${path.relative(root, file)}). Run \`easy-diff init\` first.`
      );
    }
  }

  const base = options.base ?? detectBaseBranch(root);
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

  const reportData = buildReportData(analysis, base, root);
  writeReport(paths.reportDir, reportData);

  const indexFile = path.join(paths.reportDir, 'index.html');
  console.log(`\nReport ready: ${path.relative(root, indexFile)}`);
  console.log(`Open it in your browser to start the review.`);
}
