#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { init } from './commands/init.js';
import { generate } from './commands/generate.js';
import { PACKAGE_ROOT } from './lib/paths.js';

const { version } = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));

const program = new Command();

program
  .name('easy-diff')
  .description(
    'Turn a git diff into a narrated, step-by-step review — as if an agent were presenting ' +
      'its own work, instead of a raw diff you have to reverse-engineer.'
  )
  .version(version);

program
  .command('init')
  .description(
    'Write config-easy-diff.json (report languages) and the .gitignore entries into the current repo.'
  )
  .argument('[language]', 'report language: en or fr (default: en)')
  .option('-f, --force', 'overwrite an existing config-easy-diff.json')
  .action((language: string | undefined, opts: { force?: boolean }) => {
    try {
      init({ force: opts.force, language });
    } catch (error) {
      fail(error);
    }
  });

program
  .command('generate')
  .description('Analyze the current branch against its base and generate the HTML report.')
  .argument('[base]', 'base branch to diff against (auto-detected if omitted)')
  .action(async (base: string | undefined) => {
    try {
      await generate({ base });
    } catch (error) {
      fail(error);
    }
  });

program.parseAsync(process.argv);

function fail(error: unknown): never {
  console.error(`\nerror: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
