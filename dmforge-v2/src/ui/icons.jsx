/* The small line icons used in the sidebar and the top bar (all drawn the same way: 24 by 24, a 1.7 stroke). */
const P = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5',
  lines: 'M4 6h16 M4 12h10 M4 18h13',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  people: 'M16 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M20 20v-2a3 3 0 0 0-2-2.8 M15 4.2a3 3 0 0 1 0 5.6',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  bag: 'M6 8h12l1 12H5z M9 8a3 3 0 0 1 6 0',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14',
  paw: 'M12 4c4 0 7 2 7 6s-3 5-3 8H8c0-3-3-4-3-8s3-6 7-6z',
  file: 'M6 3h8l4 4v14H6z M14 3v4h4',
  party: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  swords: 'M5 19L19 5 M14 5h5v5 M5 5l14 14 M5 10V5h5',
  spark: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2 2 M16 16l2 2 M18 6l-2 2 M8 16l-2 2',
  rules: 'M4 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H4z M20 5h-6',
  graph: 'M6 6a2 2 0 1 0 0 .1 M18 8a2 2 0 1 0 0 .1 M12 18a2 2 0 1 0 0 .1 M7.5 7.5l3.5 8.5 M16.5 9.5L13 16 M8 6h8',
  id: 'M3 5h18v14H3z M9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M6 16a3 3 0 0 1 6 0 M14 9h5 M14 13h4',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.5 7.5 0 0 0-1.8-1L15 3.5h-4l-.3 2.5a7.5 7.5 0 0 0-1.8 1l-2.3-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.5 7.5 0 0 0 1.8 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.8-1l2.3 1 2-3.5z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M21 21l-5-5',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 1.5 M9 2h6',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01',
  pencil: 'M4 20h4L19 9l-4-4L4 16z',
  cheat: 'M5 4h14v16H5z M9 8h6 M9 12h6 M9 16h4',
  chev: 'M6 9l6 6 6-6',
  panel: 'M3 5h18v14H3z M9 5v14',
  pinned: 'M9 4h6l-1 6 3 3H7l3-3z M12 13v7',
  back: 'M15 6l-6 6 6 6',
  forward: 'M9 6l6 6-6 6',
  history: 'M3 12a9 9 0 1 0 3-6.7 M3 4v5h5 M12 8v4l3 2',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  x: 'M6 6l12 12 M18 6L6 18',
  plus: 'M12 5v14 M5 12h14',
  fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  shuffle: 'M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5',
  wand: 'M5 19L17 7 M15 5l4 4 M5 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  swap: 'M7 7h12l-3-3 M17 17H5l3 3',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  move: 'M5 12h14 M13 6l6 6-6 6',
  ext: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  tab: 'M3 6h18v12H3z M3 10h18',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  layout: 'M3 5h18v14H3z M12 5v14',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
};
export const iconPaths = name => P[name] || P.file;
export function Icon({ name, size = 18, fill = false, stroke }) {
  const d = iconPaths(name).split(' M').map((x, i) => (i ? 'M' + x : x));
  return (
    <svg class="ico" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={stroke || (name === 'more' ? 3.2 : 1.7)} stroke-linecap="round" stroke-linejoin="round">
      {d.map((x, i) => <path key={i} d={x} />)}
    </svg>
  );
}
