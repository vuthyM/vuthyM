/* The Workshop screen: what it shows, the idea being written, and how it is saved.

   Typing never waits for the network: every edit changes the idea in memory and a copy is kept in this browser a moment later (so a crash,
   a closed tab or no connection loses nothing). The server gets the idea on a timer (every 30 seconds by default, a setting), when you
   leave the page, and when the page is hidden. If the server is out of reach the idea stays saved on this device and is sent when it is back.
   If it was changed somewhere else in the meantime, nothing is overwritten: you choose. */
import { S, set, emit, toast } from './store.js';
import { idbGet, idbSet, idbDel, idbKeys } from '../core/idb.js';
import { stem } from '../core/util.js';
import { IDEAS_FOLDER, blankIdea, parseIdea, serializeIdea, listIdeas, ideaPath, freeTitle, newRow, SECTION_BY_ID } from '../core/ideas.js';
import { SPARKS } from '../core/ideaspark.js';

const errMsg = e => (e && e.message) ? e.message : String(e);
export const ideas = () => S.ideas;

/* ---- a tiny bus, so the little "Saved" label can change while you type without redrawing the whole page ---- */
const listeners = new Set();
export const onIdeaStatus = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = () => listeners.forEach(fn => { try { fn(); } catch (e) { /* a listener must not break a save */ } });

const draftKey = path => 'ideadraft|' + S.vaultKey + '|' + path;
const DRAFT_PREFIX = () => 'ideadraft|' + S.vaultKey + '|';
const secs = () => [15, 30, 60].includes(S.settings.ideasSaveSecs) ? S.settings.ideasSaveSecs : 30;

let flushTimer = null, draftTimer = null, retryTimer = null, hooked = false;

/* ---------------------------------------------------------------- opening and closing */
export function openWorkshop(back) {
  if (!S.vault) { toast('Open your vault first.', true); return; }
  S.ideas = { back: back || (S.campaign ? 'app' : 'browse'), list: null, drafts: new Set(), err: '', view: 'shelf', q: '', status: '', naming: false,
    path: '', model: null, rev: 0, savedRev: 0, saving: false, saveState: 'saved', savedAt: 0, text0: '', conflict: null, msg: '', collapsed: loadCollapsed() };
  set({ screen: 'ideas' });
  ideasReload();
  hook();
  retryDrafts();
}

function hook() {
  if (hooked) return;
  hooked = true;
  const hide = () => { const I = S.ideas; if (I && I.model) { saveDraftNow(); if (document.hidden) flushIdea('hide'); } };
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else retryDrafts(); });
  window.addEventListener('pagehide', hide);
  window.addEventListener('online', () => { if (S.ideas) { flushIdea('online'); retryDrafts(); } });
}

export async function ideasReload() {
  const I = S.ideas;
  if (!I) return;
  try {
    I.list = await listIdeas(S.vault);
    I.err = '';
  } catch (e) { I.err = errMsg(e); I.list = I.list || []; }
  try { const pre = DRAFT_PREFIX(); I.drafts = new Set((await idbKeys()).filter(k => typeof k === 'string' && k.startsWith(pre)).map(k => k.slice(pre.length))); } catch (e) { I.drafts = new Set(); }
  emit();
}

export async function closeWorkshop() {
  const I = S.ideas;
  if (I && I.model) await leaveIdea(true);
  const back = I && I.back === 'app' && S.campaign ? 'app' : 'browse';
  set({ screen: back });
}

/* ---------------------------------------------------------------- the shelf */
export function ideasSet(patch) { if (S.ideas) { Object.assign(S.ideas, patch); emit(); } }

export async function createIdea(rawTitle) {
  const I = S.ideas;
  const title = String(rawTitle || '').trim();
  if (!I || !title) { toast('Give the idea a name first.', true); return; }
  try {
    if (!(await S.vault.ensureWrite())) { toast('Write permission for the folder was not granted.', true); return; }
    const t = await freeTitle(S.vault, title);
    const m = blankIdea(t);
    await S.vault.mkdir(IDEAS_FOLDER);
    const text = serializeIdea(m);
    await S.vault.writeText(ideaPath(t), text);
    I.naming = false;
    await openIdea(ideaPath(t));
  } catch (e) { toast('Could not make the idea: ' + errMsg(e), true); }
}

export async function openIdea(path) {
  const I = S.ideas;
  if (!I) return;
  try {
    const text = await S.vault.readText(path);
    let model = parseIdea(text, stem(path));
    I.view = 'page'; I.path = path; I.model = model; I.text0 = text; I.rev = 0; I.savedRev = 0; I.saving = false; I.saveState = 'saved'; I.savedAt = 0; I.conflict = null; I.msg = '';
    // anything this device kept for it that never reached the server (a lost connection, a closed tab)
    const d = await idbGet(draftKey(path));
    if (d && typeof d.text === 'string' && d.text !== text) {
      I.model = parseIdea(d.text, stem(path));
      I.rev = 1;
      if (d.base === text) { I.saveState = 'dirty'; I.msg = 'Brought back your changes from this device; they were not saved to the server yet.'; scheduleFlush(); }
      else {
        const cur = { text, version: S.vault.versions ? S.vault.versions.get(path) : 0 };
        I.saveState = 'conflict'; I.conflict = { current: cur }; I.msg = 'This idea was changed somewhere else after you made the changes kept on this device.';
      }
    } else if (d) idbDel(draftKey(path));
    emit(); notify();
    window.scrollTo({ top: 0 });
  } catch (e) { toast('Could not open that idea: ' + errMsg(e), true); }
}

/* back to the shelf: save now (without making you wait for it) */
export async function leaveIdea(quiet) {
  const I = S.ideas;
  if (!I || !I.model) return;
  saveDraftNow();
  const wait = flushIdea('leave');
  const unsaved = () => I.rev !== I.savedRev;
  await Promise.race([wait, new Promise(r => setTimeout(r, 4000))]);
  if (unsaved()) {
    saveDraftNow();
    if (!quiet) toast('Not saved to the server yet. It is kept on this device and will be sent when the server answers.');
  }
  clearTimeout(flushTimer); flushTimer = null;
  if (!quiet) { I.view = 'shelf'; I.model = null; I.path = ''; I.conflict = null; emit(); ideasReload(); }
  else { I.view = 'shelf'; I.model = null; I.path = ''; }
}
export const backToShelf = () => leaveIdea(false);

/* ---------------------------------------------------------------- editing */
const loadCollapsed = () => { try { return JSON.parse(localStorage.getItem('dmforge:ideas-collapsed') || '{}') || {}; } catch (e) { return {}; } };
export function toggleSection(id) {
  const I = S.ideas; if (!I) return;
  I.collapsed = Object.assign({}, I.collapsed, { [id]: !I.collapsed[id] });
  try { localStorage.setItem('dmforge:ideas-collapsed', JSON.stringify(I.collapsed)); } catch (e) { /* storage unavailable */ }
  emit();
}

/* every change goes through here: it changes the idea, notes that it needs saving, and (when asked) redraws. Typing does not redraw. */
export function ideaEdit(fn, { render = false } = {}) {
  const I = S.ideas;
  if (!I || !I.model) return;
  fn(I.model);
  I.rev++;
  if (I.saveState === 'saved' || I.saveState === 'error') I.saveState = 'dirty';
  if (I.msg && render) I.msg = '';
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 400);
  if (I.saveState !== 'conflict') scheduleFlush();
  notify();
  if (render) emit();
}
export const setField = (key, value) => ideaEdit(m => { m[key] = value; });
export const setSecText = (id, value) => ideaEdit(m => { m.sec[id] = value; });
export const setRowField = (id, row, key, value) => ideaEdit(() => { row[key] = value; });
export const setExtra = (e, key, value) => ideaEdit(() => { e[key] = value; });
export const addRow = (id, init) => ideaEdit(m => { m.sec[id].push(newRow(id, init)); }, { render: true });
export const removeRow = (id, row) => ideaEdit(m => { m.sec[id] = m.sec[id].filter(r => r !== row); }, { render: true });
export function moveRow(id, row, dir) {
  ideaEdit(m => {
    const a = m.sec[id], i = a.indexOf(row), j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return;
    a.splice(i, 1); a.splice(j, 0, row);
  }, { render: true });
}
export const removeExtra = e => ideaEdit(m => { m.extras = m.extras.filter(x => x !== e); }, { render: true });
export const setStatus = id => ideaEdit(m => { m.status = id; }, { render: true });
export const setTags = text => ideaEdit(m => { m._tagsText = text; m.tags = String(text).split(/[,;]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean); });
export function addRows(id, rows) { ideaEdit(m => { for (const r of rows) { const row = newRow(id, r); row._fresh = true; m.sec[id].push(row); } }, { render: true }); }
export function appendText(id, text) {
  ideaEdit(m => { const cur = String(m.sec[id] || '').replace(/\s+$/, ''); m.sec[id] = cur ? cur + '\n\n' + text : text; }, { render: true });
}

/* ---------------------------------------------------------------- saving */
function saveDraftNow() {
  clearTimeout(draftTimer); draftTimer = null;
  const I = S.ideas;
  if (!I || !I.model || !I.path) return;
  if (I.rev === I.savedRev) return;
  idbSet(draftKey(I.path), { text: serializeIdea(I.model), base: I.text0, at: Date.now() });
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; flushIdea('timer'); }, secs() * 1000);
}

/* writes the idea to the vault (renaming the note when the title changed). Resolves when it is done or has failed. */
export async function flushIdea(why) {
  const I = S.ideas;
  if (!I || !I.model || !I.path) return true;
  if (I.rev === I.savedRev && I.saveState !== 'offline' && I.saveState !== 'error') return true;
  if (I.saveState === 'conflict') return false;
  if (I.saving) { I.again = true; return false; }
  I.saving = true; I.saveState = 'saving'; notify();
  const rev = I.rev;
  const model = I.model;
  const text = serializeIdea(model);
  try {
    let target = I.path;
    const want = model.title.trim() ? ideaPath(model.title) : I.path;
    if (want !== I.path && !(await S.vault.exists(want))) target = want;
    if (target !== I.path) await S.vault.mkdir(IDEAS_FOLDER);
    await S.vault.writeText(target, text);
    if (target !== I.path) {
      const old = I.path;
      try { await S.vault.moveToTrash(old); } catch (e) { /* the old copy stays; harmless */ }
      idbDel(draftKey(old));
      I.path = target;
    }
    I.text0 = text; I.savedRev = rev; I.savedAt = Date.now();
    I.saveState = rev === I.rev ? 'saved' : 'dirty';
    I.err = '';
    if (rev === I.rev) idbDel(draftKey(I.path)); else saveDraftNow();
  } catch (e) {
    if (e && e.offline) I.saveState = 'offline';
    else if (e && e.conflict) { I.saveState = 'conflict'; I.conflict = { current: e.current || null }; I.msg = 'This idea was changed somewhere else since you opened it.'; }
    else { I.saveState = 'error'; I.err = errMsg(e); }
    saveDraftNow();
  } finally {
    I.saving = false;
    notify();
    if (I.again || I.saveState === 'dirty' || I.saveState === 'offline' || I.saveState === 'error') { I.again = false; scheduleFlush(); }
    emit();
  }
  return I.saveState === 'saved';
}
export const saveNow = () => { clearTimeout(flushTimer); flushTimer = null; return flushIdea('now'); };

/* what to do when the idea changed on the server (another device, or the Mac) since this one was opened */
export async function resolveIdeaConflict(how) {
  const I = S.ideas;
  if (!I || !I.model || !I.conflict) return;
  const cur = I.conflict.current;
  const v = S.vault;
  try {
    if (how === 'mine') {
      if (v.versions) v.versions.set(I.path, cur ? cur.version : 0);
      I.conflict = null; I.msg = ''; I.saveState = 'dirty'; emit(); await saveNow();
      return;
    }
    if (how === 'both') {
      const mine = I.model;
      const t = await freeTitle(v, (mine.title || stem(I.path)) + ' (my copy)');
      const copy = Object.assign({}, mine, { title: t });
      await v.mkdir(IDEAS_FOLDER);
      await v.writeText(ideaPath(t), serializeIdea(copy));
      toast('Kept your version as “' + t + '”.');
    }
    // 'theirs' (and the second half of 'both'): take what is on the server
    idbDel(draftKey(I.path));
    if (!cur) { I.view = 'shelf'; I.model = null; I.conflict = null; emit(); ideasReload(); return; }
    if (v.versions) v.versions.set(I.path, cur.version);
    I.model = parseIdea(cur.text, stem(I.path)); I.text0 = cur.text; I.rev = 0; I.savedRev = 0; I.saveState = 'saved'; I.conflict = null; I.msg = '';
    emit(); notify();
  } catch (e) { toast('Could not do that: ' + errMsg(e), true); }
}

/* ideas left on this device that never reached the server (you left offline): try again, quietly. A note that moved on meanwhile is left for the
   conflict choice when it is opened. */
export async function retryDrafts() {
  const I = S.ideas;
  if (!I || !S.vault) return;
  clearTimeout(retryTimer); retryTimer = null;
  let keys = [];
  try { const pre = DRAFT_PREFIX(); keys = (await idbKeys()).filter(k => typeof k === 'string' && k.startsWith(pre)); } catch (e) { return; }
  let again = false;
  for (const k of keys) {
    const path = k.slice(DRAFT_PREFIX().length);
    if (S.ideas && S.ideas.model && S.ideas.path === path) continue;
    const d = await idbGet(k);
    if (!d || typeof d.text !== 'string') { idbDel(k); continue; }
    try {
      const cur = await S.vault.readText(path).catch(e => { if (e && e.offline) throw e; return null; });
      if (cur === d.text) { idbDel(k); continue; }
      if (cur !== null && cur !== d.base) continue;           // changed elsewhere: decided when it is opened
      await S.vault.writeText(path, d.text);
      idbDel(k);
    } catch (e) { again = true; }
  }
  if (again && S.ideas) retryTimer = setTimeout(retryDrafts, 60000);
  if (S.ideas && S.ideas.view === 'shelf') ideasReload();
}

/* ---------------------------------------------------------------- the rest of the shelf's actions */
export function askDeleteIdea(path, title) {
  set({ dialog: { kind: 'confirm', title: 'Delete this idea?', body: '“' + title + '” moves to your vault’s trash. You can put it back from Settings, Data, Trash.', confirmLabel: 'Delete', danger: true, onConfirm: async () => {
    try {
      if (S.ideas && S.ideas.path === path) { S.ideas.model = null; S.ideas.view = 'shelf'; }
      await S.vault.moveToTrash(path);
      idbDel(draftKey(path));
      toast('Deleted “' + title + '”.');
      await ideasReload();
    } catch (e) { toast('Could not delete it: ' + errMsg(e), true); }
  } } });
}

export async function duplicateIdea(path) {
  const I = S.ideas;
  try {
    if (I && I.model && I.path === path) await flushIdea('copy');
    const text = await S.vault.readText(path);
    const m = parseIdea(text, stem(path));
    m.title = await freeTitle(S.vault, (m.title || stem(path)) + ' copy');
    m.status = 'spark';
    await S.vault.writeText(ideaPath(m.title), serializeIdea(m));
    toast('Made “' + m.title + '”.');
    await ideasReload();
  } catch (e) { toast('Could not copy it: ' + errMsg(e), true); }
}

export { SECTION_BY_ID };


/* "Roll one": a spark from the generators goes into the section as new rows, or as text added under what is there */
export function rollInto(secId, sparkId) {
  const sp = (SPARKS[secId] || []).find(x => x.id === sparkId);
  if (!sp) return;
  const r = sp.run();
  if (r.rows) addRows(secId, r.rows);
  else if (r.text) appendText(secId, r.text);
  const I = S.ideas;
  if (I) { I.rolled = (I.rolled || 0) + 1; }
}
export function useReadyStatus() { setStatus('ready'); toast('Marked as Ready to run.'); }
