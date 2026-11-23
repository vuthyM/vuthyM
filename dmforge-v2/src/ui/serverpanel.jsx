/* Settings, Server (V3 only): what the server is doing about your backups, updates and disk, and what this device holds for working offline. */
import { useEffect, useState } from 'preact/hooks';
import { S, toast, useApp } from './store.js';
import { refreshServerInfo } from './actions.js';
import { bytesText, agoText, inText, lowDisk } from '../core/serverinfo.js';

function Fact({ label, children, tone }) {
  return <div class={'srv-fact' + (tone ? ' ' + tone : '')}><div class="srv-k">{label}</div><div class="srv-v">{children}</div></div>;
}

export function ServerPanel() {
  const s = useApp();
  const info = s.serverInfo;
  useEffect(() => { refreshServerInfo(); }, []);
  if (!info) return <div class="so so-block" data-set="srvstatus"><div class="muted small" id="srvLoading">{s.online ? 'Asking the server…' : 'The server cannot be reached right now.'}</div></div>;
  const b = info.backup && info.backup.last;
  const u = info.update;
  const low = lowDisk(info.disk);
  const held = info.hold_until && info.hold_until > Date.now();
  const checked = info.checked_at;
  return (
    <div class="so so-block srv" data-set="srvstatus" id="srvPanel">
      <div class="srv-grid">
        <Fact label="Version">{info.version}{info.version !== __DMF_VERSION__ ? <span class="srv-note"> (this page runs {__DMF_VERSION__}; reload)</span> : null}</Fact>
        <Fact label="Last backup" tone={b ? (b.ok ? 'ok' : 'bad') : 'warn'}>
          {b ? (b.ok ? agoText(b.at) + ' · ' + bytesText(b.bytes) + (b.verified ? ' · checked' : '') : 'FAILED ' + agoText(b.at) + (b.error ? ': ' + b.error : '')) : 'none yet (the first is at ' + String(info.backup ? info.backup.hour : 3).padStart(2, '0') + ':00)'}
          {info.backup && info.backup.files ? <span class="srv-note"> · {info.backup.files} kept, {bytesText(info.backup.bytes)}</span> : null}
        </Fact>
        <Fact label="Updates" tone={u && (u.state === 'failed' || u.state === 'rolled-back') ? 'bad' : held ? 'warn' : ''}>
          {held ? 'On hold for ' + inText(info.hold_until) + ' more' : u ? (u.state === 'ok' ? 'Installed ' + u.version + ' ' + agoText(u.at) : u.state === 'building' ? 'Installing ' + u.version + '…' : (u.state === 'rolled-back' ? 'Rolled back: ' : 'Failed: ') + u.version + ' did not install, the old version is running') : 'Nothing installed since this was set up'}
          <span class="srv-note"> · {checked ? 'looked ' + agoText(checked) : 'no check seen yet'}</span>
        </Fact>
        <Fact label="Disk" tone={low ? 'bad' : ''}>{info.disk ? bytesText(info.disk.free) + ' free of ' + bytesText(info.disk.total) : '—'}{low ? <span class="srv-note"> · running low</span> : null}</Fact>
        <Fact label="Campaign">{info.notes} note{info.notes === 1 ? '' : 's'} · {info.images} picture{info.images === 1 ? '' : 's'} · database {bytesText(info.db && info.db.bytes)}{info.trashed ? ' · ' + info.trashed + ' in the trash' : ''}</Fact>
      </div>
      {s.serverWarn && <div class="srv-warn" id="srvWarn" role="status">{s.serverWarn}</div>}
      <div class="row-actions" style="margin-top:10px;gap:8px">
        <button class="btn btn-sm" id="srvRefresh" onClick={async () => { await refreshServerInfo(); toast('Refreshed.'); }}>Refresh</button>
      </div>
    </div>
  );
}

/* Download a copy right now (a plain link: the browser is already signed in, so it just downloads) */
export function BackupButtons() {
  return (
    <span class="row-actions" style="gap:8px">
      <a class="btn btn-sm" id="srvZip" href="/api/backup-download?kind=zip" download>Download notes (.zip)</a>
      <a class="btn btn-sm" id="srvDb" href="/api/backup-download?kind=db" download>Download database (.gz)</a>
    </span>
  );
}

export function HoldButtons() {
  const s = useApp();
  const info = s.serverInfo;
  const held = info && info.hold_until && info.hold_until > Date.now();
  const [busy, setBusy] = useState(false);
  const go = async hours => {
    setBusy(true);
    try { await S.vault.hold(hours); await refreshServerInfo(); toast(hours ? 'Updates are on hold for ' + hours + ' hours. The server keeps running the version it has.' : 'Updates are back on.'); }
    catch (e) { toast('Could not change that: ' + (e && e.message), true); }
    setBusy(false);
  };
  return (
    <span class="row-actions" style="gap:8px">
      {held ? <button class="btn btn-sm btn-primary" id="srvResume" disabled={busy} onClick={() => go(0)}>Resume updates</button>
        : <button class="btn btn-sm" id="srvHold" disabled={busy} onClick={() => go(8)}>Hold for 8 hours</button>}
    </span>
  );
}

/* What this device can open with no connection */
export function OfflineButtons() {
  const s = useApp();
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState('');
  const look = async () => {
    const v = S.vault;
    if (!v || !v.savedHere || !S.campaign) return;
    const have = await v.savedHere();
    const md = S.files.filter(p => /\.md$/i.test(p)), other = S.files.filter(p => !/\.md$/i.test(p));
    setRep({ md: md.length, mdHave: md.filter(p => have.texts.has(p)).length, other: other.length, otherHave: other.filter(p => have.blobs.has(p)).length });
  };
  useEffect(() => { look(); }, [s.dataRev]);
  const run = async () => {
    setBusy('Saving…');
    try {
      const r = await S.vault.saveForOffline(S.files.filter(p => !p.startsWith('.')), (d, n) => setBusy('Saving ' + d + ' of ' + n + '…'));
      toast(r.fetched ? 'Saved ' + r.fetched + ' more file' + (r.fetched === 1 ? '' : 's') + ' on this device.' + (r.failed ? ' ' + r.failed + ' could not be fetched.' : '') : r.failed ? r.failed + ' files could not be fetched.' : 'Everything was already saved on this device.');
    } catch (e) { toast('Could not save: ' + (e && e.message), true); }
    setBusy(''); look();
  };
  const all = rep && rep.mdHave === rep.md && rep.otherHave === rep.other;
  return (
    <span class="so-offline">
      {rep && <span class={'srv-state ' + (all ? 'ok' : 'warn')} id="srvOfflineState">{rep.mdHave} of {rep.md} notes{rep.other ? ', ' + rep.otherHave + ' of ' + rep.other + ' pictures and files' : ''} saved here{s.lastSync ? ' · synced ' + agoText(s.lastSync) : ''}{s.storagePersisted === true ? ' · protected from clearing' : s.storagePersisted === false ? ' · the browser may clear it if the disk gets short' : ''}</span>}
      <button class="btn btn-sm" id="srvOffline" disabled={!!busy || !s.online} onClick={run}>{busy || 'Save everything for offline'}</button>
    </span>
  );
}
