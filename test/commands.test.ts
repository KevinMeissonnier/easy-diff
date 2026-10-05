import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../plugin/src/commands/prepare.ts';
import { render } from '../plugin/src/commands/render.ts';
import { languageOption } from '../plugin/src/lib/language.ts';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo, git } from './helpers/tmp-repo.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'analysis.example.json'), 'utf8'));
const ANALYSIS_FILE = path.join('easy-diff', 'data', 'analysis.json');

// prepare and render work on the repo containing the current directory, as the skill runs them.
function inFeatureRepo(t: { after: (fn: () => void) => void }): string {
  const repo = fs.realpathSync(makeTmpRepo());
  const previous = process.cwd();
  t.after(() => {
    process.chdir(previous);
    removeTmpRepo(repo);
  });
  writeFile(repo, 'app.py', 'def hello():\n    return "hi"\n');
  commitAll(repo, 'initial');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(repo, 'app.py', 'def hello():\n    return "hello"\n');
  commitAll(repo, 'change greeting');
  process.chdir(repo);
  return repo;
}

test('prepare: reports the base and the analysis file, clears a stale analysis, excludes the output', (t) => {
  const repo = inFeatureRepo(t);
  writeFile(repo, ANALYSIS_FILE, '{"stale": true}');

  const output = prepare('fr', 'main');

  assert.match(output, /^status: ready$/m);
  assert.match(output, /^base: main$/m);
  assert.match(output, /^changed files: 1$/m);
  assert.match(output, /^language: fr$/m);
  assert.match(output, new RegExp(`^analysis file: ${path.join(repo, ANALYSIS_FILE)}$`, 'm'));
  assert.equal(fs.existsSync(path.join(repo, ANALYSIS_FILE)), false);
  assert.match(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8'), /^\/easy-diff\/$/m);
  assert.equal(git(repo, ['status', '--porcelain']), '', 'nothing tracked or untracked is left behind');
});

test('prepare: lists the candidates instead of guessing when the base is ambiguous', (t) => {
  const repo = inFeatureRepo(t);
  git(repo, ['branch', 'other', 'main']);

  const output = prepare('fr');

  assert.match(output, /^status: ambiguous$/m);
  assert.match(output, /^ {2}- main$/m);
  assert.match(output, /^ {2}- other$/m);
});

test('prepare: refuses a base with nothing to review', (t) => {
  inFeatureRepo(t);
  assert.throws(() => prepare('fr', 'feature'), /same as the base branch/);
  assert.throws(() => prepare('fr', 'HEAD'), /No differences/);
});

test('render: refuses a missing or invalid analysis, renders a valid one', (t) => {
  const repo = inFeatureRepo(t);

  assert.throws(() => render('main', 'fr'), /No analysis at/);

  writeFile(repo, ANALYSIS_FILE, JSON.stringify({ ...example, steps: [] }));
  assert.throws(() => render('main', 'fr'), /steps: must be a non-empty array/);

  writeFile(repo, ANALYSIS_FILE, JSON.stringify(example));
  const index = render('main', 'en');
  assert.equal(index, path.join(repo, 'easy-diff', 'report', 'index.html'));
  assert.match(fs.readFileSync(index, 'utf8'), /"language":"en"/);
});

test('languageOption: an option the user never set arrives as its placeholder and means French', () => {
  assert.equal(languageOption('${user_config.language}'), 'fr');
  assert.equal(languageOption('en'), 'en');
  assert.throws(() => languageOption('de'), /Unsupported language "de"/);
});
