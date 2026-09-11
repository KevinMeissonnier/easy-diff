import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { init } from '../src/commands/init.js';
import { targetPaths } from '../src/lib/paths.js';
import { makeTmpRepo, writeFile, commitAll, removeTmpRepo } from './helpers/tmp-repo.js';

test('init scaffolds the command, guard config and .gitignore entry', async (t) => {
  const repo = makeTmpRepo();
  t.after(() => removeTmpRepo(repo));
  writeFile(repo, 'README.md', '# test\n');
  commitAll(repo, 'initial');

  const cwd = process.cwd();
  process.chdir(repo);
  t.after(() => process.chdir(cwd));

  init();
  const paths = targetPaths(repo);

  for (const file of [paths.commandFile, paths.settingsFile, paths.hookFile, paths.schemaFile]) {
    assert.ok(fs.existsSync(file), `expected ${file} to exist`);
  }
  assert.match(fs.readFileSync(paths.gitignoreFile, 'utf8'), /^easy-diff\/$/m);

  await t.test('is idempotent: a second run does not overwrite without --force', () => {
    fs.writeFileSync(paths.settingsFile, '{"custom":true}');
    init();
    assert.equal(fs.readFileSync(paths.settingsFile, 'utf8'), '{"custom":true}');
  });

  await t.test('--force overwrites existing scaffold files', () => {
    init({ force: true });
    assert.notEqual(fs.readFileSync(paths.settingsFile, 'utf8'), '{"custom":true}');
  });
});
