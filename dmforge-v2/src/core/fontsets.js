/* The typeface sets you can choose in Settings. `head` is for titles, `body` for text and buttons, `mono` for numbers (HP, initiative, the timer).
   Every font is embedded in the app (src/ui/fonts.css), so any set works offline. The CSS for each set is in styles.css, keyed by id. */
export const FONT_SETS = [
  { id: 'today', name: 'Today', head: 'Fraunces', body: 'Work Sans', mono: 'IBM Plex Mono', note: 'A soft, quirky serif for titles with a friendly sans underneath. The one DM Forge has always had.' },
  { id: 'manuscript', name: 'Manuscript', head: 'Cinzel', body: 'Source Sans 3', mono: 'IBM Plex Mono', note: 'Classical Roman capitals for titles, like the chapter heads of a rulebook. The most fantasy.' },
  { id: 'storybook', name: 'Storybook', head: 'Alegreya', body: 'Alegreya Sans', mono: 'DM Mono', note: 'One calligraphic family for titles and text. Feels like a printed novel. The most bookish.' },
  { id: 'clear', name: 'Clear and Bookish', head: 'Literata', body: 'Atkinson Hyperlegible', mono: 'JetBrains Mono', note: 'A reading serif for titles and a sans designed so every letter is unmistakable. Easy to read in a dim room.' },
  { id: 'bold', name: 'Warm and Bold', head: 'Young Serif', body: 'Figtree', mono: 'Fira Code', note: 'A chunky, friendly serif for titles over a round, clean sans. Reads well across the table.' },
  { id: 'clean', name: 'Clean', head: 'Plus Jakarta Sans', body: 'Inter', mono: 'JetBrains Mono', note: 'Modern and neutral. Nothing to notice, which is the point.' },
  { id: 'modern', name: 'Modern with Character', head: 'Bricolage Grotesque', body: 'DM Sans', mono: 'DM Mono', note: 'A grotesque with a few quirks in the titles over a calm sans. Playful without leaning fantasy.' },
];
export const FONT_SET_IDS = FONT_SETS.map(f => f.id);
export const fontSetOf = id => FONT_SETS.find(f => f.id === id) || FONT_SETS[0];
