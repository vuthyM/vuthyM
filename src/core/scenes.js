/* The session timer's scenes: a list of tasks under "## Scenes" in the session note, with a time estimate in brackets:
     - [ ] The ambush at the ford (20 min)
   Doing a scene ticks it and notes how long it took. */
import { getSection } from './closeout.js';

export const SCENES_HEADING = 'Scenes';
const LINE = /^(\s*[-*]\s+)\[( |x|X)\]\s+(.*?)\s*$/;
const EST = /\((\d{1,3})\s*(?:min|mins|minutes|m)\)/i;
const TOOK = /\s*[—–-]\s*took\s+(\d{1,3})\s*min\b/i;

export function parseScenes(body) {
  const out = [];
  for (const raw of getSection(body, SCENES_HEADING).split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    const m = LINE.exec(line);
    if (!m || !m[3]) continue;
    const text = m[3];
    const est = EST.exec(text);
    const took = TOOK.exec(text);
    const name = text.replace(TOOK, '').replace(EST, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    out.push({ raw: line, name, est: est ? +est[1] : 0, took: took ? +took[1] : null, done: m[2] !== ' ' });
  }
  return out;
}

/* the scene being played: the first one not ticked */
export const currentScene = scenes => scenes.find(s => !s.done) || null;

export function pace(scenes, elapsedMin, sceneMin = 0) {
  const planned = scenes.reduce((a, s) => a + s.est, 0);
  const done = scenes.filter(s => s.done);
  const doneEst = done.reduce((a, s) => a + s.est, 0);
  const doneTook = done.reduce((a, s) => a + (s.took ?? s.est), 0);
  const cur = currentScene(scenes);
  const over = cur && cur.est ? Math.max(0, sceneMin - cur.est) : 0;
  const delta = doneTook - doneEst + over;                       // minutes behind (positive) or ahead (negative)
  const left = scenes.filter(s => !s.done).reduce((a, s) => a + s.est, 0);
  return { planned, done: done.length, total: scenes.length, delta: Math.round(delta), left, elapsed: Math.round(elapsedMin) };
}

export function sceneLine(name, mins) { return '- [ ] ' + String(name).replace(/\s+/g, ' ').trim() + (mins ? ' (' + mins + ' min)' : ''); }

/* ticks the first unticked scene and notes how long it took; returns the new line and the old, or null */
export function finishScene(body, tookMin) {
  const sc = currentScene(parseScenes(body));
  if (!sc) return null;
  const next = sc.raw.replace(/\[ \]/, '[x]') + (tookMin > 0 ? ' — took ' + tookMin + ' min' : '');
  return { from: sc.raw, to: next, scene: sc };
}

export const fmtClock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
