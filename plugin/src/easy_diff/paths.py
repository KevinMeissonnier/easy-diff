from __future__ import annotations

import os
from dataclasses import dataclass

# This file lives in src/easy_diff/ under the plugin root and runs from there as is: nothing
# is built or packaged. Moving it means revisiting this arithmetic.
PLUGIN_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORT_TEMPLATE_DIR = os.path.join(PLUGIN_ROOT, 'templates', 'report')

# Relative to the target repo root. Kept out of git through `.git/info/exclude`.
OUTPUT_DIR = 'easy-diff'


@dataclass
class TargetPaths:
    repo_root: str
    output_dir: str
    # Written by the `easy-diff:analyst` agent — the only file it may write.
    data_file: str
    report_dir: str


def target_paths(repo_root: str) -> TargetPaths:
    return TargetPaths(
        repo_root=repo_root,
        output_dir=os.path.join(repo_root, OUTPUT_DIR),
        data_file=os.path.join(repo_root, OUTPUT_DIR, 'data', 'analysis.json'),
        report_dir=os.path.join(repo_root, OUTPUT_DIR, 'report'),
    )
