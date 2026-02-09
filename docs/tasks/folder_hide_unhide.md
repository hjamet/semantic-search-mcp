# Hide/Unhide de Dossiers Entiers

## 1. Contexte & Discussion (Narratif)
> L'interface web de visualisation du graphe permettait de cacher/afficher des fichiers individuels. L'utilisateur a demandé la possibilité de cacher/afficher tous les fichiers d'un dossier d'un seul coup.

## 2. Fichiers Concernés
- `semantic_search_mcp/web/api.py`
- `semantic_search_mcp/web/static/app.js`
- `semantic_search_mcp/web/static/index.html`
- `semantic_search_mcp/web/static/styles.css`

## 3. Objectifs (Definition of Done)
* Cliquer sur un nœud dossier affiche un panneau de détails avec nom, nombre de fichiers, et nombre de fichiers cachés.
* Un bouton "Hide Folder" / "Unhide Folder" permet de cacher/afficher tous les fichiers du dossier en un seul clic.
* Le backend fournit un endpoint batch `/api/hidden/folder` pour effectuer l'opération en un seul appel.
