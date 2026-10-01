# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): while in `0.x`, a minor bump may
break the CLI or the config file, a patch bump never does.

## [0.1.0] - 2026-10-01

First public release.

### Added

- `easy-diff init [en|fr]`: writes `config-easy-diff.json` (report language, default `fr`) and
  the `.gitignore` entries.
- `easy-diff generate [base]`: analyzes the current branch against its base (auto-detected by
  merge-base proximity, or picked interactively on a tie) through headless Claude Code, and
  writes a static HTML report to `easy-diff/report/`.
- `generate` offers to open the report in the default browser (macOS, Linux, Windows, WSL).
- Read-only analysis: tool allowlist, `plan` permission mode and a fail-closed `PreToolUse`
  guard hook.
- `Stop` hooks validating the analysis JSON shape and the report language before the model's
  turn ends.
