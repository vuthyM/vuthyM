/* Turning an idea into a campaign: the notes a new campaign folder starts with, made from an idea's page.
   Plain functions that return the files to write, so the plan can be shown and tested before anything is written.

     <Campaign>/<Campaign>.md              the overview: pitch, the idea, tone, the truth (twists), endings
     <Campaign>/Sessions/<date> Session 1.md   the prep for the first session, as callouts (hook, scenes, stakes, cast, places, ...)
     <Campaign>/NPCs/<name>.md             one per cast row that has a name
     <Campaign>/Locations/<name>.md        one per place that has a name
     <Campaign>/Plot Threads/<title>.md    the main line: the idea and what is at stake

   The idea itself is never changed by this (apart from noting which campaign it became). */
import { sanitizeName } from './util.js';
import { sepAfter } from './ideas.js';
import { patchFrontmatter } from './frontmatter.js';

const filled = r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim());
const clean = s => String(s == null ? '' : s).replace(/\r/g, '').trim();
const one = s => clean(s).replace(/\s*\n\s*/g, ' ');

/* a unique file name for each named row, in order ("Mira", then "Mira 2") */
function names(rows, taken = new Set()) {
  const out = [];
  for (const r of rows) {
    const base = sanitizeName(one(r.name));
    if (!base) { out.push(''); continue; }
    let n = base, i = 1;
    while (taken.has(n.toLowerCase())) n = base + ' ' + (++i);
    taken.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

const quote = text => clean(text).split('\n').map(l => (l.trim() ? '> ' + l : '>')).join('\n');
function callout(kind, title, body, fold = '+') {
  const b = clean(body);
  if (!b) return '';
  return '> [!' + kind + ']' + fold + ' ' + title + '\n> \n' + quote(b);
}
const asLines = (parts) => parts.filter(Boolean).join('\n');

/* the session note's Prep, as callouts a DM can run from (the same shapes as the session templates) */
export function prepText(m, link) {
  const cast = m.sec.cast.filter(filled), places = m.sec.places.filter(filled);
  const castNames = names(m.sec.cast, new Set()), placeNames = names(m.sec.places, new Set());
  const nameOf = (rows, all, r) => all[rows.indexOf(r)];
  const blocks = [];
  if (clean(m.pitch)) blocks.push(callout('quote', 'The pitch', m.pitch));
  blocks.push(callout('important', 'Hook (the first five minutes)', m.sec.hook));
  const scenes = m.sec.scenes.filter(filled).map((r, i) => (i + 1) + '. ' + (clean(r.name) ? '**' + one(r.name) + '**' + (clean(r.note) ? (/[:.?!…]$/.test(one(r.name)) ? ' ' : ': ') : '') : '') + clean(r.note).replace(/\n/g, '\n   '));
  blocks.push(callout('abstract', 'Scenes and plot points', asLines(scenes)));
  blocks.push(callout('danger', 'Stakes, goals and the clock', m.sec.stakes));
  const castLines = cast.map(r => {
    const nm = nameOf(m.sec.cast, castNames, r);
    const bits = [clean(r.wants) && '**wants** ' + one(r.wants), clean(r.secret) && '**secret** ' + one(r.secret), clean(r.voice) && '**voice** ' + one(r.voice)].filter(Boolean).join(' · ');
    return '- ' + (nm ? (link ? '[[' + nm + ']]' : nm) : '') + (nm && bits ? ' — ' : '') + bits;
  });
  blocks.push(callout('example', 'Cast', asLines(castLines), '-'));
  const placeLines = places.map(r => { const nm = nameOf(m.sec.places, placeNames, r); return '- ' + (nm ? (link ? '[[' + nm + ']]' : nm) : '') + (nm && clean(r.note) ? ' — ' : '') + one(r.note); });
  blocks.push(callout('abstract', 'Places', asLines(placeLines), '-'));
  const simple = (rows, label) => asLines(rows.filter(filled).map(r => '- ' + (clean(r.name) ? '**' + one(r.name) + '**' + (clean(r.note) ? sepAfter(one(r.name)) : '') : '') + clean(r.note).replace(/\n/g, '\n  ')));
  blocks.push(callout('warning', 'Twists and secrets', simple(m.sec.twists), '-'));
  blocks.push(callout('quote', 'Endings', simple(m.sec.endings), '-'));
  blocks.push(callout('danger', 'Monsters and encounters', simple(m.sec.monsters), '-'));
  blocks.push(callout('tip', 'Rewards', m.sec.rewards, '-'));
  blocks.push(callout('note', 'Props, handouts and music', m.sec.props, '-'));
  if (clean(m.sec.maps)) blocks.push(callout('note', 'Maps', m.sec.maps, '-'));
  if (clean(m.sec.notes)) blocks.push(callout('note', 'Other notes', m.sec.notes, '-'));
  return blocks.filter(Boolean).join('\n\n');
}

export function overviewText(m, title) {
  const out = ['# ' + title, ''];
  if (clean(m.pitch)) out.push(clean(m.pitch), '');
  if (clean(m.sec.idea)) out.push('## The idea', '', clean(m.sec.idea), '');
  const facts = [clean(m.tone) && 'Tone: ' + one(m.tone), clean(m.length) && 'Length: ' + one(m.length), clean(m.players) && 'Players: ' + one(m.players), clean(m.level) && 'Level: ' + one(m.level)].filter(Boolean);
  if (facts.length) out.push('## Tone and table', '', facts.join('. ') + '.', '');
  if (clean(m.sec.stakes)) out.push('## Stakes', '', clean(m.sec.stakes), '');
  const tw = m.sec.twists.filter(filled);
  if (tw.length) out.push('## The truth (DM only)', '', ...tw.map(r => '- ' + (clean(r.name) ? '**' + one(r.name) + '**' + (clean(r.note) ? sepAfter(one(r.name)) : '') : '') + one(r.note)), '');
  const en = m.sec.endings.filter(filled);
  if (en.length) out.push('## Endings', '', ...en.map(r => '- ' + (clean(r.name) ? '**' + one(r.name) + '**' + (clean(r.note) ? sepAfter(one(r.name)) : '') : '') + one(r.note)), '');
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}

/* The plan: { folder, files: [{ path, text, kind }], counts, problems }. `opts`: { folder, date, npcs, places, thread, title } */
export function promotePlan(m, opts = {}) {
  const title = clean(m.title) || 'Untitled idea';
  const folder = sanitizeName(opts.folder || title);
  const date = opts.date || '';
  const withNpcs = opts.npcs !== false, withPlaces = opts.places !== false, withThread = opts.thread !== false;
  const problems = [];
  if (!folder) problems.push('Give the campaign a folder name.');
  const files = [];
  const castRows = m.sec.cast.filter(filled), placeRows = m.sec.places.filter(filled);
  const castNames = names(castRows), placeNames = names(placeRows);
  // the session's links must point at notes that will exist: only link what is being made
  const link = { npcs: withNpcs, places: withPlaces };
  const prepModel = Object.assign({}, m, { sec: Object.assign({}, m.sec) });
  const prep = prepText(prepModel, true)
    .replace(/\[\[([^\]]+)\]\]/g, (all, nm) => ((castNames.includes(nm) && link.npcs) || (placeNames.includes(nm) && link.places) ? all : nm));
  const stem = date ? date + ' Session 1' : 'Session 1';
  const sessionText = '---\nnumber: 1\n' + (date ? 'date: ' + date + '\n' : '') + 'from_idea: ' + JSON.stringify(title) + '\n---\n\n# Session 1: ' + title + '\n\n## Prep\n\n' + (prep || '- ') + '\n\n## Recap\n';
  files.push({ path: folder + '/' + folder + '.md', text: overviewText(m, folder), kind: 'overview' });
  files.push({ path: folder + '/Sessions/' + stem + '.md', text: sessionText, kind: 'session' });
  if (withNpcs) castRows.forEach((r, i) => {
    const nm = castNames[i];
    if (!nm) return;
    const body = [clean(r.wants) && '**Wants:** ' + one(r.wants), clean(r.secret) && '**Secret (DM only):** ' + one(r.secret), clean(r.voice) && '**Voice and look:** ' + one(r.voice)].filter(Boolean);
    files.push({ path: folder + '/NPCs/' + nm + '.md', kind: 'npc', text: '---\nstatus: Alive\nfrom_idea: ' + JSON.stringify(title) + '\n---\n\n' + (body.length ? body.join('\n\n') : 'Nothing written about them yet.') + '\n\n## Session updates\n' });
  });
  if (withPlaces) placeRows.forEach((r, i) => {
    const nm = placeNames[i];
    if (!nm) return;
    files.push({ path: folder + '/Locations/' + nm + '.md', kind: 'place', text: '---\nfrom_idea: ' + JSON.stringify(title) + '\n---\n\n' + (clean(r.note) || 'Nothing written about it yet.') + '\n' });
  });
  if (withThread) {
    const stake = clean(m.sec.stakes);
    const body = [clean(m.sec.idea), clean(m.sec.hook) && '**Hook:** ' + clean(m.sec.hook), stake && '**At stake:** ' + stake].filter(Boolean).join('\n\n');
    files.push({ path: folder + '/Plot Threads/' + (sanitizeName(title) || 'Main thread') + '.md', kind: 'thread', text: '---\nstatus: Active\nfrom_idea: ' + JSON.stringify(title) + '\n---\n\n' + (body || 'The main line of the story.') + '\n\n## Session updates\n' });
  }
  const counts = { npcs: files.filter(f => f.kind === 'npc').length, places: files.filter(f => f.kind === 'place').length, thread: files.filter(f => f.kind === 'thread').length };
  const seen = new Set();
  for (const f of files) { if (seen.has(f.path.toLowerCase())) problems.push('Two notes would be called ' + f.path.split('/').pop()); seen.add(f.path.toLowerCase()); }
  return { folder, files, counts, problems };
}

/* the folders a new campaign is mapped with, so it opens straight into its categories */
export const PROMOTE_MAPPING = { NPCs: 'npc', Players: 'player', Locations: 'location', Factions: 'faction', 'Plot Threads': 'plot', Sessions: 'session', Items: 'item', Maps: 'map' };

/* the idea's own note records which campaign it became */
export const withCampaign = (text, folder) => patchFrontmatter(text, { campaign: folder });
