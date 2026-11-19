const rnd = n => Math.floor(Math.random() * n);

/* NdM, optional keep-highest/lowest (4d6kh3), optional +/- modifier. */
export function rollExpr(expr) {
  const clean = String(expr || '').replace(/\s+/g, '').toLowerCase();
  const m = clean.match(/^(\d*)d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/);
  if (!m) return null;
  const n = m[1] ? parseInt(m[1], 10) : 1, s = parseInt(m[2], 10);
  const keep = m[3] ? parseInt(m[4], 10) : null, mod = m[5] ? parseInt(m[5], 10) : 0;
  if (n < 1 || n > 100 || s < 2 || s > 1000) return null;
  if (m[3] && (keep < 1 || keep > n)) return null;
  const rolls = Array.from({ length: n }, () => 1 + rnd(s));
  let used = rolls.slice();
  if (m[3]) {
    const sorted = rolls.slice().sort((a, b) => b - a);
    used = m[3] === 'kh' ? sorted.slice(0, keep) : sorted.slice(-keep);
  }
  const total = used.reduce((a, b) => a + b, 0) + mod;
  let detail = clean + '  →  [' + rolls.join(', ') + ']';
  if (m[3]) detail += ' keep [' + used.join(', ') + ']';
  if (mod) detail += ' ' + (mod > 0 ? '+' : '−') + ' ' + Math.abs(mod);
  let note = '';
  if (s === 20 && used.length === 1 && !mod) { if (used[0] === 20) note = 'Natural 20'; else if (used[0] === 1) note = 'Natural 1'; }
  return { expr: clean, total, detail, note };
}
