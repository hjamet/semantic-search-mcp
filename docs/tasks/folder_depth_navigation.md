# Navigation Hiérarchique des Dossiers

## 1. Contexte & Discussion (Narratif)
> L'interface web regroupait les fichiers par dossier mais toujours au même niveau de détail. L'utilisateur a demandé la possibilité de "monter" dans l'arborescence (merger les sous-dossiers) et de "redescendre" (détailler les dossiers).

## 2. Fichiers Concernés
- `semantic_search_mcp/web/static/app.js`
- `semantic_search_mcp/web/static/index.html`
- `semantic_search_mcp/web/static/styles.css`

## 3. Objectifs (Definition of Done)
* Des boutons ▲ (monter) et ▼ (descendre) permettent de naviguer dans la profondeur des dossiers.
* Un indicateur de niveau (ex: "2/4") affiche la profondeur actuelle et maximale.
* Le bouton ▲ merge les sous-dossiers en dossiers parents de niveau supérieur.
* Le bouton ▼ détaille les dossiers en sous-dossiers.
* Les boutons sont désactivés aux limites (profondeur 1 et profondeur max).
* La navigation est enchaînable : on peut remonter jusqu'au niveau 1 et redescendre complètement.
