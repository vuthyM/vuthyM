/* Metric only. The books print feet, miles and pounds; anything the generators roll, and every library entry, is rewritten with the
   conversions the 2024 books use: 5 ft = 1.5 m (so 1 ft = 0.3 m), 1 mile = 1.5 km, 1 lb = 0.5 kg. */

const num = n => { const r = Math.round(n * 10) / 10; return String(r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)); };
const comma = s => +String(s).replace(/,/g, '');

const RULES = [
  [/(\d[\d,]*) ?× ?(\d[\d,]*) ?(?:ft|feet)\b/g, (m, a, b) => num(comma(a) * 0.3) + ' × ' + num(comma(b) * 0.3) + ' m'],
  [/(\d[\d,]*) cubic (?:feet|foot)\b/g, (m, a) => num(comma(a) * 0.03) + ' cubic metres'],
  [/(\d[\d,]*)(-| )(?:foot|feet|ft)\b/g, (m, a, sep) => num(comma(a) * 0.3) + (sep === '-' ? '-metre' : ' m')],
  [/(\d[\d,]*)(-| )(?:mile|miles)\b/g, (m, a, sep) => num(comma(a) * 1.5) + (sep === '-' ? '-km' : ' km')],
  [/(\d[\d,]*)(-| )(?:pound|pounds|lb|lbs)\b/g, (m, a, sep) => num(comma(a) * 0.5) + (sep === '-' ? '-kg' : ' kg')],
  [/(\d[\d,]*)(-| )(?:inch|inches)\b/g, (m, a, sep) => num(comma(a) * 2.5) + (sep === '-' ? '-cm' : ' cm')],
];

/* text, or a list of texts, rewritten in metric (anything else comes back untouched) */
export function metricize(v) {
  if (Array.isArray(v)) return v.map(metricize);
  if (typeof v !== 'string') return v;
  let s = v;
  for (const [re, fn] of RULES) s = s.replace(re, fn);
  return s;
}
