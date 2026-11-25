/* Jours fériés français (métropole). Calcul automatique, y compris Pâques. */

const cache = {};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function iso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function frenchHolidays(year) {
  if (cache[year]) return cache[year];
  const easter = easterSunday(year);
  const shift = (n) => {
    const x = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + n);
    return iso(x);
  };

  const list = [
    { label: "Jour de l'an", date: `${year}-01-01` },
    { label: 'Lundi de Pâques', date: shift(1) },
    { label: 'Fête du Travail', date: `${year}-05-01` },
    { label: 'Victoire 1945', date: `${year}-05-08` },
    { label: 'Ascension', date: shift(39) },
    { label: 'Lundi de Pentecôte', date: shift(50) },
    { label: 'Fête nationale', date: `${year}-07-14` },
    { label: 'Assomption', date: `${year}-08-15` },
    { label: 'Toussaint', date: `${year}-11-01` },
    { label: 'Armistice 1918', date: `${year}-11-11` },
    { label: 'Noël', date: `${year}-12-25` },
  ];

  cache[year] = list;
  return list;
}

export function holidayOn(dateISO) {
  if (!dateISO) return null;
  const year = Number(String(dateISO).slice(0, 4));
  if (!year) return null;
  return frenchHolidays(year).find((h) => h.date === dateISO) || null;
}
