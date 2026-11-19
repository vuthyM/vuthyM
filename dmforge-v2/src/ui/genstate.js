import { newGenState } from '../core/generators.js';

/* generator pages keep their rolled values while you move around the app. `inst` gives a generator more than one roll at a time
   (the "pick several" page has "m0", "m1"... for each copy of it); with no `inst` it is the single page's roll. */
export const genStates = new Map();
export function getGenState(g, inst) {
  const key = inst ? g.id + '#' + inst : g.id;
  if (!genStates.has(key)) genStates.set(key, newGenState(g));
  return genStates.get(key);
}
