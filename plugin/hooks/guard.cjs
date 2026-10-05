#!/usr/bin/env node
'use strict';

/**
 * PreToolUse guard for the easy-diff:analyst agent.
 *
 * A plugin's hooks fire in every session the plugin is enabled in, so this one only rules on
 * tool calls the analyst makes (identified by `agent_type`) and stays silent on everything
 * else — it must never get in the way of a normal session.
 *
 * It is defense-in-depth on top of the agent's own `tools` list (agents/analyst.md): even if
 * a diff's content tried to prompt-inject the model into writing or running something it
 * shouldn't, this hook denies it deterministically, outside the model's control.
 *
 * Policy, for the analyst only:
 *   - Write: allowed for exactly one file, `easy-diff/data/analysis.json` at the repo root —
 *     the analysis itself, which our own (non-LLM) code then validates and renders.
 *   - Edit / NotebookEdit: always denied.
 *   - Bash: allowed only for a small allowlist of read-only git plumbing commands.
 *     Chained/compound commands, redirections and multi-line commands are rejected outright,
 *     so a disallowed command can't be smuggled in alongside an allowed one, and neither can
 *     `--output`, which makes diff/log/show/blame write a file.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ANALYST_AGENT = 'easy-diff:analyst';
const ANALYSIS_FILE = path.join('easy-diff', 'data', 'analysis.json');
const ALLOWED_BASH = /^git\s+(diff|log|show|blame|status|rev-parse|merge-base)\b/;
const COMPOUND_COMMAND = /[;&|`<>\n\r]|\$\(/;
// Any spelling of `--output`, abbreviations included in case a git version accepts them.
const WRITES_A_FILE = /(^|\s)--out/;

readStdin()
  .then((raw) => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return deny('easy-diff-guard: could not parse hook input as JSON');
    }

    if (input.agent_type !== ANALYST_AGENT) {
      return process.exit(0);
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};
    const cwd = input.cwd || process.cwd();

    if (toolName === 'Write') {
      return checkWrite(toolInput.file_path, cwd);
    }

    if (toolName === 'Edit' || toolName === 'NotebookEdit') {
      return deny(
        `easy-diff-guard: ${toolName} is never permitted during easy-diff analysis (path: ${toolInput.file_path || toolInput.notebook_path || 'unknown'})`
      );
    }

    if (toolName === 'Bash') {
      return checkBash(toolInput.command, cwd);
    }

    // The hook is only wired up for Write|Edit|NotebookEdit and Bash matchers; if it
    // somehow runs for anything else, fail closed rather than silently allowing it.
    return deny(`easy-diff-guard: tool "${toolName}" is not permitted during easy-diff analysis`);
  })
  .catch((err) => {
    deny(`easy-diff-guard: internal error (${err && err.message})`);
  });

function checkWrite(filePath, cwd) {
  if (!filePath || typeof filePath !== 'string') {
    return deny('easy-diff-guard: missing Write file_path');
  }
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return deny(`easy-diff-guard: cannot locate the repository to check the Write path (${filePath})`);
  }
  const allowed = path.join(root, ANALYSIS_FILE);
  // git prints the root with symlinks resolved; resolve cwd the same way so a relative path
  // from a symlinked working directory still names the same file.
  if (path.resolve(fs.realpathSync(cwd), filePath) === allowed) {
    return allow();
  }
  return deny(`easy-diff-guard: the only file easy-diff analysis may write is ${allowed} (got: ${filePath})`);
}

function checkBash(command, _cwd) {
  if (!command || typeof command !== 'string') {
    return deny('easy-diff-guard: missing Bash command');
  }
  const trimmed = command.trim();
  if (COMPOUND_COMMAND.test(trimmed)) {
    return deny(`easy-diff-guard: compound/chained commands are not allowed (${trimmed})`);
  }
  if (WRITES_A_FILE.test(trimmed)) {
    return deny(`easy-diff-guard: --output is not allowed, it writes a file (${trimmed})`);
  }
  if (ALLOWED_BASH.test(trimmed)) {
    return allow();
  }
  return deny(`easy-diff-guard: command not permitted during easy-diff analysis: ${trimmed}`);
}

function allow() {
  output({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  });
}

function deny(reason) {
  output({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}

function output(payload) {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}
