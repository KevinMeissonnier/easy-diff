"""
PreToolUse guard for the easy-diff:analyst agent.

A plugin's hooks fire in every session the plugin is enabled in, so this one only rules on tool
calls the analyst makes (identified by `agent_type`) and stays silent on everything else — it
must never get in the way of a normal session.

It is defense-in-depth on top of the agent's own `tools` list (agents/analyst.md): even if a
diff's content tried to prompt-inject the model into writing or running something it
shouldn't, this hook denies it deterministically, outside the model's control.

Policy, for the analyst only:
  - Write: allowed for exactly one file, `easy-diff/data/analysis.json` at the repo root — the
    analysis itself, which our own (non-LLM) code then validates and renders.
  - Edit / NotebookEdit: always denied.
  - Bash: allowed only for a small allowlist of read-only git plumbing commands. Chained/compound
    commands, redirections and multi-line commands are rejected outright, so a disallowed
    command can't be smuggled in alongside an allowed one, and neither can `--output`, which
    makes diff/log/show/blame write a file.
  - Anything else: denied (fail closed).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Optional

from . import git

ANALYST_AGENT = 'easy-diff:analyst'
ANALYSIS_FILE = os.path.join('easy-diff', 'data', 'analysis.json')
ALLOWED_BASH = re.compile(r'^git\s+(diff|log|show|blame|status|rev-parse|merge-base)\b')
COMPOUND_COMMAND = re.compile(r'[;&|`<>\n\r]|\$\(')
# Any spelling of `--output`, abbreviations included in case a git version accepts them.
WRITES_A_FILE = re.compile(r'(^|\s)--out')


def run_guard(raw_input: str) -> Optional[dict[str, Any]]:
    """The hook's JSON output for this tool call, or None to stay silent."""
    try:
        event = json.loads(raw_input)
    except ValueError:
        return deny('easy-diff-guard: could not parse hook input as JSON')
    if not isinstance(event, dict):
        return deny('easy-diff-guard: unexpected hook input')
    if event.get('agent_type') != ANALYST_AGENT:
        return None
    try:
        return decide(event)
    except Exception as error:  # fail closed on anything this code didn't anticipate
        return deny(f'easy-diff-guard: internal error ({error})')


def decide(event: dict[str, Any]) -> dict[str, Any]:
    tool_name = event.get('tool_name')
    tool_input = event.get('tool_input') or {}
    cwd = event.get('cwd') or os.getcwd()

    if tool_name == 'Write':
        return _check_write(tool_input.get('file_path'), cwd)
    if tool_name in ('Edit', 'NotebookEdit'):
        target = tool_input.get('file_path') or tool_input.get('notebook_path') or 'unknown'
        return deny(f'easy-diff-guard: {tool_name} is never permitted during easy-diff analysis (path: {target})')
    if tool_name == 'Bash':
        return _check_bash(tool_input.get('command'))
    # The hook is only wired up for Write|Edit|NotebookEdit and Bash matchers; if it somehow
    # runs for anything else, fail closed rather than silently allowing it.
    return deny(f'easy-diff-guard: tool "{tool_name}" is not permitted during easy-diff analysis')


def _check_write(file_path: Any, cwd: str) -> dict[str, Any]:
    if not isinstance(file_path, str) or not file_path:
        return deny('easy-diff-guard: missing Write file_path')
    try:
        root = git.repo_root(cwd)
    except git.GitError:
        return deny(f'easy-diff-guard: cannot locate the repository to check the Write path ({file_path})')
    allowed = os.path.join(root, ANALYSIS_FILE)
    # git prints the root with symlinks resolved; resolve cwd the same way so a relative path
    # from a symlinked working directory still names the same file.
    if os.path.normpath(os.path.join(os.path.realpath(cwd), file_path)) == allowed:
        return allow()
    return deny(f'easy-diff-guard: the only file easy-diff analysis may write is {allowed} (got: {file_path})')


def _check_bash(command: Any) -> dict[str, Any]:
    if not isinstance(command, str) or not command:
        return deny('easy-diff-guard: missing Bash command')
    trimmed = command.strip()
    if COMPOUND_COMMAND.search(trimmed):
        return deny(f'easy-diff-guard: compound/chained commands are not allowed ({trimmed})')
    if WRITES_A_FILE.search(trimmed):
        return deny(f'easy-diff-guard: --output is not allowed, it writes a file ({trimmed})')
    if ALLOWED_BASH.match(trimmed):
        return allow()
    return deny(f'easy-diff-guard: command not permitted during easy-diff analysis: {trimmed}')


def allow() -> dict[str, Any]:
    return {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'allow'}}


def deny(reason: str) -> dict[str, Any]:
    return {
        'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason': reason,
        }
    }
