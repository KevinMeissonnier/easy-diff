import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Kept in sync with templates/commands/easy-diff-report.md's own `allowed-tools`
// frontmatter — that grants the tools without prompting, this is the hard boundary.
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

export interface RunAnalysisOptions {
  cwd: string;
  base: string;
  settingsFile: string;
  schemaFile: string;
}

/**
 * Runs `/easy-diff-report <base>` headlessly, scoped to this single invocation only:
 * `--settings` and the tool flags below never touch the repo's default Claude Code
 * config, so none of this affects normal interactive sessions.
 */
export async function runAnalysis(options: RunAnalysisOptions): Promise<string> {
  const { cwd, base, settingsFile, schemaFile } = options;
  const args = [
    '-p',
    `/easy-diff-report ${base}`,
    '--settings',
    settingsFile,
    '--json-schema',
    schemaFile,
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
