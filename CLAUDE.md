# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Code comments

Do not narrate the code.

Prefer self-explanatory code, clear naming, and small functions over comments.

Only add a comment when it explains information that cannot reasonably be inferred from the
code itself, such as:
- why a non-obvious decision was made
- a business constraint
- an external system limitation
- a workaround
- a surprising invariant or edge case

Never add comments that describe what the following line or block does.
When in doubt, do not add a comment.

**IMPORTANT:** Comments that merely restate the code are considered a code quality defect and
must not be introduced.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

Source: [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md)

---

# easy-diff

Claude Code plugin that turns a git diff into a narrated review (overview + commented steps),
instead of a raw diff to reverse-engineer.

## Structure

The repository root is a plugin marketplace (`.claude-plugin/marketplace.json`) plus the
development tooling (`test/`, and `package.json` for the viewer's Tailwind build only). The
plugin itself is `plugin/`, the only directory a user's Claude Code copies on install.

- `plugin/skills/review/SKILL.md` — `/easy-diff:review [base]`, run in the user's session. Its
  `!` injection runs `prepare` before the model reads it, then it launches the analyst agent,
  runs `render` and offers `open` — all through `plugin/src/easy-diff.sh`.
- `plugin/agents/analyst.md` — the `easy-diff:analyst` subagent: the analysis prompt, plus the
  JSON schema the model must follow (there is no `--json-schema` for a subagent). It writes
  `easy-diff/data/analysis.json` and nothing else.
- `plugin/hooks/hooks.json` — `easy-diff.sh guard` on `PreToolUse` and `easy-diff.sh
  check-analysis` on `SubagentStop`, both scoped to the analyst.
- `plugin/src/easy-diff.sh` — the single entry point of the skill and the hooks. POSIX `sh`
  (macOS still ships bash 3.2): it finds `python3` (or `python`) and execs `run.py`; with no
  Python at all, it says so — and, for a hook, stops only the analyst.
- `plugin/src/run.py` — checks the interpreter is Python >= 3.9 before importing anything else,
  in syntax old enough that even Python 2 parses it, so an outdated Python gets a message, not
  a `SyntaxError`. Then hands over to `easy_diff.cli`.
- `plugin/src/easy_diff/cli.py` — `prepare <language option> [base]`, `render <base>
  <language>`, `open <file>`, `guard`, `check-analysis`; called by the skill and the hooks only,
  so no argument parser.
- `plugin/src/easy_diff/prepare.py` — detects/checks the base, deletes a stale analysis, keeps
  `easy-diff/` out of git through `.git/info/exclude`, prints `key: value` lines for the skill.
- `plugin/src/easy_diff/render.py` — validates the analysis and triggers the HTML render.
- `plugin/src/easy_diff/guard.py`, `check_analysis.py` — the two hooks' logic.
- `plugin/src/easy_diff/analysis.py` — `validate_analysis`, shared by the `SubagentStop` hook
  and `render`.
- `plugin/src/easy_diff/language.py` — the supported languages and the FR/EN stopword heuristic.
- `plugin/src/easy_diff/report.py` — builds the report data (the LLM's JSON + the exact per-file
  diffs, recomputed via `git diff`, never provided by the LLM) and writes the static HTML/CSS/JS.
- `plugin/templates/report/` — the HTML/CSS/JS viewer copied by `report.py`. Browser code, not
  part of the Python runtime.

## Design decisions not to re-discuss without reason

- **A Claude Code plugin, not an npm package.** Version 0.1.x was a CLI that ran a headless
  `claude -p` and needed `--settings`, `--json-schema` and output-envelope parsing to drive it
  from outside. Inside a session, the analysis is a subagent and all of that disappears. The
  cost: no use without a Claude Code session (CI goes through `claude -p "/easy-diff:review"`).
- **`detect_base_branch` (`plugin/src/easy_diff/git.py`) guesses the base by merge-base proximity, not
  by name.** Git keeps no record of "which branch this started from"; the only reliable signal
  is `@{upstream}` if configured, otherwise the number of commits unique to HEAD since the
  merge-base with each known branch (`origin/*`, or local branches if there's no remote) — the
  closest one wins. Needed for repos that don't follow the `main`/`master`/`develop` convention
  (e.g. versioned maintenance branches like Symfony's `6.4`, `7.1`). The old name-based fallback
  remains a last resort. On a strict tie between several candidates, `detect_base_branch`
  returns `Ambiguous(candidates)` instead of guessing silently; `prepare` prints them and
  the skill asks the user to pick one.
- **The LLM never produces HTML or a copied diff.** It only writes a structured JSON (overview +
  steps, validated by `validate_analysis`). The rendering and the displayed hunks are computed
  deterministically by our code (direct `git diff`), not by the model — this avoids layout
  inconsistencies and diff hallucinations. The skill tells the main session never to write or
  fix the analysis itself.
- **Plugin hooks fire in every session the plugin is enabled in**, not just during a review.
  Both hooks therefore act only on the analyst — the guard checks `agent_type` (present on
  every tool event a subagent fires) and stays silent otherwise, `check-analysis` is matched by
  agent type in `hooks.json` and checks it again. That holds even when Python is missing or too
  old: `easy-diff.sh` and `run.py` then deny or block the analyst alone. Never let either rule on another agent or
  the main thread: that would block Write/Edit/Bash in normal sessions.
- **The guard (`plugin/src/easy_diff/guard.py`) is defense in depth**, not the only barrier — the agent's `tools`
  list is the first line (plugin agents can't set `permissionMode`, so there is no plan mode
  anymore). For the analyst, the hook must stay fail-closed (deny by default) on anything it
  doesn't explicitly recognize. "Read-only git" is narrower than the subcommand name: `--output`
  makes diff/log/show/blame write a file, and redirections or a second line run anything, so
  both are refused; `git branch` was dropped since it creates and deletes branches. Its `allow`
  decisions also spare the user a permission prompt for each git command. The one Write it allows is `easy-diff/data/analysis.json` at the repo
  root: the agent writes the analysis itself rather than returning it, so the JSON never
  transits through the main session's context.
- **`check-analysis` checks the file before the agent may stop**: missing, not JSON, wrong
  shape, or prose in the wrong language — and blocks with what to fix instead of letting
  `render` fail afterward. One retry only (`stop_hook_active`); `render` validates again and
  refuses what still doesn't pass. Shape and language used to be two separate `Stop` hooks
  reading the model's last message; they now share one hook because both read the same file.
- **The schema the model sees lives in `agents/analyst.md`, the one we enforce in
  `easy_diff/analysis.py`.** Keep them in sync by hand; `test/fixtures/analysis.example.json`
  must pass `validate_analysis` (tested).
- **The report language is the plugin's `language` option (`userConfig` in `plugin.json`,
  `fr`/`en`, default `fr`), per developer.** It replaced `config-easy-diff.json` and `easy-diff
  init`. An option nobody set (shell `claude plugin install`, `--plugin-dir`) is *not* replaced
  by its `default`: `${user_config.language}` stays a literal placeholder (seen in a real run).
  So the skill only ever hands it to `prepare`, single-quoted so bash never expands it;
  `language_option` maps the placeholder to `fr`, `prepare` prints the resolved `language:`, and
  the skill passes that value on to the agent's task and to `render` — never the placeholder.
  `check-analysis` reads it as `CLAUDE_PLUGIN_OPTION_LANGUAGE` (same `fr` fallback) and
  heuristically checks (FR/EN stopword frequency, not exact detection) that the model complied.
- **A single `language` field drives the whole report.** The same value sets the LLM's prose
  language and the HTML *viewer*'s static labels (buttons, titles —
  `plugin/templates/report/i18n.js`, loaded by `index.html` before `app.js`, embedded as
  `ReportData.language`). A prior version had a separate `reportLanguage` for the viewer; it was
  merged because a report mixing two languages was never actually wanted.
- **Python >= 3.9, standard library only, no build.** Claude Code copies the plugin directory
  as is and installs nothing for Python, and the runtime must be there natively on most
  developer machines: 3.9 is the `python3` of macOS's Command Line Tools (which `git` already
  needs there), Debian 11, RHEL 9 and Amazon Linux 2023; Ubuntu 22.04+ and Debian 12 ship
  newer. So no `match`, no `tomllib`, `from __future__ import annotations` for `X | None`
  hints. Versions 0.2.x ran TypeScript on Node >= 22.18 instead, which most machines didn't
  have (a real one had Node 18). `plugin/src/easy_diff/paths.py` computes `PLUGIN_ROOT`
  relative to its own location on disk; a build step or packaging would mean revisiting it.
- **Nothing technical is copied into the target repo.** Only `easy-diff/` (the analysis and the
  report), excluded through `.git/info/exclude` so the user's `.gitignore` is never touched.

## Commands

```bash
python3 -m unittest discover -s test   # or npm test
npm install && npm run build:css       # rebuild plugin/templates/report/style.css after viewer changes
claude plugin validate plugin && claude plugin validate .
claude --plugin-dir ./plugin   # from another repo, then /easy-diff:review
```

## Rich analysis format (MR metadata, targeted hunks, confidence, watchpoints)

`test/fixtures/analysis.example.json` is the real format, not just a target: MR metadata,
`hunks` with exact line numbers, `confidence`, per-step `kind`, per-file `change_type`. The agent
prompt and its JSON schema (`plugin/agents/analyst.md`), `plugin/src/easy_diff/analysis.py`
and the rendering (`plugin/src/easy_diff/report.py`, viewer `plugin/templates/report/`) are
aligned with
this shape.

`watchpoints` live on a hunk, not a file: `hunk.watchpoints: [{ line, note }]`. There is no
separate generic "focus" concept — a line gets the purple highlight in the viewer if and only if
it carries a watchpoint, and that highlight is the only thing the "À vérifier"/"Watch for" card's
entries point back to (clicking one scrolls the diff to that exact line — the `note` itself is
only ever read from that card, not on hover over the line). Keeping this a single concept is
deliberate: a prior version had
`file.watchpoints` (plain strings, no line) and `hunk.focus_lines` (line numbers, no text) as two
unrelated fields, which made it impossible to link a watchpoint's explanation to the line it was
about. The prompt is correspondingly strict about what qualifies as a watchpoint — a concrete
correctness/security/data-risk claim about that exact line, never a style nit — since every one
becomes a highlight the reviewer is trained to trust.

The model never provides a hunk's content, only its `index` (position in the order `git diff`
produces them) and line numbers for indicative/labelling purposes only. `report.py` re-parses
`git diff` for that file itself and picks the actual hunk at that index — the displayed content
always comes from our own parsing, never from the model's JSON. If all of a file's indexes are
invalid, all of its actual hunks are shown instead of none.

## Prose fields: connected narrative, plain text

The prose is written for a reviewer who knows the stack but not the module or its business
domain, and must read top to bottom without needing follow-up questions. A prior version asked
for terse "field notes" (no transitions, hard sentence caps, `role`/`intro`/`detail` per step and
a mandatory `why` per file): real-world feedback was that the result read as a pile of
disconnected facts dense with undefined identifiers. Hence: one `narrative` per step, an
`overview.mental_model` (how the pieces fit together, concepts before class names) and
`overview.decisions[]` (`{choice, reason}`) up front, and `file.why` only when the narrative
doesn't already cover it. The prompt still bans filler and hedging, just not the connectors that
carry reasoning.

That version then overshot the other way: with only qualitative guidance ("a short paragraph
each"), reports came out too long. The prompt now gives per-field word budgets as ceilings,
which cap volume without asking for terse, unconnected sentences. Claude Code has no CLI flag
for output length (`--effort` changes how much the model explores, not how much it writes), so
the prompt is the lever. `overview.out_of_scope` was dropped (the viewer never displayed it) and
`overview.risks` may be an empty string, in which case its card is hidden.

Prose stays **plain text** — the viewer escapes it and only splits paragraphs on blank lines.
Markdown rendering was considered and deliberately rejected; don't reintroduce it without asking.

## Validated against real conditions

`/easy-diff:review` was run end-to-end with `claude -p "/easy-diff:review main" --plugin-dir
./plugin --output-format stream-json --verbose` on a throwaway repo (2026-10-05), which confirmed:

- the `!` injection runs `prepare` under the skill's `allowed-tools` rule, and the plugin agent
  is named `easy-diff:analyst` — the `agent_type` both hooks key on;
- the guard rules on the analyst only, denied chained commands, `git -C` and `ls`, and allowed
  the read-only git commands and the single Write to `easy-diff/data/analysis.json`;
- `check-analysis` fired on `SubagentStop`: it blocked an analysis written in English while
  French was expected, and the agent rewrote it in French in the same run;
- an unset `language` option leaves `${user_config.language}` unsubstituted (the first run
  stalled on it, hence `language_option`); set through `pluginConfigs["easy-diff@inline"].options`
  it is substituted in the skill and exported to the hook as `CLAUDE_PLUGIN_OPTION_LANGUAGE`.

A run takes about 30 s and $0.25 on a three-file diff.
