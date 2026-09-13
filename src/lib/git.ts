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

export interface BaseCandidate {
  /** A ref usable directly in `git diff <ref>...HEAD` (e.g. "origin/6.4" or "main"). */
  ref: string;
  /** Commits unique to HEAD since its merge-base with this ref — lower means "closer fork point". */
  aheadCount: number;
}

export type BaseDetection =
  | { status: 'found'; base: string }
  | { status: 'ambiguous'; candidates: BaseCandidate[] }
  | { status: 'not-found' };

function refShortNames(pattern: string, cwd: string): string[] {
  const out = run(['for-each-ref', '--format=%(refname:short)', pattern], cwd);
  return out ? out.split('\n').filter(Boolean) : [];
}

/** Remote branches if the repo has an `origin`, otherwise local branches — whichever exists. */
function candidateBaseRefs(cwd: string): string[] {
  // refs/remotes/origin/HEAD is a symbolic ref; git's `refname:short` quirkily renders it as
  // just "origin" (not "origin/HEAD"), so both forms need excluding.
  const remote = refShortNames('refs/remotes/origin', cwd).filter(
    (ref) => ref !== 'origin' && ref !== 'origin/HEAD'
  );
  return remote.length > 0 ? remote : refShortNames('refs/heads', cwd);
}

/**
 * Ranks branches by how closely HEAD forked from them: for each candidate, the number of
 * commits reachable from HEAD but not from their merge-base. Git has no notion of "which
 * branch this one was forked from" — this is the closest deducible approximation, and it's
 * name-agnostic (works for `main`/`master` as well as versioned branches like `6.4`).
 */
export function rankBaseCandidates(cwd: string): BaseCandidate[] {
  let head: string;
  try {
    head = run(['rev-parse', 'HEAD'], cwd);
  } catch {
    return []; // unborn branch, no commits yet
  }
  const branch = currentBranch(cwd);
  const candidates: BaseCandidate[] = [];
  for (const ref of candidateBaseRefs(cwd)) {
    const shortName = ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref;
    if (shortName === branch) continue; // this branch's own (remote-tracking) mirror, not a base
    try {
      if (run(['rev-parse', ref], cwd) === head) continue; // identical history, not a base
      const mergeBaseSha = run(['merge-base', ref, 'HEAD'], cwd);
      const aheadCount = Number(run(['rev-list', '--count', `${mergeBaseSha}..HEAD`], cwd));
      candidates.push({ ref, aheadCount });
    } catch {
      continue; // unrelated history or unresolvable ref — skip
    }
  }
  return candidates.sort((a, b) => a.aheadCount - b.aheadCount);
}

/**
 * Determines the base branch to diff HEAD against, in order of confidence:
 * 1. The configured upstream tracking branch (`@{upstream}`), if it differs from HEAD.
 * 2. The branch HEAD most likely forked from, by merge-base proximity (see rankBaseCandidates).
 * 3. The legacy fallback: `origin/HEAD`, then the first of main/master/develop that exists.
 */
export function detectBaseBranch(cwd: string): BaseDetection {
  try {
    const upstream = run(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], cwd);
    if (run(['rev-parse', upstream], cwd) !== run(['rev-parse', 'HEAD'], cwd)) {
      return { status: 'found', base: upstream };
    }
  } catch {
    // No upstream configured, or it's unresolvable — fall through to merge-base ranking.
  }

  const ranked = rankBaseCandidates(cwd);
  if (ranked.length > 0) {
    const bestScore = ranked[0].aheadCount;
    const tied = ranked.filter((c) => c.aheadCount === bestScore);
    return tied.length === 1 ? { status: 'found', base: tied[0].ref } : { status: 'ambiguous', candidates: tied };
  }

  try {
    const ref = run(['symbolic-ref', 'refs/remotes/origin/HEAD'], cwd);
    const name = ref.replace('refs/remotes/origin/', '');
    if (name) return { status: 'found', base: name };
  } catch {
    // No tracked remote HEAD — fall through to local candidates.
  }
  for (const candidate of CANDIDATE_BASES) {
    try {
      run(['rev-parse', '--verify', candidate], cwd);
      return { status: 'found', base: candidate };
    } catch {
      continue;
    }
  }
  return { status: 'not-found' };
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
