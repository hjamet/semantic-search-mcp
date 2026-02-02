import typer
import os
import json
from pathlib import Path
from rich.console import Console
from rich.progress import Progress
from semantic_search_mcp.indexer.engine import SemanticEngine
from semantic_search_mcp.indexer.watcher import start_watcher

app = typer.Typer()
console = Console()

def update_mcp_config(cwd: str):
    config_path = Path("~/.gemini/antigravity/mcp_config.json").expanduser()
    if not config_path.parent.exists():
        config_path.parent.mkdir(parents=True, exist_ok=True)
        
    config = {}
    if config_path.exists():
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
        except:
            pass
            
    if "mcpServers" not in config:
        config["mcpServers"] = {}
        
    config["mcpServers"]["semantic-search"] = {
        "command": "uv",
        "args": ["run", "--with", "semantic-search-mcp", "semantic_search_mcp", "--root", cwd]
    }
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    console.print(f"[dim]Updated {config_path}[/]")

@app.command()
def main():
    """Lancer l'indexeur sémantique sur le dossier actuel."""
    cwd = os.getcwd()
    console.print(f"[bold blue]🚀 Initialisation de Semantic Search pour :[/] {cwd}")
    
    # Mise à jour de la config MCP
    update_mcp_config(cwd)
    
    engine = SemanticEngine()
    
    # 1. Scan initial
    files_to_index = []
    ignored_dirs = [".git", "__pycache__", ".venv", ".semcp", ".semsearch", "node_modules"]
    
    for root, dirs, files in os.walk(cwd):
        # Modifier dirs in-place pour ignorer les dossiers
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for file in files:
            if file.endswith((".py", ".md", ".js", ".ts", ".c", ".cpp", ".h", ".go", ".rs")):
                files_to_index.append(os.path.join(root, file))
    
    with Progress() as progress:
        task = progress.add_task("[green]Indexation initiale...", total=len(files_to_index))
        for file_path in files_to_index:
            engine.index_file(file_path)
            progress.update(task, advance=1)
            
    console.print("[bold green]✅ Indexation terminée. En attente de changements...[/]")
    
    # 2. Start Watcher
    start_watcher(engine, cwd)

if __name__ == "__main__":
    app()
