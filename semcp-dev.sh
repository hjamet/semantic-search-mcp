#!/bin/bash
# Dev script for quick iteration without push/curl
# Usage: ./semcp-dev.sh

set -e

INSTALL_DIR="$HOME/.semcp"
VENV_DIR="$INSTALL_DIR/.venv"

echo "🔄 Installing from local source..."

# Install in the semcp venv
uv pip install --python "$VENV_DIR/bin/python" -e . --quiet

# Ensure GPU support (onnxruntime-gpu ONLY - having both causes conflicts)
"$VENV_DIR/bin/pip" uninstall onnxruntime -y 2>/dev/null || true
"$VENV_DIR/bin/pip" install onnxruntime-gpu --quiet 2>/dev/null || true

echo "✅ Installed. Starting semcp..."
echo ""

# Run semcp
exec "$VENV_DIR/bin/python" -m semantic_search_mcp.cli "$@"
