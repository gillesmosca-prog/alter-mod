// Edge Function « alter-revue » : appelée par pg_cron le lundi (voir la migration cron).
// Déployer avec --no-verify-jwt : l'appel est authentifié par le secret ALTER_CRON_SECRET,
// transmis dans l'en-tête x-alter-cron depuis le coffre (Vault) de la base.
//
// Elle vérifie qu'il est bien 7 h 40 (±10 min) le lundi à Genève, prépare la revue,
// la chiffre, l'inscrit au journal et envoie une notification SANS contenu.

import { clientService } from "../_shared/auth.ts";
import { preparerRevue } from "../_shared/claude.ts";
import { chiffrer } from "../_shared/crypto.ts";
import { ajouterJournal, instantanePortefeuille, lireJournal, lireProjets } from "../_shared/qg.ts";
import { envoyerPushVide } from "../_shared/webpush.ts";

function egal(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function heureGeneve(maintenant: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Zurich", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(maintenant).map((p) => [p.type, p.value]),
  );
  return { jour: parts.weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function semaineIso(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - jour);
  const debut = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const n = Math.ceil(((date.getTime() - debut.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(n).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("ALTER_CRON_SECRET") ?? "";
  if (!secret || !egal(req.headers.get("x-alter-cron") ?? "", secret)) {
    return new Response("Interdit", { status: 403 });
  }

  const maintenant = new Date();
  const forcer = new URL(req.url).searchParams.get("forcer") === "1"; // pour un test manuel
  const { jour, minutes } = heureGeneve(maintenant);
  if (!forcer && !(jour === "Mon" && Math.abs(minutes - (7 * 60 + 40)) <= 10)) {
    return Response.json({ ignore: "hors créneau (autre fuseau de l'heure d'été)" });
  }

  const owner = Deno.env.get("ALTER_OWNER_ID");
  if (!owner) return new Response("ALTER_OWNER_ID absent", { status: 500 });
  const db = clientService();
  const semaine = semaineIso(maintenant);

  const { data: deja } = await db.from("alter_revues").select("id").eq("owner", owner).eq("semaine", semaine).maybeSingle();
  if (deja && !forcer) return Response.json({ ignore: "revue déjà préparée cette semaine" });

  try {
    const [projets, journal] = await Promise.all([lireProjets(db, owner), lireJournal(db, owner, 40)]);
    const texte = await preparerRevue(instantanePortefeuille(projets, journal));

    const id = crypto.randomUUID();
    const c = await chiffrer(texte, `revue:${owner}:${id}`);
    const { error } = await db.from("alter_revues")
      .upsert({ id, owner, semaine, lue: false, ...c }, { onConflict: "owner,semaine" });
    if (error) throw error;
    await ajouterJournal(db, owner, { genre: "revue", texte: `Revue de la semaine ${semaine} préparée.`, projet: "", source: "alter" });

    const { data: abonnements } = await db.from("alter_abonnements_push").select("id, endpoint").eq("owner", owner);
    let envoyees = 0;
    for (const a of abonnements ?? []) {
      try {
        const statut = await envoyerPushVide(a.endpoint);
        if (statut === 404 || statut === 410) await db.from("alter_abonnements_push").delete().eq("id", a.id);
        else if (statut < 300) envoyees++;
      } catch (err) {
        console.error("push", err);
      }
    }
    return Response.json({ ok: true, semaine, notifications: envoyees });
  } catch (err) {
    console.error("revue", err);
    return new Response("Échec de la revue", { status: 500 });
  }
});
