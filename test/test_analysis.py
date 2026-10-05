import copy
import unittest

from helpers import EXAMPLE

from easy_diff.analysis import validate_analysis


def minimal_payload():
    return {
        'version': '1.0',
        'merge_request': {
            'title': 't',
            'source_branch': 'feature',
            'target_branch': 'main',
            'base_sha': 'abc123',
            'head_sha': 'def456',
        },
        'overview': {
            'what': 'w',
            'why': 'y',
            'mental_model': 'm',
            'decisions': [],
            'risks': 'r',
            'estimated_reading_minutes': 3,
        },
        'steps': [{
            'id': 'step-1',
            'kind': 'core',
            'title': 'a',
            'narrative': 'n',
            'files': [{
                'path': 'x.ts',
                'change_type': 'modified',
                'why': 'w',
                'confidence': 'high',
                'hunks': [{'index': 0, 'old_start': 1, 'old_lines': 1, 'new_start': 1, 'new_lines': 1}],
            }],
        }],
    }


class ValidateAnalysisTest(unittest.TestCase):
    def assert_error(self, payload, pattern):
        self.assertRegex('\n'.join(validate_analysis(payload)), pattern)

    def test_accepts_the_documented_example_analysis(self):
        self.assertEqual(validate_analysis(copy.deepcopy(EXAMPLE)), [])

    def test_accepts_a_minimal_analysis_without_watchpoints_or_merge_request_id(self):
        self.assertEqual(validate_analysis(minimal_payload()), [])

    def test_accepts_a_file_without_a_why(self):
        payload = minimal_payload()
        del payload['steps'][0]['files'][0]['why']
        self.assertEqual(validate_analysis(payload), [])

    def test_rejects_anything_that_is_not_an_object(self):
        self.assertEqual(validate_analysis('not an analysis'), ['root: expected a JSON object'])
        self.assertEqual(validate_analysis([]), ['root: expected a JSON object'])

    def test_names_each_missing_required_field_by_its_path(self):
        payload = minimal_payload()
        del payload['overview']['risks']
        del payload['steps'][0]['narrative']
        self.assert_error(payload, r'(?m)^overview\.risks:')
        self.assert_error(payload, r'(?m)^steps\[0\]\.narrative:')

    def test_rejects_a_step_with_no_files_and_a_file_with_no_hunks(self):
        no_files = minimal_payload()
        no_files['steps'][0]['files'] = []
        self.assert_error(no_files, r'steps\[0\]\.files: must be a non-empty array')

        no_hunks = minimal_payload()
        no_hunks['steps'][0]['files'][0]['hunks'] = []
        self.assert_error(no_hunks, r'steps\[0\]\.files\[0\]\.hunks: must be a non-empty array')

    def test_rejects_a_decision_without_a_reason(self):
        payload = minimal_payload()
        payload['overview']['decisions'] = [{'choice': 'c'}]
        self.assert_error(payload, r'overview\.decisions\[0\]\.reason')

    def test_rejects_an_unknown_enum_value(self):
        payload = minimal_payload()
        payload['steps'][0]['kind'] = 'not-a-real-kind'
        self.assert_error(payload, r'steps\[0\]\.kind: must be one of')

    def test_rejects_a_non_integer_hunk_line_number(self):
        for wrong in ('twelve', 1.5, True):
            payload = minimal_payload()
            payload['steps'][0]['files'][0]['hunks'][0]['new_start'] = wrong
            self.assert_error(payload, r'hunks\[0\]\.new_start: must be an integer >= 0')

    def test_rejects_a_watchpoint_without_a_positive_line_or_a_note(self):
        payload = minimal_payload()
        payload['steps'][0]['files'][0]['hunks'][0]['watchpoints'] = [{'line': 0}]
        self.assert_error(payload, r'watchpoints\[0\]\.line: must be an integer >= 1')
        self.assert_error(payload, r'watchpoints\[0\]\.note: must be a string')


if __name__ == '__main__':
    unittest.main()
