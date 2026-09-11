import fs from 'node:fs';
import path from 'node:path';
import type { Analysis } from '../lib/schema.js';
import { TEMPLATES_DIR } from '../lib/paths.js';
import { diffForFile } from '../lib/git.js';

export interface FileWithDiff {
  path: string;
  note?: string;
  diff: string;
}

export interface StepWithDiff {
  title: string;
  role: string;
  explanation: string;
  attention_points: string[];
  files: FileWithDiff[];
}

export interface ReportData {
  overview: Analysis['overview'];
  base: string;
  generatedAt: string;
  steps: StepWithDiff[];
}

export function buildReportData(analysis: Analysis, base: string, cwd: string): ReportData {
  const steps: StepWithDiff[] = analysis.steps.map((step) => ({
    ...step,
    files: step.files.map((file) => ({
      ...file,
      diff: safeDiff(base, file.path, cwd),
    })),
  }));
  return { overview: analysis.overview, base, generatedAt: new Date().toISOString(), steps };
}

function safeDiff(base: string, file: string, cwd: string): string {
  try {
    return diffForFile(base, file, cwd);
  } catch {
    return '';
  }
}

export function writeReport(reportDir: string, data: ReportData): void {
  fs.mkdirSync(reportDir, { recursive: true });

  fs.copyFileSync(path.join(TEMPLATES_DIR, 'report', 'app.js'), path.join(reportDir, 'app.js'));
  fs.copyFileSync(
    path.join(TEMPLATES_DIR, 'report', 'style.css'),
    path.join(reportDir, 'style.css')
  );

  const shell = fs.readFileSync(path.join(TEMPLATES_DIR, 'report', 'index.html'), 'utf8');
  // Guard against the (untrusted, LLM-derived) data prematurely closing the <script>
  // tag it's embedded in.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const html = shell.replace('/*__EASY_DIFF_DATA__*/null', json);
  fs.writeFileSync(path.join(reportDir, 'index.html'), html);
}
