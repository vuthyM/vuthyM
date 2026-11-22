import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import path from 'node:path'; import url from 'node:url';

/* Colour themes: Tide is the default; Fig, Olive and Classic can be chosen; dark and light both follow; a campaign accent still wins. */
const here = path.dirname(url.fileURLToPath(import.meta.url));
const results = [];
const check = (name, cond, extra) => { results.push(!!cond); console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + (extra ?? ''))); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto('file://' + path.join(here, '..', 'dist', 'DM-Forge.html'));
await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar');
const rgb = () => pg.evaluate(() => { const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim(); return { bg: g('--bg'), surface: g('--surface'), fg: g('--fg'), accent: g('--accent'), page: getComputedStyle(document.body).backgroundColor }; });
const settle = () => sleep(3400);          // the theme fades over about three seconds

check('Tide is the default: the attribute is set', (await pg.evaluate(() => document.documentElement.dataset.palette)) === 'tide');
await settle();
let c = await rgb();
check('on a dark Mac the page is deep navy, not brown', c.page === 'rgb(11, 21, 40)', c.page);
check('the accent is the soft rust', c.accent === 'rgb(232, 148, 106)', c.accent);

// the settings page lists the themes, and choosing one applies at once and is remembered
await pg.evaluate(() => window.__dmforge.A.openSettings('appearance'));
await pg.waitForSelector('#paletteGroup');
check('the settings page offers Tide, Fig, Olive and Classic', (await pg.locator('[data-palette-pick]').evaluateAll(a => a.map(x => x.dataset.palettePick))).join() === 'tide,fig,olive,classic');
check('Tide is marked as chosen', (await pg.getAttribute('#setPalette-tide', 'aria-checked')) === 'true');
check('the dark-style row is for Classic only, so it is not shown now', (await pg.locator('#setDarkWarm').count()) === 0);
await pg.click('#setPalette-fig'); await settle();
c = await rgb();
check('Fig changes the page to plum and the accent to dusty rose', c.page === 'rgb(29, 18, 27)' && c.accent === 'rgb(221, 154, 166)', JSON.stringify(c));
await pg.click('#setPalette-olive'); await settle();
c = await rgb();
check('Olive changes it to deep olive', c.page === 'rgb(21, 26, 18)' && c.accent === 'rgb(185, 202, 114)', JSON.stringify(c));
await pg.click('#setPalette-classic'); await settle();
c = await rgb();
check('Classic brings back the original brown-black and gold', c.page === 'rgb(24, 23, 20)' && c.accent === 'rgb(217, 164, 65)', JSON.stringify(c));
check('and the dark-style row comes back with it', (await pg.locator('#setDarkWarm').count()) === 1);
await pg.click('#setPalette-fig'); await sleep(300);
await pg.reload(); await pg.click('text=Try the demo vault'); await pg.waitForSelector('.sidebar'); await settle();
check('the choice survives a restart', (await pg.evaluate(() => document.documentElement.dataset.palette)) === 'fig' && (await rgb()).page === 'rgb(29, 18, 27)');

// light follows
await pg.evaluate(() => window.__dmforge.A.setTheme('light')); await settle();
c = await rgb();
check('light Fig is cream with plum ink, still a Fig', c.page === 'rgb(245, 237, 230)' && c.fg === 'rgb(50, 23, 39)' && c.accent === 'rgb(139, 52, 82)', JSON.stringify(c));
await pg.evaluate(() => window.__dmforge.A.updateSetting('palette', 'tide')); await settle();
c = await rgb();
check('light Tide is warm cream with navy ink and rust', c.page === 'rgb(242, 236, 223)' && c.fg === 'rgb(18, 32, 57)' && c.accent === 'rgb(166, 77, 31)', JSON.stringify(c));

// a campaign's own accent still wins over the theme's
await pg.evaluate(() => window.__dmforge.A.setTheme('dark')); await settle();
await pg.evaluate(() => window.__dmforge.A.setAccent('frost')); await settle();
c = await rgb();
check('a campaign accent (Frost) overrides the theme accent in dark', c.accent === 'rgb(98, 175, 229)' && c.page === 'rgb(11, 21, 40)', JSON.stringify(c));
await pg.evaluate(() => window.__dmforge.A.setTheme('light')); await settle();
check('and in light', (await rgb()).accent === 'rgb(38, 111, 162)');
await pg.evaluate(() => window.__dmforge.A.setAccent('gold')); await pg.evaluate(() => window.__dmforge.A.setTheme('dark')); await settle();
check('choosing the theme colour again gives back the theme accent', (await rgb()).accent === 'rgb(232, 148, 106)');

// restrained: the active page in the sidebar is a tint, not a solid accent block; the main button is solid
const act = await pg.evaluate(() => { const n = document.querySelector('.nav-btn[aria-current="page"]'); const cs = getComputedStyle(n); const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); return { bg: cs.backgroundColor, color: cs.color, acc }; });
check('the active sidebar page is a soft tint, not a solid accent block', act.bg !== act.acc && act.color !== act.bg, JSON.stringify(act));
const btn = await pg.evaluate(() => { const n = document.querySelector('#overviewOpen, #overviewNew'); return n ? { bg: getComputedStyle(n).backgroundColor, acc: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() } : null; });
await pg.evaluate(() => window.__dmforge.A.setSection('overview')); await sleep(300);
const btn2 = await pg.evaluate(() => { const n = document.querySelector('#overviewOpen.btn-primary, #overviewNew.btn-primary'); return n ? { bg: getComputedStyle(n).backgroundColor, acc: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() } : null; });
check('the one main button is solid accent', btn2 && btn2.bg === btn2.acc, JSON.stringify(btn2));

// real contrast on the page: body text, quiet text, links on the page, for every theme in both modes
const lum = ([r, g, bl]) => { const f = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(bl); };
const ratio = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const parse = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
let worst = 99, worstWhere = '';
for (const pal of ['tide', 'fig', 'olive']) for (const mode of ['dark', 'light']) {
  await pg.evaluate(([p, m]) => { window.__dmforge.A.updateSetting('palette', p); window.__dmforge.A.setTheme(m); }, [pal, mode]); await settle();
  const t = await pg.evaluate(() => { const cs = getComputedStyle(document.documentElement); const g = n => cs.getPropertyValue(n).trim(); return { bg: g('--bg'), surface: g('--surface'), fg: g('--fg'), muted: g('--fg-muted'), soft: g('--fg-soft'), accent: g('--accent') }; });
  for (const [k, a, b2] of [['text', t.fg, t.bg], ['quiet', t.muted, t.bg], ['quieter', t.soft, t.bg], ['link', t.accent, t.bg], ['card text', t.fg, t.surface]]) {
    const r = ratio(parse(a), parse(b2));
    if (r < worst) { worst = r; worstWhere = pal + ' ' + mode + ' ' + k; }
  }
}
check('every theme in both modes keeps text, quiet text and links at 4.5:1 or better on the real page (lowest: ' + worst.toFixed(1) + ', ' + worstWhere + ')', worst >= 4.5);
check('no page errors', errs.length === 0, errs.join('\n'));
await b.close();
const failed = results.filter(x => !x).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
process.exit(failed ? 1 : 0);
