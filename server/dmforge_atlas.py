"""DM Forge V3: the DMAtlas connection.

DMAtlas (the owner's other app) publishes dungeons read-only on the tailnet. This module fetches them for the importer:

  GET  <base>/api/forge/dungeons                       the list
  GET  <base>/api/forge/dungeons/<id>                  one dungeon, with its levels and rooms
  GET  <base>/api/forge/maps/<mapId>/image/<sha256>.png  a level's picture (the same bytes for the same hash, forever)

Everything that comes back is treated as untrusted:
  * only URLs under the configured base address are ever requested (the paths are built here from checked ids; a redirect, which
    could point anywhere, is refused)
  * answers are size-capped and must parse as the expected kind of JSON
  * a picture must have the PNG signature, be no larger than 15 MB and 16384 pixels either way, and hash to exactly the sha256 asked for
  * where a picture may be stored is decided here (under a Maps folder, .png only), not by the page

Standard library only.
"""
import hashlib
import json
import re
import struct
import urllib.error
import urllib.parse
import urllib.request

MAX_JSON = 2 * 1024 * 1024
MAX_IMAGE = 15 * 1024 * 1024
MAX_PIXELS = 16384
PNG_SIG = b'\x89PNG\r\n\x1a\n'
ID_RE = re.compile(r'^[A-Za-z0-9._:-]{1,80}$')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
DEST_RE = re.compile(r'^(?:[^/\x00]+/)*Maps/[^/\x00]+/[^/\x00]+\.png$')


class AtlasError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise AtlasError(502, 'DMAtlas sent us somewhere else (a redirect), and that is never followed.')


def parse_base(url):
    """-> the base address without a trailing slash, or '' when none is set. Refuses anything that is not a plain http(s) address."""
    url = (url or '').strip()
    if not url:
        return ''
    u = urllib.parse.urlsplit(url)
    if u.scheme not in ('http', 'https') or not u.hostname or u.username or u.password or u.query or u.fragment:
        raise ValueError('DMFORGE_DMATLAS_URL must look like https://host:port (no password, query or #)')
    return urllib.parse.urlunsplit((u.scheme, u.netloc, u.path.rstrip('/'), '', ''))


class Atlas:
    def __init__(self, base, timeout=20):
        self.base = parse_base(base)
        self.timeout = timeout
        self._opener = urllib.request.build_opener(_NoRedirect)

    @property
    def configured(self):
        return bool(self.base)

    # ---- plumbing ----
    def _get(self, path, limit, accept):
        if not self.base:
            raise AtlasError(503, 'DMAtlas is not set up on this server. Set DMFORGE_DMATLAS_URL (see deploy/DEPLOY-V3.md).')
        url = self.base + path
        req = urllib.request.Request(url, headers={'Accept': accept, 'User-Agent': 'DMForge-import'})
        try:
            with self._opener.open(req, timeout=self.timeout) as r:
                if r.status != 200:
                    raise AtlasError(502, 'DMAtlas answered %d.' % r.status)
                declared = r.headers.get('Content-Length')
                if declared and declared.isdigit() and int(declared) > limit:
                    raise AtlasError(502, 'DMAtlas sent something larger than the %d byte limit.' % limit)
                data = r.read(limit + 1)
                ctype = (r.headers.get('Content-Type') or '').split(';')[0].strip().lower()
        except AtlasError:
            raise
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise AtlasError(404, 'DMAtlas does not have that (it may not be published).')
            raise AtlasError(502, 'DMAtlas answered %d.' % e.code)
        except (urllib.error.URLError, OSError, ValueError) as e:
            why = getattr(e, 'reason', e)
            hint = ''
            host = (urllib.parse.urlsplit(self.base).hostname or '').lower()
            if isinstance(why, ConnectionRefusedError) and (host.endswith('.ts.net') or host.startswith('100.')):
                hint = ' A tailnet address cannot be used from inside a Docker container: join DMAtlas\'s Docker network instead (deploy/docker-compose.dmatlas.yml, and see Importing dungeons in deploy/DEPLOY-V3.md).'
            raise AtlasError(502, 'Cannot reach DMAtlas at %s (%s). Is it running, and can this server reach that address?%s Nothing was changed.' % (self.base, why, hint))
        if len(data) > limit:
            raise AtlasError(502, 'DMAtlas sent something larger than the %d byte limit.' % limit)
        return data, ctype

    def _json(self, path):
        data, ctype = self._get(path, MAX_JSON, 'application/json')
        if 'json' not in ctype:
            raise AtlasError(502, 'DMAtlas did not answer with JSON.')
        try:
            return json.loads(data.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            raise AtlasError(502, 'DMAtlas sent JSON that cannot be read.')

    # ---- what DMAtlas offers ----
    def dungeons(self):
        out = self._json('/api/forge/dungeons')
        if not isinstance(out, list):
            raise AtlasError(502, 'DMAtlas sent a dungeon list in a shape we do not recognise.')
        return out[:500]

    def dungeon(self, did):
        if not isinstance(did, str) or not ID_RE.match(did):
            raise AtlasError(400, 'That is not a dungeon id.')
        out = self._json('/api/forge/dungeons/' + urllib.parse.quote(did, safe=''))
        if not isinstance(out, dict) or not str(out.get('format', '')).startswith('dmatlas-forge/'):
            raise AtlasError(502, 'DMAtlas sent a dungeon in a shape we do not recognise.')
        return out

    def image(self, map_id, sha256):
        """The checked PNG bytes for a level's picture, and its size in pixels: (bytes, width, height)."""
        if not isinstance(map_id, str) or not ID_RE.match(map_id):
            raise AtlasError(400, 'That is not a map id.')
        if not isinstance(sha256, str) or not SHA_RE.match(sha256):
            raise AtlasError(400, 'That is not a picture hash.')
        data, ctype = self._get('/api/forge/maps/%s/image/%s.png' % (urllib.parse.quote(map_id, safe=''), sha256), MAX_IMAGE, 'image/png')
        w, h = check_png(data)
        if hashlib.sha256(data).hexdigest() != sha256:
            raise AtlasError(502, 'The picture DMAtlas sent does not match its hash, so it was not stored.')
        return data, w, h


def check_png(data):
    """Raises unless this is a real PNG header within the size limits. -> (width, height)"""
    if len(data) < 33 or data[:8] != PNG_SIG:
        raise AtlasError(502, 'DMAtlas sent a picture that is not a PNG.')
    if data[12:16] != b'IHDR':
        raise AtlasError(502, 'DMAtlas sent a damaged PNG.')
    w, h = struct.unpack('>II', data[16:24])
    if not (1 <= w <= MAX_PIXELS and 1 <= h <= MAX_PIXELS):
        raise AtlasError(502, 'The picture is %d x %d pixels; the limit is %d.' % (w, h, MAX_PIXELS))
    return w, h


def check_dest(dest):
    """Where a picture may be stored: <anything>/Maps/<folder>/<name>.png, no '..', no hidden folders."""
    if not isinstance(dest, str) or not DEST_RE.match(dest):
        raise AtlasError(400, 'Pictures are stored under a Maps folder, as .png.')
    parts = dest.split('/')
    if any(p in ('', '.', '..') or p.startswith('.') for p in parts) or '\\' in dest or len(dest) > 300:
        raise AtlasError(400, 'That picture path is not allowed.')
    return dest


def main(argv=None):
    """python -I dmforge_atlas.py [url]  : can this server reach DMAtlas? (run it inside the container: docker compose exec dmforge python -I dmforge_atlas.py)"""
    import os
    import sys
    args = list(sys.argv[1:] if argv is None else argv)
    url = args[0] if args else os.environ.get('DMFORGE_DMATLAS_URL', '')
    try:
        a = Atlas(url)
    except ValueError as e:
        print('Not a usable address: %s' % e)
        return 2
    if not a.configured:
        print('DMFORGE_DMATLAS_URL is not set.')
        return 2
    print('Asking %s ...' % a.base)
    try:
        lst = a.dungeons()
    except AtlasError as e:
        print('FAILED: %s' % e.message)
        return 1
    print('OK. %d published dungeon%s:' % (len(lst), '' if len(lst) == 1 else 's'))
    for d in lst[:20]:
        print('  - %s (%s levels, %s rooms)' % (d.get('name'), d.get('levels'), d.get('rooms')))
    return 0


if __name__ == '__main__':
    import sys as _sys
    _sys.exit(main())
