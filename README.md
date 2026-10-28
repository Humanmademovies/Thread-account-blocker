# blockedex

blockedex importe une ou plusieurs listes de comptes et les bloque sur **votre** compte Threads, et
peut aussi exporter vos blocages actuels.

Deux versions, même fonctionnement :

- **Extension Chrome** (`extension/`) : la plus simple à partager et à utiliser, dans votre Chrome déjà
  connecté. Voir [extension/README.md](extension/README.md).
- **Ligne de commande Python** (`blockedex/`) : décrite ci-dessous, pour automatiser depuis un terminal.

## Pourquoi Chrome ?

L'API officielle de Threads ne propose pas de blocage. L'outil pilote donc l'interface web dans
**Google Chrome** (via Playwright), avec un profil dédié (`~/.blockedex/profile`) où vous vous
connectez vous-même : votre mot de passe n'est jamais lu ni stocké. Votre Chrome habituel et ses
données ne sont pas touchés.

## Installation

Google Chrome doit être installé (sinon : `playwright install chrome`).

```bash
pip install playwright
```

Le reste n'utilise que la bibliothèque standard Python (≥ 3.10).

## Utilisation

```bash
# 1. Vérifier une liste, sans rien bloquer
python -m blockedex check examples/blocklist.txt --show

# 2. Se connecter une fois (une fenêtre s'ouvre, vous vous connectez, puis Entrée)
python -m blockedex login

# 3. Simuler
python -m blockedex apply ma_liste.txt --dry-run

# 4. Appliquer
python -m blockedex apply ma_liste.txt
```

### Exporter votre liste actuelle

```bash
python -m blockedex export mes_blocages.txt     # ou .csv / .json
```

Ouvre Réglages › Confidentialité › Profils bloqués, fait défiler la liste jusqu'au bout et l'écrit
dans le fichier. Le résultat est relisible tel quel par `check` et `apply` (utile pour sauvegarder, ou
pour reporter vos blocages sur un autre compte). Rien n'est écrit si aucun compte n'est récupéré, et un
fichier existant n'est écrasé qu'avec `--force`.

> Comme pour le blocage, l'étape de lecture dans l'interface n'a pas encore été éprouvée sur un vrai compte.

### Formats acceptés

- `.txt` : un compte par ligne ; `@pseudo`, `pseudo` ou URL de profil `threads.net/@pseudo` ; `#` pour les commentaires.
- `.csv` : colonne `username`, `handle`, `user`, `account`… (sinon première colonne).
- `.json` : liste de chaînes ou d'objets `{"username": ...}`, ou `{"users": [...]}`.

Plusieurs fichiers peuvent être passés d'un coup ; les doublons sont fusionnés.

### Garde-fous

- **Reprise** : chaque résultat est écrit dans `~/.blockedex/state.json`. Après une interruption,
  relancez la même commande : les comptes déjà traités sont sautés, les échecs sont retentés.
- **Cadence** : pause aléatoire de 8 à 20 s entre deux blocages (`--min-delay`, `--max-delay`) et
  100 comptes maximum par exécution (`--limit`, `0` = illimité), pour limiter le risque de
  restriction du compte.
- **Arrêt automatique** après 5 échecs consécutifs ou si la session Threads a expiré.
- **Captures d'écran** des échecs dans `~/.blockedex/failures/` pour diagnostiquer.
- Une confirmation est demandée avant d'appliquer (`--yes` pour l'éviter).

## Limites à connaître

- L'automatisation de l'interface n'est pas prévue par les conditions d'utilisation de Meta : un usage
  intensif peut déclencher des limitations. Restez sur des listes raisonnables et laissez les pauses par défaut.
- Les sélecteurs de `blockedex/browser.py` (libellés « More », « Block »/« Bloquer »…) dépendent
  de l'interface actuelle de Threads. Ils n'ont **pas** été éprouvés sur un vrai compte : si l'étape
  échoue, regardez les captures d'écran et ajustez les constantes en tête du fichier.
- Relisez toujours une liste récupérée ailleurs avant de l'appliquer : bloquer est facile à défaire
  une par une, beaucoup moins en masse.

## Tests

```bash
python -m unittest discover
```
