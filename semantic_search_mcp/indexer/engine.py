import os
from typing import List, Dict, Any, Optional
import numpy as np
from fastembed import TextEmbedding
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from pathlib import Path

class SemanticEngine:
    def __init__(self, storage_path: str = "~/.semcp"):
        self.storage_path = Path(storage_path).expanduser()
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Detection GPU
        self.device = "cuda" if self._has_cuda() else "cpu"
        # On Linux, MPS is not relevant, but let's keep it generic if we want to support Mac
        
        print(f"DEBUG: Initializing SemanticEngine on {self.device}")
        
        # Model selection: BGE-small-en-v1.5 is fast and efficient
        self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        
        self.client = QdrantClient(path=str(self.storage_path / "qdrant"))
        self._setup_collection()

    def _has_cuda(self) -> bool:
        try:
            import torch
            return torch.cuda.is_available()
        except ImportError:
            # Fallback check via nvidia-smi or similar if needed
            return False

    def _setup_collection(self):
        if not self.client.collection_exists("code_chunks"):
            self.client.create_collection(
                collection_name="code_chunks",
                vectors_config=VectorParams(size=384, distance=Distance.COSINE),
            )

    def chunk_text(self, text: str, file_path: str, chunk_size: int = 500, overlap: int = 50) -> List[Dict[str, Any]]:
        """Simple chunking with line tracking."""
        lines = text.splitlines()
        chunks = []
        
        current_chunk_lines = []
        current_length = 0
        start_line = 1
        
        for i, line in enumerate(lines):
            current_chunk_lines.append(line)
            current_length += len(line)
            
            if current_length >= chunk_size:
                content = "\n".join(current_chunk_lines)
                end_line = i + 1
                chunks.append({
                    "content": content,
                    "file_path": file_path,
                    "start_line": start_line,
                    "end_line": end_line
                })
                
                # Overlap logic (simple: keep last N lines)
                num_overlap_lines = max(1, int(len(current_chunk_lines) * (overlap / chunk_size)))
                current_chunk_lines = current_chunk_lines[-num_overlap_lines:]
                start_line = end_line - num_overlap_lines + 1
                current_length = sum(len(l) for l in current_chunk_lines)
                
        if current_chunk_lines:
            chunks.append({
                "content": "\n".join(current_chunk_lines),
                "file_path": file_path,
                "start_line": start_line,
                "end_line": len(lines)
            })
            
        return chunks

    def index_file(self, file_path: str):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            relative_path = os.path.relpath(file_path, os.getcwd())
            chunks = self.chunk_text(content, relative_path)
            
            if not chunks:
                return

            contents = [c["content"] for c in chunks]
            embeddings = list(self.model.embed(contents))
            
            points = []
            for i, (chunk, vector) in enumerate(zip(chunks, embeddings)):
                points.append(PointStruct(
                    id=hash(f"{relative_path}_{chunk['start_line']}_{i}"),
                    vector=vector.tolist(),
                    payload=chunk
                ))
            
            # Upsert points
            self.client.upsert(collection_name="code_chunks", points=points)
            
        except Exception as e:
            print(f"Error indexing {file_path}: {e}")

    def delete_file(self, file_path: str):
        relative_path = os.path.relpath(file_path, os.getcwd())
        self.client.delete(
            collection_name="code_chunks",
            points_selector={"payload": {"file_path": relative_path}}
        )

    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        query_vector = list(self.model.embed([query]))[0]
        results = self.client.search(
            collection_name="code_chunks",
            query_vector=query_vector.tolist(),
            limit=limit
        )
        return [hit.payload for hit in results]
