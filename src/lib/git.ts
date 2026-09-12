import { execFileSync } from 'node:child_process';

function run(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function repoRoot(cwd: string = process.cwd()): string {
  try {
    return run(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    throw new Error('Not inside a git repository.');
  }
}

export function currentBranch(cwd: string): string {
  return run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

const CANDIDATE_BASES = ['main', 'master', 'develop'];

export function detectBaseBranch(cwd: string): string {
  try {
    const ref = run(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
    const name = ref.replace('refs/remotes/origin/', '');
    if (name) return name;
  } catch {
    // No tracked remote HEAD — fall through to local candidates.
  }
  for (const candidate of CANDIDATE_BASES) {
    try {
      run(['rev-parse', '--verify', candidate], cwd);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    'Could not auto-detect a base branch (no origin/HEAD, no local main/master/develop). ' +
      'Pass one explicitly: easy-diff generate <base-branch>'
  );
}

export function changedFiles(base: string, cwd: string): string[] {
  const out = run(['diff', '--name-only', `${base}...HEAD`], cwd);
  return out ? out.split('\n').filter(Boolean) : [];
}

export function diffForFile(base: string, file: string, cwd: string): string {
  return run(['diff', `${base}...HEAD`, '--', file], cwd);
}

export function mergeBase(base: string, cwd: string): string {
  return run(['merge-base', base, 'HEAD'], cwd);
}

/** Commits reachable from HEAD but not from the merge-base — i.e. added on this branch. */
export function commitCount(base: string, cwd: string): number {
  const out = run(['rev-list', '--count', `${mergeBase(base, cwd)}..HEAD`], cwd);
  return Number(out) || 0;
}

/** Per-file insertion/deletion counts from `git diff --numstat`, keyed by path. */
export function diffNumstat(base: string, cwd: string): Map<string, { add: number; del: number }> {
  const out = run(['diff', '--numstat', `${base}...HEAD`], cwd);
  const stats = new Map<string, { add: number; del: number }>();
  if (!out) return stats;
  for (const line of out.split('\n')) {
    const [addStr, delStr, ...pathParts] = line.split('\t');
    const filePath = pathParts.join('\t'); // paths essentially never contain tabs
    if (!filePath) continue;
    const add = Number(addStr);
    const del = Number(delStr);
    stats.set(filePath, { add: Number.isFinite(add) ? add : 0, del: Number.isFinite(del) ? del : 0 });
  }
  return stats;
}
