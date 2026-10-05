import fs from 'node:fs';
import { repoRoot, currentBranch, detectBaseBranch, changedFiles, excludeFile } from '../lib/git.ts';
import { ensureGitignoreEntries } from '../lib/gitignore.ts';
import { targetPaths, OUTPUT_DIR } from '../lib/paths.ts';
import type { Language } from '../lib/language.ts';

/**
 * Everything the `/easy-diff:review` skill needs before it hands over to the analyst agent,
 * printed as `key: value` lines for the skill to read. An ambiguous base is not an error: the
 * skill asks the user to pick one and runs `prepare` again with it.
 */
export function prepare(language: Language, requestedBase?: string): string {
  const root = repoRoot();
  const paths = targetPaths(root);

  let base = requestedBase;
  if (!base) {
    const detection = detectBaseBranch(root);
    if (detection.status === 'not-found') {
      throw new Error(
        'Could not auto-detect a base branch (no upstream tracking branch, no remote or local ' +
          'branches to compare against). Pass one explicitly: /easy-diff:review <base-branch>'
      );
    }
    if (detection.status === 'ambiguous') {
      return [
        'status: ambiguous',
        'candidates:',
        ...detection.candidates.map((candidate) => `  - ${candidate.ref}`),
      ].join('\n');
    }
    base = detection.base;
  }

  const branch = currentBranch(root);
  if (branch === base) {
    throw new Error(`Current branch is the same as the base branch (${base}). Nothing to review.`);
  }
  const files = changedFiles(base, root);
  if (files.length === 0) {
    throw new Error(`No differences between ${base} and ${branch}.`);
  }

  // A leftover analysis from an earlier run would otherwise be rendered if the agent fails to
  // write a new one.
  fs.rmSync(paths.dataFile, { force: true });
  ensureGitignoreEntries(excludeFile(root), [`/${OUTPUT_DIR}/`]);

  return [
    'status: ready',
    `base: ${base}`,
    `branch: ${branch}`,
    `changed files: ${files.length}`,
    `analysis file: ${paths.dataFile}`,
    `language: ${language}`,
  ].join('\n');
}
