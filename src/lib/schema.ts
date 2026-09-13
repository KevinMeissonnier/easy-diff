import { z } from 'zod';

const ChangeType = z.enum(['added', 'modified', 'deleted', 'renamed']);
const Confidence = z.enum(['high', 'medium', 'low']);
const StepKind = z.enum(['foundation', 'core', 'wiring', 'delicate', 'tests']);

const Hunk = z.object({
  index: z.number().int().nonnegative(),
  old_start: z.number().int().nonnegative(),
  old_lines: z.number().int().nonnegative(),
  new_start: z.number().int().nonnegative(),
  new_lines: z.number().int().nonnegative(),
  label: z.string().optional(),
  note: z.string().optional(),
  focus_lines: z.array(z.number().int().positive()).optional(),
});

const FileEntry = z.object({
  path: z.string(),
  change_type: ChangeType,
  why: z.string(),
  watchpoints: z.array(z.string()).optional().default([]),
  confidence: Confidence,
  hunks: z.array(Hunk).min(1),
});

const Step = z.object({
  id: z.string(),
  kind: StepKind,
  title: z.string(),
  role: z.string(),
  intro: z.string(),
  detail: z.string(),
  files: z.array(FileEntry).min(1),
});

const MergeRequest = z.object({
  id: z.string().nullable().optional(),
  title: z.string(),
  source_branch: z.string(),
  target_branch: z.string(),
  base_sha: z.string(),
  head_sha: z.string(),
});

const Overview = z.object({
  what: z.string(),
  why: z.string(),
  risks: z.string(),
  out_of_scope: z.string(),
  estimated_reading_minutes: z.number().int().positive(),
});

export const Analysis = z.object({
  version: z.literal('1.0'),
  merge_request: MergeRequest,
  overview: Overview,
  steps: z.array(Step).min(1),
});

export type Analysis = z.infer<typeof Analysis>;

/**
 * Claude Code's headless `--output-format json` + `--json-schema` envelope (confirmed
 * against a live invocation, see test/fixtures/claude-envelope.*.json) carries the
 * structured value pre-parsed under `structured_output`, alongside a `result` field that
 * is the same value JSON-encoded as a string. We prefer `structured_output` (no need to
 * re-parse) but keep the other extraction points as a fallback in case the envelope shape
 * shifts across Claude Code versions.
 */
export function extractAnalysis(raw: string): Analysis {
  const candidates = collectJsonCandidates(raw);
  let lastError = '';
  for (const candidate of candidates) {
    const parsed = Analysis.safeParse(candidate);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.message;
  }
  throw new Error(
    `Could not find a valid easy-diff analysis in Claude's output.\n\n` +
      `Tried ${candidates.length} candidate value(s) out of the response. ` +
      `${lastError ? `Last validation error:\n${lastError}\n\n` : ''}` +
      `Raw output (first 2000 chars):\n${raw.slice(0, 2000)}`
  );
}

function collectJsonCandidates(raw: string): unknown[] {
  const candidates: unknown[] = [];
  const consider = (value: unknown) => {
    if (value && typeof value === 'object') candidates.push(value);
  };

  let outer: unknown;
  try {
    outer = JSON.parse(raw);
  } catch {
    return candidates;
  }
  consider(outer);

  if (outer && typeof outer === 'object') {
    // Checked first: the confirmed, already-parsed field in a real envelope.
    consider((outer as Record<string, unknown>).structured_output);

    for (const key of ['result', 'structured_result', 'output', 'content']) {
      const value = (outer as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        try {
          consider(JSON.parse(value));
        } catch {}
      } else {
        consider(value);
      }
    }
  }

  return candidates;
}
