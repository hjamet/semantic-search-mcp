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
        
    repo_root = Path(__file__).parent.parent.resolve()
    
    config["mcpServers"]["semantic-search"] = {
        "command": "uv",
        "args": ["--directory", repo_root.as_posix(), "run", "python", "-m", "semantic_search_mcp.server"],
        "cwd": repo_root.as_posix(), # Keep the server running from the code root
        "env": {
            "SEMANTIC_SEARCH_ROOT": cwd # Tell the server where the index is
        }
    }
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    console.print(f"[dim]Updated {config_path} with SEMANTIC_SEARCH_ROOT={cwd}[/]")

def ensure_gitignore(cwd: str):
    gitignore_path = Path(cwd) / ".gitignore"
    if not gitignore_path.exists():
        # Optional: create if not exists? For now let's just warn or create.
        # Let's create it if it doesn't exist, it's standard.
        with open(gitignore_path, "w") as f:
            f.write(".semcp\n")
        console.print("[dim]Created .gitignore with .semcp[/]")
        return

    with open(gitignore_path, "r") as f:
        content = f.read()
    
    if ".semcp" not in content:
        # Check if we have a newline at the end
        if content and not content.endswith("\n"):
            content += "\n"
        content += ".semcp\n"
        with open(gitignore_path, "w") as f:
            f.write(content)
        console.print("[dim]Added .semcp to .gitignore[/]")

@app.command()
def main():
    """Lancer l'indexeur sémantique sur le dossier actuel."""
    cwd = os.getcwd()
    console.print(f"[bold blue]🚀 Initialisation de Semantic Search pour :[/] {cwd}")
    
    # Mise à jour de la config MCP
    update_mcp_config(cwd)
    
    # Ensure .gitignore has .semcp
    ensure_gitignore(cwd)
    
    engine = SemanticEngine(repo_path=cwd)
    
    # 1. Scan initial
    current_files = {} # path -> mtime
    ignored_dirs = [".git", "__pycache__", ".venv", ".semcp", ".semsearch", "node_modules"]
    
    for root, dirs, files in os.walk(cwd):
        # Modifier dirs in-place pour ignorer les dossiers
        dirs[:] = [d for d in dirs if d not in ignored_dirs]
        for file in files:
            if file.endswith((".py", ".md", ".js", ".ts", ".c", ".cpp", ".h", ".go", ".rs")):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, cwd)
                current_files[rel_path] = os.path.getmtime(full_path)
    
    # Check against metadata
    metadata = engine.get_metadata()
    
    files_to_index = []
    files_to_delete = []
    
    for rel_path, mtime in current_files.items():
        if rel_path not in metadata or metadata[rel_path] < mtime:
            files_to_index.append(os.path.join(cwd, rel_path))
            
    for rel_path in metadata:
        if rel_path not in current_files:
            files_to_delete.append(os.path.join(cwd, rel_path))
            
    if not files_to_index and not files_to_delete:
         console.print("[dim]No changes detected.[/]")
    else:
        if files_to_delete:
            console.print(f"[yellow]Removing {len(files_to_delete)} deleted files...[/]")
            for f in files_to_delete:
                engine.delete_file(f)
                
        if files_to_index:
            with Progress() as progress:
                task = progress.add_task(f"[green]Indexing {len(files_to_index)} changes...", total=len(files_to_index))
                for file_path in files_to_index:
                    engine.index_file(file_path)
                    progress.update(task, advance=1)
            
    console.print("[bold green]✅ Indexation terminée. En attente de changements...[/]")
    
    # 2. Start Watcher
    start_watcher(engine, cwd)

if __name__ == "__main__":
    app()
