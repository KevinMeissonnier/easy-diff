import os
import unittest

from helpers import RepoTestCase, commit_all, git, write_file

from easy_diff.git import Ambiguous, Found, NotFound, changed_files, current_branch, detect_base_branch, diff_for_file, repo_root


class GitHelpersTest(RepoTestCase):
    def setUp(self):
        self.repo = self.make_repo()
        write_file(self.repo, 'a.txt', 'one\n')
        commit_all(self.repo, 'initial')
        git(self.repo, 'checkout', '-q', '-b', 'feature')
        write_file(self.repo, 'a.txt', 'one\ntwo\n')
        write_file(self.repo, 'b.txt', 'new file\n')
        commit_all(self.repo, 'feature work')

    def test_repo_root_resolves_the_checkout_root(self):
        self.assertEqual(os.path.realpath(repo_root(self.repo)), self.repo)

    def test_current_branch_reports_the_checked_out_branch(self):
        self.assertEqual(current_branch(self.repo), 'feature')

    def test_detects_local_main_when_no_remote_is_configured(self):
        self.assertEqual(detect_base_branch(self.repo), Found('main'))

    def test_changed_files_lists_exactly_what_differs_from_base(self):
        self.assertEqual(sorted(changed_files('main', self.repo)), ['a.txt', 'b.txt'])

    def test_diff_for_file_returns_a_real_unified_diff_for_one_path(self):
        diff = diff_for_file('main', 'a.txt', self.repo)
        self.assertRegex(diff, r'^diff --git')
        self.assertIn('+two', diff)


class DetectBaseBranchTest(RepoTestCase):
    def test_reports_not_found_when_nothing_matches(self):
        empty = self.make_repo()
        git(empty, 'checkout', '-q', '-b', 'only-branch')
        self.assertEqual(detect_base_branch(empty), NotFound())

    def test_picks_the_actual_fork_point_over_an_unrelated_main(self):
        # main and a "release" branch diverge; a feature branch forked from release should be
        # matched to release, not main — even though main is the repo's default branch name.
        repo = self.make_repo()
        write_file(repo, 'f.txt', 'base\n')
        commit_all(repo, 'c0')
        git(repo, 'checkout', '-q', '-b', 'release')
        write_file(repo, 'f.txt', 'base\nrelease\n')
        commit_all(repo, 'c1 on release')
        git(repo, 'checkout', '-q', 'main')
        write_file(repo, 'g.txt', 'unrelated\n')
        commit_all(repo, 'c2 on main')
        git(repo, 'checkout', '-q', '-b', 'feature', 'release')
        write_file(repo, 'h.txt', 'feature work\n')
        commit_all(repo, 'c3 on feature')

        self.assertEqual(detect_base_branch(repo), Found('release'))

    def test_reports_ambiguous_when_candidates_tie(self):
        repo = self.make_repo()
        write_file(repo, 'f.txt', 'base\n')
        commit_all(repo, 'c0')
        git(repo, 'branch', 'release-a')
        git(repo, 'branch', 'release-b')
        git(repo, 'checkout', '-q', '-b', 'feature')
        write_file(repo, 'g.txt', 'feature work\n')
        commit_all(repo, 'c1 on feature')

        detection = detect_base_branch(repo)
        self.assertIsInstance(detection, Ambiguous)
        self.assertEqual(sorted(c.ref for c in detection.candidates), ['main', 'release-a', 'release-b'])

    def test_does_not_mistake_a_real_clones_symbolic_origin_head_for_a_candidate(self):
        # `git for-each-ref --format=%(refname:short)` renders refs/remotes/origin/HEAD as just
        # "origin" (not "origin/HEAD"), which is not a valid diff target on its own — regression
        # coverage for that quirk, only reproducible against a real clone.
        bare = self.make_bare_repo()
        seed = self.make_repo()
        write_file(seed, 'f.txt', 'base\n')
        commit_all(seed, 'c0')
        git(seed, 'remote', 'add', 'origin', bare)
        git(seed, 'push', '-q', 'origin', 'main')

        clone = self.clone_repo(bare)
        git(clone, 'checkout', '-q', '-b', 'feature')
        write_file(clone, 'g.txt', 'feature work\n')
        commit_all(clone, 'c1 on feature')

        self.assertEqual(detect_base_branch(clone), Found('origin/main'))


if __name__ == '__main__':
    unittest.main()
