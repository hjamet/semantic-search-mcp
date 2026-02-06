# Visualisation Interactive du Graphe de Dépendances

## 1. Contexte & Discussion

L'utilisateur souhaitait enrichir le serveur `semantic-search-mcp` avec une fonctionnalité majeure : une application web auto-démarrée visualisant les dépendances entre fichiers sous forme de graphe interactif.

**Besoins exprimés :**
- Graphe orienté montrant les imports entre fichiers
- Interface élégante et moderne (dark mode)
- Recherche de noeuds (texte + sémantique)
- Focus sur un noeud avec mise en valeur des dépendances
- Marquage "IMPORTANT" de certains noeuds
- Panneau latéral avec fonctions/classes et docstrings
- Auto-démarrage avec la commande `semcp`

**Décision technique :**
- **Cytoscape.js** choisi pour le graphe (spécialisé graphes, interactivité out-of-box)
- **FastAPI** pour l'API REST
- **Design** : dark theme avec glassmorphism et animations

## 2. Fichiers Concernés

### Nouveaux
- `semantic_search_mcp/graph/__init__.py`
- `semantic_search_mcp/graph/dependency_analyzer.py` (parsing AST/regex)
- `semantic_search_mcp/web/__init__.py`
- `semantic_search_mcp/web/api.py` (FastAPI server)
- `semantic_search_mcp/web/static/index.html`
- `semantic_search_mcp/web/static/styles.css`
- `semantic_search_mcp/web/static/app.js`

### Modifiés
- `semantic_search_mcp/cli.py` (option `--no-web`, lancement serveur)
- `pyproject.toml` (dépendances FastAPI/uvicorn)

## 3. Objectifs (Definition of Done)

- [x] Le graphe des dépendances s'affiche automatiquement à `http://localhost:8765`
- [x] Les noeuds représentent les fichiers de code (.py, .js, .ts)
- [x] Les edges orientés montrent les relations d'import
- [x] Clic sur un noeud ouvre un panneau avec fonctions/docstrings
- [x] Recherche textuelle et sémantique fonctionnelle
- [x] Marquage "IMPORTANT" persisté et visible (glow doré)
- [x] Design premium (dark theme, glassmorphism, animations)
- [x] Option `--no-web` pour désactiver si besoin
