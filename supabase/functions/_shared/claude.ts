// Appels à Claude (API Anthropic). La clé vient du secret ANTHROPIC_API_KEY,
// lu par le SDK dans l'environnement de la fonction : elle n'est jamais dans le code
// ni envoyée au navigateur.

import Anthropic from "npm:@anthropic-ai/sdk@1.6.0";
import { PROMPT_ALTER } from "./prompt.ts";
import { CONSIGNES_PWA, CONSIGNES_REVUE } from "./consignes-pwa.ts";
import { DOMAINES, EXPERTS, GENRES_JOURNAL, STATUTS } from "./qg.ts";

export const MODELE = Deno.env.get("ALTER_MODELE") ?? "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic(); // lit ANTHROPIC_API_KEY
  return client;
}

export const OUTIL_PROPOSER = {
  name: "proposer_maj_qg",
  description:
    "Propose à Gilles une mise à jour du QG, qu'il validera ou rejettera d'un clic. " +
    "genre = maj_projet (modifier une fiche existante : code + champs modifiés seulement), " +
    "nouveau_projet (champs.nom obligatoire, domaine si connu) ou journal (journal.genre + journal.texte, journal.projet si lié). " +
    "N'y mets que ce que Gilles a dit ou validé. motif : une phrase qui explique la proposition.",
  eager_input_streaming: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["genre", "motif"],
    properties: {
      genre: { type: "string", enum: ["maj_projet", "nouveau_projet", "journal"] },
      code: { type: "string", description: "Code du projet (ex. P07) pour maj_projet." },
      champs: {
        type: "object",
        additionalProperties: false,
        properties: {
          nom: { type: "string" },
          domaine: { type: "string", enum: [...DOMAINES] },
          statut: { type: "string", enum: [...STATUTS] },
          resume: { type: "string" },
          prochaine_action: { type: "string" },
          echeance: { type: "string", description: "AAAA-MM-JJ, ou vide pour l'effacer." },
          experts: { type: "array", items: { type: "string", enum: [...EXPERTS] } },
          confidentiel: { type: "boolean" },
        },
      },
      journal: {
        type: "object",
        additionalProperties: false,
        required: ["genre", "texte"],
        properties: {
          genre: { type: "string", enum: [...GENRES_JOURNAL] },
          texte: { type: "string" },
          projet: { type: "string" },
        },
      },
      motif: { type: "string" },
    },
  },
} as const;

export const OUTIL_RECHERCHE = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: Number(Deno.env.get("ALTER_RECHERCHES_MAX") ?? "5"),
  user_location: { type: "approximate", city: "Genève", country: "CH", timezone: "Europe/Zurich" },
} as const;

/** Prompt figé (mis en cache) puis état du QG (mis en cache tant qu'il ne change pas). */
export function systeme(instantane: string, revue = false) {
  return [
    { type: "text", text: `${PROMPT_ALTER}\n\n${revue ? CONSIGNES_REVUE : CONSIGNES_PWA}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: instantane, cache_control: { type: "ephemeral" } },
  ];
}

export interface Rappels {
  texte(delta: string): void;
  recherche(requete: string): void;
  /** Appelé pour chaque proposition ; renvoie le texte du tool_result. */
  proposition(entree: unknown): Promise<{ contenu: string; erreur: boolean }>;
}

/**
 * Boucle d'échange : diffuse le texte au fil de l'eau, laisse la recherche web
 * se faire côté Anthropic et traite chaque appel à proposer_maj_qg.
 * Renvoie le texte complet de la réponse d'Alter.
 */
export async function converser(
  // deno-lint-ignore no-explicit-any
  system: any[], historique: Array<{ role: "user" | "assistant"; content: string }>, rappels: Rappels,
): Promise<{ texte: string; arret: string }> {
  // deno-lint-ignore no-explicit-any
  const messages: any[] = historique.map((m) => ({ role: m.role, content: m.content }));
  let texteComplet = "";
  let arret = "";

  for (let tour = 0; tour < 8; tour++) {
    const flux = claude().beta.messages.stream({
      model: MODELE,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: (Deno.env.get("ALTER_EFFORT") ?? "medium") as "medium" },
      system,
      tools: [OUTIL_RECHERCHE, OUTIL_PROPOSER],
      messages,
      // deno-lint-ignore no-explicit-any
    } as any);

    flux.on("text", (delta: string) => {
      texteComplet += delta;
      rappels.texte(delta);
    });
    // deno-lint-ignore no-explicit-any
    flux.on("contentBlock", (bloc: any) => {
      if (bloc.type === "server_tool_use" && bloc.name === "web_search") {
        rappels.recherche(String(bloc.input?.query ?? ""));
      }
    });

    const reponse = await flux.finalMessage();
    arret = reponse.stop_reason ?? "";

    if (arret === "refusal") break;
    if (arret === "pause_turn") {
      messages.push({ role: "assistant", content: reponse.content });
      continue;
    }
    if (arret !== "tool_use") break;

    // Appels à proposer_maj_qg : on valide l'entrée nous-mêmes (elle vient du modèle).
    // deno-lint-ignore no-explicit-any
    const appels = reponse.content.filter((b: any) => b.type === "tool_use" && b.name === OUTIL_PROPOSER.name);
    if (!appels.length) break;
    const resultats = [];
    // deno-lint-ignore no-explicit-any
    for (const appel of appels as any[]) {
      const r = await rappels.proposition(appel.input);
      resultats.push({ type: "tool_result", tool_use_id: appel.id, content: r.contenu, is_error: r.erreur });
    }
    messages.push({ role: "assistant", content: reponse.content });
    messages.push({ role: "user", content: resultats });
    if (texteComplet && !texteComplet.endsWith("\n")) {
      texteComplet += "\n\n";
      rappels.texte("\n\n");
    }
  }
  return { texte: texteComplet.trim(), arret };
}

/** Revue hebdomadaire : un seul appel, sans outil, effort élevé. */
export async function preparerRevue(instantane: string): Promise<string> {
  const flux = claude().beta.messages.stream({
    model: MODELE,
    max_tokens: 16000,
    betas: BETAS,
    fallbacks: "default",
    output_config: { effort: "high" },
    system: systeme(instantane, true),
    messages: [{ role: "user", content: "Prépare la revue de cette semaine." }],
    // deno-lint-ignore no-explicit-any
  } as any);
  const reponse = await flux.finalMessage();
  if (reponse.stop_reason === "refusal") throw new Error("Revue refusée par le modèle.");
  // deno-lint-ignore no-explicit-any
  return reponse.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
}
