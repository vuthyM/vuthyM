import { useMemo, useState } from 'preact/hooks';
import { useApp, getIndex, toast } from './store.js';
import { forgettingNow, tickTask, addForgettingToSessionPrep, goto, wantsNewTab } from './actions.js';
import { sinceText } from '../core/forgetting.js';
import { Inline, plainInline } from './common.jsx';

const SHOW = 5;

function More({ n, open, set }) {
  return n > SHOW ? <button class="btn btn-ghost btn-sm" onClick={() => set(!open)}>{open ? 'Show fewer' : 'Show all ' + n}</button> : null;
}

/* the card on the Overview: what has gone quiet, and what is waiting */
export function ForgettingCard() {
  const s = useApp();
  const f = useMemo(() => forgettingNow(), [s.dataRev, s.settings.neglectAfter, s.campaign && s.campaign.path]);
  const [all, setAll] = useState({});
  if (!f || !f.sessionCount) return null;
  const idx = getIndex();
  const latest = (idx.byType.session || [])[0];
  const lim = (list, k) => (all[k] ? list : list.slice(0, SHOW));
  const tog = k => v => setAll({ ...all, [k]: v });
  const open = (path, e) => goto(path, { newTab: wantsNewTab(e) });
  const waiting = [...f.carry.map(c => ({ ...c, label: c.kind === 'must' ? 'must happen' : 'carried over' })), ...f.promises.map(p => ({ ...p, label: p.tag || 'promise' }))];
  const tick = it => { const ok = [tickTask(it.path, it.raw), ...(it.also || []).map(a => tickTask(a.path, a.raw))].some(Boolean); if (ok) toast('Ticked off. Push changes to save it.'); };
  return (
    <div class="card fg-card" id="forgetCard" style="margin-bottom:16px">
      <h3 style="margin-bottom:4px">What am I forgetting?{f.total > 0 && <span class="badge" style="margin-left:8px">{f.total}</span>}</h3>
      {f.total === 0 ? (
        <p class="muted small" id="forgetNone" style="margin:4px 0 0">Nothing is slipping: every open thread and living NPC who has appeared before turned up in the last {f.after} sessions, and nothing is waiting to be carried over.</p>
      ) : (
        <div class="fg-cols">
          {waiting.length > 0 && (
            <div data-fg="waiting">
              <div class="lbl">Waiting for you</div>
              <ul class="fg-list">{lim(waiting, 'waiting').map((it, i) => (
                <li key={it.raw + i}><label class="set-opt"><input type="checkbox" checked={false} aria-label={'Tick off: ' + plainInline(it.text)} onChange={() => tick(it)} /> <span><Inline text={it.text} /> <span class="muted small">{it.label}, <a href="#" onClick={e => { e.preventDefault(); open(it.path, e); }}>{it.session}</a></span></span></label></li>
              ))}</ul>
              <More n={waiting.length} open={all.waiting} set={tog('waiting')} />
            </div>
          )}
          {f.threads.length > 0 && (
            <div data-fg="threads">
              <div class="lbl">Threads going quiet</div>
              <ul class="fg-list">{lim(f.threads, 'threads').map(t => (
                <li key={t.path}><a href="#" onClick={e => { e.preventDefault(); open(t.path, e); }}>{t.name}</a> <span class="muted small">{sinceText(t)}</span>{t.next && <div class="small muted">Next: {t.next}</div>}</li>
              ))}</ul>
              <More n={f.threads.length} open={all.threads} set={tog('threads')} />
            </div>
          )}
          {(f.secrets || []).length > 0 && (
            <div data-fg="secrets">
              <div class="lbl">Secrets not yet revealed</div>
              <ul class="fg-list">{lim(f.secrets, 'secrets').map((x, i) => <li key={i}><Inline text={x.text} /> <span class="muted small">{x.clues} of 3 clues, <a href="#" onClick={e => { e.preventDefault(); open(x.path, e); }}>{x.from}</a></span></li>)}</ul>
              <More n={f.secrets.length} open={all.secrets} set={tog('secrets')} />
            </div>
          )}
          {(f.quiet || []).length > 0 && (
            <div data-fg="quiet">
              <div class="lbl">No spotlight lately</div>
              <ul class="fg-list">{f.quiet.map(q => <li key={q.path}><a href="#" onClick={e => { e.preventDefault(); open(q.path, e); }}>{q.name}</a> <span class="muted small">no moment logged in {q.sessions} sessions</span></li>)}</ul>
            </div>
          )}
          {f.npcs.length > 0 && (
            <div data-fg="npcs">
              <div class="lbl">NPCs not seen lately</div>
              <ul class="fg-list">{lim(f.npcs, 'npcs').map(n => (
                <li key={n.path}><a href="#" onClick={e => { e.preventDefault(); open(n.path, e); }}>{n.name}</a> <span class="muted small">{sinceText(n)}{n.status && n.status.toLowerCase() !== 'alive' ? ', ' + n.status.toLowerCase() : ''}</span></li>
              ))}</ul>
              <More n={f.npcs.length} open={all.npcs} set={tog('npcs')} />
            </div>
          )}
        </div>
      )}
      <div class="row-actions" style="margin-top:10px">
        {f.total > 0 && latest && <button class="btn btn-sm" id="forgetToPrep" title={'Adds this as a checklist at the end of the Prep of ' + latest.name} onClick={() => { if (addForgettingToSessionPrep(latest.path)) toast('Added the checklist to the Prep of ' + latest.name + '. Push changes to save it.'); }}>Add to prep</button>}
        <span class="muted small">A note counts as mentioned when a session note links to it or names it. Change “neglected after {f.after} sessions” in Settings.</span>
      </div>
    </div>
  );
}
