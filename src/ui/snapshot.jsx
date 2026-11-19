import { useEffect, useMemo, useReducer, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, set, useApp, getIndex, toast } from './store.js';
import { snapshotInfo, snapshotPath, saveSnapshot, claudeOn, claudeBusy, goto, startSnapshotJob, clearJob, discardJob } from './actions.js';
import { snapshotNotes, planSnapshot, snapshotPrompt, describeSnapshot, SNAPSHOT_NOTE } from '../core/snapshot.js';
import { Modal } from './common.jsx';

const close = () => set({ dialog: null });

/* Settings: the snapshot's state, and the buttons to make or refresh it */
export function SnapshotSection() {
  const s = useApp();
  const info = snapshotInfo();
  const on = claudeOn();
  const job = s.job && s.job.kind === 'snapshot' ? s.job : null;
  const text = info ? describeSnapshot(info.snap, info.cmp) : '';
  return (
    <div class="set-group" id="setSnapshot">
      <div class="lbl">Campaign snapshot</div>
      <div class="muted small" style="margin-bottom:6px">One note that sums up the whole campaign (the premise, where the story is, open threads, factions, key people, places, recent sessions, and the DM-only secrets in their own section), written by Claude from your notes. “Use my campaign as inspiration” then reads just that note.</div>
      {info ? (
        <div id="snapStatus" class="small"><strong>{text}</strong></div>
      ) : (
        <div id="snapStatus" class="small muted">No snapshot yet.</div>
      )}
      {info && info.cmp && info.cmp.worth && (
        <div id="snapHint" class="small" style="margin-top:4px;color:var(--accent-text,var(--accent))">Worth refreshing: {info.cmp.sessions && info.cmp.affected < 5 ? 'a session note has changed' : info.cmp.affected + ' of ' + info.cmp.total + ' notes have changed'} since it was made.</div>
      )}
      <div class="row-actions" style="margin-top:8px">
        <button class="btn btn-sm btn-primary" id="snapMake" disabled={!on} title={on ? '' : 'Switch on Claude first (Settings, Claude)'} onClick={() => set({ dialog: { kind: 'snapshot' } })}>{job ? (job.status === 'ready' ? 'Review the snapshot…' : job.status === 'failed' ? 'See what went wrong…' : 'Snapshot in progress…') : info ? 'Refresh the snapshot…' : 'Make a snapshot…'}</button>
        {info && <button class="btn btn-sm" id="snapOpen" onClick={() => { close(); goto(snapshotPath(), { newTab: true }); }}>Open the note</button>}
        {!on && <span class="small muted">Needs Claude switched on (Settings, Claude).</span>}
      </div>
    </div>
  );
}

/* the snapshot job, seen from a window: set it going (it then runs in the background), watch it, review the answer, save it */
export function SnapshotDialog() {
  const s = useApp();
  const job = s.job && s.job.kind === 'snapshot' ? s.job : null;
  const idx = getIndex();
  const old = snapshotInfo();
  const notes = useMemo(() => snapshotNotes(idx, S.campaign), []);
  const plan = useMemo(() => planSnapshot(notes), [notes]);
  const [secrets, setSecrets] = useState(old && old.snap && old.snap.meta ? old.snap.meta.secrets !== false : true);
  const [secs, setSecs] = useState(0);
  const [text, setText] = useState(job && job.draft ? job.draft.text : '');
  const campaign = S.campaign && S.campaign.name;
  const first = plan.batches.length ? snapshotPrompt({ campaign, text: plan.batches[0], secrets, part: 0, parts: plan.batches.length }) : '';
  const running = job && (job.status === 'running' || job.status === 'stopping');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs(Math.floor((Date.now() - job.started) / 1000)), 500);
    setSecs(Math.floor((Date.now() - job.started) / 1000));
    return () => clearInterval(t);
  }, [!!running]);
  const send = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (claudeBusy() || !notes.length) return;
    close();                                       // it carries on in the background; the top bar shows how it is getting on
    toast('Making the snapshot in the background. You can keep working: progress is at the top.');
    startSnapshotJob({ secrets });
  };
  const edit = v => { setText(v); if (job && job.draft) job.draft.text = v; };
  const save = () => {
    if (!job || !job.draft || !text.trim()) return;
    saveSnapshot(text, job.notes, job.secrets);
    clearJob();
    toast('Saved the snapshot as “' + SNAPSHOT_NOTE + '”. Push to write it to your vault.');
    close();
  };
  const title = job ? (job.status === 'ready' ? 'Review the campaign snapshot' : job.status === 'failed' ? 'The snapshot did not work' : 'Making the campaign snapshot') : old ? 'Refresh the campaign snapshot' : 'Make a campaign snapshot';
  return (
    <Modal title={title} onClose={close} wide focusFirst={false}>
      {running && (
        <div id="snapRunning">
          <div class="snap-progress"><span class="spinner" aria-hidden="true" /> <strong id="snapLabel">{job.label}</strong> <span class="muted" id="snapElapsed">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span></div>
          <p class="muted small">Claude is reading your {job.notes.length} notes{job.parts > 1 ? ', in ' + job.parts + ' parts that are then joined' : ''}. You can close this window and keep using DM Forge: the progress shows at the top, next to Layout, and the result waits there for you to review. Other Claude buttons say it is busy until it finishes.</p>
          <div class="modal-actions"><button class="btn btn-danger" id="snapStop" disabled={job.status === 'stopping'} onClick={discardJob}>{job.status === 'stopping' ? 'Stopping…' : 'Stop and throw it away'}</button><button class="btn btn-primary" id="snapHide" onClick={close}>Close, keep working</button></div>
        </div>
      )}
      {job && job.status === 'failed' && (
        <div id="snapFailed">
          <div class="claude-error small" id="snapError" role="alert">{job.error}</div>
          <div class="modal-actions"><button class="btn" id="snapDismiss" onClick={() => { clearJob(); close(); }}>Dismiss</button><button class="btn btn-primary" id="snapRetry" onClick={() => clearJob()}>Try again</button></div>
        </div>
      )}
      {job && job.status === 'ready' && job.draft && (
        <div id="snapResult">
          <label class="lbl" for="snapText">The snapshot <span class="muted small">(you can edit it before saving)</span></label>
          {!job.draft.ok && <div class="small" id="snapWarn" style="color:var(--accent-text,var(--accent));margin-bottom:4px">This answer has only {job.draft.found} of the usual headings, so it may be missing parts. Ask again, or edit it here.</div>}
          <textarea id="snapText" class="snap-text" value={text} spellcheck={false} onInput={e => edit(e.currentTarget.value)} />
          <div class="row-actions" style="margin-top:8px"><button type="button" class="btn btn-primary" id="snapSave" disabled={!text.trim()} onClick={save}>Save the snapshot</button><button type="button" class="btn" id="snapDiscard" onClick={() => { clearJob(); close(); }}>Throw it away</button><span class="small muted">{text.length.toLocaleString()} characters. Saved as a note in your campaign; it is a pending change until you push.</span></div>
          {old && <div class="small" style="margin-top:6px;color:var(--accent-text,var(--accent))">Saving replaces the current snapshot, including any edits you made to it.</div>}
        </div>
      )}
      {!job && (
        <form onSubmit={send}>
          <p class="muted small" style="margin-top:0">Claude reads your notes once and writes a summary of about 1,500 words. It runs in the background, so you can keep working. It is saved as a note in your campaign, which you can read and edit in Obsidian. Nothing is sent until you press Send.</p>
          <div class="snap-facts" id="snapFacts">
            <div><strong>{notes.length}</strong> notes will be read ({plan.chars.toLocaleString()} characters{plan.chars > 0 ? '; long notes are cut to their first 4,000' : ''}).</div>
            <div>{plan.batches.length <= 1 ? 'One request.' : 'Your campaign is big, so it is read in ' + plan.batches.length + ' parts and then joined: ' + (plan.batches.length + 1) + ' requests, a minute or two each.'}</div>
          </div>
          <label class="set-opt" style="margin-top:10px">
            <input type="checkbox" id="snapSecrets" checked={secrets} onChange={e => setSecrets(e.currentTarget.checked)} />
            <span><strong>Include the DM-only secrets</strong> <span class="muted small">in their own section at the end (“Secrets (DM only)”). Untick to leave out anything the players do not know yet. When the snapshot is used later, the secrets can be left out again.</span></span>
          </label>
          {old && <div class="small" style="margin-top:8px;color:var(--accent-text,var(--accent))">This replaces the current snapshot, including any edits you made to it.</div>}
          <details class="claude-sent" id="snapSent" style="margin-top:8px">
            <summary class="small muted">What will be sent to Claude {plan.batches.length > 1 ? '(the first of ' + plan.batches.length + ' requests, ' + first.length.toLocaleString() + ' characters)' : '(' + first.length.toLocaleString() + ' characters)'}</summary>
            <pre class="claude-report" id="snapPrompt" style="white-space:pre-wrap;max-height:300px;overflow:auto">{first}</pre>
          </details>
          {!notes.length && <div class="small muted" style="margin-top:8px">There are no notes to read yet.</div>}
          <div class="modal-actions" style="margin-top:10px">
            <button type="button" class="btn" onClick={close}>Close</button>
            <button type="submit" class="btn btn-primary" id="snapSend" disabled={!notes.length}>Send to Claude</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* the progress, in the top bar, next to Layout */
export function JobPill() {
  const s = useApp();
  const [, tick] = useReducer(x => x + 1, 0);
  const j = s.job;
  const running = j && (j.status === 'running' || j.status === 'stopping');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [!!running]);
  if (!j) return null;
  const secs = Math.floor((Date.now() - j.started) / 1000);
  const time = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  const cls = j.status === 'ready' ? ' ready' : j.status === 'failed' ? ' failed' : '';
  const co = j.kind === 'closeout', td = j.kind === 'tidy';
  const what = co ? 'Close out' : td ? 'Tidy notes' : 'Snapshot';
  const text = j.status === 'ready' ? (co ? 'Close-out ready: review' : td ? 'Tidy version ready: review' : 'Snapshot ready: review') : j.status === 'failed' ? what + ' failed: details' : what + ' · ' + j.label.replace(/…$/, '') + ' · ' + time;
  return (
    <button class={'btn btn-sm job-pill' + cls} id="jobPill" role="status" aria-live="polite" title={j.label} onClick={() => set({ dialog: co ? { kind: 'closeout', path: j.path } : td ? { kind: 'tidy', path: j.path } : { kind: 'snapshot' } })}>
      {running && <span class="spinner" aria-hidden="true" />}
      <span class="job-text">{text}</span>
    </button>
  );
}

/* the permanent snapshot button in the top bar: opens the make / refresh window; while a snapshot is being made the pill takes its place */
export function SnapshotButton() {
  const s = useApp();
  if (s.job) return null;
  const on = claudeOn();
  if (!on) return null;                                   // the snapshot needs Claude, so the button only shows when it is on
  const info = snapshotInfo();
  const worth = !!(info && info.cmp && info.cmp.worth);
  const status = info ? describeSnapshot(info.snap, info.cmp) : 'No snapshot yet';
  const title = !on ? 'Snapshot of the campaign. Switch on Claude first (Settings, Claude).' : (info ? status + (worth ? '. Worth refreshing.' : '') + ' Click to refresh it.' : 'No snapshot yet. Click to make one.');
  return (
    <button class={'tb-icon snap-btn' + (worth ? ' worth' : '')} id="snapBtn" title={title} aria-label={'Campaign snapshot: ' + status + (worth ? ', worth refreshing' : '')} onClick={() => set({ dialog: { kind: 'snapshot' } })}>
      <Icon name="wand" /><span class="sr">Snapshot</span>{worth && <span class="snap-dot" aria-hidden="true" />}
    </button>
  );
}
