// Edge Function « alter » : seul point d'entrée de la PWA.
//
//   GET  /alter/etat                 portefeuille, journal, blocs en attente, dernière revue, fil
//   POST /alter/chat                 { texte } → flux SSE (texte, recherche, proposition, fin, erreur)
//   POST /alter/propositions/:id     { decision: "valider" | "rejeter", modifications? }
//   POST /alter/revues/:id/lue
//   POST /alter/push/abonner         { endpoint }
//   POST /alter/push/desabonner      { endpoint }
//
// Déployer avec la vérification JWT de Supabase active (comportement par défaut).

import { clientService, entetesCors, ErreurHttp, proprietaire } from "../_shared/auth.ts";
import { converser, systeme } from "../_shared/claude.ts";
import {
  ajouterMessage, deciderProposition, enregistrerProposition, instantanePortefeuille,
  lireDerniereRevue, lireJournal, lireMessages, lireProjets, lirePropositions,
} from "../_shared/qg.ts";

const TAILLE_MAX_MESSAGE = 8000;

function json(req: Request, corps: unknown, statut = 200) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...entetesCors(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function corpsJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const c = await req.json();
    return c && typeof c === "object" ? c : {};
  } catch {
    throw new ErreurHttp(400, "Corps JSON invalide.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: entetesCors(req) });

  try {
    const owner = await proprietaire(req);
    const db = clientService();
    const chemin = new URL(req.url).pathname.replace(/^.*?\/alter\/?/, "").replace(/\/+$/, "");
    const morceaux = chemin.split("/").filter(Boolean);

    // ---- État complet pour l'écran d'accueil
    if (req.method === "GET" && chemin === "etat") {
      const [projets, journal, propositions, revue, messages] = await Promise.all([
        lireProjets(db, owner), lireJournal(db, owner, 50), lirePropositions(db, owner),
        lireDerniereRevue(db, owner), lireMessages(db, owner, 40),
      ]);
      return json(req, { projets, journal, propositions, revue, messages });
    }

    // ---- Conversation avec Alter (flux SSE)
    if (req.method === "POST" && chemin === "chat") {
      const { texte } = await corpsJson(req);
      if (typeof texte !== "string" || !texte.trim()) throw new ErreurHttp(400, "Message vide.");
      if (texte.length > TAILLE_MAX_MESSAGE) throw new ErreurHttp(413, "Message trop long.");

      const [projets, journal, historique] = await Promise.all([
        lireProjets(db, owner), lireJournal(db, owner, 20), lireMessages(db, owner, 40),
      ]);
      await ajouterMessage(db, owner, "user", texte.trim());

      const encodeur = new TextEncoder();
      const flux = new ReadableStream({
        async start(ctrl) {
          const envoyer = (evenement: string, donnees: unknown) =>
            ctrl.enqueue(encodeur.encode(`event: ${evenement}\ndata: ${JSON.stringify(donnees)}\n\n`));
          try {
            const { texte: reponse, arret } = await converser(
              systeme(instantanePortefeuille(projets, journal)),
              [...historique.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: texte.trim() }],
              {
                texte: (delta) => envoyer("texte", { delta }),
                recherche: (requete) => envoyer("recherche", { requete }),
                proposition: async (entree) => {
                  try {
                    const p = await enregistrerProposition(db, owner, entree, projets);
                    envoyer("proposition", p);
                    return { contenu: "Bloc présenté à Gilles, en attente de sa validation.", erreur: false };
                  } catch (err) {
                    return { contenu: `Proposition refusée par l'application : ${(err as Error).message}`, erreur: true };
                  }
                },
              },
            );
            if (arret === "refusal") {
              envoyer("erreur", { message: "Alter n'a pas pu répondre à cette demande. Reformule-la." });
            }
            if (reponse) await ajouterMessage(db, owner, "assistant", reponse);
            envoyer("fin", {});
          } catch (err) {
            console.error("chat", err);
            envoyer("erreur", { message: "Le serveur n'a pas pu joindre Claude. Réessaie dans un instant." });
          } finally {
            ctrl.close();
          }
        },
      });
      return new Response(flux, {
        headers: {
          ...entetesCors(req),
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ---- Validation d'un bloc QG
    if (req.method === "POST" && morceaux[0] === "propositions" && morceaux[1]) {
      const { decision, modifications } = await corpsJson(req);
      if (decision !== "valider" && decision !== "rejeter") throw new ErreurHttp(400, "Décision inconnue.");
      return json(req, await deciderProposition(db, owner, morceaux[1], decision, modifications));
    }

    // ---- Revue marquée comme lue
    if (req.method === "POST" && morceaux[0] === "revues" && morceaux[1] && morceaux[2] === "lue") {
      const { error } = await db.from("alter_revues").update({ lue: true }).eq("owner", owner).eq("id", morceaux[1]);
      if (error) throw error;
      return json(req, { ok: true });
    }

    // ---- Notifications
    if (req.method === "POST" && morceaux[0] === "push") {
      const { endpoint } = await corpsJson(req);
      if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) throw new ErreurHttp(400, "Abonnement invalide.");
      if (morceaux[1] === "abonner") {
        const { error } = await db.from("alter_abonnements_push").upsert({ owner, endpoint }, { onConflict: "endpoint" });
        if (error) throw error;
        return json(req, { ok: true });
      }
      if (morceaux[1] === "desabonner") {
        const { error } = await db.from("alter_abonnements_push").delete().eq("owner", owner).eq("endpoint", endpoint);
        if (error) throw error;
        return json(req, { ok: true });
      }
    }

    throw new ErreurHttp(404, "Route inconnue.");
  } catch (err) {
    if (err instanceof ErreurHttp) return json(req, { erreur: err.message }, err.statut);
    console.error("alter", err);
    return json(req, { erreur: "Erreur interne." }, 500);
  }
});
