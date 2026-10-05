import { prepare } from './commands/prepare.ts';
import { render } from './commands/render.ts';
import { openInDefaultApp } from './lib/open.ts';
import { languageOption, resolveLanguage } from './lib/language.ts';

// Called by the /easy-diff:review skill only, never typed by a person, hence no argument
// parser: `prepare <language option> [base]`, `render <base> <language>`, `open <file>`.
const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'prepare':
      console.log(prepare(languageOption(args[0]), args[1]));
      break;
    case 'render':
      if (!args[0] || !args[1]) throw new Error('usage: render <base> <language>');
      console.log(`Report ready: ${render(args[0], resolveLanguage(args[1]))}`);
      break;
    case 'open':
      if (!args[0]) throw new Error('usage: open <file>');
      await openInDefaultApp(args[0]);
      break;
    default:
      throw new Error(`unknown command "${command ?? ''}" (expected prepare, render or open)`);
  }
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
