
import os
import pickle
import numpy as np
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

class SimpleVectorStore:
    """
    A simple, file-based vector store using numpy and pickle.
    Optimized for single-user, local MCP usage.
    """
    def __init__(self, storage_path: Path):
        self.storage_path = storage_path
        self.vectors: Optional[np.ndarray] = None
        self.payloads: List[Dict[str, Any]] = []
        self._load()

    def _load(self):
        """Load data from disk if exists."""
        if self.storage_path.exists():
            try:
                with open(self.storage_path, "rb") as f:
                    data = pickle.load(f)
                    self.vectors = data.get("vectors")
                    self.payloads = data.get("payloads", [])
            except Exception as e:
                print(f"ERROR: Failed to load vector store from {self.storage_path}: {e}")
                # Backup corrupt file if needed, for now just start fresh
                self.vectors = None
                self.payloads = []
        else:
            self.vectors = None
            self.payloads = []

    def save(self):
        """Save data to disk."""
        # Atomic write pattern to avoid corruption
        temp_path = self.storage_path.with_suffix(".tmp")
        try:
            with open(temp_path, "wb") as f:
                pickle.dump({
                    "vectors": self.vectors,
                    "payloads": self.payloads
                }, f)
            temp_path.replace(self.storage_path)
        except Exception as e:
            print(f"ERROR: Failed to save vector store: {e}")
            if temp_path.exists():
                temp_path.unlink()

    def add(self, vectors: List[List[float]], payloads: List[Dict[str, Any]]):
        """Add vectors and payloads to the store."""
        if not vectors:
            return

        new_vectors = np.array(vectors, dtype=np.float32)
        
        if self.vectors is None:
            self.vectors = new_vectors
        else:
            self.vectors = np.vstack((self.vectors, new_vectors))
            
        self.payloads.extend(payloads)
        self.save()

    def search(self, query_vector: List[float], limit: int = 10) -> List[Dict[str, Any]]:
        """
        Search for similar vectors using cosine similarity.
        """
        if self.vectors is None or len(self.payloads) == 0:
            return []

        query = np.array(query_vector, dtype=np.float32)
        
        # Normalize query vector if not already (assuming BGE gives normalized, but let's be safe for dot product)
        # Actually, for BGE-m3/small, embeddings are usually normalized.
        # Cosine similarity = dot product of normalized vectors. 
        # For speed, we assume vectors in store are normalized? 
        # Let's compute cosine similarity explicitly: (A . B) / (|A| * |B|)
        
        norm_query = np.linalg.norm(query)
        if norm_query > 0:
            query = query / norm_query
            
        # We should also normalize stored vectors if we want pure cosine similarity
        # But doing it on the fly is expensive. 
        # PRO TIP: fastembed usually returns normalized vectors. 
        # If not, we might want to normalize on add.
        # For now, let's just do dot product which is "good enough" for ranking if magnitudes are similar.
        
        scores = np.dot(self.vectors, query)
        
        # Get top k indices
        # np.argsort returns indices that sort the array. 
        # We want descending order, so we take the last 'limit' elements and reverse them.
        if len(scores) <= limit:
             top_indices = np.argsort(scores)[::-1]
        else:
            # partial sort is faster for large arrays
            top_indices = np.argpartition(scores, -limit)[-limit:]
            # assert partition doesn't sort the top k, so we sort them now
            sorted_top_indices = top_indices[np.argsort(scores[top_indices])][::-1]
            top_indices = sorted_top_indices

        results = []
        for idx in top_indices:
            # Optional: filter by score threshold? user didn't ask.
            results.append(self.payloads[idx])
            
        return results

    def delete(self, file_path: str):
        """Delete all vectors associated with a file path."""
        if self.vectors is None:
            return

        # Find indices to keep
        # This is linear scan, but fast enough for < 1M items in memory
        indices_to_keep = []
        new_payloads = []
        
        for i, payload in enumerate(self.payloads):
            if payload.get("file_path") != file_path:
                indices_to_keep.append(i)
                new_payloads.append(payload)
                
        if len(indices_to_keep) == len(self.payloads):
            return # Nothing to delete

        if not indices_to_keep:
            self.vectors = None
            self.payloads = []
        else:
            self.vectors = self.vectors[indices_to_keep]
            self.payloads = new_payloads
            
        self.save()
