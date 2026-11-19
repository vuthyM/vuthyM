export const join = (...p) => p.filter(Boolean).join('/').replace(/\/+/g, '/');
export const dirname = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
export const basename = p => p.slice(p.lastIndexOf('/') + 1);
export const stem = p => basename(p).replace(/\.[^.]+$/, '');
export const ext = p => { const m = basename(p).match(/\.([^.]+)$/); return m ? m[1].toLowerCase() : ''; };

export async function pool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/* A file-safe note name: no characters a file system or a [[link]] cannot hold, no leading dot (a dot file is hidden, so the note would
   vanish when the campaign is read back), composed accents (a Mac and Obsidian agree on one form), and short enough in bytes (a Mac allows 255). */
const clipBytes = (s, max) => { let out = '', n = 0; const enc = new TextEncoder(); for (const ch of s) { const b = enc.encode(ch).length; if (n + b > max) break; out += ch; n += b; } return out; };
export const sanitizeName = s => clipBytes(String(s || '').normalize('NFC').replace(/[\\/:*?"<>|#^\[\]\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/^[.\s]+/, '').replace(/[.\s]+$/, '').slice(0, 120), 200);

export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }

export const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp'];
