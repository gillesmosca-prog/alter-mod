// Import unique du QG claude.ai vers Supabase.
//
// Format attendu (fichier JSON produit à partir du QG, voir docs/pwa/IMPORT.md) :
// {
//   "format": "alter-qg-export", "version": 1, "exporte_le": "2026-11-23T08:00:00Z",
//   "projets": [ { "code": "P01", "nom": "…", "domaine": "A", "statut": "en cours", "resume": "…",
//                  "prochaine_action": "…", "echeance": "2026-12-01", "experts": ["victor"],
//                  "confidentiel": false, "info_du": "2026-11-20" } ],
//   "journal": [ { "date": "2026-11-20T09:00:00Z", "genre": "decision", "texte": "…", "projet": "P01" } ]
// }
//
// Deux temps : « apercu » (rien n'est écrit) puis « importer ». Les fiches dont le code
// existe déjà sont laissées telles quelles et signalées. Un même fichier ne s'importe
// qu'une fois (empreinte SHA-256).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { chiffrer } from "./crypto.ts";
import { ErreurHttp } from "./auth.ts";
import { DOMAINES, EXPERTS, GENRES_JOURNAL, lireProjets, STATUTS } from "./qg.ts";

const MAX_PROJETS = 500;
const MAX_JOURNAL = 5000;

interface FicheImport {
  code: string;
  nom: string; domaine: string; statut: string; resume: string; prochaine_action: string;
  echeance: string; experts: string[]; confidentiel: boolean; info_du: string; source: string;
}
interface EntreeImport { date: string; genre: string; texte: string; projet: string; source: string }

export interface Apercu {
  empreinte: string;
  deja_importe: boolean;
  projets_nouveaux: Array<{ code: string; nom: string; domaine: string; statut: string; confidentiel: boolean }>;
  projets_existants: string[];
  journal: number;
  avertissements: string[];
  rejets: string[];
}

const texte = (v: unknown, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const jour = (v: unknown) => {
  const t = texte(v, 32);
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : "";
};
const sansAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const STATUTS_NORMALISES = new Map(STATUTS.map((s) => [sansAccents(s), s]));

async function empreinteDe(brut: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(brut));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

function analyser(exportQG: unknown) {
  if (!exportQG || typeof exportQG !== "object") throw new ErreurHttp(400, "Fichier d'export illisible.");
  const e = exportQG as Record<string, unknown>;
  if (e.format !== "alter-qg-export" || e.version !== 1) {
    throw new ErreurHttp(400, "Ce fichier n'est pas un export du QG au format alter-qg-export, version 1.");
  }
  const projetsBruts = Array.isArray(e.projets) ? e.projets : [];
  const journalBrut = Array.isArray(e.journal) ? e.journal : [];
  if (projetsBruts.length > MAX_PROJETS || journalBrut.length > MAX_JOURNAL) {
    throw new ErreurHttp(413, `Export trop volumineux (au plus ${MAX_PROJETS} projets et ${MAX_JOURNAL} entrées).`);
  }

  const avertissements: string[] = [];
  const rejets: string[] = [];
  const fiches: FicheImport[] = [];
  const vus = new Set<string>();

  for (const [i, brut] of projetsBruts.entries()) {
    const p = (brut ?? {}) as Record<string, unknown>;
    const code = texte(p.code, 8).toUpperCase();
    if (!/^P\d{2,4}$/.test(code)) { rejets.push(`Projet n° ${i + 1} : code « ${texte(p.code, 20)} » invalide.`); continue; }
    if (vus.has(code)) { rejets.push(`${code} : présent deux fois dans l'export, seule la première fiche est gardée.`); continue; }
    vus.add(code);
    const nom = texte(p.nom, 300);
    if (!nom) { rejets.push(`${code} : sans nom.`); continue; }

    let domaine = texte(p.domaine, 2).toUpperCase();
    if (!DOMAINES.includes(domaine as never)) {
      if (domaine) avertissements.push(`${code} : domaine « ${domaine} » inconnu, classé en Z.`);
      domaine = "Z";
    }
    const statut = STATUTS_NORMALISES.get(sansAccents(texte(p.statut, 30))) ?? "";
    if (!statut && texte(p.statut, 30)) avertissements.push(`${code} : statut « ${texte(p.statut, 30)} » inconnu, mis « à confirmer ».`);

    const echeance = jour(p.echeance);
    if (texte(p.echeance, 32) && !echeance) avertissements.push(`${code} : échéance illisible, laissée vide.`);
    const expertsBruts = Array.isArray(p.experts) ? p.experts.map((x) => sansAccents(String(x))) : [];
    const experts = [...new Set(expertsBruts.filter((x) => EXPERTS.includes(x as never)))];
    if (experts.length < expertsBruts.length) avertissements.push(`${code} : expert(s) inconnu(s) ignoré(s).`);

    fiches.push({
      code, nom, domaine, statut,
      resume: texte(p.resume), prochaine_action: texte(p.prochaine_action, 1000), echeance, experts,
      confidentiel: p.confidentiel === true, info_du: jour(p.info_du), source: "import-qg",
    });
  }

  const entrees: EntreeImport[] = [];
  for (const [i, brut] of journalBrut.entries()) {
    const j = (brut ?? {}) as Record<string, unknown>;
    const genre = sansAccents(texte(j.genre, 20));
    const t = texte(j.texte);
    const date = texte(j.date, 40);
    if (!t) { rejets.push(`Journal n° ${i + 1} : texte vide.`); continue; }
    if (!GENRES_JOURNAL.includes(genre as never)) { rejets.push(`Journal n° ${i + 1} : genre « ${texte(j.genre, 20)} » inconnu.`); continue; }
    if (Number.isNaN(Date.parse(date))) { rejets.push(`Journal n° ${i + 1} : date illisible.`); continue; }
    entrees.push({ date: new Date(date).toISOString(), genre, texte: t, projet: texte(j.projet, 8).toUpperCase(), source: "import-qg" });
  }
  return { fiches, entrees, avertissements, rejets };
}

export async function importerQG(
  db: SupabaseClient, owner: string, brut: string, mode: "apercu" | "importer",
): Promise<Apercu & { importe?: { projets: number; journal: number } }> {
  let exportQG: unknown;
  try { exportQG = JSON.parse(brut); } catch { throw new ErreurHttp(400, "Le fichier n'est pas du JSON valide."); }
  const empreinte = await empreinteDe(brut);
  const { fiches, entrees, avertissements, rejets } = analyser(exportQG);

  const existants = new Set((await lireProjets(db, owner)).map((p) => p.code));
  const nouvelles = fiches.filter((f) => !existants.has(f.code));
  const { data: trace } = await db.from("alter_imports").select("id").eq("owner", owner).eq("empreinte", empreinte).maybeSingle();

  const apercu: Apercu = {
    empreinte,
    deja_importe: Boolean(trace),
    projets_nouveaux: nouvelles.map((f) => ({ code: f.code, nom: f.nom, domaine: f.domaine, statut: f.statut, confidentiel: f.confidentiel })),
    projets_existants: fiches.filter((f) => existants.has(f.code)).map((f) => f.code),
    journal: entrees.length,
    avertissements,
    rejets,
  };
  if (mode === "apercu") return apercu;
  if (trace) throw new ErreurHttp(409, "Ce fichier a déjà été importé.");

  // Trace d'abord : un double clic ne peut pas importer deux fois.
  const { error: e0 } = await db.from("alter_imports")
    .insert({ owner, empreinte, projets: nouvelles.length, journal: entrees.length });
  if (e0) throw new ErreurHttp(409, "Import déjà en cours ou déjà fait.");

  const lignesProjets = await Promise.all(nouvelles.map(async ({ code, ...fiche }) => ({
    owner, code, ...(await chiffrer(fiche, `projet:${owner}:${code}`)),
  })));
  for (let i = 0; i < lignesProjets.length; i += 100) {
    const { error } = await db.from("alter_projets").insert(lignesProjets.slice(i, i + 100));
    if (error) throw error;
  }
  const lignesJournal = await Promise.all(entrees.map(async ({ date, ...e }) => {
    const id = crypto.randomUUID();
    return { id, owner, cree_le: date, ...(await chiffrer(e, `journal:${owner}:${id}`)) };
  }));
  for (let i = 0; i < lignesJournal.length; i += 200) {
    const { error } = await db.from("alter_journal").insert(lignesJournal.slice(i, i + 200));
    if (error) throw error;
  }
  return { ...apercu, importe: { projets: lignesProjets.length, journal: lignesJournal.length } };
}
