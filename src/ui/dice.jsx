import { useEffect, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { S, useApp, toast } from './store.js';
import { rollNow, setDiceOpen, setDiceMode, clearDice, logLine } from './actions.js';

const DIE = [4, 6, 8, 10, 12, 20, 100];

/* the Dice button in the top bar (Option+D on a Mac, Alt+D elsewhere) */
export function DiceButton() {
  const s = useApp();
  useEffect(() => {
    const k = e => { if (e.code === 'KeyD' && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); setDiceOpen(!S.diceOpen); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return <button class={'tb-icon dice-btn' + (s.diceOpen ? ' on' : '')} id="diceBtn" aria-pressed={!!s.diceOpen} title="Roll dice (Option+D)" onClick={() => setDiceOpen(!s.diceOpen)}><Icon name="dice" /><span class="sr">Dice</span></button>;
}

export function DiceBox() {
  const s = useApp();
  if (!s.diceOpen) return null;
  return <DicePanel />;
}

const signed = n => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '');

function DicePanel() {
  const s = useApp();
  const [expr, setExpr] = useState('');
  const [count, setCount] = useState(1);
  const [mod, setMod] = useState(0);
  const [bad, setBad] = useState(false);
  const hist = s.diceHist || [];
  const last = hist[0];
  const quick = sides => {
    const n = Math.max(1, Math.min(20, Math.floor(+count) || 1));
    const m = Math.floor(+mod) || 0;
    rollNow((n === 1 ? '' : n) + 'd' + sides + (m > 0 ? '+' + m : m < 0 ? '' + m : ''));
  };
  const go = e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!expr.trim()) return;
    const r = rollNow(expr);
    setBad(!r);
  };
  const log = h => { if (logLine('Rolled ' + h.expr + ': ' + h.total + ' (' + h.detail + ')', '')) toast('Added to the session log.'); else toast('There is no session note to log to yet.', true); };
  return (
    <div class="dicebox" id="diceBox" role="dialog" aria-label="Dice">
      <div class="logbox-head"><strong>Dice</strong><button class="btn btn-ghost btn-sm" id="diceClose" aria-label="Close the dice" title="Close (Esc)" onClick={() => setDiceOpen(false)}>×</button></div>
      <div class="dice-quick" role="group" aria-label="Roll one die">
        {DIE.map(d => <button key={d} class="btn btn-sm" data-die={d} onClick={() => quick(d)}>d{d}</button>)}
      </div>
      <div class="dice-opts">
        <label class="small">How many <input id="diceCount" type="number" min="1" max="20" value={count} onInput={e => setCount(e.currentTarget.value)} style="width:60px" /></label>
        <label class="small">Modifier <input id="diceMod" type="number" min="-50" max="50" value={mod} onInput={e => setMod(e.currentTarget.value)} style="width:64px" /></label>
      </div>
      <div class="dice-mode" role="radiogroup" aria-label="Advantage or disadvantage (a d20 only)">
        {[['normal', 'Normal'], ['adv', 'Advantage'], ['dis', 'Disadvantage']].map(([v, l]) => <button key={v} role="radio" aria-checked={s.diceMode === v} class={'chip-btn' + (s.diceMode === v ? ' on' : '')} data-mode={v} onClick={() => setDiceMode(v)}>{l}</button>)}
      </div>
      <form class="dice-expr" onSubmit={go}>
        <input id="diceExpr" name="dice-expression" type="text" placeholder="or type: 2d6+3, 4d6kh3, d20+5" aria-label="Dice expression" value={expr} aria-invalid={bad} onInput={e => { setExpr(e.currentTarget.value); setBad(false); }} />
        <button class="btn btn-primary btn-sm" id="diceRoll" type="submit" disabled={!expr.trim()}>Roll</button>
      </form>
      {bad && <div class="small" id="diceBad" role="alert" style="color:var(--danger)">That is not a dice roll. Try 2d6+3 or d20.</div>}
      {last && (
        <div class={'dice-result' + (last.crit ? ' crit' : last.fumble ? ' fumble' : '')} id="diceResult" aria-live="polite">
          <div class="dice-total" id="diceTotal">{last.total}</div>
          <div class="small"><strong>{last.expr}{last.mode !== 'normal' ? (last.mode === 'adv' ? ' with advantage' : ' with disadvantage') : ''}</strong>{last.crit && ' · Natural 20!'}{last.fumble && ' · Natural 1'}<br /><span class="muted">{last.detail.startsWith(last.expr + ' ') ? last.detail.slice(last.expr.length + 1) : last.detail}</span></div>
        </div>
      )}
      {hist.length > 1 && (
        <ul class="dice-hist" id="diceHist" aria-label="Earlier rolls">
          {hist.slice(1, 11).map(h => <li key={h.id}><strong>{h.total}</strong> <span class="muted small">{h.expr}{h.mode !== 'normal' ? ' (' + (h.mode === 'adv' ? 'adv' : 'dis') + ')' : ''}</span> <button class="btn btn-ghost btn-sm" aria-label={'Add the roll ' + h.expr + ' = ' + h.total + ' to the session log'} onClick={() => log(h)}>Log</button></li>)}
        </ul>
      )}
      <div class="logbox-foot small">
        {last && <button class="btn btn-ghost btn-sm" id="diceLog" onClick={() => log(last)}>Log this roll</button>}
        <button class="btn btn-ghost btn-sm" id="diceClear" disabled={!hist.length} onClick={clearDice}>Clear</button>
        <span class="muted">Dice in notes are buttons too (Shift: advantage, Alt: disadvantage).</span>
      </div>
    </div>
  );
}
