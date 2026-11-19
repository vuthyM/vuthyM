#!/usr/bin/env python3
"""DM Forge helper.

Serves DM-Forge.html and gives it read/write access to ONE Obsidian vault folder, so the
app works in any browser (including Brave) without browser folder permissions.

  python3 dmforge-server.py "/path/to/your/vault"

Safety:
  * listens on 127.0.0.1 only, and every request needs a random token printed at start-up
  * Host and Origin headers are checked (blocks DNS-rebinding and other websites)
  * paths are confined to the vault folder (no "..", symlinks that leave the vault are refused)
  * only .md files can be written or moved; deleted notes go to <vault>/.trash, never erased
  * writes are atomic (temp file + rename), so a crash cannot leave a half-written note

Claude (experimental): if Claude Code is installed on this Mac, the app can ask it one question at a time. It is run with every
tool off, in an empty temporary folder, so it can only answer in text. Rolling back: --rollback puts back the version that
was installed before this one (kept in .previous).

Updating: when a newer DM-Forge-V2 zip is in your Downloads folder, start-up installs it over this
copy automatically (start with --ask to be asked first). While the helper is running, type `update` and press
Enter in its window to do the same without closing it (it restarts itself on the same link). Only the five app files are taken from the
zip, each is checked first, and the previous version is kept in the .previous folder.
Undo last push: just before a push changes a note, the old text is kept in ~/.dmforge/undo (outside your vault, never synced), so the last
pushes can be undone from the app. Restoring a note from the vault's .trash is also done here.
Uses the Python standard library only.
"""
import argparse
import hashlib
import json
import mimetypes
import os
import re
import secrets
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_WRITE = 20 * 1024 * 1024
APP_FILES = ('DM-Forge.html', 'dmforge-server.py', 'Start DM Forge.command', 'README.md', 'VERSION')
ZIP_NAME = re.compile(r'^DM-Forge-V2.*\.zip$', re.I)
MAX_APP_FILE = 12 * 1024 * 1024
CONFIG_DIR = os.environ.get('DMF_CONFIG_DIR') or os.path.join(os.path.expanduser('~'), '.dmforge')
mimetypes.add_type('image/svg+xml', '.svg')
mimetypes.add_type('image/webp', '.webp')
mimetypes.add_type('text/markdown; charset=utf-8', '.md')


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class State:
    root = ''
    root_real = ''
    token = ''
    port = 0
    app_path = ''
    verbose = False
    downloads = ''
    trash = None
    restart = False
    server = None


def unescape_dragged_path(raw):
    """Terminal inserts backslashes before spaces when you drag a folder in."""
    p = raw.strip()
    if len(p) >= 2 and p[0] == p[-1] and p[0] in '\'"':
        p = p[1:-1]
    p = re.sub(r'\\(.)', r'\1', p)
    return os.path.expanduser(p.strip())


def resolve(rel):
    """Maps a vault-relative path to a real path, refusing anything outside the vault."""
    if '\x00' in rel:
        raise ApiError(400, 'Bad path')
    parts = [p for p in rel.replace('\\', '/').split('/') if p not in ('', '.')]
    if any(p == '..' for p in parts):
        raise ApiError(400, 'Bad path')
    full = os.path.join(State.root, *parts)
    real = os.path.realpath(full)
    if not (real == State.root_real or real.startswith(State.root_real + os.sep)):
        raise ApiError(403, 'That path is outside the vault')
    return full, parts


def require_md(parts):
    if not parts or not parts[-1].lower().endswith('.md'):
        raise ApiError(400, 'Only .md notes can be changed')


UF_IMMUTABLE, UF_APPEND, SF_IMMUTABLE, SF_APPEND = 0x2, 0x4, 0x20000, 0x40000


def write_file(full, data):
    """Writes a note safely: a temp file next to it, then a rename, so a crash cannot leave half a note.
    Some folders (iCloud Drive, locked-down or synced ones) refuse the temp file or the rename while still
    allowing the note itself to be written. Then the note is written in place instead, keeping a copy of the old
    text so it can be put back if that goes wrong."""
    folder = os.path.dirname(full)
    os.makedirs(folder, exist_ok=True)
    try:
        fd, tmp = tempfile.mkstemp(prefix='.dmforge-', suffix='.tmp', dir=folder)
        try:
            with os.fdopen(fd, 'wb') as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())
            if os.path.exists(full):
                try:
                    shutil.copymode(full, tmp)
                except OSError:
                    pass
            os.replace(tmp, full)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
        return 'atomic'
    except PermissionError:
        if os.path.isfile(full):
            with open(full, 'rb') as f:
                original = f.read()
            try:
                with open(full, 'r+b') as f:
                    f.seek(0)
                    f.truncate()
                    f.write(data)
                    f.flush()
                    os.fsync(f.fileno())
            except BaseException:
                try:
                    with open(full, 'wb') as f:
                        f.write(original)
                except OSError:
                    pass
                raise
            return 'in-place'
        with open(full, 'xb') as f:            # a new note: create it directly
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        return 'direct'


def describe_path(full):
    """A short technical description of a file and its folder, for the error message."""
    bits = []
    try:
        me = os.getuid()
        for label, p in (('note', full), ('folder', os.path.dirname(full))):
            if not os.path.exists(p):
                bits.append('%s: does not exist' % label)
                continue
            st = os.stat(p)
            bit = '%s: mode %s, %s' % (label, oct(st.st_mode & 0o777)[2:], 'yours' if st.st_uid == me else 'owned by uid %d' % st.st_uid)
            xa = []
            if hasattr(os, 'listxattr'):
                try:
                    xa = os.listxattr(p)
                except OSError:
                    xa = []
            if xa:
                bit += ', attributes: ' + ' '.join(sorted(x.replace('com.apple.', '') for x in xa))
            bits.append(bit)
    except OSError:
        pass
    return '; '.join(bits)


def _make_writable(d):
    """If a folder of ours was left read-only (mode 555, for example by a sync tool or a Finder lock), give
    its owner write access again. Only folders this user owns are touched."""
    try:
        st = os.stat(d)
        if os.path.isdir(d) and st.st_uid == os.getuid() and not (os.access(d, os.W_OK) and os.access(d, os.X_OK)):
            os.chmod(d, (st.st_mode & 0o7777) | 0o700)
            return True
    except OSError:
        pass
    return False


def _make_dirs_in_trash(trash_root, dest):
    """makedirs for a folder inside .trash, repairing read-only folders on the way down."""
    cur = trash_root
    if os.path.isdir(cur):
        _make_writable(cur)
    else:
        os.mkdir(cur)
    rel = os.path.relpath(dest, trash_root)
    for part in [] if rel in ('.', '') else rel.split(os.sep):
        cur = os.path.join(cur, part)
        if os.path.isdir(cur):
            _make_writable(cur)
        else:
            os.mkdir(cur)


def move_to_trash(full, target):
    """Moves a note into the vault's .trash folder (never deletes it). A plain rename is tried first; if the
    system refuses that, the note is copied there and the original removed, so a note is never lost half-way.
    If .trash itself cannot be used (it is read-only and cannot be repaired), .dmforge-trash next to it is used."""
    trash_root = os.path.join(State.root, '.trash')
    def unique(t):
        if os.path.exists(t):
            stem, ext = os.path.splitext(t)
            n = 0
            while os.path.exists(t):
                n += 1
                t = '%s (%d%s)%s' % (stem, int(time.time()), '' if n == 1 else '-%d' % n, ext)
        return t
    target = unique(target)
    try:
        _make_dirs_in_trash(trash_root, os.path.dirname(target))
    except PermissionError:
        trash_root = os.path.join(State.root, '.dmforge-trash')
        target = unique(os.path.join(trash_root, os.path.relpath(target, os.path.join(State.root, '.trash'))))
        os.makedirs(os.path.dirname(target), exist_ok=True)
    try:
        os.rename(full, target)
        return target
    except OSError:
        pass
    with open(full, 'rb') as src, open(target, 'xb') as dst:     # data only: no attributes to trip over
        shutil.copyfileobj(src, dst)
        dst.flush()
        os.fsync(dst.fileno())
    try:
        os.unlink(full)
    except OSError:
        try:
            os.unlink(target)         # undo the copy so there is not a duplicate
        except OSError:
            pass
        raise
    return target


# ---------------------------------------------------------------------------
# Undo last push. Before a push changes or trashes a note, the old bytes are kept in CONFIG_DIR/undo/<vault>/<push id>/
# (outside the vault, so Obsidian Sync never sees them). The newest push can be undone; the last UNDO_KEEP are kept.
# ---------------------------------------------------------------------------
UNDO_KEEP = 10


def _undo_root():
    return os.path.join(CONFIG_DIR, 'undo', hashlib.sha1(State.root_real.encode('utf-8')).hexdigest()[:12])


def _undo_dir(push_id):
    clean = re.sub(r'[^0-9A-Za-z_-]', '', str(push_id or ''))[:40]
    if not clean:
        raise ApiError(400, 'Bad push id')
    return os.path.join(_undo_root(), clean)


def _sha(data):
    return hashlib.sha1(data).hexdigest()


def _undo_load(d):
    try:
        with open(os.path.join(d, 'manifest.json'), 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _undo_save(d, man):
    os.makedirs(d, exist_ok=True)
    tmp = os.path.join(d, 'manifest.json.tmp')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(man, f)
    os.replace(tmp, os.path.join(d, 'manifest.json'))


def undo_keep(push_id, rel, full, action):
    """Keeps what is in the file now, once per push per file. Called just before the helper writes or trashes it."""
    d = _undo_dir(push_id)
    man = _undo_load(d) or {'id': os.path.basename(d), 'time': int(time.time() * 1000), 'entries': []}
    if any(e['rel'] == rel for e in man['entries']):
        return
    entry = {'rel': rel, 'action': action, 'existed': os.path.isfile(full)}
    if entry['existed']:
        name = '%d.bin' % len(man['entries'])
        os.makedirs(os.path.join(d, 'files'), exist_ok=True)
        with open(full, 'rb') as src, open(os.path.join(d, 'files', name), 'wb') as dst:
            shutil.copyfileobj(src, dst)
        entry['file'] = name
    man['entries'].append(entry)
    _undo_save(d, man)
    _undo_prune()


def undo_wrote(push_id, rel, data):
    """Notes what was written, so an undo can tell if the note was changed again afterwards."""
    d = _undo_dir(push_id)
    man = _undo_load(d)
    if not man:
        return
    for e in man['entries']:
        if e['rel'] == rel:
            e['after'] = _sha(data)
    _undo_save(d, man)


def _undo_list():
    root = _undo_root()
    out = []
    try:
        names = os.listdir(root)
    except OSError:
        return out
    for n in names:
        man = _undo_load(os.path.join(root, n))
        if man and man.get('entries'):
            out.append(man)
    out.sort(key=lambda m: m.get('time', 0), reverse=True)
    return out


def _undo_prune():
    for man in _undo_list()[UNDO_KEEP:]:
        shutil.rmtree(os.path.join(_undo_root(), man['id']), ignore_errors=True)


def _file_sha(full):
    try:
        with open(full, 'rb') as f:
            return _sha(f.read())
    except OSError:
        return None


def undo_info():
    lst = _undo_list()
    if not lst:
        return {'available': None, 'count': 0}
    m = lst[0]
    return {'available': {'id': m['id'], 'time': m.get('time', 0), 'files': len(m['entries']),
                          'written': sum(1 for e in m['entries'] if e['action'] == 'write'),
                          'trashed': sum(1 for e in m['entries'] if e['action'] == 'trash'),
                          'rels': [e['rel'] for e in m['entries']][:40]}, 'count': len(lst)}


def undo_push(force=False):
    """Puts every note the newest push touched back as it was. Notes changed again since are left alone unless force.
    Returns {'conflicts': [...]} (and changes nothing) when there are such notes and force is off."""
    lst = _undo_list()
    if not lst:
        raise ApiError(404, 'There is no push to undo.')
    man = lst[0]
    d = os.path.join(_undo_root(), man['id'])
    plan = []
    conflicts = []
    for e in man['entries']:
        full, parts = resolve(e['rel'])
        now = _file_sha(full)
        if e['action'] == 'write':
            changed = now is not None and e.get('after') and now != e['after']
        else:
            changed = now is not None            # trashed by the push, and a new note stands in its place now
        if changed:
            conflicts.append(e['rel'])
        plan.append((e, full, parts, now))
    if conflicts and not force:
        return {'conflicts': conflicts}
    restored = removed = 0
    for e, full, parts, now in reversed(plan):
        if e['existed']:
            with open(os.path.join(d, 'files', e['file']), 'rb') as f:
                write_file(full, f.read())
            restored += 1
        elif now is not None:
            move_to_trash(full, os.path.join(State.root, '.trash', *parts))
            removed += 1
    shutil.rmtree(d, ignore_errors=True)
    return {'restored': restored, 'removed': removed, 'conflicts': []}


# ---------------------------------------------------------------------------
# The vault's trash: list what is in it and put a note back where it was
# ---------------------------------------------------------------------------
TRASH_DIRS = ('.trash', '.dmforge-trash')


def trash_list():
    out = []
    for tdir in TRASH_DIRS:
        base = os.path.join(State.root, tdir)
        for dp, dn, fn in os.walk(base):
            for n in fn:
                if not n.lower().endswith('.md'):
                    continue
                full = os.path.join(dp, n)
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                rel = os.path.relpath(full, State.root).replace(os.sep, '/')
                out.append({'path': rel, 'size': st.st_size, 'mtime': int(st.st_mtime * 1000)})
    out.sort(key=lambda x: x['mtime'], reverse=True)
    return out


def trash_restore(rel):
    """Moves a note from the trash back to where it was (the same path without the trash folder). If something
    is there now, the note is restored beside it as "name (restored).md"."""
    parts = [p for p in rel.replace('\\', '/').split('/') if p not in ('', '.')]
    if len(parts) < 2 or parts[0] not in TRASH_DIRS or any(p == '..' for p in parts):
        raise ApiError(400, 'That is not a note in the trash')
    require_md(parts)
    src, _ = resolve('/'.join(parts))
    if not os.path.isfile(src):
        raise ApiError(404, 'Not found')
    dest_parts = parts[1:]
    dest, _ = resolve('/'.join(dest_parts))
    if os.path.exists(dest):
        stem, ext = os.path.splitext(dest)
        dest = stem + ' (restored)' + ext
        n = 1
        while os.path.exists(dest):
            n += 1
            dest = '%s (restored %d)%s' % (stem, n, ext)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(src, 'rb') as f:
        data = f.read()
    write_file(dest, data)
    try:
        os.unlink(src)
    except OSError:
        pass
    return os.path.relpath(dest, State.root).replace(os.sep, '/')


def _ls_line(path):
    """macOS: permissions, ACLs, file flags (like "uchg") and extended attributes, from ls itself."""
    try:
        out = subprocess.run(['ls', '-leOd@', path], capture_output=True, text=True, timeout=5).stdout.strip()
        return ' | '.join(l.strip() for l in out.splitlines()[:6])
    except (OSError, subprocess.SubprocessError):
        return ''


def probe_folder(full):
    """Tries each step a save needs, in the note's own folder, and says which one the system refuses.
    Only leaves things as they were: the test files are hidden and removed again."""
    folder = os.path.dirname(full)
    lines = []
    def step(label, fn):
        try:
            fn()
            lines.append('  ok      ' + label)
            return True
        except OSError as e:
            lines.append('  REFUSED %s (error %s: %s)' % (label, e.errno, e.strerror))
            return False
    tag = '.dmforge-probe-%d' % os.getpid()
    a, b, d = os.path.join(folder, tag + 'a'), os.path.join(folder, tag + 'b'), os.path.join(folder, tag + 'dir')
    step('list the folder', lambda: os.listdir(folder))
    made = step('create a new file in the folder', lambda: open(a, 'xb').close())
    if made:
        step('rename a file inside the folder', lambda: os.replace(a, b))
    if os.path.isfile(full):
        step('open this note for writing (nothing changed)', lambda: open(full, 'r+b').close())
    else:
        lines.append('  (this note does not exist yet)')
    if step('make a sub-folder', lambda: os.mkdir(d)):
        step('remove it', lambda: os.rmdir(d))
    for p in (a, b):
        try:
            os.unlink(p)
        except OSError:
            pass
    return lines


def probe_trash(full):
    """The same kind of test for the vault's .trash folder, where deleted and moved notes are put."""
    lines = []
    def step(label, fn):
        try:
            fn()
            lines.append('  ok      ' + label)
            return True
        except OSError as e:
            lines.append('  REFUSED %s (error %s: %s)' % (label, e.errno, e.strerror))
            return False
    trash = os.path.join(State.root, '.trash')
    rel = os.path.relpath(os.path.dirname(full), State.root)
    dest = os.path.join(trash, rel)
    existed = os.path.isdir(trash)
    lines.append('  (.trash %s)' % ('exists' if existed else 'does not exist yet'))
    ls = _ls_line(trash) if existed else ''
    if ls:
        lines.append('  ls .trash: ' + ls)
    if not step('make the folders for it inside .trash (repairing a read-only one)', lambda: _make_dirs_in_trash(trash, dest)):
        return lines
    a = os.path.join(os.path.dirname(full), '.dmforge-probe-%d-t' % os.getpid())
    b = os.path.join(dest, '.dmforge-probe-%d-t' % os.getpid())
    if step('create a file next to the note', lambda: open(a, 'xb').close()):
        step('move a file from the note\'s folder into .trash', lambda: os.rename(a, b))
    for p in (a, b):
        try:
            os.unlink(p)
        except OSError:
            pass
    if not existed:
        try:
            while os.path.realpath(dest) != os.path.realpath(State.root):
                os.rmdir(dest)
                dest = os.path.dirname(dest)
        except OSError:
            pass
    return lines


def diagnose(full, e, op=None):
    """A report to show and copy when a save is refused."""
    lines = []
    what = {'write': 'saving the note', 'trash': 'moving the note to the vault\'s .trash folder', 'mkdir': 'creating a folder'}.get(op)
    if what:
        lines.append('While: ' + what)
    try:
        import traceback
        frames = traceback.extract_tb(e.__traceback__)[-3:]
        if frames:
            lines.append('Failed at: ' + ' < '.join('%s (%s:%d)' % (f.line or f.name, f.name, f.lineno) for f in reversed(frames)))
    except Exception:
        pass
    lines += ['Steps tried in this note\'s folder:'] + probe_folder(full)
    if op == 'trash':
        lines += ['Steps tried in the .trash folder:'] + probe_trash(full)
    desc = describe_path(full)
    if desc:
        lines.append('Permissions: ' + desc)
    for label, p in (('note', full), ('folder', os.path.dirname(full)), ('campaign', os.path.dirname(os.path.dirname(full)))):
        ls = _ls_line(p)
        if ls:
            lines.append('ls %s: %s' % (label, ls))
    where = []
    if 'Mobile Documents' in full or 'CloudStorage' in full:
        where.append('inside iCloud / a cloud-synced folder')
    try:
        rp = os.path.realpath(os.path.dirname(full))
        if rp != os.path.abspath(os.path.dirname(full)):
            where.append('real location: ' + rp)
    except OSError:
        pass
    if where:
        lines.append('Location: ' + '; '.join(where))
    lines.append('Helper version %s, python %s' % (installed_version() or '?', sys.version.split()[0]))
    return '\n'.join(lines)


def explain_os_error(full, e, op=None):
    """Turns "the operating system refused access" into something that says what to do."""
    try:
        name = os.path.basename(full) if full else 'that file'
        folder = os.path.dirname(full) if full else ''
        exists = bool(full) and os.path.exists(full)
        if exists:
            flags = getattr(os.stat(full), 'st_flags', 0)
            if flags & (UF_IMMUTABLE | SF_IMMUTABLE | UF_APPEND | SF_APPEND):
                return '"%s" is locked. In Finder, select it, press Command-I and untick "Locked", then push again.' % name
            if not os.access(full, os.W_OK):
                return '"%s" is read-only (its permissions or owner do not allow changes). Fix that in Finder with Command-I, then push again.' % name
        if folder and os.path.isdir(folder) and not os.access(folder, os.W_OK):
            return 'The folder "%s" does not allow new files to be written into it (its permissions or owner). Fix that in Finder with Command-I, then push again.' % os.path.basename(folder)
    except OSError:
        pass
    why = (getattr(e, 'strerror', None) or str(e) or 'permission denied')
    code = getattr(e, 'errno', None)
    detail = ''
    try:
        detail = diagnose(full, e, op) if full else ''
    except Exception:
        detail = describe_path(full) if full else ''
    return ('macOS refused to change "%s" (%s%s). If your vault is in iCloud Drive, Documents or Desktop, Terminal needs access under Privacy & Security > Files and Folders '
            '(or Full Disk Access). If you only just allowed it, quit Terminal completely (Command-Q), open it again, start DM Forge again and '
            'push again: the setting only applies to programs started afterwards.%s') % (os.path.basename(full) if full else 'that file', why, ', error %s' % code if code else '', '\n\n' + detail if detail else '')


# ---------------------------------------------------------------------------
# Claude (experimental): asks Claude Code, installed on this Mac, one question at a time.
# It is started with every tool switched off and in an empty temporary folder, so it can only answer in text;
# it cannot read your vault, run commands or change files. Only the text the app sends is passed to it.
# It is run the way a Terminal window would run it (your login shell's PATH and settings), because a helper started by
# double-clicking a .command file can otherwise find a different `claude`, or miss variables such as CLAUDE_CONFIG_DIR, and
# then not be signed in even though `claude` works in your Terminal.
# ---------------------------------------------------------------------------
CLAUDE_TIMEOUT = 180
CLAUDE_MAX_PROMPT = 200000
CLAUDE_DEFAULT_SYSTEM = ('You are helping a Dungeon Master prepare and run a Dungeons & Dragons 5e game. '
                         'Answer only from the text you are given and from general D&D knowledge. If something is not in the text, say so '
                         'instead of inventing it. Keep answers concise and practical, in plain markdown.')
CLAUDE_ENV_KEYS = ('CLAUDE_CONFIG_DIR', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_BASE_URL',
                   'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'HOME')
_claude_lock = threading.Lock()
_login_env = {'done': False, 'env': None, 'why': ''}
_login_env_lock = threading.Lock()


def login_shell_env():
    """The environment a Terminal window would give you: your login shell run interactively, so .zprofile and .zshrc apply.
    Returns a dict, or None (the reason is kept in _login_env['why']). Done once; takes a few seconds."""
    with _login_env_lock:
        if _login_env['done']:
            return _login_env['env']
        _login_env['done'] = True
        if os.environ.get('DMF_CLAUDE_BIN') or os.environ.get('DMF_NO_LOGIN_SHELL'):
            _login_env['why'] = 'not used (the command was given directly)'
            return None
        shell = os.environ.get('SHELL') or '/bin/zsh'
        if not os.path.isfile(shell):
            _login_env['why'] = 'no login shell found (%s)' % shell
            return None
        code = 'import os, json, sys; sys.stdout.write("\\n@@DMFENV@@" + json.dumps(dict(os.environ)) + "@@END@@")'
        cmd = [shell, '-ilc', '%s -c %s' % (shlex.quote(sys.executable), shlex.quote(code))]
        try:
            # start_new_session: the shell gets no controlling terminal. An interactive shell that can reach the terminal takes over
            # its foreground process group, which then leaves this helper in the background and macOS stops it ("suspended (tty input)").
            r = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=20, start_new_session=True)
            m = re.search(r'@@DMFENV@@(.*?)@@END@@', r.stdout, re.S)
            env = json.loads(m.group(1)) if m else None
            if not isinstance(env, dict) or 'PATH' not in env:
                _login_env['why'] = 'your login shell did not report its environment'
                return None
            _login_env['env'] = env
            _login_env['why'] = 'your login shell (%s)' % os.path.basename(shell)
            return env
        except (OSError, subprocess.SubprocessError, ValueError) as e:
            _login_env['why'] = 'could not read your login shell: %s' % e
            return None


def claude_env():
    """(environment to run Claude Code with, where it came from)"""
    env = login_shell_env()
    if env:
        merged = dict(os.environ)
        merged.update(env)
        return merged, 'terminal'
    return dict(os.environ), 'helper'


def _which_all(path):
    out = []
    for d in (path or '').split(os.pathsep):
        f = os.path.join(d, 'claude')
        if d and os.path.isfile(f) and os.access(f, os.X_OK):
            out.append(f)
    return out


def claude_candidates(env=None):
    """Every `claude` command this Mac has that the helper could use, best first."""
    env = env or claude_env()[0]
    override = os.environ.get('DMF_CLAUDE_BIN')
    if override:
        return [override] if os.path.isfile(override) and os.access(override, os.X_OK) else []
    home = os.path.expanduser('~')
    found = _which_all(env.get('PATH')) + _which_all(os.environ.get('PATH'))
    for cand in (os.path.join(home, '.local', 'bin', 'claude'), os.path.join(home, '.claude', 'local', 'claude'),
                 os.path.join(home, '.npm-global', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'):
        if os.path.isfile(cand) and os.access(cand, os.X_OK):
            found.append(cand)
    seen, out = set(), []
    for f in found:
        real = os.path.realpath(f)
        if real not in seen:
            seen.add(real)
            out.append(f)
    return out


def find_claude(env=None):
    """The Claude Code command on this Mac (the one your Terminal would run), or None."""
    c = claude_candidates(env)
    return c[0] if c else None


def claude_log(event, **kv):
    """One line per Claude request in claude.log (next to the remembered vault). It never contains what was sent or answered."""
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        path = os.path.join(CONFIG_DIR, 'claude.log')
        if os.path.isfile(path) and os.path.getsize(path) > 200000:
            with open(path, 'rb') as f:
                tail = f.read()[-80000:]
            with open(path, 'wb') as f:
                f.write(tail)
        line = '%s %s %s\n' % (time.strftime('%Y-%m-%d %H:%M:%S'), event, ' '.join('%s=%s' % (k, str(v).replace('\n', ' ')[:300]) for k, v in kv.items()))
        with open(path, 'a', encoding='utf-8') as f:
            f.write(line)
    except OSError:
        pass


def claude_status():
    env, src = claude_env()
    exe = find_claude(env)
    if not exe:
        return {'available': False, 'reason': 'Claude Code was not found on this Mac.'}
    try:
        r = subprocess.run([exe, '--version'], capture_output=True, text=True, timeout=20, env=env, stdin=subprocess.DEVNULL, start_new_session=True)
        return {'available': r.returncode == 0, 'version': (r.stdout or '').strip().splitlines()[0] if r.stdout.strip() else '',
                'path': exe, 'reason': '' if r.returncode == 0 else (r.stderr or 'It did not start.').strip()[:300]}
    except (OSError, subprocess.SubprocessError) as e:
        return {'available': False, 'path': exe, 'reason': 'It did not start: %s' % e}


def _claude_run(args, prompt=None, timeout=60):
    env, src = claude_env()
    exe = find_claude(env)
    if not exe:
        raise ApiError(404, 'Claude Code was not found on this Mac. Install it, run `claude` once in Terminal and sign in, then try again.')
    with tempfile.TemporaryDirectory(prefix='dmf-claude-') as cwd:
        # start_new_session: Claude Code gets no controlling terminal, so nothing it does can touch this window
        return subprocess.run([exe] + args, input=prompt, capture_output=True, text=True, timeout=timeout, cwd=cwd, env=env, start_new_session=True,
                              **({} if prompt is not None else {'stdin': subprocess.DEVNULL}))


def claude_ask(prompt, system=None, model=None):
    """Returns the text of Claude's answer. Raises ApiError with something the user can act on."""
    prompt = str(prompt or '')
    if not prompt.strip():
        raise ApiError(400, 'There is nothing to ask.')
    if len(prompt) > CLAUDE_MAX_PROMPT:
        raise ApiError(413, 'That is too long to send (%d characters; the limit is %d).' % (len(prompt), CLAUDE_MAX_PROMPT))
    env, src = claude_env()
    exe = find_claude(env)
    if not exe:
        raise ApiError(404, 'Claude Code was not found on this Mac. Install it, run `claude` once in Terminal and sign in, then try again.')
    cmd = ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text', '--disable-slash-commands',
           '--strict-mcp-config', '--system-prompt', (str(system).strip()[:4000] if system and str(system).strip() else CLAUDE_DEFAULT_SYSTEM)]
    if model:
        if not re.match(r'^[A-Za-z0-9._:\-]{1,80}$', str(model)):
            raise ApiError(400, 'That model name is not valid.')
        cmd += ['--model', str(model)]
    if not _claude_lock.acquire(blocking=False):
        raise ApiError(429, 'Claude is already working on something. Wait for it to finish.')
    started = time.time()
    try:
        try:
            r = _claude_run(cmd, prompt=prompt, timeout=CLAUDE_TIMEOUT)
        except subprocess.TimeoutExpired:
            claude_log('timeout', seconds=CLAUDE_TIMEOUT, exe=exe, env=src, chars_in=len(prompt))
            raise ApiError(504, 'Claude took longer than %d seconds, so it was stopped.' % CLAUDE_TIMEOUT)
        except OSError as e:
            claude_log('start-failed', error=e, exe=exe, env=src)
            raise ApiError(500, 'Could not start Claude Code: %s' % e)
    finally:
        _claude_lock.release()
    out = (r.stdout or '').strip()
    ms = int((time.time() - started) * 1000)
    if r.returncode != 0 or not out:
        detail = (r.stderr or r.stdout or '').strip()[:500]
        claude_log('failed', exit=r.returncode, ms=ms, exe=exe, env=src, chars_in=len(prompt), error=detail)
        authish = re.search(r'log(?:ged)? ?in|auth|sign|credential|oauth|token', detail, re.I) or not detail
        expired = re.search(r'expired|refresh|oauth|not logged in|log in', detail, re.I)
        hint = (' Open Menu, then "Claude (experimental)", and press "Check sign-in": it shows which Claude Code and which sign-in the helper is using.' if authish else '')
        if authish and expired:
            hint += ' If the sign-in has expired: in Terminal run `claude`, type /login and sign in again, then try here.'
        raise ApiError(502, 'Claude did not answer (%s).%s' % (detail or 'exit code %d' % r.returncode, hint))
    claude_log('ok', ms=ms, exe=exe, env=src, chars_in=len(prompt), chars_out=len(out))
    return out


def claude_check():
    """A report on how the helper runs Claude Code and whether that is signed in. It shows names and yes/no, never keys or what
    you sent. Returns {ok, report}."""
    lines = []
    env, src = claude_env()
    helper_env = dict(os.environ)
    lines.append('DM Forge helper %s' % (installed_version() or '?'))
    lines.append('Claude is run with: %s' % ('the environment of your Terminal (login shell: %s)' % (_login_env['why'].replace('your login shell ', '')) if src == 'terminal' else 'the helper\'s own environment (%s)' % (_login_env['why'] or 'no login shell')))
    cands = claude_candidates(env)
    if not cands:
        lines.append('Claude Code: NOT FOUND. Install it, run `claude` once in Terminal and sign in.')
        return {'ok': False, 'report': '\n'.join(lines)}
    lines.append('Claude Code used: %s' % cands[0])
    if len(cands) > 1:
        lines.append('Other copies on this Mac (a different one may hold a different sign-in): ' + ', '.join(cands[1:]))
    exe = cands[0]
    try:
        v = subprocess.run([exe, '--version'], capture_output=True, text=True, timeout=20, env=env, stdin=subprocess.DEVNULL, start_new_session=True)
        lines.append('Version: %s' % ((v.stdout or v.stderr).strip().splitlines() or ['?'])[0])
    except (OSError, subprocess.SubprocessError) as e:
        lines.append('Version: could not run (%s)' % e)
    # what differs between the helper's environment and a Terminal's
    diffs = []
    for k in CLAUDE_ENV_KEYS:
        a, b = helper_env.get(k), env.get(k)
        if (a or '') != (b or ''):
            show = (lambda x: 'not set' if not x else (x if k in ('CLAUDE_CONFIG_DIR', 'HOME', 'ANTHROPIC_BASE_URL') else 'set'))
            diffs.append('%s: helper %s, Terminal %s' % (k, show(a), show(b)))
    if helper_env.get('PATH') != env.get('PATH'):
        diffs.append('PATH differs')
    lines.append('Differences between a double-clicked helper and your Terminal: ' + ('; '.join(diffs) if diffs else 'none'))
    set_names = [k for k in CLAUDE_ENV_KEYS if env.get(k) and k not in ('HOME',)]
    lines.append('Claude settings present in the environment it runs with: ' + (', '.join(set_names) if set_names else 'none'))
    # sign-in status
    ok = False
    try:
        r = _claude_run(['auth', 'status'], timeout=30)
        try:
            st = json.loads(r.stdout)
            lines.append('Sign-in: %s (method: %s, provider: %s, settings folder: %s)' % ('signed in' if st.get('loggedIn') else 'NOT SIGNED IN', st.get('authMethod', '?'), st.get('apiProvider', '?'), st.get('configDirectory', '?')))
        except ValueError:
            lines.append('Sign-in: %s' % ((r.stdout or r.stderr).strip()[:300] or 'no answer'))
    except (OSError, subprocess.SubprocessError, ApiError) as e:
        lines.append('Sign-in: could not check (%s)' % e)
    # a real, tiny question
    started = time.time()
    try:
        r = _claude_run(['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text', '--disable-slash-commands', '--strict-mcp-config'], prompt='Reply with the single word: ok', timeout=90)
        out = (r.stdout or '').strip()
        ok = r.returncode == 0 and bool(out)
        lines.append('Test question: %s in %.1fs' % ('answered' if ok else 'FAILED (%s)' % ((r.stderr or r.stdout).strip()[:300] or 'exit code %d' % r.returncode), time.time() - started))
    except subprocess.TimeoutExpired:
        lines.append('Test question: no answer after 90 seconds')
    except (OSError, subprocess.SubprocessError, ApiError) as e:
        lines.append('Test question: could not run (%s)' % e)
    lines.append('Log of Claude requests (times and results only, never what was sent): %s' % os.path.join(CONFIG_DIR, 'claude.log'))
    claude_log('check', ok=ok, exe=exe, env=src)
    return {'ok': ok, 'report': '\n'.join(lines)}


# ---------------------------------------------------------------------------
# Rolling back: the update step keeps the version before it in .previous. This puts it back, and keeps the one that
# was replaced in .rolled-back.
# ---------------------------------------------------------------------------
def previous_version(folder=None):
    return installed_version(os.path.join(folder or HERE, '.previous'))


def forward_version(folder=None):
    """The version that was rolled back from (kept in .rolled-back), or ''."""
    d = os.path.join(folder or HERE, '.rolled-back')
    if not (os.path.isfile(os.path.join(d, 'DM-Forge.html')) and os.path.isfile(os.path.join(d, 'dmforge-server.py'))):
        return ''
    return installed_version(d)


def _swap_version(folder, src_name, keep_name):
    """Puts the app files from folder/src_name in place and keeps the ones being replaced in folder/keep_name.
    Returns the version now installed, or None when src_name has no complete copy."""
    folder = folder or HERE
    src = os.path.join(folder, src_name)
    files = {}
    for name in APP_FILES:
        f = os.path.join(src, name)
        if os.path.isfile(f):
            with open(f, 'rb') as fh:
                files[name] = fh.read()
    if 'DM-Forge.html' not in files or 'dmforge-server.py' not in files:
        return None
    keep = os.path.join(folder, keep_name)
    os.makedirs(keep, exist_ok=True)
    for name in APP_FILES:
        cur = os.path.join(folder, name)
        if os.path.isfile(cur):
            shutil.copy2(cur, os.path.join(keep, name))
    for name, data in files.items():
        mode = 0o755 if name.endswith(('.command', '.py')) else 0o644
        _atomic_write(os.path.join(folder, name), data, mode)
    return installed_version(folder) or installed_version(src)


def rollback(folder=None):
    """Restores the app files from .previous. Returns the restored version, or None if there is nothing to restore."""
    return _swap_version(folder, '.previous', '.rolled-back')


def rollforward(folder=None):
    """Undoes a rollback: restores the app files from .rolled-back (and keeps the ones replaced in .previous)."""
    return _swap_version(folder, '.rolled-back', '.previous')


class Handler(BaseHTTPRequestHandler):
    server_version = 'DMForgeHelper'
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
        self.send_header('Referrer-Policy', 'no-referrer')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj))

    def _origin_ok(self):
        host = (self.headers.get('Host') or '').lower()
        ok_hosts = {'127.0.0.1:%d' % State.port, 'localhost:%d' % State.port}
        if host not in ok_hosts:
            return False
        origin = self.headers.get('Origin')
        if origin and origin.lower() not in ('http://127.0.0.1:%d' % State.port, 'http://localhost:%d' % State.port):
            return False
        return True

    def _token_ok(self):
        got = self.headers.get('X-DMF-Token', '')
        return secrets.compare_digest(got, State.token)

    def _dispatch(self):
        parsed = urlparse(self.path)
        # Always consume the request body first, even if we are about to refuse the
        # request, otherwise leftover bytes corrupt the next request on a keep-alive connection.
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length > MAX_WRITE:
            self.close_connection = True
            return self._json(413, {'error': 'That request is too large'})
        self._body = self.rfile.read(length) if length > 0 else b''
        if not self._origin_ok():
            return self._json(403, {'error': 'Forbidden'})
        try:
            if parsed.path == '/':
                return self._serve_app(parse_qs(parsed.query))
            if parsed.path.startswith('/api/'):
                if not self._token_ok():
                    return self._json(403, {'error': 'Missing or wrong token. If the helper was started again, this page is out of date: open the link printed in the Terminal (your unpushed changes are kept and will come back).'})
                self._q = parse_qs(parsed.query)
                rel = (self._q.get('path') or [''])[0]
                return self._api(parsed.path[5:], rel)
            return self._json(404, {'error': 'Not found'})
        except ApiError as e:
            return self._json(e.status, {'error': e.message})
        except FileNotFoundError:
            return self._json(404, {'error': 'Not found'})
        except PermissionError as e:
            return self._json(403, {'error': explain_os_error(getattr(self, '_full', None), e, getattr(self, '_op', None))})
        except Exception as e:  # keep the helper alive; report the problem to the app
            return self._json(500, {'error': 'Helper error: %s' % e})

    do_GET = do_POST = do_HEAD = _dispatch

    # ---- the app itself ----
    def _serve_app(self, q):
        token = (q.get('t') or [''])[0]
        if not secrets.compare_digest(token, State.token):
            return self._send(403, '<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:2em">'
                                   '<h3>DM Forge helper</h3><p>Open the full link that was printed in the Terminal window '
                                   '(it ends with <code>?t=...</code>).</p>', 'text/html; charset=utf-8')
        with open(State.app_path, 'rb') as f:
            html = f.read().decode('utf-8')
        info = json.dumps({'name': os.path.basename(State.root_real) or 'Vault', 'token': State.token})
        inject = '<script>window.__DMF_SERVER__=%s;</script>' % info.replace('<', '\\u003c')
        html = html.replace('<!--DMF_SERVER-->', inject, 1)
        self._send(200, html, 'text/html; charset=utf-8')

    # ---- API ----
    def _api(self, op, rel):
        if op == 'ping':
            return self._json(200, {'ok': True, 'name': os.path.basename(State.root_real), 'version': installed_version()})
        if op == 'claude-status':
            return self._json(200, claude_status())
        if op == 'claude-check' and self.command == 'POST':
            return self._json(200, claude_check())
        if op == 'claude' and self.command == 'POST':
            try:
                req = json.loads(self._body.decode('utf-8') or '{}')
            except ValueError:
                raise ApiError(400, 'That request was not valid.')
            return self._json(200, {'text': claude_ask(req.get('prompt'), req.get('system'), req.get('model'))})
        if op == 'update-info':
            cur = installed_version()
            got = peek_update(State.downloads, cur)
            return self._json(200, {'current': cur, 'available': ({'version': got[0], 'name': os.path.basename(got[1])} if got else None),
                                    'downloads': State.downloads})
        if op == 'update-install' and self.command == 'POST':
            outcome = maybe_update(State.downloads, State.trash, True)
            if outcome == 'none':
                raise ApiError(404, 'There is no newer DM Forge zip in %s.' % State.downloads)
            if outcome != 'installed':
                raise ApiError(500, 'Could not install the update. The version you have is untouched; see the Terminal window.')
            ver = installed_version()
            # answer first, then restart in the same window on the same link (as typing `update` there does)
            threading.Timer(0.4, lambda: State.server and _stop_server(State.server, restart=True)).start()
            return self._json(200, {'installed': ver, 'restarting': True})
        if op == 'rollback-info':
            return self._json(200, {'current': installed_version(), 'previous': previous_version(), 'forward': forward_version()})
        if op in ('rollback', 'rollforward') and self.command == 'POST':
            ver = rollback() if op == 'rollback' else rollforward()
            if ver is None:
                raise ApiError(404, 'There is no earlier version to go back to (the .previous folder is empty).' if op == 'rollback'
                               else 'There is no later version to go forward to.')
            restart = (getattr(self, '_q', {}).get('restart') or [''])[0] == '1'
            if restart:
                threading.Timer(0.4, lambda: State.server and _stop_server(State.server, restart=True)).start()
            return self._json(200, {'restored': ver, 'restarting': restart})
        if op == 'undo-info':
            return self._json(200, undo_info())
        if op == 'undo-push' and self.command == 'POST':
            try:
                req = json.loads(self._body.decode('utf-8') or '{}')
            except ValueError:
                raise ApiError(400, 'That request was not valid.')
            return self._json(200, undo_push(bool(req.get('force'))))
        if op == 'trash-list':
            return self._json(200, trash_list())
        if op == 'trash-restore' and self.command == 'POST':
            return self._json(200, {'path': trash_restore(rel)})
        full, parts = resolve(rel)
        self._full = full
        self._op = op
        if op == 'list':
            if not os.path.isdir(full):
                raise ApiError(404, 'Not a folder')
            out = []
            with os.scandir(full) as it:
                for e in it:
                    out.append({'name': e.name, 'kind': 'dir' if e.is_dir() else 'file'})
            return self._json(200, out)
        if op == 'exists':
            return self._json(200, {'exists': os.path.exists(full)})
        if op == 'stat':
            st = os.stat(full)
            return self._json(200, {'size': st.st_size, 'mtime': int(st.st_mtime * 1000)})
        if op == 'read':
            if not os.path.isfile(full):
                raise ApiError(404, 'Not found')
            with open(full, 'rb') as f:
                data = f.read()
            ctype = mimetypes.guess_type(full)[0] or 'application/octet-stream'
            return self._send(200, data, ctype)
        if op == 'mkdir' and self.command == 'POST':
            if any(p.startswith('.') for p in parts):
                raise ApiError(400, 'Hidden folders cannot be created')
            os.makedirs(full, exist_ok=True)
            return self._json(200, {'ok': True})
        if op == 'write' and self.command == 'POST':
            require_md(parts)
            if any(p.startswith('.') for p in parts[:-1]):
                raise ApiError(400, 'Notes cannot be written inside hidden folders')
            push = (getattr(self, '_q', {}).get('push') or [''])[0]
            if push:
                undo_keep(push, '/'.join(parts), full, 'write')
            write_file(full, self._body)
            if push:
                undo_wrote(push, '/'.join(parts), self._body)
            return self._json(200, {'ok': True})
        if op == 'trash' and self.command == 'POST':
            require_md(parts)
            if not os.path.isfile(full):
                raise ApiError(404, 'Not found')
            push = (getattr(self, '_q', {}).get('push') or [''])[0]
            if push:
                undo_keep(push, '/'.join(parts), full, 'trash')
            move_to_trash(full, os.path.join(State.root, '.trash', *parts))
            return self._json(200, {'ok': True})
        raise ApiError(404, 'Unknown request')


# ---------------------------------------------------------------- updating
def parse_version(text):
    parts = re.findall(r'\d+', str(text or ''))[:4]
    return tuple(int(p) for p in parts) if parts else (0,)


def installed_version(folder=None):
    try:
        with open(os.path.join(folder or HERE, 'VERSION'), 'r', encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def inspect_zip(path):
    """Returns (version, {name: bytes}) for a DM Forge zip, or None when it is not a good one.
    Only the five app files are read, whatever else the zip contains, and each is checked."""
    try:
        with zipfile.ZipFile(path) as z:
            found = {}
            for info in z.infolist():
                parts = info.filename.replace('\\', '/').split('/')
                if len(parts) < 1 or len(parts) > 2 or '..' in parts or info.filename.startswith('/'):
                    continue
                base = parts[-1]
                if base in APP_FILES and info.file_size <= MAX_APP_FILE and (len(parts) == 1 or parts[0] != '' and parts[0] != 'source'):
                    found[base] = z.read(info)
    except (OSError, zipfile.BadZipFile, KeyError, RuntimeError, EOFError):
        return None
    if not all(n in found for n in ('DM-Forge.html', 'dmforge-server.py', 'VERSION')):
        return None
    version = found['VERSION'].decode('utf-8', 'replace').strip()
    if not re.fullmatch(r'\d+(\.\d+){1,3}', version):
        return None
    head = found['DM-Forge.html'][:400].lower()
    if b'<!doctype html' not in head or b'<!--DMF_SERVER-->' not in found['DM-Forge.html'][:4000]:
        return None
    try:
        compile(found['dmforge-server.py'], 'dmforge-server.py', 'exec')
    except (SyntaxError, ValueError):
        return None
    return version, found


def find_update(downloads, current):
    """The newest valid DM Forge zip in `downloads` that is newer than `current`."""
    best = None
    try:
        names = os.listdir(downloads)
    except OSError:
        return None
    for n in names:
        if not ZIP_NAME.match(n):
            continue
        path = os.path.join(downloads, n)
        if not os.path.isfile(path):
            continue
        got = inspect_zip(path)
        if got and parse_version(got[0]) > parse_version(current) and (best is None or parse_version(got[0]) > parse_version(best[0])):
            best = (got[0], path, got[1])
    return best


_ZIP_SEEN = {}   # (path, mtime, size) -> version of a good DM Forge zip, or '' for one that is not


def peek_update(downloads, current):
    """Cheap version of find_update for the app to ask often: (version, path) of the newest good zip newer than `current`,
    or None. A zip is read and checked once; after that it is remembered by its name, size and time."""
    best = None
    try:
        names = os.listdir(downloads)
    except OSError:
        return None
    for n in names:
        if not ZIP_NAME.match(n):
            continue
        path = os.path.join(downloads, n)
        try:
            st = os.stat(path)
        except OSError:
            continue
        if not os.path.isfile(path):
            continue
        key = (path, int(st.st_mtime), st.st_size)
        if key not in _ZIP_SEEN:
            got = inspect_zip(path)
            _ZIP_SEEN[key] = got[0] if got else ''
        v = _ZIP_SEEN[key]
        if v and parse_version(v) > parse_version(current) and (best is None or parse_version(v) > parse_version(best[0])):
            best = (v, path)
    return best


def _atomic_write(path, data, mode):
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(prefix='.dmforge-update-', dir=d)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def install_update(found, folder):
    """Writes the new app files into `folder`, keeping the old ones in folder/.previous."""
    prev = os.path.join(folder, '.previous')
    os.makedirs(prev, exist_ok=True)
    for name in APP_FILES:
        cur = os.path.join(folder, name)
        if os.path.isfile(cur):
            shutil.copy2(cur, os.path.join(prev, name))
    for name in APP_FILES:
        if name not in found:
            continue
        dest = os.path.join(folder, name)
        mode = 0o755 if name.endswith(('.command', '.py')) else 0o644
        _atomic_write(dest, found[name], mode)


def trash_file(path, trash_dir=None):
    """Moves a file to the Trash (macOS) instead of deleting it."""
    t = trash_dir or os.path.join(os.path.expanduser('~'), '.Trash')
    if not os.path.isdir(t):
        return False
    dest = os.path.join(t, os.path.basename(path))
    if os.path.exists(dest):
        stem, ext = os.path.splitext(dest)
        dest = '%s %d%s' % (stem, int(time.time()), ext)
    try:
        shutil.move(path, dest)
        return True
    except OSError:
        return False


def maybe_update(downloads, trash_dir, assume_yes, folder=None):
    """Offers to install a newer zip from Downloads. Returns 'none', 'declined' or 'installed'."""
    folder = folder or HERE
    current = installed_version(folder)
    found = find_update(downloads, current)
    if not found:
        return 'none'
    version, path, files = found
    shown = os.path.basename(path)
    print('A newer DM Forge is in your Downloads folder: %s (version %s; you have %s).' % (shown, version, current or 'an older one'))
    if assume_yes:
        print('Installing it now (use --ask to be asked first).')
    else:
        if not sys.stdin.isatty():
            return 'declined'
        try:
            ans = input('Install it now? Your notes and settings are not touched. [Y/n] ').strip().lower()
        except EOFError:
            ans = 'n'
        if ans not in ('', 'y', 'yes'):
            print('Skipped. It will ask again next time.\n')
            return 'declined'
    try:
        install_update(files, folder)
    except OSError as e:
        print('Could not install the update (%s). Carrying on with the version you have.\n' % e)
        return 'declined'
    moved = trash_file(path, trash_dir)
    print('Updated to version %s.%s\n' % (version, ' The downloaded zip was moved to the Trash.' if moved else ''))
    return 'installed'


# ---------------------------------------------------------------- remembered vault
def saved_vault():
    try:
        with open(os.path.join(CONFIG_DIR, 'config.json'), 'r', encoding='utf-8') as f:
            p = json.load(f).get('vault')
        return p if p and os.path.isdir(p) else None
    except (OSError, ValueError, AttributeError):
        return None


def save_vault(path):
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(os.path.join(CONFIG_DIR, 'config.json'), 'w', encoding='utf-8') as f:
            json.dump({'vault': path}, f)
    except OSError:
        pass


def pick_vault(arg, choose=False):
    raw = arg
    if not raw and not choose:
        remembered = saved_vault()
        if remembered:
            print('Using your vault: %s' % remembered)
            print('(To pick a different one, start with --choose.)')
            return remembered
    while True:
        if not raw:
            print('\nDrag your Obsidian vault folder into this window, then press Enter:')
            raw = input('> ')
        path = unescape_dragged_path(raw)
        if os.path.isdir(path):
            full = os.path.abspath(path)
            save_vault(full)
            return full
        print('That is not a folder: %s' % path)
        raw = ''
        if not sys.stdin.isatty():
            sys.exit(2)


def open_browser(url, browser):
    try:
        if sys.platform == 'darwin':
            if browser:
                if subprocess.run(['open', '-a', browser, url], capture_output=True).returncode == 0:
                    return True
            return subprocess.run(['open', url], capture_output=True).returncode == 0
        return webbrowser.open(url)
    except Exception:
        return False


# ---------------------------------------------------------------- commands typed in this window
COMMAND_HELP = ('  update    install a newer DM Forge from your Downloads folder, then restart (this window stays open)\n'
                '  rollback  go back to the version before this one, then restart\n'
                '  forward   after a rollback, go forward to the newer version again, then restart\n'
                '  quit      stop the helper\n'
                '  help      show this list')


def restart_helper():
    """Starts the helper again in this same Terminal window, on the same port and with the same link, so an open
    DM Forge tab only needs a refresh. Called from the main thread once the server has stopped. Does not return."""
    args = [sys.executable, os.path.join(HERE, 'dmforge-server.py'), State.root, '--no-update', '--no-open',
            '--port', str(State.port), '--app', State.app_path, '--downloads', State.downloads]
    if State.verbose:
        args.append('--verbose')
    if State.trash:
        args += ['--trash', State.trash]
    os.environ['DMF_RESTART_TOKEN'] = State.token
    sys.stdout.flush()
    sys.stderr.flush()
    os.execv(sys.executable, args)


def _stop_server(server, restart=False):
    State.restart = restart
    threading.Thread(target=server.shutdown, daemon=True).start()


def run_command(cmd, server):
    """Handles one line typed in the helper's window. Returns False when the helper should stop listening."""
    cmd = cmd.strip().lower()
    if not cmd:
        return True
    if cmd in ('update', 'u', 'upgrade'):
        outcome = maybe_update(State.downloads, State.trash, True)
        if outcome == 'installed':
            print('Restarting DM Forge...\n')
            _stop_server(server, restart=True)
            return False
        elif outcome == 'none':
            print('No newer DM Forge zip found in %s (you have version %s).' % (State.downloads, installed_version() or '?'))
            print('Download the new DM-Forge-V2.zip, then type update again.\n')
        return True
    if cmd in ('rollback', 'roll back'):
        was = installed_version()
        ver = rollback()
        if ver is None:
            print('There is no earlier version to go back to (the .previous folder is empty).\n')
        else:
            print('Rolled back from %s to %s. Restarting DM Forge...\n' % (was or '?', ver))
            _stop_server(server, restart=True)
            return False
        return True
    if cmd in ('rollforward', 'roll forward', 'forward'):
        was = installed_version()
        ver = rollforward()
        if ver is None:
            print('There is no later version to go forward to.\n')
        else:
            print('Moved from %s forward to %s. Restarting DM Forge...\n' % (was or '?', ver))
            _stop_server(server, restart=True)
            return False
        return True
    if cmd in ('quit', 'exit', 'q', 'stop'):
        print('Stopping...')
        _stop_server(server)
        return False
    if cmd in ('help', 'h', '?'):
        print('Type one of these and press Enter:\n' + COMMAND_HELP + '\n')
        return True
    print('I do not know "%s". Type one of these and press Enter:\n%s\n' % (cmd, COMMAND_HELP))
    return True


def stdin_in_foreground():
    """True when this process may read the terminal. A process in the terminal's background that reads it is stopped by the
    system ("suspended (tty input)"), so the helper never reads unless it is in front. (Piped input is always fine.)"""
    try:
        return (not os.isatty(0)) or os.tcgetpgrp(0) == os.getpgrp()
    except OSError:
        return False


def command_loop(server):
    """Reads what is typed in the helper's window, a line at a time, without ever blocking the helper or waiting on the terminal
    while it is in the background."""
    import select
    pending, fails = '', 0
    while True:
        try:
            if not stdin_in_foreground():
                time.sleep(0.5)
                continue
            ready, _, _ = select.select([0], [], [], 0.5)
            if not ready:
                continue
            data = os.read(0, 4096)
        except (OSError, ValueError):
            fails += 1
            if fails > 40:
                return
            time.sleep(0.5)
            continue
        if not data:
            return
        fails = 0
        pending += data.decode('utf-8', errors='replace')
        while '\n' in pending or '\r' in pending:
            line, pending = re.split(r'\r\n|\n|\r', pending, maxsplit=1)
            try:
                if not run_command(line, server):
                    return
            except SystemExit:
                raise
            except Exception as e:
                print('That did not work: %s\n' % e)


def main(argv=None):
    ap = argparse.ArgumentParser(description='DM Forge helper')
    ap.add_argument('vault', nargs='?', help='path to your Obsidian vault folder')
    ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-open', action='store_true', help='do not open a browser window')
    ap.add_argument('--browser', default='Brave Browser', help='macOS app to open (default: Brave Browser)')
    ap.add_argument('--app', default=os.path.join(HERE, 'DM-Forge.html'))
    ap.add_argument('--verbose', action='store_true')
    ap.add_argument('--choose', action='store_true', help='pick the vault folder again instead of using the remembered one')
    ap.add_argument('--no-update', action='store_true', help='do not look for a newer version in Downloads')
    ap.add_argument('--update-only', action='store_true', help='install a newer version from Downloads, then exit')
    ap.add_argument('--yes', action='store_true', help='install an update without asking (this is the default)')
    ap.add_argument('--ask', action='store_true', help='ask before installing an update, instead of installing it automatically')
    ap.add_argument('--no-commands', action='store_true', help='do not listen for commands typed in this window (update, rollback, quit)')
    ap.add_argument('--rollback', action='store_true', help='put back the version that was installed before this one (kept in .previous), then exit')
    ap.add_argument('--downloads', default=os.path.join(os.path.expanduser('~'), 'Downloads'))
    ap.add_argument('--trash', default=None, help=argparse.SUPPRESS)
    args = ap.parse_args(argv)

    # never let the terminal stop the helper just because it was not in front when something touched the tty
    for name in ('SIGTTIN', 'SIGTTOU'):
        try:
            import signal
            signal.signal(getattr(signal, name), signal.SIG_IGN)
        except (AttributeError, ValueError, OSError):
            pass

    if args.rollback:
        was = installed_version()
        ver = rollback()
        if ver is None:
            print('There is no earlier version to go back to (the .previous folder is empty).')
            return 1
        print('Rolled back from %s to %s. Start DM Forge as usual. (The version you left is kept in .rolled-back.)' % (was or '?', ver))
        return 0

    if not args.no_update:
        server_before = open(os.path.join(HERE, 'dmforge-server.py'), 'rb').read() if os.path.isfile(os.path.join(HERE, 'dmforge-server.py')) else b''
        outcome = maybe_update(args.downloads, args.trash, args.yes or not args.ask)
        if args.update_only:
            return 0
        if outcome == 'installed':
            try:
                server_after = open(os.path.join(HERE, 'dmforge-server.py'), 'rb').read()
            except OSError:
                server_after = server_before
            if server_after != server_before:
                # the helper itself was updated: start the new one
                os.execv(sys.executable, [sys.executable, os.path.join(HERE, 'dmforge-server.py')] + (argv if argv is not None else sys.argv[1:]) + ['--no-update'])
    elif args.update_only:
        return 0

    if not os.path.isfile(args.app):
        print('Cannot find %s next to this script.' % args.app)
        return 2
    vault = pick_vault(args.vault, args.choose)
    if not os.path.isdir(os.path.join(vault, '.obsidian')):
        print('Note: there is no .obsidian folder in %s, so this may not be the vault root.' % vault)

    State.root = vault
    State.root_real = os.path.realpath(vault)
    restarted = bool(os.environ.get('DMF_RESTART_TOKEN'))
    State.token = os.environ.pop('DMF_RESTART_TOKEN', '') or secrets.token_urlsafe(24)
    State.app_path = args.app
    State.verbose = args.verbose
    State.downloads = args.downloads
    State.trash = args.trash

    server = None
    for port in range(args.port, args.port + 20):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
            State.port = port
            State.server = server
            break
        except OSError:
            continue
    if server is None:
        print('Could not find a free port near %d.' % args.port)
        return 2

    url = 'http://127.0.0.1:%d/?t=%s' % (State.port, State.token)
    ver = installed_version()
    print('\nDM Forge%s helper is running for: %s' % (' ' + ver if ver else '', vault))
    if restarted:
        print('Restarted. Your DM Forge tab uses the same link, so just refresh it (Command-R):\n\n  %s\n' % url)
    else:
        print('Open this link in your browser:\n\n  %s\n' % url)
    print('Leave this window open while you use DM Forge. Press Ctrl+C to stop.')
    interactive = (sys.stdin.isatty() or bool(os.environ.get('DMF_COMMANDS'))) and not args.no_commands and not os.environ.get('DMF_NO_COMMANDS') and stdin_in_foreground()
    if interactive:
        print('To update without closing this window: type  update  and press Enter (more: help).')
    print()
    sys.stdout.flush()
    if not args.no_open:
        threading.Timer(0.5, open_browser, (url, args.browser)).start()
    if interactive:
        threading.Thread(target=command_loop, args=(server,), daemon=True).start()
    try:
        server.serve_forever()
        if not State.restart:
            print('Stopped.')
    except KeyboardInterrupt:
        print('\nStopped.')
    finally:
        server.server_close()
    if State.restart:
        restart_helper()          # from the main thread, with the port already released
    return 0


if __name__ == '__main__':
    sys.exit(main())
