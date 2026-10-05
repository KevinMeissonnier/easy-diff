"""Shared test helpers. Importing this module puts the plugin's sources on sys.path."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN_SRC = os.path.join(ROOT, 'plugin', 'src')
LAUNCHER = os.path.join(PLUGIN_SRC, 'easy-diff.sh')
sys.path.insert(0, PLUGIN_SRC)

with open(os.path.join(ROOT, 'test', 'fixtures', 'analysis.example.json'), encoding='utf-8') as _file:
    EXAMPLE = json.load(_file)


def git(cwd, *args):
    return subprocess.run(['git', *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def write_file(repo, relative_path, content):
    full = os.path.join(repo, relative_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as file:
        file.write(content)


def commit_all(repo, message):
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', message)


def run_launcher(*args, stdin='', env=None):
    """Runs the plugin's entry point the way the skill and the hooks do."""
    return subprocess.run(['sh', LAUNCHER, *args], input=stdin, capture_output=True, text=True, env=env)


class RepoTestCase(unittest.TestCase):
    """Gives each test throwaway git repos, removed afterwards."""

    def make_repo(self):
        # realpath: on some systems the tmp dir is itself a symlink (macOS /tmp -> /private/tmp),
        # while git reports paths with symlinks resolved.
        repo = os.path.realpath(tempfile.mkdtemp(prefix='easy-diff-test-'))
        self.addCleanup(shutil.rmtree, repo, ignore_errors=True)
        git(repo, 'init', '-q', '-b', 'main')
        git(repo, 'config', 'user.email', 'test@example.com')
        git(repo, 'config', 'user.name', 'Test')
        return repo

    def make_bare_repo(self):
        """A throwaway bare repo, usable as a fake `origin` remote."""
        bare = tempfile.mkdtemp(prefix='easy-diff-test-bare-')
        self.addCleanup(shutil.rmtree, bare, ignore_errors=True)
        git(bare, 'init', '-q', '--bare', '-b', 'main')
        return bare

    def clone_repo(self, source):
        """Clones `source` — sets up refs/remotes/origin/HEAD like a real clone."""
        clone = tempfile.mkdtemp(prefix='easy-diff-test-clone-')
        self.addCleanup(shutil.rmtree, clone, ignore_errors=True)
        subprocess.run(['git', 'clone', '-q', source, clone], check=True)
        git(clone, 'config', 'user.email', 'test@example.com')
        git(clone, 'config', 'user.name', 'Test')
        return clone

    def make_feature_repo(self):
        """A repo on `feature`, one commit ahead of `main`, with the cwd moved into it."""
        repo = self.make_repo()
        write_file(repo, 'app.py', 'def hello():\n    return "hi"\n')
        commit_all(repo, 'initial')
        git(repo, 'checkout', '-q', '-b', 'feature')
        write_file(repo, 'app.py', 'def hello():\n    return "hello"\n')
        commit_all(repo, 'change greeting')
        previous = os.getcwd()
        os.chdir(repo)
        self.addCleanup(os.chdir, previous)
        return repo
