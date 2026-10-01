import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Language } from './config.js';
import { HOOKS_DIR, PROMPT_FILE, SCHEMA_FILE } from './paths.js';

const execFileAsync = promisify(execFile);

// --restricted/--tools were ruled out back when the prompt ran as a custom slash command:
// they made Claude Code fail to resolve it ("Unknown command: /easy-diff-report"). The
// prompt is now passed straight to -p, so that no longer applies, but it hasn't been
// re-tested — --allowedTools/--disallowedTools + --permission-mode plan is what's verified.
const ALLOWED_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Bash(git diff *)',
  'Bash(git log *)',
  'Bash(git show *)',
  'Bash(git blame *)',
  'Bash(git status)',
  'Bash(git rev-parse *)',
  'Bash(git merge-base *)',
  'Bash(git branch *)',
];

const DISALLOWED_TOOLS = ['Write', 'Edit', 'NotebookEdit'];

const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'French' };

export interface RunAnalysisOptions {
  cwd: string;
  base: string;
  language: Language;
}

export function buildPrompt(base: string, language: Language): string {
  return fs
    .readFileSync(PROMPT_FILE, 'utf8')
    .replaceAll('{{base}}', base)
    .replaceAll('{{language}}', LANGUAGE_NAMES[language]);
}

/**
 * Hook paths point into the installed package, so upgrading easy-diff upgrades them too —
 * nothing is copied into the target repo that could drift out of sync with this CLI.
 */
export function buildSettings(language: Language): string {
  const hook = (file: string, ...args: string[]) => ({
    type: 'command',
    command: ['node', JSON.stringify(path.join(HOOKS_DIR, file)), ...args].join(' '),
  });
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Write|Edit|NotebookEdit', hooks: [hook('guard.cjs')] },
        { matcher: 'Bash', hooks: [hook('guard.cjs')] },
      ],
      Stop: [{ hooks: [hook('validate-analysis.cjs'), hook('validate-language.cjs', language)] }],
    },
  });
}

/**
 * Runs the analysis headlessly, scoped to this single invocation only: `--settings` and
 * the tool flags below never touch the repo's Claude Code config, so none of this affects
 * normal interactive sessions.
 */
export async function runAnalysis(options: RunAnalysisOptions): Promise<string> {
  const { cwd, base, language } = options;
  // Both --json-schema and --settings take inline JSON; --json-schema doesn't accept a file
  // path at all — confirmed against a live `claude --help` and a real invocation.
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const args = [
    '-p',
    buildPrompt(base, language),
    '--settings',
    buildSettings(language),
    '--json-schema',
    schema,
    '--permission-mode',
    'plan',
    '--output-format',
    'json',
    '--allowedTools',
    ...ALLOWED_TOOLS,
    '--disallowedTools',
    ...DISALLOWED_TOOLS,
  ];

  try {
    const { stdout } = await execFileAsync('claude', args, {
      cwd,
      maxBuffer: 1024 * 1024 * 64,
    });
    return stdout;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      'Failed to run Claude Code headlessly. Is the `claude` CLI installed, on your PATH, ' +
        `and authenticated?\n${message}`
    );
  }
}
