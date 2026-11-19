import { useEffect, useState } from 'preact/hooks';
import { S, set, toast, getIndex, useApp } from './store.js';
import { setClaudeOn, claudeBusy } from './actions.js';
import { Modal, Markdown, copyText } from './common.jsx';
import { QUESTION_MARK } from '../core/claudeprompts.js';

const close = () => set({ dialog: null });

/* Settings, Claude: is Claude Code there, turn the buttons on or off, and go back to the previous version. */
export function ClaudePanel() {
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null);
  const [rolled, setRolled] = useState('');
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const runCheck = async () => {
    setChecking(true); setReport(null);
    try { setReport(await S.vault.claudeCheck()); } catch (e) { setReport({ ok: false, report: 'The check could not run: ' + e.message }); }
    setChecking(false);
  };
  useEffect(() => {
    if (!S.helper) return;
    let live = true;
    S.vault.claudeStatus().then(s => live && setStatus(s)).catch(e => live && setStatus({ available: false, reason: e.message }));
    S.vault.rollbackInfo().then(i => live && setInfo(i)).catch(() => {});
    return () => { live = false; };
  }, []);
  const on = !!S.claudeOn;
  const doRollback = () => set({ dialog: { kind: 'confirm', title: 'Go back to version ' + (info && info.previous) + '?', body: 'This puts the previous version of DM Forge back. Your notes and unpushed changes are not touched. You then restart DM Forge (close the Terminal window and start it again). The version you leave is kept in the .rolled-back folder.', confirmLabel: 'Roll back', danger: true, onConfirm: async () => { try { const r = await S.vault.rollback(); setRolled(r.restored); } catch (e) { toast(e.message, true); } } } });
  return (
    <div class="claude-panel" id="claudePanel">
      {!S.helper ? (
        <p style="margin:0">This needs the helper: start DM Forge with <strong>Start DM Forge.command</strong>. It runs Claude Code on this Mac for you, and the browser alone cannot.</p>
      ) : (
        <>
          <p class="muted small" style="margin-top:0">An early demo. DM Forge asks Claude Code (installed on this Mac, using your own sign-in) one question at a time. It is started with every tool switched off, in an empty folder, so it can only answer in text: it cannot read your vault, run anything or change files. <strong>Only text you can see is passed to it.</strong> <em>Expand with Claude</em> sends straight away: the result on the card plus a fixed request, shown afterwards under “What was sent”. <em>Ask Claude</em> shows the note and a box for your question, and sends when you press Send. Nothing is sent by itself.</p>
          <div class="claude-status" id="claudeStatus">
            {!status && <span class="muted">Looking for Claude Code…</span>}
            {status && status.available && <span><span class="pill pill-good">Found</span> {status.version || 'Claude Code'} <span class="muted small">{status.path}</span></span>}
            {status && !status.available && <span><span class="pill pill-bad">Not found</span> <span class="small">{status.reason} Install Claude Code, run <span class="mono">claude</span> once in Terminal and sign in, then reopen this.</span></span>}
          </div>
          <div class="row-actions" style="margin-top:10px"><button class="btn btn-sm" id="claudeCheck" disabled={checking} onClick={runCheck}>{checking ? 'Checking… (up to a minute)' : 'Check sign-in'}</button><span class="small muted">Shows which Claude Code and which sign-in the helper is using, and asks it a tiny test question.</span></div>
          {report && (
            <div id="claudeReportWrap" style="margin-top:8px">
              <pre class="claude-report" id="claudeReport">{report.report}</pre>
              <div class="row-actions"><span class={'pill ' + (report.ok ? 'pill-good' : 'pill-bad')}>{report.ok ? 'Working' : 'Not working'}</span><button class="btn btn-sm" id="claudeReportCopy" onClick={() => copyText(report.report, 'Copied the report')}>Copy report</button><span class="small muted">It never contains keys or anything you sent.</span></div>
            </div>
          )}
          <label class="small claude-toggle"><input id="claudeToggle" type="checkbox" style="width:auto" checked={on} disabled={!on && !(status && status.available)} onChange={e => { setClaudeOn(e.currentTarget.checked); bump(x => x + 1); }} /> <span>Show the Claude buttons (<strong>Expand with Claude</strong> on generated results, <strong>Ask Claude</strong> on a note)</span></label>
          <div class="muted small" style="margin:8px 0 0">Turn the box off and the buttons disappear: the app is then exactly as it was before this demo.</div>
          <hr class="claude-hr" />
          <label class="lbl">Did not go well? Go back to the previous version</label>
          {rolled ? (
            <div class="small" id="rollbackDone"><span class="pill pill-good">Done</span> Version {rolled} is back in place. <strong>Close the Terminal window and start DM Forge again</strong> to use it.</div>
          ) : info && info.previous ? (
            <div class="row-actions"><button class="btn btn-sm btn-danger" id="rollbackBtn" disabled={busy} onClick={doRollback}>Roll back to {info.previous}</button><span class="small muted">You are on {info.current}.</span></div>
          ) : (
            <div class="small muted">{info ? 'There is no earlier version kept (the .previous folder is empty).' : 'Checking…'}</div>
          )}
        </>
      )}
    </div>
  );
}

/* One question. Ask Claude on a note shows the text to send (editable) so the question can be typed. Expand with Claude
   (autoSend) sends at once: the text is the result on the card plus a fixed request, and stays one click away under
   "What was sent" (edit it there to ask again). */
export function AskClaude({ d }) {
  useApp();
  const others = claudeBusy();           // the snapshot is being made: Claude answers one thing at a time
  const idx = getIndex();
  const [text, setText] = useState(d.prompt);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setSecs(0);
    const t = setInterval(() => setSecs(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const unanswered = d.needs && text.trim().endsWith(d.needs);
  const send = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || !text.trim() || unanswered || claudeBusy()) return;
    setBusy(true); setError('');
    try { setAnswer(await S.vault.claudeAsk(text, d.system)); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  useEffect(() => { if (d.autoSend) send(); }, []);
  const box = (
    <>
      <textarea id="claudeText" class="claude-text" value={text} onInput={e => setText(e.currentTarget.value)} spellcheck={false} disabled={busy} />
      <div class="small muted" style="margin-top:4px">{text.length.toLocaleString()} characters. Nothing else from your vault is sent.{unanswered ? ' Type your question after “' + d.needs + '”.' : ''}</div>
    </>
  );
  const sendBtn = <button type="submit" class="btn btn-primary" id="claudeSend" disabled={busy || others || !text.trim() || !!unanswered}>{busy ? 'Waiting for Claude… ' + secs + 's' : answer || error ? 'Ask again' : 'Send to Claude'}</button>;
  return (
    <Modal title={d.title} onClose={close} wide>
      <form onSubmit={send}>
        {d.autoSend ? (
          <>
            {busy && <div class="claude-wait small" id="claudeWait" role="status">Waiting for Claude… {secs}s</div>}
            <details class="claude-sent" id="claudeSent">
              <summary class="small muted">What was sent to Claude (click to see it, or edit it and ask again)</summary>
              {box}
              <div class="row-actions" style="margin-top:8px">{sendBtn}</div>
            </details>
            <div class="modal-actions" style="margin-top:10px"><button type="button" class="btn" onClick={close}>Close</button></div>
          </>
        ) : (
          <>
            <label class="lbl" for="claudeText">What will be sent to Claude (you can edit it)</label>
            {box}
            <div class="modal-actions" style="margin-top:10px"><button type="button" class="btn" onClick={close}>Close</button>{sendBtn}</div>
          </>
        )}
      </form>
      {others && <div class="small" id="claudeBusy" style="margin-top:8px;color:var(--accent-text,var(--accent))">Claude is busy making the campaign snapshot. Press Send when it finishes (progress is at the top).</div>}
      {error && <div class="claude-error small" id="claudeError" role="alert">{error}</div>}
      {answer && (
        <div id="claudeAnswerWrap">
          <label class="lbl" style="margin-top:12px">Claude’s answer</label>
          <div class="claude-out" id="claudeAnswer"><Markdown body={answer} index={idx} rev={0} /></div>
          <div class="row-actions" style="margin-top:8px"><button class="btn btn-sm" id="claudeCopy" onClick={() => copyText(answer, 'Copied Claude’s answer')}>Copy answer</button></div>
        </div>
      )}
    </Modal>
  );
}
