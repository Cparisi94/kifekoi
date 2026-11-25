/* Pont natif Kifékoï.
   - Dans un navigateur (PWA) : inactif, aucune erreur.
   - Dans l'APK Android (Capacitor, y compris en mode « coquille » qui
     charge le site à distance) : utilise le module natif LocalNotifications
     exposé par Capacitor. Aucun bundler nécessaire. */

(function () {
  var CHANNEL = 'kifekoi';

  /* Capacitor est injecté par la coque Android : on le lit à chaque appel
     (et non une seule fois), car l'injection peut arriver après le chargement. */
  function cap() {
    return typeof window !== 'undefined' ? window.Capacitor : null;
  }

  function plugin() {
    var c = cap();
    return c && c.Plugins ? c.Plugins.LocalNotifications : null;
  }

  function isNativeNow() {
    var c = cap();
    if (!c) return false;
    if (typeof c.isNativePlatform === 'function') return Boolean(c.isNativePlatform());
    return Boolean(c.isNative);
  }

  function idFor(key) {
    var h = 0;
    var s = String(key);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2000000000) + 1;
  }

  async function ensureChannel() {
    var ln = plugin();
    if (!ln) return;
    try {
      await ln.createChannel({
        id: CHANNEL,
        name: 'Rappels Kifékoï',
        description: 'Rappels des événements et des suivis',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
    } catch (err) {
      /* canal déjà créé */
    }
  }

  async function scheduleAt(id, title, body, when) {
    var ln = plugin();
    if (!ln) return false;
    await ensureChannel();
    await ln.schedule({
      notifications: [{
        id: id,
        title: title,
        body: body,
        channelId: CHANNEL,
        schedule: { at: when },
      }],
    });
    return true;
  }

  window.KIFEKOI_NATIVE = {
    idFor: idFor,

    get isNative() {
      return isNativeNow();
    },

    async init() {
      await ensureChannel();
    },

    async ensurePermission() {
      var ln = plugin();
      if (!ln) return false;
      try {
        var current = await ln.checkPermissions();
        if (current && current.display === 'granted') return true;
        var res = await ln.requestPermissions();
        return Boolean(res && res.display === 'granted');
      } catch (err) {
        return false;
      }
    },

    async cancelAll() {
      var ln = plugin();
      if (!ln) return;
      try {
        var pending = await ln.getPending();
        var list = (pending && pending.notifications) || [];
        if (list.length) {
          await ln.cancel({ notifications: list.map(function (n) { return { id: n.id }; }) });
        }
      } catch (err) {
        /* rien à annuler */
      }
    },

    async schedule(items) {
      var ln = plugin();
      if (!ln) return 0;
      await this.cancelAll();
      var list = Array.isArray(items) ? items : [];
      if (!list.length) return 0;
      await ensureChannel();
      await ln.schedule({
        notifications: list.map(function (n) {
          var o = {};
          for (var k in n) o[k] = n[k];
          o.channelId = CHANNEL;
          return o;
        }),
      });
      return list.length;
    },

    async test() {
      return scheduleAt(999999, 'Kifékoï', 'Notification de test 🎉', new Date(Date.now() + 4000));
    },

    async notify(title, body, delayMs) {
      var ln = plugin();
      if (!ln) return false;
      await ensureChannel();
      await ln.schedule({
        notifications: [{
          id: 800000 + Math.floor(Math.random() * 99999),
          title: String(title || 'Kifékoi'),
          body: String(body || ''),
          channelId: CHANNEL,
          schedule: { at: new Date(Date.now() + (Number(delayMs) || 1500)) },
        }],
      });
      return true;
    },

    /* Test différé : on ferme l'app, la notification doit arriver. */
    async testIn(seconds) {
      var s = Math.max(5, Number(seconds) || 20);
      return scheduleAt(999998, 'Kifékoï', 'Test dans ' + s + ' s (app fermée) ✅', new Date(Date.now() + s * 1000));
    },

    async diag() {
      var c = cap();
      var ln = plugin();
      var out = {
        hasCapacitor: Boolean(c),
        platform: c && typeof c.getPlatform === 'function' ? c.getPlatform() : null,
        isNative: isNativeNow(),
        hasPlugin: Boolean(ln),
        permission: null,
        exact: null,
        pending: null,
      };
      if (ln) {
        try {
          var perm = await ln.checkPermissions();
          out.permission = perm && perm.display;
        } catch (err) { /* ignore */ }
        try {
          if (typeof ln.checkExactNotificationSetting === 'function') {
            var ex = await ln.checkExactNotificationSetting();
            out.exact = ex && (ex.exact_alarm === 'granted' || ex.exact_alarm === true);
          }
        } catch (err) { /* ignore */ }
        try {
          var pend = await ln.getPending();
          out.pending = ((pend && pend.notifications) || []).length;
        } catch (err) { /* ignore */ }
      }
      return out;
    },

    async askExact() {
      var ln = plugin();
      if (ln && typeof ln.changeExactNotificationSetting === 'function') {
        try { await ln.changeExactNotificationSetting(); } catch (err) { /* ignore */ }
      }
    },
  };
})();
