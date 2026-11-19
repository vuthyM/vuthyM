/* Characters for the Character Library: the rules (scores, hit points, armour class, spell slots, features) worked out from the SRD pack,
   and the markdown file a character is saved as.

   The file is plain markdown that Obsidian shows as it is. The numbers and the text of the "details" sections are in the body, so edits
   made in Obsidian are kept; what the creator needs to rebuild the character (class, level, picks) is in one hidden comment at the end.

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { AB, SKILLS, SKILL_LIST, BACKGROUNDS, STANDARD_ARRAY, POINT_COST, POINT_BUDGET, DSEC, secFor, fieldsFor, RESERVED_HEADINGS } from './chardata.js';
import { serializeKV, splitFrontmatter } from './frontmatter.js';
import { metricize } from './units.js';
import { SRD_CREDIT } from './monsters.js';
import { today } from './util.js';
import { magicAc } from './itemlib.js';

export const mod = n => Math.floor((n - 10) / 2);
export const signed = n => (n >= 0 ? '+' : '−') + Math.abs(n);
export const profBonus = level => Math.ceil(Math.max(1, level) / 4) + 1;
const STATE_RE = /<!--\s*dmforge:character\s+([\s\S]*?)\s*-->/;
const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ---------- a new character ---------- */
const ABN_FULL = { Strength: 'Str', Dexterity: 'Dex', Constitution: 'Con', Intelligence: 'Int', Wisdom: 'Wis', Charisma: 'Cha' };
/* the six standard-array numbers, placed by what the class cares about most */
export function suggestScores(data, cls) {
  const info = data.classes[cls];
  const order = [];
  const primary = info ? String(info.primary).match(/Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma/g) || [] : [];
  for (const p of primary) if (!order.includes(ABN_FULL[p])) order.push(ABN_FULL[p]);
  for (const a of ['Con', 'Dex', 'Wis', 'Cha', 'Int', 'Str']) if (!order.includes(a)) order.push(a);
  const base = {};
  order.forEach((a, i) => { base[a] = STANDARD_ARRAY[i]; });
  return base;
}

export function blankCharacter(data, kind = 'pc') {
  const cls = data.classes.Fighter ? 'Fighter' : Object.keys(data.classes)[0];
  const bg = 'Soldier';
  return {
    v: 1, kind, name: '', level: 1, cls, sub: firstSub(data, cls), species: data.species.Human ? 'Human' : Object.keys(data.species)[0], speciesNote: '',
    bg, bgMode: '21', bgA: BACKGROUNDS[bg].ab[0], bgB: BACKGROUNDS[bg].ab[1], method: 'std', base: suggestScores(data, cls), rolled: null,
    skills: [], extraSkill: '', extraFeat: '', cantrips: [], prepared: [], kit: 'A', gear: [], asiLog: {}, hpRolls: {}, expertise: [], items: [],
    d: { align: 'Neutral' }, sections: ['basics'], custom: [],
  };
}
export const firstSub = (data, cls) => Object.keys((data.classes[cls] || {}).subs || {})[0] || '';

/* ---------- scores ---------- */
export function bonuses(c) {
  const b = { Str: 0, Dex: 0, Con: 0, Int: 0, Wis: 0, Cha: 0 };
  const bg = BACKGROUNDS[c.bg];
  if (!bg) return b;
  if (c.bgMode === '111') bg.ab.forEach(a => { b[a] += 1; });
  else { if (bg.ab.includes(c.bgA)) b[c.bgA] += 2; if (bg.ab.includes(c.bgB) && c.bgB !== c.bgA) b[c.bgB] += 1; }
  return b;
}
/* what the level-up choices added: c.asiLog = { "4": { k: 'asi', plus: { Str: 2 } } | { k: 'feat', feat: 'Alert' } }. An Epic Boon may take a score past 20 */
export function asiBonuses(c) {
  const b = { Str: 0, Dex: 0, Con: 0, Int: 0, Wis: 0, Cha: 0 }, boon = {};
  for (const e of Object.values(c.asiLog || {})) {
    if (!e || !e.plus) continue;
    for (const a of AB) { const n = Number(e.plus[a]) || 0; b[a] += n; if (e.boon && n) boon[a] = true; }
  }
  return { b, boon };
}
export function scores(c) {
  const b = bonuses(c), x = asiBonuses(c), s = {};
  for (const a of AB) s[a] = Math.min(x.boon[a] ? 30 : 20, (Number(c.base[a]) || 8) + b[a] + x.b[a]);
  return s;
}
export const pointsSpent = base => AB.reduce((t, a) => t + (POINT_COST[base[a]] ?? 0), 0);
export const pointsLeft = base => POINT_BUDGET - pointsSpent(base);
export function rollScores(rng = Math.random) {
  return AB.map(() => {
    const dice = [1, 2, 3, 4].map(() => 1 + Math.floor(rng() * 6));
    const drop = dice.indexOf(Math.min(...dice));
    return { dice, drop, total: dice.reduce((a, b) => a + b, 0) - dice[drop] };
  });
}
export function standardArrayProblem(base) {
  const v = AB.map(a => Number(base[a])).sort((a, b) => b - a);
  return STANDARD_ARRAY.some((n, i) => v[i] !== n) ? 'Each number in the standard array (15, 14, 13, 12, 10, 8) is used once.' : '';
}

/* ---------- armour ---------- */
const norm = s => String(s || '').toLowerCase().replace(/^\d+\s*/, '').replace(/s$/, '').trim();
export function armorFor(data, item) {
  const n = norm(item);
  return data.armor.find(a => norm(a.n) === n) || null;
}
export function kitOf(data, c) {
  const cl = data.classes[c.cls];
  return (cl && cl.kits.find(k => k.id === c.kit)) || (cl && cl.kits[0]) || { id: 'A', items: [], gp: 0 };
}
export function gearList(data, c) { return [...kitOf(data, c).items, ...(c.gear || [])]; }
export function armorClass(data, c) {
  const s = scores(c), dexM = mod(s.Dex);
  let body = null, shield = false;
  for (const it of gearList(data, c)) {
    const a = armorFor(data, it);
    if (!a) continue;
    if (a.n === 'Shield') shield = true; else if (!body || a.ac > body.ac) body = a;
  }
  let ac, how;
  if (body) { ac = body.ac + (body.dex ? (body.cap != null ? Math.min(body.cap, dexM) : dexM) : 0); how = body.n; }
  else {
    ac = 10 + dexM; how = 'No armour';
    if (c.cls === 'Barbarian') { ac += mod(s.Con); how = 'Unarmored Defense'; }
    if (c.cls === 'Monk' && !shield) { ac += mod(s.Wis); how = 'Unarmored Defense'; }
  }
  if (shield) { ac += 2; how += ' + Shield'; }
  const mg = magicAc(c);
  if (mg) { ac += mg; how += ' + magic items'; }
  return { ac, how };
}

/* ---------- class, species and spells ---------- */
const col = (arr, level) => { const v = arr ? arr[Math.min(20, Math.max(1, level)) - 1] : null; return v === null || v === undefined ? null : v; };
export function speedMetres(data, c) {
  const sp = (data.species[c.species] || {}).speed || '30 feet';
  const ft = parseInt(sp, 10) || 30;
  return Math.round(ft * 0.3 * 10) / 10;
}
export const fmtSpeed = n => (Number.isInteger(n) ? n : n.toFixed(1)) + ' m';

export function spellInfo(data, c) {
  const cl = data.classes[c.cls];
  if (!cl || !cl.caster) return null;
  const t = cl.table, s = scores(c), ab = cl.ab || 'Int', m = mod(s[ab]), p = profBonus(c.level);
  const cantrips = Number(col(t.cantrips, c.level) || 0), prepared = Number(col(t['prepared-spells'], c.level) || 0);
  let slots = [], pact = null;
  if (t.slots) { slots = t.slots.map(row => Number(col(row, c.level) || 0)); while (slots.length && !slots[slots.length - 1]) slots.pop(); }
  if (t['spell-slots']) pact = { n: Number(col(t['spell-slots'], c.level) || 0), lvl: parseInt(col(t['slot-level'], c.level), 10) || 1 };
  const maxLvl = pact ? pact.lvl : slots.length;
  return { caster: cl.caster, ab, cantrips, prepared, slots, pact, maxLvl, dc: 8 + p + m, atk: p + m };
}
export function slotsText(si) {
  if (!si) return '';
  if (si.pact) return si.pact.n + ' × level ' + si.pact.lvl + ' (Pact Magic)';
  return si.slots.length ? si.slots.map((n, i) => 'L' + (i + 1) + ': ' + n).join(' · ') : 'No spell slots yet';
}
/* the spell picks, trimmed to what this class and level allow */
export function fitSpells(data, c, spells) {
  const si = spellInfo(data, c);
  if (!si) { c.cantrips = []; c.prepared = []; return; }
  const by = new Map((spells || []).map(s => [s.n, s]));
  const ok = (n, cantrip) => { const s = by.get(n); return !spells || (s && s.cl.includes(c.cls) && (cantrip ? s.lv === 0 : s.lv >= 1 && s.lv <= si.maxLvl)); };
  c.cantrips = c.cantrips.filter(n => ok(n, true)).slice(0, si.cantrips);
  c.prepared = c.prepared.filter(n => ok(n, false)).slice(0, si.prepared);
}

export function resources(data, c) {
  const cl = data.classes[c.cls];
  if (!cl) return [];
  return cl.other.map(([name, arr]) => [name, col(arr, c.level)]).filter(r => r[1] !== null && r[1] !== undefined);
}
const firstSentence = (t, max = 190) => {
  const flat = String(t).replace(/\|.*\|/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  const s = m ? m[1] : flat;
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s;
};
export function features(data, c) {
  const cl = data.classes[c.cls];
  const out = [];
  if (cl) {
    for (const [lvl, name, desc] of cl.features) if (lvl <= c.level) out.push({ lvl, name, desc, from: c.cls });
    const sub = c.level >= 3 && c.sub ? cl.subs[c.sub] : null;
    if (sub) for (const [lvl, name, desc] of sub) if (lvl <= c.level) out.push({ lvl, name, desc, from: c.sub });
  }
  return out;
}
export function speciesTraits(data, c) {
  const sp = data.species[c.species];
  return sp ? sp.traits.map(([name, desc]) => ({ name, desc })) : [];
}
export function originFeats(data, c) {
  const names = [(BACKGROUNDS[c.bg] || {}).feat, c.species === 'Human' ? c.extraFeat : ''].filter(Boolean);
  return names.map(n => {
    const base = n.replace(/\s*\(.*\)$/, '');
    const f = data.feats.find(x => x.n === base);
    const desc = f && !/^You gain the following benefits\.?$/i.test(f.desc.trim()) ? f.desc : '';
    return { name: n, desc };
  });
}
export function originFeatChoices(data) { return data.feats.filter(f => f.type === 'Origin').map(f => f.n); }

/* level 1 is the full die; each later level is the average (or what was rolled, c.hpRolls = { "2": 7 }) plus Constitution, at least 1; Dwarves add 1 a level */
export function hpAtLevel(c, hd, conM, lvl) {
  if (lvl <= 1) return Math.max(1, hd + conM) + (c.species === 'Dwarf' ? 1 : 0);
  const r = c.hpRolls && Number(c.hpRolls[lvl]);
  return Math.max(1, (r > 0 ? r : Math.floor(hd / 2) + 1) + conM) + (c.species === 'Dwarf' ? 1 : 0);
}
export function hitPoints(c, hd, conM) {
  let t = 0;
  for (let l = 1; l <= c.level; l++) t += hpAtLevel(c, hd, conM, l);
  return t;
}

/* ---------- everything derived, in one go ---------- */
export function derive(data, c) {
  const cl = data.classes[c.cls];
  const s = scores(c), p = profBonus(c.level), conM = mod(s.Con), dexM = mod(s.Dex);
  const hd = cl ? cl.hd : 8;
  const hp = hitPoints(c, hd, conM);
  const ac = armorClass(data, c);
  const bg = BACKGROUNDS[c.bg] || { skills: [] };
  const proficient = new Set([...c.skills, ...bg.skills, ...(c.species === 'Human' && c.extraSkill ? [c.extraSkill] : [])]);
  const exp = new Set(c.expertise || []);
  const skills = SKILL_LIST.map(n => ({ n, ab: SKILLS[n], p: proficient.has(n), e: proficient.has(n) && exp.has(n), v: mod(s[SKILLS[n]]) + (proficient.has(n) ? p : 0) + (proficient.has(n) && exp.has(n) ? p : 0) }));
  const saveSet = cl ? cl.saves : [];
  const saves = AB.map(a => ({ a, p: saveSet.includes(a), v: mod(s[a]) + (saveSet.includes(a) ? p : 0) }));
  return { s, p, hp, hd, ac: ac.ac, acHow: ac.how, init: dexM, speed: speedMetres(data, c), skills, saves, pp: 10 + skills.find(x => x.n === 'Perception').v, spells: spellInfo(data, c) };
}

/* ---------- the details sections ---------- */
export const labelMap = (() => {
  const m = new Map();
  for (const sec of DSEC) for (const f of sec.f) m.set(f.l, f.k);
  return m;
})();
const fieldLine = (label, text) => (/[?…]$/.test(label) ? '**' + label + '** ' : '**' + label + ':** ') + text;
export function filledSections(c) {
  const out = [];
  for (const sec of secFor(c.kind)) {
    if (!c.sections.includes(sec.id)) continue;
    const rows = fieldsFor(c.kind, sec).map(f => [f.l, String(c.d[f.k] ?? '').trim()]).filter(r => r[1]);
    if (rows.length) out.push({ title: sec.t, rows });
  }
  for (const cu of c.custom || []) if (oneLine(cu.title) && String(cu.text || '').trim()) out.push({ title: oneLine(cu.title), rows: [['', String(cu.text).trim()]] });
  return out;
}
export function detailsMarkdown(c) {
  const L = [];
  for (const g of filledSections(c)) {
    L.push('## ' + g.title, '');
    for (const [label, text] of g.rows) L.push(label ? fieldLine(label, text) : text, '');
  }
  return L;
}
/* the details sections of a body, read back (so edits made in Obsidian survive) */
export function parseDetails(body) {
  const lines = String(body || '').replace(STATE_RE, '').split(/\r?\n/);
  const secs = [];
  let cur = null;
  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = { title: h[1], lines: [] }; secs.push(cur); } else if (cur) cur.lines.push(line);
  }
  const d = {}, sections = [], custom = [];
  for (const sec of secs) {
    const def = DSEC.find(x => x.t === sec.title);
    if (def) {
      let key = null;
      for (const raw of sec.lines) {
        const m = /^\*\*(.+?)\*\*[ \t]?(.*)$/.exec(raw);
        const label = m ? m[1].replace(/:$/, '') : '';
        if (m && labelMap.has(label)) { key = labelMap.get(label); d[key] = m[2]; if (!sections.includes(def.id)) sections.push(def.id); } else if (key) d[key] += '\n' + raw;
        if (/^---\s*$/.test(raw)) key = null;
      }
    } else if (!RESERVED_HEADINGS.includes(sec.title)) {
      const text = sec.lines.join('\n').replace(/\n---\s*\n_[^\n]*_\s*$/, '').replace(/\n---\s*$/, '').trim();
      if (text) custom.push({ title: sec.title, text });
    }
  }
  for (const k of Object.keys(d)) d[k] = String(d[k]).replace(/\n---\s*(\n_[^\n]*_)?\s*$/, '').trim();
  return { d, sections, custom };
}

/* ---------- the file ---------- */
const STATE_KEYS = ['v', 'kind', 'name', 'level', 'cls', 'sub', 'species', 'speciesNote', 'bg', 'bgMode', 'bgA', 'bgB', 'method', 'base', 'skills', 'extraSkill', 'extraFeat', 'cantrips', 'prepared', 'kit', 'gear', 'asiLog', 'hpRolls', 'expertise', 'items'];
export function stateOf(c) {
  const o = {};
  for (const k of STATE_KEYS) o[k] = c[k];
  return JSON.stringify(o).replace(/>/g, '\\u003e').replace(/--/g, '-\\u002d');
}

export function characterFrontmatter(data, c, dv = derive(data, c)) {
  const fm = {
    type: 'character', kind: c.kind, class: c.cls, subclass: c.level >= 3 ? c.sub : '', level: c.level, species: c.species, background: c.bg,
    alignment: oneLine(c.d.align), concept: oneLine(c.d.concept), player: c.kind === 'pc' ? oneLine(c.d.player) : '',
    hp: dv.hp, ac: dv.ac, init: dv.init, speed: fmtSpeed(dv.speed), perception: dv.pp, prof: dv.p,
    str: dv.s.Str, dex: dv.s.Dex, con: dv.s.Con, int: dv.s.Int, wis: dv.s.Wis, cha: dv.s.Cha,
    source: 'DM Forge Character Library', updated: today(),
  };
  return fm;
}

export function characterMarkdown(data, c) {
  const cl = data.classes[c.cls] || { kits: [], table: {} };
  const dv = derive(data, c);
  const fm = characterFrontmatter(data, c, dv);
  const L = ['---'];
  for (const [k, v] of Object.entries(fm)) if (v !== '') L.push(...serializeKV(k, v));
  L.push('---', '');
  L.push('# ' + (oneLine(c.name) || 'Unnamed character'), '');
  L.push('*Level ' + c.level + ' ' + c.species + ' ' + c.cls + (c.level >= 3 && c.sub ? ' (' + c.sub + ')' : '') + ' · ' + c.bg + (oneLine(c.d.align) ? ' · ' + oneLine(c.d.align) : '') + '*', '');
  L.push('**AC** ' + dv.ac + ' (' + dv.acHow + ') · **HP** ' + dv.hp + ' (' + c.level + 'd' + dv.hd + ') · **Initiative** ' + signed(dv.init) + ' · **Speed** ' + fmtSpeed(dv.speed) + ' · **Proficiency** ' + signed(dv.p), '');
  L.push('| Str | Dex | Con | Int | Wis | Cha |', '|:-:|:-:|:-:|:-:|:-:|:-:|', '| ' + AB.map(a => dv.s[a] + ' (' + signed(mod(dv.s[a])) + ')').join(' | ') + ' |', '');
  L.push('**Saving Throws** ' + dv.saves.filter(x => x.p).map(x => x.a + ' ' + signed(x.v)).join(', ') + '  ');
  L.push('**Skills** ' + (dv.skills.filter(x => x.p).map(x => x.n + ' ' + signed(x.v) + (x.e ? ' (expertise)' : '')).join(', ') || 'none') + '  ');
  L.push('**Passive Perception** ' + dv.pp, '');
  const profs = [['Armor', cl.armor], ['Weapons', cl.weapons], ['Tools', [cl.tools, (BACKGROUNDS[c.bg] || {}).tool].filter(Boolean).join('; ')]].filter(r => r[1] && r[1] !== 'None');
  if (profs.length) L.push('## Proficiencies', '', ...profs.map(r => '- **' + r[0] + '.** ' + r[1]), '');
  const res = resources(data, c);
  if (res.length) L.push('## Class resources', '', res.map(r => r[0] + ': ' + r[1]).join(' · '), '');
  L.push('## Features', '');
  for (const f of features(data, c)) L.push('- **' + f.name + '** _(' + f.from + ' ' + f.lvl + ')_. ' + firstSentence(f.desc));
  for (const t of speciesTraits(data, c)) L.push('- **' + t.name + '** _(' + c.species + ')_. ' + firstSentence(t.desc));
  for (const f of originFeats(data, c)) L.push('- **' + f.name + '** _(Origin feat)_.' + (f.desc ? ' ' + firstSentence(f.desc) : ''));
  L.push('');
  const lv = levelChoices(c);
  if (lv.length) L.push('## Level choices', '', ...lv.map(x => '- ' + x), '');
  if ((c.items || []).length) {
    L.push('## Magic items', '');
    for (const i of c.items) L.push('- [[' + i.n + ']]' + (i.req ? (i.attuned ? ' _(attuned)_' : ' _(needs attunement)_') : '') + (i.ac ? ' · +' + i.ac + ' AC' : ''));
    L.push('', '**Attuned** ' + c.items.filter(i => i.attuned).length + ' of 3', '');
  }
  const si = dv.spells;
  if (si) {
    L.push('## Spells', '', '**Spellcasting ability** ' + si.ab + ' · **Spell save DC** ' + si.dc + ' · **Spell attack** ' + signed(si.atk), '', '**Slots** ' + slotsText(si), '');
    if (c.cantrips.length) L.push('**Cantrips** ' + c.cantrips.map(n => '[[' + n + ']]').join(', '), '');
    if (c.prepared.length) L.push('**Prepared** ' + c.prepared.map(n => '[[' + n + ']]').join(', '), '');
  }
  const gear = gearList(data, c);
  L.push('## Equipment', '', ...gear.map(g => '- ' + g), ...(c.kit && kitOf(data, c).gp ? ['- ' + kitOf(data, c).gp + ' GP'] : []), '');
  L.push(...detailsMarkdown(c));
  L.push('---', '_Built with the SRD 5.2.1 (CC-BY 4.0). ' + SRD_CREDIT.replace(/^This work includes material from /, 'Includes material from ') + '_', '');
  L.push('<!-- dmforge:character ' + stateOf(c) + ' -->', '');
  return metricize(L.join('\n'));
}

/* reads a character file: its properties and, when the creator made it, the character to edit */
export function parseCharacterFile(text) {
  const sp = splitFrontmatter(text);
  const m = STATE_RE.exec(sp.body);
  let state = null;
  if (m) { try { const v = JSON.parse(m[1]); if (v && typeof v === 'object' && v.cls && v.base) state = v; } catch (e) { /* not valid: treated as a plain note */ } }
  return { fm: sp.fm, state, body: sp.body };
}
/* the level-up choices as plain lines for the file ("Level 4: +2 Strength") */
function levelChoices(c) {
  const out = [];
  for (const l of Object.keys(c.asiLog || {}).map(Number).sort((a, b) => a - b)) {
    const e = c.asiLog[l];
    if (!e) continue;
    const plus = e.plus ? Object.entries(e.plus).filter(([, n]) => n).map(([a, n]) => '+' + n + ' ' + a).join(', ') : '';
    out.push('Level ' + l + ': ' + (e.k === 'feat' ? e.feat + (plus ? ' (' + plus + ')' : '') : plus));
  }
  if ((c.expertise || []).length) out.push('Expertise: ' + c.expertise.join(', '));
  const rolls = Object.keys(c.hpRolls || {}).map(Number).sort((a, b) => a - b);
  if (rolls.length) out.push('Hit points rolled or set by hand at level ' + rolls.join(', ') + '; the average for the rest');
  return out;
}

/* the character to edit, from a file's text (null when the creator did not make it) */
export function characterFromText(data, text, name) {
  const { state, body } = parseCharacterFile(text);
  if (!state) return null;
  const blank = blankCharacter(data, state.kind === 'npc' ? 'npc' : 'pc');
  const det = parseDetails(body);
  const c = Object.assign(blank, state, { name: name || state.name || '' });
  if (!data.classes[c.cls]) return null;
  if (!data.species[c.species]) c.species = blank.species;
  c.base = Object.assign({}, blank.base, state.base);
  c.d = Object.assign({ align: 'Neutral' }, det.d);
  c.custom = det.custom;
  const ids = secFor(c.kind).map(x => x.id);
  c.sections = ['basics', ...det.sections.filter(id => id !== 'basics' && ids.includes(id))];
  c.rolled = null;
  return c;
}

export const fileNameOf = c => String(c.name || '').replace(/[\\/:*?"<>|#^\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
