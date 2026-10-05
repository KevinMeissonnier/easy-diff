# easy-diff

Turn a git diff into a narrated review, instead of a raw diff to reverse-engineer.

## Objective

- LLMs and coding agents write more and more of the code.
- Reviewing code matters more than writing it now.
- Raw diffs show `+`/`-` lines. They don't explain the "why".
- `easy-diff` turns a diff into a guided review: intent first, then a step-by-step walkthrough.

## Installation

easy-diff is a [Claude Code](https://claude.com/claude-code) plugin: the analysis runs inside
your own Claude Code session, on your account and quota.

Requirements:

- Claude Code
- Node >= 22.18 (it runs the plugin's TypeScript directly, with no build step)
- git

In Claude Code:

```text
/plugin marketplace add KevinMeissonnier/easy-diff
/plugin install easy-diff@easy-diff
```

or from a shell: `claude plugin marketplace add KevinMeissonnier/easy-diff`, then
`claude plugin install easy-diff@easy-diff`.

Claude Code asks for the report language when the plugin is enabled (`fr` or `en`, default
`fr`). Change it later in `/config`. It drives the whole report: both the analysis prose and
the viewer's buttons and headings.

## Usage

In any git repo, on the branch you want to review:

```text
/easy-diff:review          # against the (auto-detected) base branch
/easy-diff:review <base>   # against a specific base branch
```

It writes `easy-diff/report/index.html`, a static page with no server, then offers to open it
in your default browser.

What `/easy-diff:review` does, in order:

1. Detects the base branch. On a tie between several candidates, it asks you to pick one.
2. Hands the analysis to the plugin's `easy-diff:analyst` agent: git read commands and file
   reads only, plus writing `easy-diff/data/analysis.json`. Hooks enforce that, and check the
   analysis's shape and language before the agent may finish.
3. Validates the analysis again and renders the report. The displayed diffs come from
   `git diff` directly, never from the model.

Nothing is added to your repos besides `easy-diff/`, the generated output, which is kept out of
git through `.git/info/exclude` rather than your `.gitignore`.

### Upgrading

```text
/plugin marketplace update easy-diff
```

then update the plugin from `/plugin` (or `claude plugin update easy-diff@easy-diff`) and run
`/reload-plugins`. Reports already generated keep working: each one is a self-contained copy,
overwritten by the next review. See [CHANGELOG.md](CHANGELOG.md) for what changed between
versions.

Coming from the npm package (`@kevinmeissonnier/easy-diff`, 0.1.x)? Uninstall it with
`npm uninstall -g @kevinmeissonnier/easy-diff`, and delete `config-easy-diff.json` and its
`.gitignore` entry from your repos: the language is now a plugin option.

### Uninstalling

```text
/plugin uninstall easy-diff@easy-diff
/plugin marketplace remove easy-diff
```

Then delete `easy-diff/` from your repos.

## Contributing

```bash
git clone git@github.com:KevinMeissonnier/easy-diff.git
cd easy-diff
npm install            # dev tooling only: the plugin itself has no dependencies
npm test
npm run typecheck
claude plugin validate plugin && claude plugin validate .
```

To try your working copy, start Claude Code in any other repo with
`claude --plugin-dir /path/to/easy-diff/plugin` and run `/easy-diff:review`.

The plugin is `plugin/`, the only directory users receive. The repository root is its
marketplace (`.claude-plugin/marketplace.json`) and the development tooling.

### Releasing

Versions follow [semver](https://semver.org). While in `0.x`, a minor bump may break the
command or its options, a patch bump never does.

In a release branch, bump `version` in `plugin/.claude-plugin/plugin.json`, move the
`Unreleased` entries of `CHANGELOG.md` under the new version, and open a PR. Users receive the
release once it is merged into `main`: Claude Code keeps them on the version they installed
until that field changes.

## License

MIT
