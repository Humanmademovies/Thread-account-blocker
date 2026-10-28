# blockedex

**Une extension Chrome pour bloquer d'un coup une liste de comptes Threads, et pour sauvegarder ou
partager vos propres blocages.**

- **Exporter** : récupère la liste de tous les comptes que vous avez bloqués, dans un fichier.
- **Importer** : charge une liste de comptes (la vôtre, ou celle qu'un ami vous a envoyée).
- **Choisir** : vous cochez ou décochez chaque compte avant de lancer.
- **Bloquer** : l'extension bloque les comptes cochés, un par un, sur **votre** compte Threads.

Pas de compte à créer, pas de mot de passe demandé, rien n'est envoyé à un serveur : tout se passe
dans votre Chrome, où vous êtes déjà connecté à Threads.

---

## 1. Installer (5 minutes)

L'extension n'est pas sur le Chrome Web Store : on l'installe à la main, une seule fois.

1. **Téléchargez** le fichier `blockedex-extension-….zip` sur la page
   [Releases](https://github.com/axel17460-hash/Thread-account-blocker/releases/latest).
2. **Décompressez-le** (clic droit › *Extraire tout…*) dans un dossier que vous ne supprimerez pas,
   par exemple `Documents\blockedex`. Chrome lit l'extension dans ce dossier à chaque démarrage.
3. Dans Chrome, tapez `chrome://extensions` dans la barre d'adresse.
4. En haut à droite, activez **Mode développeur**.
5. Cliquez sur **Charger l'extension non empaquetée** et choisissez le dossier décompressé
   (celui qui contient `manifest.json`).
6. Cliquez sur l'icône puzzle 🧩 de la barre d'outils et **épinglez** blockedex.
7. Vérifiez que vous êtes connecté sur [threads.com](https://www.threads.com) dans ce Chrome.

Cliquez sur l'icône blockedex : la page de l'outil s'ouvre.

> Au démarrage, Chrome peut afficher un avertissement sur les « extensions en mode développeur » :
> c'est normal pour une extension installée de cette façon.

## 2. Utiliser

La page blockedex a trois parties.

### Exporter vos blocages (pour les sauvegarder ou les partager)

Dans **3. Exporter mes blocages actuels**, choisissez le format (`.txt` conseillé) et cliquez sur
**Exporter**. Un onglet Threads s'ouvre sur *Réglages › Confidentialité › Profils bloqués*, la
liste défile toute seule, puis un fichier `blockedex-bloques-AAAA-MM-JJ.txt` est téléchargé.
Comptez environ 25 secondes pour 500 comptes.

C'est ce fichier que vous envoyez à quelqu'un pour qu'il bloque les mêmes comptes.

### Importer une liste

Dans **1. Importer une liste**, choisissez le fichier reçu (ou collez des comptes dans la zone de
texte), puis cliquez sur **Charger la liste**. Le résumé indique combien de comptes sont valides.

Formats acceptés :

- `.txt` : un compte par ligne, écrit `@pseudo`, `pseudo` ou lien de profil
  (`https://www.threads.com/@pseudo`). Une ligne qui commence par `#` est ignorée.
- `.csv` : une colonne `username` (ou `handle`, `user`, `account`…), sinon la première colonne.
- `.json` : une liste de pseudos, ou d'objets `{"username": "..."}`.

### Choisir les comptes

Sous **2. Appliquer les blocages**, chaque compte de la liste apparaît avec une case, **toutes
cochées** au départ. Décochez ceux que vous ne voulez pas bloquer :

- la **recherche** filtre la liste ;
- **Tout cocher** / **Tout décocher** s'appliquent aux comptes affichés (pratique après une recherche).

Vos choix sont gardés, même si vous fermez la page.

### Bloquer

1. Laissez les pauses par défaut (8 à 20 secondes entre deux blocages) et le maximum de
   100 comptes par session.
2. Cliquez sur **Démarrer** et confirmez.
3. Un onglet Threads s'ouvre en arrière-plan et passe d'un profil à l'autre. **Laissez la page
   blockedex ouverte** pendant ce temps.

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

- **Prudence avec votre compte** : l'extension clique dans Threads comme vous le feriez, ce que les
  conditions d'utilisation de Meta ne prévoient pas. Bloquer des centaines de comptes trop vite peut
  entraîner des limitations temporaires : gardez les pauses et le maximum par session.
- **Relisez une liste reçue** avant de l'appliquer. Débloquer se fait un compte à la fois.
- **Arrêt automatique** après 5 échecs de suite, ou si votre session Threads a expiré : reconnectez-vous
  sur threads.com, puis relancez.
- L'extension a été vérifiée sur le vrai Threads (interface en français, octobre 2026). Si Threads
  change son site, une étape peut se mettre à échouer : signalez-le dans les
  [Issues](https://github.com/axel17460-hash/Thread-account-blocker/issues).

## 4. Mettre à jour

Téléchargez le nouveau zip, remplacez le contenu de votre dossier `blockedex` par celui du zip, puis
dans `chrome://extensions` cliquez sur la flèche ↻ de la carte blockedex.

## 5. Problèmes fréquents

- **« Session Threads absente ou expirée »** : connectez-vous sur threads.com dans ce Chrome, puis relancez.
- **L'extension a disparu** : le dossier a été déplacé ou supprimé. Remettez-le, puis rechargez-la
  depuis `chrome://extensions`.
- **Beaucoup d'« échec »** : Threads a peut-être changé son interface. Arrêtez et signalez-le.

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
cd extension && zip -r ../blockedex-extension.zip . -x 'tests/*'
```

Le dossier [`blockedex/`](blockedex/) contient une ancienne version en ligne de commande Python. Elle
n'est plus maintenue et n'a pas reçu les corrections faites sur le vrai site.
