"""
The plugin's `language` option (`userConfig` in `.claude-plugin/plugin.json`) drives both the
prose the agent writes and the report viewer's static labels. The prompt asks for it, but
nothing stops the model from ignoring it, so `detect_language_mismatch` checks the written
analysis before the agent's turn may end.
"""

from __future__ import annotations

import re
from typing import Optional

from .analysis import Analysis

SUPPORTED_LANGUAGES = ('en', 'fr')
DEFAULT_LANGUAGE = 'fr'

_LANGUAGE_NAMES = {'en': 'English', 'fr': 'French'}


def language_option(raw: Optional[str]) -> str:
    """
    The plugin's `language` option as the skill passes it. An option the user never set (a
    shell `claude plugin install`, `--plugin-dir`) is not replaced by its `default`: the skill
    receives the literal `${user_config.language}` placeholder, which means the default here.
    """
    if raw is not None and raw.startswith('${'):
        return DEFAULT_LANGUAGE
    return resolve_language(raw)


def resolve_language(value: Optional[str]) -> str:
    if not value:
        return DEFAULT_LANGUAGE
    normalized = value.lower()
    if normalized in SUPPORTED_LANGUAGES:
        return normalized
    raise ValueError(f"Unsupported language \"{value}\". Supported languages: {', '.join(SUPPORTED_LANGUAGES)}.")


def language_name(language: str) -> str:
    return _LANGUAGE_NAMES[language]


# Below this many stopword matches either way, there isn't enough text to judge.
_MIN_SIGNAL = 4

# Common stopwords that are essentially unambiguous to one language, avoiding words that exist
# as ordinary text in both (e.g. "a", "son", "est").
_FR_WORDS = [
    'le', 'la', 'les', 'des', 'une', 'pour', 'dans', 'avec', 'que', 'qui', 'pas', 'cette',
    'ces', 'sans', 'entre', 'donc', 'ainsi', 'lorsque', 'être', 'avoir', 'fait', 'peut',
    'doit', 'vous', 'nous', 'elle', 'ils', 'elles', 'très', 'aussi', 'alors', 'mais',
]
_EN_WORDS = [
    'the', 'of', 'and', 'for', 'in', 'with', 'that', 'which', 'not', 'this', 'these',
    'without', 'between', 'thus', 'have', 'made', 'can', 'must', 'you', 'they', 'also',
    'very', 'then', 'but',
]


def detect_language_mismatch(analysis: Analysis, expected: str) -> Optional[str]:
    """
    A stopword-frequency heuristic, not real language detection. Returns why the prose reads as
    the wrong language, or None when it matches or there's too little text to tell.
    """
    combined = '\n'.join(_collect_prose(analysis)).lower()
    fr_score = _count_matches(combined, _FR_WORDS)
    en_score = _count_matches(combined, _EN_WORDS)

    if fr_score + en_score < _MIN_SIGNAL:
        return None
    actual = 'en' if en_score > fr_score else 'fr' if fr_score > en_score else expected
    if actual == expected:
        return None
    return (
        f'expected {language_name(expected)} but the text reads as {language_name(actual)} '
        f'(fr signal: {fr_score}, en signal: {en_score})'
    )


def _collect_prose(analysis: Analysis) -> list[str]:
    """Every prose field a reviewer actually reads — not ids, paths, enums, or line numbers."""
    mr, overview = analysis['merge_request'], analysis['overview']
    texts = [mr['title'], overview['what'], overview['why'], overview['mental_model'], overview['risks']]
    for decision in overview['decisions']:
        texts += [decision['choice'], decision['reason']]
    for step in analysis['steps']:
        texts += [step['title'], step['narrative']]
        for file in step['files']:
            if file.get('why'):
                texts.append(file['why'])
            for hunk in file['hunks']:
                if hunk.get('note'):
                    texts.append(hunk['note'])
                texts += [watchpoint['note'] for watchpoint in hunk.get('watchpoints', [])]
    return texts


def _count_matches(text: str, words: list[str]) -> int:
    # Python's \b is Unicode-aware, so "être" and "très" match as whole words.
    return sum(len(re.findall(rf'\b{re.escape(word)}\b', text)) for word in words)
