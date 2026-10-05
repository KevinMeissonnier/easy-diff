"""
The analysis the `easy-diff:analyst` agent writes, and its validation. Standard library only
on purpose: the plugin runs straight from its install directory, where nothing installs
packages. Two places call `validate_analysis` — the `SubagentStop` hook, so the agent fixes a
malformed file before its turn ends, and `render`, so a file that got past it anyway is never
rendered. The model-facing JSON schema lives in `agents/analyst.md`.
"""

from __future__ import annotations

from typing import Any, Callable

STEP_KINDS = ('foundation', 'core', 'wiring', 'delicate', 'tests')
CHANGE_TYPES = ('added', 'modified', 'deleted', 'renamed')
CONFIDENCES = ('high', 'medium', 'low')

# The analysis is kept as the parsed JSON itself: a dict shaped like the schema in
# agents/analyst.md once `validate_analysis` returned no error.
Analysis = dict

Check = Callable[[str, bool, str], None]


def validate_analysis(value: Any) -> list[str]:
    """Returns one human-readable problem per entry; empty means `value` is a valid analysis."""
    errors: list[str] = []

    def at(path: str, ok: bool, message: str) -> None:
        if not ok:
            errors.append(f'{path}: {message}')

    if not isinstance(value, dict):
        return ['root: expected a JSON object']

    at('version', value.get('version') == '1.0', 'must be "1.0"')

    mr = value.get('merge_request')
    at('merge_request', isinstance(mr, dict), 'must be an object')
    if isinstance(mr, dict):
        for field in ('title', 'source_branch', 'target_branch', 'base_sha', 'head_sha'):
            at(f'merge_request.{field}', isinstance(mr.get(field), str), 'must be a string')
        at('merge_request.id', mr.get('id') is None or isinstance(mr.get('id'), str), 'must be a string or null')

    overview = value.get('overview')
    at('overview', isinstance(overview, dict), 'must be an object')
    if isinstance(overview, dict):
        for field in ('what', 'why', 'mental_model', 'risks'):
            at(f'overview.{field}', isinstance(overview.get(field), str), 'must be a string')
        decisions = overview.get('decisions')
        at('overview.decisions', isinstance(decisions, list), 'must be an array (empty if there are none)')
        if isinstance(decisions, list):
            for i, decision in enumerate(decisions):
                for field in ('choice', 'reason'):
                    at(
                        f'overview.decisions[{i}].{field}',
                        isinstance(decision, dict) and isinstance(decision.get(field), str),
                        'must be a string',
                    )
        at('overview.estimated_reading_minutes', _is_integer(overview.get('estimated_reading_minutes'), 1), 'must be an integer >= 1')

    steps = value.get('steps')
    at('steps', isinstance(steps, list) and len(steps) > 0, 'must be a non-empty array')
    if isinstance(steps, list):
        for i, step in enumerate(steps):
            _validate_step(step, f'steps[{i}]', at)

    return errors


def _validate_step(step: Any, path: str, at: Check) -> None:
    at(path, isinstance(step, dict), 'must be an object')
    if not isinstance(step, dict):
        return

    for field in ('id', 'title', 'narrative'):
        at(f'{path}.{field}', isinstance(step.get(field), str), 'must be a string')
    at(f'{path}.kind', step.get('kind') in STEP_KINDS, f"must be one of {', '.join(STEP_KINDS)}")

    files = step.get('files')
    at(f'{path}.files', isinstance(files, list) and len(files) > 0, 'must be a non-empty array')
    if isinstance(files, list):
        for i, file in enumerate(files):
            _validate_file(file, f'{path}.files[{i}]', at)


def _validate_file(file: Any, path: str, at: Check) -> None:
    at(path, isinstance(file, dict), 'must be an object')
    if not isinstance(file, dict):
        return

    at(f'{path}.path', isinstance(file.get('path'), str), 'must be a string')
    at(f'{path}.change_type', file.get('change_type') in CHANGE_TYPES, f"must be one of {', '.join(CHANGE_TYPES)}")
    at(f'{path}.why', 'why' not in file or isinstance(file['why'], str), 'must be a string if present')
    at(f'{path}.confidence', file.get('confidence') in CONFIDENCES, f"must be one of {', '.join(CONFIDENCES)}")

    hunks = file.get('hunks')
    at(f'{path}.hunks', isinstance(hunks, list) and len(hunks) > 0, 'must be a non-empty array')
    if isinstance(hunks, list):
        for i, hunk in enumerate(hunks):
            _validate_hunk(hunk, f'{path}.hunks[{i}]', at)


def _validate_hunk(hunk: Any, path: str, at: Check) -> None:
    at(path, isinstance(hunk, dict), 'must be an object')
    if not isinstance(hunk, dict):
        return

    for field in ('index', 'old_start', 'old_lines', 'new_start', 'new_lines'):
        at(f'{path}.{field}', _is_integer(hunk.get(field), 0), 'must be an integer >= 0')
    for field in ('label', 'note'):
        at(f'{path}.{field}', field not in hunk or isinstance(hunk[field], str), 'must be a string if present')

    if 'watchpoints' not in hunk:
        return
    watchpoints = hunk['watchpoints']
    at(f'{path}.watchpoints', isinstance(watchpoints, list), 'must be an array if present')
    if not isinstance(watchpoints, list):
        return
    for i, watchpoint in enumerate(watchpoints):
        wp = f'{path}.watchpoints[{i}]'
        at(f'{wp}.line', isinstance(watchpoint, dict) and _is_integer(watchpoint.get('line'), 1), 'must be an integer >= 1')
        at(f'{wp}.note', isinstance(watchpoint, dict) and isinstance(watchpoint.get('note'), str), 'must be a string')


def _is_integer(value: Any, minimum: int) -> bool:
    # bool is an int subclass in Python, but `true` is not a line number in JSON.
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum
