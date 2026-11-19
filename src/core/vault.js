import { dirname, basename } from './util.js';

/* A vault is anything that can list, read and write files by vault-relative
   path ("NPCs/Mira.md"). The root is "". Two implementations: FsaVault wraps a
   real folder chosen in the browser, MemoryVault is used for the demo and tests. */

/* a note in the trash goes back to the same path without the trash folder; if something is there now it comes back as "name (restored)" */
export const TRASH_ROOTS = ['.trash/', '.dmforge-trash/'];
export const trashOriginal = p => { const r = TRASH_ROOTS.find(t => p.startsWith(t)); return r ? p.slice(r.length) : p; };
async function freeName(vault, path) {
  if (!(await vault.exists(path))) return path;
  const dot = path.lastIndexOf('.');
  const stem = dot > 0 ? path.slice(0, dot) : path, ext = dot > 0 ? path.slice(dot) : '';
  let p = stem + ' (restored)' + ext;
  for (let i = 2; await vault.exists(p) && i < 100; i++) p = stem + ' (restored ' + i + ')' + ext;
  return p;
}

export class MemoryVault {
  constructor(files = {}, name = 'Demo vault') {
    this.kind = 'memory';
    this.name = name;
    this.files = new Map();
    this.dirs = new Set();
    for (const [p, v] of Object.entries(files)) this.files.set(p, { data: v, mtime: Date.now() });
  }
  async mkdir(path) {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) this.dirs.add(parts.slice(0, i).join('/'));
  }
  async list(dir) {
    const prefix = dir ? dir + '/' : '';
    const out = new Map();
    for (const p of this.files.keys()) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const i = rest.indexOf('/');
      if (i < 0) out.set(rest, { name: rest, kind: 'file' });
      else out.set(rest.slice(0, i), { name: rest.slice(0, i), kind: 'dir' });
    }
    for (const d of this.dirs) {
      if (!d.startsWith(prefix) || d === dir) continue;
      const rest = d.slice(prefix.length);
      const name = rest.split('/')[0];
      if (name && !out.has(name)) out.set(name, { name, kind: 'dir' });
    }
    return [...out.values()];
  }
  _get(p) { const f = this.files.get(p); if (!f) throw new Error('File not found: ' + p); return f; }
  async readText(p) { const f = this._get(p); return typeof f.data === 'string' ? f.data : await f.data.text(); }
  async readBlob(p) { const f = this._get(p); return typeof f.data === 'string' ? new Blob([f.data]) : f.data; }
  async stat(p) { const f = this._get(p); return { size: typeof f.data === 'string' ? f.data.length : f.data.size, mtime: f.mtime }; }
  async exists(p) { return this.files.has(p); }
  async writeText(p, text) { this.files.set(p, { data: text, mtime: Date.now() }); }
  async moveToTrash(p) {
    const f = this._get(p);
    let t = '.trash/' + p;
    if (this.files.has(t)) t = '.trash/' + Date.now() + ' ' + p;
    this.files.set(t, f);
    this.files.delete(p);
  }
  async ensureWrite() { return true; }
  async trashList() {
    return [...this.files.entries()].filter(([p]) => p.startsWith('.trash/') && /\.md$/i.test(p)).map(([p, f]) => ({ path: p, size: typeof f.data === 'string' ? f.data.length : f.data.size, mtime: f.mtime })).sort((a, b) => b.mtime - a.mtime);
  }
  async trashRestore(p) {
    const f = this._get(p);
    const to = await freeName(this, trashOriginal(p));
    this.files.set(to, f);
    this.files.delete(p);
    return to;
  }
  /* test helper: simulate editing a file in Obsidian while the app is open */
  externalEdit(p, text) { this.files.set(p, { data: text, mtime: Date.now() }); }
}

export class FsaVault {
  constructor(root) {
    this.kind = 'fsa';
    this.root = root;
    this.name = root.name;
    this.dirCache = new Map();
  }
  async dir(path, create = false) {
    if (!path) return this.root;
    let h = this.root, cur = '';
    for (const part of path.split('/')) {
      cur = cur ? cur + '/' + part : part;
      if (this.dirCache.has(cur)) { h = this.dirCache.get(cur); continue; }
      h = await h.getDirectoryHandle(part, { create });
      this.dirCache.set(cur, h);
    }
    return h;
  }
  async list(path) {
    const d = await this.dir(path);
    const out = [];
    for await (const [name, h] of d.entries()) out.push({ name, kind: h.kind === 'directory' ? 'dir' : 'file' });
    return out;
  }
  async file(path, create = false) {
    const d = await this.dir(dirname(path), create);
    return d.getFileHandle(basename(path), { create });
  }
  async mkdir(path) { await this.dir(path, true); }
  async readText(path) { return (await (await this.file(path)).getFile()).text(); }
  async readBlob(path) { return (await this.file(path)).getFile(); }
  async stat(path) { const f = await (await this.file(path)).getFile(); return { size: f.size, mtime: f.lastModified }; }
  async exists(path) { try { await this.file(path); return true; } catch (e) { return false; } }
  async writeText(path, text) {
    const fh = await this.file(path, true);
    const w = await fh.createWritable();
    try { await w.write(text); await w.close(); } catch (e) { try { await w.abort(); } catch (_) {} throw e; }
  }
  async moveToTrash(path) {
    const blob = await this.readBlob(path);
    let target = '.trash/' + path;
    if (await this.exists(target)) target = '.trash/' + Date.now() + ' ' + path;
    const fh = await this.file(target, true);
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    const d = await this.dir(dirname(path));
    await d.removeEntry(basename(path));
  }
  async trashList() {
    const out = [];
    const walk = async dir => {
      let ents;
      try { ents = await this.list(dir); } catch (e) { return; }
      for (const e of ents) {
        const p = dir + '/' + e.name;
        if (e.kind === 'dir') await walk(p);
        else if (/\.md$/i.test(e.name)) { try { const st = await this.stat(p); out.push({ path: p, size: st.size, mtime: st.mtime }); } catch (x) { /* skip */ } }
      }
    };
    await walk('.trash');
    return out.sort((a, b) => b.mtime - a.mtime);
  }
  async trashRestore(path) {
    const blob = await this.readBlob(path);
    const to = await freeName(this, trashOriginal(path));
    const fh = await this.file(to, true);
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    const d = await this.dir(dirname(path));
    await d.removeEntry(basename(path));
    return to;
  }
  async ensureWrite() {
    if (!this.root.queryPermission) return true;
    let p = await this.root.queryPermission({ mode: 'readwrite' });
    if (p !== 'granted' && this.root.requestPermission) p = await this.root.requestPermission({ mode: 'readwrite' });
    return p === 'granted';
  }
}

/* Talks to the local helper (helper/dmforge-server.py), which serves this page and
   reads/writes the vault folder. Used when the browser cannot open folders itself. */
export class HttpVault {
  constructor({ name, token, base = '' }) {
    this.kind = 'http';
    this.name = name;
    this.token = token;
    this.base = base;
    this.pushId = '';
  }
  /* while a push is running every write and trash carries the push id, so the helper can keep the old text for "Undo last push" */
  beginPush(id) { this.pushId = id; }
  endPush() { this.pushId = ''; }
  async _call(op, path, init = {}, more = '') {
    const extra = this.pushId && (op === 'write' || op === 'trash') ? '&push=' + encodeURIComponent(this.pushId) : '';
    const url = this.base + '/api/' + op + '?path=' + encodeURIComponent(path || '') + extra + more;
    let res;
    try { res = await fetch(url, Object.assign({}, init, { headers: Object.assign({ 'X-DMF-Token': this.token }, init.headers || {}) })); }
    catch (e) {
      const err = new Error('Cannot reach the DM Forge helper. Is its window still open? If you closed it, start it again and open the new link. Your unpushed changes are kept in this browser and will come back.');
      err.offline = true;
      throw err;
    }
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error; } catch (e) { /* not JSON */ }
      const err = new Error(msg || 'The helper returned an error (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return res;
  }
  async list(path) { return (await this._call('list', path)).json(); }
  async readText(path) { return (await this._call('read', path)).text(); }
  async readBlob(path) { return (await this._call('read', path)).blob(); }
  async stat(path) { return (await this._call('stat', path)).json(); }
  async exists(path) { return (await (await this._call('exists', path)).json()).exists; }
  async writeText(path, text) { await this._call('write', path, { method: 'POST', body: new Blob([text], { type: 'text/plain;charset=utf-8' }) }); }
  async mkdir(path) { await this._call('mkdir', path, { method: 'POST' }); }
  async moveToTrash(path) { await this._call('trash', path, { method: 'POST' }); }
  /* Claude (experimental) and rolling back: both are handled by the helper */
  /* the version the helper has installed right now (it changes when you type `update` in the helper's window) */
  async helperVersion() { return (await (await this._call('ping', '')).json()).version || ''; }
  async claudeStatus() { return (await this._call('claude-status', '')).json(); }
  async claudeAsk(prompt, system) { return (await (await this._call('claude', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, system }) })).json()).text; }
  async claudeCheck() { return (await this._call('claude-check', '', { method: 'POST' })).json(); }
  /* updating from inside the app: a newer zip in the Downloads folder, and installing it (the helper then restarts itself) */
  async updateInfo() { return (await this._call('update-info', '')).json(); }
  async installUpdate() { return (await this._call('update-install', '', { method: 'POST' })).json(); }
  async rollbackInfo() { return (await this._call('rollback-info', '')).json(); }
  async rollback() { return (await this._call('rollback', '', { method: 'POST' })).json(); }
  /* roll back or forward and have the helper restart itself (like an update does) */
  async switchVersion(dir) { return (await this._call(dir === 'forward' ? 'rollforward' : 'rollback', '', { method: 'POST' }, '&restart=1')).json(); }
  async undoInfo() { return (await this._call('undo-info', '')).json(); }
  async undoPush(force) { return (await this._call('undo-push', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force: !!force }) })).json(); }
  async trashList() { return (await this._call('trash-list', '')).json(); }
  async trashRestore(path) { return (await (await this._call('trash-restore', path, { method: 'POST' })).json()).path; }
  async ensureWrite() { return true; }
}
