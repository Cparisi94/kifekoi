/* Kifékoi — utilitaires (dates, formatage, divers) */

export const DAY_MS = 86400000;

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const DATE_SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const DAY_NUM = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const TIME_FMT = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function toLocalISO(d = new Date()) {
  return `${toDateISO(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Accepte 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm' — renvoie une Date locale. */
export function parseLocal(str) {
  if (!str) return null;
  if (str instanceof Date) return new Date(str.getTime());
  const [datePart, timePart] = String(str).split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = (timePart || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

/** Début d'un événement (payload avec date/time/allDay). */
export function startOf(p) {
  return parseLocal(p.allDay ? `${p.date}T00:00` : `${p.date}T${p.time || '00:00'}`);
}

export function startOfDay(d = new Date()) {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

export function addInterval(date, every, unit) {
  const d = new Date(date.getTime());
  const n = Number(every) || 1;
  if (unit === 'day') { d.setDate(d.getDate() + n); return d; }
  if (unit === 'week') { d.setDate(d.getDate() + 7 * n); return d; }
  if (unit === 'year') return addInterval(date, n * 12, 'month');
  // mois (avec gestion des fins de mois)
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function isToday(d) {
  return sameDay(d instanceof Date ? d : parseLocal(d), new Date());
}

function asDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  return parseLocal(v);
}

export function fmtLong(d) {
  return DATE_FMT.format(asDate(d));
}

export function fmtDate(d) {
  return DATE_SHORT.format(asDate(d));
}

/** Date courte + année si elle diffère de l'année en cours. */
export function fmtDateY(d) {
  const date = asDate(d);
  const short = DATE_SHORT.format(date);
  return date.getFullYear() === new Date().getFullYear() ? short : `${short} ${date.getFullYear()}`;
}

export function fmtFull(d) {
  return DAY_NUM.format(asDate(d));
}

export function fmtTime(d) {
  if (!d) return '';
  return TIME_FMT.format(asDate(d));
}

export function fmtDateTime(d) {
  return `${fmtDate(d)} · ${fmtTime(d)}`;
}

export function fmtMonth(d) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
}

export function fmtMonthShort(d) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(asDate(d)).replace('.', '');
}

export function relLabel(d) {
  const target = startOfDay(asDate(d));
  const today = startOfDay(new Date());
  const diff = Math.round((target - today) / DAY_MS);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff > 1 && diff < 7) return `Dans ${diff} jours`;
  if (diff < -1 && diff > -7) return `Il y a ${-diff} jours`;
  return fmtDate(target);
}

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const REM_LABELS = [
  [10080, '1 semaine avant'],
  [4320, '3 jours avant'],
  [2880, '2 jours avant'],
  [1440, '1 jour avant'],
  [720, '12 h avant'],
  [240, '4 h avant'],
  [120, '2 h avant'],
  [60, '1 h avant'],
  [30, '30 min avant'],
  [0, 'À l\u2019heure'],
];

export function minutesLabel(m) {
  const found = REM_LABELS.find(([v]) => v === m);
  if (found) return found[1];
  if (m % 1440 === 0) return `${m / 1440} j avant`;
  if (m % 60 === 0) return `${m / 60} h avant`;
  return `${m} min avant`;
}

/** Numéro de semaine ISO 8601 (lundi = début de semaine). */
export function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first.getTime());
  const dow = (first.getDay() + 6) % 7; // lundi = 0
  start.setDate(first.getDate() - dow);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let i = 0; i < 7; i++) {
      row.push(new Date(start.getTime()));
      start.setDate(start.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/** Nettoie une date ISO pour Supabase (format timestamp). */
export function toTimestamp(ms) {
  return new Date(ms).toISOString();
}
