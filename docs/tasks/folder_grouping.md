# Ajout d'un Switch pour Grouper les Fichiers par Dossier

## 1. Contexte & Discussion
Le graphe de dépendances devenait encombré sur les gros projets. L'utilisateur a souhaité une option pour regrouper visuellement les fichiers par dossier afin de mieux structurer la visualisation.

Nous avons choisi l'approche des **compound nodes** de Cytoscape.js car elle offre le rendu le plus élégant (zones englobantes) sans complexifier l'API backend, les données de dossier étant déjà présentes dans les métadonnées des nœuds.

## 2. Fichiers Concernés
- `semantic_search_mcp/web/static/index.html` : Toggle UI
- `semantic_search_mcp/web/static/styles.css` : Styles du toggle
- `semantic_search_mcp/web/static/app.js` : Logique Cytoscape (nœuds parents, layout)

## 3. Objectifs (Definition of Done)
- [x] Toggle "Group by folder" présent dans la sidebar.
- [x] Les fichiers sont regroupés dans des zones nommées par leur chemin de dossier.
- [x] Le layout se réajuste automatiquement à l'activation/désactivation.
- [x] Le groupement est maintenu lors des mises à jour temps réel (WebSocket).
