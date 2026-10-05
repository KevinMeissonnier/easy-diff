#!/bin/sh
# Entry point for the /easy-diff:review skill and the plugin's hooks. Python may be missing
# altogether, which no Python code can report, so this part is POSIX sh (macOS still ships
# bash 3.2): it finds an interpreter and hands over to run.py, which checks its version.

here=$(dirname "$0")
for python in python3 python; do
  if command -v "$python" >/dev/null 2>&1; then
    exec "$python" "$here/run.py" "$@"
  fi
done

message='easy-diff needs Python >= 3.9, but no python3 was found on PATH. Install it (macOS: xcode-select --install or brew install python; Debian/Ubuntu: apt install python3) and run /easy-diff:review again.'

case "$1" in
  guard|check-analysis)
    # A plugin's hooks fire in every session: a missing Python must only stop the analyst,
    # never a normal session's tool calls.
    input=$(cat)
    case "$input" in
      *'"agent_type":"easy-diff:analyst"'* | *'"agent_type": "easy-diff:analyst"'*) ;;
      *) exit 0 ;;
    esac
    if [ "$1" = guard ]; then
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$message"
      exit 0
    fi
    case "$input" in
      *'"stop_hook_active":true'* | *'"stop_hook_active": true'*) exit 0 ;;
    esac
    echo "$message" >&2
    exit 2
    ;;
esac

echo "error: $message" >&2
exit 1
