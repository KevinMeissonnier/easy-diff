import json
import os
import re
import unittest

from helpers import RepoTestCase, commit_all, git, write_file

from easy_diff.report import build_report_data, write_report


class RenderPipelineTest(RepoTestCase):
    """The diff content comes from git, not from the analysis JSON."""

    def setUp(self):
        self.repo = self.make_repo()
        write_file(self.repo, 'app.py', 'def hello():\n    return "hi"\n')
        commit_all(self.repo, 'initial')
        git(self.repo, 'checkout', '-q', '-b', 'feature')
        write_file(self.repo, 'app.py', 'def hello():\n    return "hi"\n\ndef bye():\n    return "bye"\n')
        commit_all(self.repo, 'add bye()')
        self.analysis = {
            'version': '1.0',
            'merge_request': {
                'title': 'Add bye()',
                'source_branch': 'feature',
                'target_branch': 'main',
                'base_sha': 'abc',
                'head_sha': 'def',
            },
            'overview': {
                'what': 'w',
                'why': 'y',
                'mental_model': 'm',
                'decisions': [],
                'risks': 'r',
                'estimated_reading_minutes': 1,
            },
            'steps': [{
                'id': 'add-bye',
                'kind': 'core',
                'title': 'Add bye()',
                'narrative': 'adds a function',
                'files': [{
                    'path': 'app.py',
                    'change_type': 'modified',
                    'why': 'new function',
                    'confidence': 'high',
                    'hunks': [{
                        'index': 0, 'old_start': 1, 'old_lines': 2, 'new_start': 1, 'new_lines': 5,
                        'watchpoints': [{'line': 4, 'note': 'check bye'}],
                    }],
                }],
            }],
        }

    def with_file(self, **changes):
        analysis = json.loads(json.dumps(self.analysis))
        analysis['steps'][0]['files'][0].update(changes)
        return analysis

    def test_uses_the_real_git_diff_and_writes_the_viewer(self):
        data = build_report_data(self.analysis, 'main', self.repo)
        self.assertEqual(data['language'], 'fr', 'defaults to French when not passed')
        self.assertEqual(build_report_data(self.analysis, 'main', self.repo, 'en')['language'], 'en')
        self.assertEqual(data['meta'], {'commits': 1, 'files_changed': 1, 'insertions': 3, 'deletions': 0})
        lines = data['steps'][0]['files'][0]['hunks'][0]['lines']
        self.assertTrue(any(line['type'] == 'add' and 'def bye()' in line['text'] for line in lines))
        self.assertEqual(
            data['steps'][0]['files'][0]['watchpoints'],
            [{'hunkIndex': 0, 'line': 4, 'note': 'check bye'}],
            'the watchpoint lands on the real new-file line 4',
        )

        report_dir = os.path.join(self.repo, 'easy-diff', 'report')
        write_report(report_dir, data)
        for asset in ('index.html', 'app.js', 'i18n.js', 'style.css'):
            self.assertTrue(os.path.exists(os.path.join(report_dir, asset)), asset)
        with open(os.path.join(report_dir, 'index.html'), encoding='utf-8') as file:
            html = file.read()
        self.assertIn('Add bye()', html)
        self.assertIn('def bye', html)

    def test_embeds_data_verbatim_even_with_replacement_patterns_and_script_tags(self):
        data = build_report_data(self.analysis, 'main', self.repo)
        data['overview']['what'] = 'echo "a"$\'\\n\' $& $` $$ \\1 \\g<0> </script><b>'
        report_dir = os.path.join(self.repo, 'easy-diff', 'report')
        write_report(report_dir, data)
        with open(os.path.join(report_dir, 'index.html'), encoding='utf-8') as file:
            html = file.read()
        embedded = re.search(r'window\.__EASY_DIFF__ = (.*?);</script>', html, re.S).group(1)
        self.assertNotIn('</script><b>', embedded)
        self.assertEqual(json.loads(embedded)['overview']['what'], data['overview']['what'])

    def test_an_out_of_range_hunk_index_degrades_to_showing_every_real_hunk(self):
        analysis = self.with_file(hunks=[{'index': 99, 'old_start': 1, 'old_lines': 1, 'new_start': 1, 'new_lines': 1}])
        lines = build_report_data(analysis, 'main', self.repo)['steps'][0]['files'][0]['hunks'][0]['lines']
        self.assertTrue(any('def bye()' in line['text'] for line in lines))

    def test_an_unknown_file_degrades_to_no_hunks_not_a_crash(self):
        analysis = self.with_file(path='does-not-exist.py')
        self.assertEqual(build_report_data(analysis, 'main', self.repo)['steps'][0]['files'][0]['hunks'], [])


if __name__ == '__main__':
    unittest.main()
