/* Levelling a library character up: what the new level gives, and the choices it asks for (hit points, an ability score
   improvement or feat, expertise, spells). The character is changed in place; the creator rebuilds the sheet from it.

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { AB, SKILL_LIST } from './chardata.js';
import { derive, features, spellInfo, scores, profBonus, hpAtLevel, mod, fitSpells } from './character.js';

export const MAX_LEVEL = 20;
const SCHOLAR = ['Arcana', 'History', 'Investigation', 'Medicine', 'Nature', 'Religion'];

/* the levels at which this class gets an ability score improvement (or the epic boon at 19) */
export function asiLevels(data, cls) {
  const cl = data.classes[cls];
  if (!cl) return [];
  return cl.features.filter(f => /^(Ability Score Improvement|Epic Boon)/i.test(f[1])).map(f => ({ lvl: f[0], boon: /^Epic Boon/i.test(f[1]) })).sort((a, b) => a.lvl - b.lvl);
}
/* improvements the character has earned but not yet chosen */
export function pendingAsi(data, c) {
  return asiLevels(data, c.cls).filter(x => x.lvl <= c.level && !(c.asiLog && c.asiLog[x.lvl]));
}
/* feats offered at an improvement level */
export function featsFor(data, boon) {
  return data.feats.filter(f => (boon ? f.type === 'Epic Boon' : f.type === 'General' && f.n !== 'Ability Score Improvement')).map(f => ({ n: f.n, desc: f.desc, type: f.type }));
}

/* how many skills of expertise the character should have by now, and which they may choose from */
export function expertiseDue(data, c) {
  const cl = data.classes[c.cls];
  if (!cl) return 0;
  let n = 0;
  for (const [lvl, name] of cl.features) if (lvl <= c.level) { if (/^Expertise/i.test(name)) n += 2; else if (/^Scholar/i.test(name)) n += 1; }
  return n;
}
export function expertisePending(data, c) { return Math.max(0, expertiseDue(data, c) - (c.expertise || []).length); }
export function expertiseChoices(data, c) {
  const dv = derive(data, c), have = new Set(c.expertise || []);
  const scholar = data.classes[c.cls] && data.classes[c.cls].features.some(f => /^Scholar/i.test(f[1]) && f[0] <= c.level);
  return dv.skills.filter(x => x.p && !have.has(x.n) && (!scholar || SCHOLAR.includes(x.n) || data.classes[c.cls].features.some(f => /^Expertise/i.test(f[1])))).map(x => x.n);
}

/* hit points: the average for a level and the die */
export const hpAverage = (data, c) => Math.floor(data.classes[c.cls].hd / 2) + 1;
export const hitDie = (data, c) => data.classes[c.cls].hd;

/* what going from c.level to `to` gives, without changing the character */
export function preview(data, c, to) {
  const from = c.level;
  const hi = Object.assign({}, c, { level: to });
  const before = features(data, c).map(f => f.from + '|' + f.name), now = features(data, hi);
  const gained = now.filter(f => !before.includes(f.from + '|' + f.name));
  const a = spellInfo(data, c), b = spellInfo(data, hi);
  const sc = scores(c);
  const levels = [];
  for (let l = from + 1; l <= to; l++) levels.push(l);
  const asi = asiLevels(data, c.cls).filter(x => x.lvl > from && x.lvl <= to || (x.lvl <= from && !(c.asiLog && c.asiLog[x.lvl])));
  return {
    from, to, levels, gained, asi,
    prof: [profBonus(from), profBonus(to)],
    cantrips: a || b ? [(a || {}).cantrips || 0, (b || {}).cantrips || 0] : null,
    prepared: a || b ? [(a || {}).prepared || 0, (b || {}).prepared || 0] : null,
    slots: b ? b.slots : null, pact: b ? b.pact : null, caster: !!b,
    conMod: mod(sc.Con), die: data.classes[c.cls].hd,
    newSub: from < 3 && to >= 3 && !!c.sub,
    expertise: Math.max(0, expertiseDue(data, hi) - (c.expertise || []).length),
  };
}

/* the choices a level-up form collects:
   { to, hp: { "5": 7 }  (a roll or typed number; missing = average),
     asi: { "4": { k:'asi', plus:{Str:1,Dex:1} } | { k:'feat', feat:'Alert' } },
     expertise: ['Stealth', ...], cantrips: [...], prepared: [...] }
   Returns a list of plain problems; empty when it can be applied. */
export function problems(data, c, pv, ch) {
  const out = [];
  const hd = data.classes[c.cls].hd;
  for (const l of pv.levels) {
    const v = ch.hp && ch.hp[l];
    if (v !== undefined && v !== '' && !(Number(v) >= 1 && Number(v) <= hd)) out.push('The hit points for level ' + l + ' must be between 1 and ' + hd + ' (the hit die), or left as the average.');
  }
  for (const x of pv.asi) {
    const e = ch.asi && ch.asi[x.lvl];
    if (!e) { out.push('Choose the ' + (x.boon ? 'Epic Boon' : 'ability score improvement') + ' for level ' + x.lvl + '.'); continue; }
    if (e.k === 'feat') { if (!e.feat) out.push('Choose a feat for level ' + x.lvl + '.'); else if (x.boon && !e.plus) { /* boons may add 1; not required */ } }
    else {
      const t = AB.reduce((n, a) => n + (Number(e.plus && e.plus[a]) || 0), 0);
      if (t !== 2) out.push('Level ' + x.lvl + ': spread exactly 2 points across your scores (+2 to one, or +1 to two).');
      for (const a of AB) if ((Number(e.plus && e.plus[a]) || 0) > 2) out.push('Level ' + x.lvl + ': no more than +2 to one score.');
    }
  }
  if (pv.expertise > 0 && (ch.expertise || []).length < pv.expertise) out.push('Choose ' + pv.expertise + ' skill' + (pv.expertise === 1 ? '' : 's') + ' for Expertise.');
  return out;
}

/* applies the choices to a copy of the character and returns it (the original is not changed) */
export function applyLevelUp(data, c, ch, spells) {
  const n = JSON.parse(JSON.stringify(c));
  n.level = ch.to;
  n.hpRolls = n.hpRolls || {}; n.asiLog = n.asiLog || {}; n.expertise = n.expertise || [];
  for (const [l, v] of Object.entries(ch.hp || {})) if (v !== undefined && v !== '' && Number(l) > c.level) n.hpRolls[l] = Number(v);
  for (const [l, e] of Object.entries(ch.asi || {})) {
    if (!e) continue;
    if (e.k === 'feat') {
      const boon = data.feats.find(f => f.n === e.feat && f.type === 'Epic Boon');
      n.asiLog[l] = { k: 'feat', feat: e.feat, ...(e.plus && Object.values(e.plus).some(Boolean) ? { plus: e.plus, boon: !!boon } : {}) };
    } else n.asiLog[l] = { k: 'asi', plus: Object.fromEntries(AB.filter(a => Number(e.plus && e.plus[a])).map(a => [a, Number(e.plus[a])])) };
  }
  if (ch.expertise && ch.expertise.length) n.expertise = [...new Set([...n.expertise, ...ch.expertise])];
  if (ch.cantrips) n.cantrips = ch.cantrips.slice();
  if (ch.prepared) n.prepared = ch.prepared.slice();
  fitSpells(data, n, spells);
  return n;
}

/* a note of what levelling gave, for the sheet and the confirmation */
export function summary(data, c, pv) {
  const lines = [];
  lines.push('Level ' + pv.from + ' → ' + pv.to);
  if (pv.prof[0] !== pv.prof[1]) lines.push('Proficiency bonus +' + pv.prof[0] + ' → +' + pv.prof[1]);
  for (const f of pv.gained) lines.push(f.name + ' (' + f.from + ' ' + f.lvl + ')');
  return lines;
}
export { SKILL_LIST };
