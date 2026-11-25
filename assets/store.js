/* Kifékoi — magasin de données local (localStorage) + logique métier */

import {
  uid, startOf, addInterval, addDays, toDateISO, toLocalISO, startOfDay, DAY_MS, parseLocal, isoWeekNumber,
} from './util.js';

const K_RECORDS = 'af.records.v1';
const K_DIRTY = 'af.dirty.v1';
const K_WATERMARK = 'af.watermark.v1';

export const state = {
  records: {},       // id -> { id, kind, payload, updatedAt, deleted }
  dirty: new Set(),  // ids à pousser vers le serveur
  watermark: '',     // dernier point de synchro (ISO)
};

/* ------------------------------------------------------------------ */
/* Abonnements (l'UI se redessine quand les données changent)          */
/* ------------------------------------------------------------------ */

const subs = new Set();

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function emit() {
  for (const fn of subs) {
    try { fn(); } catch (err) { console.error(err); }
  }
}

function notifyLocal() {
  try { window.dispatchEvent(new Event('af-local-change')); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Persistance                                                         */
/* ------------------------------------------------------------------ */

function persist() {
  try {
    localStorage.setItem(K_RECORDS, JSON.stringify(Object.values(state.records)));
    localStorage.setItem(K_DIRTY, JSON.stringify([...state.dirty]));
    localStorage.setItem(K_WATERMARK, state.watermark || '');
  } catch (err) {
    console.error('Sauvegarde locale impossible', err);
  }
}

export function setWatermark(iso) {
  state.watermark = iso || '';
  persist();
}

export function load() {
  try {
    const raw = localStorage.getItem(K_RECORDS);
    if (raw) {
      const arr = JSON.parse(raw);
      state.records = {};
      for (const r of arr) if (r && r.id) state.records[r.id] = r;
    }
    const dirty = localStorage.getItem(K_DIRTY);
    if (dirty) state.dirty = new Set(JSON.parse(dirty));
    state.watermark = localStorage.getItem(K_WATERMARK) || '';
  } catch (err) {
    console.error('Lecture locale impossible', err);
  }

  // Aucun profil n'est créé automatiquement : une installation neuve est vide.
  migrateOldRepeats();
  migrateEmojis();
  migrateProfileNames();
  migrateProfileRoles();
  cleanupAvatars();
  migrateMiaEmoji();
}

/* Nouvel émoji pour Mia (tête de chien beige). */
function migrateMiaEmoji() {
  if (localStorage.getItem('af.migrated.mia')) return;

  let changed = false;
  for (const rec of all('profile')) {
    const p = rec.payload;
    if (!p || p.role !== 'animal' || p.emoji !== '🐕') continue;
    rec.payload = { ...p, emoji: '🐶' };
    rec.updatedAt = Date.now();
    state.dirty.add(rec.id);
    changed = true;
  }

  localStorage.setItem('af.migrated.mia', '1');
  if (changed) persist();
}

/* Retire les portraits éventuellement enregistrés par une version intermédiaire. */
function cleanupAvatars() {
  if (localStorage.getItem('af.migrated.avatars.off')) return;

  let changed = false;
  for (const rec of all('profile')) {
    if (!rec.payload || !('avatar' in rec.payload)) continue;
    const next = { ...rec.payload };
    delete next.avatar;
    rec.payload = next;
    rec.updatedAt = Date.now();
    state.dirty.add(rec.id);
    changed = true;
  }

  localStorage.setItem('af.migrated.avatars.off', '1');
  if (changed) persist();
}

/* Rôle de chaque personne : parent, enfant ou animal. */
const ROLE_BY_NAME = {
  papa: 'parent',
  maman: 'parent',
  moi: 'parent',
  'la maman': 'parent',
  mattia: 'child',
  'mon fils': 'child',
  mia: 'animal',
  'mon animal': 'animal',
};

function migrateProfileRoles() {
  if (localStorage.getItem('af.migrated.roles')) return;

  const parentIds = new Set();
  let childId = null;
  for (const rec of all('profile')) {
    const c = rec.payload && rec.payload.custody;
    if (!c) continue;
    childId = rec.id;
    if (c.evenId) parentIds.add(c.evenId);
    if (c.oddId) parentIds.add(c.oddId);
  }

  let changed = false;
  for (const rec of all('profile')) {
    const p = rec.payload;
    if (!p || p.role) continue;

    const key = String(p.name || '').trim().toLowerCase();
    let role = 'parent';
    if (rec.id === childId) role = key.includes('mia') || key.includes('animal') ? 'animal' : 'child';
    else if (parentIds.has(rec.id)) role = 'parent';
    else if (ROLE_BY_NAME[key]) role = ROLE_BY_NAME[key];

    rec.payload = { ...p, role };
    rec.updatedAt = Date.now();
    state.dirty.add(rec.id);
    changed = true;
  }

  localStorage.setItem('af.migrated.roles', '1');
  if (changed) persist();
}

/**
 * Migration : prénoms de la famille et ordre d'affichage
 * Papa, Maman, Mattia, Mia.
 */
const PROFILE_RENAMES = {
  'Moi': { name: 'Papa', order: 0, emoji: '👨🏻', from: '🙋🏻' },
  'La maman': { name: 'Maman', order: 1, emoji: '👩🏻', from: '👩🏻' },
  'Mon fils': { name: 'Mattia', order: 2, emoji: '👦🏻', from: '👦🏻' },
  'Mon animal': { name: 'Mia', order: 3, emoji: '🐕', from: '🐕' },
};

function migrateProfileNames() {
  if (localStorage.getItem('af.migrated.names')) return;
  let changed = false;

  for (const r of Object.values(state.records)) {
    if (r.kind !== 'profile' || r.deleted || !r.payload) continue;
    const target = PROFILE_RENAMES[r.payload.name];
    if (!target) continue;

    const next = { ...r.payload, name: target.name, order: target.order };
    if (r.payload.emoji === target.from) next.emoji = target.emoji;
    r.payload = next;
    r.updatedAt = Date.now();
    state.dirty.add(r.id);
    changed = true;
  }

  localStorage.setItem('af.migrated.names', '1');
  if (changed) persist();
}

/**
 * Migration : émojis uniquement, teinte de peau claire (🏻) et cheveux bruns,
 * chien marron.
 */
const ICON_TO_EMOJI = { me: '🙋🏻', child: '👦🏻', dog: '🐕', woman: '👩🏻' };

const LIGHT_SKINNABLE = ['🙋', '👦', '👧', '👶', '👩', '👨', '👵', '👴', '🧑', '🧒', '👱', '🤱', '🧔'];
const SKIN_TONES = /[\u{1F3FB}-\u{1F3FF}]/gu;

function toLightEmoji(emoji) {
  if (!emoji) return '🙂';
  const base = emoji.replace(SKIN_TONES, '');
  if (base === '🐾' || base === '🐶') return '🐕';
  if (LIGHT_SKINNABLE.includes(base)) return `${base}🏻`;
  return emoji;
}

function migrateEmojis() {
  if (localStorage.getItem('af.migrated.skin')) return;
  let changed = false;

  for (const r of Object.values(state.records)) {
    if (r.kind !== 'profile' || r.deleted || !r.payload) continue;
    const p = r.payload;
    const emoji = (p.icon && ICON_TO_EMOJI[p.icon]) || toLightEmoji(p.emoji);
    if (emoji === p.emoji && !p.icon) continue;

    const next = { ...p, emoji };
    delete next.icon;
    r.payload = next;
    r.updatedAt = Date.now();
    state.dirty.add(r.id);
    changed = true;
  }

  localStorage.setItem('af.migrated.skin', '1');
  if (changed) persist();
}

/**
 * Migration v1.0 → v1.1 : l'ancienne version créait un nouvel événement à chaque
 * validation d'une série. On fusionne la chaîne dans l'événement d'origine
 * (doneDates) et on supprime les doublons.
 */
function migrateOldRepeats() {
  if (localStorage.getItem('af.migrated.v2')) return;

  const evs = Object.values(state.records).filter((r) => r.kind === 'event' && !r.deleted && r.payload);
  const byId = new Map(evs.map((r) => [r.id, r]));
  const hasChildren = new Set();
  for (const r of evs) {
    if (r.payload.previousId && byId.has(r.payload.previousId)) hasChildren.add(r.payload.previousId);
  }

  for (const leaf of evs) {
    if (hasChildren.has(leaf.id)) continue;

    const chain = [];
    const guard = new Set();
    let node = leaf;
    while (node && !guard.has(node.id)) {
      guard.add(node.id);
      chain.push(node);
      node = node.payload.previousId ? byId.get(node.payload.previousId) : null;
    }
    if (chain.length < 2) continue;

    const root = chain[chain.length - 1];
    const doneDates = new Set(root.payload.doneDates || []);
    if (root.payload.done) doneDates.add(root.payload.date);
    for (const old of chain.slice(0, -1)) if (old.payload.done) doneDates.add(old.payload.date);

    root.payload = { ...root.payload, doneDates: [...doneDates].filter(Boolean).sort(), done: false };
    root.updatedAt = Date.now();
    state.dirty.add(root.id);

    for (const old of chain.slice(0, -1)) {
      old.deleted = true;
      old.payload = {};
      old.updatedAt = Date.now();
      state.dirty.add(old.id);
    }
  }

  localStorage.setItem('af.migrated.v2', '1');
  persist();
}

/* ------------------------------------------------------------------ */
/* CRUD                                                               */
/* ------------------------------------------------------------------ */

export function get(id) {
  return state.records[id] || null;
}

export function all(kind) {
  return Object.values(state.records).filter((r) => r.kind === kind && !r.deleted);
}

export function put(kind, payload, id) {
  const rec = {
    id: id || uid(),
    kind,
    payload,
    updatedAt: Date.now(),
    deleted: false,
  };
  state.records[rec.id] = rec;
  state.dirty.add(rec.id);
  persist();
  emit();
  notifyLocal();
  return rec;
}

export function update(id, patch) {
  const rec = state.records[id];
  if (!rec) return null;
  rec.payload = { ...rec.payload, ...patch };
  rec.updatedAt = Date.now();
  state.dirty.add(id);
  persist();
  emit();
  notifyLocal();
  return rec;
}

export function remove(id) {
  const rec = state.records[id];
  if (!rec) return;
  rec.deleted = true;
  rec.payload = {};
  rec.updatedAt = Date.now();
  state.dirty.add(id);
  persist();
  emit();
  notifyLocal();
}

/* ------------------------------------------------------------------ */
/* Synchronisation (fusion)                                            */
/* ------------------------------------------------------------------ */

export function dirtyRows() {
  return [...state.dirty]
    .map((id) => state.records[id])
    .filter((r) => r && r.updatedAt);
}

export function markSynced(ids) {
  for (const id of ids) state.dirty.delete(id);
  persist();
}

export function applyRemote(rows) {
  const changed = [];
  for (const row of rows) {
    if (!row || !row.id) continue;
    const remoteMs = Date.parse(row.updated_at);
    if (!Number.isFinite(remoteMs)) continue;
    const local = state.records[row.id];
    if (local && local.updatedAt >= remoteMs) continue;
    state.records[row.id] = {
      id: row.id,
      kind: row.kind,
      payload: row.payload || {},
      deleted: !!row.deleted,
      updatedAt: remoteMs,
    };
    state.dirty.delete(row.id);
    changed.push(state.records[row.id]);
  }
  if (changed.length) {
    persist();
    emit();
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* Profils                                                            */
/* ------------------------------------------------------------------ */

/* Aucun profil n'est créé d'office : chacun ajoute les personnes de sa famille. */

export function profiles() {
  return all('profile')
    .sort((a, b) => (a.payload.order ?? 99) - (b.payload.order ?? 99)
      || String(a.payload.name || '').localeCompare(String(b.payload.name || '')))
    .map((r) => ({ ...r.payload, id: r.id }));
}

export function profile(id) {
  const r = get(id);
  return r && r.kind === 'profile' && !r.deleted ? { ...r.payload, id: r.id } : null;
}

export function ensureProfile(name, emoji, color) {
  const rec = put('profile', { name, emoji, color, order: profiles().length });
  return rec.id;
}

export function hasContent() {
  return Object.values(state.records).some((r) => !r.deleted && (r.kind === 'event' || r.kind === 'note'));
}

/* ------------------------------------------------------------------ */
/* Événements                                                          */
/* ------------------------------------------------------------------ */

export function events() {
  return all('event').filter((e) => e.payload && e.payload.date);
}

export function notes() {
  return all('note')
    .filter((r) => !(r.payload && (r.payload.request || r.payload.expense)))
    .sort(
      (a, b) => (b.payload.pinned ? 1 : 0) - (a.payload.pinned ? 1 : 0) || b.updatedAt - a.updatedAt,
    );
}

/* ------------------------------------------------------------------ */
/* Dépenses partagées                                                  */
/* ------------------------------------------------------------------ */

export function expenses() {
  return all('note')
    .filter((r) => r.payload && r.payload.expense)
    .map((r) => ({ id: r.id, ...r.payload }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))
      || (b.createdAt || 0) - (a.createdAt || 0));
}

export function addExpense(data) {
  return put('note', { expense: true, createdAt: Date.now(), ...data });
}

export function removeExpense(id) {
  remove(id);
}

/* ------------------------------------------------------------------ */
/* Demandes de validation entre parents                                */
/* ------------------------------------------------------------------ */

export function requests() {
  return all('note')
    .filter((r) => r.payload && r.payload.request)
    .sort((a, b) => (b.payload.createdAt || 0) - (a.payload.createdAt || 0));
}

export function pendingRequests() {
  return requests().filter((r) => r.payload.status === 'pending');
}

export function createRequest(data) {
  return put('note', {
    request: true,
    status: 'pending',
    comment: '',
    createdAt: Date.now(),
    resolvedAt: null,
    resolvedBy: null,
    ...data,
  });
}

export function resolveRequest(id, status, comment, by) {
  update(id, {
    status,
    comment: comment || '',
    resolvedBy: by || '',
    resolvedAt: Date.now(),
  });
}

/* ------------------------------------------------------------------ */
/* Répétitions : calcul des occurrences                                */
/* ------------------------------------------------------------------ */

export function occurrenceStart(item) {
  const p = item.payload;
  return parseLocal(p.allDay ? `${item.date}T00:00` : `${item.date}T${p.time || '00:00'}`);
}

export function sortItems(a, b) {
  return occurrenceStart(a) - occurrenceStart(b);
}

function makeItem(rec, date, done, index, recurring) {
  return { rec, payload: rec.payload, date, done, index, recurring };
}

/**
 * Développe un événement en occurrences.
 * @param {object} rec enregistrement { id, payload }
 * @param {{from?:Date|string, to?:Date|string, horizonDays?:number}} opts
 * @returns {Array<{rec:object,payload:object,date:string,done:boolean,index:number,recurring:boolean}>}
 */
export function occurrencesOf(rec, opts = {}) {
  const p = rec.payload || {};
  if (!p.date) return [];

  const today = startOfDay(new Date());
  const from = opts.from
    ? startOfDay(opts.from instanceof Date ? opts.from : parseLocal(opts.from)).getTime()
    : addDays(today, -60).getTime();
  const to = opts.to
    ? startOfDay(opts.to instanceof Date ? opts.to : parseLocal(opts.to)).getTime() + DAY_MS
    : today.getTime() + (opts.horizonDays || 400) * DAY_MS;

  const base = parseLocal(p.date);
  const doneSet = new Set(p.doneDates || []);
  const out = [];

  // Plage de jours (vacances, séjour…) : une occurrence par jour.
  if (p.endDate && p.endDate >= p.date) {
    const total = Math.round((parseLocal(p.endDate) - base) / DAY_MS) + 1;
    let d = new Date(base.getTime());
    for (let i = 0; i < 400 && toDateISO(d) <= p.endDate; i++) {
      const t = d.getTime();
      if (t >= from && t < to) {
        const iso = toDateISO(d);
        out.push({
          ...makeItem(rec, iso, doneSet.has(iso) || !!p.done, i, false),
          range: { index: i + 1, total },
        });
      }
      d = addDays(d, 1);
    }
    return out;
  }

  if (!p.repeat || !p.repeat.every) {
    const t = base.getTime();
    if (t >= from && t < to) {
      out.push(makeItem(rec, p.date, doneSet.has(p.date) || !!p.done, 0, false));
    }
    return out;
  }

  const every = Math.max(1, Number(p.repeat.every) || 1);
  const unit = p.repeat.unit || 'month';
  const until = p.repeat.until ? parseLocal(p.repeat.until).getTime() + DAY_MS : Infinity;
  const maxCount = Number(p.repeat.count) > 0 ? Number(p.repeat.count) : Infinity;

  for (let i = 0; i < 2000; i++) {
    if (i >= maxCount) break;
    const d = i === 0 ? new Date(base.getTime()) : addInterval(base, every * i, unit);
    const t = d.getTime();
    if (t >= to || t >= until) break;
    if (t >= from) {
      const iso = toDateISO(d);
      out.push(makeItem(rec, iso, doneSet.has(iso), i, true));
    }
    if (out.length > 400) break;
  }
  return out;
}

export function allOccurrences(opts = {}) {
  const out = [];
  for (const rec of events()) out.push(...occurrencesOf(rec, opts));
  out.push(...birthdayOccurrences(opts));
  return out.sort(sortItems);
}

/* ------------------------------------------------------------------ */
/* Anniversaires (générés depuis la fiche de la personne)              */
/* ------------------------------------------------------------------ */

function birthDateForYear(birth, year) {
  const month = birth.getMonth();
  const day = birth.getDate();
  const d = new Date(year, month, day);
  if (d.getMonth() !== month) return new Date(year, month + 1, 0); // 29 février
  return d;
}

export function birthdayOccurrences(opts = {}) {
  const today = startOfDay(new Date());
  const from = opts.from
    ? startOfDay(opts.from instanceof Date ? opts.from : parseLocal(opts.from)).getTime()
    : addDays(today, -60).getTime();
  const to = opts.to
    ? startOfDay(opts.to instanceof Date ? opts.to : parseLocal(opts.to)).getTime() + DAY_MS
    : today.getTime() + (opts.horizonDays || 400) * DAY_MS;

  const out = [];
  const startYear = new Date(from).getFullYear() - 1;
  const endYear = new Date(to).getFullYear() + 1;

  for (const rec of all('profile')) {
    const raw = rec.payload && rec.payload.birthday;
    if (!raw) continue;
    const birth = parseLocal(raw);
    if (!birth || Number.isNaN(birth.getTime())) continue;
    const name = rec.payload.name || '';

    for (let year = startYear; year <= endYear; year++) {
      const d = birthDateForYear(birth, year);
      const t = d.getTime();
      if (t < from || t >= to) continue;
      out.push({
        rec,
        payload: {
          profileId: rec.id,
          title: `Anniversaire de ${name}`,
          category: 'anniversaire',
          allDay: true,
          time: '00:00',
          reminders: [],
          repeat: null,
          notes: '',
        },
        date: toDateISO(d),
        done: false,
        index: 0,
        virtual: 'birthday',
        age: year - birth.getFullYear(),
      });
    }
  }
  return out;
}

/** Âge actuel à partir d'une date de naissance. */
export function ageFrom(birthday) {
  const b = parseLocal(birthday);
  if (!b) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const before = now.getMonth() < b.getMonth()
    || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (before) age -= 1;
  return age;
}

/* ------------------------------------------------------------------ */
/* Garde alternée                                                     */
/* ------------------------------------------------------------------ */

/** Toutes les configurations de garde actives (une par enfant). */
export function custodyConfigs() {
  const out = [];
  for (const rec of all('profile')) {
    const c = rec.payload && rec.payload.custody;
    if (!c || !c.enabled || !c.evenId || !c.oddId) continue;
    out.push({
      recId: rec.id,
      name: rec.payload.name || '',
      emoji: rec.payload.emoji || '',
      evenId: c.evenId,
      oddId: c.oddId,
      overrides: c.overrides || {},
      mode: c.mode || 'parity',
      anchor: c.anchor || null,
      anchorPart: c.anchorPart || 'am',
      aDays: Number(c.aDays) || 0,
      bDays: Number(c.bDays) || 0,
      weekA: Array.isArray(c.weekA) ? c.weekA : null,
      weekB: Array.isArray(c.weekB) ? c.weekB : null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Configuration d'un enfant, même désactivée (écran réglages). */
export function custodyRawFor(childId) {
  const rec = get(childId);
  if (!rec || !rec.payload || !rec.payload.custody) return null;
  return { recId: rec.id, ...rec.payload.custody };
}

export function saveCustody(childId, patch) {
  const rec = get(childId);
  if (!rec) return;
  const current = (rec.payload && rec.payload.custody) || {};
  update(childId, { custody: { ...current, ...patch } });
}

/**
 * Parent "de base" pour une date (alternance + vacances), sans exception.
 * @returns {string|null}
 */
/**
 * Parent "de base" pour une date (alternance + vacances), sans exception.
 * @returns {{am:string|null, pm:string|null, sleep:string|null}}
 */
export function custodyBaseParts(cfg, dateISO) {
  if (!cfg) return null;

  const parents = [cfg.evenId, cfg.oddId];
  for (const rec of events()) {
    const p = rec.payload;
    if (!p.endDate || p.category !== 'vacances' || p.affectsCustody !== true) continue;
    if (!parents.includes(p.profileId)) continue;
    if (dateISO >= p.date && dateISO <= p.endDate) {
      return { am: p.profileId, pm: p.profileId, sleep: p.profileId };
    }
  }

  // Semaines types : semaine A / semaine B alternées, modèle jour par jour.
  if (cfg.mode === 'weeks' && Array.isArray(cfg.weekA) && Array.isArray(cfg.weekB) && cfg.anchor) {
    const start = mondayOf(cfg.anchor);
    const days = epochDay(dateISO) - epochDay(start);
    const weekIndex = Math.floor(days / 7);
    const even = ((weekIndex % 2) + 2) % 2 === 0;
    const wd = (parseLocal(dateISO).getDay() + 6) % 7; // 0 = lundi
    const entry = (even ? cfg.weekA : cfg.weekB)[wd];

    if (typeof entry === 'string') return { am: entry, pm: entry, sleep: entry };
    if (entry && typeof entry === 'object') {
      const fallback = entry.am || cfg.evenId;
      return {
        am: entry.am || fallback,
        pm: entry.pm || fallback,
        sleep: entry.sleep || fallback,
      };
    }
    return { am: cfg.evenId, pm: cfg.evenId, sleep: cfg.evenId };
  }

  // Rythme en jours, avec un départ possible en matin / après-midi / nuit.
  if (cfg.mode === 'cycle' && cfg.anchor && cfg.aDays > 0 && cfg.bDays > 0) {
    const PART = { am: 0, pm: 1, sleep: 2 };
    const anchorPart = PART[cfg.anchorPart] != null ? PART[cfg.anchorPart] : 0;
    const anchorPos = epochDay(cfg.anchor) * 3 + anchorPart;
    const cycle = (cfg.aDays + cfg.bDays) * 3;
    const out = {};
    for (const part of ['am', 'pm', 'sleep']) {
      const pos = epochDay(dateISO) * 3 + PART[part] - anchorPos;
      const p = ((pos % cycle) + cycle) % cycle;
      out[part] = p < cfg.aDays * 3 ? cfg.evenId : cfg.oddId;
    }
    return out;
  }

  const week = isoWeekNumber(parseLocal(dateISO));
  const owner = week % 2 === 0 ? cfg.evenId : cfg.oddId;
  return { am: owner, pm: owner, sleep: owner };
}

/**
 * Parent "de base" pour une date (le parent de la nuit).
 * @returns {string|null}
 */
export function custodyBaseFor(cfg, dateISO) {
  const parts = custodyBaseParts(cfg, dateISO);
  if (!parts) return null;
  return parts.sleep || parts.am || parts.pm || null;
}

function epochDay(dateISO) {
  const d = parseLocal(dateISO);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function mondayOf(dateISO) {
  const d = parseLocal(dateISO);
  const wd = (d.getDay() + 6) % 7;
  return toDateISO(addDays(d, -wd));
}

/**
 * Garde d'une journée pour un enfant, découpée en matin / après-midi / nuit.
 * @returns {{am:string|null, pm:string|null, sleep:string|null}|null}
 */
export function custodyDayFor(cfg, dateISO) {
  if (!cfg) return null;

  const base = custodyBaseParts(cfg, dateISO);
  if (!base) return null;
  const ov = (cfg.overrides || {})[dateISO];

  if (typeof ov === 'string') return { am: ov || null, pm: ov || null, sleep: ov || null };
  if (ov && typeof ov === 'object') {
    return {
      am: 'am' in ov ? ov.am : base.am,
      pm: 'pm' in ov ? ov.pm : base.pm,
      sleep: 'sleep' in ov ? ov.sleep : base.sleep,
    };
  }
  return { ...base };
}

/** Garde du jour pour tous les enfants configurés. */
export function custodyDays(dateISO) {
  return custodyConfigs().map((cfg) => ({
    cfg,
    base: custodyBaseFor(cfg, dateISO),
    day: custodyDayFor(cfg, dateISO),
  }));
}

/**
 * Modifie une partie de la journée d'un enfant (am / pm / sleep).
 * @param {string} childId
 * @param {string} dateISO
 * @param {'am'|'pm'|'sleep'} part
 * @param {string|null} profileId  null = revenir à l'alternance
 */
export function setCustodyPartFor(childId, dateISO, part, profileId) {
  const cfg = custodyRawFor(childId);
  if (!cfg) return;

  const day = custodyDayFor(cfg, dateISO);
  if (!day) return;

  const next = { ...day, [part]: profileId || null };
  const base = custodyBaseParts(cfg, dateISO);
  const overrides = { ...(cfg.overrides || {}) };

  if (base && next.am === base.am && next.pm === base.pm && next.sleep === base.sleep) delete overrides[dateISO];
  else overrides[dateISO] = next;

  saveCustody(childId, { overrides });
}

export function occurrencesBetween(from, to, profileId) {
  return allOccurrences({ from, to }).filter(
    (i) => !profileId || profileId === 'all' || i.payload.profileId === profileId,
  );
}

export function upcomingOccurrences(profileId, limit = 10) {
  const today = startOfDay(new Date());
  const list = allOccurrences({ from: today, horizonDays: 730 }).filter(
    (i) => !i.done
      && (!profileId || profileId === 'all' || i.payload.profileId === profileId)
      && occurrenceStart(i) >= today,
  );
  return limit ? list.slice(0, limit) : list;
}

/** Occurrences passées non faites : la plus récente de chaque série. */
export function overdueOccurrences(profileId) {
  const today = startOfDay(new Date());
  const list = allOccurrences({ from: addDays(today, -90), to: addDays(today, -1) }).filter(
    (i) => !i.virtual && !i.range && !i.done && (!profileId || profileId === 'all' || i.payload.profileId === profileId),
  );
  const latest = new Map();
  for (const it of list) {
    const prev = latest.get(it.rec.id);
    if (!prev || it.date > prev.date) latest.set(it.rec.id, it);
  }
  return [...latest.values()].sort(sortItems);
}

/** Prochaine occurrence à venir d'une série (ou d'un événement simple). */
export function nextOccurrence(rec) {
  const today = startOfDay(new Date());
  const list = occurrencesOf(rec, { from: today, horizonDays: 3650 }).filter((i) => !i.done);
  return list[0] || null;
}

/* ------------------------------------------------------------------ */
/* Valider / rouvrir une occurrence                                    */
/* ------------------------------------------------------------------ */

export function toggleOccurrence(id, date) {
  const rec = typeof id === 'string' ? get(id) : id;
  if (!rec || rec.kind !== 'event') return;
  const p = rec.payload;

  if (!p.repeat || !p.repeat.every) {
    update(rec.id, { done: !p.done, doneAt: p.done ? null : Date.now() });
    return;
  }

  const doneDates = new Set(p.doneDates || []);
  if (doneDates.has(date)) doneDates.delete(date);
  else doneDates.add(date);
  update(rec.id, { doneDates: [...doneDates].sort() });
}

/* ------------------------------------------------------------------ */
/* Rappels                                                            */
/* ------------------------------------------------------------------ */

/**
 * Occurrences de rappel (une par délai et par occurrence à venir).
 * @returns {Array<{key:string, at:number, offset:number, item:object}>}
 */
export function reminderOccurrences(horizonDays = 200) {
  const out = [];
  const from = addDays(new Date(), -2);
  const items = allOccurrences({ from, horizonDays });

  for (const item of items) {
    if (item.done) continue;
    if (item.range && item.range.index > 1) continue; // une seule alerte pour une plage
    const offsets = Array.isArray(item.payload.reminders) ? item.payload.reminders : [];
    if (!offsets.length) continue;
    const start = occurrenceStart(item);
    for (const offset of offsets) {
      out.push({
        key: `${item.rec.id}:${item.date}:${offset}`,
        at: start.getTime() - offset * 60000,
        offset,
        item,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export function nextReminders(limit = 20) {
  const now = Date.now();
  return reminderOccurrences().filter((r) => r.at >= now - 3600 * 1000).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Statistiques (écran Personnes)                                     */
/* ------------------------------------------------------------------ */

export function statsFor(profileId) {
  const upcoming = upcomingOccurrences(profileId, 200);
  const unique = new Set(upcoming.map((i) => i.rec.id));
  const notesList = notes().filter((n) => n.payload.profileId === profileId);
  return {
    total: unique.size,
    next: upcoming[0] || null,
    notes: notesList.length,
  };
}

/* ------------------------------------------------------------------ */
/* Fusion des doublons de personnes                                   */
/* ------------------------------------------------------------------ */

const PROFILE_ALIASES = {
  moi: 'papa',
  'la maman': 'maman',
  'maman de mon enfant': 'maman',
  'mon fils': 'mattia',
  'mon animal': 'mia',
};

const PROFILE_CANONICAL = { papa: 'Papa', maman: 'Maman', mattia: 'Mattia', mia: 'Mia' };

function profileKey(payload) {
  const raw = String((payload && payload.name) || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!raw) return null;
  return PROFILE_ALIASES[raw] || raw;
}

/**
 * Fusionne les personnes en double (même nom, y compris les anciens noms
 * « Moi / Mon fils / Mon animal / La maman »). Les événements et notes des
 * doublons sont réaffectés à la personne conservée, puis les doublons sont
 * supprimés.
 * @returns {{merged:number, moved:number}}
 */
export function dedupeProfiles() {
  const profs = all('profile');
  const groups = new Map();

  for (const rec of profs) {
    const key = profileKey(rec.payload);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  const eventRecs = Object.values(state.records).filter((r) => r.kind === 'event' && !r.deleted);
  const noteRecs = Object.values(state.records).filter((r) => r.kind === 'note' && !r.deleted);

  let merged = 0;
  let moved = 0;

  for (const [key, list] of groups.entries()) {
    if (list.length < 2) continue;

    const refs = new Map(list.map((r) => [r.id, 0]));
    for (const e of eventRecs) if (refs.has(e.payload.profileId)) refs.set(e.payload.profileId, refs.get(e.payload.profileId) + 1);
    for (const n of noteRecs) if (refs.has(n.payload.profileId)) refs.set(n.payload.profileId, refs.get(n.payload.profileId) + 1);

    list.sort((a, b) => refs.get(b.id) - refs.get(a.id) || (a.payload.order ?? 99) - (b.payload.order ?? 99));
    const keep = list[0];
    const losers = list.slice(1);

    const keptPayload = { ...keep.payload };
    // La personne conservée garde la position la plus haute du groupe
    // et retrouve son nom d'origine si c'était un ancien intitulé.
    keptPayload.order = Math.min(...list.map((l) => l.payload.order ?? 99));
    if (PROFILE_CANONICAL[key]) keptPayload.name = PROFILE_CANONICAL[key];
    if (!keptPayload.birthday) {
      const donor = losers.find((l) => l.payload.birthday);
      if (donor) keptPayload.birthday = donor.payload.birthday;
    }

    for (const loser of losers) {
      for (const e of eventRecs) {
        if (e.payload.profileId !== loser.id) continue;
        e.payload.profileId = keep.id;
        e.updatedAt = Date.now();
        state.dirty.add(e.id);
        moved++;
      }
      for (const n of noteRecs) {
        if (n.payload.profileId !== loser.id) continue;
        n.payload.profileId = keep.id;
        n.updatedAt = Date.now();
        state.dirty.add(n.id);
        moved++;
      }
      loser.deleted = true;
      loser.payload = {};
      loser.updatedAt = Date.now();
      state.dirty.add(loser.id);
      merged++;
    }

    keep.payload = keptPayload;
    keep.updatedAt = Date.now();
    state.dirty.add(keep.id);
  }

  if (merged > 0) {
    // Renumérote l'ordre d'affichage des personnes restantes.
    const remaining = all('profile').sort(
      (a, b) => (a.payload.order ?? 99) - (b.payload.order ?? 99) || String(a.payload.name || '').localeCompare(String(b.payload.name || '')),
    );
    remaining.forEach((rec, i) => {
      if ((rec.payload.order ?? -1) === i) return;
      rec.payload = { ...rec.payload, order: i };
      rec.updatedAt = Date.now();
      state.dirty.add(rec.id);
    });

    persist();
    emit();
    notifyLocal();
  }

  return { merged, moved };
}

/* ------------------------------------------------------------------ */
/* Import / restauration                                              */
/* ------------------------------------------------------------------ */

export function importRecords(data) {
  const rows = Array.isArray(data) ? data : data && data.records;
  if (!Array.isArray(rows)) throw new Error('Format de sauvegarde invalide');
  let n = 0;
  for (const r of rows) {
    if (!r || !r.id || !r.kind) continue;
    const ms = r.updatedAt || Date.parse(r.updated_at) || Date.now();
    const local = state.records[r.id];
    if (local && local.updatedAt > ms) continue;
    state.records[r.id] = {
      id: r.id,
      kind: r.kind,
      payload: r.payload || {},
      deleted: !!r.deleted,
      updatedAt: ms,
    };
    state.dirty.add(r.id);
    n++;
  }
  persist();
  emit();
  notifyLocal();
  return n;
}

export function exportPayload() {
  return {
    app: 'kifekoi',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: Object.values(state.records),
  };
}

export function resetLocal() {
  state.records = {};
  state.dirty = new Set();
  state.watermark = '';
  persist();
  emit();
}

export { startOf, parseLocal };
