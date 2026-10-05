/**
 * SubagentStop hook for the easy-diff:analyst agent (hooks.json matches it by agent type).
 *
 * Before the agent's turn may end, it reads the analysis file the agent was told to write
 * and blocks — telling the agent exactly what to fix — when the file is missing, isn't JSON,
 * doesn't have the analysis shape, or reads as the wrong language. That way a malformed result
 * is corrected in the same run instead of failing `render` afterwards, which validates again.
 *
 * Exit 0 lets the agent stop; exit 2 blocks, and stderr goes back to the agent.
 */
import fs from 'node:fs';
import { repoRoot } from '../src/lib/git.ts';
import { targetPaths } from '../src/lib/paths.ts';
import { validateAnalysis, type Analysis } from '../src/lib/analysis.ts';
import { detectLanguageMismatch, languageName, resolveLanguage, DEFAULT_LANGUAGE, type Language } from '../src/lib/language.ts';

const ANALYST_AGENT = 'easy-diff:analyst';

interface SubagentStopInput {
  agent_type?: string;
  stop_hook_active?: boolean;
  cwd?: string;
}

let input: SubagentStopInput;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  // Can't tell what happened — don't block on a hook input we can't even parse.
  process.exit(0);
}

// Already retried once because this hook blocked; don't loop forever. `render` still refuses
// a file that is still invalid.
if (input.agent_type !== ANALYST_AGENT || input.stop_hook_active) process.exit(0);

let file: string;
try {
  file = targetPaths(repoRoot(input.cwd ?? process.cwd())).dataFile;
} catch {
  process.exit(0);
}

if (!fs.existsSync(file)) {
  block(`easy-diff-guard: no analysis was written. Write it to ${file} with the Write tool.`);
}

let value: unknown;
try {
  value = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (error) {
  block(
    `easy-diff-guard: ${file} is not valid JSON (${error instanceof Error ? error.message : String(error)}). ` +
      'Write the whole file again as a single JSON object matching the required schema.'
  );
}

const errors = validateAnalysis(value);
if (errors.length > 0) {
  block(
    `easy-diff-guard: ${file} does not match the required analysis format:\n` +
      errors.map((e) => `  - ${e}`).join('\n') +
      '\nFix these and write the whole file again.'
  );
}

const expected = optionLanguage(process.env.CLAUDE_PLUGIN_OPTION_LANGUAGE);
const mismatch = detectLanguageMismatch(value as Analysis, expected);
if (mismatch) {
  block(
    `easy-diff-guard: language mismatch — ${mismatch}. Rewrite every prose field in ` +
      `${languageName(expected)} and write the whole file again.`
  );
}

process.exit(0);

function optionLanguage(value: string | undefined): Language {
  try {
    return resolveLanguage(value);
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function block(reason: string): never {
  process.stderr.write(reason + '\n');
  process.exit(2);
}
