import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';

/* A small menu that opens under a button. Its items are always in the page (hidden while it is closed), so they can be found and
   clicked by anything that knows their ids; clicking outside it, or Escape, closes it. */
export function PopMenu({ id, icon = 'more', text = '', title, align = 'right', btnClass = 'tb-icon', children }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState(align === 'left' ? 'left' : 'right');
  const ref = useRef();
  const popRef = useRef();
  // open on the side that fits: if the menu would run under the sidebar or off the window, it opens the other way
  useLayoutEffect(() => {
    if (!open || !ref.current || !popRef.current) return;
    const b = ref.current.getBoundingClientRect();
    const w = popRef.current.offsetWidth;
    const sb = document.querySelector('.sidebar');
    const sr = sb ? sb.getBoundingClientRect() : null;
    const minLeft = Math.max(8, sr && sr.right > 0 ? sr.right + 8 : 8);
    const maxRight = window.innerWidth - 8;
    const over = { right: Math.max(0, minLeft - (b.right - w)), left: Math.max(0, (b.left + w) - maxRight) };
    const want = align === 'left' ? 'left' : 'right';
    const other = want === 'left' ? 'right' : 'left';
    setSide(over[want] === 0 || over[want] <= over[other] ? want : other);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const off = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <span class="popmenu" ref={ref}>
      <button class={btnClass} id={id} aria-haspopup="menu" aria-expanded={open} title={title} aria-label={title} onClick={() => setOpen(!open)}><Icon name={icon} size={icon === 'more' ? 20 : 17} />{text && <span class="pm-text">{text}</span>}{text && <Icon name="chev" size={14} />}</button>
      <div ref={popRef} class={'pop popmenu-pop ' + side} role="menu" hidden={!open}>{typeof children === 'function' ? children({ close }) : children}</div>
    </span>
  );
}
