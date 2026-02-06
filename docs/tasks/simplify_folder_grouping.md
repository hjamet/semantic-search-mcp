# Simplification de l'affichage des dossiers (Bas Niveau uniquement)

## 1. Contexte & Discussion
Le groupement hiérarchique complet par dossier (tous les niveaux de sous-dossiers) créait une visualisation trop lourde et complexe avec de nombreuses boîtes imbriquées. L'utilisateur a demandé de ne conserver que les dossiers de "bas niveau" (ceux contenant directement les fichiers) pour alléger l'interface.

La solution consiste à supprimer la hiérarchie imbriquée et à n'afficher qu'un seul niveau de dossier parent immédiat pour chaque fichier, utilisant le chemin complet du dossier comme label pour conserver le contexte.

## 2. Fichiers Concernés
- `semantic_search_mcp/web/static/app.js` : Modification de `generateFolderHierarchy` et `applyFolderGrouping`.

## 3. Objectifs (Definition of Done)
- [x] Seuls les dossiers parents immédiats des fichiers sont créés en tant que nœuds.
- [x] Suppression de l'imbrication des dossiers (flat groups).
- [x] Utilisation du chemin relatif complet comme label de dossier.
- [x] Le graphe reste cohérent et s'adapte dynamiquement.
