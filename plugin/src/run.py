# -*- coding: utf-8 -*-
# Entry point behind easy-diff.sh. It must still parse and run on a Python too old for the
# plugin (even Python 2) so it can say so: no f-strings, no annotations, nothing newer than
# what both understand. Everything else lives in the easy_diff package.
import json
import os
import sys

REQUIRED = (3, 9)
HOOKS = ('guard', 'check-analysis')
ANALYST_AGENT = 'easy-diff:analyst'


def main():
    if sys.version_info >= REQUIRED:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from easy_diff.cli import main as run
        return run(sys.argv[1:])

    message = (
        'easy-diff needs Python >= %d.%d, but %s is %d.%d. Install a newer python3 '
        '(macOS: xcode-select --install or brew install python; Debian/Ubuntu: apt install python3) '
        'and run /easy-diff:review again.'
        % (REQUIRED[0], REQUIRED[1], sys.executable, sys.version_info[0], sys.version_info[1])
    )
    command = sys.argv[1] if len(sys.argv) > 1 else ''
    if command in HOOKS:
        return refuse_hook(command, message)
    sys.stderr.write('error: ' + message + '\n')
    return 1


def refuse_hook(command, message):
    # A plugin's hooks fire in every session: an outdated Python must only stop the analyst,
    # never a normal session's tool calls.
    try:
        event = json.load(sys.stdin)
    except ValueError:
        event = {}
    if not isinstance(event, dict) or event.get('agent_type') != ANALYST_AGENT:
        return 0
    if command == 'guard':
        sys.stdout.write(json.dumps({'hookSpecificOutput': {
            'hookEventName': 'PreToolUse',
            'permissionDecision': 'deny',
            'permissionDecisionReason': message,
        }}))
        return 0
    if event.get('stop_hook_active'):
        return 0
    sys.stderr.write(message + '\n')
    return 2


if __name__ == '__main__':
    sys.exit(main())
