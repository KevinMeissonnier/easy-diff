import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Analysis } from '../src/lib/schema.js';
import { buildReportData, writeReport } from '../src/render/report.js';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo, git } from './helpers/tmp-repo.js';

test('render pipeline: diff content comes from git, not from the analysis JSON', async (t) => {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));

  writeFile(repo, 'app.py', 'def hello():\n    return "hi"\n');
  commitAll(repo, 'initial');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(repo, 'app.py', 'def hello():\n    return "hi"\n\ndef bye():\n    return "bye"\n');
  commitAll(repo, 'add bye()');

  const analysis = Analysis.parse({
    version: '1.0',
    merge_request: {
      title: 'Add bye()',
      source_branch: 'feature',
      target_branch: 'main',
      base_sha: 'abc',
      head_sha: 'def',
    },
    overview: { what: 'w', why: 'y', risks: 'r', out_of_scope: 'o', estimated_reading_minutes: 1 },
    steps: [
      {
        id: 'add-bye',
        kind: 'core',
        title: 'Add bye()',
        role: 'core logic',
        intro: 'adds a function',
        detail: 'adds a function',
        files: [
          {
            path: 'app.py',
            change_type: 'modified',
            why: 'new function',
            confidence: 'high',
            hunks: [{ index: 0, old_start: 1, old_lines: 2, new_start: 1, new_lines: 5 }],
          },
        ],
      },
    ],
  });

  const data = buildReportData(analysis, 'main', repo);
  assert.equal(data.reportLanguage, 'en', 'defaults to English when not passed');
  assert.equal(buildReportData(analysis, 'main', repo, 'fr').reportLanguage, 'fr');
  const lines = data.steps[0]?.files[0]?.hunks[0]?.lines ?? [];
  assert.ok(
    lines.some((l) => l.type === 'add' && l.text.includes('def bye()')),
    'expected the real git diff content, not anything from the analysis JSON'
  );

  const reportDir = path.join(repo, 'easy-diff', 'report');
  writeReport(reportDir, data);

  assert.ok(fs.existsSync(path.join(reportDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(reportDir, 'app.js')));
  assert.ok(fs.existsSync(path.join(reportDir, 'i18n.js')));
  assert.ok(fs.existsSync(path.join(reportDir, 'style.css')));

  const html = fs.readFileSync(path.join(reportDir, 'index.html'), 'utf8');
  assert.match(html, /Add bye\(\)/);
  assert.match(html, /def bye/);

  await t.test('an out-of-range hunk index degrades to showing every real hunk', () => {
    const withBadIndex = Analysis.parse({
      ...analysis,
      steps: [
        {
          ...analysis.steps[0],
          files: [
            {
              ...analysis.steps[0]!.files[0]!,
              hunks: [{ index: 99, old_start: 1, old_lines: 1, new_start: 1, new_lines: 1 }],
            },
          ],
        },
      ],
    });
    const result = buildReportData(withBadIndex, 'main', repo);
    const resultLines = result.steps[0]?.files[0]?.hunks[0]?.lines ?? [];
    assert.ok(resultLines.some((l) => l.text.includes('def bye()')));
  });

  await t.test('an unknown/missing file degrades to no hunks, not a crash', () => {
    const withMissingFile = Analysis.parse({
      ...analysis,
      steps: [{ ...analysis.steps[0], files: [{ ...analysis.steps[0]!.files[0]!, path: 'does-not-exist.py' }] }],
    });
    const result = buildReportData(withMissingFile, 'main', repo);
    assert.deepEqual(result.steps[0]?.files[0]?.hunks, []);
  });
});
