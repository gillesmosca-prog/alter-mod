# Limites par plateforme

Repères : Safari sur iOS et iPadOS, Chrome ou Edge sur Android, Safari, Chrome ou Edge sur Mac, Chrome ou Edge sur Windows. Les comportements des navigateurs évoluent : chaque point marqué « à tester » doit être vérifié sur ton appareil avant de t'y fier.

## Installation

| Plateforme | Comment installer | Remarques |
|---|---|---|
| iPhone, iPad | Safari → Partager → « Sur l'écran d'accueil » | Seul Safari installe une application web qui reçoit des notifications. L'application installée a son propre stockage, séparé de Safari : il faut s'y reconnecter une fois. |
| Android | Chrome → menu → « Installer l'application », ou bannière proposée par Chrome | Icône adaptative (« maskable ») fournie. |
| Mac | Safari 17 ou plus récent : Fichier → « Ajouter au Dock ». Chrome ou Edge : icône d'installation dans la barre d'adresse | Fenêtre indépendante, raccourci « Revue » dans le menu de l'icône (Chrome et Edge). |
| Windows | Chrome ou Edge : icône d'installation dans la barre d'adresse | Apparaît dans le menu Démarrer, épinglable. |

## Notifications : revue du lundi à 7 h 40 (heure de Genève)

Fonctionnement commun :
- un déclencheur de la base (pg_cron) appelle la fonction `alter-revue` le lundi à 5 h 40 et 6 h 40 UTC ;
- la fonction vérifie qu'il est 7 h 40 à Genève, à 10 minutes près, ce qui couvre l'heure d'été et l'heure d'hiver ;
- elle prépare la revue, puis envoie une notification sans contenu, et le téléphone affiche « Ta revue du lundi est prête ».

Rien ne dépend d'un minuteur sur l'appareil. Aucune plateforme ne permet à une page web de programmer une notification locale à heure fixe, d'où le passage obligé par le serveur.

| Plateforme | Ce qui marche | Limites |
|---|---|---|
| **iPhone, iPad** | Notifications Web Push pour les applications web ajoutées à l'écran d'accueil, depuis iOS et iPadOS 16.4. | Il faut avoir installé l'application **et** l'ouvrir depuis l'icône : dans un onglet Safari, pas de notification. L'autorisation se demande en touchant le bouton « Revue du lundi » dans l'application, jamais automatiquement. Le mode Concentration, le résumé programmé d'iOS ou les économies d'énergie peuvent retarder ou regrouper l'affichage : l'heure exacte n'est pas garantie. Si l'application est supprimée de l'écran d'accueil, l'abonnement disparaît. À tester : réception d'une notification sans contenu sur ton modèle et ta version d'iOS. |
| **Android** | Web Push via Chrome, même application fermée. | Les économies de batterie du fabricant peuvent retarder la réception. Autoriser les notifications de Chrome dans les réglages Android. |
| **Mac** | Web Push dans Safari 16 ou plus récent, Chrome et Edge. | Chrome ou Edge doivent tourner, au moins en arrière-plan, pour recevoir. Autorisation dans Réglages Système → Notifications. |
| **Windows** | Web Push dans Chrome et Edge. | Le navigateur doit tourner, ou être autorisé à rester en arrière-plan. L'assistant de concentration peut masquer la notification. |

Si une notification échoue avec les codes 404 ou 410, l'abonnement est supprimé automatiquement. Il suffit alors de toucher de nouveau « Revue du lundi ».

## Dictée vocale

| Plateforme | Dans la PWA | Repli |
|---|---|---|
| iPhone, iPad | Reconnaissance vocale de Safari (API `webkitSpeechRecognition`) si la dictée est activée dans les réglages. **À tester** dans l'application installée, où le comportement a varié selon les versions d'iOS. | Micro du clavier iOS : marche toujours. |
| Android | Chrome : reconnaissance vocale du navigateur. | Micro du clavier Google. |
| Mac | Safari et Chrome. | Dictée de macOS : touche Fn ou micro du clavier. |
| Windows | Chrome et Edge. | Dictée de Windows : Windows + H. |
| Firefox (toutes plateformes) | Pas de reconnaissance vocale : le bouton micro est masqué. | Dictée du système. |

Confidentialité : avec Chrome, l'audio de la dictée est traité par les serveurs de Google ; avec Safari, par Apple ou sur l'appareil selon le modèle. Un avertissement s'affiche à la première utilisation. Voir NLPD.md.

## Lecture à voix haute

Synthèse vocale du navigateur (`speechSynthesis`), voix française du système.
- **iPhone :** la première lecture doit partir d'un geste (bouton « Écouter »). La lecture automatique marche ensuite tant que l'application reste au premier plan, et s'arrête si l'écran se verrouille.
- **Android, Mac, Windows :** les voix disponibles dépendent du système. Sur Windows, installer une voix française si aucune n'est proposée (Paramètres → Heure et langue → Voix).

## Hors ligne

L'interface s'ouvre sans réseau, puisqu'elle est en cache, mais elle n'affiche ni portefeuille ni conversation. C'est voulu : aucune donnée n'est gardée sur l'appareil.

## Version d'essai claude.ai

Pas d'installation ni de notification : claude.ai interdit les service workers dans un artefact. La dictée passe par la fonction de claude.ai (Chrome, Edge, application de bureau) et la lecture par la voix de claude.ai ou celle du navigateur.
