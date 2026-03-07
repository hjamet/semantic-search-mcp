# Fix Bruit Watcher & Filtres

## 1. Contexte & Discussion (Narratif)
> L'utilisateur a remarqué que le file watcher spammait des changements pour des fichiers non pertinents (ex: `.lock`, dossiers `.dvc/tmp/`). Le watcher ne filtrait pas les extensions, contrairement au scan initial et au graphe web. De plus, certaines extensions utiles comme `.tex` ou `.sh` manquaient à l'appel.

## 2. Fichiers Concernés
- `semantic_search_mcp/constants.py` [NEW]
- `semantic_search_mcp/indexer/watcher.py`
- `semantic_search_mcp/cli.py`

## 3. Objectifs (Definition of Done)
* **Centralisation** : Les extensions et dossiers ignorés sont définis à un seul endroit (`constants.py`).
* **Silence** : Le watcher ne logue plus de changements pour les fichiers `.lock` ou les dossiers techniques comme `.dvc`.
* **Exhaustivité** : Les fichiers `.tex`, `.sh`, `.html`, `.css`, `.yaml` sont désormais indexés et surveillés.
