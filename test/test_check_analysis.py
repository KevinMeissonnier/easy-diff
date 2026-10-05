import copy
import json
import os
import unittest

from helpers import EXAMPLE, RepoTestCase, run_launcher, write_file

ANALYSIS_FILE = os.path.join('easy-diff', 'data', 'analysis.json')


class CheckAnalysisHookTest(RepoTestCase):
    """The SubagentStop hook, run through the plugin's entry point as hooks.json does."""

    def run_hook(self, event, language=None):
        env = {key: value for key, value in os.environ.items() if key != 'CLAUDE_PLUGIN_OPTION_LANGUAGE'}
        if language is not None:
            env['CLAUDE_PLUGIN_OPTION_LANGUAGE'] = language
        result = run_launcher('check-analysis', stdin=event if isinstance(event, str) else json.dumps(event), env=env)
        self.assertIn(result.returncode, (0, 2), result.stderr)
        return result.returncode == 2, result.stderr

    def stop_event(self, analysis=None, **extra):
        repo = self.make_repo()
        if analysis is not None:
            write_file(repo, ANALYSIS_FILE, analysis if isinstance(analysis, str) else json.dumps(analysis))
        return {'hook_event_name': 'SubagentStop', 'agent_type': 'easy-diff:analyst', 'cwd': repo, **extra}

    def test_allows_a_valid_analysis_in_the_configured_language(self):
        blocked, stderr = self.run_hook(self.stop_event(EXAMPLE), 'en')
        self.assertFalse(blocked, stderr)

    def test_blocks_when_no_analysis_was_written(self):
        blocked, stderr = self.run_hook(self.stop_event(), 'en')
        self.assertTrue(blocked)
        self.assertIn('no analysis was written', stderr)

    def test_blocks_a_file_that_is_not_json(self):
        blocked, stderr = self.run_hook(self.stop_event('not json at all'), 'en')
        self.assertTrue(blocked)
        self.assertIn('not valid JSON', stderr)

    def test_blocks_a_malformed_analysis_and_lists_what_to_fix(self):
        broken = copy.deepcopy(EXAMPLE)
        del broken['overview']['risks']
        broken['steps'][0]['kind'] = 'not-a-real-kind'
        blocked, stderr = self.run_hook(self.stop_event(broken), 'en')
        self.assertTrue(blocked)
        self.assertIn('overview.risks', stderr)
        self.assertIn('steps[0].kind', stderr)

    def test_blocks_english_prose_when_the_language_option_is_unset(self):
        blocked, stderr = self.run_hook(self.stop_event(EXAMPLE))
        self.assertTrue(blocked)
        self.assertIn('language mismatch', stderr)
        self.assertIn('French', stderr)

    def test_checks_step_narratives_and_decisions_not_just_the_overview(self):
        french = copy.deepcopy(EXAMPLE)
        french['overview']['decisions'] = [{
            'choice': 'La suppression dans le cache se fait lors de la révocation, pas avec une durée courte.',
            'reason': 'Une durée courte réduit la fenêtre sans la fermer, ce qui ne suffit pas pour une révocation.',
        }]
        for step in french['steps']:
            step['narrative'] = (
                'Le cache est consulté avant la base de données. La lecture se fait après le décodage '
                'de la signature, pour que les jetons mal signés ne servent jamais de clé.'
            )
        for field in ('what', 'why', 'mental_model', 'risks'):
            french['overview'][field] = ''
        blocked, stderr = self.run_hook(self.stop_event(french), 'en')
        self.assertTrue(blocked)
        self.assertIn('expected English but the text reads as French', stderr)

    def test_ignores_every_agent_but_the_analyst(self):
        blocked, _ = self.run_hook(self.stop_event(agent_type='general-purpose'))
        self.assertFalse(blocked)

    def test_does_not_loop_forever(self):
        blocked, _ = self.run_hook(self.stop_event(stop_hook_active=True))
        self.assertFalse(blocked)

    def test_fails_open_on_unparseable_hook_input(self):
        blocked, _ = self.run_hook('not json')
        self.assertFalse(blocked)


if __name__ == '__main__':
    unittest.main()
