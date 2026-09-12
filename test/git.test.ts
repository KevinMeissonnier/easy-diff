import { test } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { repoRoot, currentBranch, detectBaseBranch, changedFiles, diffForFile } from '../src/lib/git.js';
import {
  makeTmpRepo,
  makeBareRepo,
  cloneRepo,
  writeFile,
  commitAll,
  removeTmpRepo,
  git,
} from './helpers/tmp-repo.js';

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
    assert.deepEqual(detectBaseBranch(repo), { status: 'found', base: 'main' });
  });

  await t.test('changedFiles lists exactly what differs from base', () => {
    assert.deepEqual(changedFiles('main', repo).sort(), ['a.txt', 'b.txt']);
  });

  await t.test('diffForFile returns a real unified diff for one path', () => {
    const diff = diffForFile('main', 'a.txt', repo);
    assert.match(diff, /^diff --git/);
    assert.match(diff, /\+two/);
  });

  await t.test('detectBaseBranch reports not-found when nothing matches', () => {
    const empty = makeTmpRepo();
    t.after(() => removeTmpRepo(empty));
    git(empty, ['checkout', '-q', '-b', 'only-branch']);
    assert.deepEqual(detectBaseBranch(empty), { status: 'not-found' });
  });

  await t.test('detectBaseBranch picks the actual fork point over an unrelated main', () => {
    // main and a "release" branch diverge; a feature branch forked from release should be
    // matched to release, not main — even though main is the repo's default branch name.
    const repo2 = makeTmpRepo();
    t.after(() => removeTmpRepo(repo2));
    writeFile(repo2, 'f.txt', 'base\n');
    commitAll(repo2, 'c0');
    git(repo2, ['checkout', '-q', '-b', 'release']);
    writeFile(repo2, 'f.txt', 'base\nrelease\n');
    commitAll(repo2, 'c1 on release');
    git(repo2, ['checkout', '-q', 'main']);
    writeFile(repo2, 'g.txt', 'unrelated\n');
    commitAll(repo2, 'c2 on main');
    git(repo2, ['checkout', '-q', '-b', 'feature', 'release']);
    writeFile(repo2, 'h.txt', 'feature work\n');
    commitAll(repo2, 'c3 on feature');

    assert.deepEqual(detectBaseBranch(repo2), { status: 'found', base: 'release' });
  });

  await t.test('detectBaseBranch reports ambiguous when candidates tie', () => {
    const repo3 = makeTmpRepo();
    t.after(() => removeTmpRepo(repo3));
    writeFile(repo3, 'f.txt', 'base\n');
    commitAll(repo3, 'c0');
    git(repo3, ['branch', 'release-a']);
    git(repo3, ['branch', 'release-b']);
    git(repo3, ['checkout', '-q', '-b', 'feature']);
    writeFile(repo3, 'g.txt', 'feature work\n');
    commitAll(repo3, 'c1 on feature');

    const detection = detectBaseBranch(repo3);
    assert.equal(detection.status, 'ambiguous');
    if (detection.status === 'ambiguous') {
      assert.deepEqual(
        detection.candidates.map((c) => c.ref).sort(),
        ['main', 'release-a', 'release-b']
      );
    }
  });

  await t.test('detectBaseBranch does not mistake a real clone\'s symbolic origin/HEAD for a candidate', () => {
    // `git for-each-ref --format=%(refname:short)` renders refs/remotes/origin/HEAD as just
    // "origin" (not "origin/HEAD"), which is not a valid diff target on its own — regression
    // coverage for that quirk, only reproducible against a real clone (not a plain local repo).
    const bare = makeBareRepo();
    const seed = makeTmpRepo();
    writeFile(seed, 'f.txt', 'base\n');
    commitAll(seed, 'c0');
    git(seed, ['remote', 'add', 'origin', bare]);
    git(seed, ['push', '-q', 'origin', 'main']);

    const clone = cloneRepo(bare);
    t.after(() => {
      removeTmpRepo(bare);
      removeTmpRepo(seed);
      removeTmpRepo(clone);
    });

    git(clone, ['checkout', '-q', '-b', 'feature']);
    writeFile(clone, 'g.txt', 'feature work\n');
    commitAll(clone, 'c1 on feature');

    assert.deepEqual(detectBaseBranch(clone), { status: 'found', base: 'origin/main' });
  });
});
