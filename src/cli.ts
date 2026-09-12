#!/usr/bin/env node
import { Command } from 'commander';
import { init } from './commands/init.js';
import { generate } from './commands/generate.js';

const program = new Command();

program
  .name('easy-diff')
  .description(
    'Turn a git diff into a narrated, step-by-step review — as if an agent were presenting ' +
      'its own work, instead of a raw diff you have to reverse-engineer.'
  )
  .version('0.1.0');

program
  .command('init')
  .description(
    'Scaffold the Claude Code command, isolated guard settings and .gitignore entry into the current repo.'
  )
  .argument('[language]', 'report language: en or fr (default: en)')
  .option('-f, --force', 'overwrite existing scaffold files')
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
