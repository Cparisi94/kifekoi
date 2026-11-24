/* Kifékoi — synchronisation entre les téléphones via Supabase (gratuit) */

import { state, applyRemote, dirtyRows, markSynced, setWatermark, emit, hasContent, resetLocal } from './store.js';

const CFG = (typeof window !== 'undefined' && window.AGENDA_CONFIG) || {};
const BASE = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
const KEY = String(CFG.supabaseAnonKey || '');

const K_SESSION = 'af.session.v1';
const K_ACCOUNT = 'af.account.v1';
const TABLE = 'family_records';
const SIGNUPS = 'signups';

export const configured = Boolean(BASE && KEY);

export const status = {
  mode: configured ? 'idle' : 'local', // local | signedout | idle | syncing | error
  email: '',
  lastSync: 0,
  message: '',
};

/* Liste des comptes — uniquement pour le compte du créateur. */
export const creator = {
  isCreator: false,
  accounts: [],
  checkedAt: 0,
};

let session = readSession();
if (session && session.email) status.email = session.email;

function readSession() {
  try {
    const raw = localStorage.getItem(K_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(s) {
  session = s;
  status.email = s ? s.email || status.email : '';
  if (s) localStorage.setItem(K_SESSION, JSON.stringify(s));
  else localStorage.removeItem(K_SESSION);
}

function emitStatus() {
  window.dispatchEvent(new CustomEvent('af-sync', { detail: { ...status } }));
}

export function currentSession() {
  return session;
}

export function isSignedIn() {
  return Boolean(session && session.access_token);
}

/* Jeton valide (rafraîchi si besoin) — utilisé par les notifications push. */
export async function getToken() {
  return ensureToken();
}

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */

async function authRequest(path, body) {
  const res = await fetch(`${BASE}/auth/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { msg: text }; }
  if (!res.ok) {
    const msg = (data && (data.msg || data.error_description || data.message || data.error)) || `Erreur ${res.status}`;
    throw new Error(translateAuthError(msg));
  }
  return data;
}

function translateAuthError(msg) {
  const m = String(msg).toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) return "Compte non confirmé : validez l'e-mail reçu, ou désactivez la confirmation d'e-mail dans Supabase (Authentication > Sign In / Providers > Email).";
  if (m.includes('user already registered')) return 'Ce compte existe déjà : utilisez « Se connecter ».';
  if (m.includes('password should be at least')) return 'Mot de passe trop court (6 caractères minimum).';
  if (m.includes('unable to validate email')) return 'Adresse e-mail invalide.';
  if (m.includes('rate limit')) return 'Trop de tentatives, réessayez dans une minute.';
  return msg;
}

function storeAuth(data) {
  if (!data || !data.access_token) return null;
  const userId = data.user && data.user.id;
  const previous = localStorage.getItem(K_ACCOUNT);
  const switched = Boolean(previous && userId && previous !== userId);

  if (switched) {
    // Compte différent : on repart d'une base propre pour éviter de mélanger
    // les données de deux comptes sur ce téléphone.
    resetLocal();
  }

  const s = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    user_id: userId,
    email: data.user && data.user.email,
  };
  writeSession(s);
  if (userId) localStorage.setItem(K_ACCOUNT, userId);
  status.mode = 'idle';
  status.message = switched ? 'Nouveau compte : données locales réinitialisées.' : '';
  emitStatus();
  return s;
}

export async function signIn(email, password) {
  const data = await authRequest('token?grant_type=password', { email, password });
  storeAuth(data);
  // Premier appareil relié sans données perso : on repart de la base commune.
  if (!hasContent() && !state.watermark) resetLocal();
  const n = await syncNow('login');
  emit();
  return n;
}

export async function signUp(email, password) {
  const data = await authRequest('signup', { email, password });
  if (data && data.access_token) {
    storeAuth(data);
    await syncNow('signup');
    emit();
    return { confirmed: true };
  }
  return { confirmed: false };
}

export function signOut() {
  writeSession(null);
  status.mode = configured ? 'signedout' : 'local';
  status.message = '';
  creator.isCreator = false;
  creator.accounts = [];
  creator.checkedAt = 0;
  emitStatus();
}

async function ensureToken() {
  if (!session) throw new Error('Vous n\u2019êtes pas connecté.');
  if (session.expires_at - 120000 > Date.now()) return session.access_token;
  if (!session.refresh_token) throw new Error('Session expirée, reconnectez-vous.');
  const data = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
  storeAuth(data);
  if (!session) throw new Error('Session expirée, reconnectez-vous.');
  return session.access_token;
}

/* ------------------------------------------------------------------ */
/* API REST (PostgREST)                                                */
/* ------------------------------------------------------------------ */

async function api(path, options = {}, retry = true) {
  const token = await ensureToken();
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && retry) {
    session.expires_at = 0;
    await ensureToken();
    return api(path, options, false);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serveur : ${res.status} ${text.slice(0, 200)}`);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

let pullCount = 0;

async function pullAll() {
  const since = state.watermark
    ? new Date(Math.max(0, Date.parse(state.watermark) - 5000)).toISOString()
    : '1970-01-01T00:00:00.000Z';

  let offset = 0;
  const limit = 500;
  let total = 0;
  const changed = [];

  for (let i = 0; i < 20; i++) {
    const rows = await api(
      `${TABLE}?select=id,kind,payload,deleted,updated_at&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.asc&limit=${limit}&offset=${offset}`
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    const applied = applyRemote(rows);
    if (applied && applied.length) changed.push(...applied);
    total += rows.length;
    if (rows.length < limit) break;
    offset += limit;
  }

  // Petite marge de 5 s pour absorber les décalages d'horloge entre téléphones.
  setWatermark(new Date(Date.now() - 5000).toISOString());

  pullCount++;
  // On ignore le tout premier chargement (arrivée sur l'app) pour ne pas
  // notifier en masse ; seules les modifications suivantes sont signalées.
  if (pullCount > 1 && changed.length) {
    window.dispatchEvent(new CustomEvent('af-remote-change', { detail: { changes: changed } }));
  }

  return total;
}

async function pushAll() {
  const rows = dirtyRows();
  if (rows.length === 0) return 0;

  const payload = rows.map((r) => ({
    id: r.id,
    user_id: session.user_id,
    kind: r.kind,
    payload: r.payload,
    deleted: !!r.deleted,
    updated_at: new Date(r.updatedAt).toISOString(),
  }));

  await api(`${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(payload),
  });

  markSynced(rows.map((r) => r.id));
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Suivi des comptes créés                                             */
/* ------------------------------------------------------------------ */

function deviceLabel() {
  try {
    const raw = localStorage.getItem('af.device.v1');
    const d = raw ? JSON.parse(raw) : null;
    return d && d.name ? String(d.name).slice(0, 40) : '';
  } catch {
    return '';
  }
}

let lastSignupPing = 0;

async function registerAccount(force = false) {
  if (!isSignedIn() || !session.email || !session.user_id) return;
  if (!force && Date.now() - lastSignupPing < 10 * 60 * 1000) return;
  lastSignupPing = Date.now();
  try {
    await api(SIGNUPS, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([
        {
          user_id: session.user_id,
          email: session.email,
          device: deviceLabel(),
          last_seen: new Date().toISOString(),
        },
      ]),
    });
  } catch (err) {
    // Table absente ou droits insuffisants : la fonctionnalité est ignorée.
    console.warn('Suivi des comptes indisponible', err && err.message ? err.message : err);
  }
}

export async function refreshCreator(force = false) {
  if (!configured || !isSignedIn()) {
    creator.isCreator = false;
    creator.accounts = [];
    return false;
  }
  if (!force && Date.now() - creator.checkedAt < 60000) return creator.isCreator;
  creator.checkedAt = Date.now();

  try {
    const yes = await api('rpc/is_creator', { method: 'POST', body: '{}' });
    creator.isCreator = yes === true;
  } catch {
    creator.isCreator = false;
  }

  if (creator.isCreator) {
    try {
      const rows = await api(
        `${SIGNUPS}?select=user_id,email,device,created_at,last_seen&order=created_at.asc`
      );
      creator.accounts = Array.isArray(rows) ? rows : [];
    } catch (err) {
      creator.accounts = [];
      console.warn('Liste des comptes indisponible', err && err.message ? err.message : err);
    }
  } else {
    creator.accounts = [];
  }

  window.dispatchEvent(new CustomEvent('af-signups', { detail: { ...creator } }));
  return creator.isCreator;
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

let running = null;
let lastAttempt = 0;

export async function syncNow(reason = 'auto') {
  if (!configured) {
    status.mode = 'local';
    emitStatus();
    return 0;
  }
  if (!isSignedIn()) {
    status.mode = 'signedout';
    emitStatus();
    return 0;
  }
  if (running) return running;
  if (reason === 'auto' && Date.now() - lastAttempt < 15000) return 0;

  lastAttempt = Date.now();
  status.mode = 'syncing';
  status.message = '';
  emitStatus();

  running = (async () => {
    try {
      await ensureToken();
      const pulled = await pullAll();
      const pushed = await pushAll();
      status.mode = 'idle';
      status.lastSync = Date.now();
      status.message = '';
      emitStatus();
      emit();
      // Suivi des comptes (silencieux si la fonctionnalité n'est pas installée).
      registerAccount();
      if (Date.now() - creator.checkedAt > 60000) refreshCreator();
      return pulled + pushed;
    } catch (err) {
      console.warn('Sync échouée', err);
      status.mode = navigator.onLine ? 'error' : 'offline';
      status.message = navigator.onLine ? String(err.message || err) : 'Hors ligne — les données restent enregistrées sur ce téléphone.';
      emitStatus();
      return 0;
    } finally {
      running = null;
    }
  })();

  return running;
}

let autoTimer = null;

export function startAutoSync() {
  if (!configured) {
    status.mode = 'local';
    emitStatus();
    return;
  }
  status.mode = isSignedIn() ? 'idle' : 'signedout';
  emitStatus();

  clearInterval(autoTimer);
  autoTimer = setInterval(() => {
    syncNow('auto');
  }, 45000);

  window.addEventListener('online', () => syncNow('online'));
  window.addEventListener('focus', () => syncNow('focus'));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow('visible');
  });

  if (isSignedIn()) syncNow('start');

  // Pousse les modifications locales peu après chaque changement.
  let debounce = null;
  window.addEventListener('af-local-change', () => {
    if (!isSignedIn()) return;
    clearTimeout(debounce);
    debounce = setTimeout(() => syncNow('local'), 2500);
  });
}

export function syncStatusLabel() {
  switch (status.mode) {
    case 'local': return 'Local uniquement';
    case 'signedout': return 'Non connecté';
    case 'syncing': return 'Synchronisation…';
    case 'error': return 'Erreur de synchro';
    case 'offline': return 'Hors ligne';
    default:
      return status.lastSync ? `À jour` : 'Prêt';
  }
}
