# La Blocklist

**Une extension Chrome pour ignorer (ou bloquer) une liste de comptes Threads et Instagram.**

- **Masquer sans bloquer** (par défaut) : les publications des comptes de votre liste restent dans
  votre fil mais sont recouvertes d'un emoji. Vous les voyez passer sans les lire ni interagir.
- **Liste de départ** : en un clic, ajoutez la liste « On bloque l'extrême droite » publiée sur
  [onbloquelextremedroite.fr](https://www.onbloquelextremedroite.fr/liste), tenue à jour chaque jour.
- **Exporter** : récupère la liste de tous les comptes que vous avez bloqués, dans un fichier.
- **Importer** : charge une liste de comptes (la vôtre, ou celle qu'un ami vous a envoyée).
- **Partir d'un compte** : prend la liste des comptes que suit un compte Threads comme liste à bloquer.
- **Bloquer depuis un fil** : un petit bouton « Bloquer » à côté de chaque auteur, directement sur
  threads.com et instagram.com.
- **Choisir** : vous cochez ou décochez chaque compte avant de lancer.
- **Bloquer** : l'extension bloque les comptes cochés, un par un, sur **votre** compte Threads ou
  Instagram (au choix).

Pas de compte à créer, pas de mot de passe demandé, rien n'est envoyé à un serveur : tout se passe
dans votre Chrome, où vous êtes déjà connecté à Threads et/ou Instagram.

> **Instagram** : le blocage d'une liste et le bouton « Bloquer » fonctionnent aussi sur Instagram.
> L'export de vos blocages et la lecture des abonnements d'un compte restent pour l'instant
> réservés à Threads.

---

## 1. Installer (5 minutes)

L'extension n'est pas sur le Chrome Web Store : on l'installe à la main, une seule fois.

1. **Téléchargez** le fichier `la-blocklist-extension-….zip` sur la page
   [Releases](https://github.com/axel17460-hash/Thread-account-blocker/releases/latest).
2. **Décompressez-le** (clic droit › *Extraire tout…*) dans un dossier que vous ne supprimerez pas,
   par exemple `Documents\La Blocklist`. Chrome lit l'extension dans ce dossier à chaque démarrage.
3. Dans Chrome, tapez `chrome://extensions` dans la barre d'adresse.
4. En haut à droite, activez **Mode développeur**.
5. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier décompressé
   (celui qui contient `manifest.json`).
6. Cliquez sur l'icône puzzle 🧩 de la barre d'outils et **épinglez** La Blocklist.
7. Vérifiez que vous êtes connecté sur [instagram.com](https://www.instagram.com) et/ou
   [threads.com](https://www.threads.com) dans ce Chrome.

Cliquez sur l'icône La Blocklist : la page de l'outil s'ouvre.

> Au démarrage, Chrome peut afficher un avertissement sur les « extensions en mode développeur » :
> c'est normal pour une extension installée de cette façon.

## 2. Utiliser

La page La Blocklist a trois parties.

### Ajouter la liste de départ « On bloque l'extrême droite »

En haut de **1. Importer une liste**, la carte **Liste de départ** propose la liste de comptes
Instagram (personnalités, fachosphère, partis et médias) publiée par MISE AU POING sur
[onbloquelextremedroite.fr](https://www.onbloquelextremedroite.fr/liste). Cliquez sur
**Ajouter à ma liste** : ses comptes s'ajoutent à votre liste, tous cochés, avec leur nom à côté du
pseudo. Si votre liste était vide, le réseau passe tout seul sur **Instagram**.

Relisez-la, décochez ceux que vous ne voulez pas bloquer, puis cliquez sur **Démarrer** comme pour
n'importe quelle liste.

**Mise à jour automatique** (cochée par défaut) : chaque jour, et au démarrage de Chrome, l'extension
retélécharge la liste du site. Les nouveaux comptes sont ajoutés à votre liste et ceux que le site a
retirés en sont enlevés ; les comptes que vous avez ajoutés vous-même ne sont jamais touchés. L'icône
de l'extension affiche alors un badge **+N**, et la carte indique ce qui a changé et quand.
**Rien n'est bloqué sans vous** : relancez **Démarrer** pour bloquer les nouveaux comptes (ceux déjà
traités sont sautés). **Vérifier les mises à jour maintenant** force une vérification.

Si vous remplacez ensuite votre liste (fichier importé, abonnements d'un compte), la liste de départ
n'en fait plus partie et ses mises à jour ne la réintroduisent pas ; la carte propose de l'ajouter à
nouveau.

### Bloquer quelqu'un depuis un fil

Sur threads.com et instagram.com, un petit bouton **Bloquer** apparaît à côté du nom de chaque
auteur, dans les publications, les réponses et les commentaires (jamais à côté de votre propre nom). Un clic bloque le compte tout
de suite, sans quitter la page : un onglet s'ouvre en arrière-plan quelques secondes, bloque le
profil, puis se referme. Le bouton passe à **Blocage…** puis **Bloqué** (en vert). Si vous cliquez
sur plusieurs noms, ils sont bloqués l'un après l'autre.

Le blocage se fait sur le réseau où vous cliquez : un bouton sur Instagram bloque sur Instagram.
Pour débloquer, passez par le profil du compte (bouton « Débloquer ») ou par les réglages du réseau
(*Profils bloqués* sur Threads, *Comptes bloqués* sur Instagram).

### Exporter vos blocages (pour les sauvegarder ou les partager)

Dans **3. Exporter mes blocages actuels**, choisissez le format (`.txt` conseillé) et cliquez sur
**Exporter**. Un onglet Threads s'ouvre sur *Réglages › Confidentialité › Profils bloqués*, la
liste défile toute seule, puis un fichier `la-blocklist-bloques-AAAA-MM-JJ.txt` est téléchargé.
Comptez environ 25 secondes pour 500 comptes. **Ne touchez à rien pendant ce temps** : ni à l'onglet
Threads, ni à la souris dessus. Pendant toute l'opération, l'onglet Threads est recouvert d'un voile
« La Blocklist travaille dans cet onglet : ne touchez à rien » qui affiche l'étape en cours et bloque
les clics et le défilement ; la page La Blocklist affiche le même avancement en haut.

C'est ce fichier que vous envoyez à quelqu'un pour qu'il bloque les mêmes comptes.

### Importer une liste

Dans **1. Importer une liste**, choisissez le fichier reçu (ou collez des comptes dans la zone de
texte), puis cliquez sur **Charger la liste**. Le résumé indique combien de comptes sont valides.

Formats acceptés :

- `.txt` : un compte par ligne, écrit `@pseudo`, `pseudo` ou lien de profil
  (`https://www.threads.com/@pseudo`). Une ligne qui commence par `#` est ignorée.
- `.csv` : une colonne `username` (ou `handle`, `user`, `account`…), sinon la première colonne.
- `.json` : une liste de pseudos, ou d'objets `{"username": "..."}`.

### Partir des abonnements d'un compte

Toujours dans **1. Importer une liste**, saisissez un pseudo (ou un lien de profil) et cliquez sur
**Lire ses abonnements**. Un onglet Threads passe au premier plan, ouvre la liste des comptes que ce
compte suit (*Suivi(e)s*) et la fait défiler. Comptez environ 4 minutes pour 800 comptes, et ne
touchez pas à cet onglet tant que le bandeau « Traitement en cours » est affiché.

La liste lue remplace la liste à traiter : relisez-la et décochez ceux que vous ne voulez pas bloquer
(un ami, un média…). **Télécharger les cochés** l'enregistre dans un fichier pour la partager.

> Threads n'affiche pas toujours toute la liste d'un autre compte (lors des essais : 828 comptes sur
> 1 235 annoncés). L'extension l'indique quand la lecture est partielle. Un compte privé que vous ne
> suivez pas ne peut pas être lu.

### Masquer sans bloquer (recommandé)

Bloquer n'est pas toujours le meilleur choix : un compte bloqué ne vous est plus montré du tout. La
Blocklist propose donc d'abord de **les ignorer** : dans **2. Ignorer ou bloquer les comptes cochés**,
l'option **Masquer leurs publications, sans les bloquer** est cochée par défaut.

Sur threads.com et instagram.com, chaque publication, réponse ou commentaire d'un compte coché reste à
sa place et à sa taille dans votre fil, mais il est recouvert d'un emoji qui apparaît en sautillant
(🫧 🙈 🌸 🍿 ✨…) avec la mention « @pseudo · masqué par La Blocklist ». Le cache empêche aussi de
cliquer dessus : pas d'ouverture, pas de « J'aime », pas de réponse par erreur. Pour le réseau, la
publication vous a été montrée et vous ne vous y êtes pas intéressé.

- Rien n'est envoyé à Threads ni à Instagram, et personne n'est bloqué.
- L'effet est immédiat : décochez un compte et ses publications réapparaissent, décochez l'option et
  tout redevient normal.
- Cela fonctionne avec la liste de départ comme avec votre propre liste.

### Choisir les comptes

Sous **2. Ignorer ou bloquer les comptes cochés**, chaque compte de la liste apparaît avec une case,
**toutes cochées** au départ. Décochez ceux que vous voulez laisser tranquilles :

- la **recherche** filtre la liste ;
- **Tout cocher** / **Tout décocher** s'appliquent aux comptes affichés (pratique après une recherche).

Vos choix sont gardés, même si vous fermez la page.

### Bloquer

1. Choisissez le **Réseau** : Threads ou Instagram. Chaque réseau garde sa propre progression : une
   liste déjà appliquée sur Threads peut ensuite l'être sur Instagram.
2. Laissez les pauses par défaut et le maximum par session : 8 à 20 secondes et 100 comptes sur
   Threads ; **30 à 60 secondes et 30 comptes sur Instagram**, qui limite davantage l'automatisation.
3. Cliquez sur **Démarrer** et confirmez.
4. Sur Threads, l'extension lit d'abord vos **profils bloqués** dans les réglages (un onglet passe au
   premier plan quelques secondes, environ 25 s pour 500 comptes) : les comptes de la liste que vous
   bloquez déjà sont marqués « déjà bloqué » sans visiter leur profil. Pour une toute petite liste,
   vous pouvez décocher l'option « Lire d'abord mes profils bloqués ». Sur Instagram, chaque profil
   est vérifié un par un.
5. Un onglet passe ensuite d'un profil à l'autre pour les comptes restants. **Laissez la page
   La Blocklist ouverte et ne touchez pas à cet onglet** tant que le traitement n'est pas terminé :
   y cliquer ou y naviguer peut faire échouer des blocages.

Chaque compte affiche son résultat :

| Résultat | Signification |
| --- | --- |
| **bloqué** | le compte vient d'être bloqué |
| **déjà bloqué** | il l'était déjà, rien n'a changé |
| **introuvable** | le compte n'existe plus ou a changé de nom |
| **échec** | l'étape n'a pas abouti ; il sera retenté au prochain lancement |

**Arrêter** interrompt proprement. Relancer **Démarrer** reprend là où vous en étiez : les comptes
déjà traités sont sautés. Avec une longue liste, faites 100 comptes, puis relancez plus tard.

## 3. Bon à savoir

- **Prudence avec votre compte** : l'extension clique dans Threads et Instagram comme vous le
  feriez, ce que les conditions d'utilisation de Meta ne prévoient pas. Bloquer des centaines de
  comptes trop vite peut entraîner des limitations temporaires, plus vite sur Instagram (message
  « Réessayez plus tard ») : gardez les pauses et le maximum par session, et arrêtez pour la journée
  si Instagram affiche ce message.
- **Relisez une liste reçue** avant de l'appliquer. Débloquer se fait un compte à la fois.
- **Arrêt automatique** après 5 échecs de suite, ou si votre session Threads a expiré : reconnectez-vous
  sur threads.com, puis relancez.
- L'extension a été vérifiée sur le vrai Threads et le vrai Instagram (interface en français,
  octobre 2026). Si l'un d'eux change son site, une étape peut se mettre à échouer : signalez-le dans les
  [Issues](https://github.com/axel17460-hash/Thread-account-blocker/issues).

## 4. Mettre à jour

Téléchargez le nouveau zip, remplacez le contenu de votre dossier `La Blocklist` par celui du zip, puis
dans `chrome://extensions` cliquez sur la flèche ↻ de la carte La Blocklist.

## 5. Problèmes fréquents

- **« Session Threads absente ou expirée »** : connectez-vous sur threads.com dans ce Chrome, puis relancez.
- **L'extension a disparu** : le dossier a été déplacé ou supprimé. Remettez-le, puis rechargez-la
  depuis `chrome://extensions`.
- **Des « échec »** : vérifiez que vous n'avez pas utilisé l'onglet Threads de travail pendant le
  traitement, puis relancez **Démarrer** : les comptes en échec sont retentés, et ceux qui avaient
  en fait été bloqués s'affichent « déjà bloqué ».
- **Beaucoup d'« échec » sans toucher à l'onglet** : Threads a peut-être changé son interface.
  Arrêtez et signalez-le.

---

## Pour les développeurs

Le code de l'extension est dans [`extension/`](extension/) (Manifest V3, sans dépendance) :

- `app.html` / `app.js` : la page de l'outil ;
- `content.js` : le script injecté dans Threads ; tous les libellés repérés (« Plus », « Bloquer »,
  « Profils bloqués »…) sont regroupés en tête de fichier ;
- `lib.js` : la logique pure (lecture des listes, reprise, plafond).

```bash
node --test extension/tests/lib.test.mjs   # logique pure
node extension/tests/e2e.mjs               # extension chargée dans Chromium face à un faux Threads local
```

Le test de bout en bout a besoin du paquet npm `playwright`, de son Chromium et d'`openssl`. Il
vérifie la mécanique, pas les libellés du vrai Threads.

Pour créer le zip d'une release :

```bash
cd extension && zip -r ../la-blocklist-extension.zip . -x 'tests/*'
```

Le dossier [`blockedex/`](blockedex/) contient une ancienne version en ligne de commande Python. Elle
n'est plus maintenue et n'a pas reçu les corrections faites sur le vrai site.
