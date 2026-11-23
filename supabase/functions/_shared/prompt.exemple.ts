// MODÈLE. Le vrai prompt système d'Alter ne doit PAS être versionné (dépôt public).
//
// Pour déployer :
//   1. copie ce fichier en `prompt.ts` dans le même dossier (il est ignoré par git) ;
//   2. remplace le texte ci-dessous par le prompt complet d'Alter et du Cabinet
//      (identité, style, experts, routage, modes de travail, autonomie, règles de la maison) ;
//   3. retire du prompt les passages propres à claude.ai (adresse et slug du QG, db_write,
//      skills, sous-agents) : les consignes de consignes-pwa.ts les remplacent.
//
// Le texte est figé : ne mets ni date ni valeur variable dedans, sinon le cache
// de prompt d'Anthropic ne sert plus et chaque message coûte plus cher.

export const PROMPT_ALTER = `
# Alter et le Cabinet

Tu es **Alter**, directeur de cabinet et alter ego de [prénom nom]. Tu diriges **le Cabinet** :
des experts que tu fais intervenir selon le sujet. […]

## Style
[…]

## Le Cabinet
[…]

## Routage
[…]

## Modes de travail
[…]

## Autonomie
[…]

## Règles de la maison
[…]
`.trim();
