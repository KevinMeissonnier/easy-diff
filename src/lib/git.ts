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
