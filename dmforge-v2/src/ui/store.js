import { useEffect, useReducer } from 'preact/hooks';
import { Working } from '../core/working.js';
import { buildIndex } from '../core/campaign.js';
import { idbSet } from '../core/idb.js';
import { STARTER_COMBOS } from '../core/genlayout.js';

export const S = {
  screen: 'welcome',      // welcome | browse | loading | mapping | app | inspect
  vault: null, vaultKey: '',
  campaign: null, mapping: {}, folders: [], files: [], working: new Working(),
  tabs: [], activeTab: null,                    // section / selected / editing live on the active tab (see below)
  layout: 'single', paneActive: [null, null, null], activePane: 0,    // panes: which tab each shows, and which pane has the focus
  paneSize: { cols: 0.5, rows: 0.5 },                                // how the panes share the window (fractions)
  recent: [],             // the notes you opened last, newest first (remembered per campaign)
  mtimes: null,           // when each note file was last changed: Map(path -> ms), read when a list is sorted by that
  mapFocus: null,         // a pin to show when a map opens (from a place's page): { image, place, stamp }
  updateAvail: null,      // a newer DM Forge zip is waiting in the Downloads folder: { version, name, current } (helper only)
  islandPin: false, accent: 'gold', sbOpen: false, live: '', undo: null, updating: false, updateLater: '',   // installing it now / the version you chose "Not now" for
  newVersion: '',         // set when the helper has installed a different version than this page is running
  settings: { leaveEdit: 'auto', trackLeftOff: true, autoOpenLast: true, sidebarAuto: false, sidebarDelay: 2000, groupAfter: 20, leftOffKeep: 20, cheatStars: [], hiddenGens: [], recentGens: [], combos: STARTER_COMBOS, inspireStrength: 'strong', neglectAfter: 3, srdOn: true, darkStyle: 'warm' },   // see ui/settings.jsx; remembered in the browser
  leftOff: {},            // per session note: its last changes, newest first ("where you left off")
  job: null,              // a Claude job running in the background (the campaign snapshot): { kind, status: running | ready | failed, label, started, ... }
  cheatOpen: false,       // the DM cheat sheet slide-over
  favs: [],               // the pinned pages and notes at the top of the sidebar: 'sec:<section>' or 'note:<path>' (remembered per campaign in the browser)
  lib: null,              // the Character Library screen (see ui/libraryactions.js)
  logOpen: false,         // the quick session log box
  tour: null,             // the guided tour: { step } while it is running
  diceOpen: false, diceHist: [], diceMode: 'normal',    // the dice roller box, its history, and advantage / disadvantage
  timer: { run: false, t0: 0, acc: 0, every: 60, nextBreak: 60, sceneAcc: 0, open: false, due: false },   // the session timer
  settingsCat: 'appearance', settingsFocus: '',   // the Settings page: which category is showing, and an option to open when it is reached from elsewhere
  jump: null,             // { path, line, stamp }: scroll a note to a line
  claudeOn: false,        // the experimental Claude buttons (helper only), remembered in the browser
  theme: 'auto',          // 'auto' follows the system; 'light' or 'dark' is the user's choice
  menu: null,             // the open right-click menu: { x, y, items }
  dirs: [],               // every folder inside the campaign (empty ones too)
  reformat: null,         // { path, before, changes }: the last reformat, so it can be undone
  loadMsg: '', toasts: [], review: null, dialog: null,
  dataRev: 0, combat: null, combatTarget: null, combatHist: [], encounter: [],
  lastVault: null, mappingBack: 'browse', brave: false, helper: false, pickerBlocked: false,
};

/* Several tabs can be open at once. `section`, `selected` and `editing` read and write
   the active tab, so the rest of the app can keep treating them as plain state. */
let tabSeq = 0;
export function makeTab(patch) { return Object.assign({ id: 't' + (++tabSeq), section: 'overview', selected: null, editing: false, asset: null, pane: 0 }, patch); }
export function activeTabObj() { return S.tabs.find(t => t.id === S.activeTab) || S.tabs[0]; }
export function resetTabs() { const t = makeTab(); S.tabs = [t]; S.activeTab = t.id; S.layout = 'single'; S.paneActive = [t.id, null, null]; S.activePane = 0; }
for (const k of ['section', 'selected', 'editing']) {
  Object.defineProperty(S, k, { get() { return activeTabObj()[k]; }, set(v) { activeTabObj()[k] = v; }, enumerable: true, configurable: true });
}
resetTabs();

const subs = new Set();
export function emit() { subs.forEach(f => f()); }
/* Moving to another section or note can lose what is being typed in an editor, so a guard (installed by the app) gets to
   save it, or ask, first. It returns true when it is holding the move back (it applies it later with setNow). */
let navGuard = null;
export function setNavGuard(fn) { navGuard = fn; }
/* where you have been: each tab keeps a back/forward trail, and the notes you open are kept as a short Recent list */
let replaying = false;
const recentKey = () => 'dmforge:recent:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
export function loadRecent() { try { const v = JSON.parse(localStorage.getItem(recentKey()) || '[]'); S.recent = Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 15) : []; } catch (e) { S.recent = []; } }
export function pushRecent(path) {
  if (!path || !S.campaign) return;
  S.recent = [path, ...S.recent.filter(p => p !== path)].slice(0, 15);
  try { localStorage.setItem(recentKey(), JSON.stringify(S.recent)); } catch (e) { /* storage unavailable */ }
}
function noteNav(before) {
  const t = activeTabObj();
  if (!t || t.id !== before.id || t.asset) return;
  if (t.section === before.section && t.selected === before.selected) return;
  if (!t.hist) { t.hist = [{ section: before.section, selected: before.selected }]; t.hi = 0; }
  t.hist.length = t.hi + 1;
  t.hist.push({ section: t.section, selected: t.selected });
  if (t.hist.length > 60) t.hist.shift();
  t.hi = t.hist.length - 1;
  if (t.selected && t.selected !== before.selected) pushRecent(t.selected);
}
export const canBack = () => { const t = activeTabObj(); return !!(t && t.hist && t.hi > 0); };
export const canForward = () => { const t = activeTabObj(); return !!(t && t.hist && t.hi < t.hist.length - 1); };
export function navStep(d) {
  const t = activeTabObj();
  if (!t || !t.hist) return false;
  const i = t.hi + d;
  if (i < 0 || i >= t.hist.length) return false;
  t.hi = i;
  replaying = true;
  try { set({ section: t.hist[i].section, selected: t.hist[i].selected, editing: false }); } finally { replaying = false; }
  return true;
}
export function setNow(patch) {
  const t0 = activeTabObj();
  const before = t0 ? { id: t0.id, section: t0.section, selected: t0.selected } : null;
  Object.assign(S, patch);
  if (before && !replaying) noteNav(before);
  emit();
}
export function set(patch) {
  if (navGuard && ('section' in patch || 'selected' in patch) && navGuard(patch)) return;
  setNow(patch);
}
/* an open editor registers its unsaved text here: { tabId, path, name, dirty(), save(opts) } */
const drafts = new Map();
export function registerDraft(tabId, d) { if (d) drafts.set(tabId, d); else drafts.delete(tabId); }
export const getDraft = tabId => drafts.get(tabId) || null;
export const dirtyDrafts = () => [...drafts.values()].filter(d => d.dirty());
export function useApp() {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
  return S;
}

let timer = null;
export function pendingKey() { return 'pending|' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : ''); }
export function persistPending() {
  if (!S.campaign) return;
  clearTimeout(timer);
  const key = pendingKey();
  const data = S.working.serialize();
  timer = setTimeout(() => { timer = null; idbSet(key, data); }, 300);
}
/* saves right now what would be saved a moment from now (the page is closing, or a push has just finished) */
export function flushPending() {
  if (!S.campaign || !S.working) return;
  clearTimeout(timer); timer = null;
  idbSet(pendingKey(), S.working.serialize());
}
/* call after any change to notes or mapping */
export function touch() { S.dataRev++; persistPending(); emit(); }

let cache = null, cacheRev = -1, cacheCampaign = null;
export function getIndex() {
  if (!S.campaign) return null;
  if (!cache || cacheRev !== S.dataRev || cacheCampaign !== S.campaign.path) {
    cache = buildIndex({ campaign: S.campaign, mapping: S.mapping, working: S.working, files: S.files });
    cacheRev = S.dataRev; cacheCampaign = S.campaign.path;
  }
  return cache;
}

export function toast(msg, err) {
  const t = { id: Math.random(), msg, err: !!err };
  S.toasts = [...S.toasts, t];
  emit();
  setTimeout(() => { S.toasts = S.toasts.filter(x => x !== t); emit(); }, err ? 5000 : 2800);
}
