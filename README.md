# easy-diff

Turn a git diff into a narrated review, instead of a raw diff to reverse-engineer.

## Objective

- LLMs and coding agents write more and more of the code.
- Reviewing code matters more than writing it now.
- Raw diffs show `+`/`-` lines. They don't explain the "why".
- `easy-diff` turns a diff into a guided review: intent first, then a step-by-step walkthrough.

## Documentation

Not published on npm yet. Install from source for now.

Requirements:

- Node >= 18.17
- [Claude Code](https://claude.com/claude-code) CLI, installed and logged in

```bash
git clone git@github.com:KevinMeissonnier/easy-diff.git
cd easy-diff
npm install
npm run build
npm link
```

Then, in any git repo:

```bash
easy-diff init
easy-diff generate
```

Once published, `npx easy-diff init` will work directly, no clone needed.

## Contributing
