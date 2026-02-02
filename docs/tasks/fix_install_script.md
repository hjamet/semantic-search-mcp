# [Fix Install Script Dependency Context]

## 1. Contexte & Discussion
> *Fix d'urgence suite au retour utilisateur.*
- L'utilisateur a signalé que `install.sh` installait les dépendances du dossier courant lorsqu'il était exécuté via curl.
- La cause était l'utilisation de `uv tool install .` qui cible le contexte local.
- La solution est de forcer l'installation depuis le dépôt git distant.

## 2. Fichiers Concernés
- `install.sh`

## 3. Objectifs (Definition of Done)
* Remplacer l'installation locale par une installation distante via git URL.
* Garantir que l'installation fonctionne quel que soit le dossier courant.
