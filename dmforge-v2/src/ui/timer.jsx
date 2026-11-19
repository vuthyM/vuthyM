import { useEffect, useReducer, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, useApp, getIndex, toast } from './store.js';
import { timerElapsed, timerToggle, timerReset, timerEvery, timerOpen, timerSet, sceneList, addSceneNow, finishSceneNow, currentSessionPath } from './actions.js';
import { fmtClock, pace, currentScene } from '../core/scenes.js';

/* the session clock chip in the top bar, with a break reminder, and a popover for scenes and pacing */
export function TimerChip() {
  const s = useApp();
  const [, tick] = useReducer(x => x + 1, 0);
  const t = s.timer;
  useEffect(() => {
    if (!t.run) return;
    const i = setInterval(() => {
      tick();
      const cur = S.timer;
      if (cur.run && cur.every && timerElapsed(cur) >= cur.nextBreak * 60000) {
        timerSet({ nextBreak: cur.nextBreak + cur.every, due: true });
        toast('You have been playing for ' + fmtClock(timerElapsed(cur)) + '. Time for a break?');
      }
    }, 1000);
    return () => clearInterval(i);
  }, [t.run]);
  const el = timerElapsed(t);
  const label = el > 0 || t.run ? fmtClock(el) : 'Timer';
  return (
    <button class={'tb-icon timer-chip' + (t.run ? ' running' : '') + (t.due ? ' due' : '')} id="timerChip" aria-expanded={!!t.open} title={t.due ? 'Time for a break?' : 'The session timer: scenes and pacing'} onClick={() => timerOpen(!t.open)}>
      <Icon name="timer" /><span id="timerClock" class={el > 0 || t.run ? 'tb-time' : 'sr'}>{label}</span>
    </button>
  );
}

export function TimerBox() {
  const s = useApp();
  const [, tick] = useReducer(x => x + 1, 0);
  const [name, setName] = useState('');
  const [mins, setMins] = useState(15);
  const t = s.timer;
  useEffect(() => { if (!t.open || !t.run) return; const i = setInterval(tick, 1000); return () => clearInterval(i); }, [t.open, t.run]);
  useEffect(() => {
    if (!t.open) return;
    const k = e => { if (e.key === 'Escape') timerOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [t.open]);
  if (!t.open) return null;
  const idx = getIndex();
  const path = currentSessionPath();
  const session = path && idx ? idx.byPath.get(path) : null;
  const scenes = sceneList();
  const el = timerElapsed(t);
  const sceneMin = Math.max(0, Math.round((el - t.sceneAcc) / 60000));
  const p = pace(scenes, el / 60000, sceneMin);
  const cur = currentScene(scenes);
  const add = e => { e.preventDefault(); if (addSceneNow(name, mins)) setName(''); };
  const paceText = !scenes.length ? '' : p.delta > 2 ? 'about ' + p.delta + ' min behind' : p.delta < -2 ? 'about ' + Math.abs(p.delta) + ' min ahead' : 'on pace';
  return (
    <div class="timerbox" id="timerBox" role="dialog" aria-label="Session timer">
      <div class="logbox-head"><strong>Session timer</strong><button class="btn btn-ghost btn-sm" id="timerClose" aria-label="Close the timer" onClick={() => timerOpen(false)}>×</button></div>
      <div class="timer-clock" id="timerBig" aria-live="off">{fmtClock(el)}</div>
      <div class="row-actions" style="justify-content:center">
        <button class="btn btn-primary" id="timerToggle" onClick={timerToggle}>{t.run ? 'Pause' : el > 0 ? 'Resume' : 'Start'}</button>
        <button class="btn" id="timerReset" disabled={!el} onClick={() => { timerReset(); toast('The timer is reset.'); }}>Reset</button>
      </div>
      <label class="small" style="display:block;margin-top:8px">Remind me to take a break every <select id="timerEvery" value={String(t.every)} onChange={e => timerEvery(+e.currentTarget.value)} style="width:auto;display:inline-block">{[[0, 'never'], [30, '30 min'], [45, '45 min'], [60, '60 min'], [90, '90 min']].map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}</select></label>
      <div class="timer-scenes" id="timerScenes">
        <div class="lbl">Scenes{session ? ' in ' + session.name : ''}</div>
        {scenes.length ? (
          <>
            <ul class="scene-list">{scenes.map((sc, i) => <li key={i} class={sc.done ? 'done' : sc === cur ? 'now' : ''}><span aria-hidden="true">{sc.done ? '✓' : sc === cur ? '▶' : '·'}</span> {sc.name}{sc.est ? <span class="muted small"> ({sc.est} min{sc.took != null ? ', took ' + sc.took : ''})</span> : sc.took != null ? <span class="muted small"> (took {sc.took} min)</span> : null}{sc === cur && t.run ? <span class="muted small"> · {sceneMin} min so far</span> : null}</li>)}</ul>
            <div class="small" id="timerPace">{p.done} of {p.total} scenes done · planned {p.planned} min · {p.left} min left{paceText ? ' · ' + paceText : ''}</div>
            <button class="btn btn-sm" id="sceneDone" disabled={!cur} onClick={() => { if (finishSceneNow()) toast('Scene done. Push changes to save it in the note.'); }}>{cur ? 'Done: ' + cur.name : 'All scenes done'}</button>
          </>
        ) : <div class="small muted" id="timerNoScenes">{session ? 'No scenes planned yet. Add one below; they are the tasks under “## Scenes” in the session note.' : 'Make a session note to plan scenes in.'}</div>}
        {session && (
          <form class="scene-add" onSubmit={add}>
            <input id="sceneName" name="scene-text" type="text" placeholder="Add a scene" aria-label="Scene to add" value={name} onInput={e => setName(e.currentTarget.value)} />
            <input id="sceneMins" name="scene-minutes" type="number" min="0" max="600" aria-label="Minutes planned" value={mins} onInput={e => setMins(e.currentTarget.value)} style="width:64px" />
            <button class="btn btn-sm" id="sceneAdd" type="submit" disabled={!name.trim()}>Add</button>
          </form>
        )}
      </div>
    </div>
  );
}
