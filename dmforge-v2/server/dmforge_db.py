"""DM Forge V3: the notes database.

One SQLite file holds the whole campaign: every note, every earlier version of every note,
the trash, and what each push changed (for "Undo last push"). Nothing here talks HTTP; the
web server (dmforge_hosted.py) is a thin layer over this class.

Rules this file keeps:
  * Nothing is ever erased. A write keeps the old text as a version, a delete moves the note to
    the trash table, an undo is itself a version. History only grows.
  * Every write can say which version it was based on (`base`). If the note has moved on since,
    the write is refused with a Conflict that carries the current text, so the caller can merge
    or ask. Replaying a write that already went through is recognised and is not a conflict.
  * Paths are plain vault-relative strings ("NPCs/Mira.md"). Only .md notes can be written or
    deleted through the API; other files (images, handouts) can only arrive through import.

Standard library only.
"""
import hashlib
import json
import os
import re
import sqlite3
import threading
import time

SCHEMA_VERSION = 1
UNDO_KEEP = 10
MAX_PATH = 400


class StoreError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Conflict(Exception):
    """The note is not the version the caller started from.

    kind: 'changed' (it was edited since), 'deleted' (it was moved to the trash since),
          'exists' (the caller thought it was new, but it is already there).
    current: {'version', 'mtime', 'data'} of what is stored now, or None when it is in the trash.
    """
    def __init__(self, kind, path, current):
        super().__init__('Conflict on %s (%s)' % (path, kind))
        self.kind = kind
        self.path = path
        self.current = current


def _now_ms():
    return int(time.time() * 1000)


def _sha(data):
    return hashlib.sha1(data).hexdigest()


def clean_path(rel):
    """'/a//b/./c.md' -> 'a/b/c.md'. Refuses '..', NUL and absurd lengths."""
    if rel is None:
        rel = ''
    if '\x00' in rel:
        raise StoreError(400, 'Bad path')
    parts = [p for p in rel.replace('\\', '/').split('/') if p not in ('', '.')]
    if any(p == '..' for p in parts):
        raise StoreError(400, 'Bad path')
    out = '/'.join(parts)
    if len(out) > MAX_PATH:
        raise StoreError(400, 'That path is too long')
    return out


def clean_md_path(rel):
    path = clean_path(rel)
    parts = path.split('/') if path else []
    if not parts or not parts[-1].lower().endswith('.md'):
        raise StoreError(400, 'Only .md notes can be changed')
    if any(p.startswith('.') for p in parts[:-1]):
        raise StoreError(400, 'Notes cannot be written inside hidden folders')
    return path


def _text(data):
    return data.decode('utf-8', errors='replace')


SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  is_dir INTEGER NOT NULL DEFAULT 0,
  content BLOB,
  mtime INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  version INTEGER NOT NULL,
  content BLOB,
  mtime INTEGER NOT NULL,
  action TEXT NOT NULL,
  push_id TEXT,
  device TEXT
);
CREATE INDEX IF NOT EXISTS versions_path ON versions (path, version);
CREATE TABLE IF NOT EXISTS trash (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  content BLOB,
  mtime INTEGER NOT NULL,
  trashed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pushes (id TEXT PRIMARY KEY, time INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS push_entries (
  push_id TEXT NOT NULL,
  path TEXT NOT NULL,
  action TEXT NOT NULL,
  existed INTEGER NOT NULL,
  before BLOB,
  after_sha TEXT,
  PRIMARY KEY (push_id, path)
);
CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(path UNINDEXED, body, tokenize='unicode61 remove_diacritics 2');
"""


class Store:
    def __init__(self, path):
        self.path = path
        if path != ':memory:':
            os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        if path != ':memory:':
            self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('PRAGMA foreign_keys=ON')
        with self.lock:
            self.db.executescript(SCHEMA)
            row = self.db.execute("SELECT value FROM meta WHERE key='schema'").fetchone()
            if row is None:
                self.db.execute("INSERT INTO meta (key, value) VALUES ('schema', ?)", (str(SCHEMA_VERSION),))
            elif int(row['value']) > SCHEMA_VERSION:
                raise StoreError(500, 'This database was made by a newer DM Forge. Update the server.')

    def close(self):
        with self.lock:
            self.db.close()

    # ---- helpers ----
    def _tx(self):
        return _Tx(self)

    def _next_version(self, path):
        row = self.db.execute('SELECT COALESCE(MAX(version), 0) AS v FROM versions WHERE path=?', (path,)).fetchone()
        return row['v'] + 1

    def _row(self, path):
        return self.db.execute('SELECT * FROM files WHERE path=? AND is_dir=0', (path,)).fetchone()

    def _index(self, path, data):
        self.db.execute('DELETE FROM search WHERE path=?', (path,))
        if data is not None and path.lower().endswith('.md'):
            self.db.execute('INSERT INTO search (path, body) VALUES (?, ?)', (path, path + '\n' + _text(data)))

    def _current(self, row):
        return {'version': row['version'], 'mtime': row['mtime'], 'data': bytes(row['content'] or b'')}

    def _keep_for_push(self, push, path, action, row):
        """Keeps what is in the note now, once per push per note, so the push can be undone."""
        if not push:
            return
        self.db.execute('INSERT OR IGNORE INTO pushes (id, time) VALUES (?, ?)', (push, _now_ms()))
        if self.db.execute('SELECT 1 FROM push_entries WHERE push_id=? AND path=?', (push, path)).fetchone():
            return
        self.db.execute('INSERT INTO push_entries (push_id, path, action, existed, before) VALUES (?, ?, ?, ?, ?)',
                        (push, path, action, 1 if row else 0, bytes(row['content'] or b'') if row else None))
        self._prune_pushes()

    def _noted_wrote(self, push, path, data):
        if push:
            self.db.execute('UPDATE push_entries SET after_sha=? WHERE push_id=? AND path=?', (_sha(data), push, path))

    @staticmethod
    def clean_push(push):
        if not push:
            return ''
        clean = re.sub(r'[^0-9A-Za-z_-]', '', str(push))[:40]
        if not clean:
            raise StoreError(400, 'Bad push id')
        return clean

    # ---- reading ----
    def exists(self, rel):
        path = clean_path(rel)
        with self.lock:
            if not path:
                return True
            if self.db.execute('SELECT 1 FROM files WHERE path=?', (path,)).fetchone():
                return True
            return self._has_children(path)

    def _has_children(self, path):
        pre = path + '/'
        row = self.db.execute('SELECT 1 FROM files WHERE substr(path, 1, ?) = ? LIMIT 1', (len(pre), pre)).fetchone()
        return row is not None

    def is_dir(self, rel):
        path = clean_path(rel)
        with self.lock:
            if not path:
                return True
            row = self.db.execute('SELECT is_dir FROM files WHERE path=?', (path,)).fetchone()
            if row is not None:
                return bool(row['is_dir'])
            return self._has_children(path)

    def list(self, rel):
        path = clean_path(rel)
        with self.lock:
            if path and not self.is_dir(path):
                raise StoreError(404, 'Not a folder')
            pre = path + '/' if path else ''
            seen = {}
            for r in self.db.execute('SELECT path, is_dir FROM files WHERE substr(path, 1, ?) = ?', (len(pre), pre)):
                rest = r['path'][len(pre):]
                if not rest:
                    continue
                first, _, more = rest.partition('/')
                kind = 'dir' if (more or r['is_dir']) else 'file'
                if seen.get(first) != 'dir':
                    seen[first] = kind
            return [{'name': n, 'kind': k} for n, k in sorted(seen.items())]

    def read(self, rel):
        """-> (bytes, version, mtime) or raises 404."""
        path = clean_path(rel)
        with self.lock:
            row = self._row(path)
            if row is None:
                raise StoreError(404, 'Not found')
            return bytes(row['content'] or b''), row['version'], row['mtime']

    def stat(self, rel):
        path = clean_path(rel)
        with self.lock:
            row = self._row(path)
            if row is not None:
                return {'size': len(row['content'] or b''), 'mtime': row['mtime'], 'version': row['version']}
            if self.is_dir(path) and self.exists(path):
                r = self.db.execute('SELECT mtime FROM files WHERE path=?', (path,)).fetchone()
                return {'size': 0, 'mtime': r['mtime'] if r else 0}
            raise StoreError(404, 'Not found')

    # ---- writing ----
    def mkdir(self, rel):
        path = clean_path(rel)
        parts = path.split('/') if path else []
        if any(p.startswith('.') for p in parts):
            raise StoreError(400, 'Hidden folders cannot be created')
        if not path:
            return
        with self._tx():
            if self._row(path):
                raise StoreError(400, 'A note with that name is already there')
            if not self.db.execute('SELECT 1 FROM files WHERE path=?', (path,)).fetchone():
                self.db.execute('INSERT INTO files (path, is_dir, content, mtime, version) VALUES (?, 1, NULL, ?, 0)',
                                (path, _now_ms()))

    def write(self, rel, data, base=None, push=None, device='', action='write', md_only=True):
        """Writes a note. -> {'version', 'mtime', 'changed'}.
        base: the version the caller started from (0 = "I think this note is new"); None skips the check.
        Raises Conflict when the note is not at that version, unless it already holds exactly `data`."""
        path = clean_md_path(rel) if md_only else clean_path(rel)
        if not isinstance(data, (bytes, bytearray)):
            data = str(data).encode('utf-8')
        data = bytes(data)
        push = self.clean_push(push)
        with self._tx():
            row = self._row(path)
            cur_v = row['version'] if row else 0
            if base is not None and base != cur_v:
                if row is not None and bytes(row['content'] or b'') == data:
                    # the same write already went through (a replay after a lost reply): nothing to do
                    return {'version': cur_v, 'mtime': row['mtime'], 'changed': False}
                if row is not None:
                    raise Conflict('exists' if base == 0 else 'changed', path, self._current(row))
                raise Conflict('deleted', path, None)
            if row is not None and bytes(row['content'] or b'') == data:
                return {'version': cur_v, 'mtime': row['mtime'], 'changed': False}
            if self.db.execute('SELECT 1 FROM files WHERE path=? AND is_dir=1', (path,)).fetchone():
                raise StoreError(400, 'A folder with that name is already there')
            self._keep_for_push(push, path, 'write', row)
            version = self._next_version(path)
            # a picture is kept once (in `files`): its history row records that it was written but does not hold a second copy of the bytes
            keep = data if path.lower().endswith('.md') else None
            mtime = _now_ms()
            self.db.execute('INSERT INTO files (path, is_dir, content, mtime, version) VALUES (?, 0, ?, ?, ?) '
                            'ON CONFLICT(path) DO UPDATE SET content=excluded.content, mtime=excluded.mtime, version=excluded.version, is_dir=0',
                            (path, data, mtime, version))
            self.db.execute('INSERT INTO versions (path, version, content, mtime, action, push_id, device) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            (path, version, keep, mtime, action, push or None, device or None))
            self._index(path, data)
            self._noted_wrote(push, path, data)
            return {'version': version, 'mtime': mtime, 'changed': True}

    def write_image(self, rel, data, device=''):
        """Stores a PNG (only the DMAtlas importer does this, after checking it). The path is kept under a Maps folder as .png, so the
        general rule that only notes can be written through the API still holds. -> {'stored': bool, 'version': n}; storing the same
        bytes again changes nothing."""
        path = clean_path(rel)
        parts = path.split('/')
        if not path.lower().endswith('.png') or 'Maps' not in parts[:-2] or any(p.startswith('.') for p in parts):
            raise StoreError(400, 'Pictures are stored under a Maps folder, as .png.')
        data = bytes(data)
        if len(data) > 15 * 1024 * 1024:
            raise StoreError(400, 'That picture is too large.')
        with self._tx():
            row = self._row(path)
            if row is not None and bytes(row['content'] or b'') == data:
                return {'stored': False, 'version': row['version']}
            r = self.write(path, data, device=device, action='import', md_only=False)
            return {'stored': True, 'version': r['version']}

    def trash(self, rel, base=None, push=None, device=''):
        """Moves a note to the trash. It can be restored; its history stays."""
        path = clean_md_path(rel)
        push = self.clean_push(push)
        with self._tx():
            row = self._row(path)
            if row is None:
                raise StoreError(404, 'Not found')
            if base is not None and base != row['version']:
                raise Conflict('changed', path, self._current(row))
            self._keep_for_push(push, path, 'trash', row)
            now = _now_ms()
            content = bytes(row['content'] or b'')
            self.db.execute('INSERT INTO trash (path, content, mtime, trashed_at) VALUES (?, ?, ?, ?)',
                            (path, content, row['mtime'], now))
            self.db.execute('INSERT INTO versions (path, version, content, mtime, action, push_id, device) VALUES (?, ?, ?, ?, ?, ?, ?)',
                            (path, self._next_version(path), content, now, 'trash', push or None, device or None))
            self.db.execute('DELETE FROM files WHERE path=?', (path,))
            self._index(path, None)
            return {'ok': True}

    def trash_list(self):
        with self.lock:
            out = []
            for r in self.db.execute('SELECT path, length(content) AS size, trashed_at FROM trash ORDER BY trashed_at DESC, id DESC'):
                out.append({'path': '.trash/' + r['path'], 'size': r['size'] or 0, 'mtime': r['trashed_at']})
            return out

    def trash_restore(self, rel, device=''):
        """Puts the newest trashed copy back where it was. If a note is there now, it comes back beside it
        as "name (restored).md". -> the path it was restored to."""
        parts = [p for p in clean_path(rel).split('/') if p]
        if len(parts) < 2 or parts[0] != '.trash':
            raise StoreError(400, 'That is not a note in the trash')
        orig = clean_md_path('/'.join(parts[1:]))
        with self._tx():
            t = self.db.execute('SELECT id, content FROM trash WHERE path=? ORDER BY trashed_at DESC, id DESC LIMIT 1', (orig,)).fetchone()
            if t is None:
                raise StoreError(404, 'Not found')
            dest = orig
            if self.db.execute('SELECT 1 FROM files WHERE path=?', (dest,)).fetchone():
                stem = orig[:-3]
                dest = stem + ' (restored).md'
                n = 1
                while self.db.execute('SELECT 1 FROM files WHERE path=?', (dest,)).fetchone():
                    n += 1
                    dest = '%s (restored %d).md' % (stem, n)
            self.write(dest, bytes(t['content'] or b''), action='restore', device=device)
            self.db.execute('DELETE FROM trash WHERE id=?', (t['id'],))
            return dest

    # ---- undo last push ----
    def _pushes(self):
        rows = self.db.execute('SELECT p.id, p.time FROM pushes p WHERE EXISTS (SELECT 1 FROM push_entries e WHERE e.push_id=p.id) '
                               'ORDER BY p.time DESC, p.rowid DESC').fetchall()
        return rows

    def _prune_pushes(self):
        for r in self._pushes()[UNDO_KEEP:]:
            self.db.execute('DELETE FROM push_entries WHERE push_id=?', (r['id'],))
            self.db.execute('DELETE FROM pushes WHERE id=?', (r['id'],))

    def undo_info(self):
        with self.lock:
            lst = self._pushes()
            if not lst:
                return {'available': None, 'count': 0}
            p = lst[0]
            ents = self.db.execute('SELECT path, action FROM push_entries WHERE push_id=? ORDER BY rowid', (p['id'],)).fetchall()
            return {'available': {'id': p['id'], 'time': p['time'], 'files': len(ents),
                                  'written': sum(1 for e in ents if e['action'] == 'write'),
                                  'trashed': sum(1 for e in ents if e['action'] == 'trash'),
                                  'rels': [e['path'] for e in ents][:40]}, 'count': len(lst)}

    def undo_push(self, force=False, device=''):
        """Puts every note the newest push touched back as it was. Notes changed again since are left alone
        unless force; then nothing changes and {'conflicts': [...]} comes back."""
        with self._tx():
            lst = self._pushes()
            if not lst:
                raise StoreError(404, 'There is no push to undo.')
            pid = lst[0]['id']
            ents = self.db.execute('SELECT * FROM push_entries WHERE push_id=? ORDER BY rowid', (pid,)).fetchall()
            conflicts = []
            plan = []
            for e in ents:
                row = self._row(e['path'])
                now = _sha(bytes(row['content'] or b'')) if row else None
                if e['action'] == 'write':
                    changed = now is not None and e['after_sha'] and now != e['after_sha']
                else:
                    changed = now is not None
                if changed:
                    conflicts.append(e['path'])
                plan.append((e, row))
            if conflicts and not force:
                return {'conflicts': conflicts}
            restored = removed = 0
            for e, row in reversed(plan):
                if e['existed']:
                    self.write(e['path'], bytes(e['before'] or b''), action='undo', device=device)
                    restored += 1
                elif row is not None:
                    self.trash(e['path'], device=device)
                    removed += 1
            self.db.execute('DELETE FROM push_entries WHERE push_id=?', (pid,))
            self.db.execute('DELETE FROM pushes WHERE id=?', (pid,))
            return {'restored': restored, 'removed': removed, 'conflicts': []}

    def finish_push(self):
        with self._tx():
            self._prune_pushes()

    # ---- history, sync, search ----
    def changes(self, since=0, limit=5000):
        """Which notes changed after sequence number `since`. -> {'seq': number to ask from next time, 'changes': [...], 'more': bool}.
        A caller that stores `seq` and asks again later hears only about what moved. A note that was deleted shows
        as action 'trash'. When more than `limit` notes moved, `seq` is the last change handed out and `more` is true:
        ask again from that number until `more` is false, so nothing is skipped."""
        with self.lock:
            newest = self.db.execute('SELECT COALESCE(MAX(seq), 0) AS s FROM versions').fetchone()['s']
            rows = self.db.execute(
                'SELECT v.seq, v.path, v.version, v.action, v.mtime FROM versions v '
                'JOIN (SELECT path, MAX(seq) AS m FROM versions WHERE seq > ? GROUP BY path) x ON x.m = v.seq '
                'ORDER BY v.seq LIMIT ?', (int(since), int(limit) + 1)).fetchall()
            more = len(rows) > limit
            rows = rows[:limit]
            seq = rows[-1]['seq'] if more else newest
            return {'seq': seq, 'more': more,
                    'changes': [{'path': r['path'], 'version': r['version'], 'action': r['action'], 'mtime': r['mtime']} for r in rows]}

    def snapshot(self):
        """Every live note with its version, for a client that is starting from nothing: {path: version}."""
        with self.lock:
            seq = self.db.execute('SELECT COALESCE(MAX(seq), 0) AS s FROM versions').fetchone()['s']
            rows = self.db.execute('SELECT path, version, mtime FROM files WHERE is_dir=0 ORDER BY path').fetchall()
            return {'seq': seq, 'files': [{'path': r['path'], 'version': r['version'], 'mtime': r['mtime']} for r in rows]}

    def history(self, rel, limit=200):
        path = clean_path(rel)
        with self.lock:
            rows = self.db.execute('SELECT seq, version, mtime, action, device, length(content) AS size FROM versions '
                                   'WHERE path=? ORDER BY seq DESC LIMIT ?', (path, int(limit))).fetchall()
            return [dict(r) for r in rows]

    def version_data(self, rel, version):
        path = clean_path(rel)
        with self.lock:
            r = self.db.execute('SELECT content FROM versions WHERE path=? AND version=?', (path, int(version))).fetchone()
            if r is None or (r['content'] is None and not path.lower().endswith('.md')):
                raise StoreError(404, 'Not found')
            return bytes(r['content'] or b'')

    def search(self, query, limit=50):
        """Whole-word-prefix search over note text and path. -> [{path, snippet}]"""
        words = re.findall(r'\w+', query or '', re.UNICODE)
        if not words:
            return []
        match = ' '.join('"%s"*' % w.replace('"', '') for w in words[:8])
        with self.lock:
            rows = self.db.execute("SELECT path, snippet(search, 1, '[', ']', '…', 12) AS s FROM search WHERE search MATCH ? ORDER BY rank LIMIT ?",
                                   (match, int(limit))).fetchall()
            return [{'path': r['path'], 'snippet': r['s']} for r in rows]

    def reindex(self):
        with self._tx():
            self.db.execute('DELETE FROM search')
            for r in self.db.execute('SELECT path, content FROM files WHERE is_dir=0').fetchall():
                self._index(r['path'], bytes(r['content'] or b''))

    # ---- backup ----
    def backup_to(self, dest):
        """A consistent copy of the whole database while it is in use (SQLite's own backup, not a file copy)."""
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        tmp = dest + '.part'
        if os.path.exists(tmp):
            os.unlink(tmp)
        out = sqlite3.connect(tmp)
        try:
            with self.lock:
                self.db.backup(out)
            out.execute('PRAGMA journal_mode=DELETE')      # the copy is one self-contained file: no -wal or -shm companions to lose or leave behind
        finally:
            out.close()
        os.replace(tmp, dest)
        return dest

    def health(self, wait=3.0):
        """True when the database can be written to right now. Gives up after `wait` seconds instead of hanging (a stuck lock,
        a full disk and a read-only file all show up as False)."""
        if not self.lock.acquire(timeout=wait):
            return False
        try:
            with self._tx():
                self.db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('heartbeat', ?)", (str(_now_ms()),))
            return True
        except Exception:
            return False
        finally:
            self.lock.release()

    def dedupe_image_versions(self):
        """Pictures used to be kept twice (the file and a history copy). Drops the history copies: the picture itself stays in `files`,
        and the database file itself shrinks the next time it is vacuumed or simply reuses the space. -> rows changed."""
        with self._tx():
            cur = self.db.execute("UPDATE versions SET content=NULL WHERE content IS NOT NULL AND lower(path) NOT LIKE '%.md'")
            return cur.rowcount

    def stats(self):
        with self.lock:
            md = self.db.execute("SELECT COUNT(*) AS c FROM files WHERE is_dir=0 AND lower(path) LIKE '%.md'").fetchone()['c']
            other = self.db.execute("SELECT COUNT(*) AS c FROM files WHERE is_dir=0 AND lower(path) NOT LIKE '%.md'").fetchone()['c']
            t = self.db.execute('SELECT COUNT(*) AS c FROM trash').fetchone()['c']
            return {'notes': md, 'images': other, 'trashed': t}

    def counts(self):
        with self.lock:
            n = self.db.execute('SELECT COUNT(*) AS c FROM files WHERE is_dir=0').fetchone()['c']
            t = self.db.execute('SELECT COUNT(*) AS c FROM trash').fetchone()['c']
            return {'notes': n, 'trashed': t}


class _Tx:
    """BEGIN IMMEDIATE ... COMMIT, holding the store lock. Re-entrant: an inner use joins the outer transaction.

    Two things this must never do: keep the lock when BEGIN fails (another process holds the database), which
    would park every later request for good; and leave a transaction open when COMMIT fails (a full disk), which
    later writes would silently join and never save."""
    def __init__(self, store):
        self.s = store
        self.outer = False

    def __enter__(self):
        self.s.lock.acquire()
        try:
            self.outer = not self.s.db.in_transaction
            if self.outer:
                self.s.db.execute('BEGIN IMMEDIATE')
        except BaseException:
            self.outer = False
            self.s.lock.release()
            raise
        return self

    def __exit__(self, et, ev, tb):
        try:
            if self.outer:
                if et is None:
                    try:
                        self.s.db.execute('COMMIT')
                    except BaseException:
                        self._rollback()
                        raise
                else:
                    self._rollback()
        finally:
            self.s.lock.release()
        return False

    def _rollback(self):
        try:
            if self.s.db.in_transaction:
                self.s.db.execute('ROLLBACK')
        except Exception:
            pass
