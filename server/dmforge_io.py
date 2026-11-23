#!/usr/bin/env python3
"""DM Forge V3: moving a campaign in and out of the database.

  python3 dmforge_io.py import --data /data "/path/to/vault" [--dry-run] [--overwrite]
  python3 dmforge_io.py export --data /data /path/to/folder

import  reads a vault folder (hidden folders such as .obsidian and .trash are skipped) into the database.
        Notes that are already there and identical are left alone. A note that is there but different is NOT
        replaced unless you pass --overwrite (the old text stays in its history either way). --dry-run
        shows what would happen and changes nothing.
export  writes every note (and imported file) as plain files into a folder, so you always have the campaign as
        Markdown: open it in Obsidian, copy it, or keep it as a backup. Files are only rewritten when they
        changed. A note that was deleted from the database is moved to <folder>/.removed/<date>/ instead of
        being erased. Files in the folder that the export did not create are never touched.

Standard library only.
"""
import argparse
import gzip
import json
import os
import shutil
import sqlite3
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dmforge_db import Store, StoreError, clean_path  # noqa: E402

MANIFEST = '.dmforge-export.json'
MAX_FILE = 20 * 1024 * 1024


def _walk(folder):
    for dp, dn, fn in os.walk(folder, followlinks=False):
        dn[:] = sorted(d for d in dn if not d.startswith('.'))
        for n in sorted(fn):
            if n.startswith('.'):
                continue
            full = os.path.join(dp, n)
            if os.path.islink(full):
                continue
            yield full, os.path.relpath(full, folder).replace(os.sep, '/')


def import_folder(store, folder, dry_run=False, overwrite=False, device='import'):
    """-> {'new': [...], 'same': n, 'changed': [...], 'updated': [...], 'skipped': [(path, why)]}"""
    folder = os.path.abspath(folder)
    if not os.path.isdir(folder):
        raise StoreError(400, 'Not a folder: %s' % folder)
    out = {'new': [], 'same': 0, 'changed': [], 'updated': [], 'skipped': []}
    for full, rel in _walk(folder):
        try:
            path = clean_path(rel)
        except StoreError as e:
            out['skipped'].append((rel, e.message))
            continue
        if os.path.getsize(full) > MAX_FILE:
            out['skipped'].append((rel, 'larger than 20 MB'))
            continue
        with open(full, 'rb') as f:
            data = f.read()
        is_md = path.lower().endswith('.md')
        try:
            cur = store.read(path)[0]
        except StoreError:
            cur = None
        if cur is None:
            out['new'].append(path)
            if not dry_run:
                store.write(path, data, action='import', device=device, md_only=False)
        elif cur == data:
            out['same'] += 1
        elif overwrite:
            out['updated'].append(path)
            if not dry_run:
                store.write(path, data, action='import', device=device, md_only=False)
        else:
            out['changed'].append(path)
    return out


def export_folder(store, dest):
    """Mirrors the database into `dest` as plain files. -> {'written': n, 'same': n, 'removed': n, 'notes': n}"""
    dest = os.path.abspath(dest)
    os.makedirs(dest, exist_ok=True)
    mpath = os.path.join(dest, MANIFEST)
    try:
        with open(mpath, 'r', encoding='utf-8') as f:
            old = set(json.load(f).get('files', []))
    except (OSError, ValueError):
        old = set()
    snap = store.snapshot()
    live = []
    written = same = 0
    for f in snap['files']:
        path = f['path']
        data, _, mtime = store.read(path)
        target = os.path.join(dest, *path.split('/'))
        real_dest = os.path.realpath(dest)
        if not os.path.realpath(os.path.dirname(target)).startswith(real_dest):
            continue
        live.append(path)
        try:
            with open(target, 'rb') as fh:
                if fh.read() == data:
                    same += 1
                    continue
        except OSError:
            pass
        os.makedirs(os.path.dirname(target), exist_ok=True)
        tmp = target + '.dmforge-part'
        with open(tmp, 'wb') as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, target)
        os.utime(target, (mtime / 1000.0, mtime / 1000.0))
        written += 1
    removed = 0
    stamp = time.strftime('%Y-%m-%d')
    for path in sorted(old - set(live)):
        src = os.path.join(dest, *path.split('/'))
        if not os.path.isfile(src):
            continue
        dst = os.path.join(dest, '.removed', stamp, *path.split('/'))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        n = 1
        base = dst
        while os.path.exists(dst):
            n += 1
            dst = '%s.%d' % (base, n)
        os.replace(src, dst)
        removed += 1
    tmp = mpath + '.part'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump({'files': live, 'at': int(time.time() * 1000)}, fh)
    os.replace(tmp, mpath)
    return {'written': written, 'same': same, 'removed': removed, 'notes': len(live)}


STATUS_FILE = 'status.json'


def read_status(data_dir):
    try:
        with open(os.path.join(data_dir, STATUS_FILE), 'r', encoding='utf-8') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def record_status(data_dir, key, value):
    """Remembers the outcome of a background job (the nightly backup) where the app's Server page can show it."""
    d = read_status(data_dir)
    d[key] = value
    tmp = os.path.join(data_dir, STATUS_FILE + '.part')
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(d, f)
    os.replace(tmp, os.path.join(data_dir, STATUS_FILE))


def verify_backup(path, expect_files):
    """Opens a database copy on its own and checks it: SQLite's own check, and every note and picture is there. -> None, or why not."""
    try:
        db = sqlite3.connect('file:%s?mode=ro&immutable=1' % path, uri=True)
        try:
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                return 'the copy did not pass SQLite\'s own check'
            n = db.execute('SELECT COUNT(*) FROM files WHERE is_dir=0').fetchone()[0]
        finally:
            db.close()
    except sqlite3.Error as e:
        return 'the copy cannot be opened (%s)' % e
    if n != expect_files:
        return 'the copy holds %d files but the database holds %d' % (n, expect_files)
    return None


def backup_files(data_dir):
    """Every database copy kept: [(name, bytes)], newest first by name."""
    bdir = os.path.join(data_dir, 'backups')
    out = []
    try:
        for n in os.listdir(bdir):
            if n.endswith('.db') or n.endswith('.db.gz'):
                try:
                    out.append((n, os.path.getsize(os.path.join(bdir, n))))
                except OSError:
                    pass
    except OSError:
        pass
    return sorted(out, reverse=True)


def nightly(store, data_dir, export_dir=None, keep=14):
    """One backup round: a consistent database copy that is checked and compressed (keeping the newest `keep`), and the Markdown export.
    The outcome, good or bad, is recorded for the app's Server page."""
    res = {}
    bdir = os.path.join(data_dir, 'backups')
    stamp = time.strftime('%Y%m%d-%H%M%S')
    plain = os.path.join(bdir, 'dmforge-%s.db' % stamp)
    try:
        store.backup_to(plain)
        problem = verify_backup(plain, store.db.execute('SELECT COUNT(*) FROM files WHERE is_dir=0').fetchone()[0])
        if problem:
            os.unlink(plain)
            raise RuntimeError('the backup was made but is not good: ' + problem)
        gz = plain + '.gz'
        with open(plain, 'rb') as src, gzip.open(gz + '.part', 'wb', compresslevel=6) as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        os.replace(gz + '.part', gz)
        os.unlink(plain)
        res['backup'] = os.path.basename(gz)
        names = sorted((n for n in os.listdir(bdir) if n.startswith('dmforge-') and (n.endswith('.db') or n.endswith('.db.gz'))))
        for n in names[:-keep] if keep > 0 else []:
            try:
                os.unlink(os.path.join(bdir, n))
            except OSError:
                pass
        record_status(data_dir, 'backup', {'at': int(time.time() * 1000), 'ok': True, 'file': res['backup'], 'bytes': os.path.getsize(gz), 'verified': True})
    except Exception as e:
        try:
            record_status(data_dir, 'backup', {'at': int(time.time() * 1000), 'ok': False, 'error': str(e)[:200]})
        except OSError:
            pass
        raise
    if export_dir:
        res['export'] = export_folder(store, export_dir)
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description='DM Forge V3 import and export')
    ap.add_argument('cmd', choices=('import', 'export'))
    ap.add_argument('folder')
    ap.add_argument('--data', default=os.environ.get('DMFORGE_DATA', '/data'))
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--overwrite', action='store_true')
    a = ap.parse_args(argv)
    store = Store(os.path.join(a.data, 'dmforge.db'))
    if a.cmd == 'import':
        r = import_folder(store, a.folder, a.dry_run, a.overwrite)
        tag = 'DRY RUN, nothing changed. ' if a.dry_run else ''
        print('%sNew: %d. Already the same: %d. Updated: %d. Different in the database (left alone): %d. Skipped: %d.' %
              (tag, len(r['new']), r['same'], len(r['updated']), len(r['changed']), len(r['skipped'])))
        for p in r['changed'][:50]:
            print('  differs: ' + p)
        for p, why in r['skipped'][:50]:
            print('  skipped: %s (%s)' % (p, why))
        if r['changed'] and not a.overwrite:
            print('Run again with --overwrite to replace those (the old text stays in each note\'s history).')
    else:
        r = export_folder(store, a.folder)
        print('Exported %(notes)d files: %(written)d written, %(same)d unchanged, %(removed)d moved to .removed.' % r)
    store.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
