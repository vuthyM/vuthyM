/* The note graph: one node per note, one line per [[link]] (links in properties count too).
   graphData reads it from the index; localSubgraph is Obsidian's "local graph" (a note and
   what is within a few links of it); createSim lays the nodes out with a small force simulation. */

export function graphData(index) {
  const nodes = new Map();
  for (const n of index.notes) nodes.set(n.path, { id: n.path, name: n.name, type: n.type, deg: 0, pending: n.pending || null });
  const seen = new Set();
  const links = [];
  for (const n of index.notes) {
    for (const l of n.links) {
      const r = index.resolve(l);
      if (!r || r.path === n.path || !nodes.has(r.path)) continue;
      const key = n.path < r.path ? n.path + '\n' + r.path : r.path + '\n' + n.path;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ a: n.path, b: r.path });
      nodes.get(n.path).deg++; nodes.get(r.path).deg++;
    }
  }
  return { nodes, links };
}

/* ids within `depth` links of `focus` (including it) */
export function localSubgraph(data, focus, depth) {
  const adj = new Map();
  for (const l of data.links) {
    if (!adj.has(l.a)) adj.set(l.a, []); if (!adj.has(l.b)) adj.set(l.b, []);
    adj.get(l.a).push(l.b); adj.get(l.b).push(l.a);
  }
  const keep = new Set(data.nodes.has(focus) ? [focus] : []);
  let frontier = [...keep];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const id of frontier) for (const o of adj.get(id) || []) if (!keep.has(o)) { keep.add(o); next.push(o); }
    frontier = next;
  }
  return keep;
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; };
export const nodeRadius = deg => 4 + 1.7 * Math.sqrt(deg);

/* nodes: [{ id, deg }], edges: [{ a, b }] (ids). `prev` is a Map id -> {x,y} so the picture does not jump
   when a note is edited. The sim is a plain object: call tick() repeatedly while alpha is above ~0.02. */
export function createSim(nodes, edges, prev) {
  const n = nodes.length;
  const at = new Map(nodes.map((nd, i) => [nd.id, i]));
  const x = new Float64Array(n), y = new Float64Array(n), vx = new Float64Array(n), vy = new Float64Array(n);
  const pinned = new Uint8Array(n);
  nodes.forEach((nd, i) => {
    const p = prev && prev.get(nd.id);
    if (p) { x[i] = p.x; y[i] = p.y; }
    else { const r = 30 + 22 * Math.sqrt(i), a = hash(nd.id) * Math.PI * 2 + i * 2.4; x[i] = Math.cos(a) * r; y[i] = Math.sin(a) * r; }
  });
  const E = edges.map(e => [at.get(e.a), at.get(e.b)]).filter(([a, b]) => a !== undefined && b !== undefined);
  const deg = nodes.map(nd => nd.deg || 0);
  const sim = {
    nodes, x, y, pinned, alpha: 1, index: at,
    reheat(a = 0.5) { sim.alpha = Math.max(sim.alpha, a); },
    tick() {
      const a = sim.alpha;
      const R2 = 340 * 340;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = x[j] - x[i], dy = y[j] - y[i];
          let d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          if (d2 < 0.01) { dx = (hash(nodes[i].id + j) - 0.5); dy = (hash(nodes[j].id + i) - 0.5); d2 = dx * dx + dy * dy + 0.01; }
          const d = Math.sqrt(d2);
          const f = (3400 / d2) * a;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          vx[i] -= fx; vy[i] -= fy; vx[j] += fx; vy[j] += fy;
          const min = nodeRadius(deg[i]) + nodeRadius(deg[j]) + 6;
          if (d < min) { const push = (min - d) * 0.15; vx[i] -= (dx / d) * push; vy[i] -= (dy / d) * push; vx[j] += (dx / d) * push; vy[j] += (dy / d) * push; }
        }
      }
      for (const [i, j] of E) {
        const dx = x[j] - x[i], dy = y[j] - y[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rest = 72 + 9 * Math.sqrt(Math.max(deg[i], deg[j]));
        const f = (d - rest) * 0.05 * a;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        vx[i] += fx; vy[i] += fy; vx[j] -= fx; vy[j] -= fy;
      }
      for (let i = 0; i < n; i++) {
        const g = (deg[i] === 0 ? 0.045 : 0.012) * a;
        vx[i] -= x[i] * g; vy[i] -= y[i] * g;
        if (pinned[i]) { vx[i] = 0; vy[i] = 0; continue; }
        vx[i] *= 0.8; vy[i] *= 0.8;
        x[i] += Math.max(-40, Math.min(40, vx[i])); y[i] += Math.max(-40, Math.min(40, vy[i]));
      }
      sim.alpha *= 0.985;
      return sim.alpha;
    },
    positions() { const m = new Map(); nodes.forEach((nd, i) => m.set(nd.id, { x: x[i], y: y[i] })); return m; },
    bounds() {
      if (!n) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) { minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]); }
      return { minX, minY, maxX, maxY };
    },
  };
  return sim;
}
