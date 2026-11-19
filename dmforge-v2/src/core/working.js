/* The working copy of a campaign: what was read from disk (base) plus every
   change made since (pending). Nothing touches the vault until a push.

   A move is staged as two linked entries: a delete at the old path (movedTo) and a
   create at the new one (movedFrom). They always travel together. */
export class Working {
  constructor() { this.base = new Map(); this.pending = new Map(); this.onChange = null; }

  loadBase(texts) { this.base = new Map(texts); }

  get(path) {
    const p = this.pending.get(path);
    if (p) return p.kind === 'delete' ? undefined : p.text;
    return this.base.get(path);
  }
  has(path) { return this.get(path) !== undefined; }

  paths() {
    const out = [];
    for (const p of this.base.keys()) { const x = this.pending.get(p); if (!(x && x.kind === 'delete')) out.push(p); }
    for (const [p, x] of this.pending) if (x.kind === 'create') out.push(p);
    return out;
  }

  /* every edit goes through here; onChange(path, before, after) lets the app note what changed */
  setText(path, text) {
    const before = this.onChange ? this.get(path) : undefined;
    this._setText(path, text);
    if (this.onChange && before !== undefined && before !== text) { try { this.onChange(path, before, text); } catch (e) { /* tracking must never break an edit */ } }
  }
  _setText(path, text) {
    const p = this.pending.get(path);
    if (p && p.kind === 'create') { p.text = text; return; }
    const b = this.base.get(path);
    if (b === undefined) { this.pending.set(path, { kind: 'create', original: null, text }); return; }
    if (p && p.kind === 'delete') { /* editing a note marked for deletion restores it */ }
    if (text === b) { this.pending.delete(path); return; }
    this.pending.set(path, { kind: 'update', original: b, text });
  }
  create(path, text) { this.pending.set(path, { kind: 'create', original: null, text }); }

  remove(path) {
    const p = this.pending.get(path);
    if (p && p.kind === 'create') {
      this.pending.delete(path);
      if (p.movedFrom) { const src = this.pending.get(p.movedFrom); if (src) delete src.movedTo; }
      return;
    }
    const original = p ? p.original : this.base.get(path);
    this.pending.set(path, { kind: 'delete', original, text: null });
  }

  /* Stages moving the note at `from` to `to`, with `text` as its new content. */
  move(from, to, text) {
    if (from === to) { this.setText(from, text); return; }
    const p = this.pending.get(from);
    let origin = from;               // the path the note had on disk
    if (p && p.kind === 'create') {
      this.pending.delete(from);
      if (p.movedFrom) origin = p.movedFrom;
    }
    if (origin === to) {             // moved back to where it started
      this.pending.delete(to);
      this.setText(to, text);
      return;
    }
    if (origin !== from || !(p && p.kind === 'create')) {
      // `from` exists on disk (or a chain of moves started there)
      const orig = this.pending.get(origin);
      const original = orig ? orig.original : this.base.get(origin);
      this.pending.set(origin, { kind: 'delete', original, text: null, movedTo: to });
      this.pending.set(to, { kind: 'create', original: null, text, movedFrom: origin });
    } else {
      // a brand new note that was never on disk: just relocate it
      this.pending.set(to, { kind: 'create', original: null, text });
    }
  }

  /* Drops the pending change for `path` (and the other half of a move).
     Returns every path whose pending entry was removed. */
  revert(path) {
    const p = this.pending.get(path);
    const gone = [path];
    this.pending.delete(path);
    if (p && p.movedTo) { this.pending.delete(p.movedTo); gone.push(p.movedTo); }
    if (p && p.movedFrom) { this.pending.delete(p.movedFrom); gone.push(p.movedFrom); }
    return gone;
  }
  discardAll() { this.pending.clear(); }

  list() {
    return [...this.pending.entries()].map(([path, p]) => ({ path, ...p })).sort((a, b) => a.path.localeCompare(b.path));
  }
  /* a move counts once, not as a delete plus a create */
  get count() {
    let n = 0;
    for (const p of this.pending.values()) if (!(p.kind === 'delete' && p.movedTo)) n++;
    return n;
  }

  /* after a successful write */
  markPushed(path, kind, text) {
    if (kind === 'delete') this.base.delete(path); else this.base.set(path, text);
    this.pending.delete(path);
  }
  /* "keep what's on disk": drop my change and adopt the disk version */
  adoptDisk(path, diskText) {
    if (diskText === null || diskText === undefined) this.base.delete(path); else this.base.set(path, diskText);
    this.pending.delete(path);
  }

  serialize() { return this.list(); }
  restore(entries) {
    for (const e of entries || []) {
      // already on disk (it was pushed just before the page closed): nothing to bring back
      const b = this.base.get(e.path);
      if ((e.kind === 'update' || e.kind === 'create') && b !== undefined && b === e.text) continue;
      if (e.kind === 'delete' && b === undefined) continue;
      const x = { kind: e.kind, original: e.original, text: e.text };
      if (e.movedTo) x.movedTo = e.movedTo;
      if (e.movedFrom) x.movedFrom = e.movedFrom;
      this.pending.set(e.path, x);
    }
  }
}
