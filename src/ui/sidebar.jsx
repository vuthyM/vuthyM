import { useEffect, useRef, useState } from 'preact/hooks';
import { S, set, useApp, getIndex } from './store.js';
import { setSection, goto, openTab, wantsNewTab, claudeOn, isFav, toggleFav, moveFav, updateSetting, currentSessionPath } from './actions.js';
import { openLibrary } from './libraryactions.js';
import { TYPES, TYPE_ORDER, OTHER, isCustom, typeLabel } from '../core/schema.js';
import { IMAGE_EXT, ext } from '../core/util.js';
import { Icon } from './icons.jsx';

const TYPE_ICON = { npc: 'people', player: 'id', location: 'pin', faction: 'flag', plot: 'lines', session: 'book', item: 'bag', map: 'map', other: 'file' };
const TOOL_ICON = { monsters: 'paw', secrets: 'lock', clocks: 'clock', party: 'party', combat: 'swords', generate: 'spark', rules: 'rules', graph: 'graph' };
const GROUP_LABEL = { story: 'Story', world: 'World', table: 'Table', ref: 'Reference' };

/* every page in the sidebar, in its group */
function buildGroups(s, idx) {
  const images = s.files.filter(p => IMAGE_EXT.includes(ext(p))).length;
  const mapped = new Set(Object.values(s.mapping).filter(t => t !== OTHER));
  const type = t => {
    const n = t === 'map' ? images : (idx.byType[t] || []).length;
    if (!n && !mapped.has(t)) return null;
    return { key: t, label: TYPES[t].label, icon: TYPE_ICON[t] || 'file', count: n };
  };
  const tool = (key, label, navId, extra) => Object.assign({ key, label, icon: TOOL_ICON[key], navId }, extra || {});
  const custom = [...mapped].filter(isCustom).sort((a, b) => a.localeCompare(b)).map(t => ({ key: t, label: typeLabel(t), icon: /bestiary|monster|creature/i.test(typeLabel(t)) ? 'paw' : 'file', count: (idx.byType[t] || []).length }));
  const other = (idx.byType.other || []).length + (idx.byType.root || []).length;
  return {
    story: [type('session'), type('plot'), tool('secrets', 'Secrets', 'navSecrets'), tool('clocks', 'Clocks', 'navClocks')].filter(Boolean),
    world: [type('npc'), type('location'), type('faction'), type('item'), type('map'), ...custom, other ? { key: 'other', label: 'Other notes', icon: 'file', count: other } : null].filter(Boolean),
    table: [type('player'), tool('generate', 'Generate', 'navGenerate')].filter(Boolean),
    ref: [tool('rules', 'Rules', 'navRules'), tool('monsters', 'Monsters', 'navMonsters'), tool('graph', 'Graph', 'navGraph')],
  };
}

/* Party and Combat are what the table reaches for all night, so they are always on show, not behind a group */
function pinnedItems(s) {
  const tool = (key, label, navId, extra) => Object.assign({ key, label, icon: TOOL_ICON[key], navId }, extra || {});
  return [tool('party', 'Party', 'navParty'), tool('combat', 'Combat', 'navCombat', { badge: s.combat ? 'R' + s.combat.round : null })];
}

export function Sidebar({ reload, leave, onNavigate }) {
  const s = useApp();
  const idx = getIndex();
  const [userOpen, setUserOpen] = useState(undefined);       // the group opened by hand; until then the one holding the page you are on
  const [campOpen, setCampOpen] = useState(false);
  const [dropAt, setDropAt] = useState(null);
  const favRef = useRef();
  /* auto-hide: a column of icons that opens when the mouse rests on it and closes half a second after it leaves */
  const auto = !!s.settings.sidebarAuto;
  const delay = s.settings.sidebarDelay == null ? 2000 : s.settings.sidebarDelay;
  const [waiting, setWaiting] = useState(false);
  const openT = useRef(0), closeT = useRef(0);
  const asideRef = useRef();
  const clear = () => { clearTimeout(openT.current); clearTimeout(closeT.current); };
  const setOpen = v => { clear(); setWaiting(false); if (S.sbOpen !== v) set({ sbOpen: v }); };
  useEffect(() => () => clear(), []);
  useEffect(() => { if (!auto) { clear(); setWaiting(false); if (S.sbOpen) set({ sbOpen: false }); } }, [auto]);
  const expanded = auto && s.sbOpen;
  const hold = () => campOpen || !!S.dialog || !!(asideRef.current && asideRef.current.contains(document.activeElement) && /^(input|textarea|select)$/i.test(document.activeElement.tagName));
  const enter = () => {
    if (!auto) return;
    clearTimeout(closeT.current);
    if (S.sbOpen || openT.current && waiting) return;
    setWaiting(true);
    openT.current = setTimeout(() => setOpen(true), delay);
  };
  const leaveSb = () => {
    if (!auto) return;
    clearTimeout(openT.current); setWaiting(false);
    if (!S.sbOpen) return;
    clearTimeout(closeT.current);
    const tryClose = () => { if (hold()) { closeT.current = setTimeout(tryClose, 500); } else setOpen(false); };
    closeT.current = setTimeout(tryClose, 500);
  };
  useEffect(() => { setUserOpen(undefined); }, [s.section]);
  useEffect(() => {
    if (!campOpen) return;
    const off = e => { if (!e.target.closest || !e.target.closest('.camp')) setCampOpen(false); };
    window.addEventListener('mousedown', off);
    return () => window.removeEventListener('mousedown', off);
  }, [campOpen]);
  const groups = buildGroups(s, idx);
  const pinned = pinnedItems(s);
  const all = [...pinned, ...Object.values(groups).flat()];
  const groupOf = key => Object.keys(groups).find(g => groups[g].some(i => i.key === key));
  const open = userOpen !== undefined ? userOpen : (groupOf(s.section) || (s.section === 'overview' ? 'story' : ''));
  const onAsset = !!(s.tabs.find(t => t.id === s.activeTab) || {}).asset;
  const go = (key, e) => { if (key === 'monsters') { set({ dialog: { kind: 'monsters' } }); if (onNavigate) onNavigate(); return; } if (wantsNewTab(e)) openTab({ section: key }); else setSection(key); if (onNavigate) onNavigate(); };
  const metaFor = id => {
    if (id.startsWith('sec:')) { const it = all.find(i => i.key === id.slice(4)); return it ? { id, label: it.label, icon: it.icon, go: e => go(it.key, e), current: s.section === it.key && !onAsset } : null; }
    if (id.startsWith('note:')) {
      const n = idx.byPath.get(id.slice(5));
      return n ? { id, label: n.name, icon: TYPE_ICON[n.type] || 'file', go: e => { goto(n.path, { newTab: wantsNewTab(e) }); if (onNavigate) onNavigate(); }, current: s.selected === n.path && !onAsset } : null;
    }
    return null;
  };
  const favs = s.favs.map(metaFor).filter(Boolean);

  const dragStart = id => e => { try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* no drag data */ } };
  const favIndex = e => {
    const rows = favRef.current ? [...favRef.current.querySelectorAll('[data-favid]')] : [];
    for (let i = 0; i < rows.length; i++) { const r = rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) return i; }
    return rows.length;
  };
  const onOver = e => { if (!(e.dataTransfer && [...e.dataTransfer.types].includes('text/plain'))) return; e.preventDefault(); const i = favIndex(e); if (i !== dropAt) setDropAt(i); };
  const onDrop = e => { e.preventDefault(); let id = ''; try { id = e.dataTransfer.getData('text/plain'); } catch (err) { /* none */ } const i = favIndex(e); setDropAt(null); if (/^(sec|note):/.test(id)) { const old = s.favs.indexOf(id); moveFav(id, old >= 0 && old < i ? i - 1 : i); } };
  const onLeave = e => { if (favRef.current && !favRef.current.contains(e.relatedTarget)) setDropAt(null); };

  const star = (id, label) => (
    <span class={'nav-star' + (isFav(id) ? ' is' : '')} role="button" tabindex="0" data-star={id} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleFav(id); } }} aria-label={(isFav(id) ? 'Unpin ' : 'Pin ') + label + (isFav(id) ? ' from Favourites' : ' to Favourites')} title={isFav(id) ? 'Unpin from Favourites' : 'Pin to Favourites'}
      onClick={e => { e.stopPropagation(); e.preventDefault(); toggleFav(id); }}><Icon name="star" size={15} fill={isFav(id)} /></span>
  );
  const item = it => (
    <button key={it.key} id={it.navId} class="nav-btn" draggable aria-current={s.section === it.key && !onAsset ? 'page' : undefined} onDragStart={dragStart('sec:' + it.key)} onClick={e => go(it.key, e)}>
      <Icon name={it.icon} /><span class="nav-label">{it.label}</span>
      {it.badge ? <span class="badge">{it.badge}</span> : it.count != null ? <span class="badge">{it.count}</span> : null}
      {star('sec:' + it.key, it.label)}
    </button>
  );
  /* the session you are running: the one the log box points at (the newest, unless you chose another), always one click away under Combat */
  const sp = currentSessionPath();
  const sn = sp ? idx.byPath.get(sp) : null;
  const liveSession = sn && sn.type === 'session' ? (
    <button key="session" class="nav-btn nav-session" id="navSession" data-session={sn.path} title={'Open the session you are running: ' + sn.name} aria-current={s.selected === sn.path && !onAsset ? 'page' : undefined} onClick={e => { goto(sn.path, { newTab: wantsNewTab(e) }); if (onNavigate) onNavigate(); }}>
      <Icon name="book" /><span class="nav-label">{sn.name.replace(/^\d{4}-\d{2}-\d{2}\s+/, '')}</span>
    </button>
  ) : null;
  const camp = s.campaign;
  return (
    <aside ref={asideRef} class={'sidebar' + (auto ? ' sb-auto' : '') + (expanded ? ' sb-open' : '') + (waiting ? ' sb-waiting' : '')} style={'--sb-delay:' + delay + 'ms'} onMouseEnter={enter} onMouseLeave={leaveSb} onFocusIn={() => { if (auto) setOpen(true); }} onFocusOut={e => { if (auto && !(asideRef.current && asideRef.current.contains(e.relatedTarget))) leaveSb(); }}>
      <div class="brand"><div class="brand-mark">D</div><div class="brand-name">DM Forge</div>
        <button class={'tb-icon sb-pin' + (auto ? ' on' : '')} id="sbPin" aria-pressed={auto} aria-label="Hide the sidebar until I point at it" title={auto ? 'Auto-hide is on: click to keep the sidebar open' : 'Hide the sidebar until I point at it'} onClick={() => { updateSetting('sidebarAuto', !auto); if (!auto) set({ sbOpen: true }); }}><Icon name="panel" size={17} /></button>
      </div>
      <div class="camp">
        <button class="camp-btn" id="campMenuBtn" aria-haspopup="menu" aria-expanded={campOpen} title={s.vault.name + ' / ' + camp.path} onClick={() => setCampOpen(!campOpen)}>
          <span class="camp-text"><span class="name">{camp.name}</span><span class="path">{s.vault.name}</span></span><Icon name="chev" size={16} />
        </button>
        {campOpen && (
          <div class="pop camp-pop" role="menu">
            <button class="pop-item" id="campSwitch" role="menuitem" onClick={() => { setCampOpen(false); leave(); }}><Icon name="swap" size={16} />Switch campaign</button>
            <button class="pop-item" id="campReload" role="menuitem" onClick={() => { setCampOpen(false); reload(); }}><Icon name="shuffle" size={16} />Reload from vault</button>
            <button class="pop-item" id="campMapping" role="menuitem" onClick={() => { setCampOpen(false); set({ screen: 'mapping', mappingBack: 'app' }); }}><Icon name="map" size={16} />Edit folder mapping</button>
          </div>
        )}
      </div>
      <nav class="nav" aria-label="Sections">
        <button class="nav-btn" id="navOverview" aria-current={s.section === 'overview' && !onAsset ? 'page' : undefined} onClick={e => go('overview', e)}><Icon name="home" /><span class="nav-label">Overview</span></button>
        <div class="nav-pinned" id="navPinned">{pinned.map(item)}{liveSession}</div>
        <div class={'nav-favs' + (dropAt !== null ? ' over' : '')} id="navFavs" ref={favRef} onDragOver={onOver} onDrop={onDrop} onDragLeave={onLeave}>
          <div class="nav-group nav-fav-h"><Icon name="star" size={14} />Favourites</div>
          {favs.map((f, i) => (
            <div key={f.id}>
              {dropAt === i && <div class="drop-line" />}
              <button class="nav-btn nav-fav" data-favid={f.id} draggable aria-current={f.current ? 'page' : undefined} onDragStart={dragStart(f.id)} onClick={f.go}>
                <Icon name={f.icon} /><span class="nav-label">{f.label}</span>
                <span class="nav-star is nav-unpin" role="button" tabindex="-1" aria-label={'Unpin ' + f.label} title="Unpin" onClick={e => { e.stopPropagation(); e.preventDefault(); toggleFav(f.id); }}><Icon name="x" size={14} /></span>
              </button>
            </div>
          ))}
          {dropAt !== null && dropAt >= favs.length && <div class="drop-line" />}
          {!favs.length && <div class="drop-hint">Drag a page here to pin it, or hover one and click its star</div>}
        </div>
        {Object.keys(groups).map(g => {
          const isOpen = open === g;
          return (
            <div class="nav-section" key={g} data-navgroup={g}>
              <button class={'nav-group-btn' + (isOpen ? ' open' : '')} aria-expanded={isOpen} onClick={() => setUserOpen(isOpen ? '' : g)}>{GROUP_LABEL[g]}<Icon name="chev" size={14} /></button>
              <div class="nav-items" hidden={!isOpen}>
                {groups[g].map(item)}
                {g === 'world' && <button class="nav-btn nav-manage" id="manageCats" onClick={() => set({ dialog: { kind: 'categories' } })}><Icon name="plus" size={15} /><span class="nav-label">Add or remove categories</span></button>}
              </div>
            </div>
          );
        })}
        <div class="nav-sep" />
        <button class="nav-btn" id="navCharacters" title="Your Character Library: characters that belong to no campaign" onClick={() => { openLibrary('app'); if (onNavigate) onNavigate(); }}><Icon name="id" /><span class="nav-label">Characters</span><span class="nav-hint">library</span></button>
      </nav>
      <div class="side-foot">
        <button class="nav-btn" id="navSettings" onClick={() => set({ dialog: { kind: 'menu' } })}><Icon name="gear" /><span class="nav-label">Menu</span>{claudeOn() && <span class="badge">Claude on</span>}</button>
        <button class="ver-link small" id="appVersion" title="See what changed in every version" onClick={() => { setSection('history'); if (onNavigate) onNavigate(); }}>DM Forge v{__DMF_VERSION__}</button>
      </div>
    </aside>
  );
}
