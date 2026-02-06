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

# Web server port
WEB_PORT = 8765

def update_context_file(cwd: str):
    settings_dir = Path("~/.semcp").expanduser()
    if not settings_dir.exists():
        settings_dir.mkdir(parents=True, exist_ok=True)
        
    settings_path = settings_dir / "settings.json"
    
    settings = {}
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
        except:
            pass
            
    settings["current_context"] = cwd
    
    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
    console.print(f"[dim]Updated context in[/] {settings_path}")

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
def main(
    no_web: bool = typer.Option(False, "--no-web", help="Disable the web visualization server")
):
    """Lancer l'indexeur sémantique sur le dossier actuel."""
    cwd = os.getcwd()
    console.print(f"[bold blue]🚀 Initialisation de Semantic Search pour :[/] {cwd}")
    
    # Mise à jour du context
    update_context_file(cwd)
    
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
            
    console.print("[bold green]✅ Indexation terminée.[/]")
    
    # 3. Start Web Server (unless disabled)
    if not no_web:
        try:
            from semantic_search_mcp.web.api import start_server
            console.print(f"\n[bold cyan]🌐 Graph visualization:[/] [link=http://localhost:{WEB_PORT}]http://localhost:{WEB_PORT}[/link]")
            console.print("[dim]Press Ctrl+C to stop.[/]\n")
            start_server(cwd, engine=engine, port=WEB_PORT, open_browser=True)
        except ImportError as e:
            console.print(f"[yellow]⚠ Web server not available: {e}[/]")
        except Exception as e:
            console.print(f"[red]Failed to start web server: {e}[/]")
    else:
        console.print("[dim]Web visualization disabled (--no-web)[/]")
    
    console.print("[dim]En attente de changements...[/]")
    
    # 4. Start Watcher
    start_watcher(engine, cwd)

if __name__ == "__main__":
    app()

