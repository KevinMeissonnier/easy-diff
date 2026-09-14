import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAnalysis } from '../src/lib/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');

function minimalPayload(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    merge_request: {
      title: 't',
      source_branch: 'feature',
      target_branch: 'main',
      base_sha: 'abc123',
      head_sha: 'def456',
    },
    overview: { what: 'w', why: 'y', risks: 'r', out_of_scope: 'o', estimated_reading_minutes: 3 },
    steps: [
      {
        id: 'step-1',
        kind: 'core',
        title: 'a',
        role: 'r',
        intro: 'i',
        detail: 'd',
        files: [
          {
            path: 'x.ts',
            change_type: 'modified',
            why: 'w',
            confidence: 'high',
            hunks: [{ index: 0, old_start: 1, old_lines: 1, new_start: 1, new_lines: 1 }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

test('extracts from a real captured envelope (structured_output field)', () => {
  const raw = fixture('claude-envelope.success.json');
  const analysis = extractAnalysis(raw);
  assert.equal(analysis.merge_request.title, 'Add loud greeting mode to greet()');
  assert.equal(analysis.steps.length, 2);
  assert.equal(analysis.steps[0]?.files[0]?.path, 'src/greeter.py');
  assert.equal(analysis.steps[0]?.files[0]?.hunks[0]?.new_start, 1);
});

test('extracts from a real envelope where the model flagged a prompt-injection attempt', () => {
  // This fixture predates the hunk-level `watchpoints` shape (it was captured with the old
  // file-level `watchpoints`/hunk `focus_lines` fields, silently dropped by zod as unknown
  // keys) — what matters here is that extraction still succeeds and the finding survives in
  // the overview, not the now-removed field it originally lived in.
  const raw = fixture('claude-envelope.injection-attempt.json');
  const analysis = extractAnalysis(raw);
  assert.match(analysis.overview.risks.toLowerCase(), /backdoor_comment\.py/);
});

test('falls back to a JSON-encoded string under `result`', () => {
  const payload = minimalPayload();
  const raw = JSON.stringify({ type: 'result', result: JSON.stringify(payload) });
  const analysis = extractAnalysis(raw);
  assert.equal(analysis.merge_request.title, 't');
});

test('accepts the bare analysis shape with no envelope at all', () => {
  const analysis = extractAnalysis(JSON.stringify(minimalPayload()));
  assert.equal(analysis.merge_request.title, 't');
});

test("defaults a hunk's missing watchpoints to an empty array", () => {
  // watchpoints is deliberately absent here (built by hand, not via minimalPayload) to
  // confirm the schema fills it in rather than requiring the model to always supply it.
  const payload = minimalPayload();
  const analysis = extractAnalysis(JSON.stringify(payload));
  assert.deepEqual(analysis.steps[0]?.files[0]?.hunks[0]?.watchpoints, []);
});

test('throws with the raw output included when nothing matches the schema', () => {
  assert.throws(() => extractAnalysis('not json at all'), /Could not find a valid/);
  assert.throws(() => extractAnalysis(JSON.stringify({ foo: 'bar' })), /Could not find a valid/);
});

test('rejects a step with no files (schema requires at least one)', () => {
  const payload = minimalPayload();
  payload.steps[0].files = [];
  assert.throws(() => extractAnalysis(JSON.stringify(payload)));
});

test('rejects a file with no hunks (schema requires at least one)', () => {
  const payload = minimalPayload();
  payload.steps[0].files[0].hunks = [];
  assert.throws(() => extractAnalysis(JSON.stringify(payload)));
});

test('rejects an unknown step kind', () => {
  const payload = minimalPayload();
  payload.steps[0].kind = 'not-a-real-kind';
  assert.throws(() => extractAnalysis(JSON.stringify(payload)));
});
