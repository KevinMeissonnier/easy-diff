"""
The report data — the analysis plus the exact per-file diffs, recomputed with `git diff` and
never taken from the model — and the static HTML/CSS/JS viewer it is embedded into.
"""

from __future__ import annotations

import json
import os
import re
import shutil
from datetime import datetime, timezone
from typing import Any, Callable, Optional, TypeVar

from . import git
from .analysis import Analysis
from .language import DEFAULT_LANGUAGE
from .paths import REPORT_TEMPLATE_DIR

ZERO_CHURN = {'add': 0, 'del': 0}

T = TypeVar('T')


def build_report_data(analysis: Analysis, base: str, cwd: str, language: str = DEFAULT_LANGUAGE) -> dict[str, Any]:
    numstat = _safe(lambda: git.diff_numstat(base, cwd), {})
    steps = []
    for step in analysis['steps']:
        files = []
        for file in step['files']:
            hunks = _pick_hunks(_safe(lambda: git.diff_for_file(base, file['path'], cwd), ''), file['hunks'])
            files.append({
                'path': file['path'],
                'change_type': file['change_type'],
                **({'why': file['why']} if 'why' in file else {}),
                'confidence': file['confidence'],
                'churn': numstat.get(file['path'], ZERO_CHURN),
                'hunks': hunks,
                'watchpoints': _flatten_watchpoints(hunks),
            })
        steps.append({
            'id': step['id'],
            'kind': step['kind'],
            'title': step['title'],
            'narrative': step['narrative'],
            'files': files,
        })
    return {
        'version': analysis['version'],
        'merge_request': analysis['merge_request'],
        'overview': analysis['overview'],
        'base': base,
        'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'meta': {
            'commits': _safe(lambda: git.commit_count(base, cwd), 0),
            'files_changed': len(numstat),
            'insertions': sum(stat['add'] for stat in numstat.values()),
            'deletions': sum(stat['del'] for stat in numstat.values()),
        },
        'steps': steps,
        # Language of the report viewer's own static UI labels.
        'language': language,
    }


def _pick_hunks(diff_text: str, requested: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Picks the hunks the model pointed to (by index into the file's actual hunks, in diff order)
    out of the file's real hunks, parsed from `git diff` ourselves. The model's line numbers are
    never trusted for content or positions; they only select which of our own parsed hunks to
    show and which of its lines carry a `watchpoint` note. If none of the model's indices land
    on a real hunk, every parsed hunk is shown instead of nothing — and, as a consequence,
    without any watchpoint attached.
    """
    parsed = _parse_diff_hunks(diff_text)
    picked = []
    for req in requested:
        index = req['index']
        if index >= len(parsed):
            continue
        hunk = parsed[index]
        # watchpoint lines are new-file line numbers (per the prompt), except for a pure-deletion
        # hunk, which has no new side at all — there, fall back to old-file line numbers.
        side = 'oldLine' if hunk['new_lines'] == 0 else 'newLine'
        notes_by_line = {wp['line']: wp['note'] for wp in req.get('watchpoints', [])}
        lines = []
        for line in hunk['lines']:
            note = notes_by_line.get(line[side]) if side in line else None
            lines.append({**line, **({'watchpoint': note} if note is not None else {})})
        label = req['label'] if 'label' in req else hunk.get('label')
        picked.append({
            **{key: hunk[key] for key in ('old_start', 'old_lines', 'new_start', 'new_lines')},
            **({'label': label} if label is not None else {}),
            **({'note': req['note']} if 'note' in req else {}),
            'lines': lines,
        })
    return picked if picked else parsed


def _flatten_watchpoints(hunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    watchpoints = []
    for hunk_index, hunk in enumerate(hunks):
        for line in hunk['lines']:
            if line.get('watchpoint'):
                number = line['newLine'] if 'newLine' in line else line['oldLine']
                watchpoints.append({'hunkIndex': hunk_index, 'line': number, 'note': line['watchpoint']})
    return watchpoints


_HUNK_HEADER = re.compile(r'^@@ -(\d+)(?:,(\d+))?\s\+(\d+)(?:,(\d+))?\s@@(.*)$')


def _parse_diff_hunks(diff_text: str) -> list[dict[str, Any]]:
    hunks: list[dict[str, Any]] = []
    current: Optional[dict[str, Any]] = None
    old_line = new_line = 0

    for raw_line in diff_text.split('\n'):
        header = _HUNK_HEADER.match(raw_line)
        if header:
            old_start, old_lines, new_start, new_lines, label = header.groups()
            current = {
                'old_start': int(old_start),
                'old_lines': int(old_lines) if old_lines is not None else 1,
                'new_start': int(new_start),
                'new_lines': int(new_lines) if new_lines is not None else 1,
                **({'label': label.strip()} if label and label.strip() else {}),
                'lines': [],
            }
            hunks.append(current)
            old_line, new_line = current['old_start'], current['new_start']
            continue
        if current is None or raw_line.startswith('\\'):
            continue  # e.g. "\ No newline at end of file"

        if raw_line.startswith('+'):
            current['lines'].append({'type': 'add', 'text': raw_line[1:], 'newLine': new_line})
            new_line += 1
        elif raw_line.startswith('-'):
            current['lines'].append({'type': 'del', 'text': raw_line[1:], 'oldLine': old_line})
            old_line += 1
        elif raw_line.startswith(' ') or raw_line == '':
            current['lines'].append({'type': 'ctx', 'text': raw_line[1:], 'oldLine': old_line, 'newLine': new_line})
            old_line += 1
            new_line += 1
    return hunks


def _safe(compute: Callable[[], T], fallback: T) -> T:
    try:
        return compute()
    except git.GitError:
        return fallback


def write_report(report_dir: str, data: dict[str, Any]) -> None:
    os.makedirs(report_dir, exist_ok=True)
    for asset in ('i18n.js', 'app.js', 'style.css'):
        shutil.copyfile(os.path.join(REPORT_TEMPLATE_DIR, asset), os.path.join(report_dir, asset))

    with open(os.path.join(REPORT_TEMPLATE_DIR, 'index.html'), encoding='utf-8') as file:
        shell = file.read()
    # Guard against the (untrusted, LLM-derived) data prematurely closing the <script> tag it's
    # embedded in.
    embedded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    html = shell.replace('/*__EASY_DIFF_DATA__*/null', embedded, 1)
    with open(os.path.join(report_dir, 'index.html'), 'w', encoding='utf-8') as file:
        file.write(html)
