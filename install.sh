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
uv tool install git+https://github.com/hjamet/semantic-search-mcp --force

# 3. Create config directory
mkdir -p ~/.semcp

echo "✅ Installation complete!"
echo ""
echo "Pour commencer :"
echo "1. Allez à la racine d'un repo."
echo "2. Lancez 'semcp'."
echo "3. Redémarrez votre IDE/MCP host."
