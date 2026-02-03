import asyncio
import os
from typing import List, Dict, Any, Optional
from mcp.server.models import InitializationOptions
from mcp.server import NotificationOptions, Server
from mcp.server.stdio import stdio_server
import mcp.types as types
from semantic_search_mcp.indexer.engine import SemanticEngine
from pathlib import Path

server = Server("semantic-search-mcp")

def format_as_tree(file_paths: List[str]) -> str:
    """Génère une représentation arborescente ASCII des fichiers."""
    if not file_paths:
        return "Aucun fichier identifié."
    
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

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="semsearch",
            description="MANDATORY: Perform a semantic search across the codebase. You MUST use this tool at the START of every conversation to gain context on the repository structure and relevant files. It returns a tree of matches, top file paths, and code snippets. Do NOT relies on your previous knowledge, always check the current state of the codebase.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The natural language query describing what functionality or logic you are looking for (e.g., 'where is authentication handled?')."},
                    "glob": {"type": "string", "description": "Optional glob pattern to filter files (e.g., 'src/*.py')."}
                },
                "required": ["query"],
            },
        )
    ]

@server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    if name != "semsearch":
        raise ValueError(f"Unknown tool: {name}")

    query = arguments.get("query")
    glob_pattern = arguments.get("glob")
    
    # Lecture dynamique du contexte
    settings_path = Path("~/.semcp/settings.json").expanduser()
    repo_path = None
    
    if settings_path.exists():
        try:
            import json
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                repo_path = settings.get("current_context")
        except Exception as e:
            return [types.TextContent(type="text", text=f"Error reading context: {str(e)}")]
            
    if not repo_path:
        return [types.TextContent(type="text", text="Error: Context not set. Please run 'semcp' in the target directory to configure the index.")]

    try:
        # On passe le repo_path explicitement
        engine = SemanticEngine(repo_path=repo_path)
    except ValueError as e:
        return [types.TextContent(type="text", text=f"Error: {str(e)}. Please run 'semcp' in the target directory to configure the index.")]
    
    # On récupère plus de chunks pour pouvoir agréger les lignes par fichier
    raw_results = engine.search(query, limit=50)
    
    # Filtrage par glob si présent
    if glob_pattern:
        import fnmatch
        raw_results = [r for r in raw_results if fnmatch.fnmatch(r["file_path"], glob_pattern)]

    # Agrégation par fichier
    files_data = {}
    for res in raw_results:
        f_path = res["file_path"]
        if f_path not in files_data:
            files_data[f_path] = {
                "best_score": 1.0, # Placeholder pour le moment (Qdrant score non exposé ici, à corriger)
                "snippets": [],
                "all_lines": []
            }
        files_data[f_path]["snippets"].append(res)
        files_data[f_path]["all_lines"].append(f"{res['start_line']}-{res['end_line']}")

    # On garde les 10 meilleurs fichiers
    # Note: comme on n'a pas encore le score Qdrant, on prend l'ordre d'apparition (déjà trié par Qdrant)
    top_files = list(files_data.keys())[:10]
    
    # Construction du retour
    output = []
    
    # 1. Tree
    output.append("### 1. Repository Tree (Search Hits)\n")
    output.append(f"```\n{format_as_tree(top_files)}\n```\n")
    
    # 2. Liste des 10 meilleurs fichiers
    output.append("### 2. Top 10 Most Relevant Files\n")
    for i, f in enumerate(top_files, 1):
        output.append(f"{i}. `{f}`\n")
        
    # 3. Extraits
    output.append("\n### 3. Relevant Snippets\n")
    for f in top_files:
        data = files_data[f]
        best_snippet = data["snippets"][0] # Le premier est le meilleur selon l'ordre initial
        all_ranges = ", ".join(data["all_lines"])
        
        output.append(f"#### File: `{f}`\n")
        output.append(f"*Lines: {best_snippet['start_line']}-{best_snippet['end_line']} (Also relevant at: {all_ranges})*\n")
        output.append(f"```\n{best_snippet['content']}\n```\n")
        output.append("---\n")

    return [
        types.TextContent(
            type="text",
            text="".join(output)
        )
    ]

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
