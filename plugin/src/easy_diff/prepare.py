from __future__ import annotations

import os
from typing import Optional

from . import git
from .errors import EasyDiffError
from .ignore_file import ensure_entries
from .paths import OUTPUT_DIR, target_paths


def prepare(language: str, requested_base: Optional[str] = None) -> str:
    """
    Everything the `/easy-diff:review` skill needs before it hands over to the analyst agent,
    printed as `key: value` lines for the skill to read. An ambiguous base is not an error: the
    skill asks the user to pick one and runs `prepare` again with it.
    """
    root = git.repo_root()
    paths = target_paths(root)

    base = requested_base
    if not base:
        detection = git.detect_base_branch(root)
        if isinstance(detection, git.NotFound):
            raise EasyDiffError(
                'Could not auto-detect a base branch (no upstream tracking branch, no remote or local '
                'branches to compare against). Pass one explicitly: /easy-diff:review <base-branch>'
            )
        if isinstance(detection, git.Ambiguous):
            return '\n'.join(
                ['status: ambiguous', 'candidates:'] + [f'  - {candidate.ref}' for candidate in detection.candidates]
            )
        base = detection.base

    branch = git.current_branch(root)
    if branch == base:
        raise EasyDiffError(f'Current branch is the same as the base branch ({base}). Nothing to review.')
    files = git.changed_files(base, root)
    if not files:
        raise EasyDiffError(f'No differences between {base} and {branch}.')

    # A leftover analysis from an earlier run would otherwise be rendered if the agent fails to
    # write a new one.
    if os.path.exists(paths.data_file):
        os.remove(paths.data_file)
    ensure_entries(git.exclude_file(root), [f'/{OUTPUT_DIR}/'])

    return '\n'.join([
        'status: ready',
        f'base: {base}',
        f'branch: {branch}',
        f'changed files: {len(files)}',
        f'analysis file: {paths.data_file}',
        f'language: {language}',
    ])
