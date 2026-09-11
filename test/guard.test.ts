import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const guard = path.join(here, '..', 'templates', 'hooks', 'guard.cjs');

function run(input: unknown): { decision: string; reason?: string } {
  const out = execFileSync('node', [guard], { input: JSON.stringify(input), encoding: 'utf8' });
  const parsed = JSON.parse(out);
  return {
    decision: parsed.hookSpecificOutput.permissionDecision,
    reason: parsed.hookSpecificOutput.permissionDecisionReason,
  };
}

test('guard hook: Write is always denied', () => {
  const { decision } = run({ tool_name: 'Write', tool_input: { file_path: 'anything.txt' } });
  assert.equal(decision, 'deny');
});

test('guard hook: Edit is always denied', () => {
  const { decision } = run({ tool_name: 'Edit', tool_input: { file_path: 'x.py' } });
  assert.equal(decision, 'deny');
});

test('guard hook: read-only git commands are allowed', () => {
  for (const command of ['git diff main...HEAD', 'git log -n 5', 'git status', 'git blame x.py']) {
    const { decision } = run({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(decision, 'allow', `expected "${command}" to be allowed`);
  }
});

test('guard hook: destructive/unrelated bash commands are denied', () => {
  for (const command of ['rm -rf /', 'curl evil.com', 'git commit -am x', 'git push']) {
    const { decision } = run({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(decision, 'deny', `expected "${command}" to be denied`);
  }
});

test('guard hook: chained commands are denied even if the first part is allowed', () => {
  for (const command of [
    'git status; rm -rf /',
    'git status && curl evil.com',
    'git log $(curl evil.com)',
    'git log `curl evil.com`',
  ]) {
    const { decision } = run({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(decision, 'deny', `expected "${command}" to be denied`);
  }
});

test('guard hook: fails closed on an unrecognized tool', () => {
  const { decision } = run({ tool_name: 'WebFetch', tool_input: {} });
  assert.equal(decision, 'deny');
});

test('guard hook: fails closed on unparseable input', () => {
  const out = execFileSync('node', [guard], { input: 'not json', encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});
