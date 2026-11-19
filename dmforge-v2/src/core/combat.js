import { uid } from './util.js';
import { rollExpr } from './dice.js';

export const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Concentrating'];

export function newCombat() {
  return { id: uid(), startedAt: Date.now(), round: 1, turn: 0, seq: 0, combatants: [] };
}

/* ---------- the combat log: every change, by round and by whose turn it is ---------- */
const whoseTurn = state => { const c = state.combatants[state.turn]; return c ? c.name : ''; };
const initLine = state => 'Initiative: ' + state.combatants.map(c => c.name + ' ' + c.init).join(', ');
function openLog(state) {
  if (state.opened) return;
  state.opened = true;
  if (!state.log) state.log = [];
  if (state.combatants.length) {
    state.log.push({ kind: 'init', r: state.round, t: '', text: initLine(state) });
    state.log.push({ kind: 'turn', r: state.round, t: whoseTurn(state), text: '' });
  }
}
/* adds a line to the log. Changes made while setting up the fight (adding creatures, rolling initiative) are left out until the
   fight has begun: its first turn change, hit point change, condition or note. */
export function logEvent(state, text, { setup = false, kind = 'event', id = '' } = {}) {
  if (!state.log) state.log = [];
  if (!state.opened) { if (setup) return; openLog(state); }
  state.log.push({ kind, r: state.round, t: whoseTurn(state), text, id });
}
export function addLogNote(state, text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (t) logEvent(state, 'Note: ' + t, { kind: 'note' });
}

export const isDown = c => (!c.pc && c.hp <= 0) || deathState(c) === 'dead';

export function rollInit(bonus) {
  const r = rollExpr('d20');
  return r.total + (Number(bonus) || 0);
}

function currentId(state) { const c = state.combatants[state.turn]; return c ? c.id : null; }

/* The list is always highest initiative first. Once the fight has begun the turn stays with whoever has it (a late arrival or a changed
   number does not steal it); before that, whoever is on top has it, however the list was put together (adding the party one at a time
   used to leave the turn with whoever was added first, even when they rolled lowest). */
function sortKeepTurn(state) {
  const id = state.opened ? currentId(state) : '';
  state.combatants.sort((a, b) => (b.init - a.init) || (a.order - b.order));
  if (id) { const i = state.combatants.findIndex(c => c.id === id); if (i >= 0) state.turn = i; }
  else if (!state.opened) state.turn = 0;
}

/* init: a number, or 'roll' to roll d20 + bonus separately for every creature added */
export function addCombatant(state, { name, init, hp = 1, maxHp, ac = null, pc = false, count = 1, bonus = 0, mon = '', legendary = 0, uses = [] }) {
  const n = Math.max(1, Math.min(30, count));
  const b = Number(bonus) || 0;
  const made = [];
  for (let i = 0; i < n; i++) {
    made.push({
      id: uid(), name: n > 1 ? name + ' ' + (i + 1) : name,
      init: init === 'roll' ? rollInit(b) : Number(init) || 0,
      bonus: b,
      hp: Number(hp) || 0, maxHp: Number(maxHp ?? hp) || Number(hp) || 0, ac, pc: !!pc, conds: [], order: state.seq++,
      temp: 0, ds: { s: 0, f: 0 }, reaction: false, note: '', mon: mon || '',
      leg: legendary > 0 ? { n: legendary, max: legendary } : null,
      uses: (uses || []).map(u => ({ name: u.name, kind: u.kind === 'day' ? 'day' : 'recharge', n: Number(u.n) || 0, left: u.kind === 'day' ? Number(u.n) || 0 : 1 })),
    });
  }
  state.combatants.push(...made);
  sortKeepTurn(state);
  for (const c of made) logEvent(state, c.name + ' joined the fight (initiative ' + c.init + ')', { setup: true });
}

/* rolls (or re-rolls) one creature's initiative; returns the new value */
export function rollFor(state, id) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return null;
  const v = rollInit(c.bonus || 0);
  c.init = v;
  sortKeepTurn(state);
  logEvent(state, c.name + ' rolled initiative: ' + v, { setup: true });
  return v;
}
/* rolls initiative for every creature that is not a player character */
export function rollEnemies(state) {
  let n = 0;
  for (const c of state.combatants) if (!c.pc) { c.init = rollInit(c.bonus || 0); n++; }
  sortKeepTurn(state);
  logEvent(state, 'Rolled initiative for ' + n + ' enem' + (n === 1 ? 'y' : 'ies') + '. ' + initLine(state), { setup: true });
  return n;
}

export function setInit(state, id, value) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  c.init = Number(value) || 0;
  sortKeepTurn(state);
  const last = state.log && state.log[state.log.length - 1];
  const text = c.name + '\u2019s initiative set to ' + c.init;
  if (last && last.kind === 'initset' && last.id === c.id) last.text = text;       // typing a number is one change, not one per key
  else logEvent(state, text, { setup: true, kind: 'initset', id: c.id });
}

/* damage uses up temporary hit points first */
export function damage(state, id, amount) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  let a = Math.abs(Number(amount) || 0);
  const total = a;
  const t = Math.min(c.temp || 0, a);
  c.temp = (c.temp || 0) - t; a -= t;
  const was = c.hp;
  c.hp = Math.max(0, c.hp - a);
  if (c.pc && c.hp === 0 && was > 0) c.ds = { s: 0, f: 0 };
  let text = c.name + ' took ' + total + ' (' + was + ' \u2192 ' + c.hp + ')';
  if (t) text += ', ' + t + ' absorbed by temporary hit points';
  if (was > 0 && c.hp === 0) text += c.pc ? ': down, dying' : ': down';
  else if (was === 0 && c.pc && total > 0) text += ': at 0 already';
  logEvent(state, text);
}
export function heal(state, id, amount) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  const was = c.hp;
  c.hp = Math.min(c.maxHp, c.hp + Math.abs(Number(amount) || 0));
  if (was === 0 && c.hp > 0) c.ds = { s: 0, f: 0 };
  logEvent(state, c.name + ' healed ' + (c.hp - was) + ' (' + was + ' \u2192 ' + c.hp + ')' + (was === 0 && c.hp > 0 ? ': back up' : ''));
}
/* temporary hit points do not stack: you keep the larger number */
export function setTemp(state, id, amount) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  const before = c.temp || 0;
  c.temp = Math.max(before, Math.abs(Number(amount) || 0));
  logEvent(state, c.name + (c.temp > before ? ' gained ' + c.temp + ' temporary hit points' : ' kept ' + before + ' temporary hit points'));
}
export function clearTemp(state, id) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  const had = c.temp || 0;
  c.temp = 0;
  if (had) logEvent(state, c.name + ' lost the temporary hit points');
}

/* death saving throws for a player character at 0 hit points */
export function deathState(c) {
  if (!c.pc || c.hp > 0) return '';
  const d = c.ds || { s: 0, f: 0 };
  return d.f >= 3 ? 'dead' : d.s >= 3 ? 'stable' : 'dying';
}
export function deathSave(state, id, kind) {
  const c = state.combatants.find(x => x.id === id);
  if (!c || !c.pc || c.hp > 0) return;
  const d = c.ds = Object.assign({ s: 0, f: 0 }, c.ds);
  const before = deathState(c);
  let say = '';
  if (kind === 'success') { d.s = Math.min(3, d.s + 1); say = 'death save: success'; }
  else if (kind === 'fail') { d.f = Math.min(3, d.f + 1); say = 'death save: fail'; }
  else if (kind === 'crit') { d.f = Math.min(3, d.f + 2); say = 'was hit while dying: two failures'; }
  else if (kind === 'undo-success') d.s = Math.max(0, d.s - 1);
  else if (kind === 'undo-fail') d.f = Math.max(0, d.f - 1);
  else if (kind === 'nat20') { c.hp = 1; c.ds = { s: 0, f: 0 }; say = 'rolled a natural 20 on a death save: back up with 1 hit point'; }
  else if (kind === 'reset') { c.ds = { s: 0, f: 0 }; say = 'death saves reset'; }
  if (!say) return;
  let text = c.name + ' ' + say;
  const after = deathState(c);
  if (c.hp === 0 && kind !== 'reset') text += ' (' + c.ds.s + ' successes, ' + c.ds.f + ' failures)';
  if (after !== before && after === 'dead') text += ': dead';
  else if (after !== before && after === 'stable') text += ': stable';
  logEvent(state, text);
}
export function toggleReaction(state, id) { const c = state.combatants.find(x => x.id === id); if (!c) return; c.reaction = !c.reaction; if (c.reaction) logEvent(state, c.name + ' used its reaction'); }
export function setNote(state, id, text) { const c = state.combatants.find(x => x.id === id); if (c) c.note = String(text || '').slice(0, 200); }
export function legendary(state, id, delta) {
  const c = state.combatants.find(x => x.id === id);
  if (!c || !c.leg) return;
  const before = c.leg.n;
  c.leg.n = Math.max(0, Math.min(c.leg.max, c.leg.n + delta));
  if (c.leg.n < before) logEvent(state, c.name + ' used a legendary action (' + c.leg.n + '/' + c.leg.max + ' left)');
  else if (c.leg.n > before) logEvent(state, c.name + ' got a legendary action back (' + c.leg.n + '/' + c.leg.max + ')');
}
/* a recharge ability is ready or spent; a "per day" one counts down (dir -1) or back up (dir +1) */
export function useAbility(state, id, i, dir = -1) {
  const c = state.combatants.find(x => x.id === id);
  const u = c && c.uses && c.uses[i];
  if (!u) return;
  const short = u.name.replace(/\s*\(.*$/, '');
  if (u.kind === 'recharge') { u.left = u.left ? 0 : 1; logEvent(state, c.name + '\u2019s ' + short + (u.left ? ' is ready again' : ' is spent')); }
  else { const before = u.left; u.left = Math.max(0, Math.min(u.n, u.left + dir)); if (u.left !== before) logEvent(state, c.name + (u.left < before ? ' used ' : ' got back ') + short + ' (' + u.left + '/' + u.n + ' left)'); }
}
/* rolls a d6 for a spent recharge ability; returns the roll, or null */
export function rollRecharge(state, id, i, roll = () => 1 + Math.floor(Math.random() * 6)) {
  const c = state.combatants.find(x => x.id === id);
  const u = c && c.uses && c.uses[i];
  if (!u || u.kind !== 'recharge') return null;
  const r = roll();
  if (r >= u.n) u.left = 1;
  logEvent(state, c.name + ' rolled ' + r + ' to recharge ' + u.name.replace(/\s*\(.*$/, '') + ': ' + (r >= u.n ? 'recharged' : 'still spent'));
  return r;
}
export function toggleCondition(state, id, cond) {
  const c = state.combatants.find(x => x.id === id);
  if (!c) return;
  const i = c.conds.indexOf(cond);
  if (i >= 0) c.conds.splice(i, 1); else c.conds.push(cond);
  logEvent(state, c.name + (i >= 0 ? ' is no longer ' : ' is now ') + cond);
}
export function removeCombatant(state, id) {
  const i = state.combatants.findIndex(c => c.id === id);
  if (i < 0) return;
  logEvent(state, state.combatants[i].name + ' left the fight', { setup: true });
  state.combatants.splice(i, 1);
  if (i < state.turn) state.turn--;
  if (state.turn >= state.combatants.length) state.turn = 0;
}

/* advances to the next combatant that is still up; wrapping bumps the round */
export function nextTurn(state) {
  const n = state.combatants.length;
  if (!n) return;
  openLog(state);
  for (let step = 0; step < n; step++) {
    state.turn++;
    if (state.turn >= n) { state.turn = 0; state.round++; }
    if (!isDown(state.combatants[state.turn])) {
      const c = state.combatants[state.turn];
      c.reaction = false;                                   // a turn begins: the reaction is back, and so are legendary actions
      if (c.leg) c.leg.n = c.leg.max;
      if (!state.log) state.log = [];
      state.log.push({ kind: 'turn', r: state.round, t: c.name, text: '' });
      return;
    }
  }
}

/* the log by round and turn: [{ r, init, turns: [{ name, events: [text] }] }] */
export function logGroups(state) {
  const rounds = [];
  let round = null, turn = null;
  for (const e of state.log || []) {
    if (!round || round.r !== e.r) { round = { r: e.r, init: '', turns: [] }; rounds.push(round); turn = null; }
    if (e.kind === 'init') { round.init = e.text; continue; }
    if (e.kind === 'turn') { turn = { name: e.t, events: [] }; round.turns.push(turn); continue; }
    if (!turn || turn.name !== e.t) { turn = { name: e.t, events: [] }; round.turns.push(turn); }
    turn.events.push(e.text);
  }
  return rounds;
}

/* the log as an Obsidian callout (folded), a heading for each turn, and turns where nothing happened joined on one line */
export function logMarkdown(state, date) {
  const rounds = logGroups(state);
  if (!rounds.some(r => r.turns.some(t => t.events.length))) return '';
  const lines = ['> [!note]- Combat log: ' + date + ' (' + state.round + ' round' + (state.round === 1 ? '' : 's') + ')'];
  for (const r of rounds) {
    lines.push('> **Round ' + r.r + '**');
    if (r.init) lines.push('> - ' + r.init);
    let quiet = [];
    const flush = () => { if (quiet.length) { lines.push('> - Nothing logged: ' + quiet.join(', ')); quiet = []; } };
    for (const t of r.turns) {
      if (!t.events.length) { if (t.name) quiet.push(t.name); continue; }
      flush();
      lines.push('> - \u25B6 **' + (t.name || 'Before the first turn') + '**');
      for (const e of t.events) lines.push('>   - ' + e);
    }
    flush();
  }
  return lines.join('\n');
}

export function summaryMarkdown(state, date) {
  const party = state.combatants.filter(c => c.pc);
  const foes = state.combatants.filter(c => !c.pc);
  const down = foes.filter(isDown);
  const up = foes.filter(c => !isDown(c));
  const lines = ['### Combat — ' + date + ' (' + state.round + ' round' + (state.round === 1 ? '' : 's') + ')'];
  if (party.length) lines.push('- **Party:** ' + party.map(c => c.name + ' ' + c.hp + '/' + c.maxHp + (c.temp ? ' +' + c.temp + ' temp' : '') + (deathState(c) ? ' (' + deathState(c) + ')' : '') + (c.conds.length ? ' (' + c.conds.join(', ') + ')' : '')).join(', '));
  if (down.length) lines.push('- **Defeated:** ' + down.map(c => c.name).join(', '));
  if (up.length) lines.push('- **Still standing:** ' + up.map(c => c.name + ' ' + c.hp + '/' + c.maxHp).join(', '));
  return lines.join('\n');
}
