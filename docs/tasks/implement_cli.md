# Implémentation CLI semcp

## 1. Contexte & Discussion
La commande `semcp` est le point d'entrée pour l'indexation locale. Elle doit permettre de configurer le dossier courant pour la recherche sémantique.

## 2. Fichiers Concernés
- `semantic_search_mcp/cli.py`
- `semantic_search_mcp/indexer/engine.py`

## 3. Objectifs
- Commande `semcp` disponible globalement.
- Indexation du dossier courant (ignorant `.git`, `node_modules`).
- Mode "watcher" pour mise à jour temps réel.
- Mise à jour automatique de la configuration MCP locale.
