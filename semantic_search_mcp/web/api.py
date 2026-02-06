"""
FastAPI Web Server for Dependency Graph Visualization

Provides REST API endpoints for the graph visualization frontend.
"""
import json
import threading
from pathlib import Path
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
import uvicorn

from semantic_search_mcp.graph.dependency_analyzer import DependencyAnalyzer


# Request/Response models
class SearchRequest(BaseModel):
    query: str
    semantic: bool = True


class ImportantRequest(BaseModel):
    path: str
    important: bool


class HiddenRequest(BaseModel):
    path: str
    hidden: bool


class SearchResult(BaseModel):
    path: str
    label: str
    score: float = 1.0


# Global state
_analyzer: Optional[DependencyAnalyzer] = None
_engine = None  # SemanticEngine for semantic search
_repo_path: Optional[str] = None
_important_nodes_path: Optional[Path] = None
_hidden_nodes_path: Optional[Path] = None


def get_important_nodes() -> List[str]:
    """Load important nodes from storage."""
    if _important_nodes_path and _important_nodes_path.exists():
        try:
            with open(_important_nodes_path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def save_important_nodes(nodes: List[str]):
    """Save important nodes to storage."""
    if _important_nodes_path:
        _important_nodes_path.parent.mkdir(parents=True, exist_ok=True)
        with open(_important_nodes_path, 'w') as f:
            json.dump(nodes, f, indent=2)


def get_hidden_nodes() -> List[str]:
    """Load hidden nodes from storage."""
    if _hidden_nodes_path and _hidden_nodes_path.exists():
        try:
            with open(_hidden_nodes_path, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []
    return []


def save_hidden_nodes(nodes: List[str]):
    """Save hidden nodes to storage."""
    if _hidden_nodes_path:
        _hidden_nodes_path.parent.mkdir(parents=True, exist_ok=True)
        with open(_hidden_nodes_path, 'w') as f:
            json.dump(nodes, f, indent=2)


def init_default_hidden_nodes(graph_nodes: List[dict]) -> List[str]:
    """Initialize default hidden nodes (like __init__.py) if file doesn't exist."""
    if _hidden_nodes_path and not _hidden_nodes_path.exists():
        # Hide __init__.py files by default
        default_hidden = [
            node['id'] for node in graph_nodes 
            if node['label'] == '__init__.py'
        ]
        if default_hidden:
            save_hidden_nodes(default_hidden)
            return default_hidden
    return get_hidden_nodes()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown."""
    # Startup - nothing special needed
    yield
    # Shutdown - cleanup if needed


# Create FastAPI app
app = FastAPI(
    title="Semantic Search Graph Visualization",
    description="Interactive dependency graph viewer",
    lifespan=lifespan
)


# Mount static files (will be configured at startup)
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML page."""
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse("<h1>Graph Visualization</h1><p>Static files not found.</p>")


@app.get("/api/graph")
async def get_graph(include_hidden: bool = False):
    """
    Get the complete dependency graph.
    
    Args:
        include_hidden: If True, include hidden nodes. Default False.
    """
    if not _analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    graph = _analyzer.build_graph()
    important = get_important_nodes()
    
    # Initialize default hidden nodes on first load
    hidden = init_default_hidden_nodes(graph['nodes'])
    hidden_set = set(hidden)
    
    # Mark important and hidden nodes
    for node in graph['nodes']:
        node['important'] = node['id'] in important
        node['hidden'] = node['id'] in hidden_set
    
    # Filter out hidden nodes unless requested
    if not include_hidden:
        visible_nodes = [n for n in graph['nodes'] if not n['hidden']]
        visible_ids = {n['id'] for n in visible_nodes}
        visible_edges = [
            e for e in graph['edges'] 
            if e['source'] in visible_ids and e['target'] in visible_ids
        ]
        graph['nodes'] = visible_nodes
        graph['edges'] = visible_edges
    
    return graph


@app.get("/api/graph/hidden")
async def get_hidden_graph():
    """Get only the hidden nodes and their connections."""
    if not _analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    graph = _analyzer.build_graph()
    hidden = get_hidden_nodes()
    hidden_set = set(hidden)
    important = get_important_nodes()
    
    # Filter to only hidden nodes
    hidden_nodes = [n for n in graph['nodes'] if n['id'] in hidden_set]
    hidden_ids = {n['id'] for n in hidden_nodes}
    
    # Mark importance
    for node in hidden_nodes:
        node['important'] = node['id'] in important
        node['hidden'] = True
    
    # Get edges between hidden nodes
    hidden_edges = [
        e for e in graph['edges']
        if e['source'] in hidden_ids and e['target'] in hidden_ids
    ]
    
    return {'nodes': hidden_nodes, 'edges': hidden_edges}


@app.get("/api/file/{file_path:path}")
async def get_file_details(file_path: str):
    """Get details of a specific file (functions, docstrings)."""
    if not _analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    details = _analyzer.get_file_details(file_path)
    if 'error' in details and details['error'] == 'File not found':
        raise HTTPException(status_code=404, detail="File not found")
    
    return details


@app.post("/api/search")
async def search_nodes(request: SearchRequest):
    """
    Search for nodes matching the query.
    
    If semantic=True and SemanticEngine is available, uses semantic search.
    Otherwise, falls back to simple text matching.
    """
    if not _analyzer:
        raise HTTPException(status_code=503, detail="Analyzer not initialized")
    
    query = request.query.lower()
    graph = _analyzer.build_graph()
    results = []
    
    # Get hidden nodes to exclude from results
    hidden = set(get_hidden_nodes())
    
    if request.semantic and _engine:
        # Use semantic search
        try:
            semantic_results = _engine.search(request.query, limit=20)
            seen_files = set()
            for res in semantic_results:
                file_path = res.get('file_path', '')
                if file_path and file_path not in seen_files and file_path not in hidden:
                    seen_files.add(file_path)
                    # Find matching node
                    for node in graph['nodes']:
                        if node['id'] == file_path:
                            results.append({
                                'path': node['id'],
                                'label': node['label'],
                                'score': 0.9  # Semantic results are relevant
                            })
                            break
        except Exception:
            # Fallback to text search if semantic fails
            pass
    
    # Text matching fallback or complement
    if not results:
        for node in graph['nodes']:
            if node['id'] not in hidden:
                if query in node['id'].lower() or query in node['label'].lower():
                    results.append({
                        'path': node['id'],
                        'label': node['label'],
                        'score': 1.0 if query == node['label'].lower() else 0.7
                    })
    
    # Sort by score
    results.sort(key=lambda x: x['score'], reverse=True)
    return {'results': results[:20]}


@app.get("/api/important")
async def get_important():
    """Get list of important nodes."""
    return {'nodes': get_important_nodes()}


@app.post("/api/important")
async def set_important(request: ImportantRequest):
    """Mark or unmark a node as important."""
    nodes = get_important_nodes()
    
    if request.important:
        if request.path not in nodes:
            nodes.append(request.path)
    else:
        if request.path in nodes:
            nodes.remove(request.path)
    
    save_important_nodes(nodes)
    return {'success': True, 'nodes': nodes}


@app.get("/api/hidden")
async def get_hidden():
    """Get list of hidden nodes."""
    return {'nodes': get_hidden_nodes()}


@app.post("/api/hidden")
async def set_hidden(request: HiddenRequest):
    """Mark or unmark a node as hidden."""
    nodes = get_hidden_nodes()
    
    if request.hidden:
        if request.path not in nodes:
            nodes.append(request.path)
    else:
        if request.path in nodes:
            nodes.remove(request.path)
    
    save_hidden_nodes(nodes)
    return {'success': True, 'nodes': nodes}


def configure_server(repo_path: str, engine=None):
    """
    Configure the server with repository path and optional semantic engine.
    
    Args:
        repo_path: Path to the repository to analyze.
        engine: Optional SemanticEngine instance for semantic search.
    """
    global _analyzer, _engine, _repo_path, _important_nodes_path, _hidden_nodes_path
    
    _repo_path = repo_path
    _analyzer = DependencyAnalyzer(repo_path)
    _engine = engine
    _important_nodes_path = Path(repo_path) / ".semcp" / "important_nodes.json"
    _hidden_nodes_path = Path(repo_path) / ".semcp" / "hidden_nodes.json"


def start_server(repo_path: str, engine=None, port: int = 8765, open_browser: bool = True):
    """
    Start the web server in a background thread.
    
    Args:
        repo_path: Path to the repository.
        engine: Optional SemanticEngine for semantic search.
        port: Port to run the server on.
        open_browser: Whether to open browser automatically.
    
    Returns:
        The server thread.
    """
    configure_server(repo_path, engine)
    
    def run_server():
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False
        )
    
    thread = threading.Thread(target=run_server, daemon=True)
    thread.start()
    
    if open_browser:
        import webbrowser
        import time
        time.sleep(0.5)  # Give server time to start
        webbrowser.open(f"http://localhost:{port}")
    
    return thread
