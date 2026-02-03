#!/bin/bash

# Semantic Search MCP Installer
set -e

echo "🚀 Installing Semantic Search MCP..."

# 1. Check for uv
if ! command -v uv &> /dev/null; then
    echo "📦 uv not found. Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.cargo/env
fi

# 2. Install the package
echo "🛠️ Installing package..."
uv tool install . --force

# 3. Create config directory
mkdir -p ~/.semcp

# 4. Register in MCP Config
echo "⚙️  Configuring MCP server..."
MCP_CONFIG_PATH="$HOME/.gemini/antigravity/mcp_config.json"
BIN_PATH="$HOME/.local/bin/semantic_search_mcp"

if [ -f "$MCP_CONFIG_PATH" ]; then
    # Create temp python script to safely edit JSON
    cat <<EOF > update_config.py
import json
import os
from pathlib import Path

config_path = "$MCP_CONFIG_PATH"
bin_path = "$BIN_PATH"

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

echo "✅ Installation complete!"
echo ""
echo "Pour commencer :"
echo "1. Redémarrez votre IDE/MCP host (une dernière fois)."
echo "2. Allez à la racine d'un repo."
echo "3. Lancez 'semcp'."
