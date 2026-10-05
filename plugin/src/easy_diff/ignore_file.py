from __future__ import annotations

import os


def ensure_entries(ignore_path: str, entries: list[str]) -> list[str]:
    """Appends the entries missing from a gitignore-format file; returns the ones it added."""
    existing = ''
    if os.path.exists(ignore_path):
        with open(ignore_path, encoding='utf-8') as file:
            existing = file.read()
    present = {line.strip() for line in existing.split('\n')}
    missing = [entry for entry in entries if entry not in present]
    if not missing:
        return []

    separator = '' if existing == '' or existing.endswith('\n') else '\n'
    block = separator + '\n# easy-diff\n' + '\n'.join(missing) + '\n'
    os.makedirs(os.path.dirname(ignore_path), exist_ok=True)
    with open(ignore_path, 'w', encoding='utf-8') as file:
        file.write(existing + block)
    return missing
