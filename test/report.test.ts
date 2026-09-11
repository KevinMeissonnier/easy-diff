import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Analysis } from '../src/lib/schema.js';
import { buildReportData, writeReport } from '../src/render/report.js';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo, git } from './helpers/tmp-repo.js';

test('render pipeline: diffs come from git, not from the analysis JSON', async (t) => {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));

  writeFile(repo, 'app.py', 'def hello():\n    return "hi"\n');
  commitAll(repo, 'initial');
  git(repo, ['checkout', '-q', '-b', 'feature']);
  writeFile(repo, 'app.py', 'def hello():\n    return "hi"\n\ndef bye():\n    return "bye"\n');
  commitAll(repo, 'add bye()');

  const analysis = Analysis.parse({
    overview: { title: 'Add bye()', intent: 'i', context: 'c', summary: 's' },
    steps: [
      {
        title: 'Add bye()',
        role: 'core logic',
        explanation: 'adds a function',
        files: [{ path: 'app.py', note: 'new function' }],
      },
    ],
  });

  const data = buildReportData(analysis, 'main', repo);
  assert.equal(data.steps[0]?.files[0]?.diff.includes('+def bye()'), true);

  const reportDir = path.join(repo, 'easy-diff', 'report');
  writeReport(reportDir, data);

  assert.ok(fs.existsSync(path.join(reportDir, 'index.html')));
  assert.ok(fs.existsSync(path.join(reportDir, 'app.js')));
  assert.ok(fs.existsSync(path.join(reportDir, 'style.css')));

  const html = fs.readFileSync(path.join(reportDir, 'index.html'), 'utf8');
  assert.match(html, /Add bye\(\)/);
  assert.match(html, /def bye/);

  await t.test('an unknown/missing file degrades to an empty diff, not a crash', () => {
    const withMissingFile = Analysis.parse({
      overview: analysis.overview,
      steps: [{ ...analysis.steps[0], files: [{ path: 'does-not-exist.py' }] }],
    });
    const result = buildReportData(withMissingFile, 'main', repo);
    assert.equal(result.steps[0]?.files[0]?.diff, '');
  });
});
