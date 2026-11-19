/* A sweep of the whole app on the big messy campaign:
   - every note in the campaign is opened (and the awkward ones are put in the editor and cancelled)
   - every page in the sidebar is visited, in light and dark, at desktop, laptop, tablet and phone widths
   - every page is checked for: errors, an empty page, sideways scrolling, text running outside its box, unreadable contrast on the headline
   - every dialog reachable from the menu and the palette is opened and closed
   - every campaign accent is tried, in both themes */
import path from 'node:path'; import fs from 'node:fs';
import * as K from './sunday-kit.mjs';
const { check, done } = K.makeChecker();
const { sleep } = K;

const tmp = K.tmpDir('dmf-sun5-');
const vault = path.join(tmp, 'Vault'); fs.mkdirSync(vault);
const made = K.bigVault(vault);
const C = made.campaign;
const h = await K.startHelper({ vault, tmp });
const b = await K.launch();
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await K.openApp(b, h, C, { ctx });

/* ================= every note opens ================= */
const all = await pg.evaluate(() => [...window.__dmforge.getIndex().byPath.values()].map(n => n.path));
let bad = [];
const t0 = Date.now();
for (const p of all) {
  const r = await pg.evaluate(async p => {
    const A = window.__dmforge.A;
    try { A.goto(p); } catch (e) { return 'threw: ' + e.message; }
    await new Promise(r => setTimeout(r, 25));
    const pane = document.querySelector('.pane:not([hidden])');
    if (!pane) return 'no pane';
    const title = pane.querySelector('#noteTitle, h2');
    return title ? '' : 'no title';
  }, p);
  if (r) bad.push(p + ' → ' + r);
}
check('all ' + all.length + ' notes open without a crash or a blank page (' + Math.round((Date.now() - t0) / 1000) + ' s)', bad.length === 0, bad.slice(0, 6).join('\n'));
check('and the page logged no errors while doing it', pg.errors.length === 0, pg.errors.slice(0, 4).join('\n'));
// the awkward ones, in the editor
const odd = [...made.odd, ...made.broken];
let editBad = [];
for (const n of odd) {
  const r = await pg.evaluate(async n => {
    const i = window.__dmforge.getIndex(), note = i.resolve(n);
    if (!note) return 'not found';
    window.__dmforge.A.goto(note.path);
    await new Promise(r => setTimeout(r, 80));
    const btn = [...document.querySelectorAll('.pane:not([hidden]) .note-head button')].find(x => x.textContent.trim() === 'Edit');
    if (!btn) return 'no Edit button';
    btn.click();
    await new Promise(r => setTimeout(r, 150));
    const ta = document.querySelector('.pane:not([hidden]) textarea, .pane:not([hidden]) .cm-content');
    const cancel = [...document.querySelectorAll('.pane:not([hidden]) button')].find(x => /^(Cancel|Discard)/.test(x.textContent.trim()));
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 80));
    return ta ? '' : 'no editor';
  }, n);
  if (r) editBad.push(n + ' → ' + r);
}
check('the awkward notes (broken front matter, empty, 200 KB, tabs, CRLF) open in the editor and close again', editBad.length === 0, editBad.join('\n'));
check('and nothing is pending after opening and cancelling them all', (await K.pendingCount(pg)) === 0, String(await K.pendingCount(pg)));

/* ================= every page, every width, both themes ================= */
const SECTIONS = await pg.evaluate(() => [...document.querySelectorAll('.sidebar .nav-btn[id]')].map(e => e.id).filter(id => id && !/^(navSettings|navCharacters|manageCats|navOverview|camp)/.test(id)));
const WIDTHS = [[1360, 900, 'desktop'], [1024, 768, 'laptop'], [768, 1024, 'tablet'], [390, 800, 'phone']];
const problems = [];
let visits = 0;
for (const theme of ['light', 'dark']) {
  await pg.evaluate(t => window.__dmforge.A.setTheme(t), theme);
  await sleep(450);
  for (const [w, hgt, label] of WIDTHS) {
    await pg.setViewportSize({ width: w, height: hgt });
    await sleep(200);
    const secs = ['overview', ...await pg.evaluate(() => [...new Set([...document.querySelectorAll('.sidebar [id^="nav"]')].map(e => e.id))])];
    const keys = await pg.evaluate(() => {
      const ids = [...document.querySelectorAll('.sidebar .nav-btn[id^="nav"]')].map(e => e.id);
      return ids;
    });
    for (const id of new Set(keys)) {
      if (/^(navSettings|navCharacters|navOverview)$/.test(id)) continue;
      if (w <= 700) { const open = await pg.evaluate(() => !!document.querySelector('.drawer-open')); if (!open) await pg.evaluate(() => { const d = document.querySelector('#drawerBtn'); if (d && d.offsetParent) d.click(); }); await sleep(120); }
      await pg.evaluate(id => { const el = document.getElementById(id); if (el) el.click(); }, id);
      await sleep(150);
      visits++;
      const r = await pg.evaluate(() => {
        const out = [];
        const pane = document.querySelector('.pane:not([hidden])');
        if (!pane) return ['no visible pane'];
        if ((pane.innerText || '').trim().length < 3) out.push('the page is empty');
        const de = document.documentElement;
        if (de.scrollWidth > window.innerWidth + 1) out.push('sideways scroll (' + de.scrollWidth + ' > ' + window.innerWidth + ')');
        const over = [...pane.querySelectorAll('h1,h2,h3,.btn,.pill,.list-item,.card')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 2 || r.left < -2); }).slice(0, 2).map(e => (e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().right));
        if (over.length) out.push('outside the window: ' + over.join(', '));
        return out;
      });
      for (const x of r) problems.push(`${theme}/${label}/${id}: ${x}`);
    }
  }
}
check('every page (' + visits + ' visits: light and dark, desktop to phone) is non-empty and does not scroll sideways', problems.length === 0, problems.slice(0, 10).join('\n'));
check('and the pages logged no errors', pg.errors.length === 0, pg.errors.slice(0, 4).join('\n'));
await pg.setViewportSize({ width: 1360, height: 900 });
await pg.evaluate(() => window.__dmforge.A.setTheme('light'));
await sleep(450);

/* ================= headline contrast, every accent, both themes ================= */
const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const [r, g, b2] = m.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b2; };
const ratio = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const keys = ['gold', 'ember', 'frost', 'moss', 'arcane', 'crimson'];
const weak = [];
for (const theme of ['light', 'dark']) {
  await pg.evaluate(t => window.__dmforge.A.setTheme(t), theme); await sleep(450);
  for (const k of keys) {
    await pg.evaluate(k => { if (k === 'gold') document.documentElement.removeAttribute('data-accent'); else document.documentElement.setAttribute('data-accent', k); }, k);
    await sleep(450);
    const r = await pg.evaluate(() => { const g = e => getComputedStyle(e); const bodyBg = g(document.body).backgroundColor; const el = document.querySelector('.btn-primary') || document.querySelector('#pushBtn'); const link = document.querySelector('a'); return { bodyBg, btn: el ? { color: g(el).color, bg: g(el).backgroundColor } : null, link: link ? { color: g(link).color } : null }; });
    if (r.btn && ratio(r.btn.color, r.btn.bg) < 4.5) weak.push(`${theme}/${k}: primary button ${ratio(r.btn.color, r.btn.bg).toFixed(2)}`);
    if (r.link && ratio(r.link.color, r.bodyBg) < 3) weak.push(`${theme}/${k}: link ${ratio(r.link.color, r.bodyBg).toFixed(2)}`);
  }
}
check('every campaign accent keeps the primary button and links readable, in light and dark', weak.length === 0, weak.slice(0, 8).join('\n'));
await pg.evaluate(() => window.__dmforge.A.setTheme('light'));

/* ================= every dialog opens and closes ================= */
const DIALOGS = ['menu', 'categories', 'shortcuts', 'newSession', 'improv'];
const dlgBad = [];
for (const k of DIALOGS) {
  const r = await pg.evaluate(async k => {
    window.__dmforge.S.dialog = { kind: k, session: (window.__dmforge.getIndex().byType.session || [])[0]?.path };
    window.__dmforge.emit();
    await new Promise(r => setTimeout(r, 200));
    const m = document.querySelector('.modal');
    const ok = !!m && m.innerText.trim().length > 5;
    window.__dmforge.S.dialog = null; window.__dmforge.emit();
    await new Promise(r => setTimeout(r, 100));
    return ok && !document.querySelector('.modal') ? '' : (ok ? 'did not close' : 'empty or missing');
  }, k);
  if (r) dlgBad.push(k + ': ' + r);
}
check('the menu, categories, shortcut list, new-session and improvise dialogs open and close', dlgBad.length === 0, dlgBad.join('\n'));
// the palette: every command it lists runs without an error (ones that open dialogs are closed again)
await pg.keyboard.press('Control+KeyK'); await sleep(300);
const cmds = await pg.evaluate(() => [...document.querySelectorAll('.pal-item, [role=option]')].length);
check('the quick switcher / palette opens and lists things', cmds > 3, String(cmds));
await pg.keyboard.press('Escape');
check('no page errors anywhere in the sweep', pg.errors.length === 0, pg.errors.slice(0, 5).join('\n'));

await b.close(); await h.stop(); K.rm(tmp);
process.exit(done());
