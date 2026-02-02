# Implémentation Serveur MCP

## 1. Contexte & Discussion
Le serveur MCP expose l'outil `semsearch` aux agents. Il doit utiliser l'index généré par `semcp` pour répondre aux requêtes.

## 2. Fichiers Concernés
- `semantic_search_mcp/server.py`
- `semantic_search_mcp/indexer/engine.py`

## 3. Objectifs
- Serveur MCP standard (stdio).
- Outil `semsearch` avec arguments `query` et `glob`.
- Retour formaté (Tree + Snippets).
- Support de la concurrence (lectures non bloquantes).
