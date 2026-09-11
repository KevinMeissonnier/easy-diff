import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractAnalysis } from '../src/lib/schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');

test('extracts from a real captured envelope (structured_output field)', () => {
  const raw = fixture('claude-envelope.success.json');
  const analysis = extractAnalysis(raw);
  assert.equal(analysis.overview.title, 'Add optional loud greeting mode');
  assert.equal(analysis.steps.length, 2);
  assert.equal(analysis.steps[0]?.files[0]?.path, 'src/greeter.py');
});

test('extracts from a real envelope where the model flagged a prompt-injection attempt', () => {
  const raw = fixture('claude-envelope.injection-attempt.json');
  const analysis = extractAnalysis(raw);
  const flagged = analysis.overview.attention_points.some((point) =>
    point.toLowerCase().includes('prompt injection')
  );
  assert.ok(flagged, 'expected the injection attempt to be called out in attention_points');
});

test('falls back to a JSON-encoded string under `result`', () => {
  const payload = {
    overview: { title: 't', intent: 'i', context: 'c', summary: 's' },
    steps: [{ title: 'a', role: 'r', explanation: 'e', files: [{ path: 'x.ts' }] }],
  };
  const raw = JSON.stringify({ type: 'result', result: JSON.stringify(payload) });
  const analysis = extractAnalysis(raw);
  assert.equal(analysis.overview.title, 't');
});

test('accepts the bare analysis shape with no envelope at all', () => {
  const payload = {
    overview: { title: 't', intent: 'i', context: 'c', summary: 's' },
    steps: [{ title: 'a', role: 'r', explanation: 'e', files: [{ path: 'x.ts' }] }],
  };
  const analysis = extractAnalysis(JSON.stringify(payload));
  assert.equal(analysis.overview.title, 't');
});

test('throws with the raw output included when nothing matches the schema', () => {
  assert.throws(() => extractAnalysis('not json at all'), /Could not find a valid/);
  assert.throws(() => extractAnalysis(JSON.stringify({ foo: 'bar' })), /Could not find a valid/);
});

test('rejects a step with no files (schema requires at least one)', () => {
  const payload = {
    overview: { title: 't', intent: 'i', context: 'c', summary: 's' },
    steps: [{ title: 'a', role: 'r', explanation: 'e', files: [] }],
  };
  assert.throws(() => extractAnalysis(JSON.stringify(payload)));
});
