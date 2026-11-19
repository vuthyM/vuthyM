/* The item part of the library: magic items kept as plain markdown files in "Character Library/Items", apart from any campaign.
   Start from the SRD 5.2.1 magic items (265, loaded when first needed), from the random generator, or from nothing, and shape the
   item in the builder. The file reads as a normal item note in Obsidian; what the builder needs to reopen it is in one hidden comment.

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { ITEMS_GZ_B64 } from '../data/srd-items.js';
import { LIB_FOLDER } from './chardata.js';
import { serializeKV, splitFrontmatter } from './frontmatter.js';
import { metricize } from './units.js';
import { SRD_CREDIT } from './monsters.js';
import { makeMagicItem, typeLine, itemName } from './items.js';
import { today, join, stem } from './util.js';

export const ITEM_FOLDER = LIB_FOLDER + '/Items';
export const ATTUNE_MAX = 3;
export const KINDS = [['weapon', 'Weapon'], ['armor', 'Armor'], ['ring', 'Ring'], ['wand', 'Wand'], ['staff', 'Staff'], ['rod', 'Rod'], ['potion', 'Potion'], ['scroll', 'Scroll'], ['wondrous', 'Wondrous item'], ['other', 'Other']];
export const KIND_NAME = Object.fromEntries(KINDS);
export const RARITY = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary', 'Artifact'];
export const RECHARGE = ['', 'Dawn', 'Dusk', 'Long rest', 'Short rest', 'Weekly', 'Never'];
const STATE_RE = /<!--\s*dmforge:item\s+([\s\S]*?)\s*-->/;
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ---------- the SRD magic items ---------- */
let srd = null, loading = null;
export const srdItemsLoaded = () => srd;
export function loadSrdItems() {
  if (srd) return Promise.resolve(srd);
  if (!loading) {
    loading = (async () => {
      const bin = atob(ITEMS_GZ_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      srd = JSON.parse(text);
      return srd;
    })().catch(e => { loading = null; throw e; });
  }
  return loading;
}
export function searchSrdItems(list, { q = '', kind = '', rarity = '' } = {}) {
  const s = String(q || '').trim().toLowerCase();
  return list.filter(i => (!kind || i.k === kind) && (!rarity || i.r === rarity) && (!s || i.n.toLowerCase().includes(s) || (i.v || []).some(v => v.toLowerCase().includes(s))));
}

/* ---------- the item being built ---------- */
export function blankItem() {
  return { v: 1, name: '', kind: 'wondrous', base: '', rarity: 'Uncommon', attune: false, attuneNote: '', bonus: 0, ac: 0, damage: '', charges: 0, recharge: '', value: '', desc: '', props: [], curse: '', history: '', hook: '', from: '' };
}
/* a builder item from an SRD one (variant: which weapon or armour, when the entry covers several) */
export function itemFromSrd(r, variant = '') {
  const it = blankItem();
  it.name = variant && /^Weapon, \+|^Armor, \+|^Ammunition/.test(r.n) ? (r.n.startsWith('Ammunition') ? variant + ' ' + r.n : variant + ' ' + r.n.replace(/^(Weapon|Armor), /, '').trim()) : r.n;
  const plus = /\+(\d)/.exec(r.n);
  if (/^Weapon, \+|^Armor, \+/.test(r.n) && variant) it.name = variant + ' (+' + plus[1] + ')';
  it.kind = r.k; it.rarity = r.r; it.attune = !!r.a;
  it.base = variant || '';
  if (plus && /^(Weapon|Armor), \+|\(\+\d\)$/.test(r.n)) { if (r.k === 'armor') it.ac = Number(plus[1]); else it.bonus = Number(plus[1]); }
  it.desc = metricize(r.d);
  const acb = /\+(\d) bonus to (?:your )?(?:Armor Class|AC)\b/i.exec(r.d);
  if (acb && !it.ac && r.k !== 'weapon') it.ac = Number(acb[1]);
  it.from = 'SRD 5.2.1';
  return it;
}
/* from the random magic item generator */
export function itemFromGenerated(g) {
  const it = blankItem();
  it.name = itemName(g.kind, g.base, g.rarity);
  it.kind = g.kind; it.base = g.base || ''; it.rarity = g.rarity; it.attune = !!g.attune;
  it.desc = g.effect || ''; it.curse = g.cursed ? g.curse : ''; it.history = g.history || ''; it.hook = g.hook || '';
  it.value = g.value ? String(g.value) : '';
  it.props = g.quirk ? [{ n: 'Quirk', t: g.quirk }] : [];
  it.from = 'Random generator';
  return it;
}
export function rollItem(opts) { return itemFromGenerated(makeMagicItem(opts)); }

export function typeLineOf(it) {
  const k = KIND_NAME[it.kind] || 'Item';
  return k + (it.base ? ' (' + it.base + ')' : '') + ', ' + String(it.rarity || '').toLowerCase() + (it.attune ? ' (requires attunement' + (oneLine(it.attuneNote) ? ' ' + oneLine(it.attuneNote) : '') + ')' : '');
}
export function itemProblem(it) {
  if (!oneLine(it.name)) return 'Give the item a name first.';
  return '';
}
export const itemFileName = it => String(it.name || '').replace(/[\\/:*?"<>|#^\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);

/* ---------- the file ---------- */
export function itemFrontmatter(it) {
  const fm = {
    type: 'item', kind: typeLineOf(it), rarity: it.rarity, form: it.kind, attunement: it.attune ? true : '',
    bonus: it.bonus || '', ac_bonus: it.ac || '', damage: oneLine(it.damage), charges: it.charges || '', recharge: it.charges ? it.recharge : '', value: oneLine(it.value),
    source: 'DM Forge Item Library', updated: today(),
  };
  return fm;
}
export function itemMarkdown(it) {
  const L = ['---'];
  for (const [k, v] of Object.entries(itemFrontmatter(it))) if (v !== '' && v !== 0) L.push(...serializeKV(k, v));
  L.push('---', '');
  L.push('# ' + (oneLine(it.name) || 'Unnamed item'), '');
  L.push('*' + typeLineOf(it) + '*', '');
  const facts = [];
  if (it.bonus) facts.push('**Bonus** +' + it.bonus + ' to attack and damage rolls');
  if (it.ac) facts.push('**Armor Class** +' + it.ac);
  if (oneLine(it.damage)) facts.push('**Extra damage** ' + oneLine(it.damage));
  if (it.charges) facts.push('**Charges** ' + it.charges + (it.recharge && it.recharge !== 'Never' ? ', regains some at ' + it.recharge.toLowerCase() : it.recharge === 'Never' ? ', does not recharge' : ''));
  if (oneLine(it.value)) facts.push('**Value** ' + oneLine(it.value));
  if (facts.length) L.push(facts.join(' · '), '');
  if (String(it.desc).trim()) L.push(String(it.desc).trim(), '');
  for (const p of it.props || []) if (oneLine(p.n) || oneLine(p.t)) L.push('**' + (oneLine(p.n) || 'Property') + '.** ' + String(p.t || '').trim(), '');
  if (String(it.curse).trim()) L.push('## Curse', '', String(it.curse).trim(), '');
  const gm = [['History', it.history], ['Hook', it.hook]].filter(r => String(r[1] || '').trim());
  if (gm.length) { L.push('## For the DM', ''); for (const [k, v] of gm) L.push('**' + k + '.** ' + String(v).trim(), ''); }
  if (it.from === 'SRD 5.2.1') L.push('---', '_' + SRD_CREDIT.replace(/^This work includes material from /, 'Includes material from ') + '_', '');
  L.push('<!-- dmforge:item ' + JSON.stringify(it).replace(/>/g, '\\u003e').replace(/--/g, '-\\u002d') + ' -->', '');
  return metricize(L.join('\n'));
}
export function parseItemFile(text) {
  const sp = splitFrontmatter(text);
  const m = STATE_RE.exec(sp.body);
  let state = null;
  if (m) { try { const v = JSON.parse(m[1]); if (v && typeof v === 'object' && v.kind) state = v; } catch (e) { /* plain note */ } }
  return { fm: sp.fm, state, body: sp.body };
}
export function itemFromText(text, name) {
  const { state } = parseItemFile(text);
  if (!state) return null;
  return Object.assign(blankItem(), state, { name: name || state.name || '' });
}

/* ---------- the folder ---------- */
const isMd = e => e.kind !== 'dir' && /\.md$/i.test(e.name) && !e.name.startsWith('.');
export async function listItems(vault) {
  let entries = [];
  try { entries = await vault.list(ITEM_FOLDER); } catch (e) { return []; }
  const out = [];
  for (const e of entries.filter(isMd)) {
    const path = join(ITEM_FOLDER, e.name);
    try { const p = parseItemFile(await vault.readText(path)); out.push({ path, name: stem(path), fm: p.fm, hasState: !!p.state, state: p.state }); } catch (err) { /* unreadable: left out */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export const itemPath = it => join(ITEM_FOLDER, itemFileName(it) + '.md');
export async function saveItem(vault, it, { oldPath = '' } = {}) {
  const bad = itemProblem(it);
  if (bad) throw new Error(bad);
  const name = itemFileName(it);
  const path = join(ITEM_FOLDER, name + '.md');
  if (path !== oldPath && (await vault.exists(path))) throw new Error('There is already an item called “' + name + '” in the library.');
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  await vault.mkdir(LIB_FOLDER);
  await vault.mkdir(ITEM_FOLDER);
  await vault.writeText(path, itemMarkdown(Object.assign({}, it, { name })));
  if (oldPath && oldPath !== path && (await vault.exists(oldPath))) await vault.moveToTrash(oldPath);
  return path;
}
export async function loadItem(vault, path) {
  const text = await vault.readText(path);
  return { text, it: itemFromText(text, stem(path)) };
}
export async function deleteItem(vault, path) {
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  await vault.moveToTrash(path);
}
export async function copyItemName(vault, name) {
  for (let i = 1; i < 100; i++) {
    const n = name + ' copy' + (i > 1 ? ' ' + i : '');
    if (!(await vault.exists(join(ITEM_FOLDER, n + '.md')))) return n;
  }
  return name + ' copy ' + Date.now();
}

/* ---------- carried by a character ---------- */
/* a character's list entry from a library item: { n, req (needs attunement), attuned, ac (bonus to Armor Class) } */
export function carriedFrom(it) {
  return { n: it.name, req: !!it.attune, attuned: false, ac: Number(it.ac) || 0, rarity: it.rarity, kind: it.kind };
}
export const attunedCount = c => (c.items || []).filter(i => i.attuned).length;
/* Armor Class from magic items worn: those needing attunement only count once attuned */
export function magicAc(c) { return (c.items || []).filter(i => i.ac && (!i.req || i.attuned)).reduce((t, i) => t + (Number(i.ac) || 0), 0); }
export { typeLine };
