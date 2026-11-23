// Contrôle d'accès des Edge Functions.
//
// Trois verrous successifs :
//  1. jeton de session Supabase valide (vérifié auprès du serveur d'authentification) ;
//  2. l'utilisateur est le propriétaire déclaré (secret ALTER_OWNER_ID) ;
//  3. la session a passé le second facteur (niveau « aal2 », code TOTP).

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

export class ErreurHttp extends Error {
  constructor(public statut: number, message: string) {
    super(message);
  }
}

export function clientService(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const cle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !cle) throw new Error("Variables Supabase absentes de l'environnement de la fonction.");
  return createClient(url, cle, { auth: { persistSession: false, autoRefreshToken: false } });
}

function lireRevendications(jeton: string): Record<string, unknown> {
  const partie = jeton.split(".")[1] ?? "";
  const json = atob(partie.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json);
}

export async function proprietaire(req: Request): Promise<string> {
  const entete = req.headers.get("Authorization") ?? "";
  const jeton = entete.startsWith("Bearer ") ? entete.slice(7) : "";
  if (!jeton) throw new ErreurHttp(401, "Connexion requise.");

  const { data, error } = await clientService().auth.getUser(jeton);
  if (error || !data.user) throw new ErreurHttp(401, "Session expirée. Reconnecte-toi.");

  const attendu = Deno.env.get("ALTER_OWNER_ID");
  if (!attendu || data.user.id !== attendu) throw new ErreurHttp(403, "Accès réservé au propriétaire.");

  // Le jeton vient d'être validé par le serveur : on peut lire son niveau d'assurance.
  if (lireRevendications(jeton).aal !== "aal2") {
    throw new ErreurHttp(403, "Second facteur requis (code de ton application d'authentification).");
  }
  return data.user.id;
}

export function entetesCors(req: Request): Record<string, string> {
  const autorisees = (Deno.env.get("ALTER_ORIGINES") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origine = req.headers.get("Origin") ?? "";
  const entetes: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
  if (autorisees.includes(origine)) entetes["Access-Control-Allow-Origin"] = origine;
  return entetes;
}
