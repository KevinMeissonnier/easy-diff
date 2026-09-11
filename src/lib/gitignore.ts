import fs from 'node:fs';

export type GitignoreStatus = 'added' | 'present';

/** Idempotently ensures `entry` is present as its own line in the gitignore file. */
export function ensureGitignoreEntry(gitignorePath: string, entry: string): GitignoreStatus {
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const alreadyPresent = existing.split('\n').some((line) => line.trim() === entry);
  if (alreadyPresent) return 'present';

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  const block = `${separator}\n# easy-diff generated output\n${entry}\n`;
  fs.writeFileSync(gitignorePath, existing + block);
  return 'added';
}
