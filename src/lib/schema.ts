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
 * Claude Code's headless `--output-format json` wraps the final result in an envelope
 * whose exact shape may evolve; `--json-schema` may return the structured value either
 * inline or as a JSON-encoded string in that envelope. Rather than hard-coupling to one
 * shape, we try several plausible extraction points and validate each against our own
 * schema, so this keeps working even if the envelope shape shifts slightly.
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
