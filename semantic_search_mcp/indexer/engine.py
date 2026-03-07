
import os
import shutil
import sys
from typing import List, Dict, Any, Optional
import numpy as np
from fastembed import TextEmbedding
from pathlib import Path
from .simple_store import SimpleVectorStore

class SemanticEngine:
    def __init__(self, repo_path: Optional[str] = None, force_cpu: bool = False):
        """
        Initialize the SemanticEngine.
        
        Args:
            repo_path: The root directory of the repository to index. 
                      If None, tries to read SEMANTIC_SEARCH_ROOT env var.
            force_cpu: If True, bypass GPU detection and use CPU only.
        """
        if repo_path:
            self.repo_path = Path(repo_path).resolve()
        elif os.getenv("SEMANTIC_SEARCH_ROOT"):
            self.repo_path = Path(os.getenv("SEMANTIC_SEARCH_ROOT")).resolve()
        else:
            raise ValueError("No repo_path provided and SEMANTIC_SEARCH_ROOT not set.")
            
        self.storage_path = self.repo_path / ".semcp"
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Detection GPU — test real CUDA device availability
        use_cuda = False if force_cpu else self._has_cuda()
        self.device = "cuda" if use_cuda else "cpu"
        
        # Model selection: BGE-small-en-v1.5 is fast and efficient
        # Strict mode: No silent fallback. If cuda is detected, we ONLY try CUDA.
        if self.device == "cuda":
            providers = ["CUDAExecutionProvider"]
            try:
                self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", providers=providers)
                self.active_provider = "CUDAExecutionProvider"
            except Exception as e:
                # Option B: Fallback to CPU with a LOUD warning
                import sys
                sys.stderr.write("\n" + "!" * 80 + "\n")
                sys.stderr.write(f"CRITICAL GPU ERROR: CUDA was detected but initialization failed.\n")
                sys.stderr.write(f"Error: {e}\n")
                sys.stderr.write(f"FALLING BACK TO CPU MODE (Performance will be degraded).\n")
                sys.stderr.write("!" * 80 + "\n\n")
                
                providers = ["CPUExecutionProvider"]
                self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", providers=providers)
                self.active_provider = "CPUExecutionProvider"
                self.device = "cpu"
        else:
            providers = ["CPUExecutionProvider"]
            self.model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5", providers=providers)
            self.active_provider = "CPUExecutionProvider"
        
        # Metadata storage
        self.metadata_path = self.storage_path / "index_metadata.json"
        self.metadata = self._load_metadata()
        
        # Initialize Vector Store
        self.vector_store = SimpleVectorStore(self.storage_path / "vector_store.pkl")

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

    def _has_cuda(self) -> bool:
        """
        Detect real CUDA device availability by actually probing the GPU.
        Uses subprocess to avoid polluting stderr with C++ onnxruntime errors.
        """
        try:
            import subprocess, sys
            # Run a quick CUDA probe in a subprocess so any C++ stderr stays contained
            probe = subprocess.run(
                [sys.executable, "-c", 
                 "import onnxruntime as ort; "
                 "s = ort.InferenceSession.__new__(ort.InferenceSession); "
                 "provs = ort.get_available_providers(); "
                 "exit(0 if 'CUDAExecutionProvider' in provs else 1)"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10
            )
            if probe.returncode != 0:
                return False
            
            # Verify actual device with a real CUDA call
            result = subprocess.run(
                [sys.executable, "-c",
                 "import ctypes, sys; "
                 "try:\n"
                 "  cuda = ctypes.CDLL('libcuda.so.1')\n"
                 "  count = ctypes.c_int(0)\n"
                 "  r = cuda.cuInit(0)\n"
                 "  if r != 0: sys.exit(1)\n"
                 "  r = cuda.cuDeviceGetCount(ctypes.byref(count))\n"
                 "  sys.exit(0 if r == 0 and count.value > 0 else 1)\n"
                 "except: sys.exit(1)"
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False

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
            
            # First clean up existing embeddings for this file
            self.vector_store.delete(relative_path)
            
            chunks = self.chunk_text(content, relative_path)
            
            if not chunks:
                self.metadata[relative_path] = os.path.getmtime(file_path)
                self._save_metadata()
                return

            contents = [c["content"] for c in chunks]
            embeddings = list(self.model.embed(contents))
            
            # Add to vector store
            # embeddings is a list of numpy arrays, compatible with SimpleVectorStore.add
            self.vector_store.add(embeddings, chunks)
            
            # Update metadata
            self.metadata[relative_path] = os.path.getmtime(file_path)
            self._save_metadata()
            
        except Exception as e:
            sys.stderr.write(f"Error indexing {file_path}: {e}\n")

    def delete_file(self, file_path: str):
        relative_path = os.path.relpath(file_path, os.getcwd())
        self.vector_store.delete(relative_path)
            
        if relative_path in self.metadata:
            del self.metadata[relative_path]
            self._save_metadata()

    def search(self, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        query_vector = list(self.model.embed([query]))[0]
        # query_vector is a numpy array (generator -> list -> first item)
        # SimpleVectorStore.search handles normalization and searching
        return self.vector_store.search(query_vector, limit=limit)
