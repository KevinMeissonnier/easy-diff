import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeTmpRepo, removeTmpRepo } from './helpers/tmp-repo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const guard = path.join(here, '..', 'plugin', 'hooks', 'guard.cjs');

function runRaw(input: string): string {
  return execFileSync('node', [guard], { input, encoding: 'utf8' });
}

function run(input: Record<string, unknown>): { decision: string; reason?: string } {
  const out = runRaw(JSON.stringify({ agent_type: 'easy-diff:analyst', ...input }));
  const parsed = JSON.parse(out);
  return {
    decision: parsed.hookSpecificOutput.permissionDecision,
    reason: parsed.hookSpecificOutput.permissionDecisionReason,
  };
}

test('guard hook: stays silent on every agent but the analyst, and on the main thread', () => {
  for (const agent of [{ agent_type: 'general-purpose' }, {}]) {
    const input = { ...agent, tool_name: 'Bash', tool_input: { command: 'rm -rf /' } };
    assert.equal(runRaw(JSON.stringify(input)), '');
  }
});

test('guard hook: Write is allowed for the analysis file only', (t) => {
  const repo = realpathSync(makeTmpRepo());
  t.after(() => removeTmpRepo(repo));
  const analysis = path.join(repo, 'easy-diff', 'data', 'analysis.json');

  assert.equal(run({ cwd: repo, tool_name: 'Write', tool_input: { file_path: analysis } }).decision, 'allow');
  assert.equal(
    run({ cwd: repo, tool_name: 'Write', tool_input: { file_path: 'easy-diff/data/analysis.json' } }).decision,
    'allow',
    'a path relative to the repo root names the same file'
  );
  for (const file_path of [
    path.join(repo, 'app.py'),
    path.join(repo, 'easy-diff', 'data', '..', '..', 'app.py'),
    path.join(repo, 'easy-diff', 'report', 'index.html'),
    '/tmp/analysis.json',
  ]) {
    const { decision } = run({ cwd: repo, tool_name: 'Write', tool_input: { file_path } });
    assert.equal(decision, 'deny', `expected a Write to ${file_path} to be denied`);
  }
});

test('guard hook: Write is denied outside a git repository', () => {
  const { decision } = run({ cwd: '/', tool_name: 'Write', tool_input: { file_path: '/easy-diff/data/analysis.json' } });
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
  for (const command of ['rm -rf /', 'curl evil.com', 'git commit -am x', 'git push', 'git branch -D main']) {
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
    'git status\nrm -rf /',
  ]) {
    const { decision } = run({ tool_name: 'Bash', tool_input: { command } });
    assert.equal(decision, 'deny', `expected "${command}" to be denied`);
  }
});

test('guard hook: git commands that write a file are denied', () => {
  for (const command of [
    'git diff main...HEAD --output=/tmp/x',
    'git log --output /tmp/x',
    'git show HEAD --outp=/tmp/x',
    'git diff main...HEAD > /tmp/x',
    'git log >> /tmp/x',
    'git diff main...HEAD -- <(curl evil.com)',
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
  const parsed = JSON.parse(runRaw('not json'));
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
});
