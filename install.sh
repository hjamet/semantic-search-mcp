#!/bin/bash

# Semantic Search MCP Installer
set -e

INSTALL_DIR="$HOME/.semcp"
VENV_DIR="$INSTALL_DIR/.venv"
BIN_DIR="$HOME/.local/bin"

echo "🚀 Installing Semantic Search MCP..."

# 1. Check for uv
if ! command -v uv &> /dev/null; then
    echo "📦 uv not found. Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.cargo/env
fi

# 2. Determine Source
if [ -f "pyproject.toml" ] && grep -q "name = \"semantic-search-mcp\"" pyproject.toml; then
    SOURCE="."
    echo "📍 Detected local source."
else
    SOURCE="git+https://github.com/hjamet/semantic-search-mcp"
    echo "🌐 Using remote source: $SOURCE"
fi

# 3. Create/Update Venv
echo "🛠️  Setting up environment in $VENV_DIR..."
mkdir -p "$INSTALL_DIR"
uv venv "$VENV_DIR" --python 3.10 --seed

echo "📦 Installing specific dependencies..."
# Force install dependencies in the venv
uv pip install --python "$VENV_DIR/bin/python" "$SOURCE" --force-reinstall

# Fix CUDA support: fastembed pulls onnxruntime (CPU), we need onnxruntime-gpu
echo "🎮 Setting up GPU support (CUDA)..."
"$VENV_DIR/bin/pip" uninstall onnxruntime -y 2>/dev/null || true
"$VENV_DIR/bin/pip" install onnxruntime-gpu --force-reinstall --quiet

# 4. Create Symlinks
echo "🔗 Creating symlinks in $BIN_DIR..."
mkdir -p "$BIN_DIR"

# Remove old symlinks/binaries if they exist
rm -f "$BIN_DIR/semcp"
rm -f "$BIN_DIR/semantic_search_mcp"

ln -s "$VENV_DIR/bin/semcp" "$BIN_DIR/semcp"
ln -s "$VENV_DIR/bin/semantic_search_mcp" "$BIN_DIR/semantic_search_mcp"

# 5. Register in MCP Config
echo "⚙️  Configuring MCP server..."
MCP_CONFIG_PATH="$HOME/.gemini/antigravity/mcp_config.json"
MCP_BIN_PATH="$VENV_DIR/bin/semantic_search_mcp"

if [ -f "$MCP_CONFIG_PATH" ]; then
    # Create temp python script to safely edit JSON
    cat <<EOF > update_config.py
import json
import os
from pathlib import Path

config_path = "$MCP_CONFIG_PATH"
bin_path = "$MCP_BIN_PATH"

try:
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    if "mcpServers" not in config:
        config["mcpServers"] = {}
        
    config["mcpServers"]["semantic-search"] = {
        "command": bin_path,
        "args": [],
        "env": {}
    }
    
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print("Updated mcp_config.json")
except Exception as e:
    print(f"Error updating config: {e}")
EOF
    
    python3 update_config.py
    rm update_config.py
else
    echo "Warning: mcp_config.json not found at $MCP_CONFIG_PATH"
fi

echo ""
echo "✅ Installation complete!"
echo "   - Environment: $VENV_DIR"
echo "   - Binaries: $BIN_DIR/semcp"
echo ""
echo "Pour commencer :"
echo "1. Redémarrez votre IDE/MCP host."
echo "2. Allez à la racine d'un repo."
echo "3. Lancez 'semcp'."
