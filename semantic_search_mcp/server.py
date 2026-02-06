import asyncio
import fnmatch
import json
import os
from collections import deque
from typing import List, Dict, Any, Optional, Set, Tuple
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
import mcp.types as types
from semantic_search_mcp.indexer.engine import SemanticEngine
from semantic_search_mcp.graph.dependency_analyzer import DependencyAnalyzer
from pathlib import Path

server = Server("semantic-search-mcp")


def format_as_tree(file_paths: List[str]) -> str:
    """Generate an ASCII tree representation of file paths."""
    if not file_paths:
        return "No files found."
    
    tree = {}
    for path in sorted(file_paths):
        parts = path.split(os.sep)
        current = tree
        for part in parts:
            if part not in current:
                current[part] = {}
            current = current[part]
            
    lines = ["Root"]
    def walk(d, indent=""):
        items = sorted(d.items())
        for i, (name, children) in enumerate(items):
            last = (i == len(items) - 1)
            prefix = "└── " if last else "├── "
            lines.append(f"{indent}{prefix}{name}")
            if children:
                next_indent = indent + ("    " if last else "│   ")
                walk(children, next_indent)
                
    walk(tree)
    return "\n".join(lines)


def find_indirect_paths(
    start: str, 
    end: str, 
    adjacency: Dict[str, Set[str]], 
    excluded: Set[str]
) -> List[str]:
    """
    Find a path between start and end nodes, traversing only through excluded nodes.
    Returns the list of intermediate nodes (excluding start and end).
    """
    if start == end:
        return []
    
    visited = {start}
    queue = deque([(start, [])])
    
    while queue:
        current, path = queue.popleft()
        
        for neighbor in adjacency.get(current, set()):
            if neighbor == end:
                return path
            
            if neighbor not in visited and neighbor in excluded:
                visited.add(neighbor)
                queue.append((neighbor, path + [neighbor]))
    
    return []


def get_context() -> Tuple[Optional[str], Optional[str]]:
    """Read the current context from settings."""
    settings_path = Path("~/.semcp/settings.json").expanduser()
    
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                return settings.get("current_context"), None
        except Exception as e:
            return None, f"Error reading context: {str(e)}"
    
    return None, "Context not set. Please run 'semcp' in the target directory."


def get_important_nodes(repo_path: str) -> Set[str]:
    """Load important nodes from storage."""
    important_path = Path(repo_path) / ".semcp" / "important_nodes.json"
    if important_path.exists():
        try:
            with open(important_path, 'r') as f:
                return set(json.load(f))
        except (json.JSONDecodeError, IOError):
            pass
    return set()


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="semsearch",
            description=(
                "MANDATORY: Perform a semantic search across the codebase. "
                "This is your PRIMARY and MOST POWERFUL tool for information gathering. "
                "You are STRONGLY ENCOURAGED to use this tool AT LEAST 3 TIMES per conversation. "
                "USE AND ABUSE this tool to: "
                "1) Gain a deep, up-to-date understanding of the repository. "
                "2) Find and REUSE existing code to avoid reinventing the wheel. "
                "3) Prevent code duplication. "
                "Do NOT rely on your previous knowledge; always check the current state of the codebase. "
                "Use the 'glob' argument to filter for specific types, e.g., '*.md' for documentation. "
                "CRITICAL: The 'query' parameter MUST be written in English."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language query (English)."},
                    "glob": {"type": "string", "description": "Optional glob pattern to filter files."}
                },
                "required": ["query"],
            },
        ),
        types.Tool(
            name="semgraph",
            description=(
                "Semantic search with FULL dependency graph context. "
                "Returns for each matching file: imports (outgoing), imported by (incoming), "
                "indirect connections with intermediate file paths, code structure (classes/functions with docstrings), "
                "dead code detection (unused symbols), and importance flag. "
                "Use this tool when you need to understand the CONTEXT and RELATIONSHIPS of code. "
                "CRITICAL: The 'query' parameter MUST be written in English."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language query (English)."},
                    "glob": {"type": "string", "description": "Optional glob pattern to filter files."},
                    "limit": {"type": "integer", "description": "Max files to return (default 10)."}
                },
                "required": ["query"],
            },
        )
    ]


@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    
    # Get context
    repo_path, error = get_context()
    if error:
        return [types.TextContent(type="text", text=f"Error: {error}")]
    
    query = arguments.get("query")
    glob_pattern = arguments.get("glob")
    
    try:
        engine = SemanticEngine(repo_path=repo_path)
    except ValueError as e:
        return [types.TextContent(type="text", text=f"Error: {str(e)}. Please run 'semcp' first.")]
    
    if name == "semsearch":
        return await handle_semsearch(engine, query, glob_pattern)
    elif name == "semgraph":
        limit = arguments.get("limit", 10)
        return await handle_semgraph(engine, repo_path, query, glob_pattern, limit)
    else:
        raise ValueError(f"Unknown tool: {name}")


async def handle_semsearch(
    engine: SemanticEngine,
    query: str,
    glob_pattern: Optional[str]
) -> list[types.TextContent]:
    """Handle semsearch tool - simple semantic search."""
    
    raw_results = engine.search(query, limit=50)
    
    if glob_pattern:
        raw_results = [r for r in raw_results if fnmatch.fnmatch(r["file_path"], glob_pattern)]

    # Aggregate by file
    files_data = {}
    for res in raw_results:
        f_path = res["file_path"]
        if f_path not in files_data:
            files_data[f_path] = {"snippets": [], "all_lines": []}
        files_data[f_path]["snippets"].append(res)
        files_data[f_path]["all_lines"].append(f"{res['start_line']}-{res['end_line']}")

    top_files = list(files_data.keys())[:10]
    
    output = []
    output.append("### 1. Repository Tree (Search Hits)\n")
    output.append(f"```\n{format_as_tree(top_files)}\n```\n")
    
    output.append("### 2. Top 10 Most Relevant Files\n")
    for i, f in enumerate(top_files, 1):
        output.append(f"{i}. `{f}`\n")
        
    output.append("\n### 3. Relevant Snippets\n")
    for f in top_files:
        data = files_data[f]
        best_snippet = data["snippets"][0]
        all_ranges = ", ".join(data["all_lines"])
        
        output.append(f"#### File: `{f}`\n")
        output.append(f"*Lines: {best_snippet['start_line']}-{best_snippet['end_line']} (Also relevant at: {all_ranges})*\n")
        output.append(f"```\n{best_snippet['content']}\n```\n")
        output.append("---\n")

    return [types.TextContent(type="text", text="".join(output))]


async def handle_semgraph(
    engine: SemanticEngine,
    repo_path: str,
    query: str,
    glob_pattern: Optional[str],
    limit: int
) -> list[types.TextContent]:
    """Handle semgraph tool - semantic search with full dependency graph context."""
    
    # 1. Semantic search
    raw_results = engine.search(query, limit=50)
    
    if glob_pattern:
        raw_results = [r for r in raw_results if fnmatch.fnmatch(r["file_path"], glob_pattern)]
    
    # Get unique files
    seen_files = set()
    top_files = []
    for res in raw_results:
        f_path = res["file_path"]
        if f_path not in seen_files:
            seen_files.add(f_path)
            top_files.append(f_path)
            if len(top_files) >= limit:
                break
    
    if not top_files:
        return [types.TextContent(type="text", text="No files found matching query.")]
    
    # 2. Build dependency graph
    analyzer = DependencyAnalyzer(repo_path)
    graph = analyzer.build_graph()
    
    # Build adjacency lists
    outgoing = {}  # file -> files it imports
    incoming = {}  # file -> files that import it
    all_files = set()
    
    for node in graph['nodes']:
        file_id = node['id']
        all_files.add(file_id)
        outgoing[file_id] = set()
        incoming[file_id] = set()
    
    for edge in graph['edges']:
        source = edge['source']
        target = edge['target']
        outgoing.setdefault(source, set()).add(target)
        incoming.setdefault(target, set()).add(source)
    
    # Build bidirectional adjacency for indirect path finding
    bidirectional = {}
    for f in all_files:
        bidirectional[f] = outgoing.get(f, set()) | incoming.get(f, set())
    
    # 3. Get important nodes
    important_nodes = get_important_nodes(repo_path)
    
    # 4. Build output for each file
    output = []
    output.append(f"# Semantic Graph Search: `{query}`\n\n")
    output.append(f"Found **{len(top_files)}** files.\n\n")
    
    top_files_set = set(top_files)
    other_files = all_files - top_files_set
    
    for file_path in top_files:
        # Header with importance flag
        importance_marker = " ⭐ IMPORTANT" if file_path in important_nodes else ""
        output.append(f"## `{file_path}`{importance_marker}\n\n")
        
        # Direct connections
        file_outgoing = outgoing.get(file_path, set())
        file_incoming = incoming.get(file_path, set())
        
        output.append("### Connections\n\n")
        
        if file_outgoing:
            output.append("**Imports (outgoing):**\n")
            for target in sorted(file_outgoing):
                marker = " ⭐" if target in important_nodes else ""
                output.append(f"- `{target}`{marker}\n")
            output.append("\n")
        else:
            output.append("**Imports (outgoing):** None\n\n")
        
        if file_incoming:
            output.append("**Imported by (incoming):**\n")
            for source in sorted(file_incoming):
                marker = " ⭐" if source in important_nodes else ""
                output.append(f"- `{source}`{marker}\n")
            output.append("\n")
        else:
            output.append("**Imported by (incoming):** None\n\n")
        
        # Indirect connections to other top files
        indirect_connections = []
        for other_file in top_files_set:
            if other_file == file_path:
                continue
            
            # Skip if directly connected
            if other_file in file_outgoing or other_file in file_incoming:
                continue
            
            # Find path through non-top files
            path = find_indirect_paths(file_path, other_file, bidirectional, other_files)
            if path:
                indirect_connections.append((other_file, path))
        
        if indirect_connections:
            output.append("**Indirect connections:**\n")
            for target, path in indirect_connections:
                path_str = " → ".join([f"`{p}`" for p in path])
                output.append(f"- `{target}` via [{path_str}]\n")
            output.append("\n")
        
        # Code structure
        details = analyzer.get_file_details(file_path)
        items = details.get('items', [])
        
        if items:
            output.append("### Code Structure\n\n")
            for item in items:
                unused_marker = " 🔴 UNUSED" if item.get('unused') else ""
                
                if item['type'] == 'class':
                    output.append(f"#### class `{item['name']}` (L{item['line']}){unused_marker}\n")
                    if item.get('docstring'):
                        output.append(f"> {item['docstring']}\n\n")
                    
                    methods = item.get('methods', [])
                    if methods:
                        output.append("**Methods:**\n")
                        for method in methods:
                            m_unused = " 🔴 UNUSED" if method.get('unused') else ""
                            output.append(f"- `{method['name']}` (L{method['line']}){m_unused}\n")
                            if method.get('docstring'):
                                output.append(f"  > {method['docstring']}\n")
                        output.append("\n")
                else:
                    signature = item.get('signature', item['name'])
                    output.append(f"#### func `{signature}` (L{item['line']}){unused_marker}\n")
                    if item.get('docstring'):
                        output.append(f"> {item['docstring']}\n\n")
        
        output.append("---\n\n")
    
    return [types.TextContent(type="text", text="".join(output))]


async def run():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="semantic-search-mcp",
                server_version="0.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


def main():
    asyncio.run(run())


if __name__ == "__main__":
    main()
