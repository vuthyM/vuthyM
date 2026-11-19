"""Tests the helper's self-update: python3 test/update_test.py"""
import os, shutil, subprocess, sys, tempfile, unittest, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = b'<!doctype html><html><head><!--DMF_SERVER--></head><body>%s</body></html>'

def make_zip(path, version, html_tag=b'new', server=None, top='DM-Forge V2/', extra=None, version_text=None):
    server = server if server is not None else open(os.path.join(ROOT, 'helper', 'dmforge-server.py'), 'rb').read()
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr(top + 'DM-Forge.html', HTML % html_tag)
        z.writestr(top + 'dmforge-server.py', server)
        z.writestr(top + 'Start DM Forge.command', b'#!/bin/bash\n# new launcher\n')
        z.writestr(top + 'README.md', b'new readme')
        z.writestr(top + 'VERSION', (version_text if version_text is not None else version + '\n').encode())
        z.writestr(top + 'source/src/main.js', b'ignored')
        for name, data in (extra or {}).items():
            z.writestr(name, data)

class UpdateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix='dmf-upd-')
        self.app = os.path.join(self.tmp, 'DM Forge')
        self.dl = os.path.join(self.tmp, 'Downloads')
        self.trash = os.path.join(self.tmp, 'Trash')
        for d in (self.app, self.dl, self.trash):
            os.makedirs(d)
        shutil.copy(os.path.join(ROOT, 'helper', 'dmforge-server.py'), self.app)
        open(os.path.join(self.app, 'DM-Forge.html'), 'wb').write(HTML % b'old')
        open(os.path.join(self.app, 'VERSION'), 'w').write('2.0.0\n')
        open(os.path.join(self.app, 'Start DM Forge.command'), 'w').write('#!/bin/bash\n# old launcher\n')
        open(os.path.join(self.app, 'notes-i-added.txt'), 'w').write('mine')
        self.env = dict(os.environ, DMF_CONFIG_DIR=os.path.join(self.tmp, 'cfg'))

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def run_helper(self, *extra, stdin=None):
        return subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--downloads', self.dl, '--trash', self.trash, *extra],
                              capture_output=True, text=True, input=stdin, env=self.env, timeout=30)

    def read(self, name):
        return open(os.path.join(self.app, name), 'rb').read()

    def test_installs_newer_zip_and_trashes_it(self):
        z = os.path.join(self.dl, 'DM-Forge-V2.zip'); make_zip(z, '2.1.0')
        r = self.run_helper('--yes')
        self.assertIn('Updated to version 2.1.0', r.stdout, r.stdout + r.stderr)
        self.assertIn(b'new', self.read('DM-Forge.html')); self.assertEqual(self.read('VERSION').strip(), b'2.1.0')
        self.assertEqual(self.read('README.md'), b'new readme'); self.assertIn(b'new launcher', self.read('Start DM Forge.command'))
        self.assertEqual(self.read('notes-i-added.txt'), b'mine', 'files that are not app files are left alone')
        self.assertFalse(os.path.exists(z)); self.assertTrue(os.path.exists(os.path.join(self.trash, 'DM-Forge-V2.zip')))
        self.assertIn(b'old', open(os.path.join(self.app, '.previous', 'DM-Forge.html'), 'rb').read(), 'previous version kept')
        self.assertTrue(os.access(os.path.join(self.app, 'Start DM Forge.command'), os.X_OK))
        self.assertFalse(any(n.startswith('.dmforge-update-') for n in os.listdir(self.app)), 'no temp files left')

    def test_updates_install_automatically_by_default_without_asking(self):
        z = os.path.join(self.dl, 'DM-Forge-V2.zip'); make_zip(z, '2.1.0')
        r = subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--downloads', self.dl, '--trash', self.trash], capture_output=True, text=True, stdin=subprocess.DEVNULL, env=self.env, timeout=30)
        self.assertIn('Updated to version 2.1.0', r.stdout, r.stdout + r.stderr); self.assertNotIn('[Y/n]', r.stdout)
        self.assertIn(b'new', self.read('DM-Forge.html')); self.assertFalse(os.path.exists(z))
        # bad zips are still refused, automatically or not
        make_zip(os.path.join(self.dl, 'DM-Forge-V2 (1).zip'), '9.0.0', server=b'def broken(:\n')
        r = subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--downloads', self.dl, '--trash', self.trash], capture_output=True, text=True, stdin=subprocess.DEVNULL, env=self.env, timeout=30)
        self.assertNotIn('Updated', r.stdout); self.assertEqual(self.read('VERSION').strip(), b'2.1.0')

    def test_source_folder_is_not_installed(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0'); self.run_helper('--yes')
        self.assertFalse(os.path.exists(os.path.join(self.app, 'source'))); self.assertFalse(os.path.exists(os.path.join(self.app, 'main.js')))

    def test_same_or_older_version_does_nothing(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.0.0'); make_zip(os.path.join(self.dl, 'DM-Forge-V2 (1).zip'), '1.9.0')
        r = self.run_helper('--yes')
        self.assertNotIn('Updated', r.stdout); self.assertIn(b'old', self.read('DM-Forge.html')); self.assertEqual(len(os.listdir(self.dl)), 2)

    def test_picks_the_newest_of_several(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0', b'v21'); make_zip(os.path.join(self.dl, 'DM-Forge-V2 (1).zip'), '2.10.0', b'v210'); make_zip(os.path.join(self.dl, 'DM-Forge-V2 (2).zip'), '2.2.0', b'v22')
        self.run_helper('--yes')
        self.assertIn(b'v210', self.read('DM-Forge.html'), '2.10.0 is newer than 2.2.0')

    def test_asks_first_and_respects_no(self):
        z = os.path.join(self.dl, 'DM-Forge-V2.zip'); make_zip(z, '2.1.0')
        r = subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--ask', '--downloads', self.dl, '--trash', self.trash], capture_output=True, text=True, input='n\n', env=self.env, timeout=30)
        self.assertIn(b'old', self.read('DM-Forge.html')); self.assertTrue(os.path.exists(z), 'declined: zip untouched')
        # no terminal and no --yes: never installs silently
        r = self.run_helper('--ask')
        self.assertIn(b'old', self.read('DM-Forge.html'))
        r = subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--ask', '--downloads', self.dl, '--trash', self.trash], capture_output=True, text=True, input='\n', env=self.env, timeout=30)
        self.assertIn(b'old', self.read('DM-Forge.html'), 'with --ask and no terminal it must not install')

    def test_rejects_bad_zips(self):
        d = self.dl
        make_zip(os.path.join(d, 'DM-Forge-V2.zip'), '3.0.0', server=b'def broken(:\n')
        make_zip(os.path.join(d, 'DM-Forge-V2 (1).zip'), '3.1.0', version_text='3.1.0; rm -rf')
        with zipfile.ZipFile(os.path.join(d, 'DM-Forge-V2 (2).zip'), 'w') as z: z.writestr('DM-Forge V2/VERSION', '3.2.0')
        open(os.path.join(d, 'DM-Forge-V2 (3).zip'), 'wb').write(b'not a zip')
        with zipfile.ZipFile(os.path.join(d, 'DM-Forge-V2 (4).zip'), 'w') as z:
            z.writestr('DM-Forge V2/DM-Forge.html', b'<script>evil</script>'); z.writestr('DM-Forge V2/dmforge-server.py', b'x=1'); z.writestr('DM-Forge V2/VERSION', '3.4.0')
        make_zip(os.path.join(d, 'other.zip'), '9.9.9')
        r = self.run_helper('--yes')
        self.assertNotIn('Updated', r.stdout, r.stdout); self.assertIn(b'old', self.read('DM-Forge.html')); self.assertEqual(self.read('VERSION').strip(), b'2.0.0')

    def test_zip_paths_cannot_escape(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0', extra={'../../evil.txt': b'x', '/abs/evil.txt': b'x', 'DM-Forge V2/../DM-Forge.html': b'x'})
        self.run_helper('--yes')
        self.assertFalse(os.path.exists(os.path.join(self.tmp, 'evil.txt'))); self.assertFalse(os.path.exists('/abs/evil.txt'))
        self.assertIn(b'new', self.read('DM-Forge.html'))

    def test_zip_named_differently_is_ignored(self):
        make_zip(os.path.join(self.dl, 'something-else.zip'), '5.0.0'); make_zip(os.path.join(self.dl, 'DM-Forge-V1.zip'), '5.0.0')
        r = self.run_helper('--yes'); self.assertNotIn('Updated', r.stdout)

    def test_old_install_without_version_file_updates(self):
        os.unlink(os.path.join(self.app, 'VERSION'))
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0')
        self.assertIn('Updated', self.run_helper('--yes').stdout)

    def test_no_update_flag_and_no_downloads_folder(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0')
        subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--no-update', '--downloads', self.dl, '--yes'], capture_output=True, env=self.env, timeout=30)
        self.assertIn(b'old', self.read('DM-Forge.html'))
        r = subprocess.run([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--yes', '--downloads', os.path.join(self.tmp, 'nope')], capture_output=True, text=True, env=self.env, timeout=30)
        self.assertEqual(r.returncode, 0)

    def test_server_restarts_itself_after_updating_itself_and_remembers_the_vault(self):
        vault = os.path.join(self.tmp, 'Vault'); os.makedirs(vault)
        new_server = open(os.path.join(ROOT, 'helper', 'dmforge-server.py'), 'rb').read() + b'\n# NEW SERVER MARKER\n'
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0', server=new_server)
        p = subprocess.Popen([sys.executable, os.path.join(self.app, 'dmforge-server.py'), vault, '--yes', '--no-open', '--port', '8799', '--downloads', self.dl, '--trash', self.trash],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=self.env)
        try:
            lines = []
            for _ in range(40):
                ln = p.stdout.readline(); lines.append(ln)
                if '?t=' in ln: break
            out = ''.join(lines)
        finally:
            p.terminate(); p.wait(timeout=10)
        self.assertIn('Updated to version 2.1.0', out, out); self.assertIn('DM Forge 2.1.0 helper is running', out, out)
        self.assertIn(b'NEW SERVER MARKER', self.read('dmforge-server.py'))
        # second start: nothing asked, vault remembered
        p = subprocess.Popen([sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--no-open', '--port', '8798', '--downloads', self.dl],
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=self.env)
        try:
            lines = []
            for _ in range(40):
                ln = p.stdout.readline(); lines.append(ln)
                if '?t=' in ln: break
            out = ''.join(lines)
        finally:
            p.terminate(); p.wait(timeout=10)
        self.assertIn('Using your vault: ' + vault, out, out); self.assertNotIn('Install it', out)

    def _tty_run(self, answer):
        import pty, select, time
        pid, fd = pty.fork()
        if pid == 0:
            os.execve(sys.executable, [sys.executable, os.path.join(self.app, 'dmforge-server.py'), '--update-only', '--ask', '--downloads', self.dl, '--trash', self.trash], self.env)
        out = b''; sent = False; end = time.time() + 20
        while time.time() < end:
            r, _, _ = select.select([fd], [], [], 0.2)
            if r:
                try: chunk = os.read(fd, 4096)
                except OSError: break
                if not chunk: break
                out += chunk
                if not sent and b'[Y/n]' in out:
                    os.write(fd, answer); sent = True
            else:
                try:
                    if os.waitpid(pid, os.WNOHANG)[0]: break
                except ChildProcessError: break
        try: os.waitpid(pid, 0)
        except ChildProcessError: pass
        return out.decode(errors='replace')

    def test_in_a_real_terminal_enter_installs_and_n_declines(self):
        z = os.path.join(self.dl, 'DM-Forge-V2.zip'); make_zip(z, '2.1.0')
        out = self._tty_run(b'n\r')
        self.assertIn('Install it now?', out); self.assertIn(b'old', self.read('DM-Forge.html')); self.assertTrue(os.path.exists(z))
        out = self._tty_run(b'\r')
        self.assertIn('Updated to version 2.1.0', out, out); self.assertIn(b'new', self.read('DM-Forge.html')); self.assertFalse(os.path.exists(z))


class ExplainTest(unittest.TestCase):
    def load(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('dmf_server', os.path.join(ROOT, 'helper', 'dmforge-server.py'))
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

    def test_messages_say_what_to_do(self):
        from unittest import mock
        m = self.load(); d = tempfile.mkdtemp(); f = os.path.join(d, 'Forge of Spells.md'); open(f, 'w').close()
        err = PermissionError(1, 'Operation not permitted')
        class St:  # a file with the Finder "Locked" flag
            st_flags = 0x2
        with mock.patch('os.stat', return_value=St()):
            self.assertIn('is locked', m.explain_os_error(f, err)); self.assertIn('Locked', m.explain_os_error(f, err))
        with mock.patch('os.access', side_effect=lambda p, mode: p != f):
            self.assertIn('read-only', m.explain_os_error(f, err))
        with mock.patch('os.access', side_effect=lambda p, mode: p == f):
            msg = m.explain_os_error(f, err); self.assertIn('folder', msg); self.assertIn(os.path.basename(d), msg)
        msg = m.explain_os_error(f, err)
        self.assertIn('Files and Folders', msg); self.assertIn('Forge of Spells.md', msg); self.assertIn('Operation not permitted', msg)
        self.assertIn('that file', m.explain_os_error(None, err))
        shutil.rmtree(d)

class WriteTest(unittest.TestCase):
    def load(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('dmf_server2', os.path.join(ROOT, 'helper', 'dmforge-server.py'))
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

    def setUp(self):
        self.d = tempfile.mkdtemp(); self.m = self.load()
    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_normal_write_is_atomic_and_leaves_no_temp_files(self):
        f = os.path.join(self.d, 'sub', 'Note.md')
        self.assertEqual(self.m.write_file(f, b'one'), 'atomic'); self.assertEqual(open(f, 'rb').read(), b'one')
        self.assertEqual(self.m.write_file(f, b'two'), 'atomic'); self.assertEqual(open(f, 'rb').read(), b'two')
        self.assertEqual(os.listdir(os.path.dirname(f)), ['Note.md'])

    def test_falls_back_to_writing_in_place_when_the_folder_refuses_temp_files_or_renames(self):
        from unittest import mock
        f = os.path.join(self.d, 'Note.md'); open(f, 'wb').write(b'old text')
        for patched in ('tempfile.mkstemp', 'os.replace'):
            with mock.patch(patched, side_effect=PermissionError(13, 'Permission denied')):
                self.assertEqual(self.m.write_file(f, b'new text ' + patched.encode()), 'in-place')
            self.assertEqual(open(f, 'rb').read(), b'new text ' + patched.encode())
        self.assertEqual([n for n in os.listdir(self.d)], ['Note.md'], 'no temp file left behind')

    def test_a_new_note_is_created_directly_when_temp_files_are_refused(self):
        from unittest import mock
        f = os.path.join(self.d, 'Fresh.md')
        with mock.patch('tempfile.mkstemp', side_effect=PermissionError(13, 'Permission denied')):
            self.assertEqual(self.m.write_file(f, b'hello'), 'direct')
        self.assertEqual(open(f, 'rb').read(), b'hello')

    def test_if_the_in_place_write_fails_the_old_text_is_put_back(self):
        from unittest import mock
        f = os.path.join(self.d, 'Note.md'); open(f, 'wb').write(b'precious old text')
        real_open = open
        calls = []
        def flaky(path, mode='r', *a, **k):
            if path == f and mode == 'r+b':
                h = real_open(path, mode, *a, **k)
                class H:
                    def __enter__(s): return s
                    def __exit__(s, *x): h.close()
                    def seek(s, *x): return h.seek(*x)
                    def truncate(s): return h.truncate()
                    def write(s, d): h.write(d[:3]); raise PermissionError(13, 'Permission denied')
                return H()
            return real_open(path, mode, *a, **k)
        with mock.patch('tempfile.mkstemp', side_effect=PermissionError(13, 'Permission denied')), mock.patch('builtins.open', flaky):
            with self.assertRaises(PermissionError):
                self.m.write_file(f, b'brand new text')
        self.assertEqual(real_open(f, 'rb').read(), b'precious old text')

    def test_the_report_tries_each_step_and_cleans_up_after_itself(self):
        d = os.path.join(self.d, 'EPisodes'); os.makedirs(d); f = os.path.join(d, 'Session 3.md'); open(f, 'w').close()
        rep = '\n'.join(self.m.probe_folder(f))
        for step in ('list the folder', 'create a new file', 'rename a file', 'open this note for writing', 'make a sub-folder', 'remove it'):
            self.assertIn('ok      ' + step if step != 'create a new file' else 'ok      create a new file', rep)
        self.assertEqual(os.listdir(d), ['Session 3.md'], 'probe files are removed')
        self.assertIn('does not exist yet', '\n'.join(self.m.probe_folder(os.path.join(d, 'New.md'))))
        from unittest import mock
        with mock.patch('os.replace', side_effect=PermissionError(13, 'Permission denied')):
            bad = '\n'.join(self.m.probe_folder(f))
        self.assertIn('REFUSED rename a file inside the folder (error 13: Permission denied)', bad)
        self.assertEqual(os.listdir(d), ['Session 3.md'], 'and still cleaned up after a failure')
        full = self.m.diagnose(f, PermissionError(13, 'Permission denied'))
        self.assertIn('Steps tried', full); self.assertIn('Permissions: note: mode', full); self.assertIn('Helper version', full)

    def test_trash_moves_with_a_copy_fallback_and_never_loses_the_note(self):
        from unittest import mock
        self.m.State.root = self.d
        f = os.path.join(self.d, 'Camp', 'NPCs', 'Old.md'); os.makedirs(os.path.dirname(f)); open(f, 'w').write('text')
        t = os.path.join(self.d, '.trash', 'Camp', 'NPCs', 'Old.md')
        self.m.move_to_trash(f, t); self.assertTrue(os.path.exists(t)); self.assertFalse(os.path.exists(f))
        open(f, 'w').write('again')                    # a second note with the same name goes next to it
        self.m.move_to_trash(f, t)
        self.assertEqual(len(os.listdir(os.path.dirname(t))), 2)
        open(f, 'w').write('third')
        with mock.patch('os.rename', side_effect=PermissionError(13, 'Permission denied')):
            self.m.move_to_trash(f, t)
        self.assertFalse(os.path.exists(f)); self.assertEqual(len(os.listdir(os.path.dirname(t))), 3)
        open(f, 'w').write('fourth')
        with mock.patch('os.rename', side_effect=PermissionError(13, 'Permission denied')), mock.patch('os.unlink', side_effect=PermissionError(13, 'Permission denied')):
            with self.assertRaises(PermissionError): self.m.move_to_trash(f, t)
        self.assertEqual(open(f).read(), 'fourth', 'the original is untouched when it cannot be removed')

    def test_a_read_only_trash_folder_is_repaired_like_yours_was(self):
        from unittest import mock
        self.m.State.root = self.d
        f = os.path.join(self.d, 'Camp', 'EPisodes', 'S.md'); os.makedirs(os.path.dirname(f)); open(f, 'w').write('x')
        trash = os.path.join(self.d, '.trash'); os.makedirs(os.path.join(trash, 'Camp'))
        os.chmod(os.path.join(trash, 'Camp'), 0o555); os.chmod(trash, 0o555)
        real_access = os.access
        # this sandbox runs as root, which ignores permissions; make the checks see the real mode like a normal user would
        fake = lambda p, mode, *a, **k: bool(os.stat(p).st_mode & 0o200) if mode & os.W_OK else real_access(p, mode)
        real_mkdir = os.mkdir
        def strict_mkdir(p, *a, **k):
            if not os.stat(os.path.dirname(p)).st_mode & 0o200: raise PermissionError(13, 'Permission denied')
            return real_mkdir(p, *a, **k)
        with mock.patch('os.access', side_effect=fake), mock.patch('os.mkdir', side_effect=strict_mkdir):
            self.m.move_to_trash(f, os.path.join(trash, 'Camp', 'EPisodes', 'S.md'))
        self.assertTrue(os.path.exists(os.path.join(trash, 'Camp', 'EPisodes', 'S.md'))); self.assertFalse(os.path.exists(f))
        self.assertTrue(os.stat(trash).st_mode & 0o200, 'the owner can write to .trash again')

    def test_if_trash_cannot_be_repaired_a_sibling_folder_is_used_and_nothing_is_lost(self):
        from unittest import mock
        self.m.State.root = self.d
        f = os.path.join(self.d, 'Camp', 'N.md'); os.makedirs(os.path.dirname(f)); open(f, 'w').write('keep me')
        real = self.m._make_dirs_in_trash
        with mock.patch.object(self.m, '_make_dirs_in_trash', side_effect=PermissionError(13, 'Permission denied')):
            self.m.move_to_trash(f, os.path.join(self.d, '.trash', 'Camp', 'N.md'))
        self.assertFalse(os.path.exists(f)); self.assertEqual(open(os.path.join(self.d, '.dmforge-trash', 'Camp', 'N.md')).read(), 'keep me')

    def test_the_report_names_the_operation_the_failing_line_and_checks_the_trash(self):
        self.m.State.root = self.d
        f = os.path.join(self.d, 'Camp', 'EPisodes', 'S.md'); os.makedirs(os.path.dirname(f)); open(f, 'w').write('x')
        try:
            raise PermissionError(13, 'Permission denied')
        except PermissionError as e:
            rep = self.m.explain_os_error(f, e, 'trash')
        self.assertIn('While: moving the note to the vault', rep); self.assertIn('Failed at:', rep)
        self.assertIn('Steps tried in the .trash folder', rep); self.assertIn('ok      make the folders for it inside .trash', rep)
        self.assertIn('ok      move a file from the note\'s folder into .trash', rep)
        self.assertEqual(sorted(os.listdir(self.d)), ['Camp'], 'the probe leaves no .trash folder or files behind')

    def test_the_message_names_the_cause_and_the_restart_fix_and_shows_details(self):
        f = os.path.join(self.d, 'Note.md'); open(f, 'w').close()
        msg = self.m.explain_os_error(f, PermissionError(13, 'Permission denied'))
        self.assertIn('Command-Q', msg); self.assertIn('error 13', msg); self.assertIn('Note.md', msg); self.assertIn('note: mode', msg); self.assertIn('folder: mode', msg)

FAKE_CLAUDE = """#!/bin/bash
# stands in for Claude Code: records how it was started, then answers
if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi
if [ "$1" = "auth" ]; then echo "{\\"loggedIn\\": true, \\"authMethod\\": \\"oauth_token\\", \\"apiProvider\\": \\"firstParty\\", \\"configDirectory\\": \\"${CLAUDE_CONFIG_DIR:-/home/default/.claude}\\"}"; exit 0; fi
{ echo "ARGS:$*"; echo "CWD:$(pwd)"; echo "CONFIG:${CLAUDE_CONFIG_DIR:-none}"; echo "STDIN:"; cat; } > "$DMF_FAKE_LOG"
case "$(cat "$DMF_FAKE_LOG")" in *FAIL-PLEASE*) echo "Not logged in. Please run /login" >&2; exit 1;; esac
case "$(cat "$DMF_FAKE_LOG")" in *SLOW-PLEASE*) sleep 5;; esac
echo "The answer, in markdown."
"""

class ClaudeTest(unittest.TestCase):
    def setUp(self):
        import importlib.util
        self.d = tempfile.mkdtemp()
        self._env = dict(os.environ)
        os.environ['DMF_CONFIG_DIR'] = os.path.join(self.d, 'cfg')
        spec = importlib.util.spec_from_file_location('dmf_server3', os.path.join(ROOT, 'helper', 'dmforge-server.py'))
        self.m = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.m)
        self.fake = os.path.join(self.d, 'claude'); open(self.fake, 'w').write(FAKE_CLAUDE); os.chmod(self.fake, 0o755)
        self.log = os.path.join(self.d, 'log.txt')
        os.environ['DMF_CLAUDE_BIN'] = self.fake; os.environ['DMF_FAKE_LOG'] = self.log
    def tearDown(self):
        os.environ.clear(); os.environ.update(self._env); shutil.rmtree(self.d, ignore_errors=True)

    def test_status_reports_the_version(self):
        st = self.m.claude_status()
        self.assertTrue(st['available']); self.assertIn('9.9.9', st['version'])

    def test_status_when_it_is_missing(self):
        os.environ['DMF_CLAUDE_BIN'] = os.path.join(self.d, 'nope')
        st = self.m.claude_status()
        self.assertFalse(st['available']); self.assertIn('not found', st['reason'])

    def test_it_is_started_with_every_tool_off_in_an_empty_folder_and_gets_the_prompt_on_stdin(self):
        out = self.m.claude_ask('What does Sildar know?', system='Be brief.')
        self.assertEqual(out, 'The answer, in markdown.')
        log = open(self.log).read()
        args = log.split('\n')[0]
        for flag in ('-p', '--no-session-persistence', '--disable-slash-commands', '--strict-mcp-config', '--output-format text', '--system-prompt Be brief.'):
            self.assertIn(flag, args)
        self.assertRegex(args, r'--tools\s+--', 'tools are switched off (an empty list)')
        self.assertNotIn('--bare', args, 'bare mode would skip the keychain sign-in')
        cwd = [l for l in log.split('\n') if l.startswith('CWD:')][0][4:]
        self.assertIn('dmf-claude-', cwd); self.assertFalse(os.path.exists(cwd), 'the temporary folder is removed afterwards')
        self.assertTrue(log.split('STDIN:\n', 1)[1].strip() == 'What does Sildar know?', 'the prompt is passed on stdin, not on the command line')
        self.assertNotIn('Sildar', args)

    def test_a_model_name_is_checked(self):
        self.assertEqual(self.m.claude_ask('hi', model='claude-sonnet-5-5'), 'The answer, in markdown.')
        self.assertIn('--model claude-sonnet-5-5', open(self.log).read())
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('hi', model='x; rm -rf /')
        self.assertEqual(c.exception.status, 400)

    def test_refusals_are_clear(self):
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('   ')
        self.assertEqual(c.exception.status, 400)
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('x' * (self.m.CLAUDE_MAX_PROMPT + 1))
        self.assertEqual(c.exception.status, 413)
        os.environ['DMF_CLAUDE_BIN'] = os.path.join(self.d, 'nope')
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('hi')
        self.assertEqual(c.exception.status, 404); self.assertIn('Install it', c.exception.message)

    def test_a_failure_says_what_happened_and_how_to_fix_it(self):
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('FAIL-PLEASE')
        self.assertEqual(c.exception.status, 502); self.assertIn('Not logged in', c.exception.message); self.assertIn('Check sign-in', c.exception.message)

    def test_it_is_stopped_if_it_takes_too_long_and_only_one_runs_at_a_time(self):
        self.m.CLAUDE_TIMEOUT = 1
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('SLOW-PLEASE')
        self.assertEqual(c.exception.status, 504)
        self.m.CLAUDE_TIMEOUT = 20
        import threading
        res = {}
        t = threading.Thread(target=lambda: res.setdefault('a', self.m.claude_ask('SLOW-PLEASE'))); t.start()
        import time; time.sleep(1.0)
        with self.assertRaises(self.m.ApiError) as c: self.m.claude_ask('second')
        self.assertEqual(c.exception.status, 429)
        t.join()
        self.assertEqual(res['a'], 'The answer, in markdown.')

    def test_the_log_records_what_happened_but_never_what_was_sent_or_answered(self):
        self.m.claude_ask('My secret plot about Tresadore Manor')
        with self.assertRaises(self.m.ApiError): self.m.claude_ask('FAIL-PLEASE secret two')
        text = open(os.path.join(self.d, 'cfg', 'claude.log')).read()
        self.assertIn(' ok ', text); self.assertIn(' failed ', text); self.assertIn('chars_in=', text); self.assertIn('Not logged in', text)
        self.assertNotIn('Tresadore', text); self.assertNotIn('secret', text); self.assertNotIn('The answer, in markdown', text)

    def test_check_sign_in_report(self):
        r = self.m.claude_check()
        self.assertTrue(r['ok'], r['report'])
        for want in ('Claude Code used: ' + self.fake, 'Version: 9.9.9', 'Sign-in: signed in (method: oauth_token', 'Test question: answered', 'never what was sent'):
            self.assertIn(want, r['report'])
        os.environ['DMF_CLAUDE_BIN'] = os.path.join(self.d, 'nope')
        r = self.m.claude_check()
        self.assertFalse(r['ok']); self.assertIn('NOT FOUND', r['report'])

    def test_it_runs_claude_the_way_a_terminal_would_not_the_way_a_double_clicked_helper_does(self):
        # a login shell that has its own `claude` first on PATH and its own settings folder, like a .zshrc would give
        termbin = os.path.join(self.d, 'termbin'); os.makedirs(termbin)
        term_claude = os.path.join(termbin, 'claude'); open(term_claude, 'w').write(FAKE_CLAUDE.replace('9.9.9 (Fake Claude)', '1.2.3 (Terminal Claude)')); os.chmod(term_claude, 0o755)
        shell = os.path.join(self.d, 'fakeshell'); open(shell, 'w').write('#!/bin/bash\nexport CLAUDE_CONFIG_DIR=/terminal/config\nexport PATH="%s:$PATH"\nexec /bin/bash -c "$2"\n' % termbin); os.chmod(shell, 0o755)
        # the helper itself only knows about the other copy
        os.environ.pop('DMF_CLAUDE_BIN'); os.environ['SHELL'] = shell
        helperbin = os.path.join(self.d, 'helperbin'); os.makedirs(helperbin); shutil.copy(self.fake, os.path.join(helperbin, 'claude'))
        os.environ['PATH'] = helperbin + os.pathsep + self._env.get('PATH', '')
        os.environ.pop('CLAUDE_CONFIG_DIR', None)
        env, src = self.m.claude_env()
        self.assertEqual(src, 'terminal'); self.assertEqual(env.get('CLAUDE_CONFIG_DIR'), '/terminal/config')
        self.assertEqual(self.m.find_claude(env), term_claude, "the one a Terminal runs comes first, not the one on the helper's own PATH")
        self.assertIn(os.path.join(helperbin, 'claude'), self.m.claude_candidates(env), 'the other copy is still listed')
        self.assertIn('1.2.3', self.m.claude_status()['version'])
        self.assertEqual(self.m.claude_ask('hi'), 'The answer, in markdown.')
        self.assertIn('CONFIG:/terminal/config', open(self.log).read(), 'and it gets the Terminal settings folder')
        rep = self.m.claude_check()['report']
        self.assertIn('the environment of your Terminal', rep)
        self.assertIn('CLAUDE_CONFIG_DIR: helper not set, Terminal /terminal/config', rep)
        self.assertIn('Other copies on this Mac', rep)
        self.assertIn('settings folder: /terminal/config', rep)

    def test_if_the_login_shell_cannot_be_read_it_falls_back_to_the_helpers_own_environment(self):
        os.environ.pop('DMF_CLAUDE_BIN'); os.environ['SHELL'] = os.path.join(self.d, 'no-such-shell')
        env, src = self.m.claude_env()
        self.assertEqual(src, 'helper')

class RollbackTest(unittest.TestCase):
    def setUp(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location('dmf_server4', os.path.join(ROOT, 'helper', 'dmforge-server.py'))
        self.m = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.m)
        self.d = tempfile.mkdtemp()
        self.prev = os.path.join(self.d, '.previous'); os.makedirs(self.prev)
        for name, data in (('DM-Forge.html', b'old html'), ('dmforge-server.py', b'# old server'), ('Start DM Forge.command', b'#!/bin/bash\n# old'), ('README.md', b'old readme'), ('VERSION', b'2.10.0\n')):
            open(os.path.join(self.prev, name), 'wb').write(data)
            open(os.path.join(self.d, name), 'wb').write(b'NEW ' + data if name != 'VERSION' else b'2.11.0\n')
        open(os.path.join(self.d, 'mine.txt'), 'w').write('mine')
    def tearDown(self):
        shutil.rmtree(self.d, ignore_errors=True)

    def test_rolls_back_and_keeps_what_it_replaced(self):
        self.assertEqual(self.m.previous_version(self.d), '2.10.0')
        self.assertEqual(self.m.rollback(self.d), '2.10.0')
        self.assertEqual(open(os.path.join(self.d, 'DM-Forge.html'), 'rb').read(), b'old html')
        self.assertEqual(open(os.path.join(self.d, 'VERSION')).read().strip(), '2.10.0')
        kept = os.path.join(self.d, '.rolled-back')
        self.assertEqual(open(os.path.join(kept, 'DM-Forge.html'), 'rb').read(), b'NEW old html')
        self.assertEqual(open(os.path.join(kept, 'VERSION')).read().strip(), '2.11.0')
        self.assertEqual(open(os.path.join(self.d, 'mine.txt')).read(), 'mine', 'files that are not app files are untouched')
        self.assertTrue(os.access(os.path.join(self.d, 'Start DM Forge.command'), os.X_OK))

    def test_nothing_to_roll_back_to(self):
        shutil.rmtree(self.prev)
        self.assertIsNone(self.m.rollback(self.d))
        self.assertEqual(open(os.path.join(self.d, 'VERSION')).read().strip(), '2.11.0', 'nothing was changed')

    def test_the_command_line_flag_does_it_and_does_not_update_first(self):
        dl = os.path.join(self.d, 'dl'); os.makedirs(dl)
        make_zip(os.path.join(dl, 'DM-Forge-V2.zip'), '9.0.0')
        shutil.copy(os.path.join(ROOT, 'helper', 'dmforge-server.py'), os.path.join(self.d, 'dmforge-server.py'))
        r = subprocess.run([sys.executable, os.path.join(self.d, 'dmforge-server.py'), '--rollback', '--downloads', dl], capture_output=True, text=True, timeout=30, env=dict(os.environ, DMF_CONFIG_DIR=os.path.join(self.d, 'cfg')))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn('Rolled back from 2.11.0 to 2.10.0', r.stdout)
        self.assertTrue(os.path.exists(os.path.join(dl, 'DM-Forge-V2.zip')), 'the waiting zip was not installed over the rollback')


class TypedCommandsTest(unittest.TestCase):
    """The helper is running; the user types `update` in its window."""
    def setUp(self):
        import threading, queue
        self.tmp = tempfile.mkdtemp(prefix='dmf-cmd-')
        self.app = os.path.join(self.tmp, 'DM Forge'); self.dl = os.path.join(self.tmp, 'Downloads'); self.trash = os.path.join(self.tmp, 'Trash'); self.vault = os.path.join(self.tmp, 'Vault')
        for d in (self.app, self.dl, self.trash, self.vault):
            os.makedirs(d)
        shutil.copy(os.path.join(ROOT, 'helper', 'dmforge-server.py'), self.app)
        open(os.path.join(self.app, 'DM-Forge.html'), 'wb').write(HTML % b'old')
        open(os.path.join(self.app, 'VERSION'), 'w').write('2.0.0\n')
        open(os.path.join(self.app, 'Start DM Forge.command'), 'w').write('#!/bin/bash\n# old launcher\n')
        self.env = dict(os.environ, DMF_CONFIG_DIR=os.path.join(self.tmp, 'cfg'), DMF_COMMANDS='1')
        self.proc = subprocess.Popen([sys.executable, os.path.join(self.app, 'dmforge-server.py'), self.vault, '--port', '8795', '--no-open', '--no-update', '--downloads', self.dl, '--trash', self.trash],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=self.env, bufsize=1)
        self.q = queue.Queue(); self.out = ''
        def pump():
            for line in self.proc.stdout:
                self.q.put(line)
        threading.Thread(target=pump, daemon=True).start()
        self.wait_for('more: help')
        self.first_link = self.last_link()

    def tearDown(self):
        try: self.proc.kill()
        except OSError: pass
        shutil.rmtree(self.tmp, ignore_errors=True)

    def wait_for(self, text, timeout=15):
        import queue, time
        end = time.time() + timeout
        while time.time() < end:
            if text in self.out:
                return self.out
            try: self.out += self.q.get(timeout=0.2)
            except queue.Empty: pass
        self.fail('never saw %r in:\n%s' % (text, self.out))

    def wait_restart(self):
        """waits for the restarted helper to finish printing its start-up text, and forgets everything before it"""
        self.wait_for('Restarted.')
        i = self.out.index('Restarted.')
        self.out = self.out[i:]
        self.wait_for('more: help')

    def drain(self):
        import queue
        while True:
            try: self.out += self.q.get(timeout=0.3)
            except queue.Empty: return

    def send(self, line):
        self.drain(); self.out = ''          # from here on, only what the command prints
        self.proc.stdin.write(line + '\n'); self.proc.stdin.flush()

    def ping(self, link):
        import re, urllib.request, json
        m = re.search(r'http://127\.0\.0\.1:(\d+)/\?t=([\w-]+)', link)
        req = urllib.request.Request('http://127.0.0.1:%s/api/ping?path=' % m.group(1), headers={'X-DMF-Token': m.group(2)})
        with urllib.request.urlopen(req, timeout=5) as r: return m.group(1), m.group(2), json.loads(r.read())

    def last_link(self):
        import re
        found = re.findall(r'http://127\.0\.0\.1:\d+/\?t=[\w-]+', self.out)
        return found[-1] if found else self.first_link

    def test_it_tells_you_the_command(self):
        self.assertIn('type  update  and press Enter', self.out)

    def test_update_installs_restarts_on_the_same_link_and_keeps_the_window_open(self):
        port, token, info = self.ping(self.last_link())
        self.assertEqual(info['version'], '2.0.0')
        pid = self.proc.pid
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0')
        self.send('update')
        self.wait_for('Updated to version 2.1.0'); self.wait_for('Restarting DM Forge')
        self.wait_restart()
        p2, t2, info2 = self.ping(self.last_link())
        self.assertEqual((p2, t2), (port, token), 'the same port and the same link, so an open tab only needs a refresh')
        self.assertEqual(info2['version'], '2.1.0')
        self.assertIsNone(self.proc.poll(), 'the window (the process) is still there')
        self.assertEqual(self.proc.pid, pid, 'it replaced itself in place')
        self.assertFalse(os.path.exists(os.path.join(self.dl, 'DM-Forge-V2.zip')), 'the zip went to the Trash')
        self.assertIn('type  update  and press Enter', self.out, 'and it still listens for commands')

    def test_update_with_nothing_new_says_so_and_changes_nothing(self):
        self.send('update')
        self.wait_for('No newer DM Forge zip found'); self.wait_for('type update again')
        self.assertEqual(open(os.path.join(self.app, 'VERSION')).read().strip(), '2.0.0')
        self.assertEqual(self.ping(self.last_link())[2]['version'], '2.0.0')

    def test_a_second_update_after_a_restart_works_and_so_does_rollback(self):
        make_zip(os.path.join(self.dl, 'DM-Forge-V2.zip'), '2.1.0')
        self.send('update'); self.wait_restart()
        make_zip(os.path.join(self.dl, 'DM-Forge-V2-b.zip'), '2.2.0')
        self.send('update'); self.wait_for('Updated to version 2.2.0')
        self.wait_restart()
        self.assertEqual(self.ping(self.last_link())[2]['version'], '2.2.0')
        self.send('rollback'); self.wait_for('Rolled back from 2.2.0 to 2.1.0')
        self.wait_restart()
        self.assertEqual(self.ping(self.last_link())[2]['version'], '2.1.0')

    def test_help_unknown_words_and_quit(self):
        self.send('help'); self.wait_for('rollback  go back')
        self.send('banana'); self.wait_for('I do not know "banana"')
        self.send('quit')
        self.assertEqual(self.proc.wait(timeout=10), 0)
        self.drain()
        self.assertIn('Stopping...', self.out)


@unittest.skipUnless(sys.platform != 'win32' and os.path.exists('/dev/ptmx') and shutil.which('bash'), 'needs a pseudo-terminal and bash')
class TerminalTest(unittest.TestCase):
    """The helper inside a real terminal with job control, like Terminal.app. A helper the terminal considers to be in the background
    is stopped by the system as soon as it reads the terminal ("suspended (tty input)"), which froze DM Forge 2.13.0 at start-up."""
    def setUp(self):
        import pty, select
        self.pty, self.select = pty, select
        self.tmp = tempfile.mkdtemp(prefix='dmf-tty-')
        self.app = os.path.join(self.tmp, 'app'); self.vault = os.path.join(self.tmp, 'vault')
        os.makedirs(self.app); os.makedirs(self.vault)
        shutil.copy(os.environ.get('DMF_TEST_HELPER') or os.path.join(ROOT, 'helper', 'dmforge-server.py'), os.path.join(self.app, 'dmforge-server.py'))      # DMF_TEST_HELPER: try an older copy
        open(os.path.join(self.app, 'DM-Forge.html'), 'wb').write(HTML % b'x'); open(os.path.join(self.app, 'VERSION'), 'w').write('9.9.9\n')
        # a stand-in for an interactive login shell that tries to reach the terminal, as zsh -i does, and records whether it could
        self.seen = os.path.join(self.tmp, 'tty-seen.txt')
        self.shell = os.path.join(self.tmp, 'fakeshell')
        open(self.shell, 'w').write('#!/bin/bash\nif ( : </dev/tty ) 2>/dev/null; then echo TTY > "%s"; else echo NOTTY > "%s"; fi\nexec /bin/bash -c "$2"\n' % (self.seen, self.seen))
        os.chmod(self.shell, 0o755)
        env = dict(os.environ, SHELL=self.shell, DMF_CONFIG_DIR=os.path.join(self.tmp, 'cfg'), HOME=self.tmp, TERM='xterm', PS1='READY> ')
        env.pop('DMF_CLAUDE_BIN', None); env.pop('DMF_NO_LOGIN_SHELL', None)
        self.out = b''
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.execvpe('/bin/bash', ['bash', '--norc', '-i'], env)
        self.drain(1)

    def tearDown(self):
        import signal
        for d in os.listdir('/proc'):
            if d.isdigit() and int(d) != os.getpid():
                try: c = open('/proc/%s/cmdline' % d, 'rb').read().decode(errors='replace')
                except OSError: continue
                if self.app in c and 'bash' not in c.split('\0')[0]:
                    try: os.kill(int(d), signal.SIGKILL)
                    except OSError: pass
        try: os.kill(self.pid, signal.SIGKILL)
        except OSError: pass
        try: os.close(self.fd)
        except OSError: pass
        shutil.rmtree(self.tmp, ignore_errors=True)

    def drain(self, t):
        import time
        end = time.time() + t
        while time.time() < end:
            r, _, _ = self.select.select([self.fd], [], [], 0.2)
            if r:
                try: d = os.read(self.fd, 4096)
                except OSError: return
                if not d: return
                self.out += d

    def text(self): return self.out.decode(errors='replace')

    def helper_states(self):
        states = []
        for d in os.listdir('/proc'):
            if d.isdigit() and int(d) != os.getpid():
                try: c = open('/proc/%s/cmdline' % d, 'rb').read().decode(errors='replace').split('\0')
                except OSError: continue
                if len(c) > 2 and c[0].startswith('python') and self.app in c[1]:
                    try: states.append(open('/proc/%s/stat' % d).read().split(') ')[1].split()[0])
                    except OSError: pass
        return states

    def start(self, background, port):
        cmd = 'python3 "%s" "%s" --no-open --no-update --port %d' % (os.path.join(self.app, 'dmforge-server.py'), self.vault, port)
        os.write(self.fd, (cmd + (' &' if background else '') + '\n').encode())
        self.drain(4)
        import re
        m = re.search(r'http://127\.0\.0\.1:(\d+)/\?t=([\w-]+)', self.text())
        self.assertTrue(m, 'the helper did not start:\n' + self.text())
        return m.group(1), m.group(2)

    def api(self, port, token, op):
        import urllib.request, json
        req = urllib.request.Request('http://127.0.0.1:%s/api/%s?path=' % (port, op), headers={'X-DMF-Token': token})
        with urllib.request.urlopen(req, timeout=30) as r: return json.loads(r.read())

    def test_a_helper_that_is_not_in_front_of_the_terminal_is_not_stopped(self):
        port, token = self.start(background=True, port=8796)
        self.drain(3)
        self.assertNotIn('T', self.helper_states(), 'the terminal stopped the helper:\n' + self.text())
        self.assertNotIn('tty input', self.text())
        self.assertTrue(self.api(port, token, 'ping')['ok'], 'and it still answers the browser')
        self.assertNotIn('type  update', self.text(), 'it does not listen for typed commands while it is not in front')

    def test_in_front_it_listens_and_answers_help_and_quit(self):
        port, token = self.start(background=False, port=8797)
        self.assertIn('type  update  and press Enter', self.text())
        os.write(self.fd, b'help\n'); self.drain(2)
        self.assertIn('rollback  go back', self.text())
        self.assertNotIn('T', self.helper_states())
        os.write(self.fd, b'quit\n'); self.drain(3)
        self.assertIn('Stopping...', self.text())

    def test_the_shell_used_to_find_claude_is_started_without_a_terminal_and_the_helper_stays_responsive(self):
        port, token = self.start(background=False, port=8795)
        self.assertFalse(os.path.exists(self.seen), 'nothing starts a shell at launch')
        st = self.api(port, token, 'claude-status')           # first use of Claude: reads the login shell's settings
        self.assertTrue(os.path.exists(self.seen), 'the login shell was started')
        self.assertEqual(open(self.seen).read().strip(), 'NOTTY', 'with no way to reach the terminal, so it cannot take it over')
        self.assertNotIn('T', self.helper_states())
        os.write(self.fd, b'help\n'); self.drain(2)
        self.assertIn('rollback  go back', self.text(), 'and the window still answers')

    def test_typing_update_with_nothing_new_keeps_the_window_alive(self):
        port, token = self.start(background=False, port=8794)
        os.write(self.fd, b'update\n'); self.drain(3)
        self.assertIn('No newer DM Forge zip found', self.text())
        self.assertNotIn('T', self.helper_states())
        self.assertTrue(self.api(port, token, 'ping')['ok'])

    @unittest.skipUnless(os.environ.get('DMF_TEST_HELPER'), 'set DMF_TEST_HELPER to an older helper to try upgrading from it')
    def test_starting_an_older_helper_with_a_newer_zip_waiting_installs_it_and_comes_up_working(self):
        dl = os.path.join(self.tmp, 'Downloads'); tr = os.path.join(self.tmp, 'Trash'); os.makedirs(dl); os.makedirs(tr)
        open(os.path.join(self.app, 'VERSION'), 'w').write('2.13.0\n')
        make_zip(os.path.join(dl, 'DM-Forge-V2.zip'), '2.13.1')
        cmd = 'python3 "%s" "%s" --no-open --port 8793 --downloads "%s" --trash "%s"' % (os.path.join(self.app, 'dmforge-server.py'), self.vault, dl, tr)
        os.write(self.fd, (cmd + '\n').encode())
        self.drain(8)
        import re
        self.assertIn('Updated to version 2.13.1', self.text())
        m = re.search(r'http://127\.0\.0\.1:(\d+)/\?t=([\w-]+)', self.text())
        self.assertTrue(m, self.text())
        self.assertNotIn('tty input', self.text()); self.assertNotIn('T', self.helper_states())
        self.assertTrue(self.api(m.group(1), m.group(2), 'ping')['ok'])
        os.write(self.fd, b'help\n'); self.drain(2)
        self.assertIn('rollback  go back', self.text())
        self.assertEqual(open(os.path.join(self.app, 'VERSION')).read().strip(), '2.13.1')


class PeekTest(unittest.TestCase):
    def test_peek_finds_the_newest_good_zip_cheaply(self):
        tmp = tempfile.mkdtemp(prefix='dmf-peek-')
        try:
            sys.path.insert(0, os.path.join(ROOT, 'helper'))
            import importlib.util
            spec = importlib.util.spec_from_file_location('dmserver', os.path.join(ROOT, 'helper', 'dmforge-server.py'))
            mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
            self.assertIsNone(mod.peek_update(tmp, '2.0.0'))
            open(os.path.join(tmp, 'DM-Forge-V2-bad.zip'), 'w').write('nope')
            make_zip(os.path.join(tmp, 'DM-Forge-V2.zip'), '2.1.0')
            make_zip(os.path.join(tmp, 'DM-Forge-V2 (1).zip'), '2.2.0')
            got = mod.peek_update(tmp, '2.0.0')
            self.assertEqual(got[0], '2.2.0'); self.assertTrue(got[1].endswith('(1).zip'))
            self.assertIsNone(mod.peek_update(tmp, '2.2.0'), 'not newer than what is installed')
            self.assertEqual(len(mod._ZIP_SEEN), 3, 'each zip is checked once and remembered')
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    unittest.main(verbosity=1)
