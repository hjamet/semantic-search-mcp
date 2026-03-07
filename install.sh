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
uv venv "$VENV_DIR" --python 3.11 --seed

echo "📦 Installing specific dependencies..."
# Install everything in one pass with CUDA 12 channel to avoid onnxruntime conflict
uv pip install --python "$VENV_DIR/bin/python" "$SOURCE" \
    --extra-index-url https://aiinfra.pkgs.visualstudio.com/PublicPackages/_packaging/onnxruntime-cuda-12/pypi/simple/ \
    --force-reinstall
echo "🎮 GPU support: onnxruntime-gpu installed via CUDA 12 channel"

echo "🧠 Initializing dedicated model cache..."
export FASTEMBED_CACHE_PATH="$INSTALL_DIR/cache"
mkdir -p "$FASTEMBED_CACHE_PATH"
# Clean any past incomplete downloads just in case
find "$FASTEMBED_CACHE_PATH" -name "*.incomplete" -type f -delete 2>/dev/null || true

# Pre-download the model to avoid first-run delays and handle corruptions
if ! "$VENV_DIR/bin/python" -c "
import sys
from fastembed import TextEmbedding
try:
    print('Downloading BAAI/bge-small-en-v1.5...')
    TextEmbedding(model_name='BAAI/bge-small-en-v1.5')
except Exception as e:
    print(f'Download failed: {e}')
    sys.exit(1)
"; then
    echo "⚠️ Model download incomplete. Cleaning up corrupted cache..."
    rm -rf "$FASTEMBED_CACHE_PATH/models--qdrant--bge-small-en-v1.5-onnx-q"
fi

# 4. Create Wrapper Scripts (not symlinks, to ignore active venvs)
echo "🔗 Creating wrapper scripts in $BIN_DIR..."
mkdir -p "$BIN_DIR"

# Remove old symlinks/binaries if they exist
rm -f "$BIN_DIR/semcp"
rm -f "$BIN_DIR/semantic_search_mcp"

# Create semcp wrapper
cat > "$BIN_DIR/semcp" << 'WRAPPER'
#!/bin/bash
# Wrapper to ensure we always use the correct Python environment
export FASTEMBED_CACHE_PATH="$HOME/.semcp/cache"
exec "$HOME/.semcp/.venv/bin/python" -m semantic_search_mcp.cli "$@"
WRAPPER
chmod +x "$BIN_DIR/semcp"

# Create semantic_search_mcp wrapper
cat > "$BIN_DIR/semantic_search_mcp" << 'WRAPPER'
#!/bin/bash
# Wrapper to ensure we always use the correct Python environment
export FASTEMBED_CACHE_PATH="$HOME/.semcp/cache"
exec "$HOME/.semcp/.venv/bin/python" -m semantic_search_mcp.server "$@"
WRAPPER
chmod +x "$BIN_DIR/semantic_search_mcp"

# 5. Register in MCP Config
echo "⚙️  Configuring MCP server..."
MCP_CONFIG_PATH="$HOME/.gemini/antigravity/mcp_config.json"
MCP_BIN_PATH="$BIN_DIR/semantic_search_mcp"

if [ -f "$MCP_CONFIG_PATH" ]; then
    # Create temp python script to safely edit JSON
    cat <<EOF > update_config.py
import json
import os
from pathlib import Path

config_path = "$MCP_CONFIG_PATH"
bin_path = "$MCP_BIN_PATH"
cache_path = "$INSTALL_DIR/cache"

try:
    with open(config_path, 'r') as f:
        config = json.load(f)
    
    if "mcpServers" not in config:
        config["mcpServers"] = {}
        
    config["mcpServers"]["semantic-search"] = {
        "command": bin_path,
        "args": [],
        "env": {
            "FASTEMBED_CACHE_PATH": cache_path
        }
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
