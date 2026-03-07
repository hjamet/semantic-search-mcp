# Garantie Absolue d'Exécution GPU (Strict No-Fallback)

## 1. Contexte & Discussion (Narratif)
> *L'utilisateur (lopilo) a posé une question fondamentale : "Tu me confirmes qu'on utilise bien le gpu maintenant du coup ? A coup sûr ? Il n'y a pas de fallback qui masque le fait qu'en réalité on utilise le CPU ?"*

Après analyse architecturale, la réponse est **non, il n'y a pas de garantie absolue actuellement**. L'implémentation actuelle fournit une liste de providers `["CUDAExecutionProvider", "CPUExecutionProvider"]` à FastEmbed/ONNXRuntime. Si le provider CUDA échoue pour une raison interne (manque de VRAM, mismatch de version de driver, erreur d'initialisation C++), ONNXRuntime effectue un "silent fallback" vers le CPU. Pire, nous avons masqué les avertissements de fallback avec `warnings.filterwarnings` pour nettoyer la console. Le système est donc devenu une boîte noire où une défaillance GPU se traduit simplement par une lenteur anormale (CPU) sans aucun log d'erreur visible. 
Il est nécessaire d'adopter une approche "Zero-Tolerance" pour le GPU lorsqu'il est explicitement détecté et attendu.

## 2. Fichiers Concernés
- `semantic_search_mcp/indexer/engine.py`
- `semantic_search_mcp/cli.py`
- `semantic_search_mcp/server.py`

## 3. Objectifs (Definition of Done)
* **Mode Strict CUDA** : Si le GPU est détecté par notre test `ctypes`, la liste des providers passée à ONNXRuntime ne DOIT contenir QUE le `CUDAExecutionProvider`. Aucun fallback CPU autorisé.
* **Transparence d'Initialisation** : L'objet `SemanticEngine` doit exposer clairement le provider réellement actif.
* **Feedback Utilisateur** : Au lancement (CLI ou Server), un log clair et impossible à rater doit confirmer si le moteur tourne sur GPU ou CPU.
* **Fail-Fast** : Si le mode GPU est actif mais que ONNXRuntime crashe à l'instanciation, crasher proprement le script Python avec un message explicite ("Échec critique du GPU") au lieu de renvoyer une trace C++ indéchiffrable.
