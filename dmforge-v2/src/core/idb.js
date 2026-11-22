/* Tiny key-value store on IndexedDB. Every call fails soft: if storage is
   unavailable the app still works, it just can't remember things. */
const DB = 'dmforge', STORE = 'kv';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); res(req && req.result); };
    tx.onerror = () => { db.close(); rej(tx.error); };
    tx.onabort = () => { db.close(); rej(tx.error); };
  }));
}
export async function idbGet(k) { try { return await run('readonly', s => s.get(k)); } catch (e) { return undefined; } }
export async function idbSet(k, v) { try { await run('readwrite', s => s.put(v, k)); return true; } catch (e) { return false; } }
export async function idbDel(k) { try { await run('readwrite', s => s.delete(k)); return true; } catch (e) { return false; } }
/* every key (used to move settings to another browser) */
export async function idbKeys() { try { return await run('readonly', s => s.getAllKeys()); } catch (e) { return []; } }
