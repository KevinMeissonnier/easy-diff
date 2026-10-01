import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readConfig } from '../src/lib/config.js';

function tmpConfigFile(content: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-diff-config-test-'));
  const file = path.join(dir, 'config-easy-diff.json');
  if (content !== null) fs.writeFileSync(file, content);
  return file;
}

test('readConfig', async (t) => {
  await t.test('reads the language', () => {
    assert.deepEqual(readConfig(tmpConfigFile('{"language":"en"}')), { language: 'en' });
  });

  await t.test('defaults to fr when the language is unsupported', () => {
    assert.deepEqual(readConfig(tmpConfigFile('{"language":"de"}')), { language: 'fr' });
  });

  await t.test('defaults to fr when the file is missing', () => {
    assert.deepEqual(readConfig(tmpConfigFile(null)), { language: 'fr' });
  });

  await t.test('defaults to fr when the file is malformed JSON', () => {
    assert.deepEqual(readConfig(tmpConfigFile('not json')), { language: 'fr' });
  });
});
