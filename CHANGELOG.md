# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html): while in `0.x`, a minor bump may
break the CLI or the config file, a patch bump never does.

## [Unreleased]

### Changed

- easy-diff is now a Claude Code plugin, installed from this repository's marketplace, instead
  of an npm package. `/easy-diff:review [base]` replaces `easy-diff generate [base]`, and the
  analysis runs in a subagent of your own session instead of a headless `claude -p`.
- The report language is the plugin's `language` option (asked when the plugin is enabled,
  changed in `/config`) instead of `config-easy-diff.json`.
- `easy-diff/` is kept out of git through `.git/info/exclude` instead of `.gitignore` entries.
- Requires Node >= 22.18.

### Fixed

- The analysis guard let read-only git commands write files: it now also refuses `--output`,
  shell redirections and multi-line commands, and no longer allows `git branch`, which can
  create and delete branches.

### Removed

- The `@kevinmeissonnier/easy-diff` npm package, the `easy-diff` command, `easy-diff init` and
  `config-easy-diff.json`.

## [0.1.1] - 2026-10-01

### Fixed

- The report page broke (blank page, script error) when the diff or the analysis contained a
  `$'`, `$&` or `` $` `` sequence, e.g. bash ANSI-C quoting like `"$x"$'\n'`: those were
  expanded as string-replacement patterns while embedding the data into the HTML.

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
