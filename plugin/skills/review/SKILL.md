---
description: Turn the current branch's diff into a narrated, step-by-step review report — intent and overview first, then the change walked through in reading order — rendered as a static HTML page.
argument-hint: "[base-branch]"
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/src/easy-diff.sh" *)
---

# easy-diff review

The branch to review, as checked by easy-diff:

!`sh "${CLAUDE_PLUGIN_ROOT}/src/easy-diff.sh" prepare '${user_config.language}' $ARGUMENTS`

Produce the review report by following these steps in order. The analysis and the report are
files that easy-diff's own code validates and renders: never write, edit or fix them yourself.

1. If the status above is `ambiguous`, ask the user which of the candidates is the base
   branch, then run `sh "${CLAUDE_PLUGIN_ROOT}/src/easy-diff.sh" prepare '${user_config.language}' <chosen-base>`
   and use its output from here on.
2. Launch the `easy-diff:analyst` agent in the foreground and wait for it to finish, with
   exactly this prompt, filled in from the `base`, `analysis file` and `language` values above:
   `Base branch: <base>. Analysis file: <analysis file>. Language: <language>.`
3. Run `sh "${CLAUDE_PLUGIN_ROOT}/src/easy-diff.sh" render <base> <language>`. If it
   fails, show the user its error as it is and stop there.
4. Tell the user where the report is (the path `render` printed) and offer to open it in their
   browser. If they accept, run `sh "${CLAUDE_PLUGIN_ROOT}/src/easy-diff.sh" open <that path>`.
