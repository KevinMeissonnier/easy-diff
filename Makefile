# Dogfooding: this repo runs easy-diff on itself. `.claude/commands/easy-diff-report.md`
# and `.claude/easy-diff/*` are committed copies of templates/, kept in sync by hand via
# this target rather than regenerated on every run — re-run it after touching
# templates/commands/easy-diff-report.md, templates/hooks/guard.cjs,
# templates/hooks/validate-analysis.cjs, templates/hooks/validate-language.cjs,
# templates/claude-settings.json, templates/config-readme.md or
# templates/analysis.schema.json. Won't touch an existing config.json unless --force is
# passed too (it's the one scaffold file with repo-specific content).
.PHONY: sync-claude
sync-claude:
	npm run build
	node dist/cli.js init --force
