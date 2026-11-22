/* A copy of what the app has read from the server, kept in this browser (IndexedDB), so a campaign can be opened and
   worked on with no connection. Everything here fails soft: if storage is unavailable the app still works online,
   it just cannot open offline.

   Keys are "<server name>|<kind>|<path>". Values: { version, text } for a note, { blob } for an image, { list } for a folder. */
const DB = 'dmforge-offline', STORE = 'files';
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => { const db = r.result; db.onclose = () => { opening = null; }; db.onversionchange = () => { db.close(); opening = null; }; res(db); };
    r.onerror = () => { opening = null; rej(r.error); };
  });
  return opening;
}

function tx(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export class OfflineCache {
  constructor(name) { this.name = name; }
  key(kind, path) { return this.name + '|' + kind + '|' + (path || ''); }
  async get(kind, path) { try { return await tx('readonly', s => s.get(this.key(kind, path))); } catch (e) { return undefined; } }
  async put(kind, path, value) { try { await tx('readwrite', s => s.put(value, this.key(kind, path))); return true; } catch (e) { return false; } }
  async del(kind, path) { try { await tx('readwrite', s => s.delete(this.key(kind, path))); return true; } catch (e) { return false; } }
  /* every cached path of one kind (for working out what is available offline) */
  async paths(kind) {
    const pre = this.name + '|' + kind + '|';
    try {
      return await tx('readonly', s => s.getAllKeys(IDBKeyRange.bound(pre, pre + '￿'))).then(keys => keys.map(k => k.slice(pre.length)));
    } catch (e) { return []; }
  }
}
