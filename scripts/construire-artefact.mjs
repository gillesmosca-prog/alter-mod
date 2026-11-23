#!/usr/bin/env node
// Assemble la version « artefact claude.ai » d'Alter à partir des fichiers de la PWA :
// un seul fichier HTML, CSS et JS en ligne, sans manifeste ni service worker
// (claude.ai ne les autorise pas). Même code que la PWA, en mode Essai.
//
// Utilisation : node scripts/construire-artefact.mjs  →  pwa/artefact.html

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..", "pwa");
const lire = (f) => readFileSync(join(racine, f), "utf8");

const html = lire("index.html");
const corps = html.slice(html.indexOf("<body>") + "<body>".length, html.lastIndexOf("</body>"))
  .replace(/<script\b[^>]*src=[^>]*><\/script>\s*/g, "")
  .trim();
const css = lire("styles.css");
const js = lire("app.js").replace(/<\/script/gi, "<\\/script");

const sortie = `<title>Alter</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css}
</style>
${corps}
<script>
${js}
</script>
`;
writeFileSync(join(racine, "artefact.html"), sortie);
console.log("pwa/artefact.html écrit :", Math.round(sortie.length / 1024), "Ko");
