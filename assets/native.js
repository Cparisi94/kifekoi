/* Pont natif Kifékoï.
   - Dans un navigateur (PWA) : inactif, aucune erreur.
   - Dans l'APK Android (Capacitor, y compris en mode « coquille » qui
     charge le site à distance) : utilise le module natif LocalNotifications
     exposé par Capacitor. Aucun bundler nécessaire. */

(function () {
  var CHANNEL = 'kifekoi';

  var Cap = typeof window !== 'undefined' ? window.Capacitor : null;
  var LN = Cap && Cap.Plugins ? Cap.Plugins.LocalNotifications : null;
  var isNative = Boolean(
    Cap && (typeof Cap.isNativePlatform === 'function' ? Cap.isNativePlatform() : Cap.isNative)
  );

  function idFor(key) {
    var h = 0;
    var s = String(key);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 2000000000) + 1;
  }

  async function ensureChannel() {
    if (!LN) return;
    try {
      await LN.createChannel({
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

  window.KIFEKOI_NATIVE = {
    isNative: isNative,
    idFor: idFor,

    async init() {
      await ensureChannel();
    },

    async ensurePermission() {
      if (!LN) return false;
      try {
        var current = await LN.checkPermissions();
        if (current && current.display === 'granted') return true;
        var res = await LN.requestPermissions();
        return Boolean(res && res.display === 'granted');
      } catch (err) {
        return false;
      }
    },

    async cancelAll() {
      if (!LN) return;
      try {
        var pending = await LN.getPending();
        var list = (pending && pending.notifications) || [];
        if (list.length) {
          await LN.cancel({ notifications: list.map(function (n) { return { id: n.id }; }) });
        }
      } catch (err) {
        /* rien à annuler */
      }
    },

    async schedule(items) {
      if (!LN) return 0;
      await this.cancelAll();
      var list = Array.isArray(items) ? items : [];
      if (!list.length) return 0;
      await ensureChannel();
      await LN.schedule({
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
      if (!LN) return;
      await ensureChannel();
      await LN.schedule({
        notifications: [{
          id: 999999,
          title: 'Kifékoï',
          body: 'Notification de test 🎉',
          channelId: CHANNEL,
          schedule: { at: new Date(Date.now() + 4000) },
        }],
      });
    },
  };
})();
