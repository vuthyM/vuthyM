import { dirname, basename, pool } from './util.js';

/* Compares each pending change against what is on disk right now, so a note
   edited in Obsidian during the session is flagged instead of overwritten.
   Items carry no content diff: the review only lists which notes are touched.

   A move is two pending entries (delete at the old path, create at the new one).
   The delete half is kept in `items` so it is applied, but the screen shows one row
   for the pair, on the create half. */
import { merge3 } from './merge3.js';

export async function buildReview(vault, working) {
  const entries = working.list();
  const disks = new Map();
  await pool(entries, 12, async e => {
    let disk = null;
    // A failure here is a real failure (the helper stopped, permission was lost), never "the note is gone": it stops the push with the reason.
    if (await vault.exists(e.path)) {
      try { disk = await vault.readText(e.path); }
      catch (err) { if (err && err.status === 404) disk = ''; else throw err; }     // something is there that is not a readable note (a folder called X.md): it counts as in the way
    }
    disks.set(e.path, disk);
  });
  const items = entries.map(e => {
    const disk = disks.get(e.path);
    let conflict = null;
    if (e.kind === 'create') { if (disk !== null) conflict = 'exists'; }
    else if (e.movedTo) conflict = null;               // judged on the create half
    else if (disk === null) conflict = 'missing';
    else if (disk !== e.original) conflict = 'changed';
    // changed on disk and here, but in different places: the two can be kept together (never chosen for you)
    const merged = conflict === 'changed' && e.kind === 'update' && typeof e.original === 'string' ? merge3(e.original, e.text, disk) : null;
    return { path: e.path, kind: e.kind, original: e.original, text: e.text, disk, conflict, merged, movedFrom: e.movedFrom || null, movedTo: e.movedTo || null };
  });
  const byPath = new Map(items.map(it => [it.path, it]));
  for (const it of items) {
    if (it.kind !== 'create' || !it.movedFrom) continue;
    const src = byPath.get(it.movedFrom);
    if (src && src.disk !== null && src.disk !== src.original && !it.conflict) it.conflict = 'srcchanged';
  }
  return items;
}

/* what the review screen lists: one row per change, a move being one row */
export const visibleItems = items => items.filter(it => !(it.kind === 'delete' && it.movedTo));

export function defaultDecisions(items) {
  const d = {};
  for (const it of visibleItems(items)) d[it.path] = it.conflict ? null : 'mine';
  return d;
}

async function uniquePath(vault, path) {
  const dir = dirname(path), file = basename(path);
  const m = file.match(/^(.*?)(\.[^.]+)?$/);
  for (let i = 2; i < 100; i++) {
    const p = (dir ? dir + '/' : '') + m[1] + ' ' + i + (m[2] || '');
    if (!(await vault.exists(p))) return p;
  }
  return path;
}

/* decisions: path -> 'mine' | 'disk' | 'skip' | 'rename'  (null = undecided, treated as skip) */
export async function applyPush(vault, working, items, decisions) {
  const results = [];
  // the new copy of a moved note is written before the old one is removed
  const ordered = [...items].sort((a, b) => (a.kind === 'delete' && a.movedTo ? 1 : 0) - (b.kind === 'delete' && b.movedTo ? 1 : 0));
  for (const it of ordered) {
    if (it.kind === 'delete' && it.movedTo) {
      const done = results.find(r => r.path === it.movedTo);
      if (!done || done.status !== 'written') continue;           // the new copy is not there, so the old one stays
      try {
        if (it.disk !== null) await vault.moveToTrash(it.path);
        working.markPushed(it.path, 'delete');
      } catch (e) {
        results.push({ path: it.path, status: 'error', op: 'trash', error: e && e.message ? e.message : String(e) });
      }
      continue;
    }
    const d = decisions[it.path] || (it.conflict ? 'skip' : 'mine');
    if (d === 'skip') { results.push({ path: it.path, status: 'skipped' }); continue; }
    if (d === 'disk') { working.adoptDisk(it.path, it.disk); results.push({ path: it.path, status: 'kept-disk' }); continue; }
    try {
      if (it.kind === 'delete') {
        if (it.disk !== null) await vault.moveToTrash(it.path);
        working.markPushed(it.path, 'delete');
        results.push({ path: it.path, status: 'deleted' });
      } else if (d === 'rename') {
        const p2 = await uniquePath(vault, it.path);
        await vault.writeText(p2, it.text);
        working.pending.delete(it.path);
        working.base.set(p2, it.text);
        results.push({ path: it.path, status: 'written', to: p2, moved: !!it.movedFrom });
      } else if (d === 'merge' && typeof it.merged === 'string') {
        await vault.writeText(it.path, it.merged);
        working.markPushed(it.path, 'update', it.merged);
        results.push({ path: it.path, status: 'written', merged: true });
      } else {
        await vault.writeText(it.path, it.text);
        working.markPushed(it.path, it.kind, it.text);
        results.push({ path: it.path, status: 'written', moved: !!it.movedFrom });
      }
    } catch (e) {
      results.push({ path: it.path, status: 'error', op: it.kind === 'delete' ? 'trash' : 'write', error: e && e.message ? e.message : String(e) });
    }
  }
  // a skipped or failed move leaves both halves pending, which is what we want
  return results;
}
