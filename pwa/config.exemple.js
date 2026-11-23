// Copie ce fichier en `config.js` (ignoré par git) et remplis-le.
// Ces trois valeurs sont PUBLIQUES par conception : elles peuvent être vues dans le
// navigateur sans risque. Aucune clé secrète ici : la clé d'API Anthropic, la clé de
// chiffrement et la clé de service Supabase restent dans les secrets des Edge Functions.
//
// Sans config.js (ou avec supabaseUrl vide), l'application démarre en mode Exemple.
window.ALTER_CONFIG = {
  // Tableau de bord Supabase → Project Settings → API
  supabaseUrl: "",          // ex. "https://abcdefghijklm.supabase.co"
  supabaseCleAnon: "",      // clé « anon » (publique), PAS la clé service_role
  // Sortie de scripts/generer-secrets.mjs (clé publique VAPID)
  vapidPublique: "",
  // Langue de la dictée et de la lecture
  langue: "fr-FR",
};
