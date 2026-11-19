/* Blank layouts that can be pasted into a session note. Each is plain Obsidian markdown (callouts included), so it
   looks the same in Obsidian. To add another, add an entry here: { id, name, blurb, body }. */

const NPC_CARD = [
  '> [!note]- NPC name — _role or one-line note_',
  '> ',
  '> - **Voice/mannerisms:** ',
  '> - **Look:** ',
  '> - **Knows:** ',
  '> - **Wants:** ',
  '> - **Does:** ',
  '> - **Say:** _""_',
  '> - **Stat block:** ',
  '>     - **AC**  · **HP**  · **Speed**  · **CR** ',
  '>     - **Attacks:** ',
  '>     - _If unsure:_ ',
].join('\n');

const SESSION_PREP = [
  '> [!important]+ MUST HAPPEN',
  '> ',
  '> - [ ] ',
  '> - [ ] ',
  '> - [ ] ',
  '> ',
  '> _Everything else is bonus._',
  '',
  '## Locations _(one line each)_',
  '',
  '> [!abstract]+ Places',
  '> ',
  '> - **Place:** ',
  '> - **Place:** ',
  '> - **Place:** ',
  '',
  '## State tracker',
  '',
  '> [!todo]+ Track',
  '> ',
  '> - [ ] ',
  '> - [ ] ',
  '> - [ ] ',
  '',
  '---',
  '',
  "## NPC's appearing in this episode",
].join('\n');


const DUNGEON = [
  '### Dungeon: _name_',
  '',
  '> [!important]+ Strong start',
  '> ',
  '> - Where they are, what they can see, hear and smell, and what is already going wrong:',
  '',
  '> [!abstract]+ Rooms',
  '> ',
  '> | Room | What is there | Danger | Treasure |',
  '> | --- | --- | --- | --- |',
  '> | 1. Entrance |  |  |  |',
  '> | 2.  |  |  |  |',
  '> | 3.  |  |  |  |',
  '',
  '> [!warning]+ Traps and hazards',
  '> ',
  '> - **Where:**  · **Triggers:**  · **Effect:**  · **Spot DC:**  · **Disarm DC:** ',
  '',
  '> [!danger]- Wandering threats (every hour or so)',
  '> ',
  '> 1. ',
  '> 2. ',
  '> 3. ',
  '',
  '> [!tip]- Secrets and shortcuts',
  '> ',
  '> - ',
  '',
  '> [!todo]+ Light, supplies and time',
  '> ',
  '> - [ ] Torches / light:',
  '> - [ ] Hours spent:',
].join('\n');

const SOCIAL = [
  '### Intrigue: _name_',
  '',
  '> [!important]+ The situation',
  '> ',
  '> - What is happening, and what happens if the party does nothing:',
  '',
  '> [!abstract]+ Who wants what',
  '> ',
  '> | Who | Wants | Will pay or give | Will not tolerate |',
  '> | --- | --- | --- | --- |',
  '> | [[Faction or NPC]] |  |  |  |',
  '> | [[Faction or NPC]] |  |  |  |',
  '',
  '> [!example]+ Leverage and pressure points',
  '> ',
  '> - ',
  '> - ',
  '',
  '> [!todo]+ Clock',
  '> ',
  '> - [ ] ',
  '> - [ ] ',
  '> - [ ] ',
  '',
  '> [!quote]- If it goes wrong, and if it goes right',
  '> ',
  '> - **Wrong:** ',
  '> - **Right:** ',
].join('\n');

const TRAVEL = [
  '### Journey: _from_ to _to_',
  '',
  '> [!important]+ Route',
  '> ',
  '> - **Distance:**  · **Pace:**  · **Days:** ',
  '> - **Terrain and how it slows them:** ',
  '',
  '> [!abstract]+ Each day',
  '> ',
  '> | Day | Weather | Encounter | Find or landmark |',
  '> | --- | --- | --- | --- |',
  '> | 1 |  |  |  |',
  '> | 2 |  |  |  |',
  '> | 3 |  |  |  |',
  '',
  '> [!warning]+ Supplies',
  '> ',
  '> - [ ] Food and water for  days',
  '> - [ ] Shelter',
  '',
  '> [!tip]- Complications (pick one when it gets dull)',
  '> ',
  '> - ',
  '> - ',
].join('\n');

const ONESHOT = [
  '### One-shot: _title_',
  '',
  '> [!important]+ Hook (the first five minutes)',
  '> ',
  '> - ',
  '',
  '> [!abstract]+ Three scenes',
  '> ',
  '> 1. **Opening:** ',
  '> 2. **Complication:** ',
  '> 3. **Climax:** ',
  '',
  '> [!danger]+ Stakes and the clock',
  '> ',
  '> - **If they win:** ',
  '> - **If they lose:** ',
  '> - **Ticking:** ',
  '',
  '> [!example]- Characters and who plays them',
  '> ',
  '> - ',
  '',
  '> [!quote]- Ending (a line to close on)',
  '> ',
  '> - ',
].join('\n');

export const SESSION_TEMPLATES = [
  { id: 'session-prep', name: 'Session prep', blurb: 'Must happen, places, a state tracker and an NPC section. It goes under Prep. Add each NPC with the NPC card template.', body: SESSION_PREP + '\n' },
  { id: 'npc-card', name: 'NPC card', blurb: 'One collapsed card for an NPC (voice, look, knows, wants, says, stat block). It goes under "NPC\'s appearing in this episode" if the note has that heading, otherwise under Prep. Add one per NPC.', body: NPC_CARD + '\n' },
  { id: 'dungeon', name: 'Dungeon crawl', blurb: 'A strong start, a room table, traps, wandering threats, secrets, and light and time. It goes under Prep.', body: DUNGEON + '\n' },
  { id: 'social', name: 'Intrigue and social', blurb: 'The situation, who wants what, leverage, a clock, and what happens if it goes wrong or right. It goes under Prep.', body: SOCIAL + '\n' },
  { id: 'travel', name: 'Travel and exploration', blurb: 'Route and distance, a day-by-day table of weather, encounters and finds, supplies and complications. It goes under Prep.', body: TRAVEL + '\n' },
  { id: 'oneshot', name: 'One-shot', blurb: 'A hook, three scenes, stakes and a clock, the characters, and an ending line. It goes under Prep.', body: ONESHOT + '\n' },
];

export const templateById = id => SESSION_TEMPLATES.find(t => t.id === id) || null;

/* Puts a template into a note's text (LF line endings) at a position, with a blank line before and after it.
   Returns { text, caret } where caret is the end of what was added. */
export function insertAt(text, at, tpl) {
  at = Math.max(0, Math.min(text.length, at));
  const before = text.slice(0, at), after = text.slice(at);
  const lead = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const block = tpl.replace(/\s+$/, '');
  const tail = !after.trim() ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const out = before + lead + block + tail + after;
  return { text: out, caret: (before + lead + block).length };
}

/* Where a template belongs in a session note, so a card for this session does not end up under last session's Recap:
     - the NPC card goes at the end of the "NPC's appearing in this episode" section, if the note has one
     - anything else (and an NPC card with no such section) goes at the end of the Prep section
     - with no Prep section, a new one is made just before Recap (or the template goes at the end if there is no Recap either)
   `body` has LF line endings. Returns { text, line, where }: `line` is where the template starts, `where` says in words where it went. */
const HEAD = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
function headings(lines) {
  const out = [];
  let fence = null;
  lines.forEach((l, i) => {
    const f = l.match(/^\s{0,3}(```|~~~)/);
    if (f) { fence = fence === f[1] ? null : (fence || f[1]); return; }
    if (fence) return;
    const m = l.match(HEAD);
    if (m) out.push({ i, level: m[1].length, text: m[2] });
  });
  return out;
}
const sectionOf = (lines, hs, h) => {
  const next = hs.find(x => x.i > h.i && x.level <= h.level);
  let end = next ? next.i : lines.length;
  while (end > h.i + 1 && lines[end - 1].trim() === '') end--;
  return end;                                        // the line after the section's last line of content
};
export function placeTemplate(body, tplId, tplBody) {
  const lines = body.split('\n');
  const hs = headings(lines);
  const block = tplBody.replace(/\s+$/, '').split('\n');
  const put = (at, extra) => {
    const before = lines.slice(0, at), after = lines.slice(at);
    while (before.length && before[before.length - 1].trim() === '') before.pop();
    while (after.length && after[0].trim() === '') after.shift();
    const lead = before.length ? [''] : [];
    const add = (extra || []).concat(extra && extra.length ? [''] : [], block);
    const line = before.length + lead.length;
    return { text: [...before, ...lead, ...add, ...(after.length ? ['', ...after] : ['']) ].join('\n'), line };
  };
  let h;
  if (tplId === 'npc-card' && (h = hs.find(x => /\bnpcs?\b.*\b(appearing|this (episode|session))\b/i.test(x.text)))) {
    const r = put(sectionOf(lines, hs, h)); return Object.assign(r, { where: 'under “' + h.text + '”' });
  }
  if ((h = hs.find(x => /^(session\s+)?prep(aration)?\b/i.test(x.text)))) {
    const r = put(sectionOf(lines, hs, h)); return Object.assign(r, { where: 'under “' + h.text + '”' });
  }
  const recap = hs.find(x => /^(session\s+)?recap\b/i.test(x.text));
  if (recap) {
    const r = put(recap.i, ['## Prep']); return Object.assign(r, { line: r.line + 2, where: 'under a new “Prep” heading, before the Recap' });
  }
  const r = put(lines.length);
  return Object.assign(r, { where: 'at the end of the note' });
}
