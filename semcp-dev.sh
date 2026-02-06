#!/bin/bash
# Dev script for quick iteration without push/curl
# Usage: ./semcp-dev.sh

set -e

INSTALL_DIR="$HOME/.semcp"
VENV_DIR="$INSTALL_DIR/.venv"

echo "🔄 Installing from local source..."

# Install in editable mode using pip (avoids uv reinstalling all deps including onnxruntime)
"$VENV_DIR/bin/pip" install -e . --quiet --no-deps 2>/dev/null || "$VENV_DIR/bin/pip" install -e . --quiet

# Ensure GPU support: if onnxruntime (CPU) is installed, it breaks onnxruntime-gpu
# We need onnxruntime-gpu ONLY, and fastembed works with it
if "$VENV_DIR/bin/pip" show onnxruntime >/dev/null 2>&1; then
    echo "🎮 Fixing ONNX GPU support..."
    "$VENV_DIR/bin/pip" uninstall onnxruntime -y 2>/dev/null || true
    "$VENV_DIR/bin/pip" install onnxruntime-gpu --force-reinstall --quiet
fi

echo "✅ Installed. Starting semcp..."
echo ""

# Run semcp
exec "$VENV_DIR/bin/python" -m semantic_search_mcp.cli "$@"
