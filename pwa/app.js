/* Alter : application (PWA et artefact).
 *
 * Trois modes, choisis au démarrage :
 *  - « serveur »  : config.js renseigné → connexion Supabase, tout passe par l'Edge Function « alter » ;
 *  - « artefact » : la page tourne dans claude.ai → Claude via la capacité « sample », données d'exemple ;
 *  - « exemple »  : ni l'un ni l'autre → interface seule, données d'exemple, sans IA.
 *
 * Règle de confidentialité : le portefeuille, le journal et la conversation ne vivent qu'en
 * mémoire. Rien n'est écrit dans localStorage, IndexedDB ou le cache du service worker,
 * hormis deux préférences d'affichage (lecture auto, onglet) et, en mode serveur,
 * le jeton de session Supabase.
 */
(() => {
  "use strict";

  const CONFIG = window.ALTER_CONFIG || {};
  const LANGUE = CONFIG.langue || "fr-FR";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const DOMAINES = {
    A: "MentorLab : offres, méthodes et marque",
    B: "Développement commercial et partenariats",
    C: "Missions clients",
    D: "Apps et produits",
    E: "Outils, IA et infrastructure",
    F: "Administration et conformité",
    Z: "À classer",
  };
  const STATUTS = ["en cours", "à décider", "en attente", "bloqué", "en veille", "livré", ""];
  const EXPERTS = {
    victor: "Victor", helene: "Hélène", marc: "Marc", ines: "Inès", paul: "Paul", claire: "Claire",
    thomas: "Thomas", nadia: "Nadia", keller: "Maître Keller", sophie: "Sophie", lea: "Léa", hugo: "Hugo",
    samir: "Samir", julien: "Julien", chloe: "Chloé", emma: "Emma", arthur: "Arthur", cassandre: "Cassandre",
  };
  const LIBELLES_CHAMPS = {
    nom: "Nom", domaine: "Domaine", statut: "Statut", resume: "Résumé", prochaine_action: "Prochaine action",
    echeance: "Échéance", experts: "Experts", confidentiel: "Confidentiel",
  };
  const GENRES_JOURNAL = { decision: "Décision", tache: "Tâche", idee: "Idée", note: "Note", revue: "Revue" };

  const etat = {
    mode: "exemple",
    projets: [],
    journal: [],
    propositions: new Map(), // id → proposition (en attente ou traitée pendant la session)
    revue: null,
    envoi: false,
    vue: lirePref("vue", "chat"),
    cote: lirePref("cote", "portefeuille"),
    filtre: "tout",
    lectureAuto: lirePref("lectureAuto", false),
  };

  // ------------------------------------------------------------------ utilitaires
  function lirePref(cle, defaut) {
    try { const v = localStorage.getItem("alter." + cle); return v === null ? defaut : JSON.parse(v); } catch { return defaut; }
  }
  function ecrirePref(cle, valeur) {
    try { localStorage.setItem("alter." + cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
  }
  function echapper(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(balise, attributs = {}, ...enfants) {
    const n = document.createElement(balise);
    for (const [k, v] of Object.entries(attributs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const e of enfants.flat()) if (e != null && e !== false) n.append(e.nodeType ? e : document.createTextNode(String(e)));
    return n;
  }
  function aujourdhui() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Zurich" }).format(new Date());
  }
  function joursEntre(iso) {
    if (!iso) return null;
    const a = new Date(aujourdhui() + "T00:00:00Z"), b = new Date(iso + "T00:00:00Z");
    return Math.round((b - a) / 86400000);
  }
  function dateCourte(iso) {
    if (!iso) return "";
    const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
    return new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", timeZone: "Europe/Zurich" }).format(d);
  }
  let minuteurToast;
  function toast(texte) {
    const t = $("#toast");
    t.textContent = texte;
    t.hidden = false;
    clearTimeout(minuteurToast);
    minuteurToast = setTimeout(() => { t.hidden = true; }, 3500);
  }

  // ------------------------------------------------------------------ rendu du texte d'Alter
  function enLigne(s) {
    return echapper(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }
  const RE_LISTE = /^\s*([-*•]|\d+[.)])\s+/;
  const RE_TABLE = /^\s*\|.*\|\s*$/;
  function markdown(md) {
    const lignes = String(md).replace(/\r/g, "").split("\n");
    let html = "", i = 0;
    while (i < lignes.length) {
      const l = lignes[i];
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = l.match(/^(#{1,4})\s+(.*)/))) {
        const n = Math.min(m[1].length + 2, 5);
        html += `<h${n}>${enLigne(m[2])}</h${n}>`; i++; continue;
      }
      if (RE_TABLE.test(l)) {
        const rangs = [];
        while (i < lignes.length && RE_TABLE.test(lignes[i])) rangs.push(lignes[i++]);
        const cellules = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const corps = rangs.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map(cellules);
        html += '<div class="tableau"><table>' + corps.map((r, k) =>
          "<tr>" + r.map((c) => (k === 0 ? `<th>${enLigne(c)}</th>` : `<td>${enLigne(c)}</td>`)).join("") + "</tr>").join("") + "</table></div>";
        continue;
      }
      if (RE_LISTE.test(l)) {
        const ordonnee = /^\s*\d/.test(l);
        const items = [];
        while (i < lignes.length && RE_LISTE.test(lignes[i])) {
          items.push(lignes[i++].replace(RE_LISTE, ""));
          while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !RE_LISTE.test(lignes[i])) items[items.length - 1] += " " + lignes[i++].trim();
        }
        const t = ordonnee ? "ol" : "ul";
        html += `<${t}>${items.map((x) => `<li>${enLigne(x)}</li>`).join("")}</${t}>`;
        continue;
      }
      if (/^>\s?/.test(l)) {
        const q = [];
        while (i < lignes.length && /^>\s?/.test(lignes[i])) q.push(lignes[i++].replace(/^>\s?/, ""));
        html += `<blockquote>${enLigne(q.join(" "))}</blockquote>`;
        continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { html += "<hr>"; i++; continue; }
      const p = [l]; i++;
      while (i < lignes.length && lignes[i].trim() && !/^(#{1,4}\s|>)/.test(lignes[i]) && !RE_LISTE.test(lignes[i]) && !RE_TABLE.test(lignes[i])) p.push(lignes[i++]);
      html += `<p>${p.map(enLigne).join("<br>")}</p>`;
    }
    return html;
  }
  function pourLaVoix(md) {
    return String(md)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\*\*|__|`|^#+\s*/gm, "")
      .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")
      .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, "")
      .replace(/\|/g, ", ")
      .replace(/·/g, ",")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  // ------------------------------------------------------------------ voix : dictée et lecture
  const Voix = {
    dictee: null, tts: null, Reco: null, reco: null, ecoute: false,
    async init() {
      if (window.claude && typeof window.claude.use === "function") {
        try { this.dictee = await window.claude.use("dictation"); } catch { this.dictee = null; }
        try { this.tts = await window.claude.use("tts"); } catch { this.tts = null; }
      }
      this.Reco = window.SpeechRecognition || window.webkitSpeechRecognition || null;
      this.majBouton();
    },
    disponible() { return Boolean(this.dictee || this.Reco); },
    majBouton() {
      const b = $("#btn-micro");
      b.hidden = !this.disponible();
      b.dataset.etat = this.ecoute ? "ecoute" : "";
      b.setAttribute("aria-label", this.ecoute ? "Arrêter la dictée" : "Dicter");
      b.title = b.getAttribute("aria-label");
    },
    basculer() { this.ecoute ? this.arreter() : this.demarrer(); },
    demarrer() {
      const champ = $("#champ");
      const base = champ.value ? champ.value.replace(/\s*$/, " ") : "";
      let acquis = "";
      const afficher = (provisoire) => { champ.value = base + acquis + provisoire; ajusterChamp(); };
      if (this.dictee) {
        this.dictee.onPartial(({ text }) => afficher(text));
        this.dictee.onFinal(({ text }) => { acquis += text + " "; afficher(""); });
        this.dictee.onState(({ state }) => { this.ecoute = state === "listening"; this.majBouton(); });
        this.dictee.start().catch((e) => {
          this.ecoute = false; this.majBouton();
          if (e && e.code === "not_granted") { this.dictee = null; this.majBouton(); }
          aide("La dictée n'est pas disponible ici. Utilise le micro du clavier.");
        });
        this.ecoute = true; this.majBouton();
        return;
      }
      if (!this.Reco) return;
      const r = new this.Reco();
      r.lang = LANGUE; r.interimResults = true; r.continuous = true;
      r.onresult = (ev) => {
        let provisoire = "";
        for (let k = ev.resultIndex; k < ev.results.length; k++) {
          const res = ev.results[k];
          if (res.isFinal) acquis += res[0].transcript.trim() + " ";
          else provisoire += res[0].transcript;
        }
        afficher(provisoire);
      };
      r.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") aide("Micro refusé. Autorise-le dans les réglages du navigateur, ou utilise le micro du clavier.");
        else if (ev.error !== "no-speech" && ev.error !== "aborted") aide("La dictée s'est interrompue.");
      };
      r.onend = () => { this.ecoute = false; this.reco = null; this.majBouton(); };
      try {
        r.start(); this.reco = r; this.ecoute = true; this.majBouton();
        if (!lirePref("avisDictee", false)) {
          aide("La dictée du navigateur peut passer par les serveurs de Google (Chrome) ou d'Apple (Safari).");
          ecrirePref("avisDictee", true);
        }
      } catch { aide("La dictée n'a pas pu démarrer."); }
    },
    arreter() {
      if (this.dictee) this.dictee.stop().catch(() => {});
      if (this.reco) this.reco.stop();
      this.ecoute = false; this.majBouton();
    },
    // Lecture à voix haute
    parle: null,
    async lire(md, bouton) {
      this.taire();
      const texte = pourLaVoix(md);
      if (!texte) return;
      const paragraphes = texte.split(/\n+/).flatMap((p) => decouper(p, 1500)).filter(Boolean);
      if (bouton) { bouton.dataset.lecture = "1"; this.parle = bouton; }
      const fin = () => { if (this.parle) delete this.parle.dataset.lecture; this.parle = null; };
      if (this.tts) {
        try { await this.tts.speak(paragraphes.map((p) => ({ text: p, language: "fr" }))); } catch { /* arrêté ou refusé */ }
        fin(); return;
      }
      if (!("speechSynthesis" in window)) { aide("La lecture à voix haute n'est pas disponible sur ce navigateur."); fin(); return; }
      const voix = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.toLowerCase().startsWith("fr"));
      const choisie = voix.find((v) => v.lang === LANGUE) || voix.find((v) => /CH|FR/.test(v.lang)) || voix[0];
      paragraphes.forEach((p, k) => {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = choisie ? choisie.lang : LANGUE;
        if (choisie) u.voice = choisie;
        if (k === paragraphes.length - 1) { u.onend = fin; u.onerror = fin; }
        speechSynthesis.speak(u);
      });
    },
    taire() {
      if (this.tts) { try { this.tts.stop(); } catch { /* rien */ } }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      if (this.parle) delete this.parle.dataset.lecture;
      this.parle = null;
    },
  };
  function decouper(texte, max) {
    if (texte.length <= max) return [texte];
    const phrases = texte.match(/[^.!?]+[.!?]*\s*/g) || [texte];
    const out = []; let cur = "";
    for (const ph of phrases) { if ((cur + ph).length > max && cur) { out.push(cur.trim()); cur = ""; } cur += ph; }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function aide(texte) {
    const a = $("#aide-saisie");
    a.textContent = texte;
    clearTimeout(aide.t);
    aide.t = setTimeout(() => { a.textContent = ""; }, 7000);
  }

  // ------------------------------------------------------------------ données d'exemple
  function decaler(jours) {
    const d = new Date(aujourdhui() + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + jours);
    return d.toISOString().slice(0, 10);
  }
  function donneesExemple() {
    const p = (code, domaine, nom, statut, prochaine_action, echeance, experts, resume, info, confidentiel = false) => ({
      code, domaine, nom, statut, prochaine_action, echeance, experts, resume, info_du: decaler(info), confidentiel,
      version: 1, source: "exemple", maj: new Date().toISOString(),
    });
    const projets = [
      p("P01", "A", "Exemple · Refonte de l'offre d'ateliers dirigeants", "en cours", "Écrire la fiche de l'offre en une page", decaler(9), ["victor", "paul", "ines"], "Clarifier l'offre et son prix pour les PME de 20 à 200 personnes.", -3),
      p("P02", "B", "Exemple · Partenariat avec un réseau de fiduciaires", "à décider", "Choisir entre commission et licence", decaler(4), ["helene", "keller", "marc"], "Deux modèles de rémunération sur la table, décision attendue avant le rendez-vous.", -6, true),
      p("P03", "C", "Exemple · Mission de transformation dans une PME industrielle", "en cours", "Préparer l'atelier de lancement avec la direction", decaler(21), ["thomas", "nadia"], "Mission de six mois, phase de diagnostic terminée.", -2),
      p("P04", "D", "Exemple · Application de suivi des décisions", "en attente", "Attendre le retour des trois testeurs", "", ["lea", "julien", "emma"], "Prototype en test chez trois dirigeants.", -12),
      p("P05", "E", "Exemple · Automatisation des comptes rendus de réunion", "bloqué", "Obtenir l'accord du client sur l'hébergement des enregistrements", decaler(-2), ["hugo", "sophie"], "Bloqué par la question de l'hébergement des données.", -9),
      p("P06", "F", "Exemple · Registre des traitements nLPD", "", "Confirmer le périmètre avec la fiduciaire", "", ["sophie", "keller"], "Statut à confirmer.", -45),
      p("P07", "A", "Exemple · Supports de la méthode", "en veille", "Reprendre après la refonte de l'offre", "", ["chloe"], "En veille jusqu'à la nouvelle offre.", -20),
      p("P08", "Z", "Exemple · Idée de podcast dirigeants", "", "Classer et décider s'il faut le garder", "", [], "Idée notée, pas encore classée.", -15),
    ];
    const j = (jours, genre, texte, projet) => ({ id: "ex-" + Math.random().toString(36).slice(2), date: decaler(jours) + "T08:00:00Z", genre, texte, projet, source: "exemple" });
    const journal = [
      j(-1, "decision", "Exemple : la refonte de l'offre passe avant les supports.", "P01"),
      j(-3, "tache", "Exemple : relancer le client sur l'hébergement des enregistrements.", "P05"),
      j(-6, "idee", "Exemple : proposer un format court de 90 minutes.", "P01"),
      j(-7, "revue", "Exemple : revue de la semaine préparée.", ""),
    ];
    const proposition = {
      id: "ex-prop-1", cree_le: new Date().toISOString(), genre: "maj_projet", code: "P05",
      champs: { statut: "en attente", prochaine_action: "Relancer le client jeudi sur l'hébergement en Suisse", echeance: decaler(3) },
      avant: { statut: "bloqué", prochaine_action: "Obtenir l'accord du client sur l'hébergement des enregistrements", echeance: decaler(-2) },
      motif: "Tu as indiqué que la relance part jeudi : le projet n'est plus bloqué, il attend une réponse.",
      version_lue: 1,
    };
    const messages = [
      { role: "user", content: "Où en est P05 ? La relance au client part jeudi." },
      { role: "assistant", content: "**Hugo (IA et automatisation)** : P05 reste suspendu à une seule question, l'hébergement des enregistrements. Tant que le client n'a pas tranché, rien ne doit tourner en production.\n\n**Sophie (conformité)** : propose-lui un hébergement en Suisse et un registre des traitements prêt à signer. C'est ce qui débloque le plus souvent ce type de décision.\n\n**Ma recommandation** : relance jeudi avec ces deux éléments, et repasse le projet de « bloqué » à « en attente ». Je te propose la mise à jour ci-dessous." },
    ];
    return { projets, journal, propositions: [proposition], messages, revue: null };
  }

  // ------------------------------------------------------------------ outil commun : proposer_maj_qg
  const OUTIL_SCHEMA = {
    type: "object",
    properties: {
      genre: { type: "string", enum: ["maj_projet", "nouveau_projet", "journal"] },
      code: { type: "string", description: "Code du projet (ex. P05) pour maj_projet." },
      champs: {
        type: "object",
        properties: {
          nom: { type: "string" }, domaine: { type: "string", enum: Object.keys(DOMAINES) },
          statut: { type: "string", enum: STATUTS }, resume: { type: "string" },
          prochaine_action: { type: "string" }, echeance: { type: "string", description: "AAAA-MM-JJ" },
          experts: { type: "array", items: { type: "string", enum: Object.keys(EXPERTS) } },
          confidentiel: { type: "boolean" },
        },
      },
      journal: {
        type: "object",
        properties: { genre: { type: "string", enum: Object.keys(GENRES_JOURNAL) }, texte: { type: "string" }, projet: { type: "string" } },
        required: ["genre", "texte"],
      },
      motif: { type: "string" },
    },
    required: ["genre", "motif"],
  };
  function validerChampsLocal(c) {
    const s = {};
    if (!c || typeof c !== "object") return s;
    for (const k of ["nom", "resume", "prochaine_action"]) if (typeof c[k] === "string") s[k] = c[k].trim();
    if (c.domaine in DOMAINES) s.domaine = c.domaine;
    if (STATUTS.includes(c.statut)) s.statut = c.statut;
    if (typeof c.echeance === "string" && (c.echeance === "" || /^\d{4}-\d{2}-\d{2}$/.test(c.echeance))) s.echeance = c.echeance;
    if (Array.isArray(c.experts)) s.experts = c.experts.filter((x) => x in EXPERTS);
    if (typeof c.confidentiel === "boolean") s.confidentiel = c.confidentiel;
    return s;
  }

  // ------------------------------------------------------------------ moteur « artefact » et « exemple »
  const PROMPT_ARTEFACT = `Tu es Alter, directeur de cabinet et alter ego de Gilles, dirigeant à Genève. Tu diriges le Cabinet : Victor (stratégie), Hélène (VC et M&A), Marc (finance), Inès (growth), Paul (commercial), Claire (coach de dirigeant), Thomas (organisation), Nadia (psychologie du travail), Maître Keller (avocat d'affaires suisse et français), Sophie (conformité, nLPD, IA), Léa (produit), Hugo (architecture IA), Samir (back-end), Julien (web et mobile), Chloé (design), Emma (UX), Arthur (veille), Cassandre (contradictrice).
Style : français, tutoiement, conclusion d'abord, pas de flatterie. Un expert qui parle est nommé en gras en tête de paragraphe, une à trois voix pour une question simple, Cassandre en dernier pour une décision importante, puis ta recommandation et la prochaine action. Ne devine jamais un fait, un chiffre ou une date. Questions à Gilles : trois au maximum, seulement ce qui bloque.
Quand l'état d'un projet change (statut, prochaine action, échéance, décision validée) ou qu'un sujet nouveau apparaît, appelle l'outil proposer_maj_qg : Gilles validera d'un clic. N'y mets que ce que Gilles a dit ou validé. Réponses courtes, lisibles sur téléphone, sans tableau large.
CADRE : ceci est la version d'essai dans claude.ai. Le portefeuille ci-dessous est FICTIF (projets « Exemple »). Tu n'as pas de recherche web ici : dis-le si une vérification serait nécessaire.`;

  function instantane(projets, journal) {
    const lignes = [`État du QG au ${aujourdhui()} (heure de Genève) :`];
    for (const d of Object.keys(DOMAINES)) {
      const ps = projets.filter((p) => p.domaine === d);
      if (!ps.length) continue;
      lignes.push(`\n${d} · ${DOMAINES[d]}`);
      for (const p of ps) lignes.push(`- ${p.code} · ${p.nom} · statut : ${p.statut || "à confirmer"} · prochaine action : ${p.prochaine_action || "—"} · échéance : ${p.echeance || "—"} · info du ${p.info_du || "?"}${p.confidentiel ? " · CONFIDENTIEL" : ""}`);
    }
    lignes.push("\nJournal récent :");
    for (const j of journal.slice(0, 12)) lignes.push(`- ${j.date.slice(0, 10)} · ${j.genre}${j.projet ? " · " + j.projet : ""} · ${j.texte}`);
    return lignes.join("\n");
  }

  const MoteurLocal = {
    sample: null,
    donnees: null,
    historique: [],
    async init() {
      this.donnees = donneesExemple();
      this.historique = this.donnees.messages.slice();
    },
    async brancherClaude() {
      try { this.sample = await window.claude.use("sample"); } catch { this.sample = null; }
    },
    async etat() { return this.donnees; },
    async envoyer(texte, r) {
      this.historique.push({ role: "user", content: texte });
      if (!this.sample) {
        const rep = "Mode Exemple : je ne suis pas encore branché à Claude. Une fois le serveur Supabase déployé et `config.js` renseigné, je te réponds ici avec le Cabinet complet et la recherche web.";
        r.texte(rep); this.historique.push({ role: "assistant", content: rep }); r.fin(); return;
      }
      const tours = this.historique.slice(-16);
      if (tours[0].role !== "user") tours.shift();
      const entree = tours.map((m, k) => (k === 0
        ? { role: "user", content: `${PROMPT_ARTEFACT}\n\n${instantane(this.donnees.projets, this.donnees.journal)}\n\n---\nMessage de Gilles :\n${m.content}` }
        : m));
      try {
        const { text } = await this.sample(entree, {
          cache: false,
          modelTier: "default",
          onText: ({ text: t }) => r.texteComplet(t),
          tools: [{
            name: "proposer_maj_qg",
            description: "Propose une mise à jour du QG que Gilles valide d'un clic. genre = maj_projet (code + champs modifiés), nouveau_projet (champs.nom obligatoire) ou journal (journal.genre + journal.texte). Renvoie la confirmation de présentation du bloc.",
            inputSchema: OUTIL_SCHEMA,
            execute: (input) => {
              const p = this.creerProposition(input);
              r.proposition(p);
              return "Bloc présenté à Gilles, en attente de sa validation.";
            },
          }],
        });
        this.historique.push({ role: "assistant", content: text });
      } catch (e) {
        const messages = {
          not_granted: "Tu n'as pas autorisé cette page à utiliser Claude. Recharge-la pour accepter.",
          rate_limited: "Trop de demandes en peu de temps. Attends une minute.",
          refused: "Alter n'a pas pu répondre à cette demande. Reformule-la.",
        };
        if (e && e.code !== "cancelled") r.erreur(messages[e && e.code] || "Claude n'a pas répondu. Réessaie.");
        if (e && e.text) this.historique.push({ role: "assistant", content: e.text });
      }
      r.fin();
    },
    creerProposition(input) {
      const genre = String(input.genre || "");
      const id = "loc-" + Math.random().toString(36).slice(2);
      const base = { id, cree_le: new Date().toISOString(), genre, motif: String(input.motif || "") };
      if (genre === "maj_projet") {
        const code = String(input.code || "").toUpperCase();
        const projet = this.donnees.projets.find((p) => p.code === code);
        if (!projet) throw new Error(`projet ${code} introuvable`);
        const champs = validerChampsLocal(input.champs);
        if (!Object.keys(champs).length) throw new Error("aucun champ à modifier");
        const avant = {}; for (const k of Object.keys(champs)) avant[k] = projet[k];
        return { ...base, code, champs, avant, version_lue: projet.version };
      }
      if (genre === "nouveau_projet") {
        const champs = validerChampsLocal(input.champs);
        if (!champs.nom) throw new Error("un nouveau projet doit avoir un nom");
        return { ...base, champs: { domaine: "Z", statut: "", experts: [], ...champs } };
      }
      if (genre === "journal") {
        const j = input.journal || {};
        if (!(j.genre in GENRES_JOURNAL) || !j.texte) throw new Error("entrée de journal incomplète");
        return { ...base, journal: { genre: j.genre, texte: String(j.texte), projet: String(j.projet || "").toUpperCase() } };
      }
      throw new Error("genre de proposition inconnu");
    },
    async decider(id, decision, modifs) {
      const p = etat.propositions.get(id);
      if (!p) throw new Error("Bloc introuvable.");
      if (decision === "rejeter") return { statut: "rejetee" };
      const d = this.donnees;
      const retouches = validerChampsLocal(modifs);
      if (p.genre === "maj_projet") {
        const projet = d.projets.find((x) => x.code === p.code);
        if (!projet) throw new Error(`Le projet ${p.code} n'existe plus.`);
        if (projet.version !== p.version_lue) return { statut: "perimee", erreur: `La fiche ${p.code} a changé depuis la proposition.` };
        Object.assign(projet, p.champs, retouches, { info_du: aujourdhui(), version: projet.version + 1 });
      } else if (p.genre === "nouveau_projet") {
        const max = d.projets.reduce((m, x) => Math.max(m, Number(x.code.slice(1)) || 0), 0);
        const code = "P" + String(max + 1).padStart(2, "0");
        d.projets.push({ nom: "", domaine: "Z", statut: "", resume: "", prochaine_action: "", echeance: "", experts: [], confidentiel: false, ...p.champs, ...retouches, code, version: 1, info_du: aujourdhui() });
        return { statut: "validee", code };
      } else if (p.genre === "journal") {
        const texte = modifs && typeof modifs.texte === "string" ? modifs.texte : p.journal.texte;
        d.journal.unshift({ id: "loc-" + Date.now(), date: new Date().toISOString(), genre: p.journal.genre, texte, projet: p.journal.projet || "", source: "pwa" });
      }
      d.propositions = d.propositions.filter((x) => x.id !== id);
      return { statut: "validee" };
    },
    async revueLue() {},
  };

  // ------------------------------------------------------------------ moteur « serveur » (Supabase)
  const MoteurServeur = {
    sb: null,
    async init() {
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm");
      this.sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseCleAnon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "alter-session" },
      });
    },
    async jeton() {
      const { data } = await this.sb.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
    async appel(chemin, options = {}) {
      const jeton = await this.jeton();
      if (!jeton) { afficherConnexion(); throw new Error("Connexion requise."); }
      const rep = await fetch(`${CONFIG.supabaseUrl}/functions/v1/alter/${chemin}`, {
        ...options,
        headers: { Authorization: `Bearer ${jeton}`, apikey: CONFIG.supabaseCleAnon, "Content-Type": "application/json", ...(options.headers || {}) },
        cache: "no-store",
      });
      if (rep.status === 401 || (rep.status === 403 && chemin === "etat")) { afficherConnexion(); }
      return rep;
    },
    async json(chemin, options) {
      const rep = await this.appel(chemin, options);
      const corps = await rep.json().catch(() => ({}));
      if (!rep.ok) throw Object.assign(new Error(corps.erreur || `Erreur ${rep.status}`), { statut: rep.status });
      return corps;
    },
    etat() { return this.json("etat"); },
    async envoyer(texte, r) {
      let rep;
      try {
        rep = await this.appel("chat", { method: "POST", body: JSON.stringify({ texte }) });
      } catch { r.erreur("Pas de connexion au serveur."); r.fin(); return; }
      if (!rep.ok || !rep.body) {
        const corps = await rep.json().catch(() => ({}));
        r.erreur(corps.erreur || "Le serveur a refusé le message."); r.fin(); return;
      }
      const lecteur = rep.body.getReader();
      const dec = new TextDecoder();
      let tampon = "";
      try {
        for (;;) {
          const { value, done } = await lecteur.read();
          if (done) break;
          tampon += dec.decode(value, { stream: true });
          let fin;
          while ((fin = tampon.indexOf("\n\n")) >= 0) {
            const bloc = tampon.slice(0, fin); tampon = tampon.slice(fin + 2);
            const evenement = (bloc.match(/^event: (.*)$/m) || [])[1];
            const donnees = (bloc.match(/^data: (.*)$/m) || [])[1];
            if (!evenement || donnees == null) continue;
            const d = JSON.parse(donnees);
            if (evenement === "texte") r.texte(d.delta);
            else if (evenement === "recherche") r.recherche(d.requete);
            else if (evenement === "proposition") r.proposition(d);
            else if (evenement === "erreur") r.erreur(d.message);
          }
        }
      } catch { r.erreur("La connexion a été coupée pendant la réponse."); }
      r.fin();
    },
    decider(id, decision, modifications) {
      return this.json(`propositions/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify({ decision, modifications }) });
    },
    revueLue(id) { return this.json(`revues/${encodeURIComponent(id)}/lue`, { method: "POST", body: "{}" }); },
  };

  let moteur = MoteurLocal;

  // ------------------------------------------------------------------ connexion (mode serveur)
  async function afficherConnexion() {
    const boite = $("#connexion");
    if (!boite.hidden) return;
    boite.hidden = false;
    const sb = MoteurServeur.sb;
    const { data: session } = await sb.auth.getSession();
    if (session.session) return etapeSecondFacteur();
    etapeAdresse();
  }
  function etapeConnexion(titre, texte, champs, bouton, action) {
    $("#connexion-titre").textContent = titre;
    $("#connexion-texte").textContent = texte;
    const zone = $("#connexion-champs");
    zone.replaceChildren(...champs);
    $("#connexion-bouton").textContent = bouton;
    $("#connexion-message").textContent = "";
    $("#form-connexion").onsubmit = async (e) => {
      e.preventDefault();
      const b = $("#connexion-bouton"); b.disabled = true;
      try { await action(); } catch (err) { $("#connexion-message").textContent = err.message || "Échec. Réessaie."; }
      b.disabled = false;
    };
    const premier = zone.querySelector("input"); if (premier) premier.focus();
  }
  function etapeAdresse() {
    const champ = el("input", { id: "connexion-email", type: "email", autocomplete: "email", required: true, inputmode: "email" });
    etapeConnexion("Connexion à Alter", "Saisis ton adresse : tu recevras un code à six chiffres par e-mail.",
      [el("label", { for: "connexion-email" }, "Adresse e-mail", champ)], "Recevoir le code", async () => {
        const email = champ.value.trim();
        const { error } = await MoteurServeur.sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
        if (error) throw new Error("Envoi impossible. Vérifie l'adresse.");
        etapeCode(email);
      });
  }
  function etapeCode(email) {
    const champ = el("input", { id: "connexion-code", inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6,10}", required: true });
    etapeConnexion("Code reçu par e-mail", `Saisis le code envoyé à ${email}.`,
      [el("label", { for: "connexion-code" }, "Code", champ)], "Continuer", async () => {
        const { error } = await MoteurServeur.sb.auth.verifyOtp({ email, token: champ.value.trim(), type: "email" });
        if (error) throw new Error("Code incorrect ou expiré.");
        await etapeSecondFacteur();
      });
  }
  async function etapeSecondFacteur() {
    const sb = MoteurServeur.sb;
    const { data: niveau } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (niveau && niveau.currentLevel === "aal2") return connecte();
    const { data: facteurs } = await sb.auth.mfa.listFactors();
    const totp = (facteurs && facteurs.totp || [])[0];
    const champ = el("input", { id: "connexion-totp", inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9]{6}", required: true });
    if (totp) {
      etapeConnexion("Second facteur", "Saisis le code à six chiffres de ton application d'authentification.",
        [el("label", { for: "connexion-totp" }, "Code d'authentification", champ)], "Se connecter", async () => {
          const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code: champ.value.trim() });
          if (error) throw new Error("Code incorrect.");
          await connecte();
        });
      return;
    }
    const { data: inscription, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Alter " + new Date().toISOString().slice(0, 16) });
    if (error) { $("#connexion-message").textContent = "Impossible de créer le second facteur."; return; }
    const qr = el("img", { class: "qr", alt: "QR code à scanner avec ton application d'authentification", src: inscription.totp.qr_code });
    etapeConnexion("Active le second facteur", "Scanne ce code avec ton application d'authentification, puis saisis le code affiché.",
      [qr, el("p", { class: "secret" }, inscription.totp.secret), el("label", { for: "connexion-totp" }, "Code d'authentification", champ)],
      "Activer et se connecter", async () => {
        const { error: e } = await sb.auth.mfa.challengeAndVerify({ factorId: inscription.id, code: champ.value.trim() });
        if (e) throw new Error("Code incorrect.");
        await connecte();
      });
  }
  async function connecte() {
    $("#connexion").hidden = true;
    $("#btn-sortir").hidden = false;
    await charger();
  }

  // ------------------------------------------------------------------ affichage : vues
  const bureau = window.matchMedia("(min-width: 960px)");
  function appliquerVue() {
    const large = bureau.matches;
    const vue = etat.vue;
    $("#vue-chat").hidden = !large && vue !== "chat";
    const cote = large ? etat.cote : (vue === "chat" ? null : vue);
    $("#cote").hidden = !large && vue === "chat";
    $("#vue-portefeuille").hidden = cote !== "portefeuille";
    $("#vue-journal").hidden = cote !== "journal";
    for (const b of $$(".onglets [data-vue]")) b.setAttribute("aria-selected", String(b.dataset.vue === vue));
    for (const b of $$(".cote-onglets [data-cote]")) b.setAttribute("aria-selected", String(b.dataset.cote === etat.cote));
  }

  // ------------------------------------------------------------------ affichage : portefeuille
  function urgence(p) {
    if (p.statut === "livré") return "";
    const j = joursEntre(p.echeance);
    if (j == null) return "";
    if (j < 0) return "depassee";
    if (j <= 14) return "proche";
    return "";
  }
  function aSurveiller(p) {
    return urgence(p) || p.statut === "bloqué" || p.statut === "" || (joursEntre(p.info_du) ?? 0) < -30;
  }
  function libelleEcheance(p) {
    if (!p.echeance) return "";
    const j = joursEntre(p.echeance);
    const quand = j < 0 ? `dépassée de ${-j} j` : j === 0 ? "aujourd'hui" : `dans ${j} j`;
    return `Échéance ${dateCourte(p.echeance)} · ${quand}`;
  }
  function rendrePortefeuille() {
    const ps = etat.projets;
    const depassees = ps.filter((p) => urgence(p) === "depassee").length;
    const proches = ps.filter((p) => urgence(p) === "proche").length;
    const bloques = ps.filter((p) => p.statut === "bloqué").length;
    const aConfirmer = ps.filter((p) => !p.statut).length;
    const vieux = ps.filter((p) => (joursEntre(p.info_du) ?? 0) < -30).length;
    const puces = [
      [`${ps.length} projets`, ""],
      depassees && [`${depassees} échéance${depassees > 1 ? "s" : ""} dépassée${depassees > 1 ? "s" : ""}`, "alerte"],
      proches && [`${proches} à moins de 14 jours`, "attention"],
      bloques && [`${bloques} bloqué${bloques > 1 ? "s" : ""}`, "alerte"],
      aConfirmer && [`${aConfirmer} statut${aConfirmer > 1 ? "s" : ""} à confirmer`, "attention"],
      vieux && [`${vieux} info${vieux > 1 ? "s" : ""} de plus de 30 jours`, "attention"],
    ].filter(Boolean);
    $("#synthese").replaceChildren(...puces.map(([t, ton]) => el("span", { class: "puce", "data-ton": ton || null }, t)));
    const alertes = depassees + bloques;
    $("#compteur-alertes").textContent = alertes ? String(alertes) : "";

    for (const b of $$("#filtres [data-filtre]")) b.setAttribute("aria-pressed", String(b.dataset.filtre === etat.filtre));
    const visibles = etat.filtre === "surveiller" ? ps.filter(aSurveiller) : ps;
    const zone = $("#domaines");
    if (!ps.length) { zone.replaceChildren(el("p", { class: "vide" }, "Aucun projet pour l'instant. Parle d'un sujet à Alter : il proposera de le créer.")); return; }
    if (!visibles.length) { zone.replaceChildren(el("p", { class: "vide" }, "Rien à surveiller : aucune échéance proche, aucun blocage.")); return; }
    zone.replaceChildren(...Object.keys(DOMAINES).map((d) => {
      const duDomaine = visibles.filter((p) => (p.domaine || "Z") === d);
      if (!duDomaine.length) return null;
      return el("section", { class: "domaine" },
        el("div", { class: "domaine-tete" },
          el("span", { class: "domaine-lettre", "aria-hidden": "true" }, d),
          el("h3", {}, DOMAINES[d]),
          el("span", { class: "domaine-compte" }, String(duDomaine.length))),
        el("div", { class: "projets" }, duDomaine.map(carteProjet)));
    }).filter(Boolean));
  }
  function carteProjet(p) {
    const vieux = (joursEntre(p.info_du) ?? 0) < -30;
    return el("article", { class: "projet", "data-urgence": urgence(p) || null },
      el("div", { class: "projet-ligne" },
        el("span", { class: "code" }, p.code),
        el("span", { class: "projet-nom" }, p.nom),
        el("span", { class: "statut", "data-s": p.statut || "" }, p.statut || "à confirmer")),
      p.prochaine_action ? el("div", { class: "projet-action" }, "→ ", p.prochaine_action) : null,
      el("div", { class: "projet-meta" },
        p.echeance ? el("span", { class: "echeance" }, libelleEcheance(p)) : null,
        p.experts && p.experts.length ? el("span", {}, p.experts.map((x) => EXPERTS[x] || x).join(", ")) : null,
        el("span", {}, vieux ? `Info du ${dateCourte(p.info_du)} : à rafraîchir` : p.info_du ? `Info du ${dateCourte(p.info_du)}` : ""),
        p.confidentiel ? el("span", { class: "confidentiel" }, "Confidentiel") : null),
      p.resume ? el("details", {}, el("summary", {}, "Résumé"), el("p", {}, p.resume)) : null);
  }

  // ------------------------------------------------------------------ affichage : journal
  function rendreJournal() {
    const zone = $("#journal");
    if (!etat.journal.length) { zone.replaceChildren(el("li", { class: "vide" }, "Le journal est vide.")); return; }
    zone.replaceChildren(...etat.journal.map((j) => el("li", {},
      el("time", { datetime: j.date }, dateCourte(j.date)),
      el("div", {}, el("span", { class: "genre" }, GENRES_JOURNAL[j.genre] || j.genre), j.projet ? el("span", { class: "code" }, j.projet + " · ") : null, j.texte))));
  }

  // ------------------------------------------------------------------ affichage : conversation
  const fil = () => $("#fil");
  function defilerEnBas() {
    const d = $("#defile-chat");
    requestAnimationFrame(() => { d.scrollTop = d.scrollHeight; });
  }
  function bulleMoi(texte) {
    fil().append(el("div", { class: "msg-moi" }, texte));
  }
  function blocAlter(md = "") {
    const texte = el("div", { class: "texte-alter", html: md ? markdown(md) : "" });
    const outils = el("div", { class: "outils-msg" });
    const b = el("div", { class: "msg-alter" }, el("div", { class: "signature" }, "Alter"), texte, outils);
    b._md = md;
    const ecouter = el("button", { type: "button", onclick: () => (ecouter.dataset.lecture ? Voix.taire() : Voix.lire(b._md, ecouter)) },
      icone("voix"), "Écouter");
    const copier = el("button", {
      type: "button",
      onclick: async () => {
        try { await navigator.clipboard.writeText(b._md); toast("Réponse copiée."); } catch { toast("Copie impossible ici."); }
      },
    }, icone("copie"), "Copier");
    outils.append(ecouter, copier);
    outils.hidden = !md;
    b.majTexte = (nouveau) => { b._md = nouveau; texte.innerHTML = markdown(nouveau); outils.hidden = !nouveau; };
    b.zoneTexte = texte;
    b.outils = outils;
    b.ecouter = ecouter;
    fil().append(b);
    return b;
  }
  function icone(nom) {
    const chemins = {
      voix: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
      copie: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    };
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2"); s.setAttribute("aria-hidden", "true");
    s.innerHTML = chemins[nom];
    return s;
  }

  // ---- Bloc QG à valider
  function formaterValeur(champ, v) {
    if (champ === "experts") return (v || []).map((x) => EXPERTS[x] || x).join(", ") || "—";
    if (champ === "confidentiel") return v ? "oui" : "non";
    if (champ === "domaine") return v ? `${v} · ${DOMAINES[v] || ""}` : "—";
    if (champ === "echeance") return v ? dateCourte(v) + " " + v.slice(0, 4) : "aucune";
    if (champ === "statut") return v || "à confirmer";
    return v || "—";
  }
  function champEdition(champ, valeur, id) {
    if (champ === "statut") return el("select", { id }, STATUTS.map((s) => el("option", { value: s, selected: s === valeur || null }, s || "à confirmer")));
    if (champ === "domaine") return el("select", { id }, Object.keys(DOMAINES).map((d) => el("option", { value: d, selected: d === valeur || null }, `${d} · ${DOMAINES[d]}`)));
    if (champ === "echeance") return el("input", { id, type: "date", value: valeur || "" });
    if (champ === "confidentiel") return el("select", { id }, el("option", { value: "false", selected: !valeur || null }, "non"), el("option", { value: "true", selected: valeur || null }, "oui"));
    if (champ === "experts") return el("input", { id, value: (valeur || []).join(", "), placeholder: "victor, marc…" });
    if (champ === "resume" || champ === "texte" || champ === "prochaine_action") { const t = el("textarea", { id }); t.value = valeur || ""; return t; }
    return el("input", { id, value: valeur || "" });
  }
  function lireEdition(champ, n) {
    const v = n.value;
    if (champ === "confidentiel") return v === "true";
    if (champ === "experts") return v.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)
      .map((x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")).filter((x) => x in EXPERTS);
    return v.trim();
  }
  function titreBloc(p) {
    if (p.genre === "maj_projet") {
      const projet = etat.projets.find((x) => x.code === p.code);
      return ["Mise à jour", `${p.code}${projet ? " · " + projet.nom : ""}`];
    }
    if (p.genre === "nouveau_projet") return ["Nouveau projet", p.champs.nom];
    return ["Journal", `${GENRES_JOURNAL[p.journal.genre] || p.journal.genre}${p.journal.projet ? " · " + p.journal.projet : ""}`];
  }
  function blocQG(p, statutInitial = "en_attente") {
    const [etiquette, titre] = titreBloc(p);
    const carte = el("div", { class: "bloc-qg", "data-statut": statutInitial, "data-id": p.id, role: "group", "aria-label": `Bloc QG : ${etiquette} ${titre}` });
    let edition = false;
    const rendre = (statut, message) => {
      carte.dataset.statut = statut;
      const ecarts = el("dl", { class: "ecarts" });
      const champs = p.genre === "journal" ? { texte: p.journal.texte } : p.champs;
      for (const [k, v] of Object.entries(champs)) {
        const id = `ed-${p.id}-${k}`;
        ecarts.append(el("dt", {}, el("label", { for: edition ? id : null }, k === "texte" ? "Texte" : LIBELLES_CHAMPS[k] || k)));
        if (edition) ecarts.append(el("dd", {}, champEdition(k, v, id)));
        else if (p.genre === "maj_projet" && p.avant) {
          ecarts.append(el("dd", {}, el("del", {}, formaterValeur(k, p.avant[k])), el("ins", {}, formaterValeur(k, v))));
        } else ecarts.append(el("dd", {}, el("ins", {}, k === "texte" ? v : formaterValeur(k, v))));
      }
      const actions = el("div", { class: "bloc-actions" });
      if (statut === "en_attente") {
        const valider = el("button", { type: "button", class: "btn btn-valider" }, edition ? "Valider avec mes modifications" : "Valider");
        const modifier = el("button", { type: "button", class: "btn" }, edition ? "Annuler la modification" : "Modifier");
        const rejeter = el("button", { type: "button", class: "btn" }, "Rejeter");
        valider.onclick = () => decider("valider");
        rejeter.onclick = () => decider("rejeter");
        modifier.onclick = () => { edition = !edition; rendre("en_attente"); };
        actions.append(valider, modifier, rejeter);
      } else {
        const textes = { validee: "Validé · inscrit au QG", rejetee: "Rejeté", perimee: "Périmé : la fiche a changé entre-temps" };
        actions.append(el("span", { class: "verdict", "data-statut": statut }, message || textes[statut] || statut));
      }
      carte.replaceChildren(
        el("div", { class: "bloc-tete" }, el("span", { class: "etiquette" }, "Bloc QG · " + etiquette), el("strong", {}, titre)),
        p.motif ? el("p", { class: "bloc-motif" }, p.motif) : null,
        ecarts, actions);
    };
    const decider = async (decision) => {
      let modifications;
      if (edition && decision === "valider") {
        modifications = {};
        const champs = p.genre === "journal" ? { texte: 1 } : p.champs;
        for (const k of Object.keys(champs)) {
          const n = carte.querySelector(`#ed-${CSS.escape(p.id)}-${k}`);
          if (n) modifications[k] = lireEdition(k, n);
        }
      }
      for (const b of $$("button", carte)) b.disabled = true;
      try {
        const r = await moteur.decider(p.id, decision, modifications);
        edition = false;
        if (r.statut === "perimee") { rendre("perimee", r.erreur); }
        else {
          rendre(r.statut, r.code ? `Validé · créé sous le code ${r.code}` : undefined);
          toast(r.statut === "validee" ? "QG mis à jour." : "Bloc rejeté.");
        }
        await rafraichir();
      } catch (err) {
        if (err.statut === 409) { rendre("perimee", err.message); }
        else { toast(err.message || "La décision n'a pas pu être enregistrée."); rendre("en_attente"); }
      }
    };
    rendre(statutInitial);
    etat.propositions.set(p.id, p);
    return carte;
  }

  // ---- Envoi d'un message
  async function envoyer(texte) {
    texte = texte.trim();
    if (!texte || etat.envoi) return;
    etat.envoi = true;
    $("#btn-envoyer").disabled = true;
    Voix.arreter();
    Voix.taire();
    bulleMoi(texte);
    const reponse = blocAlter("");
    const attente = el("span", { class: "reflexion" }, el("i"), el("i"), el("i"), " Alter réfléchit…");
    reponse.zoneTexte.append(attente);
    defilerEnBas();
    let md = "";
    let rafraichirApres = false;
    const majTexte = () => { reponse.majTexte(md); defilerEnBas(); };
    await moteur.envoyer(texte, {
      texte: (delta) => { md += delta; majTexte(); },
      texteComplet: (t) => { md = t; majTexte(); },
      recherche: (requete) => {
        reponse.insertBefore(el("div", { class: "recherche" }, requete ? `« ${requete} »` : ""), reponse.outils);
        defilerEnBas();
      },
      proposition: (p) => {
        fil().append(blocQG(p));
        defilerEnBas();
      },
      erreur: (message) => {
        reponse.insertBefore(el("p", { class: "erreur-msg" }, message), reponse.outils);
        defilerEnBas();
      },
      fin: () => { rafraichirApres = true; },
    });
    if (!md) attente.remove();
    etat.envoi = false;
    $("#btn-envoyer").disabled = false;
    if (md && etat.lectureAuto) Voix.lire(md, reponse.ecouter);
    if (rafraichirApres && etat.mode === "serveur") rafraichir().catch(() => {});
  }

  // ------------------------------------------------------------------ chargement
  async function rafraichir() {
    const d = await moteur.etat();
    etat.projets = d.projets || [];
    etat.journal = d.journal || [];
    etat.revue = d.revue || null;
    rendrePortefeuille();
    rendreJournal();
    rendreRevue();
    return d;
  }
  async function charger() {
    let d;
    try { d = await rafraichir(); } catch (err) { toast(err.message || "Chargement impossible."); return; }
    const f = fil();
    f.replaceChildren();
    if (etat.mode !== "serveur") {
      f.append(el("p", { class: "exemple-note" }, etat.mode === "artefact"
        ? "Version d'essai : portefeuille fictif, Claude répond depuis ton compte claude.ai, sans recherche web. Rien n'est enregistré."
        : "Mode Exemple : portefeuille fictif et réponses désactivées tant que le serveur n'est pas branché."));
    }
    for (const m of d.messages || []) {
      if (m.role === "user") bulleMoi(m.content); else blocAlter(m.content);
    }
    for (const p of d.propositions || []) f.append(blocQG(p));
    defilerEnBas();
  }
  function rendreRevue() {
    const r = etat.revue;
    const b = $("#banniere-revue");
    b.hidden = !(r && !r.lue);
    if (r) $("#revue-date").textContent = `Préparée le ${dateCourte(r.cree_le)}.`;
  }

  // ------------------------------------------------------------------ import du QG (mode serveur)
  async function preparerImport(fichier) {
    const zone = $("#apercu-import");
    zone.replaceChildren(el("p", { class: "aide-import" }, "Lecture du fichier…"));
    let contenu = await fichier.text();
    let a;
    try {
      a = await MoteurServeur.json("import", { method: "POST", body: JSON.stringify({ contenu, mode: "apercu" }) });
    } catch (err) {
      contenu = null;
      zone.replaceChildren(el("p", { class: "alerte" }, err.message || "Aperçu impossible."));
      return;
    }
    const liste = (titre, items, ouvert) => items.length
      ? el("details", { open: ouvert || null }, el("summary", {}, `${titre} (${items.length})`), el("ul", {}, items.map((t) => el("li", {}, t))))
      : null;
    const annuler = el("button", { type: "button", class: "btn" }, "Annuler");
    const importer = el("button", { type: "button", class: "btn btn-valider" },
      `Importer ${a.projets_nouveaux.length} projet${a.projets_nouveaux.length > 1 ? "s" : ""} et ${a.journal} entrée${a.journal > 1 ? "s" : ""}`);
    const fermer = () => { contenu = null; zone.replaceChildren(); $("#fichier-import").value = ""; };
    annuler.onclick = fermer;
    importer.onclick = async () => {
      importer.disabled = true; annuler.disabled = true;
      try {
        const r = await MoteurServeur.json("import", { method: "POST", body: JSON.stringify({ contenu, mode: "importer" }) });
        fermer();
        toast(`Import fait : ${r.importe.projets} projets, ${r.importe.journal} entrées de journal.`);
        await rafraichir();
      } catch (err) {
        importer.disabled = false; annuler.disabled = false;
        toast(err.message || "Import impossible.");
      }
    };
    zone.replaceChildren(el("div", { class: "apercu" },
      el("h4", {}, "Aperçu de l'import"),
      a.deja_importe ? el("p", { class: "alerte" }, "Ce fichier a déjà été importé. Rien ne sera fait.") : null,
      liste("Projets à créer", a.projets_nouveaux.map((p) => `${p.code} · ${p.nom} · ${p.domaine} · ${p.statut || "à confirmer"}${p.confidentiel ? " · confidentiel" : ""}`), true),
      liste("Codes déjà présents, laissés tels quels", a.projets_existants),
      el("p", { class: "aide-import" }, `${a.journal} entrée${a.journal > 1 ? "s" : ""} de journal, dates d'origine conservées.`),
      liste("Corrections automatiques", a.avertissements),
      liste("Éléments écartés", a.rejets, true),
      el("div", { class: "bloc-actions" }, a.deja_importe ? null : importer, annuler)));
  }

  // ------------------------------------------------------------------ notifications
  function octetsDeB64url(s) {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  }
  async function activerNotifications() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installee = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (ios && !installee) { toast("Sur iPhone : Partager → Sur l'écran d'accueil, puis ouvre Alter depuis l'icône."); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      toast("Ce navigateur ne gère pas les notifications web."); return;
    }
    if (!CONFIG.vapidPublique) { toast("Clé publique VAPID absente de config.js."); return; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { toast("Notifications refusées. Tu peux les autoriser dans les réglages."); return; }
    const reg = await navigator.serviceWorker.ready;
    const abonnement = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octetsDeB64url(CONFIG.vapidPublique) }));
    await MoteurServeur.json("push/abonner", { method: "POST", body: JSON.stringify({ endpoint: abonnement.endpoint }) });
    $("#btn-notif").setAttribute("aria-pressed", "true");
    toast("Notification activée pour la revue du lundi à 7 h 40.");
  }

  // ------------------------------------------------------------------ champ de saisie
  function ajusterChamp() {
    const c = $("#champ");
    c.style.height = "auto";
    c.style.height = Math.min(c.scrollHeight, window.innerHeight * 0.4) + "px";
  }

  // ------------------------------------------------------------------ démarrage
  function brancherInterface() {
    for (const b of $$(".onglets [data-vue]")) b.addEventListener("click", () => { etat.vue = b.dataset.vue; ecrirePref("vue", etat.vue); if (b.dataset.vue !== "chat") { etat.cote = b.dataset.vue; ecrirePref("cote", etat.cote); } appliquerVue(); });
    for (const b of $$(".cote-onglets [data-cote]")) b.addEventListener("click", () => { etat.cote = b.dataset.cote; ecrirePref("cote", etat.cote); appliquerVue(); });
    bureau.addEventListener("change", appliquerVue);
    for (const b of $$("#filtres [data-filtre]")) b.addEventListener("click", () => { etat.filtre = b.dataset.filtre; rendrePortefeuille(); });

    const champ = $("#champ");
    champ.addEventListener("input", ajusterChamp);
    champ.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && window.matchMedia("(pointer: fine)").matches) {
        e.preventDefault(); $("#form-saisie").requestSubmit();
      }
    });
    $("#form-saisie").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = champ.value;
      champ.value = ""; ajusterChamp();
      envoyer(t);
    });
    for (const b of $$("#raccourcis [data-texte]")) b.addEventListener("click", () => {
      const t = b.dataset.texte;
      if (t.endsWith(": ")) { champ.value = t; champ.focus(); ajusterChamp(); } else envoyer(t);
    });
    $("#btn-micro").addEventListener("click", () => Voix.basculer());

    const lecture = $("#btn-lecture");
    lecture.setAttribute("aria-pressed", String(etat.lectureAuto));
    lecture.addEventListener("click", () => {
      etat.lectureAuto = !etat.lectureAuto;
      ecrirePref("lectureAuto", etat.lectureAuto);
      lecture.setAttribute("aria-pressed", String(etat.lectureAuto));
      if (!etat.lectureAuto) Voix.taire();
      toast(etat.lectureAuto ? "Les réponses seront lues à voix haute." : "Lecture automatique coupée.");
    });

    $("#btn-lire-revue").addEventListener("click", async () => {
      const r = etat.revue;
      if (!r) return;
      etat.vue = "chat"; appliquerVue();
      const b = blocAlter(`**Revue de la semaine ${r.semaine || ""}**\n\n${r.texte}`);
      defilerEnBas();
      if (etat.lectureAuto) Voix.lire(b._md, b.ecouter);
      try { await moteur.revueLue(r.id); r.lue = true; rendreRevue(); } catch { /* sans gravité */ }
    });
    $("#fichier-import").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) preparerImport(f).catch(() => toast("Lecture du fichier impossible."));
    });
    $("#btn-notif").addEventListener("click", () => activerNotifications().catch(() => toast("Activation impossible.")));
    $("#btn-sortir").addEventListener("click", async () => {
      await MoteurServeur.sb.auth.signOut();
      location.reload();
    });
  }

  async function demarrer() {
    brancherInterface();
    appliquerVue();
    ajusterChamp();

    if (CONFIG.supabaseUrl && CONFIG.supabaseCleAnon) {
      etat.mode = "serveur";
      moteur = MoteurServeur;
      $("#mode").textContent = "Connecté"; $("#mode").dataset.mode = "serveur";
      $("#btn-notif").hidden = false;
      $("#zone-import").hidden = false;
      try { await MoteurServeur.init(); } catch { toast("Chargement du module de connexion impossible."); return; }
      Voix.init();
      const { data } = await MoteurServeur.sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data && data.currentLevel === "aal2") { $("#btn-sortir").hidden = false; await charger(); }
      else afficherConnexion();
    } else {
      const dansClaude = Boolean(window.claude && typeof window.claude.use === "function");
      etat.mode = dansClaude ? "artefact" : "exemple";
      $("#mode").textContent = dansClaude ? "Essai" : "Exemple";
      $("#mode").dataset.mode = etat.mode;
      await MoteurLocal.init();
      await charger();
      Voix.init();
      if (dansClaude) MoteurLocal.brancherClaude();
    }

    if ("serviceWorker" in navigator && document.documentElement.classList.contains("pwa")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    if (location.hash === "#revue") $("#btn-lire-revue").click();
  }

  demarrer();
})();
