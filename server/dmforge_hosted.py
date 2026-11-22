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
import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dmforge_db import Store, StoreError, Conflict  # noqa: E402
import dmforge_io  # noqa: E402

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
<title>DM Forge</title>
<style>
body{font-family:Georgia,serif;background:#f4efe4;color:#2c2418;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:#fffaf0;border:1px solid #d8ccb4;border-radius:12px;padding:28px;width:min(360px,90vw)}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 16px;color:#6b5d45;font-size:14px}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bfae8a;border-radius:8px;font-size:16px;margin-bottom:12px}
button{width:100%;padding:10px;border:0;border-radius:8px;background:#8a6a2f;color:#fff;font-size:16px;cursor:pointer}
.err{color:#9a2b1d;font-size:14px;margin:0 0 10px}
@media (prefers-color-scheme:dark){body{background:#1c1913;color:#eadfc8}form{background:#26221a;border-color:#443c2c}p{color:#b3a583}input{background:#1c1913;color:#eadfc8;border-color:#5a4f38}}
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

    def log_message(self, fmt, *args):
        if State.verbose:
            sys.stderr.write('  ' + (fmt % args) + '\n')

    # ---- plumbing ----
    def _send(self, status, body=b'', ctype='application/json', extra=None):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

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
        if length > MAX_WRITE:
            self.close_connection = True
            return self._json(413, {'error': 'That request is too large'})
        self._body = self.rfile.read(length) if length > 0 else b''
        if parsed.path == '/healthz':
            return self._json(200, {'ok': True})
        if not self._host_ok():
            return self._json(403, {'error': 'Forbidden'})
        try:
            if parsed.path == '/' and self.command in ('GET', 'HEAD'):
                return self._serve_app()
            if parsed.path == '/sw.js' and self.command in ('GET', 'HEAD'):
                return self._serve_worker()
            if parsed.path == '/login' and self.command == 'POST':
                return self._login()
            if parsed.path == '/logout' and self.command == 'POST':
                return self._send(303, b'', 'text/plain', {'Location': '/', 'Set-Cookie': '%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict' % COOKIE})
            if parsed.path.startswith('/api/'):
                if self._locked_out():
                    return self._json(429, {'error': 'Too many wrong tokens. Wait a minute and try again.'})
                if not self._authed():
                    self._note_fail()
                    return self._json(401, {'error': 'Sign in again: the access token is missing or wrong.', 'auth': True})
                self._clear_fails()
                self._q = parse_qs(parsed.query)
                return self._api(parsed.path[5:], (self._q.get('path') or [''])[0])
            return self._json(404, {'error': 'Not found'})
        except Conflict as c:
            cur = None
            if c.current:
                cur = {'version': c.current['version'], 'mtime': c.current['mtime'],
                       'text': c.current['data'].decode('utf-8', errors='replace')}
            return self._json(409, {'error': 'This note changed on the server since you started editing it.',
                                    'conflict': c.kind, 'path': c.path, 'current': cur})
        except StoreError as e:
            return self._json(e.status, {'error': e.message})
        except Exception as e:  # keep the server alive; report the problem to the app
            if State.verbose:
                import traceback
                traceback.print_exc()
            return self._json(500, {'error': 'Server error: %s' % e})

    do_GET = do_POST = do_HEAD = _dispatch

    # ---- the app and signing in ----
    def _serve_app(self):
        if not self._authed():
            return self._send(200, LOGIN.replace('%ERR%', ''), 'text/html; charset=utf-8')
        try:
            with open(State.app_path, 'rb') as f:
                html = f.read().decode('utf-8')
        except OSError:
            return self._send(500, '<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:2em">'
                                   '<h3>DM Forge</h3><p>The app file was not found on the server (%s).</p>' % os.path.basename(State.app_path),
                              'text/html; charset=utf-8')
        info = json.dumps({'name': State.name, 'token': '', 'hosted': True})
        inject = '<script>window.__DMF_SERVER__=%s;</script>' % info.replace('<', '\\u003c')
        html = html.replace('<!--DMF_SERVER-->', inject, 1)
        self._send(200, html, 'text/html; charset=utf-8', {'X-DMF-App': '1'})

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
        if self._locked_out():
            return self._send(429, LOGIN.replace('%ERR%', '<p class="err">Too many tries. Wait a minute.</p>'), 'text/html; charset=utf-8')
        form = parse_qs(self._body.decode('utf-8', errors='replace'))
        got = (form.get('token') or [''])[0].strip()
        if not got or not secrets.compare_digest(got, State.token):
            self._note_fail()
            return self._send(401, LOGIN.replace('%ERR%', '<p class="err">That token is not right.</p>'), 'text/html; charset=utf-8')
        self._clear_fails()
        cookie = '%s=%s; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict%s' % (COOKIE, State.session, '; Secure' if self._secure() else '')
        return self._send(303, b'', 'text/plain', {'Location': '/', 'Set-Cookie': cookie})

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
        if op in ('claude-status',):
            return self._json(200, {'available': False, 'reason': 'Claude is not set up on this server yet.'})
        if op in ('claude', 'claude-check'):
            raise StoreError(501, 'Claude is not set up on this server yet.')
        if op in ('update-info', 'update-install', 'rollback-info', 'rollback', 'rollforward'):
            raise StoreError(404, 'The server is updated by replacing its Docker image, not from inside the app.')
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
            return self._json(200, s.changes(since))
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
            except Exception as e:  # never take the server down over a backup
                print('nightly backup FAILED: %s' % e, flush=True)
    t = threading.Thread(target=loop, daemon=True)
    t.start()
    return t


def make_server(data_dir, app_path, bind='127.0.0.1', port=8765, name='DM Forge', hosts=(), token=None, verbose=False):
    State.store = Store(os.path.join(data_dir, 'dmforge.db'))
    State.token = token or load_token(data_dir)[0]
    State.session = session_value(State.token)
    State.app_path = app_path
    State.name = name
    State.hosts = tuple(h.strip().lower() for h in hosts if h.strip())
    State.verbose = verbose
    State.fails = {}
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
    ap.add_argument('--show-token', action='store_true', help='print the access token and exit')
    ap.add_argument('--verbose', action='store_true')
    a = ap.parse_args(argv)
    token, fresh = load_token(a.data)
    if a.show_token:
        print(token)
        return 0
    srv = make_server(a.data, a.app, a.bind, a.port, a.name, a.hosts.split(','), token, a.verbose)
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
