import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, set, useApp } from './store.js';
import { closeIsland } from './actions.js';
import { TimerChip, TimerBox } from './timer.jsx';
import { DiceButton, DiceBox } from './dice.jsx';
import { LogButton, LogBox } from './session.jsx';

/* The tool island: timer, dice and the quick log share one pill in the top bar. Press one and the pill grows to hold it, pushing the
   things beside it along; one tool at a time. It closes the moment the mouse leaves unless it is pinned (and it stays while you are
   typing in it). On narrow windows the pill is hidden and the tools open as floating boxes, as before. */
const TIGHT = '(max-width: 700px)';
export function useTight() {
  const [t, setT] = useState(() => window.matchMedia(TIGHT).matches);
  useEffect(() => {
    const m = window.matchMedia(TIGHT), f = () => setT(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return t;
}

export const openTool = s => (s.timer.open ? 'timer' : s.diceOpen ? 'dice' : s.logOpen ? 'log' : '');

const GROW_MS = 220;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Island() {
  const s = useApp();
  const tool = openTool(s);
  const tight = useTight();
  const pinned = !!s.islandPin && !!tool;
  const root = useRef(), bar = useRef();
  const armed = useRef(false);               // the mouse has been on the island since it opened (a keyboard shortcut opens it with the mouse elsewhere)
  const was = useRef('');
  const timer = useRef(0);

  // the pill grows and shrinks: widths are set in pixels so they can animate
  useLayoutEffect(() => {
    const b = bar.current;
    if (!b) return;
    const opened = tool && !was.current, closed = !tool && was.current;
    was.current = tool;
    clearTimeout(timer.current);
    if (!opened && !closed) return;
    const target = Math.round(Math.min(420, Math.max(340, window.innerWidth * 0.4)));
    if (opened) {
      const w0 = b.offsetWidth;
      if (reduced()) { b.style.width = target + 'px'; return; }
      b.style.width = w0 + 'px';
      b.getBoundingClientRect();
      b.style.width = target + 'px';
    } else {
      armed.current = false;
      const from = b.offsetWidth;
      b.style.width = 'auto';
      const natural = b.offsetWidth;
      if (reduced() || from === natural) { b.style.width = ''; return; }
      b.style.width = from + 'px';
      b.getBoundingClientRect();
      b.style.width = natural + 'px';
      timer.current = setTimeout(() => { if (bar.current && !was.current) bar.current.style.width = ''; }, GROW_MS + 60);
    }
  }, [tool]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Escape closes whichever tool is open, wherever the focus is (the log box handles its own first when a link menu is up)
  useEffect(() => {
    if (!tool) return;
    const k = e => { if (e.key === 'Escape' && !e.defaultPrevented) closeIsland(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [tool]);
  useEffect(() => { if (!tool && S.islandPin) set({ islandPin: false }); }, [tool]);

  // a draft in progress (or a list being chosen from) keeps it open; an empty box that only took focus when it opened does not
  const typing = () => {
    const a = document.activeElement;
    if (!(a && root.current && root.current.contains(a))) return false;
    if (/^select$/i.test(a.tagName)) return true;
    return /^(input|textarea)$/i.test(a.tagName) && String(a.value || '').length > 0;
  };
  // It closes when the pointer really moves away: moving the mouse, not the top bar shifting under a still mouse (a new "Push 1 change"
  // button appears the moment you log a line). The browser's own repeat of the last position after a layout change has no movement.
  useEffect(() => {
    if (!tool) return;
    const m = e => {
      const parts = [bar.current, root.current && root.current.querySelector('.island-card')].filter(Boolean).map(x => x.getBoundingClientRect());
      const inside = parts.some(r => e.clientX >= r.left - 2 && e.clientX <= r.right + 2 && e.clientY >= r.top - 2 && e.clientY <= r.bottom + 2);
      if (inside) { armed.current = true; return; }
      if (armed.current && !S.islandPin && (e.movementX || e.movementY) && !typing()) closeIsland();
    };
    window.addEventListener('mousemove', m);
    return () => window.removeEventListener('mousemove', m);
  }, [tool, pinned]);
  return (
    <div ref={root} class={'island' + (tool ? ' open open-' + tool : '')} data-tool={tool || undefined} role="group" aria-label="Table tools"
      onMouseEnter={() => { armed.current = true; }}
      onFocusOut={e => { if (tool && !S.islandPin && armed.current && e.relatedTarget && !(root.current && root.current.contains(e.relatedTarget))) closeIsland(); }}>
      <div ref={bar} class="island-bar">
        <TimerChip />
        <DiceButton />
        <LogButton />
        {tool && (
          <button class={'tb-icon island-pin' + (pinned ? ' on' : '')} id="islandPin" aria-pressed={pinned} title={pinned ? 'Pinned: it stays open until you close it' : 'Pin it open (otherwise it closes when the mouse moves away)'} aria-label="Keep this open" onClick={() => set({ islandPin: !pinned })}>
            <Icon name="pinned" size={17} />
          </button>
        )}
      </div>
      {tool && !tight && (
        <div class="island-card" id="islandCard">
          {tool === 'timer' && <TimerBox />}
          {tool === 'dice' && <DiceBox />}
          {tool === 'log' && <LogBox />}
        </div>
      )}
    </div>
  );
}

/* narrow windows: the tools open as floating boxes (the bottom bar opens them) */
export function TightBoxes() {
  const tight = useTight();
  if (!tight) return null;
  return <><LogBox /><DiceBox /><TimerBox /></>;
}
