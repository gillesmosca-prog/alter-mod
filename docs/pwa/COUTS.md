# Estimation des coûts mensuels

## Hypothèses

**Tarifs Claude Opus 5.5** (référence API Anthropic, novembre 2026), par million de tokens :

| Poste | Prix |
|---|---|
| Entrée | 4 USD |
| Sortie (réflexion comprise) | 20 USD |
| Lecture du cache | 0,20 USD |
| Écriture du cache (5 min) | environ 1,25 fois l'entrée, soit environ 5 USD |

**Recherche web** : 10 USD pour 1 000 recherches (prix de liste publié par Anthropic). Les pages lues s'ajoutent en tokens d'entrée.

**Volumes estimés pour un message :**
- prompt d'Alter et état du QG : environ 10 000 tokens, lus depuis le cache ;
- fil récent : environ 6 000 tokens, non mis en cache ;
- réponse, réflexion comprise, à l'effort moyen : environ 1 200 tokens ;
- recherche web dans environ 1 message sur 5, avec 2 recherches et environ 5 000 tokens de pages lues.

**Coût par message, environ 0,06 USD :**

| Poste | Calcul | Coût |
|---|---|---|
| Cache lu | 10 000 × 0,20 / 1 000 000 | 0,002 USD |
| Fil | 6 000 × 4 / 1 000 000 | 0,024 USD |
| Réponse | 1 200 × 20 / 1 000 000 | 0,024 USD |
| Part moyenne de la recherche web | | environ 0,008 USD |

**Coûts fixes :**
- **Début de session**, après 5 minutes d'inactivité : le cache se réécrit, environ 10 000 × 5 / 1 000 000 = 0,05 USD.
- **Revue du lundi** : environ 0,10 USD par revue, soit 0,40 USD par mois.

Ce sont des estimations : le vrai coût dépend de la longueur de tes messages et de celle des réponses. La console Anthropic donne la consommation réelle. Fixe-y une limite de dépense mensuelle.

## Trois niveaux d'usage (API Claude seule)

| Niveau | Usage type | Messages par mois | Sessions par mois | Coût API estimé par mois |
|---|---|---|---|---|
| **Léger** | 10 messages par jour, point du matin | environ 300 | environ 60 | **environ 20 à 25 USD** |
| **Moyen** | 30 messages par jour, plusieurs sessions | environ 900 | environ 150 | **environ 60 à 65 USD** |
| **Intensif** | 100 messages par jour, Conseils du Cabinet fréquents | environ 3 000 | environ 400 | **environ 200 USD** |

Ces montants sont plus élevés que l'ordre de grandeur annoncé avant validation (15 à 20, 45 et 150 USD). La différence vient de la recherche web et d'une hypothèse de fil plus longue.

### Leviers si la facture monte

Leviers réglables sans modifier le code :
- **Raccourcir le fil envoyé** : 40 derniers messages par défaut. Passer à 20 réduit le poste « fil » d'environ moitié. Réglage `lireMessages(…, 40)` dans `functions/alter/index.ts`.
- **Effort plus bas** pour les questions simples : secret `ALTER_EFFORT=low`.
- **Recherches limitées** : secret `ALTER_RECHERCHES_MAX`.

Changer de modèle (secret `ALTER_MODELE`) reste ta décision. Avec Sonnet 5.5 (2 et 10 USD par million de tokens), le coût par message serait environ divisé par deux.

## Infrastructure

| Poste | Coût | Remarque |
|---|---|---|
| Supabase | **à vérifier sur la page tarifs de Supabase** | Le plan gratuit peut suffire pour un seul utilisateur, mais ses conditions (mise en pause des projets inactifs, quotas d'Edge Functions, sauvegardes) sont à vérifier. Le plan payant ajoute sauvegardes et absence de mise en pause. Je n'ai pas pu consulter la grille à jour depuis cet environnement : aucun montant n'est avancé ici. |
| Hébergement de la PWA | 0 à quelques francs par mois | Simples fichiers statiques. Préférer un hébergeur suisse ou européen (voir NLPD.md). |
| Nom de domaine | environ 10 à 20 CHF par an selon l'extension | Ordre de grandeur, à vérifier chez le registraire. |
| Service d'e-mail (SMTP) pour les codes de connexion | 0 si celui de Supabase suffit | Un SMTP suisse peut être demandé pour la nLPD. |

## Synthèse

| Niveau | API Claude | Infrastructure | Total indicatif |
|---|---|---|---|
| Léger | environ 20 à 25 USD | Supabase (à vérifier) + domaine | environ 25 USD + Supabase |
| Moyen | environ 60 à 65 USD | idem | environ 65 USD + Supabase |
| Intensif | environ 200 USD | idem | environ 200 USD + Supabase |
