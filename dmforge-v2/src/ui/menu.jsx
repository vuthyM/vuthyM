import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useApp } from './store.js';
import { closeMenu } from './actions.js';

/* items: { header } | { sep } | { label, hint, onClick, disabled, danger, children: [items] } */
function MenuList({ items, depth, root }) {
  const [open, setOpen] = useState(null);
  const [flip, setFlip] = useState(false);
  const box = useRef();
  useLayoutEffect(() => {
    if (!depth || !box.current) return;
    const r = box.current.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) setFlip(true);
  }, []);
  const entries = () => [...box.current.querySelectorAll(':scope > .ctx-wrap > [role=menuitem]:not([disabled])')];
  const key = e => {
    const list = entries(), i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { (list[(i + 1) % list.length] || list[0]).focus(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowUp') { (list[(i - 1 + list.length) % list.length] || list[0]).focus(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'ArrowRight' && document.activeElement && document.activeElement.dataset.sub) {
      setOpen(Number(document.activeElement.dataset.idx)); e.preventDefault(); e.stopPropagation();
      setTimeout(() => { const sub = document.activeElement.parentElement.querySelector(':scope > .ctx-sub .ctx-wrap > [role=menuitem]'); if (sub) sub.focus(); }, 0);
    } else if (e.key === 'ArrowLeft' && depth) { setOpen(null); box.current.parentElement.querySelector(':scope > [role=menuitem]').focus(); e.preventDefault(); e.stopPropagation(); }
  };
  return (
    <div class={'ctx-list' + (depth ? ' ctx-sub' + (flip ? ' flip' : '') : '')} ref={box} role="menu" onKeyDown={key}>
      {items.map((it, i) => {
        if (it.sep) return <div key={i} class="ctx-sep" role="separator" />;
        if (it.header) return <div key={i} class="ctx-head">{it.header}</div>;
        const sub = it.children && it.children.length;
        return (
          <div key={i} class="ctx-wrap" onMouseEnter={() => setOpen(sub ? i : null)}>
            <button class={'ctx-item' + (it.danger ? ' danger' : '')} role="menuitem" disabled={it.disabled} data-idx={i} data-sub={sub ? '1' : undefined}
              aria-haspopup={sub ? 'menu' : undefined} aria-expanded={sub ? open === i : undefined}
              onClick={() => { if (sub) { setOpen(open === i ? null : i); return; } closeMenu(); if (it.onClick) it.onClick(); }}>
              <span class="ctx-label">{it.label}</span>
              {it.hint && <span class="ctx-hint">{it.hint}</span>}
              {sub && <span class="ctx-arrow" aria-hidden="true">▸</span>}
            </button>
            {sub && open === i && <MenuList items={it.children} depth={(depth || 0) + 1} root={root} />}
          </div>
        );
      })}
    </div>
  );
}

export function ContextMenu() {
  const s = useApp();
  const m = s.menu;
  const ref = useRef();
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!m || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.max(6, Math.min(m.x, window.innerWidth - r.width - 6)), y: Math.max(6, Math.min(m.y, window.innerHeight - r.height - 6)) });
    const first = ref.current.querySelector('.ctx-wrap > [role=menuitem]:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }, [m]);
  useEffect(() => {
    if (!m) return;
    const down = e => { if (!ref.current || !ref.current.contains(e.target)) closeMenu(); };
    const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } };
    const away = () => closeMenu();
    const scrolled = e => { if (!(e.target && e.target.closest && e.target.closest('.tabbar, .sidebar'))) closeMenu(); };      // a tab row, or the sidebar, nudging itself (a focused button scrolled into view) is not the page scrolling
    window.addEventListener('mousedown', down, true);
    window.addEventListener('keydown', esc, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      window.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', esc, true);
      window.removeEventListener('blur', away); window.removeEventListener('resize', away); window.removeEventListener('scroll', scrolled, true);
    };
  }, [m]);
  if (!m) return null;
  return (
    <div class="ctx" ref={ref} style={'left:' + pos.x + 'px;top:' + pos.y + 'px'} onContextMenu={e => e.preventDefault()}>
      <MenuList items={m.items} depth={0} root />
    </div>
  );
}
