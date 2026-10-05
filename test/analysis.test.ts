import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAnalysis } from '../plugin/src/lib/analysis.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'analysis.example.json'), 'utf8'));

function minimalPayload() {
  return {
    version: '1.0',
    merge_request: {
      title: 't',
      source_branch: 'feature',
      target_branch: 'main',
      base_sha: 'abc123',
      head_sha: 'def456',
    },
    overview: {
      what: 'w',
      why: 'y',
      mental_model: 'm',
      decisions: [] as unknown[],
      risks: 'r',
      estimated_reading_minutes: 3,
    },
    steps: [
      {
        id: 'step-1',
        kind: 'core',
        title: 'a',
        narrative: 'n',
        files: [
          {
            path: 'x.ts',
            change_type: 'modified',
            why: 'w' as string | undefined,
            confidence: 'high',
            hunks: [{ index: 0, old_start: 1, old_lines: 1, new_start: 1, new_lines: 1 } as Record<string, unknown>],
          },
        ],
      },
    ],
  };
}

test('accepts the documented example analysis', () => {
  assert.deepEqual(validateAnalysis(example), []);
});

test('accepts a minimal analysis: no watchpoints, no merge request id', () => {
  assert.deepEqual(validateAnalysis(minimalPayload()), []);
});

test('accepts a file without a `why`', () => {
  const payload = minimalPayload();
  delete payload.steps[0]!.files[0]!.why;
  assert.deepEqual(validateAnalysis(payload), []);
});

test('rejects anything that is not an object', () => {
  assert.deepEqual(validateAnalysis('not an analysis'), ['root: expected a JSON object']);
  assert.deepEqual(validateAnalysis([]), ['root: expected a JSON object']);
});

test('names each missing required field by its path', () => {
  const payload = minimalPayload() as Record<string, any>;
  delete payload.overview.risks;
  delete payload.steps[0].narrative;
  const errors = validateAnalysis(payload);
  assert.ok(errors.some((e) => e.startsWith('overview.risks:')), errors.join('\n'));
  assert.ok(errors.some((e) => e.startsWith('steps[0].narrative:')), errors.join('\n'));
});

test('rejects a step with no files and a file with no hunks', () => {
  const noFiles = minimalPayload();
  noFiles.steps[0]!.files = [];
  assert.match(validateAnalysis(noFiles).join('\n'), /steps\[0\]\.files: must be a non-empty array/);

  const noHunks = minimalPayload();
  noHunks.steps[0]!.files[0]!.hunks = [];
  assert.match(validateAnalysis(noHunks).join('\n'), /steps\[0\]\.files\[0\]\.hunks: must be a non-empty array/);
});

test('rejects a decision without a reason', () => {
  const payload = minimalPayload();
  payload.overview.decisions = [{ choice: 'c' }];
  assert.match(validateAnalysis(payload).join('\n'), /overview\.decisions\[0\]\.reason/);
});

test('rejects an unknown enum value', () => {
  const payload = minimalPayload();
  payload.steps[0]!.kind = 'not-a-real-kind';
  assert.match(validateAnalysis(payload).join('\n'), /steps\[0\]\.kind: must be one of/);
});

test('rejects a non-integer hunk line number', () => {
  const payload = minimalPayload();
  payload.steps[0]!.files[0]!.hunks[0]!.new_start = 'twelve';
  assert.match(validateAnalysis(payload).join('\n'), /hunks\[0\]\.new_start: must be an integer >= 0/);
});

test('rejects a watchpoint without a positive line or a note', () => {
  const payload = minimalPayload();
  payload.steps[0]!.files[0]!.hunks[0]!.watchpoints = [{ line: 0 }];
  const errors = validateAnalysis(payload).join('\n');
  assert.match(errors, /watchpoints\[0\]\.line: must be an integer >= 1/);
  assert.match(errors, /watchpoints\[0\]\.note: must be a string/);
});
