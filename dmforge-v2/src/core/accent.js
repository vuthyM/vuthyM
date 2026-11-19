/* A campaign can have its own accent colour: the colour of the buttons, links, the active page and the focus ring.
   Each is a pair, one for the light theme (dark enough for white text on it and for links on white and cream, at least 4.5:1) and one
   for the dark theme (light enough to read on the dark surfaces, at least 6:1). Gold is the app's own and needs no override. */
export const ACCENTS = [
  { key: 'gold', label: 'Gold', light: '#8a6218', dark: '#d9a441' },
  { key: 'ember', label: 'Ember', light: '#b6451b', dark: '#f28d68' },
  { key: 'frost', label: 'Frost', light: '#266fa2', dark: '#62afe5' },
  { key: 'moss', label: 'Moss', light: '#317831', dark: '#3cbf3c' },
  { key: 'arcane', label: 'Arcane', light: '#8350bd', dark: '#bb99e1' },
  { key: 'crimson', label: 'Crimson', light: '#c8293e', dark: '#ef8a98' },
];
export const accentKey = v => (ACCENTS.some(a => a.key === v) ? v : 'gold');
export const accentOf = key => ACCENTS.find(a => a.key === accentKey(key));
