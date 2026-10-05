import fs from 'node:fs';
import path from 'node:path';
import type { Analysis } from '../lib/analysis.ts';
import type { Language } from '../lib/language.ts';
import { DEFAULT_LANGUAGE } from '../lib/language.ts';
import { REPORT_TEMPLATE_DIR } from '../lib/paths.ts';
import { diffForFile, diffNumstat, commitCount } from '../lib/git.ts';

export interface RenderedLine {
  type: 'ctx' | 'add' | 'del';
  text: string;
  oldLine?: number;
  newLine?: number;
  watchpoint?: string;
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

export interface FileWatchpoint {
  hunkIndex: number;
  line: number;
  note: string;
}

export interface FileWithHunks {
  path: string;
  change_type: Analysis['steps'][number]['files'][number]['change_type'];
  why?: string;
  confidence: Analysis['steps'][number]['files'][number]['confidence'];
  churn: { add: number; del: number };
  hunks: RenderedHunk[];
  watchpoints: FileWatchpoint[];
}

export interface StepWithHunks {
  id: string;
  kind: Analysis['steps'][number]['kind'];
  title: string;
  narrative: string;
  files: FileWithHunks[];
}

export interface ReportMeta {
  commits: number;
  files_changed: number;
  insertions: number;
  deletions: number;
}

export interface ReportData {
  version: Analysis['version'];
  merge_request: Analysis['merge_request'];
  overview: Analysis['overview'];
  base: string;
  generatedAt: string;
  meta: ReportMeta;
  steps: StepWithHunks[];
  /** Language of the report viewer's own static UI labels. */
  language: Language;
}

const ZERO_CHURN = { add: 0, del: 0 };

export function buildReportData(
  analysis: Analysis,
  base: string,
  cwd: string,
  language: Language = DEFAULT_LANGUAGE
): ReportData {
  const numstat = safeNumstat(base, cwd);
  const steps: StepWithHunks[] = analysis.steps.map((step) => ({
    id: step.id,
    kind: step.kind,
    title: step.title,
    narrative: step.narrative,
    files: step.files.map((file) => {
      const hunks = pickHunks(safeDiff(base, file.path, cwd), file.hunks);
      return {
        path: file.path,
        change_type: file.change_type,
        why: file.why,
        confidence: file.confidence,
        churn: numstat.get(file.path) ?? ZERO_CHURN,
        hunks,
        watchpoints: flattenWatchpoints(hunks),
      };
    }),
  }));
  const meta: ReportMeta = {
    commits: safeCommitCount(base, cwd),
    files_changed: numstat.size,
    insertions: sumBy(numstat, 'add'),
    deletions: sumBy(numstat, 'del'),
  };
  return {
    version: analysis.version,
    merge_request: analysis.merge_request,
    overview: analysis.overview,
    base,
    generatedAt: new Date().toISOString(),
    meta,
    steps,
    language,
  };
}

function sumBy(numstat: Map<string, { add: number; del: number }>, key: 'add' | 'del'): number {
  let total = 0;
  for (const stat of numstat.values()) total += stat[key];
  return total;
}

/**
 * Picks the hunks the model pointed to (by index into the file's actual hunks, in diff
 * order) out of `parsed` — the file's real hunks, parsed from `git diff` ourselves. The
 * model's line numbers are never trusted for content or positions; they only select which
 * of our own parsed hunks to show and which of its lines carry a `watchpoint` note. If none
 * of the model's indices land on a real hunk, every parsed hunk is shown instead of nothing
 * — and, as a consequence, without any watchpoint attached.
 */
function pickHunks(diffText: string, requested: Analysis['steps'][number]['files'][number]['hunks']): RenderedHunk[] {
  const parsed = parseDiffHunks(diffText);
  const picked: RenderedHunk[] = [];
  for (const req of requested) {
    const hunk = parsed[req.index];
    if (!hunk) continue;
    // watchpoint lines are new-file line numbers (per the prompt), except for a
    // pure-deletion hunk, which has no new side at all — there, fall back to old-file line
    // numbers.
    const side = hunk.new_lines === 0 ? 'oldLine' : 'newLine';
    const notesByLine = new Map((req.watchpoints ?? []).map((w) => [w.line, w.note]));
    picked.push({
      ...hunk,
      label: req.label ?? hunk.label,
      note: req.note,
      lines: hunk.lines.map((line) => ({
        ...line,
        watchpoint: line[side] === undefined ? undefined : notesByLine.get(line[side]!),
      })),
    });
  }
  return picked.length > 0 ? picked : parsed;
}

function flattenWatchpoints(hunks: RenderedHunk[]): FileWatchpoint[] {
  const watchpoints: FileWatchpoint[] = [];
  hunks.forEach((hunk, hunkIndex) => {
    for (const line of hunk.lines) {
      if (!line.watchpoint) continue;
      watchpoints.push({ hunkIndex, line: (line.newLine ?? line.oldLine)!, note: line.watchpoint });
    }
  });
  return watchpoints;
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

function safeNumstat(base: string, cwd: string): Map<string, { add: number; del: number }> {
  try {
    return diffNumstat(base, cwd);
  } catch {
    return new Map();
  }
}

function safeCommitCount(base: string, cwd: string): number {
  try {
    return commitCount(base, cwd);
  } catch {
    return 0;
  }
}

export function writeReport(reportDir: string, data: ReportData): void {
  fs.mkdirSync(reportDir, { recursive: true });

  fs.copyFileSync(path.join(REPORT_TEMPLATE_DIR, 'i18n.js'), path.join(reportDir, 'i18n.js'));
  fs.copyFileSync(path.join(REPORT_TEMPLATE_DIR, 'app.js'), path.join(reportDir, 'app.js'));
  fs.copyFileSync(
    path.join(REPORT_TEMPLATE_DIR, 'style.css'),
    path.join(reportDir, 'style.css')
  );

  const shell = fs.readFileSync(path.join(REPORT_TEMPLATE_DIR, 'index.html'), 'utf8');
  // Guard against the (untrusted, LLM-derived) data prematurely closing the <script>
  // tag it's embedded in.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // A replacer function, because a replacement string would expand `$'`, `$&`… found in the
  // data (e.g. a shell diff line `"$x"$'\n'`) instead of inserting them literally.
  const html = shell.replace('/*__EASY_DIFF_DATA__*/null', () => json);
  fs.writeFileSync(path.join(reportDir, 'index.html'), html);
}
