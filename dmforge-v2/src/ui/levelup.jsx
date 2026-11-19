import { emit, toast } from './store.js';
import { luSet, luTo, luPreview, luProblems, luSpellCaps, libLevelConfirm, libLevelCancel } from './libraryactions.js';
import { AB, ABN } from '../core/chardata.js';
import { derive, scores, mod, signed, slotsText, profBonus } from '../core/character.js';
import { featsFor, expertiseChoices, hpAverage, hitDie, MAX_LEVEL } from '../core/levelup.js';
import { searchSpells } from '../core/spells.js';

const firstLine = t => { const f = String(t).replace(/\|.*\|/g, ' ').replace(/\s+/g, ' ').trim(); const m = /^(.+?[.!?])(\s|$)/.exec(f); return m ? m[1] : f; };
const roll = hd => 1 + Math.floor(Math.random() * hd);

/* ============ the level-up screen ============ */
export function LevelUp({ L }) {
  const c = L.c, data = L.data, lu = L.lu;
  if (!c || !lu) return null;
  const pv = luPreview();
  const bad = luProblems();
  const hi = Object.assign({}, c, { level: lu.to, asiLog: Object.assign({}, c.asiLog || {}) });
  const dv0 = derive(data, c);
  // what the character will look like once these choices are in (for the live numbers)
  const dv1 = derive(data, previewChar(data, c, lu));
  const si = luSpellCaps();
  const needSpells = !!si && (si.cantrips > c.cantrips.length || si.prepared > c.prepared.length || pv.cantrips && pv.prepared);
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Level up {c.name}</h2><div class="muted small">Level {c.level} {c.species} {c.cls}{c.level >= 3 && c.sub ? ' (' + c.sub + ')' : ''}. Nothing changes until you press the button at the bottom.</div></div>
        <div class="row-actions"><button class="btn" id="luCancel" onClick={libLevelCancel}>Cancel</button></div></div>
      <div class="cc-layout">
        <div class="card cc-main" id="levelUp">
          <h3 style="margin-top:0">Level up to</h3>
          <div class="row-actions" style="align-items:center">
            <button class="btn btn-sm" id="luMinus" disabled={lu.to <= c.level + 1} onClick={() => luTo(lu.to - 1)} aria-label="One level less">−</button>
            <b id="luTo" style="font-size:22px;min-width:2ch;text-align:center">{lu.to}</b>
            <button class="btn btn-sm" id="luPlus" disabled={lu.to >= MAX_LEVEL} onClick={() => luTo(lu.to + 1)} aria-label="One level more">＋</button>
            <span class="muted small">{lu.to - c.level > 1 ? 'Going up ' + (lu.to - c.level) + ' levels in one go: you choose for each.' : 'Most tables level one at a time.'}</span>
          </div>

          <h3 class="cc-gap">What you gain</h3>
          <div class="cc-box" id="luGains" style="margin-top:6px">
            <div class="small">Proficiency bonus {pv.prof[0] === pv.prof[1] ? <b>+{pv.prof[1]}</b> : <>+{pv.prof[0]} → <b>+{pv.prof[1]}</b></>}</div>
            {pv.gained.length === 0 && <div class="small muted">No new class features at {pv.levels.length > 1 ? 'these levels' : 'this level'}, but your hit points go up.</div>}
            {pv.gained.map((f, i) => <div class="cc-feat" key={i}><b>{f.name}</b> <span class="muted mono">{f.from} {f.lvl}</span><div class="small">{firstLine(f.desc)}</div></div>)}
            {pv.newSub && <div class="small" style="margin-top:6px"><b>Subclass.</b> {c.sub} starts at level 3 (the SRD has one subclass for each class).</div>}
          </div>

          <h3 class="cc-gap">Hit points</h3>
          <div class="muted small">Hit die d{hitDie(data, c)}, Constitution {signed(pv.conMod)}. The average is {hpAverage(data, c)} plus Constitution each level; or roll, or type what you rolled at the table.</div>
          <div id="luHp">
            {pv.levels.map(l => {
              const v = lu.hp[l];
              const avg = hpAverage(data, c);
              return (
                <div class="row-actions cc-gap" style="align-items:center;margin-top:8px" key={l} data-hplevel={l}>
                  <b style="min-width:70px">Level {l}</b>
                  <button class={'btn btn-sm' + (v === undefined ? ' btn-primary' : '')} data-hpavg={l} onClick={() => luSet(x => { delete x.hp[l]; })}>Average ({avg})</button>
                  <button class="btn btn-sm" data-hproll={l} onClick={() => luSet(x => { x.hp[l] = roll(hitDie(data, c)); })}>Roll d{hitDie(data, c)}</button>
                  <input type="number" min="1" max={hitDie(data, c)} style="width:96px" aria-label={'Hit die result for level ' + l} data-hpval={l} value={v === undefined ? '' : v} placeholder="my roll" onInput={e => { const t = e.currentTarget.value; luSet(x => { if (t === '') delete x.hp[l]; else x.hp[l] = Number(t); }); }} />
                  <span class="muted small">gains <b>{Math.max(1, (v === undefined ? avg : Number(v) || avg) + pv.conMod)}</b></span>
                </div>
              );
            })}
          </div>

          {pv.asi.map(x => <AsiPick key={x.lvl} L={L} lvl={x.lvl} boon={x.boon} c={c} data={data} lu={lu} />)}

          {pv.expertise > 0 && <ExpertisePick c={c} data={data} lu={lu} need={pv.expertise} />}

          {si && <SpellPick L={L} c={c} data={data} lu={lu} si={si} />}

          <div class="cc-bar">
            <button class="btn" onClick={libLevelCancel}>Cancel</button>
            <button class="btn btn-primary" id="luConfirm" disabled={bad.length > 0} title={bad[0] || ''} onClick={libLevelConfirm}>Level up to {lu.to} and save</button>
          </div>
          {bad.length > 0 && <ul class="small cc-bad" id="luProblems" style="margin:8px 0 0;padding-left:18px">{bad.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </div>
        <aside class="card cc-side" id="luSide" aria-label="Before and after">
          <div class="cc-name">{c.name}</div>
          <div class="muted small">Level {c.level} → <b>{lu.to}</b></div>
          <table class="cc-table" style="margin-top:8px">
            <tr><td>Hit points</td><td class="mono">{dv0.hp}</td><td class="mono"><b id="luHpAfter">{dv1.hp}</b></td></tr>
            <tr><td>Armor Class</td><td class="mono">{dv0.ac}</td><td class="mono"><b>{dv1.ac}</b></td></tr>
            <tr><td>Proficiency</td><td class="mono">{signed(dv0.p)}</td><td class="mono"><b>{signed(dv1.p)}</b></td></tr>
            {AB.map(a => <tr key={a}><td>{ABN[a]}</td><td class="mono">{dv0.s[a]}</td><td class="mono"><b class={dv1.s[a] !== dv0.s[a] ? 'cc-good' : ''}>{dv1.s[a]}</b> <span class="muted">({signed(mod(dv1.s[a]))})</span></td></tr>)}
            {dv1.spells && <tr><td>Spell DC</td><td class="mono">{dv0.spells ? dv0.spells.dc : '–'}</td><td class="mono"><b>{dv1.spells.dc}</b></td></tr>}
          </table>
          {dv1.spells && <div class="small" style="margin-top:6px"><b>Slots</b> {slotsText(dv1.spells)}</div>}
        </aside>
      </div>
    </>
  );
}

/* the character as it would be with these choices (without saving anything) */
function previewChar(data, c, lu) {
  const n = JSON.parse(JSON.stringify(c));
  n.level = lu.to;
  n.hpRolls = Object.assign({}, n.hpRolls || {});
  for (const [l, v] of Object.entries(lu.hp || {})) if (v !== undefined && v !== '' && Number(l) > c.level) n.hpRolls[l] = Number(v);
  n.asiLog = Object.assign({}, n.asiLog || {});
  for (const [l, e] of Object.entries(lu.asi || {})) if (e) n.asiLog[l] = e.k === 'feat' ? { k: 'feat', feat: e.feat, plus: e.plus, boon: !!e.boon } : { k: 'asi', plus: e.plus || {} };
  n.expertise = [...new Set([...(n.expertise || []), ...(lu.expertise || [])])];
  return n;
}

function AsiPick({ L, lvl, boon, c, data, lu }) {
  const e = lu.asi[lvl];
  const mode = e ? e.k : '';
  const plus = (e && e.plus) || {};
  const total = AB.reduce((t, a) => t + (Number(plus[a]) || 0), 0);
  const base = scores(c);
  const feats = featsFor(data, boon);
  const setPlus = (a, n) => luSet(x => { const cur = Object.assign({}, (x.asi[lvl] && x.asi[lvl].plus) || {}); if (n) cur[a] = n; else delete cur[a]; x.asi[lvl] = Object.assign({}, x.asi[lvl] || { k: 'asi' }, { plus: cur }); });
  return (
    <div class="cc-gap" id={'luAsi' + lvl} data-asi={lvl}>
      <h3 style="margin-bottom:4px">{boon ? 'Epic Boon' : 'Ability Score Improvement'} <span class="muted small">(level {lvl}{lvl <= c.level ? ', not chosen yet: this character was made at a higher level' : ''})</span></h3>
      <div class="cc-opts" style="display:flex;gap:8px;flex-wrap:wrap">
        {!boon && <button class={'cc-opt' + (mode === 'asi' ? ' on' : '')} data-asimode="asi" onClick={() => luSet(x => { x.asi[lvl] = { k: 'asi', plus: {} }; })}><b>Increase scores</b><span>+2 to one, or +1 to two (up to 20)</span></button>}
        <button class={'cc-opt' + (mode === 'feat' ? ' on' : '')} data-asimode="feat" onClick={() => luSet(x => { x.asi[lvl] = { k: 'feat', feat: '', plus: {}, boon }; })}><b>{boon ? 'Choose an Epic Boon' : 'Take a feat'}</b><span>{boon ? 'And optionally +1 to a score (up to 30)' : 'General feats from the SRD'}</span></button>
      </div>
      {mode === 'asi' && (
        <div class="cc-abs" style="margin-top:10px;display:grid;grid-template-columns:repeat(6,1fr);gap:8px">
          {AB.map(a => {
            const n = Number(plus[a]) || 0, cap = 20, now = base[a];
            return (
              <div key={a} style="text-align:center" class="cc-box"><span class="small muted">{a.toUpperCase()}</span><div><b>{now}</b>{n ? <b class="cc-good"> → {Math.min(cap, now + n)}</b> : null}</div>
                <div class="row-actions" style="justify-content:center;gap:4px;margin-top:4px">
                  <button class="btn btn-sm" aria-label={'Less ' + a} data-asiminus={lvl + a} disabled={!n} onClick={() => setPlus(a, n - 1)}>−</button>
                  <button class="btn btn-sm" aria-label={'More ' + a} data-asiplus={lvl + a} disabled={total >= 2 || n >= 2 || now + n >= cap} onClick={() => setPlus(a, n + 1)}>＋</button>
                </div></div>
            );
          })}
        </div>
      )}
      {mode === 'asi' && <div class="small muted" style="margin-top:4px">{total}/2 points used</div>}
      {mode === 'feat' && (
        <div style="margin-top:10px">
          <select id={'luFeat' + lvl} aria-label="Feat" value={e.feat || ''} onChange={ev => { const f = ev.currentTarget.value; luSet(x => { x.asi[lvl] = Object.assign({}, x.asi[lvl], { feat: f }); }); }}>
            <option value="">Choose…</option>{feats.map(f => <option key={f.n} value={f.n}>{f.n}</option>)}
          </select>
          {e.feat && <div class="small muted" style="margin-top:6px">{firstLine((feats.find(f => f.n === e.feat) || {}).desc || '')}</div>}
          {boon && (
            <div class="row-actions" style="margin-top:8px;align-items:center"><span class="small">Optional +1 to:</span>
              {AB.map(a => <button key={a} class={'btn btn-sm' + (plus[a] ? ' btn-primary' : '')} data-boonplus={a} onClick={() => luSet(x => { const had = x.asi[lvl].plus && x.asi[lvl].plus[a]; x.asi[lvl] = Object.assign({}, x.asi[lvl], { plus: had ? {} : { [a]: 1 }, boon: true }); })}>{a}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpertisePick({ c, data, lu, need }) {
  const base = Object.assign({}, c, { expertise: [...(c.expertise || []), ...lu.expertise], level: lu.to });
  const opts = expertiseChoices(data, Object.assign({}, c, { level: lu.to }));
  const toggle = n => luSet(x => { if (x.expertise.includes(n)) x.expertise = x.expertise.filter(y => y !== n); else if (x.expertise.length < need) x.expertise = [...x.expertise, n]; else toast('Choose ' + need + '. Untick one first.'); });
  return (
    <div class="cc-gap" id="luExpertise">
      <h3 style="margin-bottom:4px">Expertise</h3>
      <div class="muted small">Choose {need} skill{need === 1 ? '' : 's'} you are proficient in. Your proficiency bonus counts twice for them. Chosen: {lu.expertise.length}/{need}.</div>
      <div class="cc-chips" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">{opts.map(n => <button key={n} class={'cc-chip' + (lu.expertise.includes(n) ? ' on' : '')} data-expert={n} onClick={() => toggle(n)}>{n}</button>)}</div>
    </div>
  );
}

function SpellPick({ L, c, data, lu, si }) {
  if (!L.spells) return <p class="muted cc-gap">Loading the SRD spells…</p>;
  const mine = L.spells.filter(s => s.cl.includes(c.cls) && s.lv <= si.maxLvl);
  const shown = searchSpells(mine, { q: lu.spellQ, level: lu.spellLv });
  const levels = [...new Set(mine.map(s => s.lv))].sort((a, b) => a - b);
  const toggle = sp => luSet(x => {
    const list = sp.lv === 0 ? x.cantrips : x.prepared, cap = sp.lv === 0 ? si.cantrips : si.prepared;
    if (list.includes(sp.n)) list.splice(list.indexOf(sp.n), 1); else if (list.length < cap) list.push(sp.n); else toast('That is the limit (' + cap + '). Untick one first.');
  });
  return (
    <div class="cc-gap" id="luSpells">
      <h3 style="margin-bottom:4px">Spells</h3>
      <div class="muted small">Slots at level {lu.to}: {slotsText(si)}. You can also swap spells you no longer want.</div>
      <div class="row-actions" style="align-items:center;margin-top:6px">
        {si.cantrips > 0 && <span id="luCantrips" class={lu.cantrips.length === si.cantrips ? 'cc-good' : 'muted'}>Cantrips {lu.cantrips.length}/{si.cantrips}</span>}
        <span id="luPrepared" class={lu.prepared.length === si.prepared ? 'cc-good' : 'muted'}>Prepared {lu.prepared.length}/{si.prepared}</span>
        <span style="flex:1" />
        <input style="width:150px" id="luSpellQ" placeholder="Search spells" value={lu.spellQ} onInput={e => { const v = e.currentTarget.value; luSet(x => { x.spellQ = v; }); }} />
        <select style="width:auto" id="luSpellLv" value={lu.spellLv} onChange={e => { const v = e.currentTarget.value; luSet(x => { x.spellLv = v; }); }}><option value="">All levels</option>{levels.map(l => <option key={l} value={l}>{l === 0 ? 'Cantrips' : 'Level ' + l}</option>)}</select>
      </div>
      <div class="cc-spells" style="max-height:300px;overflow:auto;margin-top:6px">{shown.map(sp => { const on = (sp.lv === 0 ? lu.cantrips : lu.prepared).includes(sp.n); return (
        <label key={sp.n} class={'cc-spell' + (on ? ' on' : '')} data-luspell={sp.n}><input type="checkbox" checked={on} onChange={() => toggle(sp)} /><span class="cc-lvl">{sp.lv === 0 ? 'C' : 'L' + sp.lv}</span><b>{sp.n}</b><span class="muted small">{sp.sc}</span></label>
      ); })}{!shown.length && <div class="muted">No spells match.</div>}</div>
    </div>
  );
}
