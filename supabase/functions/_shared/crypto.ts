// Chiffrement applicatif des données d'Alter (AES-256-GCM, WebCrypto).
//
// La clé vient du secret ALTER_DATA_KEY (32 octets encodés en base64), défini avec
// `supabase secrets set`. Elle n'est jamais en base ni dans le code.
// Chaque valeur est liée à son emplacement (table + identifiant) par les
// « données additionnelles authentifiées » : une valeur chiffrée copiée dans une
// autre ligne ne se déchiffre pas.

const VERSION = "v1";
let cleCache: CryptoKey | null = null;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function deB64(texte: string): Uint8Array {
  const bin = atob(texte);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function cle(): Promise<CryptoKey> {
  if (cleCache) return cleCache;
  const brute = Deno.env.get("ALTER_DATA_KEY");
  if (!brute) throw new Error("Secret ALTER_DATA_KEY absent.");
  const octets = deB64(brute);
  if (octets.length !== 32) throw new Error("ALTER_DATA_KEY doit faire 32 octets (base64).");
  cleCache = await crypto.subtle.importKey("raw", octets, "AES-GCM", false, ["encrypt", "decrypt"]);
  return cleCache;
}

export interface Chiffre {
  iv: string;
  donnees: string;
}

export async function chiffrer(valeur: unknown, contexte: string): Promise<Chiffre> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clair = new TextEncoder().encode(JSON.stringify(valeur));
  const ad = new TextEncoder().encode(`${VERSION}|${contexte}`);
  const sortie = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ad }, await cle(), clair);
  return { iv: `${VERSION}:${b64(iv)}`, donnees: b64(new Uint8Array(sortie)) };
}

export async function dechiffrer<T = unknown>(c: Chiffre, contexte: string): Promise<T> {
  const [version, ivB64] = c.iv.split(":");
  if (version !== VERSION) throw new Error(`Version de chiffrement inconnue : ${version}`);
  const ad = new TextEncoder().encode(`${version}|${contexte}`);
  const clair = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: deB64(ivB64), additionalData: ad },
    await cle(),
    deB64(c.donnees),
  );
  return JSON.parse(new TextDecoder().decode(clair)) as T;
}
