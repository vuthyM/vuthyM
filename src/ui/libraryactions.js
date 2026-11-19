/* The Character Library screen: what it is showing, the character being made, and what saving does. */
import { S, set, emit, toast, touch, getIndex } from './store.js';
import { loadChars } from '../core/chardata.js';
import { loadSpells } from '../core/spells.js';
import { blankCharacter, characterMarkdown, fitSpells, suggestScores, rollScores, firstSub, standardArrayProblem, pointsLeft, characterFromText } from '../core/character.js';
import { listCharacters, saveCharacter, loadCharacter, deleteCharacter, copyName, looseExamples, moveToExamples, removeExamples } from '../core/library.js';
import { EXAMPLE_CHARS } from '../core/showcase.js';
import { secFor } from '../core/chardata.js';
import { stem, join } from '../core/util.js';
import { listItems, saveItem, loadItem, deleteItem, copyItemName, blankItem, itemFromSrd, rollItem, loadSrdItems, carriedFrom, itemMarkdown, ITEM_FOLDER, ATTUNE_MAX } from '../core/itemlib.js';
import { preview, applyLevelUp, problems, MAX_LEVEL, expertiseChoices } from '../core/levelup.js';
import { spellInfo } from '../core/character.js';
import { newNotePath } from '../core/campaign.js';
import { campaignNoteText, typeForCharacter } from '../core/libimport.js';

const errMsg = e => (e && e.message) ? e.message : String(e);
export const lib = () => S.lib;

/* where "Back" goes: the campaign picker or the open campaign */
export function openLibrary(back) {
  if (!S.vault) { toast('Open your vault first.', true); return; }
  S.lib = { back: back || (S.campaign ? 'app' : 'browse'), list: null, data: null, spells: null, err: '', view: 'list', loose: [], showExamples: false, c: null, step: 0, path: '', dirty: false, q: '', kind: '', sheet: 'sheet', text: '', depthMore: {}, collapsed: {}, spellQ: '', spellLv: '',
    tab: 'chars', itemList: null, srd: null, it: null, itemPath: '', itemView: 'list', itemDirty: false, itemQ: '', itemKind: '', itemRarity: '', srdQ: '', srdKind: '', srdRarity: '', lu: null, imp: null, gearQ: '' };
  set({ screen: 'library' });
  libReload();
  loadSpells().then(sp => { if (S.lib) { S.lib.spells = sp; if (S.lib.c && S.lib.data) fitSpells(S.lib.data, S.lib.c, sp); emit(); } }).catch(() => {});
}

export async function libReload() {
  const L = S.lib;
  if (!L) return;
  try {
    L.data = await loadChars();
    L.list = await listCharacters(S.vault);
    L.loose = await looseExamples(S.vault, EXAMPLE_CHARS);
    L.itemList = await listItems(S.vault);
    L.err = '';
  } catch (e) { L.err = errMsg(e); L.list = L.list || []; }
  emit();
}

export function closeLibrary() {
  const L = S.lib;
  const go = () => { const back = L && L.back === 'app' && S.campaign ? 'app' : 'browse'; set({ screen: back }); };
  if (L && L.view === 'edit' && L.dirty) {
    set({ dialog: { kind: 'confirm', title: 'Leave without saving?', body: 'The character you are making has changes that are not saved.', confirmLabel: 'Leave', danger: true, onConfirm: go } });
  } else go();
}

/* ---------- making and editing ---------- */
export function libNew(kind = 'pc') {
  const L = S.lib;
  if (!L || !L.data) return;
  L.c = blankCharacter(L.data, kind);
  L.path = ''; L.step = 0; L.dirty = false; L.view = 'edit'; L.sheet = 'sheet';
  emit();
}

export async function libEdit(path) {
  const L = S.lib;
  if (!L || !L.data) return;
  try {
    const { c, text } = await loadCharacter(S.vault, L.data, path);
    if (!c) { toast('That file was not made by the creator, so it can only be viewed. Open it in Obsidian to change it.', true); return libOpen(path); }
    if (L.spells) fitSpells(L.data, c, L.spells);
    L.c = c; L.path = path; L.step = 0; L.dirty = false; L.view = 'edit'; L.text = text;
    emit();
  } catch (e) { toast('Could not read that file: ' + errMsg(e), true); }
}

export async function libOpen(path) {
  const L = S.lib;
  if (!L || !L.data) return;
  try {
    const { c, text } = await loadCharacter(S.vault, L.data, path);
    L.c = c; L.path = path; L.text = text; L.view = 'sheet'; L.sheet = c ? 'sheet' : 'file';
    emit();
  } catch (e) { toast('Could not read that file: ' + errMsg(e), true); }
}

export function libBackToList() {
  const L = S.lib;
  const go = () => { L.view = 'list'; L.c = null; L.path = ''; L.dirty = false; emit(); libReload(); };
  if (L.view === 'edit' && L.dirty) set({ dialog: { kind: 'confirm', title: 'Leave without saving?', body: 'The character you are making has changes that are not saved.', confirmLabel: 'Leave', danger: true, onConfirm: go } });
  else go();
}

export async function libSave({ stay = false } = {}) {
  const L = S.lib;
  if (!L || !L.c) return false;
  try {
    const path = await saveCharacter(S.vault, L.data, L.c, { oldPath: L.path });
    L.path = path; L.dirty = false;
    toast('Saved ' + path + '.');
    if (!stay) { L.view = 'list'; L.c = null; L.path = ''; await libReload(); }
    emit();
    return true;
  } catch (e) { toast(errMsg(e), true); return false; }
}

export function libDelete(path) {
  set({ dialog: { kind: 'confirm', title: 'Delete this character?', body: stem(path) + ' moves to your vault’s trash folder. Copies already imported into a campaign are not touched.', confirmLabel: 'Delete', danger: true, onConfirm: async () => {
    try { await deleteCharacter(S.vault, path); toast('Deleted ' + stem(path) + '.'); const L = S.lib; if (L) { if (L.path === path) { L.view = 'list'; L.c = null; L.path = ''; } await libReload(); } } catch (e) { toast(errMsg(e), true); }
  } } });
}

export async function libDuplicate(path) {
  const L = S.lib;
  try {
    const { c } = await loadCharacter(S.vault, L.data, path);
    if (!c) { toast('Only characters made in the creator can be copied here.', true); return; }
    c.name = await copyName(S.vault, c.name || stem(path));
    if (L.spells) fitSpells(L.data, c, L.spells);
    await saveCharacter(S.vault, L.data, c, {});
    toast('Made ' + c.name + '.');
    await libReload();
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- the examples ---------- */
export function libToggleExamples() { const L = S.lib; if (L) { L.showExamples = !L.showExamples; emit(); } }
export async function libMoveLoose() {
  const L = S.lib;
  if (!L || !L.loose.length) return;
  try { const n = await moveToExamples(S.vault, L.loose); toast('Moved ' + n + ' example character' + (n === 1 ? '' : 's') + ' into Examples.'); L.showExamples = true; await libReload(); } catch (e) { toast(errMsg(e), true); }
}
export function libRemoveExamples() {
  const L = S.lib;
  const n = L && L.list ? L.list.filter(r => r.example).length : 0;
  set({ dialog: { kind: 'confirm', title: 'Remove the example characters?', body: n + ' example character' + (n === 1 ? '' : 's') + ' in Character Library/Examples move to your vault’s trash folder. Your own characters are not touched.', confirmLabel: 'Remove them', danger: true, onConfirm: async () => {
    try { const k = await removeExamples(S.vault); toast('Removed ' + k + ' example character' + (k === 1 ? '' : 's') + '.'); await libReload(); } catch (e) { toast(errMsg(e), true); }
  } } });
}

/* ---------- changing the draft ---------- */
const touchDraft = () => { S.lib.dirty = true; emit(); };
export function libSet(fn) { const L = S.lib; if (!L || !L.c) return; fn(L.c, L.data); touchDraft(); }

export function libSetClass(cls) {
  libSet((c, data) => {
    c.cls = cls; c.sub = firstSub(data, cls); c.skills = []; c.cantrips = []; c.prepared = []; c.kit = 'A';
    if (c.method === 'std') c.base = suggestScores(data, cls);
    fitSpells(data, c, S.lib.spells);
  });
}
export function libSetLevel(level) {
  libSet((c, data) => { c.level = level; fitSpells(data, c, S.lib.spells); });
}
export function libSetMethod(m) {
  libSet((c, data) => {
    c.method = m;
    if (m === 'std') c.base = suggestScores(data, c.cls);
    else if (m === 'buy') c.base = { Str: 8, Dex: 8, Con: 8, Int: 8, Wis: 8, Cha: 8 };
    else if (m === 'roll') { c.rolled = rollScores(); const r = c.rolled; c.base = {}; ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'].forEach((a, i) => { c.base[a] = r[i].total; }); }
    else c.base = { Str: 10, Dex: 10, Con: 10, Int: 10, Wis: 10, Cha: 10 };
  });
}
export function libSetKind(kind) {
  libSet(c => { c.kind = kind; const ids = secFor(kind).map(x => x.id); c.sections = c.sections.filter(id => ids.includes(id)); });
}
export { characterMarkdown, standardArrayProblem, pointsLeft, characterFromText };

/* ================= level up ================= */
export function luFresh(data, c, to) {
  return { to, hp: {}, asi: {}, expertise: [], cantrips: c.cantrips.slice(), prepared: c.prepared.slice(), spellQ: '', spellLv: '' };
}
export async function libLevelUp(path) {
  const L = S.lib;
  if (!L || !L.data) return;
  try {
    const { c, text } = await loadCharacter(S.vault, L.data, path);
    if (!c) { toast('That file was not made by the creator, so it cannot be levelled up here.', true); return; }
    if (c.level >= MAX_LEVEL) { toast(c.name + ' is already level ' + MAX_LEVEL + '.'); return; }
    if (L.spells) fitSpells(L.data, c, L.spells);
    L.c = c; L.path = path; L.text = text; L.dirty = false; L.lu = luFresh(L.data, c, c.level + 1); L.view = 'levelup';
    emit();
  } catch (e) { toast('Could not read that file: ' + errMsg(e), true); }
}
export function luSet(fn) { const L = S.lib; if (!L || !L.lu) return; fn(L.lu, L.c, L.data); emit(); }
export function luTo(to) {
  luSet((lu, c) => {
    to = Math.max(c.level + 1, Math.min(MAX_LEVEL, to));
    lu.to = to;
    for (const k of Object.keys(lu.hp)) if (Number(k) > to) delete lu.hp[k];
    for (const k of Object.keys(lu.asi)) if (Number(k) > to) delete lu.asi[k];
  });
}
export function luPreview() { const L = S.lib; return L && L.lu && L.c && L.data ? preview(L.data, L.c, L.lu.to) : null; }
export function luProblems() { const L = S.lib; const pv = luPreview(); return pv ? problems(L.data, L.c, pv, L.lu) : []; }
/* spell picks must fit the new level: cantrips and prepared spells within the caps, slot levels within reach */
export function luSpellCaps() {
  const L = S.lib;
  if (!L || !L.c) return null;
  return spellInfo(L.data, Object.assign({}, L.c, { level: L.lu.to }));
}
export async function libLevelConfirm() {
  const L = S.lib;
  if (!L || !L.lu) return false;
  const bad = luProblems();
  if (bad.length) { toast(bad[0], true); return false; }
  try {
    const n = applyLevelUp(L.data, L.c, L.lu, L.spells);
    const path = await saveCharacter(S.vault, L.data, n, { oldPath: L.path });
    toast(n.name + ' is now level ' + n.level + '.');
    L.c = n; L.path = path; L.lu = null; L.view = 'sheet'; L.sheet = 'sheet';
    const r = await loadCharacter(S.vault, L.data, path); L.text = r.text;
    await libReload();
    return true;
  } catch (e) { toast(errMsg(e), true); return false; }
}
export function libLevelCancel() { const L = S.lib; if (!L) return; L.lu = null; L.view = 'list'; L.c = null; L.path = ''; emit(); }

/* ================= items ================= */
export function libTab(tab) { const L = S.lib; if (!L) return; L.tab = tab; if (tab === 'items') { L.itemView = L.itemView === 'edit' ? 'edit' : 'list'; } emit(); }
export function libItemNew(base) {
  const L = S.lib; if (!L) return;
  L.tab = 'items'; L.it = base || blankItem(); L.itemPath = ''; L.itemDirty = !!base; L.itemView = 'edit'; emit();
}
export function libItemRoll(opts) { libItemNew(rollItem(opts)); }
export async function libItemEdit(path) {
  const L = S.lib; if (!L) return;
  try {
    const { it } = await loadItem(S.vault, path);
    if (!it) { toast('That file was not made by the item builder, so it can only be changed in Obsidian.', true); return; }
    L.tab = 'items'; L.it = it; L.itemPath = path; L.itemDirty = false; L.itemView = 'edit'; emit();
  } catch (e) { toast('Could not read that file: ' + errMsg(e), true); }
}
export function libItemSet(fn) { const L = S.lib; if (!L || !L.it) return; fn(L.it); L.itemDirty = true; emit(); }
export function libItemBack() {
  const L = S.lib; if (!L) return;
  const go = () => { L.itemView = 'list'; L.it = null; L.itemPath = ''; L.itemDirty = false; emit(); libReload(); };
  if (L.itemView === 'edit' && L.itemDirty) set({ dialog: { kind: 'confirm', title: 'Leave without saving?', body: 'The item you are making has changes that are not saved.', confirmLabel: 'Leave', danger: true, onConfirm: go } });
  else go();
}
export async function libItemSave({ stay = false } = {}) {
  const L = S.lib; if (!L || !L.it) return false;
  try {
    const path = await saveItem(S.vault, L.it, { oldPath: L.itemPath });
    L.itemPath = path; L.itemDirty = false;
    toast('Saved ' + path + '.');
    if (!stay) { L.itemView = 'list'; L.it = null; L.itemPath = ''; await libReload(); }
    emit();
    return true;
  } catch (e) { toast(errMsg(e), true); return false; }
}
export function libItemDelete(path) {
  set({ dialog: { kind: 'confirm', title: 'Delete this item?', body: stem(path) + ' moves to your vault’s trash folder. Copies already in a campaign or on a character are not touched.', confirmLabel: 'Delete', danger: true, onConfirm: async () => {
    try { await deleteItem(S.vault, path); toast('Deleted ' + stem(path) + '.'); await libReload(); } catch (e) { toast(errMsg(e), true); }
  } } });
}
export async function libItemCopy(path) {
  try {
    const { it } = await loadItem(S.vault, path);
    if (!it) { toast('Only items made in the builder can be copied here.', true); return; }
    it.name = await copyItemName(S.vault, it.name || stem(path));
    await saveItem(S.vault, it, {});
    toast('Made ' + it.name + '.');
    await libReload();
  } catch (e) { toast(errMsg(e), true); }
}
export async function libSrdLoad() {
  const L = S.lib; if (!L || L.srd) return;
  try { L.srd = await loadSrdItems(); emit(); } catch (e) { toast('Could not load the SRD items: ' + errMsg(e), true); }
}
export function libItemFromSrd(r, variant) { libItemNew(itemFromSrd(r, variant)); }

/* a character carries library items */
export function libCarry(it) {
  libSet(c => {
    c.items = c.items || [];
    if (c.items.some(x => x.n === it.name)) { toast(it.name + ' is already on this character.'); return; }
    c.items = [...c.items, carriedFrom(it)];
  });
}
export function libAttune(i) {
  libSet(c => {
    const x = c.items[i];
    if (!x.attuned && c.items.filter(y => y.attuned).length >= ATTUNE_MAX) { toast('A character can be attuned to ' + ATTUNE_MAX + ' items at once. Break one attunement first.'); return; }
    x.attuned = !x.attuned;
  });
}

/* ================= into a campaign ================= */
export const canImport = () => !!(S.campaign && S.working && S.vault);
export function libImportOpen(kind, path) {
  const L = S.lib; if (!L) return;
  if (!canImport()) { toast('Open a campaign first: this copies into the campaign you have open.', true); return; }
  L.imp = { kind, path, withItems: true, busy: false, done: null };
  emit();
}
export function libImportClose() { const L = S.lib; if (L) { L.imp = null; emit(); } }
async function addNote(type, name, text) {
  const idx = getIndex();
  const exists = idx.byName && idx.byName.get ? idx.byName.get(name.toLowerCase()) : null;
  const np = newNotePath(S.campaign, S.mapping, type, name, S.working);
  S.working.create(np.path, text);
  if (np.isNewFolder) S.mapping = Object.assign({}, S.mapping, { [np.folder]: type });
  return { path: np.path, dup: !!exists };
}
export async function libImportRun() {
  const L = S.lib;
  if (!L || !L.imp || L.imp.busy) return;
  L.imp.busy = true; emit();
  const added = [];
  try {
    const { kind, path, withItems } = L.imp;
    const text = await S.vault.readText(path);
    if (kind === 'item') {
      const r = await addNote('item', stem(path), campaignNoteText(text, 'item', path));
      added.push(r);
    } else {
      const { c } = await loadCharacter(S.vault, L.data, path);
      const fmKind = c ? c.kind : 'pc';
      const type = typeForCharacter({ kind: fmKind });
      if (withItems && c && c.items && c.items.length) {
        for (const i of c.items) {
          const row = (L.itemList || []).find(x => x.name === i.n);
          if (!row) continue;
          const have = getIndex().resolve ? getIndex().resolve(i.n) : null;
          if (have) continue;
          added.push(await addNote('item', i.n, campaignNoteText(await S.vault.readText(row.path), 'item', row.path)));
        }
      }
      added.push(await addNote(type, stem(path), campaignNoteText(text, type, path)));
    }
    touch();
    L.imp.done = added;
  } catch (e) { toast(errMsg(e), true); }
  L.imp.busy = false; emit();
}
export function libImportShow(path) {
  libImportClose();
  const L = S.lib; if (!L) return;
  S.lib = null;
  set({ screen: 'app' });
  import('./actions.js').then(A => { try { A.openNotePath ? A.openNotePath(path) : A.goto(path); } catch (e) { /* the note opens from the sidebar */ } });
}
