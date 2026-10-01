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

CLI that turns a git diff into a narrated review (overview + commented steps), instead of a raw
diff to reverse-engineer.

## Structure

- `src/cli.ts` — CLI entry point (commander), `init` and `generate` subcommands.
- `src/commands/init.ts` — writes `config-easy-diff.json` and the `.gitignore` entries in the
  target repo. Pure file I/O, no network. Optional: `generate` defaults to English without it.
- `src/commands/generate.ts` — orchestrates the analysis: detects the base, invokes headless
  Claude Code, validates the output, writes `easy-diff/data/analysis.json`, triggers the HTML
  render.
- `src/lib/claude-runner.ts` — headless `claude -p` invocation. Builds the prompt from
  `templates/analysis-prompt.md` (`{{base}}`/`{{language}}` filled in) and the `--settings` JSON
  registering the hooks by absolute path into the installed package.
- `src/lib/schema.ts` — zod schema for the analysis + `extractAnalysis`, which tries several
  extraction points in Claude Code's `--output-format json`/`--json-schema` output (the envelope
  and its `structured_output` field are confirmed against a real invocation, see
  `test/fixtures/`).
- `src/render/report.ts` — builds the report data (the LLM's JSON + the exact per-file diffs,
  recomputed via `git diff`, never provided by the LLM) and writes the static HTML/CSS/JS.
- `templates/` — the prompt, JSON schema and hooks used by `generate` straight from the installed
  package, plus the HTML/CSS/JS viewer copied by `render/report.ts`. These are not TypeScript
  sources.

## Design decisions not to re-discuss without reason

- **`detectBaseBranch` (`src/lib/git.ts`) guesses the base by merge-base proximity, not by
  name.** Git keeps no record of "which branch this started from"; the only reliable signal is
  `@{upstream}` if configured, otherwise the number of commits unique to HEAD since the
  merge-base with each known branch (`origin/*`, or local branches if there's no remote) — the
  closest one wins. Needed for repos that don't follow the `main`/`master`/`develop` convention
  (e.g. versioned maintenance branches like Symfony's `6.4`, `7.1`). The old name-based fallback
  remains a last resort. On a strict tie between several candidates, `detectBaseBranch` returns
  `{ status: 'ambiguous', candidates }` instead of guessing silently; `generate.ts` offers an
  interactive choice (`src/lib/prompt.ts`, dependency-free `readline`) if stdin is a TTY,
  otherwise it fails listing the candidates — never a blocking prompt in CI.

- **The LLM never produces HTML or a copied diff.** It only outputs a structured JSON (overview +
  steps, validated by `templates/analysis.schema.json`). The rendering and the displayed hunks
  are computed deterministically by our code (direct `git diff`), not by the model — this avoids
  layout inconsistencies and diff hallucinations.
- **Nothing technical is copied into the target repo.** The prompt, schema and hooks are read
  from the installed package on every `generate`, and the hooks are registered through an inline
  `claude --settings '<json>'` built by `buildSettings`. A prior version scaffolded them into
  `.claude/` with `init`: every CLI upgrade then silently desynced them from the zod schema, and
  the mismatch only surfaced after a full (slow, paid) analysis. The only per-repo file is
  `config-easy-diff.json`. Never write these settings into a repo's `.claude/settings.json` —
  that would block Write/Edit/Bash in normal interactive Claude Code sessions.
- **`templates/hooks/guard.cjs` is defense in depth**, not the only barrier — the
  `--allowedTools`/`--disallowedTools`/`--permission-mode plan` flags in `claude-runner.ts` are
  the first line. The hook must stay fail-closed (deny by default) on anything it doesn't
  explicitly recognize.
- **`templates/hooks/validate-analysis.cjs`** is an additional layer, independent of the
  `--json-schema` passed to `claude` and of the zod validation in `src/lib/schema.ts`: a `Stop`
  hook that checks the shape of the produced JSON before the model's turn even ends, and blocks
  (with details of what's wrong) instead of letting `generate` fail afterward. Vanilla JS with no
  dependency, like `guard.cjs` — it runs via plain `node`, with the target repo as cwd.
- **The report language is a config setting (`config-easy-diff.json` at the repo root,
  gitignored so each developer picks their own), not a `generate` flag.** `easy-diff init
  [en|fr]` writes it (default `fr`). `generate` reads it and injects it into the prompt, and
  passes it as an argument to `templates/hooks/validate-language.cjs` — a second `Stop` hook,
  independent of `validate-analysis.cjs`, which heuristically checks (FR/EN stopword frequency,
  not exact detection) that the model complied, and blocks with a rewrite request otherwise.
  Only `src/lib/config.ts` knows where the config lives.
- **A single `language` field drives the whole report.** The same value sets the LLM's prose
  language and the HTML *viewer*'s static labels (buttons, titles — `templates/report/i18n.js`,
  loaded by `index.html` before `app.js`, embedded as `ReportData.language`). A prior version
  had a separate `reportLanguage` for the viewer; it was merged because a report mixing two
  languages was never actually wanted.
- **Paths and bundling**: no bundler (tsup/esbuild) for now — build via plain `tsc`, which
  preserves the `src/` → `dist/` tree structure, on which `src/lib/paths.ts` depends (computing
  `PACKAGE_ROOT` relative to its own location on disk). Introducing a bundler would require
  revisiting this computation (see the comment in `paths.ts`). The same holds once installed
  from npm: `package.json` `files` ships `dist/` and the runtime `templates/`, side by side.

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build        # tsc + chmod +x dist/cli.js
npm run dev -- init   # runs from source via tsx, no build needed
npm pack              # builds (prepack) and produces the tarball `npm publish` would upload
```

## Rich analysis format (MR metadata, targeted hunks, confidence, watchpoints)

`templates/analysis.example.json` is now the real format, not just a target: MR metadata, `hunks`
with exact line numbers, `confidence`, per-step `kind`, per-file `change_type`. The JSON schema,
the prompt, `src/lib/schema.ts` (zod) and the rendering (`src/render/report.ts`, viewer
`templates/report/`) are aligned with this shape.

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
produces them) and line numbers for indicative/labelling purposes only. `report.ts` re-parses
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

`generate` was tested end-to-end with `claude -p --json-schema` against a throwaway repo (see
`test/fixtures/claude-envelope.*.json`, captured from a real invocation; their
`structured_output`/`result` payloads were later migrated by hand when the analysis shape changed,
the envelope itself is untouched). The envelope exposes the structured value under
`structured_output`. If the format changes in a future Claude Code
version, `extractAnalysis` includes the raw output in its error message — inspect and adjust
`collectJsonCandidates` in `src/lib/schema.ts` accordingly.

The package-owned flow (prompt passed to `-p`, hooks registered through inline `--settings`
JSON) was validated the same way from a global install of the `npm pack` tarball: the analysis
succeeded, and a probe run confirmed both the guard (denied a Bash command `--allowedTools`
permitted) and the `Stop` hooks are active.
