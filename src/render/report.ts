import fs from 'node:fs';
import path from 'node:path';
import type { Analysis } from '../lib/schema.js';
import { TEMPLATES_DIR } from '../lib/paths.js';
import { diffForFile } from '../lib/git.js';

export interface RenderedLine {
  type: 'ctx' | 'add' | 'del';
  text: string;
  oldLine?: number;
  newLine?: number;
  focus?: boolean;
}

export interface RenderedHunk {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  label?: string;
  note?: string;
  lines: RenderedLine[];
}

export interface FileWithHunks {
  path: string;
  change_type: Analysis['steps'][number]['files'][number]['change_type'];
  why: string;
  watchpoints: string[];
  confidence: Analysis['steps'][number]['files'][number]['confidence'];
  hunks: RenderedHunk[];
}

export interface StepWithHunks {
  id: string;
  kind: Analysis['steps'][number]['kind'];
  title: string;
  role: string;
  intro: string;
  detail: string;
  files: FileWithHunks[];
}

export interface ReportData {
  version: Analysis['version'];
  merge_request: Analysis['merge_request'];
  overview: Analysis['overview'];
  base: string;
  generatedAt: string;
  steps: StepWithHunks[];
}

export function buildReportData(analysis: Analysis, base: string, cwd: string): ReportData {
  const steps: StepWithHunks[] = analysis.steps.map((step) => ({
    id: step.id,
    kind: step.kind,
    title: step.title,
    role: step.role,
    intro: step.intro,
    detail: step.detail,
    files: step.files.map((file) => ({
      path: file.path,
      change_type: file.change_type,
      why: file.why,
      watchpoints: file.watchpoints,
      confidence: file.confidence,
      hunks: pickHunks(safeDiff(base, file.path, cwd), file.hunks),
    })),
  }));
  return {
    version: analysis.version,
    merge_request: analysis.merge_request,
    overview: analysis.overview,
    base,
    generatedAt: new Date().toISOString(),
    steps,
  };
}

/**
 * Picks the hunks the model pointed to (by index into the file's actual hunks, in diff
 * order) out of `parsed` — the file's real hunks, parsed from `git diff` ourselves. The
 * model's line numbers are never trusted for content or positions; they only select which
 * of our own parsed hunks to show and which lines within it to mark as `focus`. If none of
 * the model's indices land on a real hunk, every parsed hunk is shown instead of nothing.
 */
function pickHunks(diffText: string, requested: Analysis['steps'][number]['files'][number]['hunks']): RenderedHunk[] {
  const parsed = parseDiffHunks(diffText);
  const picked: RenderedHunk[] = [];
  for (const req of requested) {
    const hunk = parsed[req.index];
    if (!hunk) continue;
    // focus_lines are new-file line numbers (per the prompt), except for a pure-deletion
    // hunk, which has no new side at all — there, fall back to old-file line numbers.
    const focusSide = hunk.new_lines === 0 ? 'oldLine' : 'newLine';
    picked.push({
      ...hunk,
      label: req.label ?? hunk.label,
      note: req.note,
      lines: hunk.lines.map((line) => ({
        ...line,
        focus: isFocused(line[focusSide], req.focus_lines),
      })),
    });
  }
  return picked.length > 0 ? picked : parsed;
}

function isFocused(lineNumber: number | undefined, focusLines: number[] | undefined): boolean {
  if (lineNumber === undefined || !focusLines || focusLines.length === 0) return false;
  return focusLines.includes(lineNumber);
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@(.*)$/;

function parseDiffHunks(diffText: string): RenderedHunk[] {
  const hunks: RenderedHunk[] = [];
  let current: RenderedHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const rawLine of diffText.split('\n')) {
    const header = HUNK_HEADER.exec(rawLine);
    if (header) {
      const old_start = Number(header[1]);
      const old_lines = header[2] !== undefined ? Number(header[2]) : 1;
      const new_start = Number(header[3]);
      const new_lines = header[4] !== undefined ? Number(header[4]) : 1;
      const label = header[5]?.trim() || undefined;
      current = { old_start, old_lines, new_start, new_lines, label, lines: [] };
      hunks.push(current);
      oldLine = old_start;
      newLine = new_start;
      continue;
    }
    if (!current || rawLine.startsWith('\\')) continue; // e.g. "\ No newline at end of file"

    if (rawLine.startsWith('+')) {
      current.lines.push({ type: 'add', text: rawLine.slice(1), newLine });
      newLine += 1;
    } else if (rawLine.startsWith('-')) {
      current.lines.push({ type: 'del', text: rawLine.slice(1), oldLine });
      oldLine += 1;
    } else if (rawLine.startsWith(' ') || rawLine === '') {
      current.lines.push({ type: 'ctx', text: rawLine.slice(1), oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
  }
  return hunks;
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
