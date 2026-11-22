import { render } from 'preact';
import { keepPasswordManagersOut } from './nopm.js';
import { useEffect } from 'preact/hooks';
import { S, set, useApp, emit, toast, touch, getIndex, flushPending } from './store.js';
import * as A from './actions.js';
import { loadLastVaultInfo, startVault, startHelperMode, initTheme, initClaude, initSettings, initDice, flushDrafts } from './actions.js';
import { ThemeToggle } from './theme.jsx';
import { Welcome, FolderBrowser, Loading, MappingScreen, Inspector } from './screens.jsx';
import { Shell } from './shell.jsx';
import { LibraryScreen } from './library.jsx';
import * as L from './libraryactions.js';
import { Toasts } from './common.jsx';
import { FsaVault, MemoryVault } from '../core/vault.js';
import './fonts.css';
import './palettes.css';
import './styles.css';

function App() {
  const s = useApp();
  useEffect(() => {
    loadLastVaultInfo();
    try { if (navigator.brave && navigator.brave.isBrave) navigator.brave.isBrave().then(v => set({ brave: !!v }), () => {}); } catch (e) { /* not Brave */ }
    startHelperMode();
  }, []);
  useEffect(() => {
    const warn = e => { flushDrafts(); flushPending(); if (S.working.count) { e.preventDefault(); e.returnValue = ''; } };
    const hide = () => { flushDrafts(); flushPending(); };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', hide);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('pagehide', hide); };
  }, []);
  let screen;
  switch (s.screen) {
    case 'browse': screen = <FolderBrowser />; break;
    case 'loading': screen = <Loading />; break;
    case 'mapping': screen = <MappingScreen />; break;
    case 'inspect': screen = <Inspector />; break;
    case 'app': screen = <Shell />; break;
    case 'library': screen = <LibraryScreen />; break;
    default: screen = <Welcome />;
  }
  return <>{screen}{s.screen !== 'app' && <ThemeToggle floating />}<Toasts /></>;
}

keepPasswordManagersOut();
initTheme();
initClaude();
initSettings();
initDice();
render(<App />, document.getElementById('root'));

/* test hook: lets automated tests open a folder handle without the picker */
window.__dmforge = { S, getIndex, startVault, FsaVault, MemoryVault, emit, toast, touch, A, L };
