/* The dice roller: "2d6+3", "d20+5", "4d6kh3", "1d8+1d6+2", with advantage or disadvantage on a d20.
   rollDice() returns the total and a readable breakdown; history is kept by the app. */
const rnd = n => 1 + Math.floor(Math.random() * n);

const TERM = /([+\-])?\s*(?:(\d{0,3})d(\d{1,4}|%)(?:(kh|kl)(\d{1,3}))?|(\d{1,5}))/gy;
export const MAX_DICE = 200;

/* "2d6 + 3" -> terms, or null if it is not a dice expression */
export function parseDice(expr) {
  const s = String(expr ?? '').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!s || s.length > 120) return null;
  const terms = [];
  let dice = 0;
  TERM.lastIndex = 0;
  let pos = 0;
  while (pos < s.length) {
    TERM.lastIndex = pos;
    const m = TERM.exec(s);
    if (!m || m.index !== pos) return null;
    if (pos > 0 && !m[1]) return null;                         // after the first term a sign is needed
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3] !== undefined) {
      const n = m[2] === '' ? 1 : parseInt(m[2], 10);
      const sides = m[3] === '%' ? 100 : parseInt(m[3], 10);
      if (n < 1 || n > MAX_DICE || sides < 2 || sides > 1000) return null;
      const keep = m[4] ? { mode: m[4], n: parseInt(m[5], 10) } : null;
      if (keep && (keep.n < 1 || keep.n > n)) return null;
      dice += n;
      if (dice > MAX_DICE) return null;
      terms.push({ kind: 'dice', sign, n, sides, keep });
    } else terms.push({ kind: 'num', sign, v: parseInt(m[6], 10) });
    pos = TERM.lastIndex;
    while (s[pos] === ' ') pos++;
  }
  return terms.some(t => t.kind === 'dice') ? terms : null;
}

export const normalize = expr => {
  const t = parseDice(expr);
  if (!t) return '';
  return t.map((x, i) => (i === 0 ? (x.sign < 0 ? '-' : '') : (x.sign < 0 ? '-' : '+')) + (x.kind === 'dice' ? (x.n === 1 ? '' : x.n) + 'd' + x.sides + (x.keep ? x.keep.mode + x.keep.n : '') : x.v)).join('');
};

/* mode: 'normal' | 'adv' | 'dis'. It applies to each single d20 in the expression. */
export function rollDice(expr, { mode = 'normal', rng = rnd } = {}) {
  const terms = parseDice(expr);
  if (!terms) return null;
  let total = 0;
  const parts = [];
  let d20 = null;                                              // the single d20 that decides a natural 20 or 1
  for (const t of terms) {
    if (t.kind === 'num') { total += t.sign * t.v; parts.push({ kind: 'num', sign: t.sign, v: t.v }); continue; }
    const single20 = t.n === 1 && t.sides === 20 && !t.keep;
    const roll = () => Array.from({ length: t.n }, () => rng(t.sides));
    let rolls = roll(), other = null, used = rolls;
    if (single20 && (mode === 'adv' || mode === 'dis')) {
      other = roll();
      const pick = mode === 'adv' ? Math.max(rolls[0], other[0]) : Math.min(rolls[0], other[0]);
      used = [pick];
    } else if (t.keep) {
      const sorted = rolls.slice().sort((a, b) => (t.keep.mode === 'kh' ? b - a : a - b));
      used = sorted.slice(0, t.keep.n);
    }
    const sum = used.reduce((a, b) => a + b, 0);
    total += t.sign * sum;
    parts.push({ kind: 'dice', sign: t.sign, n: t.n, sides: t.sides, keep: t.keep, rolls: other ? [rolls[0], other[0]] : rolls, used, sum, advantage: other ? mode : '' });
    if (single20 && d20 === null) d20 = used[0];
  }
  const detail = parts.map((p, i) => {
    const sign = i === 0 ? (p.sign < 0 ? '-' : '') : (p.sign < 0 ? ' - ' : ' + ');
    if (p.kind === 'num') return sign + p.v;
    const label = (p.n === 1 ? '' : p.n) + 'd' + p.sides + (p.keep ? p.keep.mode + p.keep.n : '');
    const r = p.advantage ? '[' + p.rolls.join(', ') + '] ' + (p.advantage === 'adv' ? 'adv' : 'dis') + ' → ' + p.used[0] : '[' + p.rolls.join(', ') + ']' + (p.keep ? ' keep [' + p.used.join(', ') + ']' : '');
    return sign + label + ' ' + r;
  }).join('');
  return { expr: normalize(expr), total, detail, parts, mode, crit: d20 === 20, fumble: d20 === 1 };
}

/* what a click on text in a note should roll: "2d6 + 5" as written, or "+9" after "Attack Roll:" as d20+9 */
export function expressionFor(text) {
  const s = String(text || '').replace(/[−–]/g, '-').trim();
  if (/^[+\-]\s*\d+$/.test(s)) return 'd20' + s.replace(/\s+/g, '');
  return normalize(s);
}
