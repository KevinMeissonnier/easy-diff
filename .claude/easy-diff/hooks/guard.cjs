#!/usr/bin/env node
'use strict';

/**
 * PreToolUse guard for easy-diff's headless analysis runs.
 *
 * This hook is only ever active when `easy-diff generate` passes
 * `.claude/easy-diff/settings.json` via `claude --settings` — it is NOT part of this
 * repo's default Claude Code settings and never runs during normal interactive sessions.
 *
 * It is defense-in-depth on top of the --allowedTools/--disallowedTools flags
 * `easy-diff generate` already passes: even if a diff's content tried to prompt-inject
 * the model into writing or running something it shouldn't, this hook denies it
 * deterministically, outside the model's control.
 *
 * Policy:
 *   - Write / Edit / NotebookEdit: always denied. The analysis step never needs to
 *     write anything — its structured result is captured from stdout by easy-diff
 *     itself and written to disk by our own (non-LLM) code.
 *   - Bash: allowed only for a small allowlist of read-only git plumbing commands.
 *     Chained/compound commands are rejected outright, so a disallowed command can't
 *     be smuggled in alongside an allowed one.
 */

const ALLOWED_BASH = /^git\s+(diff|log|show|blame|status|rev-parse|merge-base|branch)\b/;
const COMPOUND_COMMAND = /[;&|`]|\$\(/;

readStdin()
  .then((raw) => {
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return deny('easy-diff-guard: could not parse hook input as JSON');
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};
    const cwd = input.cwd || process.cwd();

    if (toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
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

function checkBash(command, _cwd) {
  if (!command || typeof command !== 'string') {
    return deny('easy-diff-guard: missing Bash command');
  }
  const trimmed = command.trim();
  if (COMPOUND_COMMAND.test(trimmed)) {
    return deny(`easy-diff-guard: compound/chained commands are not allowed (${trimmed})`);
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
