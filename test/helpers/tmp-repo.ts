import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Creates a throwaway git repo under the OS tmp dir and returns its path. */
export function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-diff-test-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  return dir;
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** Creates a throwaway bare repo, usable as a fake `origin` remote. */
export function makeBareRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-diff-test-bare-'));
  git(dir, ['init', '-q', '--bare', '-b', 'main']);
  return dir;
}

/** Clones `source` into a fresh tmp dir — sets up refs/remotes/origin/HEAD like a real clone. */
export function cloneRepo(source: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-diff-test-clone-'));
  execFileSync('git', ['clone', '-q', source, dir], { encoding: 'utf8' });
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  return dir;
}

export function writeFile(repo: string, relativePath: string, content: string): void {
  const full = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

export function commitAll(repo: string, message: string): void {
  git(repo, ['add', '.']);
  git(repo, ['commit', '-q', '-m', message]);
}

export function removeTmpRepo(repo: string): void {
  fs.rmSync(repo, { recursive: true, force: true });
}
