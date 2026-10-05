from __future__ import annotations

import json
import os

from . import git
from .analysis import Analysis, validate_analysis
from .errors import EasyDiffError
from .paths import target_paths
from .report import build_report_data, write_report


def render(base: str, language: str) -> str:
    """Renders the analysis the agent wrote into the HTML report and returns its index file."""
    root = git.repo_root()
    paths = target_paths(root)

    analysis = read_analysis(paths.data_file)
    write_report(paths.report_dir, build_report_data(analysis, base, root, language))
    return os.path.join(paths.report_dir, 'index.html')


def read_analysis(file: str) -> Analysis:
    """The analysis file, parsed and validated; raises with every problem found."""
    if not os.path.exists(file):
        raise EasyDiffError(f'No analysis at {file}: the easy-diff:analyst agent did not write one.')
    try:
        with open(file, encoding='utf-8') as handle:
            value = json.load(handle)
    except ValueError as error:
        raise EasyDiffError(f'{file} is not valid JSON ({error}).') from error
    errors = validate_analysis(value)
    if errors:
        raise EasyDiffError(f'{file} is not a valid analysis:\n' + '\n'.join(f'  - {e}' for e in errors))
    return value
