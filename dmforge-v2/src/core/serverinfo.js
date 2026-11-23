/* Reading the V3 server's own report (Settings, Server): sizes and times in words, and what in it needs a look. No page code in here, so it can be tested. */
const GB = 1024 ** 3;

export function bytesText(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= GB) return (n / GB).toFixed(n >= 10 * GB ? 0 : 1) + ' GB';
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(n >= 10 * 1024 ** 2 ? 0 : 1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' bytes';
}
export function agoText(ms, now = Date.now()) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  const d = Math.round(s / 86400);
  return d + (d === 1 ? ' day ago' : ' days ago');
}
export function inText(ms, now = Date.now()) {
  const m = Math.max(0, Math.round((ms - now) / 60000));
  return m < 60 ? m + ' min' : Math.round(m / 60) + ' h';
}

export const lowDisk = disk => !!(disk && disk.total && (disk.free < 2 * GB || disk.free / disk.total < 0.1));

/* what in the report needs a look, as one sentence ('' when all is well) */
export function serverWarning(info, now = Date.now()) {
  if (!info) return '';
  const out = [];
  if (lowDisk(info.disk)) out.push('The server is running low on disk space.');
  const b = info.backup && info.backup.last;
  if (b && !b.ok) out.push('The last nightly backup failed.');
  else if (b && b.ok && now - b.at > 36 * 3600000) out.push('There has been no nightly backup for over a day and a half.');
  else if (!b && info.notes > 0 && info.up_hours > 30) out.push('There has been no nightly backup yet.');
  const u = info.update;
  if (u && (u.state === 'failed' || u.state === 'rolled-back')) out.push('The last update did not install (' + (u.version || 'new version') + '): the server stayed on the old version.');
  if (info.checked_at && now - info.checked_at > 15 * 60000 && !(info.hold_until && info.hold_until > now)) out.push('The server has not looked for updates in ' + Math.round((now - info.checked_at) / 60000) + ' minutes.');
  return out.join(' ');
}
