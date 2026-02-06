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
    fullGraph: { nodes: [], edges: [] }, // Full graph including hidden for path finding
    hiddenGraph: { nodes: [], edges: [] },
    selectedNode: null,
    importantNodes: new Set(),
    hiddenNodes: new Set(),
    searchResults: new Set(),
    currentFilter: 'all', // 'all', 'important', 'search', 'hidden'
    showFolders: false, // Folder grouping toggle
    wasInHiddenView: false, // Track if we came from hidden view
    websocket: null // WebSocket connection for real-time updates
};

// ============================================
// WebSocket for Real-Time Updates
// ============================================

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    state.websocket = new WebSocket(wsUrl);

    state.websocket.onopen = () => {
        console.log('[WebSocket] Connected for real-time updates');
    };

    state.websocket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'graph_updated') {
                console.log('[WebSocket] Graph updated, refreshing...');
                await reloadMainGraph();
            }
        } catch (e) {
            console.warn('[WebSocket] Failed to parse message:', e);
        }
    };

    state.websocket.onclose = () => {
        console.log('[WebSocket] Disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
    };

    state.websocket.onerror = (error) => {
        console.warn('[WebSocket] Error:', error);
    };
}

// ============================================
// API Functions
// ============================================

const api = {
    async getGraph(includeHidden = false) {
        const url = includeHidden ? '/api/graph?include_hidden=true' : '/api/graph';
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch graph');
        return response.json();
    },

    async getHiddenGraph() {
        const response = await fetch('/api/graph/hidden');
        if (!response.ok) throw new Error('Failed to fetch hidden graph');
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

    async setHidden(path, hidden) {
        const response = await fetch('/api/hidden', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, hidden })
        });
        if (!response.ok) throw new Error('Failed to update hidden status');
        return response.json();
    },

    async getHidden() {
        return fetch('/api/hidden').then(res => res.json());
    },

    async deleteFile(path) {
        const res = await fetch(`/api/file/${encodeURIComponent(path)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error('Delete failed');
        return res.json();
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
    const degree = node.degree();
    const base = node.data('important') ? 50 : 40;
    return Math.min(base + degree * 3, 80);
}

const cytoscapeStyle = [
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
    {
        selector: 'edge',
        style: {
            'width': 1.5,
            'line-color': 'rgba(99, 102, 241, 0.3)',
            'target-arrow-color': 'rgba(99, 102, 241, 0.5)',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.8,
            'curve-style': 'bezier',
            'transition-property': 'line-color, target-arrow-color, width, opacity, line-style',
            'transition-duration': '200ms'
        }
    },
    {
        selector: 'node:active, node:selected',
        style: {
            'border-width': 3,
            'border-color': '#6366f1'
        }
    },
    {
        selector: 'node.highlighted',
        style: {
            'border-color': '#a5b4fc',
            'border-width': 4,
            'z-index': 100
        }
    },
    {
        selector: 'edge.highlighted',
        style: {
            'line-color': '#6366f1',
            'target-arrow-color': '#6366f1',
            'width': 2.5,
            'z-index': 100
        }
    },
    {
        selector: 'node.connected',
        style: {
            'border-color': '#818cf8',
            'border-width': 3
        }
    },
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
    {
        selector: 'node.search-match',
        style: {
            'background-color': '#22c55e',
            'border-color': '#22c55e',
            'border-width': 4,
            'shadow-blur': 20,
            'shadow-color': 'rgba(34, 197, 94, 0.6)',
            'shadow-opacity': 1,
            'z-index': 50
        }
    },
    {
        selector: 'node.search-dimmed',
        style: {
            'opacity': 0.25
        }
    },
    {
        selector: 'edge.search-dimmed',
        style: {
            'opacity': 0.1
        }
    },
    {
        selector: 'edge.indirect',
        style: {
            'line-style': 'dashed',
            'line-dash-pattern': [6, 3],
            'line-color': 'rgba(129, 140, 248, 0.6)',
            'target-arrow-color': 'rgba(129, 140, 248, 0.6)',
            'width': 2
        }
    },
    {
        selector: 'node.hidden-node',
        style: {
            'opacity': 0.6,
            'border-style': 'dashed',
            'border-color': '#ef4444'
        }
    },
    {
        selector: ':parent',
        style: {
            'background-color': 'rgba(99, 102, 241, 0.05)',
            'background-opacity': 0.5,
            'border-color': 'rgba(99, 102, 241, 0.3)',
            'border-width': 2,
            'border-style': 'dashed',
            'border-radius': 12,
            'padding': 30,
            'label': 'data(label)',
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': -10,
            'font-size': 12,
            'font-weight': 600,
            'color': '#818cf8',
            'text-outline-color': '#0a0a0f',
            'text-outline-width': 2
        }
    }
];

let originalPositions = null;

// ============================================
// Graph Initialization
// ============================================

async function initGraph() {
    try {
        // Fetch main graph (without hidden nodes)
        state.graph = await api.getGraph(false);

        // Fetch full graph for indirect connection detection
        state.fullGraph = await api.getGraph(true);

        // Fetch hidden nodes info
        const hiddenData = await api.getHidden();
        hiddenData.nodes.forEach(id => state.hiddenNodes.add(id));

        // Convert to Cytoscape format
        const elements = {
            nodes: state.graph.nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    directory: node.directory,
                    extension: node.extension,
                    type: node.type,
                    important: node.important || false,
                    hidden: node.hidden || false
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
            wheelSensitivity: 0.3,
            boxSelectionEnabled: true,
            autoungrabify: false
        });

        // Store original positions after layout
        state.cy.one('layoutstop', () => {
            originalPositions = {};
            state.cy.nodes().forEach(node => {
                originalPositions[node.id()] = { ...node.position() };
            });
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
        highlightNode(nodeId);
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
    state.cy.on('mouseover', 'node', function () {
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

    // Clear search highlight when input is emptied
    searchInput.addEventListener('input', (e) => {
        if (e.target.value.trim() === '') {
            clearSearchHighlight();
            document.getElementById('search-results').classList.add('hidden');
        }
    });

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;
            setFilter(filter);
        });
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
        clearSearchHighlight();
        hideFileDetails();
        document.getElementById('search-input').value = '';
        setFilter('all');
        state.cy.fit(undefined, 50);
    });

    // Close details panel
    document.getElementById('close-details').addEventListener('click', () => {
        hideFileDetails();
        clearHighlight();
    });

    // Important button
    document.getElementById('mark-important-btn').addEventListener('click', toggleImportant);

    // Hide button
    document.getElementById('hide-node-btn').addEventListener('click', toggleHidden);

    // Folder Toggle
    const folderToggle = document.getElementById('folder-toggle');
    folderToggle.addEventListener('change', (e) => {
        state.showFolders = e.target.checked;
        applyFolderGrouping();
    });

    // Delete button - double-click to confirm
    const deleteBtn = document.getElementById('delete-file-btn');
    const deleteText = document.getElementById('delete-text');
    let clickTimeout = null;

    deleteBtn.addEventListener('click', async () => {
        if (clickTimeout) {
            // Second click within the timeout period
            clearTimeout(clickTimeout);
            clickTimeout = null;

            const path = document.getElementById('file-path').textContent;
            try {
                deleteBtn.disabled = true;
                deleteText.textContent = 'Deleting...';
                await api.deleteFile(path);
                hideFileDetails();
                clearHighlight();
                // Graph refresh is automatic via WebSocket
            } catch (error) {
                console.error('Delete failed:', error);
                deleteText.textContent = 'Error!';
                setTimeout(() => {
                    deleteText.textContent = 'Delete';
                    deleteBtn.disabled = false;
                    deleteBtn.classList.remove('confirm');
                }, 2000);
            }
        } else {
            // First click: show confirmation state
            deleteText.textContent = 'Click again';
            deleteBtn.classList.add('confirm');

            clickTimeout = setTimeout(() => {
                deleteText.textContent = 'Delete';
                deleteBtn.classList.remove('confirm');
                clickTimeout = null;
            }, 3000); // 3 seconds to click again
        }
    });

    // Sidebar resize
    setupSidebarResize();
}

// ============================================
// Sidebar Resize
// ============================================

function setupSidebarResize() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('resize-handle');
    let isResizing = false;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        handle.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(280, Math.min(600, e.clientX));
        sidebar.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            handle.classList.remove('resizing');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = '';
            state.cy.resize();
        }
    });
}

// ============================================
// Filter Functions
// ============================================

function setFilter(filter) {
    const previousFilter = state.currentFilter;
    state.currentFilter = filter;

    // Update button states
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Track if we're coming from hidden view
    if (previousFilter === 'hidden' && filter !== 'hidden') {
        state.wasInHiddenView = true;
    }

    // Apply filter
    applyFilter();
}

async function applyFilter() {
    // If coming from hidden view, reload main graph
    if (state.wasInHiddenView && state.currentFilter !== 'hidden') {
        state.wasInHiddenView = false;
        await reloadMainGraph();

        if (state.currentFilter === 'all') {
            return; // reloadMainGraph already handles 'all' case
        }
    }

    // For hidden filter, load hidden nodes
    if (state.currentFilter === 'hidden') {
        await loadHiddenNodes();
        return;
    }

    // For other filters, use the normal graph
    state.cy.elements().style('display', 'element');
    state.cy.elements().removeClass('indirect hidden-node');
    state.cy.edges().style('line-style', 'solid');

    if (state.currentFilter === 'all') {
        // Restore original positions
        if (originalPositions) {
            state.cy.nodes().forEach(node => {
                const pos = originalPositions[node.id()];
                if (pos) {
                    node.position(pos);
                }
            });
        }
        state.cy.fit(undefined, 50);
        return;
    }

    // Determine which nodes should be visible
    let visibleNodeIds = new Set();

    if (state.currentFilter === 'important') {
        visibleNodeIds = new Set(state.importantNodes);
    } else if (state.currentFilter === 'search') {
        visibleNodeIds = new Set(state.searchResults);
    }

    if (visibleNodeIds.size === 0) {
        state.cy.elements().style('display', 'none');
        return;
    }

    // Hide non-visible nodes
    state.cy.nodes().forEach(node => {
        if (!visibleNodeIds.has(node.id())) {
            node.style('display', 'none');
        }
    });

    // Hide all edges first
    state.cy.edges().style('display', 'none');

    // Show direct edges between visible nodes
    state.cy.edges().forEach(edge => {
        const sourceId = edge.source().id();
        const targetId = edge.target().id();
        if (visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId)) {
            edge.style('display', 'element');
        }
    });

    // Find and add indirect connections
    await addIndirectConnections(visibleNodeIds);

    // Run layout on visible elements
    const visibleNodes = state.cy.nodes(':visible');
    const visibleEdges = state.cy.edges(':visible');

    if (visibleNodes.length > 0) {
        const elementsToLayout = visibleNodes.union(visibleEdges);
        elementsToLayout.layout({
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 80,
            rankSep: 100,
            animate: true,
            animationDuration: 400,
            fit: true,
            padding: 50
        }).run();
    }
}

// Build adjacency list from full graph for path finding
function buildAdjacencyList() {
    const adj = {};
    state.fullGraph.nodes.forEach(n => {
        adj[n.id] = [];
    });
    state.fullGraph.edges.forEach(e => {
        if (adj[e.source]) {
            adj[e.source].push(e.target);
        }
        if (adj[e.target]) {
            adj[e.target].push(e.source);
        }
    });
    return adj;
}

// Check if there's a path between two nodes via hidden nodes only
function hasIndirectPath(startId, endId, visibleNodeIds, adj) {
    if (startId === endId) return false;

    const visited = new Set();
    const queue = [startId];

    while (queue.length > 0) {
        const current = queue.shift();

        if (visited.has(current)) continue;
        visited.add(current);

        const neighbors = adj[current] || [];
        for (const neighbor of neighbors) {
            if (neighbor === endId) {
                return true;
            }
            // Only traverse through hidden (non-visible) nodes
            if (!visibleNodeIds.has(neighbor) && !visited.has(neighbor)) {
                queue.push(neighbor);
            }
        }
    }

    return false;
}

async function addIndirectConnections(visibleNodeIds) {
    const adj = buildAdjacencyList();
    const visibleArray = Array.from(visibleNodeIds);

    // Check for existing direct edges
    const existingEdges = new Set();
    state.cy.edges().forEach(edge => {
        existingEdges.add(`${edge.source().id()}-${edge.target().id()}`);
        existingEdges.add(`${edge.target().id()}-${edge.source().id()}`);
    });

    // Find indirect connections
    for (let i = 0; i < visibleArray.length; i++) {
        for (let j = i + 1; j < visibleArray.length; j++) {
            const nodeAId = visibleArray[i];
            const nodeBId = visibleArray[j];

            // Skip if already directly connected
            if (existingEdges.has(`${nodeAId}-${nodeBId}`)) {
                continue;
            }

            // Check if there's an indirect path
            if (hasIndirectPath(nodeAId, nodeBId, visibleNodeIds, adj)) {
                // Add a dashed edge
                state.cy.add({
                    group: 'edges',
                    data: {
                        id: `indirect-${nodeAId}-${nodeBId}`,
                        source: nodeAId,
                        target: nodeBId
                    },
                    classes: 'indirect'
                });
            }
        }
    }
}

async function loadHiddenNodes() {
    try {
        const hiddenGraph = await api.getHiddenGraph();

        state.cy.elements().remove();

        const elements = {
            nodes: hiddenGraph.nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    directory: node.directory,
                    extension: node.extension,
                    type: node.type,
                    important: node.important || false,
                    hidden: true
                },
                classes: 'hidden-node'
            })),
            edges: hiddenGraph.edges.map((edge, idx) => ({
                data: {
                    id: `edge-hidden-${idx}`,
                    source: edge.source,
                    target: edge.target
                }
            }))
        };

        state.cy.add(elements.nodes);
        state.cy.add(elements.edges);

        state.cy.layout({
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 60,
            rankSep: 80,
            animate: true,
            animationDuration: 400,
            fit: true,
            padding: 50
        }).run();

    } catch (error) {
        console.error('Failed to load hidden nodes:', error);
    }
}

async function reloadMainGraph() {
    try {
        state.graph = await api.getGraph(false);
        state.fullGraph = await api.getGraph(true);

        state.cy.elements().remove();

        const elements = {
            nodes: state.graph.nodes.map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    directory: node.directory,
                    extension: node.extension,
                    type: node.type,
                    important: node.important || false,
                    hidden: false
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

        state.cy.add(elements.nodes);
        state.cy.add(elements.edges);

        // Update important nodes set
        state.importantNodes.clear();
        state.graph.nodes.forEach(node => {
            if (node.important) {
                state.importantNodes.add(node.id);
            }
        });

        // Run layout and store positions
        const layout = state.cy.layout({
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 60,
            rankSep: 80,
            animate: true,
            animationDuration: 400,
            fit: true,
            padding: 50
        });

        layout.one('layoutstop', () => {
            originalPositions = {};
            state.cy.nodes().forEach(node => {
                originalPositions[node.id()] = { ...node.position() };
            });
        });

        layout.run();

        updateStats();

        // Re-apply folder grouping if enabled
        if (state.showFolders) {
            applyFolderGrouping();
        }

    } catch (error) {
        console.error('Failed to reload graph:', error);
    }
}

// ============================================
// Folder Grouping Functions
// ============================================

function generateFolderNodes(nodes) {
    const folders = new Map();
    nodes.forEach(node => {
        const dir = node.data('directory');
        if (dir) {
            if (!folders.has(dir)) {
                // Folder hierarchy: we could split and create nested folders, 
                // but let's stick to flat directories for now as per plan
                folders.set(dir, {
                    group: 'nodes',
                    data: {
                        id: `folder:${dir}`,
                        label: dir,
                        type: 'folder'
                    }
                });
            }
        }
    });
    return Array.from(folders.values());
}

function applyFolderGrouping() {
    if (!state.cy) return;

    state.cy.batch(() => {
        if (state.showFolders) {
            // 1. Generate and add folder nodes
            const currentNodes = state.cy.nodes('[type != "folder"]');
            const folderNodes = generateFolderNodes(currentNodes);

            // Only add folders that don't exist
            folderNodes.forEach(f => {
                if (state.cy.getElementById(f.data.id).empty()) {
                    state.cy.add(f);
                }
            });

            // 2. Assign parents
            currentNodes.forEach(node => {
                const dir = node.data('directory');
                if (dir) {
                    node.move({ parent: `folder:${dir}` });
                }
            });
        } else {
            // 1. Remove parents
            state.cy.nodes('[type != "folder"]').move({ parent: null });
            // 2. Remove folder nodes
            state.cy.nodes('[type = "folder"]').remove();
        }
    });

    // 3. Relayout
    const layout = state.cy.layout({
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: state.showFolders ? 100 : 60,
        rankSep: state.showFolders ? 120 : 80,
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 50
    });
    layout.run();
}

// ============================================
// Highlight Functions
// ============================================

function highlightNode(nodeId) {
    state.cy.elements().removeClass('highlighted connected dimmed');

    const node = state.cy.getElementById(nodeId);
    const neighborhood = node.neighborhood();
    const connectedNodes = neighborhood.nodes();
    const connectedEdges = neighborhood.edges();

    state.cy.elements().addClass('dimmed');

    node.removeClass('dimmed').addClass('highlighted');

    connectedNodes.removeClass('dimmed').addClass('connected');
    connectedEdges.removeClass('dimmed').addClass('highlighted');

    node.outgoers('edge').removeClass('dimmed').addClass('highlighted');
    node.outgoers('node').removeClass('dimmed').addClass('connected');

    state.cy.animate({
        center: { eles: node },
        zoom: Math.min(state.cy.zoom(), 1.5),
        duration: 300
    });

    state.selectedNode = nodeId;
}

function clearHighlight() {
    state.cy.elements().removeClass('highlighted connected dimmed');
    state.selectedNode = null;
}

function clearSearchHighlight() {
    state.cy.elements().removeClass('search-match search-dimmed');
    state.searchResults.clear();
    updateSearchCount();
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
    const hideBtn = document.getElementById('hide-node-btn');
    const hideText = document.getElementById('hide-text');
    const deleteBtn = document.getElementById('delete-file-btn');
    const deleteText = document.getElementById('delete-text');

    fileName.textContent = path.split('/').pop();
    filePath.textContent = path;

    // Reset delete button state
    if (deleteBtn && deleteText) {
        deleteBtn.disabled = false;
        deleteBtn.classList.remove('confirm');
        deleteText.textContent = 'Delete';
    }

    const isImportant = state.importantNodes.has(path);
    importantBtn.classList.toggle('active', isImportant);
    importantText.textContent = isImportant ? 'Important ✓' : 'Important';

    const isHidden = state.hiddenNodes.has(path);
    hideBtn.classList.toggle('active', isHidden);
    hideText.textContent = isHidden ? 'Unhide' : 'Hide';

    panel.classList.remove('hidden');
    document.getElementById('search-results').classList.add('hidden');

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

function parseSearchQuery(query) {
    const exactMatches = [];
    let semanticPart = query;

    const quoteRegex = /"([^"]+)"/g;
    let match;
    while ((match = quoteRegex.exec(query)) !== null) {
        exactMatches.push(match[1].toLowerCase());
    }

    semanticPart = query.replace(quoteRegex, '').trim();

    return {
        semantic: semanticPart,
        exact: exactMatches,
        hasExact: exactMatches.length > 0,
        hasSemantic: semanticPart.length > 0
    };
}

async function performSearch() {
    const rawQuery = document.getElementById('search-input').value.trim();
    if (!rawQuery) return;

    const resultsContainer = document.getElementById('search-results');
    const parsed = parseSearchQuery(rawQuery);

    try {
        clearSearchHighlight();

        let results = [];
        const graph = state.graph;

        let candidateNodes = graph.nodes;

        if (parsed.hasExact) {
            candidateNodes = graph.nodes.filter(node => {
                const nodeId = node.id.toLowerCase();
                const nodeLabel = node.label.toLowerCase();
                return parsed.exact.some(exact =>
                    nodeId.includes(exact) || nodeLabel.includes(exact)
                );
            });
        }

        if (parsed.hasSemantic && candidateNodes.length > 0) {
            const data = await api.search(parsed.semantic, true);
            if (data.results) {
                const candidateIds = new Set(candidateNodes.map(n => n.id));
                results = data.results.filter(r => candidateIds.has(r.path));
            }
        } else if (parsed.hasExact) {
            results = candidateNodes.map(node => ({
                path: node.id,
                label: node.label,
                score: 1.0
            }));
        } else {
            const data = await api.search(rawQuery, true);
            results = data.results || [];
        }

        if (results.length > 0) {
            results.forEach(result => {
                state.searchResults.add(result.path);
            });

            updateSearchCount();

            resultsContainer.innerHTML = results.map(result => `
                <div class="search-result-item" data-path="${result.path}">
                    <div class="name">${result.label}</div>
                    <div class="path">${result.path}</div>
                </div>
            `).join('');
            resultsContainer.classList.remove('hidden');

            resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const path = item.dataset.path;
                    highlightNode(path);
                    showFileDetails(path);
                    resultsContainer.classList.add('hidden');
                });
            });

            state.cy.elements().addClass('search-dimmed');

            results.forEach(result => {
                const node = state.cy.getElementById(result.path);
                if (node.length) {
                    node.removeClass('search-dimmed').addClass('search-match');
                }
            });

            state.cy.edges().forEach(edge => {
                const sourceId = edge.source().id();
                const targetId = edge.target().id();
                if (state.searchResults.has(sourceId) && state.searchResults.has(targetId)) {
                    edge.removeClass('search-dimmed');
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

function updateSearchCount() {
    const countEl = document.getElementById('search-count');
    if (state.searchResults.size > 0) {
        countEl.textContent = `(${state.searchResults.size})`;
    } else {
        countEl.textContent = '';
    }
}

function updateHiddenCount() {
    const countEl = document.getElementById('hidden-count');
    if (state.hiddenNodes.size > 0) {
        countEl.textContent = `(${state.hiddenNodes.size})`;
    } else {
        countEl.textContent = '';
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

        if (newImportance) {
            state.importantNodes.add(state.selectedNode);
        } else {
            state.importantNodes.delete(state.selectedNode);
        }

        const node = state.cy.getElementById(state.selectedNode);
        node.data('important', newImportance);

        const importantBtn = document.getElementById('mark-important-btn');
        const importantText = document.getElementById('important-text');
        importantBtn.classList.toggle('active', newImportance);
        importantText.textContent = newImportance ? 'Important ✓' : 'Important';

        updateStats();

        if (state.currentFilter === 'important') {
            applyFilter();
        }

    } catch (error) {
        console.error('Failed to update importance:', error);
    }
}

// ============================================
// Hidden Nodes
// ============================================

async function toggleHidden() {
    if (!state.selectedNode) return;

    const isCurrentlyHidden = state.hiddenNodes.has(state.selectedNode);
    const newHidden = !isCurrentlyHidden;

    try {
        await api.setHidden(state.selectedNode, newHidden);

        if (newHidden) {
            state.hiddenNodes.add(state.selectedNode);
        } else {
            state.hiddenNodes.delete(state.selectedNode);
        }

        const hideBtn = document.getElementById('hide-node-btn');
        const hideText = document.getElementById('hide-text');
        hideBtn.classList.toggle('active', newHidden);
        hideText.textContent = newHidden ? 'Unhide' : 'Hide';

        updateHiddenCount();

        if (newHidden && state.currentFilter !== 'hidden') {
            hideFileDetails();
            clearHighlight();
            await reloadMainGraph();
        } else if (!newHidden && state.currentFilter === 'hidden') {
            await loadHiddenNodes();
            hideFileDetails();
        }

    } catch (error) {
        console.error('Failed to update hidden status:', error);
    }
}

// ============================================
// Stats
// ============================================

function updateStats() {
    const nodesCount = document.getElementById('nodes-count');
    const edgesCount = document.getElementById('edges-count');
    const importantCount = document.getElementById('important-count');

    if (nodesCount) nodesCount.textContent = state.graph.nodes.length;
    if (edgesCount) edgesCount.textContent = state.graph.edges.length;
    if (importantCount) importantCount.textContent = state.importantNodes.size;
    updateHiddenCount();
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

document.addEventListener('DOMContentLoaded', () => {
    initGraph();
    connectWebSocket();
});
