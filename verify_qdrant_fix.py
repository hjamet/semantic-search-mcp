
import os
import sys
import time
from pathlib import Path
from semantic_search_mcp.indexer.engine import SemanticEngine

def test_orphan_lock():
    repo_path = os.getcwd()
    storage_path = Path(repo_path) / ".semcp"
    qdrant_dir = storage_path / "qdrant"
    lock_file = qdrant_dir / ".lock"
    pid_file = storage_path / "qdrant.pid"

    print("--- Test de Robustesse Qdrant ---")
    
    # 1. Nettoyer l'état initial
    if lock_file.exists():
        os.system(f"rm -rf {lock_file}")
    if pid_file.exists():
        pid_file.unlink()

    # 2. Créer un faux PID orphelin (un PID qui n'existe pas, ex: 999999)
    # On s'assure que 999999 n'existe pas ou on utilise un PID aléatoire élevé
    fake_pid = 999999 
    
    qdrant_dir.mkdir(parents=True, exist_ok=True)
    # Créer le dossier .lock (Qdrant crée souvent un dossier .lock sur Linux)
    lock_file.mkdir(exist_ok=True)
    
    with open(pid_file, "w") as f:
        f.write(str(fake_pid))
    
    print(f"Simulation : Verrou créé avec un PID fictif ({fake_pid})")
    
    # 3. Tenter d'instancier SemanticEngine
    print("Tentative d'initialisation de SemanticEngine...")
    try:
        # On définit SEMANTIC_SEARCH_ROOT pour le moteur
        os.environ["SEMANTIC_SEARCH_ROOT"] = repo_path
        engine = SemanticEngine()
        print("✅ SUCCÈS : Le moteur a détecté et nettoyé le verrou orphelin !")
    except Exception as e:
        print(f"❌ ÉCHEC : Le moteur n'a pas pu gérer le verrou : {e}")
        sys.exit(1)

    # 4. Vérifier que le nouveau PID est enregistré
    with open(pid_file, "r") as f:
        new_pid = int(f.read().strip())
    
    if new_pid == os.getpid():
        print(f"✅ SUCCÈS : Le nouveau PID ({new_pid}) a été correctement enregistré.")
    else:
        print(f"❌ ÉCHEC : Le PID n'a pas été mis à jour (trouvé: {new_pid}).")
        sys.exit(1)

if __name__ == "__main__":
    test_orphan_lock()
