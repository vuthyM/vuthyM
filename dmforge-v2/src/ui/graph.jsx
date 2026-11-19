import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp, getIndex } from './store.js';
import { openTab, sectionForType, goto } from './actions.js';
import { graphData, localSubgraph, createSim, nodeRadius } from '../core/graph.js';
import { allMentions } from '../core/mentions.js';
import { typeLabel, TYPE_ORDER, TYPES } from '../core/schema.js';
import { useTab } from './tabs.jsx';
import { Icon } from './icons.jsx';

/* positions survive edits, so the picture does not jump when a note changes */
const POS = new Map();
const keyOf = type => (type === 'root' || type === 'other' ? 'other' : type);
const PALETTE = ['--c-people', '--c-places', '--c-items', '--c-danger', '--c-story'];
const TYPE_VAR = { npc: '--c-people', player: '--accent', location: '--c-places', faction: '--c-items', plot: '--c-story', session: '--fg-muted', item: '--c-danger', map: '--c-places', other: '--border' };
function colorOf(type, css) {
  const k = keyOf(type);
  if (TYPE_VAR[k]) return css(TYPE_VAR[k]);
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return css(PALETTE[h % PALETTE.length]);
}
const labelOfType = type => (keyOf(type) === 'other' ? 'Other notes' : TYPES[type] ? TYPES[type].label : typeLabel(type));

// big vaults open the graph around their most-linked note, not as a hairball
function bigVaultHub(idx) {
  if (!idx || idx.notes.length <= 60) return null;
  const d = graphData(idx); let best = null;
  for (const nd of d.nodes.values()) if (!best || nd.deg > best.deg) best = nd;
  return best && best.deg > 0 ? best.id : null;
}

export function GraphPage() {
  const s = useApp();
  const tab = useTab();
  const idx = getIndex();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [o, setO] = useState(() => ({ focus: tab.graphFocus || bigVaultHub(idx), depth: 1, orphans: true, hidden: [], mentions: false, labels: 'auto', q: '' }));
  const [sel, setSel] = useState(tab.graphFocus || null);
  const [men, setMen] = useState({ list: null, rev: -1, pct: 0, busy: false });
  const wrap = useRef(), cv = useRef(), st = useRef({});
  const set = patch => setO(x => ({ ...x, ...patch }));

  // "Show in graph" from a note retargets this tab
  useEffect(() => { if (tab.graphStamp) { set({ focus: tab.graphFocus || null, depth: 1 }); setSel(tab.graphFocus || null); } }, [tab.graphStamp]);

  const data = useMemo(() => graphData(idx), [idx]);
  const vis = useMemo(() => {
    const ids = o.focus && data.nodes.has(o.focus) ? localSubgraph(data, o.focus, o.depth) : null;
    const nodes = [];
    for (const nd of data.nodes.values()) {
      if (ids && !ids.has(nd.id)) continue;
      if (o.hidden.includes(keyOf(nd.type))) continue;
      if (!ids && !o.orphans && nd.deg === 0) continue;
      nodes.push(nd);
    }
    const have = new Set(nodes.map(n => n.id));
    const edges = data.links.filter(l => have.has(l.a) && have.has(l.b));
    const dashed = o.mentions && men.list ? men.list.filter(m => have.has(m.from) && have.has(m.to)).map(m => ({ a: m.from, b: m.to })) : [];
    return { nodes, edges, dashed };
  }, [data, o.focus, o.depth, o.orphans, o.hidden.join('|'), o.mentions, men.list]);

  // unlinked mentions are found on request, a few notes at a time
  useEffect(() => {
    if (!o.mentions || (men.list && men.rev === s.dataRev)) return;
    let stop = false;
    setMen(m => ({ ...m, busy: true, pct: 0 }));
    allMentions(idx, { onProgress: (d, t) => { if (!stop) setMen(m => ({ ...m, pct: Math.round(100 * d / Math.max(1, t)) })); }, shouldStop: () => stop })
      .then(list => { if (!stop) setMen({ list, rev: s.dataRev, pct: 100, busy: false }); });
    return () => { stop = true; };
  }, [o.mentions, s.dataRev]);

  const matches = useMemo(() => {
    const q = o.q.trim().toLowerCase();
    return q ? new Set(vis.nodes.filter(n => n.name.toLowerCase().includes(q)).map(n => n.id)) : null;
  }, [o.q, vis]);
  const adj = useMemo(() => {
    const m = new Map();
    const link = (a, b) => { if (!m.has(a)) m.set(a, new Set()); if (!m.has(b)) m.set(b, new Set()); m.get(a).add(b); m.get(b).add(a); };
    vis.edges.forEach(e => link(e.a, e.b));
    return m;
  }, [vis]);

  // keep the drawing code's view of the state current
  st.current.o = o; st.current.sel = sel; st.current.vis = vis; st.current.matches = matches; st.current.adj = adj;
  st.current.onSelect = setSel;
  st.current.onOpen = id => { const n = idx.byPath.get(id); if (n) openTab({ section: sectionForType(n.type), selected: id }); };

  const sig = vis.nodes.map(n => n.id).join('|') + '#' + vis.edges.length;
  useEffect(() => {
    const e = st.current;
    const sim = createSim(vis.nodes, vis.edges, POS);
    const warm = vis.nodes.length > 700 ? 60 : 150;
    for (let i = 0; i < warm; i++) sim.tick();
    sim.alpha = 0.25;
    e.sim = sim; e.byId = sim.index; e.needFit = true;
    if (e.fit) e.fit();
    if (e.requestDraw) e.requestDraw();
  }, [sig]);
  useEffect(() => { if (st.current.requestDraw) st.current.requestDraw(); }, [o, sel, matches, vis, s.dataRev]);

  // the canvas itself
  useEffect(() => {
    const e = st.current;
    const canvas = cv.current, box = wrap.current, ctx = canvas.getContext('2d');
    e.view = { x: 0, y: 0, k: 1 }; e.w = 0; e.h = 0; e.raf = 0; e.hover = null; e.drag = null;
    const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    const screen = (i) => ({ x: e.sim.x[i] * e.view.k + e.view.x, y: e.sim.y[i] * e.view.k + e.view.y });

    e.fit = () => {
      if (!e.sim || !e.w) return;
      const b = e.sim.bounds(), pad = 50;
      const bw = Math.max(80, b.maxX - b.minX), bh = Math.max(80, b.maxY - b.minY);
      const k = Math.max(0.2, Math.min(1.9, (e.w - pad * 2) / bw, (e.h - pad * 2) / bh));
      e.view = { k, x: e.w / 2 - ((b.minX + b.maxX) / 2) * k, y: e.h / 2 - ((b.minY + b.maxY) / 2) * k };
      e.needFit = false;
      e.requestDraw();
    };
    const resize = () => {
      const r = box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      e.w = r.width; e.h = r.height; e.dpr = dpr;
      if (e.needFit) e.fit(); else e.requestDraw();
    };
    const hit = (px, py) => {
      if (!e.sim) return null;
      let best = null, bd = Infinity;
      const { nodes } = e.sim;
      for (let i = 0; i < nodes.length; i++) {
        const p = screen(i), r = nodeRadius(nodes[i].deg) * e.view.k + 5;
        const d = Math.hypot(p.x - px, p.y - py);
        if (d <= r && d < bd) { best = i; bd = d; }
      }
      return best;
    };
    function draw() {
      if (!e.sim || !e.w) return;
      const { o, sel, matches, adj, vis } = e;
      const sim = e.sim, k = e.view.k;
      const bg = css('--surface'), fg = css('--fg'), muted = css('--fg-muted'), accent = css('--accent'), line = css('--border');
      ctx.setTransform(e.dpr, 0, 0, e.dpr, 0, 0);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, e.w, e.h);
      const focusId = e.hover !== null ? sim.nodes[e.hover].id : sel;
      const near = focusId ? (adj.get(focusId) || new Set()) : null;
      const dim = id => (matches && !matches.has(id)) || (focusId && id !== focusId && !near.has(id));
      // lines
      ctx.lineWidth = 1;
      for (const ed of vis.edges) {
        const a = sim.index.get(ed.a), b = sim.index.get(ed.b);
        if (a === undefined || b === undefined) continue;
        const hot = focusId && (ed.a === focusId || ed.b === focusId);
        ctx.globalAlpha = hot ? 0.95 : focusId ? 0.08 : 0.4;
        ctx.strokeStyle = hot ? accent : muted;
        ctx.lineWidth = hot ? 1.8 : 1;
        const pa = screen(a), pb = screen(b);
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      if (vis.dashed.length) {
        ctx.setLineDash([5, 5]); ctx.strokeStyle = accent; ctx.lineWidth = 1.2;
        for (const ed of vis.dashed) {
          const a = sim.index.get(ed.a), b = sim.index.get(ed.b);
          if (a === undefined || b === undefined) continue;
          const hot = focusId && (ed.a === focusId || ed.b === focusId);
          ctx.globalAlpha = hot ? 0.95 : focusId ? 0.1 : 0.55;
          const pa = screen(a), pb = screen(b);
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      // nodes
      for (let i = 0; i < sim.nodes.length; i++) {
        const nd = sim.nodes[i], p = screen(i), r = nodeRadius(nd.deg) * Math.max(0.7, Math.min(1.4, k));
        if (p.x < -20 || p.y < -20 || p.x > e.w + 20 || p.y > e.h + 20) continue;
        ctx.globalAlpha = dim(nd.id) ? 0.18 : 1;
        ctx.fillStyle = colorOf(nd.type, css);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        if (nd.pending) { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke(); }
        if (nd.id === sel) { ctx.globalAlpha = 1; ctx.strokeStyle = fg; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2); ctx.stroke(); }
      }
      // labels
      ctx.font = '12px ' + (css('--font-body') || 'sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const placed = [];
      const order = sim.nodes.map((nd, i) => i).sort((a, b) => sim.nodes[b].deg - sim.nodes[a].deg);
      let shown = 0;
      for (const i of order) {
        const nd = sim.nodes[i];
        const lit = nd.id === focusId || (near && near.has(nd.id)) || (matches && matches.has(nd.id)) || nd.id === sel;
        const hub = nd.deg >= 3 || k >= 1.35;
        const show = o.labels === 'all' || lit || (o.labels === 'auto' && hub && (shown < 40 || k >= 1.35));
        if (!show || o.labels === 'none' && !lit) continue;
        const p = screen(i);
        if (p.x < -40 || p.y < -20 || p.x > e.w + 40 || p.y > e.h + 20) continue;
        const tw = ctx.measureText(nd.name).width + 6, ly = p.y + nodeRadius(nd.deg) * Math.max(0.7, Math.min(1.4, k)) + 3;
        const box = { x: p.x - tw / 2, y: ly, w: tw, h: 15 };
        if (!lit && o.labels !== 'all' && placed.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
        placed.push(box); shown++;
        ctx.globalAlpha = dim(nd.id) ? 0.3 : 1;
        const y = p.y + nodeRadius(nd.deg) * Math.max(0.7, Math.min(1.4, k)) + 3;
        ctx.lineWidth = 4; ctx.strokeStyle = bg; ctx.strokeText(nd.name, p.x, y);
        ctx.fillStyle = nd.id === focusId ? accent : fg; ctx.fillText(nd.name, p.x, y);
      }
      ctx.globalAlpha = 1;
    }
    function frame() {
      e.raf = 0;
      if (canvas.offsetParent === null) return;
      let active = false;
      if (e.sim && e.sim.alpha > 0.02) { e.sim.tick(); e.sim.tick(); active = true; }
      if (e.drag && e.drag.node !== null) active = true;
      draw();
      if (active) e.requestDraw();
      else if (e.sim) { POS.clear(); e.sim.positions().forEach((v, id) => POS.set(id, v)); }
    }
    e.requestDraw = () => { if (!e.raf) e.raf = requestAnimationFrame(frame); };

    const pos = ev => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    const down = ev => {
      canvas.focus();
      const p = pos(ev), i = hit(p.x, p.y);
      e.drag = { node: i, sx: p.x, sy: p.y, vx: e.view.x, vy: e.view.y, moved: false };
      if (i !== null) e.sim.pinned[i] = 1;
      canvas.setPointerCapture(ev.pointerId);
    };
    const move = ev => {
      const p = pos(ev), d = e.drag;
      if (d) {
        if (Math.hypot(p.x - d.sx, p.y - d.sy) > 3) d.moved = true;
        if (d.node !== null) {
          if (d.moved) { e.sim.x[d.node] = (p.x - e.view.x) / e.view.k; e.sim.y[d.node] = (p.y - e.view.y) / e.view.k; e.sim.reheat(0.3); }
        } else { e.view.x = d.vx + p.x - d.sx; e.view.y = d.vy + p.y - d.sy; }
        e.requestDraw();
        return;
      }
      const i = hit(p.x, p.y);
      if (i !== e.hover) { e.hover = i; canvas.style.cursor = i !== null ? 'pointer' : 'grab'; e.requestDraw(); }
    };
    const up = ev => {
      const d = e.drag; e.drag = null;
      if (!d) return;
      if (d.node !== null) {
        e.sim.pinned[d.node] = 0;
        if (!d.moved) e.onSelect(e.sim.nodes[d.node].id);
      } else if (!d.moved) e.onSelect(null);
      e.requestDraw();
    };
    const leave = () => { if (!e.drag && e.hover !== null) { e.hover = null; e.requestDraw(); } };
    const wheel = ev => {
      ev.preventDefault();
      const p = pos(ev), v = e.view;
      const k = Math.max(0.15, Math.min(4, v.k * Math.exp(-ev.deltaY * 0.0015)));
      v.x = p.x - ((p.x - v.x) / v.k) * k; v.y = p.y - ((p.y - v.y) / v.k) * k; v.k = k;
      e.requestDraw();
    };
    const dbl = ev => { const p = pos(ev), i = hit(p.x, p.y); if (i !== null) e.onOpen(e.sim.nodes[i].id); };
    const key = ev => {
      if (!e.sim || !e.sim.nodes.length) return;
      const order = e.sim.nodes.map(n => n).sort((a, b) => a.name.localeCompare(b.name));
      const cur = order.findIndex(n => n.id === e.sel);
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') { e.onSelect(order[(cur + 1) % order.length].id); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') { e.onSelect(order[(cur - 1 + order.length) % order.length].id); ev.preventDefault(); }
      else if (ev.key === 'Enter' && e.sel) e.onOpen(e.sel);
      else if (ev.key === 'Escape') e.onSelect(null);
    };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', leave); canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', dbl); canvas.addEventListener('keydown', key);
    const ro = new ResizeObserver(resize); ro.observe(box);
    resize();
    window.__dmfGraph = e;      // test hook
    return () => {
      ro.disconnect(); cancelAnimationFrame(e.raf);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('dblclick', dbl); canvas.removeEventListener('keydown', key);
    };
  }, []);

  // ---- side panel ----
  const selNote = sel && idx.byPath.get(sel);
  const neighbours = sel && adj.get(sel) ? [...adj.get(sel)].map(id => idx.byPath.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const unlinked = sel && o.mentions && men.list ? men.list.filter(m => m.from === sel || m.to === sel).map(m => ({ note: idx.byPath.get(m.from === sel ? m.to : m.from), dir: m.from === sel ? 'out' : 'in' })).filter(x => x.note) : [];
  const typeCounts = new Map();
  for (const nd of data.nodes.values()) { const k = keyOf(nd.type); typeCounts.set(k, (typeCounts.get(k) || 0) + 1); }
  const types = [...typeCounts.keys()].sort((a, b) => (TYPE_ORDER.indexOf(a) < 0 ? 99 : TYPE_ORDER.indexOf(a)) - (TYPE_ORDER.indexOf(b) < 0 ? 99 : TYPE_ORDER.indexOf(b)) || a.localeCompare(b));
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  const focusName = o.focus && idx.byPath.get(o.focus) ? idx.byPath.get(o.focus).name : '';
  const names = idx.notes.map(n => n.name).sort((a, b) => a.localeCompare(b));

  return (
    <div class="graph-page">
      <div class="page-head">
        <div><h2 aria-level="1">Graph</h2><div class="muted small" id="graphStats">{vis.nodes.length} notes · {vis.edges.length} links{o.mentions && vis.dashed.length ? ' · ' + vis.dashed.length + ' unlinked mentions' : ''}{o.focus && focusName ? ' · around ' + focusName : ''}</div></div>
        <div class="row-actions">
          <button class={'btn btn-sm' + (filtersOpen ? ' on' : '')} id="graphFilters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}><Icon name="filter" size={15} /> Filters</button>
          <button class="btn btn-sm" id="graphFit" onClick={() => st.current.fit && st.current.fit()}>Fit to window</button>
          <button class="btn btn-sm" id="graphRelayout" onClick={() => { if (st.current.sim) { st.current.sim.reheat(1); st.current.requestDraw(); } }}>Re-arrange</button>
        </div>
      </div>
      <div class={'graph-layout' + (filtersOpen || selNote ? '' : ' no-side')}>
        <div class="graph-wrap" ref={wrap}>
          <canvas ref={cv} tabindex="0" id="graphCanvas" aria-label="Graph of how your notes link to each other. Use the arrow keys to move between notes and Enter to open one." />
          {!vis.nodes.length && <div class="graph-empty muted">No notes to show with these filters.</div>}
        </div>
        <aside class="graph-side">
          <div class="graph-filters" hidden={!filtersOpen}>
          <div class="field"><label class="lbl">Find a note</label><input type="search" id="graphSearch" placeholder="Highlight notes by name" value={o.q} onInput={e => set({ q: e.currentTarget.value })} /></div>
          <div class="field">
            <label class="lbl">Show</label>
            <div class="radio-row">
              <label class={!o.focus ? 'on' : ''}><input type="radio" name="gmode" checked={!o.focus} onChange={() => set({ focus: null })} /> The whole campaign</label>
              <label class={o.focus ? 'on' : ''}><input type="radio" name="gmode" checked={!!o.focus} onChange={() => set({ focus: o.focus || sel || (idx.notes[0] && idx.notes[0].path) })} /> Around one note</label>
            </div>
            {o.focus && (
              <div class="stack">
                <input list="graph-names" id="graphFocus" value={focusName} placeholder="Note name" onChange={e => { const n = idx.resolve(e.currentTarget.value); if (n) { set({ focus: n.path }); setSel(n.path); } }} />
                <datalist id="graph-names">{names.map(n => <option key={n} value={n} />)}</datalist>
                <label class="small" style="display:flex;gap:8px;align-items:center">Links away: <input type="range" min="1" max="3" step="1" style="width:100px" value={o.depth} onInput={e => set({ depth: Number(e.currentTarget.value) })} aria-label="How many links away" /> <strong>{o.depth}</strong></label>
              </div>
            )}
          </div>
          <div class="field stack">
            <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" checked={o.orphans} disabled={!!o.focus} onChange={e => set({ orphans: e.currentTarget.checked })} /> Notes with no links</label>
            <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="graphMentions" style="width:auto" checked={o.mentions} onChange={e => set({ mentions: e.currentTarget.checked })} /> Dashed lines for mentions that are not linked yet{men.busy && o.mentions ? ' (' + men.pct + '%)' : ''}</label>
            <label class="small" style="display:flex;gap:8px;align-items:center">Names: <select style="width:auto;padding:3px 8px" value={o.labels} onChange={e => set({ labels: e.currentTarget.value })} aria-label="When to show names"><option value="auto">when zoomed in</option><option value="all">always</option><option value="none">only on hover</option></select></label>
          </div>
          <div class="field">
            <label class="lbl">Kinds of note</label>
            <div class="legend">
              {types.map(t => (
                <label key={t} class="legend-row">
                  <input type="checkbox" style="width:auto" checked={!o.hidden.includes(t)} onChange={e => set({ hidden: e.currentTarget.checked ? o.hidden.filter(x => x !== t) : [...o.hidden, t] })} />
                  <i class="dot" style={'background:' + colorOf(t, css)} />
                  <span>{labelOfType(t)}</span><span class="badge">{typeCounts.get(t)}</span>
                </label>
              ))}
            </div>
          </div>
          <div class="graph-hint muted small">Click a note to see its connections. Double-click to open it in a new tab. Drag to move, scroll to zoom. A ring marks notes with unpushed changes.</div>
          </div>
          {selNote && (
            <div class="card graph-card" id="graphCard">
              <h3>{selNote.name}</h3>
              <div class="small muted">{labelOfType(selNote.type)} · {neighbours.length} link{neighbours.length === 1 ? '' : 's'}</div>
              <div class="row-actions" style="margin:8px 0">
                <button class="btn btn-sm btn-primary" onClick={() => { st.current.onOpen(selNote.path); }}>Open in new tab</button>
                <button class="btn btn-sm" onClick={() => { goto(selNote.path); }}>Open here</button>
                {o.focus !== selNote.path && <button class="btn btn-sm" id="graphAround" onClick={() => set({ focus: selNote.path, depth: 1 })}>Show around it</button>}
              </div>
              {neighbours.length > 0 && <><label class="lbl">Linked with</label><div class="chips">{neighbours.map(n => <button key={n.path} class="chip-link" onClick={() => setSel(n.path)}>{n.name}</button>)}</div></>}
              {unlinked.length > 0 && <><label class="lbl" style="margin-top:10px">Mentioned but not linked</label><div class="chips">{unlinked.map(x => <button key={x.note.path} class="chip-link dashed" title={x.dir === 'out' ? 'This note mentions it' : 'It mentions this note'} onClick={() => setSel(x.note.path)}>{x.note.name}</button>)}</div><div class="small muted" style="margin-top:6px">Open the note and press Suggest links to turn these into links.</div></>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
