# Sécurisation du flux stdout pour MCP

## 1. Contexte & Discussion (Narratif)
Lors de l'utilisation de l'outil `semsearch` via un agent MCP, des erreurs de parsing JSON (ex: `invalid character 'D'`) apparaissaient aléatoirement.

Après enquête, il s'avère que certains modules du package utilisaient l'instruction `print()`, laquelle écrit par défaut sur `stdout`. Comme le serveur MCP communique avec l'hôte via `stdio` (JSON-RPC sur stdin/stdout), ces messages parasites corrompaient le flux de données JSON.

La décision a été prise de migrer systématiquement toutes les sorties de logs et d'erreurs vers `sys.stderr.write()`, garantissant un flux `stdout` exclusivement réservé au protocole MCP.

## 2. Fichiers Concernés
- `semantic_search_mcp/indexer/simple_store.py`
- `semantic_search_mcp/indexer/engine.py`
- `semantic_search_mcp/indexer/watcher.py`
- `semantic_search_mcp/web/api.py`

## 3. Objectifs (Definition of Done)
* Zéro pollution du flux `stdout` par les modules internes du package.
* Stabilité accrue des appels d'outils MCP dans les IDE (Cursor, Claude Desktop, etc.).
* Migration de tous les `print()` vers `sys.stderr.write()` (sauf dans `cli.py` qui est le point d'entrée utilisateur).
