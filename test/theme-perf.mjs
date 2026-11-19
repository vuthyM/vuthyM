import { createRequire as __pwRequire } from 'node:module';
const { chromium } = __pwRequire(import.meta.url)('playwright');
import fs from 'node:fs'; import path from 'node:path'; import url from 'node:url'; import http from 'node:http';
const here = path.dirname(url.fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist', 'DM-Forge.html');
const srv = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(fs.readFileSync(dist)); }).listen(8773);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const big = process.argv[2] === 'big';
const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
const pg = await ctx.newPage();
await pg.goto('http://localhost:8773/');
await pg.click('text=Try the demo vault'); await pg.waitForSelector('text=What is in'); await pg.click('text=Looks good'); await pg.waitForSelector('.sidebar');
if (big) {
  await pg.evaluate(() => { const { S, touch } = window.__dmforge; for (let i = 0; i < 1500; i++) S.working.create('Ashfall/NPCs/Bulk ' + i + '.md', '# Bulk ' + i + '\n' + 'word '.repeat(200) + ' [[Bram Ironhollow]]\n'); touch(); });
  await pg.click('.nav-btn:has-text("NPCs")'); await pg.waitForTimeout(500);
}
for (const label of ['first', 'second']) {
  const r = await pg.evaluate(() => new Promise(res => {
    const frames = []; let last = performance.now(); const t0 = last; let stop = false;
    const lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
    const tick = t => { frames.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const s = performance.now();
    document.getElementById('themeToggle').click();
    const click = performance.now() - s;
    setTimeout(() => { stop = true; frames.sort((a, b) => b - a); res({ clickBlockMs: Math.round(click), worstFrames: frames.slice(0, 5).map(Math.round), frameCount: frames.length, longtasks: lt, theme: document.documentElement.dataset.theme }); }, 7000);
  }));
  console.log(label, JSON.stringify(r));
}
await b.close(); srv.close();
