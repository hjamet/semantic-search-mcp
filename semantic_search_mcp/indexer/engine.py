import os
from typing import List, Dict, Any, Optional
import numpy as np
from fastembed import TextEmbedding
from qdrant_client import QdrantClient, models
from qdrant_client.models import Distance, VectorParams, PointStruct
from pathlib import Path

class SemanticEngine:
    def __init__(self, repo_path: Optional[str] = None):
        """
        Initialize the SemanticEngine.
        
        Args:
            repo_path: The root directory of the repository to index. 
                      If None, tries to read SEMANTIC_SEARCH_ROOT env var.
        """
        if repo_path:
            self.repo_path = Path(repo_path).resolve()
        elif os.getenv("SEMANTIC_SEARCH_ROOT"):
            self.repo_path = Path(os.getenv("SEMANTIC_SEARCH_ROOT")).resolve()
        else:
            raise ValueError("No repo_path provided and SEMANTIC_SEARCH_ROOT not set.")
            
        self.storage_path = self.repo_path / ".semcp"
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Detection GPU
        self.device = "cuda" if self._has_cuda() else "cpu"
        # On Linux, MPS is not relevant, but let's keep it generic if we want to support Mac
        
        print(f"DEBUG: Initializing SemanticEngine on {self.device}")
        
        # Model selection: BGE-small-en-v1.5 is fast and efficient
        # Use CUDA if available, with CPU fallback
        providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if self.device == "cuda" else ["CPUExecutionProvider"]
        self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", providers=providers)
        
        # Metadata storage
        self.metadata_path = self.storage_path / "index_metadata.json"
        self.metadata = self._load_metadata()
        
        self._setup_collection()

    def _load_metadata(self) -> Dict[str, float]:
        import json
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_metadata(self):
        import json
        with open(self.metadata_path, 'w') as f:
            json.dump(self.metadata, f, indent=2)

    def get_metadata(self) -> Dict[str, float]:
        return self.metadata.copy()

    def _get_client(self) -> QdrantClient:
        return QdrantClient(path=str(self.storage_path / "qdrant"))

    def _has_cuda(self) -> bool:
        """
        Detect CUDA availability using multiple methods (lightweight, no torch dependency).
        
        Priority:
        1. Check onnxruntime providers (most reliable if onnxruntime-gpu is installed)
        2. Fallback to nvidia-smi check (works even without onnxruntime-gpu)
        """
        # Method 1: Check onnxruntime providers
        try:
            import onnxruntime as ort
            available_providers = ort.get_available_providers()
            if "CUDAExecutionProvider" in available_providers:
                return True
        except ImportError:
            pass
        
        # Method 2: Check nvidia-smi (lightweight fallback)
        import shutil
        import subprocess
        if shutil.which("nvidia-smi"):
            try:
                result = subprocess.run(
                    ["nvidia-smi", "-L"], 
                    capture_output=True, 
                    text=True, 
                    timeout=5
                )
                if result.returncode == 0 and "GPU" in result.stdout:
                    return True
            except (subprocess.TimeoutExpired, subprocess.SubprocessError):
                pass
        
        return False

    def _setup_collection(self):
        client = self._get_client()
        try:
            if not client.collection_exists("code_chunks"):
                client.create_collection(
                    collection_name="code_chunks",
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE),
                )
        finally:
            client.close()

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
                self.metadata[relative_path] = os.path.getmtime(file_path)
                self._save_metadata()
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
            client = self._get_client()
            try:
                client.upsert(collection_name="code_chunks", points=points)
            finally:
                client.close()
            
            # Update metadata
            self.metadata[relative_path] = os.path.getmtime(file_path)
            self._save_metadata()
            
        except Exception as e:
            print(f"Error indexing {file_path}: {e}")

    def delete_file(self, file_path: str):
        relative_path = os.path.relpath(file_path, os.getcwd())
        client = self._get_client()
        try:
            client.delete(
                collection_name="code_chunks",
                points_selector=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="file_path",
                            match=models.MatchValue(value=relative_path)
                        )
                    ]
                )
            )
        finally:
            client.close()
            
        if relative_path in self.metadata:
            del self.metadata[relative_path]
            self._save_metadata()

    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        query_vector = list(self.model.embed([query]))[0]
        client = self._get_client()
        try:
            results = client.query_points(
                collection_name="code_chunks",
                query=query_vector.tolist(),
                limit=limit,
                with_payload=True
            ).points
            return [hit.payload for hit in results]
        finally:
            client.close()
