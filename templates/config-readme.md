# `.claude/easy-diff/`

Scaffolded by `easy-diff init`. These files back the `/easy-diff-report` command
(`.claude/commands/easy-diff-report.md`) used by `easy-diff generate`:

- `settings.json` — **not** this project's default Claude Code settings. It is only
  loaded when `easy-diff generate` passes it explicitly via `claude --settings`, for
  that one headless analysis run. It never applies to your normal interactive Claude
  Code sessions in this repo.
- `hooks/guard.cjs` — the `PreToolUse` hook referenced by `settings.json`. Denies all
  file writes and restricts `Bash` to a handful of read-only git commands, as
  defense-in-depth alongside the `--allowedTools`/`--disallowedTools` flags
  `easy-diff generate` also passes.
- `analysis.schema.json` — the JSON Schema the analysis output is validated against
  (via `claude --json-schema`).

Safe to commit — nothing here is generated output. Generated reports live in the
gitignored `easy-diff/` folder at the repo root instead.
