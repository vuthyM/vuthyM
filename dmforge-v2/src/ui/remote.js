/* Living with the V3 server: noticing when it cannot be reached, picking up changes made from another device, and
   registering the service worker that lets the app itself open with no connection.

   Nothing here ever writes to the server and nothing replaces a note you have unpushed changes on: other devices'
   edits are brought in only for notes you have not touched, and the rest are flagged by the push review as always. */
import { S, emit, toast } from './store.js';
import { topFolders } from '../core/campaign.js';

let started = false, beat = null, syncing = false;
const seqKey = () => 'dmforge:seq:' + (S.vault ? S.vault.name : '');
const loadSeq = () => { try { return +localStorage.getItem(seqKey()) || 0; } catch (e) { return 0; } };
const saveSeq = n => { try { localStorage.setItem(seqKey(), String(n)); } catch (e) { /* storage unavailable */ } };

export function startRemote(vault) {
  S.hosted = true;
  S.online = true;
  vault.onStatus = on => {
    S.online = on;
    emit();
    if (on) backOnline(); else startBeat();
  };
  if (started) return;
  started = true;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncRemote(); });
  window.addEventListener('online', () => probe());
  window.addEventListener('offline', () => { if (S.vault && S.vault.hosted) S.vault._setOnline(false); });
  setInterval(() => { if (!document.hidden && S.online) syncRemote(); }, 30000);
  registerWorker();
}

function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* the app still works online without it */ });
}

/* while the server cannot be reached, ask it every few seconds whether it is back */
function startBeat() {
  if (beat) return;
  beat = setInterval(probe, 8000);
}
async function probe() {
  if (!S.vault || !S.vault.hosted) return;
  try { await S.vault.ping(); } catch (e) { /* still offline: the vault keeps the flag */ }
}
function backOnline() {
  if (beat) { clearInterval(beat); beat = null; }
  const n = S.working ? S.working.count : 0;
  toast('Back online.' + (n ? ' ' + n + ' change' + (n === 1 ? '' : 's') + ' saved on this device ' + (n === 1 ? 'is' : 'are') + ' ready to push.' : ''));
  syncRemote();
}

/* call just before a campaign is read: the server's change number from before the reading started, so nothing
   that happens during the reading is missed. Offline, the number from the last time is used. */
export async function remoteBeforeLoad() {
  if (!S.vault || !S.vault.hosted) return;
  let seq = 0;
  try { seq = await S.vault.seqNow(); saveSeq(seq); } catch (e) { seq = loadSeq(); }
  S.remoteSeq = seq;
}

/* bring in notes that changed on the server since last time (another device pushed). Notes with changes of your own
   waiting are left alone: the review before a push shows those. */
export async function syncRemote() {
  const v = S.vault;
  if (!v || !v.hosted || !S.campaign || !S.working || syncing || S.review || S.screen !== 'app') return;
  syncing = true;
  try {
    const r = await v.changes(S.remoteSeq || 0);
    const prefix = S.campaign.path + '/';
    let changed = 0;
    const files = new Set(S.files);
    for (const c of r.changes) {
      const p = c.path;
      if (!p.startsWith(prefix) || !/\.md$/i.test(p)) continue;
      if (S.working.pending.has(p)) continue;
      if (c.action === 'trash') {
        if (S.working.base.has(p)) { S.working.base.delete(p); files.delete(p); changed++; }
        await v.noteGone(p);
      } else {
        const text = await v.readText(p);
        await v.noteSeen(p);
        if (S.working.base.get(p) !== text) { S.working.base.set(p, text); files.add(p); changed++; }
      }
    }
    S.remoteSeq = r.seq;
    saveSeq(r.seq);
    if (changed) {
      S.files = [...files].sort();
      S.folders = topFolders(S.files, S.campaign.path, S.dirs);
      S.dataRev++;
      S.mtimes = null;
      emit();
      toast('Updated ' + changed + ' note' + (changed === 1 ? '' : 's') + ' that changed on another device.');
    }
  } catch (e) { /* offline or signed out: the vault already knows, and the next try will catch up */ }
  finally { syncing = false; }
}
