/* Settings, as a page: categories down the left, one category's options on the right, and a search box that finds an option wherever it lives.
   Every option keeps the id it always had, so what it does is unchanged; this is only where it sits and how it looks. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { GROUP_AFTER_CHOICES } from '../core/grouping.js';
import { S, set, toast, useApp } from './store.js';
import { updateSetting, clearLeftOff, hiddenGens, setGenVisible, setGensVisible, setAccent, setTheme, setLayout, LAYOUTS, askUndoPush, checkForUpdate, setSettingsCat } from './actions.js';
import { GROUPS } from '../core/genlayout.js';
import { GENS_BY_ID } from '../core/generators.js';
import { parseDelay, delayText, MAX_DELAY } from '../core/shortcuts.js';
import { ACCENTS } from '../core/accent.js';
import { NEGLECT_CHOICES } from '../core/forgetting.js';
import { FONT_SETS } from '../core/fontsets.js';
import { SnapshotSection } from './snapshot.jsx';
import { ClaudePanel } from './claude.jsx';

export const SETTINGS_CATS = [
  { id: 'appearance', title: 'Appearance', blurb: 'Colours and typeface' },
  { id: 'layout', title: 'Layout and sidebar', blurb: 'Panes, and the sidebar that tucks away' },
  { id: 'writing', title: 'Writing and saving', blurb: 'What happens when you move away from an edit' },
  { id: 'sessions', title: 'Sessions', blurb: 'Where you left off, and what you might be forgetting' },
  { id: 'library', title: 'Library and lists', blurb: 'Monsters, generators and long lists' },
  { id: 'claude', title: 'Claude', blurb: 'The optional helper, and the campaign snapshot' },
  { id: 'data', title: 'Data and updates', blurb: 'Undo a push, the trash, versions and updates' },
];

/* ---------- the small parts every option is made of ---------- */
function Row({ id, title, desc, more, stack, sub, children }) {
  return (
    <div class={'so' + (stack ? ' so-stack' : '')} data-set={id}>
      <div class="so-text">
        <div class="so-title">{title}</div>
        {desc && <div class="so-desc">{desc}</div>}
        {more && <details class="so-more"><summary>More</summary><div>{more}</div></details>}
      </div>
      <div class="so-ctl">{children}</div>
      {sub}
    </div>
  );
}
const Switch = ({ id, checked, onChange, label }) => <input type="checkbox" role="switch" class="sw" id={id} aria-label={label} checked={checked} onChange={e => onChange(e.currentTarget.checked)} />;
/* a few choices side by side: real radio buttons, so the keyboard and screen readers work as they always did */
function Seg({ name, label, value, options, onChange }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <label key={o.v} class={'seg-opt' + (value === o.v ? ' on' : '')}>
          <input type="radio" class="seg-in" name={name} id={o.id} checked={value === o.v} disabled={o.disabled} onChange={() => onChange(o.v)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/* how long the mouse rests on the hidden sidebar before it opens: type it any way you like (0.5, 1/2, 750ms, 2 seconds) */
function DelayField({ value }) {
  const [text, setText] = useState(String(value / 1000));
  const [bad, setBad] = useState(false);
  const commit = () => {
    const ms = parseDelay(text);
    if (ms === null) { setBad(true); return; }
    setBad(false); setText(String(ms / 1000)); updateSetting('sidebarDelay', ms);
  };
  return (
    <div class="so-sub">
      <label for="setSidebarDelay">Opens after</label>
      <input id="setSidebarDelay" inputmode="decimal" autocomplete="off" aria-invalid={bad} style="width:84px" value={text} onInput={e => { setText(e.currentTarget.value); setBad(false); }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
      <span class="small muted">seconds (0.5, 1/2, 750ms and 2 all work). {bad ? '' : 'Now: ' + delayText(value) + '.'}</span>
      {bad && <span class="small" id="setSidebarDelayErr" style="color:var(--danger)">That is not a time. Try 0.5, 1/2 or 750ms (0 to {MAX_DELAY / 1000} seconds).</span>}
    </div>
  );
}

/* which generators show on the Generate screen (the ones you never use can be switched off) */
function GeneratorsShown({ open }) {
  const hidden = hiddenGens();
  const total = GROUPS.reduce((n, gr) => n + gr.gens.length, 0);
  const shown = total - GROUPS.reduce((n, gr) => n + gr.gens.filter(id => hidden.has(id)).length, 0);
  return (
    <details class="set-gens" id="setGens" open={open || undefined}>
      <summary><span class="so-title">Generators shown on the Generate screen</span> <span class="muted small">({shown} of {total})</span></summary>
      <div class="so-desc" style="margin-top:6px">Switch off the ones you never use and they disappear from Generate, search and “Just surprise me”. Nothing is deleted.</div>
      <div class="row-actions" style="margin-top:8px"><button class="btn btn-sm" id="gensAll" onClick={() => setGensVisible(GROUPS.flatMap(gr => gr.gens), true)}>Show all</button><button class="btn btn-sm" id="gensNone" onClick={() => setGensVisible(GROUPS.flatMap(gr => gr.gens), false)}>Hide all</button></div>
      {GROUPS.map(gr => (
        <div key={gr.id}>
          <div class="gg">{gr.title} <button class="linkish" onClick={() => setGensVisible(gr.gens, gr.gens.some(id => hidden.has(id)))}>{gr.gens.some(id => hidden.has(id)) ? 'show all' : 'hide all'}</button></div>
          <div class="gl">{gr.gens.map(id => <label key={id}><input type="checkbox" data-gen-toggle={id} checked={!hidden.has(id)} onChange={e => setGenVisible(id, e.currentTarget.checked)} /> {GENS_BY_ID[id].name}</label>)}</div>
        </div>
      ))}
    </details>
  );
}

/* the seven typeface sets, each shown in its own letters */
function FontPicker({ value }) {
  const cur = value || 'today';
  return (
    <div class="font-grid" role="radiogroup" aria-label="Typeface">
      {FONT_SETS.map(f => (
        <label key={f.id} class={'font-card' + (cur === f.id ? ' on' : '')} data-font-set={f.id} style={'--fc-head:"' + f.head + '";--fc-body:"' + f.body + '";--fc-mono:"' + f.mono + '"'}>
          <input type="radio" class="seg-in" name="fontSet" id={'setFont-' + f.id} checked={cur === f.id} onChange={() => updateSetting('fontSet', f.id)} />
          <span class="fc-name">{f.name}{f.id === 'today' ? <span class="fc-tag">current default</span> : null}</span>
          <span class="fc-title">The Three Rings</span>
          <span class="fc-body">The party reached Greenhold in the rain.</span>
          <span class="fc-mono">38/38 HP · AC 15 · 2d6+3</span>
          <span class="fc-fonts">{f.head} · {f.body}</span>
        </label>
      ))}
    </div>
  );
}

/* ---------- every option, in the category it lives in ---------- */
function useItems() {
  const st = S.settings;
  const tracked = Object.keys(S.leftOff).length;
  const items = [];
  const add = (cat, id, title, words, node) => items.push({ cat, id, title, words: (title + ' ' + words).toLowerCase(), node });

  /* Appearance */
  add('appearance', 'theme', 'Colours light dark', 'theme mode night day auto system', (
    <Row key="theme" id="theme" title="Colours" desc="Auto follows your Mac, light or dark.">
      <Seg name="theme" label="Colours" value={S.theme} onChange={setTheme} options={[{ v: 'auto', label: 'Auto', id: 'setThemeAuto' }, { v: 'light', label: 'Light', id: 'setThemeLight' }, { v: 'dark', label: 'Dark', id: 'setThemeDark' }]} />
    </Row>));
  add('appearance', 'darkstyle', 'Dark mode style', 'warm blue grey slate night', (
    <Row key="darkstyle" id="darkstyle" title="Dark mode style" desc="Warm is brown-black. Blue-grey is cooler, the dark mode DM Forge had before.">
      <Seg name="darkStyle" label="Dark mode style" value={st.darkStyle === 'slate' ? 'slate' : 'warm'} onChange={v => updateSetting('darkStyle', v)} options={[{ v: 'warm', label: 'Warm', id: 'setDarkWarm' }, { v: 'slate', label: 'Blue-grey', id: 'setDarkSlate' }]} />
    </Row>));
  if (S.campaign) add('appearance', 'accent', 'Colour of this campaign', 'accent colour color buttons links gold ember', (
    <Row key="accent" id="accent" title="Colour of this campaign" desc="Buttons, links and the active page take this colour. Each campaign remembers its own." stack>
      <div id="accentGroup" class="accent-row" role="radiogroup" aria-label="Campaign accent colour">
        {ACCENTS.map(a => (
          <button key={a.key} class="swatch" role="radio" aria-checked={S.accent === a.key} data-accent-pick={a.key} onClick={() => setAccent(a.key)}>
            <span class="chip-dot" style={'--sw-l:' + a.light + ';--sw-d:' + a.dark} />{a.label}
          </button>
        ))}
      </div>
    </Row>));
  add('appearance', 'fontset', 'Typeface', 'font fonts type letters serif sans text titles heading', (
    <Row key="fontset" id="fontset" title="Typeface" desc="Applies everywhere, straight away. Every font is built in, so it all works offline." stack>
      <FontPicker value={st.fontSet} />
    </Row>));
  add('layout', 'layout', 'Window layout', 'panes columns split prep tabs', (
    <Row key="layout" id="layout" title="Window layout" desc="One pane, two columns, or a big prep pane with two beside it. Needs a wide window.">
      <Seg name="layout" label="Window layout" value={S.layout} onChange={setLayout} options={Object.keys(LAYOUTS).map(k => ({ v: k, label: LAYOUTS[k].label, id: 'setLayout-' + k }))} />
    </Row>));
  add('layout', 'sidebar', 'Hide the sidebar until I point at it', 'sidebar menu icons collapse delay room', (
    <Row key="sidebar" id="sidebar" title="Hide the sidebar until I point at it" desc="It shrinks to a column of icons. Rest the mouse on it to open it; Ctrl/⌘+B opens it from the keyboard." sub={st.sidebarAuto ? <DelayField value={st.sidebarDelay == null ? 2000 : st.sidebarDelay} /> : null}>
      <Switch id="setSidebarAuto" label="Hide the sidebar until I point at it" checked={!!st.sidebarAuto} onChange={v => updateSetting('sidebarAuto', v)} />
    </Row>));

  /* Writing and saving */
  add('writing', 'leave', 'When I leave an edit I have not saved', 'save auto ask discard editing move category note tab', (
    <Row key="leave" id="leave" title="When I leave an edit I have not saved" desc="Saved edits wait as pending changes, ready to push." more="“Ask me first” lets you save, discard or keep editing. The same applies when you close a tab you are editing in.">
      <Seg name="leaveEdit" label="When I move away from an edit I have not saved" value={st.leaveEdit} onChange={v => updateSetting('leaveEdit', v)} options={[{ v: 'auto', label: 'Save it for me', id: 'setAuto' }, { v: 'ask', label: 'Ask me first', id: 'setAsk' }]} />
    </Row>));
  add('writing', 'autoopen', 'Open the campaign I was last in', 'start startup launch campaign list resume', (
    <Row key="autoopen" id="autoopen" title="Open the campaign I was last in" desc="Skips the campaign list when DM Forge starts. Switch campaign still takes you to the list.">
      <Switch id="setAutoOpen" label="Open the campaign I was last in" checked={st.autoOpenLast !== false} onChange={v => updateSetting('autoOpenLast', v)} />
    </Row>));

  /* Sessions */
  add('sessions', 'track', 'Track where I left off', 'left off remember jump changes line session history', (
    <Row key="track" id="track" title="Track where I left off" desc="Remembers the last changes to a session note, so you can jump straight back. Stays in this browser, never in your vault." more="After each change it keeps the line, the heading above it and a few words."
      sub={st.trackLeftOff ? (
        <div class="so-sub">
          <label for="setKeep">Keep the last</label>
          <select id="setKeep" value={String(st.leftOffKeep)} onChange={e => updateSetting('leftOffKeep', +e.currentTarget.value)}>{[10, 20, 50].map(n => <option key={n} value={String(n)}>{n}</option>)}</select>
          <span class="small muted">changes for each session</span>
          <button class="btn btn-sm" id="setClear" disabled={!tracked} onClick={() => { clearLeftOff(); toast('Cleared the tracked changes.'); }}>Clear tracked changes{tracked ? ' (' + tracked + ' session' + (tracked === 1 ? '' : 's') + ')' : ''}</button>
        </div>) : null}>
      <Switch id="setTrack" label="Track where I left off" checked={!!st.trackLeftOff} onChange={v => updateSetting('trackLeftOff', v)} />
    </Row>));
  add('sessions', 'neglect', 'What am I forgetting? neglected after', 'threads npc quiet mention overview forgetting', (
    <Row key="neglect" id="neglect" title="Call a thread or NPC neglected after" desc="Sessions without a mention. Used by the What am I forgetting? card on Overview.">
      <select id="setNeglect" aria-label="Sessions without a mention" value={String(st.neglectAfter || 3)} onChange={e => updateSetting('neglectAfter', +e.currentTarget.value)}>{NEGLECT_CHOICES.map(n => <option key={n} value={String(n)}>{n} sessions</option>)}</select>
    </Row>));

  /* Library and lists */
  add('library', 'srd', 'Include the built-in monsters', 'monster library srd bestiary creatures system reference document', (
    <Row key="srd" id="srd" title="Include the built-in monsters" desc="331 creatures from the System Reference Document 5.2.1 (CC-BY 4.0). Your own notes in a Bestiary, Monsters or Creatures folder are always included.">
      <Switch id="setSrd" label="Include the built-in monsters" checked={st.srdOn !== false} onChange={v => updateSetting('srdOn', v)} />
    </Row>));
  add('library', 'groupafter', 'Fold long lists up by town', 'group npcs factions items places fold collapse long lists', (
    <Row key="groupafter" id="groupafter" title="Fold long lists up by town" desc="Group NPCs, factions and items by where they are once a list is this long." more="You can always change how a list is grouped from the list itself.">
      <select id="setGroupAfter" aria-label="When to group long lists" value={String(st.groupAfter ?? 20)} onChange={e => updateSetting('groupAfter', Number(e.currentTarget.value))}>{GROUP_AFTER_CHOICES.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}</select>
    </Row>));
  add('library', 'gens', 'Generators shown on the Generate screen', 'generate generators hide show names loot tavern surprise', (
    <div key="gens" class="so so-block" data-set="gens"><GeneratorsShown open={S.settingsFocus === 'gens'} /></div>));

  /* Claude */
  add('claude', 'claude', 'Claude (experimental)', 'claude code helper ai expand ask sign in roll back', (
    <div key="claude" class="so so-block" data-set="claude"><ClaudePanel /></div>));
  add('claude', 'snapshot', 'Campaign snapshot', 'snapshot summary inspiration campaign note', (
    <div key="snapshot" class="so so-block" data-set="snapshot"><SnapshotSection /></div>));

  /* Data and updates */
  add('data', 'undopush', 'Undo last push', 'undo push restore notes helper', (
    <Row key="undopush" id="undopush" title="Undo last push" desc={S.helper ? (S.undo ? 'Put back the ' + S.undo.files + ' note' + (S.undo.files === 1 ? '' : 's') + ' your last push changed. The last 10 pushes are kept.' : 'Put back the notes your last push changed. The last 10 pushes are kept.') : 'Needs the helper (start DM Forge with Start DM Forge.command).'}>
      <button class="btn btn-sm" id="setUndoPush" disabled={!S.helper} onClick={() => askUndoPush()}>Undo last push…</button>
    </Row>));
  add('data', 'trash', 'Trash', 'deleted notes restore recover', (
    <Row key="trash" id="trash" title="Trash" desc="Notes you deleted: see them and put one back.">
      <button class="btn btn-sm" id="setTrashBtn" onClick={() => set({ dialog: { kind: 'trash' } })}>Open the trash…</button>
    </Row>));
  add('data', 'update', 'Check for an update', 'update upgrade zip downloads restart', (
    <Row key="update" id="update" title="Check for an update" desc={S.hosted ? 'The server is updated by replacing its Docker image. This page offers a Reload when a newer version is running.' : S.helper ? 'Installs a newer DM-Forge-V2.zip from your Downloads folder and restarts, without typing anything in the Terminal.' : 'Needs the helper (start DM Forge with Start DM Forge.command).'}>
      <button class="btn btn-sm" id="setUpdate" disabled={!S.helper || S.hosted} onClick={() => checkForUpdate({ manual: true })}>Check now</button>
    </Row>));
  add('data', 'version', 'Version', 'version roll back forward previous', (
    <Row key="version" id="version" title={'Version ' + __DMF_VERSION__} desc={S.hosted ? 'You are on ' + __DMF_VERSION__ + '. Rolling back means running the earlier Docker image.' : S.helper ? 'Roll back to the version before, or forward again. DM Forge restarts for you.' : 'You are on ' + __DMF_VERSION__ + '. Rolling back needs the helper.'}>
      <button class="btn btn-sm" id="setVersion" disabled={!S.helper || S.hosted} onClick={() => set({ dialog: { kind: 'version' } })}>Versions…</button>
      <button class="btn btn-sm btn-ghost" id="setHistory" onClick={() => set({ section: 'history', selected: null, editing: false })}>What changed</button>
    </Row>));
  return items;
}

export function SettingsPage() {
  useApp();
  const [q, setQ] = useState('');
  const items = useItems();
  const cat = SETTINGS_CATS.find(c => c.id === S.settingsCat) ? S.settingsCat : 'appearance';
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length ? items.filter(i => terms.every(t => i.words.includes(t))) : null;
  const shown = hits || items.filter(i => i.cat === cat);
  const catTitle = id => SETTINGS_CATS.find(c => c.id === id).title;
  const cur = SETTINGS_CATS.find(c => c.id === cat);
  const search = useRef();
  useEffect(() => { document.title = 'Settings · DM Forge'; }, []);
  return (
    <div class="settings-page" id="settingsPage">
      <div class="page-head">
        <div>
          <h2 aria-level="1">Settings</h2>
          <div class="muted small">Changes apply straight away.</div>
        </div>
        <div class="set-search">
          <input ref={search} id="settingsSearch" type="search" autocomplete="off" aria-label="Search the settings" placeholder="Search settings" value={q} onInput={e => setQ(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape' && q) { e.stopPropagation(); setQ(''); } }} />
        </div>
      </div>
      <div class="set-layout">
        <nav class="set-nav" aria-label="Settings categories">
          {SETTINGS_CATS.map(c => (
            <button key={c.id} class={'set-cat' + (!hits && c.id === cat ? ' on' : '')} data-setcat={c.id} aria-current={!hits && c.id === cat ? 'page' : undefined} onClick={() => { setQ(''); setSettingsCat(c.id); }}>
              <span class="set-cat-t">{c.title}</span><span class="set-cat-b">{c.blurb}</span>
            </button>
          ))}
        </nav>
        <section class="set-panel" aria-live="polite">
          {hits ? (
            <div class="set-results-head" id="setResults"><b>{hits.length ? hits.length + (hits.length === 1 ? ' setting' : ' settings') + ' match' + (hits.length === 1 ? 'es' : '') + ' “' + q.trim() + '”' : 'Nothing matches “' + q.trim() + '”'}</b>{!hits.length && <span class="muted small"> Try a shorter word, like “sidebar”, “font” or “claude”.</span>}</div>
          ) : (
            <div class="set-cat-head"><h3>{cur.title}</h3><div class="muted small">{cur.blurb}</div></div>
          )}
          {shown.map(i => (
            <div key={i.id} class="so-wrap">{hits && <div class="so-cat">{catTitle(i.cat)}</div>}{i.node}</div>
          ))}
        </section>
      </div>
    </div>
  );
}
