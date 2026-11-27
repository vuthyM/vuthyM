/* The Workshop's spark tools: "roll one" buttons that use the same generators as the Generate screen, questions for when you are stuck,
   and a short checklist that says whether an idea is ready to run. Plain functions, so they can be tested without a page. */
import { GENS_BY_ID, rollAll, pick, ENC } from './generators.js';

/* one roll of a generator: { field key: value } (a value is text, or a list of text) */
export function rollGen(id, opts = {}) {
  const g = GENS_BY_ID[id];
  if (!g) return {};
  const st = { opts: {}, vals: {}, locks: {}, revealed: {} };
  for (const o of g.opts || []) st.opts[o.key] = o.def || o.values[0];
  Object.assign(st.opts, opts);
  rollAll(g, st);
  return st.vals;
}
const list = v => (Array.isArray(v) ? v : [v]).filter(Boolean);
const join = (...a) => a.flat().filter(x => x && String(x).trim()).map(s => String(s).trim()).join('. ').replace(/\.\./g, '.');
const sentence = s => (s ? String(s).replace(/[.!?]+$/, '') + '.' : '');

/* Each spark: { id, label, run() -> { rows: [{...fields}] } or { text } }. Rows use the section's own field names. */
export const SPARKS = {
  idea: [
    { id: 'premise', label: 'A premise', run: () => {
      const v = rollGen('villain'), h = rollGen('hook'), p = rollGen('settlement');
      return { text: sentence(h.hook) + ' ' + v.name + ' wants to ' + String(v.goal || '').toLowerCase().replace(/\.$/, '') + ', in ' + p.name + ' (' + String(p.known || '').toLowerCase() + ').' };
    } },
  ],
  hook: [
    { id: 'hook', label: 'A plot hook', run: () => { const h = rollGen('hook'); return { text: join(sentence(h.hook), h.stakes ? 'At stake: ' + String(h.stakes).toLowerCase() : '') }; } },
    { id: 'quest', label: 'A job from a patron', run: () => { const q = rollGen('quest'); return { text: join(q.giver + ' wants this done: ' + String(q.goal || '').replace(/^./, c => c.toLowerCase()), q.reward ? 'Reward: ' + String(q.reward).toLowerCase() : '', q.deadline ? 'Deadline: ' + String(q.deadline).toLowerCase() : '') }; } },
  ],
  cast: [
    { id: 'npc', label: 'An NPC', run: () => {
      const n = rollGen('npc');
      return { rows: [{ name: n.name, wants: n.wants, secret: n.secret, voice: join(n.role, n.look, n.voice, n.quirk) }] };
    } },
    { id: 'villain', label: 'A villain', run: () => {
      const n = rollGen('villain');
      return { rows: [{ name: n.name, wants: join(n.goal, n.method ? 'Method: ' + String(n.method).toLowerCase() : ''), secret: n.weak ? 'Weakness: ' + String(n.weak).toLowerCase() : '', voice: join(n.who, n.lair ? 'Lair: ' + String(n.lair).toLowerCase() : '', n.minions ? 'Minions: ' + String(n.minions).toLowerCase() : '') }] };
    } },
  ],
  places: [
    { id: 'tavern', label: 'A tavern', run: () => { const t = rollGen('tavern'); return { rows: [{ name: t.name, note: join(t.vibe, 'Kept by ' + t.keeper, t.crowd, t.notice ? 'Notice board: ' + String(t.notice).toLowerCase() : '') }] }; } },
    { id: 'settlement', label: 'A village or town', run: () => { const s = rollGen('settlement'); return { rows: [{ name: s.name, note: join(s.size, 'Known for ' + String(s.known).toLowerCase(), 'Ruled by ' + String(s.gov).toLowerCase(), s.trouble ? 'Trouble: ' + String(s.trouble).toLowerCase() : '') }] }; } },
    { id: 'landmark', label: 'A landmark', run: () => { const terrain = pick(GENS_BY_ID.landmark.opts[0].values); const l = rollGen('landmark', { terrain }); return { rows: [{ name: l.landmark, note: join(l.sign, l.find ? 'Discovery: ' + String(l.find).toLowerCase() : '') }] }; } },
    { id: 'room', label: 'A room', run: () => { const r = rollGen('room'); return { rows: [{ name: r.feature, note: join(r.shape, r.air, r.inside, r.exits ? 'Exits: ' + list(r.exits).join(', ').toLowerCase() : '') }] }; } },
  ],
  scenes: [
    { id: 'fight', label: 'A fight', run: () => { const e = rollGen('encounter', { env: pick(Object.keys(ENC)) }); return { rows: [{ name: 'Fight', note: join(e.foes, e.doing, e.terrain ? 'Terrain: ' + String(e.terrain).toLowerCase() : '', e.wild ? 'Wildcard: ' + String(e.wild).toLowerCase() : '') }] }; } },
    { id: 'trap', label: 'A trap', run: () => { const t = rollGen('trap'); return { rows: [{ name: 'Trap', note: join(t.trigger, t.effect, t.clue, t.disarm) }] }; } },
    { id: 'travel', label: 'A travel event', run: () => { const t = rollGen('travel'); return { rows: [{ name: 'On the road', note: join(t.event, t.cost ? 'Cost: ' + String(t.cost).toLowerCase() : '', t.boon ? 'Upside: ' + String(t.boon).toLowerCase() : '') }] }; } },
    { id: 'complication', label: 'A complication', run: () => { const c = rollGen('twist'); return { rows: [{ name: 'Complication', note: join(c.comp, c.esc ? 'If ignored: ' + String(c.esc).toLowerCase() : '') }] }; } },
  ],
  stakes: [
    { id: 'clock', label: 'A ticking clock', run: () => { const q = rollGen('quest'), h = rollGen('hook'); return { text: join('Deadline: ' + String(q.deadline || '').toLowerCase(), h.stakes ? 'At stake: ' + String(h.stakes).toLowerCase() : '', q.complication ? 'Complication: ' + String(q.complication).toLowerCase() : '') }; } },
  ],
  twists: [
    { id: 'twist', label: 'A twist', run: () => { const h = rollGen('hook'); return { rows: [{ name: 'Twist', note: sentence(h.twist) }] }; } },
    { id: 'omen', label: 'An omen', run: () => { const o = rollGen('omen'); return { rows: [{ name: 'Omen', note: join(o.omen, o.meaning) }] }; } },
    { id: 'rumors', label: 'Rumours (four)', run: () => { const r = rollGen('rumors'); return { rows: list(r.list).map(x => ({ name: 'Rumour', note: String(x).replace(/ \[(true|false)\]$/, (m, t) => ' (' + t + ')') })) }; } },
  ],
  monsters: [
    { id: 'encounter', label: 'An encounter', run: () => { const e = rollGen('encounter', { env: pick(Object.keys(ENC)) }); return { rows: [{ name: e.foes, note: join(e.doing, e.terrain ? 'Terrain: ' + String(e.terrain).toLowerCase() : '', e.wild ? 'Wildcard: ' + String(e.wild).toLowerCase() : '') }] }; } },
  ],
  rewards: [
    { id: 'loot', label: 'Treasure', run: () => { const l = rollGen('loot'); return { text: join('Coins: ' + l.coins, l.gems && l.gems !== 'None' ? 'Gems: ' + l.gems : '', l.items ? 'Items: ' + list(l.items).join('; ') : '', l.magic && l.magic !== 'None' ? 'Magic: ' + list(l.magic).join('; ') : '') }; } },
    { id: 'magicitem', label: 'A magic item', run: () => { const m = rollGen('magicitem'); return { text: join(m.name + ' (' + String(m.form).toLowerCase() + ')', m.effect, m.catch ? 'The catch: ' + String(m.catch).toLowerCase() : '', m.history) }; } },
  ],
  props: [
    { id: 'riddle', label: 'A riddle for a handout', run: () => { const r = rollGen('riddle'); return { text: 'Riddle: ' + r.riddle + ' (answer: ' + r.answer + ')' }; } },
    { id: 'prophecy', label: 'A prophecy', run: () => { const o = rollGen('omen'); return { text: o.prophecy }; } },
  ],
};

/* questions for when the page is blank, by section */
export const PROMPTS = {
  idea: ['What is the one image the players will remember afterwards?', 'What if the thing they are chasing is itself being chased?', 'What would make this a story only this table could tell?', 'What is the mood in three words, and what ruins it?', 'Whose problem is this, and why have they not solved it yet?'],
  hook: ['Start in the middle of the trouble: what has just gone wrong?', 'Who turns up at the door, and what do they need right now?', 'What can the characters see, hear and smell in the first minute?', 'What do they find that they were not looking for?'],
  cast: ['Who knows the most and says the least?', 'Who wants the same thing as the party, for the wrong reason?', 'Who is everyone afraid of, and why are they wrong?', 'Which NPC would the players adopt, and what would that cost them?'],
  places: ['Where would the climax be most dangerous for everyone?', 'Which place looks safe and is not?', 'What is the one location that has to feel alive?'],
  scenes: ['What is the quiet scene before it all goes wrong?', 'Where can the players take a breath, and what interrupts it?', 'What choice splits the party?', 'What is the scene they will skip if you let them, and do you need it?'],
  stakes: ['What do they lose if they do nothing?', 'What is ticking, and how will the table see it tick?', 'What would winning cost?'],
  twists: ['What if the person who asked for help is the cause?', 'What if the villain is right about one thing?', 'What if they were meant to arrive late?', 'What do the NPCs know that they have not said?'],
  endings: ['What if they win but lose something that mattered?', 'What if they refuse the ending you planned?', 'What is the last line of the story if they fail?', 'What does the world look like a year later?'],
  monsters: ['What is dangerous here that is not a monster?', 'Which fight could end without anyone dying?'],
  rewards: ['What do they get that they cannot spend?', 'What favour is worth more than gold here?'],
  props: ['What could you hand the players that they would keep?', 'What does this place sound like?'],
  notes: ['What do you need to remember at the table?'],
};
export const promptFor = (id, n = 0) => { const p = PROMPTS[id] || []; return p.length ? p[((n % p.length) + p.length) % p.length] : ''; };

/* ---------------------------------------------------------------- is it ready to run? */
const words = s => (String(s || '').match(/\S+/g) || []).length;
const filled = r => Object.entries(r).some(([k, v]) => k !== '_id' && String(v).trim());

/* the checks, in the order a DM would think of them. `must` ones decide "ready"; the rest are extras worth having. */
export function readiness(m) {
  const cast = m.sec.cast.filter(filled);
  const named = cast.filter(r => String(r.name || '').trim());
  const driven = named.filter(r => String(r.wants || '').trim() || String(r.secret || '').trim());
  const scenes = m.sec.scenes.filter(filled);
  const endings = m.sec.endings.filter(filled);
  const checks = [
    { id: 'pitch', sec: null, must: true, ok: words(m.pitch) >= 3, label: 'A one-line pitch', hint: 'If you cannot say it in a line, it may be two ideas.' },
    { id: 'hook', sec: 'hook', must: true, ok: words(m.sec.hook) >= 8, label: 'A hook for the first five minutes', hint: 'Write what happens in the first scene, not the backstory.' },
    { id: 'cast', sec: 'cast', must: true, ok: named.length >= 3, label: 'At least three named NPCs', hint: named.length + ' so far. Even a villain and two others will do.' },
    { id: 'wants', sec: 'cast', must: true, ok: named.length > 0 && driven.length === named.length, label: 'Every NPC wants something (or hides something)', hint: named.length ? (named.length - driven.length) + ' without a want or a secret.' : 'Add the cast first.' },
    { id: 'places', sec: 'places', must: true, ok: m.sec.places.filter(filled).length >= 2, label: 'At least two places', hint: 'Where it starts and where it ends is enough.' },
    { id: 'scenes', sec: 'scenes', must: true, ok: scenes.length >= 3, label: 'At least three scenes: a start, a middle, a climax', hint: scenes.length + ' so far.' },
    { id: 'stakes', sec: 'stakes', must: true, ok: words(m.sec.stakes) >= 6, label: 'Stakes, a goal or a clock', hint: 'What do they lose, and what is ticking?' },
    { id: 'endings', sec: 'endings', must: true, ok: endings.length >= 1, label: 'At least one ending', hint: 'Two is better: one for winning, one for losing.' },
    { id: 'twist', sec: 'twists', must: false, ok: m.sec.twists.filter(filled).length >= 1, label: 'A twist or a secret', hint: 'Something the players do not know yet.' },
    { id: 'tuned', sec: null, must: false, ok: !!String(m.players).trim() && !!String(m.level).trim(), label: 'Players and level are set', hint: 'So the fights are tuned to the table.' },
    { id: 'tw2', sec: 'endings', must: false, ok: endings.length >= 2, label: 'More than one ending', hint: 'Players will surprise you.' },
  ];
  const must = checks.filter(c => c.must);
  const done = must.filter(c => c.ok).length;
  return { checks, done, total: must.length, ready: done === must.length, extras: checks.filter(c => !c.must && c.ok).length, extrasTotal: checks.filter(c => !c.must).length };
}
