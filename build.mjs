import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
fs.mkdirSync(out, { recursive: true });

import { paletteCss } from './src/core/palettes.js';
fs.writeFileSync(path.join(here, 'src/ui/palettes.css'), paletteCss());
const version = fs.readFileSync(path.join(here, 'VERSION'), 'utf8').trim();
const result = await build({
  entryPoints: [path.join(here, 'src/ui/main.jsx')],
  bundle: true,
  write: false,
  outdir: out,
  format: 'iife',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: true,
  target: ['chrome110'],
  loader: { '.css': 'css', '.woff2': 'dataurl' },
  legalComments: 'none',
  define: { __DMF_VERSION__: JSON.stringify(version) },
  logLevel: 'warning',
});

let js = '', css = '';
for (const f of result.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  else if (f.path.endsWith('.css')) css = f.text;
}
const safeJs = js.replace(/<\/script/gi, '<\\/script');
/* the logo (a gold "D" tile, as in the top bar) as the tab icon, inlined so the single file stays single */
const favicon = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#e8946a"/><text x="32" y="46" text-anchor="middle" font-family="Georgia,\'Times New Roman\',serif" font-weight="700" font-size="42" fill="#1d1008">D</text></svg>');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DM Forge</title>
<link rel="icon" type="image/svg+xml" href="${favicon}">
<!--DMF_SERVER-->
<script>try{var t=localStorage.getItem('dmforge:theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<noscript>DM Forge needs JavaScript enabled.</noscript>
<script>${safeJs}</script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, 'DM-Forge.html'), html);
console.log('Built dist/DM-Forge.html (' + Math.round(html.length / 1024) + ' KB)');
