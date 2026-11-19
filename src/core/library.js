/* The Character Library on disk: "Character Library/Characters/<name>.md" at the root of the vault, apart from any campaign.
   These are plain markdown files, written straight to the vault (like making a new campaign folder) and not held as pending changes.
   The example characters that come with the sample campaign live in "Character Library/Examples", never among yours. */
import { CHAR_FOLDER, EXAMPLE_FOLDER, LIB_FOLDER } from './chardata.js';
import { characterMarkdown, characterFromText, parseCharacterFile, fileNameOf } from './character.js';
import { patchFrontmatter } from './frontmatter.js';
import { join, stem } from './util.js';

const isMd = e => e.kind !== 'dir' && /\.md$/i.test(e.name) && !e.name.startsWith('.');
export const isExamplePath = p => String(p).startsWith(EXAMPLE_FOLDER + '/');

async function readFolder(vault, folder, example) {
  let entries = [];
  try { entries = await vault.list(folder); } catch (e) { return []; }
  const out = [];
  for (const e of entries.filter(isMd)) {
    const path = join(folder, e.name);
    try {
      const text = await vault.readText(path);
      const p = parseCharacterFile(text);
      out.push({ path, name: stem(path), fm: p.fm, hasState: !!p.state, example });
    } catch (err) { /* unreadable: left out */ }
  }
  return out;
}

/* every file in the library: { path, name, fm, hasState, example }. Yours come first (by name), then the examples. */
export async function listCharacters(vault) {
  const mine = await readFolder(vault, CHAR_FOLDER, false);
  const examples = await readFolder(vault, EXAMPLE_FOLDER, true);
  const by = (a, b) => a.name.localeCompare(b.name);
  return [...mine.sort(by), ...examples.sort(by)];
}

export const pathFor = (c, folder = CHAR_FOLDER) => join(folder, fileNameOf(c) + '.md');

/* writes the character; `oldPath` is the file it came from (renamed when the name changed). An example stays an example (and in Examples).
   Throws a plain message when it cannot. */
export async function saveCharacter(vault, data, c, { oldPath = '' } = {}) {
  const name = fileNameOf(c);
  if (!name) throw new Error('Give the character a name first.');
  const example = isExamplePath(oldPath);
  const folder = example ? EXAMPLE_FOLDER : CHAR_FOLDER;
  const path = pathFor(c, folder);
  if (path !== oldPath && (await vault.exists(path))) throw new Error('There is already a character called “' + name + '” in the library.');
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  await vault.mkdir(LIB_FOLDER);
  await vault.mkdir(folder);
  let text = characterMarkdown(data, Object.assign({}, c, { name }));
  if (example) text = patchFrontmatter(text, { example: true });
  await vault.writeText(path, text);
  if (oldPath && oldPath !== path && (await vault.exists(oldPath))) await vault.moveToTrash(oldPath);
  return path;
}

export async function loadCharacter(vault, data, path) {
  const text = await vault.readText(path);
  return { text, c: characterFromText(data, text, stem(path)) };
}

export async function deleteCharacter(vault, path) {
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  await vault.moveToTrash(path);
}

/* a free name for a copy: "Name copy", "Name copy 2"… (a copy is yours, so it goes among your own characters) */
export async function copyName(vault, name) {
  for (let i = 1; i < 100; i++) {
    const n = name + ' copy' + (i > 1 ? ' ' + i : '');
    if (!(await vault.exists(join(CHAR_FOLDER, n + '.md')))) return n;
  }
  return name + ' copy ' + Date.now();
}

/* ---------- the examples ---------- */
/* the text of a character made into an example: the same file with an "example: true" property */
export const asExample = text => patchFrontmatter(text, { example: true });

/* example characters from the sample that were added to Characters before examples had a folder of their own: the files there whose name
   and text are exactly what the sample wrote (one you opened and saved, or made yourself with the same name, is never matched).
   `shipped` is { name: text } for the examples that come with DM Forge. */
export async function looseExamples(vault, shipped) {
  const found = [];
  let entries = [];
  try { entries = await vault.list(CHAR_FOLDER); } catch (e) { return found; }
  for (const e of entries.filter(isMd)) {
    const name = e.name.replace(/\.md$/i, '');
    if (!(name in shipped)) continue;
    try { if ((await vault.readText(join(CHAR_FOLDER, e.name))) === shipped[name]) found.push(join(CHAR_FOLDER, e.name)); } catch (err) { /* skip */ }
  }
  return found;
}
/* moves those files into Examples (one that is already there is left where it is); returns how many moved */
export async function moveToExamples(vault, paths) {
  if (!paths.length) return 0;
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  await vault.mkdir(LIB_FOLDER); await vault.mkdir(EXAMPLE_FOLDER);
  let n = 0;
  for (const p of paths) {
    const dest = join(EXAMPLE_FOLDER, stem(p) + '.md');
    if (await vault.exists(dest)) continue;
    await vault.writeText(dest, asExample(await vault.readText(p)));
    await vault.moveToTrash(p);
    n++;
  }
  return n;
}
/* removes every example (they go to the vault's trash folder); returns how many */
export async function removeExamples(vault) {
  const list = await readFolder(vault, EXAMPLE_FOLDER, true);
  if (!list.length) return 0;
  if (!(await vault.ensureWrite())) throw new Error('Write permission for the folder was not granted.');
  for (const e of list) await vault.moveToTrash(e.path);
  return list.length;
}
