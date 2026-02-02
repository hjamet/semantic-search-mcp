# Semantic Search MCP

**Semantic Search MCP** est un serveur MCP (Model Context Protocol) conçu pour permettre aux agents AI d'effectuer des recherches sémantiques contextuelles dans votre codebase local. Il indexe intelligemment le dossier de travail courant et offre des outils de recherche précis.

## Installation

```bash
# Télécharger et lancer l'installateur
curl -sSL https://raw.githubusercontent.com/hjamet/semantic-search-mcp/main/install.sh | bash
```

## Utilisation

1. **Indexer un repository** :
   Allez dans n'importe quel dossier et lancez :
   ```bash
   semcp
   ```
   Cela va indexer le code (en utilisant le GPU si dispo), configurer l'accès MCP et surveiller les changements en temps réel.

2. **Recherche sémantique** :
   L'agent pourra alors utiliser l'outil `semsearch` via l'interface MCP.

## Description détaillée

Ce projet fournit une interface standardisée pour la recherche sémantique locale.
- **Rôle** : Indexer et rechercher dans le code.
- **Flux** : L'utilisateur lance `semcp` dans un dossier -> Le serveur MCP se reconfigure -> L'agent utilise l'outil `semsearch`.

## Principaux résultats

*(À venir)*

## Documentation Index

| Titre | Description |
|-------|-------------|
| [Tâches](docs/tasks/README.md) | Index des tâches techniques |

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

- [ ] [Initialisation du Projet](docs/tasks/setup_project.md)
- [ ] [Implémentation CLI semcp](docs/tasks/implement_cli.md)
- [ ] [Implémentation Serveur MCP](docs/tasks/implement_server.md)
