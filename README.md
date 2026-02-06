# Semantic Search MCP

**Semantic Search MCP** est un serveur MCP (Model Context Protocol) conçu pour permettre aux agents AI d'effectuer des recherches sémantiques contextuelles dans votre codebase local. Il indexe intelligemment le dossier de travail courant et offre des outils de recherche précis.

**Nouvelle fonctionnalité** : Visualisation interactive du graphe de dépendances dans le navigateur ! 🎨

## Installation

```bash
curl -LsSf https://raw.githubusercontent.com/hjamet/semantic-search-mcp/main/install.sh?v=123 | bash
```

> **Note**: Assurez-vous d'avoir `uv` installé. Si non, le script l'installera pour vous.

> **GPU (CUDA)** : Le support GPU est activé automatiquement si vous avez un GPU NVIDIA avec CUDA. Le script installe `onnxruntime-gpu` et `torch` pour des embeddings accélérés.

## Utilisation

### 1. Indexation & Context Switch (CLI)

Pour utiliser le serveur sur un repo spécifique :

1. Ouvrez votre terminal à la racine du projet.
2. Lancez :
   ```bash
   semcp
   ```
3. C'est tout ! Le contexte est mis à jour instantanément. Le serveur MCP lira ce contexte à la prochaine requête.

> **Important** : L'outil `semcp` doit être relancé si vous changez de projet (changement de contexte).

### 2. Visualisation du Graphe de Dépendances (Web)

Lorsque vous lancez `semcp`, une interface web s'ouvre automatiquement sur `http://localhost:8765` affichant :

- **Graphe interactif** des fichiers et leurs dépendances (imports)
- **Recherche** textuelle ou sémantique pour trouver des fichiers
- **Focus** sur un noeud pour voir ses dépendances
- **Panneau latéral** avec fonctions, classes et docstrings
- **Marquage "Important"** pour mettre en valeur certains fichiers

> Pour désactiver : `semcp --no-web`

### 3. Recherche (MCP Tool)

Dans votre agent (Cursor, Claude, etc.), vous avez accès à l'outil :

- **`semsearch`** : Effectue une recherche sémantique.
  - **MANDATORY** : Utilisez cet outil au début de chaque tâche pour comprendre la structure du code.
  - *Query* : "How is authentication handled?"
  - *Glob* : "src/*.py" (optionnel)

## Description détaillée

Ce projet fournit une interface standardisée pour la recherche sémantique locale.
- **Rôle** : Indexer et rechercher dans le code.
- **Flux** : L'utilisateur lance `semcp` dans un dossier -> Le serveur MCP se reconfigure -> L'agent utilise l'outil `semsearch`.
- **Performance** : Utilise une indexation incrémentale pour ne traiter que les changements fichiers (timestamps).
- **Visualisation** : Graphe interactif des dépendances avec interface web moderne (Cytoscape.js).


## Principaux résultats

*(À venir)*

## Documentation Index

| Titre | Description |
|-------|-------------|
| [Tâches](docs/index_tasks.md) | Index des tâches techniques |

## Plan du repo

```
.
├── semantic_search_mcp/         # Code source
│   ├── cli.py                   # CLI principal (semcp)
│   ├── server.py                # Serveur MCP
│   ├── indexer/                 # Moteur d'indexation sémantique
│   ├── graph/                   # Analyseur de dépendances
│   └── web/                     # Serveur web (FastAPI + frontend)
│       ├── api.py               # API REST
│       └── static/              # HTML, CSS, JS
├── docs/                        # Documentation
├── README.md                    # Ce fichier
└── install.sh                   # Script d'installation
```

## Scripts d'entrée principaux

| Commande | Description |
|----------|-------------|
| `semcp` | Configure le dossier courant et lance la visualisation web |
| `semcp --no-web` | Mode sans interface web |
| `semantic_search_mcp` | Lance le serveur MCP (interne) |

## Scripts exécutables secondaires & Utilitaires

*(Aucun pour l'instant)*

## Roadmap

- [x] [Initialisation du Projet](docs/tasks/setup_project.md)
- [x] [Implémentation CLI semcp](docs/tasks/implement_cli.md)
- [x] [Implémentation Serveur MCP](docs/tasks/implement_server.md)
- [x] [Migration Index Local](docs/tasks/migrate_to_local_index.md)
- [x] [Optimisation Indexation](docs/tasks/optimize_indexing.md)
- [x] [Fix Install Script](docs/tasks/fix_install_script.md)
- [x] [Enhance Tool Description](docs/tasks/enhance_tool_description.md)
- [x] [Refine Tool Description](docs/tasks/refine_tool_description.md)
- [x] Gestion dynamique du contexte
- [x] Installation simplifiée via uv tool local
- [x] [Visualisation Graphe de Dépendances](docs/tasks/implement_graph_visualization.md)

