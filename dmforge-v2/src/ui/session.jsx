import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, set, useApp, getIndex, toast } from './store.js';
import { createFromLog, currentSessionPath, setCurrentSession, setLogOpen, logLine, undoLogLine, sessionLogEntries, closeoutInfo, startCloseoutJob, applyCloseout, claudeOn, claudeBusy, clearJob, discardJob, plainCloseout, goto } from './actions.js';
import { LOG_TAGS, mentionMatches, mentionAt } from '../core/sessionlog.js';
import { THREAD_STATUSES, NPC_STATUSES } from '../core/closeout.js';
import { splitFrontmatter } from '../core/frontmatter.js';
import { Modal, Inline } from './common.jsx';
import { castOf } from '../core/cast.js';

/* ---------- the Log button (top bar) and its hotkey ---------- */
export function LogButton() {
  const s = useApp();
  useEffect(() => {
    // Option+L on a Mac (Alt+L elsewhere). The key code is used because Option+L types a character on a Mac.
    const k = e => {
      if (e.code === 'KeyL' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); setLogOpen(!S.logOpen); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <button class={'tb-icon log-btn' + (s.logOpen ? ' on' : '')} id="logBtn" aria-pressed={!!s.logOpen} title="Log what just happened in the session (Option+L)" onClick={() => setLogOpen(!s.logOpen)}><Icon name="pencil" /><span class="sr">Log</span></button>
  );
}

/* ---------- the quick log: a small box that floats, so combat and notes stay in view ---------- */
export function LogBox() {
  const s = useApp();
  if (!s.logOpen || !s.campaign) return null;
  return <LogPanel />;
}

function LogPanel() {
  const s = useApp();
  const idx = getIndex();
  const sessions = (idx && idx.byType.session) || [];
  const path = currentSessionPath();
  const entries = sessionLogEntries(path);
  const [text, setText] = useState('');
  const [tag, setTag] = useState('');
  const [pick, setPick] = useState(0);
  const [caret, setCaret] = useState(0);
  const ref = useRef();
  const armed = useRef(false);                 // you moved to a Create row with the arrow keys
  useEffect(() => { if (ref.current) ref.current.focus(); }, [path]);
  const names = useMemo(() => (idx ? idx.notes.filter(n => n.type !== 'session' && n.type !== 'root') : []), [idx]);
  const at = mentionAt(text, caret);
  const found = at ? mentionMatches(names, at.frag) : [];
  const fragT = at ? at.frag.trim() : '';
  const exactHit = fragT && names.some(n => n.name.toLowerCase() === fragT.toLowerCase());
  const mk = (type, label) => ({ create: type, label, name: fragT });
  const matches = at ? (fragT.length >= 2 && !exactHit ? [...found, mk('npc', 'NPC'), mk('location', 'place'), mk('item', 'item')] : found) : [];
  const menu = matches.length > 0;
  const insert = n => {
    const a = mentionAt(text, caret);
    if (!a) return;
    if (n.create) {
      const sessionNote = idx && idx.byPath.get(path);
      const first = sessionNote ? castOf(idx, sessionNote).places[0] : null;
      const made = createFromLog(n.create, n.name, first ? first.name : '');
      if (!made) return;
      toast('Made the ' + (n.create === 'location' ? 'place' : n.create === 'npc' ? 'NPC' : n.create) + ' “' + made.name + '”' + (n.create === 'npc' && first ? ' at ' + first.name : '') + '. Push changes to keep it.');
      n = made;
    }
    const link = '[[' + n.name + ']] ';
    const nt = text.slice(0, a.start) + link + text.slice(caret);
    setText(nt); setPick(0);
    const pos = a.start + link.length;
    setCaret(pos);
    setTimeout(() => { if (ref.current) { ref.current.focus(); ref.current.setSelectionRange(pos, pos); } }, 0);
  };
  const add = () => {
    if (!text.trim() || !path) return;
    if (logLine(text, tag)) { setText(''); setTag(''); setCaret(0); setPick(0); }
  };
  const key = e => {
    if (menu && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); armed.current = true; setPick((pick + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length); return; }
    const chosen = menu ? matches[Math.min(pick, matches.length - 1)] : null;
    // Enter on a "Create ..." row only creates when you moved to it (or clicked it): otherwise Enter just adds your line
    if (menu && (e.key === 'Enter' || e.key === 'Tab') && !(chosen.create && !armed.current)) { e.preventDefault(); insert(chosen); return; }
    if (e.key === 'Enter') { e.preventDefault(); add(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (menu) { setText(text.slice(0, at.start) + text.slice(caret)); } else setLogOpen(false); return; }
    if (e.altKey && /^Digit[1-7]$/.test(e.code)) { e.preventDefault(); const k = LOG_TAGS[Number(e.code.slice(5)) - 1].key; setTag(tag === k ? '' : k); }
  };
  const shown = entries.slice(-4).reverse();
  const session = idx && idx.byPath.get(path);
  return (
    <div class="logbox" id="logBox" role="dialog" aria-label="Session log">
      <div class="logbox-head">
        {sessions.length ? (
          <select id="sessionPick" aria-label="Session to add lines to" value={path} onChange={e => setCurrentSession(e.currentTarget.value)}>{sessions.map(n => <option key={n.path} value={n.path}>{n.name}</option>)}</select>
        ) : <strong>Session log</strong>}
        <button class="btn btn-ghost btn-sm" id="logClose" aria-label="Close the log" title="Close (Esc)" onClick={() => setLogOpen(false)}>×</button>
      </div>
      {!sessions.length ? (
        <div class="small" style="padding:6px 2px">There is no session note to log to yet. <button class="btn btn-sm btn-primary" id="logNewSession" onClick={() => set({ dialog: { kind: 'newSession' } })}>New session…</button></div>
      ) : (
        <>
          <div class="logbox-input">
            <input ref={ref} id="sessionLine" name="session-line" type="text" role="combobox" aria-autocomplete="list" aria-expanded={menu} autocomplete="off" spellcheck={true} placeholder="What just happened?   @ links a note" value={text}
              onInput={e => { armed.current = false; setText(e.currentTarget.value); setCaret(e.currentTarget.selectionStart || 0); setPick(0); }}
              onKeyDown={key} onKeyUp={e => { if (e.key.startsWith('Arrow') && !(menu && (e.key === 'ArrowUp' || e.key === 'ArrowDown'))) setCaret(e.currentTarget.selectionStart || 0); }} onClick={e => setCaret(e.currentTarget.selectionStart || 0)} />
            <button class="btn btn-sm btn-primary" id="logAdd" disabled={!text.trim()} onClick={add}>Add</button>
            {menu && (
              <div class="log-mentions" id="logMentions" role="listbox">
                {matches.map((n, i) => n.create
                  ? <div key={'new-' + n.create} role="option" aria-selected={i === pick} data-logcreate={n.create} class={'log-mention log-create' + (i === pick ? ' on' : '')} onMouseDown={e => { e.preventDefault(); insert(n); }}>Create “{n.name}” as {n.create === 'npc' || n.create === 'item' ? 'an' : 'a'} {n.label}</div>
                  : <div key={n.path} role="option" aria-selected={i === pick} class={'log-mention' + (i === pick ? ' on' : '')} onMouseDown={e => { e.preventDefault(); insert(n); }}>{n.name}<span class="muted small"> {n.type}</span></div>)}
              </div>
            )}
          </div>
          <div class="log-tags" role="group" aria-label="Tag this line">
            {LOG_TAGS.map((t, i) => <button key={t.key} type="button" class={'chip' + (tag === t.key ? ' on' : '')} data-log-tag={t.key} aria-pressed={tag === t.key} title={'Alt+' + (i + 1) + (t.task ? '. Becomes a task you can tick off.' : '')} onClick={() => setTag(tag === t.key ? '' : t.key)}>{t.label}</button>)}
          </div>
          <ul class="log-recent" id="logRecent" aria-label="Latest lines">
            {shown.map((e, i) => <li key={e.raw + i}><span class="muted">{e.time}</span> {e.tags.length ? <span class="log-tag">{e.tags[0]}</span> : null}<Inline text={e.text} /></li>)}
            {!shown.length && <li class="muted">Nothing logged in {session ? session.name : 'this session'} yet.</li>}
          </ul>
          <div class="logbox-foot small">
            <button class="btn btn-ghost btn-sm" id="logUndo" disabled={!entries.length} onClick={() => { if (undoLogLine()) toast('Removed the last line.'); }}>Undo last</button>
            <button class="btn btn-ghost btn-sm" id="logImprov" title="Roll an NPC on the spot and keep them" onClick={() => set({ dialog: { kind: 'improv', session: path } })}>Improvise an NPC</button>
            <button class="btn btn-ghost btn-sm" id="logOpenNote" onClick={() => goto(path, { newTab: false })}>Open the note</button>
            <span class="muted">Saved as changes: push when you finish.</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Close out the session ---------- */
export function CloseoutDialog({ path }) {
  const s = useApp();
  const close = () => set({ dialog: null });
  const info = closeoutInfo(path);
  const job = s.job && s.job.kind === 'closeout' && s.job.path === path ? s.job : null;
  const [secs, setSecs] = useState(0);
  const [plain, setPlain] = useState(null);
  const running = job && (job.status === 'running' || job.status === 'stopping');
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs(Math.floor((Date.now() - job.started) / 1000)), 500);
    setSecs(Math.floor((Date.now() - job.started) / 1000));
    return () => clearInterval(t);
  }, [!!running]);
  if (!info) return <Modal title="Close out the session" onClose={close}><p>That session note is not there any more.</p><div class="modal-actions"><button class="btn" onClick={close}>Close</button></div></Modal>;
  const { session, ctx, prompt } = info;
  const on = claudeOn();
  const logCount = ctx.log ? ctx.log.split('\n').length : 0;
  const send = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (claudeBusy()) return;
    close();
    toast('Reading ' + session.name + ' in the background. You can keep working: progress is at the top.');
    startCloseoutJob(path);
  };
  const tidy = () => setPlain(plainCloseout(splitFrontmatter(S.working.get(path)).body));
  const draft = plain || (job && job.status === 'ready' ? job.draft : null);
  const finish = () => { clearJob(); close(); };
  return (
    <Modal title={'Close out ' + session.name} onClose={close} wide focusFirst={false}>
      {running && (
        <div id="coRunning">
          <div class="snap-progress"><span class="spinner" aria-hidden="true" /> <strong>{job.label}</strong> <span class="muted">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span></div>
          <p class="muted small">Claude is reading the log and your notes. You can close this window and keep using DM Forge: the progress shows at the top, and the result waits there for you to review.</p>
          <div class="modal-actions"><button class="btn btn-danger" onClick={discardJob}>Stop and throw it away</button><button class="btn btn-primary" onClick={close}>Close, keep working</button></div>
        </div>
      )}
      {job && job.status === 'failed' && (
        <div id="coFailed">
          <div class="claude-error small" id="coError" role="alert">{job.error}</div>
          <div class="modal-actions"><button class="btn" onClick={finish}>Dismiss</button><button class="btn btn-primary" id="coRetry" onClick={() => clearJob()}>Try again</button></div>
        </div>
      )}
      {draft && <CloseoutReview key={plain ? 'plain' : 'claude'} draft={draft} path={path} session={session} hasPlayers={!!ctx.recap} onApplied={finish} onBack={plain ? () => setPlain(null) : null} onClose={plain ? close : finish} />}
      {!job && !plain && (
        <form onSubmit={send}>
          <p class="muted small" style="margin-top:0">This tidies up after the session. Claude reads your live log and notes, and <strong>proposes</strong> a recap for you, updates to the plot threads and NPCs that moved, and what to carry to next time. You tick what you want; nothing is changed until you press Apply.{ctx.recap ? ' It also compares your log with the players’ recap in the note.' : ''}</p>
          <div class="snap-facts" id="coFacts">
            <div><strong>{logCount}</strong> {logCount === 1 ? 'line' : 'lines'} in the session log{logCount ? '' : ' (nothing was logged, so Claude only has your notes)'}.</div>
            <div>{ctx.recap ? 'The players’ recap in the note will be compared with it.' : 'No players’ recap in the note, so there is nothing to compare.'}</div>
            <div>{ctx.threads.length} open {ctx.threads.length === 1 ? 'thread' : 'threads'} and {ctx.npcs.length} {ctx.npcs.length === 1 ? 'NPC' : 'NPCs'} may be updated.</div>
          </div>
          <details class="claude-sent" id="coSent" style="margin-top:8px">
            <summary class="small muted">What will be sent to Claude ({prompt.length.toLocaleString()} characters)</summary>
            <pre class="claude-report" id="coPrompt" style="white-space:pre-wrap;max-height:300px;overflow:auto">{prompt}</pre>
          </details>
          {claudeBusy() && <div class="small" style="margin-top:8px;color:var(--accent-text,var(--accent))">Claude is busy with something else. It takes one thing at a time.</div>}
          <div class="modal-actions" style="margin-top:10px">
            <button type="button" class="btn" onClick={close}>Close</button>
            <button type="button" class="btn" id="coTidy" title="No Claude: turn the log into a recap and the open promises and hooks into things to carry over" onClick={tidy}>Just tidy the log</button>
            <button type="submit" class="btn btn-primary" id="coSend" disabled={!on || claudeBusy()} title={on ? '' : 'Switch on Claude first (Settings, Claude)'}>Send to Claude</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function CloseoutReview({ draft, path, session, hasPlayers, onApplied, onBack, onClose }) {
  const [recapOn, setRecapOn] = useState(!!draft.recap);
  const [recap, setRecap] = useState(draft.recap);
  const [threads, setThreads] = useState(() => draft.threads.map(t => ({ ...t, on: !!t.path })));
  const [npcs, setNpcs] = useState(() => draft.npcs.map(t => ({ ...t, on: !!t.path })));
  const [next, setNext] = useState(() => draft.next.map(text => ({ text, on: true })));
  const [diffOn, setDiffOn] = useState(true);
  const upd = (list, setList, i, patch) => setList(list.map((x, a) => (a === i ? { ...x, ...patch } : x)));
  const chosen = {
    recap: recapOn ? recap : '',
    threads: threads.filter(t => t.on && t.path),
    npcs: npcs.filter(t => t.on && t.path),
    next: next.filter(x => x.on && x.text.trim()).map(x => x.text.trim()),
    check: hasPlayers && diffOn ? draft.differences : [],
  };
  const count = (chosen.recap.trim() ? 1 : 0) + chosen.threads.length + chosen.npcs.length + chosen.next.length + (chosen.check.length ? 1 : 0);
  const empty = !draft.recap && !draft.threads.length && !draft.npcs.length && !draft.next.length && !draft.differences.length;
  const apply = () => {
    const r = applyCloseout(path, chosen);
    toast('Updated ' + session.name + (r.notes ? ' and ' + r.notes + (r.notes === 1 ? ' other note' : ' other notes') : '') + '. Push changes to save. When you start the next session, “Import last session” brings the recap and what to carry over into its prep.');
    onApplied();
  };
  const updRow = (t, list, setList, i, statuses) => (
    <li key={t.name + i} class={'co-row' + (t.path ? '' : ' off')}>
      <label class="set-opt"><input type="checkbox" checked={t.on} disabled={!t.path} onChange={e => upd(list, setList, i, { on: e.currentTarget.checked })} aria-label={'Update ' + t.name} /> <strong>{t.name}</strong></label>
      {t.path ? (
        <>
          <select aria-label={t.name + ' status'} value={t.status} onChange={e => upd(list, setList, i, { status: e.currentTarget.value })}>{!t.status && <option value="">(no status change)</option>}{statuses.map(x => <option key={x} value={x}>{x}</option>)}</select>
          <input class="co-text" aria-label={t.name + ' note'} value={t.text} onInput={e => upd(list, setList, i, { text: e.currentTarget.value })} />
        </>
      ) : <span class="small muted">There is no note with that name, so it is skipped.</span>}
    </li>
  );
  return (
    <div id="coReview">
      {empty && <div class="small muted" id="coEmpty">There was nothing to propose. Log a few lines during the next session and try again.</div>}
      {(draft.recap || recap) && (
        <div class="co-sec" data-co="recap">
          <label class="set-opt"><input type="checkbox" id="coRecapOn" checked={recapOn} onChange={e => setRecapOn(e.currentTarget.checked)} /> <strong>Your recap</strong> <span class="muted small">(saved under “DM recap”; the players’ own Recap is not touched)</span></label>
          <textarea id="coRecap" class="co-recap" rows={Math.min(14, Math.max(4, recap.split('\n').length + 1))} value={recap} onInput={e => setRecap(e.currentTarget.value)} />
        </div>
      )}
      {threads.length > 0 && <div class="co-sec" data-co="threads"><strong>Plot threads</strong><ul class="co-list">{threads.map((t, i) => updRow(t, threads, setThreads, i, THREAD_STATUSES))}</ul></div>}
      {npcs.length > 0 && <div class="co-sec" data-co="npcs"><strong>NPCs</strong><ul class="co-list">{npcs.map((t, i) => updRow(t, npcs, setNpcs, i, NPC_STATUSES))}</ul></div>}
      {next.length > 0 && (
        <div class="co-sec" data-co="next">
          <strong>Carry to next time</strong> <span class="muted small">(saved as tasks under “Next time”)</span>
          <ul class="co-list">{next.map((x, i) => <li key={i} class="co-row"><label class="set-opt"><input type="checkbox" checked={x.on} onChange={e => upd(next, setNext, i, { on: e.currentTarget.checked })} aria-label={'Carry over: ' + x.text} /></label><input class="co-text" value={x.text} aria-label="Edit this line" onInput={e => upd(next, setNext, i, { text: e.currentTarget.value })} /></li>)}</ul>
        </div>
      )}
      {hasPlayers && draft.differences.length > 0 && (
        <div class="co-sec" data-co="diffs">
          <label class="set-opt"><input type="checkbox" id="coDiffOn" checked={diffOn} onChange={e => setDiffOn(e.currentTarget.checked)} /> <strong>Where the players’ recap differs from your log</strong> <span class="muted small">(saved under “Recap check”)</span></label>
          <ul class="co-list plain">{draft.differences.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
      <div class="modal-actions">
        {onBack && <button class="btn" id="coBack" onClick={onBack}>Back</button>}
        <button class="btn" id="coDiscard" onClick={onClose}>{onBack ? 'Close' : 'Throw it away'}</button>
        <button class="btn btn-primary" id="coApply" disabled={!count} onClick={apply}>{count ? 'Apply ' + count + (count === 1 ? ' change' : ' changes') : 'Nothing ticked'}</button>
      </div>
      <div class="small muted" style="margin-top:6px">Changes are pending until you push.</div>
    </div>
  );
}
