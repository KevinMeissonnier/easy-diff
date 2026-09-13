import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReportLanguage } from '../src/lib/config.js';

function tmpConfigFile(content: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-diff-config-test-'));
  const file = path.join(dir, 'config.json');
  if (content !== null) fs.writeFileSync(file, content);
  return file;
}

test('readReportLanguage', async (t) => {
  await t.test('reads a valid reportLanguage', () => {
    assert.equal(readReportLanguage(tmpConfigFile('{"reportLanguage":"fr"}')), 'fr');
  });

  await t.test('defaults to en when the field is missing', () => {
    assert.equal(readReportLanguage(tmpConfigFile('{"language":"fr"}')), 'en');
  });

  await t.test('defaults to en when the value is unsupported', () => {
    assert.equal(readReportLanguage(tmpConfigFile('{"reportLanguage":"de"}')), 'en');
  });

  await t.test('defaults to en when the file is missing', () => {
    assert.equal(readReportLanguage(tmpConfigFile(null)), 'en');
  });

  await t.test('defaults to en when the file is malformed JSON', () => {
    assert.equal(readReportLanguage(tmpConfigFile('not json')), 'en');
  });
});
