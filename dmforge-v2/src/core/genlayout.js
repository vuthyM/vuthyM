/* How a rolled generator is laid out as a page (a "handout"), and how the generators are grouped on the Generate home screen.
   Pure functions: the screen only draws what buildSheet() returns. Every generator can be given a layout here; one without a
   layout still works (its first short text becomes the title and every other field is a section). */

/* the home screen: what the DM needs, in plain words, and which generators answer it */
export const GROUPS = [
  { id: 'people', cat: 'People', title: 'Someone to talk to', blurb: 'An NPC, a villain, a few names', gens: ['npc', 'villain', 'names'] },
  { id: 'places', cat: 'Places', title: 'Somewhere to go', blurb: 'A tavern, a shop, a town, a room, the weather', gens: ['tavern', 'shop', 'settlement', 'room', 'landmark', 'weather'] },
  { id: 'items', cat: 'Items', title: 'Something to find', blurb: 'Loot, a magic item, a potion, a trinket, a book', gens: ['loot', 'magicitem', 'potion', 'trinket', 'book'] },
  { id: 'danger', cat: 'Danger', title: 'Trouble', blurb: 'An encounter, a trap, a travel event', gens: ['encounter', 'trap', 'travel'] },
  { id: 'story', cat: 'Story', title: 'A reason to care', blurb: 'A hook, a quest, rumors, an omen, a riddle, a festival', gens: ['hook', 'quest', 'rumors', 'twist', 'omen', 'riddle', 'festival'] },
];

/* one line under each generator's name on its group page */
export const BLURBS = {
  npc: 'A person: name, look, voice, what they want, a secret',
  villain: 'A big bad: who, the goal, the method, the weakness, the lair',
  names: 'Six names for any culture',
  tavern: 'A place to drink: keeper, menu, crowd, notice board',
  shop: 'A shop with its keeper, stock, prices and haggling',
  settlement: 'A town or city: who rules it, what it is known for, trouble',
  room: 'A dungeon room: shape, feature, what is inside, exits',
  landmark: 'Something to find in the wild, with a sign and a discovery',
  weather: 'The day\'s weather and what it does to travel',
  loot: 'Coins, gems, art and magic, by tier',
  magicitem: 'A magic item: what it is, what it does, the catch, its story',
  potion: 'A potion: how it looks and tastes, its effect, a side effect',
  trinket: 'Three things from a pocket, and a secret in one',
  book: 'A book: title, author, condition, contents, a hidden thing',
  encounter: 'Foes, what they are doing, the terrain',
  trap: 'A trap: trigger, effect, clue, how to disarm',
  travel: 'Something that happens on the road, with a cost and an upside',
  hook: 'A reason for the party to get involved',
  quest: 'A job: who asks, the goal, the reward, a deadline',
  rumors: 'Four things overheard, some true',
  twist: 'A complication, and what happens if it is ignored',
  omen: 'An omen, what it means, and a prophecy',
  riddle: 'A riddle, with the answer hidden until you want it',
  festival: 'A town festival: highlights, tradition, trouble',
};

const cap = s => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
/* make sure a piece of text reads as a sentence */
export const end = s => { const t = String(s == null ? '' : s).trim(); return !t || /[.!?…)"”\]]$/.test(t) ? t : t + '.'; };
const join = (...parts) => parts.map(x => String(x == null ? '' : x).trim()).filter(Boolean).join(' ');

/* title:   a field key, or { text } for a fixed title, or { keys, fn } for one made from several fields
   kicker:  the small line above the title: { keys, fn(v, o) }
   lead:    the paragraph under the title: { keys, fn(v, o) }
   Every other field of the generator becomes a section, in the order the generator lists them. */
export const LAYOUTS = {
  npc: { title: 'name', kicker: { keys: ['race', 'role'] }, lead: { keys: ['look'], fn: v => end(v.look) } },
  names: { title: { text: 'Six names' } },
  villain: { title: 'name', kicker: { keys: ['who'] } },
  tavern: { title: 'name', lead: { keys: ['vibe', 'crowd'], fn: v => join(end(v.vibe), end(v.crowd)) } },
  shop: { title: 'name', kicker: { keys: ['type'], fn: (v, o) => [v.type, o && o.size].filter(Boolean).join(' · ') }, lead: { keys: ['first', 'where'], fn: v => join(end(v.first), end(v.where)) } },
  settlement: { title: 'name', kicker: { keys: ['size'] }, lead: { keys: ['known', 'landmark'], fn: v => join(end(v.known), end(v.landmark)) } },
  room: { title: { text: 'Dungeon room' }, lead: { keys: ['shape', 'air'], fn: v => join(end(v.shape), end(v.air)) } },
  landmark: { title: 'landmark' },
  weather: { title: { keys: ['temp', 'sky'], fn: v => cap(v.temp) + ', ' + String(v.sky || '').toLowerCase() } },
  loot: { title: { text: 'Loot' } },
  magicitem: { title: 'name', kicker: { keys: ['type'] }, lead: { keys: ['form'], fn: v => end(v.form) } },
  potion: { title: 'name', lead: { keys: ['look'], fn: v => end(v.look) } },
  trinket: { title: { text: 'Trinkets' } },
  book: { title: 'title', kicker: { keys: ['author'] }, lead: { keys: ['cond'], fn: v => end(v.cond) } },
  encounter: { title: 'foes', lead: { keys: ['doing', 'terrain'], fn: v => join(end(v.doing), end(v.terrain)) } },
  trap: { title: 'trigger', kicker: { keys: ['dc'], fn: v => 'DC ' + v.dc }, lead: { keys: ['effect'], fn: v => end(v.effect) } },
  travel: { title: 'event' },
  hook: { title: { text: 'Plot hook' }, lead: { keys: ['hook'], fn: v => end(v.hook) } },
  quest: { title: { text: 'Quest' }, lead: { keys: ['goal'], fn: v => end(v.goal) } },
  rumors: { title: { text: 'Rumors' } },
  twist: { title: 'comp' },
  omen: { title: 'omen', lead: { keys: ['meaning'], fn: v => end(v.meaning) } },
  riddle: { title: { text: 'Riddle' }, lead: { keys: ['riddle'], fn: v => v.riddle } },
  festival: { title: 'name', lead: { keys: ['tradition'], fn: v => end(v.tradition) } },
};

const NONE = /^none\.?$/i;

/* A rolled generator as a page: { kicker, title, lead, sections }. Each part says which field keys it came from (for lock and reroll).
   kicker, title and lead are { text, keys } or null; a section is { key, label, kind: 'text' | 'list', value, hidden, muted }. */
export function buildSheet(g, st, layouts = LAYOUTS) {
  const v = st.vals, o = st.opts || {};
  const lay = layouts[g.id] || {};
  const label = key => (g.fields.find(f => f.key === key) || {}).label || key;
  const part = (spec, joiner) => {
    if (!spec) return null;
    const keys = spec.keys || [];
    const text = spec.fn ? spec.fn(v, o) : keys.map(k => v[k]).filter(x => x != null && x !== '').join(joiner || ' · ');
    return text ? { text: String(text), keys, label: keys.length ? label(keys[0]) : '' } : null;
  };
  let title;
  if (typeof lay.title === 'string') title = { text: String(v[lay.title] == null ? '' : v[lay.title]), keys: [lay.title], label: label(lay.title) };
  else if (lay.title && lay.title.text) title = { text: lay.title.text, keys: [], label: '' };
  else if (lay.title) title = part(lay.title);
  else {
    // no layout: the first short text is the title
    const f = g.fields.find(x => !x.hidden && typeof v[x.key] === 'string' && v[x.key].length <= 60);
    title = f ? { text: v[f.key], keys: [f.key], label: f.label } : { text: g.name, keys: [], label: '' };
    lay.title = f ? f.key : undefined;
  }
  const kicker = part(lay.kicker);
  const lead = part(lay.lead);
  const used = new Set([...(title ? title.keys : []), ...(kicker ? kicker.keys : []), ...(lead ? lead.keys : [])]);
  const sections = g.fields.filter(f => !used.has(f.key)).map(f => {
    const val = v[f.key];
    const kind = Array.isArray(val) ? 'list' : 'text';
    return { key: f.key, label: f.label, kind, value: val, hidden: !!f.hidden, muted: kind === 'text' && NONE.test(String(val || '')) };
  });
  return { kicker, title, lead, sections };
}

/* text for the clipboard: the page as it reads */
export function sheetText(g, st) {
  const s = buildSheet(g, st);
  const out = [];
  if (s.kicker) out.push(s.kicker.text.toUpperCase());
  out.push(s.title.text);
  if (s.lead) out.push('', s.lead.text);
  for (const x of s.sections) {
    out.push('', x.label.toUpperCase());
    if (x.kind === 'list') x.value.forEach(i => out.push('- ' + i)); else out.push(String(x.value));
  }
  return out.join('\n');
}

/* ---- picking several generators at once ---- */
export const MAX_PICKS = 8;                      // sheets on one page, counting copies
export const STARTER_COMBOS = [
  { id: 'c-inn', name: 'A night at the inn', picks: [{ id: 'tavern', qty: 1 }, { id: 'npc', qty: 2 }, { id: 'rumors', qty: 1 }] },
  { id: 'c-market', name: 'Market day', picks: [{ id: 'shop', qty: 2 }, { id: 'npc', qty: 1 }, { id: 'rumors', qty: 1 }] },
  { id: 'c-road', name: 'Trouble on the road', picks: [{ id: 'travel', qty: 1 }, { id: 'encounter', qty: 1 }, { id: 'landmark', qty: 1 }] },
];
export const picksTotal = picks => picks.reduce((n, p) => n + p.qty, 0);
/* a list of picks made safe: known generators only, each once, 1 to MAX copies, and no more than MAX in all. `ok(id)` can rule more out (switched off). */
export function cleanPicks(picks, known, ok = () => true) {
  const out = [], seen = new Set();
  let left = MAX_PICKS;
  for (const p of Array.isArray(picks) ? picks : []) {
    if (!p || typeof p.id !== 'string' || seen.has(p.id) || !known(p.id) || !ok(p.id) || left <= 0) continue;
    seen.add(p.id);
    const qty = Math.max(1, Math.min(left, Math.floor(+p.qty || 1)));
    left -= qty;
    out.push({ id: p.id, qty });
  }
  return out;
}
/* the text of a whole page of results, for the clipboard */
export function multiText(items) { return items.map(({ g, st }) => sheetText(g, st)).join('\n\n---\n\n'); }
