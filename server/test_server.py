"""Tests for the V3 server. Run:  python3 -I -m unittest discover -s server -v   (from dmforge-v2/)"""
import http.client
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dmforge_db as D  # noqa: E402
import dmforge_hosted as H  # noqa: E402
import dmforge_io as IO  # noqa: E402


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.s = D.Store(':memory:')

    def test_write_read_list(self):
        r = self.s.write('NPCs/Mira.md', b'# Mira\n')
        self.assertEqual(r['version'], 1)
        data, v, _ = self.s.read('NPCs/Mira.md')
        self.assertEqual((data, v), (b'# Mira\n', 1))
        self.assertEqual(self.s.list(''), [{'name': 'NPCs', 'kind': 'dir'}])
        self.assertEqual(self.s.list('NPCs'), [{'name': 'Mira.md', 'kind': 'file'}])
        self.assertTrue(self.s.exists('NPCs'))
        self.assertTrue(self.s.exists('NPCs/Mira.md'))
        self.assertFalse(self.s.exists('NPCs/Nope.md'))
        with self.assertRaises(D.StoreError) as e:
            self.s.list('Nope')
        self.assertEqual(e.exception.status, 404)

    def test_paths_are_confined_and_md_only(self):
        for bad in ('../x.md', 'a/../../x.md', 'a\x00.md'):
            with self.assertRaises(D.StoreError):
                self.s.write(bad, b'x')
        with self.assertRaises(D.StoreError):
            self.s.write('image.png', b'x')
        with self.assertRaises(D.StoreError):
            self.s.write('.hidden/x.md', b'x')
        with self.assertRaises(D.StoreError):
            self.s.mkdir('.secret')
        self.assertEqual(D.clean_path('/a//b/./c.md'), 'a/b/c.md')

    def test_versions_grow_and_history_keeps_everything(self):
        self.s.write('a.md', b'one')
        self.s.write('a.md', b'two')
        self.s.write('a.md', b'three')
        self.assertEqual(self.s.read('a.md')[1], 3)
        h = self.s.history('a.md')
        self.assertEqual([x['version'] for x in h], [3, 2, 1])
        self.assertEqual(self.s.version_data('a.md', 1), b'one')
        self.assertEqual(self.s.version_data('a.md', 2), b'two')

    def test_identical_write_makes_no_new_version(self):
        self.s.write('a.md', b'one')
        r = self.s.write('a.md', b'one')
        self.assertFalse(r['changed'])
        self.assertEqual(self.s.read('a.md')[1], 1)

    def test_base_version_conflict_carries_current_text(self):
        self.s.write('a.md', b'one')
        self.s.write('a.md', b'two', base=1)
        with self.assertRaises(D.Conflict) as c:
            self.s.write('a.md', b'mine', base=1)
        self.assertEqual(c.exception.kind, 'changed')
        self.assertEqual(c.exception.current['data'], b'two')
        self.assertEqual(c.exception.current['version'], 2)
        self.assertEqual(self.s.read('a.md')[0], b'two')  # nothing was overwritten

    def test_replayed_write_is_not_a_conflict(self):
        self.s.write('a.md', b'one')
        self.s.write('a.md', b'two', base=1)
        r = self.s.write('a.md', b'two', base=1)  # the reply was lost, so the app sends it again
        self.assertFalse(r['changed'])
        self.assertEqual(r['version'], 2)
        self.assertEqual(len(self.s.history('a.md')), 2)

    def test_new_note_that_already_exists_conflicts(self):
        self.s.write('a.md', b'one')
        with self.assertRaises(D.Conflict) as c:
            self.s.write('a.md', b'other', base=0)
        self.assertEqual(c.exception.kind, 'exists')

    def test_edit_of_a_note_trashed_elsewhere_conflicts_as_deleted(self):
        self.s.write('a.md', b'one')
        self.s.trash('a.md')
        with self.assertRaises(D.Conflict) as c:
            self.s.write('a.md', b'edited offline', base=1)
        self.assertEqual(c.exception.kind, 'deleted')
        self.assertIsNone(c.exception.current)
        self.assertFalse(self.s.exists('a.md'))

    def test_delete_of_a_note_edited_elsewhere_conflicts(self):
        self.s.write('a.md', b'one')
        self.s.write('a.md', b'two', base=1)
        with self.assertRaises(D.Conflict):
            self.s.trash('a.md', base=1)
        self.assertTrue(self.s.exists('a.md'))

    def test_trash_and_restore(self):
        self.s.write('NPCs/a.md', b'one')
        self.s.trash('NPCs/a.md')
        self.assertFalse(self.s.exists('NPCs/a.md'))
        tl = self.s.trash_list()
        self.assertEqual([t['path'] for t in tl], ['.trash/NPCs/a.md'])
        back = self.s.trash_restore('.trash/NPCs/a.md')
        self.assertEqual(back, 'NPCs/a.md')
        self.assertEqual(self.s.read('NPCs/a.md')[0], b'one')
        self.assertEqual(self.s.trash_list(), [])

    def test_restore_beside_a_newer_note(self):
        self.s.write('a.md', b'old')
        self.s.trash('a.md')
        self.s.write('a.md', b'new', base=0)
        back = self.s.trash_restore('.trash/a.md')
        self.assertEqual(back, 'a (restored).md')
        self.assertEqual(self.s.read('a.md')[0], b'new')
        self.assertEqual(self.s.read('a (restored).md')[0], b'old')

    def test_version_numbers_do_not_restart_after_trash(self):
        self.s.write('a.md', b'1')
        self.s.write('a.md', b'2')
        self.s.trash('a.md')
        r = self.s.write('a.md', b'3', base=0)
        self.assertGreater(r['version'], 2)

    def test_undo_push(self):
        self.s.write('a.md', b'a1')
        self.s.write('b.md', b'b1')
        self.s.write('a.md', b'a2', push='p1')
        self.s.write('c.md', b'c1', push='p1')
        self.s.trash('b.md', push='p1')
        info = self.s.undo_info()
        self.assertEqual(info['available']['id'], 'p1')
        self.assertEqual((info['available']['written'], info['available']['trashed']), (2, 1))
        r = self.s.undo_push()
        self.assertEqual(r['conflicts'], [])
        self.assertEqual(self.s.read('a.md')[0], b'a1')
        self.assertEqual(self.s.read('b.md')[0], b'b1')
        self.assertFalse(self.s.exists('c.md'))
        self.assertIsNone(self.s.undo_info()['available'])

    def test_undo_leaves_changed_notes_alone_unless_forced(self):
        self.s.write('a.md', b'a1')
        self.s.write('a.md', b'a2', push='p1')
        self.s.write('a.md', b'a3')  # edited again after the push
        r = self.s.undo_push()
        self.assertEqual(r, {'conflicts': ['a.md']})
        self.assertEqual(self.s.read('a.md')[0], b'a3')
        r = self.s.undo_push(force=True)
        self.assertEqual(self.s.read('a.md')[0], b'a1')
        # the edit that was undone is still in the history
        self.assertIn(b'a3', [self.s.version_data('a.md', v['version']) for v in self.s.history('a.md')])

    def test_only_the_last_pushes_are_kept(self):
        for i in range(D.UNDO_KEEP + 4):
            self.s.write('n%d.md' % i, b'x', push='p%d' % i)
        self.assertEqual(self.s.undo_info()['count'], D.UNDO_KEEP)

    def test_changes_feed(self):
        a = self.s.changes(0)
        self.assertEqual(a['changes'], [])
        self.s.write('a.md', b'1')
        self.s.write('b.md', b'1')
        c1 = self.s.changes(0)
        self.assertEqual(sorted(x['path'] for x in c1['changes']), ['a.md', 'b.md'])
        self.s.write('a.md', b'2')
        self.s.trash('b.md')
        c2 = self.s.changes(c1['seq'])
        got = {x['path']: x['action'] for x in c2['changes']}
        self.assertEqual(got, {'a.md': 'write', 'b.md': 'trash'})
        self.assertEqual(self.s.changes(c2['seq'])['changes'], [])

    def test_snapshot(self):
        self.s.write('a.md', b'1')
        self.s.write('d/b.md', b'1')
        snap = self.s.snapshot()
        self.assertEqual([f['path'] for f in snap['files']], ['a.md', 'd/b.md'])

    def test_search(self):
        self.s.write('NPCs/Mira.md', b'# Mira\nThe ferry keeper of Phandalin.')
        self.s.write('Places/Phandalin.md', b'A small town.')
        paths = [r['path'] for r in self.s.search('phand')]
        self.assertEqual(sorted(paths), ['NPCs/Mira.md', 'Places/Phandalin.md'])
        self.assertEqual([r['path'] for r in self.s.search('ferry keeper')], ['NPCs/Mira.md'])
        self.s.trash('NPCs/Mira.md')
        self.assertEqual([r['path'] for r in self.s.search('ferry')], [])
        self.assertEqual(self.s.search('"; DROP'), [])
        self.assertEqual(self.s.search(''), [])

    def test_mkdir_and_folders(self):
        self.s.mkdir('Sessions')
        self.assertEqual(self.s.list(''), [{'name': 'Sessions', 'kind': 'dir'}])
        self.assertEqual(self.s.list('Sessions'), [])
        self.s.write('Sessions/1.md', b'x')
        self.assertEqual(self.s.list('Sessions'), [{'name': '1.md', 'kind': 'file'}])

    def test_failed_write_changes_nothing(self):
        self.s.write('a.md', b'1')
        with self.assertRaises(D.Conflict):
            self.s.write('a.md', b'2', base=7, push='p1')
        self.assertEqual(self.s.read('a.md')[1], 1)
        self.assertIsNone(self.s.undo_info()['available'])


class DiskTests(unittest.TestCase):
    def test_survives_reopen_and_backup_is_a_real_database(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, 'x.db')
            s = D.Store(p)
            s.write('a.md', b'kept')
            s.write('a.md', b'kept 2')
            b = s.backup_to(os.path.join(d, 'bk', 'copy.db'))
            s.close()
            s2 = D.Store(p)
            self.assertEqual(s2.read('a.md')[0], b'kept 2')
            self.assertEqual(len(s2.history('a.md')), 2)
            s2.close()
            c = sqlite3.connect(b)
            self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(c.execute("SELECT content FROM files WHERE path='a.md'").fetchone()[0], b'kept 2')
            c.close()

    def test_concurrent_writers_do_not_lose_notes(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'x.db'))
            errs = []

            def work(k):
                try:
                    for i in range(25):
                        s.write('n%d_%d.md' % (k, i), ('t%d' % i).encode())
                except Exception as e:  # pragma: no cover
                    errs.append(e)
            ts = [threading.Thread(target=work, args=(k,)) for k in range(6)]
            [t.start() for t in ts]
            [t.join() for t in ts]
            self.assertEqual(errs, [])
            self.assertEqual(s.counts()['notes'], 150)
            s.close()


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.app = os.path.join(cls.tmp.name, 'DM-Forge.html')
        with open(cls.app, 'w') as f:
            f.write('<!doctype html><html><head><!--DMF_SERVER--></head><body>app</body></html>')
        cls.token = 'test-token-0123456789abcdef'
        cls.srv = H.make_server(cls.tmp.name, cls.app, '127.0.0.1', 0, 'Test vault', (), cls.token)
        cls.port = cls.srv.server_address[1]
        cls.th = threading.Thread(target=cls.srv.serve_forever, daemon=True)
        cls.th.start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        H.State.store.close()
        cls.tmp.cleanup()

    def req(self, method, path, body=None, headers=None, token=True):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        h = dict(headers or {})
        if token:
            h['X-DMF-Token'] = self.token
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        data = r.read()
        out = (r.status, data, dict((k.lower(), v) for k, v in r.getheaders()))
        c.close()
        return out

    def js(self, *a, **k):
        st, data, hd = self.req(*a, **k)
        return st, (json.loads(data) if data else None), hd

    def test_api_needs_the_token(self):
        self.assertEqual(self.req('GET', '/api/ping', token=False)[0], 401)
        st, data, _ = self.req('GET', '/api/ping', headers={'X-DMF-Token': 'wrong'}, token=False)
        self.assertEqual(st, 401)
        st, j, _ = self.js('GET', '/api/ping')
        self.assertEqual(st, 200)
        self.assertEqual(j['name'], 'Test vault')

    def test_healthz_needs_nothing(self):
        self.assertEqual(self.req('GET', '/healthz', token=False)[0], 200)

    def test_login_flow_and_app_injection(self):
        st, body, _ = self.req('GET', '/', token=False)
        self.assertEqual(st, 200)
        self.assertIn(b'Enter your access token', body)
        self.assertNotIn(b'window.__DMF_SERVER__', body)
        st, body, hd = self.req('POST', '/login', body=b'token=nope', headers={'Content-Type': 'application/x-www-form-urlencoded'}, token=False)
        self.assertEqual(st, 401)
        st, body, hd = self.req('POST', '/login', body=('token=' + self.token).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'}, token=False)
        self.assertEqual(st, 303)
        cookie = hd['set-cookie'].split(';')[0]
        self.assertIn('HttpOnly', hd['set-cookie'])
        self.assertIn('SameSite=Strict', hd['set-cookie'])
        H.State.fails.clear()
        st, body, _ = self.req('GET', '/', headers={'Cookie': cookie}, token=False)
        self.assertEqual(st, 200)
        self.assertIn(b'window.__DMF_SERVER__={"name": "Test vault", "token": "", "hosted": true}', body)
        self.assertNotIn(self.token.encode(), body)  # the token never goes into the page
        st, j, _ = self.js('GET', '/api/ping', headers={'Cookie': cookie}, token=False)
        self.assertEqual(st, 200)

    def test_wrong_tokens_are_rate_limited(self):
        H.State.fails.clear()
        for _ in range(6):
            self.req('GET', '/api/ping', headers={'X-DMF-Token': 'bad'}, token=False)
        self.assertEqual(self.req('GET', '/api/ping')[0], 429)  # even the right token waits
        H.State.fails.clear()
        self.assertEqual(self.req('GET', '/api/ping')[0], 200)

    def test_cross_site_origin_is_refused(self):
        st, _, _ = self.req('GET', '/api/ping', headers={'Origin': 'https://evil.example'})
        self.assertEqual(st, 403)
        st, _, _ = self.req('GET', '/api/ping', headers={'Origin': 'http://127.0.0.1:%d' % self.port})
        self.assertEqual(st, 200)

    def test_write_read_list_trash_over_http(self):
        st, j, _ = self.js('POST', '/api/write?path=HTTP/Note.md', body='hello')
        self.assertEqual((st, j['version']), (200, 1))
        st, data, hd = self.req('GET', '/api/read?path=HTTP/Note.md')
        self.assertEqual((st, data), (200, b'hello'))
        self.assertEqual(hd['x-dmf-version'], '1')
        st, j, _ = self.js('GET', '/api/list?path=HTTP')
        self.assertEqual(j, [{'name': 'Note.md', 'kind': 'file'}])
        self.assertEqual(self.js('GET', '/api/exists?path=HTTP/Note.md')[1], {'exists': True})
        self.assertEqual(self.req('GET', '/api/read?path=HTTP/Nope.md')[0], 404)
        self.assertEqual(self.js('POST', '/api/trash?path=HTTP/Note.md')[0], 200)
        self.assertEqual(self.req('GET', '/api/read?path=HTTP/Note.md')[0], 404)
        st, j, _ = self.js('GET', '/api/trash-list')
        self.assertIn('.trash/HTTP/Note.md', [t['path'] for t in j])
        st, j, _ = self.js('POST', '/api/trash-restore?path=.trash/HTTP/Note.md')
        self.assertEqual(j['path'], 'HTTP/Note.md')

    def test_conflict_over_http_is_409_with_the_current_text(self):
        self.js('POST', '/api/write?path=C/n.md', body='v1')
        st, j, _ = self.js('POST', '/api/write?path=C/n.md&base=1', body='v2')
        self.assertEqual((st, j['version']), (200, 2))
        st, j, _ = self.js('POST', '/api/write?path=C/n.md&base=1', body='mine')
        self.assertEqual(st, 409)
        self.assertEqual(j['conflict'], 'changed')
        self.assertEqual(j['current'], {'version': 2, 'mtime': j['current']['mtime'], 'text': 'v2'})
        self.assertEqual(self.req('GET', '/api/read?path=C/n.md')[1], b'v2')

    def test_non_markdown_and_traversal_refused(self):
        self.assertEqual(self.req('POST', '/api/write?path=x.png', body='x')[0], 400)
        self.assertEqual(self.req('POST', '/api/write?path=../x.md', body='x')[0], 400)
        self.assertEqual(self.req('POST', '/api/write?path=a%00.md', body='x')[0], 400)

    def test_undo_changes_history_search_over_http(self):
        self.js('POST', '/api/write?path=U/a.md', body='one')
        self.js('POST', '/api/write?path=U/a.md&push=zz1', body='two')
        st, j, _ = self.js('GET', '/api/undo-info')
        self.assertEqual(j['available']['id'], 'zz1')
        st, j, _ = self.js('POST', '/api/undo-push', body='{}')
        self.assertEqual(j['restored'], 1)
        self.assertEqual(self.req('GET', '/api/read?path=U/a.md')[1], b'one')
        st, j, _ = self.js('GET', '/api/history?path=U/a.md')
        self.assertEqual(len(j), 3)  # one, two, and the undo
        st, data, _ = self.req('GET', '/api/version?path=U/a.md&v=2')
        self.assertEqual(data, b'two')
        st, j, _ = self.js('GET', '/api/changes?since=0')
        self.assertIn('U/a.md', [c['path'] for c in j['changes']])
        st, j, _ = self.js('GET', '/api/search?q=one')
        self.assertIn('U/a.md', [r['path'] for r in j])

    def test_host_allow_list(self):
        H.State.hosts = ('dm.tail1234.ts.net',)
        try:
            c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
            c.request('GET', '/api/ping', headers={'Host': 'evil.example', 'X-DMF-Token': self.token})
            self.assertEqual(c.getresponse().status, 403)
            c.close()
            c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
            c.request('GET', '/api/ping', headers={'Host': 'dm.tail1234.ts.net', 'X-DMF-Token': self.token})
            self.assertEqual(c.getresponse().status, 200)
            c.close()
            self.assertEqual(self.req('GET', '/healthz', token=False)[0], 200)  # the Docker health check needs no Host
        finally:
            H.State.hosts = ()

    def test_service_worker_and_app_header(self):
        st, body, hd = self.req('GET', '/sw.js', token=False)
        self.assertEqual(st, 200)
        self.assertIn('javascript', hd['content-type'])
        self.assertEqual(hd['service-worker-allowed'], '/')
        self.assertIn(b'dmforge-shell', body)
        H.State.fails.clear()
        st, body, hd = self.req('POST', '/login', body=('token=' + self.token).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Proto': 'https'}, token=False)
        cookie = hd['set-cookie']
        self.assertIn('Secure', cookie)  # behind Tailscale HTTPS the cookie is marked Secure
        st, body, hd = self.req('GET', '/', headers={'Cookie': cookie.split(';')[0]}, token=False)
        self.assertEqual(hd.get('x-dmf-app'), '1')
        st, body, hd = self.req('GET', '/', token=False)
        self.assertNotIn('x-dmf-app', hd)  # the sign-in page is never kept by the worker

    def test_backup_endpoint(self):
        st, j, _ = self.js('POST', '/api/backup')
        self.assertEqual(st, 200)
        self.assertTrue(os.path.exists(os.path.join(self.tmp.name, 'backups', j['file'])))

    def test_unknown_and_helper_only_requests(self):
        self.assertEqual(self.req('GET', '/api/nope')[0], 404)
        self.assertEqual(self.js('GET', '/api/claude-status')[1]['available'], False)
        self.assertEqual(self.req('POST', '/api/update-install')[0], 404)


class IoTests(unittest.TestCase):
    def mkvault(self, d, files):
        for rel, data in files.items():
            full = os.path.join(d, *rel.split('/'))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, 'wb') as f:
                f.write(data)

    def test_import_dry_run_then_real(self):
        with tempfile.TemporaryDirectory() as d:
            v = os.path.join(d, 'vault')
            self.mkvault(v, {'Camp/NPCs/Mira.md': b'# Mira', 'Camp/Maps/m.svg': b'<svg/>', '.obsidian/app.json': b'{}',
                             '.trash/old.md': b'x', 'Camp/.hidden.md': b'x'})
            s = D.Store(':memory:')
            r = IO.import_folder(s, v, dry_run=True)
            self.assertEqual(sorted(r['new']), ['Camp/Maps/m.svg', 'Camp/NPCs/Mira.md'])
            self.assertEqual(s.counts()['notes'], 0)
            r = IO.import_folder(s, v)
            self.assertEqual(s.counts()['notes'], 2)
            self.assertEqual(s.read('Camp/Maps/m.svg')[0], b'<svg/>')
            self.assertEqual(s.history('Camp/NPCs/Mira.md')[0]['action'], 'import')
            r = IO.import_folder(s, v)
            self.assertEqual((r['new'], r['same']), ([], 2))

    def test_import_never_replaces_a_different_note_unless_told(self):
        with tempfile.TemporaryDirectory() as d:
            v = os.path.join(d, 'vault')
            self.mkvault(v, {'a.md': b'from disk'})
            s = D.Store(':memory:')
            s.write('a.md', b'edited in the app')
            r = IO.import_folder(s, v)
            self.assertEqual(r['changed'], ['a.md'])
            self.assertEqual(s.read('a.md')[0], b'edited in the app')
            r = IO.import_folder(s, v, overwrite=True)
            self.assertEqual(r['updated'], ['a.md'])
            self.assertEqual(s.read('a.md')[0], b'from disk')
            self.assertEqual(s.version_data('a.md', 1), b'edited in the app')

    def test_export_round_trip_is_byte_exact(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(':memory:')
            odd = '---\r\nrole: Smith\r\n---\r\nCafé ☕ 日本語\r\n'.encode('utf-8')
            s.write('Camp/NPCs/Ünï — Test.md', odd)
            s.write('Camp/b.md', b'two')
            out = os.path.join(d, 'out')
            r = IO.export_folder(s, out)
            self.assertEqual((r['written'], r['same']), (2, 0))
            with open(os.path.join(out, 'Camp', 'NPCs', 'Ünï — Test.md'), 'rb') as f:
                self.assertEqual(f.read(), odd)
            r = IO.export_folder(s, out)
            self.assertEqual((r['written'], r['same']), (0, 2))
            s2 = D.Store(':memory:')
            IO.import_folder(s2, out)
            self.assertEqual(s2.read('Camp/NPCs/Ünï — Test.md')[0], odd)

    def test_export_moves_deleted_notes_aside_and_leaves_strangers(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(':memory:')
            s.write('a.md', b'1')
            s.write('b.md', b'2')
            out = os.path.join(d, 'out')
            IO.export_folder(s, out)
            with open(os.path.join(out, 'mine.txt'), 'w') as f:
                f.write('not from the export')
            s.trash('b.md')
            r = IO.export_folder(s, out)
            self.assertEqual(r['removed'], 1)
            self.assertFalse(os.path.exists(os.path.join(out, 'b.md')))
            moved = [os.path.join(dp, n) for dp, _, fn in os.walk(os.path.join(out, '.removed')) for n in fn]
            self.assertEqual(len(moved), 1)
            with open(moved[0], 'rb') as f:
                self.assertEqual(f.read(), b'2')
            self.assertTrue(os.path.exists(os.path.join(out, 'mine.txt')))

    def test_nightly_backs_up_and_exports_and_prunes(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'dmforge.db'))
            s.write('a.md', b'1')
            bdir = os.path.join(d, 'backups')
            os.makedirs(bdir)
            for i in range(5):
                open(os.path.join(bdir, 'dmforge-2000010%d-000000.db' % i), 'w').close()
            r = IO.nightly(s, d, os.path.join(d, 'md'), keep=3)
            self.assertEqual(len([n for n in os.listdir(bdir) if n.endswith('.db')]), 3)
            self.assertTrue(r['backup'] in os.listdir(bdir))
            self.assertEqual(r['export']['notes'], 1)
            self.assertTrue(os.path.exists(os.path.join(d, 'md', 'a.md')))
            s.close()


class ScheduleTests(unittest.TestCase):
    def test_seconds_until_is_always_within_a_day(self):
        import time as T
        base = T.mktime((2026, 5, 10, 2, 30, 0, 0, 0, -1))
        self.assertEqual(H.seconds_until(3, base), 1800)
        self.assertEqual(H.seconds_until(2, base), 23 * 3600 + 30 * 60)
        self.assertTrue(0 < H.seconds_until(3, T.mktime((2026, 5, 10, 3, 0, 0, 0, 0, -1))) <= 86400)


class TokenTests(unittest.TestCase):
    def test_token_is_made_once_and_kept(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ.pop('DMFORGE_TOKEN', None)
            t1, fresh1 = H.load_token(d)
            t2, fresh2 = H.load_token(d)
            self.assertTrue(fresh1)
            self.assertFalse(fresh2)
            self.assertEqual(t1, t2)
            self.assertGreaterEqual(len(t1), 24)
            self.assertEqual(oct(os.stat(os.path.join(d, 'token')).st_mode & 0o777), '0o600')


if __name__ == '__main__':
    unittest.main()
