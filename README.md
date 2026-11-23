# Alter : le widget vivant de ton directeur de cabinet

Assistant alter ego sur téléphone et PC, dans tes sessions Claude.

Alter est un mod pour Claude Code. Il ajoute à côté du chat une petite carte animée : l'avatar d'Alter réagit à ce que fait Claude (il réfléchit, travaille, te répond), affiche l'action en cours, le début de sa dernière réponse et les experts du Cabinet qui ont parlé. Agrandie, la carte permet de lui écrire, de lancer des raccourcis (point du jour, revue des statuts, trois priorités, réunir le Cabinet, avocat du diable, noter une décision) et d'interpeller l'un des 18 experts d'un clic.

Le mod fonctionne de la même façon sur **Windows** et sur **Mac** : il tourne à l'intérieur de Claude Code et n'utilise rien de propre au système.

## Installer

### Dans l'application Claude (Windows ou Mac)

1. Clique sur **+** à côté de la zone de message, puis **Plugins**.
2. **Add marketplace** et saisis : `gillesmosca-prog/alter-mod`
3. **Add plugin**, puis choisis **alter**.

### Depuis un terminal (PowerShell sous Windows, Terminal sous Mac)

Dans une session Claude Code :

```
/plugin install alter --marketplace gillesmosca-prog/alter-mod
```

Ou directement depuis le terminal :

```
claude plugin install alter --marketplace gillesmosca-prog/alter-mod
```

Réponds `y` pour ajouter la source, puis choisis la portée « user » pour l'avoir dans toutes tes sessions.

### Dépôt privé

Si le dépôt est privé, il faut y avoir été invité sur GitHub et que l'ordinateur ait déjà un accès Git à github.com (par exemple `gh auth login` puis `gh auth setup-git`). L'installation ne demande pas de mot de passe.

## Utiliser

- La carte s'ouvre seule au démarrage d'une session. Commande pour la rouvrir : `/alter`.
- Petite carte : à lire d'un coup d'œil. Agrandis-la pour écrire à Alter et utiliser les boutons.
- Réglage facultatif **Lien du QG** (menu de configuration des plugins) : l'adresse `https://` de ta page QG. Vide, le lien n'est pas affiché.

Le mod se marie avec la skill « Alter et le Cabinet » ; sans elle, Claude répond normalement aux messages préparés par les boutons.

## Alter en application (PWA)

Le dossier `pwa/` contient Alter sous forme d'application web installable sur iPhone, Android, Mac et Windows : conversation en français, dictée et lecture à voix haute, portefeuille par domaine, blocs QG à valider, revue du lundi à 7 h 40. Le serveur (`supabase/`) garde la clé d'API et chiffre les données. Architecture, déploiement, limites par plateforme, coûts et points nLPD : [docs/pwa](./docs/pwa/README.md).

## Licence

Apache 2.0, voir [LICENSE](./LICENSE).
