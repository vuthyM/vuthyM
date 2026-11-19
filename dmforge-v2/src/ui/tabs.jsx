import { MapViewer } from './mapview.jsx';
import { IMAGE_EXT, ext } from '../core/util.js';
import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { S, getIndex } from './store.js';
import { typeLabel } from '../core/schema.js';
import { basename } from '../core/util.js';
import { Asset, Empty } from './common.jsx';

/* each open tab renders its page inside this, so a page reads its own tab, not the active one */
export const TabCtx = createContext(null);
export const useTab = () => useContext(TabCtx) || S.tabs[0];

const SECTION_TITLES = { overview: 'Overview', map: 'Maps', other: 'Other notes', generate: 'Generate', combat: 'Combat', party: 'Party', rules: 'Rules', secrets: 'Secrets', clocks: 'Clocks', graph: 'Graph', history: 'Version history', settings: 'Settings', cheatsheet: 'Cheat sheet' };
export function tabTitle(tab) {
  if (tab.asset) return basename(tab.asset);
  const idx = getIndex();
  if (tab.section === 'graph' && tab.graphFocus) { const g = idx && idx.byPath.get(tab.graphFocus); if (g) return 'Graph: ' + g.name; }
  if (tab.selected) { const n = idx && idx.byPath.get(tab.selected); if (n) return n.name; }
  return SECTION_TITLES[tab.section] || typeLabel(tab.section);
}

/* a tab that just shows one image (a map, a handout) at full size */
export function AssetPage({ path }) {
  const [fit, setFit] = useState(true);
  if (IMAGE_EXT.includes(ext(path))) {
    return (
      <>
        <div class="page-head"><div><h2 aria-level="1">{basename(path)}</h2><div class="small muted">{path}</div></div></div>
        <MapViewer path={path} />
      </>
    );
  }
  return (
    <>
      <div class="page-head">
        <div><h2 aria-level="1">{basename(path)}</h2><div class="small muted">{path}</div></div>
        <div class="row-actions"><button class="btn btn-sm" onClick={() => setFit(!fit)}>{fit ? 'Actual size' : 'Fit to window'}</button></div>
      </div>
      <div class={'asset-view' + (fit ? ' fit' : '')}><Asset path={path} /></div>
    </>
  );
}
