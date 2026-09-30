import fs from 'node:fs';

/** Returns the entries that were missing and have been appended. */
export function ensureGitignoreEntries(gitignorePath: string, entries: string[]): string[] {
  const existing = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const present = new Set(existing.split('\n').map((line) => line.trim()));
  const missing = entries.filter((entry) => !present.has(entry));
  if (missing.length === 0) return [];

  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  const block = `${separator}\n# easy-diff\n${missing.join('\n')}\n`;
  fs.writeFileSync(gitignorePath, existing + block);
  return missing;
}
