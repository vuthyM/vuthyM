import { dirname, basename, pool } from './util.js';
import { OfflineCache } from './offlinecache.js';

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

/* The V3 server (server/dmforge_hosted.py). It speaks the same requests as the Mac helper, and adds:
   - every write and trash says which version of the note it was based on, so the server refuses (409) to overwrite
     a note that changed elsewhere in the meantime, whatever the timing
   - everything read is kept in this browser, so the campaign opens and can be worked on with no connection
   - note history, a change feed (what moved on the server since I last looked) and search */
export class ServerVault extends HttpVault {
  constructor({ name, token = '', base = '' }) {
    super({ name, token, base });
    this.hosted = true;
    this.versions = new Map();               // the server's version number for each note I have read or written
    this.cache = new OfflineCache(name);
    this.online = true;
    this._probed = false; this._probe = null;
    this.snap = null;                        // path -> version, only while a campaign is being opened (see beginBulk)
    this._deadUntil = 0;                     // while the clock is before this, requests give up at once (the server just failed to answer)
    this.onStatus = null;                    // called with true/false when reaching the server starts or stops working
    this.device = deviceId();
  }
  _setOnline(on) { if (on !== this.online) { this.online = on; if (this.onStatus) { try { this.onStatus(on); } catch (e) { /* a listener must not break a request */ } } } }
  async _call(op, path, init = {}, more = '') {
    const extra = this.pushId && (op === 'write' || op === 'trash') ? '&push=' + encodeURIComponent(this.pushId) : '';
    const url = this.base + '/api/' + op + '?path=' + encodeURIComponent(path || '') + extra + '&device=' + encodeURIComponent(this.device) + more;
    const offline = () => {
      const err = new Error('Cannot reach the DM Forge server. You can keep working: your changes are saved on this device and can be pushed once it is reachable again.');
      err.offline = true;
      return err;
    };
    // The very first request of a visit asks the server a quick question first, so a stalled link is noticed in 4 seconds rather than at the
    // end of the first real request's own wait.
    if (op !== 'ping' && !this._probed) {
      if (!this._probe) this._probe = this._call('ping', '').then(() => true, () => false).then(ok => { this._probed = true; return ok; });
      await this._probe;
    }
    // The server just failed to answer: for a few seconds every other request gives up at once (the saved copy is used), instead of each one
    // waiting its own turn. The ping that checks whether it is back is the only request that still tries.
    if (op !== 'ping' && this._deadUntil > Date.now()) { this._setOnline(false); throw offline(); }
    // A server that takes the connection but never answers (a stalled link, a restart in progress) must read as "offline", not freeze the page.
    const ms = op === 'ping' ? 4000 : (op === 'write' || op === 'trash' || op.startsWith('atlas') || op === 'undo-push' || op === 'backup' ? 30000 : 8000);
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    let res;
    try { res = await fetch(url, Object.assign({}, init, { credentials: 'same-origin', signal: ctl ? ctl.signal : undefined, headers: Object.assign({ 'X-DMF-Token': this.token }, init.headers || {}) })); }
    catch (e) {
      this._deadUntil = Date.now() + 3000;
      this._setOnline(false);
      throw offline();
    }
    finally { if (timer) clearTimeout(timer); }
    this._deadUntil = 0;
    this._setOnline(true);
    if (!res.ok) {
      let body = null;
      try { body = await res.json(); } catch (e) { /* not JSON */ }
      const err = new Error((body && body.error) || 'The server returned an error (' + res.status + ')');
      err.status = res.status;
      if (res.status === 401) { err.auth = true; err.message = 'Your sign-in has expired. Reload this page to sign in again; your changes are kept.'; }
      if (res.status === 409 && body) { err.conflict = body.conflict; err.current = body.current; }
      throw err;
    }
    return res;
  }
  _notCached() { const e = new Error('That has not been saved on this device yet, so it cannot be opened without a connection.'); e.offline = true; return e; }
  async readText(path) {
    try {
      // While a campaign is being opened, a note this device already holds at the server's current version is not downloaded again
      if (this.snap) {
        const want = this.snap.get(path);
        const c = want ? await this.cache.get('text', path) : null;
        if (c && c.version === want) { this.versions.set(path, want); return c.text; }
      }
      const res = await this._call('read', path);
      const text = await res.text();
      const version = +res.headers.get('X-DMF-Version') || 0;
      this.versions.set(path, version);
      this.cache.put('text', path, { version, text });
      return text;
    } catch (e) {
      if (e.offline) { const c = await this.cache.get('text', path); if (c) { this.versions.set(path, c.version); return c.text; } throw this._notCached(); }
      if (e.status === 404) { this.cache.del('text', path); this.versions.delete(path); }
      throw e;
    }
  }
  async readBlob(path) {
    try {
      const blob = await (await this._call('read', path)).blob();
      this.cache.put('blob', path, { blob });
      return blob;
    } catch (e) {
      if (e.offline) { const c = await this.cache.get('blob', path); if (c) return c.blob; throw this._notCached(); }
      throw e;
    }
  }
  async list(path) {
    try {
      const out = await (await this._call('list', path)).json();
      this.cache.put('list', path, { list: out });
      return out;
    } catch (e) {
      if (e.offline) { const c = await this.cache.get('list', path); if (c) return c.list; throw this._notCached(); }
      throw e;
    }
  }
  async exists(path) {
    try { return (await (await this._call('exists', path)).json()).exists; }
    catch (e) {
      if (!e.offline) throw e;
      if (await this.cache.get('text', path) || await this.cache.get('blob', path)) return true;
      const parent = await this.cache.get('list', dirname(path));
      return !!(parent && parent.list.some(x => x.name === basename(path)));
    }
  }
  async stat(path) {
    try { return await (await this._call('stat', path)).json(); }
    catch (e) {
      if (!e.offline) throw e;
      const c = await this.cache.get('text', path);
      if (c) return { size: c.text.length, mtime: 0 };
      throw this._notCached();
    }
  }
  /* keep the saved folder listings in step with what is added and removed, so a note made on another device (or here) is there when the
     campaign is opened offline */
  async noteSeen(path) {
    let child = basename(path), kind = 'file', dir = dirname(path);
    for (;;) {
      const c = await this.cache.get('list', dir);
      const list = c ? c.list : [];
      if (c && list.some(x => x.name === child)) { if (kind === 'file') break; }
      else await this.cache.put('list', dir, { list: [...list, { name: child, kind }] });
      if (!dir) break;
      child = basename(dir); kind = 'dir'; dir = dirname(dir);
    }
  }
  async noteGone(path) {
    const dir = dirname(path), c = await this.cache.get('list', dir);
    if (c) await this.cache.put('list', dir, { list: c.list.filter(x => x.name !== basename(path)) });
    await this.cache.del('text', path);
    this.versions.delete(path);
  }
  async writeText(path, text) {
    const base = this.versions.has(path) ? this.versions.get(path) : 0;
    const res = await this._call('write', path, { method: 'POST', body: new Blob([text], { type: 'text/plain;charset=utf-8' }) }, '&base=' + base);
    const j = await res.json();
    this.versions.set(path, j.version);
    await this.cache.put('text', path, { version: j.version, text });
    await this.noteSeen(path);
  }
  async moveToTrash(path) {
    await this._call('trash', path, { method: 'POST' }, this.versions.has(path) ? '&base=' + this.versions.get(path) : '');
    await this.noteGone(path);
  }
  async trashRestore(path) { this.versions.delete(trashOriginal(path)); return super.trashRestore(path); }
  /* the server's feed of changes after `since`, and the number to ask from next time. A huge `since` just returns the current number. */
  async changes(since) { return (await this._call('changes', '', {}, '&since=' + encodeURIComponent(since))).json(); }
  async seqNow() { return (await this.changes(Number.MAX_SAFE_INTEGER)).seq; }
  /* Opening a campaign: ask once which version of every note the server has, so only the notes that changed are downloaded.
     A note's text never changes for a given version number, so a saved copy at the current version is exactly right. */
  async beginBulk() {
    try { const j = await (await this._call('snapshot', '')).json(); this.snap = new Map(j.files.map(f => [f.path, f.version])); }
    catch (e) { this.snap = null; }
  }
  endBulk() { this.snap = null; }
  async status() { return (await this._call('status', '')).json(); }
  async hold(hours) { return (await this._call('hold', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours }) })).json(); }
  /* which of these files this device holds a copy of: { texts: Set, blobs: Set } */
  async savedHere() { return { texts: new Set(await this.cache.paths('text')), blobs: new Set(await this.cache.paths('blob')) }; }
  /* download and keep everything in `paths` that is not saved yet (notes as text, everything else as a file), a few at a time */
  async saveForOffline(paths, onProgress) {
    const have = await this.savedHere();
    const todo = paths.filter(p => /\.md$/i.test(p) ? !have.texts.has(p) : !have.blobs.has(p));
    let done = 0, failed = 0;
    await pool(todo, 4, async p => {
      try { if (/\.md$/i.test(p)) await this.readText(p); else await this.readBlob(p); }
      catch (e) { failed++; }
      if (onProgress) onProgress(++done, todo.length);
    });
    return { fetched: todo.length - failed, failed, already: paths.length - todo.length };
  }
  async history(path) { return (await this._call('history', path)).json(); }
  async versionText(path, version) { return (await this._call('version', path, {}, '&v=' + encodeURIComponent(version))).text(); }
  async search(q) { return (await this._call('search', '', {}, '&q=' + encodeURIComponent(q))).json(); }
  /* DMAtlas (the dungeon-map app): the server fetches and checks everything, and stores the pictures; see server/dmforge_atlas.py */
  async atlasStatus() { return (await this._call('atlas-status', '')).json(); }
  async atlasDungeons() { return (await this._call('atlas-dungeons', '')).json(); }
  async atlasDungeon(id) { return (await this._call('atlas-dungeon', '', {}, '&id=' + encodeURIComponent(id))).json(); }
  async atlasImage({ mapId, sha256, dest }) {
    const j = await (await this._call('atlas-image', '', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mapId, sha256, dest }) })).json();
    await this.noteSeen(j.path);
    return j;
  }
  async ping() { return (await this._call('ping', '')).json(); }
  /* the server is updated by replacing its Docker image, not from inside the app */
  async updateInfo() { return { current: '', available: null, downloads: '' }; }
}

function deviceId() {
  try {
    let id = localStorage.getItem('dmforge:device');
    if (!id) { id = Math.random().toString(36).slice(2, 8); localStorage.setItem('dmforge:device', id); }
    return id;
  } catch (e) { return 'unknown'; }
}
