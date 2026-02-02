# [Optimisation : Indexation Incrémentale]

## 1. Contexte & Discussion
L'utilisateur a signalé que `semcp` réindexait la totalité du codebase à chaque lancement, ce qui est inefficace pour les gros projets ou les redémarrages fréquents.
L'objectif était d'implémenter une logique intelligente qui ne traite que les fichiers modifiés depuis la dernière exécution.

## 2. Fichiers Concernés
- `semantic_search_mcp/indexer/engine.py` (Gestion des métadonnées)
- `semantic_search_mcp/cli.py` (Logique de filtrage)

## 3. Objectifs (Definition of Done)
- [x] Le moteur doit stocker l'état des fichiers indexés (timestamp `mtime`).
- [x] Au lancement, le CLI doit comparer l'état disque avec l'état indexé.
- [x] Seuls les nouveaux fichiers ou fichiers modifiés sont envoyés à l'indexation.
- [x] Les fichiers supprimés du disque sont retirés de l'index.
- [x] Le message "No changes detected" s'affiche si tout est à jour.
