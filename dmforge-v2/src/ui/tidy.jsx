import { useEffect, useMemo, useState } from 'preact/hooks';
import { S, set, useApp, toast } from './store.js';
import { Modal, copyText } from './common.jsx';
import { claudeOn, claudeBusy, discardJob, clearJob, tidyInfo, tidyPreview, plainTidyDraft, startTidyJob, applyTidyDraft, restoreOriginalNote, originalOf, isTidied, tidyCheck, tidyLeaks } from './actions.js';

const close = () => set({ dialog: null });
const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
const KIND_NOTE = { log: 'the log lines you typed', notes: 'notes you typed', other: 'a section of yours' };

/* Tidy notes: what will be tidied (you choose), then Claude, or no Claude, then a side-by-side review */
export function TidyDialog({ path }) {
  const s = useApp();
  const info = tidyInfo(path);
  const job = s.job && s.job.kind === 'tidy' && s.job.path === path ? s.job : null;
  const [ids, setIds] = useState(() => (info ? info.plan.segments.filter(x => x.include).map(x => x.id) : []));
  const [plain, setPlain] = useState(null);
  const [secs, setSecs] = useState(0);
  const running = job && (job.status === 'running' || job.status === 'stopping');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs(Math.floor((Date.now() - job.started) / 1000)), 500);
    setSecs(Math.floor((Date.now() - job.started) / 1000));
    return () => clearInterval(t);
  }, [!!running]);
  const preview = useMemo(() => (info && ids.length ? tidyPreview(path, ids) : null), [ids.join('|'), s.dataRev, !!info]);
  if (!info) return <Modal title="Tidy notes" onClose={close}><p>That session note is not there any more.</p><div class="modal-actions"><button class="btn" onClick={close}>Close</button></div></Modal>;
  const { note, plan } = info;
  const on = claudeOn();
  const lines = preview ? preview.mat.count : 0;
  const toggle = id => setIds(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const send = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (claudeBusy() || !ids.length) return;
    close();
    toast('Tidying ' + note.name + ' in the background. You can keep working: progress is at the top.');
    startTidyJob(path, ids);
  };
  const draft = plain || (job && job.status === 'ready' ? job.draft : null);
  const finish = () => { clearJob(); close(); };
  return (
    <Modal title={'Tidy ' + note.name} onClose={close} wide focusFirst={false}>
      {running && (
        <div id="tdRunning">
          <div class="snap-progress"><span class="spinner" aria-hidden="true" /> <strong>{job.label}</strong> <span class="muted">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span></div>
          <p class="muted small">Claude is reading your notes. You can close this window and keep using DM Forge (and keep logging): the progress shows at the top, and the result waits there for you to review. Anything you type meanwhile is kept.</p>
          <div class="modal-actions"><button class="btn btn-danger" onClick={discardJob}>Stop and throw it away</button><button class="btn btn-primary" onClick={close}>Close, keep working</button></div>
        </div>
      )}
      {job && job.status === 'failed' && (
        <div id="tdFailed">
          <div class="claude-error small" id="tdError" role="alert">{job.error}</div>
          <div class="modal-actions"><button class="btn" onClick={finish}>Dismiss</button><button class="btn btn-primary" id="tdRetry" onClick={() => clearJob()}>Try again</button></div>
        </div>
      )}
      {draft && <TidyReview key={plain ? 'plain' : 'claude'} draft={draft} path={path} name={note.name} onApplied={finish} onBack={plain ? () => setPlain(null) : null} onClose={plain ? close : finish} />}
      {!job && !plain && (
        <form onSubmit={send}>
          <p class="muted small" style="margin-top:0">Your notes from the table, organised: grouped by scene, in order, with the names linked. Your wording is kept where it is clear, and nothing is added. <strong>The notes exactly as you typed them are kept</strong> at the bottom of the note (hidden when you read it in Obsidian), and <em>Put back my original</em> restores them.</p>
          {plan.tidied && <p class="small" id="tdAgain" style="color:var(--accent-text,var(--accent))">This note was tidied on {plan.originalDate || 'an earlier day'}. Tidying again starts from your original notes plus anything typed since, and replaces the tidy version.</p>}
          <div class="snap-facts" id="tdSections">
            {plan.segments.length === 0 && <div class="muted">There is nothing here to tidy: no log lines and no sections of notes. Log a few lines during the session and try again.</div>}
            {plan.segments.map(sg => (
              <label key={sg.id} class="set-opt td-row" data-td={sg.id} style="display:flex;gap:8px;align-items:baseline">
                <input type="checkbox" style="width:auto" disabled={sg.locked} checked={ids.includes(sg.id)} onChange={() => toggle(sg.id)} aria-label={'Tidy ' + sg.heading} />
                <span><strong>{sg.heading}</strong> <span class="muted small">{sg.locked ? (sg.kind === 'keep' ? 'left exactly as it is (prep, or the players’ recap)' : 'empty') : sg.lines + (sg.lines === 1 ? ' line' : ' lines') + ' (' + KIND_NOTE[sg.kind] + ')'}</span></span>
              </label>
            ))}
          </div>
          <p class="small muted" style="margin:8px 0 0">Combat summaries, your DM recap and anything DM Forge wrote are never touched. Open promises and hooks stay as tasks, so <em>What am I forgetting?</em> keeps finding them.</p>
          {preview && (
            <details class="claude-sent" id="tdSent" style="margin-top:8px">
              <summary class="small muted">What will be sent to Claude ({preview.prompt.length.toLocaleString()} characters{preview.chunks > 1 ? ', in ' + preview.chunks + ' parts' : ''})</summary>
              <pre class="claude-report" id="tdPrompt" style="white-space:pre-wrap;max-height:300px;overflow:auto">{preview.prompt}</pre>
            </details>
          )}
          {claudeBusy() && <div class="small" style="margin-top:8px;color:var(--accent-text,var(--accent))">Claude is busy with something else. It takes one thing at a time.</div>}
          <div class="modal-actions" style="margin-top:10px">
            <button type="button" class="btn" onClick={close}>Close</button>
            <button type="button" class="btn" id="tdPlain" disabled={!ids.length} title="No Claude: fix the formatting and put the log in order. Nothing is reworded." onClick={() => setPlain(plainTidyDraft(path, ids))}>Tidy without Claude</button>
            <button type="submit" class="btn btn-primary" id="tdSend" disabled={!on || claudeBusy() || !ids.length || !lines} title={on ? '' : 'Switch on Claude first (Settings, Claude)'}>Send to Claude</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const taskLinesOf = material => material.split('\n').filter(l => /^\s*[-*+]\s+\[[ xX]\]\s/.test(l)).join('\n');

function TidyReview({ draft, path, name, onApplied, onBack, onClose }) {
  const [tidy, setTidy] = useState(draft.tidy);
  const [accept, setAccept] = useState(false);
  const tasks = useMemo(() => taskLinesOf(draft.material), [draft.material]);
  const check = useMemo(() => tidyCheck(draft.material, tidy, tasks), [tidy]);
  const leaks = useMemo(() => tidyLeaks(draft.material, tidy), [tidy]);
  const m = check.missing;
  const lost = [...m.numbers, ...m.names.map(cap), ...m.links.map(cap), ...m.entities.map(cap)];
  const addedList = [...check.added.numbers, ...check.added.names.map(cap)];
  const blocked = (check.hard > 0 && !accept) || !tidy.trim();
  const apply = () => {
    if (!applyTidyDraft(path, { ...draft, tidy })) return;
    toast('Tidied ' + name + '. Your notes as typed are kept at the bottom of the note. Push changes to save.');
    onApplied();
  };
  return (
    <div id="tdReview">
      <p class="small" style="margin-top:0">{draft.plain ? 'This is the plain version: the formatting is fixed and the log is in order, with nothing reworded.' : 'Claude’s tidy version. Read it against your notes, and edit anything you like.'} Nothing is changed until you apply it, and your notes as typed are kept.</p>
      <div class="td-cols">
        <div><label class="lbl" for="tdOriginal">As you typed it</label><textarea id="tdOriginal" readonly rows="16" value={draft.material} /></div>
        <div><label class="lbl" for="tdTidy">Tidy version (you can edit it)</label><textarea id="tdTidy" rows="16" value={tidy} onInput={e => setTidy(e.currentTarget.value)} /></div>
      </div>
      <div class="td-check" id="tdCheck" role="status">
        {leaks.length > 0 && <div class="td-bad" id="tdLeaks"><strong>A secret may be where players could see it.</strong> These lines from your notes look secret, but their details are outside the “Secrets (DM only)” part of the tidy version: {leaks.map((l, i) => <div key={i} class="small">“{l}”</div>)}</div>}
        {lost.length > 0 && (
          <div class="td-warn" id="tdMissing"><strong>Not in the tidy version:</strong> {lost.join(', ')}.
            <label class="set-opt" style="margin-top:4px"><input id="tdAccept" type="checkbox" style="width:auto" checked={accept} onChange={e => setAccept(e.currentTarget.checked)} /> I have looked: leave {lost.length === 1 ? 'it' : 'them'} out</label>
          </div>
        )}
        {addedList.length > 0 && <div class="td-note" id="tdAdded"><strong>In the tidy version but not in your notes (check these):</strong> {addedList.join(', ')}.</div>}
        {!leaks.length && !lost.length && !addedList.length && <div class="td-good" id="tdClean">Every name, number and link from your notes is in the tidy version, and nothing new was added.</div>}
      </div>
      <div class="modal-actions">
        {onBack && <button class="btn" id="tdBack" onClick={onBack}>Back</button>}
        <button class="btn" id="tdDiscard" onClick={onClose}>{onBack ? 'Close' : 'Throw it away'}</button>
        <button class="btn btn-primary" id="tdApply" disabled={blocked} title={check.hard > 0 && !accept ? 'Tick “I have looked” above, or put the missing details back' : ''} onClick={apply}>Apply tidy version</button>
      </div>
      <div class="small muted" style="margin-top:6px">Changes are pending until you push.</div>
    </div>
  );
}

/* the notes as typed, to read or copy, and the way back */
export function OriginalDialog({ path }) {
  const o = originalOf(path);
  if (!o) return <Modal title="Your original notes" onClose={close}><p>This note has no original kept.</p><div class="modal-actions"><button class="btn" onClick={close}>Close</button></div></Modal>;
  const ask = () => set({ dialog: { kind: 'confirm', danger: false, title: 'Put back your original notes?', confirmLabel: 'Put them back',
    body: 'The tidy version is removed and your notes go back as you typed them. Promises you ticked since stay ticked. You can tidy again whenever you like.', onConfirm: () => { if (restoreOriginalNote(path)) toast('Your original notes are back. Push changes to save.'); } } });
  return (
    <Modal title="Your original notes, as typed" onClose={close} wide focusFirst={false}>
      <p class="muted small" style="margin-top:0">Tidied {o.date || 'earlier'}. This is exactly what you typed; the note itself shows the tidy version.</p>
      <textarea id="tdOrigText" readonly rows="18" style="width:100%;font-family:var(--font-mono);font-size:13px" value={o.raw} />
      <div class="modal-actions">
        <button class="btn" onClick={close}>Close</button>
        <button class="btn" id="tdCopyOrig" onClick={() => copyText(o.raw, 'Copied your original notes')}>Copy</button>
        <button class="btn btn-primary" id="tdPutBack" onClick={ask}>Put back my original…</button>
      </div>
    </Modal>
  );
}

/* a line under the title of a tidied session */
export function TidyStrip({ path }) {
  useApp();
  if (!isTidied(path)) return null;
  const o = originalOf(path);
  return (
    <div class="tidy-strip small" id="tidyStrip">
      <span>Tidied{o && o.date ? ' on ' + o.date : ''}. Your notes as typed are kept.</span>
      <button class="btn btn-sm btn-ghost" id="tidyShowOrig" onClick={() => set({ dialog: { kind: 'tidyOriginal', path } })}>Show my original</button>
      <button class="btn btn-sm btn-ghost" id="tidyAgain" onClick={() => set({ dialog: { kind: 'tidy', path } })}>Tidy again…</button>
    </div>
  );
}
