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
- git
- [Claude Code](https://claude.com/claude-code) CLI, on your `PATH` and logged in. `easy-diff`
  runs the analysis through it, so it uses your own Claude Code account and quota. Nothing
  checks this at install time: a missing or logged-out `claude` only fails at `generate`.

```bash
npm install -g @kevinmeissonnier/easy-diff
easy-diff --version
```

This installs the `easy-diff` command and everything it needs at runtime (the compiled CLI, the
analysis prompt, the JSON schema, the Claude Code hooks and the report viewer). Nothing is copied
into your repos besides an optional config file and the generated report.

Other ways to run it:

- Without installing: `npx @kevinmeissonnier/easy-diff@latest generate`.
- Pinned per repo: `npm install -D @kevinmeissonnier/easy-diff`, then `npx easy-diff generate`.

## Usage

In any git repo, on the branch you want to review:

```bash
easy-diff init [en|fr]      # once per repo: writes config-easy-diff.json + .gitignore entries
easy-diff generate          # analyze the current branch against its (auto-detected) base
easy-diff generate <base>   # ...against a specific base branch
```

`generate` writes `easy-diff/report/index.html`, a static page with no server, then offers to
open it in your default browser. In a non-interactive shell (CI, piped output) it only prints the
path.

What `generate` does, in order:

1. Reads `config-easy-diff.json` (or defaults to French) and detects the base branch. On a tie
   between several candidates it asks you to pick one, or fails listing them in a
   non-interactive shell.
2. Runs `claude -p` headlessly, read-only (git read commands and file reads only), with the
   prompt, schema and hooks taken from the installed package.
3. Validates the analysis and saves it to `easy-diff/data/analysis.json`.
4. Renders the report. The displayed diffs come from `git diff` directly, never from the model.
   The same data is saved to `easy-diff/data/report.json` for the Claude Code pane below.

`init` is optional: without a config, everything defaults to French.

### Reading the report in Claude Code (experimental)

`plugin/` is a Claude Code plugin that shows the last report in a pane beside the conversation
instead of the browser. It relies on Claude Code's function-hooks plugin API, which is in early
access and may change between releases.

```bash
claude --plugin-dir /path/to/easy-diff/plugin   # in the repo you ran `easy-diff generate` in
```

Then type `/easy-diff`. The pane opens on the overview; `n`/`p` move between steps and `o` goes
back to the overview once the pane has the keyboard. A "Watch for" entry opens its step and
scrolls to the line, where the note is drawn right under it.

### Configuration

`config-easy-diff.json`, at the repo root, is gitignored: each developer picks their own
language.

```json
{
  "language": "fr"
}
```

- `language` (`en` or `fr`, default `fr`) — the language of the whole report: both the analysis
  prose and the viewer's buttons and headings.

### Upgrading

```bash
npm install -g @kevinmeissonnier/easy-diff@latest
```

The prompt, schema, hooks and viewer ship with the package, so an upgrade takes effect on the
next `generate` with nothing to update in your repos. `config-easy-diff.json` is kept as is.
Reports already generated keep working: each one is a self-contained copy, overwritten by the
next `generate`. See [CHANGELOG.md](CHANGELOG.md) for what changed between versions.

If a repo still has `.claude/commands/easy-diff-report.md` or `.claude/easy-diff/` from an older,
git-installed version, `generate` lists them: they are no longer used and can be deleted.

### Uninstalling

```bash
npm uninstall -g @kevinmeissonnier/easy-diff
```

Then delete `config-easy-diff.json` and `easy-diff/` from your repos, along with their
`.gitignore` entries.

## Contributing

```bash
git clone git@github.com:KevinMeissonnier/easy-diff.git
cd easy-diff
npm install
npm run build
npm link        # puts your local build on the PATH as `easy-diff`
npm test
```

### Releasing

Versions follow [semver](https://semver.org). While in `0.x`, a minor bump may break the CLI or
the config file, a patch bump never does.

1. In a release branch: `npm version <patch|minor|major> --no-git-tag-version`, move the
   `Unreleased` entries of `CHANGELOG.md` under the new version, open a PR.
2. Once merged, tag `main` and push the tag:

   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```

   `.github/workflows/publish.yml` checks that the tag matches `package.json`, runs the tests,
   builds and publishes. A prerelease tag (`v0.2.0-beta.0`) is published under the `next`
   dist-tag instead of `latest`.

A published version number can never be reused, so try the tarball first if in doubt:
`npm pack`, then `npm install -g ./kevinmeissonnier-easy-diff-<version>.tgz`.

The very first publish is manual (`npm publish`), because npm only lets you configure a trusted
publisher on a package that already exists. Then, on npmjs.com, add this repository and
`publish.yml` as the package's trusted publisher.

## License

MIT
