/* Kifékoi — notifications push (reçues même application fermée) */

import * as Sync from './sync.js';

const CFG = (typeof window !== 'undefined' && window.AGENDA_CONFIG) || {};
const BASE = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
const KEY = String(CFG.supabaseAnonKey || '');
const VAPID = String(CFG.vapidPublicKey || '');

const K_ON = 'af.push.on.v1';

export const state = {
  supported:
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window,
  permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  subscribed: false,
  endpoint: '',
  busy: false,
  message: '',
};

export const ready = Boolean(BASE && KEY && VAPID);

function b64uToBytes(value) {
  const s = String(value);
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function deviceLabel() {
  try {
    const d = JSON.parse(localStorage.getItem('af.device.v1') || 'null');
    return d && d.name ? String(d.name).slice(0, 40) : '';
  } catch {
    return '';
  }
}

async function authHeaders() {
  const token = await Sync.getToken();
  return {
    apikey: KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function currentSubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

export async function refresh() {
  state.permission = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  if (!state.supported) return state;
  const sub = await currentSubscription();
  state.subscribed = Boolean(sub);
  state.endpoint = sub ? sub.endpoint : '';
  return state;
}

export async function enable() {
  if (!state.supported) {
    throw new Error('Ce navigateur ne gère pas les notifications push.');
  }
  if (!ready) {
    throw new Error("Le service de push n'est pas encore configuré.");
  }
  if (!Sync.isSignedIn()) {
    throw new Error('Reliez ce téléphone (compte) avant d’activer le push.');
  }

  state.busy = true;
  state.message = '';
  try {
    const permission = await Notification.requestPermission();
    state.permission = permission;
    if (permission !== 'granted') {
      throw new Error('Notifications refusées dans le navigateur.');
    }

    await navigator.serviceWorker.register('sw.js');
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64uToBytes(VAPID),
      });
    }

    const json = sub.toJSON();
    const res = await fetch(`${BASE}/rest/v1/push_subscriptions`, {
      method: 'POST',
      headers: { ...(await authHeaders()), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([
        {
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          device: deviceLabel(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
    if (!res.ok) {
      throw new Error(`Enregistrement impossible (${res.status})`);
    }

    state.subscribed = true;
    state.endpoint = sub.endpoint;
    localStorage.setItem(K_ON, '1');
    return state;
  } finally {
    state.busy = false;
  }
}

export async function disable() {
  state.busy = true;
  try {
    const sub = await currentSubscription();
    if (sub) {
      try {
        await fetch(
          `${BASE}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`,
          { method: 'DELETE', headers: await authHeaders() }
        );
      } catch {
        /* on continue : l'abonnement local sera supprimé quand même */
      }
      await sub.unsubscribe().catch(() => {});
    }
    state.subscribed = false;
    state.endpoint = '';
    localStorage.removeItem(K_ON);
    return state;
  } finally {
    state.busy = false;
  }
}

/* Envoie une notification aux autres téléphones (ou au créateur). */
export async function notify(payload) {
  if (!ready || !Sync.isSignedIn()) return false;
  try {
    const res = await fetch(`${BASE}/functions/v1/notify`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ ...payload, exclude: state.endpoint || undefined }),
    });
    if (!res.ok) console.warn('notify', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (err) {
    console.warn('notify', err);
    return false;
  }
}

export function statusLabel() {
  if (!state.supported) return 'Non prises en charge par ce navigateur.';
  if (state.permission === 'denied') return 'Bloquées dans les réglages du navigateur.';
  if (state.subscribed) return 'Actives sur ce téléphone, même application fermée.';
  return 'Inactives sur ce téléphone.';
}
