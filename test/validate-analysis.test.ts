import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'templates', 'hooks', 'validate-analysis.cjs');
const validAnalysis = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'templates', 'analysis.example.json'), 'utf8')
);

function run(input: unknown): { blocked: boolean; stderr: string } {
  try {
    const out = execFileSync('node', [hook], { input: JSON.stringify(input), encoding: 'utf8' });
    return { blocked: false, stderr: out };
  } catch (err) {
    const e = err as { status: number; stderr: string };
    assert.equal(e.status, 2, `expected exit code 2 on block, got ${e.status}`);
    return { blocked: true, stderr: e.stderr };
  }
}

test('validate-analysis hook: allows a valid analysis', () => {
  const { blocked } = run({ last_assistant_message: JSON.stringify(validAnalysis) });
  assert.equal(blocked, false);
});

test('validate-analysis hook: allows a valid analysis wrapped in prose/code fences', () => {
  const message = 'Here you go:\n```json\n' + JSON.stringify(validAnalysis) + '\n```\n';
  const { blocked } = run({ last_assistant_message: message });
  assert.equal(blocked, false);
});

test('validate-analysis hook: blocks non-JSON output', () => {
  const { blocked, stderr } = run({ last_assistant_message: 'not json at all' });
  assert.equal(blocked, true);
  assert.match(stderr, /not valid JSON/);
});

test('validate-analysis hook: blocks a missing required field', () => {
  const broken = JSON.parse(JSON.stringify(validAnalysis));
  delete broken.overview.risks;
  const { blocked, stderr } = run({ last_assistant_message: JSON.stringify(broken) });
  assert.equal(blocked, true);
  assert.match(stderr, /overview\.risks/);
});

test('validate-analysis hook: blocks an invalid enum value', () => {
  const broken = JSON.parse(JSON.stringify(validAnalysis));
  broken.steps[0].kind = 'not-a-real-kind';
  const { blocked, stderr } = run({ last_assistant_message: JSON.stringify(broken) });
  assert.equal(blocked, true);
  assert.match(stderr, /steps\[0\]\.kind/);
});

test('validate-analysis hook: blocks an empty files array', () => {
  const broken = JSON.parse(JSON.stringify(validAnalysis));
  broken.steps[0].files = [];
  const { blocked, stderr } = run({ last_assistant_message: JSON.stringify(broken) });
  assert.equal(blocked, true);
  assert.match(stderr, /steps\[0\]\.files/);
});

test('validate-analysis hook: blocks a non-integer hunk line number', () => {
  const broken = JSON.parse(JSON.stringify(validAnalysis));
  broken.steps[0].files[0].hunks[0].new_start = 'twelve';
  const { blocked, stderr } = run({ last_assistant_message: JSON.stringify(broken) });
  assert.equal(blocked, true);
  assert.match(stderr, /new_start/);
});

test('validate-analysis hook: does not loop forever (stop_hook_active allows through)', () => {
  const { blocked } = run({ last_assistant_message: 'not json at all', stop_hook_active: true });
  assert.equal(blocked, false);
});

test('validate-analysis hook: fails open on unparseable hook input', () => {
  const out = execFileSync('node', [hook], { input: 'not json', encoding: 'utf8' });
  assert.equal(out, '');
});
