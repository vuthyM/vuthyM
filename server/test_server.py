"""Tests for the V3 server. Run:  python3 -I -m unittest discover -s server -v   (from dmforge-v2/)"""
import http.client
import json
import os
import sqlite3
import sys
import tempfile
import threading
import subprocess
import unittest

HERE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE_DIR)
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

    def test_a_failed_begin_does_not_keep_the_store_lock(self):
        # another process holds the database; this write fails; every later request must still be able to proceed
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'x.db')
            s = D.Store(path)
            s.write('a.md', b'one')
            other = sqlite3.connect(path, isolation_level=None)
            other.execute('BEGIN IMMEDIATE')
            s.db.execute('PRAGMA busy_timeout=100')
            got, go = {}, threading.Event()

            def later():
                go.wait(5)
                got['ok'] = s.lock.acquire(timeout=2)
                if got['ok']:
                    s.lock.release()
            waiter = threading.Thread(target=later)       # alive at the same time, so it cannot share the failing thread's id
            waiter.start()

            def failing():
                try:
                    s.write('b.md', b'two')
                except sqlite3.OperationalError:
                    got['failed'] = True
            t = threading.Thread(target=failing)
            t.start()
            t.join()
            other.execute('ROLLBACK')
            other.close()
            go.set()
            waiter.join()
            self.assertTrue(got.get('failed'))
            self.assertTrue(got.get('ok'), 'the store lock was kept by the failed request')
            s.write('c.md', b'three')
            s.close()

    def test_a_failed_commit_does_not_leave_a_transaction_open(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'x.db')
            s = D.Store(path)
            real = s.db

            class FlakyCommit:
                def __init__(self):
                    self.fail = True

                def execute(self, sql, *a):
                    if sql == 'COMMIT' and self.fail:
                        self.fail = False
                        raise sqlite3.OperationalError('database or disk is full')
                    return real.execute(sql, *a)

                def __getattr__(self, n):
                    return getattr(real, n)
            s.db = FlakyCommit()
            with self.assertRaises(sqlite3.OperationalError):
                s.write('a.md', b'lost')
            self.assertFalse(real.in_transaction)             # nothing left open for later writes to join
            s.write('b.md', b'kept')
            s.close()
            again = D.Store(path)
            self.assertEqual(again.read('b.md')[0], b'kept')   # the later write really reached the file
            with self.assertRaises(D.StoreError):
                again.read('a.md')
            again.close()

    def test_changes_feed_never_skips_when_it_has_to_cut_the_list(self):
        self.s = D.Store(':memory:')
        for i in range(12):
            self.s.write('n%d.md' % i, b'x%d' % i)
        seen, since, rounds = set(), 0, 0
        while True:
            r = self.s.changes(since, limit=5)
            seen.update(c['path'] for c in r['changes'])
            since = r['seq']
            rounds += 1
            if not r['more']:
                break
            self.assertLess(rounds, 10)
        self.assertEqual(len(seen), 12)
        self.assertEqual(rounds, 3)
        self.assertEqual(self.s.changes(since)['changes'], [])
        self.assertFalse(self.s.changes(since)['more'])

    def test_health_is_true_normally_and_false_instead_of_hanging(self):
        self.s = D.Store(':memory:')
        self.assertTrue(self.s.health())
        held, release = threading.Event(), threading.Event()

        def hog():
            with self.s.lock:
                held.set()
                release.wait(5)
        t = threading.Thread(target=hog)
        t.start()
        held.wait(2)
        self.assertFalse(self.s.health(wait=0.2))
        release.set()
        t.join()
        self.assertTrue(self.s.health())


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

    def test_wrong_tokens_are_rate_limited_but_the_right_one_always_works(self):
        H.State.fails.clear()
        codes = [self.req('GET', '/api/ping', headers={'X-DMF-Token': 'bad'}, token=False)[0] for _ in range(7)]
        self.assertEqual(codes[:5], [401] * 5)
        self.assertEqual(codes[-1], 429)                              # more wrong guesses wait
        self.assertEqual(self.req('GET', '/api/ping')[0], 200)         # but the owner is never locked out of their own server
        st, body, hd = self.req('POST', '/login', body=('token=' + self.token).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'}, token=False)
        self.assertEqual(st, 303)
        H.State.fails.clear()

    def test_stale_cookies_and_missing_credentials_never_count_as_guesses(self):
        H.State.fails.clear()
        for _ in range(12):
            self.assertEqual(self.req('GET', '/api/ping', headers={'Cookie': 'dmf_session=old'}, token=False)[0], 401)
            self.assertEqual(self.req('GET', '/api/ping', token=False)[0], 401)
        self.assertEqual(H.State.fails, {})
        self.assertEqual(self.req('GET', '/api/ping', headers={'X-DMF-Token': 'bad'}, token=False)[0], 401)   # not 429
        H.State.fails.clear()

    def test_an_unsigned_request_is_turned_away_without_reading_its_body(self):
        import socket
        c = socket.create_connection(('127.0.0.1', self.port), timeout=3)
        c.sendall(b'POST /api/write?path=x.md HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 20000000\r\n\r\nabc')
        reply = c.recv(2000)
        self.assertTrue(reply.startswith(b'HTTP/1.1 401'))
        self.assertIn(b'Connection: close', reply)
        c.close()

    def test_a_client_that_goes_quiet_is_dropped(self):
        import socket
        import time
        old = H.Handler.timeout
        H.Handler.timeout = 1
        try:
            c = socket.create_connection(('127.0.0.1', self.port), timeout=5)
            c.sendall(b'POST /login HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 50\r\n\r\nabc')
            t0 = time.time()
            data = c.recv(100)                                        # the server gives up and closes: b'' (or a reset)
            self.assertEqual(data, b'')
            self.assertLess(time.time() - t0, 4)
            c.close()
        finally:
            H.Handler.timeout = old

    def test_the_app_is_sent_compressed_and_not_again_when_unchanged(self):
        import gzip
        cookie = 'dmf_session=' + H.State.session
        st, plain, hd = self.req('GET', '/', headers={'Cookie': cookie}, token=False)
        self.assertEqual(st, 200)
        self.assertNotIn('content-encoding', hd)
        st, zipped, hz = self.req('GET', '/', headers={'Cookie': cookie, 'Accept-Encoding': 'gzip, br'}, token=False)
        self.assertEqual(hz['content-encoding'], 'gzip')
        self.assertEqual(gzip.decompress(zipped), plain)
        self.assertIn('accept-encoding', hz['vary'].lower())
        st, body, h304 = self.req('GET', '/', headers={'Cookie': cookie, 'Accept-Encoding': 'gzip', 'If-None-Match': hz['etag']}, token=False)
        self.assertEqual((st, body), (304, b''))
        st, body, _ = self.req('GET', '/', headers={'Cookie': cookie, 'Accept-Encoding': 'gzip', 'If-None-Match': '"old"'}, token=False)
        self.assertEqual(st, 200)

    def test_the_sign_in_page_uses_the_current_colours(self):
        st, body, _ = self.req('GET', '/', token=False)
        for old in (b'#8a6a2f', b'#f4efe4', b'Georgia'):
            self.assertNotIn(old, body)
        self.assertIn(b'#0b1528', body)

    def test_healthz_says_so_when_the_database_cannot_be_written(self):
        real = H.State.store.health
        H.State.store.health = lambda wait=3.0: False
        try:
            self.assertEqual(self.req('GET', '/healthz', token=False)[0], 503)
        finally:
            H.State.store.health = real
        self.assertEqual(self.req('GET', '/healthz', token=False)[0], 200)

    def test_the_server_report(self):
        import time
        d = self.tmp.name
        open(os.path.join(d, '.update-checked'), 'w').close()
        with open(os.path.join(d, 'update-status.json'), 'w') as f:
            json.dump({'state': 'ok', 'version': '9.9.9', 'at': int(time.time() * 1000), 'message': ''}, f)
        IO.record_status(d, 'backup', {'at': int(time.time() * 1000), 'ok': True, 'file': 'x.db.gz', 'bytes': 10, 'verified': True})
        self.js('POST', '/api/write?path=Rep/Note.md', body='hi')
        H.State.store.write_image('Rep/Maps/m/1-aaaa.png', b'\x89PNGxx')
        st, j, _ = self.js('GET', '/api/status')
        self.assertEqual(st, 200)
        self.assertTrue(j['notes'] >= 1 and j['images'] >= 1)
        self.assertTrue(j['disk']['free'] > 0 and j['disk']['total'] >= j['disk']['free'])
        self.assertTrue(j['db']['bytes'] > 0)
        self.assertTrue(j['backup']['last']['ok'])
        self.assertEqual(j['update']['version'], '9.9.9')
        self.assertTrue(abs(j['checked_at'] - time.time() * 1000) < 60000)
        self.assertEqual(j['hold_until'], 0)
        self.assertEqual(self.req('GET', '/api/status', token=False)[0], 401)
        for n in ('update-status.json', '.update-checked', 'status.json'):
            os.unlink(os.path.join(d, n))
        st, j, _ = self.js('GET', '/api/status')
        self.assertTrue(j['update'] is None and j['checked_at'] == 0 and j['backup']['last'] is None)

    def test_holding_updates_ends_by_itself_and_can_be_cancelled(self):
        import time
        path = os.path.join(self.tmp.name, '.hold-updates')
        st, j, _ = self.js('POST', '/api/hold', body=json.dumps({'hours': 2}))
        self.assertEqual(st, 200)
        self.assertTrue(abs(j['hold_until'] - (time.time() + 7200) * 1000) < 60000)
        self.assertTrue(int(open(path).read()) > time.time() + 7000)       # the updater reads this file
        self.assertEqual(self.js('GET', '/api/status')[1]['hold_until'], j['hold_until'])
        st, j, _ = self.js('POST', '/api/hold', body=json.dumps({'hours': 999}))
        self.assertTrue(j['hold_until'] <= (time.time() + 48 * 3600 + 60) * 1000)   # never longer than two days
        st, j, _ = self.js('POST', '/api/hold', body=json.dumps({'hours': 0}))
        self.assertEqual(j['hold_until'], 0)
        self.assertFalse(os.path.exists(path))
        open(path, 'w').write(str(int(time.time()) - 5))                    # an old hold counts as none
        self.assertEqual(self.js('GET', '/api/status')[1]['hold_until'], 0)
        os.unlink(path)
        self.assertEqual(self.js('POST', '/api/hold', body='nonsense')[0], 400)
        self.assertEqual(self.req('POST', '/api/hold', body='{}', token=False)[0], 401)

    def test_download_a_copy_of_everything(self):
        import gzip
        import io
        import zipfile
        self.js('POST', '/api/write?path=Dl/Mira.md', body='# Mira\nWaits.')
        png = b'\x89PNG' + b'\x01' * 50
        H.State.store.write_image('Dl/Maps/m/1-abcd1234.png', png)
        st, body, hd = self.req('GET', '/api/backup-download?kind=zip')
        self.assertEqual(st, 200)
        self.assertEqual(hd['content-type'], 'application/zip')
        self.assertIn('attachment', hd['content-disposition'])
        self.assertEqual(int(hd['content-length']), len(body))
        z = zipfile.ZipFile(io.BytesIO(body))
        self.assertIsNone(z.testzip())
        self.assertEqual(z.read('Dl/Mira.md'), b'# Mira\nWaits.')
        self.assertEqual(z.read('Dl/Maps/m/1-abcd1234.png'), png)
        self.assertIn('README.txt', z.namelist())
        st, body, hd = self.req('GET', '/api/backup-download?kind=db')
        self.assertEqual(st, 200)
        raw = gzip.decompress(body)
        self.assertTrue(raw.startswith(b'SQLite format 3'))
        p = os.path.join(self.tmp.name, 'dl-check.db')
        open(p, 'wb').write(raw)
        back = D.Store(p)
        self.assertEqual(back.read('Dl/Mira.md')[0], b'# Mira\nWaits.')
        back.close()
        os.unlink(p)
        self.assertEqual(self.req('GET', '/api/backup-download?kind=nope')[0], 400)
        self.assertEqual(self.req('GET', '/api/backup-download?kind=zip', token=False)[0], 401)

    def test_the_change_feed_names_the_server_version(self):
        st, j, _ = self.js('GET', '/api/changes?since=0')
        self.assertIn('version', j)
        self.assertIn('more', j)
        self.assertFalse(j['more'])

    def test_the_mac_pull_script_saves_both_copies_and_keeps_only_the_newest(self):
        import shutil
        if not shutil.which('curl'):
            self.skipTest('no curl here')
        script = os.path.join(os.path.dirname(HERE_DIR), 'tools', 'pull-backup.sh')
        self.js('POST', '/api/write?path=Pull/Note.md', body='pulled')
        with tempfile.TemporaryDirectory() as dest:
            env = dict(os.environ, DMFORGE_TOKEN=self.token, KEEP='1', HOME=dest)
            url = 'http://127.0.0.1:%d' % self.port
            r = subprocess.run(['bash', script, url, dest], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            names = sorted(os.listdir(dest))
            self.assertTrue(any(n.endswith('.zip') for n in names) and any(n.endswith('.db.gz') for n in names), names)
            self.assertFalse([n for n in names if n.startswith('.')])                     # no half-written leftovers
            self.assertNotIn(self.token, r.stdout + r.stderr)
            for n in names:                                                              # make them look old, so the next run's are the newest
                os.utime(os.path.join(dest, n), (1, 1))
            r = subprocess.run(['bash', script, url, dest], env=env, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            self.assertEqual(len([n for n in os.listdir(dest) if n.endswith('.zip')]), 1)
            self.assertEqual(len([n for n in os.listdir(dest) if n.endswith('.db.gz')]), 1)
            bad = subprocess.run(['bash', script, url, dest], env=dict(env, DMFORGE_TOKEN='wrong-token-wrong-token'), capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)                                       # a wrong token is reported, not saved as an "empty backup"
            self.assertEqual(len([n for n in os.listdir(dest) if n.endswith('.zip')]), 1)

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
            # the machine talking to itself is always allowed (the updater, docker exec), even with the list set
            self.assertEqual(self.req('GET', '/api/ping')[0], 200)                  # Host: 127.0.0.1:<port>
            c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
            c.request('GET', '/api/ping', headers={'Host': 'localhost:%d' % self.port, 'X-DMF-Token': self.token})
            self.assertEqual(c.getresponse().status, 200)
            c.close()
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
            self.assertEqual(len([n for n in os.listdir(bdir) if n.startswith('dmforge-')]), 3)
            self.assertTrue(r['backup'] in os.listdir(bdir))
            self.assertEqual(r['export']['notes'], 1)
            self.assertTrue(os.path.exists(os.path.join(d, 'md', 'a.md')))
            s.close()

    def test_nightly_copy_is_checked_compressed_and_recorded(self):
        import gzip
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'dmforge.db'))
            for i in range(30):
                s.write('n%d.md' % i, ('Lorem ipsum dolor sit amet. ' * 200).encode())
            r = IO.nightly(s, d, None, keep=5)
            self.assertTrue(r['backup'].endswith('.db.gz'))
            gzpath = os.path.join(d, 'backups', r['backup'])
            self.assertEqual([n for n in os.listdir(os.path.join(d, 'backups')) if n.endswith('.db')], [])      # no uncompressed leftovers
            self.assertLess(os.path.getsize(gzpath), 30 * 5600 / 3)                                              # text compresses a lot
            raw = os.path.join(d, 'restored.db')
            with gzip.open(gzpath, 'rb') as f, open(raw, 'wb') as o:
                o.write(f.read())
            back = D.Store(raw)
            self.assertEqual(back.counts()['notes'], 30)                                                         # it really is a usable database
            back.close()
            st = IO.read_status(d)['backup']
            self.assertTrue(st['ok'] and st['verified'] and st['file'] == r['backup'] and st['bytes'] > 0)
            s.close()

    def test_a_failed_nightly_is_recorded_for_the_server_page(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'dmforge.db'))
            s.write('a.md', b'1')
            real = s.backup_to
            s.backup_to = lambda dest: (_ for _ in ()).throw(OSError('No space left on device'))
            with self.assertRaises(OSError):
                IO.nightly(s, d, None)
            st = IO.read_status(d)['backup']
            self.assertFalse(st['ok'])
            self.assertIn('No space left', st['error'])
            s.backup_to = real
            IO.nightly(s, d, None)                                       # the next good one replaces the bad report
            self.assertTrue(IO.read_status(d)['backup']['ok'])
            s.close()

    def test_a_bad_copy_is_caught_and_not_kept(self):
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'dmforge.db'))
            s.write('a.md', b'1')
            good = s.backup_to

            def short(dest):                                              # a "copy" that is missing a note
                out = good(dest)
                c = sqlite3.connect(out)
                c.execute('DELETE FROM files')
                c.commit()
                c.close()
                return out
            s.backup_to = short
            with self.assertRaises(RuntimeError):
                IO.nightly(s, d, None)
            self.assertEqual([n for n in os.listdir(os.path.join(d, 'backups')) if n.startswith('dmforge-')], [])
            self.assertFalse(IO.read_status(d)['backup']['ok'])
            s.close()

    def test_a_picture_is_kept_once_not_twice(self):
        s = D.Store(':memory:')
        png = b'\x89PNG' + os.urandom(2000)
        s.write_image('Camp/Maps/rift/1-aaaa1111.png', png)
        s.write('Camp/n.md', b'text')
        n_img = s.db.execute("SELECT content FROM versions WHERE path LIKE '%.png'").fetchone()['content']
        self.assertIsNone(n_img)                                         # the history row records the write, the file holds the bytes
        self.assertEqual(s.read('Camp/Maps/rift/1-aaaa1111.png')[0], png)
        self.assertEqual(s.version_data('Camp/n.md', 1), b'text')        # notes keep every version as before
        with self.assertRaises(D.StoreError):
            s.version_data('Camp/Maps/rift/1-aaaa1111.png', 1)
        self.assertEqual(s.stats(), {'notes': 1, 'images': 1, 'trashed': 0})

    def test_old_duplicate_picture_copies_are_dropped_and_nothing_else(self):
        s = D.Store(':memory:')
        s.write('a.md', b'note')
        s.db.execute("INSERT INTO files (path, is_dir, content, mtime, version) VALUES ('M/Maps/x/1-b.png', 0, ?, 1, 1)", (b'png',))
        s.db.execute("INSERT INTO versions (path, version, content, mtime, action) VALUES ('M/Maps/x/1-b.png', 1, ?, 1, 'import')", (b'png',))
        self.assertEqual(s.dedupe_image_versions(), 1)
        self.assertEqual(s.dedupe_image_versions(), 0)
        self.assertEqual(s.read('M/Maps/x/1-b.png')[0], b'png')
        self.assertEqual(s.version_data('a.md', 1), b'note')


class UpdaterBackupTests(unittest.TestCase):
    def test_the_updaters_database_copy_works_while_the_server_is_using_the_database(self):
        # the very command update.sh runs inside the container, with the container's paths pointed at a temp folder
        import re
        script = open(os.path.join(os.path.dirname(HERE_DIR), 'update.sh')).read()
        m = re.search(r'python -I -c "(import sys,os;sys\.path\.insert.*?)" >> "\$LOG"', script)
        self.assertTrue(m, 'could not find the backup command in update.sh')
        code = m.group(1).replace("'/app'", repr(HERE_DIR)).replace('$stamp', 'test')
        with tempfile.TemporaryDirectory() as d:
            s = D.Store(os.path.join(d, 'dmforge.db'))
            s.write('a.md', b'important')
            stop = threading.Event()
            errs = []

            def writer():
                i = 0
                while not stop.is_set():
                    try:
                        s.write('w%d.md' % (i % 20), ('t%d' % i).encode())
                    except Exception as e:  # pragma: no cover
                        errs.append(e)
                    i += 1
            th = threading.Thread(target=writer)
            th.start()
            try:
                r = subprocess.run([sys.executable, '-I', '-c', code], env={'DMFORGE_DATA': d, 'PATH': os.environ['PATH']}, capture_output=True, text=True)
            finally:
                stop.set()
                th.join()
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual(errs, [])
            c = sqlite3.connect(os.path.join(d, 'backups', 'pre-update-test.db'))
            self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(c.execute("SELECT content FROM files WHERE path='a.md'").fetchone()[0], b'important')
            c.close()
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
