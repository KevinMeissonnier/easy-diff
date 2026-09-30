# easy-diff

Turn a git diff into a narrated review, instead of a raw diff to reverse-engineer.

## Objective

- LLMs and coding agents write more and more of the code.
- Reviewing code matters more than writing it now.
- Raw diffs show `+`/`-` lines. They don't explain the "why".
- `easy-diff` turns a diff into a guided review: intent first, then a step-by-step walkthrough.

## Installation

Requirements:

- Node >= 18.17
- [Claude Code](https://claude.com/claude-code) CLI, installed and logged in

```bash
npm install -g easy-diff
```

## Usage

In any git repo, on the branch you want to review:

```bash
easy-diff init [en|fr]      # once per repo: writes config-easy-diff.json + .gitignore entries
easy-diff generate          # analyze the current branch against its (auto-detected) base
easy-diff generate <base>   # ...against a specific base branch
```

Then open `easy-diff/report/index.html` in your browser.

`init` is optional: without a config, everything defaults to English.

### Configuration

`config-easy-diff.json`, at the repo root, is gitignored: each developer picks their own
languages.

```json
{
  "language": "fr",
  "reportLanguage": "en"
}
```

- `language` (`en` or `fr`) — the language the analysis is written in.
- `reportLanguage` (`en` or `fr`) — the language of the report viewer's buttons and headings.

### Upgrading

```bash
npm update -g easy-diff
```

The prompt, schema and hooks ship with the package, so nothing in your repos needs updating.
If a repo still has `.claude/commands/easy-diff-report.md` or `.claude/easy-diff/` from an older,
git-installed version, `generate` lists them: they are no longer used and can be deleted.

## Contributing

```bash
git clone git@github.com:KevinMeissonnier/easy-diff.git
cd easy-diff
npm install
npm run build
npm link        # puts your local build on the PATH as `easy-diff`
npm test
```

## License

MIT
