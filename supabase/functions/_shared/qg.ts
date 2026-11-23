// Le QG côté serveur : portefeuille, journal, fil et blocs à valider.
// Toutes les lectures déchiffrent, toutes les écritures chiffrent.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { chiffrer, dechiffrer } from "./crypto.ts";
import { ErreurHttp } from "./auth.ts";

export const DOMAINES = ["A", "B", "C", "D", "E", "F", "Z"] as const;
export const STATUTS = ["en cours", "à décider", "en attente", "bloqué", "en veille", "livré", ""] as const;
export const GENRES_JOURNAL = ["decision", "tache", "idee", "note", "revue"] as const;
export const EXPERTS = [
  "victor", "helene", "marc", "ines", "paul", "claire", "thomas", "nadia", "keller",
  "sophie", "lea", "hugo", "samir", "julien", "chloe", "emma", "arthur", "cassandre",
] as const;
const CHAMPS_TEXTE = ["nom", "resume", "prochaine_action"] as const;

export interface Projet {
  code: string;
  version: number;
  maj: string;
  nom: string;
  domaine: string;
  statut: string;
  resume: string;
  prochaine_action: string;
  echeance: string;
  experts: string[];
  confidentiel: boolean;
  info_du: string;
  source: string;
}
export type ChampsProjet = Partial<Pick<Projet,
  "nom" | "domaine" | "statut" | "resume" | "prochaine_action" | "echeance" | "experts" | "confidentiel">>;

export interface EntreeJournal {
  id: string;
  date: string;
  genre: string;
  texte: string;
  projet: string;
  source: string;
}

export interface Proposition {
  id: string;
  cree_le: string;
  genre: "maj_projet" | "nouveau_projet" | "journal";
  code?: string;
  champs?: ChampsProjet;
  journal?: { genre: string; texte: string; projet?: string };
  motif: string;
  version_lue?: number;
  avant?: ChampsProjet; // état de la fiche au moment de la proposition, pour l'affichage de l'écart
}

export function aujourdhuiGeneve(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
}

// ---------- Lecture ----------

export async function lireProjets(db: SupabaseClient, owner: string): Promise<Projet[]> {
  const { data, error } = await db.from("alter_projets").select("code, version, maj, iv, donnees").eq("owner", owner);
  if (error) throw error;
  const projets = await Promise.all((data ?? []).map(async (l) => ({
    ...(await dechiffrer<Omit<Projet, "code" | "version" | "maj">>(l, `projet:${owner}:${l.code}`)),
    code: l.code, version: l.version, maj: l.maj,
  })));
  return projets.sort((a, b) => Number(a.code.slice(1)) - Number(b.code.slice(1)));
}

export async function lireJournal(db: SupabaseClient, owner: string, limite = 30): Promise<EntreeJournal[]> {
  const { data, error } = await db.from("alter_journal").select("id, cree_le, iv, donnees")
    .eq("owner", owner).order("cree_le", { ascending: false }).limit(limite);
  if (error) throw error;
  return Promise.all((data ?? []).map(async (l) => ({
    ...(await dechiffrer<Omit<EntreeJournal, "id" | "date">>(l, `journal:${owner}:${l.id}`)),
    id: l.id, date: l.cree_le,
  })));
}

export async function lireMessages(db: SupabaseClient, owner: string, limite = 40) {
  const { data, error } = await db.from("alter_messages").select("id, cree_le, role, iv, donnees")
    .eq("owner", owner).order("cree_le", { ascending: false }).limit(limite);
  if (error) throw error;
  const messages = await Promise.all((data ?? []).map(async (l) => ({
    id: l.id, role: l.role as "user" | "assistant", at: l.cree_le,
    content: await dechiffrer<string>(l, `message:${owner}:${l.id}`),
  })));
  return messages.reverse();
}

export async function lirePropositions(db: SupabaseClient, owner: string): Promise<Proposition[]> {
  const { data, error } = await db.from("alter_propositions").select("id, cree_le, iv, donnees")
    .eq("owner", owner).eq("statut", "en_attente").order("cree_le", { ascending: true });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (l) => ({
    ...(await dechiffrer<Omit<Proposition, "id" | "cree_le">>(l, `proposition:${owner}:${l.id}`)),
    id: l.id, cree_le: l.cree_le,
  })));
}

export async function lireDerniereRevue(db: SupabaseClient, owner: string) {
  const { data, error } = await db.from("alter_revues").select("id, cree_le, semaine, lue, iv, donnees")
    .eq("owner", owner).order("cree_le", { ascending: false }).limit(1);
  if (error) throw error;
  const l = data?.[0];
  if (!l) return null;
  return { id: l.id, cree_le: l.cree_le, semaine: l.semaine, lue: l.lue,
    texte: await dechiffrer<string>(l, `revue:${owner}:${l.id}`) };
}

// ---------- Écriture ----------

export async function ajouterMessage(db: SupabaseClient, owner: string, role: "user" | "assistant", texte: string) {
  const id = crypto.randomUUID();
  const c = await chiffrer(texte, `message:${owner}:${id}`);
  const { error } = await db.from("alter_messages").insert({ id, owner, role, ...c });
  if (error) throw error;
}

export async function ajouterJournal(db: SupabaseClient, owner: string, e: Omit<EntreeJournal, "id" | "date">) {
  const id = crypto.randomUUID();
  const c = await chiffrer(e, `journal:${owner}:${id}`);
  const { error } = await db.from("alter_journal").insert({ id, owner, ...c });
  if (error) throw error;
  return id;
}

// ---------- Blocs QG proposés par Alter ----------

function texteCourt(v: unknown, max = 2000): string {
  if (typeof v !== "string") throw new Error("texte attendu");
  return v.trim().slice(0, max);
}

/** Valide les champs proposés (l'entrée vient du modèle : on ne lui fait pas confiance). */
export function validerChamps(brut: unknown): ChampsProjet {
  if (brut == null) return {};
  if (typeof brut !== "object" || Array.isArray(brut)) throw new Error("champs invalides");
  const c = brut as Record<string, unknown>;
  const sortie: ChampsProjet = {};
  for (const k of CHAMPS_TEXTE) if (k in c) sortie[k] = texteCourt(c[k]);
  if ("domaine" in c) {
    if (!DOMAINES.includes(c.domaine as never)) throw new Error("domaine invalide");
    sortie.domaine = c.domaine as string;
  }
  if ("statut" in c) {
    if (!STATUTS.includes(c.statut as never)) throw new Error("statut invalide");
    sortie.statut = c.statut as string;
  }
  if ("echeance" in c) {
    const e = texteCourt(c.echeance, 10);
    if (e && !/^\d{4}-\d{2}-\d{2}$/.test(e)) throw new Error("échéance au format AAAA-MM-JJ");
    sortie.echeance = e;
  }
  if ("experts" in c) {
    if (!Array.isArray(c.experts) || !c.experts.every((x) => EXPERTS.includes(x as never))) {
      throw new Error("experts invalides");
    }
    sortie.experts = [...new Set(c.experts as string[])];
  }
  if ("confidentiel" in c) {
    if (typeof c.confidentiel !== "boolean") throw new Error("confidentiel doit être vrai ou faux");
    sortie.confidentiel = c.confidentiel;
  }
  return sortie;
}

export async function enregistrerProposition(
  db: SupabaseClient, owner: string, entree: unknown, projets: Projet[],
): Promise<Proposition> {
  if (!entree || typeof entree !== "object") throw new Error("proposition vide");
  const e = entree as Record<string, unknown>;
  const genre = e.genre;
  const motif = texteCourt(e.motif ?? "", 500);
  let p: Omit<Proposition, "id" | "cree_le">;

  if (genre === "maj_projet") {
    const code = texteCourt(e.code, 6).toUpperCase();
    const projet = projets.find((x) => x.code === code);
    if (!projet) throw new Error(`projet ${code} introuvable`);
    const champs = validerChamps(e.champs);
    if (!Object.keys(champs).length) throw new Error("aucun champ à modifier");
    const avant: ChampsProjet = {};
    for (const k of Object.keys(champs) as (keyof ChampsProjet)[]) (avant as Record<string, unknown>)[k] = projet[k];
    p = { genre, code, champs, motif, version_lue: projet.version, avant };
  } else if (genre === "nouveau_projet") {
    const champs = validerChamps(e.champs);
    if (!champs.nom) throw new Error("un nouveau projet doit avoir un nom");
    p = { genre, champs: { domaine: "Z", statut: "", experts: [], confidentiel: false, ...champs }, motif };
  } else if (genre === "journal") {
    const j = (e.journal ?? {}) as Record<string, unknown>;
    if (!GENRES_JOURNAL.includes(j.genre as never)) throw new Error("genre de journal invalide");
    const projet = j.projet ? texteCourt(j.projet, 6).toUpperCase() : "";
    if (projet && !projets.some((x) => x.code === projet)) throw new Error(`projet ${projet} introuvable`);
    p = { genre, journal: { genre: j.genre as string, texte: texteCourt(j.texte), projet }, motif };
  } else {
    throw new Error("genre de proposition inconnu");
  }

  const id = crypto.randomUUID();
  const c = await chiffrer(p, `proposition:${owner}:${id}`);
  const { data, error } = await db.from("alter_propositions").insert({ id, owner, ...c }).select("cree_le").single();
  if (error) throw error;
  return { ...p, id, cree_le: data.cree_le };
}

/** Applique ou rejette un bloc. Seul chemin par lequel le QG change. */
export async function deciderProposition(
  db: SupabaseClient, owner: string, id: string, decision: "valider" | "rejeter", modifications?: unknown,
) {
  const { data, error } = await db.from("alter_propositions").select("id, cree_le, statut, iv, donnees")
    .eq("owner", owner).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErreurHttp(404, "Bloc introuvable.");
  if (data.statut !== "en_attente") throw new ErreurHttp(409, "Ce bloc a déjà été traité.");
  const p = await dechiffrer<Proposition>(data, `proposition:${owner}:${id}`);

  const marquer = async (statut: string) => {
    const { error: e } = await db.from("alter_propositions")
      .update({ statut, decide_le: new Date().toISOString() }).eq("owner", owner).eq("id", id).eq("statut", "en_attente");
    if (e) throw e;
  };

  if (decision === "rejeter") {
    await marquer("rejetee");
    return { statut: "rejetee" };
  }

  const jour = aujourdhuiGeneve();
  let retouches: ChampsProjet = {};
  try {
    retouches = validerChamps(modifications);
  } catch (err) {
    throw new ErreurHttp(400, `Modification refusée : ${(err as Error).message}`);
  }

  if (p.genre === "maj_projet" && p.code) {
    const projets = await lireProjets(db, owner);
    const actuel = projets.find((x) => x.code === p.code);
    if (!actuel) throw new ErreurHttp(404, `Le projet ${p.code} n'existe plus.`);
    if (actuel.version !== p.version_lue) {
      await marquer("perimee");
      throw new ErreurHttp(409, `La fiche ${p.code} a changé depuis la proposition. Redemande à Alter.`);
    }
    const { code, version: _v, maj: _m, ...reste } = actuel;
    const fiche = { ...reste, ...p.champs, ...retouches, info_du: jour, source: "pwa" };
    const c = await chiffrer(fiche, `projet:${owner}:${code}`);
    const { error: e } = await db.rpc("alter_maj_projet", {
      p_owner: owner, p_code: code, p_version_attendue: actuel.version, p_iv: c.iv, p_donnees: c.donnees,
    });
    if (e) {
      if (String(e.message).includes("version_conflict")) {
        await marquer("perimee");
        throw new ErreurHttp(409, `La fiche ${code} vient de changer. Redemande à Alter.`);
      }
      throw e;
    }
  } else if (p.genre === "nouveau_projet") {
    const projets = await lireProjets(db, owner);
    const max = projets.reduce((m, x) => Math.max(m, Number(x.code.slice(1)) || 0), 0);
    const code = `P${String(max + 1).padStart(2, "0")}`;
    const fiche = {
      nom: "", domaine: "Z", statut: "", resume: "", prochaine_action: "", echeance: "",
      experts: [], confidentiel: false, ...p.champs, ...retouches, info_du: jour, source: "pwa",
    };
    const c = await chiffrer(fiche, `projet:${owner}:${code}`);
    const { error: e } = await db.from("alter_projets").insert({ owner, code, ...c });
    if (e) throw e;
    await marquer("validee");
    return { statut: "validee", code };
  } else if (p.genre === "journal" && p.journal) {
    const texte = typeof (modifications as Record<string, unknown>)?.texte === "string"
      ? texteCourt((modifications as Record<string, unknown>).texte)
      : p.journal.texte;
    await ajouterJournal(db, owner, { genre: p.journal.genre, texte, projet: p.journal.projet ?? "", source: "pwa" });
  }
  await marquer("validee");
  return { statut: "validee" };
}

// ---------- Contexte transmis à Claude ----------

const NOMS_DOMAINES: Record<string, string> = {
  A: "MentorLab : offres, méthodes et marque",
  B: "Développement commercial et partenariats",
  C: "Missions clients",
  D: "Apps et produits",
  E: "Outils, IA et infrastructure",
  F: "Administration et conformité",
  Z: "À classer",
};

export function instantanePortefeuille(projets: Projet[], journal: EntreeJournal[]): string {
  const lignes: string[] = [`# État du QG au ${aujourdhuiGeneve()} (heure de Genève)`, "", "## Projets"];
  for (const d of DOMAINES) {
    const duDomaine = projets.filter((p) => p.domaine === d);
    if (!duDomaine.length) continue;
    lignes.push("", `### ${d} · ${NOMS_DOMAINES[d]}`);
    for (const p of duDomaine) {
      lignes.push(
        `- ${p.code} · ${p.nom} · statut : ${p.statut || "à confirmer"}${p.confidentiel ? " · CONFIDENTIEL" : ""}`,
        `  résumé : ${p.resume || "—"}`,
        `  prochaine action : ${p.prochaine_action || "—"} · échéance : ${p.echeance || "—"}`,
        `  experts : ${p.experts.join(", ") || "—"} · information du : ${p.info_du || "inconnue"}`,
      );
    }
  }
  lignes.push("", "## Journal récent");
  for (const j of journal.slice(0, 20)) {
    lignes.push(`- ${j.date.slice(0, 10)} · ${j.genre}${j.projet ? ` · ${j.projet}` : ""} · ${j.texte}`);
  }
  return lignes.join("\n");
}
