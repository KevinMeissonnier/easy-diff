import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { repoRoot, currentBranch, detectBaseBranch, changedFiles, diffForFile } from '../src/lib/git.js';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo, git } from './helpers/tmp-repo.js';

test('git helpers against a real throwaway repo', async (t) => {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));

  writeFile(repo, 'a.txt', 'one\n');
  commitAll(repo, 'initial');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(repo, 'a.txt', 'one\ntwo\n');
  writeFile(repo, 'b.txt', 'new file\n');
  commitAll(repo, 'feature work');

  await t.test('repoRoot resolves the checkout root', () => {
    // realpath both sides: on some systems the tmp dir is itself a symlink (e.g. macOS
    // /tmp -> /private/tmp), which would make a literal string comparison flaky.
    assert.equal(realpathSync(repoRoot(repo)), realpathSync(repo));
  });

  await t.test('currentBranch reports the checked-out branch', () => {
    assert.equal(currentBranch(repo), 'feature');
  });

  await t.test('detectBaseBranch finds local main when no remote is configured', () => {
    assert.equal(detectBaseBranch(repo), 'main');
  });

  await t.test('changedFiles lists exactly what differs from base', () => {
    assert.deepEqual(changedFiles('main', repo).sort(), ['a.txt', 'b.txt']);
  });

  await t.test('diffForFile returns a real unified diff for one path', () => {
    const diff = diffForFile('main', 'a.txt', repo);
    assert.match(diff, /^diff --git/);
    assert.match(diff, /\+two/);
  });

  await t.test('detectBaseBranch throws when nothing matches', () => {
    const empty = makeTmpRepo();
    t.after(() => removeTmpRepo(empty));
    git(empty, ['checkout', '-q', '-b', 'only-branch']);
    assert.throws(() => detectBaseBranch(empty), /Could not auto-detect/);
  });
});
