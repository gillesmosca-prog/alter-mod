// Notifications Web Push SANS contenu (norme RFC 8030 + identification VAPID, RFC 8292).
//
// Le message envoyé à Apple, Google ou Mozilla est vide : le service worker affiche
// un texte générique (« Ta revue du lundi est prête »). Aucune donnée du portefeuille
// ne transite donc par les serveurs de notification.
//
// Secrets requis (générés par scripts/generer-vapid.mjs) :
//   ALTER_VAPID_PUBLIC   clé publique, base64url, 65 octets non compressés
//   ALTER_VAPID_PRIVATE  clé privée au format JWK (JSON)
//   ALTER_VAPID_SUBJECT  adresse de contact « mailto:… » ou « https://… » exigée par la norme

function b64url(octets: Uint8Array): string {
  let s = "";
  for (const b of octets) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function jetonVapid(audience: string): Promise<string> {
  const jwk = JSON.parse(Deno.env.get("ALTER_VAPID_PRIVATE") ?? "null");
  const sujet = Deno.env.get("ALTER_VAPID_SUBJECT");
  if (!jwk || !sujet) throw new Error("Secrets VAPID absents.");
  const cle = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const entete = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const charge = b64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: sujet,
  })));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cle, enc.encode(`${entete}.${charge}`));
  return `${entete}.${charge}.${b64url(new Uint8Array(signature))}`;
}

/** Renvoie le code HTTP du service de notification (201 = accepté, 404/410 = abonnement mort). */
export async function envoyerPushVide(endpoint: string): Promise<number> {
  const publique = Deno.env.get("ALTER_VAPID_PUBLIC");
  if (!publique) throw new Error("Secret ALTER_VAPID_PUBLIC absent.");
  const jwt = await jetonVapid(new URL(endpoint).origin);
  const reponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publique}`,
      TTL: String(6 * 3600),
      Urgency: "high",
      "Content-Length": "0",
    },
  });
  await reponse.body?.cancel();
  return reponse.status;
}
