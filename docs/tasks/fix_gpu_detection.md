# Fix Détection GPU & Install

## 1. Contexte & Discussion (Narratif)
> L'utilisateur a signalé que le GPU n'était pas utilisé malgré la présence d'une carte RTX. La détection se basait uniquement sur `onnxruntime`, qui peut échouer silencieusement si mal configuré. De plus, l'installateur générait une erreur de dépendance `fastembed` en désinstallant `onnxruntime` CPU avant de mettre le GPU.

## 2. Fichiers Concernés
- `semantic_search_mcp/indexer/engine.py`
- `install.sh`
- `pyproject.toml`

## 3. Objectifs (Definition of Done)
* **Robustesse** : La détection GPU utilise un fallback `nvidia-smi` si `onnxruntime` ne voit pas le provider CUDA.
* **Transparence** : Des logs de debug expliquent pourquoi le GPU est ou n'est pas utilisé.
* **Installation Sans Erreur** : L'installateur installe tout en une seule passe `uv pip install`, éliminant l'erreur de résolution de dépendances.
* **Cleanup** : Suppression des dépendances dupliquées dans `pyproject.toml`.
