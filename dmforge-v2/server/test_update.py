"""Tests for update.sh, with a fake `docker` and a local git repository standing in for GitHub.
Run:  python3 -I -m unittest discover -s server -v   (from dmforge-v2/)"""
import os
import shutil
import stat
import subprocess
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPDATE_SH = os.path.join(ROOT, 'update.sh')

FAKE_DOCKER = r'''#!/usr/bin/env bash
# a stand-in for docker: records every call, and behaves as the test says
echo "$*" >> "$FAKE_DIR/calls.log"
case "$1 $2" in
  "compose ps") [ "${FAKE_RUNNING:-1}" = "1" ] && echo dmforge; exit 0 ;;
  "compose exec") [ -n "${FAKE_BACKUP_FAIL:-}" ] && exit 1; exit 0 ;;
  "compose build") [ -n "${FAKE_BUILD_FAIL:-}" ] && { echo "build exploded"; exit 1; }; exit 0 ;;
  "compose up") exit 0 ;;
  "image inspect") exit 0 ;;
  "inspect -f") if [ -n "${FAKE_BAD_VERSION:-}" ] && [ "$(cat VERSION)" = "$FAKE_BAD_VERSION" ]; then echo unhealthy; else echo healthy; fi; exit 0 ;;
esac
case "$1" in tag) exit 0 ;; esac
exit 0
'''


def git(cwd, *args, env=None):
    e = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@t', GIT_COMMITTER_NAME='t', GIT_COMMITTER_EMAIL='t@t')
    e.update(env or {})
    return subprocess.run(['git', *args], cwd=cwd, env=e, check=True, capture_output=True, text=True).stdout.strip()


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bare = os.path.join(self.tmp, 'origin.git')
        self.dev = os.path.join(self.tmp, 'dev')
        self.app = os.path.join(self.tmp, 'app')
        self.bin = os.path.join(self.tmp, 'bin')
        self.fake = os.path.join(self.tmp, 'fake')
        os.makedirs(self.bin)
        os.makedirs(self.fake)
        dk = os.path.join(self.bin, 'docker')
        with open(dk, 'w') as f:
            f.write(FAKE_DOCKER)
        os.chmod(dk, os.stat(dk).st_mode | stat.S_IEXEC)
        git(self.tmp, 'init', '--bare', '-b', 'dmforge-release', self.bare)
        git(self.tmp, 'init', '-b', 'dmforge-release', self.dev)
        shutil.copy(UPDATE_SH, os.path.join(self.dev, 'update.sh'))
        with open(os.path.join(self.dev, '.gitignore'), 'w') as f:
            f.write('update.log\n.update.lock\n.update.bad\n.env\ndata/\n')
        self.release('1.0.0')
        git(self.tmp, 'clone', '-q', '--branch', 'dmforge-release', self.bare, self.app)
        # the things that must survive every update
        os.makedirs(os.path.join(self.app, 'data'))
        with open(os.path.join(self.app, 'data', 'dmforge.db'), 'w') as f:
            f.write('PRECIOUS')
        with open(os.path.join(self.app, '.env'), 'w') as f:
            f.write('DMFORGE_TOKEN=secret')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def release(self, version, extra=None):
        with open(os.path.join(self.dev, 'VERSION'), 'w') as f:
            f.write(version + '\n')
        for name, text in (extra or {}).items():
            with open(os.path.join(self.dev, name), 'w') as f:
                f.write(text)
        os.chmod(os.path.join(self.dev, 'update.sh'), 0o755)
        git(self.dev, 'add', '-A')
        git(self.dev, 'commit', '-q', '-m', 'release ' + version)
        git(self.dev, 'push', '-q', self.bare, 'dmforge-release:dmforge-release')

    def run_update(self, *args, **env):
        e = dict(os.environ, PATH=self.bin + os.pathsep + os.environ['PATH'], FAKE_DIR=self.fake,
                 DMFORGE_HEALTH_WAIT='0', DMFORGE_HEALTH_TRIES='3')
        e.update({k: str(v) for k, v in env.items()})
        return subprocess.run(['bash', os.path.join(self.app, 'update.sh'), *args], cwd=self.app, env=e, capture_output=True, text=True)

    def calls(self):
        try:
            with open(os.path.join(self.fake, 'calls.log')) as f:
                return f.read().splitlines()
        except OSError:
            return []

    def log(self):
        try:
            with open(os.path.join(self.app, 'update.log')) as f:
                return f.read()
        except OSError:
            return ''

    def version(self):
        with open(os.path.join(self.app, 'VERSION')) as f:
            return f.read().strip()

    def test_nothing_new_does_nothing_and_says_nothing(self):
        r = self.run_update()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.calls(), [])
        self.assertEqual(self.log(), '')

    def test_a_new_release_is_installed(self):
        self.release('1.1.0')
        r = self.run_update()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(self.version(), '1.1.0')
        self.assertIn('Updated to 1.1.0', self.log())
        calls = self.calls()
        kinds = [c.split()[1] if c.startswith('compose') else c.split()[0] for c in calls]
        self.assertLess(kinds.index('exec'), kinds.index('build'))      # the database was copied before anything changed
        self.assertLess(kinds.index('build'), kinds.index('up'))
        self.assertIn('tag dmforge:v3 dmforge:previous', calls)
        self.assertEqual(open(os.path.join(self.app, 'data', 'dmforge.db')).read(), 'PRECIOUS')   # data and token untouched
        self.assertEqual(open(os.path.join(self.app, '.env')).read(), 'DMFORGE_TOKEN=secret')
        self.assertEqual(self.run_update().returncode, 0)
        self.assertEqual(len([c for c in self.calls() if c.startswith('compose build')]), 1)       # and it is not rebuilt again

    def test_no_update_when_the_database_cannot_be_copied(self):
        self.release('1.1.0')
        r = self.run_update(FAKE_BACKUP_FAIL=1)
        self.assertEqual(self.version(), '1.0.0')
        self.assertIn('NOT updating', self.log())
        self.assertFalse([c for c in self.calls() if c.startswith('compose build')])

    def test_a_build_that_fails_leaves_the_old_version_and_is_not_retried(self):
        self.release('1.1.0')
        r = self.run_update(FAKE_BUILD_FAIL=1)
        self.assertEqual(self.version(), '1.0.0')                                  # files put back
        self.assertIn('did not build', self.log())
        self.assertFalse([c for c in self.calls() if c.startswith('compose up')])  # the running container was never touched
        n = len([c for c in self.calls() if c.startswith('compose build')])
        self.run_update(FAKE_BUILD_FAIL=1)
        self.run_update()
        self.assertEqual(len([c for c in self.calls() if c.startswith('compose build')]), n)   # the same bad release is not tried every minute
        self.release('1.2.0')                                                       # a newer one is
        r = self.run_update()
        self.assertEqual(self.version(), '1.2.0')
        self.assertFalse(os.path.exists(os.path.join(self.app, '.update.bad')))

    def test_an_unhealthy_new_version_is_rolled_back(self):
        self.release('1.1.0')
        r = self.run_update(FAKE_BAD_VERSION='1.1.0')
        self.assertEqual(self.version(), '1.0.0')
        self.assertIn('did not come up healthy', self.log())
        self.assertIn('Back on 1.0.0. Healthy.', self.log())
        self.assertIn('tag dmforge:previous dmforge:v3', self.calls())
        ups = [c for c in self.calls() if c.startswith('compose up')]
        self.assertEqual(len(ups), 2)                                              # new, then old again
        self.run_update(FAKE_BAD_VERSION='1.1.0')
        self.assertEqual(len([c for c in self.calls() if c.startswith('compose build')]), 1)
        self.release('1.1.1')
        self.run_update()
        self.assertEqual(self.version(), '1.1.1')

    def test_a_release_that_replaces_update_sh_itself_finishes_cleanly(self):
        with open(UPDATE_SH) as f:
            newer = f.read().replace('# DM Forge: install', '# (newer copy) DM Forge: install')
        self.release('1.1.0', {'update.sh': newer})
        r = self.run_update()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn('Updated to 1.1.0', self.log())
        self.assertIn('(newer copy)', open(os.path.join(self.app, 'update.sh')).read())

    def test_only_one_update_runs_at_a_time(self):
        self.release('1.1.0')
        holder = subprocess.Popen(['bash', '-c', 'exec 9> .update.lock; flock 9; sleep 4'], cwd=self.app)
        try:
            for _ in range(50):
                if os.path.exists(os.path.join(self.app, '.update.lock')):
                    break
                import time
                time.sleep(0.05)
            import time
            time.sleep(0.3)
            r = self.run_update()
            self.assertEqual(r.returncode, 0)
            self.assertEqual(self.calls(), [])
            self.assertEqual(self.version(), '1.0.0')
        finally:
            holder.kill()

    def test_unreachable_github_is_quiet(self):
        git(self.app, 'remote', 'set-url', 'origin', os.path.join(self.tmp, 'does-not-exist.git'))
        self.release('1.1.0')
        r = self.run_update()
        self.assertEqual(r.returncode, 0)
        self.assertEqual(self.log(), '')
        self.assertEqual(self.calls(), [])

    def test_status(self):
        r = self.run_update('--status')
        self.assertEqual(r.returncode, 0)
        self.assertIn('Running: 1.0.0', r.stdout)

    def test_not_a_git_checkout_says_so(self):
        shutil.rmtree(os.path.join(self.app, '.git'))
        r = self.run_update()
        self.assertEqual(r.returncode, 1)
        self.assertIn('not a git checkout', self.log())


if __name__ == '__main__':
    unittest.main()
