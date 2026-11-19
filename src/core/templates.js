import { serializeKV } from './frontmatter.js';

export function buildNoteText(fm, body) {
  const lines = [];
  for (const [k, v] of Object.entries(fm || {})) {
    if (v === undefined || v === null || v === '') continue;
    lines.push(...serializeKV(k, v));
  }
  return (lines.length ? '---\n' + lines.join('\n') + '\n---\n\n' : '') + String(body || '').replace(/^\n+/, '');
}

export function defaultBody(type, name) {
  switch (type) {
    case 'npc': return '# ' + name + '\n\n## Description\n\n## Motivation\n\n## Notes\n';
    case 'player': return '# ' + name + '\n\n## Background\n\n## Notes\n';
    case 'location': return '# ' + name + '\n\n## Description\n\n## Points of interest\n';
    case 'faction': return '# ' + name + '\n\n## Overview\n\n## Members\n';
    case 'plot': return '# ' + name + '\n\n## Summary\n\n## Next steps\n';
    case 'session': return '# ' + name + '\n\n## Prep\n\n## Recap\n';
    case 'item': return '# ' + name + '\n\n## Description\n';
    default: return '# ' + name + '\n\n';
  }
}

/* ---- generator results -> markdown / notes ---- */
export function genFieldsMarkdown(g, vals) {
  const lines = [];
  for (const f of g.fields) {
    const v = vals[f.key];
    if (Array.isArray(v)) { lines.push('- **' + f.label + ':**'); v.forEach(x => lines.push('  - ' + x)); }
    else lines.push('- **' + f.label + ':** ' + v);
  }
  return lines.join('\n');
}

const firstWords = (s, n) => String(s || '').split(/\s+/).slice(0, n).join(' ').replace(/[.,;:]+$/, '');

export function suggestName(g, vals) {
  switch (g.id) {
    case 'npc': case 'villain': case 'tavern': case 'shop': case 'settlement': case 'magicitem': case 'potion': case 'festival': return vals.name || g.name;
    case 'book': return vals.title || g.name;
    case 'landmark': return firstWords(vals.landmark, 5);
    case 'quest': return firstWords(vals.goal, 6);
    case 'hook': return firstWords(vals.hook, 6);
    case 'twist': return firstWords(vals.comp, 5);
    case 'omen': return firstWords(vals.omen, 5);
    default: return g.name;
  }
}

export const DEST_TYPES = ['npc', 'location', 'plot', 'item'];
export function defaultDest(g) {
  switch (g.id) {
    case 'npc': case 'villain': return 'npc';
    case 'tavern': case 'shop': case 'settlement': case 'room': case 'landmark': return 'location';
    case 'quest': case 'hook': case 'twist': case 'omen': return 'plot';
    case 'magicitem': case 'book': case 'potion': return 'item';
    default: return 'prep';
  }
}

/* callout colour by kind of thing: People, Places, Items, Danger, Story */
const CALLOUT = { People: 'example', Places: 'info', Items: 'tip', Danger: 'danger', Story: 'quote' };

/* What goes into a session's prep. By default a collapsed callout (Obsidian and DM Forge both fold it), so a long shop or
   NPC takes one line until opened. `fold: false` gives the plain heading and list instead. `linkTo` links the title to a
   note that was created for the same thing. */
export function genToPrep(g, vals, { fold = true, linkTo = '' } = {}) {
  const name = vals.name || vals.title || '';
  const shown = linkTo ? '[[' + linkTo + ']]' : name;
  const title = g.name + (shown ? ' — ' + shown : '');
  const body = genFieldsMarkdown(g, vals);
  if (!fold) return '### ' + title + '\n' + body;
  return '> [!' + (CALLOUT[g.cat] || 'note') + ']- ' + title + '\n' + body.split('\n').map(l => '> ' + l).join('\n');
}

export function genToNote(g, st, type, name) {
  const vals = st.vals;
  const fm = { type };
  if (type === 'npc') {
    fm.race = vals.race || undefined;
    fm.role = g.id === 'villain' ? 'Villain' : vals.role;
    fm.status = 'Alive';
  } else if (type === 'location') {
    fm.kind = g.id === 'shop' && vals.type ? vals.type : { tavern: 'Tavern', shop: 'Shop', settlement: 'Settlement', room: 'Dungeon room', landmark: 'Landmark' }[g.id] || undefined;
  } else if (type === 'plot') {
    fm.status = 'Active';
  } else if (type === 'item') {
    fm.kind = g.id === 'magicitem' && vals.type ? String(vals.type).split(',')[0] : g.name;
    if (g.id === 'magicitem' || g.id === 'potion') fm.rarity = st.opts.rarity;
  }
  return { fm, body: '# ' + name + '\n\n' + genFieldsMarkdown(g, vals) + '\n' };
}

export const CAMPAIGN_FOLDERS = ['NPCs', 'Players', 'Locations', 'Factions', 'Plot Threads', 'Sessions', 'Maps'];
export function campaignIndexText(name) {
  return '# ' + name + '\n\nA new campaign. Describe the premise here.\n\n## Themes\n\n## Open threads\n';
}
