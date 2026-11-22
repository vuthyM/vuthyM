import { S, set, setNow, setNavGuard, loadRecent, pushRecent, getDraft, dirtyDrafts, touch, flushPending, toast, emit, getIndex, makeTab, resetTabs } from './store.js';
import { FsaVault, MemoryVault, HttpVault, ServerVault, trashOriginal } from '../core/vault.js';
import { startRemote, remoteBeforeLoad } from './remote.js';
import { demoFiles, DEMO_CAMPAIGN, DEMO_VAULT_NAME } from '../core/demo.js';
import { showcaseFiles, SHOWCASE_MAPPING } from '../core/showcase.js';
import { EXAMPLE_FOLDER } from '../core/chardata.js';
import { asExample } from '../core/library.js';
import { loadCampaign, topFolders, newNotePath, topFolderOf, folderFor, suggestSessionNumber, sessionWord } from '../core/campaign.js';
import { detectMapping, OTHER, TYPES, isCustom, customId, typeInfo, typeLabel, fieldDefs, getField, toStored } from '../core/schema.js';
import { Working } from '../core/working.js';
import { idbGet, idbSet, idbKeys } from '../core/idb.js';
import { buildBundle, parseBundle, planImport } from '../core/settingsbundle.js';
import { patchFrontmatter, applyBody, splitFrontmatter, setFrontmatterRaw } from '../core/frontmatter.js';
import { appendToSection, upsertBlock } from '../core/markdown.js';
import { buildNoteText, defaultBody, CAMPAIGN_FOLDERS, campaignIndexText } from '../core/templates.js';
import { buildReview, applyPush, defaultDecisions, visibleItems } from '../core/push.js';
import { basename, dirname, today, sanitizeName, join, uid } from '../core/util.js';
import { reformatBody } from '../core/reformat.js';
import { applyLinkToText, linkText } from '../core/mentions.js';
import { removeLinks, linkFor, addAliasToText, addLinksToText } from '../core/linkedit.js';
import { summaryMarkdown, logMarkdown } from '../core/combat.js';
import { templateById, insertAt, placeTemplate } from '../core/sessiontemplates.js';
import { describeChange, addEntry } from '../core/leftoff.js';
import { SNAPSHOT_NOTE, snapshotNotes, planSnapshot, snapshotPrompt, mergePrompt, cleanSnapshot, SNAPSHOT_SYSTEM, parseSnapshot, compareSnapshot, buildSnapshotNote } from '../core/snapshot.js';
import { setPoolSource } from '../core/generators.js';
import { POOLS_NOTE, TABLES_FOLDER, parsePools, buildPools, buildTable, parseTable } from '../core/pools.js';
import { CUSTOM_NOTE, parseCustom, buildCustom } from '../core/cheatsheet.js';
import { buildLine, appendLogLine, removeLastLogLine, parseLog } from '../core/sessionlog.js';
import { monsterNote, BESTIARY_FOLDERS, combatSpec } from '../core/monsters.js';
import { formNote } from '../core/custommonster.js';
import { withPresence, absentOf } from '../core/party.js';
import { writeField } from '../core/fieldwrite.js';
import { planRename } from '../core/rename.js';
import { secretsFrom, secretLine, setRevealed } from '../core/secrets.js';
import { buildStarter } from '../core/starter.js';
import { lastSessionData, putLastTime, previousSession, FROM_LABEL } from '../core/lastsession.js';
import { TOUR, TOUR_KEY } from '../core/tour.js';
import { FONT_SET_IDS } from '../core/fontsets.js';
import { spotlightStats, removeSpotlightMoment, spotlightLines, namesPlayer } from '../core/spotlight.js';
import { mapNoteFor, mapNoteText, writePins } from '../core/maps.js';
import { readMtimes } from '../core/listview.js';
import { locationTree, canMoveInto } from '../core/locations.js';
import { addToCast, copyName, copyText, rollOne } from '../core/cast.js';
import { moveSection } from '../core/prep40.js';
import { ACCENTS, accentKey } from '../core/accent.js';
import { addEncounter, removeEncounter, parseEncounters, replaceEncounter } from '../core/encounters.js';
import { GENERATORS } from '../core/generators.js';
import { CLOCKS_NOTE, readLists, writeLists, standingLabel } from '../core/clocks.js';
import { rollDice } from '../core/roller.js';
import { parseScenes, finishScene, sceneLine, SCENES_HEADING } from '../core/scenes.js';
import { spellNote, SPELL_FOLDERS } from '../core/spells.js';
import * as CMB from '../core/combat.js';
import { forgetting, addForgettingToPrep, flipTaskLine, NEGLECT_CHOICES } from '../core/forgetting.js';
import * as TD from '../core/tidy.js';
import { CLOSEOUT_SYSTEM, closeoutContext, closeoutPrompt, parseCloseout, plainCloseout, applySessionParts, applyNoteUpdate, updateLine } from '../core/closeout.js';

export const hasFsa = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export function startHelperMode() {
  const info = window.__DMF_SERVER__;
  if (!info) return false;
  set({ helper: true });
  if (info.hosted) {
    const v = new ServerVault({ name: info.name, token: info.token });
    startRemote(v);
    startVault(v);
  } else startVault(new HttpVault({ name: info.name, token: info.token }));
  resumeLastCampaign();
  return true;
}

const errMsg = e => (e && e.message) ? e.message : String(e);

/* ---------- vault ---------- */
export async function loadLastVaultInfo() {
  const h = await idbGet('lastVault');
  if (h && h.name) set({ lastVault: { name: h.name, handle: h } });
}

export function startVault(vault) {
  set({ vault, vaultKey: (vault.kind === 'fsa' ? 'fsa:' : vault.kind === 'http' ? 'http:' : 'mem:') + vault.name, screen: 'browse', campaign: null });
}

export async function pickVault() {
  if (!hasFsa()) { set({ pickerBlocked: true }); return false; }
  try {
    const h = await window.showDirectoryPicker({ id: 'dmforge-vault', mode: 'readwrite' });
    await idbSet('lastVault', h);
    startVault(new FsaVault(h));
    resumeLastCampaign();
    return true;
  } catch (e) {
    if (e && e.name !== 'AbortError') { set({ pickerBlocked: true }); toast('The browser refused to open the folder picker.', true); }
    return false;
  }
}

export async function reopenLastVault() {
  const h = S.lastVault && S.lastVault.handle;
  if (!h) return;
  try {
    let p = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (p !== 'granted' && h.requestPermission) p = await h.requestPermission({ mode: 'readwrite' });
    if (p !== 'granted') { toast('Permission to open the folder was not granted.', true); return; }
    startVault(new FsaVault(h));
    resumeLastCampaign();
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- the campaign you were last in ---------- */
const lastCampaignKey = () => 'dmforge:last-campaign:' + S.vaultKey;
function rememberCampaign(path) {
  if (!S.vault || S.vault.kind === 'memory') return;                       // the demo is never "the last campaign"
  try { localStorage.setItem(lastCampaignKey(), path); } catch (e) { /* storage unavailable */ }
}
const forgetCampaign = () => { try { localStorage.removeItem(lastCampaignKey()); } catch (e) { /* storage unavailable */ } };
/* when a vault is opened (not when you choose Switch campaign), go straight back into the campaign you were last in */
export async function resumeLastCampaign() {
  if (!S.vault || S.vault.kind === 'memory' || S.settings.autoOpenLast === false) return false;
  let path = '';
  try { path = localStorage.getItem(lastCampaignKey()) || ''; } catch (e) { /* storage unavailable */ }
  if (!path) return false;
  const name = basename(path) || S.vault.name;
  set({ screen: 'loading', loadMsg: 'Opening ' + name + '…' });
  try {
    const parts = path.split('/');
    const leaf = parts.pop();
    const there = (await S.vault.list(parts.join('/'))).some(e => e.name === leaf && e.kind === 'dir');
    if (!there) { forgetCampaign(); set({ screen: 'browse' }); return false; }      // moved or renamed: the picker, quietly
  } catch (e) { set({ screen: 'browse' }); return false; }
  await chooseCampaign(path);
  if (S.screen === 'app' || S.screen === 'mapping') toast('Opened ' + name + ', the campaign you were last in. Switch campaign (top of the sidebar) to choose another.');
  return S.screen === 'app' || S.screen === 'mapping';
}

/* the small demo the tests rely on (its notes are deliberately mixed: some with properties, some with inline fields, some with neither) */
export async function openPlainDemo() {
  set({ helper: false });
  startVault(new MemoryVault(demoFiles(), DEMO_VAULT_NAME));
  await chooseCampaign(DEMO_CAMPAIGN);
}

export async function openDemo() {
  set({ helper: false });
  startVault(new MemoryVault(showcaseFiles(), DEMO_VAULT_NAME));
  // a clean start every time: the folders already mapped, nothing left over from the last run, and a fight already lined up
  try { await idbSet('mapping|' + S.vaultKey + '|' + DEMO_CAMPAIGN, SHOWCASE_MAPPING); await idbSet('pending|' + S.vaultKey + '|' + DEMO_CAMPAIGN, []); } catch (e) { /* storage unavailable */ }
  await chooseCampaign(DEMO_CAMPAIGN);
  if (S.screen === 'app') setEncounter([{ key: 'note:Ashfall/Bestiary/Hollow Choir Cultist.md', qty: 3 }, { key: 'note:Ashfall/Bestiary/Chapel Warden.md', qty: 1 }]);
}

/* ---------- campaign ---------- */
/* Creating a campaign writes straight away: it is an explicit, one-off action, and
   there is no campaign yet to hold it as a pending change. */
export async function createCampaign(parent, rawName) {
  const name = sanitizeName(rawName);
  if (!name) { toast('Give the campaign a name first.', true); return; }
  const path = join(parent, name);
  try {
    if (!(await S.vault.ensureWrite())) { toast('Write permission for the folder was not granted.', true); return; }
    if ((await S.vault.exists(path + '/' + name + '.md')) || (await S.vault.list(parent)).some(e => e.name === name)) {
      toast('A folder called “' + name + '” already exists here.', true); return;
    }
    await S.vault.mkdir(path);
    for (const f of CAMPAIGN_FOLDERS) await S.vault.mkdir(join(path, f));
    await S.vault.writeText(join(path, name + '.md'), campaignIndexText(name));
    toast('Created the “' + name + '” campaign folder.');
    await chooseCampaign(path);
  } catch (e) { toast('Could not create the campaign: ' + errMsg(e), true); }
}

const mappingKey = () => 'mapping|' + S.vaultKey + '|' + S.campaign.path;
const combatKey = () => 'dmforge:combat:' + S.vaultKey + '|' + S.campaign.path;

export function loadCombat() {
  try { const v = JSON.parse(localStorage.getItem(combatKey()) || 'null'); return v && Array.isArray(v.combatants) ? v : null; } catch (e) { return null; }
}
/* undo for the fight: every change is remembered (quick changes in a row count as one), up to 50 steps */
let combatLast = null, combatPushed = 0;
export function initCombatHistory() {
  combatLast = S.combat ? JSON.stringify(S.combat) : null;
  S.combatHist = [];
}
export function saveCombat() {
  try {
    if (S.combat) localStorage.setItem(combatKey(), JSON.stringify(S.combat));
    else localStorage.removeItem(combatKey());
  } catch (e) { /* storage unavailable */ }
  const cur = S.combat ? JSON.stringify(S.combat) : null;
  if (cur !== combatLast) {
    if (cur === null) S.combatHist = [];
    else if (combatLast !== null) {
      const now = Date.now();
      if (now - combatPushed > 700 || !S.combatHist.length) { S.combatHist = [...S.combatHist, combatLast].slice(-50); }
      combatPushed = now;
    }
    combatLast = cur;
  }
  emit();
}
export function undoCombat() {
  if (!S.combatHist.length) return false;
  const prev = S.combatHist[S.combatHist.length - 1];
  S.combatHist = S.combatHist.slice(0, -1);
  S.combat = JSON.parse(prev);
  combatLast = prev;
  try { localStorage.setItem(combatKey(), prev); } catch (e) { /* storage unavailable */ }
  emit();
  return true;
}

export async function chooseCampaign(path) {
  set({ screen: 'loading', loadMsg: 'Reading notes…' });
  try {
    await remoteBeforeLoad();
    const loaded = await loadCampaign(S.vault, path, (d, t) => { S.loadMsg = 'Reading notes… ' + d + ' of ' + t; emit(); });
    const campaign = { path, name: basename(path) || S.vault.name };
    const working = new Working();
    working.onChange = trackChange;
    working.loadBase(loaded.texts);
    const folders = topFolders(loaded.files, path, loaded.dirs);
    S.campaign = campaign;
    rememberCampaign(path);
    const saved = await idbGet(mappingKey());
    const detected = detectMapping(folders);
    const mapping = Object.assign({}, detected, saved && typeof saved === 'object' ? saved : {});
    const needMap = !(saved && typeof saved === 'object' && folders.every(f => f in saved));
    const pend = await idbGet('pending|' + S.vaultKey + '|' + path);
    let restored = 0;
    if (Array.isArray(pend) && pend.length) { working.restore(pend); restored = pend.length; }
    S.dataRev++;
    resetTabs();
    loadLeftOff(path);
    loadLayout();
    set({ campaign, files: loaded.files, dirs: loaded.dirs, working, folders, mapping, section: 'overview', selected: null, editing: false, reformat: null, mappingBack: 'browse', screen: needMap ? 'mapping' : 'app', combat: loadCombat() });
    initCombatHistory();
    S.encounter = loadEncounter();
    loadFavs(); loadLive(); loadAccent();
    loadRecent();
    S.mtimes = null;
    S.timer = loadTimer();
    if (S.combat && S.combat.combatants.length) setTimeout(() => toast('Restored the fight in progress: round ' + S.combat.round + ', ' + S.combat.combatants.length + ' in the fight (Combat).'), 400);
    if (restored) toast('Restored ' + restored + ' unpushed change' + (restored === 1 ? '' : 's') + ' from your last session.');
  } catch (e) {
    toast('Could not read that folder: ' + errMsg(e), true);
    set({ screen: 'browse' });
  }
}

export function confirmMapping(mapping) {
  S.mapping = mapping;
  idbSet(mappingKey(), mapping);
  S.dataRev++;
  set({ screen: 'app' });
}

export async function reloadCampaign() {
  const pend = S.working.serialize();
  const path = S.campaign.path;
  set({ screen: 'loading', loadMsg: 'Reloading from the vault…' });
  try {
    await remoteBeforeLoad();
    const loaded = await loadCampaign(S.vault, path, (d, t) => { S.loadMsg = 'Reading notes… ' + d + ' of ' + t; emit(); });
    const working = new Working();
    working.onChange = trackChange;
    working.loadBase(loaded.texts);
    working.restore(pend);
    S.dataRev++;
    set({ files: loaded.files, dirs: loaded.dirs, working, folders: topFolders(loaded.files, path, loaded.dirs), screen: 'app' });
    toast('Reloaded from the vault.');
  } catch (e) { toast('Reload failed: ' + errMsg(e), true); set({ screen: 'app' }); }
}

export function closeCampaign() {
  paintAccent('gold');
  set({ screen: 'browse', campaign: null, selected: null, editing: false, job: null });
}

/* ---------- favourites: pages and notes pinned at the top of the sidebar (they stay in their own category too) ---------- */
const favKey = () => 'dmforge:favs:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
export function loadFavs() {
  try { const v = JSON.parse(localStorage.getItem(favKey()) || '[]'); S.favs = Array.isArray(v) ? [...new Set(v.filter(x => typeof x === 'string' && x.length < 400))].slice(0, 30) : []; } catch (e) { S.favs = []; }
}
function saveFavs() { try { localStorage.setItem(favKey(), JSON.stringify(S.favs)); } catch (e) { /* storage unavailable */ } emit(); }
export const isFav = id => S.favs.includes(id);
export function toggleFav(id) { S.favs = isFav(id) ? S.favs.filter(x => x !== id) : [...S.favs, id].slice(0, 30); saveFavs(); }
/* puts a favourite at a position (pinning it first if it is new) */
export function moveFav(id, index) {
  const rest = S.favs.filter(x => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  S.favs = rest.slice(0, 30);
  saveFavs();
}

/* ---------- navigation ---------- */
export function sectionForType(t) { return t === 'root' || t === 'other' ? 'other' : t; }
/* a tab showing a picture turns back into an ordinary page when you go somewhere from it (a search result, the sidebar) */
function leaveAsset() { const t = S.tabs.find(x => x.id === S.activeTab); if (t && t.asset) t.asset = null; }
export function setSection(id) { leaveAsset(); set({ section: id, selected: null, editing: false, asset: null }); }
export const wantsNewTab = e => !!(e && (e.ctrlKey || e.metaKey || e.button === 1));
export function goto(path, opts) {
  const n = getIndex().byPath.get(path);
  if (!n) return;
  if (opts && opts.newTab) { openTab({ section: sectionForType(n.type), selected: path }); return; }
  leaveAsset();
  set({ section: sectionForType(n.type), selected: path, editing: false });
}
/* click handler helper: ctrl/cmd-click or middle-click opens a note in a new tab */
export function navTo(path, e) { goto(path, { newTab: wantsNewTab(e) }); }

/* ---------- tabs and panes ---------- */
const MAX_TABS = 16;
/* a layout is a set of panes; each pane has its own tabs, like Obsidian. Links open in the pane you clicked in. */
export const LAYOUTS = {
  single: { panes: 1, label: 'Single pane', hint: 'one pane with all your tabs', names: ['Main pane'] },
  two: { panes: 2, label: 'Two columns', hint: 'two panes side by side', names: ['Left pane', 'Right pane'] },
  prep: { panes: 3, label: 'Prep and two panes', hint: 'a big pane for session prep, two stacked on the right', names: ['Prep pane (left)', 'Top right pane', 'Bottom right pane'] },
};
export const paneTabs = p => S.tabs.filter(t => (t.pane | 0) === p);

/* keeps the pane bookkeeping consistent after tabs or the layout change: no tab in a pane that is gone, a tab showing in every
   pane (a new Overview tab if a pane has none), and the active tab following the active pane */
function syncPanes() {
  const n = LAYOUTS[S.layout].panes;
  for (const t of S.tabs.slice()) {
    if ((t.pane | 0) < n) continue;
    // a pane's starter tab that was never used just goes away with the pane; any other tab moves to the last pane
    if (t.auto && !t.pinned && t.section === 'overview' && !t.selected && !t.editing && !t.asset) S.tabs = S.tabs.filter(x => x !== t);
    else t.pane = n - 1;
  }
  for (let p = 0; p < n; p++) {
    let list = paneTabs(p);
    if (!list.length) { const t = makeTab({ pane: p, auto: true }); S.tabs = [...S.tabs, t]; list = [t]; }
    if (!list.some(t => t.id === S.paneActive[p])) S.paneActive[p] = list[0].id;
  }
  for (let p = n; p < 3; p++) S.paneActive[p] = null;
  if (S.activePane >= n) S.activePane = n - 1;
  S.activeTab = S.paneActive[S.activePane];
}
export function openTab(patch = {}, { stay = false } = {}) {
  if (S.tabs.length >= MAX_TABS) { toast('That is a lot of tabs. Close one first.', true); return null; }
  const pane = patch.pane != null ? patch.pane : S.activePane;
  const t = makeTab(Object.assign({}, patch, { pane }));
  if (patch.selected) pushRecent(patch.selected);
  S.tabs = [...S.tabs, t];
  if (!stay) { S.paneActive[pane] = t.id; S.activePane = pane; S.activeTab = t.id; }
  emit();
  return t.id;
}
export function openAssetTab(path) {
  const ex = S.tabs.find(t => t.asset === path);
  if (ex) { activateTab(ex.id); return; }
  openTab({ section: 'asset', asset: path });
}
export function activateTab(id) {
  const t = S.tabs.find(x => x.id === id);
  if (!t) return;
  const p = t.pane | 0;
  if (S.activeTab === id && S.activePane === p && S.paneActive[p] === id) return;
  S.paneActive[p] = id; S.activePane = p; S.activeTab = id;
  emit();
}
export function closeTab(id) {
  const t = S.tabs.find(x => x.id === id);
  if (!t || paneTabs(t.pane | 0).length <= 1) return;           // a pane always keeps one tab
  if (t.pinned) { toast('Unpin this tab to close it.'); return; }
  const d = getDraft(id);
  if (d && d.dirty()) {
    if (S.settings.leaveEdit === 'auto') d.save({ auto: true });
    else { set({ dialog: { kind: 'leaveEdit', name: d.name, draft: d, proceed: () => closeTabNow(id) } }); return; }
  }
  closeTabNow(id);
}
function closeTabNow(id) {
  const t = S.tabs.find(x => x.id === id);
  if (!t) return;
  const p = t.pane | 0, list = paneTabs(p);
  if (list.length <= 1) return;
  const i = list.indexOf(t);
  S.tabs = S.tabs.filter(x => x.id !== id);
  if (S.paneActive[p] === id) S.paneActive[p] = list.filter(x => x !== t)[Math.min(i, list.length - 2)].id;
  syncPanes();
  emit();
}
/* moves a tab to another pane. Its page stays mounted (only its place in the grid changes), so an edit being typed is not lost. */
export function moveTab(id, pane) {
  const t = S.tabs.find(x => x.id === id);
  if (!t || (t.pane | 0) === pane || pane >= LAYOUTS[S.layout].panes) return;
  const from = t.pane | 0;
  t.pane = pane;
  S.paneActive[pane] = id; S.activePane = pane;
  const left = paneTabs(from);
  S.paneActive[from] = left.length ? left[left.length - 1].id : null;
  syncPanes();
  persistLayout(); emit();
}
export function setLayout(name) {
  if (!LAYOUTS[name] || S.layout === name) return;
  S.layout = name;
  syncPanes();
  persistLayout(); emit();
}
/* the share of the window a divider gives: cols = the left pane's width, rows = the top-right pane's height */
export function setPaneSize(key, v) {
  S.paneSize = Object.assign({}, S.paneSize, { [key]: Math.max(0.15, Math.min(0.85, v)) });
  persistLayout(); emit();
}
const layoutKey = () => 'dmforge:layout|' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
function persistLayout() {
  if (!S.campaign) return;
  try { localStorage.setItem(layoutKey(), JSON.stringify({ layout: S.layout, cols: S.paneSize.cols, rows: S.paneSize.rows })); } catch (e) { /* storage unavailable */ }
}
/* the layout you left this campaign in (tabs themselves are not remembered, panes without one get an Overview tab) */
export function loadLayout() {
  try {
    const o = JSON.parse(localStorage.getItem(layoutKey()) || 'null');
    if (!o) return;
    const num = x => (typeof x === 'number' && x > 0.1 && x < 0.9 ? x : 0.5);
    S.paneSize = { cols: num(o.cols), rows: num(o.rows) };
    if (LAYOUTS[o.layout]) { S.layout = o.layout; syncPanes(); }
  } catch (e) { /* defaults */ }
}
/* the Layout button's menu */
export function openLayoutMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  openMenu({ preventDefault() {}, clientX: r.left, clientY: r.bottom + 4 }, [...Object.entries(LAYOUTS).map(([k, l]) => ({
    label: (S.layout === k ? '✓ ' : '\u2003') + l.label, hint: l.hint, onClick: () => setLayout(k),
  })), { sep: true }, { label: '\u2003Table mode', hint: 'session, party and NPCs, ready to play', onClick: () => tableMode() }], 'Layout');
}
/* a tab's right-click menu: move it to another pane, close it */
export function openTabMenu(e, t) {
  const n = LAYOUTS[S.layout].panes, names = LAYOUTS[S.layout].names;
  const items = [{ label: t.pinned ? 'Unpin' : 'Pin', hint: t.pinned ? '' : 'keeps its page', onClick: () => pinTab(t.id) }];
  const moves = [];
  for (let p = 0; p < n; p++) if (p !== (t.pane | 0)) moves.push({ label: 'Move to ' + names[p].toLowerCase(), onClick: () => moveTab(t.id, p) });
  if (moves.length) items.push({ sep: true }, ...moves);
  if (paneTabs(t.pane | 0).length > 1 && !t.pinned) items.push({ sep: true }, { label: 'Close', onClick: () => closeTab(t.id) });
  openMenu(e, items, 'Tab');
}
export function obsidianUrl(path) {
  return 'obsidian://open?vault=' + encodeURIComponent(S.vault.name) + '&file=' + encodeURIComponent(path.replace(/\.md$/i, ''));
}

/* ---------- note changes (all staged, nothing is written until a push) ---------- */
/* sets (or clears) a link property such as a place's Within or an NPC's Location, under the name the note already uses for it
   ("parent", "home", "located in"...), so there is never a second, competing copy */
export function setLinkProperty(path, type, key, targetName) {
  const n = getIndex().byPath.get(path);
  const def = fieldDefs(type).find(f => f.key === key);
  const old = S.working.get(path);
  if (!n || !def || old === undefined) return false;
  const next = writeField(old, def, targetName ? '[[' + targetName + ']]' : '');
  if (next !== old) { S.working.setText(path, next); touch(); }
  return true;
}
/* move a place inside another (or out to the top level with no target); returns false when that would make a loop */
export function movePlace(path, targetName) {
  const idx = getIndex();
  const n = idx.byPath.get(path);
  const target = targetName ? idx.resolve(targetName) : null;
  if (!n || (targetName && (!target || target.type !== 'location'))) return false;
  if (!canMoveInto(locationTree(idx), n, target)) return false;
  return setLinkProperty(path, 'location', 'region', target ? target.name : '');
}
export function saveNoteEdit(path, { fmChanges, rawFm, body }) {
  let text = S.working.get(path);
  if (text === undefined) return;
  if (rawFm !== undefined) text = setFrontmatterRaw(text, rawFm);
  if (fmChanges && Object.keys(fmChanges).length) text = patchFrontmatter(text, fmChanges);
  if (body !== undefined) text = applyBody(text, String(body).replace(/\r\n/g, '\n'));
  S.working.setText(path, text);
  if (S.reformat && S.reformat.path === path) S.reformat = null;
  touch();
}

export function createNote(type, name, { fm = {}, body, sub } = {}) {
  const np = newNotePath(S.campaign, S.mapping, type, name, S.working, sub);
  const title = basename(np.path).replace(/\.md$/i, '');
  const props = Object.assign({ type }, fm);
  if (isCustom(type)) delete props.type;     // a custom category's id is not a property value
  const text = buildNoteText(props, body !== undefined ? body : defaultBody(type, title));
  S.working.create(np.path, text);
  if (np.isNewFolder) { S.mapping = Object.assign({}, S.mapping, { [np.folder]: type }); idbSet(mappingKey(), S.mapping); }
  touch();
  return np.path;
}

export function deleteNote(path) {
  S.working.remove(path);
  for (const t of S.tabs) if (t.selected === path) { t.selected = null; t.editing = false; }
  touch();
}
export function discardChange(path) {
  dropPendingLeftOff(S.working.revert(path));
  if (S.reformat && S.reformat.path === path) S.reformat = null;
  for (const t of S.tabs) if (t.selected && !S.working.has(t.selected)) { t.selected = null; t.editing = false; }
  touch();
}
export function discardAll() { const paths = S.working.list().map(e => e.path); S.working.discardAll(); dropPendingLeftOff(paths); touch(); }

export function nextSessionNumber() {
  return suggestSessionNumber(getIndex().byType.session || []);
}
/* "Session", "Episode"...: what you chose last time in this campaign, else what the folder and notes use */
const wordKey = () => 'dmforge:session-word:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
export function sessionPrefix() {
  try { const v = localStorage.getItem(wordKey()); if (v) return v; } catch (e) { /* storage unavailable */ }
  return sessionWord(getIndex().byType.session || [], folderFor('session', S.mapping));
}
export function createSession({ title, date, number, word }) {
  // the date lives in the note's properties (it still sorts the list), not in the title or file name
  const w = sanitizeName(word) || 'Session';
  try { localStorage.setItem(wordKey(), w); } catch (e) { /* storage unavailable */ }
  const name = w + ' ' + number + (title ? ' - ' + title : '');
  const heading = w + ' ' + number + (title ? ': ' + title : '');
  const path = createNote('session', name, { fm: { number: Number(number), date }, body: '# ' + heading + '\n\n## Prep\n\n## Recap\n' });
  setCurrentSession(path);          // the new session is where the log box and the pinned entry in the sidebar point
  return path;
}

export function appendToPrep(sessionPath, md) {
  const text = S.working.get(sessionPath);
  if (text === undefined) return false;
  const sp = splitFrontmatter(text);
  S.working.setText(sessionPath, sp.prefix + appendToSection(sp.body, 'Prep', md));
  touch();
  return true;
}

export function logCombatToSession(sessionPath) {
  const text = S.working.get(sessionPath);
  if (text === undefined || !S.combat) return false;
  const sp = splitFrontmatter(text);
  const log = logMarkdown(S.combat, today());
  const md = summaryMarkdown(S.combat, today()) + (log ? '\n\n' + log : '');
  S.working.setText(sessionPath, sp.prefix + upsertBlock(sp.body, 'combat-' + S.combat.id, md, { heading: 'Combat' }));
  touch();
  return true;
}

/* ---------- push ---------- */
export async function startPush() {
  if (!S.working.count) return;
  if (S.hosted && S.vault.ping) {
    try { await S.vault.ping(); }
    catch (e) { toast(S.working.count + ' change' + (S.working.count === 1 ? ' is' : 's are') + ' saved on this device. ' + (e && e.auth ? errMsg(e) : 'The server cannot be reached right now: push once it is back (this page checks for you).'), true); return; }
  }
  try {
    const ok = await S.vault.ensureWrite();
    if (!ok) { toast('Write permission for the folder was not granted.', true); return; }
    const items = await buildReview(S.vault, S.working);
    set({ review: { items, decisions: defaultDecisions(items), results: null, busy: false } });
  } catch (e) { toast('Could not prepare the push: ' + errMsg(e), true); }
}
export function setDecision(path, d) {
  S.review.decisions = Object.assign({}, S.review.decisions, { [path]: d });
  emit();
}
/* resolve every conflict the same way: 'mine' keeps my version, 'vault' keeps what is on disk */
export function resolveAll(how) {
  const d = Object.assign({}, S.review.decisions);
  for (const it of visibleItems(S.review.items)) {
    if (!it.conflict) continue;
    if (how === 'mine') d[it.path] = it.conflict === 'exists' ? 'rename' : 'mine';
    else d[it.path] = it.conflict === 'changed' || it.conflict === 'missing' ? 'disk' : 'skip';
  }
  S.review = Object.assign({}, S.review, { decisions: d });
  emit();
}
export function discardFromReview(path) {
  const gone = new Set(S.working.revert(path));
  dropPendingLeftOff([...gone]);
  touch();
  const items = S.review.items.filter(x => !gone.has(x.path));
  if (!visibleItems(items).length) { closeReview(); return; }
  set({ review: Object.assign({}, S.review, { items }) });
}
export async function runPush() {
  const r = S.review;
  set({ review: Object.assign({}, r, { busy: true }) });
  const v = S.vault;
  const pid = v && v.beginPush ? 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : '';
  if (pid) v.beginPush(pid);
  try {
    const results = await applyPush(S.vault, S.working, r.items, r.decisions);
    settleLeftOff(results.filter(x => x.status === 'written').map(x => x.path));
    dropPendingLeftOff(results.filter(x => x.status === 'kept-disk').map(x => x.path));
    S.dataRev++;
    persistAfterPush();
    set({ review: Object.assign({}, S.review, { results, busy: false }) });
  } catch (e) {
    toast('Push failed: ' + errMsg(e), true);
    set({ review: Object.assign({}, S.review, { busy: false }) });
  } finally {
    if (pid) { v.endPush(); refreshUndo(); }
  }
}
function persistAfterPush() { touch(); flushPending(); }
export function closeReview() { set({ review: null }); }

/* ---------- categories (a category is a top-level folder of the campaign) ---------- */
export function getCategories() {
  const idx = getIndex();
  const out = [];
  for (const [folder, type] of Object.entries(S.mapping)) {
    if (type === OTHER || !typeInfo(type)) continue;
    out.push({ folder, type, label: typeLabel(type), count: idx.notes.filter(n => n.top === folder).length, custom: isCustom(type) });
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder));
}

function saveMapping(mapping) {
  S.mapping = mapping;
  idbSet(mappingKey(), mapping);
}

/* kind: 'plain' for a category of ordinary notes, or one of the built-in type ids */
export function addCategory(rawName, kind) {
  const folder = sanitizeName(rawName);
  if (!folder) { toast('Give the category a name first.', true); return null; }
  if (/^\./.test(folder)) { toast('A category name cannot start with a dot.', true); return null; }
  const existing = S.mapping[folder];
  if (existing && existing !== OTHER) { toast('There is already a category called “' + folder + '”.', true); return null; }
  if (Object.keys(S.mapping).some(k => k.toLowerCase() === folder.toLowerCase() && k !== folder && S.mapping[k] !== OTHER)) { toast('A category with that name already exists.', true); return null; }
  const type = kind === 'plain' || !kind ? customId(folder) : kind;
  saveMapping(Object.assign({}, S.mapping, { [folder]: type }));
  if (!S.folders.includes(folder)) S.folders = [...S.folders, folder].sort((a, b) => a.localeCompare(b));
  touch();
  toast('Added the “' + folder + '” category. Its folder is created in your vault when you push the first note in it.');
  setSection(type);
  return type;
}

/* mode 'move': send the notes to the category `dest` (a type id); 'delete': stage them for deletion */
export function deleteCategory(folder, { mode, dest } = {}) {
  const idx = getIndex();
  const type = S.mapping[folder];
  const notes = idx.notes.filter(n => n.top === folder);
  if (notes.length && mode === 'move') for (const n of notes) moveNote(n.path, dest, { quiet: true });
  else if (notes.length && mode === 'delete') for (const n of notes) S.working.remove(n.path);
  // the folder stays mapped as "Other notes" so reloading does not ask about it again
  saveMapping(Object.assign({}, S.mapping, { [folder]: OTHER }));
  for (const t of S.tabs) if (t.section === type) { t.section = 'overview'; t.selected = null; t.editing = false; }
  touch();
  toast('Removed the “' + folder + '” category' + (notes.length ? (mode === 'move' ? ' and moved its notes.' : ' and staged its notes for deletion.') : '.'));
}

/* ---------- moving notes between categories ---------- */
function uniqueIn(dir, fileName) {
  const m = fileName.match(/^(.*?)(\.[^.]+)?$/);
  let p = join(dir, fileName);
  for (let i = 2; S.working.has(p) && i < 300; i++) p = join(dir, m[1] + ' ' + i + (m[2] || ''));
  return p;
}

export function moveNote(path, destType, { quiet = false } = {}) {
  const text = S.working.get(path);
  const n = getIndex().byPath.get(path);
  if (text === undefined || !n) return null;
  const folder = folderFor(destType, S.mapping);
  if (!folder) { toast('That category has no folder.', true); return null; }
  if (n.top === folder) { if (!quiet) toast('It is already in that category.'); return path; }
  const np = uniqueIn(join(S.campaign.path, folder), basename(path));
  let next = text;
  const sp = splitFrontmatter(text);
  const tkey = Object.keys(sp.fm).find(k => k.toLowerCase() === 'type');
  if (tkey) {
    const v = String(sp.fm[tkey]).trim().toLowerCase();
    const old = TYPES[n.type];
    if (old && (v === n.type || v === old.single.toLowerCase() || v === old.label.toLowerCase())) {
      next = patchFrontmatter(text, { [tkey]: isCustom(destType) ? undefined : destType });
    }
  }
  if (!(folder in S.mapping) || S.mapping[folder] === OTHER) saveMapping(Object.assign({}, S.mapping, { [folder]: destType }));
  S.working.move(path, np, next);
  for (const t of S.tabs) if (t.selected === path) { t.selected = np; t.editing = false; if (t === S.tabs.find(x => x.id === S.activeTab)) t.section = sectionForType(destType); }
  touch();
  if (!quiet) toast('Moved to ' + typeLabel(destType) + '. Push changes to move the file in your vault.');
  return np;
}

/* ---------- graph ---------- */
export function openGraph(focusPath) {
  const ex = S.tabs.find(t => t.section === 'graph');
  if (ex) { ex.graphFocus = focusPath || null; ex.graphStamp = (ex.graphStamp || 0) + 1; S.activeTab = ex.id; emit(); return; }
  openTab({ section: 'graph', graphFocus: focusPath || null, graphStamp: focusPath ? 1 : 0 });
}

/* ---------- link suggestions ---------- */
const declinedKey = () => 'dmforge:declined-links:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
/* a declined suggestion is remembered as "note that would be edited|note it would link to" */
export function declinedLinks() {
  try { const v = JSON.parse(localStorage.getItem(declinedKey()) || 'null'); return v && Array.isArray(v.keys) ? v.keys : []; } catch (e) { return []; }
}
export function declineLink(sug) {
  try { localStorage.setItem(declinedKey(), JSON.stringify({ keys: [...new Set([...declinedLinks(), sug.path + '|' + sug.target])] })); } catch (e) { /* storage unavailable: it just comes back */ }
  emit();
}
/* turns each approved mention into a [[link]] in its own note; staged like any other edit */
export function approveLinks(list) {
  let done = 0;
  const notes = new Set();
  for (const sug of list) {
    const text = S.working.get(sug.path);
    if (text === undefined) continue;
    const r = applyLinkToText(text, sug.matched, sug.link);
    if (!r.changed) continue;
    S.working.setText(sug.path, r.text);
    if (S.reformat && S.reformat.path === sug.path) S.reformat = null;
    done++; notes.add(sug.path);
  }
  if (done) { touch(); toast('Added ' + done + ' link' + (done === 1 ? '' : 's') + ' in ' + notes.size + ' note' + (notes.size === 1 ? '' : 's') + '. Push changes to save ' + (notes.size === 1 ? 'it' : 'them') + ' to your vault.'); }
  else toast('That text has changed, so there was nothing to link.', true);
}

/* ---------- session templates ---------- */
/* adds a blank layout to a session note, in the right place (see placeTemplate), staged like any edit, and scrolls to it */
export function addTemplate(path, id) {
  const tpl = templateById(id);
  const text = S.working.get(path);
  if (!tpl || text === undefined) return false;
  const body = splitFrontmatter(text).body.replace(/\r\n/g, '\n');
  const r = placeTemplate(body, id, tpl.body);
  saveNoteEdit(path, { body: r.text });
  toast('Added the “' + tpl.name + '” template ' + r.where + '. Push changes to save it.');
  jumpToLine(path, r.line, { open: false });      // show it, but leave a folded card folded
  return true;
}

/* ---------- reformat ---------- */
export function reformatNote(path) {
  const text = S.working.get(path);
  if (text === undefined) return false;
  const sp = splitFrontmatter(text);
  const r = reformatBody(sp.body);
  if (!r.changes.length) { toast('This note is already tidy. Nothing to change.'); return false; }
  const next = applyBody(text, r.body);
  if (next === text) { toast('This note is already tidy. Nothing to change.'); return false; }
  S.working.setText(path, next);
  S.reformat = { path, before: text, changes: r.changes };
  touch();
  return true;
}
export function undoReformat() {
  const r = S.reformat;
  if (!r) return;
  S.working.setText(r.path, r.before);
  S.reformat = null;
  touch();
}
export function dismissReformat() { S.reformat = null; emit(); }

/* ---------- right-click menu ---------- */
export function openMenu(e, items, title) {
  e.preventDefault();
  S.menu = { x: e.clientX, y: e.clientY, items, title: title || '' };
  emit();
}
export function closeMenu() { if (S.menu) { S.menu = null; emit(); } }

/* ---------- turning words into links and pages ---------- */
/* kinds of page the menu offers: the usual ones, plus the campaign's own categories */
export function pageKinds() {
  const out = [];
  const seen = new Set();
  const add = (type, folder) => { if (!seen.has(type) && typeInfo(type)) { seen.add(type); out.push({ type, folder, label: typeInfo(type).single, plural: typeInfo(type).label }); } };
  for (const t of ['npc', 'player', 'location', 'faction', 'plot', 'item']) add(t, folderFor(t, S.mapping));
  for (const [folder, type] of Object.entries(S.mapping)) if (isCustom(type)) add(type, folder);
  return out;
}
/* folders inside a category's folder, e.g. "Villains" inside NPCs */
export function subfoldersOf(folder) {
  if (!S.campaign) return [];
  const base = join(S.campaign.path, folder) + '/';
  const names = new Set();
  const note = p => { if (p.startsWith(base)) { const parts = p.slice(base.length).split('/'); if (parts.length > 1 && parts[0]) names.add(parts[0]); } };
  for (const d of S.dirs || []) if (d.startsWith(base)) { const parts = d.slice(base.length).split('/'); if (parts[0]) names.add(parts[0]); }
  S.files.forEach(note); S.working.paths().forEach(note);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/* puts `link` where the selected words were, in the note at `path` (the nth plain occurrence) */
export function replaceInNote(path, selected, nth, link) {
  const text = S.working.get(path);
  if (text === undefined) return false;
  const r = applyLinkToText(text, selected, link, nth || 0);
  if (!r.changed) { toast('Could not find “' + selected + '” in the note’s text to link it. It may be inside a heading, code or an existing link.', true); return false; }
  S.working.setText(path, r.text);
  if (S.reformat && S.reformat.path === path) S.reformat = null;
  touch();
  return true;
}

/* Creates a page from selected words and links the words to it. `replace(link)` puts the link in the
   place the words were (view or editor); pass null to only create the page. */
export function turnIntoPage({ selected, type, sub, name, replace, open }) {
  const idx = getIndex();
  const nm = sanitizeName(name || selected);
  if (!nm) { toast('Give the page a name first.', true); return null; }
  const taken = (idx.byName.get(nm.toLowerCase()) || []).length > 0;
  const path = createNote(type, nm, { sub });
  const title = basename(path).replace(/\.md$/i, '');
  if (replace) replace(linkFor(title, selected, taken ? path.replace(/\.md$/i, '') : ''));
  const where = path.slice(S.campaign.path.length + 1);
  toast('Created “' + title + '” in ' + dirname(where).replace(/\//g, ' / ') + '. Push changes to write it to your vault.');
  if (open) goto(path);
  return path;
}

/* links selected words to a note that exists, optionally remembering the words as another name for it */
export function linkToExisting({ selected, targetPath, replace, alias }) {
  const idx = getIndex();
  const target = idx.byPath.get(targetPath);
  if (!target) return false;
  if (replace) replace(linkText(selected, target, idx));
  if (alias && selected.toLowerCase() !== target.name.toLowerCase()) {
    const text = S.working.get(targetPath);
    if (text !== undefined) { S.working.setText(targetPath, addAliasToText(text, selected)); touch(); }
  }
  toast(alias ? 'Linked, and “' + selected + '” is now another name for ' + target.name + '.' : 'Linked to ' + target.name + '.');
  return true;
}

/* Links a note to other notes by choice, whether or not either mentions the other. They are listed under a
   heading (default "Related"); `back` adds the matching link in each of the other notes. */
export function addLinks(path, targetPaths, { heading = 'Related', back = false } = {}) {
  const idx = getIndex();
  const here = idx.byPath.get(path);
  const text = S.working.get(path);
  const targets = targetPaths.map(p => idx.byPath.get(p)).filter(Boolean);
  if (!here || text === undefined || !targets.length) return 0;
  const r = addLinksToText(text, targets, idx, heading);
  let backCount = 0;
  if (r.added.length) S.working.setText(path, r.text);
  if (S.reformat && S.reformat.path === path) S.reformat = null;
  if (back) {
    for (const t of targets) {
      const tt = S.working.get(t.path);
      if (tt === undefined) continue;
      const b = addLinksToText(tt, [here], idx, heading);
      if (b.added.length) { S.working.setText(t.path, b.text); backCount++; }
    }
  }
  if (!r.added.length && !backCount) { toast('Already linked, so nothing was added.', true); return 0; }
  touch();
  const n = r.added.length;
  toast((n ? 'Linked to ' + (n === 1 ? r.added[0] : n + ' notes') + (heading ? ' under “' + heading + '”' : '') : 'Nothing new here') + (r.already.length ? ' (' + r.already.length + ' already linked)' : '') + (backCount ? '; added a link back in ' + backCount + ' note' + (backCount === 1 ? '' : 's') : '') + '. Push changes to save.');
  return n + backCount;
}

/* takes links out of a note, keeping the words they showed */
export function unlinkInNote(path, which) {
  const text = S.working.get(path);
  if (text === undefined) return 0;
  const r = removeLinks(text, getIndex(), which);
  if (!r.changed) { toast('No link to remove there (embeds and links in properties are left alone).', true); return 0; }
  S.working.setText(path, r.text);
  if (S.reformat && S.reformat.path === path) S.reformat = null;
  touch();
  toast('Removed ' + r.count + ' link' + (r.count === 1 ? '' : 's') + '. The words stay. Push changes to save it.');
  return r.count;
}

/* ---------- light and dark ---------- */
const THEME_KEY = 'dmforge:theme';
const root = () => document.documentElement;
export function systemDark() { try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; } }
export const effectiveTheme = () => (S.theme === 'auto' ? (systemDark() ? 'dark' : 'light') : S.theme);
function paintTheme() {
  if (S.theme === 'auto') root().removeAttribute('data-theme'); else root().setAttribute('data-theme', S.theme);
  if (window.__dmfGraph && window.__dmfGraph.requestDraw) window.__dmfGraph.requestDraw();
}
export function initTheme() {
  try { const t = localStorage.getItem(THEME_KEY); S.theme = t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { S.theme = 'auto'; }
  paintTheme();
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'auto') { paintTheme(); emit(); } }); } catch (e) { /* old browser */ }
}
/* The colours fade over THEME_MS. The fading itself is plain CSS (registered colour variables on the root, see
   styles.css), so the page stays live and nothing is snapshotted. The only thing to do here is keep the graph
   canvas repainting while it runs, because it reads its colours from those variables. */
const THEME_MS = 3000;
let fadeUntil = 0;
function followFade() {
  const g = window.__dmfGraph;
  if (!g || !g.requestDraw) return;
  const wasRunning = fadeUntil > performance.now();
  fadeUntil = performance.now() + THEME_MS + 100;
  if (wasRunning) return;
  const tick = () => { g.requestDraw(); if (performance.now() < fadeUntil) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
export function setTheme(next) {
  if (next === S.theme) return;
  S.theme = next;
  try { if (next === 'auto') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable */ }
  paintTheme(); emit(); followFade();
}
/* click: switch between light and dark. Shift-click: go back to following the system. */
export function toggleTheme(e) {
  if (e && e.shiftKey) { setTheme('auto'); return; }
  setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

/* ---------- Claude (experimental) ---------- */
const CLAUDE_KEY = 'dmforge:claude';
export function initClaude() { try { S.claudeOn = localStorage.getItem(CLAUDE_KEY) === 'on'; } catch (e) { S.claudeOn = false; } }
export const claudeOn = () => !!(S.helper && S.claudeOn);
export function setClaudeOn(on) {
  S.claudeOn = !!on;
  try { if (on) localStorage.setItem(CLAUDE_KEY, 'on'); else localStorage.removeItem(CLAUDE_KEY); } catch (e) { /* storage unavailable */ }
  emit();
}
export function askClaude(d) { set({ dialog: Object.assign({ kind: 'claude' }, d) }); }

/* ---------- moving settings to another browser (or to the server) ---------- */
export async function exportSettings() {
  const local = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('dmforge:')) local[k] = localStorage.getItem(k); } } catch (e) { /* storage unavailable */ }
  const idb = {};
  for (const k of await idbKeys()) if (typeof k === 'string' && k.startsWith('mapping|')) idb[k] = await idbGet(k);
  const b = buildBundle({ local, idb, vaultKey: S.vaultKey, version: __DMF_VERSION__ });
  const n = Object.keys(b.local).length + Object.keys(b.idb).length;
  const blob = new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dmforge-settings-' + today() + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Saved ' + n + ' settings to ' + a.download + '. Open DM Forge where you want them and use “Bring my settings in”.');
}
export async function askImportSettings(file) {
  if (!file) return;
  let parsed;
  try { parsed = parseBundle(await file.text()); } catch (e) { toast('Could not read that file.', true); return; }
  if (parsed.error) { toast(parsed.error, true); return; }
  const b = parsed.bundle;
  const n = Object.keys(b.local).length + Object.keys(b.idb || {}).length;
  set({ dialog: { kind: 'confirm', title: 'Bring in ' + n + ' settings?', confirmLabel: 'Bring them in and reload',
    body: 'This replaces the settings on this device with the ones in the file (theme, fonts, layout, favourites, list views, where you left off). Your notes and any unpushed changes are not touched. DM Forge reloads when it is done.',
    onConfirm: () => applyImportedSettings(b) } });
}
async function applyImportedSettings(b) {
  const plan = planImport(b, S.vaultKey);
  try { for (const [k, v] of Object.entries(plan.local)) localStorage.setItem(k, v); } catch (e) { toast('This browser would not store the settings.', true); return; }
  for (const [k, v] of Object.entries(plan.idb)) await idbSet(k, v);
  flushPending();
  location.reload();
}

/* ---------- settings ---------- */
const SETTINGS_KEY = 'dmforge:settings';
function cleanSettings(o) {
  const out = {};
  if (o && (o.leaveEdit === 'auto' || o.leaveEdit === 'ask')) out.leaveEdit = o.leaveEdit;
  if (o && typeof o.trackLeftOff === 'boolean') out.trackLeftOff = o.trackLeftOff;
  if (o && typeof o.autoOpenLast === 'boolean') out.autoOpenLast = o.autoOpenLast;
  if (o && typeof o.sidebarAuto === 'boolean') out.sidebarAuto = o.sidebarAuto;
  if (o && Number.isFinite(o.sidebarDelay) && o.sidebarDelay >= 0 && o.sidebarDelay <= 10000) out.sidebarDelay = Math.round(o.sidebarDelay);
  if (o && [0, 10, 20, 50, 9999].includes(o.groupAfter)) out.groupAfter = o.groupAfter;
  if (o && [10, 20, 50].includes(o.leftOffKeep)) out.leftOffKeep = o.leftOffKeep;
  if (o && Array.isArray(o.cheatStars)) out.cheatStars = o.cheatStars.filter(x => typeof x === 'string').slice(0, 200);
  if (o && Array.isArray(o.hiddenGens)) out.hiddenGens = [...new Set(o.hiddenGens.filter(x => typeof x === 'string' && x.length < 40))].slice(0, 100);
  if (o && Array.isArray(o.combos)) {
    const seen = new Set();
    out.combos = o.combos.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.picks) && c.name.trim() && !seen.has(c.id) && seen.add(c.id)).slice(0, 20)
      .map(c => ({ id: c.id.slice(0, 40), name: c.name.trim().slice(0, 40), picks: c.picks.filter(p => p && typeof p.id === 'string').slice(0, 8).map(p => ({ id: p.id.slice(0, 40), qty: Math.max(1, Math.min(8, Math.floor(+p.qty || 1))) })) }))
      .filter(c => c.picks.length);
  }
  if (o && ['light', 'strong', 'max'].includes(o.inspireStrength)) out.inspireStrength = o.inspireStrength;
  if (o && NEGLECT_CHOICES.includes(o.neglectAfter)) out.neglectAfter = o.neglectAfter;
  if (o && typeof o.srdOn === 'boolean') out.srdOn = o.srdOn;
  if (o && (o.darkStyle === 'warm' || o.darkStyle === 'slate')) out.darkStyle = o.darkStyle;
  if (o && FONT_SET_IDS.includes(o.fontSet)) out.fontSet = o.fontSet;
  if (o && Array.isArray(o.recentGens)) out.recentGens = [...new Set(o.recentGens.filter(x => typeof x === 'string' && x.length < 40))].slice(0, 6);
  return out;
}
/* which typeface set the page uses (the fonts and their CSS variables are in fonts.css and styles.css); Today needs no attribute */
function paintFontSet() { try { const id = S.settings.fontSet; if (!id || id === 'today') document.documentElement.removeAttribute('data-type'); else document.documentElement.setAttribute('data-type', id); } catch (e) { /* no document */ } }
/* which dark style the page uses (the colours themselves are in styles.css) */
function paintDarkStyle() { try { document.documentElement.setAttribute('data-dark', S.settings.darkStyle === 'slate' ? 'slate' : 'warm'); } catch (e) { /* no document */ } if (window.__dmfGraph && window.__dmfGraph.requestDraw) window.__dmfGraph.requestDraw(); }
export function initSettings() {
  try { S.settings = Object.assign({}, S.settings, cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'))); } catch (e) { /* defaults */ }
  paintDarkStyle(); paintFontSet();
  setPoolSource(key => { const p = poolsMap()[key]; return p ? p.rows : null; });
  setNavGuard(leaveGuard);
}
/* the Settings page: open it (or a category of it, and optionally one option inside), in a new tab on ctrl/cmd-click */
export function setSettingsCat(cat) { set({ settingsCat: cat, settingsFocus: '' }); }
export function openSettings(cat, focus, e) {
  const patch = { settingsFocus: focus || '' };
  if (cat) patch.settingsCat = cat;
  set(patch);
  if (wantsNewTab(e)) openTab({ section: 'settings' }); else setSection('settings');
}
export function updateSetting(key, value) {
  S.settings = Object.assign({}, S.settings, cleanSettings({ [key]: value }));
  paintDarkStyle(); paintFontSet();
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(S.settings)); } catch (e) { /* storage unavailable */ }
  emit();
}

/* ---------- leaving an editor with unsaved text ---------- */
/* Called before the section or note of the active tab changes. Either saves what is being typed (the default), or asks. */
function leaveGuard(patch) {
  const tab = S.tabs.find(t => t.id === S.activeTab);
  if (!tab) return false;
  const moves = ('section' in patch && patch.section !== tab.section) || ('selected' in patch && patch.selected !== tab.selected);
  if (!moves) return false;
  if (tab.pinned) return openBesidePinned(tab, patch);
  if (!tab.editing) return false;
  const d = getDraft(tab.id);
  if (!d || !d.dirty()) return false;
  if (S.settings.leaveEdit === 'auto') { d.save({ auto: true }); return false; }
  set({ dialog: { kind: 'leaveEdit', name: d.name, draft: d, proceed: () => setNow(patch) } });
  return true;
}
/* A pinned tab keeps its page. Whatever would have changed it (a link, the sidebar, search, picking from a list) opens a new tab
   in the same pane instead, and the pinned one stays as it was. */
function openBesidePinned(tab, patch) {
  const sectionChanged = 'section' in patch && patch.section !== tab.section;
  const next = {
    section: 'section' in patch ? patch.section : tab.section,
    selected: 'selected' in patch ? patch.selected : (sectionChanged ? null : tab.selected),
    asset: 'asset' in patch ? patch.asset : (sectionChanged ? null : tab.asset),
    editing: false,
  };
  const rest = Object.assign({}, patch);
  for (const k of ['section', 'selected', 'editing', 'asset']) delete rest[k];
  if (!openTab(next)) return true;               // too many tabs (it says so): leave everything as it is
  if (Object.keys(rest).length) setNow(rest);
  return true;
}
export function pinTab(id, on) {
  const t = S.tabs.find(x => x.id === id);
  if (!t) return;
  t.pinned = on === undefined ? !t.pinned : !!on;
  emit();
}
/* saves every open editor (used when the page is being closed) */
export function flushDrafts() { for (const d of dirtyDrafts()) { try { d.save({ auto: true, quiet: true }); } catch (e) { /* ignore */ } } }
export function discardDraft(d) { const t = S.tabs.find(x => x.id === d.tabId); if (t) t.editing = false; }

/* ---------- where you left off in a session ---------- */
const leftOffKey = campaignPath => 'dmforge:leftoff|' + S.vaultKey + '|' + campaignPath;
export function loadLeftOff(campaignPath) {
  try { S.leftOff = JSON.parse(localStorage.getItem(leftOffKey(campaignPath)) || '{}') || {}; } catch (e) { S.leftOff = {}; }
}
function saveLeftOff() {
  if (!S.campaign) return;
  try {
    const paths = Object.keys(S.leftOff);
    if (paths.length > 300) for (const p of paths.slice(0, paths.length - 300)) delete S.leftOff[p];
    localStorage.setItem(leftOffKey(S.campaign.path), JSON.stringify(S.leftOff));
  } catch (e) { /* storage unavailable */ }
}
const isSessionPath = path => !!(S.campaign && S.mapping[topFolderOf(path, S.campaign.path)] === 'session');
/* called by the working copy after every edit */
function trackChange(path, before, after) {
  if (!S.settings.trackLeftOff || !isSessionPath(path)) return;
  const c = describeChange(before, after);
  if (!c) return;
  // `pending`: not pushed yet. If the change is undone or discarded the entry goes with it; a push settles it.
  S.leftOff[path] = addEntry(S.leftOff[path], Object.assign({ ts: Date.now(), pending: true }, c), S.settings.leftOffKeep);
  saveLeftOff();
}
/* the changes to these notes were undone or thrown away: what they said about "where you left off" is no longer true */
function dropPendingLeftOff(paths) {
  let any = false;
  for (const p of paths) {
    const list = S.leftOff[p];
    if (!list || !list.some(e => e.pending)) continue;
    const keep = list.filter(e => !e.pending);
    if (keep.length) S.leftOff[p] = keep; else delete S.leftOff[p];
    any = true;
  }
  if (any) saveLeftOff();
}
/* pushed: those changes are in the vault now, so they stay as history */
function settleLeftOff(paths) {
  let any = false;
  for (const p of paths) {
    const list = S.leftOff[p];
    if (!list || !list.some(e => e.pending)) continue;
    S.leftOff[p] = list.map(e => { if (!e.pending) return e; const { pending, ...rest } = e; return rest; });
    any = true;
  }
  if (any) saveLeftOff();
}
export function clearLeftOff(path) {
  if (path) delete S.leftOff[path]; else S.leftOff = {};
  saveLeftOff(); emit();
}
export function jumpToLine(path, line, opts) { set({ jump: { path, line, stamp: Date.now(), open: !(opts && opts.open === false) } }); }

/* ---------- the DM cheat sheet ---------- */
export function toggleCheat(on) { set({ cheatOpen: on === undefined ? !S.cheatOpen : !!on }); }
export function popOutCheat() { set({ cheatOpen: false }); openTab({ section: 'cheatsheet' }); }
export function toggleStar(id) {
  const cur = S.settings.cheatStars || [];
  updateSetting('cheatStars', cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
}
/* your own cards are a note in the campaign folder, so they live in your vault like everything else */
export const cheatPath = () => (S.campaign ? join(S.campaign.path, CUSTOM_NOTE + '.md') : '');
export function customCards() { const p = cheatPath(); const t = p && S.working.get(p); return t ? parseCustom(t) : []; }
export function saveCustomCards(cards) {
  const p = cheatPath(); if (!p) return;
  const existing = S.working.get(p);
  const text = buildCustom(cards, existing);
  if (existing === undefined) S.working.create(p, text); else S.working.setText(p, text);
  touch();
}

/* ---------- extra rows for the generators, and tables of your own (written with Claude) ---------- */
export const poolsPath = () => (S.campaign ? join(S.campaign.path, POOLS_NOTE + '.md') : '');
let poolsCache = { text: null, map: {} };
/* { "npc/quirk": { title, rows } }, read from the note (and only re-read when the note changes) */
export function poolsMap() {
  const p = poolsPath();
  const text = (p && S.working.get(p)) || '';
  if (poolsCache.text !== text) poolsCache = { text, map: parsePools(text) };
  return poolsCache.map;
}
function savePools(map) {
  const p = poolsPath(); if (!p) return;
  const existing = S.working.get(p);
  const text = buildPools(map, existing);
  if (existing === undefined) S.working.create(p, text); else S.working.setText(p, text);
  touch();
}
export function addPoolRows(g, f, rows) {
  const key = g.id + '/' + f.key, map = Object.assign({}, poolsMap());
  const cur = map[key] || { title: g.name + ' \u00b7 ' + f.label, rows: [] };
  map[key] = { title: cur.title, rows: [...cur.rows, ...rows] };
  savePools(map);
}
/* several tables of one generator in one write: [{ field, rows }] */
export function addPoolTables(g, list) {
  const map = Object.assign({}, poolsMap());
  for (const { field, rows } of list) {
    if (!rows.length) continue;
    const key = g.id + '/' + field.key;
    const cur = map[key] || { title: g.name + ' \u00b7 ' + field.label, rows: [] };
    map[key] = { title: cur.title, rows: [...cur.rows, ...rows] };
  }
  savePools(map);
}
export function removePoolRow(key, i) {
  const map = Object.assign({}, poolsMap());
  if (!map[key]) return;
  map[key] = { title: map[key].title, rows: map[key].rows.filter((_, j) => j !== i) };
  savePools(map);
}
export function customTables() {
  if (!S.campaign) return [];
  const dir = join(S.campaign.path, TABLES_FOLDER) + '/';
  return S.working.paths().filter(p => p.startsWith(dir) && /\.md$/i.test(p)).sort((a, b) => a.localeCompare(b))
    .map(p => Object.assign(parseTable(basename(p).replace(/\.md$/i, ''), S.working.get(p)), { path: p })).filter(t => t.rows.length);
}
export function saveCustomTable(title, rows) {
  const clean = sanitizeName(title) || 'Table';
  const dir = join(S.campaign.path, TABLES_FOLDER);
  let p = join(dir, clean + '.md');
  for (let i = 2; S.working.has(p) && i < 200; i++) p = join(dir, clean + ' ' + i + '.md');
  S.working.create(p, buildTable(title, rows));
  touch();
  return p;
}

/* ---------- Generate: which generators show, and which you used last ---------- */
export const hiddenGens = () => new Set(S.settings.hiddenGens || []);
export function setGenVisible(id, on) {
  const hidden = hiddenGens();
  if (on) hidden.delete(id); else hidden.add(id);
  updateSetting('hiddenGens', [...hidden]);
}
export function setGensVisible(ids, on) {
  const hidden = hiddenGens();
  ids.forEach(id => { if (on) hidden.delete(id); else hidden.add(id); });
  updateSetting('hiddenGens', [...hidden]);
}
export function noteRecentGen(id) {
  const cur = S.settings.recentGens || [];
  if (cur[0] === id) return;
  updateSetting('recentGens', [id, ...cur.filter(x => x !== id)].slice(0, 6));
}

/* ---------- Generate: combos (saved sets of generators, with how many of each) ---------- */
export function saveCombo(name, picks) {
  const nm = String(name || '').trim().slice(0, 40);
  if (!nm || !picks.length) return null;
  const cur = (S.settings.combos || []).filter(c => c.name.toLowerCase() !== nm.toLowerCase());     // the same name replaces the old one
  if (cur.length >= 20) { toast('That is 20 combos already. Delete one first.', true); return null; }
  const id = 'c-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  updateSetting('combos', [...cur, { id, name: nm, picks: picks.map(p => ({ id: p.id, qty: p.qty })) }]);
  return id;
}
export function deleteCombo(id) { updateSetting('combos', (S.settings.combos || []).filter(c => c.id !== id)); }

/* ---------- the campaign snapshot (a note that sums the campaign up; see core/snapshot.js) ---------- */
export const snapshotPath = () => (S.campaign ? join(S.campaign.path, SNAPSHOT_NOTE + '.md') : '');
/* null when there is none yet; else { text, snap, cmp } where cmp says what has changed in the campaign since it was made */
export function snapshotInfo() {
  const p = snapshotPath();
  const text = p && S.working.get(p);
  if (!text) return null;
  const snap = parseSnapshot(text);
  const idx = getIndex();
  return { text, snap, cmp: idx ? compareSnapshot(snap, snapshotNotes(idx, S.campaign)) : null };
}
export function saveSnapshot(body, notes, secrets) {
  const p = snapshotPath(); if (!p) return;
  const text = buildSnapshotNote({ body, notes, campaign: S.campaign && S.campaign.name, secrets });
  if (S.working.has(p)) S.working.setText(p, text); else S.working.create(p, text);
  touch();
}

/* ---------- the snapshot, made in the background ----------
   The job lives here, not in a window, so closing the window (or using the rest of DM Forge) does not stop it. The top bar shows it,
   and when it is done the draft waits there to be reviewed. Claude Code answers one question at a time, so while it runs the other Claude
   buttons say it is busy. The notes are fingerprinted when it starts: anything you change while it reads counts as changed afterwards. */
export const claudeBusy = () => !!(S.job && (S.job.status === 'running' || S.job.status === 'stopping'));
export function clearJob() { S.job = null; emit(); }
export function discardJob() {
  const j = S.job; if (!j) return;
  if (j.status === 'running') { j.status = 'stopping'; j.label = 'Finishing the current request, then stopping…'; emit(); } else { S.job = null; emit(); }
}
export async function startSnapshotJob({ secrets = true } = {}) {
  if (claudeBusy() || !S.campaign) return false;
  const idx = getIndex();
  const notes = snapshotNotes(idx, S.campaign);
  if (!notes.length) { toast('There are no notes to read yet.', true); return false; }
  const plan = planSnapshot(notes);
  const campaign = S.campaign.name, campaignPath = S.campaign.path;
  const n = plan.batches.length;
  const job = { kind: 'snapshot', status: 'running', label: n > 1 ? 'Reading part 1 of ' + n + '…' : 'Reading your notes…', started: Date.now(), notes, secrets, parts: n, draft: null, error: '' };
  S.job = job; emit();
  const stopped = () => job.status === 'stopping' || S.job !== job || !S.campaign || S.campaign.path !== campaignPath;
  try {
    const partials = [];
    for (let i = 0; i < n; i++) {
      if (stopped()) break;
      job.label = n > 1 ? 'Reading part ' + (i + 1) + ' of ' + n + '…' : 'Reading your notes…'; emit();
      partials.push(await S.vault.claudeAsk(snapshotPrompt({ campaign, text: plan.batches[i], secrets, part: i, parts: n }), SNAPSHOT_SYSTEM));
    }
    let answer = partials[0];
    if (!stopped() && n > 1) { job.label = 'Putting the parts together…'; emit(); answer = await S.vault.claudeAsk(mergePrompt({ campaign, partials: partials.map(p => cleanSnapshot(p).text), secrets }), SNAPSHOT_SYSTEM); }
    if (stopped()) { if (S.job === job) S.job = null; emit(); return false; }
    const c = cleanSnapshot(answer);
    if (!c.text) throw new Error('Claude answered, but with nothing I can use. Try again.');
    job.draft = { text: c.text, ok: c.ok, found: c.headings.length };
    job.status = 'ready'; job.label = 'Ready to review'; emit();
    toast('Your campaign snapshot is ready. Open it from the top bar to review and save it.');
    return true;
  } catch (e) {
    if (S.job === job && job.status !== 'stopping') { job.status = 'failed'; job.error = e.message; emit(); } else if (S.job === job) { S.job = null; emit(); }
    return false;
  }
}

/* ---------- the session log ---------- */
const sessionKeyName = () => 'dmforge:logsession:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
/* the session note the log goes to: the one you chose, else the newest */
export function currentSessionPath() {
  const idx = getIndex();
  if (!idx) return '';
  let p = '';
  try { p = localStorage.getItem(sessionKeyName()) || ''; } catch (e) { /* storage unavailable */ }
  if (p && idx.byPath.get(p) && idx.byPath.get(p).type === 'session') return p;
  const list = idx.byType.session || [];
  return list[0] ? list[0].path : '';
}
export function setCurrentSession(path) {
  try { localStorage.setItem(sessionKeyName(), path); } catch (e) { /* storage unavailable */ }
  emit();
}
/* one tool at a time in the island: opening one closes the others */
export function setLogOpen(on) { if (on && S.timer.open) S.timer = Object.assign({}, S.timer, { open: false }); set({ logOpen: !!on, ...(on ? { diceOpen: false } : {}) }); }
export function closeIsland() { S.timer = Object.assign({}, S.timer, { open: false }); set({ logOpen: false, diceOpen: false, islandPin: false }); }
export function logLine(text, tag) {
  const path = currentSessionPath();
  const line = buildLine({ text, tag });
  if (!path || !line) return false;
  const sp = splitFrontmatter(S.working.get(path));
  S.working.setText(path, sp.prefix + appendLogLine(sp.body, line));
  touch();
  return true;
}
export function undoLogLine() {
  const path = currentSessionPath();
  if (!path) return false;
  const sp = splitFrontmatter(S.working.get(path));
  const body = removeLastLogLine(sp.body);
  if (body === null) return false;
  S.working.setText(path, sp.prefix + body);
  touch();
  return true;
}
export function sessionLogEntries(path) {
  const t = path && S.working.get(path);
  return t ? parseLog(splitFrontmatter(t).body) : [];
}

/* ---------- close out the session ---------- */
export function closeoutInfo(path) {
  const idx = getIndex();
  const session = idx && idx.byPath.get(path);
  if (!session) return null;
  const ctx = closeoutContext({ session, idx });
  return { session, ctx, prompt: closeoutPrompt({ campaign: S.campaign && S.campaign.name, session: session.name, ctx }) };
}
export async function startCloseoutJob(path) {
  if (claudeBusy() || !S.campaign) return false;
  const info = closeoutInfo(path);
  if (!info) return false;
  const campaignPath = S.campaign.path;
  const job = { kind: 'closeout', status: 'running', label: 'Reading the session…', started: Date.now(), path, name: info.session.name, draft: null, error: '' };
  S.job = job; emit();
  const stopped = () => job.status === 'stopping' || S.job !== job || !S.campaign || S.campaign.path !== campaignPath;
  try {
    const answer = await S.vault.claudeAsk(info.prompt, CLOSEOUT_SYSTEM);
    if (stopped()) { if (S.job === job) S.job = null; emit(); return false; }
    const parsed = parseCloseout(answer, getIndex());
    if (!parsed) throw new Error('Claude answered, but with nothing I can use. Try again.');
    job.draft = parsed;
    job.status = 'ready'; job.label = 'Ready to review'; emit();
    toast('The close-out for ' + job.name + ' is ready. Open it from the top bar to review it.');
    return true;
  } catch (e) {
    if (S.job === job && job.status !== 'stopping') { job.status = 'failed'; job.error = e.message; emit(); } else if (S.job === job) { S.job = null; emit(); }
    return false;
  }
}
/* writes what was ticked: { recap, next, check } into the session note, and { threads, npcs } (path, status, text) into those notes */
export function applyCloseout(sessionPath, picks) {
  const note = getIndex().byPath.get(sessionPath);
  if (!note) return { notes: 0 };
  const date = (note.fm && note.fm.date) ? String(note.fm.date).slice(0, 10) : today();
  const sessText = S.working.get(sessionPath);
  const next = applySessionParts(sessText, { recap: picks.recap, next: picks.next, check: picks.check });
  if (next !== sessText) S.working.setText(sessionPath, next);
  let notes = 0;
  for (const u of [...(picks.threads || []), ...(picks.npcs || [])]) {
    if (!u.path || S.working.get(u.path) === undefined) continue;
    const before = S.working.get(u.path);
    const after = applyNoteUpdate(before, { status: u.status, line: updateLine(note.name, date, u.text) });
    if (after !== before) { S.working.setText(u.path, after); notes++; }
  }
  touch();
  return { notes };
}
export { plainCloseout };

/* ---------- tidy notes (2.47): the rough notes typed during play, organised; the original is kept ---------- */
export function tidyInfo(path) {
  const idx = getIndex();
  const note = idx && idx.byPath.get(path);
  const text = S.working.get(path);
  if (!note || text === undefined) return null;
  const sp = splitFrontmatter(text);
  return { note, plan: TD.tidyPlan(sp.body), body: sp.body };
}
const tidyEntities = idx => (idx ? idx.notes.filter(n => ['npc', 'location', 'faction', 'plot', 'player', 'item'].includes(n.type)).map(n => n.name) : []);
export const tidyCheck = (material, tidy, taskText = '') => TD.checkFidelity(material, tidy + '\n' + taskText, tidyEntities(getIndex()));
export const tidyLeaks = (material, tidy) => TD.secretLeaks(material, tidy);
/* what Claude will be sent, for the dialog's preview */
export function tidyPreview(path, ids) {
  const info = tidyInfo(path);
  if (!info) return null;
  const mat = TD.buildMaterial(info.body, ids);
  const idx = getIndex();
  const { names, party } = TD.mentionedNames(mat.text, idx.notes);
  const chunks = TD.chunkMaterial(mat.text);
  return { mat, chunks: chunks.length, prompt: TD.tidyPrompt({ campaign: S.campaign && S.campaign.name, session: info.note.name, chunk: chunks[0], part: 1, parts: chunks.length, names, party, glance: chunks.length === 1 }) };
}
export function plainTidyDraft(path, ids) {
  const info = tidyInfo(path);
  if (!info) return null;
  const mat = TD.buildMaterial(info.body, ids);
  return { tidy: TD.plainTidy(mat.text), material: mat.text, ids, plain: true };
}
export async function startTidyJob(path, ids) {
  if (claudeBusy() || !S.campaign) return false;
  const info = tidyInfo(path);
  if (!info) return false;
  const mat = TD.buildMaterial(info.body, ids);
  if (!mat.text.trim()) { toast('There is nothing typed in the chosen sections to tidy.', true); return false; }
  const idx = getIndex();
  const { names, party } = TD.mentionedNames(mat.text, idx.notes);
  const chunks = TD.chunkMaterial(mat.text);
  const campaignPath = S.campaign.path, campaign = S.campaign.name;
  const job = { kind: 'tidy', status: 'running', label: 'Reading the notes…', started: Date.now(), path, name: info.note.name, draft: null, error: '' };
  S.job = job; emit();
  const stopped = () => job.status === 'stopping' || S.job !== job || !S.campaign || S.campaign.path !== campaignPath;
  try {
    const parts = [];
    let before = '';
    for (let i = 0; i < chunks.length; i++) {
      job.label = chunks.length > 1 ? 'Tidying part ' + (i + 1) + ' of ' + chunks.length + '…' : 'Tidying the notes…'; emit();
      const answer = await S.vault.claudeAsk(TD.tidyPrompt({ campaign, session: info.note.name, chunk: chunks[i], part: i + 1, parts: chunks.length, names, party, glance: chunks.length === 1, before }), TD.TIDY_SYSTEM);
      if (stopped()) { if (S.job === job) S.job = null; emit(); return false; }
      const md = TD.parseTidy(answer, Math.floor(chunks[i].length * 0.3));
      if (!md) throw new Error('Claude answered, but with nothing I can use. Try again.');
      parts.push(md);
      before = (md.match(/^###\s+.+$/gm) || []).slice(-6).map(x => x.replace(/^###\s+/, '')).join('; ');
    }
    let tidy = parts.length > 1 ? TD.joinParts(parts) : parts[0];
    if (chunks.length > 1) {
      job.label = 'Adding the summary…'; emit();
      try {
        const g = TD.parseTidy(await S.vault.claudeAsk(TD.glancePrompt({ campaign, session: info.note.name, tidy, names }), TD.TIDY_SYSTEM));
        if (g && !stopped()) tidy = tidy.replace(/\n*(### Secrets[\s\S]*)$/i, (m, sec) => '\n\n' + g.trim() + '\n\n' + sec.trim()).replace(/^(?![\s\S]*### At a glance)([\s\S]*)$/, '$1\n\n' + g.trim());
      } catch (e) { /* the summary is a nicety: the tidy version stands without it */ }
    }
    if (stopped()) { if (S.job === job) S.job = null; emit(); return false; }
    job.draft = { tidy, material: mat.text, ids, plain: false };
    job.status = 'ready'; job.label = 'Ready to review'; emit();
    toast('The tidy version of ' + job.name + ' is ready. Open it from the top bar to review it.');
    return true;
  } catch (e) {
    if (S.job === job && job.status !== 'stopping') { job.status = 'failed'; job.error = e.message; emit(); } else if (S.job === job) { S.job = null; emit(); }
    return false;
  }
}
/* writes the (possibly edited) tidy version into the note: it takes the place of what was typed, which is kept as the original */
export function applyTidyDraft(path, draft) {
  const text = S.working.get(path);
  if (text === undefined) return false;
  const sp = splitFrontmatter(text);
  const next = TD.applyTidy(sp.body, { tidy: draft.tidy, ids: draft.ids, material: draft.material, today: today() });
  if (next === null) { toast('There is nothing left to tidy in that note.', true); return false; }
  S.working.setText(path, sp.prefix + next);
  touch();
  return true;
}
export function restoreOriginalNote(path) {
  const text = S.working.get(path);
  if (text === undefined) return false;
  const sp = splitFrontmatter(text);
  const next = TD.restoreOriginal(sp.body);
  if (next === null) { toast('This note has no original to put back.', true); return false; }
  S.working.setText(path, sp.prefix + next);
  touch();
  return true;
}
export const originalOf = path => { const t = S.working.get(path); return t === undefined ? null : TD.getOriginal(splitFrontmatter(t).body); };
export const isTidied = path => { const t = S.working.get(path); return t !== undefined && TD.hasTidy(t) && TD.hasOriginal(t); };


/* ---------- what am I forgetting? ---------- */
export function forgettingNow() {
  const idx = getIndex();
  return idx ? forgetting(idx, { after: S.settings.neglectAfter || 3 }) : null;
}
/* tick (or untick) a task line in a note, from the panel */
export function tickTask(path, raw) {
  const t = S.working.get(path);
  if (t === undefined) return false;
  const next = flipTaskLine(t, raw);
  if (next === null) return false;
  S.working.setText(path, next);
  touch();
  return true;
}
export function addForgettingToSessionPrep(path) {
  const f = forgettingNow();
  const t = path && S.working.get(path);
  if (!f || t === undefined || !f.total) return false;
  S.working.setText(path, addForgettingToPrep(t, f));
  touch();
  return true;
}

/* ---------- the monster library ---------- */
/* an SRD creature saved as a note in the Bestiary category (made if there is none), to edit and keep */
export function saveToBestiary(m) {
  const n = monsterNote(m);
  const folder = Object.keys(S.mapping).find(f => BESTIARY_FOLDERS.test(f)) || 'Bestiary';
  const type = S.mapping[folder] && S.mapping[folder] !== OTHER ? S.mapping[folder] : customId(folder);
  if (!(folder in S.mapping)) saveMapping(Object.assign({}, S.mapping, { [folder]: type }));
  return createNote(type, m.n, { fm: n.fm, body: n.body });
}

/* a monster made with the form: a new note in the Bestiary (made if there is none), or the note it was made from, changed in place (and renamed if the name changed).
   Returns the note's path. */
export function saveMonsterForm(form, path) {
  const n = formNote(form);
  if (!path) {
    const folder = Object.keys(S.mapping).find(f => BESTIARY_FOLDERS.test(f)) || 'Bestiary';
    const type = S.mapping[folder] && S.mapping[folder] !== OTHER ? S.mapping[folder] : customId(folder);
    if (!(folder in S.mapping)) saveMapping(Object.assign({}, S.mapping, { [folder]: type }));
    return createNote(type, form.name.trim(), { fm: n.fm, body: n.body });
  }
  saveNoteEdit(path, { fmChanges: n.fm, body: n.body });
  const cur = getIndex().byPath.get(path);
  if (cur && cur.name !== form.name.trim()) { const r = renameNote(path, { name: form.name.trim() }); if (r && r.ok && r.newPath) return r.newPath; }
  return path;
}

/* ---------- the party and the encounter ---------- */
/* one field of a note (a player's level, gold...): written where it already lives on the sheet (property or inline line), a number when it is one, removed when emptied */
export function setNoteProp(path, key, value, type = 'player') {
  const t = S.working.get(path);
  const field = fieldDefs(type).find(f => f.key === key);
  if (t === undefined || !field) return false;
  const next = writeField(t, field, value);
  if (next === t) return false;
  S.working.setText(path, next);
  touch();
  return true;
}
/* who was at a session: the names that were away are a list in the session note's properties */
export function setPresence(sessionPath, name, here) {
  const t = S.working.get(sessionPath);
  if (t === undefined) return false;
  const note = getIndex().byPath.get(sessionPath);
  const next = withPresence(t, absentOf(note ? note.fm : {}), name, here);
  if (next === t) return false;
  S.working.setText(sessionPath, next);
  touch();
  return true;
}
const encounterKey = () => 'dmforge:encounter:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
export function loadEncounter() {
  try {
    const v = JSON.parse(localStorage.getItem(encounterKey()) || '[]');
    return Array.isArray(v) ? v.filter(x => x && typeof x.key === 'string' && Number.isFinite(x.qty) && x.qty > 0).slice(0, 40).map(x => ({ key: x.key.slice(0, 300), qty: Math.min(30, Math.floor(x.qty)) })) : [];
  } catch (e) { return []; }
}
export function setEncounter(list) {
  S.encounter = list;
  try { localStorage.setItem(encounterKey(), JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
  emit();
}
/* puts monsters (a list of { m, qty }) into the fight, starting one if there is none; initiative is rolled for each */
export function addMonstersToCombat(items) {
  if (!S.combat) S.combat = CMB.newCombat();
  let n = 0;
  for (const { m, qty } of items) {
    CMB.addCombatant(S.combat, { ...combatSpec(m), count: Math.max(1, Math.min(30, qty)), init: 'roll' });
    n += qty;
  }
  saveCombat();
  return n;
}

/* ---------- rename a note ---------- */
/* everything that remembers a note by its path follows it to the new one */
function remapPath(oldP, newP) {
  for (const t of S.tabs) if (t.selected === oldP) { t.selected = newP; t.editing = false; }
  if (S.leftOff[oldP]) { S.leftOff[newP] = S.leftOff[oldP]; delete S.leftOff[oldP]; saveLeftOff(); }
  try { if (S.campaign && localStorage.getItem(sessionKeyName()) === oldP) localStorage.setItem(sessionKeyName(), newP); } catch (e) { /* storage unavailable */ }
  if (S.combatTarget === oldP) S.combatTarget = newP;
  if (S.live === oldP) { S.live = newP; saveLive(); }
  const ok = 'note:' + oldP, nk = 'note:' + newP;
  if ((S.encounter || []).some(e => e.key === ok)) setEncounter(S.encounter.map(e => (e.key === ok ? { ...e, key: nk } : e)));
  if (S.combat && S.combat.combatants.some(c => c.mon === ok)) { for (const c of S.combat.combatants) if (c.mon === ok) c.mon = nk; saveCombat(); }
}
/* what renaming would do (for the dialog's preview): see core/rename.js */
export function previewRename(path, o) {
  const idx = getIndex();
  return idx ? planRename({ idx, working: S.working, path, newName: o.name, title: o.title ?? null, updateLinks: o.updateLinks !== false, keepAlias: !!o.keepAlias }) : { ok: false, error: '' };
}
export function renameNote(path, o) {
  flushDrafts();
  const plan = previewRename(path, o);
  if (!plan.ok) return plan;
  for (const e of plan.edits) S.working.setText(e.path, e.text);
  let np = path;
  if (plan.renamed) { S.working.move(path, plan.newPath, plan.self); np = plan.newPath; remapPath(path, np); }
  else if (plan.self !== S.working.get(path)) S.working.setText(path, plan.self);
  touch();
  return { ...plan, newPath: np };
}

/* ---------- dice ---------- */
const DICE_KEY = 'dmforge:dice';
export function initDice() { try { const v = JSON.parse(localStorage.getItem(DICE_KEY) || '[]'); if (Array.isArray(v)) S.diceHist = v.filter(x => x && typeof x.expr === 'string').slice(0, 30); } catch (e) { /* none */ } }
export function setDiceOpen(on) { if (on && S.timer.open) S.timer = Object.assign({}, S.timer, { open: false }); set({ diceOpen: !!on, ...(on ? { logOpen: false } : {}) }); }
export function setDiceMode(m) { set({ diceMode: m === 'adv' || m === 'dis' ? m : 'normal' }); }
/* rolls it and keeps it in the history; returns the entry, or null if it is not a dice expression */
export function rollNow(expr, mode = S.diceMode) {
  const r = rollDice(expr, { mode });
  if (!r) return null;
  const entry = { id: uid(), ts: Date.now(), expr: r.expr, total: r.total, detail: r.detail, mode: r.mode, crit: r.crit, fumble: r.fumble };
  S.diceHist = [entry, ...(S.diceHist || [])].slice(0, 30);
  try { localStorage.setItem(DICE_KEY, JSON.stringify(S.diceHist)); } catch (e) { /* storage unavailable */ }
  emit();
  return entry;
}
export function clearDice() { S.diceHist = []; try { localStorage.removeItem(DICE_KEY); } catch (e) { /* ignore */ } emit(); }

/* ---------- the session timer ---------- */
const timerKey = () => 'dmforge:timer:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
export const timerElapsed = (t = S.timer) => t.acc + (t.run ? Date.now() - t.t0 : 0);
export function loadTimer() {
  const base = { run: false, t0: 0, acc: 0, every: 60, nextBreak: 60, sceneAcc: 0, open: false, due: false };
  try {
    const v = JSON.parse(localStorage.getItem(timerKey()) || 'null');
    if (v && typeof v === 'object') {
      const every = [0, 30, 45, 60, 90].includes(v.every) ? v.every : 60;
      const acc = Math.max(0, +v.acc || 0) + (v.run && v.t0 ? Math.max(0, Date.now() - v.t0) : 0);
      return Object.assign(base, { every, acc, sceneAcc: Math.min(acc, Math.max(0, +v.sceneAcc || 0)), nextBreak: every ? Math.max(every, (Math.floor(acc / 60000 / every) + 1) * every) : 0, run: !!v.run, t0: v.run ? Date.now() : 0 });
    }
  } catch (e) { /* defaults */ }
  return base;
}
function saveTimer() {
  const t = S.timer;
  try { localStorage.setItem(timerKey(), JSON.stringify({ run: t.run, t0: t.t0, acc: t.acc, every: t.every, sceneAcc: t.sceneAcc })); } catch (e) { /* storage unavailable */ }
}
export function timerSet(patch) { S.timer = Object.assign({}, S.timer, patch); saveTimer(); emit(); }
export function timerToggle() {
  const t = S.timer;
  if (t.run) timerSet({ run: false, acc: t.acc + Date.now() - t.t0, t0: 0 });
  else timerSet({ run: true, t0: Date.now(), due: false });
}
export function timerReset() { timerSet({ run: false, t0: 0, acc: 0, sceneAcc: 0, nextBreak: S.timer.every, due: false }); }
export function timerEvery(m) { const e = [0, 30, 45, 60, 90].includes(m) ? m : 60; timerSet({ every: e, nextBreak: e ? (Math.floor(timerElapsed() / 60000 / e) + 1) * e : 0 }); }
export function timerOpen(on) { S.timer = Object.assign({}, S.timer, { open: !!on, due: on ? false : S.timer.due }); if (on) { S.logOpen = false; S.diceOpen = false; } emit(); }
export function sceneList() {
  const path = currentSessionPath();
  const t = path && S.working.get(path);
  return t ? parseScenes(splitFrontmatter(t).body) : [];
}
export function addSceneNow(name, mins) {
  const path = currentSessionPath();
  const t = path && S.working.get(path);
  if (t === undefined || !String(name || '').trim()) return false;
  const sp = splitFrontmatter(t);
  S.working.setText(path, sp.prefix + appendToSection(sp.body, SCENES_HEADING, sceneLine(name, Math.max(0, Math.min(600, Math.floor(+mins) || 0)))));
  touch();
  return true;
}
/* the scene being played is done: ticked in the note with how long it took, and noted in the session log */
export function finishSceneNow() {
  const path = currentSessionPath();
  const t = path && S.working.get(path);
  if (t === undefined) return false;
  const sp = splitFrontmatter(t);
  const el = timerElapsed();
  const took = S.timer.acc || S.timer.run ? Math.max(0, Math.round((el - S.timer.sceneAcc) / 60000)) : 0;
  const f = finishScene(sp.body, took);
  if (!f) return false;
  S.working.setText(path, sp.prefix + sp.body.replace(f.from, f.to));
  logLine('Scene done: ' + f.scene.name + (took ? ' (took ' + took + ' min' + (f.scene.est ? ', planned ' + f.scene.est : '') + ')' : ''), '');
  S.timer = Object.assign({}, S.timer, { sceneAcc: el });
  saveTimer();
  touch();
  return true;
}

/* ---------- spells ---------- */
/* a spell saved as a note in a Spells category (made if there is none) */
export function saveSpellToNotes(sp) {
  const n = spellNote(sp);
  const folder = Object.keys(S.mapping).find(f => SPELL_FOLDERS.test(f)) || 'Spells';
  const type = S.mapping[folder] && S.mapping[folder] !== OTHER ? S.mapping[folder] : customId(folder);
  if (!(folder in S.mapping)) saveMapping(Object.assign({}, S.mapping, { [folder]: type }));
  return createNote(type, sp.n, { fm: n.fm, body: n.body });
}

/* ---------- secrets and clues ---------- */
export function secretsNow() { const idx = getIndex(); return idx ? secretsFrom(idx) : []; }
/* the players now know it (or do not): ticked in the note, and when revealed, a line in the session log */
export function setSecretRevealed(path, raw, revealed) {
  const t = S.working.get(path);
  if (t === undefined) return false;
  const idx = getIndex();
  const cur = idx && idx.byPath.get(currentSessionPath());
  const next = setRevealed(t, raw, revealed, cur ? cur.name : '');
  if (next === null) return false;
  S.working.setText(path, next);
  if (revealed) {
    const sec = secretsFrom(idx).flatMap(g => g.items).find(x => x.raw === raw);
    if (sec) logLine('Revealed: ' + sec.secret, 'reveal');
  }
  touch();
  return true;
}
export function addSecretTo(path, secret, clues) {
  const t = S.working.get(path);
  if (t === undefined || !String(secret || '').trim()) return false;
  const sp = splitFrontmatter(t);
  S.working.setText(path, sp.prefix + appendToSection(sp.body, 'Secrets and clues', secretLine(secret, clues)));
  touch();
  return true;
}

/* ---------- spotlight ---------- */
export function spotlightNow() {
  const idx = getIndex();
  if (!idx) return null;
  const sess = idx.byPath.get(currentSessionPath());
  return spotlightStats(idx, { away: sess ? absentOf(sess.fm) : [] });
}
export function addSpotlight(playerName, what = '') {
  return logLine('[[' + playerName + ']] ' + (String(what).trim() || 'had a moment'), 'spotlight');
}
/* take back the newest moment in the current session's log: one player's, or anyone's. Returns what was removed, or null. */
export function undoSpotlight(playerName) {
  const path = currentSessionPath();
  const text = path && S.working.get(path);
  if (text === undefined || text === null) return null;
  const sp = splitFrontmatter(text);
  const r = removeSpotlightMoment(sp.body, playerName);
  if (!r) return null;
  S.working.setText(path, sp.prefix + r.body);
  touch();
  return r;
}
/* how many moments the current session's log holds, for one player or all (decides whether an undo has anything to take back) */
export function spotlightHere(playerName) {
  const path = currentSessionPath();
  const text = path && S.working.get(path);
  if (!text) return 0;
  return spotlightLines(splitFrontmatter(text).body).filter(e => !playerName || namesPlayer(e.raw, playerName)).length;
}

/* ---------- clocks and faction standing ---------- */
export const clocksPath = () => (S.campaign ? join(S.campaign.path, CLOCKS_NOTE + '.md') : '');
export function clocksNow() { const p = clocksPath(); return readLists(p ? S.working.get(p) : ''); }
export function saveClocks(clocks, standings, said = '') {
  const p = clocksPath();
  if (!p) return false;
  const old = S.working.get(p);
  const next = writeLists(old, clocks, standings);
  if (old === undefined) S.working.create(p, next); else if (next !== old) S.working.setText(p, next); else return false;
  if (said) logLine(said, '');
  touch();
  return true;
}
/* tick a clock one slice either way from somewhere else (a note it is linked to) */
export function tickClock(name, delta) {
  const { clocks, standings } = clocksNow();
  const i = clocks.findIndex(c => c.name === name);
  if (i < 0) return false;
  const was = clocks[i];
  const filled = Math.max(0, Math.min(was.size, was.filled + delta));
  if (filled === was.filled) return false;
  const next = clocks.map((x, k) => (k === i ? { ...x, filled } : x));
  const full = filled >= was.size && was.filled < was.size;
  saveClocks(next, standings, full ? 'Clock filled: ' + was.name + ' (' + was.size + '/' + was.size + ')' : '');
  if (full) toast('“' + was.name + '” is full.');
  return true;
}
export { standingLabel };

/* ---------- the session zero kit ---------- */
/* makes the notes the kit planned, as pending changes; returns the path of the Session Zero note and every path made */
export function applyStarter(a) {
  const plan = buildStarter(a);
  const made = [];
  let first = '';
  for (const n of plan.notes) {
    let p;
    if (n.kind === 'root') {
      p = uniqueIn(S.campaign.path, n.name + '.md');
      S.working.create(p, n.body);
    } else p = createNote(n.kind, n.name, { fm: n.fm, body: n.body });
    if (!first) first = p;
    made.push(p);
  }
  if (plan.session1) {
    const sp = createSession({ title: '', date: today(), number: nextSessionNumber(), word: sessionPrefix() });
    appendToPrep(sp, plan.prep);
    made.push(sp);
  }
  touch();
  return { first, made };
}

/* ---------- the sample campaign, added to your vault ---------- */
export const SAMPLE_FOLDER = 'Ashfall (sample)';
/* every note of the Ashfall showcase campaign, as [path inside the campaign folder, text]. The helper only writes notes, never images, so the map
   pictures stay in the practice demo and the notes that showed them say where the map would go. The campaign's own note is marked as a sample,
   so the Menu can offer to remove it again. */
export function sampleFiles() {
  const out = [];
  for (const [p, v] of Object.entries(showcaseFiles())) {
    if (!(/^Ashfall\//.test(p) && typeof v === 'string' && /\.md$/i.test(p))) continue;
    const rel = p.slice('Ashfall'.length);
    let text = v.replace(/!\[\[([^\]|]+)\.svg\]\]/g, '(map: $1)');
    if (rel === '/Ashfall.md') text = patchFrontmatter(text, { dmforge_sample: true });
    out.push([rel, text]);
  }
  return out;
}
/* the example characters, for Character Library/Examples: [path, text], each marked "example: true" */
export function sampleCharacters() {
  return Object.entries(showcaseFiles()).filter(([p, v]) => p.startsWith('Character Library/') && typeof v === 'string').map(([p, v]) => [EXAMPLE_FOLDER + '/' + basename(p), asExample(v)]);
}
/* writes the sample's notes into a new folder in the vault: never into a folder that already has something in it.
   With `characters`, the example characters go into Character Library/Examples, never among your own (one already there is left alone). */
export async function addSampleToVault(folder, { characters = false } = {}) {
  const name = sanitizeName(folder);
  if (!name) return { ok: false, error: 'Type a folder name.' };
  if (!S.vault || S.vault.kind === 'memory') return { ok: false, error: 'This is the practice campaign: there is no vault to add to.' };
  let existing = [];
  try { existing = await S.vault.list(name); } catch (e) { existing = []; }
  if (existing && existing.length) return { ok: false, error: 'There is already a folder called “' + name + '” with things in it. Choose another name so nothing is overwritten.' };
  if (!(await S.vault.ensureWrite())) return { ok: false, error: 'Write permission for the folder was not granted.' };
  const files = sampleFiles();
  let n = 0, chars = 0;
  try {
    for (const [rel, v] of files) { await S.vault.writeText(name + rel, v); n++; }
    if (characters) for (const [p, text] of sampleCharacters()) { if (!(await S.vault.exists(p))) { await S.vault.writeText(p, text); chars++; } }
  } catch (e) { return { ok: false, error: 'Stopped after ' + n + ' of ' + files.length + ' notes: ' + errMsg(e), written: n }; }
  // the folders are already sorted into categories, so opening it later does not ask
  try { await idbSet('mapping|' + S.vaultKey + '|' + name, SHOWCASE_MAPPING); } catch (e) { /* storage unavailable */ }
  return { ok: true, folder: name, written: n, characters: chars };
}

/* is the open campaign the sample? (its own note carries a dmforge_sample property) */
export function isSampleCampaign() {
  const idx = getIndex();
  return !!(S.campaign && idx && idx.notes.some(n => n.fm && String(n.fm.dmforge_sample).toLowerCase() === 'true'));
}
/* moves the sample's notes to the vault's trash, but only the ones still exactly as the sample wrote them: anything you added or changed stays */
export async function removeSampleCampaign() {
  if (!isSampleCampaign()) return { ok: false, error: 'This is not the sample campaign.' };
  const root = S.campaign.path;
  const shipped = new Map(sampleFiles());
  try {
    if (!(await S.vault.ensureWrite())) return { ok: false, error: 'Write permission for the folder was not granted.' };
    let removed = 0, kept = 0;
    for (const p of S.files) {
      if (!/\.md$/i.test(p)) continue;
      const want = shipped.get(p.slice(root.length));
      let same = false;
      if (want !== undefined) { try { same = (await S.vault.readText(p)) === want; } catch (e) { same = false; } }
      if (same) { await S.vault.moveToTrash(p); removed++; } else kept++;
    }
    S.working.discardAll();
    try { await idbSet('pending|' + S.vaultKey + '|' + root, []); } catch (e) { /* storage unavailable */ }
    closeCampaign();
    return { ok: true, removed, kept };
  } catch (e) { return { ok: false, error: errMsg(e) }; }
}

/* ---------- the tour ---------- */
export function tourSeen() { try { return localStorage.getItem(TOUR_KEY) === 'seen'; } catch (e) { return false; } }
export function startTour() { set({ tour: { step: 0 }, dialog: null }); }
export function endTour() { try { localStorage.setItem(TOUR_KEY, 'seen'); } catch (e) { /* storage unavailable */ } set({ tour: null }); }
export function tourGo(step) {
  const n = Math.max(0, Math.min(TOUR.length - 1, step));
  const st = TOUR[n];
  if (st.go === 'note') { const idx = getIndex(); const note = ((idx.byType.npc || [])[0]) || ((idx.byType.session || [])[0]); if (note) goto(note.path); }
  else if (st.go === 'generate') setSection('generate');
  else if (st.go === 'overview') setSection('overview');
  set({ tour: { step: n } });
}

/* ---------- import last session ---------- */
export function lastSessionInfo(path) {
  const idx = getIndex();
  const prev = idx ? previousSession(idx, path) : null;
  if (!prev) return { prev: null, data: null, parts: '' };
  const data = lastSessionData(S.working.get(prev.path));
  const bits = [];
  if (data.recap) bits.push(FROM_LABEL[data.from]);
  if (data.carry.length) bits.push(data.carry.length + (data.carry.length === 1 ? ' task' : ' tasks'));
  if (data.secrets.length) bits.push(data.secrets.length + (data.secrets.length === 1 ? ' secret' : ' secrets'));
  return { prev, data, parts: bits.join(', ') };
}
/* puts the previous session's recap, carry-over tasks and hidden secrets at the top of this session's prep */
export function importLastSession(path) {
  const info = lastSessionInfo(path);
  if (!info.prev) return { ok: false, error: 'There is no earlier session to bring anything in from.' };
  if (info.data.empty) return { ok: false, error: info.prev.name + ' has no recap, tasks or secrets to bring in yet. Close it out first (Close out… on that session).' };
  const t = S.working.get(path);
  if (t === undefined) return { ok: false, error: 'That session note is not there any more.' };
  const next = putLastTime(t, info.data, info.prev.name);
  if (next !== t) { S.working.setText(path, next); touch(); }
  return { ok: true, from: info.prev.name, parts: info.parts };
}


/* ---------- updating from inside the app (helper only) ---------- */
export async function checkForUpdate({ manual = false } = {}) {
  const v = S.vault;
  if (!S.helper || !v || !v.updateInfo) { if (manual) toast('Updating from inside the app needs the helper (Start DM Forge.command).', true); return null; }
  try {
    const i = await v.updateInfo();
    const next = i.available ? { version: i.available.version, name: i.available.name, current: i.current } : null;
    const same = (S.updateAvail && S.updateAvail.version) === (next && next.version);
    if (!same) set({ updateAvail: next });
    if (manual) {
      if (next) askInstallUpdate();
      else toast('No newer DM Forge zip in your Downloads folder (you have ' + (i.current || __DMF_VERSION__) + '). Download the new DM-Forge-V2.zip, then check again.');
    }
    return next;
  } catch (e) { if (manual) toast('Could not check for an update: ' + (e && e.message ? e.message : e), true); return null; }
}
export function askInstallUpdate() {
  const u = S.updateAvail;
  if (!u) return;
  const pend = S.working ? S.working.count : 0;
  set({ dialog: { kind: 'confirm', title: 'Install DM Forge ' + u.version + '?', body: 'It is in your Downloads folder (' + u.name + '). DM Forge installs it, restarts the helper in the same Terminal window and reloads this page. Your notes and settings are not touched' + (pend ? ', and your ' + pend + ' unpushed change' + (pend === 1 ? '' : 's') + ' are kept' : '') + '. The version you have now is kept, so you can roll back.', confirmLabel: 'Install and restart', onConfirm: installUpdate } });
}
export function laterUpdate() { if (S.updateAvail) set({ updateLater: S.updateAvail.version }); }
export async function installUpdate() {
  const v = S.vault;
  if (!v || !v.installUpdate || S.updating) return;
  set({ updating: true });
  try {
    await v.installUpdate();
  } catch (e) { set({ updating: false }); toast('Could not install the update: ' + (e && e.message ? e.message : e), true); return; }
  await waitForRestart(v);
}
/* the helper answers, then restarts in its own window; once it is back on the same link, reload (unpushed changes are kept) */
async function waitForRestart(v) {
  const t0 = Date.now();
  let down = false;
  await new Promise(r => setTimeout(r, 900));
  for (let i = 0; i < 60; i++) {
    try { await v.helperVersion(); if (down || Date.now() - t0 > 5000) break; } catch (e) { down = true; }
    await new Promise(r => setTimeout(r, 500));
  }
  location.reload();
}


/* ---------- maps with pins (the pins live in a note beside the picture: see core/maps.js) ---------- */
export function saveMap(imagePath, change) {
  const idx = getIndex();
  const note = mapNoteFor(idx, imagePath);
  if (!note) {
    const stem = basename(imagePath).replace(/\.[^.]+$/, '');
    const np = newNotePath(S.campaign, S.mapping, 'map', stem, S.working);
    S.working.create(np.path, mapNoteText(imagePath, change.pins || [], { place: change.place, scale: change.scale }));
    if (np.isNewFolder) { S.mapping = Object.assign({}, S.mapping, { [np.folder]: 'map' }); idbSet(mappingKey(), S.mapping); }
    touch();
    return np.path;
  }
  let text = S.working.get(note.path);
  const fm = {};
  if ('place' in change) fm.place = change.place ? '[[' + change.place + ']]' : undefined;
  if ('scale' in change) fm.scale = change.scale || undefined;
  if (Object.keys(fm).length) text = patchFrontmatter(text, fm);
  if (change.pins) text = writePins(text, change.pins);
  if (text !== S.working.get(note.path)) { S.working.setText(note.path, text); touch(); }
  return note.path;
}
export function openMapAt(imagePath, place, { arm = false } = {}) {
  set({ mapFocus: place ? { image: imagePath, place, arm, stamp: Date.now() } : null });
  openAssetTab(imagePath);
}


/* ---------- lists: when each note file was last changed (read the first time a list is sorted by it) ---------- */
let mtimeLoading = null;
export async function ensureMtimes() {
  if (S.mtimes) return S.mtimes;
  if (!mtimeLoading) {
    const paths = S.files.filter(p => /\.md$/i.test(p));
    mtimeLoading = readMtimes(S.vault, paths).then(m => { S.mtimes = m; mtimeLoading = null; emit(); return m; }).catch(() => { mtimeLoading = null; });
  }
  return mtimeLoading;
}

/* ---------- editing several notes at once ---------- */
export function setFieldValue(path, type, key, value) {
  const def = fieldDefs(type).find(f => f.key === key);
  const old = S.working.get(path);
  if (!def || old === undefined) return false;
  const next = writeField(old, def, value);
  if (next !== old) { S.working.setText(path, next); touch(); }
  return true;
}
const tagList = v => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map(t => String(t).replace(/^#/, '').trim()).filter(Boolean);
export function changeTag(path, tag, add) {
  const text = S.working.get(path);
  if (text === undefined) return false;
  const t = String(tag).replace(/^#/, '').trim();
  if (!t) return false;
  const sp = splitFrontmatter(text);
  const key = Object.keys(sp.fm || {}).find(k => /^tags?$/i.test(k)) || 'tags';
  const cur = tagList(sp.fm && sp.fm[key]);
  const has = cur.some(x => x.toLowerCase() === t.toLowerCase());
  if (add === has) return false;
  const next = add ? [...cur, t] : cur.filter(x => x.toLowerCase() !== t.toLowerCase());
  S.working.setText(path, patchFrontmatter(text, { [key]: next.length ? next : undefined }));
  touch();
  return true;
}

/* ---------- cast, crowds and copies ---------- */
const npcLocationDef = () => fieldDefs('npc').find(f => f.key === 'location');

/* put someone under the session's cast heading. `create` makes a new NPC (at a place, when given) when the name is not one yet. */
export function addToSessionCast(sessionPath, name, { create = false, at = '' } = {}) {
  const idx = getIndex();
  const session = idx.byPath.get(sessionPath);
  const text = String(name || '').trim();
  if (!session || !text) return null;
  let who = idx.resolve(text);
  let made = false;
  if (!who) {
    if (!create) return null;
    const fm = at ? { location: toStored(npcLocationDef(), at) } : {};
    createNote('npc', text, { fm });
    who = getIndex().resolve(text);
    made = true;
    if (!who) return null;
  }
  const cur = getIndex().byPath.get(sessionPath);
  const r = addToCast(cur.body, who.name);
  if (r.body !== cur.body.replace(/\r\n/g, '\n')) saveNoteEdit(sessionPath, { body: r.body });
  return { name: who.name, heading: r.heading, madeHeading: r.created, made, dup: !!r.dup, line: r.line };
}

/* make the rolled people NPC notes placed at a place */
export function populatePlace(placeName, people) {
  const def = npcLocationDef();
  let n = 0;
  for (const p of people) {
    createNote('npc', p.name, { fm: Object.assign({}, p.fm, { location: toStored(def, placeName) }), body: p.body });
    n++;
  }
  return n;
}

/* a copy of a note, beside it, named "Name (copy)"; opens the copy */
export function duplicateNote(path) {
  const idx = getIndex();
  const n = idx.byPath.get(path);
  const text = S.working.get(path);
  if (!n || text === undefined) return null;
  const name = copyName(n.name, idx.notes.map(x => x.name));
  const dir = dirname(path);
  let np = join(dir, sanitizeName(name) + '.md');
  for (let i = 2; S.working.has(np) && i < 200; i++) np = join(dir, sanitizeName(name) + ' ' + i + '.md');
  S.working.create(np, copyText(text, n.name, basename(np).replace(/\.md$/i, '')));
  touch();
  goto(np);
  return np;
}

/* show a note in the other pane and leave the focus where it was, so a session stays in front of you while you read an NPC or a player.
   One pane only? It becomes two columns first. */
export function openBeside(path) {
  const n = getIndex().byPath.get(path);
  if (!n) return false;
  if (S.layout === 'single') setLayout('two');
  const from = S.activePane | 0;
  // table mode (a big pane and two on the right): players go to the party pane, everything else to the NPC pane
  const to = S.layout === 'prep' ? (from !== 0 ? 0 : n.type === 'player' ? 1 : 2) : (from === 0 ? 1 : 0);
  const t = S.tabs.find(x => x.id === S.paneActive[to]) || S.tabs.find(x => (x.pane | 0) === to);
  if (!t) return false;
  t.section = sectionForType(n.type); t.selected = path; t.editing = false; t.asset = null;
  pushRecent(path);
  emit();
  return true;
}

/* Table mode: the session big on the left, the Party page top right, the NPC list bottom right. Chips on the session's cast strip then
   show a player in the party pane and an NPC in the NPC pane, without the session losing its place. */
export function tableMode() {
  const idx = getIndex();
  const cur = S.selected && idx.byPath.get(S.selected);
  const session = cur && cur.type === 'session' ? cur.path : currentSessionPath();
  if (S.layout !== 'prep') setLayout('prep');
  const pane = p => S.tabs.find(x => x.id === S.paneActive[p]);
  const show = (p, patch) => { const t = pane(p); if (t) Object.assign(t, { section: 'overview', selected: null, editing: false, asset: null }, patch); };
  const t0 = pane(0);
  if (session && !(t0 && t0.editing)) show(0, { section: 'session', selected: session });
  show(1, { section: 'party' });
  show(2, { section: 'npc' });
  S.activePane = 0; S.activeTab = S.paneActive[0];
  emit();
  if (!session) toast('Table mode is set up. Make a session to see it in the big pane.');
}

/* ---------- undo the last push, the trash, and switching versions (these three need the helper, or the vault's own trash) ---------- */
export async function refreshUndo() {
  const v = S.vault;
  if (!v || !v.undoInfo) return;
  try { const i = await v.undoInfo(); set({ undo: i.available || null }); } catch (e) { /* the helper may be restarting */ }
}
export async function askUndoPush() {
  const v = S.vault;
  if (!v || !v.undoInfo) { toast('Undoing a push needs the helper (Start DM Forge.command), which keeps the old text of every note it writes.', true); return; }
  let i;
  try { i = await v.undoInfo(); } catch (e) { toast('Could not check: ' + errMsg(e), true); return; }
  const a = i.available;
  set({ undo: a || null });
  if (!a) { toast('Nothing to undo yet. The helper keeps the last 10 pushes from now on.'); return; }
  const parts = [];
  if (a.written) parts.push(a.written + ' note' + (a.written === 1 ? '' : 's') + ' written');
  if (a.trashed) parts.push(a.trashed + ' moved to the trash');
  set({ dialog: { kind: 'confirm', danger: true, title: 'Undo the last push?', confirmLabel: 'Undo that push',
    body: 'On ' + new Date(a.time).toLocaleString() + ' you pushed ' + parts.join(' and ') + '. This puts those notes back as they were before that push: notes it changed go back, notes it created move to the vault’s trash, notes it deleted come back. Your other notes and your unpushed changes are not touched.',
    onConfirm: () => doUndoPush(false) } });
}
async function doUndoPush(force) {
  const v = S.vault;
  let r;
  try { r = await v.undoPush(force); } catch (e) { toast('Could not undo: ' + errMsg(e), true); return; }
  if (r.conflicts && r.conflicts.length) {
    set({ dialog: { kind: 'confirm', danger: true, title: 'Some notes changed after that push', confirmLabel: 'Undo anyway',
      body: r.conflicts.slice(0, 6).map(x => basename(x).replace(/\.md$/i, '')).join(', ') + (r.conflicts.length > 6 ? ' and ' + (r.conflicts.length - 6) + ' more' : '') + ' ' + (r.conflicts.length === 1 ? 'was' : 'were') + ' changed again (in DM Forge or Obsidian) after that push. Undoing puts the older text back and loses those later changes. Nothing has been changed yet.',
      onConfirm: () => doUndoPush(true) } });
    return;
  }
  set({ undo: null, review: null });
  await reloadCampaign();
  toast('Undid the push: ' + r.restored + ' note' + (r.restored === 1 ? '' : 's') + ' put back' + (r.removed ? ', ' + r.removed + ' new note' + (r.removed === 1 ? '' : 's') + ' moved to the trash' : '') + '.');
  refreshUndo();
}

/* the vault's trash, for this campaign: what is in it and putting a note back */
export async function listTrash() {
  const v = S.vault;
  if (!v || !v.trashList || !S.campaign) return [];
  const all = await v.trashList();
  const prefix = S.campaign.path + '/';
  return all.map(x => ({ ...x, original: trashOriginal(x.path) })).filter(x => x.original.startsWith(prefix));
}
export async function restoreFromTrash(path) {
  const to = await S.vault.trashRestore(path);
  return to;
}

export function askSwitchVersion(dir, info) {
  const target = dir === 'forward' ? info.forward : info.previous;
  const pend = S.working ? S.working.count : 0;
  set({ dialog: { kind: 'confirm', danger: dir !== 'forward', title: (dir === 'forward' ? 'Go forward to ' : 'Go back to ') + 'version ' + target + '?',
    confirmLabel: dir === 'forward' ? 'Go forward and restart' : 'Roll back and restart',
    body: 'DM Forge swaps its own files for version ' + target + ', restarts the helper in the same Terminal window and reloads this page. Your notes and settings are not touched' + (pend ? ', and your ' + pend + ' unpushed change' + (pend === 1 ? ' is' : 's are') + ' kept' : '') + '. You can switch back from the Menu whenever you like.',
    onConfirm: () => switchVersion(dir) } });
}
export async function switchVersion(dir) {
  const v = S.vault;
  if (!v || !v.switchVersion || S.updating) return;
  set({ updating: true });
  try { await v.switchVersion(dir); } catch (e) { set({ updating: false }); toast('Could not switch version: ' + errMsg(e), true); return; }
  await waitForRestart(v);
}

/* ---------- at the table and in prep (2.40) ---------- */
/* Live: one session at a time is live (S.live is that session's path, or ''), remembered for the campaign. Going live on another session
   moves Live to it. Going live also points the log box at that session, so the two agree. */
const liveKey = () => 'dmforge:live:' + (S.vaultKey || '') + '|' + (S.campaign ? S.campaign.path : '');
const saveLive = () => { try { if (S.live) localStorage.setItem(liveKey(), S.live); else localStorage.removeItem(liveKey()); } catch (e) { /* storage unavailable */ } };
export function loadLive() {
  let v = '';
  try { v = localStorage.getItem(liveKey()) || ''; } catch (e) { v = ''; }
  const idx = getIndex();
  const n = v && idx ? idx.byPath.get(v) : null;
  S.live = n && n.type === 'session' ? v : '';
}
export const isLive = path => !!path && S.live === path;
/* the session Live belongs to when none is named: the session page that is open, else the one the log box is pointed at */
export function liveTarget() {
  const idx = getIndex();
  const n = S.selected && idx ? idx.byPath.get(S.selected) : null;
  return n && n.type === 'session' ? n.path : currentSessionPath();
}
/* setLive(path): that session is live; setLive(true): the open (or current) session; setLive(false) or '': none */
export function setLive(on, path) {
  const target = typeof on === 'string' ? on : on ? (path || liveTarget()) : '';
  try { localStorage.removeItem(modeKey(target || S.live || '')); } catch (e) { /* storage unavailable */ }      // going Live (or ending it) lets the mode follow what is happening
  S.live = target || '';
  saveLive();
  if (S.live) setCurrentSession(S.live);
  set({ live: S.live });
}
export const toggleLive = path => setLive(S.live === path ? '' : path);

/* ---------- a session page's mode: Prep, Run or Wrap up ---------- */
export const SESSION_MODES = [['prep', 'Prep'], ['run', 'Run'], ['wrap', 'Wrap up']];
const modeKey = p => 'dmforge:mode:' + S.vaultKey + '|' + p;
const modeOverride = p => { try { const v = localStorage.getItem(modeKey(p)); return v === 'prep' || v === 'run' || v === 'wrap' ? v : ''; } catch (e) { return ''; } };
/* what the session is doing now: live, a fight under way or the timer running is Run; a log with lines in it (and nothing running) is Wrap up; otherwise Prep */
export function autoSessionMode(note) {
  if (S.live === note.path) return 'run';
  if (S.combat && S.combatTarget === note.path) return 'run';
  if (S.timer && S.timer.run && currentSessionPath() === note.path) return 'run';
  const sp = splitFrontmatter(S.working.get(note.path) || '');
  if (parseLog(sp.body).length || /<!-- dmforge:(?:dm-recap|tidy)/.test(sp.body)) return 'wrap';
  return 'prep';
}
/* the mode shown: the one you chose for this session, else the automatic one. Going Live puts you in Run, and taking it off lets it go automatic again. */
export const sessionMode = note => modeOverride(note.path) || autoSessionMode(note);
export function setSessionMode(path, mode) {
  try { if (mode) localStorage.setItem(modeKey(path), mode); else localStorage.removeItem(modeKey(path)); } catch (e) { /* storage unavailable */ }
  emit();
}

/* Improvise an NPC: a roll to look at, then Save makes the NPC note (placed at the session's first place, or the one you pick),
   links them under the session's cast heading and logs that they were met. */
export function rollImprov() {
  const g = GENERATORS.find(x => x.id === 'npc');
  const used = new Set();
  const r = rollOne(getIndex(), g, used);
  return r;
}
export function saveImprov(roll, { at = '', sessionPath = '' } = {}) {
  const def = fieldDefs('npc').find(f => f.key === 'location');
  const fm = Object.assign({}, roll.fm, at ? { location: toStored(def, at) } : {});
  const path = createNote('npc', roll.name, { fm, body: roll.body });
  const who = getIndex().resolve(roll.name);
  if (sessionPath && who) addToSessionCast(sessionPath, who.name, { create: false });
  if (who && currentSessionPath()) logLine('Met [[' + who.name + ']]' + (roll.role ? ', ' + String(roll.role).toLowerCase() : ''), 'npc');
  return path;
}

/* create a note from the log box: the NPC goes to the first place the session mentions */
export function createFromLog(type, name, at = '') {
  const def = fieldDefs('npc').find(f => f.key === 'location');
  const fm = type === 'npc' && at ? { location: toStored(def, at) } : {};
  createNote(type, name, { fm });
  return getIndex().resolve(name);
}

/* move a section of a note up or down (the outline) */
export function moveSectionIn(path, line, dir) {
  const n = getIndex().byPath.get(path);
  if (!n) return false;
  const body = moveSection(n.body, line, dir);
  if (body === null) return false;
  saveNoteEdit(path, { body });
  return true;
}

const MUST_BLOCK = ['> [!important]+ MUST HAPPEN', '> ', '> - [ ] ', '> - [ ] ', '> - [ ] '].join('\n');
export function addMustBlock(path) {
  const n = getIndex().byPath.get(path);
  if (!n) return false;
  const r = placeTemplate(n.body.replace(/\r\n/g, '\n'), 'must', MUST_BLOCK);
  saveNoteEdit(path, { body: r.text });
  return true;
}

/* prepared encounters live in the session note (see core/encounters.js) */
export function saveEncounterTo(sessionPath, title, items) {
  const n = getIndex().byPath.get(sessionPath);
  if (!n || !items.length) return false;
  saveNoteEdit(sessionPath, { body: addEncounter(n.body, title, items) });
  return true;
}
export function deleteEncounterFrom(sessionPath, start) {
  const n = getIndex().byPath.get(sessionPath);
  if (!n) return false;
  const enc = parseEncounters(n.body).find(e => e.start === start);
  if (!enc) return false;
  saveNoteEdit(sessionPath, { body: removeEncounter(n.body, enc) });
  return true;
}
/* change a prepared encounter in place: its name and its creatures (quantity, which creature, more, fewer) */
export function editEncounterIn(sessionPath, start, title, items) {
  const n = getIndex().byPath.get(sessionPath);
  if (!n || !items.length) return false;
  const enc = parseEncounters(n.body).find(e => e.start === start);
  if (!enc) return false;
  const body = replaceEncounter(n.body, enc, title, items);
  if (body === n.body.replace(/\r\n/g, '\n')) return true;
  saveNoteEdit(sessionPath, { body });
  return true;
}
/* run a prepared encounter: its monsters go into the fight (one is started if there is none), logging to this session */
export function runEncounterFrom(sessionPath, found) {
  const n = addMonstersToCombat(found.map(x => ({ m: x.m, qty: x.qty })));
  set({ combatTarget: sessionPath });
  setSection('combat');
  return n;
}
export function loadEncounterToBudget(found) {
  setEncounter(found.map(x => ({ key: x.m.key, qty: x.qty })));
  setSection('party');
}


/* ---------- a campaign's own accent colour (core/accent.js) ---------- */
const accentStoreKey = () => 'dmforge:accent:' + S.vaultKey + '|' + (S.campaign ? S.campaign.path : '');
function paintAccent(key) {
  const k = accentKey(key);
  if (k === 'gold') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent = k;
}
export function loadAccent() {
  let k = 'gold';
  try { k = accentKey(localStorage.getItem(accentStoreKey())); } catch (e) { /* storage unavailable */ }
  S.accent = k;
  paintAccent(k);
}
export function setAccent(key) {
  const k = accentKey(key);
  try { if (k === 'gold') localStorage.removeItem(accentStoreKey()); else localStorage.setItem(accentStoreKey(), k); } catch (e) { /* storage unavailable */ }
  paintAccent(k);
  set({ accent: k });
}
export { ACCENTS };
