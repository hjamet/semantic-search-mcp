
import sys
import os
import time
from pathlib import Path

# Add project root to path
sys.path.append(os.getcwd())

from semantic_search_mcp.indexer.engine import SemanticEngine

def test_simple_store():
    print("Initializing SemanticEngine...")
    engine = SemanticEngine(repo_path=os.getcwd())
    
    test_file = "test_data.txt"
    with open(test_file, "w") as f:
        f.write("The quick brown fox jumps over the lazy dog.\nThis is a test file for SimpleVectorStore.")
        
    try:
        print("Indexing test file...")
        engine.index_file(test_file)
        
        print("Searching...")
        results = engine.search("brown fox")
        print(f"Found {len(results)} results")
        
        found = False
        for res in results:
            print(f" - {res['content']}")
            if "brown fox" in res['content']:
                found = True
                
        if not found:
            print("ERROR: Search did not return expected content.")
            sys.exit(1)
            
        print("Verify persistence...")
        # Force save is done on add/delete.
        # Let's create a new engine instance to simulate restart
        engine2 = SemanticEngine(repo_path=os.getcwd())
        results2 = engine2.search("lazy dog")
        if not results2:
             print("ERROR: Persistence failed.")
             sys.exit(1)
             
        print("Persistence verified.")
        
        print("Deleting test file...")
        engine.delete_file(test_file)
        
        results3 = engine.search("brown fox")
        # Should be empty or at least not contain the deleted file
        for res in results3:
            if res['file_path'] == test_file:
                print("ERROR: File not deleted from index.")
                sys.exit(1)
                
        print("Deletion verified.")
        print("SUCCESS: SimpleVectorStore works as expected.")
        
    finally:
        if os.path.exists(test_file):
            os.remove(test_file)

if __name__ == "__main__":
    test_simple_store()
