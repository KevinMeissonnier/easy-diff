import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from helpers import EXAMPLE, LAUNCHER, RepoTestCase, git, run_launcher, write_file

import run
from easy_diff.errors import EasyDiffError
from easy_diff.language import language_option
from easy_diff.prepare import prepare
from easy_diff.render import render

ANALYSIS_FILE = os.path.join('easy-diff', 'data', 'analysis.json')


class PrepareTest(RepoTestCase):
    def test_reports_the_base_and_the_analysis_file_clears_a_stale_analysis_excludes_the_output(self):
        repo = self.make_feature_repo()
        write_file(repo, ANALYSIS_FILE, '{"stale": true}')

        output = prepare('fr', 'main')

        self.assertRegex(output, r'(?m)^status: ready$')
        self.assertRegex(output, r'(?m)^base: main$')
        self.assertRegex(output, r'(?m)^changed files: 1$')
        self.assertRegex(output, r'(?m)^language: fr$')
        self.assertIn(f'analysis file: {os.path.join(repo, ANALYSIS_FILE)}\n', output + '\n')
        self.assertFalse(os.path.exists(os.path.join(repo, ANALYSIS_FILE)))
        with open(os.path.join(repo, '.git', 'info', 'exclude'), encoding='utf-8') as file:
            self.assertRegex(file.read(), r'(?m)^/easy-diff/$')
        self.assertEqual(git(repo, 'status', '--porcelain'), '', 'nothing tracked or untracked is left behind')

    def test_lists_the_candidates_instead_of_guessing_when_the_base_is_ambiguous(self):
        repo = self.make_feature_repo()
        git(repo, 'branch', 'other', 'main')

        output = prepare('fr')

        self.assertRegex(output, r'(?m)^status: ambiguous$')
        self.assertRegex(output, r'(?m)^  - main$')
        self.assertRegex(output, r'(?m)^  - other$')

    def test_refuses_a_base_with_nothing_to_review(self):
        self.make_feature_repo()
        with self.assertRaisesRegex(EasyDiffError, 'same as the base branch'):
            prepare('fr', 'feature')
        with self.assertRaisesRegex(EasyDiffError, 'No differences'):
            prepare('fr', 'HEAD')


class RenderTest(RepoTestCase):
    def test_refuses_a_missing_or_invalid_analysis_renders_a_valid_one(self):
        repo = self.make_feature_repo()

        with self.assertRaisesRegex(EasyDiffError, 'No analysis at'):
            render('main', 'fr')

        write_file(repo, ANALYSIS_FILE, 'not json')
        with self.assertRaisesRegex(EasyDiffError, 'is not valid JSON'):
            render('main', 'fr')

        write_file(repo, ANALYSIS_FILE, json.dumps({**EXAMPLE, 'steps': []}))
        with self.assertRaisesRegex(EasyDiffError, 'steps: must be a non-empty array'):
            render('main', 'fr')

        write_file(repo, ANALYSIS_FILE, json.dumps(EXAMPLE))
        index = render('main', 'en')
        self.assertEqual(index, os.path.join(repo, 'easy-diff', 'report', 'index.html'))
        with open(index, encoding='utf-8') as file:
            self.assertIn('"language":"en"', file.read())


class LanguageOptionTest(unittest.TestCase):
    def test_an_option_the_user_never_set_arrives_as_its_placeholder_and_means_french(self):
        self.assertEqual(language_option('${user_config.language}'), 'fr')
        self.assertEqual(language_option('en'), 'en')
        with self.assertRaisesRegex(ValueError, 'Unsupported language "de"'):
            language_option('de')


class EntryPointTest(RepoTestCase):
    """easy-diff.sh and run.py: what happens before the easy_diff package is even loaded."""

    def test_runs_the_cli_through_the_launcher(self):
        self.make_feature_repo()
        result = run_launcher('prepare', '${user_config.language}', 'main')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('language: fr', result.stdout)

        result = run_launcher('nonsense')
        self.assertEqual(result.returncode, 1)
        self.assertIn('unknown command "nonsense"', result.stderr)

    def test_explains_a_missing_python_and_only_stops_the_analyst(self):
        # A PATH with the few tools the launcher needs, and no python at all.
        bin_dir = tempfile.mkdtemp(prefix='easy-diff-test-bin-')
        self.addCleanup(shutil.rmtree, bin_dir, ignore_errors=True)
        for tool in ('dirname', 'cat'):
            os.symlink(shutil.which(tool), os.path.join(bin_dir, tool))
        env = {'PATH': bin_dir}

        def launch(*args, stdin=''):
            return subprocess.run(['/bin/sh', LAUNCHER, *args], input=stdin, capture_output=True, text=True, env=env)

        result = launch('prepare', 'fr')
        self.assertEqual(result.returncode, 1)
        self.assertIn('easy-diff needs Python >= 3.9, but no python3 was found', result.stderr)

        normal_session = json.dumps({'tool_name': 'Bash', 'tool_input': {'command': 'ls'}})
        self.assertEqual(launch('guard', stdin=normal_session).stdout, '')

        analyst = json.dumps({'agent_type': 'easy-diff:analyst', 'tool_name': 'Bash'})
        denial = json.loads(launch('guard', stdin=analyst).stdout)['hookSpecificOutput']
        self.assertEqual(denial['permissionDecision'], 'deny')
        self.assertIn('no python3 was found', denial['permissionDecisionReason'])

        self.assertEqual(launch('check-analysis', stdin=analyst).returncode, 2)
        retried = json.dumps({'agent_type': 'easy-diff:analyst', 'stop_hook_active': True})
        self.assertEqual(launch('check-analysis', stdin=retried).returncode, 0)

    def test_explains_an_outdated_python_and_only_stops_the_analyst(self):
        def call(*argv, stdin=''):
            stdout, stderr = io.StringIO(), io.StringIO()
            with mock.patch.object(run, 'REQUIRED', (99, 0)), mock.patch.object(sys, 'argv', ['run.py', *argv]), \
                    mock.patch.object(sys, 'stdin', io.StringIO(stdin)), \
                    contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = run.main()
            return code, stdout.getvalue(), stderr.getvalue()

        code, _, stderr = call('prepare', 'fr')
        self.assertEqual(code, 1)
        self.assertIn('easy-diff needs Python >= 99.0', stderr)

        self.assertEqual(call('guard', stdin=json.dumps({'tool_name': 'Bash'})), (0, '', ''))

        code, stdout, _ = call('guard', stdin=json.dumps({'agent_type': 'easy-diff:analyst'}))
        self.assertEqual(json.loads(stdout)['hookSpecificOutput']['permissionDecision'], 'deny')

        self.assertEqual(call('check-analysis', stdin=json.dumps({'agent_type': 'easy-diff:analyst'}))[0], 2)


if __name__ == '__main__':
    unittest.main()
