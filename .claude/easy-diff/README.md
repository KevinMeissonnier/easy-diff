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
- `hooks/validate-analysis.cjs` — the `Stop` hook referenced by `settings.json`. Checks
  the model's final JSON against the required analysis shape before its turn is allowed
  to end, and blocks with a specific error if something required is missing or malformed
  — another independent layer alongside `--json-schema` and the zod validation `easy-diff
  generate` does once the process exits.
- `analysis.schema.json` — the JSON Schema the analysis output is validated against
  (via `claude --json-schema`).

Safe to commit — nothing here is generated output. Generated reports live in the
gitignored `easy-diff/` folder at the repo root instead.
