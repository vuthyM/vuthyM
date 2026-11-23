#!/usr/bin/env python3
"""DM Forge V3 server.

Serves DM-Forge.html and the notes API from one SQLite database, so the app works from any
device that can reach this machine (meant to be reached over Tailscale only).

  python3 dmforge_hosted.py --data /data --app /app/DM-Forge.html

Safety:
  * never put this on the public internet. Bind it to the Tailscale address (or localhost) only;
    the Docker compose file does that. There is no TLS here: Tailscale encrypts the link.
  * every API request needs the access token, as the X-DMF-Token header or the session cookie that
    signing in at "/" sets (HttpOnly, SameSite=Strict). Wrong tokens are rate limited.
  * Host and Origin headers are checked (DMFORGE_HOSTS lists the names this server answers to; leave it
    empty to accept any Host and rely on the token)
  * only .md notes can be written or deleted; nothing is ever erased (see dmforge_db.py)
  * the token comes from DMFORGE_TOKEN, or is generated once and kept in <data>/token (mode 600)

Standard library only.
"""
import argparse
import gzip
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import shutil
import sys
import tempfile
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dmforge_db import Store, StoreError, Conflict  # noqa: E402
import dmforge_io  # noqa: E402
from dmforge_atlas import Atlas, AtlasError, SHA_RE, check_dest, check_png, parse_base  # noqa: E402

MAX_WRITE = 20 * 1024 * 1024
COOKIE = 'dmf_session'
LOOPBACK_HOSTS = ('127.0.0.1', 'localhost', '[::1]')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('text/markdown; charset=utf-8', '.md')


def load_token(data_dir):
    """The access token: DMFORGE_TOKEN if set, else the one kept in <data>/token (made on first start)."""
    env = (os.environ.get('DMFORGE_TOKEN') or '').strip()
    if env:
        if len(env) < 16:
            raise SystemExit('DMFORGE_TOKEN is too short (use at least 16 characters).')
        return env, False
    path = os.path.join(data_dir, 'token')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            tok = f.read().strip()
        if tok:
            return tok, False
    except OSError:
        pass
    tok = secrets.token_urlsafe(24)
    os.makedirs(data_dir, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(tok + '\n')
    return tok, True


def session_value(token):
    return hmac.new(token.encode('utf-8'), b'dmforge-session-v1', hashlib.sha256).hexdigest()


LOGIN = """<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>DM Forge</title>
<style>
:root{--bg:#f2ecdf;--surface:#fbf8f0;--border:#d5cab4;--fg:#122039;--muted:#566379;--accent:#a64d1f;--accent-fg:#fff7ee;--danger:#b3372f}
@media (prefers-color-scheme:dark){:root{--bg:#0b1528;--surface:#101d35;--border:#293d60;--fg:#ebe4d4;--muted:#9bacc5;--accent:#e8946a;--accent-fg:#1d1008;--danger:#ef8a8a}}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg);display:grid;place-items:center;min-height:100vh;margin:0}
form{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:28px;width:min(360px,90vw)}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 16px;color:var(--muted);font-size:14px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:16px;margin-bottom:12px;background:var(--bg);color:var(--fg)}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{width:100%;padding:10px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-fg);font-size:16px;font-weight:600;cursor:pointer}
.err{color:var(--danger);font-size:14px;margin:0 0 10px}
</style>
<form method="post" action="/login">
<h1>DM Forge</h1><p>Enter your access token to open the campaign.</p>
%ERR%<input type="password" name="token" autocomplete="current-password" autofocus aria-label="Access token">
<button type="submit">Open</button></form></html>"""


class State:
    store = None
    token = ''
    session = ''
    app_path = ''
    name = 'DM Forge'
    hosts = ()
    verbose = False
    fails = {}
    fail_lock = threading.Lock()
    version = ''
    atlas = None
    app_cache = None
    data_dir = ''
    backup_hour = 3
    started = 0.0


def app_version():
    if State.version:
        return State.version
    for d in (os.path.dirname(State.app_path), os.path.join(HERE, '..')):
        try:
            with open(os.path.join(d, 'VERSION'), 'r', encoding='utf-8') as f:
                return f.read().strip()
        except OSError:
            continue
    return ''


class Handler(BaseHTTPRequestHandler):
    server_version = 'DMForgeServer'
    protocol_version = 'HTTP/1.1'
    timeout = 30        # a connection that goes quiet for 30 seconds is dropped, so a stalled client cannot hold a thread for good

    def log_message(self, fmt, *args):
        if State.verbose:
            sys.stderr.write('  ' + (fmt % args) + '\n')

    # ---- plumbing ----
    def _send(self, status, body=b'', ctype='application/json', extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        headers = {'Content-Type': ctype, 'Content-Length': str(len(body)), 'Cache-Control': 'no-store',
                   'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin'}
        headers.update(extra or {})
        if getattr(self, '_unread', 0):
            # a request body we chose not to read is still on the wire: finish this exchange and close the connection
            self.close_connection = True
            headers['Connection'] = 'close'
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _read_body(self, cap):
        """Reads the request body (at most `cap` bytes). Called only once we know who is asking."""
        n = self._unread
        if n > cap:
            self.close_connection = True
            raise StoreError(413, 'That request is too large')
        self._unread = 0
        return self.rfile.read(n) if n > 0 else b''

    def _json(self, status, obj, extra=None):
        self._send(status, json.dumps(obj), extra=extra)

    def _host_ok(self):
        host = (self.headers.get('Host') or '').lower()
        if State.hosts:
            name = host.rsplit(':', 1)[0] if not host.startswith('[') else host.split(']')[0] + ']'
            # the machine talking to itself (health checks, the updater, docker exec) is always fine: a browser attacked over the
            # network always sends the attacker's own host name, never these
            if name not in State.hosts and name not in LOOPBACK_HOSTS:
                return False
        origin = self.headers.get('Origin')
        if origin:
            o = urlparse(origin)
            if (o.netloc or '').lower() != host:
                return False
        return True

    def _cookie(self):
        for part in (self.headers.get('Cookie') or '').split(';'):
            k, _, v = part.strip().partition('=')
            if k == COOKIE:
                return v
        return ''

    def _authed(self):
        got = self.headers.get('X-DMF-Token', '')
        if got and secrets.compare_digest(got, State.token):
            return True
        c = self._cookie()
        return bool(c) and secrets.compare_digest(c, State.session)

    def _client(self):
        return self.client_address[0] if self.client_address else '?'

    def _locked_out(self):
        with State.fail_lock:
            n, until = State.fails.get(self._client(), (0, 0))
            return n >= 5 and time.time() < until

    def _note_fail(self):
        with State.fail_lock:
            n, until = State.fails.get(self._client(), (0, 0))
            n += 1
            State.fails[self._client()] = (n, time.time() + min(900, 30 * (2 ** max(0, n - 5))))

    def _clear_fails(self):
        with State.fail_lock:
            State.fails.pop(self._client(), None)

    def _dispatch(self):
        parsed = urlparse(self.path)
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        self._unread = max(0, length)
        self._body = b''
        if length > MAX_WRITE:
            self.close_connection = True
            return self._json(413, {'error': 'That request is too large'})
        if parsed.path == '/healthz':
            if State.store is not None and not State.store.health():
                return self._json(503, {'ok': False, 'error': 'The database cannot be written to'})
            return self._json(200, {'ok': True})
        if not self._host_ok():
            return self._json(403, {'error': 'Forbidden'})
        try:
            if parsed.path == '/' and self.command in ('GET', 'HEAD'):
                return self._serve_app()
            if parsed.path == '/sw.js' and self.command in ('GET', 'HEAD'):
                return self._serve_worker()
            if parsed.path == '/login' and self.command == 'POST':
                self._body = self._read_body(16 * 1024)
                return self._login()
            if parsed.path == '/logout' and self.command == 'POST':
                return self._send(303, b'', 'text/plain', {'Location': '/', 'Set-Cookie': '%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' % COOKIE})
            if parsed.path.startswith('/api/'):
                if not self._authed():
                    # Only a wrong token typed in counts against the sign-in limit. A request with no credentials, or with an old cookie
                    # (the token was changed while a tab stayed open), is just turned away: it must never lock the real owner out.
                    if self.headers.get('X-DMF-Token'):
                        if self._locked_out():
                            return self._json(429, {'error': 'Too many wrong tokens. Wait a minute and try again.'})
                        self._note_fail()
                    return self._json(401, {'error': 'Sign in again: the access token is missing or wrong.', 'auth': True})
                self._clear_fails()      # the right token always works, whatever others have tried
                self._body = self._read_body(MAX_WRITE)
                self._q = parse_qs(parsed.query)
                return self._api(parsed.path[5:], (self._q.get('path') or [''])[0])
            return self._json(404, {'error': 'Not found'})
        except TimeoutError:
            raise
        except Conflict as c:
            cur = None
            if c.current:
                cur = {'version': c.current['version'], 'mtime': c.current['mtime'],
                       'text': c.current['data'].decode('utf-8', errors='replace')}
            return self._json(409, {'error': 'This note changed on the server since you started editing it.',
                                    'conflict': c.kind, 'path': c.path, 'current': cur})
        except StoreError as e:
            return self._json(e.status, {'error': e.message})
        except AtlasError as e:
            return self._json(e.status, {'error': e.message})
        except Exception as e:  # keep the server alive; report the problem to the app
            if State.verbose:
                import traceback
                traceback.print_exc()
            return self._json(500, {'error': 'Server error: %s' % e})

    do_GET = do_POST = do_HEAD = _dispatch

    # ---- the app and signing in ----
    def _app_page(self):
        """The app page with the server details put in, and its gzip form and tag. Made again only when the app file changes."""
        st = os.stat(State.app_path)
        key = (st.st_mtime_ns, st.st_size, State.name)
        c = State.app_cache
        if c and c['key'] == key:
            return c
        with open(State.app_path, 'rb') as f:
            html = f.read().decode('utf-8')
        info = json.dumps({'name': State.name, 'token': '', 'hosted': True})
        inject = '<script>window.__DMF_SERVER__=%s;</script>' % info.replace('<', '\\u003c')
        raw = html.replace('<!--DMF_SERVER-->', inject, 1).encode('utf-8')
        tag = hashlib.sha1(raw).hexdigest()[:20]
        State.app_cache = c = {'key': key, 'raw': raw, 'gz': gzip.compress(raw, 6), 'tag': tag}
        return c

    def _serve_app(self):
        if not self._authed():
            return self._send(200, LOGIN.replace('%ERR%', ''), 'text/html; charset=utf-8')
        try:
            page = self._app_page()
        except OSError:
            return self._send(500, '<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:2em">'
                                   '<h3>DM Forge</h3><p>The app file was not found on the server (%s).</p>' % os.path.basename(State.app_path),
                              'text/html; charset=utf-8')
        gz = 'gzip' in (self.headers.get('Accept-Encoding') or '').lower()
        etag = '"%s%s"' % (page['tag'], '-gz' if gz else '')
        extra = {'X-DMF-App': '1', 'ETag': etag, 'Cache-Control': 'no-cache', 'Vary': 'Cookie, Accept-Encoding'}
        if (self.headers.get('If-None-Match') or '') == etag:
            return self._send(304, b'', 'text/html; charset=utf-8', extra)
        if gz:
            extra['Content-Encoding'] = 'gzip'
        self._send(200, page['gz'] if gz else page['raw'], 'text/html; charset=utf-8', extra)

    def _serve_worker(self):
        try:
            with open(os.path.join(HERE, 'sw.js'), 'rb') as f:
                body = f.read()
        except OSError:
            return self._json(404, {'error': 'Not found'})
        self._send(200, body, 'text/javascript; charset=utf-8', {'Service-Worker-Allowed': '/'})

    def _secure(self):
        return (self.headers.get('X-Forwarded-Proto') or '').lower() == 'https'

    def _login(self):
        form = parse_qs(self._body.decode('utf-8', errors='replace'))
        got = (form.get('token') or [''])[0].strip()
        if not got or not secrets.compare_digest(got, State.token):
            if self._locked_out():
                return self._send(429, LOGIN.replace('%ERR%', '<p class="err">Too many tries. Wait a minute.</p>'), 'text/html; charset=utf-8')
            self._note_fail()
            return self._send(401, LOGIN.replace('%ERR%', '<p class="err">That token is not right.</p>'), 'text/html; charset=utf-8')
        self._clear_fails()
        cookie = '%s=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict%s' % (COOKIE, State.session, '; Secure' if self._secure() else '')
        return self._send(303, b'', 'text/plain', {'Location': '/', 'Set-Cookie': cookie})

    # ---- DMAtlas ----
    def _atlas_off(self):
        raise AtlasError(503, 'DMAtlas is not set up on this server. Set DMFORGE_DMATLAS_URL (see deploy/DEPLOY-V3.md).')

    def _atlas_image(self):
        """Fetches a level's picture from DMAtlas (here on the server, never through the browser), checks it, and stores it."""
        if not State.atlas or not State.atlas.configured:
            self._atlas_off()
        try:
            req = json.loads(self._body.decode('utf-8') or '{}')
        except ValueError:
            raise StoreError(400, 'That request was not valid.')
        if not isinstance(req, dict):
            raise StoreError(400, 'That request was not valid.')
        dest = check_dest(req.get('dest'))
        sha = req.get('sha256')
        if not isinstance(sha, str) or not SHA_RE.match(sha):
            raise AtlasError(400, 'That is not a picture hash.')
        s = State.store
        try:
            have = s.read(dest)[0]
        except StoreError:
            have = None
        if have is not None:
            if hashlib.sha256(have).hexdigest() != sha:
                raise StoreError(409, 'A different picture is already stored at that path.')
            w, h = check_png(have)       # the picture has not changed: nothing is downloaded again
            return {'path': dest, 'stored': False, 'skipped': True, 'bytes': len(have), 'width': w, 'height': h, 'sha256': sha}
        data, w, h = State.atlas.image(req.get('mapId'), sha)
        r = s.write_image(dest, data, device=self._q1('device')[:60])
        return {'path': dest, 'stored': r['stored'], 'skipped': False, 'bytes': len(data), 'width': w, 'height': h, 'sha256': sha}

    # ---- the server's own report, holding updates, downloading a copy ----
    def _status(self):
        d = State.data_dir
        st = State.store.stats()
        try:
            du = shutil.disk_usage(d)
            disk = {'free': du.free, 'total': du.total}
        except OSError:
            disk = None
        dbb = 0
        for suffix in ('', '-wal'):
            try:
                dbb += os.path.getsize(os.path.join(d, 'dmforge.db' + suffix))
            except OSError:
                pass
        files = dmforge_io.backup_files(d)
        saved = dmforge_io.read_status(d)
        try:
            with open(os.path.join(d, 'update-status.json'), 'r', encoding='utf-8') as f:
                upd = json.load(f)
            upd = upd if isinstance(upd, dict) else None
        except (OSError, ValueError):
            upd = None
        try:
            checked = int(os.path.getmtime(os.path.join(d, '.update-checked')) * 1000)
        except OSError:
            checked = 0
        return {'version': app_version(), 'name': State.name, **st, 'disk': disk, 'db': {'bytes': dbb},
                'backup': {'last': saved.get('backup'), 'files': len(files), 'bytes': sum(b for _, b in files), 'hour': State.backup_hour},
                'update': upd, 'checked_at': checked, 'hold_until': self._hold_until() * 1000,
                'up_hours': round((time.time() - State.started) / 3600.0, 1) if State.started else 0}

    def _hold_until(self):
        try:
            with open(os.path.join(State.data_dir, '.hold-updates'), 'r', encoding='utf-8') as f:
                t = int(f.read().strip() or 0)
            return t if t > time.time() else 0
        except (OSError, ValueError):
            return 0

    def _hold(self):
        """Stops the updater installing anything for N hours (it ends by itself, so it cannot be forgotten). 0 ends it now."""
        try:
            req = json.loads(self._body.decode('utf-8') or '{}')
            hours = float(req.get('hours', 0))
        except (ValueError, TypeError, AttributeError):
            raise StoreError(400, 'That request was not valid.')
        hours = max(0.0, min(48.0, hours))
        path = os.path.join(State.data_dir, '.hold-updates')
        try:
            if hours <= 0:
                if os.path.exists(path):
                    os.unlink(path)
            else:
                with open(path + '.part', 'w', encoding='utf-8') as f:
                    f.write(str(int(time.time() + hours * 3600)))
                os.replace(path + '.part', path)
        except OSError as e:
            raise StoreError(500, 'Could not change the hold (%s).' % e.strerror)
        return {'hold_until': self._hold_until() * 1000}

    def _backup_download(self):
        """A copy made right now, for the browser or the Mac's pull script. kind=zip: every note and picture as ordinary files.
        kind=db: the database itself, compressed (with every earlier version of every note)."""
        kind = self._q1('kind', 'zip')
        stamp = time.strftime('%Y-%m-%d-%H%M')
        s = State.store
        with tempfile.TemporaryFile() as out:
            if kind == 'zip':
                snap = s.snapshot()
                with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
                    z.writestr('README.txt', 'DM Forge backup, %s.\nEvery note and picture as an ordinary file. Open this folder in Obsidian, or copy it back in with dmforge_io.py import.\n' % stamp)
                    for f in snap['files']:
                        try:
                            data = s.read(f['path'])[0]
                        except StoreError:
                            continue       # moved to the trash while the copy was being made
                        z.writestr(zipfile.ZipInfo(f['path'], time.localtime(f['mtime'] / 1000.0)[:6]), data,
                                   zipfile.ZIP_STORED if f['path'].lower().endswith('.png') else zipfile.ZIP_DEFLATED)
                name, ctype = 'DM-Forge-notes-%s.zip' % stamp, 'application/zip'
            elif kind == 'db':
                with tempfile.TemporaryDirectory() as td:
                    plain = s.backup_to(os.path.join(td, 'dmforge.db'))
                    with open(plain, 'rb') as src, gzip.GzipFile(fileobj=out, mode='wb', compresslevel=6) as gz:
                        shutil.copyfileobj(src, gz, 1 << 20)
                name, ctype = 'DM-Forge-database-%s.db.gz' % stamp, 'application/gzip'
            else:
                raise StoreError(400, 'Choose kind=zip or kind=db.')
            size = out.tell()
            out.seek(0)
            self._send_start(200, ctype, size, {'Content-Disposition': 'attachment; filename="%s"' % name})
            if self.command != 'HEAD':
                shutil.copyfileobj(out, self.wfile, 1 << 20)

    def _send_start(self, status, ctype, size, extra):
        headers = {'Content-Type': ctype, 'Content-Length': str(size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
        headers.update(extra)
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.end_headers()

    # ---- API ----
    def _q1(self, key, default=''):
        return (getattr(self, '_q', {}).get(key) or [default])[0]

    def _base(self):
        raw = self._q1('base')
        if raw == '':
            return None
        try:
            return int(raw)
        except ValueError:
            raise StoreError(400, 'Bad base version')

    def _api(self, op, rel):
        s = State.store
        post = self.command == 'POST'
        device = self._q1('device')[:60]
        if op == 'ping':
            return self._json(200, {'ok': True, 'name': State.name, 'version': app_version(), 'hosted': True, **s.counts()})
        if op == 'status':
            return self._json(200, self._status())
        if op == 'hold' and post:
            return self._json(200, self._hold())
        if op == 'backup-download':
            return self._backup_download()
        if op in ('claude-status',):
            return self._json(200, {'available': False, 'reason': 'Claude is not set up on this server yet.'})
        if op in ('claude', 'claude-check'):
            raise StoreError(501, 'Claude is not set up on this server yet.')
        if op in ('update-info', 'update-install', 'rollback-info', 'rollback', 'rollforward'):
            raise StoreError(404, 'The server is updated by replacing its Docker image, not from inside the app.')
        if op == 'atlas-status':
            a = State.atlas
            return self._json(200, {'configured': bool(a and a.configured), 'base': a.base if a and a.configured else ''})
        if op == 'atlas-dungeons':
            return self._json(200, State.atlas.dungeons() if State.atlas else self._atlas_off())
        if op == 'atlas-dungeon':
            return self._json(200, State.atlas.dungeon(self._q1('id')) if State.atlas else self._atlas_off())
        if op == 'atlas-image' and post:
            return self._json(200, self._atlas_image())
        if op == 'undo-info':
            return self._json(200, s.undo_info())
        if op == 'undo-push' and post:
            try:
                req = json.loads(self._body.decode('utf-8') or '{}')
            except ValueError:
                raise StoreError(400, 'That request was not valid.')
            return self._json(200, s.undo_push(bool(req.get('force')), device))
        if op == 'trash-list':
            return self._json(200, s.trash_list())
        if op == 'trash-restore' and post:
            return self._json(200, {'path': s.trash_restore(rel, device)})
        if op == 'changes':
            try:
                since = int(self._q1('since', '0') or 0)
            except ValueError:
                raise StoreError(400, 'Bad since')
            out = s.changes(since)
            out['version'] = app_version()       # lets an open page notice that the server was updated while it stayed open
            return self._json(200, out)
        if op == 'snapshot':
            return self._json(200, s.snapshot())
        if op == 'history':
            return self._json(200, s.history(rel))
        if op == 'version':
            try:
                v = int(self._q1('v'))
            except ValueError:
                raise StoreError(400, 'Bad version')
            return self._send(200, s.version_data(rel, v), 'text/markdown; charset=utf-8')
        if op == 'search':
            return self._json(200, s.search(self._q1('q')))
        if op == 'backup' and post:
            stamp = time.strftime('%Y%m%d-%H%M%S')
            dest = s.backup_to(os.path.join(os.path.dirname(os.path.abspath(s.path)), 'backups', 'dmforge-%s.db' % stamp))
            return self._json(200, {'file': os.path.basename(dest)})
        # file-shaped operations (the same ones the Mac helper speaks)
        if op == 'list':
            return self._json(200, s.list(rel))
        if op == 'exists':
            return self._json(200, {'exists': s.exists(rel)})
        if op == 'stat':
            return self._json(200, s.stat(rel))
        if op == 'read':
            data, version, mtime = s.read(rel)
            ctype = mimetypes.guess_type(rel)[0] or 'application/octet-stream'
            return self._send(200, data, ctype, {'X-DMF-Version': str(version), 'X-DMF-Mtime': str(mtime)})
        if op == 'mkdir' and post:
            s.mkdir(rel)
            return self._json(200, {'ok': True})
        if op == 'write' and post:
            r = s.write(rel, self._body, base=self._base(), push=self._q1('push'), device=device)
            return self._json(200, {'ok': True, 'version': r['version'], 'mtime': r['mtime']})
        if op == 'trash' and post:
            r = s.trash(rel, base=self._base(), push=self._q1('push'), device=device)
            return self._json(200, r)
        raise StoreError(404, 'Unknown request')


def seconds_until(hour, now=None):
    """Seconds from `now` (local time) until the next time the clock says `hour`:00."""
    t = time.localtime(now if now is not None else time.time())
    nxt = time.mktime((t.tm_year, t.tm_mon, t.tm_mday, hour, 0, 0, 0, 0, -1))
    cur = time.mktime(t)
    if nxt <= cur:
        nxt = time.mktime((t.tm_year, t.tm_mon, t.tm_mday + 1, hour, 0, 0, 0, 0, -1))
    return max(1, int(nxt - cur))


def start_nightly(data_dir, export_dir, hour, keep, stop):
    """Every night: copy the database aside and refresh the Markdown export. A failure is logged and tried again tomorrow."""
    def loop():
        while not stop.wait(seconds_until(hour)):
            try:
                r = dmforge_io.nightly(State.store, data_dir, export_dir or None, keep)
                print('nightly backup done: %s' % json.dumps(r), flush=True)
            except Exception as e:  # never take the server down over a backup (the failure is recorded for the Server page)
                print('nightly backup FAILED: %s' % e, flush=True)
    t = threading.Thread(target=loop, daemon=True)
    t.start()
    return t


def make_server(data_dir, app_path, bind='127.0.0.1', port=8765, name='DM Forge', hosts=(), token=None, verbose=False, dmatlas_url='', dmatlas_host=''):
    State.store = Store(os.path.join(data_dir, 'dmforge.db'))
    State.token = token or load_token(data_dir)[0]
    State.session = session_value(State.token)
    State.app_path = app_path
    State.name = name
    State.hosts = tuple(h.strip().lower() for h in hosts if h.strip())
    State.verbose = verbose
    State.data_dir = data_dir
    State.started = time.time()
    State.fails = {}
    State.atlas = Atlas(dmatlas_url, host=dmatlas_host or os.environ.get('DMFORGE_DMATLAS_HOST', ''))
    srv = ThreadingHTTPServer((bind, port), Handler)
    srv.daemon_threads = True
    return srv


def main(argv=None):
    ap = argparse.ArgumentParser(description='DM Forge V3 server')
    ap.add_argument('--data', default=os.environ.get('DMFORGE_DATA', '/data'), help='folder for the database, token and backups')
    ap.add_argument('--app', default=os.environ.get('DMFORGE_APP', os.path.join(HERE, 'DM-Forge.html')))
    ap.add_argument('--bind', default=os.environ.get('DMFORGE_BIND', '127.0.0.1'), help='address to listen on (the Tailscale address, or 127.0.0.1)')
    ap.add_argument('--port', type=int, default=int(os.environ.get('DMFORGE_PORT', '8765')))
    ap.add_argument('--name', default=os.environ.get('DMFORGE_NAME', 'DM Forge'))
    ap.add_argument('--hosts', default=os.environ.get('DMFORGE_HOSTS', ''), help='comma-separated host names this server answers to (empty: any)')
    ap.add_argument('--export-dir', default=os.environ.get('DMFORGE_EXPORT_DIR', ''), help='where the nightly Markdown export goes (empty: no export)')
    ap.add_argument('--backup-hour', type=int, default=int(os.environ.get('DMFORGE_BACKUP_HOUR', '3')), help='local hour of the nightly backup')
    ap.add_argument('--backup-keep', type=int, default=int(os.environ.get('DMFORGE_BACKUP_KEEP', '14')), help='how many nightly database copies to keep')
    ap.add_argument('--dmatlas-url', default=os.environ.get('DMFORGE_DMATLAS_URL', ''), help='where DMAtlas publishes dungeons, for the importer (empty: the importer is off)')
    ap.add_argument('--show-token', action='store_true', help='print the access token and exit')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args(argv)
    token, fresh = load_token(a.data)
    if a.show_token:
        print(token)
        return 0
    try:
        parse_base(a.dmatlas_url)
    except ValueError as e:
        raise SystemExit(str(e))
    srv = make_server(a.data, a.app, a.bind, a.port, a.name, a.hosts.split(','), token, a.verbose, a.dmatlas_url)
    State.backup_hour = a.backup_hour % 24
    n = State.store.dedupe_image_versions()
    if n:
        print('dropped %d duplicate picture copies from the history (the pictures themselves are untouched)' % n, flush=True)
    start_nightly(a.data, a.export_dir, a.backup_hour % 24, a.backup_keep, threading.Event())
    if fresh:
        print('Your DM Forge access token (shown once; read it again with --show-token): %s' % token, flush=True)
    print('DM Forge server listening on http://%s:%d  (data: %s)' % (a.bind, a.port, a.data), flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
