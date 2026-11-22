/* Moving your settings from one browser (or one way of running DM Forge) to another.

   Everything DM Forge remembers about how you like things lives in the browser it runs in: the theme, fonts, layout, favourites, how each list
   is sorted, the folder-to-type guesses, where you left off. A new address (your server) is a new browser store, so it starts empty.
   This packs the settings into one small file and unpacks it on the other side.

   Not included: unpushed changes (they belong to the notes, not to settings), a fight in progress, the timer, and anything that is
   only about this one device. Settings that belong to one vault and campaign carry the vault's key in their name
   ("dmforge:favs:http:My Vault|Ashfall"); on the way in that key is swapped for the new vault's, so they follow you across. */

export const BUNDLE_APP = 'dmforge-settings';

/* kept as they are: not tied to a vault */
const GLOBAL = new Set(['dmforge:settings', 'dmforge:theme', 'dmforge:claude', 'dmforge:dice', 'dmforge:startcard', 'dmforge:tour', 'dmforge:partymoney', 'dmforge:sp-cast']);
/* tied to a vault, but not worth moving: they describe a moment, not a preference */
const SKIP = ['dmforge:combat:', 'dmforge:timer:', 'dmforge:live:', 'dmforge:logsession:', 'dmforge:encounter:', 'dmforge:mode:', 'dmforge:seq:', 'dmforge:device'];

/* does this key belong to the vault with this key? ("…:vk|…", "…|vk|…", or ending in ":vk") */
export function belongsTo(key, vk) {
  if (!vk) return false;
  for (let i = key.indexOf(vk); i >= 0; i = key.indexOf(vk, i + 1)) {
    const before = i === 0 ? '' : key[i - 1];
    const after = key[i + vk.length];
    if ((before === ':' || before === '|') && (after === '|' || after === undefined)) return true;
  }
  return false;
}

export function swapVault(key, from, to) {
  for (let i = key.indexOf(from); i >= 0; i = key.indexOf(from, i + 1)) {
    const before = i === 0 ? '' : key[i - 1];
    const after = key[i + from.length];
    if ((before === ':' || before === '|') && (after === '|' || after === undefined)) return key.slice(0, i) + to + key.slice(i + from.length);
  }
  return key;
}

/* local: { key: string } from localStorage; idb: { key: value } for the "mapping|…" entries */
export function buildBundle({ local, idb, vaultKey, version, now = Date.now() }) {
  const l = {}, d = {};
  for (const [k, v] of Object.entries(local || {})) {
    if (typeof v !== 'string' || !k.startsWith('dmforge:') || SKIP.some(s => k.startsWith(s))) continue;
    if (GLOBAL.has(k) || belongsTo(k, vaultKey)) l[k] = v;
  }
  for (const [k, v] of Object.entries(idb || {})) {
    if (k.startsWith('mapping|') && belongsTo(k, vaultKey)) d[k] = v;
  }
  return { app: BUNDLE_APP, format: 1, version: version || '', vaultKey: vaultKey || '', exported: now, local: l, idb: d };
}

export function parseBundle(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { return { error: 'That file is not a DM Forge settings file (it is not readable).' }; }
  if (!o || o.app !== BUNDLE_APP || typeof o.local !== 'object' || !o.local) return { error: 'That file is not a DM Forge settings file.' };
  if (o.format !== 1) return { error: 'That settings file is from a newer DM Forge. Update first.' };
  const n = Object.keys(o.local).length + Object.keys(o.idb || {}).length;
  if (n > 5000 || JSON.stringify(o).length > 5e6) return { error: 'That settings file is far larger than any real one.' };
  return { bundle: o };
}

/* what to write on this side: the keys, with the old vault's key swapped for this one's */
export function planImport(bundle, newVaultKey) {
  const from = bundle.vaultKey || '';
  const local = {}, idb = {};
  for (const [k, v] of Object.entries(bundle.local)) {
    if (typeof v !== 'string' || !k.startsWith('dmforge:')) continue;
    local[from && newVaultKey ? swapVault(k, from, newVaultKey) : k] = v;
  }
  for (const [k, v] of Object.entries(bundle.idb || {})) {
    if (!k.startsWith('mapping|')) continue;
    idb[from && newVaultKey ? swapVault(k, from, newVaultKey) : k] = v;
  }
  return { local, idb };
}
