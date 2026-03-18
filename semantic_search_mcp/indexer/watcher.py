import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from semantic_search_mcp.indexer.engine import SemanticEngine
import os
import sys

from semantic_search_mcp.constants import ALLOWED_EXTENSIONS, IGNORED_DIRS
from pathlib import Path

class IndexingHandler(FileSystemEventHandler):
    def __init__(self, engine: SemanticEngine, ignored_dirs=None):
        self.engine = engine
        self.ignored_dirs = ignored_dirs or IGNORED_DIRS

    def _is_ignored(self, path: str) -> bool:
        """Check if a file path should be ignored based on directory and extension rules."""
        p = Path(path)
        # Ignore files in ignored directories
        for part in p.parts:
            if part in self.ignored_dirs:
                return True
        # Ignore files with non-allowed extensions
        if p.suffix not in ALLOWED_EXTENSIONS:
            return True
        return False

    def on_modified(self, event):
        if not event.is_directory:
            if self._is_ignored(event.src_path):
                return
            sys.stderr.write(f"[*] Change detected: {event.src_path}\n")
            self.engine.index_file(event.src_path)

    def on_created(self, event):
        if not event.is_directory:
            if self._is_ignored(event.src_path):
                return
            sys.stderr.write(f"[+] New file: {event.src_path}\n")
            self.engine.index_file(event.src_path)

    def on_deleted(self, event):
        if not event.is_directory:
            if self._is_ignored(event.src_path):
                return
            sys.stderr.write(f"[-] Deleted: {event.src_path}\n")
            self.engine.delete_file(event.src_path)

def start_watcher(engine: SemanticEngine, path: str):
    event_handler = IndexingHandler(engine)
    observer = Observer()
    observer.schedule(event_handler, path, recursive=True)
    observer.start()
    sys.stderr.write(f"[*] Started watching {path}...\n")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()
