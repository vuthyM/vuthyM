import { canBack, canForward, navStep } from './store.js';
import { useEffect, useRef, useState } from 'preact/hooks';
import { S, set, useApp, getIndex } from './store.js';
import { setSection, goto, startPush, setLayout, tableMode, toggleCheat, setTheme, LAYOUTS, snapshotInfo, closeCampaign, reloadCampaign, discardAll, openTab, activateTab, wantsNewTab, claudeOn, openLayoutMenu, setDiceOpen, timerOpen, setLogOpen, checkForUpdate, askInstallUpdate, laterUpdate, autoPushTick, refreshServerInfo, openSettings } from './actions.js';
import { Sidebar } from './sidebar.jsx';
import { describeSnapshot } from '../core/snapshot.js';
import { PopMenu } from './popmenu.jsx';
import { Icon } from './icons.jsx';
import { TYPES, TYPE_ORDER, OTHER, isCustom, typeLabel, typeInfo } from '../core/schema.js';
import { search } from '../core/campaign.js';
import { IMAGE_EXT, ext } from '../core/util.js';
import { Overview, EntityPage, MapsPage, OtherPage } from './notes.jsx';
import { GeneratePage } from './generate.jsx';
import { GraphPage } from './graph.jsx';
import { HistoryPage } from './history.jsx';
import { AssetPage } from './tabs.jsx';
import { Workspace, useNarrow } from './workspace.jsx';
import { CombatPage } from './combat.jsx';
import { Dialogs } from './dialogs.jsx';
import { ContextMenu } from './menu.jsx';
import { ThemeToggle } from './theme.jsx';
import { CheatButton, CheatPanel, CheatPage } from './cheatsheet.jsx';
import { JobPill, SnapshotButton } from './snapshot.jsx';
import { PartyPage } from './party.jsx';
import { PeekLayer } from './peek.jsx';
import { Island, TightBoxes } from './island.jsx';
import { keysText } from '../core/shortcuts.js';
import { RulesPage } from './rules.jsx';
import { SecretsPage } from './secrets.jsx';
import { ClocksPage } from './clocks.jsx';
import { TourLayer } from './tour.jsx';
import { SettingsPage } from './settingspage.jsx';
import { openLibrary } from './libraryactions.js';

/* back and forward through where this tab has been, and the notes opened last */
function NavButtons() {
  const s = useApp();
  const idx = getIndex();
  const recent = s.recent.map(p => idx.byPath.get(p)).filter(Boolean).slice(0, 12);
  return (
    <div class="nav-trail" role="group" aria-label="Back and forward">
      <button class="tb-icon" id="navBack" aria-label="Back" title="Back (⌘[ or Ctrl+[)" disabled={!canBack()} onClick={() => navStep(-1)}><Icon name="back" /></button>
      <button class="tb-icon" id="navFwd" aria-label="Forward" title="Forward (⌘] or Ctrl+])" disabled={!canForward()} onClick={() => navStep(1)}><Icon name="forward" /></button>
      <PopMenu id="recentMenu" icon="history" title="Recent notes" align="left">
        {({ close }) => (recent.length
          ? recent.map(n => <button key={n.path} class="pop-item" role="menuitem" data-recent={n.name} onClick={() => { close(); goto(n.path); }}>{n.name}</button>)
          : <div class="pop-item muted small">Nothing opened yet.</div>)}
      </PopMenu>
    </div>
  );
}

function SearchBox() {
  const s = useApp();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const idx = getIndex();
  const hits = q.trim() ? search(idx, q) : [];
  useEffect(() => {
    const k = e => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea' && tag !== 'select') { e.preventDefault(); ref.current && ref.current.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const pick = (n, e) => { setQ(''); setOpen(false); goto(n.path, { newTab: wantsNewTab(e) }); };
  return (
    <div class="search-wrap">
      <input ref={ref} type="search" placeholder={'Search notes ( / )   ·   ' + keysText('mod+K') + ' for anything'} aria-label="Search notes" value={q}
        onInput={e => { setQ(e.currentTarget.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={e => { if (e.key === 'Enter' && hits[0]) pick(hits[0].note, e); if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); } }} />
      {open && q.trim() && (
        <div class="search-results">
          {!hits.length && <div class="search-hit muted">No notes match “{q}”.</div>}
          {hits.map(h => (
            <button key={h.note.path} class="search-hit" onMouseDown={e => e.preventDefault()} onClick={e => pick(h.note, e)}>
              <div><strong>{h.note.name}</strong> <span class="pill">{h.note.type === 'root' || h.note.type === 'other' ? 'Other' : (typeInfo(h.note.type) ? typeInfo(h.note.type).single : 'Note')}</span></div>
              {h.snippet && <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{h.snippet}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* the Layout menu: one pane, two columns, or a big prep pane with two stacked panes beside it */
function LayoutButton() {
  const s = useApp();
  const narrow = useNarrow();
  const icon = { single: <rect x="2" y="3" width="14" height="12" rx="2" />, two: <><rect x="2" y="3" width="6" height="12" rx="1.5" /><rect x="10" y="3" width="6" height="12" rx="1.5" /></>, prep: <><rect x="2" y="3" width="6" height="12" rx="1.5" /><rect x="10" y="3" width="6" height="5" rx="1.5" /><rect x="10" y="10" width="6" height="5" rx="1.5" /></> }[s.layout];
  return (
    <button class="tb-icon layout-btn" id="layoutBtn" aria-haspopup="menu" disabled={narrow} onClick={openLayoutMenu}
      title={narrow ? 'Layouts need a wider window' : 'Choose how the window is divided into panes'}>
      <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">{icon}</svg><span class="sr">Layout</span>
    </button>
  );
}

/* the View menu: the things you reach for now and then (cheat sheet, snapshot, how the window is divided, light or dark) in one place instead of four icons */
function ViewMenu() {
  const s = useApp();
  const narrow = useNarrow();
  const info = claudeOn() ? snapshotInfo() : null;
  const worth = !!(info && info.cmp && info.cmp.worth);
  const layouts = Object.keys(LAYOUTS);
  return (
    <PopMenu id="viewMenu" icon="layout" text="View" btnClass="btn btn-ghost btn-sm tb-view" title="Cheat sheet, layout and light or dark">
      {({ close }) => (
        <>
          <button class="pop-item" id="cheatBtn" role="menuitem" aria-expanded={s.cheatOpen} aria-controls="cheatPanel" onClick={() => { close(); toggleCheat(); }}><Icon name="cheat" size={16} />Cheat sheet<span class="pop-hint">{s.cheatOpen ? 'open' : 'the rules at a glance'}</span></button>
          {claudeOn() && !s.job && <button class={'pop-item' + (worth ? ' worth' : '')} id="snapBtn" role="menuitem" title={info ? describeSnapshot(info.snap, info.cmp) + (worth ? '. Worth refreshing.' : '') + ' Click to refresh it.' : 'No snapshot yet. Click to make one.'} onClick={() => { close(); set({ dialog: { kind: 'snapshot' } }); }}><Icon name="wand" size={16} />Snapshot of the campaign…{worth && <span class="snap-dot" aria-hidden="true" />}<span class="pop-hint">{worth ? 'worth refreshing' : info ? 'up to date' : 'not made yet'}</span></button>}
          <div class="pop-sep" />
          <div class="pop-label">Layout{narrow ? ' (needs a wider window)' : ''}</div>
          {layouts.map(k => <button key={k} class={'pop-item' + (s.layout === k ? ' on' : '')} role="menuitemradio" aria-checked={s.layout === k} id={'viewLayout-' + k} disabled={narrow} onClick={() => { close(); setLayout(k); }}><span class="pop-check">{s.layout === k ? '✓' : ''}</span>{LAYOUTS[k].label}</button>)}
          <button class="pop-item" id="viewTable" role="menuitem" disabled={narrow} onClick={() => { close(); tableMode(); }}><span class="pop-check" />Table mode<span class="pop-hint">session, party, NPCs</span></button>
          <div class="pop-sep" />
          <div class="pop-label">Colours</div>
          {[['auto', 'Follow my Mac'], ['light', 'Light'], ['dark', 'Dark']].map(([k, label]) => <button key={k} class={'pop-item' + (s.theme === k ? ' on' : '')} role="menuitemradio" aria-checked={s.theme === k} id={'viewTheme-' + k} onClick={() => { close(); setTheme(k); }}><span class="pop-check">{s.theme === k ? '✓' : ''}</span>{label}</button>)}
        </>
      )}
    </PopMenu>
  );
}

function renderPage(tab) {
  if (tab.asset) return <AssetPage path={tab.asset} />;
  const section = tab.section;
  switch (section) {
    case 'overview': return <Overview />;
    case 'map': return <MapsPage />;
    case 'other': return <OtherPage />;
    case 'generate': return <GeneratePage />;
    case 'combat': return <CombatPage />;
    case 'party': return <PartyPage />;
    case 'rules': return <RulesPage />;
    case 'secrets': return <SecretsPage />;
    case 'clocks': return <ClocksPage />;
    case 'graph': return <GraphPage />;
    case 'history': return <HistoryPage />;
    case 'settings': return <SettingsPage />;
    case 'cheatsheet': return <CheatPage />;
    default: return <EntityPage type={section} />;
  }
}

/* When you type `update` in the helper's window it installs a newer version and restarts. This page keeps running the old
   one until it is refreshed, so it asks the helper which version is installed now and offers a Reload when they differ. */
function useNewVersionCheck() {
  useEffect(() => {
    if (!S.helper || !S.vault || !S.vault.helperVersion) return;
    let stop = false;
    const check = async () => {
      try {
        const v = await S.vault.helperVersion();
        if (!stop && v && v !== __DMF_VERSION__ && S.newVersion !== v) set({ newVersion: v });
      } catch (e) { /* the helper is restarting: try again next time */ }
    };
    const checkZip = () => { if (!stop && !S.updating) checkForUpdate(); };      // a newer zip you have just downloaded
    const t = setInterval(check, 6000);
    const t2 = setInterval(checkZip, 30000);
    const onFocus = () => { if (!document.hidden) { check(); checkZip(); } };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
    check(); checkZip();
    return () => { stop = true; clearInterval(t); clearInterval(t2); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, []);
}

/* V3 only: pushes your edits for you once you have been quiet for a while (when you have turned that on), and keeps an eye on the server's own report */
function useHostedWatch() {
  useEffect(() => {
    if (!S.hosted) return;
    let stop = false;
    const push = setInterval(() => { if (!stop && !document.hidden) autoPushTick(); }, 20000);
    const look = () => { if (!stop && !document.hidden && S.online) refreshServerInfo(); };
    const t = setInterval(look, 5 * 60000);
    const first = setTimeout(look, 4000);
    document.addEventListener('visibilitychange', look);
    return () => { stop = true; clearInterval(push); clearInterval(t); clearTimeout(first); document.removeEventListener('visibilitychange', look); };
  }, [S.hosted]);
}

/* the pinned bars on narrow screens (the page scrolls as a whole there) sit just under the top bar: its height is a CSS variable */
function useChromeHeight() {
  useEffect(() => {
    const el = document.querySelector('.chrome');
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--chrome-h', el.getBoundingClientRect().height + 'px');
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
}

/* Cmd/Ctrl+K opens the quick switcher; Cmd/Ctrl+[ and ] (or Alt+Left and Right outside a text box) go back and forward */
function useNavKeys() {
  useEffect(() => {
    const k = e => {
      const mod = e.metaKey || e.ctrlKey;
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target.isContentEditable);
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); set({ dialog: S.dialog && S.dialog.kind === 'palette' ? null : { kind: 'palette' } }); return; }
      if (!typing && !mod && !e.altKey && e.key === '?' && (!S.dialog || S.dialog.kind === 'shortcuts')) { e.preventDefault(); set({ dialog: S.dialog ? null : { kind: 'shortcuts' } }); return; }
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && S.settings.sidebarAuto && !S.dialog) { e.preventDefault(); set({ sbOpen: !S.sbOpen }); return; }
      if (S.dialog) return;
      if (mod && !e.altKey && (e.key === '[' || e.key === ']')) { e.preventDefault(); navStep(e.key === '[' ? -1 : 1); return; }
      if (e.altKey && !mod && !typing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); navStep(e.key === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

/* F2 renames the note you are looking at (like in most file managers) */
function useRenameKey() {
  useEffect(() => {
    const k = e => {
      if (e.key !== 'F2' || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || S.dialog || S.editing) return;
      const p = S.selected;
      if (p && S.working.has(p) && /\.md$/i.test(p)) { e.preventDefault(); set({ dialog: { kind: 'rename', path: p } }); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
}

export function Shell() {
  const s = useApp();
  useNewVersionCheck();
  useHostedWatch();
  useChromeHeight();
  useRenameKey();
  useNavKeys();
  const [drawer, setDrawer] = useState(false);
  const pend = s.working.count;
  const leave = () => {
    if (pend) set({ dialog: { kind: 'confirm', title: 'Switch campaign?', body: 'Your ' + pend + ' unpushed change' + (pend === 1 ? ' is' : 's are') + ' saved in this browser and will be here next time you open this campaign.', confirmLabel: 'Switch campaign', onConfirm: closeCampaign } });
    else closeCampaign();
  };
  const reload = () => {
    if (pend) set({ dialog: { kind: 'confirm', title: 'Reload from the vault?', body: 'Notes are re-read from disk. Your ' + pend + ' unpushed change' + (pend === 1 ? '' : 's') + ' are kept and checked for conflicts when you push.', confirmLabel: 'Reload', onConfirm: reloadCampaign } });
    else reloadCampaign();
  };
  return (
    <div class={'app' + (drawer ? ' drawer-open' : '')}>
      <button class="drawer-scrim" aria-label="Close the menu" tabindex="-1" onClick={() => setDrawer(false)} />
      <Sidebar reload={reload} leave={leave} onNavigate={() => setDrawer(false)} />
      <div class="main">
        <div class="chrome">
        {!s.newVersion && s.updateAvail && s.updateLater !== s.updateAvail.version && (
          <div class="update-bar" id="updateReady" role="status">
            <span>DM Forge <strong>{s.updateAvail.version}</strong> is in your Downloads folder (you have {s.updateAvail.current || __DMF_VERSION__}). Your unpushed changes are kept.</span>
            <span class="row-actions" style="gap:6px">
              <button class="btn btn-sm" id="updateLater" disabled={s.updating} onClick={laterUpdate}>Not now</button>
              <button class="btn btn-sm btn-primary" id="updateInstall" disabled={s.updating} onClick={askInstallUpdate}>{s.updating ? 'Installing…' : 'Install and restart'}</button>
            </span>
          </div>
        )}
        {s.newVersion && (
          <div class="update-bar" id="updateBar" role="status">
            <span>DM Forge <strong>{s.newVersion}</strong> is installed (this page is still running {__DMF_VERSION__}). Your unpushed changes are kept.</span>
            <button class="btn btn-sm btn-primary" id="reloadForUpdate" onClick={() => location.reload()}>Reload to use it</button>
          </div>
        )}
        <div class="topbar">
          <button class="tb-icon tb-menu" id="drawerBtn" aria-label="Open the menu" title="Menu" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          <NavButtons />
          <SearchBox />
          <div class="spacer" />
          {s.hosted && !s.online && <span class="tb-offline" id="offlineChip" role="status" title="The server cannot be reached. You can keep working: everything is saved on this device, and pushing waits until it is back (this page checks for you).">Offline<span class="tb-offline-note"> · saved on this device</span></span>}
          {s.hosted && s.online && s.serverWarn && <button class="tb-offline tb-warn" id="serverWarnChip" title={s.serverWarn + ' Click to see the server report.'} onClick={() => openSettings('server')}>Server needs a look</button>}
          <JobPill />
          <Island />
          <ViewMenu />
          {pend > 0 && <button class="btn btn-ghost btn-sm tb-discard" onClick={() => set({ dialog: { kind: 'confirm', title: 'Discard all unpushed changes?', body: 'Every edit, new note and deletion since your last push will be thrown away. Your vault is not touched.', confirmLabel: 'Discard ' + pend + ' change' + (pend === 1 ? '' : 's'), danger: true, onConfirm: discardAll } })}>Discard all</button>}
          <button class={'btn tb-push' + (pend ? ' btn-primary has' : '')} disabled={!pend} onClick={startPush} id="pushBtn">{pend ? 'Push ' + pend + ' change' + (pend === 1 ? '' : 's') : 'Nothing to push'}</button>
        </div>
        </div>
        <Workspace render={renderPage} />
        <div class="bottombar" role="toolbar" aria-label="Table tools">
          <button class={s.section === 'overview' ? 'on' : ''} onClick={() => setSection('overview')}><Icon name="home" size={22} />Home</button>
          <button class={s.section === 'combat' ? 'on' : ''} onClick={() => setSection('combat')}><Icon name="swords" size={22} />Combat</button>
          <button class={s.diceOpen ? 'on' : ''} onClick={() => setDiceOpen(!s.diceOpen)}><Icon name="dice" size={22} />Dice</button>
          <button class={s.timer.open ? 'on' : ''} onClick={() => timerOpen(!s.timer.open)}><Icon name="timer" size={22} />Timer</button>
          <button class={s.logOpen ? 'on' : ''} onClick={() => setLogOpen(!s.logOpen)}><Icon name="pencil" size={22} />Log</button>
        </div>
      </div>
      <CheatPanel />
      <TightBoxes />
      <PeekLayer />
      <TourLayer />
      <Dialogs />
      <ContextMenu />
    </div>
  );
}
