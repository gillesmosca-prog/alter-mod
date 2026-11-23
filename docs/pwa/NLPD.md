# Points à valider avec l'avocat et l'hébergeur (nLPD)

Ce document n'est pas un avis juridique. Il liste les questions à trancher avant de mettre de vraies données, notamment les fiches confidentielles et les noms de clients, dans l'application. Pour chaque point, il indique ce que fait l'architecture aujourd'hui.

## 1. Rôles et cadre

| Question | Contexte technique |
|---|---|
| Qui est responsable du traitement : Gilles à titre personnel, MentorLab SA ou Pragma Partners ? | Un seul utilisateur. Le portefeuille contient des données de clients et de prospects (noms, projets, parfois des informations confidentielles). |
| Faut-il inscrire ce traitement au registre des activités de traitement (art. 12 nLPD) ? | Finalité : pilotage des projets et aide à la décision. |
| Une analyse d'impact (art. 22 nLPD) est-elle nécessaire ? | À apprécier selon la nature des données clients. L'usage d'IA générative et le transfert hors de Suisse sont des éléments à peser. |

## 2. Sous-traitants et contrats

| Sous-traitant | Rôle | À obtenir ou vérifier |
|---|---|---|
| Supabase | Base de données, authentification, Edge Functions | Contrat de sous-traitance (DPA), liste des sous-traitants ultérieurs, région d'hébergement, localisation des sauvegardes et des journaux. |
| Anthropic (API Claude) | Génération des réponses, recherche web | Conditions commerciales et DPA de l'API, durée de conservation des requêtes, usage ou non des données pour l'entraînement (selon les conditions commerciales en vigueur), possibilité de conservation nulle et à quelles conditions, lieu de traitement. |
| Fournisseur de recherche web utilisé par Anthropic | Exécute les requêtes de recherche | Les requêtes de recherche sortent vers un tiers : Alter a pour consigne de ne jamais y mettre de nom de client ni de donnée confidentielle. Vérifier que cette règle est suffisante. |
| Hébergeur de la PWA (fichiers statiques) | Sert l'interface | Journaux d'accès (adresses IP), localisation. Aucune donnée du portefeuille ne transite par lui. |
| Apple, Google, Mozilla (Web Push) | Acheminent la notification du lundi | La notification est vide. Seule l'adresse d'abonnement technique est connue d'eux. |
| Google ou Apple (dictée du navigateur) | Reconnaissance vocale | L'audio de la dictée peut être envoyé à leurs serveurs. Faut-il désactiver le bouton micro et s'en tenir à la dictée du clavier pour les sujets confidentiels ? |
| Service d'e-mail de Supabase (ou SMTP personnalisé) | Envoi du code de connexion | Adresse e-mail du propriétaire uniquement. |

## 3. Transferts à l'étranger (art. 16 et 17 nLPD)

- **Région Supabase :** vérifier si une région en Suisse est proposée, sinon choisir une région de l'UE, pays reconnu comme adéquat par le Conseil fédéral. Faire confirmer où vont les sauvegardes.
- **Anthropic** est une société américaine. Vérifier :
  - si elle est certifiée au Swiss-U.S. Data Privacy Framework ;
  - sinon, quelles clauses contractuelles types s'appliquent ;
  - si une option de localisation du traitement existe et ce qu'elle couvre.
- **Recherche web :** le lieu de traitement est à confirmer.

## 4. Secret professionnel et confidentialité contractuelle

- Certaines fiches portent sur des cessions, des négociations ou des données financières de clients. Les accords de confidentialité ou les mandats signés avec ces clients autorisent-ils leur traitement par des prestataires d'IA et d'hébergement ?
- Faut-il exclure de l'application certaines catégories de projets, ou les garder « confidentielles » avec un texte volontairement générique ?

## 5. Sécurité (art. 8 nLPD et OPDo)

Ce qui est en place, à faire valider comme adéquat :
- chiffrement applicatif AES-256-GCM des contenus en base, clé hors base ;
- accès réservé à un compte, code e-mail et second facteur TOTP obligatoires ;
- aucune lecture directe de la base depuis le navigateur ;
- aucune donnée confidentielle stockée sur l'appareil ;
- dépôt de code public sans secret ni prompt personnel.

Limites connues à accepter ou à corriger :
- un administrateur Supabase disposant des secrets peut déchiffrer ;
- Claude voit les contenus en clair ;
- le jeton de session reste dans le navigateur, sauf si l'option sans persistance est choisie.

## 6. Durées de conservation et droits

- Fixer une durée de conservation pour le fil de conversation : il n'y a aujourd'hui pas de purge automatique. Proposition : 12 mois pour les messages, durée du projet pour les fiches et le journal.
- Prévoir l'export et la suppression complète, de soi-même et à la demande d'un client mentionné : aujourd'hui par requête SQL, ou en supprimant le compte, ce qui efface toutes les tables en cascade.
- Sauvegardes : la clé de chiffrement doit être sauvegardée à part. Sans elle, les sauvegardes sont illisibles. Est-ce acceptable comme moyen d'effacement ?

## 7. Questions à l'hébergeur (Supabase ou alternative suisse)

1. Région disponible en Suisse, et à défaut localisation exacte de la région UE retenue, sauvegardes comprises.
2. Qui, chez l'hébergeur, peut accéder aux secrets des Edge Functions et à la base, et comment ces accès sont journalisés.
3. Durée de conservation des journaux des Edge Functions. Le code n'y écrit pas de contenu, seulement les erreurs techniques.
4. Possibilité d'utiliser un SMTP suisse pour les e-mails de connexion.
5. Engagements de disponibilité et procédure de restauration.

## 8. Avant d'importer le portefeuille réel

Il faut l'accord explicite de Gilles et l'avis de l'avocat sur les points 2, 3 et 4. D'ici là, l'application tourne avec un portefeuille vide (mode serveur) ou fictif (mode Exemple et version d'essai).
