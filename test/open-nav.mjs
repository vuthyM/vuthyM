/* Preload for the browser tests: --import this file. The sidebar folds its groups (one open at a time), so Playwright
   would find most nav buttons "not visible". Tests that are not about folding keep every group open. */
import { createRequire } from 'node:module';
import path from 'node:path'; import url from 'node:url';
const here = path.dirname(url.fileURLToPath(import.meta.url));
let other = null; try { other = createRequire(path.join(here, 'x.js'))('playwright').chromium; } catch {}
const CSS = '.nav-items[hidden]{display:block !important}';
for (const cr of [other]) if (cr) { const launch = cr.launch.bind(cr);
 cr.launch = async (...a) => {
  const b = await launch(...a);
  const nc = b.newContext.bind(b);
  b.newContext = async (...x) => {
    const c = await nc(...x);
    await c.addInitScript(() => { try { localStorage.setItem('dmforge:sp-cast', '1'); } catch (e) { /* storage unavailable */ } });
    await c.addInitScript(css => { if (window.__keepNavOpen) return; window.__keepNavOpen = 1; const add = () => { const st = document.createElement('style'); st.textContent = css; document.documentElement.appendChild(st); }; document.documentElement ? add() : document.addEventListener('DOMContentLoaded', add); }, CSS);
    const np = c.newPage.bind(c);
    c.newPage = async (...y) => {
      const pg = await np(...y);
      const click = pg.click.bind(pg);
      const wait = pg.waitForSelector.bind(pg);
      const MENU = /^#(suggestLinks|existingLinks|addLink|pinNote|renameBtn|reformatBtn|moveBtn|askClaudeBtn|graphBtn|newTabBtn|addTemplateBtn|editTemplateBtn|deleteBtn)$/;
      pg.waitForSelector = (sel, o) => (typeof sel === 'string' && MENU.test(sel) && !(o && o.state) ? wait(sel, { ...o, state: 'attached' }) : wait(sel, o));
      // items of a closed menu are in the page but hidden: press them directly, as someone who has opened the menu would
      pg.click = async (sel, o) => {
        // a narrow window keeps the sidebar in a drawer: open it for someone reaching for a nav button
        if (typeof sel === 'string' && /^(\.nav-btn|#nav|#camp|#manageCats)/.test(sel)) {
          const need = await pg.evaluate(() => { const d = document.querySelector('#drawerBtn'); return !!d && d.offsetParent !== null && !document.querySelector('.drawer-open'); }).catch(() => false);
          if (need) { await click('#drawerBtn'); await pg.waitForTimeout(250); }
        }
        if (typeof sel === 'string' && !/^text=|>>/.test(sel)) {
          const hid = await pg.evaluate(q => { const e = document.querySelector(q); return !!e && e.offsetParent === null && !!e.closest('.popmenu-pop'); }, sel).catch(() => false);
          if (hid) return pg.evaluate(q => document.querySelector(q).click(), sel);
        }
        return click(sel, o);
      };
      return pg;
    };
    return c;
  };
  return b;
};
}
