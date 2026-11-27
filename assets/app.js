/* Kifékoi — interface utilisateur */

import * as S from './store.js';
import * as Sync from './sync.js';
import * as Push from './push.js';
import * as HOL from './holidays.js';
import { TUTORIAL, HELP_SECTIONS } from './help.js';
import * as SCH from './school.js';
import { downloadICS, googleUrl } from './ics.js';
import * as U from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const APP_VERSION = '3.4.43';

/* Pont natif (APK Android). En PWA, window.KIFEKOI_NATIVE est absent. */
const Native = (typeof window !== 'undefined' && window.KIFEKOI_NATIVE) || null;
const isNative = Boolean(Native && Native.isNative);

const isIOS = typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/* ------------------------------------------------------------------ */
/* Référentiels                                                        */
/* ------------------------------------------------------------------ */

const CATS = {
  sante: { label: 'Santé', icon: '🩺' },
  vaccin: { label: 'Vaccin', icon: '💉' },
  ecole: { label: 'École', icon: '🎒' },
  vacances: { label: 'Vacances', icon: '🏖️' },
  veto: { label: 'Vétérinaire', icon: '🐾' },
  admin: { label: 'Administratif', icon: '📄' },
  famille: { label: 'Famille', icon: '👨‍👩‍👦' },
  anniversaire: { label: 'Anniversaire', icon: '🎂' },
  sortie: { label: 'Sortie', icon: '🎉' },
  autre: { label: 'Autre', icon: '📌' },
};

const REM_CHOICES = [10080, 1440, 240, 120, 0];

/* Modèles d'événements (remplissage rapide du formulaire). */
const EVENT_TEMPLATES = [
  { label: '💉 Vaccin', title: 'Vaccin', category: 'vaccin', reminders: [10080, 1440] },
  { label: '🍽️ Cantine', title: 'Cantine', category: 'ecole', reminders: [0] },
  { label: '🗣️ Orthophoniste', title: 'Orthophoniste', category: 'sante', reminders: [1440, 120] },
  { label: '🦷 Dentiste', title: 'Dentiste', category: 'sante', reminders: [1440, 120] },
  { label: '🎒 École', title: 'Réunion école', category: 'ecole', reminders: [1440] },
  { label: '⚽ Activité', title: 'Activité', category: 'sortie', reminders: [60] },
];

const UNIT_OPTIONS = [
  ['day', 'jour(s)'],
  ['week', 'semaine(s)'],
  ['month', 'mois'],
  ['year', 'an(s)'],
];

const EMOJIS = [
  '🙋🏻', '🙋🏼', '👦🏻', '👦🏼', '👧🏻', '👶🏻',
  '👩🏻', '👩🏼', '👨🏻', '👵🏻', '🧑🏻',
  '🐕', '🐈', '🏠', '💼', '🎓', '❤️',
];

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Avatars (emojis)                                                    */
/* ------------------------------------------------------------------ */

function avatarHTML(p, cls = '') {
  const color = (p && p.color) || '#0492c2';
  const open = `<span class="avatar ${cls}" style="--c:${color}">`;
  if (p && p.photo) return `${open}<img src="${p.photo}" alt=""></span>`;
  return `${open}${U.esc((p && p.emoji) || '🙂')}</span>`;
}

/* Réduit une image choisie en vignette carrée (data URL JPEG). */
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2;
        const sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* État de l'interface                                                 */
/* ------------------------------------------------------------------ */

const ui = {
  view: 'agenda',
  month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selected: U.toDateISO(),
  filter: 'all',
  detailProfile: null,
  installPrompt: null,
  custodyOpen: false,
  custodyChildId: null,
  calView: 'month',
  bilanPeriod: 'rentree',
  bilanOffset: 0,
};

let sheetDraft = null;

/* ------------------------------------------------------------------ */
/* Appareil & validation entre parents                                 */
/* ------------------------------------------------------------------ */

const DEVICE_KEY = 'af.device.v1';
const APPROVAL_KEY = 'af.approval.v1';

function myDevice() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null'); } catch { d = null; }
  if (!d || !d.id) {
    d = { id: U.uid(), name: '' };
    try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }
  return d;
}

function setDeviceName(name) {
  const d = { ...myDevice(), name: String(name || '').trim().slice(0, 20) };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

function approvalOn() {
  try { return localStorage.getItem(APPROVAL_KEY) === '1' && Boolean(myDevice().name); } catch { return false; }
}

function setApproval(on) {
  try { localStorage.setItem(APPROVAL_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

/* ------------------------ Lecture seule ------------------------ */

const K_RO = 'af.readonly.v1';
const K_PIN = 'af.pin.v1';

function isReadOnly() {
  try { return localStorage.getItem(K_RO) === '1'; } catch { return false; }
}

function setReadOnly(on) {
  try { localStorage.setItem(K_RO, on ? '1' : '0'); } catch { /* ignore */ }
}

function pinMatches(pin) {
  try {
    const stored = localStorage.getItem(K_PIN) || '';
    return stored ? atob(stored) === String(pin) : false;
  } catch {
    return false;
  }
}

function storePin(pin) {
  try { localStorage.setItem(K_PIN, btoa(String(pin))); } catch { /* ignore */ }
}

/* Actions qui modifient les données (bloquées en lecture seule). */
const WRITE_ACTIONS = new Set([
  'add-event', 'toggle-done', 'add-person', 'delete-person', 'edit-profile', 'edit-contact', 'add-contact',
  'add-note', 'request-accept', 'request-refuse', 'add-expense', 'save-expense', 'delete-expense',
  'settle-expense', 'edit-expense', 'custody-toggle', 'custody-even', 'custody-odd', 'custody-preset',
  'custody-mode', 'custody-week', 'custody-week-part', 'custody-apply-all', 'dedupe', 'import-json',
  'set-zone', 'sign-up', 'sign-out', 'sync-now', 'push-on', 'push-off', 'push-test',
  'enable-notif', 'test-notif', 'install',
]);

/* Zone de vacances scolaires (A, B ou C). */
const ZONE_KEY = 'af.zone.v1';

function schoolZone() {
  try {
    const z = localStorage.getItem(ZONE_KEY);
    return z === 'A' || z === 'B' || z === 'C' ? z : 'C';
  } catch {
    return 'C';
  }
}

function setSchoolZone(z) {
  try { localStorage.setItem(ZONE_KEY, z); } catch { /* ignore */ }
}

const PART_LABEL = { am: 'matin', pm: 'après-midi', sleep: 'nuit' };

function askOtherParent(summary, details) {
  if (!approvalOn()) return;
  const me = myDevice();
  S.createRequest({ author: me.name, authorId: me.id, summary, details });
  Push.notify({
    type: 'request',
    title: `Demande de ${me.name}`,
    body: summary,
    tag: 'request',
  });
}

/* ------------------------------------------------------------------ */
/* Libellés                                                            */
/* ------------------------------------------------------------------ */

const UNITS = {
  day: ['jour', 'jours'],
  week: ['semaine', 'semaines'],
  month: ['mois', 'mois'],
  year: ['an', 'ans'],
};

function repeatLabel(rep) {
  if (!rep || !rep.every) return '';
  const n = Number(rep.every) || 1;
  const unit = UNITS[rep.unit] ? rep.unit : 'month';
  if (n === 1) {
    const single = { day: 'tous les jours', week: 'toutes les semaines', month: 'tous les mois', year: 'tous les ans' };
    return single[unit];
  }
  const word = UNITS[unit][1];
  return unit === 'week' ? `toutes les ${n} ${word}` : `tous les ${n} ${word}`;
}

function repeatShort(rep) {
  if (!rep) return '';
  let s = repeatLabel(rep);
  if (Number(rep.count) > 0) s += ` · ${rep.count} fois au total`;
  else if (rep.until) s += ` jusqu'au ${U.fmtDateY(rep.until)}`;
  return s;
}

function repeatSummary(rep) {
  if (!rep) return '';
  return repeatLabel(rep) + (rep.until ? ` jusqu'au ${U.fmtFull(rep.until)}` : '');
}

function toast(message, ms = 2800) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 220);
  }, ms);
}

function profilePill(p) {
  if (!p) return '';
  return `<span class="pill" style="--c:${p.color}">${U.esc(p.emoji || '')} ${U.esc(p.name)}</span>`;
}

/* ------------------------------------------------------------------ */
/* Carte d'une occurrence                                              */
/* ------------------------------------------------------------------ */

function eventCard(item, opts = {}) {
  const p = item.payload;
  const rec = item.rec;
  const prof = S.profile(p.profileId);
  const cat = CATS[p.category] || CATS.autre;
  const start = S.occurrenceStart(item);
  const done = item.done;
  const late = opts.showLate && !done && start < new Date();

  // Anniversaire : généré depuis la fiche de la personne (pas d'événement à valider).
  if (item.virtual === 'birthday') {
    return `
    <article class="card event is-birthday" data-action="open-profile" data-id="${rec.id}">
      <div class="event-time">
        <span class="allday">Jour</span>
        <span class="event-dot" style="--c:${prof ? prof.color : '#94a3b8'}"></span>
      </div>
      <div class="event-main">
        <h3>🎂 ${U.esc(p.title)}</h3>
        <p class="event-meta">
          ${profilePill(prof)}
          <span class="muted">Anniversaire${item.age > 0 ? ' · ' + item.age + ' ans' : ''}</span>
        </p>
        <p class="event-rem muted">Ajouté automatiquement depuis la fiche</p>
      </div>
    </article>`;
  }

  return `
  <article class="card event ${done ? 'is-done' : ''} ${late ? 'is-late' : ''}"
           data-action="open-event" data-id="${rec.id}" data-date="${item.date}">
    <div class="event-time">
      ${p.allDay ? '<span class="allday">Jour</span>' : `<strong>${U.fmtTime(start)}</strong>`}
      <span class="event-dot" style="--c:${prof ? prof.color : '#b9a48f'}"></span>
    </div>
    <div class="event-main">
      <h3>${cat.icon} ${U.esc(p.title)}</h3>
      <p class="event-meta">
        ${profilePill(prof)}
        <span class="muted">${cat.label}${p.repeat ? ' · 🔁 ' + repeatShort(p.repeat) : ''}</span>
      </p>
      ${p.accompanist ? `<p class="event-accomp">🧑‍🤝‍🧑 Accompagné par <b>${U.esc((S.profile(p.accompanist) || {}).name || '—')}</b></p>` : ''}
      <p class="event-rem ${p.reminders && p.reminders.length ? '' : 'muted'}">
        ${item.range
          ? `🏖️ Du ${U.fmtDateY(p.date)} au ${U.fmtDateY(p.endDate)} · jour ${item.range.index}/${item.range.total}`
          : (p.reminders && p.reminders.length ? '⏰ ' + p.reminders.map(U.minutesLabel).join(' · ') : 'Sans rappel')}
      </p>
      ${late ? '<p class="late-flag">⚠️ En retard</p>' : ''}
    </div>
    <button class="check ${done ? 'on' : ''}" data-action="toggle-done" data-id="${rec.id}" data-date="${item.date}"
            aria-label="${done ? 'Rouvrir' : 'Marquer comme fait'}">✓</button>
  </article>`;
}

/* ------------------------------------------------------------------ */
/* Vue : Agenda (jour + mois réunis)                                   */
/* ------------------------------------------------------------------ */

function custodyRowHTML() {
  const list = S.custodyConfigs();
  if (!list.length) return '';

  const multi = list.length > 1;
  const week = U.isoWeekNumber(U.parseLocal(ui.selected));
  const parity = week % 2 === 0 ? 'paire' : 'impaire';
  const cycleCfg = list.find((cfg) => cfg.mode === 'cycle');
  const rhythmLabel = cycleCfg
    ? `cycle ${cycleCfg.aDays} j / ${cycleCfg.bDays} j`
    : `semaine ${week} (${parity})`;

  const label = (id) => {
    const p = id ? S.profile(id) : null;
    return p ? `${p.emoji} ${U.esc(p.name)}` : '—';
  };

  const entries = list.map((cfg) => ({
    cfg,
    base: S.custodyBaseFor(cfg, ui.selected),
    day: S.custodyDayFor(cfg, ui.selected),
    parents: [S.profile(cfg.evenId), S.profile(cfg.oddId)].filter(Boolean),
  }));

  const summaries = entries.map(({ cfg, day }) => {
    const same = day.am === day.pm && day.pm === day.sleep;
    const who = same ? label(day.am) : `${label(day.am)} → ${label(day.pm)} <span class="muted">nuit</span> ${label(day.sleep)}`;
    return `<span class="custody-kid-line">${multi ? `<b>${U.esc(cfg.name)}</b> ` : ''}${who}</span>`;
  }).join('<span class="custody-sep">·</span>');

  const editor = entries.map(({ cfg, day, base, parents }) => `
    <div class="custody-kid-block">
      <p class="custody-kid-name">${U.esc(cfg.name)}</p>
      ${['am', 'pm', 'sleep'].map((part) => `
        <div class="custody-line">
          <span>${part === 'am' ? 'Matin' : part === 'pm' ? 'Après-midi' : 'Nuit'}</span>
          <div class="chips">
            <button class="chip xs plain ${day[part] === base ? 'on' : ''}" data-action="custody-part" data-child="${cfg.recId}" data-part="${part}" data-id="">Auto</button>
            ${parents.map((p) => `<button class="chip xs ${day[part] === p.id ? 'on' : ''}" data-action="custody-part" data-child="${cfg.recId}" data-part="${part}" data-id="${p.id}" style="--c:${p.color}"><i class="mini-dot" style="--c:${p.color}"></i>${U.esc(p.name)}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`).join('');

  return `<div class="custody-row">
    <div class="custody-head">
      <span class="custody-label">${multi ? 'Garde : ' : `Garde de ${U.esc(entries[0].cfg.name)} : `}${summaries}
        <span class="custody-week">· ${rhythmLabel}</span>
      </span>
      <button class="link" data-action="custody-toggle">${ui.custodyOpen ? 'Fermer' : 'Modifier'}</button>
    </div>
    ${ui.custodyOpen ? `<div class="custody-edit">${editor}</div>` : ''}
  </div>`;
}

function agendaHTML() {
  const now = new Date();
  const todayISO = U.toDateISO(now);
  const sel = U.parseLocal(ui.selected);
  const isToday = ui.selected === todayISO;

  const y = ui.month.getFullYear();
  const m = ui.month.getMonth();
  const weeks = U.monthMatrix(y, m);
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);

  const monthItems = S.occurrencesBetween(U.addDays(first, -7), U.addDays(last, 7), ui.filter);
  const byDate = {};
  for (const i of monthItems) (byDate[i.date] = byDate[i.date] || []).push(i);

  const custodyList = S.custodyConfigs();

  const dayAll = S.occurrencesBetween(ui.selected, ui.selected, ui.filter).slice().sort(S.sortItems);
  const dayOpen = dayAll.filter((i) => !i.done);
  const overdueList = S.overdueOccurrences('all');

  // « À venir » : uniquement les événements du mois affiché dans le calendrier.
  const monthStartISO = U.toDateISO(first);
  const monthEndISO = U.toDateISO(last);
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth();
  const monthIsPast = monthEndISO < todayISO;
  const fromISO = (isCurrentMonth && !monthIsPast) ? todayISO : monthStartISO;

  const nextList = [];
  const seenSeries = new Set();
  for (const i of S.occurrencesBetween(fromISO, monthEndISO, ui.filter)) {
    if (i.done || i.date === ui.selected) continue;
    if (seenSeries.has(i.rec.id)) continue;
    seenSeries.add(i.rec.id);
    nextList.push(i);
    if (nextList.length >= 10) break;
  }
  const nextTitle = isCurrentMonth ? 'À venir' : 'Dans le mois';

  const nextSoon = dayOpen.find((i) => S.occurrenceStart(i) >= now) || dayOpen[0] || null;
  const nextProf = nextSoon ? S.profile(nextSoon.payload.profileId) : null;
  const count = dayOpen.length;

  // En-tête : date du jour + actions (recherche, ajout).
  const head = `
    <header class="agenda-head">
      <div class="agenda-date">
        <span>Bonjour</span>
        <h1>${(() => { const label = U.fmtLong(isToday ? now : sel); return label.charAt(0).toUpperCase() + label.slice(1); })()}</h1>
        ${count ? `<p class="agenda-sub">${count} événement${count > 1 ? 's' : ''} ${isToday ? 'aujourd\u2019hui' : 'ce jour-là'}</p>` : ''}
      </div>
      <div class="agenda-actions">
        <button class="search-btn" data-action="search" aria-label="Rechercher">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16.2 16.2L21 21"/></svg>
        </button>
        <button class="add-btn" data-action="add-event" data-date="${ui.selected}" aria-label="Ajouter un événement">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 4.5v15M4.5 12h15" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </header>`;

  const todayCard = (isToday && dayAll.length)
    ? `<section class="today-card">
        <div class="today-head"><b>Aujourd\u2019hui</b><span>${dayAll.length} événement${dayAll.length > 1 ? 's' : ''}</span></div>
        ${dayAll.slice(0, 4).map((i) => {
          const pr = S.profile(i.payload.profileId);
          const acc = i.payload.accompanist ? S.profile(i.payload.accompanist) : null;
          return `<div class="today-row ${i.done ? 'is-done' : ''}" data-action="open-event" data-id="${i.rec.id}" data-date="${i.date}" role="button">
            <span class="today-time">${i.payload.allDay ? 'Jour' : U.fmtTime(S.occurrenceStart(i))}</span>
            <i class="today-dot" style="--c:${pr ? pr.color : '#94a3b8'}"></i>
            <span class="today-title">${(CATS[i.payload.category] || CATS.autre).icon} ${U.esc(i.payload.title)}</span>
            <span class="today-who">${pr ? `${pr.emoji || ''} ${U.esc(pr.name)}` : ''}${acc ? ` · avec ${U.esc(acc.name)}` : ''}</span>
            <span class="today-chev" aria-hidden="true">›</span>
            <button type="button" class="check ${i.done ? 'on' : ''}" data-action="toggle-done" data-id="${i.rec.id}" data-date="${i.date}" aria-label="${i.done ? 'Rouvrir' : 'Marquer comme fait'}">✓</button>
          </div>`;
        }).join('')}
        ${dayAll.length > 4 ? `<p class="today-more">+ ${dayAll.length - 4} autre${dayAll.length - 4 > 1 ? 's' : ''} événement${dayAll.length - 4 > 1 ? 's' : ''}</p>` : ''}
      </section>`
    : '';

  const overdueBlock = overdueList.length
    ? `<section class="block">
         <div class="block-head"><h2>En retard</h2><span class="count">${overdueList.length}</span></div>
         ${overdueList.slice(0, 4).map((i) => eventCard(i, { showLate: true })).join('')}
       </section>`
    : '';

  const legend = `
    <div class="cal-legend cal-legend-people">
      <span class="legend-item"><i class="legend-square"></i> Vacances · zone ${schoolZone()}</span>
      ${S.profiles().map((p) => `<span class="legend-item"><i class="legend-dot" style="--c:${p.color}"></i>${p.emoji} ${U.esc(p.name)}</span>`).join('')}
    </div>`;

  const weekMode = ui.calView === 'week';
  const weekStart = mondayOfISO(ui.selected);
  const weekDays = Array.from({ length: 7 }, (_, i) => U.toDateISO(U.addDays(U.parseLocal(weekStart), i)));

  const weekList = `
    <div class="week-list">
      ${weekDays.map((iso) => {
        const d = U.parseLocal(iso);
        const list = byDate[iso] || S.occurrencesBetween(iso, iso, ui.filter);
        const cust = S.custodyDays(iso);
        const nm = (id) => { const pr = id ? S.profile(id) : null; return pr ? pr.name : '—'; };
        const part = (id, icon, label) => {
          const pr = id ? S.profile(id) : null;
          return `<span class="wk-part" style="--c:${pr ? pr.color : '#94a3b8'}" title="${label} : ${U.esc(pr ? pr.name : '—')}">${icon} ${pr && pr.emoji ? pr.emoji : '·'}</span>`;
        };
        const custLine = cust.map(({ cfg, day }) => {
          const uniform = day.am === day.pm && day.pm === day.sleep;
          const pr = day.am ? S.profile(day.am) : null;
          const body = uniform
            ? `<span class="wk-part" style="--c:${pr ? pr.color : '#94a3b8'}" title="Toute la journée : ${U.esc(pr ? pr.name : '—')}">${pr && pr.emoji ? pr.emoji : '·'}</span>`
            : `${part(day.am, '☀️', 'Matin')}${part(day.pm, '🌤', 'Après-midi')}${part(day.sleep, '🛏️', 'Nuit')}`;
          return `<span class="wk-cust"><b>${cfg.emoji}</b>${body}</span>`;
        }).join('');
        const evs = list.slice(0, 3).map((i) => {
          const pr = S.profile(i.payload.profileId);
          return `<span class="wk-ev"><b>${U.esc(i.payload.allDay ? 'Jour' : i.payload.time)}</b> ${U.esc(i.payload.title)}${pr ? ` <span class="wk-who">${pr.emoji || ''} ${U.esc(pr.name)}</span>` : ''}${i.payload.accompanist ? ` <span class="wk-who">avec ${U.esc((S.profile(i.payload.accompanist) || {}).name || '')}</span>` : ''}</span>`;
        }).join('');
        return `<button type="button" class="wk-day ${iso === ui.selected ? 'sel' : ''} ${iso === todayISO ? 'today' : ''}" data-action="pick-day" data-date="${iso}">
          <span class="wk-date"><b>${d.getDate()}</b><i>${U.fmtMonthShort(iso)}</i></span>
          <span class="wk-body">
            <span class="wk-head"><b>${['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'][(d.getDay() + 6) % 7]}</b>${iso === todayISO ? "<span class=\"wk-today\">Aujourd'hui</span>" : ''}</span>
            ${custLine ? `<span class="wk-custs">${custLine}</span>` : ''}
            ${evs || '<span class="wk-none">Aucun événement</span>'}
          </span>
        </button>`;
      }).join('')}
    </div>`;

  const grid = `
    <div class="calendar card">
      <div class="cal-head">
        <button class="icon-btn" data-action="${weekMode ? 'week-prev' : 'month-prev'}" aria-label="Précédent">‹</button>
        <div class="cal-title">
          <h2 ${weekMode ? 'class="week-head-title"' : ''}>${weekMode ? `Semaine du ${U.fmtDateY(U.parseLocal(weekStart))}` : U.fmtMonth(ui.month)}</h2>
          <button class="link xs" data-action="cal-view" data-id="${weekMode ? 'month' : 'week'}">${weekMode ? 'Vue mois' : 'Vue semaine'}</button>
        </div>
        <button class="icon-btn" data-action="${weekMode ? 'week-next' : 'month-next'}" aria-label="Suivant">›</button>
      </div>
      ${weekMode ? `${weekList}${legend}` : `
      <div class="cal-grid cal-weekdays">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}
      </div>
      <div class="cal-grid">
        ${weeks.flat().map((d) => {
          const iso = U.toDateISO(d);
          const list = byDate[iso] || [];
          const dots = list.slice(0, 3).map((i) => {
            const pr = S.profile(i.payload.profileId);
            const acc = i.payload.accompanist ? S.profile(i.payload.accompanist) : null;
            return `<i class="${acc ? 'dot-accomp' : ''}" style="--c:${(pr || {}).color || '#94a3b8'};${acc ? `--a:${acc.color}` : ''}"></i>`;
          }).join('');
          const cdays = custodyList.map((cfg) => ({ cfg, day: S.custodyDayFor(cfg, iso) }));
          const sig = (d) => [d.am, d.pm, d.sleep].join('|');
          const sameAll = cdays.length > 1 && cdays.every((c) => sig(c.day) === sig(cdays[0].day));
          const shown = sameAll ? [cdays[0]] : cdays;
          const multiBars = shown.length > 1;
          const bars = shown.map(({ cfg, day }) => {
            const am = day.am ? S.profile(day.am) : null;
            const pm = day.pm ? S.profile(day.pm) : null;
            const sl = day.sleep ? S.profile(day.sleep) : null;
            const letter = sl ? U.esc((sl.name || '').trim().charAt(0).toUpperCase()) : '';
            const kid = multiBars ? `<i class="custody-kid">${U.esc((cfg.name || '').trim().charAt(0).toUpperCase())}</i>` : '';
            return `<span class="custody-bar">${kid}<i class="custody-seg" style="--c:${am ? am.color : 'transparent'}"></i><i class="custody-seg" style="--c:${pm ? pm.color : 'transparent'}"></i><b class="custody-sleep" style="--c:${sl ? sl.color : 'var(--muted)'}">${letter}</b></span>`;
          }).join('');
          const holiday = SCH.schoolHoliday(iso, schoolZone());
          const ferie = HOL.holidayOn(iso);
          return `<button class="cal-day ${d.getMonth() !== m ? 'out' : ''} ${iso === todayISO ? 'today' : ''} ${holiday ? 'is-holiday' : ''} ${ferie ? 'is-ferie' : ''} ${iso === ui.selected ? 'sel' : ''} ${list.length ? 'has-events' : ''}"
                    data-action="pick-day" data-date="${iso}">
            ${custodyList.length ? `<span class="custody-bars ${multiBars ? 'multi' : ''}">${bars}</span>` : ''}
            <span class="cal-spacer"></span>
            <span class="dots">${dots}</span>
            <span class="cal-num">${d.getDate()}</span>
          </button>`;
        }).join('')}
      </div>
      ${legend}`}
    </div>`;

  const dayBlock = `
    <section class="block">
      <div class="block-head">
        <h2>${isToday ? "Aujourd\u2019hui" : U.fmtLong(sel)}</h2>
        <div class="head-actions">
          ${isToday ? '' : '<button class="link" data-action="go-today">Revenir à aujourd\u2019hui</button>'}
          <button class="link" data-action="add-event" data-date="${ui.selected}">+ Ajouter</button>
        </div>
      </div>
      ${(() => { const h = SCH.schoolHoliday(ui.selected, schoolZone()); return h ? `<div class="holiday-tag">🏖️ ${U.esc(h.label)} · zone ${schoolZone()}</div>` : ''; })()}
      ${(() => { const f = HOL.holidayOn(ui.selected); return f ? `<div class="holiday-tag ferie">🎉 ${U.esc(f.label)}</div>` : ''; })()}
      ${custodyRowHTML()}
      ${dayAll.length
        ? dayAll.map((i) => eventCard(i)).join('')
        : `<div class="card empty small"><p>${isToday ? 'Journée libre. Ajoutez un rendez-vous.' : 'Aucun événement ce jour-là.'}</p></div>`}
    </section>`;
  const nextBlock = nextList.length
    ? `<section class="block">
         <div class="block-head"><h2>${nextTitle}</h2><span class="count">${nextList.length}</span></div>
         ${nextList.map((i) => {
           const prof = S.profile(i.payload.profileId);
           return `
           <button class="row-line" data-action="open-event" data-id="${i.rec.id}" data-date="${i.date}">
             <span class="row-date">
               <b>${U.parseLocal(i.date).getDate()}</b>
               <i>${U.fmtMonthShort(i.date)}</i>
             </span>
             <span class="row-main">
               <b>${(CATS[i.payload.category] || CATS.autre).icon} ${U.esc(i.payload.title)}</b>
               <span class="row-meta">
                 ${profilePill(prof)}
                 <span class="muted">${U.relLabel(i.date)}${i.payload.allDay ? '' : ' · ' + i.payload.time}${i.payload.repeat ? ' · 🔁' : ''}${i.payload.accompanist ? ' · avec ' + U.esc((S.profile(i.payload.accompanist) || {}).name || '') : ''}</span>
               </span>
             </span>
             <span class="row-dot" style="--c:${(prof || {}).color || '#94a3b8'}"></span>
           </button>`;
         }).join('')}
       </section>`
    : '';

  return `<div class="stack">
    ${head}
    ${todayCard}
    ${S.profiles().length === 0 ? `<section class="card empty">
      <span class="empty-emoji">👋</span>
      <p>Bienvenue dans Kifékoi !<br>Commencez par ajouter les personnes de votre famille.</p>
      <button class="btn primary" data-action="add-person">+ Ajouter une personne</button>
    </section>` : ''}
    ${approvalBanner()}
    ${overdueBlock}
    ${grid}
    ${isToday ? '' : dayBlock}
    ${nextBlock}
  </div>`;
}

function approvalBanner() {
  const me = myDevice().id;
  const incoming = S.pendingRequests().filter((r) => r.payload.authorId !== me);
  if (!incoming.length) return '';
  return `<button class="card approval-banner" data-action="requests-open">
    <span class="approval-icon">🤝</span>
    <span class="approval-text">
      <b>${incoming.length} demande${incoming.length > 1 ? 's' : ''} de l'autre parent</b>
      <small>${U.esc(incoming[0].payload.summary || '')}</small>
    </span>
    <span class="approval-arrow">›</span>
  </button>`;
}

/* ------------------------------------------------------------------ */
/* Vue : Personnes                                                     */
/* ------------------------------------------------------------------ */

function peopleHTML() {
  const profs = S.profiles();
  if (!profs.length) {
    return `<div class="card empty"><span class="empty-emoji">👥</span>
      <p>Aucune personne pour l'instant.<br>Ajoutez les membres de votre famille : vous, l'autre parent, les enfants, les animaux.</p>
      <button class="btn primary" data-action="add-person">+ Ajouter une personne</button></div>`;
  }

  const roleLabel = { parent: 'Parent', child: 'Enfant', animal: 'Animal' };

  const groups = [
    ['parent', 'Parents'],
    ['child', 'Enfants'],
    ['animal', 'Animaux'],
  ]
    .map(([role, label]) => ({ label, list: profs.filter((p) => (p.role || 'parent') === role) }))
    .filter((g) => g.list.length);

  const card = (p) => {
    const st = S.statsFor(p.id);
    const age = p.birthday ? `${S.ageFrom(p.birthday)} ans` : '';
    return `<button class="person-card card" data-action="open-profile" data-id="${p.id}" style="--c:${p.color}">
      ${avatarHTML(p)}
      <span class="person-body">
        <span class="person-name">${U.esc(p.name)}</span>
        <span class="person-sub">${st.next
          ? `${(CATS[st.next.payload.category] || CATS.autre).icon} ${U.esc(st.next.payload.title)} · ${U.relLabel(st.next.date)}`
          : 'Aucun rendez-vous à venir'}</span>
        <span class="person-meta">
          <span class="person-role">${roleLabel[p.role] || 'Membre'}</span>
          ${age ? `<span>${age}</span>` : ''}
          <span>${st.total} à venir</span>
          ${st.notes ? `<span>${st.notes} info${st.notes > 1 ? 's' : ''}</span>` : ''}
        </span>
      </span>
      <span class="person-chev" aria-hidden="true">›</span>
    </button>`;
  };

  return `<div class="stack">
    <header class="agenda-head">
      <div class="agenda-date">
        <h1>Personnes</h1>
      </div>
      <div class="agenda-actions">
        <button class="add-btn" data-action="add-person" aria-label="Ajouter une personne">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 4.5v15M4.5 12h15" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </header>

    ${groups.map((g) => `<section class="block">
      <div class="block-head"><h2>${g.label}</h2><span class="count">${g.list.length}</span></div>
      <div class="people-list">${g.list.map(card).join('')}</div>
    </section>`).join('')}
  </div>`;
}

function profileHTML() {
  const p = S.profile(ui.detailProfile);
  if (!p) { ui.view = 'people'; return peopleHTML(); }

  // Une ligne par série (prochaine occurrence).
  const upcoming = [];
  const seenSeries = new Set();
  for (const i of S.upcomingOccurrences(p.id, 200)) {
    if (seenSeries.has(i.rec.id)) continue;
    seenSeries.add(i.rec.id);
    upcoming.push(i);
    if (upcoming.length >= 10) break;
  }
  const suivis = S.events()
    .filter((e) => e.payload.profileId === p.id && e.payload.repeat)
    .map((rec) => ({ rec, next: S.nextOccurrence(rec) }))
    .filter((x) => x.next)
    .sort((a, b) => a.next.date.localeCompare(b.next.date));
  const notesList = S.notes().filter((n) => n.payload.profileId === p.id);
  const contacts = Array.isArray(p.contacts) ? p.contacts : [];
  const contactsHTML = contacts.length
    ? contacts.map((c) => `
        <div class="card contact">
          <div class="contact-main">
            <b>${U.esc(c.label || c.name || 'Contact')}</b>
            ${c.label && c.name ? `<span class="muted">${U.esc(c.name)}</span>` : ''}
            ${c.notes ? `<span class="muted">${U.esc(c.notes)}</span>` : ''}
            <div class="contact-links">
              ${c.phone ? `<a class="chip xs plain" href="tel:${U.esc(String(c.phone).replace(/[^+0-9]/g, ''))}">📞 ${U.esc(c.phone)}</a>` : ''}
              ${c.email ? `<a class="chip xs plain" href="mailto:${U.esc(c.email)}">✉️ ${U.esc(c.email)}</a>` : ''}
            </div>
          </div>
          <button class="icon-btn contact-edit" data-action="edit-contact" data-id="${p.id}" data-contact="${c.id}" aria-label="Modifier">✏️</button>
        </div>`).join('')
    : `<div class="card empty small"><p>Aucun contact. Ajoutez le pédiatre, l'école, le vétérinaire…</p></div>`;

  return `<div class="stack">
    <button class="back-link" data-action="nav" data-view="people">
      <span class="back-chevron">‹</span> Personnes
    </button>

    <section class="profile-head card" style="--c:${p.color}">
      ${avatarHTML(p, 'xl')}
      <div>
        <h2>${U.esc(p.name)}</h2>
        ${p.birthday ? `<p class="muted">🎂 ${U.fmtFull(p.birthday)} · ${S.ageFrom(p.birthday)} ans</p>` : ''}
        <p class="muted">${upcoming.length} événement${upcoming.length > 1 ? 's' : ''} à venir · ${notesList.length} info${notesList.length > 1 ? 's' : ''}</p>
      </div>
      <button class="icon-btn" data-action="edit-profile" data-id="${p.id}" aria-label="Modifier">✏️</button>
    </section>

    <section class="block">
      <div class="block-head"><h2>Prochains rendez-vous</h2>
        <button class="link" data-action="add-event" data-profile="${p.id}">+ Ajouter</button></div>
      ${upcoming.length
        ? upcoming.slice(0, 10).map((i) => eventCard(i)).join('')
        : `<div class="card empty small"><p>Aucun rendez-vous à venir.</p></div>`}
    </section>

    ${suivis.length ? `
    <section class="block">
      <div class="block-head"><h2>Suivis & rappels récurrents</h2></div>
      ${suivis.slice(0, 6).map(({ rec, next }) => `
        <button class="card follow" data-action="open-event" data-id="${rec.id}" data-date="${next.date}">
          <span class="follow-icon">🔁</span>
          <span>
            <b>${U.esc(rec.payload.title)}</b>
            <small>${repeatShort(rec.payload.repeat)} · prochaine fois ${U.relLabel(next.date).toLowerCase()}</small>
          </span>
          <span class="follow-state">${U.fmtDateY(next.date)}</span>
        </button>`).join('')}
    </section>` : ''}

    <section class="block">
      <div class="block-head"><h2>Infos à retenir</h2>
        <button class="link" data-action="add-note" data-profile="${p.id}">+ Note</button></div>
      ${notesList.length
        ? notesList.map((n) => `
          <button class="card note" data-action="open-note" data-id="${n.id}">
            <b>${n.payload.pinned ? '📌 ' : ''}${U.esc(n.payload.title || 'Note')}</b>
            <p>${U.esc((n.payload.text || '').slice(0, 180))}</p>
          </button>`).join('')
        : `<div class="card empty small"><p>Aucune note. Ajoutez les infos utiles (allergies, numéros, habitudes…).</p></div>`}
    </section>

    <section class="block">
      <div class="block-head"><h2>Contacts utiles</h2>
        <button class="link" data-action="add-contact" data-id="${p.id}">+ Contact</button></div>
      ${contactsHTML}
    </section>

    <button class="btn ghost wide danger" data-action="delete-profile" data-id="${p.id}">Supprimer cette personne</button>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Vue : Rappels                                                       */
/* ------------------------------------------------------------------ */

function notifState() {
  if (isNative) return 'native';
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'default';
}

function remindersHTML() {
  const ns = notifState();
  const now = Date.now();
  const occ = S.reminderOccurrences();
  const due = occ.filter((r) => r.at <= now && now - r.at < 24 * 3600 * 1000);
  const next = occ.filter((r) => r.at > now).slice(0, 15);

  const notifCard = `
    <section class="card notif ${ns === 'granted' || ns === 'native' ? 'ok' : ''}">
      <div class="notif-head">
        <span class="notif-icon">${ns === 'denied' ? '🔕' : '🔔'}</span>
        <div>
          <b>${ns === 'native' ? 'Rappels programmés par Android'
            : ns === 'granted' ? 'Notifications activées'
            : ns === 'denied' ? 'Notifications bloquées'
            : 'Activer les notifications'}</b>
          <p class="muted">${ns === 'native'
            ? 'Les rappels se déclenchent même application fermée.'
            : ns === 'granted'
              ? 'L\u2019app vous prévient quand vous l\u2019ouvrez ou qu\u2019elle tourne en arrière-plan.'
              : ns === 'denied'
                ? 'Autorisez les notifications dans les réglages Chrome (Infos du site > Notifications).'
                : 'Autorisez les notifications pour recevoir vos rappels sur ce téléphone.'}</p>
        </div>
      </div>
      ${ns === 'default' ? `<button class="btn primary wide" data-action="enable-notif">Activer les notifications</button>` : ''}
      ${ns === 'granted' || ns === 'native' ? `<button class="btn ghost wide" data-action="test-notif">Envoyer une notification de test</button>` : ''}
    </section>`;

  const dueBlock = due.length ? `
    <section class="block">
      <div class="block-head"><h2>À faire maintenant</h2><span class="count">${due.length}</span></div>
      ${due.map(remCard).join('')}
    </section>` : '';

  return `<div class="stack">
    ${notifCard}
    ${dueBlock}
    <section class="block">
      <div class="block-head"><h2>Prochains rappels</h2></div>
      ${next.length ? next.map(remCard).join('') : `<div class="card empty small"><p>Aucun rappel programmé. Ajoutez un rappel à un événement.</p></div>`}
    </section>

    <section class="card">
      <h3 class="card-title">🔔 Rappels même app fermée (Android)</h3>
      <p class="muted">Pour être sûr de recevoir vos rappels, exportez vos événements vers le calendrier du téléphone (Google Agenda). Les séries récurrentes y apparaissent à toutes leurs dates.</p>
      <button class="btn primary wide" data-action="export-ics">📆 Exporter vers le calendrier</button>
      <p class="hint">Ouvrez ensuite le fichier téléchargé → « Importer dans le calendrier ». À refaire quand vous ajoutez des événements.</p>
    </section>

    <section class="card">
      <h3 class="card-title">🔄 Synchronisation</h3>
      <p class="muted">${Sync.configured
        ? (Sync.isSignedIn() ? `Connecté : ${U.esc(Sync.status.email || '')}` : 'Non connecté — ouvrez les réglages pour relier ce téléphone.')
        : 'Mode local : les données sont liées à ce navigateur et à cette adresse. Changer de navigateur (Edge → Chrome) ou d\u2019adresse revient à repartir de zéro. Activez la synchronisation dans les réglages.'}</p>
      <button class="btn ghost wide" data-action="sync-now">Synchroniser maintenant</button>
    </section>
  </div>`;
}

function remCard(r) {
  const p = r.item.payload;
  const prof = S.profile(p.profileId);
  const start = S.occurrenceStart(r.item);
  const cat = CATS[p.category] || CATS.autre;
  const when = new Date(r.at);
  const past = r.at < Date.now();

  return `<button class="card rem ${past ? 'past' : ''}" data-action="open-event" data-id="${r.item.rec.id}" data-date="${r.item.date}">
    <span class="rem-when">${past ? '⏰ ' : ''}${U.relLabel(when)} · ${U.fmtTime(when)}</span>
    <span class="rem-title">${cat.icon} ${U.esc(p.title)}</span>
    <span class="rem-sub">${prof ? U.esc(prof.name) + ' · ' : ''}${U.minutesLabel(r.offset)} — RDV ${U.fmtDateY(start)}${p.allDay ? '' : ' ' + U.fmtTime(start)}${p.accompanist ? ' · avec ' + U.esc((S.profile(p.accompanist) || {}).name || '') : ''}</span>
  </button>`;
}

/* ------------------------------------------------------------------ */
/* Rendu global                                                        */
/* ------------------------------------------------------------------ */

function render(force = false) {
  if (isReadOnly() && ui.view === 'bilan') ui.view = 'agenda';

  const main = $('#view');
  const changedView = main.dataset.view !== ui.view || ui.view === 'profile';
  const scroll = window.scrollY;

  let html = '';

  switch (ui.view) {
    case 'agenda':
      html = agendaHTML();
      break;
    case 'people':
      html = peopleHTML();
      break;
    case 'reminders':
      html = remindersHTML();
      break;
    case 'bilan':
      html = bilanHTML();
      break;
    case 'settings':
      html = settingsHTML();
      break;
    case 'profile': {
      const p = S.profile(ui.detailProfile);
      if (!p) { ui.view = 'people'; return render(force); }
      html = profileHTML();
      break;
    }
  }

  main.dataset.view = ui.view;
  main.innerHTML = html;
  document.body.classList.toggle('ro', isReadOnly());

  const active = ui.view === 'profile' ? 'people' : ui.view;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === active));

  if (ui.view === 'settings') bindSettings();
  if (ui.view === 'agenda') setupCalendarSwipe();

  if (changedView && !force) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);

  updateSyncDot();
}

/* Glissement horizontal sur le calendrier pour changer de mois. */
let calSwipe = null;

function setupCalendarSwipe() {
  const el = $('.calendar');
  if (!el) return;

  el.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    const t = e.touches[0];
    calSwipe = { x: t.clientX, y: t.clientY, t: Date.now() };
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (!calSwipe) return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    const dx = t ? t.clientX - calSwipe.x : 0;
    const dy = t ? t.clientY - calSwipe.y : 0;
    const dt = Date.now() - calSwipe.t;
    calSwipe = null;
    if (dt > 900 || Math.abs(dx) < 55) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (ui.calView === 'week') {
      const d = U.addDays(U.parseLocal(ui.selected), dx < 0 ? 7 : -7);
      ui.selected = U.toDateISO(d);
      ui.month = new Date(d.getFullYear(), d.getMonth(), 1);
    } else {
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + (dx < 0 ? 1 : -1), 1);
    }
    render(true);
  }, { passive: true });
}

function updateSyncDot() {
  const dot = $('#tabSyncDot');
  if (!dot) return;
  const map = { local: 'local', signedout: 'off', idle: 'on', syncing: 'sync', error: 'err', offline: 'err' };
  dot.className = 'tab-dot ' + (map[Sync.status.mode] || 'off');
  dot.title = `${Sync.syncStatusLabel()}${Sync.status.message ? ' — ' + Sync.status.message : ''}`;
}

/* ------------------------------------------------------------------ */
/* Feuilles modales                                                    */
/* ------------------------------------------------------------------ */

let sheetRaf = 0;

function openSheet(html) {
  const sheet = $('#sheet');
  cancelAnimationFrame(sheetRaf);
  sheet.innerHTML = html;
  sheet.hidden = false;
  $('#backdrop').hidden = false;
  document.body.classList.add('locked');
  sheetRaf = requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSheet() {
  const sheet = $('#sheet');
  cancelAnimationFrame(sheetRaf);
  sheet.classList.remove('open');
  $('#backdrop').hidden = true;
  document.body.classList.remove('locked');
  setTimeout(() => {
    if (!sheet.classList.contains('open')) { sheet.hidden = true; sheet.innerHTML = ''; }
  }, 220);
  sheetDraft = null;
}

/* ---------------------------- Tutoriel ---------------------------- */

const K_TUTO = 'af.tutorial.v1';
let tutoStep = 0;

function tutorialSeen() {
  try { return localStorage.getItem(K_TUTO) === '1'; } catch { return true; }
}

function markTutorialSeen() {
  try { localStorage.setItem(K_TUTO, '1'); } catch { /* ignore */ }
}

function openTutorial(start = 0) {
  tutoStep = Math.max(0, Math.min(start, TUTORIAL.length - 1));
  renderTutorial();
  const el = $('#tutorial');
  el.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => el.classList.add('open'));
}

function closeTutorial() {
  markTutorialSeen();
  const el = $('#tutorial');
  if (!el) return;
  el.classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => {
    if (!el.classList.contains('open')) { el.hidden = true; el.innerHTML = ''; }
  }, 220);
}

function renderTutorial() {
  const s = TUTORIAL[tutoStep];
  const last = tutoStep === TUTORIAL.length - 1;
  const el = $('#tutorial');

  el.innerHTML = `
    <div class="tuto-card" role="dialog" aria-modal="true" aria-label="Tutoriel Kifékoi">
      <div class="tuto-top">
        <span class="tuto-count">${tutoStep + 1} / ${TUTORIAL.length}</span>
        <button type="button" class="tuto-skip" data-tuto="skip">Passer</button>
      </div>
      <div class="tuto-emoji" aria-hidden="true">${s.emoji}</div>
      <h2>${s.title}</h2>
      <p>${s.text}</p>
      <div class="tuto-dots" aria-hidden="true">
        ${TUTORIAL.map((_, i) => `<span class="${i === tutoStep ? 'on' : ''}"></span>`).join('')}
      </div>
      <div class="tuto-actions">
        ${tutoStep > 0 ? '<button type="button" class="btn ghost" data-tuto="prev">Précédent</button>' : ''}
        <button type="button" class="btn primary grow" data-tuto="next">${last ? 'Commencer' : 'Suivant'}</button>
      </div>
    </div>`;

  el.querySelectorAll('[data-tuto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.tuto;
      if (a === 'prev') {
        tutoStep = Math.max(0, tutoStep - 1);
        renderTutorial();
      } else if (a === 'next') {
        if (tutoStep >= TUTORIAL.length - 1) closeTutorial();
        else { tutoStep++; renderTutorial(); }
      } else {
        closeTutorial();
      }
    });
  });
}

/* ------------------------------ Aide ------------------------------ */

async function nativeDiagSheet() {
  const d = await Push.nativeDiag();
  const line = (k, v, bad) =>
    `<div class="diag-line"><span>${k}</span><b class="${bad ? 'bad' : ''}">${U.esc(String(v))}</b></div>`;

  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>🔎 Diagnostic</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <div class="diag-box">
          ${line('Application Android', d.isNative ? 'oui' : 'NON', !d.isNative)}
          ${line('Module push', d.hasPlugin ? 'présent' : 'ABSENT', !d.hasPlugin)}
          ${line('Autorisation Android', d.permission || '—', d.permission !== 'granted')}
          ${line('Enregistré (jeton)', d.registered ? 'oui' : 'non', !d.registered)}
          ${line('Jeton', d.token || '—', !d.token)}
          ${line('Compte', d.signedIn ? d.email : 'non connecté', !d.signedIn)}
          ${line('Jetons en base', d.tokensForUser == null ? '—' : d.tokensForUser, d.tokensForUser === 0)}
          ${line('Erreur', d.error || 'aucune', Boolean(d.error))}
        </div>
        <button type="button" class="btn primary wide" data-action="native-retry">Réessayer l'enregistrement</button>
        <p class="hint">Après « Réessayer », attends 3 secondes puis rouvre le diagnostic.</p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);
}

/* ------------------------ Lecture seule ------------------------ */

function lockReadOnlySheet() {
  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>🔒 Verrouiller</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <p class="muted">Choisissez un code à 4 chiffres. Il sera demandé pour déverrouiller cet appareil.</p>
        <label class="field"><span>Code parent (4 chiffres)</span>
          <input id="roPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">
        </label>
        <p class="hint">Ce verrou protège l'application sur cet appareil (ce n'est pas une sécurité côté serveur).</p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button type="button" class="btn primary grow" data-action="do-lock-readonly">Verrouiller</button>
      </div>
    </div>
  `);
  setTimeout(() => { const i = $('#roPin'); if (i) i.focus(); }, 150);
}

function unlockReadOnlySheet() {
  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>🔓 Déverrouiller</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <p class="muted">Saisissez le code parent pour rendre cet appareil modifiable.</p>
        <label class="field"><span>Code parent (4 chiffres)</span>
          <input id="roPinUnlock" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off">
        </label>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost" data-close>Annuler</button>
        <button type="button" class="btn primary grow" data-action="do-unlock-readonly">Déverrouiller</button>
      </div>
    </div>
  `);
  setTimeout(() => { const i = $('#roPinUnlock'); if (i) i.focus(); }, 150);
}

function eventViewSheet(id) {
  const rec = S.get(id);
  if (!rec) return;
  const p = rec.payload;
  const prof = S.profile(p.profileId);
  const acc = p.accompanist ? S.profile(p.accompanist) : null;
  const cat = CATS[p.category] || CATS.autre;

  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>${cat.icon} ${U.esc(p.title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <div class="diag-box">
          <div class="diag-line"><span>Date</span><b>${U.fmtDateY(U.parseLocal(p.date))}${p.allDay ? '' : ' · ' + p.time}</b></div>
          ${p.endDate ? `<div class="diag-line"><span>Jusqu'au</span><b>${U.fmtDateY(U.parseLocal(p.endDate))}</b></div>` : ''}
          <div class="diag-line"><span>Pour</span><b>${prof ? `${prof.emoji} ${U.esc(prof.name)}` : '—'}</b></div>
          ${acc ? `<div class="diag-line"><span>Accompagné par</span><b>${acc.emoji} ${U.esc(acc.name)}</b></div>` : ''}
          <div class="diag-line"><span>Catégorie</span><b>${cat.label}</b></div>
          <div class="diag-line"><span>Rappels</span><b>${p.reminders && p.reminders.length ? p.reminders.map(U.minutesLabel).join(', ') : 'aucun'}</b></div>
        </div>
        ${p.notes ? `<p class="muted">${U.esc(p.notes)}</p>` : ''}
        <p class="hint">Mode lecture seule : consultation uniquement.</p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);
}

function noteViewSheet(id) {
  const rec = S.get(id);
  if (!rec) return;
  const p = rec.payload;
  const prof = S.profile(p.profileId);
  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>${p.pinned ? '📌 ' : '📝 '}${U.esc(p.title || 'Note')}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        ${prof ? `<p class="muted">${prof.emoji} ${U.esc(prof.name)}</p>` : ''}
        <p>${U.esc(p.text || '')}</p>
        <p class="hint">Mode lecture seule : consultation uniquement.</p>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);
}

/* ---------------------------- Recherche ---------------------------- */

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function searchResultsHTML(query) {
  const needle = normalizeText(query).trim();
  if (needle.length < 2) {
    return '<p class="hint">Tapez au moins 2 lettres (titre, note, personne, montant…).</p>';
  }

  const match = (...values) => values.some((v) => normalizeText(v).includes(needle));
  const rows = [];

  for (const rec of S.events()) {
    const p = rec.payload;
    const prof = S.profile(p.profileId);
    if (!match(p.title, p.notes, (CATS[p.category] || CATS.autre).label, prof && prof.name)) continue;
    rows.push({
      action: 'open-event',
      id: rec.id,
      date: p.date,
      icon: (CATS[p.category] || CATS.autre).icon,
      title: p.title || 'Événement',
      meta: `${prof ? prof.name + ' · ' : ''}${U.fmtDateY(U.parseLocal(p.date))}${p.allDay ? '' : ' · ' + p.time}`,
    });
  }

  for (const rec of S.notes()) {
    const p = rec.payload;
    const prof = S.profile(p.profileId);
    if (!match(p.title, p.text, prof && prof.name)) continue;
    rows.push({
      action: 'open-note',
      id: rec.id,
      icon: p.pinned ? '📌' : '📝',
      title: p.title || 'Note',
      meta: prof ? prof.name : '',
    });
  }

  for (const x of S.expenses()) {
    if (!match(x.label, x.note, EXPENSE_CATS[x.category], (S.profile(x.paidBy) || {}).name)) continue;
    rows.push({
      action: 'edit-expense',
      id: x.id,
      icon: '🧾',
      title: x.label || 'Dépense',
      meta: `${euro(x.amount)} · ${U.fmtDateY(U.parseLocal(x.date))}`,
    });
  }

  if (!rows.length) return '<p class="hint">Aucun résultat.</p>';

  return rows.slice(0, 40).map((r) => `
    <button type="button" class="search-row" data-action="${r.action}" data-id="${r.id}" ${r.date ? `data-date="${r.date}"` : ''}>
      <span class="search-icon">${r.icon || '•'}</span>
      <span class="search-main"><b>${U.esc(r.title)}</b><span class="muted">${U.esc(r.meta)}</span></span>
    </button>`).join('');
}

function searchSheet() {
  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>🔍 Rechercher</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <label class="field"><span>Événements, notes, dépenses</span>
          <input id="searchInput" type="search" placeholder="Ex. piscine, vaccin, cantine…" autocomplete="off">
        </label>
        <div id="searchResults" class="search-results"></div>
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);

  const input = $('#searchInput');
  const box = $('#searchResults');
  if (input && box) {
    const run = () => { box.innerHTML = searchResultsHTML(input.value); };
    input.addEventListener('input', run);
    run();
    setTimeout(() => input.focus(), 150);
  }
}

function helpSheet() {
  openSheet(`
    <div class="sheet-form help-sheet">
      <div class="sheet-head">
        <h2>❓ Aide</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <button type="button" class="btn ghost wide" data-action="tuto-replay">▶ Revoir le tutoriel de démarrage</button>
        ${HELP_SECTIONS.map((s, i) => `
          <details class="help-item"${i === 0 ? ' open' : ''}>
            <summary>
              <span class="help-emoji" aria-hidden="true">${s.emoji}</span>
              <span class="help-title">${s.title}</span>
              <span class="help-caret" aria-hidden="true">▾</span>
            </summary>
            <div class="help-body">${s.html}</div>
          </details>`).join('')}
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);
}

/* ---------------------------- Événement --------------------------- */

function previewDates(dateStr, every, unit, until, count = 3) {
  if (!dateStr) return [];
  const base = U.parseLocal(dateStr);
  const out = [];
  for (let i = 1; i <= count; i++) {
    const d = U.addInterval(base, Math.max(1, Number(every) || 1) * i, unit);
    if (until && d.getTime() > U.parseLocal(until).getTime()) break;
    out.push(d);
  }
  return out;
}

function eventSheet(id, opts = {}) {
  const profs = S.profiles();
  if (!profs.length) {
    toast('Ajoutez d\u2019abord une personne dans l\u2019onglet Personnes');
    ui.view = 'people';
    render();
    return;
  }

  const rec = id ? S.get(id) : null;
  const p = rec ? rec.payload : {
    profileId: opts.profileId || (ui.filter !== 'all' ? ui.filter : (profs[0] || {}).id),
    title: '',
    date: opts.date || U.toDateISO(),
    time: '09:00',
    allDay: false,
    category: opts.category || 'sante',
    notes: '',
    reminders: [1440, 120],
    repeat: null,
  };

  sheetDraft = {
    profileId: p.profileId,
    reminders: new Set(p.reminders || []),
    occurrenceDate: opts.date || null,
    accompanist: p.accompanist || '',
  };

  const selProf = S.profile(p.profileId);
  const showAccomp = Boolean(selProf && selProf.role !== 'parent');
  const parentProfs = profs.filter((x) => x.role === 'parent');

  const cats = Object.entries(CATS).map(([k, v]) => `<option value="${k}" ${p.category === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('');
  const currentUnit = (p.repeat && p.repeat.unit) || 'month';
  const units = UNIT_OPTIONS.map(([v, l]) => `<option value="${v}" ${currentUnit === v ? 'selected' : ''}>${l}</option>`).join('');
  const hasRepeat = Boolean(p.repeat && p.repeat.every);

  const occLine = (rec && hasRepeat && opts.date)
    ? `<p class="occ-banner">Occurrence du ${U.fmtFull(opts.date)} — les modifications portent sur toute la série.</p>`
    : '';

  openSheet(`
    <form id="eventForm" class="sheet-form" data-id="${id || ''}">
      <div class="sheet-head">
        <h2>${rec ? (hasRepeat ? 'Série d\u2019événements' : 'Modifier l\u2019événement') : 'Nouvel événement'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        ${occLine}
        <div class="field">
          <span>Pour qui ?</span>
          <div class="chips" id="personChips">
            ${profs.map((pr) => `<button type="button" class="chip ${sheetDraft.profileId === pr.id ? 'on' : ''}" data-person="${pr.id}" style="--c:${pr.color}">${pr.emoji} ${U.esc(pr.name)}</button>`).join('')}
          </div>
        </div>

        ${!rec ? `<div class="field">
          <span>Motifs (facultatif)</span>
          <div class="chips scroll" id="tplChips">
            ${EVENT_TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tpl="${i}">${t.label}</button>`).join('')}
          </div>
        </div>` : ''}

        <div class="field" id="accompField" ${showAccomp ? '' : 'hidden'}>
          <span>Parent accompagnateur (facultatif)</span>
          <div class="chips" id="accompChips">
            <button type="button" class="chip ${sheetDraft.accompanist ? '' : 'on'}" data-accomp="">Aucun</button>
            ${parentProfs.map((pr) => `<button type="button" class="chip ${sheetDraft.accompanist === pr.id ? 'on' : ''}" data-accomp="${pr.id}" style="--c:${pr.color}"><span class="chip-avatar">${pr.emoji}</span>${U.esc(pr.name)}</button>`).join('')}
          </div>
        </div>

        <label class="field">
          <span>Titre</span>
          <input name="title" required maxlength="120" value="${U.esc(p.title)}" placeholder="Ex. Vermifuge Mia, vaccin ROR…">
        </label>

        <div class="row">
          <label class="field grow">
            <span>Date</span>
            <input type="date" name="date" required value="${p.date}">
          </label>
          <label class="field" id="timeField" ${p.allDay ? 'hidden' : ''}>
            <span>Heure</span>
            <input type="time" name="time" value="${p.time || '09:00'}">
          </label>
        </div>

        <label class="switch">
          <input type="checkbox" name="allDay" ${p.allDay ? 'checked' : ''}>
          <span>Toute la journée</span>
        </label>

        <label class="switch">
          <input type="checkbox" name="multiDay" ${p.endDate ? 'checked' : ''}>
          <span>Sur plusieurs jours (vacances, séjour…)</span>
        </label>

        <label class="field" id="endField" ${p.endDate ? '' : 'hidden'}>
          <span>Jusqu'au</span>
          <input type="date" name="endDate" value="${p.endDate || p.date}">
        </label>

        <label class="field">
          <span>Catégorie</span>
          <select name="category">${cats}</select>
        </label>

        <div class="field" id="custodyImpactField" ${p.category === 'vacances' ? '' : 'hidden'}>
          <label class="switch">
            <input type="checkbox" name="affectsCustody" ${rec ? (p.affectsCustody === true ? 'checked' : '') : 'checked'}>
            <span>Impacte la garde de l'enfant</span>
          </label>
          <p class="hint">Coché : ces jours prennent la couleur du parent (vacances chez lui). Décoché : l'alternance des semaines reste inchangée.</p>
        </div>

        <div class="field">
          <span>Rappels</span>
          <div class="chips" id="remChips">
            ${REM_CHOICES.map((m) => `<button type="button" class="chip ${sheetDraft.reminders.has(m) ? 'on' : ''}" data-rem="${m}">${U.minutesLabel(m)}</button>`).join('')}
          </div>
          <p class="hint">Aucun rappel coché = événement sans notification.</p>
        </div>

        <div class="field repeat-field">
          <span>Répétition</span>
          <label class="switch">
            <input type="checkbox" name="repeatOn" ${hasRepeat ? 'checked' : ''}>
            <span>Répéter cet événement</span>
          </label>

          <div class="repeat-box" id="repeatBox" ${hasRepeat ? '' : 'hidden'}>
            <div class="repeat-row">
              <span>Tous les</span>
              <input type="number" name="repeatEvery" min="1" max="365" inputmode="numeric"
                     value="${hasRepeat ? p.repeat.every : 3}">
              <select name="repeatUnit">${units}</select>
            </div>
            <label class="field">
              <span>Nombre de fois au total (facultatif)</span>
              <input type="number" name="repeatCount" min="2" max="200" inputmode="numeric"
                     placeholder="illimité" value="${hasRepeat && p.repeat.count ? p.repeat.count : ''}">
            </label>
            <label class="field">
              <span>Jusqu'au (facultatif)</span>
              <input type="date" name="repeatUntil" value="${p.repeat && p.repeat.until ? p.repeat.until : ''}">
            </label>
            <p class="hint repeat-preview" id="repeatPreview"></p>
          </div>
        </div>

        <label class="field">
          <span>Notes</span>
          <textarea name="notes" rows="3" placeholder="Informations utiles…">${U.esc(p.notes)}</textarea>
        </label>

        ${rec ? `<button type="button" class="link" data-action="google-calendar" data-id="${rec.id}">Ajouter à Google Agenda</button>` : ''}
      </div>
      <div class="sheet-foot">
        ${rec ? `<button type="button" class="btn ghost danger" data-delete>${hasRepeat ? 'Supprimer la série' : 'Supprimer'}</button>` : ''}
        <button type="submit" class="btn primary grow">Enregistrer</button>
      </div>
    </form>
  `);

  const form = $('#eventForm');

  const tplChips = $('#tplChips');
  if (tplChips) {
    tplChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tpl]');
      if (!btn) return;
      const tpl = EVENT_TEMPLATES[Number(btn.dataset.tpl)];
      if (!tpl) return;
      form.querySelector('[name="title"]').value = tpl.title;
      form.querySelector('[name="category"]').value = tpl.category;
      refreshImpact();
      sheetDraft.reminders = new Set(tpl.reminders);
      $$('#remChips .chip').forEach((c) => c.classList.toggle('on', sheetDraft.reminders.has(Number(c.dataset.rem))));
      toast(`Motif « ${tpl.title} » appliqué`, 1800);
    });
  }

  $('#personChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-person]');
    if (!btn) return;
    sheetDraft.profileId = btn.dataset.person;
    $$('#personChips .chip').forEach((c) => c.classList.toggle('on', c === btn));
    const pr = S.profile(sheetDraft.profileId);
    const field = $('#accompField');
    if (field) field.hidden = !pr || pr.role === 'parent';
  });

  const accompChips = $('#accompChips');
  if (accompChips) {
    accompChips.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-accomp]');
      if (!btn) return;
      sheetDraft.accompanist = btn.dataset.accomp || '';
      $$('#accompChips .chip').forEach((c) => c.classList.toggle('on', c === btn));
    });
  }

  $('#remChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rem]');
    if (!btn) return;
    const m = Number(btn.dataset.rem);
    if (sheetDraft.reminders.has(m)) sheetDraft.reminders.delete(m);
    else sheetDraft.reminders.add(m);
    btn.classList.toggle('on', sheetDraft.reminders.has(m));
  });

  const multiInput = form.querySelector('[name="multiDay"]');
  const allDayInput = form.querySelector('[name="allDay"]');
  const endField = $('#endField');
  const repeatField = form.querySelector('.repeat-field');
  const categorySel = form.querySelector('[name="category"]');
  const impactField = $('#custodyImpactField');

  const refreshImpact = () => {
    impactField.hidden = categorySel.value !== 'vacances';
  };
  categorySel.addEventListener('change', refreshImpact);
  refreshImpact();

  const refreshMulti = () => {
    const multi = multiInput.checked;
    endField.hidden = !multi;
    if (multi) {
      allDayInput.checked = true;
      $('#timeField').hidden = true;
      if (repeatField) repeatField.hidden = true;
      const start = String(form.querySelector('[name="date"]').value || '');
      const end = endField.querySelector('input');
      end.min = start;
      if (!end.value || (start && end.value < start)) end.value = start;
    } else {
      $('#timeField').hidden = allDayInput.checked;
      if (repeatField) repeatField.hidden = false;
    }
  };

  allDayInput.addEventListener('change', (e) => {
    $('#timeField').hidden = e.target.checked || multiInput.checked;
  });
  multiInput.addEventListener('change', refreshMulti);
  form.querySelector('[name="date"]').addEventListener('change', refreshMulti);
  refreshMulti();

  const repeatOn = form.querySelector('[name="repeatOn"]');
  const repeatBox = $('#repeatBox');
  const preview = $('#repeatPreview');

  const refreshPreview = () => {
    const fd = new FormData(form);
    const date = String(fd.get('date') || '');
    const every = Number(fd.get('repeatEvery')) || 1;
    const unit = String(fd.get('repeatUnit') || 'month');
    const until = String(fd.get('repeatUntil') || '');
    const count = Number(fd.get('repeatCount')) || 0;

    if (!repeatOn.checked) { preview.textContent = ''; return; }

    const wanted = count > 1 ? Math.min(4, count - 1) : 4;
    const dates = previewDates(date, every, unit, until, wanted);

    let text = '';
    if (count > 1) text = `${count} occurrences au total. `;
    text += dates.length
      ? `Aussi le : ${dates.map((d) => U.fmtDateY(d)).join(' · ')}`
      : (count > 1 ? 'Aucune date suivante.' : 'Aucune date future (vérifiez la date de fin).');
    if (until && dates.length) text += ` · fin ${U.fmtDateY(until)}`;
    preview.textContent = text;
  };

  repeatOn.addEventListener('change', () => {
    repeatBox.hidden = !repeatOn.checked;
    refreshPreview();
  });
  ['input', 'change'].forEach((ev) => {
    form.addEventListener(ev, (e) => {
      if (e.target.closest('.repeat-field') || e.target.name === 'date') refreshPreview();
    });
  });
  refreshPreview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get('title') || '').trim();
    if (!title) { toast('Donnez un titre à l\u2019événement'); return; }

    const wantsRepeat = repeatOn.checked;
    const every = Math.max(1, Math.min(365, Number(fd.get('repeatEvery')) || 1));
    const unit = String(fd.get('repeatUnit') || 'month');
    const until = String(fd.get('repeatUntil') || '') || null;
    const countRaw = Number(fd.get('repeatCount'));
    const count = countRaw > 1 ? Math.min(200, Math.round(countRaw)) : null;

    const multiDay = fd.get('multiDay') === 'on';
    const startDate = String(fd.get('date'));
    let endDate = String(fd.get('endDate') || '') || startDate;
    if (multiDay && endDate < startDate) endDate = startDate;

    const category = String(fd.get('category') || 'autre');
    const affectsCustody = category === 'vacances' && fd.get('affectsCustody') === 'on';

    const payload = {
      ...(rec ? p : {}),
      profileId: sheetDraft.profileId,
      title,
      date: startDate,
      time: String(fd.get('time') || '09:00'),
      allDay: multiDay ? true : fd.get('allDay') === 'on',
      endDate: multiDay ? endDate : null,
      category,
      affectsCustody,
      accompanist: sheetDraft.accompanist || null,
      notes: String(fd.get('notes') || '').trim(),
      reminders: [...sheetDraft.reminders].sort((a, b) => b - a),
      repeat: multiDay ? null : (wantsRepeat ? { every, unit, until, count } : null),
      done: rec ? !!p.done : false,
      doneAt: rec ? p.doneAt || null : null,
      doneDates: rec ? (p.doneDates || []) : [],
    };

    let created = null;
    if (rec) S.put('event', payload, rec.id);
    else created = S.put('event', payload);

    if (created) {
      const prof = S.profile(payload.profileId);
      if (prof && prof.role === 'child') {
        askOtherParent(
          `Nouvel événement pour ${prof.name} : ${payload.title} le ${U.fmtDate(payload.date)}${payload.allDay ? '' : ' à ' + payload.time}`,
          { type: 'event', eventId: created.id },
        );
      }
    }

    closeSheet();
    toast(rec ? 'Événement modifié' : 'Événement ajouté ✓');
  });

  const del = form.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', () => {
      const msg = hasRepeat
        ? 'Supprimer cette série et toutes ses occurrences ?'
        : 'Supprimer cet événement ?';
      if (!confirm(msg)) return;
      S.remove(rec.id);
      closeSheet();
      toast('Supprimé');
    });
  }
}

/* ------------------------------ Note ------------------------------ */

function noteSheet(id, opts = {}) {
  const profs = S.profiles();
  if (!profs.length) {
    toast('Ajoutez d\u2019abord une personne dans l\u2019onglet Personnes');
    ui.view = 'people';
    render();
    return;
  }

  const rec = id ? S.get(id) : null;
  const n = rec ? rec.payload : {
    profileId: opts.profileId || (ui.filter !== 'all' ? ui.filter : (profs[0] || {}).id),
    title: '',
    text: '',
    pinned: false,
  };

  openSheet(`
    <form id="noteForm" class="sheet-form">
      <div class="sheet-head">
        <h2>${rec ? 'Modifier la note' : 'Nouvelle info'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <label class="field">
          <span>Pour qui ?</span>
          <select name="profileId">
            ${profs.map((p) => `<option value="${p.id}" ${n.profileId === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Titre</span><input name="title" maxlength="80" value="${U.esc(n.title)}" placeholder="Ex. Allergies, numéro de la crèche…"></label>
        <label class="field"><span>Contenu</span><textarea name="text" rows="5" placeholder="Note libre…">${U.esc(n.text)}</textarea></label>
        <label class="switch"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}><span>Épingler en haut</span></label>
      </div>
      <div class="sheet-foot">
        ${rec ? `<button type="button" class="btn ghost danger" data-delete>Supprimer</button>` : ''}
        <button type="submit" class="btn primary grow">Enregistrer</button>
      </div>
    </form>
  `);

  const form = $('#noteForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      profileId: String(fd.get('profileId')),
      title: String(fd.get('title') || '').trim() || 'Note',
      text: String(fd.get('text') || '').trim(),
      pinned: fd.get('pinned') === 'on',
    };
    if (!payload.text) { toast('Écrivez le contenu de la note'); return; }
    if (rec) S.put('note', payload, rec.id);
    else S.put('note', payload);
    closeSheet();
    toast('Note enregistrée ✓');
  });

  const del = form.querySelector('[data-delete]');
  if (del) del.addEventListener('click', () => {
    if (!confirm('Supprimer cette note ?')) return;
    S.remove(rec.id);
    closeSheet();
    toast('Note supprimée');
  });
}

/* ---------------------------- Contact ----------------------------- */

function contactSheet(profileId, contactId) {
  const p = S.profile(profileId);
  if (!p) return;

  const list = Array.isArray(p.contacts) ? p.contacts : [];
  const rec = contactId ? list.find((x) => x.id === contactId) : null;
  const c = rec || { label: '', name: '', phone: '', email: '', notes: '' };

  openSheet(`
    <form id="contactForm" class="sheet-form">
      <div class="sheet-head">
        <h2>${rec ? 'Modifier le contact' : 'Nouveau contact'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <p class="hint">Contact de <b>${U.esc(p.name)}</b></p>
        <label class="field"><span>Libellé</span>
          <input name="label" maxlength="40" value="${U.esc(c.label)}" placeholder="Ex. Pédiatre, École, Vétérinaire">
        </label>
        <label class="field"><span>Nom</span>
          <input name="name" maxlength="60" value="${U.esc(c.name)}" placeholder="Ex. Dr Martin">
        </label>
        <label class="field"><span>Téléphone</span>
          <input name="phone" type="tel" value="${U.esc(c.phone)}" placeholder="01 23 45 67 89">
        </label>
        <label class="field"><span>E-mail (facultatif)</span>
          <input name="email" type="email" value="${U.esc(c.email)}" placeholder="contact@exemple.fr">
        </label>
        <label class="field"><span>Notes</span>
          <textarea name="notes" rows="2" placeholder="Horaires, adresse…">${U.esc(c.notes)}</textarea>
        </label>
      </div>
      <div class="sheet-foot">
        ${rec ? '<button type="button" class="btn ghost danger" data-delete>Supprimer</button>' : ''}
        <button type="submit" class="btn primary grow">Enregistrer</button>
      </div>
    </form>
  `);

  const form = $('#contactForm');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      id: rec ? rec.id : U.uid(),
      label: String(fd.get('label') || '').trim(),
      name: String(fd.get('name') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
      email: String(fd.get('email') || '').trim(),
      notes: String(fd.get('notes') || '').trim(),
    };
    if (!payload.label && !payload.name && !payload.phone) {
      toast('Indiquez au moins un libellé, un nom ou un téléphone');
      return;
    }

    const next = rec ? list.map((x) => (x.id === rec.id ? payload : x)) : [...list, payload];
    S.update(profileId, { contacts: next });
    closeSheet();
    toast('Contact enregistré ✓');
  });

  const del = form.querySelector('[data-delete]');
  if (del) {
    del.addEventListener('click', () => {
      if (!confirm('Supprimer ce contact ?')) return;
      S.update(profileId, { contacts: list.filter((x) => x.id !== rec.id) });
      closeSheet();
      toast('Contact supprimé');
    });
  }
}

/* ---------------------------- Personne ---------------------------- */

function profileSheet(id) {
  const rec = id ? S.get(id) : null;
  const p = rec ? rec.payload : { name: '', emoji: '🙋🏽', color: '#2563eb', order: S.profiles().length };

  let emoji = p.emoji || '🙋🏽';
  let role = p.role || 'parent';
  let photo = p.photo || '';

  const ROLE_OPTIONS = [
    ['parent', '👨‍👩‍👦 Parent'],
    ['child', '🧒 Enfant'],
    ['animal', '🐾 Animal'],
  ];

  openSheet(`
    <form id="profileForm" class="sheet-form">
      <div class="sheet-head">
        <h2>${rec ? 'Modifier la personne' : 'Nouvelle personne'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <div class="preview-row">
          <span id="avatarPreview"></span>
          <label class="field grow"><span>Prénom / nom</span>
            <input name="name" required maxlength="40" value="${U.esc(p.name)}" placeholder="Ex. Lucas">
          </label>
        </div>

        <div class="field">
          <span>Photo (facultatif)</span>
          <div class="row gap">
            <button type="button" class="btn ghost grow" id="photoPick">📷 Choisir une photo</button>
            <button type="button" class="btn ghost" id="photoClear" ${photo ? '' : 'hidden'}>Retirer</button>
          </div>
          <input type="file" id="photoInput" accept="image/*" hidden>
          <p class="hint">La photo remplace l'emoji sur les cartes et la fiche.</p>
        </div>

        <div class="field">
          <span>Type</span>
          <div class="chips" id="roleChips">
            ${ROLE_OPTIONS.map(([v, l]) => `<button type="button" class="chip ${role === v ? 'on' : ''}" data-role="${v}">${l}</button>`).join('')}
          </div>
          <p class="hint">La garde alternée ne concerne que les enfants et les animaux, et seuls les parents peuvent garder.</p>
        </div>

        <div class="field">
          <span>Emoji</span>
          <div class="chips" id="emojiChips">
            ${EMOJIS.map((e) => `<button type="button" class="chip emoji ${emoji === e ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}
          </div>
          <p class="hint">Personnages à peau claire et cheveux bruns.</p>
        </div>

        <label class="field"><span>Date de naissance (facultatif)</span>
          <input type="date" name="birthday" value="${p.birthday || ''}">
        </label>
        <p class="hint">L'anniversaire sera ajouté automatiquement au calendrier, chaque année.</p>

        <label class="field"><span>Couleur</span><input type="color" name="color" value="${p.color || '#2563eb'}"></label>
      </div>
      <div class="sheet-foot">
        <button type="submit" class="btn primary grow">Enregistrer</button>
      </div>
    </form>
  `);

  const form = $('#profileForm');
  const colorInput = form.querySelector('[name="color"]');

  const refreshPreview = () => {
    $('#avatarPreview').innerHTML = avatarHTML({ emoji, color: colorInput.value, photo }, 'xl');
  };

  const photoInput = $('#photoInput');
  const photoClear = $('#photoClear');
  const photoPick = $('#photoPick');

  if (photoPick && photoInput) {
    photoPick.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', async () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) return;
      try {
        photo = await fileToAvatar(file);
        if (photoClear) photoClear.hidden = false;
        refreshPreview();
      } catch {
        toast('Photo illisible');
      }
    });
  }

  if (photoClear) {
    photoClear.addEventListener('click', () => {
      photo = '';
      photoClear.hidden = true;
      refreshPreview();
    });
  }

  $('#roleChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-role]');
    if (!btn) return;
    role = btn.dataset.role;
    $$('#roleChips .chip').forEach((c) => c.classList.toggle('on', c === btn));
  });

  $('#emojiChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    emoji = btn.dataset.emoji;
    $$('#emojiChips .chip').forEach((c) => c.classList.toggle('on', c === btn));
    refreshPreview();
  });

  colorInput.addEventListener('input', refreshPreview);
  refreshPreview();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      ...p,
      name: String(fd.get('name') || '').trim() || 'Sans nom',
      emoji,
      role,
      photo: photo || null,
      birthday: String(fd.get('birthday') || '') || null,
      color: String(fd.get('color') || '#2563eb'),
    };
    delete payload.icon;
    if (rec) S.put('profile', payload, rec.id);
    else S.put('profile', payload);
    closeSheet();
    toast('Personne enregistrée ✓');
  });
}

/* ----------------------------- Bilan ------------------------------ */

const EXPENSE_CATS = {
  cantine: '🍽️ Cantine',
  sante: '🩺 Santé',
  ecole: '🎒 École',
  loisirs: '⚽ Loisirs',
  vetements: '👕 Vêtements',
  autres: '📦 Autres',
};

function bilanRange() {
  const now = new Date();

  if (ui.bilanPeriod === 'mois') {
    const d = new Date(now.getFullYear(), now.getMonth() + ui.bilanOffset, 1);
    return {
      from: U.toDateISO(d),
      to: U.toDateISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      label: U.fmtMonth(d),
      nav: true,
    };
  }

  if (ui.bilanPeriod === 'annee') {
    const y = now.getFullYear() + ui.bilanOffset;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}`, nav: true };
  }

  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${y}-09-01`, to: U.toDateISO(now), label: `Depuis la rentrée · sept. ${y}`, nav: false };
}

function custodyCounts(from, to) {
  const out = [];
  for (const cfg of S.custodyConfigs()) {
    const counts = { [cfg.evenId]: 0, [cfg.oddId]: 0 };
    let d = U.parseLocal(from);
    const end = U.parseLocal(to);
    let guard = 0;
    while (d <= end && guard++ < 800) {
      const day = S.custodyDayFor(cfg, U.toDateISO(d));
      const owner = day ? (day.sleep || day.am || day.pm) : null;
      if (owner && counts[owner] != null) counts[owner] += 1;
      d = U.addDays(d, 1);
    }
    out.push({ cfg, counts });
  }
  return out;
}

function expenseBalance(list, parents) {
  const bal = {};
  for (const p of parents) bal[p.id] = 0;

  for (const e of list) {
    const amount = Number(e.amount) || 0;

    if (e.settle) {
      if (bal[e.from] != null) bal[e.from] += amount;
      if (bal[e.to] != null) bal[e.to] -= amount;
      continue;
    }

    if (bal[e.paidBy] != null) bal[e.paidBy] += amount;

    if (!e.split || e.split === 'half') {
      for (const p of parents) bal[p.id] -= amount / 2;
    } else if (typeof e.split === 'object') {
      for (const p of parents) bal[p.id] -= amount * ((Number(e.split[p.id]) || 0) / 100);
    } else if (typeof e.split === 'number') {
      for (const p of parents) bal[p.id] -= amount * (e.split / 100);
    }
  }

  return bal;
}

function euro(cents) {
  return (Math.round(Number(cents) || 0) / 100).toFixed(2).replace('.', ',') + ' €';
}

function addMonthsISO(dateISO, months) {
  const d = U.parseLocal(dateISO);
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return U.toDateISO(target);
}

function bilanHTML() {
  const parents = S.profiles().filter((p) => p.role === 'parent');
  const range = bilanRange();
  const counts = custodyCounts(range.from, range.to);

  const periodBar = `
    <div class="stack">
      <div class="seg bilan-seg">
        <button type="button" class="seg-btn ${ui.bilanPeriod === 'rentree' ? 'on' : ''}" data-action="bilan-period" data-id="rentree">Rentrée</button>
        <button type="button" class="seg-btn ${ui.bilanPeriod === 'mois' ? 'on' : ''}" data-action="bilan-period" data-id="mois">Mois</button>
        <button type="button" class="seg-btn ${ui.bilanPeriod === 'annee' ? 'on' : ''}" data-action="bilan-period" data-id="annee">Année</button>
      </div>
      ${range.nav ? `<div class="bilan-nav">
        <button class="icon-btn" data-action="bilan-prev" aria-label="Période précédente">‹</button>
        <b>${U.esc(range.label)}</b>
        <button class="icon-btn" data-action="bilan-next" aria-label="Période suivante">›</button>
      </div>` : `<p class="bilan-label">${U.esc(range.label)}</p>`}
    </div>`;

  const custodyBlock = counts.length
    ? `<section class="block">
        <div class="block-head"><h2>Garde</h2><span class="count">${U.fmtDateY(U.parseLocal(range.from))} → ${U.fmtDateY(U.parseLocal(range.to))}</span></div>
        <div class="card bilan-card">
        ${counts.map(({ cfg, counts: c }) => {
          const total = (c[cfg.evenId] || 0) + (c[cfg.oddId] || 0) || 1;
          const row = (id) => {
            const p = S.profile(id) || {};
            const n = c[id] || 0;
            const pct = Math.round((n / total) * 100);
            return `<div class="bilan-row">
              <span class="bilan-name"><i class="bilan-dot" style="--c:${p.color || '#94a3b8'}"></i>${U.esc(p.name || 'Parent')}</span>
              <span class="bilan-bar"><i style="width:${pct}%; --c:${p.color || '#94a3b8'}"></i></span>
              <b class="bilan-num">${n} j</b>
            </div>`;
          };
          return `<div class="bilan-child">
            <p class="bilan-child-head">${cfg.emoji} <b>${U.esc(cfg.name)}</b><span>${total} jours</span></p>
            ${row(cfg.evenId)}${row(cfg.oddId)}
          </div>`;
        }).join('')}
        </div>
      </section>`
    : `<section class="block">
        <div class="block-head"><h2>Garde</h2></div>
        <div class="card empty small"><p>Aucune garde alternée configurée.</p>
        <button class="btn ghost" data-action="nav" data-view="settings">Configurer</button></div>
      </section>`;

  const list = S.expenses().filter((e) => e.date >= range.from && e.date <= range.to);
  const bal = expenseBalance(list, parents);
  const paidTotals = {};
  for (const p of parents) paidTotals[p.id] = 0;
  for (const e of list) if (!e.settle && paidTotals[e.paidBy] != null) paidTotals[e.paidBy] += Number(e.amount) || 0;

  let debt = null;
  if (parents.length === 2) {
    const [a, b] = parents;
    const va = bal[a.id] || 0;
    const vb = bal[b.id] || 0;
    if (Math.abs(va - vb) >= 1) {
      const [debtor, creditor, amount] = va < vb ? [a, b, (vb - va) / 2] : [b, a, (va - vb) / 2];
      debt = { debtor, creditor, amount: Math.round(amount) };
    }
  }

  const expenseRows = list.filter((e) => !e.settle).map((e) => {
    const payer = S.profile(e.paidBy) || {};
    const d = U.parseLocal(e.date);
    return `<button class="exp-row" data-action="edit-expense" data-id="${e.id}">
      <span class="exp-date"><b>${d.getDate()}</b><i>${U.fmtMonthShort(e.date)}</i></span>
      <span class="exp-main">
        <b>${U.esc(e.label || 'Dépense')}</b>
        <span class="muted">${EXPENSE_CATS[e.category] || EXPENSE_CATS.autres} · payé par ${U.esc(payer.name || '—')}</span>
      </span>
      <span class="exp-amount">${euro(e.amount)}</span>
    </button>`;
  }).join('');

  const expenseBlock = `
    <section class="block">
      <div class="block-head"><h2>Dépenses</h2><span class="count">${list.filter((e) => !e.settle).length}</span></div>
      <div class="card balance-card">
        <div class="bal-summary">${parents.map((p) => `<span class="bal-chip"><i style="--c:${p.color}"></i>${U.esc(p.name)} : ${euro(paidTotals[p.id] || 0)}</span>`).join('')}</div>
        <p class="bal-line ${debt ? '' : 'ok'}">${parents.length < 2
          ? 'Ajoutez deux parents pour calculer un partage.'
          : debt
            ? `<b>${U.esc(debt.debtor.name)}</b> doit <b>${euro(debt.amount)}</b> à <b>${U.esc(debt.creditor.name)}</b>`
            : 'Comptes à l\'équilibre ✓'}</p>
        <div class="row gap">
          <button class="btn primary grow" data-action="add-expense">＋ Ajouter une dépense</button>
          ${debt ? `<button class="btn ghost" data-action="settle-expense">Remboursé</button>` : ''}
        </div>
      </div>
      ${expenseRows ? `<div class="exp-list">${expenseRows}</div>` : '<p class="hint">Aucune dépense sur cette période.</p>'}
    </section>`;

  const requestsBlock = (() => {
    const all = S.requests().filter((r) => r.payload && r.payload.status && r.payload.status !== 'pending');
    const rows = all.slice(0, 10).map((r) => {
      const p = r.payload;
      const ok = p.status === 'accepted';
      const d = new Date(p.createdAt || Date.now());
      return `<div class="req-row">
        <span class="req-badge ${ok ? 'ok' : 'no'}">${ok ? 'Acceptée' : 'Refusée'}</span>
        <span class="req-main">
          <b>${U.esc(p.summary || 'Demande')}</b>
          <span class="muted">${U.esc(p.author || '—')} · ${U.fmtDateY(d)}${p.resolvedBy ? ' · réponse de ' + U.esc(p.resolvedBy) : ''}</span>
          ${p.comment ? `<span class="req-comment">« ${U.esc(p.comment)} »</span>` : ''}
        </span>
      </div>`;
    }).join('');

    return `<section class="block">
      <div class="block-head"><h2>Demandes</h2><span class="count">${all.length}</span></div>
      ${all.length ? `<div class="card req-list">${rows}</div>` : '<p class="hint">Aucune demande traitée pour le moment.</p>'}
    </section>`;
  })();

  return `<div class="stack">
    <h1 class="page-title">Bilan</h1>
    ${periodBar}
    ${custodyBlock}
    ${expenseBlock}
    ${requestsBlock}
  </div>`;
}

function expenseSheet(id) {
  const rec = id ? S.get(id) : null;
  const p = rec && rec.payload && rec.payload.expense ? rec.payload : null;
  const parents = S.profiles().filter((x) => x.role === 'parent');

  if (parents.length < 2) {
    toast('Ajoutez d\u2019abord deux personnes de type « Parent »');
    return;
  }

  const paidBy = p ? p.paidBy : parents[0].id;
  const cat = p ? p.category || 'autres' : 'autres';
  let splitValue = 'half';
  if (p && p.split && typeof p.split === 'object') {
    const first = Number(p.split[parents[0].id]) || 0;
    splitValue = [0, 40, 50, 60, 100].includes(first) ? String(first) : 'custom';
  }
  const defaultPct = p && p.split && typeof p.split === 'object'
    ? Math.max(0, Math.min(100, Number(p.split[parents[0].id]) || 0))
    : 50;

  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;

  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>${p ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        <label class="field"><span>Libellé</span>
          <input id="expLabel" maxlength="60" value="${p ? U.esc(p.label || '') : ''}" placeholder="Cantine de novembre">
        </label>
        <div class="row gap">
          <label class="field grow"><span>Montant (€)</span>
            <input id="expAmount" type="number" step="0.01" min="0" inputmode="decimal" value="${p ? (Number(p.amount) / 100).toFixed(2) : ''}" placeholder="0,00">
          </label>
          <label class="field grow"><span>Date</span>
            <input id="expDate" type="date" value="${p && p.date ? p.date : U.toDateISO()}">
          </label>
        </div>
        <label class="field"><span>Payé par</span>
          <select id="expPaidBy">${parents.map((x) => opt(x.id, `${x.emoji} ${U.esc(x.name)}`, paidBy)).join('')}</select>
        </label>
        <label class="field"><span>Catégorie</span>
          <select id="expCat">${Object.entries(EXPENSE_CATS).map(([k, v]) => opt(k, v, cat)).join('')}</select>
        </label>
        <label class="field"><span>Partage</span>
          <select id="expSplit">
            ${opt('half', '50 % / 50 %', splitValue)}
            ${opt('60', `60 % ${U.esc(parents[0].name)} / 40 % ${U.esc(parents[1].name)}`, splitValue)}
            ${opt('40', `40 % ${U.esc(parents[0].name)} / 60 % ${U.esc(parents[1].name)}`, splitValue)}
            ${opt('100', `100 % ${U.esc(parents[0].name)}`, splitValue)}
            ${opt('0', `100 % ${U.esc(parents[1].name)}`, splitValue)}
            ${opt('custom', 'Répartition libre…', splitValue)}
          </select>
        </label>
        <div id="expCustomRow" class="stack" ${splitValue === 'custom' ? '' : 'hidden'}>
          <label class="field"><span>Part de ${U.esc(parents[0].name)} (%)</span>
            <input id="expPctA" type="number" min="0" max="100" step="5" value="${defaultPct}">
          </label>
          <p class="hint" id="expPctHint">${100 - defaultPct} % pour ${U.esc(parents[1].name)}</p>
        </div>
        <label class="field"><span>Note (facultatif)</span>
          <input id="expNote" maxlength="120" value="${p ? U.esc(p.note || '') : ''}">
        </label>
        ${p ? '' : `<label class="field"><span>Répéter</span>
          <select id="expRepeat">
            ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i === 0 ? 'Une seule fois' : (i + 1) + ' mois'}</option>`).join('')}
          </select>
        </label>`}
      </div>
      <div class="sheet-foot">
        ${p ? `<button type="button" class="btn ghost danger" data-action="delete-expense" data-id="${id}">Supprimer</button>` : ''}
        <button type="button" class="btn primary grow" data-action="save-expense" data-id="${id || ''}">Enregistrer</button>
      </div>
    </div>
  `);

  const splitSelect = $('#expSplit');
  const customRow = $('#expCustomRow');
  const pctInput = $('#expPctA');
  const pctHint = $('#expPctHint');

  const syncCustom = () => {
    if (!splitSelect || !customRow) return;
    const custom = splitSelect.value === 'custom';
    customRow.hidden = !custom;
    if (custom && pctInput && pctHint) {
      const v = Math.max(0, Math.min(100, Math.round(Number(pctInput.value) || 0)));
      pctHint.textContent = `${100 - v} % pour ${parents[1].name}`;
    }
  };
  if (splitSelect) splitSelect.addEventListener('change', syncCustom);
  if (pctInput) pctInput.addEventListener('input', syncCustom);
  syncCustom();
}

/* ---------------------------- Demandes ---------------------------- */

function requestsSheet() {
  const me = myDevice();
  const list = S.requests();
  const pending = list.filter((r) => r.payload.status === 'pending');
  const done = list.filter((r) => r.payload.status !== 'pending');

  const card = (rec) => {
    const p = rec.payload;
    const mine = p.authorId === me.id;
    const label = p.status === 'accepted' ? '✅ Acceptée' : p.status === 'refused' ? '❌ Refusée' : '⏳ En attente';

    return `<div class="card request">
      <div class="request-head">
        <b>${U.esc(p.summary || 'Demande')}</b>
        <span class="request-status ${p.status}">${label}</span>
      </div>
      <p class="muted">${mine ? 'Demandé par vous' : `Demandé par ${U.esc(p.author || 'l\u2019autre parent')}`} · ${U.fmtDateTime(new Date(p.createdAt || Date.now()))}</p>
      ${p.status !== 'pending' ? `<p class="request-comment">${p.comment ? `« ${U.esc(p.comment)} »` : 'Sans commentaire'}${p.resolvedBy ? ` — ${U.esc(p.resolvedBy)}` : ''}</p>` : ''}
      ${p.status === 'pending' && !mine ? `
        <label class="field"><span>Commentaire (facultatif)</span>
          <input id="c-${rec.id}" maxlength="200" placeholder="Ex. ce week-end, il est chez sa grand-mère">
        </label>
        <div class="row gap">
          <button class="btn primary grow" data-action="request-accept" data-id="${rec.id}">Accepter</button>
          <button class="btn ghost danger grow" data-action="request-refuse" data-id="${rec.id}">Refuser</button>
        </div>` : ''}
      ${p.status === 'pending' && mine ? '<p class="hint">En attente de la réponse de l\u2019autre parent.</p>' : ''}
    </div>`;
  };

  openSheet(`
    <div class="sheet-form">
      <div class="sheet-head">
        <h2>Demandes</h2>
        <button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button>
      </div>
      <div class="sheet-body">
        ${pending.length ? pending.map(card).join('') : '<div class="card empty small"><p>Aucune demande en attente.</p></div>'}
        ${done.length ? `<p class="block-head"><h2>Historique</h2></p>${done.slice(0, 10).map(card).join('')}` : ''}
      </div>
      <div class="sheet-foot">
        <button type="button" class="btn ghost grow" data-close>Fermer</button>
      </div>
    </div>
  `);
}

function revertRequest(rec) {
  const d = (rec.payload && rec.payload.details) || {};
  try {
    if (d.type === 'custody' && d.childId && d.date && d.part) {
      S.setCustodyPartFor(d.childId, d.date, d.part, d.before || null);
    } else if (d.type === 'event' && d.eventId) {
      S.remove(d.eventId);
    }
  } catch (err) {
    console.warn('Annulation impossible', err);
  }
}

/* ---------------------------- Réglages ---------------------------- */

/* Comptes créés — visibles uniquement par le compte du créateur. */
const K_SIGNUPS_SEEN = 'af.signupsSeen.v1';

function signupsSeenAt() {
  const raw = localStorage.getItem(K_SIGNUPS_SEEN);
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function newAccountsCount() {
  const seen = signupsSeenAt();
  return (Sync.creator.accounts || []).filter((a) => {
    const t = a.created_at ? Date.parse(a.created_at) : 0;
    return t > seen;
  }).length;
}

function accountsHTML() {
  const list = (Sync.creator.accounts || []).slice();
  const seen = signupsSeenAt();
  const fresh = newAccountsCount();

  const items = list.slice().reverse().map((a) => {
    const created = a.created_at ? new Date(a.created_at) : null;
    const last = a.last_seen ? new Date(a.last_seen) : null;
    const isNew = created && created.getTime() > seen;
    return `<li class="account-item">
      <div class="account-main">
        <span class="account-mail">${U.esc(a.email || '—')}</span>
        ${isNew ? '<span class="tag-new">Nouveau</span>' : ''}
      </div>
      <div class="account-meta">${created ? 'Créé le ' + U.esc(U.fmtDateY(created)) : ''}${a.device ? ' · ' + U.esc(a.device) : ''}${last ? ' · vu le ' + U.esc(U.fmtDateY(last)) : ''}</div>
    </li>`;
  }).join('');

  return `<div class="settings-block">
    <h3>🆕 Nouveaux comptes${fresh ? ` <span class="count-pill">${fresh}</span>` : ''}</h3>
    <p class="muted">Tous les comptes Kifékoi créés. Cette liste n'est visible que par le créateur.</p>
    ${list.length ? `<ul class="account-list">${items}</ul>` : '<p class="hint">Aucun compte enregistré pour le moment.</p>'}
    ${fresh ? '<button class="btn ghost wide" data-action="signups-seen">Tout marquer comme lu</button>' : ''}
  </div>`;
}

function nextCustodySwitch(raw) {
  if (!raw) return null;
  const cfg = { ...raw, mode: raw.mode || 'parity' };
  const today = U.toDateISO(new Date());
  let prev = S.custodyBaseFor(cfg, today);
  if (!prev) return null;
  for (let i = 1; i <= 400; i++) {
    const iso = U.toDateISO(U.addDays(U.parseLocal(today), i));
    const next = S.custodyBaseFor(cfg, iso);
    if (next && next !== prev) return { date: iso, ownerId: next };
  }
  return null;
}

function weekTable(which, days) {
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const dayNames = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const rows = [['am', 'Matin'], ['pm', 'A-midi'], ['sleep', 'Nuit']];

  return `<p class="week-title">Semaine ${which}</p>
    <div class="week-table">
      <div class="week-row week-row-head">
        <span class="week-lab"></span>
        ${dayLabels.map((d) => `<span class="week-daylab">${d}</span>`).join('')}
      </div>
      ${rows.map(([part, label]) => `
        <div class="week-row">
          <span class="week-lab">${label}</span>
          ${days.map((entry, i) => {
            const pr = S.profile(entry[part]) || {};
            return `<button type="button" class="week-cell" data-action="custody-week-part" data-id="${which}" data-day="${i}" data-part="${part}" style="--c:${pr.color || '#94a3b8'}" aria-label="Semaine ${which}, ${dayNames[i]}, ${label} : ${U.esc(pr.name || '—')}">${pr.emoji || '·'}</button>`;
          }).join('')}
        </div>`).join('')}
    </div>`;
}

function mondayOfISO(iso) {
  const d = U.parseLocal(iso || U.toDateISO());
  const wd = (d.getDay() + 6) % 7;
  return U.toDateISO(U.addDays(d, -wd));
}

function settingsHTML() {
  if (isReadOnly()) {
    return `<div class="stack settings-page">
      <div class="settings-block">
        <h3>🔒 Lecture seule</h3>
        <p class="muted">Cet appareil permet de <b>consulter</b> l'agenda, mais pas de le modifier.</p>
        <button class="btn primary wide" data-action="unlock-readonly">Déverrouiller avec le code parent</button>
      </div>
      <div class="settings-block">
        <h3>❓ Aide</h3>
        <button class="btn ghost wide" data-action="help">Ouvrir l'aide</button>
        <button class="btn ghost wide" data-action="tuto-replay">Revoir le tutoriel</button>
      </div>
      <p class="about">Kifékoi · lecture seule</p>

    </div>`;
  }

  const st = Sync.status;
  const ns = notifState();
  const signedIn = Sync.isSignedIn();

  const syncBlock = !Sync.configured
    ? `<div class="settings-block">
        <h3>🔗 Partager entre les 2 téléphones</h3>
        <p class="muted">Le partage n'est pas encore configuré.<br>Ouvrez le fichier <code>config.js</code> et renseignez l'adresse et la clé de votre projet Supabase (gratuit), puis rechargez l'application.</p>
        <p class="hint">⚠️ En attendant, vos données sont enregistrées dans <b>ce navigateur</b> et à <b>cette adresse</b> : Edge et Chrome ne partagent rien, et changer de port (<code>8123</code> → <code>8124</code>) revient à repartir de zéro. Utilisez « Sauvegarder » ci-dessous pour les transférer.</p>
      </div>`
    : signedIn
      ? `<div class="settings-block">
          <h3>🔗 Synchronisation</h3>
          <p class="sync-line" id="syncState"><span class="dot ${st.mode === 'error' || st.mode === 'offline' ? 'err' : 'on'}"></span> ${U.esc(Sync.syncStatusLabel())}</p>
          <p class="muted" id="syncDetail">${U.esc(st.email || '')}${st.message ? '<br>' + U.esc(st.message) : ''}</p>
          <div class="row gap">
            <button class="btn ghost grow" data-action="sync-now">Synchroniser maintenant</button>
            <button class="btn ghost danger" data-action="sign-out">Déconnexion</button>
          </div>
        </div>`
      : `<div class="settings-block">
          <h3>🔗 Relier ce téléphone</h3>
          <p class="muted">Utilisez le <b>même compte</b> que sur l'autre téléphone. Les données seront partagées entre les deux.</p>
          <form id="authForm" class="auth-form">
            <label class="field"><span>E-mail</span><input type="email" name="email" required autocomplete="username" placeholder="vous@exemple.fr"></label>
            <label class="field"><span>Mot de passe</span><input type="password" name="password" required minlength="6" autocomplete="current-password" placeholder="6 caractères minimum"></label>
            <div class="row gap">
              <button type="submit" class="btn primary grow" data-mode="signin">Se connecter</button>
              <button type="button" class="btn ghost" data-action="sign-up">Créer le compte</button>
            </div>
          </form>
        </div>`;

  const accountsBlock = signedIn && Sync.creator.isCreator ? accountsHTML() : '';

  const installBlock = isNative
    ? `<p class="hint">✅ Application Android. Les rappels sont programmés par le téléphone, même app fermée.</p>`
    : ui.installPrompt
      ? `<button class="btn primary wide" data-action="install">📲 Installer sur ce téléphone</button>`
      : (window.matchMedia('(display-mode: standalone)').matches
        ? `<p class="hint">✅ Application installée sur cet appareil.</p>`
        : (isIOS
          ? `<p class="hint">Sur iPhone : bouton <b>Partager</b> (carré avec une flèche) → <b>Sur l'écran d'accueil</b>.</p>`
          : `<p class="hint">Pour installer : menu Chrome ⋮ → « Ajouter à l'écran d'accueil ».</p>`));

  const childCandidates = S.profiles().filter((p) => p.role === 'child');
  const parentCandidates = S.profiles().filter((p) => p.role === 'parent');
  const selectedId = (ui.custodyChildId && childCandidates.some((p) => p.id === ui.custodyChildId))
    ? ui.custodyChildId
    : (childCandidates[0] ? childCandidates[0].id : null);
  const selected = selectedId ? S.profile(selectedId) : null;
  const raw = selectedId ? S.custodyRawFor(selectedId) : null;
  const isCycle = !!(raw && raw.mode === 'cycle');
  const isWeeks = !!(raw && raw.mode === 'weeks');
  const anchorPart = raw && raw.anchorPart ? raw.anchorPart : 'am';
  const weekA = raw && Array.isArray(raw.weekA) && raw.weekA.length === 7
    ? raw.weekA
    : Array(7).fill(raw && raw.evenId ? raw.evenId : null);
  const weekB = raw && Array.isArray(raw.weekB) && raw.weekB.length === 7
    ? raw.weekB
    : Array(7).fill(raw && raw.oddId ? raw.oddId : null);
  const weekAnchorISO = mondayOfISO(raw && raw.anchor ? raw.anchor : U.toDateISO(new Date()));
  const normWeek = (arr, fallback) => Array.from({ length: 7 }, (_, i) => {
    const e = arr && arr[i];
    if (typeof e === 'string') return { am: e, pm: e, sleep: e };
    if (e && typeof e === 'object') return { am: e.am || fallback, pm: e.pm || fallback, sleep: e.sleep || fallback };
    return { am: fallback, pm: fallback, sleep: fallback };
  });
  const wA = normWeek(weekA, raw && raw.evenId ? raw.evenId : null);
  const wB = normWeek(weekB, raw && raw.oddId ? raw.oddId : null);
  const aDays = isCycle ? (Number(raw.aDays) || 7) : 7;
  const bDays = isCycle ? (Number(raw.bDays) || 7) : 7;
  const anchorISO = isCycle && raw.anchor ? raw.anchor : U.toDateISO(new Date());
  const profA = raw && raw.evenId ? S.profile(raw.evenId) : null;
  const profB = raw && raw.oddId ? S.profile(raw.oddId) : null;
  const nameA = profA ? profA.name : 'Parent 1';
  const nameB = profB ? profB.name : 'Parent 2';
  const switcher = raw && raw.enabled ? nextCustodySwitch(raw) : null;
  const enabledChildren = childCandidates.filter((p) => p.custody && p.custody.enabled).length;
  const custodyBlock = `
    <div class="settings-block">
      <h3>🗓️ Garde alternée</h3>
      <p class="muted"><b>Facultatif</b> — pour les parents séparés. Une barre colorée indique qui garde chaque enfant au-dessus de chaque jour. Chaque enfant a ses propres réglages.</p>
      ${childCandidates.length === 0
        ? '<p class="hint">Ajoutez d\u2019abord un enfant dans l\u2019onglet Personnes (champ « Type »).</p>'
        : `<label class="field"><span>Enfant à configurer${enabledChildren ? ` (${enabledChildren} actif${enabledChildren > 1 ? 's' : ''})` : ''}</span>
        <select id="custodyChild">
          ${childCandidates.map((p) => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${p.emoji} ${U.esc(p.name)}${p.custody && p.custody.enabled ? ' ✓' : ''}</option>`).join('')}
        </select>
      </label>
      <label class="switch"><input type="checkbox" id="custodyEnabled" ${raw && raw.enabled ? 'checked' : ''}><span>Garde alternée pour ${U.esc(selected ? selected.name : 'cet enfant')}</span></label>
      ${raw && raw.enabled && raw.evenId && raw.oddId ? `
        ${isWeeks ? '' : `
        <div class="field"><span>Période 1 avec</span>
          <div class="chips">
            ${parentCandidates.length
              ? parentCandidates.map((p) => `<button type="button" class="chip ${raw.evenId === p.id ? 'on' : ''}" data-custody-even="${p.id}" style="--c:${p.color}"><span class="chip-avatar">${p.emoji}</span>${U.esc(p.name)}</button>`).join('')
              : '<span class="hint">Aucun profil de type « Parent ».</span>'}
          </div>
        </div>
        <div class="field"><span>Période 2 avec</span>
          <div class="chips">
            ${parentCandidates.length
              ? parentCandidates.map((p) => `<button type="button" class="chip ${raw.oddId === p.id ? 'on' : ''}" data-custody-odd="${p.id}" style="--c:${p.color}"><span class="chip-avatar">${p.emoji}</span>${U.esc(p.name)}</button>`).join('')
              : '<span class="hint">Aucun profil de type « Parent ».</span>'}
          </div>
        </div>
        `}
        <div class="field"><span>Type de rythme</span>
          <div class="seg">
            <button type="button" class="seg-btn ${isWeeks ? '' : 'on'}" data-action="custody-mode" data-id="cycle">Alternance de périodes</button>
            <button type="button" class="seg-btn ${isWeeks ? 'on' : ''}" data-action="custody-mode" data-id="weeks">Semaines types</button>
          </div>
        </div>
        ${isWeeks ? `
          <p class="hint">Touchez une case pour changer le parent. Chaque jour se règle séparément le matin, l'après-midi et la nuit. Les semaines A et B alternent automatiquement.</p>
          ${weekTable('A', wA)}
          ${weekTable('B', wB)}
          <label class="field"><span>La semaine A commence le (lundi)</span>
            <input type="date" id="custodyWeekAnchor" value="${weekAnchorISO}">
          </label>
          <p class="hint">Nuits de la semaine A : ${wA.filter((d) => d.sleep === raw.evenId).length} chez ${U.esc(nameA)}, ${wA.filter((d) => d.sleep === raw.oddId).length} chez ${U.esc(nameB)} · Semaine B : ${wB.filter((d) => d.sleep === raw.evenId).length} / ${wB.filter((d) => d.sleep === raw.oddId).length}.${switcher ? ` Prochain changement : <b>${U.fmtDateY(switcher.date)}</b>.` : ''}</p>
        ` : `
          <div class="field"><span>Rythme de garde</span>
            <div class="chips">
              <button type="button" class="chip ${isCycle && aDays === 7 && bDays === 7 ? 'on' : ''}" data-custody-preset="7-7">1 sem. / 1 sem.</button>
              <button type="button" class="chip ${isCycle && aDays === 14 && bDays === 14 ? 'on' : ''}" data-custody-preset="14-14">2 sem. / 2 sem.</button>
              <button type="button" class="chip ${isCycle && aDays === 3 && bDays === 4 ? 'on' : ''}" data-custody-preset="3-4">3 j / 4 j</button>
              <button type="button" class="chip ${isCycle && aDays === 4 && bDays === 3 ? 'on' : ''}" data-custody-preset="4-3">4 j / 3 j</button>
            </div>
          </div>
          <div class="row gap">
            <label class="field grow"><span>Jours chez ${U.esc(nameA)}</span>
              <input type="number" min="1" max="60" step="1" id="custodyA" value="${aDays}">
            </label>
            <label class="field grow"><span>Jours chez ${U.esc(nameB)}</span>
              <input type="number" min="1" max="60" step="1" id="custodyB" value="${bDays}">
            </label>
          </div>
          <label class="field"><span>Début du rythme (chez ${U.esc(nameA)})</span>
            <input type="date" id="custodyAnchor" value="${anchorISO}">
          </label>
          <label class="field"><span>Le rythme démarre à</span>
            <select id="custodyAnchorPart">
              <option value="am" ${anchorPart === 'am' ? 'selected' : ''}>Matin</option>
              <option value="pm" ${anchorPart === 'pm' ? 'selected' : ''}>Après-midi</option>
              <option value="sleep" ${anchorPart === 'sleep' ? 'selected' : ''}>Nuit</option>
            </select>
          </label>
          <p class="hint">${isCycle
            ? `Rythme : <b>${aDays} jour${aDays > 1 ? 's' : ''}</b> chez ${U.esc(nameA)}, puis <b>${bDays} jour${bDays > 1 ? 's' : ''}</b> chez ${U.esc(nameB)}, à partir du ${U.fmtDateY(U.parseLocal(anchorISO))} (${anchorPart === 'am' ? 'matin' : anchorPart === 'pm' ? 'après-midi' : 'nuit'}).${switcher ? ` Prochain changement : <b>${U.fmtDateY(switcher.date)}</b>${S.profile(switcher.ownerId) ? ' chez ' + U.esc(S.profile(switcher.ownerId).name) : ''}.` : ''}`
            : `Réglage actuel : semaines paires chez ${U.esc(nameA)}, impaires chez ${U.esc(nameB)}. Choisissez un rythme ou le mode « Semaines types » pour le remplacer.`}</p>
        `}
        ${parentCandidates.length < 2 ? '<p class="hint">Il faut au moins deux personnes de type « Parent » pour alterner.</p>' : ''}
        ${childCandidates.length > 1 && enabledChildren > 1 ? '<button class="btn ghost wide" data-action="custody-apply-all">↔ Appliquer ces règles à tous les enfants</button>' : ''}
      ` : ''}
      `}
      <p class="hint">Pour changer un jour précis : Agenda → choisir le jour → <b>Modifier</b>. La barre se coupe en deux (matin / après-midi) et la lettre indique chez qui l'enfant dort.</p>
    </div>`;

  const pushBlock = isNative ? '' : (() => {
    const ps = Push.state;
    const body = !Push.ready
      ? '<p class="hint">Le service de push n\u2019est pas encore installé sur ce projet Supabase (clé VAPID manquante).</p>'
      : !signedIn
        ? '<p class="hint">Reliez d\u2019abord ce téléphone avec le compte de la famille (bloc « Relier ce téléphone »).</p>'
        : ps.permission === 'denied'
          ? '<p class="hint">Notifications bloquées pour ce site : autorisez-les dans les réglages Chrome (Infos du site → Notifications), puis revenez ici.</p>'
          : ps.subscribed
            ? `<p class="sync-line"><span class="dot ${ps.permission === 'granted' ? 'on' : 'err'}"></span> ${U.esc(Push.statusLabel())}</p>
               <div class="row gap">
                 <button class="btn ghost grow" data-action="push-test">Tester</button>
                 <button class="btn ghost danger grow" data-action="push-off" ${ps.busy ? 'disabled' : ''}>Désactiver</button>
               </div>`
            : `<p class="sync-line"><span class="dot off"></span> ${U.esc(Push.statusLabel())}</p>
               <button class="btn primary wide" data-action="push-on" ${ps.busy ? 'disabled' : ''}>Activer les notifications push</button>`;

    return `<div class="settings-block">
      <h3>📨 Notifications même app fermée</h3>
      <p class="muted">Pour être prévenu des demandes de l\u2019autre parent même quand Kifékoi est fermé. À activer sur chaque téléphone.</p>
      ${body}
      ${isIOS ? '<p class="hint">Sur iPhone : ajoutez d\u2019abord l\u2019application à l\u2019écran d\u2019accueil (Partager), puis activez les notifications (iOS 16.4 ou plus).</p>' : ''}
    </div>`;
  })();

  return `<div class="stack settings-page">
    <div class="settings-block">
      <h3>❓ Aide</h3>
      <p class="muted">Mode d'emploi, astuces et réponses aux questions fréquentes.</p>
      <div class="row gap">
        <button class="btn ghost grow" data-action="help">Ouvrir l'aide</button>
        <button class="btn ghost grow" data-action="tuto-replay">Revoir le tutoriel</button>
      </div>
      <button class="btn ghost wide" data-action="force-update">🔄 Forcer la mise à jour</button>
    </div>

    <div class="settings-block">
      <h3>🔒 Accès en lecture seule</h3>
      <p class="muted">Verrouille cet appareil : l'agenda reste consultable, mais aucune modification n'est possible. Utile pour le téléphone d'un enfant.</p>
      <button class="btn ghost wide" data-action="lock-readonly">Verrouiller cet appareil</button>
    </div>

    <div class="settings-block">
      <h3>🏫 Zone de vacances scolaires</h3>
      <p class="muted">Utilisée pour afficher les vacances dans le calendrier.</p>
      <div class="chips">
        ${['A', 'B', 'C'].map((z) => `<button type="button" class="chip ${schoolZone() === z ? 'on' : ''}" data-action="set-zone" data-id="${z}">Zone ${z}</button>`).join('')}
      </div>
      <p class="hint">A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers · B : Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg · C : Créteil, Montpellier, Paris, Toulouse, Versailles.</p>
    </div>

    ${custodyBlock}

    <div class="settings-block">
      <h3>🤝 Validation entre parents</h3>
      <p class="muted">Quand un parent modifie la garde ou crée un événement pour un enfant, l'autre parent reçoit une demande et peut accepter ou refuser (avec un commentaire).</p>
      <label class="field"><span>Nom de ce téléphone <b class="req">(obligatoire)</b></span>
        <input id="deviceName" maxlength="20" value="${U.esc(myDevice().name)}" placeholder="Ex. Papa">
      </label>
      <p class="hint">Ce nom identifie ce téléphone dans les demandes (Papa / Maman). Il est <b>obligatoire</b> pour activer la validation, et doit être différent sur l'autre téléphone.</p>
      <label class="switch"><input type="checkbox" id="approvalOn" ${approvalOn() ? 'checked' : ''} ${myDevice().name ? '' : 'disabled'}><span>Activer les demandes de validation</span></label>
    </div>

    ${syncBlock}

    <div class="settings-block">
      <h3>💾 Données</h3>
      <div class="row gap">
        <button class="btn ghost grow" data-action="export-json">Sauvegarder</button>
        <button class="btn ghost grow" data-action="import-json">Restaurer</button>
      </div>
      <button class="btn ghost wide" data-action="dedupe">🧹 Nettoyer les doublons de personnes</button>
      <p class="hint">Une sauvegarde est un fichier que vous pouvez conserver ou envoyer sur l'autre téléphone. Le nettoyage fusionne les personnes portant le même nom et réaffecte leurs événements.</p>
    </div>

    <div class="settings-block">
      <h3>🔔 Notifications</h3>
      <p class="muted">${
        ns === 'native' ? 'Gérées par Android — les rappels se déclenchent même application fermée.'
        : ns === 'granted' ? 'Activées sur ce téléphone.'
        : ns === 'denied' ? 'Bloquées. Autorisez-les dans les réglages Chrome du site.'
        : ns === 'unsupported' ? 'Non prises en charge par ce navigateur.'
        : 'Pas encore activées.'
      }</p>
      <div class="row gap">
        ${ns !== 'granted' && ns !== 'native' && ns !== 'unsupported' ? `<button class="btn primary grow" data-action="enable-notif">Activer</button>` : ''}
        ${ns === 'granted' || ns === 'native' ? `<button class="btn ghost grow" data-action="test-notif">Tester</button>` : ''}
        <button class="btn ghost grow" data-action="export-ics">Calendrier (.ics)</button>
      </div>
      ${isNative ? '<button class="btn ghost wide" data-action="native-diag">🔎 Diagnostic des notifications</button>' : ''}
    </div>

    ${pushBlock}

    ${accountsBlock}

    <div class="settings-block">
      <h3>📲 Installation</h3>
      ${installBlock}
    </div>

    <p class="about">Kifékoi · v${APP_VERSION}<br>Données stockées sur vos téléphones${Sync.configured ? ' et synchronisées via votre espace Supabase' : ''}.</p>

  </div>`;
}

function bindSettings() {
  const authForm = $('#authForm');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(authForm);
      handleAuth('signin', String(fd.get('email')), String(fd.get('password')));
    });

    const up = authForm.querySelector('[data-action="sign-up"]');
    up.addEventListener('click', () => {
      const fd = new FormData(authForm);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!email || password.length < 6) { toast('E-mail et mot de passe (6 caractères) requis'); return; }
      handleAuth('signup', email, password);
    });
  }

  const childSel = $('#custodyChild');
  if (childSel) {
    childSel.addEventListener('change', () => {
      ui.custodyChildId = childSel.value;
      render(true);
    });
  }

  const currentChild = () => ui.custodyChildId || (childSel ? childSel.value : null);

  const enabled = $('#custodyEnabled');
  if (enabled) {
    enabled.addEventListener('change', () => {
      const id = currentChild();
      if (!id) return;

      const patch = { enabled: enabled.checked };
      if (enabled.checked) {
        const cur = S.custodyRawFor(id) || {};
        const parents = S.profiles().filter((p) => p.role === 'parent');
        const papa = parents.find((p) => /^papa$/i.test(p.name)) || parents[0];
        const maman = parents.find((p) => /^maman$/i.test(p.name)) || parents.find((p) => p.id !== (papa && papa.id));
        patch.evenId = cur.evenId || (papa && papa.id);
        patch.oddId = cur.oddId || (maman && maman.id);
        patch.mode = cur.mode || 'cycle';
        patch.aDays = cur.aDays || 7;
        patch.bDays = cur.bDays || 7;
        patch.anchor = cur.anchor || U.toDateISO(new Date());
      }
      S.saveCustody(id, patch);
      ui.custodyChildId = id;
      render(true);
    });
  }

  $$('[data-custody-even]').forEach((btn) => btn.addEventListener('click', () => {
    const id = currentChild();
    if (!id) return;
    S.saveCustody(id, { evenId: btn.dataset.custodyEven });
    ui.custodyChildId = id;
    render(true);
  }));

  $$('[data-custody-odd]').forEach((btn) => btn.addEventListener('click', () => {
    const id = currentChild();
    if (!id) return;
    S.saveCustody(id, { oddId: btn.dataset.custodyOdd });
    ui.custodyChildId = id;
    render(true);
  }));

  $$('[data-custody-preset]').forEach((btn) => btn.addEventListener('click', () => {
    const id = currentChild();
    if (!id) return;
    const [a, b] = String(btn.dataset.custodyPreset).split('-').map(Number);
    const cur = S.custodyRawFor(id) || {};
    const patch = { mode: 'cycle', aDays: a || 7, bDays: b || 7 };
    if (!cur.anchor) patch.anchor = U.toDateISO(new Date());
    S.saveCustody(id, patch);
    ui.custodyChildId = id;
    render(true);
  }));

  const aInput = $('#custodyA');
  if (aInput) aInput.addEventListener('change', () => {
    const id = currentChild();
    if (!id) return;
    const v = Math.max(1, Math.min(60, Math.round(Number(aInput.value) || 7)));
    S.saveCustody(id, { mode: 'cycle', aDays: v });
    render(true);
  });

  const bInput = $('#custodyB');
  if (bInput) bInput.addEventListener('change', () => {
    const id = currentChild();
    if (!id) return;
    const v = Math.max(1, Math.min(60, Math.round(Number(bInput.value) || 7)));
    S.saveCustody(id, { mode: 'cycle', bDays: v });
    render(true);
  });

  const anchorInput = $('#custodyAnchor');
  if (anchorInput) anchorInput.addEventListener('change', () => {
    const id = currentChild();
    if (!id || !anchorInput.value) return;
    S.saveCustody(id, { mode: 'cycle', anchor: anchorInput.value });
    render(true);
  });

  const anchorPartInput = $('#custodyAnchorPart');
  if (anchorPartInput) anchorPartInput.addEventListener('change', () => {
    const id = currentChild();
    if (!id) return;
    S.saveCustody(id, { anchorPart: anchorPartInput.value });
    render(true);
  });

  const weekAnchorInput = $('#custodyWeekAnchor');
  if (weekAnchorInput) weekAnchorInput.addEventListener('change', () => {
    const id = currentChild();
    if (!id || !weekAnchorInput.value) return;
    S.saveCustody(id, { mode: 'weeks', anchor: mondayOfISO(weekAnchorInput.value) });
    render(true);
  });

  const approvalBox = $('#approvalOn');
  if (approvalBox) {
    approvalBox.addEventListener('change', () => {
      if (approvalBox.checked && !myDevice().name) {
        approvalBox.checked = false;
        toast('Indiquez d\u2019abord le nom de ce téléphone');
        return;
      }
      setApproval(approvalBox.checked);
      toast(approvalBox.checked ? 'Demandes de validation activées' : 'Demandes de validation désactivées');
      render(true);
    });
  }

  const devName = $('#deviceName');
  if (devName) {
    devName.addEventListener('change', () => {
      setDeviceName(devName.value);
      toast(devName.value.trim() ? `Ce téléphone : ${devName.value.trim()}` : 'Nom effacé');
      render(true);
    });
  }

  const seenBtn = $('[data-action="signups-seen"]');
  if (seenBtn) {
    seenBtn.addEventListener('click', () => {
      localStorage.setItem(K_SIGNUPS_SEEN, new Date().toISOString());
      render(true);
    });
  }

  // Actualise la liste des comptes à l'ouverture des réglages.
  if (Sync.isSignedIn()) {
    const before = JSON.stringify(Sync.creator.accounts);
    Sync.refreshCreator()
      .then(() => {
        if (ui.view === 'settings' && JSON.stringify(Sync.creator.accounts) !== before) render(true);
      })
      .catch(() => {});
  }
}

async function handleAuth(mode, email, password) {
  if (!email || !password) { toast('E-mail et mot de passe requis'); return; }
  try {
    toast(mode === 'signup' ? 'Création du compte…' : 'Connexion…', 4000);
    if (mode === 'signup') {
      const res = await Sync.signUp(email, password);
      toast(res.confirmed ? 'Compte créé et synchronisé ✓' : 'Compte créé. Validez l\u2019e-mail reçu, puis connectez-vous.', 6000);
      if (res.confirmed) {
        Push.notify({ type: 'signup', title: 'Nouveau compte Kifékoi', body: email, tag: 'signup' });
      }
    } else {
      await Sync.signIn(email, password);
      toast('Connecté ✓ Les données sont partagées.');
    }
    if (isNative) Push.syncNativeToken().catch(() => {});
    render(true);
  } catch (err) {
    toast(String(err.message || err), 6000);
  }
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const NOTIF_KEY = 'af.notified.v1';

function describeChanges(changes) {
  const evs = changes.filter((c) => c.kind === 'event' && !c.deleted);
  const notes = changes.filter((c) => c.kind === 'note' && !c.deleted);
  const profs = changes.filter((c) => c.kind === 'profile' && !c.deleted);
  const removed = changes.filter((c) => c.deleted);

  const parts = [];
  if (evs.length === 1) parts.push(`événement « ${String(evs[0].payload.title || 'sans titre').slice(0, 40)} »`);
  else if (evs.length > 1) parts.push(`${evs.length} événements`);
  if (notes.length === 1) parts.push('1 note');
  else if (notes.length > 1) parts.push(`${notes.length} notes`);
  if (profs.length === 1) parts.push(`fiche de ${profs[0].payload.name || 'une personne'}`);
  else if (profs.length > 1) parts.push(`${profs.length} personnes`);
  if (removed.length) parts.push(`${removed.length} suppression${removed.length > 1 ? 's' : ''}`);

  if (!parts.length) return '';
  return `Autre téléphone : ${parts.join(' · ')}`.slice(0, 140);
}

function notifyRemoteChange(changes) {
  const msg = describeChanges(changes);
  if (!msg) return;

  if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
    showNotification('Kifékoi', msg, 'remote-sync');
  } else {
    toast('🔔 ' + msg, 5000);
  }
}

function loadNotified() {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY)) || {}; } catch { return {}; }
}

function saveNotified(obj) {
  const now = Date.now();
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) if (now - v < 40 * 86400000) cleaned[k] = v;
  localStorage.setItem(NOTIF_KEY, JSON.stringify(cleaned));
}

async function showNotification(title, body, tag) {
  if (isNative) return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      vibrate: [80, 40, 80],
      data: { tag },
    });
    return true;
  } catch (err) {
    console.warn('Notification impossible', err);
    return false;
  }
}

let nativeReminderTimer = null;

async function scheduleNativeReminders() {
  if (!isNative) return;
  try {
    await Native.init();
    const granted = await Native.ensurePermission();
    if (!granted) return;

    const now = Date.now();
    const list = S.reminderOccurrences(90)
      .filter((r) => r.at > now + 30000)
      .slice(0, 100)
      .map((r) => {
        const p = r.item.payload;
        const prof = S.profile(p.profileId);
        const start = S.occurrenceStart(r.item);
        return {
          id: Native.idFor(r.key),
          title: `${CATS[p.category]?.icon || '📌'} ${p.title}`,
          body: `${prof ? prof.name + ' · ' : ''}${U.minutesLabel(r.offset)} — ${U.fmtDateY(r.item.date)}${p.allDay ? '' : ' à ' + U.fmtTime(start)}`,
          schedule: { at: new Date(r.at) },
        };
      });

    await Native.schedule(list);
  } catch (err) {
    console.warn('Rappels natifs', err);
  }
}

async function enableNotifications() {
  if (isNative) {
    const ok = await Native.ensurePermission();
    if (ok) {
      toast('Notifications Android activées ✓');
      await scheduleNativeReminders();
      if (ui.view === 'reminders' || ui.view === 'settings') render(true);
    } else {
      toast('Notifications refusées. Autorisez-les dans les réglages Android de Kifekoi.', 5000);
    }
    return;
  }
  if (!('Notification' in window)) { toast('Notifications non prises en charge'); return; }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    toast('Notifications activées ✓');
    await showNotification('Kifékoi', 'Les rappels sont maintenant activés sur ce téléphone.', 'welcome');
    if (ui.view === 'reminders' || ui.view === 'settings') render(true);
  } else if (perm === 'denied') {
    toast('Notifications refusées. Autorisez-les dans Chrome (Infos du site).', 5000);
  } else {
    toast('Notifications non activées.');
  }
}

async function checkReminders() {
  const notified = loadNotified();
  const now = Date.now();
  const due = [];

  for (const r of S.reminderOccurrences()) {
    if (r.at > now) continue;
    if (now - r.at > 12 * 3600 * 1000) continue;
    if (notified[r.key]) continue;
    due.push(r);
  }
  if (!due.length) return;

  const granted = 'Notification' in window && Notification.permission === 'granted';
  for (const r of due) {
    const p = r.item.payload;
    const prof = S.profile(p.profileId);
    const start = S.occurrenceStart(r.item);
    const title = `${CATS[p.category]?.icon || '📌'} ${p.title}`;
    const body = `${prof ? prof.name + ' · ' : ''}${U.minutesLabel(r.offset)} — ${U.fmtDateY(start)}${p.allDay ? '' : ' à ' + U.fmtTime(start)}`;
    if (granted) await showNotification(title, body, r.key);
    else toast(`🔔 ${title} — ${body}`, 6000);
    notified[r.key] = now;
  }
  saveNotified(notified);
}

/* ------------------------------------------------------------------ */
/* Import / export                                                     */
/* ------------------------------------------------------------------ */

function exportJSON() {
  const blob = new Blob([JSON.stringify(S.exportPayload(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kifekoi-sauvegarde-${U.toDateISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Sauvegarde créée ✓');
}

async function importJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const n = S.importRecords(data);
    const res = S.dedupeProfiles();
    let msg = `${n} élément(s) restauré(s)`;
    if (res.merged) msg += ` · ${res.merged} doublon(s) fusionné(s)`;
    toast(msg + ' ✓', 4500);
    render(true);
    closeSheet();
  } catch (err) {
    toast('Fichier invalide : ' + (err.message || err), 5000);
  }
}

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

/* Rappel des demandes restées sans réponse plus de 24 h (une fois par demande). */
function checkPendingReminders() {
  const me = myDevice().id;
  const now = Date.now();

  for (const rec of S.pendingRequests()) {
    const p = rec.payload;
    const age = now - (p.createdAt || 0);
    if (age < 24 * 3600 * 1000) continue;

    const key = 'af.reminded.' + rec.id;
    try {
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, '1');
    } catch { /* ignore */ }

    const mine = p.authorId === me;
    const title = mine ? 'Demande toujours sans réponse' : 'Demande en attente de votre réponse';
    const body = String(p.summary || 'Demande').slice(0, 120);

    if (isNative && Native && typeof Native.notify === 'function') {
      try { Native.notify(title, body, 1500).catch(() => {}); } catch { /* ignore */ }
    } else {
      toast(`${title} — ${body}`, 6000);
    }
  }
}

function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (isReadOnly() && WRITE_ACTIONS.has(action)) {
    toast('Mode lecture seule : modification impossible', 2500);
    return;
  }
  const id = el.dataset.id;
  const date = el.dataset.date;

  switch (action) {
    case 'nav':
      ui.view = el.dataset.view;
      render();
      break;
    case 'open-event':
      if (isReadOnly()) { eventViewSheet(id); break; }
      eventSheet(id, { date });
      break;
    case 'toggle-done': {
      const rec = S.get(id);
      if (!rec) return;
      const wasDone = rec.payload.repeat
        ? (rec.payload.doneDates || []).includes(date)
        : !!rec.payload.done;
      S.toggleOccurrence(id, date);
      if (wasDone) { toast('Occurrence rouverte'); break; }
      const fresh = S.get(id);
      const next = fresh && fresh.payload.repeat ? S.nextOccurrence(fresh) : null;
      toast(next ? `Fait ✓ — prochaine le ${U.fmtDateY(next.date)}` : 'Fait ✓');
      break;
    }
    case 'add-event':
      eventSheet(null, { date: el.dataset.date, profileId: el.dataset.profile });
      break;
    case 'add-note':
      noteSheet(null, { profileId: el.dataset.profile });
      break;
    case 'open-note':
      if (isReadOnly()) { noteViewSheet(id); break; }
      noteSheet(id);
      break;
    case 'add-contact':
      contactSheet(id, null);
      break;
    case 'edit-contact':
      contactSheet(id, el.dataset.contact);
      break;
    case 'add-person':
      profileSheet(null);
      break;
    case 'edit-profile':
      profileSheet(id);
      break;
    case 'open-profile':
      ui.detailProfile = id;
      ui.view = 'profile';
      render();
      break;
    case 'delete-profile': {
      const p = S.profile(id);
      if (!p) return;
      if (!confirm(`Supprimer « ${p.name} » ainsi que ses événements et notes ?`)) break;
      for (const ev of S.events()) if (ev.payload.profileId === id) S.remove(ev.id);
      for (const n of S.notes()) if (n.payload.profileId === id) S.remove(n.id);
      S.remove(id);
      ui.view = 'people';
      toast('Personne supprimée');
      break;
    }
    case 'pick-day':
      ui.selected = date;
      ui.month = new Date(U.parseLocal(date).getFullYear(), U.parseLocal(date).getMonth(), 1);
      render();
      break;
    case 'go-today': {
      const today = new Date();
      ui.selected = U.toDateISO(today);
      ui.month = new Date(today.getFullYear(), today.getMonth(), 1);
      render();
      break;
    }
    case 'month-prev':
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1);
      render();
      break;
    case 'month-next':
      ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1);
      render();
      break;
    case 'filter':
      ui.filter = id;
      render();
      break;
    case 'custody-toggle':
      ui.custodyOpen = !ui.custodyOpen;
      render();
      break;
    case 'custody-part': {
      const childId = el.dataset.child;
      const part = el.dataset.part;
      const target = el.dataset.id || null;
      const cfg = S.custodyConfigs().find((c) => c.recId === childId);
      const before = cfg ? S.custodyDayFor(cfg, ui.selected) : null;

      S.setCustodyPartFor(childId, ui.selected, part, target);

      if (cfg && before && target) {
        const fresh = S.custodyConfigs().find((c) => c.recId === childId);
        const after = fresh ? S.custodyDayFor(fresh, ui.selected) : null;
        const bp = before[part] ? S.profile(before[part]) : null;
        const ap = after && after[part] ? S.profile(after[part]) : null;
        askOtherParent(
          `Garde de ${cfg.name} le ${U.fmtDate(ui.selected)} : ${PART_LABEL[part]} chez ${ap ? ap.name : '—'} (avant : ${bp ? bp.name : '—'})`,
          { type: 'custody', childId, date: ui.selected, part, before: before[part] || null },
        );
      }

      ui.custodyOpen = true;
      render();
      break;
    }
    case 'requests-open':
      requestsSheet();
      break;
    case 'request-accept':
    case 'request-refuse': {
      const req = S.get(id);
      if (!req) break;
      const status = action === 'request-accept' ? 'accepted' : 'refused';
      const field = document.getElementById('c-' + id);
      const comment = field ? field.value : '';
      S.resolveRequest(id, status, comment, myDevice().name);
      if (status === 'refused') revertRequest(req);
      Push.notify({
        type: 'response',
        title: status === 'accepted' ? 'Demande acceptée' : 'Demande refusée',
        body: `${myDevice().name} : ${(req.payload && req.payload.summary) || ''}`,
        tag: 'response',
      });
      toast(status === 'accepted' ? 'Demande acceptée ✓' : 'Demande refusée — modification annulée');
      requestsSheet();
      render(true);
      break;
    }
    case 'custody-mode': {
      const sel = $('#custodyChild');
      const cid = ui.custodyChildId || (sel ? sel.value : null);
      if (!cid) break;
      const cur = S.custodyRawFor(cid) || {};
      if (!cur.evenId || !cur.oddId) break;
      if (el.dataset.id === 'weeks') {
        S.saveCustody(cid, {
          mode: 'weeks',
          weekA: Array.isArray(cur.weekA) && cur.weekA.length === 7 ? cur.weekA : Array(7).fill(cur.evenId),
          weekB: Array.isArray(cur.weekB) && cur.weekB.length === 7 ? cur.weekB : Array(7).fill(cur.oddId),
          anchor: mondayOfISO(cur.anchor || U.toDateISO(new Date())),
        });
      } else {
        S.saveCustody(cid, {
          mode: 'cycle',
          aDays: cur.aDays || 7,
          bDays: cur.bDays || 7,
          anchor: cur.anchor || U.toDateISO(new Date()),
          anchorPart: cur.anchorPart || 'am',
        });
      }
      ui.custodyChildId = cid;
      render(true);
      break;
    }
    case 'custody-week': {
      const selW = $('#custodyChild');
      const cidW = ui.custodyChildId || (selW ? selW.value : null);
      if (!cidW) break;
      const curW = S.custodyRawFor(cidW) || {};
      if (!curW.evenId || !curW.oddId) break;
      const key = el.dataset.id === 'A' ? 'weekA' : 'weekB';
      const idx = Math.max(0, Math.min(6, Number(el.dataset.day) || 0));
      const arr = Array.isArray(curW[key]) && curW[key].length === 7
        ? [...curW[key]]
        : Array(7).fill(key === 'weekA' ? curW.evenId : curW.oddId);
      arr[idx] = arr[idx] === curW.evenId ? curW.oddId : curW.evenId;
      S.saveCustody(cidW, { mode: 'weeks', [key]: arr });
      ui.custodyChildId = cidW;
      render(true);
      break;
    }
    case 'custody-week-part': {
      const selP = $('#custodyChild');
      const cidP = ui.custodyChildId || (selP ? selP.value : null);
      if (!cidP) break;
      const curP = S.custodyRawFor(cidP) || {};
      if (!curP.evenId || !curP.oddId) break;
      const keyP = el.dataset.id === 'A' ? 'weekA' : 'weekB';
      const idxP = Math.max(0, Math.min(6, Number(el.dataset.day) || 0));
      const partP = el.dataset.part;
      if (!['am', 'pm', 'sleep'].includes(partP)) break;

      const arrP = Array.isArray(curP[keyP]) && curP[keyP].length === 7 ? [...curP[keyP]] : Array(7).fill(null);
      const entry = arrP[idxP];
      const obj = typeof entry === 'string'
        ? { am: entry, pm: entry, sleep: entry }
        : (entry && typeof entry === 'object' ? { ...entry } : { am: curP.evenId, pm: curP.evenId, sleep: curP.evenId });

      const owner = obj[partP] || curP.evenId;
      obj[partP] = owner === curP.evenId ? curP.oddId : curP.evenId;
      arrP[idxP] = obj;

      S.saveCustody(cidP, { mode: 'weeks', [keyP]: arrP });
      ui.custodyChildId = cidP;
      render(true);
      break;
    }
    case 'custody-apply-all': {
      const sel = $('#custodyChild');
      const id = ui.custodyChildId || (sel ? sel.value : null);
      const raw = id ? S.custodyRawFor(id) : null;
      if (!raw || !raw.evenId || !raw.oddId) break;
      for (const p of S.profiles().filter((x) => x.role === 'child')) {
        S.saveCustody(p.id, {
          enabled: true,
          evenId: raw.evenId,
          oddId: raw.oddId,
          mode: raw.mode,
          aDays: raw.aDays,
          bDays: raw.bDays,
          anchor: raw.anchor,
          anchorPart: raw.anchorPart,
          weekA: raw.weekA,
          weekB: raw.weekB,
        });
      }
      toast('Règles appliquées à tous les enfants');
      render(true);
      break;
    }
    case 'enable-notif':
      enableNotifications();
      break;
    case 'test-notif':
      if (isNative) {
        Native.ensurePermission().then((ok) => {
          if (!ok) { toast('Notifications refusées par Android'); return; }
          Native.test();
          toast('Notification de test dans 4 secondes');
        });
        break;
      }
      showNotification('Kifékoi', 'Ceci est une notification de test 🎉', 'test').then((ok) =>
        toast(ok ? 'Notification envoyée ✓' : 'Échec de l\u2019envoi'));
      break;
    case 'push-on': {
      Push.enable()
        .then(() => { toast('Notifications push activées ✓', 4000); render(true); })
        .catch((err) => toast(String(err.message || err), 5000));
      break;
    }
    case 'push-off': {
      Push.disable()
        .then(() => { toast('Notifications push désactivées'); render(true); })
        .catch((err) => toast(String(err.message || err), 5000));
      break;
    }
    case 'push-test': {
      Push.notify({
        type: 'test',
        title: 'Kifékoi — test',
        body: 'Si vous voyez ce message, le push fonctionne même app fermée.',
        tag: 'test',
      }).then((ok) => toast(ok ? 'Test envoyé aux autres téléphones' : 'Envoi impossible', 4500));
      break;
    }
    case 'force-update': {
      toast('Mise à jour…', 2000);
      (async () => {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        } catch { /* ignore */ }
        location.reload();
      })();
      break;
    }
    case 'help':
      helpSheet();
      break;
    case 'lock-readonly':
      lockReadOnlySheet();
      break;
    case 'unlock-readonly':
      unlockReadOnlySheet();
      break;
    case 'do-lock-readonly': {
      const pinEl = $('#roPin');
      const pin = String(pinEl ? pinEl.value : '').trim();
      if (!/^\d{4}$/.test(pin)) {
        toast('Choisissez un code à 4 chiffres');
        break;
      }
      storePin(pin);
      setReadOnly(true);
      closeSheet();
      toast('Appareil verrouillé en lecture seule', 3000);
      render(true);
      break;
    }
    case 'do-unlock-readonly': {
      const pinEl = $('#roPinUnlock');
      const pin = String(pinEl ? pinEl.value : '').trim();
      if (pinMatches(pin)) {
        setReadOnly(false);
        closeSheet();
        toast('Appareil déverrouillé ✓', 2500);
        render(true);
      } else {
        toast('Code incorrect');
      }
      break;
    }
    case 'bilan-period':
      ui.bilanPeriod = el.dataset.id || 'rentree';
      ui.bilanOffset = 0;
      render(true);
      break;
    case 'cal-view':
      ui.calView = el.dataset.id === 'week' ? 'week' : 'month';
      render(true);
      break;
    case 'week-prev':
    case 'week-next': {
      const step = action === 'week-next' ? 7 : -7;
      const d = U.addDays(U.parseLocal(ui.selected), step);
      ui.selected = U.toDateISO(d);
      ui.month = new Date(d.getFullYear(), d.getMonth(), 1);
      render(true);
      break;
    }    case 'bilan-prev':
      ui.bilanOffset -= 1;
      render(true);
      break;
    case 'bilan-next':
      ui.bilanOffset += 1;
      render(true);
      break;
    case 'set-zone':
      setSchoolZone(el.dataset.id);
      toast(`Zone ${el.dataset.id} sélectionnée`);
      render(true);
      break;
    case 'add-expense':
      expenseSheet();
      break;
    case 'edit-expense':
      expenseSheet(id);
      break;
    case 'save-expense': {
      const label = ($('#expLabel').value || '').trim();
      const amountRaw = String($('#expAmount').value || '').replace(',', '.');
      const amount = Math.round((parseFloat(amountRaw) || 0) * 100);
      const date = $('#expDate').value || U.toDateISO();
      const paidBy = $('#expPaidBy').value;
      const category = $('#expCat').value;
      const splitSel = $('#expSplit').value;
      const note = ($('#expNote').value || '').trim();

      if (!label) { toast('Indiquez un libellé'); break; }
      if (amount <= 0) { toast('Montant invalide'); break; }

      const parents = S.profiles().filter((x) => x.role === 'parent');
      let split = 'half';
      if (splitSel === 'custom' && parents.length >= 2) {
        const a = Math.max(0, Math.min(100, Math.round(Number($('#expPctA').value) || 0)));
        split = { [parents[0].id]: a, [parents[1].id]: 100 - a };
      } else if (splitSel !== 'half' && parents.length >= 2) {
        const first = Number(splitSel);
        split = { [parents[0].id]: first, [parents[1].id]: 100 - first };
      }

      const payload = { label, amount, date, paidBy, category, split, note };
      const existing = id ? S.get(id) : null;
      const repeatInput = $('#expRepeat');
      const months = repeatInput ? Math.max(1, Math.min(24, Number(repeatInput.value) || 1)) : 1;

      if (existing && existing.kind === 'note' && existing.payload && existing.payload.expense) {
        S.update(id, { expense: true, ...payload });
      } else {
        for (let i = 0; i < months; i += 1) {
          S.addExpense({ ...payload, date: addMonthsISO(date, i) });
        }
      }

      closeSheet();
      toast(months > 1
        ? `Dépense enregistrée · ${months} échéances (jusqu'au ${U.fmtDateY(U.parseLocal(addMonthsISO(date, months - 1)))})`
        : 'Dépense enregistrée', 4000);
      render(true);
      break;
    }
    case 'delete-expense':
      S.removeExpense(id);
      closeSheet();
      toast('Dépense supprimée');
      render(true);
      break;
    case 'settle-expense': {
      const parents = S.profiles().filter((x) => x.role === 'parent');
      if (parents.length < 2) break;
      const range = bilanRange();
      const list = S.expenses().filter((e) => e.date >= range.from && e.date <= range.to);
      const bal = expenseBalance(list, parents);
      const [a, b] = parents;
      const va = bal[a.id] || 0;
      const vb = bal[b.id] || 0;
      if (Math.abs(va - vb) < 1) break;
      const debtor = va < vb ? a : b;
      const creditor = va < vb ? b : a;
      const amount = Math.round(Math.abs(va - vb) / 2);
      S.addExpense({
        settle: true,
        date: U.toDateISO(),
        amount,
        from: debtor.id,
        to: creditor.id,
        label: 'Remboursement',
        category: 'autres',
        note: '',
        paidBy: debtor.id,
        split: 'half',
      });
      toast(`Remboursement de ${euro(amount)} enregistré`);
      render(true);
      break;
    }
    case 'search':
      searchSheet();
      break;
    case 'native-diag':
      nativeDiagSheet();
      break;
    case 'native-retry':
      Push.retryNative().then((ok) => {
        toast(ok ? 'Nouvel essai lancé…' : 'Échec de l’enregistrement', 3500);
        setTimeout(() => nativeDiagSheet(), 2500);
      });
      break;
    case 'tuto-replay':
      if ($('#sheet')) closeSheet();
      setTimeout(() => openTutorial(0), 260);
      break;
    case 'export-ics':
      try { downloadICS(); toast('Fichier .ics téléchargé ✓ Ouvrez-le pour importer.', 5000); }
      catch (err) { toast(String(err.message || err)); }
      break;
    case 'export-json':
      exportJSON();
      break;
    case 'import-json':
      $('#importFile').click();
      break;
    case 'dedupe': {
      const res = S.dedupeProfiles();
      toast(res.merged
        ? `${res.merged} doublon${res.merged > 1 ? 's' : ''} fusionné${res.merged > 1 ? 's' : ''}${res.moved ? ` · ${res.moved} élément(s) réaffecté(s)` : ''}`
        : 'Aucun doublon détecté', 4500);
      render(true);
      break;
    }
    case 'sync-now':
      Sync.syncNow('manual').then((n) => {
        toast(Sync.status.mode === 'error' ? Sync.status.message : `Synchronisé ✓${n ? ' (' + n + ')' : ''}`, 4000);
        render(true);
      });
      break;
    case 'sign-out':
      if (!confirm('Se déconnecter de la synchronisation ? Les données restent sur ce téléphone.')) break;
      Sync.signOut();
      toast('Déconnecté');
      render(true);
      break;
    case 'install':
      if (ui.installPrompt) {
        ui.installPrompt.prompt();
        ui.installPrompt.userChoice.then(() => { ui.installPrompt = null; });
      }
      break;
    case 'google-calendar': {
      const rec = S.get(id);
      if (rec) window.open(googleUrl(rec), '_blank');
      break;
    }
    case 'close-sheet':
    case 'close':
      closeSheet();
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */

function boot() {
  S.load();

  $('#view').dataset.view = '';
  render();

  S.subscribe(() => {
    render();
    if (isNative) {
      clearTimeout(nativeReminderTimer);
      nativeReminderTimer = setTimeout(scheduleNativeReminders, 3000);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeSheet(); return; }
    if (e.target.id === 'backdrop') { closeSheet(); return; }
    onAction(e);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheet();
  });

  $('#importFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) importJSON(file);
    e.target.value = '';
  });

  window.addEventListener('af-remote-change', (e) => {
    const changes = (e.detail && e.detail.changes) || [];
    const me = myDevice().id;

    const newRequests = changes.filter(
      (c) => c.kind === 'note' && c.payload && c.payload.request
        && c.payload.status === 'pending' && c.payload.authorId !== me,
    );

    if (newRequests.length) {
      const msg = `Demande de ${newRequests[0].payload.author || 'l\u2019autre parent'} : ${newRequests[0].payload.summary || ''}`.slice(0, 140);
      if (!isNative && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        showNotification('Kifékoi — demande', msg, 'request');
      } else {
        toast('🤝 ' + msg, 6000);
      }
      render(true);
      return;
    }

    notifyRemoteChange(changes);
  });

  window.addEventListener('af-sync', () => {
    updateSyncDot();
    const line = $('#syncState');
    if (line) {
      line.innerHTML = `<span class="dot ${Sync.status.mode === 'error' || Sync.status.mode === 'offline' ? 'err' : 'on'}"></span> ${U.esc(Sync.syncStatusLabel())}`;
    }
    const detail = $('#syncDetail');
    if (detail) detail.textContent = Sync.status.email || '';
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    ui.installPrompt = e;
  });

  Sync.startAutoSync();

  if (isNative) scheduleNativeReminders();

  Push.refresh().catch(() => {});
  if (isNative) Push.initNativePush().catch(() => {});

  if ('serviceWorker' in navigator && !isNative) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    // Mise à jour automatique : dès qu'une nouvelle version prend la main,
    // on recharge pour l'appliquer (sans le faire à la première installation).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      toast('Nouvelle version installée — rechargement…', 2500);
      setTimeout(() => location.reload(), 1200);
    });

    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch((err) => console.warn('SW', err));
  }

  checkReminders();
  setInterval(checkReminders, 60000);
  setTimeout(checkPendingReminders, 3000);
  setInterval(checkPendingReminders, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkReminders();
      render(true);
      if (isNative) scheduleNativeReminders();
    }
  });

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  const splash = document.getElementById('splash');
  if (splash) {
    // L'écran de démarrage reste visible au moins 2 secondes.
    const wait = Math.max(0, 2000 - performance.now());
    setTimeout(() => {
      splash.classList.add('hide');
      setTimeout(() => splash.remove(), 420);
    }, wait);
  }

  // Tutoriel de premier lancement : uniquement sur une installation neuve.
  if (!tutorialSeen() && S.profiles().length === 0) {
    setTimeout(() => openTutorial(0), 600);
  }
}

document.addEventListener('DOMContentLoaded', boot);
