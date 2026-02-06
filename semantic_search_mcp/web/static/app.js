/**
 * Dependency Graph Visualization - Main Application
 * 
 * Uses Cytoscape.js for interactive graph rendering with dagre layout.
 */

// ============================================
// State Management
// ============================================

const state = {
    cy: null,
    graph: { nodes: [], edges: [] },
    selectedNode: null,
    importantNodes: new Set()
};

// ============================================
// API Functions
// ============================================

const api = {
    async getGraph() {
        const response = await fetch('/api/graph');
        if (!response.ok) throw new Error('Failed to fetch graph');
        return response.json();
    },

    async getFileDetails(path) {
        const response = await fetch(`/api/file/${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error('Failed to fetch file details');
        return response.json();
    },

    async search(query, semantic = true) {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, semantic })
        });
        if (!response.ok) throw new Error('Search failed');
        return response.json();
    },

    async setImportant(path, important) {
        const response = await fetch('/api/important', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, important })
        });
        if (!response.ok) throw new Error('Failed to update importance');
        return response.json();
    },

    async getImportant() {
        const response = await fetch('/api/important');
        if (!response.ok) throw new Error('Failed to get important nodes');
        return response.json();
    }
};

// ============================================
// Cytoscape Configuration
// ============================================

function getNodeColor(node) {
    if (node.data('important')) {
        return '#f59e0b';
    }
    return node.data('type') === 'python' ? '#3b82f6' : '#eab308';
}

function getNodeSize(node) {
    // Size based on connections
    const degree = node.degree();
    const base = node.data('important') ? 50 : 40;
    return Math.min(base + degree * 3, 80);
}

const cytoscapeStyle = [
    // Nodes
    {
        selector: 'node',
        style: {
            'label': 'data(label)',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 8,
            'font-size': 11,
            'font-family': 'Inter, sans-serif',
            'font-weight': 500,
            'color': '#94a3b8',
            'text-outline-color': '#0a0a0f',
            'text-outline-width': 2,
            'background-color': function (node) { return getNodeColor(node); },
            'width': function (node) { return getNodeSize(node); },
            'height': function (node) { return getNodeSize(node); },
            'border-width': 2,
            'border-color': 'rgba(255, 255, 255, 0.1)',
            'transition-property': 'background-color, width, height, border-color, opacity',
            'transition-duration': '200ms'
        }
    },
    // Important nodes glow
    {
        selector: 'node[?important]',
        style: {
            'border-color': '#f59e0b',
            'border-width': 3,
            'shadow-blur': 20,
            'shadow-color': 'rgba(245, 158, 11, 0.6)',
            'shadow-opacity': 1,
            'z-index': 10
        }
    },
    // Edges
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'line-color': 'rgba(99, 102, 241, 0.3)',
            'target-arrow-color': 'rgba(99, 102, 241, 0.5)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            'transition-property': 'line-color, target-arrow-color, width, opacity',
            'transition-duration': '200ms'
        }
    },
    // Hover state
    {
        selector: 'node:active, node:selected',
        style: {
            'border-width': 3,
            'border-color': '#6366f1'
        }
    },
    // Highlighted (focused) node
    {
        selector: 'node.highlighted',
        style: {
            'border-color': '#a5b4fc',
            'border-width': 4,
            'z-index': 100
        }
    },
    // Connected edges when node is highlighted
    {
        selector: 'edge.highlighted',
        style: {
            'line-color': '#6366f1',
            'target-arrow-color': '#6366f1',
            'width': 2.5,
            'z-index': 100
        }
    },
    // Connected nodes
    {
        selector: 'node.connected',
        style: {
            'border-color': '#818cf8',
            'border-width': 3
        }
    },
    // Dimmed elements (not connected to highlighted)
    {
        selector: 'node.dimmed',
        style: {
            'opacity': 0.2
        }
    },
    {
        selector: 'edge.dimmed',
        style: {
            'opacity': 0.1
        }
    },
    // Search result highlight
    {
        selector: 'node.search-result',
        style: {
            'border-color': '#22c55e',
            'border-width': 4,
            'z-index': 50
        }
    }
];

// ============================================
// Graph Initialization
// ============================================

async function initGraph() {
    try {
        // Fetch graph data
        state.graph = await api.getGraph();

        // Convert to Cytoscape format
        const elements = {
            nodes: state.graph.nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    directory: node.directory,
                    extension: node.extension,
                    type: node.type,
                    important: node.important || false
                }
            })),
            edges: state.graph.edges.map((edge, idx) => ({
                data: {
                    id: `edge-${idx}`,
                    source: edge.source,
                    target: edge.target
                }
            }))
        };

        // Initialize Cytoscape
        state.cy = cytoscape({
            container: document.getElementById('cy'),
            elements: elements,
            style: cytoscapeStyle,
            layout: {
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 60,
                rankSep: 80,
                animate: true,
                animationDuration: 500
            },
            minZoom: 0.1,
            maxZoom: 3,
            wheelSensitivity: 0.3
        });

        // Track important nodes
        state.graph.nodes.forEach(node => {
            if (node.important) {
                state.importantNodes.add(node.id);
            }
        });

        // Setup event handlers
        setupEventHandlers();

        // Update stats
        updateStats();

        // Hide loader
        document.getElementById('loader').classList.add('hidden');

    } catch (error) {
        console.error('Failed to initialize graph:', error);
        document.querySelector('.loader-content p').textContent =
            'Failed to load graph. Please refresh.';
    }
}

// ============================================
// Event Handlers
// ============================================

function setupEventHandlers() {
    // Node click - show details
    state.cy.on('tap', 'node', async function (event) {
        const node = event.target;
        const nodeId = node.id();

        // Highlight node and connections
        highlightNode(nodeId);

        // Show file details
        await showFileDetails(nodeId);
    });

    // Background click - clear selection
    state.cy.on('tap', function (event) {
        if (event.target === state.cy) {
            clearHighlight();
            hideFileDetails();
        }
    });

    // Node hover
    state.cy.on('mouseover', 'node', function (event) {
        document.body.style.cursor = 'pointer';
    });

    state.cy.on('mouseout', 'node', function () {
        document.body.style.cursor = 'default';
    });

    // Search
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performSearch();
    });

    // Controls
    document.getElementById('fit-btn').addEventListener('click', () => {
        state.cy.fit(undefined, 50);
    });

    document.getElementById('zoom-in-btn').addEventListener('click', () => {
        state.cy.zoom(state.cy.zoom() * 1.3);
    });

    document.getElementById('zoom-out-btn').addEventListener('click', () => {
        state.cy.zoom(state.cy.zoom() / 1.3);
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        clearHighlight();
        hideFileDetails();
        state.cy.fit(undefined, 50);
    });

    // Close details panel
    document.getElementById('close-details').addEventListener('click', () => {
        hideFileDetails();
        clearHighlight();
    });

    // Important button
    document.getElementById('mark-important-btn').addEventListener('click', toggleImportant);
}

// ============================================
// Highlight Functions
// ============================================

function highlightNode(nodeId) {
    // Clear previous highlights
    state.cy.elements().removeClass('highlighted connected dimmed search-result');

    const node = state.cy.getElementById(nodeId);
    const neighborhood = node.neighborhood();
    const connectedNodes = neighborhood.nodes();
    const connectedEdges = neighborhood.edges();

    // Dim all elements
    state.cy.elements().addClass('dimmed');

    // Highlight the node
    node.removeClass('dimmed').addClass('highlighted');

    // Highlight connected elements
    connectedNodes.removeClass('dimmed').addClass('connected');
    connectedEdges.removeClass('dimmed').addClass('highlighted');

    // Also highlight edges that go OUT from this node
    node.outgoers('edge').removeClass('dimmed').addClass('highlighted');
    node.outgoers('node').removeClass('dimmed').addClass('connected');

    // Center on node
    state.cy.animate({
        center: { eles: node },
        zoom: Math.min(state.cy.zoom(), 1.5),
        duration: 300
    });

    state.selectedNode = nodeId;
}

function clearHighlight() {
    state.cy.elements().removeClass('highlighted connected dimmed search-result');
    state.selectedNode = null;
}

// ============================================
// File Details
// ============================================

async function showFileDetails(path) {
    const panel = document.getElementById('file-details');
    const fileName = document.getElementById('file-name');
    const filePath = document.getElementById('file-path');
    const fileItems = document.getElementById('file-items');
    const importantBtn = document.getElementById('mark-important-btn');
    const importantText = document.getElementById('important-text');

    // Update header
    fileName.textContent = path.split('/').pop();
    filePath.textContent = path;

    // Update important button state
    const isImportant = state.importantNodes.has(path);
    importantBtn.classList.toggle('active', isImportant);
    importantText.textContent = isImportant ? 'Marked Important' : 'Mark as Important';

    // Show panel
    panel.classList.remove('hidden');
    document.getElementById('search-results').classList.add('hidden');

    // Fetch details
    try {
        const details = await api.getFileDetails(path);
        renderFileItems(details.items || []);
    } catch (error) {
        fileItems.innerHTML = '<p class="error">Failed to load file details</p>';
    }
}

function renderFileItems(items) {
    const container = document.getElementById('file-items');

    if (!items.length) {
        container.innerHTML = '<p style="color: var(--text-muted); font-size: 13px;">No functions or classes found</p>';
        return;
    }

    container.innerHTML = items.map(item => {
        if (item.type === 'class') {
            return `
                <div class="file-item">
                    <div class="file-item-header">
                        <span class="file-item-type class">class</span>
                        <span class="file-item-name">${item.name}</span>
                        <span class="file-item-line">L${item.line}</span>
                    </div>
                    ${item.docstring ? `<div class="file-item-docstring">${escapeHtml(item.docstring)}</div>` : ''}
                    ${item.methods && item.methods.length ? `
                        <div class="file-item-methods">
                            <div class="file-item-methods-title">Methods (${item.methods.length})</div>
                            ${item.methods.slice(0, 5).map(m => `
                                <div class="method-item">
                                    <span class="file-item-type method">def</span>
                                    <span class="method-name">${m.name}</span>
                                    <span class="method-line">L${m.line}</span>
                                </div>
                            `).join('')}
                            ${item.methods.length > 5 ? `<div class="method-item" style="color: var(--text-muted);">... and ${item.methods.length - 5} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            return `
                <div class="file-item">
                    <div class="file-item-header">
                        <span class="file-item-type function">func</span>
                        <span class="file-item-name">${item.signature || item.name}</span>
                        <span class="file-item-line">L${item.line}</span>
                    </div>
                    ${item.docstring ? `<div class="file-item-docstring">${escapeHtml(item.docstring)}</div>` : ''}
                </div>
            `;
        }
    }).join('');
}

function hideFileDetails() {
    document.getElementById('file-details').classList.add('hidden');
}

// ============================================
// Search
// ============================================

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    const semantic = document.getElementById('semantic-toggle').checked;
    const resultsContainer = document.getElementById('search-results');

    try {
        const data = await api.search(query, semantic);

        // Clear previous search highlights
        state.cy.elements().removeClass('search-result');

        if (data.results && data.results.length > 0) {
            // Show results panel
            resultsContainer.innerHTML = data.results.map(result => `
                <div class="search-result-item" data-path="${result.path}">
                    <div class="name">${result.label}</div>
                    <div class="path">${result.path}</div>
                </div>
            `).join('');
            resultsContainer.classList.remove('hidden');

            // Add click handlers
            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const path = item.dataset.path;
                    highlightNode(path);
                    showFileDetails(path);
                    resultsContainer.classList.add('hidden');
                });
            });

            // Highlight nodes in graph
            data.results.forEach(result => {
                const node = state.cy.getElementById(result.path);
                if (node.length) {
                    node.addClass('search-result');
                }
            });
        } else {
            resultsContainer.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">No results found</p>';
            resultsContainer.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Search failed:', error);
    }
}

// ============================================
// Important Nodes
// ============================================

async function toggleImportant() {
    if (!state.selectedNode) return;

    const isCurrentlyImportant = state.importantNodes.has(state.selectedNode);
    const newImportance = !isCurrentlyImportant;

    try {
        await api.setImportant(state.selectedNode, newImportance);

        // Update local state
        if (newImportance) {
            state.importantNodes.add(state.selectedNode);
        } else {
            state.importantNodes.delete(state.selectedNode);
        }

        // Update node data
        const node = state.cy.getElementById(state.selectedNode);
        node.data('important', newImportance);

        // Update button
        const importantBtn = document.getElementById('mark-important-btn');
        const importantText = document.getElementById('important-text');
        importantBtn.classList.toggle('active', newImportance);
        importantText.textContent = newImportance ? 'Marked Important' : 'Mark as Important';

        // Update stats
        updateStats();

    } catch (error) {
        console.error('Failed to update importance:', error);
    }
}

// ============================================
// Stats
// ============================================

function updateStats() {
    document.getElementById('nodes-count').textContent = state.graph.nodes.length;
    document.getElementById('edges-count').textContent = state.graph.edges.length;
    document.getElementById('important-count').textContent = state.importantNodes.size;
}

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Initialize on DOM Ready
// ============================================

document.addEventListener('DOMContentLoaded', initGraph);
