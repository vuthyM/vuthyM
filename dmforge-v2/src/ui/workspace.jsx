import { Component } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { S, useApp } from './store.js';
import { activateTab, closeTab, openTab, moveTab, pinTab, setPaneSize, openTabMenu, LAYOUTS } from './actions.js';
import { TabCtx, tabTitle } from './tabs.jsx';

/* The part of the window under the top bar: one, two or three panes, each with its own row of tabs (like Obsidian).
   Every tab's page is a direct child of one grid and is only positioned into its pane, so moving a tab between panes or
   changing the layout never rebuilds a page (an edit you are typing survives). Dividers are dragged by changing the grid
   directly, so nothing in the app re-renders while you drag. */

const AREAS = { single: '"s0" "c0"', two: '"s0 s1" "c0 c1"', prep: '"s0 s1" "c0 c1" "c0 s2" "c0 c2"' };
const gridFor = (layout, size) => {
  const c = size.cols, r = size.rows;
  if (layout === 'single') return { cols: 'minmax(0,1fr)', rows: 'auto minmax(0,1fr)' };
  if (layout === 'two') return { cols: 'minmax(0,' + c + 'fr) minmax(0,' + (1 - c) + 'fr)', rows: 'auto minmax(0,1fr)' };
  return { cols: 'minmax(0,' + c + 'fr) minmax(0,' + (1 - c) + 'fr)', rows: 'auto minmax(0,' + r + 'fr) auto minmax(0,' + (1 - r) + 'fr)' };
};

/* narrow windows (a phone, a tiny window) show one pane with every tab */
export function useNarrow() {
  const q = '(max-width: 900px)';
  const [narrow, set] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q), f = () => set(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return narrow;
}

/* one ResizeObserver tells every pane whether it is wide enough for a list and a note side by side (data-wide), without re-rendering */
let wide = null;
const WIDE = 900;      // below this a list and a note stack (the note gets the full width) instead of sitting side by side
function watchWidth(el) {
  if (!el) return;
  if (!wide) wide = new ResizeObserver(entries => { for (const e of entries) e.target.dataset.wide = e.contentRect.width >= WIDE ? '1' : '0'; });
  wide.observe(el);
}

/* a page re-renders itself when the data changes (each one subscribes), so the workspace only needs to rebuild it when its tab
   changed what it shows; this keeps the pages of hidden tabs and other panes quiet while you work in one */
class PageHost extends Component {
  shouldComponentUpdate(next) { return next.tab !== this.props.tab || next.sig !== this.props.sig; }
  render({ tab, render }) { return <TabCtx.Provider value={tab}>{render(tab)}</TabCtx.Provider>; }
}

const sigOf = t => [t.section, t.selected, t.editing, t.asset, t.graphFocus, t.graphStamp].join('|');      // (pinned does not change what a page shows)

const PIN = <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.5 1.5 14.5 6.5l-1.4.5-2.2 2.2.4 3.3-1.1 1.1L7 10.4 3.6 13.8 2.2 12.4 5.6 9 2.6 6.9 3.7 5.8 7 6.2 9.2 4l.5-1.4z" /></svg>;

function Strip({ pane, tabs, activeId, focused, multi, narrow }) {
  const many = tabs.length > 1;
  const drop = e => { const id = e.dataTransfer.getData('text/dmf-tab'); if (id && !narrow) { e.preventDefault(); moveTab(id, pane); } };
  const over = e => { if (!narrow && e.dataTransfer.types.includes('text/dmf-tab')) e.preventDefault(); };
  return (
    <div class={'tabbar' + (multi && focused ? ' pane-on' : '')} style={{ gridArea: 's' + pane }} data-pane={pane} role="tablist" aria-label={multi ? LAYOUTS[S.layout].names[pane] + ' tabs' : 'Open tabs'}
      onDragOver={over} onDrop={drop}>
      {tabs.map(t => (
        <div key={t.id} class={'tab' + (t.id === activeId ? ' on' : '') + (t.pinned ? ' pinned' : '')} role="presentation" draggable={multi && !narrow}
          onDragStart={e => { e.dataTransfer.setData('text/dmf-tab', t.id); e.dataTransfer.effectAllowed = 'move'; }}
          onContextMenu={e => openTabMenu(e, t)}>
          <button class="tab-main" role="tab" aria-selected={t.id === activeId} onClick={() => activateTab(t.id)}
            onAuxClick={e => { if (e.button === 1 && many && !t.pinned) { e.stopPropagation(); closeTab(t.id); } }} title={tabTitle(t) + (t.pinned ? ' (pinned)' : '')}>
            {t.editing && <span class="dot-unpushed" title="Editing" />}
            <span class="tab-title">{tabTitle(t)}</span>
          </button>
          {t.pinned ? <button class="tab-x tab-unpin" aria-label={'Unpin ' + tabTitle(t)} title="Pinned: it keeps its page. Click to unpin." onClick={e => { e.stopPropagation(); pinTab(t.id, false); }}>{PIN}</button>
            : many && <button class="tab-x" aria-label={'Close ' + tabTitle(t)} onClick={e => { e.stopPropagation(); closeTab(t.id); }}>×</button>}
        </div>
      ))}
      <button class="tab-new" aria-label="New tab" title="New tab" onClick={() => openTab({ section: 'overview', pane })}>+</button>
    </div>
  );
}

/* a divider between panes: drag it, or focus it and use the arrow keys */
function Splitter({ dir, ws }) {
  const drag = useRef(null);
  const apply = (v) => {
    const el = ws.current; if (!el) return;
    const size = Object.assign({}, S.paneSize, { [dir]: Math.max(0.15, Math.min(0.85, v)) });
    const g = gridFor(S.layout, size);
    el.style.gridTemplateColumns = g.cols; el.style.gridTemplateRows = g.rows;
    drag.current.v = size[dir];
  };
  const ratioAt = e => {
    const el = ws.current, r = el.getBoundingClientRect();
    if (dir === 'cols') return (e.clientX - r.left) / r.width;
    const s1 = el.querySelector('.tabbar[data-pane="1"]'), s2 = el.querySelector('.tabbar[data-pane="2"]');
    const h1 = s1 ? s1.offsetHeight : 0, h2 = s2 ? s2.offsetHeight : 0;
    return (e.clientY - r.top - h1) / Math.max(1, r.height - h1 - h2);
  };
  const down = e => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { v: S.paneSize[dir], raf: 0 };
    ws.current.classList.add('dragging');
  };
  const move = e => {
    if (!drag.current) return;
    const ev = { clientX: e.clientX, clientY: e.clientY };
    cancelAnimationFrame(drag.current.raf);
    drag.current.raf = requestAnimationFrame(() => apply(ratioAt(ev)));
  };
  const up = e => {
    if (!drag.current) return;
    cancelAnimationFrame(drag.current.raf);
    apply(ratioAt(e));
    const v = drag.current.v;
    drag.current = null;
    ws.current.classList.remove('dragging');
    setPaneSize(dir, v);
  };
  const key = e => {
    const step = e.shiftKey ? 0.08 : 0.02, back = dir === 'cols' ? 'ArrowLeft' : 'ArrowUp', fwd = dir === 'cols' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back) { e.preventDefault(); setPaneSize(dir, S.paneSize[dir] - step); }
    else if (e.key === fwd) { e.preventDefault(); setPaneSize(dir, S.paneSize[dir] + step); }
  };
  return (
    <div class={'splitter splitter-' + dir} role="separator" tabIndex={0} aria-orientation={dir === 'cols' ? 'vertical' : 'horizontal'}
      aria-label={dir === 'cols' ? 'Resize the left and right panes' : 'Resize the two right panes'} aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(S.paneSize[dir] * 100)}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key} />
  );
}

export function Workspace({ render }) {
  const s = useApp();
  const narrow = useNarrow();
  const ws = useRef();
  const layout = narrow ? 'single' : s.layout;
  const n = LAYOUTS[layout].panes;
  const multi = n > 1;
  const paneOf = t => (narrow ? 0 : t.pane | 0);
  const g = gridFor(layout, s.paneSize);
  const style = { gridTemplateAreas: AREAS[layout], gridTemplateColumns: g.cols, gridTemplateRows: g.rows };
  const strips = [];
  for (let p = 0; p < n; p++) {
    const tabs = s.tabs.filter(t => paneOf(t) === p);
    strips.push(<Strip key={'s' + p} pane={p} tabs={tabs} activeId={narrow ? s.activeTab : s.paneActive[p]} focused={s.activePane === p} multi={multi} narrow={narrow} />);
  }
  return (
    <div class={'workspace layout-' + layout + (multi ? ' multi' : '')} ref={ws} style={style}>
      {strips}
      {s.tabs.map(t => {
        const p = paneOf(t);
        const shown = narrow ? t.id === s.activeTab : s.paneActive[p] === t.id;
        return (
          <section key={t.id} ref={watchWidth} class={'pane content' + (shown && s.activePane === p && multi ? ' active' : '')} hidden={!shown} data-tab={t.id} data-pane={p}
            style={{ gridArea: 'c' + p }}
            onPointerDownCapture={() => activateTab(t.id)} onFocusCapture={() => activateTab(t.id)}
            onDragOver={e => { if (multi && e.dataTransfer.types.includes('text/dmf-tab')) e.preventDefault(); }}
            onDrop={e => { const id = e.dataTransfer.getData('text/dmf-tab'); if (id && multi) { e.preventDefault(); moveTab(id, p); } }}>
            <PageHost tab={t} sig={sigOf(t)} render={render} />
          </section>
        );
      })}
      {multi && <Splitter dir="cols" ws={ws} />}
      {layout === 'prep' && <Splitter dir="rows" ws={ws} />}
    </div>
  );
}
