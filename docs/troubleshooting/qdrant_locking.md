# Erreur de verrouillage Qdrant (Résolu par SimpleVectorStore)

## Symptômes
Lors de l'exécution de `semsearch` ou `semgraph`, l'erreur suivante apparaît :
`Error in MCP tool execution: Storage folder ... is already accessed by another instance of Qdrant client.`

## Cause
Qdrant en mode local (système de fichiers) n'autorise qu'une seule instance à la fois. Si un processus `semantic_search_mcp` ou `semcp` est déjà en cours ou a mal été fermé, un fichier `.lock` ou un verrou système empêche l'accès.

## Résolution (Version >= 0.1.2)
Depuis la version 0.1.2, **Qdrant a été supprimé** et remplacé par `SimpleVectorStore`. Cette architecture élimine structurellement tout risque de verrouillage. 

Si vous voyez encore cette erreur :
1. Mettez à jour le serveur : `semcp --update` (ou relancez l'installateur).
2. Supprimez l'ancien dossier de cache : `rm -rf .semcp/qdrant`.

> [!NOTE]
> **Récupération Automatique** : Depuis la dernière mise à jour, `semantic_search_mcp` détecte automatiquement si un verrou appartient à un processus mort et le nettoie au démarrage. Les étapes ci-dessous ne sont nécessaires que dans des cas exceptionnels.

### 1. Identifier et tuer les processus orphelins
Rechercher les processus Python liés à `semcp` ou `semantic_search_mcp` :
```bash
ps aux | grep -Ei "qdrant|mcp|semcp"
```
Tuer les processus identifiés (remplacer PID par les numéros trouvés) :
```bash
kill PID
```

### 2. Supprimer le verrou manuel
Si l'erreur persiste après avoir tué les processus, supprimer le fichier de verrouillage dans le dossier mentionné par l'erreur :
```bash
rm /path/to/repo/.semcp/qdrant/.lock
```

### 3. Réinitialiser le contexte
Relancer `semcp` dans le répertoire de travail souhaité :
```bash
semcp
```
