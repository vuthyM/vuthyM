import { useApp } from './store.js';
import { effectiveTheme, toggleTheme } from './actions.js';

/* sun and moon swap places with a turn and a fade; the colours of the whole page change with the transition in actions.js */
export function ThemeToggle({ floating }) {
  useApp();
  const dark = effectiveTheme() === 'dark';
  return (
    <button class={'theme-toggle' + (floating ? ' floating' : '') + (dark ? ' is-dark' : '')} id="themeToggle" aria-pressed={dark}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={(dark ? 'Switch to light mode' : 'Switch to dark mode') + ' (Shift-click: follow the system)'} onClick={toggleTheme}>
      <svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7 7 17M17 7l1.7-1.7" /></svg>
      <svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" /></svg>
    </button>
  );
}
