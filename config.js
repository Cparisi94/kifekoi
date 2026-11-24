/* ============================================================
   CONFIGURATION — Kifékoi
   ------------------------------------------------------------
   Laissez vide pour un usage 100 % local (chaque téléphone
   garde ses propres données).

   Pour partager les données entre les 2 téléphones :
   1. Créez un projet gratuit sur https://supabase.com
   2. Ouvrez SQL Editor et exécutez le script
      supabase/schema.sql (fourni dans ce dossier)
   3. Bouton vert "Connect" (ou Project Settings > API Keys), copiez :
        - "Project URL"                  -> supabaseUrl
        - "Publishable key" (sb_publishable_...)
          ou l'ancienne cle "anon" (eyJ...) -> supabaseAnonKey
   4. Collez-les ci-dessous, puis rechargez l'application.

   Guide détaillé : GUIDE-INSTALLATION.md
   ============================================================ */

window.AGENDA_CONFIG = {
  supabaseUrl: 'https://plasjpqyefrxatpkzoul.supabase.co',
  supabaseAnonKey: 'sb_publishable_dRdec0LolXep2lwTFVi5PA_DnVbWzhJ',
  // Clé publique VAPID (notifications push). La clé privée reste dans
  // Supabase > Edge Functions > Secrets, sous le nom VAPID_PRIVATE_KEY.
  vapidPublicKey: 'BGnJOJR6nsqAQtLOxN-qja3QEnQgNhKHN8suZ_b5FmKMNxUkCEIQuiynakaa6VN65z_mWIvzdNFnop4XqCs7lQI',
};
