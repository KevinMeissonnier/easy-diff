import path from 'node:path';
import { repoRoot } from '../lib/git.js';
import { targetPaths, OUTPUT_DIR, CONFIG_FILE } from '../lib/paths.js';
import { writeConfigFile } from '../lib/scaffold.js';
import { ensureGitignoreEntries } from '../lib/gitignore.js';
import { resolveLanguage, buildConfig } from '../lib/config.js';

export interface InitOptions {
  force?: boolean;
  language?: string;
}

export function init(options: InitOptions = {}): void {
  const root = repoRoot();
  const paths = targetPaths(root);
  const language = resolveLanguage(options.language);

  const result = writeConfigFile(paths.configFile, buildConfig(language), Boolean(options.force));
  const rel = path.relative(root, result.path);
  console.log(
    result.status === 'created'
      ? `  created  ${rel}`
      : `  skipped  ${rel} (already exists, use --force to overwrite)`
  );

  const added = ensureGitignoreEntries(paths.gitignoreFile, [`/${OUTPUT_DIR}/`, `/${CONFIG_FILE}`]);
  console.log(
    added.length > 0
      ? `  updated  .gitignore (+ ${added.join(', ')})`
      : '  skipped  .gitignore (entries already present)'
  );

  console.log('\neasy-diff is set up. Next:');
  console.log('  easy-diff generate            # analyze the current branch against its base');
  console.log('  easy-diff generate <base>     # ...against a specific base branch\n');
}
