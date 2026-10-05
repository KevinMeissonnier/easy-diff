from __future__ import annotations

import json
import os
import sys

from .check_analysis import run_check
from .errors import EasyDiffError
from .guard import run_guard
from .language import language_option, resolve_language
from .opener import open_in_default_app
from .prepare import prepare
from .render import render

USAGE = (
    'usage: prepare <language option> [base] | render <base> <language> | open <file> '
    '| guard | check-analysis'
)


def main(argv: list[str]) -> int:
    """
    Called by the /easy-diff:review skill and the hooks only, never typed by a person, hence no
    argument parser. Hooks read their event on stdin; a blocking SubagentStop exits 2 with the
    reason on stderr, which goes back to the agent.
    """
    command, args = (argv[0], argv[1:]) if argv else ('', [])
    try:
        if command == 'prepare':
            print(prepare(language_option(_arg(args, 0)), _arg(args, 1)))
        elif command == 'render':
            if len(args) < 2:
                raise EasyDiffError('usage: render <base> <language>')
            print(f'Report ready: {render(args[0], resolve_language(args[1]))}')
        elif command == 'open':
            if not args:
                raise EasyDiffError('usage: open <file>')
            open_in_default_app(args[0])
        elif command == 'guard':
            decision = run_guard(sys.stdin.read())
            if decision is not None:
                print(json.dumps(decision))
        elif command == 'check-analysis':
            reason = run_check(sys.stdin.read(), os.environ.get('CLAUDE_PLUGIN_OPTION_LANGUAGE'))
            if reason is not None:
                print(reason, file=sys.stderr)
                return 2
        else:
            raise EasyDiffError(f'unknown command "{command}" ({USAGE})')
    except (EasyDiffError, ValueError) as error:
        print(f'error: {error}', file=sys.stderr)
        return 1
    return 0


def _arg(args: list[str], index: int):
    return args[index] if index < len(args) else None
