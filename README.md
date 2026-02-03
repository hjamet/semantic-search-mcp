# Semantic Search MCP

**Semantic Search MCP** est un serveur MCP (Model Context Protocol) conçu pour permettre aux agents AI d'effectuer des recherches sémantiques contextuelles dans votre codebase local. Il indexe intelligemment le dossier de travail courant et offre des outils de recherche précis.

## Installation

```bash
curl -LsSf https://raw.githubusercontent.com/hjamet/semantic-search-mcp/main/install.sh | bash
```

> **Note**: Assurez-vous d'avoir `uv` installé. Si non, le script l'installera pour vous.

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

### 2. Recherche (MCP Tool)

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


## Principaux résultats

*(À venir)*

## Documentation Index

| Titre | Description |
|-------|-------------|
| [Tâches](docs/index_tasks.md) | Index des tâches techniques |

## Plan du repo

```
.
├── semantic_search_mcp/ # Code source du serveur et CLI
├── docs/           # Documentation
├── README.md       # Ce fichier
└── install.sh      # Script d'installation
```

## Scripts d'entrée principaux

| Commande | Description |
|----------|-------------|
| `semcp` | Configure le dossier courant comme cible de recherche |
| `semantic_search_mcp` | Lance le serveur MCP (interne) |

## Scripts exécutables secondaires & Utilitaires

*(Aucun pour l'instant)*

## Roadmap

## Roadmap

- [x] [Initialisation du Projet](docs/tasks/setup_project.md)
- [x] [Implémentation CLI semcp](docs/tasks/implement_cli.md)
- [x] [Implémentation Serveur MCP](docs/tasks/implement_server.md)
- [x] [Migration Index Local](docs/tasks/migrate_to_local_index.md)
- [x] [Optimisation Indexation](docs/tasks/optimize_indexing.md)
- [x] [Fix Install Script](docs/tasks/fix_install_script.md)
- [x] [Enhance Tool Description](docs/tasks/enhance_tool_description.md)
- [x] Gestion dynamique du contexte
- [x] Installation simplifiée via uv tool local
