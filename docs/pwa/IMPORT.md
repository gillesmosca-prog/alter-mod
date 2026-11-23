# Reprise du portefeuille : QG claude.ai → Supabase

C'est une opération unique, à lancer seulement après le feu vert de ton avocat (voir la note nLPD, section 8) et une fois l'application déployée.

## 1. Produire l'export

Le QG vit dans claude.ai. L'export se fait donc depuis une conversation Claude qui a la skill « Alter et le Cabinet » et l'accès aux données du QG. Demande-lui :

> Exporte tout le QG (projets et journal) au format alter-qg-export version 1, dans un fichier JSON à télécharger. N'en garde aucune copie ailleurs.

Le fichier attendu :

```json
{
  "format": "alter-qg-export",
  "version": 1,
  "exporte_le": "2026-11-23T08:00:00Z",
  "projets": [
    { "code": "P01", "nom": "…", "domaine": "A", "statut": "en cours", "resume": "…",
      "prochaine_action": "…", "echeance": "2026-12-01", "experts": ["victor", "paul"],
      "confidentiel": false, "info_du": "2026-11-20" }
  ],
  "journal": [
    { "date": "2026-11-20T09:00:00Z", "genre": "decision", "texte": "…", "projet": "P01" }
  ]
}
```

Les champs reprennent ceux du QG. Les champs inconnus sont ignorés.

**Ce fichier contient ton portefeuille en clair**, fiches confidentielles comprises. Ne le mets ni dans le dépôt, ni dans un partage, ni en pièce jointe d'un e-mail. Supprime-le après l'import, corbeille comprise.

## 2. Importer depuis l'application

1. Connecte-toi à l'application déployée.
2. Va dans l'onglet Portefeuille, en bas : **Importer un export du QG**, puis choisis le fichier.
3. Un aperçu s'affiche. Rien n'est encore enregistré :
   - **projets à créer** : code, nom, domaine, statut, mention confidentielle ;
   - **codes déjà présents** : laissés tels quels, jamais écrasés ;
   - **nombre d'entrées de journal**, dont les dates d'origine sont conservées ;
   - **corrections automatiques** : domaine inconnu classé en Z, statut inconnu mis « à confirmer », expert inconnu ignoré, échéance illisible laissée vide ;
   - **éléments écartés** : code invalide, doublon, entrée sans texte ou sans date lisible.
4. **Importer** chiffre et enregistre tout. **Annuler** n'écrit rien.

Le fichier n'est lu qu'en mémoire : il n'est conservé ni dans le navigateur ni sur le serveur. Le serveur ne garde que son empreinte, qui empêche de l'importer une seconde fois.

## 3. Après l'import

- Vérifie quelques fiches, en particulier les confidentielles.
- Décide du sort du QG claude.ai. Recommandation : le garder lisible un mois, puis le mettre en veille.
- Supprime le fichier d'export.

## Limites

- Au plus 500 projets et 5 000 entrées de journal par fichier, et 5 Mo.
- L'import n'écrase jamais une fiche existante. Pour reprendre une fiche déjà présente, valide une mise à jour proposée par Alter dans l'application.
- Le fil de conversation du QG n'est pas repris. Ce sont des échanges passés, et ils ne sont pas nécessaires au fonctionnement.
