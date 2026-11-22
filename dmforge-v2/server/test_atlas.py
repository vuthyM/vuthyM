"""Tests for the DMAtlas connection, against a stand-in DMAtlas. Run: python3 -I -m unittest discover -s server -v  (from dmforge-v2/)"""
import hashlib
import http.client
import http.server
import json
import os
import struct
import sys
import tempfile
import threading
import unittest
import zlib

HERE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE_DIR)
import dmforge_atlas as A  # noqa: E402
import dmforge_db as D  # noqa: E402
import dmforge_hosted as H  # noqa: E402


def png(w=4, h=3, color=(10, 20, 30)):
    raw = b''.join(b'\x00' + bytes(color) * w for _ in range(h))

    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')


PNG_A = png(4, 3, (10, 20, 30))
SHA_A = hashlib.sha256(PNG_A).hexdigest()


class FakeAtlas:
    """Serves what DMAtlas serves, and misbehaves on request (self.mode)."""
    def __init__(self):
        self.mode = ''
        self.hits = []
        self.detail = {'format': 'dmatlas-forge/1', 'id': 'd1', 'name': 'Rift Keep', 'publishedAt': 't',
                       'levels': [{'mapId': 'm1', 'mapName': 'Keep', 'level': 'Level 1', 'order': 0, 'cellFt': 5, 'publishedAt': 't', 'mapUpdatedAt': 't',
                                   'image': {'url': '/api/forge/maps/m1/image/%s.png' % SHA_A, 'type': 'image/png', 'width': 4, 'height': 3, 'bytes': len(PNG_A), 'sha256': SHA_A, 'pxPerCell': 1},
                                   'rooms': [{'id': 'r1', 'n': '1', 'name': 'Hall', 'x': 10, 'y': 20, 'cx': 1, 'cy': 2, 'secret': False, 'seed': 'Cold.'}]}]}
        self.images = {('m1', SHA_A): PNG_A}
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, status, body, ctype, extra=None):
                self.send_response(status)
                self.send_header('Content-Type', ctype)
                self.send_header('Content-Length', str(len(body)) if outer.mode != 'lying-length' else '5')
                for k, v in (extra or {}).items():
                    self.send_header(k, v)
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                outer.hits.append(self.path)
                if outer.mode == 'redirect':
                    return self._send(302, b'', 'text/plain', {'Location': 'http://example.invalid/evil'})
                if outer.mode == 'down':
                    return self._send(500, b'boom', 'text/plain')
                if self.path == '/api/forge/dungeons':
                    if outer.mode == 'html':
                        return self._send(200, b'<html>hi</html>', 'text/html')
                    if outer.mode == 'badjson':
                        return self._send(200, b'{nope', 'application/json')
                    if outer.mode == 'wrongshape':
                        return self._send(200, b'{"a":1}', 'application/json')
                    if outer.mode == 'huge':
                        return self._send(200, b'[' + b'0,' * (3 * 1024 * 1024) + b'0]', 'application/json')
                    return self._send(200, json.dumps([{'id': 'd1', 'name': 'Rift Keep', 'levels': 1, 'rooms': 1, 'maps': []}]).encode(), 'application/json')
                if self.path == '/api/forge/dungeons/d1':
                    return self._send(200, json.dumps(outer.detail).encode(), 'application/json')
                if self.path.startswith('/api/forge/dungeons/'):
                    return self._send(404, b'{}', 'application/json')
                if self.path.startswith('/api/forge/maps/'):
                    parts = self.path.split('/')
                    key = (parts[4], parts[6][:-4] if parts[6].endswith('.png') else parts[6])
                    data = outer.images.get(key)
                    if outer.mode == 'notpng':
                        data = b'GIF89a' + b'\0' * 100
                    if outer.mode == 'wronghash':
                        data = png(4, 3, (1, 1, 1))
                    if outer.mode == 'bigdims':
                        data = png(4, 3)[:16] + struct.pack('>II', 20000, 10) + png(4, 3)[24:]
                    if outer.mode == 'toolarge':
                        data = PNG_A + b'\0' * (16 * 1024 * 1024)
                    if data is None:
                        return self._send(404, b'', 'text/plain')
                    return self._send(200, data, 'image/png')
                self._send(404, b'', 'text/plain')

        self.srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.url = 'http://127.0.0.1:%d' % self.srv.server_address[1]
        self.th = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.th.start()

    def close(self):
        self.srv.shutdown()
        self.srv.server_close()


class AtlasClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = FakeAtlas()

    @classmethod
    def tearDownClass(cls):
        cls.fake.close()

    def setUp(self):
        self.fake.mode = ''
        self.fake.hits.clear()
        self.a = A.Atlas(self.fake.url, timeout=5)

    def fails(self, fn, *args, status=None, text=None):
        with self.assertRaises(A.AtlasError) as c:
            fn(*args)
        if status:
            self.assertEqual(c.exception.status, status)
        if text:
            self.assertIn(text, c.exception.message)
        return c.exception

    def test_base_address_rules(self):
        self.assertEqual(A.parse_base(''), '')
        self.assertEqual(A.parse_base(' https://water.example:8767/ '), 'https://water.example:8767')
        for bad in ('ftp://x', 'https://user:pw@x', 'https://x?y=1', 'https://x#f', 'javascript:alert(1)', 'water'):
            with self.assertRaises(ValueError):
                A.parse_base(bad)

    def test_list_detail_and_picture(self):
        self.assertEqual(self.a.dungeons()[0]['name'], 'Rift Keep')
        self.assertEqual(self.a.dungeon('d1')['levels'][0]['rooms'][0]['name'], 'Hall')
        data, w, h = self.a.image('m1', SHA_A)
        self.assertEqual((data, w, h), (PNG_A, 4, 3))

    def test_only_paths_built_here_are_requested(self):
        self.a.dungeons(); self.a.dungeon('d1'); self.a.image('m1', SHA_A)
        self.assertEqual(self.fake.hits, ['/api/forge/dungeons', '/api/forge/dungeons/d1', '/api/forge/maps/m1/image/%s.png' % SHA_A])

    def test_ids_are_checked_before_anything_is_asked(self):
        for bad in ('../x', 'a b', 'a/b', '', 'x' * 200, None, 5):
            self.fails(self.a.dungeon, bad, status=400)
            self.fails(self.a.image, bad, SHA_A, status=400)
        for bad in ('abc', 'G' * 64, SHA_A.upper(), SHA_A + '0', None):
            self.fails(self.a.image, 'm1', bad, status=400)
        self.assertEqual(self.fake.hits, [])

    def test_a_dungeon_that_is_not_published(self):
        self.fails(self.a.dungeon, 'nope', status=404, text='not be published')

    def test_redirects_are_never_followed(self):
        self.fake.mode = 'redirect'
        self.fails(self.a.dungeons, status=502, text='redirect')

    def test_bad_answers(self):
        for mode, text in (('html', 'JSON'), ('badjson', 'cannot be read'), ('wrongshape', 'shape'), ('huge', 'larger'), ('down', '500')):
            self.fake.mode = mode
            self.fails(self.a.dungeons, status=502, text=text)

    def test_picture_checks(self):
        for mode, text in (('notpng', 'not a PNG'), ('wronghash', 'does not match'), ('bigdims', 'limit'), ('toolarge', 'larger')):
            self.fake.mode = mode
            self.fails(self.a.image, 'm1', SHA_A, status=502, text=text)
        self.fake.mode = ''
        self.fails(self.a.image, 'm2', SHA_A, status=404)

    def test_offline_says_so_and_names_the_address(self):
        dead = A.Atlas('http://127.0.0.1:9', timeout=2)
        e = self.fails(dead.dungeons, status=502, text='Cannot reach DMAtlas')
        self.assertIn('Nothing was changed', e.message)

    def test_not_configured(self):
        self.fails(A.Atlas('').dungeons, status=503, text='DMFORGE_DMATLAS_URL')

    def test_destinations(self):
        self.assertEqual(A.check_dest('Ashfall/Maps/rift-keep/level-1-3fa9c2d1.png'), 'Ashfall/Maps/rift-keep/level-1-3fa9c2d1.png')
        for bad in ('x.png', 'Maps/x.png', '../Maps/a/b.png', 'A/Maps/../b.png', 'A/Maps/a/b.md', 'A/Maps/.hid/b.png', 'A/Maps/a/.b.png', '/abs/Maps/a/b.png', 'A\\Maps\\a\\b.png', 'A/Maps/a/b.png\x00', None, 5, 'A/Maps/a/b/c.png'):
            self.fails(A.check_dest, bad, status=400)


class AtlasHttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = FakeAtlas()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.token = 'atlas-test-token-0123456789abcdef'
        cls.srv = H.make_server(cls.tmp.name, os.path.join(cls.tmp.name, 'x.html'), '127.0.0.1', 0, 'T', (), cls.token, dmatlas_url=cls.fake.url)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown(); cls.srv.server_close(); H.State.store.close(); cls.fake.close(); cls.tmp.cleanup()

    def setUp(self):
        self.fake.mode = ''
        self.fake.hits.clear()

    def call(self, method, path, body=None, token=True):
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=15)
        c.request(method, path, body=body, headers={'X-DMF-Token': self.token} if token else {})
        r = c.getresponse(); data = r.read(); c.close()
        try:
            return r.status, json.loads(data)
        except ValueError:
            return r.status, data

    def test_status_list_detail(self):
        self.assertEqual(self.call('GET', '/api/atlas-status')[1], {'configured': True, 'base': self.fake.url})
        st, j = self.call('GET', '/api/atlas-dungeons')
        self.assertEqual((st, j[0]['id']), (200, 'd1'))
        st, j = self.call('GET', '/api/atlas-dungeon?id=d1')
        self.assertEqual((st, j['name']), (200, 'Rift Keep'))
        self.assertEqual(self.call('GET', '/api/atlas-dungeon?id=nope')[0], 404)
        self.assertEqual(self.call('GET', '/api/atlas-dungeon?id=../x')[0], 400)

    def test_everything_needs_the_token(self):
        for p in ('/api/atlas-status', '/api/atlas-dungeons', '/api/atlas-dungeon?id=d1'):
            self.assertEqual(self.call('GET', p, token=False)[0], 401)
        self.assertEqual(self.call('POST', '/api/atlas-image', b'{}', token=False)[0], 401)

    def req(self, **kw):
        body = {'mapId': 'm1', 'sha256': SHA_A, 'dest': 'Camp/Maps/rift-keep/level-1-%s.png' % SHA_A[:8]}
        body.update(kw)
        return json.dumps(body).encode()

    def test_a_picture_is_fetched_checked_stored_and_served(self):
        st, j = self.call('POST', '/api/atlas-image', self.req())
        self.assertEqual((st, j['stored'], j['skipped'], j['width'], j['height'], j['bytes']), (200, True, False, 4, 3, len(PNG_A)))
        c = http.client.HTTPConnection('127.0.0.1', self.port, timeout=10)
        c.request('GET', '/api/read?path=' + 'Camp/Maps/rift-keep/level-1-%s.png' % SHA_A[:8], headers={'X-DMF-Token': self.token})
        r = c.getresponse(); data = r.read()
        self.assertEqual((r.status, r.getheader('Content-Type'), data), (200, 'image/png', PNG_A))
        # the same picture again is not downloaded again
        n = len(self.fake.hits)
        st, j = self.call('POST', '/api/atlas-image', self.req())
        self.assertEqual((st, j['stored'], j['skipped']), (200, False, True))
        self.assertEqual(len(self.fake.hits), n)

    def test_bad_pictures_store_nothing(self):
        for mode in ('notpng', 'wronghash', 'bigdims', 'toolarge'):
            self.fake.mode = mode
            dest = 'Camp/Maps/bad-%s/x.png' % mode
            st, j = self.call('POST', '/api/atlas-image', self.req(dest=dest))
            self.assertEqual(st, 502, (mode, j))
            self.assertEqual(self.call('GET', '/api/read?path=' + dest)[0], 404)

    def test_a_different_picture_is_never_written_over_one_that_is_there(self):
        dest = 'Camp/Maps/clash/level-1-%s.png' % SHA_A[:8]
        H.State.store.write_image(dest, png(2, 2))
        st, j = self.call('POST', '/api/atlas-image', self.req(dest=dest))
        self.assertEqual(st, 409)

    def test_destinations_cannot_be_chosen_freely(self):
        for dest in ('Camp/notes/x.png', 'Camp/Maps/x.md', '../Maps/a/x.png', 'Camp/Maps/.h/x.png'):
            self.assertEqual(self.call('POST', '/api/atlas-image', self.req(dest=dest))[0], 400)
        self.assertEqual(self.call('POST', '/api/atlas-image', b'not json')[0], 400)
        self.assertEqual(self.call('POST', '/api/atlas-image', self.req(sha256='zz'))[0], 400)

    def test_offline_atlas_changes_nothing(self):
        self.fake.mode = 'down'
        before = H.State.store.counts()
        st, j = self.call('POST', '/api/atlas-image', self.req(dest='Camp/Maps/off/x.png'))
        self.assertEqual(st, 502)
        self.assertEqual(H.State.store.counts(), before)

    def test_not_configured_server(self):
        old = H.State.atlas
        H.State.atlas = A.Atlas('')
        try:
            self.assertEqual(self.call('GET', '/api/atlas-status')[1], {'configured': False, 'base': ''})
            st, j = self.call('GET', '/api/atlas-dungeons')
            self.assertEqual(st, 503)
            self.assertIn('DMFORGE_DMATLAS_URL', j['error'])
            self.assertEqual(self.call('POST', '/api/atlas-image', self.req())[0], 503)
        finally:
            H.State.atlas = old

    def test_images_are_in_the_markdown_export_and_the_backup(self):
        import dmforge_io as IO
        self.call('POST', '/api/atlas-image', self.req(dest='Camp/Maps/exp/level-1-%s.png' % SHA_A[:8]))
        out = os.path.join(self.tmp.name, 'export')
        IO.export_folder(H.State.store, out)
        with open(os.path.join(out, 'Camp', 'Maps', 'exp', 'level-1-%s.png' % SHA_A[:8]), 'rb') as f:
            self.assertEqual(f.read(), PNG_A)


class CheckCommandTests(unittest.TestCase):
    def test_the_connection_check_reports_what_it_finds(self):
        import contextlib
        import io
        fake = FakeAtlas()
        try:
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(A.main([fake.url]), 0)
            self.assertIn('OK. 1 published dungeon', out.getvalue())
            self.assertIn('Rift Keep', out.getvalue())
            fake.mode = 'down'
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(A.main([fake.url]), 1)
            self.assertIn('FAILED', out.getvalue())
        finally:
            fake.close()
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(A.main(['not a url']), 2)
            self.assertEqual(A.main(['']), 2)


class ImageBuildTests(unittest.TestCase):
    def test_every_server_module_the_app_imports_is_copied_into_the_docker_image(self):
        root = os.path.dirname(HERE_DIR)
        docker = open(os.path.join(root, 'Dockerfile')).read()
        import re
        wanted = set()
        for f in ('dmforge_hosted.py', 'dmforge_io.py', 'dmforge_atlas.py', 'dmforge_db.py'):
            for m in re.finditer(r'^(?:import|from)\s+(dmforge_\w+)', open(os.path.join(HERE_DIR, f)).read(), re.M):
                wanted.add(m.group(1))
        wanted |= {'dmforge_hosted'}
        for name in sorted(wanted):
            self.assertIn('server/%s.py' % name, docker, name + ' is imported by the server but the Dockerfile does not copy it, so the container would not start')
        self.assertIn('server/sw.js', docker)


class StoreImageTests(unittest.TestCase):
    def test_only_pngs_under_maps_and_no_notes_through_this_door(self):
        s = D.Store(':memory:')
        for bad in ('a/Maps/x.png', 'x.png', 'a/Maps/b/x.md', 'a/Maps/.h/x.png', '../a/Maps/b/x.png'):
            with self.assertRaises(D.StoreError):
                s.write_image(bad, b'x')
        with self.assertRaises(D.StoreError):
            s.write_image('a/Maps/b/x.png', b'x' * (16 * 1024 * 1024))
        self.assertEqual(s.write_image('a/Maps/b/x.png', PNG_A)['stored'], True)
        self.assertEqual(s.write_image('a/Maps/b/x.png', PNG_A)['stored'], False)
        with self.assertRaises(D.StoreError):
            s.write('a/Maps/b/y.png', b'x')       # the general API still refuses non-notes


if __name__ == '__main__':
    unittest.main()
