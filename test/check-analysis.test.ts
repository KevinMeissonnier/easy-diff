import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { makeTmpRepo, removeTmpRepo, writeFile } from './helpers/tmp-repo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'plugin', 'hooks', 'check-analysis.ts');
const example = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'analysis.example.json'), 'utf8'));
const ANALYSIS_FILE = 'easy-diff/data/analysis.json';

function run(input: unknown, language?: string): { blocked: boolean; stderr: string } {
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_OPTION_LANGUAGE;
  if (language !== undefined) env.CLAUDE_PLUGIN_OPTION_LANGUAGE = language;
  try {
    execFileSync('node', [hook], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env });
    return { blocked: false, stderr: '' };
  } catch (err) {
    const e = err as { status: number; stderr: string };
    assert.equal(e.status, 2, `expected exit code 2 on block, got ${e.status}: ${e.stderr}`);
    return { blocked: true, stderr: e.stderr };
  }
}

function withRepo(t: { after: (fn: () => void) => void }, analysis?: unknown): string {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));
  if (analysis !== undefined) {
    writeFile(repo, ANALYSIS_FILE, typeof analysis === 'string' ? analysis : JSON.stringify(analysis));
  }
  return repo;
}

const stopInput = (cwd: string, extra: Record<string, unknown> = {}) => ({
  hook_event_name: 'SubagentStop',
  agent_type: 'easy-diff:analyst',
  cwd,
  ...extra,
});

test('check-analysis hook: allows a valid analysis in the configured language', (t) => {
  const repo = withRepo(t, example);
  assert.equal(run(stopInput(repo), 'en').blocked, false);
});

test('check-analysis hook: blocks when no analysis was written', (t) => {
  const repo = withRepo(t);
  const { blocked, stderr } = run(stopInput(repo), 'en');
  assert.equal(blocked, true);
  assert.match(stderr, /no analysis was written/);
});

test('check-analysis hook: blocks a file that is not JSON', (t) => {
  const repo = withRepo(t, 'not json at all');
  const { blocked, stderr } = run(stopInput(repo), 'en');
  assert.equal(blocked, true);
  assert.match(stderr, /not valid JSON/);
});

test('check-analysis hook: blocks a malformed analysis and lists what to fix', (t) => {
  const broken = structuredClone(example);
  delete broken.overview.risks;
  broken.steps[0].kind = 'not-a-real-kind';
  const repo = withRepo(t, broken);
  const { blocked, stderr } = run(stopInput(repo), 'en');
  assert.equal(blocked, true);
  assert.match(stderr, /overview\.risks/);
  assert.match(stderr, /steps\[0\]\.kind/);
});

test('check-analysis hook: blocks English prose when the language option is unset (defaults to French)', (t) => {
  const repo = withRepo(t, example);
  const { blocked, stderr } = run(stopInput(repo));
  assert.equal(blocked, true);
  assert.match(stderr, /language mismatch/);
  assert.match(stderr, /French/);
});

test('check-analysis hook: checks step narratives and decisions, not just the overview', (t) => {
  const french = structuredClone(example);
  french.overview.decisions = [
    {
      choice: 'La suppression dans le cache se fait lors de la révocation, pas avec une durée courte.',
      reason: 'Une durée courte réduit la fenêtre sans la fermer, ce qui ne suffit pas pour une révocation.',
    },
  ];
  for (const step of french.steps) {
    step.narrative =
      'Le cache est consulté avant la base de données. La lecture se fait après le décodage ' +
      'de la signature, pour que les jetons mal signés ne servent jamais de clé.';
  }
  french.overview.what = french.overview.why = french.overview.mental_model = french.overview.risks = '';
  const repo = withRepo(t, french);
  const { blocked, stderr } = run(stopInput(repo), 'en');
  assert.equal(blocked, true);
  assert.match(stderr, /expected English but the text reads as French/);
});

test('check-analysis hook: ignores every agent but the analyst', (t) => {
  const repo = withRepo(t);
  assert.equal(run(stopInput(repo, { agent_type: 'general-purpose' })).blocked, false);
});

test('check-analysis hook: does not loop forever (stop_hook_active allows through)', (t) => {
  const repo = withRepo(t);
  assert.equal(run(stopInput(repo, { stop_hook_active: true })).blocked, false);
});

test('check-analysis hook: fails open on unparseable hook input', () => {
  assert.equal(run('not json').blocked, false);
});
