import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPrompt, buildSettings } from '../src/lib/claude-runner.js';
import { HOOKS_DIR } from '../src/lib/paths.js';

test('buildPrompt fills in the base branch and the prose language', () => {
  const prompt = buildPrompt('origin/alpha', 'fr');
  assert.match(prompt, /Base branch: `origin\/alpha`/);
  assert.match(prompt, /Write every prose field below in French/);
  assert.doesNotMatch(prompt, /\{\{\w+\}\}/, 'no placeholder left unfilled');
  assert.doesNotMatch(prompt, /^---/, 'no slash-command frontmatter');
});

test('buildSettings points every hook at a file shipped in the package', () => {
  const settings = JSON.parse(buildSettings('fr'));
  const commands: string[] = [
    ...settings.hooks.PreToolUse.flatMap((m: { hooks: { command: string }[] }) => m.hooks),
    ...settings.hooks.Stop.flatMap((m: { hooks: { command: string }[] }) => m.hooks),
  ].map((h: { command: string }) => h.command);

  assert.equal(commands.length, 4);
  for (const command of commands) {
    const file = JSON.parse(command.match(/^node (".*?")/)![1]!);
    assert.ok(file.startsWith(HOOKS_DIR), `${file} should live in the package`);
    assert.ok(fs.existsSync(file), `${file} should exist`);
  }
  assert.ok(commands.some((c) => /validate-language\.cjs" fr$/.test(c)), 'language hook receives the language');
});
