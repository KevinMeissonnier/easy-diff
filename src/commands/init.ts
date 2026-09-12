import path from 'node:path';
import { repoRoot } from '../lib/git.js';
import { targetPaths, OUTPUT_DIR } from '../lib/paths.js';
import { copyTemplate } from '../lib/scaffold.js';
import { ensureGitignoreEntry } from '../lib/gitignore.js';

export interface InitOptions {
  force?: boolean;
}

export function init(options: InitOptions = {}): void {
  const root = repoRoot();
  const paths = targetPaths(root);
  const force = Boolean(options.force);

  const results = [
    copyTemplate('commands/easy-diff-report.md', paths.commandFile, force),
    copyTemplate('config-readme.md', paths.configReadme, force),
    copyTemplate('claude-settings.json', paths.settingsFile, force),
    copyTemplate('hooks/guard.cjs', paths.hookFile, force),
    copyTemplate('analysis.schema.json', paths.schemaFile, force),
  ];

  for (const result of results) {
    const rel = path.relative(root, result.path);
    console.log(
      result.status === 'created'
        ? `  created  ${rel}`
        : `  skipped  ${rel} (already exists, use --force to overwrite)`
    );
  }

  // Anchored to the repo root: an unanchored `easy-diff/` would also match
  // `.claude/easy-diff/` (the config dir shares that leaf name), silently gitignoring
  // the very config files this command just created.
  const gitignoreStatus = ensureGitignoreEntry(paths.gitignoreFile, `/${OUTPUT_DIR}/`);
  console.log(
    gitignoreStatus === 'added'
      ? `  updated  .gitignore (+ ${OUTPUT_DIR}/)`
      : `  skipped  .gitignore (${OUTPUT_DIR}/ already ignored)`
  );

  console.log('\neasy-diff is set up. Next:');
  console.log('  easy-diff generate            # analyze the current branch against its base');
  console.log('  easy-diff generate <base>     # ...against a specific base branch\n');
}
