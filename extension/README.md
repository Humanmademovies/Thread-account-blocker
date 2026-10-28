# blockedex : extension Chrome

Importez, appliquez et exportez des listes de blocage sur Threads, directement depuis votre Chrome
déjà connecté. Pas de compte à créer, pas de mot de passe demandé, rien n'est envoyé à un serveur :
les listes et la progression restent dans le stockage local de l'extension.

## Installer (mode développeur)

1. Récupérez le dossier `extension/` (ou le zip partagé, à décompresser).
2. Ouvrez `chrome://extensions` et activez **Mode développeur** (en haut à droite).
3. **Charger l'extension non empaquetée**, puis choisissez le dossier `extension/`.
4. Connectez-vous à [threads.com](https://www.threads.com) dans Chrome si ce n'est pas déjà fait.
5. Cliquez sur l'icône blockedex : la page de l'outil s'ouvre.

## Utiliser

1. **Importer** : collez des comptes (`@pseudo`, `pseudo` ou lien de profil) ou choisissez un fichier
   `.txt`, `.csv`, `.json`, puis « Charger la liste ».
2. **Appliquer** : réglez les pauses et le plafond, puis « Démarrer ». Un onglet Threads s'ouvre en
   arrière-plan et parcourt les profils. Laissez la page blockedex ouverte ; « Arrêter » interrompt
   proprement, et relancer reprend où l'on s'était arrêté (les échecs sont retentés).
3. **Exporter** : télécharge vos comptes bloqués actuels (Réglages › Confidentialité › Profils
   bloqués). Le fichier se ré-importe tel quel à l'étape 1.

Par défaut : pause aléatoire de 8 à 20 s entre deux blocages, 100 comptes maximum par session, arrêt
après 5 échecs consécutifs ou si la session Threads a expiré.

## Partager

```bash
cd extension && zip -r ../blockedex-extension.zip . -x 'tests/*'
```

Les destinataires suivent « Installer » ci-dessus. Pour une installation en un clic, il faudrait
publier l'extension sur le Chrome Web Store (compte développeur et relecture par Google).

## Limites à connaître

- L'extension automatise l'interface web de Threads, ce que les conditions d'utilisation de Meta ne
  prévoient pas : un usage intensif peut entraîner des limitations de compte. Gardez les pauses.
- Les libellés repérés dans la page (« More », « Block »/« Bloquer », « Profils bloqués »…) sont
  regroupés en tête de `content.js`. Ils n'ont **pas** été éprouvés sur le vrai site Threads : si une
  étape échoue, c'est là qu'on ajuste.
- Relisez toujours une liste reçue d'un tiers avant de l'appliquer.

## Développement

```bash
node --test extension/tests/lib.test.mjs   # logique pure (listes, reprise, plafond)
node extension/tests/e2e.mjs               # extension chargée dans Chromium contre un FAUX Threads local
```

Le test de bout en bout a besoin du paquet `playwright`, d'un Chromium et d'`openssl`. Il valide la
mécanique (navigation, injection, stockage, téléchargement), pas les sélecteurs du vrai Threads.
