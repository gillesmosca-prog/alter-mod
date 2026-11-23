#!/usr/bin/env node
// Génère, sur TON ordinateur, les secrets d'Alter : clé de chiffrement des données,
// secret du déclencheur du lundi et paire de clés VAPID pour les notifications.
// Rien n'est envoyé nulle part. Le résultat s'affiche une seule fois :
// copie-le dans `supabase secrets set …` puis efface l'historique du terminal si besoin.
//
// Utilisation : node scripts/generer-secrets.mjs   (Node 20 ou plus récent)

import { webcrypto as c } from "node:crypto";

const b64 = (o) => Buffer.from(o).toString("base64");
const b64url = (o) => Buffer.from(o).toString("base64url");

const cleDonnees = b64(c.getRandomValues(new Uint8Array(32)));
const secretCron = b64url(c.getRandomValues(new Uint8Array(32)));

const paire = await c.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publiqueBrute = new Uint8Array(await c.subtle.exportKey("raw", paire.publicKey));
const priveeJwk = await c.subtle.exportKey("jwk", paire.privateKey);

console.log(`
# 1. Secrets des Edge Functions (ne JAMAIS les mettre dans le dépôt) :
supabase secrets set ALTER_DATA_KEY='${cleDonnees}'
supabase secrets set ALTER_CRON_SECRET='${secretCron}'
supabase secrets set ALTER_VAPID_PUBLIC='${b64url(publiqueBrute)}'
supabase secrets set ALTER_VAPID_PRIVATE='${JSON.stringify(priveeJwk)}'

# 2. Dans le SQL Editor de Supabase (coffre de la base, pour le déclencheur du lundi) :
select vault.create_secret('${secretCron}', 'alter_cron_secret');

# 3. Dans pwa/config.js (valeur PUBLIQUE, sans risque côté navigateur) :
vapidPublique: '${b64url(publiqueBrute)}',

# Garde une copie hors ligne de ALTER_DATA_KEY : sans elle, les données chiffrées sont perdues.
`);
