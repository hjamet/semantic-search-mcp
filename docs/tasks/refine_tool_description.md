# [Refine semsearch Tool Description]

## 1. Contexte & Discussion
> *Maximiser l'utilisation de l'outil sémantique par les agents.*
- L'utilisateur trouve que l'outil `semsearch` est "très puissant" mais sous-utilisé.
- Il souhaite une description qui encourage :
    - Une utilisation **très régulière** (plusieurs fois par conversation).
    - L'utilisation de l'argument `glob` pour cibler spécifiquement la documentation (`*.md`) ou le code (`*.py`).
- L'objectif est de changer le comportement des agents pour qu'ils s'appuient davantage sur la recherche sémantique plutôt que sur des suppositions ou des lectures de fichiers aléatoires.

## 2. Fichiers Concernés
- `semantic_search_mcp/server.py`

## 3. Objectifs (Definition of Done)
* La description de l'outil `semsearch` est mise à jour en anglais.
* Elle incite explicitement à **au moins 3 requêtes** par session (ex: 2 code, 1 doc).
* Elle explique pourquoi : réutiliser l'existant, éviter les duplicats, ne pas réinventer la roue.
* Elle mentionne explicitement l'utilité du filtre `glob` avec des exemples (`*.md` pour docs, `*.py` pour code).
* Le README est mis à jour (Roadmap + Index).
