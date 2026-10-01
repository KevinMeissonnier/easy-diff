import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { init } from '../src/commands/init.js';
import { targetPaths } from '../src/lib/paths.js';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo, git } from './helpers/tmp-repo.js';

test('init writes config-easy-diff.json and the .gitignore entries', async (t) => {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));
  writeFile(repo, 'README.md', '# test\n');
  commitAll(repo, 'initial');

  const cwd = process.cwd();
  process.chdir(repo);
  t.after(() => process.chdir(cwd));

  init();
  const paths = targetPaths(repo);
  const readConfigFile = () => JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));

  assert.deepEqual(readConfigFile(), { language: 'en', reportLanguage: 'en' });
  const gitignore = fs.readFileSync(paths.gitignoreFile, 'utf8');
  assert.match(gitignore, /^\/easy-diff\/$/m);
  assert.match(gitignore, /^\/config-easy-diff\.json$/m);
  assert.ok(!fs.existsSync(`${repo}/.claude`), 'nothing is scaffolded under .claude/ anymore');

  await t.test('the config file is gitignored', () => {
    git(repo, ['check-ignore', paths.configFile]);
  });

  await t.test('is idempotent: a second run neither overwrites the config nor duplicates entries', () => {
    fs.writeFileSync(paths.configFile, '{"language":"fr","reportLanguage":"fr"}');
    init();
    assert.deepEqual(readConfigFile(), { language: 'fr', reportLanguage: 'fr' });
    const entries = fs.readFileSync(paths.gitignoreFile, 'utf8').split('\n');
    assert.equal(entries.filter((line) => line === '/config-easy-diff.json').length, 1);
  });

  await t.test('--force overwrites the existing config', () => {
    init({ force: true });
    assert.deepEqual(readConfigFile(), { language: 'en', reportLanguage: 'en' });
  });

  await t.test('accepts an explicit supported language, case-insensitively', () => {
    init({ force: true, language: 'FR' });
    assert.deepEqual(readConfigFile(), { language: 'fr', reportLanguage: 'en' });
  });

  await t.test('rejects an unsupported language', () => {
    assert.throws(() => init({ force: true, language: 'de' }), /Unsupported language "de"/);
  });
});
