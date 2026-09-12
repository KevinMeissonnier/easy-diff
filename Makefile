# Dogfooding: this repo runs easy-diff on itself. `.claude/commands/easy-diff-report.md`
# and `.claude/easy-diff/*` are committed copies of templates/, kept in sync by hand via
# this target rather than regenerated on every run — re-run it after touching
# templates/commands/easy-diff-report.md, templates/hooks/guard.cjs,
# templates/hooks/validate-analysis.cjs, templates/claude-settings.json or
# templates/analysis.schema.json.
.PHONY: sync-claude
sync-claude:
	npm run build
	node dist/cli.js init --force
