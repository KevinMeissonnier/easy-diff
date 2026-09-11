import { z } from 'zod';

const FileRef = z.object({
  path: z.string(),
  note: z.string().optional(),
});

const Step = z.object({
  title: z.string(),
  role: z.string(),
  explanation: z.string(),
  attention_points: z.array(z.string()).optional().default([]),
  files: z.array(FileRef).min(1),
});

const Overview = z.object({
  title: z.string(),
  intent: z.string(),
  context: z.string(),
  summary: z.string(),
  attention_points: z.array(z.string()).optional().default([]),
});

export const Analysis = z.object({
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
        } catch {
          // Not JSON — ignore this candidate.
        }
      } else {
        consider(value);
      }
    }
  }

  return candidates;
}
