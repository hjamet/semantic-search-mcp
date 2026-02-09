"""
Dependency Analyzer Module

Analyzes import statements in source files to build a dependency graph.
Supports Python (via AST) and JavaScript/TypeScript (via regex).
"""
import ast
import os
import re
from pathlib import Path
from typing import Dict, List, Any, Optional, Set


class DependencyAnalyzer:
    """Analyzes file dependencies and extracts code structure information."""
    
    # Supported file extensions
    PYTHON_EXTENSIONS = {'.py'}
    JS_EXTENSIONS = {'.js', '.ts', '.jsx', '.tsx'}
    ALL_EXTENSIONS = PYTHON_EXTENSIONS | JS_EXTENSIONS
    
    def __init__(self, repo_path: str, ignored_dirs: Optional[List[str]] = None):
        """
        Initialize the DependencyAnalyzer.
        
        Args:
            repo_path: Root directory of the repository to analyze.
            ignored_dirs: Directories to ignore during analysis.
        """
        self.repo_path = Path(repo_path).resolve()
        self.ignored_dirs = set(ignored_dirs or [
            ".git", "__pycache__", ".venv", "venv", "node_modules", 
            ".semcp", ".semsearch", "dist", "build", ".next"
        ])
        self._file_cache: Dict[str, List[str]] = {}  # path -> imports
        self._source_roots = self._discover_source_roots()
        
    def _discover_source_roots(self) -> List[Path]:
        """Discover all directories that serve as Python source roots.
        
        A source root is any direct subdirectory of repo_path that contains
        at least one Python package (a subfolder with __init__.py).
        The repo_path itself is always included as the primary root.
        """
        roots = [self.repo_path]
        for entry in self.repo_path.iterdir():
            if not entry.is_dir() or entry.name in self.ignored_dirs or entry.name.startswith('.'):
                continue
            # Check if this directory contains at least one Python package
            for sub in entry.iterdir():
                if sub.is_dir() and (sub / '__init__.py').exists():
                    roots.append(entry)
                    break
        return roots

    def _get_all_files(self) -> List[Path]:
        """Get all supported source files in the repository."""
        files = []
        for root, dirs, filenames in os.walk(self.repo_path):
            # Filter out ignored directories
            dirs[:] = [d for d in dirs if d not in self.ignored_dirs]
            
            for filename in filenames:
                ext = Path(filename).suffix
                if ext in self.ALL_EXTENSIONS:
                    files.append(Path(root) / filename)
        return files
    
    def _parse_python_imports(self, file_path: Path) -> List[str]:
        """Extract import statements from a Python file using AST."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            imports = []
            
            class ImportVisitor(ast.NodeVisitor):
                def __init__(self, analyzer):
                    self.analyzer = analyzer
                    self.imports = []
                    self.in_type_checking = False
                    self.in_try_block = False
                    self.in_except_block = False

                def visit_If(self, node):
                    # Check for if TYPE_CHECKING:
                    is_type_checking = False
                    if isinstance(node.test, ast.Name) and node.test.id == 'TYPE_CHECKING':
                        is_type_checking = True
                    elif isinstance(node.test, ast.Attribute) and node.test.attr == 'TYPE_CHECKING':
                        is_type_checking = True
                    
                    if is_type_checking:
                        old_val = self.in_type_checking
                        self.in_type_checking = True
                        # Still visit but we'll flag imports
                        self.generic_visit(node)
                        self.in_type_checking = old_val
                    else:
                        self.generic_visit(node)

                def visit_Try(self, node):
                    # Flag that we are in a try block
                    old_try = self.in_try_block
                    self.in_try_block = True
                    for item in node.body:
                        self.visit(item)
                    self.in_try_block = old_try

                    # Flag except blocks
                    for handler in node.handlers:
                        old_except = self.in_except_block
                        self.in_except_block = True
                        self.visit(handler)
                        self.in_except_block = old_except
                    
                    for item in node.orelse:
                        self.visit(item)
                    for item in node.finalbody:
                        self.visit(item)

                def visit_Import(self, node):
                    if self.in_type_checking:
                        return
                    for alias in node.names:
                        self.imports.append((alias.name, 0))

                def visit_ImportFrom(self, node):
                    if self.in_type_checking:
                        return
                    module = node.module or ''
                    level = node.level
                    
                    if level > 0:
                        # For relative imports, both the module and the names can be files
                        self.imports.append((module, level))
                        # Also handle 'from . import a, b' where a and b are modules
                        if not module:
                            for alias in node.names:
                                self.imports.append((alias.name, level))
                        else:
                            for alias in node.names:
                                self.imports.append((f"{module}.{alias.name}", level))
                    else:
                        # Absolute import
                        self.imports.append((module, 0))
                        for alias in node.names:
                            self.imports.append((f"{module}.{alias.name}", 0))

            visitor = ImportVisitor(self)
            visitor.visit(tree)
            
            # Process gathered imports
            all_imports = []
            for module_name, level in visitor.imports:
                if level > 0:
                    # Resolve relative import to a real path string
                    resolved = self._resolve_relative_import(file_path, module_name, level)
                    if resolved:
                        all_imports.append(resolved)
                else:
                    # Absolute import
                    all_imports.append(module_name)
                    
            return all_imports
        except (SyntaxError, UnicodeDecodeError, FileNotFoundError, IOError):
            return []
    
    def _resolve_relative_import(self, file_path: Path, module: str, level: int) -> Optional[str]:
        """Resolve a relative import to a module path."""
        try:
            current_dir = file_path.parent
            for _ in range(level - 1):
                current_dir = current_dir.parent
            
            # If from . import something, module might be empty
            if not module:
                if (current_dir / '__init__.py').exists():
                    return str((current_dir / '__init__.py').relative_to(self.repo_path))
                return None

            # Try to find the module
            parts = module.split('.')
            target = current_dir / '/'.join(parts)
            
            # Check if it's a file or package
            if (target.with_suffix('.py')).exists():
                return str(target.with_suffix('.py').relative_to(self.repo_path))
            elif (target / '__init__.py').exists():
                return str((target / '__init__.py').relative_to(self.repo_path))
            elif target.exists() and target.is_dir():
                # Might be a namespace package or just a directory
                # If there's no __init__.py, we don't treat it as a python dependency normally
                # but for graph purposes, maybe we should find ANY python file inside?
                # For now, stick to standard packages.
                pass
        except (ValueError, AttributeError):
            pass
            
        return None
    
    def _parse_js_imports(self, file_path: Path) -> List[str]:
        """Extract import statements from a JS/TS file using regex."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            imports = []
            
            # ES6 imports: import ... from 'module'
            es6_pattern = r"import\s+(?:.*?\s+from\s+)?['\"]([^'\"]+)['\"]"
            imports.extend(re.findall(es6_pattern, content))
            
            # CommonJS: require('module')
            cjs_pattern = r"require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)"
            imports.extend(re.findall(cjs_pattern, content))
            
            # Dynamic imports: import('module')
            dynamic_pattern = r"import\s*\(\s*['\"]([^'\"]+)['\"]\s*\)"
            imports.extend(re.findall(dynamic_pattern, content))
            
            return imports
        except (UnicodeDecodeError, IOError):
            return []
    
    def _resolve_import_to_file(self, source_file: Path, import_name: str) -> Optional[str]:
        """Try to resolve an import name to a file path in the repository."""
        # If it's already a path-like string (from _resolve_relative_import), return it
        if import_name.endswith('.py'):
            if (self.repo_path / import_name).exists():
                return import_name

        # Skip external modules if they don't look like paths
        if not import_name.startswith('.') and '/' not in import_name:
            # Check if it starts with a top-level package existing in any source root
            parts = import_name.split('.')
            if not any((root / parts[0]).exists() for root in self._source_roots):
                return None  # Likely external dependency
        
        # For relative imports in JS/TS (also handles strings from py but usually relative)
        if import_name.startswith('.'):
            base_dir = source_file.parent
            target = (base_dir / import_name).resolve()
            
            # Try with extensions
            for ext in ['', '.py', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts', '/__init__.py']:
                candidate = Path(str(target) + ext)
                if candidate.exists() and candidate.is_file():
                    try:
                        return str(candidate.relative_to(self.repo_path))
                    except ValueError:
                        continue
        
        # For Python-style absolute imports (dots to slashes)
        parts_path = import_name.replace('.', '/')
        for root in self._source_roots:
            for ext in ['.py', '/__init__.py']:
                candidate = root / (parts_path + ext)
                if candidate.exists() and candidate.is_file():
                    return str(candidate.relative_to(self.repo_path))
        
        # Try partial resolution for imports like 'from package.subpkg import something'
        # when 'something' is actually a module 'something.py'
        if '.' in import_name:
            parts = import_name.split('.')
            for i in range(len(parts)-1, 0, -1):
                prefix = '/'.join(parts[:i])
                suffix = parts[i]
                for root in self._source_roots:
                    candidate = root / prefix / f"{suffix}.py"
                    if candidate.exists() and candidate.is_file():
                        return str(candidate.relative_to(self.repo_path))

        return None
    
    def analyze_file(self, file_path: Path) -> Dict[str, Any]:
        """
        Analyze a single file for imports.
        
        Returns:
            Dict with 'path' and 'imports' (list of resolved file paths)
        """
        rel_path = str(file_path.relative_to(self.repo_path))
        ext = file_path.suffix
        
        # Parse imports based on file type
        if ext in self.PYTHON_EXTENSIONS:
            raw_imports = self._parse_python_imports(file_path)
        elif ext in self.JS_EXTENSIONS:
            raw_imports = self._parse_js_imports(file_path)
        else:
            raw_imports = []
        
        # Resolve imports to actual files in the repo
        resolved_imports = []
        for imp in raw_imports:
            resolved = self._resolve_import_to_file(file_path, imp)
            if resolved and resolved != rel_path:  # Avoid self-references
                resolved_imports.append(resolved)
        
        return {
            'path': rel_path,
            'imports': list(set(resolved_imports))  # Deduplicate
        }
    
    def build_graph(self) -> Dict[str, Any]:
        """
        Build the complete dependency graph.
        
        Returns:
            Dict with 'nodes' (list of file info) and 'edges' (list of dependencies)
        """
        files = self._get_all_files()
        nodes = []
        edges = []
        file_set = set()
        
        # First pass: collect all files and their imports
        file_data = {}
        for file_path in files:
            analysis = self.analyze_file(file_path)
            rel_path = analysis['path']
            file_set.add(rel_path)
            file_data[rel_path] = analysis
        
        # Second pass: build nodes and edges
        for rel_path, analysis in file_data.items():
            # Create node
            name = Path(rel_path).name
            directory = str(Path(rel_path).parent)
            extension = Path(rel_path).suffix
            
            nodes.append({
                'id': rel_path,
                'label': name,
                'directory': directory if directory != '.' else '',
                'extension': extension,
                'type': 'python' if extension in self.PYTHON_EXTENSIONS else 'javascript'
            })
            
            # Create edges (only to files that exist in our repo)
            for imported in analysis['imports']:
                if imported in file_set:
                    edges.append({
                        'source': rel_path,
                        'target': imported
                    })
        
        return {
            'nodes': nodes,
            'edges': edges
        }
    
    def get_file_details(self, file_path: str) -> Dict[str, Any]:
        """
        Get detailed information about a file including functions and docstrings.
        
        Args:
            file_path: Relative path to the file from repo root.
            
        Returns:
            Dict with file info, functions, classes, and their docstrings.
        """
        full_path = self.repo_path / file_path
        
        if not full_path.exists():
            return {'error': 'File not found', 'path': file_path}
        
        ext = full_path.suffix
        
        if ext in self.PYTHON_EXTENSIONS:
            return self._get_python_details(full_path, file_path)
        elif ext in self.JS_EXTENSIONS:
            return self._get_js_details(full_path, file_path)
        else:
            return {'path': file_path, 'items': []}
    
    def _find_unused_symbols(self, symbols: List[str], exclude_file: Path) -> Set[str]:
        """
        Find symbols that are not used anywhere else in the codebase.
        
        Args:
            symbols: List of symbol names to check.
            exclude_file: The file where symbols are defined (skip searching in it).
            
        Returns:
            Set of symbol names that are not found in other files.
        """
        # Entry points and magic methods are never considered unused
        always_used = {
            '__init__', '__main__', 'main', 'app', 'setup', 'teardown',
            '__str__', '__repr__', '__eq__', '__hash__', '__len__', '__iter__',
            '__enter__', '__exit__', '__call__', '__getitem__', '__setitem__',
            '__new__', '__del__', '__bool__', '__contains__'
        }
        
        # Filter out always-used symbols
        symbols_to_check = [s for s in symbols if s not in always_used and not s.startswith('_')]
        
        if not symbols_to_check:
            return set()
        
        unused = set(symbols_to_check)
        
        # Search in all Python files
        for file_path in self._get_all_files():
            if file_path == exclude_file or file_path.suffix not in self.PYTHON_EXTENSIONS:
                continue
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Check which symbols appear in this file
                for symbol in list(unused):
                    # Use word boundary regex to avoid partial matches
                    if re.search(rf'\b{re.escape(symbol)}\b', content):
                        unused.discard(symbol)
                
                if not unused:
                    break  # All symbols are used
                    
            except (UnicodeDecodeError, IOError):
                continue
        
        return unused

    def _get_python_details(self, full_path: Path, rel_path: str) -> Dict[str, Any]:
        """Extract functions, classes, and docstrings from a Python file."""
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            tree = ast.parse(content)
            items = []
            all_symbols = []  # Collect all symbols for unused detection
            
            for node in ast.iter_child_nodes(tree):
                if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                    docstring = ast.get_docstring(node) or ''
                    all_symbols.append(node.name)
                    items.append({
                        'name': node.name,
                        'type': 'function',
                        'line': node.lineno,
                        'docstring': docstring,
                        'signature': self._get_function_signature(node)
                    })
                elif isinstance(node, ast.ClassDef):
                    docstring = ast.get_docstring(node) or ''
                    methods = []
                    all_symbols.append(node.name)
                    
                    for item in node.body:
                        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            method_doc = ast.get_docstring(item) or ''
                            all_symbols.append(item.name)  # Add method names too
                            methods.append({
                                'name': item.name,
                                'type': 'method',
                                'line': item.lineno,
                                'docstring': method_doc
                            })
                    
                    items.append({
                        'name': node.name,
                        'type': 'class',
                        'line': node.lineno,
                        'docstring': docstring,
                        'methods': methods
                    })
            
            # Find unused symbols
            unused_symbols = self._find_unused_symbols(all_symbols, full_path)
            
            # Mark items as unused
            for item in items:
                item['unused'] = item['name'] in unused_symbols
                if 'methods' in item:
                    for method in item['methods']:
                        method['unused'] = method['name'] in unused_symbols
            
            return {
                'path': rel_path,
                'language': 'python',
                'items': items
            }
        except (SyntaxError, UnicodeDecodeError) as e:
            return {'path': rel_path, 'error': str(e), 'items': []}
    
    def _get_function_signature(self, node: ast.FunctionDef) -> str:
        """Generate a readable function signature."""
        args = []
        for arg in node.args.args:
            args.append(arg.arg)
        return f"{node.name}({', '.join(args)})"
    
    def _get_js_details(self, full_path: Path, rel_path: str) -> Dict[str, Any]:
        """Extract functions from a JS/TS file using regex (simplified)."""
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            items = []
            
            # Match function declarations
            func_pattern = r'(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)'
            for match in re.finditer(func_pattern, content):
                line_num = content[:match.start()].count('\n') + 1
                items.append({
                    'name': match.group(1),
                    'type': 'function',
                    'line': line_num,
                    'docstring': ''  # JS docstrings need JSDoc parser
                })
            
            # Match arrow functions assigned to const/let
            arrow_pattern = r'(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>'
            for match in re.finditer(arrow_pattern, content):
                line_num = content[:match.start()].count('\n') + 1
                items.append({
                    'name': match.group(1),
                    'type': 'function',
                    'line': line_num,
                    'docstring': ''
                })
            
            # Match class declarations
            class_pattern = r'(?:export\s+)?class\s+(\w+)'
            for match in re.finditer(class_pattern, content):
                line_num = content[:match.start()].count('\n') + 1
                items.append({
                    'name': match.group(1),
                    'type': 'class',
                    'line': line_num,
                    'docstring': '',
                    'methods': []
                })
            
            return {
                'path': rel_path,
                'language': 'javascript',
                'items': items
            }
        except (UnicodeDecodeError, IOError) as e:
            return {'path': rel_path, 'error': str(e), 'items': []}
