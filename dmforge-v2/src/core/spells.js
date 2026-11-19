/* The spell library: the SRD 5.2.1 spells that come with DM Forge (CC-BY 4.0, unpacked the first time they are needed).

   This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at
   https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License,
   available at https://creativecommons.org/licenses/by/4.0/legalcode. */
import { SPELLS_GZ_B64 } from '../data/srd-spells.js';
import { metricize } from './units.js';
import { SRD_CREDIT } from './monsters.js';

export { SRD_CREDIT };
export const SPELL_FOLDERS = /^(spells?|spellbook|grimoire)$/i;
let spells = null, loading = null;
export const spellsLoaded = () => spells;
export function loadSpells() {
  if (spells) return Promise.resolve(spells);
  if (!loading) {
    loading = (async () => {
      const bin = atob(SPELLS_GZ_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
      spells = JSON.parse(text).map(r => Object.assign(r, { key: 'spell:' + r.id }));
      return spells;
    })().catch(e => { loading = null; throw e; });
  }
  return loading;
}

export const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
export const SPELL_CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
export const levelLabel = lv => (lv === 0 ? 'Cantrip' : lv + ['st', 'nd', 'rd'][lv - 1 > 2 ? 3 : lv - 1] || lv + 'th');
const ord = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
export const levelName = lv => (lv === 0 ? 'Cantrip' : ord(lv) + ' level');

export function searchSpells(list, { q = '', level = '', school = '', cls = '', concentration = false, ritual = false } = {}) {
  const s = String(q || '').trim().toLowerCase();
  const out = [];
  for (const sp of list) {
    if (level !== '' && sp.lv !== Number(level)) continue;
    if (school && sp.sc !== school) continue;
    if (cls && !sp.cl.includes(cls)) continue;
    if (concentration && !sp.cn) continue;
    if (ritual && !sp.ri) continue;
    const name = sp.n.toLowerCase();
    let rank = 3;
    if (!s) rank = 0;
    else if (name.startsWith(s)) rank = 0;
    else if (name.includes(s)) rank = 1;
    else if (sp.ds.toLowerCase().includes(s)) rank = 2;
    else continue;
    out.push([rank, sp]);
  }
  out.sort((a, b) => a[0] - b[0] || a[1].lv - b[1].lv || a[1].n.localeCompare(b[1].n));
  return out.map(x => x[1]);
}

/* the spell as markdown (metric when that is the setting) */
export function spellMarkdown(sp) {
  const lines = [];
  lines.push('*' + (sp.lv === 0 ? sp.sc + ' cantrip' : levelName(sp.lv) + ' ' + sp.sc.toLowerCase()) + (sp.ri ? ' (ritual)' : '') + (sp.cl.length ? ' · ' + sp.cl.join(', ') : '') + '*', '');
  lines.push('**Casting Time** ' + sp.ct + '  ');
  lines.push('**Range** ' + sp.rg + '  ');
  lines.push('**Components** ' + sp.cp + '  ');
  lines.push('**Duration** ' + sp.du + '  ');
  lines.push('', sp.ds);
  if (sp.up) lines.push('', '**Using a Higher-Level Spell Slot.** ' + sp.up);
  return metricize(lines.join('\n'));
}
export function spellNote(sp) {
  const fm = { level: sp.lv, school: sp.sc, classes: sp.cl, concentration: sp.cn, ritual: sp.ri, source: 'SRD 5.2.1 (CC-BY 4.0)' };
  return { fm, body: '# ' + sp.n + '\n\n' + spellMarkdown(sp) + '\n\n---\n_' + SRD_CREDIT + '_\n' };
}
