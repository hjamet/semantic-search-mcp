# Migration vers Index Local (.semcp)

## 1. Contexte & Discussion
L'architecture initiale stockait l'index sémantique de manière globale dans `~/.semcp`. Cela posait des problèmes de gestion multi-projets et de nettoyage.
La décision a été prise de migrer vers une stratégie **Strict Local** : chaque repository possède son propre dossier `.semcp` contenant l'index Vectoriel (Qdrant).

## 2. Fichiers Concernés
- `semantic_search_mcp/indexer/engine.py`
- `semantic_search_mcp/cli.py`
- `semantic_search_mcp/server.py`
- `mcp_config.json`

## 3. Objectifs (Definition of Done)
- [x] L'index est stocké dans `.semcp` à la racine du projet inspecté.
- [x] La commande `semcp` détecte le dossier courant et y crée l'index.
- [x] `.semcp` est automatiquement ajouté au `.gitignore`.
- [x] Le serveur MCP reçoit le chemin du projet via la variable d'env `SEMANTIC_SEARCH_ROOT`.
- [x] Abandon du support de `~/.semcp`.
