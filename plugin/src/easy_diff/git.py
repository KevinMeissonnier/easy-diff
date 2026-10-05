from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from typing import Optional, Union

from .errors import EasyDiffError


class GitError(EasyDiffError):
    pass


def run(args: list[str], cwd: str) -> str:
    result = subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise GitError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def repo_root(cwd: Optional[str] = None) -> str:
    try:
        return run(['rev-parse', '--show-toplevel'], cwd or os.getcwd())
    except (GitError, OSError) as error:
        raise GitError('Not inside a git repository.') from error


def exclude_file(cwd: str) -> str:
    """The repo's local, never-committed ignore file (worktree-aware)."""
    return os.path.normpath(os.path.join(cwd, run(['rev-parse', '--git-path', 'info/exclude'], cwd)))


def current_branch(cwd: str) -> str:
    return run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)


CANDIDATE_BASES = ['main', 'master', 'develop']


@dataclass
class BaseCandidate:
    # A ref usable directly in `git diff <ref>...HEAD` (e.g. "origin/6.4" or "main").
    ref: str
    # Commits unique to HEAD since its merge-base with this ref — lower means "closer fork point".
    ahead_count: int


@dataclass
class Found:
    base: str


@dataclass
class Ambiguous:
    candidates: list[BaseCandidate]


@dataclass
class NotFound:
    pass


BaseDetection = Union[Found, Ambiguous, NotFound]


def _ref_short_names(pattern: str, cwd: str) -> list[str]:
    out = run(['for-each-ref', '--format=%(refname:short)', pattern], cwd)
    return [line for line in out.split('\n') if line]


def _candidate_base_refs(cwd: str) -> list[str]:
    # refs/remotes/origin/HEAD is a symbolic ref; git's `refname:short` quirkily renders it as
    # just "origin" (not "origin/HEAD"), so both forms need excluding.
    remote = [ref for ref in _ref_short_names('refs/remotes/origin', cwd) if ref not in ('origin', 'origin/HEAD')]
    return remote if remote else _ref_short_names('refs/heads', cwd)


def rank_base_candidates(cwd: str) -> list[BaseCandidate]:
    """
    Ranks branches by how closely HEAD forked from them: for each candidate, the number of
    commits reachable from HEAD but not from their merge-base. Git has no notion of "which
    branch this one was forked from" — this is the closest deducible approximation, and it's
    name-agnostic (works for `main`/`master` as well as versioned branches like `6.4`).
    """
    try:
        head = run(['rev-parse', 'HEAD'], cwd)
    except GitError:
        return []  # unborn branch, no commits yet
    branch = current_branch(cwd)
    candidates: list[BaseCandidate] = []
    for ref in _candidate_base_refs(cwd):
        short_name = ref[len('origin/'):] if ref.startswith('origin/') else ref
        if short_name == branch:
            continue  # this branch's own (remote-tracking) mirror, not a base
        try:
            if run(['rev-parse', ref], cwd) == head:
                continue  # identical history, not a base
            merge_base_sha = run(['merge-base', ref, 'HEAD'], cwd)
            ahead_count = int(run(['rev-list', '--count', f'{merge_base_sha}..HEAD'], cwd))
            candidates.append(BaseCandidate(ref, ahead_count))
        except GitError:
            continue  # unrelated history or unresolvable ref — skip
    return sorted(candidates, key=lambda candidate: candidate.ahead_count)


def detect_base_branch(cwd: str) -> BaseDetection:
    """
    Determines the base branch to diff HEAD against, in order of confidence:
    1. The configured upstream tracking branch (`@{upstream}`), if it differs from HEAD.
    2. The branch HEAD most likely forked from, by merge-base proximity (see rank_base_candidates).
    3. The legacy fallback: `origin/HEAD`, then the first of main/master/develop that exists.
    """
    try:
        upstream = run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd)
        if run(['rev-parse', upstream], cwd) != run(['rev-parse', 'HEAD'], cwd):
            return Found(upstream)
    except GitError:
        pass  # No upstream configured, or it's unresolvable — fall through to merge-base ranking.

    ranked = rank_base_candidates(cwd)
    if ranked:
        best_score = ranked[0].ahead_count
        tied = [candidate for candidate in ranked if candidate.ahead_count == best_score]
        return Found(tied[0].ref) if len(tied) == 1 else Ambiguous(tied)

    try:
        ref = run(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd)
        name = ref.replace('refs/remotes/origin/', '')
        if name:
            return Found(name)
    except GitError:
        pass  # No tracked remote HEAD — fall through to local candidates.
    for candidate in CANDIDATE_BASES:
        try:
            run(['rev-parse', '--verify', candidate], cwd)
            return Found(candidate)
        except GitError:
            continue
    return NotFound()


def changed_files(base: str, cwd: str) -> list[str]:
    out = run(['diff', '--name-only', f'{base}...HEAD'], cwd)
    return [line for line in out.split('\n') if line]


def diff_for_file(base: str, file: str, cwd: str) -> str:
    return run(['diff', f'{base}...HEAD', '--', file], cwd)


def merge_base(base: str, cwd: str) -> str:
    return run(['merge-base', base, 'HEAD'], cwd)


def commit_count(base: str, cwd: str) -> int:
    out = run(['rev-list', '--count', f'{merge_base(base, cwd)}..HEAD'], cwd)
    try:
        return int(out)
    except ValueError:
        return 0


def diff_numstat(base: str, cwd: str) -> dict[str, dict[str, int]]:
    out = run(['diff', '--numstat', f'{base}...HEAD'], cwd)
    stats: dict[str, dict[str, int]] = {}
    for line in out.split('\n') if out else []:
        add, delete, *path_parts = line.split('\t')
        file_path = '\t'.join(path_parts)  # paths essentially never contain tabs
        if not file_path:
            continue
        # Binary files report "-" instead of counts.
        stats[file_path] = {'add': _count(add), 'del': _count(delete)}
    return stats


def _count(value: str) -> int:
    return int(value) if value.isdigit() else 0
