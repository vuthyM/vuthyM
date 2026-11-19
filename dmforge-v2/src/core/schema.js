import { scalarize } from './frontmatter.js';

export const TYPES = {
  npc: {
    label: 'NPCs', single: 'NPC', folder: 'NPCs',
    aliases: ['npc', 'npcs', 'non player characters', 'people', 'cast', 'characters npc'],
    fields: [
      { key: 'race', label: 'Race', kind: 'text', aliases: ['ancestry', 'species'] },
      { key: 'role', label: 'Role', kind: 'text', aliases: ['occupation', 'job', 'title'] },
      { key: 'status', label: 'Status', kind: 'select', options: ['Alive', 'Dead', 'Missing', 'Unknown'] },
      { key: 'location', label: 'Location', kind: 'link', linkTypes: ['location'], aliases: ['home', 'place', 'lives in'] },
      { key: 'faction', label: 'Faction', kind: 'link', linkTypes: ['faction'], aliases: ['organization', 'organisation', 'group', 'guild', 'allegiance'] },
    ],
  },
  player: {
    label: 'Players', single: 'Player', folder: 'Players',
    aliases: ['player', 'players', 'pc', 'pcs', 'party', 'player characters', 'adventurers'],
    fields: [
      { key: 'player', label: 'Played by', kind: 'text' },
      { key: 'class', label: 'Class', kind: 'text' },
      { key: 'race', label: 'Race', kind: 'text', aliases: ['ancestry', 'species'] },
      { key: 'level', label: 'Level', kind: 'number', aliases: ['lvl'] },
      { key: 'hp', label: 'Max HP', kind: 'number', aliases: ['hit points', 'max hp'] },
      { key: 'ac', label: 'AC', kind: 'number', aliases: ['armor class'] },
      { key: 'init', label: 'Initiative bonus', kind: 'number', aliases: ['initiative', 'initiative bonus'] },
      { key: 'perception', label: 'Passive Perception', kind: 'number', aliases: ['passive perception', 'pp', 'passive'] },
      { key: 'gold', label: 'Gold', kind: 'number', aliases: ['gp'] },
      { key: 'xp', label: 'XP', kind: 'number', aliases: ['experience'] },
    ],
  },
  location: {
    label: 'Locations', single: 'Location', folder: 'Locations',
    aliases: ['location', 'locations', 'places', 'place', 'settlements', 'geography', 'world', 'towns', 'cities', 'regions'],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', aliases: ['type', 'category'] },
      { key: 'region', label: 'Within', kind: 'link', linkTypes: ['location'], aliases: ['parent', 'within', 'located in', 'region', 'inside', 'part of'] },
    ],
  },
  faction: {
    label: 'Factions', single: 'Faction', folder: 'Factions',
    aliases: ['faction', 'factions', 'organizations', 'organisations', 'organization', 'groups', 'guilds', 'orders'],
    fields: [
      { key: 'goal', label: 'Goal', kind: 'text', aliases: ['goals', 'aim', 'agenda'] },
      { key: 'leader', label: 'Leader', kind: 'link', linkTypes: ['npc'] },
      { key: 'base', label: 'Based in', kind: 'link', linkTypes: ['location'], aliases: ['hq', 'headquarters', 'seat', 'lair', 'home base', 'based at'] },
    ],
  },
  plot: {
    label: 'Plot threads', single: 'Plot thread', folder: 'Plot Threads',
    aliases: ['plot', 'plots', 'plot threads', 'plot thread', 'threads', 'quests', 'quest', 'storylines', 'arcs', 'story', 'hooks'],
    fields: [
      { key: 'status', label: 'Status', kind: 'select', options: ['Active', 'Dormant', 'Resolved'] },
      { key: 'seeded', label: 'Seeded by', kind: 'links', linkTypes: ['npc', 'faction', 'player'], aliases: ['seeded by', 'planted by', 'started by', 'introduced by', 'seeders', 'origin'] },
      { key: 'appears', label: 'Appears in', kind: 'links', linkTypes: ['location'], aliases: ['appears in', 'takes place in', 'set in', 'locations', 'places'] },
    ],
  },
  session: {
    label: 'Sessions', single: 'Session', folder: 'Sessions',
    aliases: ['session', 'sessions', 'session notes', 'session logs', 'logs', 'journal', 'recaps'],
    fields: [
      { key: 'number', label: 'Session #', kind: 'number', aliases: ['session'] },
      { key: 'date', label: 'Date', kind: 'date' },
    ],
  },
  item: {
    label: 'Items', single: 'Item', folder: 'Items',
    aliases: ['item', 'items', 'loot', 'treasure', 'magic items', 'equipment'],
    fields: [
      { key: 'kind', label: 'Type', kind: 'text', aliases: ['type', 'category'] },
      { key: 'rarity', label: 'Rarity', kind: 'select', options: ['Common', 'Uncommon', 'Rare', 'Very rare', 'Legendary'] },
      { key: 'location', label: 'Kept at', kind: 'link', linkTypes: ['location'], aliases: ['stored at', 'stored', 'found at', 'held at', 'kept'] },
    ],
  },
  map: {
    label: 'Maps', single: 'Map', folder: 'Maps',
    aliases: ['map', 'maps', 'handouts', 'images', 'art', 'battlemaps'],
    fields: [],
  },
};
export const TYPE_ORDER = ['npc', 'player', 'location', 'faction', 'plot', 'session', 'item', 'map'];
export const OTHER = 'other';

/* A custom category is a folder the user added that holds plain notes. Its type id
   is 'x:' + the folder name, so the label can always be recovered from the id. */
export const isCustom = t => typeof t === 'string' && t.startsWith('x:');
export const customId = folder => 'x:' + folder;
export function typeInfo(t) {
  if (TYPES[t]) return TYPES[t];
  if (isCustom(t)) { const name = t.slice(2); return { label: name, single: 'Note', folder: name, aliases: [], fields: [], custom: true }; }
  return null;
}
export const typeLabel = t => { const i = typeInfo(t); return i ? i.label : 'Other notes'; };

function fold(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/^\d+\s+/, '').trim().replace(/s$/, '');
}
export function detectType(folderName) {
  const n = fold(folderName);
  if (!n) return null;
  for (const id of TYPE_ORDER) {
    if (TYPES[id].aliases.some(a => fold(a) === n)) return id;
  }
  return null;
}
export function detectMapping(topFolders) {
  const m = {};
  for (const f of topFolders) m[f] = detectType(f) || OTHER;
  return m;
}

export function fieldDefs(type) { return (TYPES[type] && TYPES[type].fields) || []; }

const stripLink = s => String(s).replace(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a);
export function displayValue(v) {
  const s = scalarize(v);
  return Array.isArray(s) ? s.map(stripLink).join(', ') : stripLink(s);
}

/* Reads a schema field from a parsed note: front matter first, then inline fields. */
export function getField(note, field) {
  const keys = [field.key, ...(field.aliases || [])].map(k => k.toLowerCase());
  for (const [k, v] of Object.entries(note.fm || {})) {
    if (keys.includes(k.toLowerCase())) return { value: displayValue(v), raw: v, source: 'fm', key: k };
  }
  for (const k of keys) {
    if (note.inline && note.inline[k] !== undefined) return { value: stripLink(note.inline[k]), raw: note.inline[k], source: 'inline', key: k };
  }
  return { value: '', raw: undefined, source: null, key: field.key };
}

/* Turns a form input into what we store in front matter (undefined = remove key). */
export function toStored(field, input) {
  const s = String(input ?? '').trim();
  if (!s) return undefined;
  if (field.kind === 'link') return '[[' + s.replace(/^\[\[|\]\]$/g, '') + ']]';
  if (field.kind === 'links') {                       // several links: "A, B" (or a list of names) becomes a list of [[links]]
    const names = (Array.isArray(input) ? input : s.split(/\s*,\s*/)).map(x => String(x).trim().replace(/^\[\[|\]\]$/g, '')).filter(Boolean);
    return names.length ? names.map(n => '[[' + n + ']]') : undefined;
  }
  if (field.kind === 'number') { const n = Number(s); return Number.isFinite(n) ? n : s; }
  return s;
}
