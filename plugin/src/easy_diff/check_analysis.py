"""
SubagentStop hook for the easy-diff:analyst agent (hooks.json matches it by agent type).

Before the agent's turn may end, it reads the analysis file the agent was told to write and
blocks — telling the agent exactly what to fix — when the file is missing, isn't JSON, doesn't
have the analysis shape, or reads as the wrong language. That way a malformed result is
corrected in the same run instead of failing `render` afterwards, which validates again.
"""

from __future__ import annotations

import json
import os
from typing import Optional

from . import git
from .analysis import validate_analysis
from .language import DEFAULT_LANGUAGE, detect_language_mismatch, language_name, resolve_language
from .paths import target_paths

ANALYST_AGENT = 'easy-diff:analyst'


def run_check(raw_input: str, language_option: Optional[str]) -> Optional[str]:
    """Why the agent may not stop yet, or None to let it stop."""
    try:
        event = json.loads(raw_input)
    except ValueError:
        return None  # Can't tell what happened — don't block on a hook input we can't even parse.
    # Already retried once because this hook blocked; don't loop forever. `render` still refuses
    # a file that is still invalid.
    if not isinstance(event, dict) or event.get('agent_type') != ANALYST_AGENT or event.get('stop_hook_active'):
        return None

    try:
        file = target_paths(git.repo_root(event.get('cwd') or os.getcwd())).data_file
    except git.GitError:
        return None

    if not os.path.exists(file):
        return f'easy-diff-guard: no analysis was written. Write it to {file} with the Write tool.'
    try:
        with open(file, encoding='utf-8') as handle:
            value = json.load(handle)
    except ValueError as error:
        return (
            f'easy-diff-guard: {file} is not valid JSON ({error}). '
            'Write the whole file again as a single JSON object matching the required schema.'
        )

    errors = validate_analysis(value)
    if errors:
        return (
            f'easy-diff-guard: {file} does not match the required analysis format:\n'
            + '\n'.join(f'  - {e}' for e in errors)
            + '\nFix these and write the whole file again.'
        )

    expected = _option_language(language_option)
    mismatch = detect_language_mismatch(value, expected)
    if mismatch:
        return (
            f'easy-diff-guard: language mismatch — {mismatch}. Rewrite every prose field in '
            f'{language_name(expected)} and write the whole file again.'
        )
    return None


def _option_language(value: Optional[str]) -> str:
    try:
        return resolve_language(value)
    except ValueError:
        return DEFAULT_LANGUAGE
