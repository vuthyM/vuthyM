import { useEffect, useState } from 'preact/hooks';
import { S, set, useApp, toast } from './store.js';
import { hasFsa, pickVault, reopenLastVault, openDemo, chooseCampaign, confirmMapping, createCampaign } from './actions.js';
import { TYPES, TYPE_ORDER, OTHER, customId } from '../core/schema.js';
import { basename } from '../core/util.js';
import { scanVault, buildReport } from '../core/inspector.js';
import { FsaVault, MemoryVault } from '../core/vault.js';
import { demoFiles, DEMO_VAULT_NAME } from '../core/demo.js';
import { openLibrary } from './libraryactions.js';

function Brand() {
  return (
    <div class="brand">
      <div class="brand-mark">D</div>
      <div><div class="brand-name">DM Forge</div><div class="brand-sub">Your Obsidian campaign, run from a dashboard</div></div>
    </div>
  );
}

const BRAVE_FLAG = 'brave://flags/#file-system-access-api';

function PickerHelp({ brave }) {
  const copy = () => navigator.clipboard.writeText(BRAVE_FLAG).then(() => toast('Address copied. Paste it into a new tab.'), () => toast('Select the address and copy it manually.', true));
  if (brave) {
    return (
      <div class="notice stack" id="pickerHelp">
        <strong>Brave blocks folder access by default.</strong>
        <ol style="margin:0;padding-left:20px">
          <li>Open a new tab and paste <span class="mono" style="user-select:all">{BRAVE_FLAG}</span> <button class="btn btn-sm" onClick={copy}>Copy address</button></li>
          <li>Set <strong>File System Access API</strong> to <strong>Enabled</strong>, then click <strong>Relaunch</strong>.</li>
          <li>Open DM Forge again and choose your vault.</li>
        </ol>
        <span>Would rather not change a Brave setting? The DM Forge helper works without it (see the README).</span>
        <div class="row-actions"><button class="btn btn-sm" onClick={() => location.reload()}>Check again</button></div>
      </div>
    );
  }
  return (
    <div class="notice" id="pickerHelp">
      This browser cannot open folders. Use Chrome, Edge or Brave (with its File System Access flag on), or start the DM Forge helper (see the README). The demo and generators still work here.
    </div>
  );
}

export function Welcome() {
  const s = useApp();
  const canPick = hasFsa();
  return (
    <div class="center-screen">
      <div class="panel stack">
        <Brand />
        <p class="muted" style="margin:6px 0 4px">
          Open your Obsidian vault, choose a campaign folder, and DM Forge loads its notes. Changes stay in the app until you push them back.
        </p>
        {(!canPick || s.pickerBlocked) && <PickerHelp brave={s.brave} />}
        <div class="stack">
          <button class="btn btn-primary" disabled={!canPick} onClick={pickVault}>Open vault folder…</button>
          {s.lastVault && <button class="btn" disabled={!canPick} onClick={reopenLastVault}>Reopen “{s.lastVault.name}”</button>}
          <button class="btn" onClick={openDemo}>Try the demo vault</button>
          <span class="muted small" style="margin-left:8px">A practice campaign to try things on: nothing you do there is saved.</span>
          <button class="btn btn-ghost" onClick={() => set({ screen: 'inspect', vault: null })}>Inspect a vault (report for tuning DM Forge)</button>
        </div>
        <p class="muted small" style="margin:6px 0 0">Nothing is uploaded anywhere. Everything runs in this browser tab.</p>
      </div>
    </div>
  );
}

/* ---------- folder browser: choose the campaign folder inside the vault ---------- */
export function FolderBrowser() {
  const s = useApp();
  const [cwd, setCwd] = useState('');
  const [entries, setEntries] = useState(null);
  const [newName, setNewName] = useState('');
  const vault = s.vault;

  useEffect(() => {
    let live = true;
    setEntries(null);
    (async () => {
      const ents = (await vault.list(cwd)).filter(e => e.kind === 'dir' && !e.name.startsWith('.')).sort((a, b) => a.name.localeCompare(b.name));
      const rows = [];
      for (const e of ents) {
        const p = cwd ? cwd + '/' + e.name : e.name;
        let md = 0, sub = 0;
        try { for (const c of await vault.list(p)) { if (c.kind === 'dir') sub++; else if (/\.md$/i.test(c.name)) md++; } } catch (_) { /* unreadable */ }
        rows.push({ name: e.name, path: p, md, sub });
      }
      let here = 0;
      try { for (const c of await vault.list(cwd)) if (c.kind === 'file' && /\.md$/i.test(c.name)) here++; } catch (_) { /* unreadable */ }
      if (live) setEntries({ rows, here, cwd });
    })().catch(e => { toast(String(e.message || e), true); setEntries({ rows: [], here: 0, cwd }); });
    return () => { live = false; };
  }, [cwd, vault]);

  const crumbs = cwd ? cwd.split('/') : [];
  return (
    <div class="center-screen">
      <div class="panel wide stack">
        <Brand />
        <div class="row-actions" style="justify-content:space-between;align-items:center;margin-top:8px"><h3 style="margin:0">Choose the campaign folder</h3><button class="btn btn-sm" id="openLibrary" title="Make player characters and NPCs that belong to no campaign" onClick={() => openLibrary('browse')}>Character Library</button></div>
        <p class="muted small" style="margin:0">Pick the folder that holds one campaign (its NPCs, players, sessions…). DM Forge only writes inside it.</p>
        <div class="crumbs">
          <button onClick={() => setCwd('')}>{vault.name}</button>
          {crumbs.map((c, i) => (<span key={i}>/ <button onClick={() => setCwd(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>))}
        </div>
        <div class="dir-list">
          {(!entries || entries.cwd !== cwd) && <div class="dir-row muted">Reading…</div>}
          {entries && entries.cwd === cwd && !entries.rows.length && <div class="dir-row muted">No subfolders here.</div>}
          {entries && entries.cwd === cwd && entries.rows.map(r => (
            <button key={r.path} class="dir-row" onClick={() => setCwd(r.path)}>
              <span><strong>{r.name}</strong></span>
              <span class="muted small">{r.md} notes · {r.sub} folders ›</span>
            </button>
          ))}
        </div>
        {entries && entries.cwd === cwd && <div class="muted small">This folder has {entries.here} note{entries.here === 1 ? '' : 's'} directly inside it.</div>}
        <div class="row-actions">
          <button class="btn btn-primary" disabled={!cwd} onClick={() => chooseCampaign(cwd)}>Use “{basename(cwd) || '…'}” as the campaign</button>
          {!s.helper && <button class="btn btn-ghost" onClick={() => set({ screen: 'welcome', vault: null })}>Back</button>}
          {s.helper && <button class="btn btn-ghost" onClick={() => set({ screen: 'inspect' })}>Vault report</button>}
        </div>
        <form class="stack" style="border-top:1px solid var(--border);padding-top:14px" onSubmit={e => { e.preventDefault(); createCampaign(cwd, newName); }}>
          <label class="lbl" style="margin:0">Or start a new campaign inside {cwd ? '“' + basename(cwd) + '”' : 'the vault'}</label>
          <div class="row-actions">
            <input style="flex:1 1 220px;width:auto" placeholder="Campaign name" aria-label="New campaign name" value={newName} onInput={e => setNewName(e.currentTarget.value)} />
            <button class="btn" type="submit" disabled={!newName.trim()}>Create campaign folder</button>
          </div>
          <div class="muted small">Creates the folder, an index note and the standard subfolders (NPCs, Players, Locations, Factions, Plot Threads, Sessions, Maps) in your vault right away.</div>
        </form>
      </div>
    </div>
  );
}

export function Loading() {
  const s = useApp();
  return <div class="center-screen"><div class="panel"><Brand /><p style="margin:18px 0 0" class="mono">{s.loadMsg}</p></div></div>;
}

/* ---------- confirm how folders map to note types ---------- */
export function MappingScreen() {
  const s = useApp();
  const [m, setM] = useState(() => Object.assign({}, s.mapping));
  const counts = {};
  for (const p of s.files) {
    if (!/\.md$/i.test(p)) continue;
    const rel = p.slice(s.campaign.path.length + 1);
    const top = rel.indexOf('/') < 0 ? '' : rel.slice(0, rel.indexOf('/'));
    if (top) counts[top] = (counts[top] || 0) + 1;
  }
  const rootCount = s.files.filter(p => /\.md$/i.test(p) && p.slice(s.campaign.path.length + 1).indexOf('/') < 0).length;
  return (
    <div class="center-screen">
      <div class="panel wide stack">
        <Brand />
        <h3 style="margin-top:8px">What is in “{s.campaign.name}”?</h3>
        <p class="muted small" style="margin:0">DM Forge guessed what each folder holds from its name. Fix anything it got wrong. You can change this later from the sidebar.</p>
        <table class="table">
          <thead><tr><th>Folder</th><th>Notes</th><th>Treat as</th></tr></thead>
          <tbody>
            {s.folders.map(f => (
              <tr key={f}>
                <td><strong>{f}</strong></td>
                <td class="mono">{counts[f] || 0}</td>
                <td>
                  <select value={m[f] || OTHER} onChange={e => setM(Object.assign({}, m, { [f]: e.currentTarget.value }))}>
                    {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPES[t].label}</option>)}
                    <option value={customId(f)}>Its own category (plain notes)</option>
                    <option value={OTHER}>Other notes</option>
                  </select>
                </td>
              </tr>
            ))}
            {!s.folders.length && <tr><td colSpan="3" class="muted">No subfolders yet. New notes will create folders like NPCs and Sessions automatically.</td></tr>}
          </tbody>
        </table>
        {rootCount > 0 && <div class="muted small">{rootCount} note{rootCount === 1 ? '' : 's'} sit directly in the campaign folder and show under “Other notes”.</div>}
        <div class="row-actions">
          <button class="btn btn-primary" onClick={() => confirmMapping(m)}>Looks good</button>
          <button class="btn btn-ghost" onClick={() => set({ screen: s.mappingBack || 'browse' })}>Back</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- vault inspector: a privacy-safe report about how the vault is laid out ---------- */
export function Inspector() {
  const s = useApp();
  const [state, setState] = useState({ phase: 'idle', progress: 0, report: '', names: false });
  const [data, setData] = useState(null);

  const run = async (vault, names) => {
    setState(x => ({ ...x, phase: 'scanning', progress: 0, names }));
    try {
      const d = await scanVault(vault, { includeNames: names, onProgress: n => setState(x => ({ ...x, progress: n })) });
      setData(d);
      setState(x => ({ ...x, phase: 'done', report: buildReport(d, { includeNames: names }) }));
    } catch (e) { toast('Scan failed: ' + (e.message || e), true); setState(x => ({ ...x, phase: 'idle' })); }
  };
  const choose = async () => {
    if (!hasFsa()) return;
    try {
      const h = await window.showDirectoryPicker({ id: 'dmforge-vault', mode: 'read' });
      run(new FsaVault(h), state.names);
    } catch (e) { if (e && e.name !== 'AbortError') toast(e.message, true); }
  };
  const copy = () => navigator.clipboard.writeText(state.report).then(() => toast('Report copied'), () => toast('Select the text and copy it manually.', true));

  return (
    <div class="center-screen">
      <div class="panel wide stack">
        <Brand />
        <h3 style="margin-top:8px">Vault report</h3>
        <p class="muted small" style="margin:0">Reads your vault (read-only) and writes a summary: folder names and counts, which properties your notes use, whether you use inline fields, and which Obsidian plugins are installed. It never includes what is written in your notes.</p>
        {state.phase === 'idle' && (
          <div class="stack">
            <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" style="width:auto" checked={state.names} onChange={e => setState(x => ({ ...x, names: e.currentTarget.checked }))} /> Include a few example note titles per folder (off by default)</label>
            <div class="row-actions">{s.vault && s.vault.kind !== 'memory' && <button class="btn btn-primary" onClick={() => run(s.vault, state.names)}>Scan “{s.vault.name}”</button>}
              <button class={'btn ' + (s.vault && s.vault.kind !== 'memory' ? '' : 'btn-primary')} disabled={!hasFsa()} onClick={choose}>Choose vault folder…</button><button class="btn" onClick={() => run(new MemoryVault(demoFiles(), DEMO_VAULT_NAME), state.names)}>Try it on the demo vault</button><button class="btn btn-ghost" onClick={() => set({ screen: s.vault ? 'browse' : 'welcome' })}>Back</button></div>
          </div>
        )}
        {state.phase === 'scanning' && <p class="mono">Scanning… {state.progress} files</p>}
        {state.phase === 'done' && (
          <div class="stack">
            <textarea class="report" readOnly value={state.report} onFocus={e => e.currentTarget.select()} />
            <div class="row-actions">
              <button class="btn btn-primary" onClick={copy}>Copy report</button>
              <button class="btn" onClick={() => setState({ phase: 'idle', progress: 0, report: '', names: state.names })}>Scan another</button>
              <button class="btn btn-ghost" onClick={() => set({ screen: s.vault ? 'browse' : 'welcome' })}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
