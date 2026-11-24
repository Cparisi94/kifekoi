/* Kifékoi — export calendrier (.ics) et liens Google Agenda */

import { startOf, parseLocal, toDateISO, esc } from './util.js';
import * as S from './store.js';

function pad(n) { return String(n).padStart(2, '0'); }

function stampUTC(d) {
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function localStamp(d) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    '00'
  );
}

function trigger(minutes) {
  const m = Number(minutes) || 0;
  if (m === 0) return 'PT0M';
  if (m % 1440 === 0) return `-P${m / 1440}D`;
  if (m % 60 === 0) return `-PT${m / 60}H`;
  return `-PT${m}M`;
}

function icsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function fold(line) {
  if (line.length <= 74) return line;
  const chunks = [];
  let rest = line;
  chunks.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    chunks.push(' ' + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return chunks.join('\r\n');
}

/**
 * Construit un fichier iCalendar avec les alarmes (rappels natifs Android).
 * @param {Array} events liste de records {id, payload}
 * @param {Map<string,{name:string,emoji:string}>} profMap
 */
export function buildICS(events, profMap) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kifekoi//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Kifékoi',
  ];

  const now = new Date();

  for (const rec of events) {
    const p = rec.payload || {};
    if (!p.date) continue;
    const prof = profMap.get(p.profileId) || { name: '', emoji: '' };
    const start = startOf(p);
    const prefix = prof.emoji ? `${prof.emoji} ` : '';
    const summary = `${prefix}${p.title || 'Événement'}`;
    const desc = [prof.name ? `Pour : ${prof.name}` : '', p.notes || ''].filter(Boolean).join('\n\n');

    const ev = ['BEGIN:VEVENT', `UID:${rec.id}@agenda-famille`];
    ev.push(`DTSTAMP:${stampUTC(now)}`);

    if (p.endDate && p.endDate >= p.date) {
      const endExclusive = new Date(parseLocal(p.endDate).getTime() + 86400000);
      ev.push(`DTSTART;VALUE=DATE:${p.date.replace(/-/g, '')}`);
      ev.push(`DTEND;VALUE=DATE:${toDateISO(endExclusive).replace(/-/g, '')}`);
    } else if (p.allDay) {
      ev.push(`DTSTART;VALUE=DATE:${p.date.replace(/-/g, '')}`);
    } else {
      ev.push(`DTSTART:${localStamp(start)}`);
      const end = new Date(start.getTime() + 60 * 60000);
      ev.push(`DTEND:${localStamp(end)}`);
    }

    ev.push(fold(`SUMMARY:${icsText(summary)}`));
    if (desc) ev.push(fold(`DESCRIPTION:${icsText(desc)}`));
    ev.push('CATEGORIES:' + icsText(p.category || 'autre'));

    if (p.repeat && p.repeat.every) {
      const freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[p.repeat.unit] || 'MONTHLY';
      let rule = `RRULE:FREQ=${freq};INTERVAL=${Math.max(1, Number(p.repeat.every) || 1)}`;
      const count = Number(p.repeat.count);
      if (count > 0) rule += `;COUNT=${count}`;
      else if (p.repeat.until) rule += `;UNTIL=${String(p.repeat.until).replace(/-/g, '')}T235959Z`;
      ev.push(rule);
    }

    for (const m of p.reminders || []) {
      ev.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText(summary)}`), `TRIGGER:${trigger(m)}`, 'END:VALARM');
    }

    ev.push('END:VEVENT');
    lines.push(...ev);
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS() {
  const profMap = new Map(S.profiles().map((p) => [p.id, p]));
  const list = S.events()
    .filter((e) => !e.payload.done)
    .sort((a, b) => startOf(a.payload) - startOf(b.payload));

  if (list.length === 0) throw new Error('Aucun événement à exporter.');

  const ics = buildICS(list, profMap);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kifekoi-${toDateISO()}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function googleUrl(rec) {
  const p = rec.payload;
  const prof = S.profile(p.profileId);
  const start = startOf(p);
  const end = new Date(start.getTime() + 60 * 60000);
  const text = `${prof && prof.emoji ? prof.emoji + ' ' : ''}${p.title || 'Événement'}`;
  const details = [prof ? `Pour : ${prof.name}` : '', p.notes || ''].filter(Boolean).join('\n\n');

  const dates = p.endDate && p.endDate >= p.date
    ? `${p.date.replace(/-/g, '')}/${toDateISO(new Date(parseLocal(p.endDate).getTime() + 86400000)).replace(/-/g, '')}`
    : (p.allDay
      ? `${p.date.replace(/-/g, '')}/${toDateISO(new Date(start.getTime() + 86400000)).replace(/-/g, '')}`
      : `${stampUTC(start)}/${stampUTC(end)}`);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text,
    dates,
    details,
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
