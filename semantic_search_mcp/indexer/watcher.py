import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from semantic_search_mcp.indexer.engine import SemanticEngine
import os

class IndexingHandler(FileSystemEventHandler):
    def __init__(self, engine: SemanticEngine, ignored_dirs=None):
        self.engine = engine
        self.ignored_dirs = ignored_dirs or [".git", "__pycache__", ".venv", ".semcp", ".semsearch"]

    def on_modified(self, event):
        if not event.is_directory:
            if any(ignored in event.src_path for ignored in self.ignored_dirs):
                return
            print(f"[*] Change detected: {event.src_path}")
            self.engine.index_file(event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            if any(ignored in event.src_path for ignored in self.ignored_dirs):
                return
            print(f"[+] New file: {event.src_path}")
            self.engine.index_file(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            if any(ignored in event.src_path for ignored in self.ignored_dirs):
                return
            print(f"[-] Deleted: {event.src_path}")
            self.engine.delete_file(event.src_path)

def start_watcher(engine: SemanticEngine, path: str):
    event_handler = IndexingHandler(engine)
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    print(f"[*] Started watching {path}...")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
