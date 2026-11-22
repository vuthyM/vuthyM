/* Colour themes. Each has a dark and a light version with the same character. The look is deep and calm rather than grey:
   a rich base hue (navy, plum, olive), cream for the light parts, and one soft warm accent used sparingly.
   "classic" (the original warm brown and gold) has no entry here: it is what styles.css defines on its own.

   Every pair that carries text is checked in the tests (WCAG contrast): text on its background, muted text, the accent as a link and as a
   button, and the kind colours (people, places, items, story) on the surface. Change a colour here and the tests say if it got too faint.

   src/ui/palettes.css is generated from this file by build.mjs; it is committed so the page can be read without a build. */

const common = {
  dark: { shadow: '0 16px 36px -14px rgba(0,0,0,.65)' },
  light: { shadow: '0 12px 30px -16px rgba(20,28,45,.35)' },
};

export const PALETTES = [
  {
    id: 'tide', label: 'Tide', blurb: 'Deep navy and cream with a rust accent',
    dark: {
      bg: '#111b2c', surface: '#172338', surface2: '#1e2d46', border: '#2d405e',
      fg: '#ebe4d4', fgMuted: '#a3afc2',
      accent: '#e8946a', accentFg: '#1d1008',
      danger: '#ef8a8a', good: '#7fcb9d', warn: '#e3bd6c',
      cPeople: '#bfa5ea', cPlaces: '#7fcdc4', cItems: '#8db6ee', cStory: '#b0cf84',
    },
    light: {
      bg: '#f2ecdf', surface: '#fbf8f0', surface2: '#e9e1d0', border: '#d5cab4',
      fg: '#17243b', fgMuted: '#566379',
      accent: '#a64d1f', accentFg: '#fff7ee',
      danger: '#b3372f', good: '#2c7549', warn: '#855608',
      cPeople: '#6d4a8f', cPlaces: '#1f766e', cItems: '#2a5d9c', cStory: '#536c22',
    },
  },
  {
    id: 'fig', label: 'Fig', blurb: 'Plum and cream with a dusty rose accent',
    dark: {
      bg: '#1d121b', surface: '#261a25', surface2: '#30212f', border: '#473349',
      fg: '#f0e4de', fgMuted: '#b6a0ad',
      accent: '#dd9aa6', accentFg: '#2a1018',
      danger: '#f2907f', good: '#86c99c', warn: '#e3bd6c',
      cPeople: '#c9a6e8', cPlaces: '#7fcdc4', cItems: '#8db6ee', cStory: '#b0cf84',
    },
    light: {
      bg: '#f5ede6', surface: '#fdf9f4', surface2: '#ede2d8', border: '#dccdc2',
      fg: '#321727', fgMuted: '#755d6c',
      accent: '#8b3452', accentFg: '#fff4f2',
      danger: '#b3372f', good: '#2c7549', warn: '#855608',
      cPeople: '#7a4a9a', cPlaces: '#1f766e', cItems: '#2a5d9c', cStory: '#536c22',
    },
  },
  {
    id: 'olive', label: 'Olive', blurb: 'Deep olive and cream with a soft leaf-green accent',
    dark: {
      bg: '#151a12', surface: '#1c2318', surface2: '#242d1f', border: '#38442f',
      fg: '#eceadb', fgMuted: '#a5ad94',
      accent: '#b9ca72', accentFg: '#14190a',
      danger: '#ef8a8a', good: '#7fcb9d', warn: '#e3bd6c',
      cPeople: '#bfa5ea', cPlaces: '#7fcdc4', cItems: '#8db6ee', cStory: '#c3d98a',
    },
    light: {
      bg: '#f0eedd', surface: '#fbfaf0', surface2: '#e5e2cc', border: '#d1ceb3',
      fg: '#1f2915', fgMuted: '#596647',
      accent: '#4f6a1c', accentFg: '#fbfbee',
      danger: '#b3372f', good: '#2c7549', warn: '#855608',
      cPeople: '#6d4a8f', cPlaces: '#1f766e', cItems: '#2a5d9c', cStory: '#4d6620',
    },
  },
];

export const PALETTE_IDS = ['classic', ...PALETTES.map(p => p.id)];
export const DEFAULT_PALETTE = 'tide';
export const paletteId = v => (PALETTE_IDS.includes(v) ? v : DEFAULT_PALETTE);

/* a tint of the main colour over a surface, for the soft backgrounds of warnings, errors and successes */
const soft = (c, s) => 'color-mix(in srgb,' + c + ' 14%,' + s + ')';

function block(t, extra) {
  return '--bg:' + t.bg + ';--surface:' + t.surface + ';--surface-2:' + t.surface2 + ';--border:' + t.border + ';'
    + '--fg:' + t.fg + ';--fg-muted:' + t.fgMuted + ';--accent:' + t.accent + ';--accent-fg:' + t.accentFg + ';'
    + '--danger:' + t.danger + ';--danger-bg:' + soft(t.danger, t.surface) + ';--good:' + t.good + ';--good-bg:' + soft(t.good, t.surface) + ';'
    + '--warn:' + t.warn + ';--warn-bg:' + soft(t.warn, t.surface) + ';'
    + '--c-people:' + t.cPeople + ';--c-places:' + t.cPlaces + ';--c-items:' + t.cItems + ';--c-danger:' + t.danger + ';--c-story:' + t.cStory + ';'
    + '--shadow:' + extra.shadow + ';';
}

/* the stylesheet: for each theme the light values, then the dark ones when the Mac is dark (and not forced light) or dark is chosen */
export function paletteCss() {
  const out = ['/* generated from src/core/palettes.js by build.mjs: do not edit by hand */'];
  for (const p of PALETTES) {
    const sel = ':root[data-palette="' + p.id + '"]';
    out.push(sel + '{' + block(p.light, common.light) + '}');
    out.push('@media (prefers-color-scheme: dark){' + sel + ':not([data-theme="light"]){color-scheme:dark;' + block(p.dark, common.dark) + '}}');
    out.push(sel + '[data-theme="dark"]{color-scheme:dark;' + block(p.dark, common.dark) + '}');
  }
  return out.join('\n') + '\n';
}

/* ---- contrast (WCAG 2) ---- */
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
