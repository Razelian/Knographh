import { create } from 'zustand';
import axios from 'axios';
import { Node, Relationship, Shortcut, User, CanvasChild, NodeType } from './types.ts';

// Configured axios instance with Bearer interceptor
export const api = axios.create({
  baseURL: '/api' // maps dynamically to Express Vite dev proxy
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('knograph_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

interface KnoGraphStore {
  // Authentication State
  token: string | null;
  user: User | null;
  loadingAuth: boolean;
  authError: string | null;

  // Graph State
  nodes: Node[];
  relationships: Relationship[];
  shortcuts: Shortcut[];
  loadingGraph: boolean;
  selectedNode: Node | null;
  selectedRelationship: Relationship | null;

  // Canvas Whiteboard State
  activeCanvasNode: Node | null;
  activeCanvasChildren: CanvasChild[];

  // Insights State
  insightView: 'most-connected' | 'orphans' | 'top-level' | 'concept-clusters' | null;
  insightNodes: any[];
  insightClusters: any[];
  loadingInsights: boolean;

  // Search and Cypher State
  searchQuery: string;
  searchResults: Node[];
  cypherQuery: string;
  cypherResults: { nodes: Node[]; relationships: Relationship[] } | null;
  queryError: string | null;
  loadingQuery: boolean;

  // Actions
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => void;

  // Graph CRUD Actions
  fetchGraph: () => Promise<void>;
  createNode: (type: NodeType, name: string, content?: string, properties?: any) => Promise<Node | null>;
  updateNode: (id: string, updates: Partial<Node>) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  
  // Relationships Actions
  createRelationship: (source: string, target: string, type: string) => Promise<Relationship | null>;
  deleteRelationship: (id: string) => Promise<void>;

  // Canvas Actions
  selectCanvas: (node: Node | null) => void;
  addCanvasChild: (canvasId: string, type: 'text' | 'image' | 'drawing' | 'file', posX: number, posY: number, content: string) => Promise<void>;
  updateCanvasChild: (canvasId: string, childId: string, posX: number, posY: number, content?: string) => Promise<void>;
  deleteCanvasChild: (canvasId: string, childId: string) => Promise<void>;

  // Shortcuts
  fetchShortcuts: () => Promise<void>;
  createShortcut: (nodeId: string, label: string) => Promise<void>;
  deleteShortcut: (id: string) => Promise<void>;

  // Insights / Traversal
  setInsightView: (view: 'most-connected' | 'orphans' | 'top-level' | 'concept-clusters' | null) => Promise<void>;
  executeSearch: (q: string) => Promise<void>;
  executeCypher: (cypher: string, startNodeId?: string) => Promise<void>;

  // S3 File Actions
  uploadFileNode: (file: File) => Promise<Node | null>;
  deleteFileNode: (nodeId: string) => Promise<void>;

  setSelectedNode: (node: Node | null) => void;
}

export const useStore = create<KnoGraphStore>((set, get) => ({
  token: localStorage.getItem('knograph_token'),
  user: null,
  loadingAuth: false,
  authError: null,

  nodes: [],
  relationships: [],
  shortcuts: [],
  loadingGraph: false,
  selectedNode: null,
  selectedRelationship: null,

  activeCanvasNode: null,
  activeCanvasChildren: [],

  insightView: null,
  insightNodes: [],
  insightClusters: [],
  loadingInsights: false,

  searchQuery: '',
  searchResults: [],
  cypherQuery: '',
  cypherResults: null,
  queryError: null,
  loadingQuery: false,

  // Initialize
  init: async () => {
    const token = get().token;
    if (token) {
      try {
        set({ loadingAuth: true });
        const res = await api.get('/v1/account');
        set({ user: res.data, loadingAuth: false });
        await get().fetchGraph();
        await get().fetchShortcuts();
      } catch (err) {
        console.error('Failed to restore login session', err);
        // Clear expired or invalid tokens
        localStorage.removeItem('knograph_token');
        set({ token: null, user: null, loadingAuth: false });
      }
    } else {
      set({ loadingAuth: false });
    }
  },

  // Auth actions
  login: async (email, password) => {
    try {
      set({ loadingAuth: true, authError: null });
      const res = await api.post('/v1/auth/login', { email, password });
      const { token, user } = res.data;
      localStorage.setItem('knograph_token', token);
      set({ token, user, loadingAuth: false });
      await get().fetchGraph();
      await get().fetchShortcuts();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Authentication failed';
      set({ authError: msg, loadingAuth: false });
      return false;
    }
  },

  register: async (email, password) => {
    try {
      set({ loadingAuth: true, authError: null });
      const res = await api.post('/v1/auth/register', { email, password });
      // In KnoGraph, register auto-logs the user in
      const { token, user } = res.data;
      localStorage.setItem('knograph_token', token);
      set({ token, user, loadingAuth: false });
      await get().fetchGraph();
      await get().fetchShortcuts();
      return true;
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Registration failed';
      set({ authError: msg, loadingAuth: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('knograph_token');
    set({
      token: null,
      user: null,
      nodes: [],
      relationships: [],
      shortcuts: [],
      selectedNode: null,
      activeCanvasNode: null,
      activeCanvasChildren: [],
      searchResults: [],
      cypherResults: null
    });
  },

  // Graph Sync Commands
  fetchGraph: async () => {
    try {
      set({ loadingGraph: true });
      const resNodes = await api.get('/v1/nodes');
      const resRels = await api.get('/v1/relationships');
      set({
        nodes: resNodes.data.nodes,
        relationships: resRels.data.relationships,
        loadingGraph: false
      });
    } catch (err) {
      console.error('Failed to synchronize graph metadata', err);
      set({ loadingGraph: false });
    }
  },

  createNode: async (type, name, content = '', properties = {}) => {
    try {
      const res = await api.post('/v1/nodes', { type, name, content, properties });
      const newNode = res.data;
      set((state) => ({
        nodes: [...state.nodes, newNode]
      }));
      return newNode;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to create graph item';
      alert(errorMsg);
      return null;
    }
  },

  updateNode: async (id, updates) => {
    try {
      const res = await api.patch(`/v1/nodes/${id}`, updates);
      const updatedNode = res.data;
      set((state) => ({
        nodes: state.nodes.map(n => n.id === id ? updatedNode : n),
        selectedNode: state.selectedNode?.id === id ? updatedNode : state.selectedNode,
        activeCanvasNode: state.activeCanvasNode?.id === id ? updatedNode : state.activeCanvasNode,
        activeCanvasChildren: state.activeCanvasNode?.id === id ? (updatedNode.properties.canvasChildren || []) : state.activeCanvasChildren
      }));
    } catch (err) {
      console.error('Failed to patch node properties', err);
    }
  },

  deleteNode: async (id) => {
    try {
      await api.delete(`/v1/nodes/${id}`);
      set((state) => ({
        nodes: state.nodes.filter(n => n.id !== id),
        // Cascade removes relationships containing the matching node locally for instant performance
        relationships: state.relationships.filter(r => r.source !== id && r.target !== id),
        shortcuts: state.shortcuts.filter(s => s.nodeId !== id),
        selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
        activeCanvasNode: state.activeCanvasNode?.id === id ? null : state.activeCanvasNode
      }));
    } catch (err) {
      console.error('Failed to purge node', err);
    }
  },

  createRelationship: async (source, target, type) => {
    try {
      const res = await api.post('/v1/relationships', { source, target, type });
      const newRel = res.data;
      set((state) => ({
        relationships: [...state.relationships, newRel]
      }));
      return newRel;
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to draw link');
      return null;
    }
  },

  deleteRelationship: async (id) => {
    try {
      await api.delete(`/v1/relationships/${id}`);
      set((state) => ({
        relationships: state.relationships.filter(r => r.id !== id)
      }));
    } catch (err) {
      console.error('Failed to dismantle link', err);
    }
  },

  // Canvas Operations
  selectCanvas: (node) => {
    if (!node) {
      set({ activeCanvasNode: null, activeCanvasChildren: [] });
    } else {
      set({
        activeCanvasNode: node,
        activeCanvasChildren: node.properties.canvasChildren || []
      });
    }
  },

  addCanvasChild: async (canvasId, type, posX, posY, content) => {
    try {
      const res = await api.post(`/v1/canvas/${canvasId}/children`, { type, posX, posY, content });
      const newChild = res.data;
      set((state) => {
        const updatedChildren = [...state.activeCanvasChildren, newChild];
        return {
          activeCanvasChildren: updatedChildren,
          nodes: state.nodes.map(n => n.id === canvasId ? {
            ...n,
            properties: {
              ...n.properties,
              canvasChildren: updatedChildren
            }
          } : n)
        };
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to append canvas card');
    }
  },

  updateCanvasChild: async (canvasId, childId, posX, posY, content) => {
    try {
      const res = await api.patch(`/v1/canvas/${canvasId}/children/${childId}`, { posX, posY, content });
      const updatedChild = res.data;
      set((state) => {
        const updatedChildren = state.activeCanvasChildren.map(c => c.id === childId ? updatedChild : c);
        return {
          activeCanvasChildren: updatedChildren,
          nodes: state.nodes.map(n => n.id === canvasId ? {
            ...n,
            properties: {
              ...n.properties,
              canvasChildren: updatedChildren
            }
          } : n)
        };
      });
    } catch (err) {
      console.error('Failed to save node whiteboard coordinate', err);
    }
  },

  deleteCanvasChild: async (canvasId, childId) => {
    try {
      await api.delete(`/v1/canvas/${canvasId}/children/${childId}`);
      set((state) => {
        const updatedChildren = state.activeCanvasChildren.filter(c => c.id !== childId);
        return {
          activeCanvasChildren: updatedChildren,
          nodes: state.nodes.map(n => n.id === canvasId ? {
            ...n,
            properties: {
              ...n.properties,
              canvasChildren: updatedChildren
            }
          } : n)
        };
      });
    } catch (err) {
      console.error('Failed to remove child block', err);
    }
  },

  // Shortcuts Bookmarks
  fetchShortcuts: async () => {
    try {
      const res = await api.get('/v1/shortcuts');
      set({ shortcuts: res.data.shortcuts });
    } catch (err) {
      console.error('Failed to fetch bookmarks', err);
    }
  },

  createShortcut: async (nodeId, label) => {
    try {
      const res = await api.post('/v1/shortcuts', { nodeId, label });
      set((state) => ({
        shortcuts: [...state.shortcuts, res.data]
      }));
    } catch (err) {
      console.error('Failed to create bookmark', err);
    }
  },

  deleteShortcut: async (id) => {
    try {
      await api.delete(`/v1/shortcuts/${id}`);
      set((state) => ({
        shortcuts: state.shortcuts.filter(s => s.id !== id)
      }));
    } catch (err) {
      console.error('Failed to delete bookmark', err);
    }
  },

  // Insights / Advanced traversal
  setInsightView: async (view) => {
    if (!view) {
      set({ insightView: null, insightNodes: [], insightClusters: [] });
      return;
    }
    try {
      set({ insightView: view, loadingInsights: true });
      const res = await api.get(`/v1/insights/${view}`);
      if (view === 'concept-clusters') {
        set({ insightClusters: res.data.clusters, loadingInsights: false });
      } else {
        set({ insightNodes: res.data.nodes, loadingInsights: false });
      }
    } catch (err) {
      console.error('Failed to scan network insights', err);
      set({ loadingInsights: false });
    }
  },

  executeSearch: async (q) => {
    set({ searchQuery: q });
    if (!q.trim()) {
      set({ searchResults: [] });
      return;
    }
    try {
      const res = await api.get(`/v1/search?q=${encodeURIComponent(q)}`);
      set({ searchResults: res.data.results });
    } catch (err) {
      console.error('Matching node keywords failed', err);
    }
  },

  executeCypher: async (cypher, startNodeId) => {
    try {
      set({ cypherQuery: cypher, loadingQuery: true, queryError: null });
      const res = await api.post('/v1/query', { query: cypher, startNodeId });
      set({
        cypherResults: res.data.results,
        loadingQuery: false
      });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to parse Cypher graph notation';
      set({ queryError: msg, loadingQuery: false, cypherResults: null });
    }
  },

  // Cloud File Storage Operations
  uploadFileNode: async (file) => {
    try {
      // Helper to convert browser File object to Base64 in frontend
      const toBase64 = (f: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(f);
        reader.onload = () => {
          const raw = reader.result as string;
          resolve(raw.split(',')[1]); // split mime header
        };
        reader.onerror = reject;
      });

      const base64 = await toBase64(file);
      const res = await api.post('/v1/files/upload', {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64Content: base64
      });

      const fileNode = res.data.node;
      // Fetch updated storage usage
      const accountRes = await api.get('/v1/account');
      set((state) => ({
        nodes: [...state.nodes, fileNode],
        user: accountRes.data
      }));

      return fileNode;
    } catch (err: any) {
      alert(err.response?.data?.error || 'S3 Cloud storage quota upload failed.');
      return null;
    }
  },

  deleteFileNode: async (nodeId) => {
    try {
      await api.delete(`/v1/files/${nodeId}`);
      const accountRes = await api.get('/v1/account');
      set((state) => ({
        nodes: state.nodes.filter(n => n.id !== nodeId),
        user: accountRes.data,
        selectedNode: state.selectedNode?.id === nodeId ? null : state.selectedNode
      }));
    } catch (err) {
      console.error('Failed to unlink cloud node file', err);
    }
  },

  setSelectedNode: (node) => set({ selectedNode: node })
}));
