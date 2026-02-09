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
    selectedFolder: null, // Currently selected folder directory path
    importantNodes: new Set(),
    hiddenNodes: new Set(),
    searchResults: new Set(),
    currentFilter: 'all', // 'all', 'important', 'search', 'hidden'
    showFolders: false, // Folder grouping toggle
    folderDepth: null, // Current folder grouping depth (null = max depth)
    maxFolderDepth: 1, // Max depth of folder hierarchy
    wasInHiddenView: false, // Track if we came from hidden view
    websocket: null, // WebSocket connection for real-time updates
    pendingChanges: 0 // Number of pending graph changes from WebSocket
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
                state.pendingChanges++;
                console.log(`[WebSocket] Change detected (${state.pendingChanges} pending)`);
                showPendingUpdate();
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

/**
 * Show the pending update notification button with current change count.
 */
function showPendingUpdate() {
    const btn = document.getElementById('pending-update-btn');
    const countEl = document.getElementById('pending-count');
    if (btn && countEl) {
        countEl.textContent = state.pendingChanges;
        btn.classList.remove('hidden');
    }
}

/**
 * Apply pending changes: reload the graph and hide the notification.
 */
async function applyPendingUpdate() {
    const btn = document.getElementById('pending-update-btn');
    state.pendingChanges = 0;
    if (btn) btn.classList.add('hidden');
    await reloadMainGraph();
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

    async setFolderHidden(directory, hidden) {
        const response = await fetch('/api/hidden/folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directory, hidden })
        });
        if (!response.ok) throw new Error('Failed to update folder hidden status');
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
        selector: 'edge.outgoing-edge',
        style: {
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
            'width': 2.5,
            'z-index': 100,
            'line-dash-pattern': [8, 4],
            'line-dash-offset': 0
        }
    },
    {
        selector: 'edge.incoming-edge',
        style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            'width': 2.5,
            'z-index': 100,
            'line-dash-pattern': [8, 4],
            'line-dash-offset': 0
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
    // Node click - show details (file or folder)
    state.cy.on('tap', 'node', async function (event) {
        const node = event.target;
        const nodeId = node.id();
        const nodeType = node.data('type');

        if (nodeType === 'folder') {
            // Folder click: show folder details panel
            showFolderDetails(node);
        } else {
            // File click: show file details panel
            hideFolderDetails();
            highlightNode(nodeId);
            await showFileDetails(nodeId);

            // Re-apply 'selected' filter when clicking a new node
            if (state.currentFilter === 'selected') {
                applyFilter();
            }
        }
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
        const depthControls = document.getElementById('depth-controls');
        if (state.showFolders) {
            depthControls.classList.remove('hidden');
            computeMaxFolderDepth();
            if (state.folderDepth === null) {
                state.folderDepth = state.maxFolderDepth;
            }
            updateDepthIndicator();
        } else {
            depthControls.classList.add('hidden');
        }
        applyFolderGrouping();
    });

    // Depth controls
    document.getElementById('depth-up-btn').addEventListener('click', () => {
        decreaseDepth();
    });
    document.getElementById('depth-down-btn').addEventListener('click', () => {
        increaseDepth();
    });

    // Close folder details panel
    document.getElementById('close-folder-details').addEventListener('click', () => {
        hideFolderDetails();
        clearHighlight();
    });

    // Hide folder button
    document.getElementById('hide-folder-btn').addEventListener('click', toggleFolderHidden);

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

                // Immediately remove node from graph (don't wait for watcher)
                const cyNode = state.cy.getElementById(path);
                if (cyNode.length) {
                    cyNode.connectedEdges().remove();
                    cyNode.remove();
                }
                // Also remove from local state
                state.graph.nodes = state.graph.nodes.filter(n => n.id !== path);
                state.graph.edges = state.graph.edges.filter(e => e.source !== path && e.target !== path);
                state.fullGraph.nodes = state.fullGraph.nodes.filter(n => n.id !== path);
                state.fullGraph.edges = state.fullGraph.edges.filter(e => e.source !== path && e.target !== path);
                state.importantNodes.delete(path);
                state.hiddenNodes.delete(path);
                state.searchResults.delete(path);
                updateStats();

                hideFileDetails();
                clearHighlight();
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

    // Pending update button (manual graph refresh)
    document.getElementById('pending-update-btn').addEventListener('click', applyPendingUpdate);

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
    } else if (state.currentFilter === 'selected') {
        if (state.selectedNode) {
            const node = state.cy.getElementById(state.selectedNode);
            if (node.length) {
                visibleNodeIds.add(state.selectedNode);
                // Add all descendants (transitive successors)
                node.successors('node').forEach(n => visibleNodeIds.add(n.id()));
                // Add direct parents (incomers)
                node.incomers('node').forEach(n => visibleNodeIds.add(n.id()));
            }
        }
    }

    if (visibleNodeIds.size === 0) {
        state.cy.elements().style('display', 'none');
        return;
    }

    // Hide non-visible nodes (skip folder compound nodes initially)
    state.cy.nodes().forEach(node => {
        if (node.data('type') === 'folder') return;
        if (!visibleNodeIds.has(node.id())) {
            node.style('display', 'none');
        }
    });

    // Hide folder nodes that contain no visible children
    state.cy.nodes('[type = "folder"]').forEach(folder => {
        const visibleChildren = folder.children().filter(n => n.style('display') !== 'none');
        if (visibleChildren.length === 0) {
            folder.style('display', 'none');
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
        // 0. Strip folder grouping before diffing to avoid removing children with parents
        if (state.showFolders) {
            state.cy.batch(() => {
                state.cy.nodes('[type != "folder"]').move({ parent: null });
                state.cy.nodes('[type = "folder"]').remove();
            });
        }

        // 1. Save current viewport state
        const currentZoom = state.cy.zoom();
        const currentPan = { ...state.cy.pan() };

        // 2. Save current node positions (folder nodes already removed)
        const currentPositions = {};
        state.cy.nodes().forEach(node => {
            currentPositions[node.id()] = { ...node.position() };
        });
        const currentNodeIds = new Set(state.cy.nodes().map(n => n.id()));

        // 3. Fetch updated graph data
        state.graph = await api.getGraph(false);
        state.fullGraph = await api.getGraph(true);

        const newNodeIds = new Set(state.graph.nodes.map(n => n.id));

        // 4. Compute diff
        const addedNodeIds = [...newNodeIds].filter(id => !currentNodeIds.has(id));
        const removedNodeIds = [...currentNodeIds].filter(id => !newNodeIds.has(id));
        const keptNodeIds = [...newNodeIds].filter(id => currentNodeIds.has(id));

        // 5. Remove deleted nodes/edges
        removedNodeIds.forEach(id => {
            state.cy.getElementById(id).remove();
        });

        // 6. Update existing nodes (in case data changed)
        keptNodeIds.forEach(id => {
            const nodeData = state.graph.nodes.find(n => n.id === id);
            if (nodeData) {
                const cyNode = state.cy.getElementById(id);
                cyNode.data('important', nodeData.important || false);
                cyNode.data('label', nodeData.label);
            }
        });

        // 7. Add new nodes with positions (if known from originalPositions, else random)
        const newNodes = state.graph.nodes
            .filter(node => addedNodeIds.includes(node.id))
            .map(node => ({
                data: {
                    id: node.id,
                    label: node.label,
                    directory: node.directory,
                    extension: node.extension,
                    type: node.type,
                    important: node.important || false,
                    hidden: false
                },
                // Place new nodes at center initially
                position: originalPositions[node.id] || { x: 0, y: 0 }
            }));

        if (newNodes.length > 0) {
            state.cy.add(newNodes);
        }

        // 8. Rebuild edges (simpler than diffing)
        state.cy.edges().remove();
        const edges = state.graph.edges.map((edge, idx) => ({
            data: {
                id: `edge-${idx}`,
                source: edge.source,
                target: edge.target
            }
        }));
        state.cy.add(edges);

        // 9. Restore positions for kept nodes
        keptNodeIds.forEach(id => {
            const pos = currentPositions[id];
            if (pos) {
                state.cy.getElementById(id).position(pos);
            }
        });

        // 10. Update important nodes set
        state.importantNodes.clear();
        state.graph.nodes.forEach(node => {
            if (node.important) {
                state.importantNodes.add(node.id);
            }
        });

        // 11. Only run layout for NEW nodes (if any), without affecting existing positions
        if (addedNodeIds.length > 0) {
            // Find a good position for new nodes near their neighbors
            addedNodeIds.forEach(newId => {
                const newNode = state.cy.getElementById(newId);
                const neighbors = newNode.neighborhood('node');
                if (neighbors.length > 0) {
                    // Position near average of neighbors
                    let avgX = 0, avgY = 0;
                    neighbors.forEach(n => {
                        avgX += n.position('x');
                        avgY += n.position('y');
                    });
                    avgX /= neighbors.length;
                    avgY /= neighbors.length;
                    // Offset slightly to avoid overlap
                    newNode.position({ x: avgX + 50, y: avgY + 50 });
                } else {
                    // No neighbors, place at viewport center
                    const extent = state.cy.extent();
                    newNode.position({
                        x: (extent.x1 + extent.x2) / 2,
                        y: (extent.y1 + extent.y2) / 2
                    });
                }
            });

            // Update originalPositions for new nodes
            addedNodeIds.forEach(id => {
                const node = state.cy.getElementById(id);
                originalPositions[id] = { ...node.position() };
            });
        }

        // 12. Restore viewport (zoom and pan)
        state.cy.zoom(currentZoom);
        state.cy.pan(currentPan);

        updateStats();

        // Re-apply folder grouping if enabled (preserve viewport during reload)
        if (state.showFolders) {
            applyFolderGrouping(true);
        }

    } catch (error) {
        console.error('Failed to reload graph:', error);
    }
}

// ============================================
// Folder Grouping Functions
// ============================================

/**
 * Compute the maximum folder depth from current graph nodes.
 * Each directory like "src/utils/helpers" has depth 3.
 */
function computeMaxFolderDepth() {
    let maxDepth = 1;
    state.graph.nodes.forEach(node => {
        if (node.directory) {
            const parts = node.directory.replace(/\/$/, '').split('/');
            if (parts.length > maxDepth) {
                maxDepth = parts.length;
            }
        }
    });
    state.maxFolderDepth = maxDepth;
}

function updateDepthIndicator() {
    const indicator = document.getElementById('depth-indicator');
    const upBtn = document.getElementById('depth-up-btn');
    const downBtn = document.getElementById('depth-down-btn');
    if (indicator) {
        indicator.textContent = `${state.folderDepth}/${state.maxFolderDepth}`;
    }
    if (upBtn) {
        upBtn.disabled = state.folderDepth <= 1;
    }
    if (downBtn) {
        downBtn.disabled = state.folderDepth >= state.maxFolderDepth;
    }
}

function decreaseDepth() {
    if (state.folderDepth > 1) {
        state.folderDepth--;
        updateDepthIndicator();
        applyFolderGrouping();
    }
}

function increaseDepth() {
    if (state.folderDepth < state.maxFolderDepth) {
        state.folderDepth++;
        updateDepthIndicator();
        applyFolderGrouping();
    }
}

function generateFolderHierarchy(nodes) {
    /**
     * Generate folder nodes at the current depth level.
     * Files are grouped by their directory path truncated to `state.folderDepth` segments.
     * 
     * Example: depth=1 -> "src/", depth=2 -> "src/utils/"
     * 
     * Returns: { folders: Map<id, {node, parent}>, fileParents: Map<fileId, parentFolderId> }
     */
    const folders = new Map();
    const fileParents = new Map();
    const depth = state.folderDepth || state.maxFolderDepth;

    nodes.forEach(node => {
        const dir = node.data('directory');
        if (!dir) return;

        // Truncate directory to the configured depth
        const parts = dir.replace(/\/$/, '').split('/');
        const truncatedParts = parts.slice(0, depth);
        const truncatedDir = truncatedParts.join('/');
        const folderId = `folder:${truncatedDir}`;

        if (!folders.has(folderId)) {
            folders.set(folderId, {
                node: {
                    group: 'nodes',
                    data: {
                        id: folderId,
                        label: truncatedDir,
                        type: 'folder',
                        fullPath: truncatedDir
                    }
                },
                parent: null
            });
        }

        fileParents.set(node.id(), folderId);
    });

    return { folders, fileParents };
}

function applyFolderGrouping(preserveViewport = false) {
    if (!state.cy) return;

    state.cy.batch(() => {
        // Always clean up existing folder grouping first
        state.cy.nodes('[type != "folder"]').move({ parent: null });
        state.cy.nodes('[type = "folder"]').remove();

        if (state.showFolders) {
            // Generate folder hierarchy at current depth
            const currentNodes = state.cy.nodes('[type != "folder"]');
            const { folders, fileParents } = generateFolderHierarchy(currentNodes);

            // Add folder nodes
            folders.forEach(({ node }, folderId) => {
                state.cy.add(node);
            });

            // Assign files to their parent folders
            currentNodes.forEach(node => {
                const parentFolderId = fileParents.get(node.id());
                if (parentFolderId) {
                    node.move({ parent: parentFolderId });
                }
            });
        }
    });

    // Layout handling
    if (state.showFolders && !preserveViewport) {
        // Run dagre layout for folder grouping (only on manual toggle)
        const layout = state.cy.layout({
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 100,
            rankSep: 120,
            animate: true,
            animationDuration: 500,
            fit: true,
            padding: 50
        });
        layout.run();
    } else if (!state.showFolders) {
        // Restore original positions when disabling folder grouping
        if (originalPositions) {
            state.cy.nodes().forEach(node => {
                const pos = originalPositions[node.id()];
                if (pos) {
                    node.animate({
                        position: pos,
                        duration: 400,
                        easing: 'ease-out'
                    });
                }
            });
            setTimeout(() => state.cy.fit(undefined, 50), 450);
        } else {
            const layout = state.cy.layout({
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 60,
                rankSep: 80,
                animate: true,
                animationDuration: 500,
                fit: true,
                padding: 50
            });
            layout.run();
        }
    }
}

// ============================================
// Folder Details & Hide/Unhide
// ============================================

function showFolderDetails(folderNode) {
    const folderPath = folderNode.data('fullPath');
    state.selectedFolder = folderPath;

    // Hide file details if open
    hideFileDetails();

    const panel = document.getElementById('folder-details');
    const folderName = document.getElementById('folder-name');
    const folderPathEl = document.getElementById('folder-path');
    const fileCountEl = document.getElementById('folder-file-count');
    const hiddenCountEl = document.getElementById('folder-hidden-count');
    const hideFolderBtn = document.getElementById('hide-folder-btn');
    const hideFolderText = document.getElementById('hide-folder-text');

    folderName.textContent = folderPath.split('/').pop() + '/';
    folderPathEl.textContent = folderPath;

    // Count files in this folder (including hidden)
    const allFilesInFolder = state.fullGraph.nodes.filter(
        n => (n.directory || '').startsWith(folderPath)
    );
    const hiddenInFolder = allFilesInFolder.filter(n => state.hiddenNodes.has(n.id));

    fileCountEl.textContent = allFilesInFolder.length;
    hiddenCountEl.textContent = hiddenInFolder.length;

    // Determine if all visible files in folder are hidden
    const visibleInFolder = allFilesInFolder.filter(n => !state.hiddenNodes.has(n.id));
    const allHidden = visibleInFolder.length === 0 && allFilesInFolder.length > 0;

    hideFolderBtn.classList.toggle('active', allHidden);
    hideFolderText.textContent = allHidden ? 'Unhide Folder' : 'Hide Folder';

    panel.classList.remove('hidden');
}

function hideFolderDetails() {
    document.getElementById('folder-details').classList.add('hidden');
    state.selectedFolder = null;
}

async function toggleFolderHidden() {
    if (!state.selectedFolder) return;

    const folderPath = state.selectedFolder;

    // Determine current state: if there are visible files, we hide; otherwise unhide
    const allFilesInFolder = state.fullGraph.nodes.filter(
        n => (n.directory || '').startsWith(folderPath)
    );
    const visibleInFolder = allFilesInFolder.filter(n => !state.hiddenNodes.has(n.id));
    const shouldHide = visibleInFolder.length > 0;

    try {
        const result = await api.setFolderHidden(folderPath, shouldHide);

        // Update local hidden state
        state.hiddenNodes.clear();
        result.nodes.forEach(id => state.hiddenNodes.add(id));

        updateHiddenCount();
        hideFolderDetails();
        clearHighlight();

        if (shouldHide && state.currentFilter !== 'hidden') {
            await reloadMainGraph();
        } else if (!shouldHide && state.currentFilter === 'hidden') {
            await loadHiddenNodes();
        } else {
            await reloadMainGraph();
        }
    } catch (error) {
        console.error('Failed to toggle folder hidden:', error);
    }
}

// ============================================
// Highlight Functions
// ============================================

function highlightNode(nodeId) {
    state.cy.elements().removeClass('highlighted connected dimmed outgoing-edge incoming-edge');

    const node = state.cy.getElementById(nodeId);

    // Collect all descendants (transitive outgoers) via Cytoscape's successors()
    const allDescendantNodes = node.successors('node');
    const allDescendantEdges = node.successors('edge');

    // Also include direct incomers (who imports this node)
    const incomingEdges = node.incomers('edge');
    const incomingNodes = node.incomers('node');

    // Dim only non-folder nodes to avoid graying out parent containers
    state.cy.nodes('[type != "folder"]').addClass('dimmed');
    state.cy.edges().addClass('dimmed');

    node.removeClass('dimmed').addClass('highlighted');

    // Highlight all descendants with green outgoing edges
    allDescendantNodes.removeClass('dimmed').addClass('connected');
    allDescendantEdges.removeClass('dimmed').addClass('outgoing-edge');

    // Highlight direct incomers with red incoming edges
    incomingNodes.removeClass('dimmed').addClass('connected');
    incomingEdges.removeClass('dimmed').addClass('incoming-edge');

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
        const unusedClass = item.unused ? ' unused' : '';
        if (item.type === 'class') {
            return `
                <div class="file-item${unusedClass}">
                    <div class="file-item-header">
                        <span class="file-item-type class">${item.unused ? '⚠ class' : 'class'}</span>
                        <span class="file-item-name">${item.name}</span>
                        <span class="file-item-line">L${item.line}</span>
                    </div>
                    ${item.docstring ? `<div class="file-item-docstring">${escapeHtml(item.docstring)}</div>` : ''}
                    ${item.methods && item.methods.length ? `
                        <div class="file-item-methods">
                            <div class="file-item-methods-title">Methods (${item.methods.length})</div>
                            ${item.methods.slice(0, 5).map(m => {
                const methodUnusedClass = m.unused ? ' unused' : '';
                return `
                                <div class="method-item${methodUnusedClass}">
                                    <span class="file-item-type method">${m.unused ? '⚠ def' : 'def'}</span>
                                    <span class="method-name">${m.name}</span>
                                    <span class="method-line">L${m.line}</span>
                                </div>
                            `}).join('')}
                            ${item.methods.length > 5 ? `<div class="method-item" style="color: var(--text-muted);">... and ${item.methods.length - 5} more</div>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            return `
                <div class="file-item${unusedClass}">
                    <div class="file-item-header">
                        <span class="file-item-type function">${item.unused ? '⚠ func' : 'func'}</span>
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

/**
 * Perform a filename search (triggered by @ prefix).
 * Smart matching: splits query into tokens and matches all of them against file paths/labels.
 */
function performFilenameSearch(query) {
    const tokens = query.toLowerCase().split(/[\s\/\-_]+/).filter(t => t.length > 0);
    return state.graph.nodes.filter(node => {
        const id = node.id.toLowerCase();
        const label = node.label.toLowerCase();
        return tokens.every(token => id.includes(token) || label.includes(token));
    }).map(node => ({
        path: node.id,
        label: node.label,
        score: 1.0
    }));
}

async function performSearch() {
    const rawQuery = document.getElementById('search-input').value.trim();
    if (!rawQuery) return;

    const resultsContainer = document.getElementById('search-results');

    try {
        clearSearchHighlight();

        let results = [];

        if (rawQuery.startsWith('@')) {
            // @ prefix: filename search (no semantic)
            const filenameQuery = rawQuery.slice(1).trim();
            if (filenameQuery.length > 0) {
                results = performFilenameSearch(filenameQuery);
            }
        } else {
            // Default: semantic search
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
