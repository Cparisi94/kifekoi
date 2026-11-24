/* Kifékoi — interface utilisateur */

import * as S from './store.js';
import * as Sync from './sync.js';
import * as Push from './push.js';
import { TUTORIAL, HELP_SECTIONS } from './help.js';
import * as SCH from './school.js';
import { downloadICS, googleUrl } from './ics.js';
import * as U from './util.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* Pont natif (APK Android). En PWA, window.KIFEKOI_NATIVE est absent. */
const Native = (typeof window !== 'undefined' && window.KIFEKOI_NATIVE) || null;
const isNative = Boolean(Native && Native.isNative);

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
  return `<span class="avatar ${cls}" style="--c:${(p && p.color) || '#0492c2'}">${U.esc((p && p.emoji) || '🙂')}</span>`;
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
        <span class="custody-week">· semaine ${week} (${parity})</span>
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

  const hero = `
    <section class="hero">
      <span class="hero-brand">Kifékoi</span>
      <p class="hero-date">${isToday ? "Aujourd\u2019hui · " + U.fmtLong(now) : U.fmtLong(sel)}</p>
      <h2 class="hero-title">${count === 0
        ? (isToday ? 'Rien de prévu aujourd\u2019hui' : 'Aucun événement ce jour-là')
        : `${count} événement${count > 1 ? 's' : ''}${isToday ? ' aujourd\u2019hui' : ''}`}</h2>
      <p class="hero-sub">${nextSoon
        ? `Prochain : ${nextProf ? `<span class="pill pill-hero">${nextProf.emoji} ${U.esc(nextProf.name)}</span> ` : ''}${CATS[nextSoon.payload.category]?.icon || '📌'} ${U.esc(nextSoon.payload.title)}${nextSoon.payload.allDay ? '' : ' à ' + U.fmtTime(S.occurrenceStart(nextSoon))}`
        : (isToday ? 'Profitez-en ✨' : 'Journée libre')}</p>
    </section>`;

  const overdueBlock = overdueList.length
    ? `<section class="block">
         <div class="block-head"><h2>En retard</h2><span class="count">${overdueList.length}</span></div>
         ${overdueList.slice(0, 4).map((i) => eventCard(i, { showLate: true })).join('')}
       </section>`
    : '';

  const filters = `
    <div class="filter-row">
      <div class="chips scroll">
        <button class="chip ${ui.filter === 'all' ? 'on' : ''}" data-action="filter" data-id="all">Tout</button>
        ${S.profiles().map((p) => `<button class="chip chip-person ${ui.filter === p.id ? 'on' : ''}" data-action="filter" data-id="${p.id}" style="--c:${p.color}">
          <span class="chip-avatar">${p.emoji}</span>${U.esc(p.name)}
        </button>`).join('')}
      </div>
      <button class="add-btn" data-action="add-event" data-date="${ui.selected}" aria-label="Ajouter un événement">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 4.5v15M4.5 12h15" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
        </svg>
      </button>
    </div>`;

  const grid = `
    <div class="calendar card">
      <div class="cal-head">
        <button class="icon-btn" data-action="month-prev" aria-label="Mois précédent">‹</button>
        <div class="cal-title">
          <h2>${U.fmtMonth(ui.month)}</h2>
          ${(y !== now.getFullYear() || m !== now.getMonth())
            ? `<button class="link xs" data-action="go-today">Revenir à ce mois</button>`
            : ''}
        </div>
        <button class="icon-btn" data-action="month-next" aria-label="Mois suivant">›</button>
      </div>
      <div class="cal-grid cal-weekdays">
        ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<span>${d}</span>`).join('')}
      </div>
      <div class="cal-grid">
        ${weeks.flat().map((d) => {
          const iso = U.toDateISO(d);
          const list = byDate[iso] || [];
          const dots = list.slice(0, 3).map((i) => `<i style="--c:${(S.profile(i.payload.profileId) || {}).color || '#94a3b8'}"></i>`).join('');
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
          const holiday = SCH.schoolHoliday(iso);
          return `<button class="cal-day ${d.getMonth() !== m ? 'out' : ''} ${iso === todayISO ? 'today' : ''} ${holiday ? 'is-holiday' : ''} ${iso === ui.selected ? 'sel' : ''} ${list.length ? 'has-events' : ''}"
                    data-action="pick-day" data-date="${iso}">
            ${custodyList.length ? `<span class="custody-bars ${multiBars ? 'multi' : ''}">${bars}</span>` : ''}
            <span>${d.getDate()}</span>
            <span class="dots">${dots}</span>
          </button>`;
        }).join('')}
      </div>
      <p class="cal-legend"><i></i> Vacances scolaires · zone C</p>
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
      ${(() => { const h = SCH.schoolHoliday(ui.selected); return h ? `<div class="holiday-tag">🏖️ ${U.esc(h.label)} · zone C</div>` : ''; })()}
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
                 <span class="muted">${U.relLabel(i.date)}${i.payload.allDay ? '' : ' · ' + i.payload.time}${i.payload.repeat ? ' · 🔁' : ''}</span>
               </span>
             </span>
             <span class="row-dot" style="--c:${(prof || {}).color || '#94a3b8'}"></span>
           </button>`;
         }).join('')}
       </section>`
    : '';

  return `<div class="stack">
    ${hero}
    ${S.profiles().length === 0 ? `<section class="card empty">
      <span class="empty-emoji">👋</span>
      <p>Bienvenue dans Kifékoi !<br>Commencez par ajouter les personnes de votre famille.</p>
      <button class="btn primary" data-action="add-person">+ Ajouter une personne</button>
    </section>` : ''}
    ${approvalBanner()}
    ${overdueBlock}
    ${filters}
    ${grid}
    ${dayBlock}
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

  return `<div class="stack">
    <div class="people-grid">
      ${profs.map((p) => {
        const st = S.statsFor(p.id);
        return `<button class="person-card card" data-action="open-profile" data-id="${p.id}" style="--c:${p.color}">
          ${avatarHTML(p)}
          <span class="person-name">${U.esc(p.name)}</span>
          <span class="person-sub">${st.next
            ? `📅 ${U.esc(st.next.payload.title)} · ${U.relLabel(st.next.date)}`
            : 'Aucun rendez-vous à venir'}</span>
          <span class="person-meta">
            <span>${st.total} à venir</span>
            <span>${st.notes} info${st.notes > 1 ? 's' : ''}</span>
          </span>
        </button>`;
      }).join('')}
    </div>
    <button class="btn ghost wide" data-action="add-person">+ Ajouter une personne</button>
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
    <span class="rem-sub">${prof ? U.esc(prof.name) + ' · ' : ''}${U.minutesLabel(r.offset)} — RDV ${U.fmtDateY(start)}${p.allDay ? '' : ' ' + U.fmtTime(start)}</span>
  </button>`;
}

/* ------------------------------------------------------------------ */
/* Rendu global                                                        */
/* ------------------------------------------------------------------ */

function render(force = false) {
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

  const active = ui.view === 'profile' ? 'people' : ui.view;
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === active));

  if (ui.view === 'settings') bindSettings();

  if (changedView && !force) window.scrollTo(0, 0);
  else window.scrollTo(0, scroll);

  updateSyncDot();
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
  };

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

  $('#personChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-person]');
    if (!btn) return;
    sheetDraft.profileId = btn.dataset.person;
    $$('#personChips .chip').forEach((c) => c.classList.toggle('on', c === btn));
  });

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
    $('#avatarPreview').innerHTML = avatarHTML({ emoji, color: colorInput.value }, 'xl');
  };

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

function settingsHTML() {
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
        : `<p class="hint">Pour installer : menu Chrome ⋮ → « Ajouter à l'écran d'accueil ».</p>`);

  const childCandidates = S.profiles().filter((p) => p.role === 'child');
  const parentCandidates = S.profiles().filter((p) => p.role === 'parent');
  const selectedId = (ui.custodyChildId && childCandidates.some((p) => p.id === ui.custodyChildId))
    ? ui.custodyChildId
    : (childCandidates[0] ? childCandidates[0].id : null);
  const selected = selectedId ? S.profile(selectedId) : null;
  const raw = selectedId ? S.custodyRawFor(selectedId) : null;
  const weekNow = U.isoWeekNumber(new Date());
  const parityNow = weekNow % 2 === 0 ? 'paire' : 'impaire';
  const weekOwner = raw && raw.evenId && raw.oddId ? S.profile(weekNow % 2 === 0 ? raw.evenId : raw.oddId) : null;
  const enabledChildren = childCandidates.filter((p) => p.custody && p.custody.enabled).length;
  const custodyBlock = `
    <div class="settings-block">
      <h3>🗓️ Garde alternée</h3>
      <p class="muted"><b>Facultatif</b> — pour les parents séparés. Une barre colorée indique qui garde chaque enfant au-dessus de chaque jour. Les semaines paires / impaires suivent les numéros de semaine (lundi à dimanche). Chaque enfant a ses propres réglages.</p>
      ${childCandidates.length === 0
        ? '<p class="hint">Ajoutez d\u2019abord un enfant dans l\u2019onglet Personnes (champ « Type »).</p>'
        : `<label class="field"><span>Enfant à configurer${enabledChildren ? ` (${enabledChildren} actif${enabledChildren > 1 ? 's' : ''})` : ''}</span>
        <select id="custodyChild">
          ${childCandidates.map((p) => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${p.emoji} ${U.esc(p.name)}${p.custody && p.custody.enabled ? ' ✓' : ''}</option>`).join('')}
        </select>
      </label>
      <label class="switch"><input type="checkbox" id="custodyEnabled" ${raw && raw.enabled ? 'checked' : ''}><span>Garde alternée pour ${U.esc(selected ? selected.name : 'cet enfant')}</span></label>
      ${raw && raw.enabled && raw.evenId && raw.oddId ? `
        <div class="field"><span>Semaines paires avec</span>
          <div class="chips">
            ${parentCandidates.length
              ? parentCandidates.map((p) => `<button type="button" class="chip ${raw.evenId === p.id ? 'on' : ''}" data-custody-even="${p.id}" style="--c:${p.color}"><span class="chip-avatar">${p.emoji}</span>${U.esc(p.name)}</button>`).join('')
              : '<span class="hint">Aucun profil de type « Parent ».</span>'}
          </div>
        </div>
        <div class="field"><span>Semaines impaires avec</span>
          <div class="chips">
            ${parentCandidates.length
              ? parentCandidates.map((p) => `<button type="button" class="chip ${raw.oddId === p.id ? 'on' : ''}" data-custody-odd="${p.id}" style="--c:${p.color}"><span class="chip-avatar">${p.emoji}</span>${U.esc(p.name)}</button>`).join('')
              : '<span class="hint">Aucun profil de type « Parent ».</span>'}
          </div>
        </div>
        ${parentCandidates.length < 2 ? '<p class="hint">Il faut au moins deux personnes de type « Parent » pour alterner.</p>' : ''}
        <p class="hint">Cette semaine : <b>semaine ${weekNow} (${parityNow})</b> → ${weekOwner ? U.esc(weekOwner.name) : '—'}.</p>
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
    </div>`;
  })();

  return `<div class="stack settings-page">
    ${syncBlock}
    ${accountsBlock}
    ${custodyBlock}

    <div class="settings-block">
      <h3>🤝 Validation entre parents</h3>
      <p class="muted">Quand un parent modifie la garde ou crée un événement pour un enfant, l'autre parent reçoit une demande et peut accepter ou refuser (avec un commentaire).</p>
      <label class="switch"><input type="checkbox" id="approvalOn" ${approvalOn() ? 'checked' : ''}><span>Activer les demandes de validation</span></label>
      <label class="field"><span>Nom de ce téléphone</span>
        <input id="deviceName" maxlength="20" value="${U.esc(myDevice().name)}" placeholder="Ex. Papa">
      </label>
      <p class="hint">Chaque téléphone doit avoir son propre nom (Papa / Maman). Les demandes s'affichent sur l'Agenda et dans les notifications.</p>
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
    </div>

    ${pushBlock}

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
      <h3>❓ Aide</h3>
      <p class="muted">Mode d'emploi, astuces et réponses aux questions fréquentes.</p>
      <div class="row gap">
        <button class="btn ghost grow" data-action="help">Ouvrir l'aide</button>
        <button class="btn ghost grow" data-action="tuto-replay">Revoir le tutoriel</button>
      </div>
    </div>

    <div class="settings-block">
      <h3>📲 Installation</h3>
      ${installBlock}
    </div>

    <p class="about">Kifékoi · v3.4<br>Données stockées sur vos téléphones${Sync.configured ? ' et synchronisées via votre espace Supabase' : ''}.</p>
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

function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  const date = el.dataset.date;

  switch (action) {
    case 'nav':
      ui.view = el.dataset.view;
      render();
      break;
    case 'open-event':
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
    case 'custody-apply-all': {
      const sel = $('#custodyChild');
      const id = ui.custodyChildId || (sel ? sel.value : null);
      const raw = id ? S.custodyRawFor(id) : null;
      if (!raw || !raw.evenId || !raw.oddId) break;
      for (const p of S.profiles().filter((x) => x.role === 'child')) {
        S.saveCustody(p.id, { enabled: true, evenId: raw.evenId, oddId: raw.oddId });
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
    case 'help':
      helpSheet();
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

  // Tutoriel de premier lancement : uniquement sur une installation neuve.
  if (!tutorialSeen() && S.profiles().length === 0) {
    setTimeout(() => openTutorial(0), 600);
  }
}

document.addEventListener('DOMContentLoaded', boot);
