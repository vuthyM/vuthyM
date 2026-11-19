import { useMemo, useState } from 'preact/hooks';
import { emit, toast } from './store.js';
import { renderMarkdown } from './render.js';
import { Modal } from './common.jsx';
import { libItemNew, libItemRoll, libItemEdit, libItemSet, libItemBack, libItemSave, libItemDelete, libItemCopy, libSrdLoad, libItemFromSrd, libCarry, libAttune, libSet, libImportOpen, libImportClose, libImportRun, libImportShow, canImport } from './libraryactions.js';
import { KINDS, KIND_NAME, RARITY, RECHARGE, ATTUNE_MAX, searchSrdItems, typeLineOf, itemMarkdown, itemProblem } from '../core/itemlib.js';
import { RARITIES } from '../core/items.js';
import { metricize } from '../core/units.js';

const rarityClass = r => 'pill r-' + String(r || '').toLowerCase().replace(/\s+/g, '-');

/* ============ the Items tab ============ */
export function ItemsTab({ L }) {
  if (L.itemView === 'edit' && L.it) return <ItemBuilder L={L} />;
  if (L.itemView === 'srd') return <SrdBrowser L={L} />;
  return <ItemList L={L} />;
}

function ItemCard({ r, L }) {
  const f = r.fm || {};
  return (
    <div class="card cc-card" data-item={r.name}>
      <div class="row-actions" style="gap:6px">{f.rarity && <span class={rarityClass(f.rarity)}>{f.rarity}</span>}{f.form && <span class="pill">{KIND_NAME[f.form] || f.form}</span>}{String(f.attunement) === 'true' && <span class="pill pill-warn">Attunement</span>}{!r.hasState && <span class="pill pill-warn" title="Not made in the builder: it can be viewed and added to a campaign, and edited in Obsidian">plain note</span>}</div>
      <h3 style="margin:8px 0 2px">{r.hasState ? <a href="#" onClick={e => { e.preventDefault(); libItemEdit(r.path); }}>{r.name}</a> : r.name}</h3>
      <div class="muted small">{f.kind || ''}</div>
      <div class="row-actions" style="margin-top:10px">
        <button class="btn btn-sm" data-itemedit={r.name} disabled={!r.hasState} onClick={() => libItemEdit(r.path)}>Edit</button>
        <button class="btn btn-sm" data-itemadd={r.name} title={canImport() ? 'Copy into the open campaign' : 'Open a campaign first'} onClick={() => libImportOpen('item', r.path)}>Add to campaign…</button>
        <button class="btn btn-sm btn-ghost" data-itemcopy={r.name} disabled={!r.hasState} onClick={() => libItemCopy(r.path)}>Copy</button>
        <button class="btn btn-sm btn-ghost btn-danger" data-itemdelete={r.name} onClick={() => libItemDelete(r.path)}>Delete</button>
      </div>
    </div>
  );
}

function ItemList({ L }) {
  const list = L.itemList;
  const q = L.itemQ.trim().toLowerCase();
  const shown = (list || []).filter(r => (!q || r.name.toLowerCase().includes(q) || String((r.fm || {}).kind || '').toLowerCase().includes(q)) && (!L.itemKind || (r.fm || {}).form === L.itemKind) && (!L.itemRarity || (r.fm || {}).rarity === L.itemRarity));
  const [gen, setGen] = useState({ rarity: 'Uncommon', kind: 'Any' });
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">Items</h2><div class="muted small">Magic items live in <span class="mono">Character Library/Items</span>, apart from any campaign. Build your own, start from the SRD, or roll one at random and shape it.</div></div></div>
      <div class="row-actions" style="margin-bottom:14px">
        <button class="btn btn-primary" id="itemNew" onClick={() => libItemNew()}>＋ Build an item</button>
        <button class="btn" id="itemSrd" onClick={() => { L.itemView = 'srd'; emit(); libSrdLoad(); }}>Browse the SRD magic items</button>
        <input id="itemSearch" style="flex:1 1 200px;max-width:260px;width:auto" placeholder="Search your items" aria-label="Search your items" value={L.itemQ} onInput={e => { L.itemQ = e.currentTarget.value; emit(); }} />
        <select id="itemKindFilter" style="width:auto" aria-label="Kind" value={L.itemKind} onChange={e => { L.itemKind = e.currentTarget.value; emit(); }}><option value="">All kinds</option>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <select id="itemRarityFilter" style="width:auto" aria-label="Rarity" value={L.itemRarity} onChange={e => { L.itemRarity = e.currentTarget.value; emit(); }}><option value="">Any rarity</option>{RARITY.map(r => <option key={r}>{r}</option>)}</select>
      </div>
      <div class="cc-box" style="margin:0 0 14px" id="itemRollBox">
        <b>Start from a random one</b>
        <div class="row-actions" style="margin-top:6px;align-items:center">
          <select id="itemRollRarity" style="width:auto" aria-label="Rarity" value={gen.rarity} onChange={e => setGen({ ...gen, rarity: e.currentTarget.value })}>{RARITIES.map(r => <option key={r}>{r}</option>)}</select>
          <select id="itemRollKind" style="width:auto" aria-label="Kind" value={gen.kind} onChange={e => setGen({ ...gen, kind: e.currentTarget.value })}>{['Any', 'Weapon', 'Armor', 'Ring', 'Wand', 'Staff', 'Wondrous item'].map(k => <option key={k}>{k}</option>)}</select>
          <button class="btn" id="itemRoll" onClick={() => libItemRoll({ rarity: gen.rarity, kind: gen.kind })}>Roll one and edit it</button>
          <span class="muted small">It opens in the builder; nothing is saved until you save.</span>
        </div>
      </div>
      {list === null && <p class="muted">Reading the library…</p>}
      {list && !list.length && <div class="empty"><h3>No items yet</h3><div>Build one from scratch, start from an SRD item such as a Bag of Holding, or roll a random one and change what you like.</div></div>}
      {list && list.length > 0 && !shown.length && <p class="muted">Nothing matches that.</p>}
      <div class="cc-grid" id="itemGrid">{shown.map(r => <ItemCard key={r.path} r={r} L={L} />)}</div>
    </>
  );
}

/* ============ the SRD browser ============ */
function SrdBrowser({ L }) {
  const [pick, setPick] = useState(null);
  const list = L.srd;
  const shown = useMemo(() => list ? searchSrdItems(list, { q: L.srdQ, kind: L.srdKind, rarity: L.srdRarity }) : [], [list, L.srdQ, L.srdKind, L.srdRarity]);
  const sel = pick && list ? list.find(x => x.n === pick) : null;
  const [variant, setVariant] = useState('');
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">SRD magic items</h2><div class="muted small">{list ? list.length + ' items from the System Reference Document 5.2.1. Pick one to copy into the builder and change what you like.' : 'Loading…'}</div></div>
        <div class="row-actions"><button class="btn" id="srdBack" onClick={() => { L.itemView = 'list'; emit(); }}>← Your items</button></div></div>
      <div class="row-actions" style="margin-bottom:12px">
        <input id="srdSearch" style="flex:1 1 220px;max-width:300px;width:auto" placeholder="Search by name" value={L.srdQ} onInput={e => { L.srdQ = e.currentTarget.value; emit(); }} />
        <select id="srdKind" style="width:auto" aria-label="Kind" value={L.srdKind} onChange={e => { L.srdKind = e.currentTarget.value; emit(); }}><option value="">All kinds</option>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        <select id="srdRarity" style="width:auto" aria-label="Rarity" value={L.srdRarity} onChange={e => { L.srdRarity = e.currentTarget.value; emit(); }}><option value="">Any rarity</option>{RARITY.map(r => <option key={r}>{r}</option>)}</select>
        <span class="muted small" id="srdCount">{shown.length} shown</span>
      </div>
      <div class="cc-layout">
        <div class="card cc-main" style="max-height:70vh;overflow:auto" id="srdList">
          {shown.map(r => (
            <button key={r.n} class={'srd-row' + (pick === r.n ? ' on' : '')} data-srd={r.n} onClick={() => { setPick(r.n); setVariant(''); }}>
              <b>{r.n}</b><span class="muted small">{KIND_NAME[r.k]}</span><span class={rarityClass(r.r)}>{r.r}</span>{r.a && <span class="muted small">attunement</span>}
            </button>
          ))}
          {list && !shown.length && <div class="muted">No SRD item matches.</div>}
        </div>
        <aside class="card cc-side" id="srdDetail">
          {!sel && <div class="muted">Choose an item on the left to read it.</div>}
          {sel && (
            <>
              <div class="cc-name">{sel.n}</div>
              <div class="muted small">{KIND_NAME[sel.k]}, {sel.r.toLowerCase()}{sel.a ? ' (requires attunement)' : ''}</div>
              <div class="md cc-md" style="margin-top:8px;max-height:46vh;overflow:auto" dangerouslySetInnerHTML={{ __html: renderMarkdown(metricize(sel.d)) }} />
              {sel.v && sel.v.length > 0 && (
                <div style="margin-top:8px"><label class="lbl" for="srdVariant">Applies to</label>
                  <select id="srdVariant" value={variant} onChange={e => setVariant(e.currentTarget.value)}><option value="">Any</option>{sel.v.map(v => <option key={v}>{v}</option>)}</select></div>
              )}
              <div class="row-actions" style="margin-top:10px"><button class="btn btn-primary" id="srdUse" onClick={() => libItemFromSrd(sel, variant)}>Copy into the builder</button></div>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/* ============ the builder ============ */
export function ItemBuilder({ L }) {
  const it = L.it;
  const set = fn => libItemSet(fn);
  const bad = itemProblem(it);
  const preview = useMemo(() => renderMarkdown(itemMarkdown(it).replace(/^---[\s\S]*?\n---\n/, '').replace(/<!--[\s\S]*?-->/g, '')), [JSON.stringify(it)]);
  const isWeapon = it.kind === 'weapon', isArmor = it.kind === 'armor';
  return (
    <>
      <div class="page-head"><div><h2 aria-level="1">{it.name || 'New item'}</h2><div class="muted small">{L.itemPath ? 'Editing ' + L.itemPath : 'Not saved yet'}{L.itemDirty ? ' · unsaved changes' : ''}{it.from ? ' · from ' + it.from : ''}</div></div>
        <div class="row-actions">
          <button class="btn btn-primary" id="itemSave" disabled={!!bad} title={bad} onClick={() => libItemSave({ stay: true })}>Save</button>
          <button class="btn" id="itemSaveClose" disabled={!!bad} onClick={() => libItemSave()}>Save and close</button>
          <button class="btn btn-ghost" id="itemBack" onClick={libItemBack}>Close</button>
        </div></div>
      <div class="cc-layout">
        <div class="card cc-main" id="itemBuilder">
          <label class="lbl" for="itName">Name</label>
          <input id="itName" value={it.name} placeholder="Ember-Eye Longsword" onInput={e => { const v = e.currentTarget.value; set(x => { x.name = v; }); }} />
          <div class="cc-two cc-gap">
            <div><label class="lbl" for="itKind">Kind</label><select id="itKind" value={it.kind} onChange={e => { const v = e.currentTarget.value; set(x => { x.kind = v; }); }}>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
            <div><label class="lbl" for="itBase">{isWeapon ? 'Which weapon' : isArmor ? 'Which armor' : 'Form (optional)'}</label><input id="itBase" value={it.base} placeholder={isWeapon ? 'longsword' : isArmor ? 'chain mail' : 'a cloak, a signet ring…'} onInput={e => { const v = e.currentTarget.value; set(x => { x.base = v; }); }} /></div>
            <div><label class="lbl" for="itRarity">Rarity</label><select id="itRarity" value={it.rarity} onChange={e => { const v = e.currentTarget.value; set(x => { x.rarity = v; }); }}>{RARITY.map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label class="lbl" for="itValue">Value (optional)</label><input id="itValue" value={it.value} placeholder="2,500 gp" onInput={e => { const v = e.currentTarget.value; set(x => { x.value = v; }); }} /></div>
          </div>
          <div class="cc-gap">
            <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="itAttune" style="width:auto" checked={it.attune} onChange={e => { const v = e.currentTarget.checked; set(x => { x.attune = v; }); }} /> Requires attunement</label>
            {it.attune && <input id="itAttuneNote" style="margin-top:6px" value={it.attuneNote} placeholder="by a spellcaster, by a cleric or paladin… (optional)" onInput={e => { const v = e.currentTarget.value; set(x => { x.attuneNote = v; }); }} />}
          </div>
          <div class="cc-two cc-gap">
            {(isWeapon || it.kind === 'wand' || it.kind === 'staff' || it.kind === 'rod') && <div><label class="lbl" for="itBonus">Bonus to attack and damage</label><select id="itBonus" value={it.bonus} onChange={e => { const v = Number(e.currentTarget.value); set(x => { x.bonus = v; }); }}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n ? '+' + n : 'None'}</option>)}</select></div>}
            {(isArmor || it.kind === 'ring' || it.kind === 'wondrous' || it.kind === 'other') && <div><label class="lbl" for="itAc">Bonus to Armor Class</label><select id="itAc" value={it.ac} onChange={e => { const v = Number(e.currentTarget.value); set(x => { x.ac = v; }); }}>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n ? '+' + n : 'None'}</option>)}</select><div class="small muted">Added to a character’s Armor Class when they carry it (once attuned, if it needs that).</div></div>}
            {(isWeapon || it.kind === 'staff') && <div><label class="lbl" for="itDamage">Extra damage</label><input id="itDamage" value={it.damage} placeholder="+1d6 fire" onInput={e => { const v = e.currentTarget.value; set(x => { x.damage = v; }); }} /></div>}
            <div><label class="lbl" for="itCharges">Charges (0 for none)</label><input id="itCharges" type="number" min="0" max="99" value={it.charges || 0} onInput={e => { const v = Math.max(0, Math.min(99, Number(e.currentTarget.value) || 0)); set(x => { x.charges = v; }); }} /></div>
            {it.charges > 0 && <div><label class="lbl" for="itRecharge">Regains charges</label><select id="itRecharge" value={it.recharge} onChange={e => { const v = e.currentTarget.value; set(x => { x.recharge = v; }); }}>{RECHARGE.map(r => <option key={r} value={r}>{r || 'Not stated'}</option>)}</select></div>}
          </div>
          <label class="lbl cc-gap" for="itDesc">What it does</label>
          <textarea id="itDesc" rows="7" value={it.desc} placeholder="While you wear this cloak you have advantage on Dexterity (Stealth) checks…" onInput={e => { const v = e.currentTarget.value; set(x => { x.desc = v; }); }} />
          <div class="cc-gap"><b>Extra properties</b> <span class="muted small">(named abilities, a command word, a quirk)</span>
            {it.props.map((p, i) => (
              <div class="row-actions" style="margin-top:6px;align-items:flex-start" key={i}>
                <input style="flex:0 0 150px;width:150px" aria-label="Property name" data-propname={i} value={p.n} placeholder="Name" onInput={e => { const v = e.currentTarget.value; set(x => { x.props[i].n = v; }); }} />
                <textarea style="flex:1 1 240px" rows="2" aria-label="Property text" data-proptext={i} value={p.t} placeholder="What it does" onInput={e => { const v = e.currentTarget.value; set(x => { x.props[i].t = v; }); }} />
                <button class="btn btn-sm btn-ghost" aria-label="Remove property" onClick={() => set(x => { x.props.splice(i, 1); })}>×</button>
              </div>
            ))}
            <div><button class="btn btn-sm" id="itAddProp" style="margin-top:6px" onClick={() => set(x => { x.props.push({ n: '', t: '' }); })}>＋ Add a property</button></div>
          </div>
          <details class="cc-gap" open={!!(it.curse || it.history || it.hook)}><summary><b>For the DM</b> <span class="muted small">curse, history and hook</span></summary>
            <label class="lbl" for="itCurse">Curse or drawback</label>
            <textarea id="itCurse" rows="2" value={it.curse} placeholder="Once attuned, you cannot willingly part with it…" onInput={e => { const v = e.currentTarget.value; set(x => { x.curse = v; }); }} />
            <label class="lbl cc-gap" for="itHistory">History</label>
            <textarea id="itHistory" rows="2" value={it.history} onInput={e => { const v = e.currentTarget.value; set(x => { x.history = v; }); }} />
            <label class="lbl cc-gap" for="itHook">Hook</label>
            <textarea id="itHook" rows="2" value={it.hook} onInput={e => { const v = e.currentTarget.value; set(x => { x.hook = v; }); }} />
          </details>
          <div class="cc-note">Saved as a normal note, so it reads fine in Obsidian. “Add to campaign” copies it into the campaign you have open, in your Items folder.</div>
        </div>
        <aside class="card cc-side" id="itPreview" aria-label="Preview">
          <div class="muted small" style="margin-bottom:6px">Preview</div>
          <div class="md cc-md" dangerouslySetInnerHTML={{ __html: preview }} />
        </aside>
      </div>
    </>
  );
}

/* ============ what a character carries (in the creator's Equipment step) ============ */
export function CarryBox({ L, c }) {
  const [q, setQ] = useState('');
  const items = c.items || [];
  const mine = (L.itemList || []).filter(r => r.hasState);
  const have = new Set(items.map(i => i.n));
  const matches = mine.filter(r => !have.has(r.name) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const att = items.filter(i => i.attuned).length;
  return (
    <div class="cc-box" id="ccMagic">
      <b>Magic items</b> <span class="muted small">from your Items library</span>
      {items.length === 0 && <div class="muted small" style="margin-top:4px">None carried. {mine.length ? 'Add one below.' : 'Build items in the Items tab of the Character Library, then add them here.'}</div>}
      {items.map((i, k) => (
        <div class="row-actions" style="margin-top:6px;align-items:center" key={i.n} data-carry={i.n}>
          <b>{i.n}</b>{i.rarity && <span class={rarityClass(i.rarity)}>{i.rarity}</span>}{i.ac ? <span class="pill">+{i.ac} AC</span> : null}
          {i.req ? <label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" style="width:auto" checked={i.attuned} data-attune={i.n} onChange={() => libAttune(k)} /> Attuned</label> : <span class="muted small">no attunement</span>}
          <span style="flex:1" />
          <button class="btn btn-sm btn-ghost" aria-label={'Remove ' + i.n} data-carryremove={i.n} onClick={() => libSet(x => { x.items = x.items.filter((_, j) => j !== k); })}>×</button>
        </div>
      ))}
      {items.some(i => i.req) && <div class={'small ' + (att > ATTUNE_MAX ? 'cc-bad' : 'muted')} style="margin-top:6px" id="ccAttuned">Attuned to {att} of {ATTUNE_MAX}</div>}
      {mine.length > 0 && (
        <div class="row-actions" style="margin-top:8px;align-items:center">
          <input id="ccItemQ" style="width:180px" placeholder="Find an item" value={q} onInput={e => setQ(e.currentTarget.value)} />
          <select id="ccItemAdd" style="width:auto;max-width:260px" aria-label="Add an item" value="" onChange={e => { const r = mine.find(x => x.name === e.currentTarget.value); if (r) addFromRow(r); }}>
            <option value="">Add an item…</option>{matches.map(r => <option key={r.path} value={r.name}>{r.name}{(r.fm || {}).rarity ? ' · ' + r.fm.rarity : ''}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
function addFromRow(r) {
  const s = r.state || {};
  libCarry({ name: r.name, attune: !!s.attune, ac: Number(s.ac) || 0, rarity: s.rarity, kind: s.kind });
}

/* ============ "Add to campaign" ============ */
export function ImportDialog({ L, campaign }) {
  const imp = L.imp;
  if (!imp) return null;
  const name = imp.path.split('/').pop().replace(/\.md$/i, '');
  const isChar = imp.kind !== 'item';
  const row = isChar ? (L.list || []).find(r => r.path === imp.path) : (L.itemList || []).find(r => r.path === imp.path);
  const fm = (row && row.fm) || {};
  const type = isChar ? (String(fm.kind || 'pc') === 'npc' ? 'NPCs' : 'Players') : 'Items';
  const carried = isChar && L.c && L.c.items ? L.c.items : [];
  if (imp.done) {
    const main = imp.done[imp.done.length - 1];
    return (
      <Modal title="Added to the campaign" onClose={libImportClose}>
        <h3 style="margin-top:0">Added to {campaign}</h3>
        <ul id="impDone">{imp.done.map((d, i) => <li key={i} class="mono small">{d.path}</li>)}</ul>
        <p class="muted small">These are pending changes in the campaign, like any new note. Push them when you are ready.</p>
        <div class="modal-actions"><button class="btn" id="impClose" onClick={libImportClose}>Stay in the library</button><button class="btn btn-primary" id="impShow" onClick={() => libImportShow(main.path)}>Open it in {campaign}</button></div>
      </Modal>
    );
  }
  return (
    <Modal title="Add to the campaign" onClose={libImportClose}>
      <h3 style="margin-top:0">Add {name} to {campaign}</h3>
      <p>A copy goes into the campaign’s <b>{type}</b> folder as a pending change. The library file stays as it is, and later changes to either one do not touch the other.</p>
      {isChar && <p class="muted small" id="impNote">{String(fm.kind || 'pc') === 'npc' ? 'It is added as an NPC.' : 'It is added as a player, so the Party tracker picks up its level, hit points and Armor Class.'}</p>}
      {isChar && (L.itemList || []).length > 0 && (
        <label class="small" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="impWithItems" style="width:auto" checked={imp.withItems} onChange={e => { imp.withItems = e.currentTarget.checked; emit(); }} /> Also add the magic items this character carries (those not already in the campaign)</label>
      )}
      <div class="modal-actions"><button class="btn" id="impCancel" onClick={libImportClose}>Cancel</button><button class="btn btn-primary" id="impGo" disabled={imp.busy} onClick={libImportRun}>{imp.busy ? 'Adding…' : 'Add to campaign'}</button></div>
    </Modal>
  );
}
