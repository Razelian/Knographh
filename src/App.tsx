import React, { useEffect, useState } from 'react';
import { useStore } from './store.ts';
import AuthScreen from './components/AuthScreen.tsx';
import GraphSpace from './components/GraphSpace.tsx';
import CanvasSpace from './components/CanvasSpace.tsx';
import SidebarPanel from './components/SidebarPanel.tsx';
import SearchAndInsights from './components/SearchAndInsights.tsx';
import S3StoragePanel from './components/S3StoragePanel.tsx';
import { 
  Network, 
  Plus, 
  HelpCircle, 
  LogOut, 
  Sparkles, 
  Layout, 
  BookOpen, 
  FileText, 
  Database, 
  User as UserIcon,
  MonitorPlay
} from 'lucide-react';
import { NodeType } from './types.ts';

export default function App() {
  const { 
    user, 
    init, 
    nodes, 
    relationships, 
    createNode, 
    selectedNode, 
    setSelectedNode,
    activeCanvasNode,
    selectCanvas,
    logout,
    loadingAuth,
    deleteNode
  } = useStore();

  // New Node Parameters form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [nodeType, setNodeType] = useState<NodeType>('Note');
  const [nodeName, setNodeName] = useState('');
  const [nodeContent, setNodeContent] = useState('');

  // Initializing session
  useEffect(() => {
    init();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        ((activeEl instanceof HTMLElement) && activeEl.isContentEditable) ||
        activeEl.getAttribute('role') === 'textbox'
      );

      // 1. Ctrl+F or Cmd+F -> focus primary search bar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('search_primary_input');
        if (searchInput) {
          (searchInput as HTMLInputElement).focus();
          (searchInput as HTMLInputElement).select();
        }
        return;
      }

      // 2. Escape -> close modal or deselect node/canvas
      if (e.key === 'Escape') {
        if (showCreateModal) {
          setShowCreateModal(false);
          return;
        }
        if (selectedNode) {
          setSelectedNode(null);
        }
        if (activeCanvasNode) {
          selectCanvas(null);
        }
        return;
      }

      // Skip N and Delete/Backspace if typing inside inputs
      if (isInputFocused) return;

      // 3. N key -> open new node modal
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowCreateModal(true);
        return;
      }

      // 4. Delete/Backspace key -> delete selected node with confirm dialog
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNode) {
        e.preventDefault();
        if (confirm(`Are you absolutely sure you want to delete "${selectedNode.name}"? This will also disconnect all its graph links.`)) {
          await deleteNode(selectedNode.id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, selectedNode, activeCanvasNode, deleteNode, setSelectedNode, selectCanvas]);

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeName.trim()) return;

    const created = await createNode(nodeType, nodeName, nodeContent);
    if (created) {
      setNodeName('');
      setNodeContent('');
      setShowCreateModal(false);
      // Auto highlight new node
      setSelectedNode(created);
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (loadingAuth) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3 font-sans">
        <Network className="w-10 h-10 text-blue-500 animate-spin" />
        <span className="text-sm font-semibold tracking-wide">Synthesizing network topology...</span>
      </div>
    );
  }

  // If no user context, load authentication card
  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-x-hidden pb-10">
      
      {/* Dynamic Grid background purely for cosmic high fidelity aesthetics */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Main App Bar header */}
      <header className="relative w-full border-b border-slate-900 bg-slate-950/80 backdrop-blur px-6 py-4 flex items-center justify-between z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-lg border border-blue-400/20">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5 font-display">
              KnoGraph <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono font-normal">v1.0</span>
            </h1>
            <p className="text-[10px] text-slate-500 tracking-wider uppercase font-semibold">Graph-Centric Personal Knowledge Management</p>
          </div>
        </div>

        {/* User statistics and actions */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-400">
            <UserIcon className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold truncate max-w-[150px]">{user.email}</span>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            id="btn_open_creation_modal"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-lg shadow-blue-950/20 transition-all flex items-center gap-1.5 cursor-pointer text-xs"
          >
            <Plus className="w-4 h-4" /> Add Entity Node
          </button>

          <button
            onClick={handleLogout}
            id="btn_logout"
            className="p-1.5 hover:bg-red-950/40 text-slate-500 hover:text-red-400 rounded-lg border border-transparent hover:border-red-900/30 transition-all cursor-pointer"
            title="Disconnect authentication"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Layout Workspace grids */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-6 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* Left Column: Visual Graph Space / Spatial Canvas Space */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-[650px] md:h-[800px]">
          
          {activeCanvasNode ? (
            /* Spatial Whiteboard interactive canvas */
            <CanvasSpace />
          ) : (
            /* WebGL Network Cytoscape structure */
            <div className="relative flex-1 w-full h-full flex flex-col">
              <div className="flex justify-between items-center bg-slate-900/40 p-3 rounded-t-xl border-t border-x border-slate-800 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                  <MonitorPlay className="w-4 h-4 text-blue-500" /> WebGL Graphic space visualization
                </span>
                <span className="text-slate-500 font-mono text-[10px]">{nodes.length} nodes • {relationships.length} relationships</span>
              </div>
              <div className="flex-1 min-h-0 bg-slate-950">
                <GraphSpace onNodeClick={(node) => setSelectedNode(node)} />
              </div>
            </div>
          )}

          {/* Quick Node detail whiteboard triggers */}
          {selectedNode && selectedNode.type === 'Canvas' && !activeCanvasNode && (
            <div className="bg-amber-950/20 border border-amber-800 p-4 rounded-xl flex items-center justify-between gap-4 shadow-lg shadow-amber-950/5 text-xs animate-bounce">
              <div className="flex gap-2.5 items-center">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <Layout className="w-4 h-4 text-slate-950" />
                </div>
                <div>
                  <h4 className="text-slate-200 font-bold text-sm">Spatial Workstation Connected</h4>
                  <p className="text-slate-400 mt-0.5">"${selectedNode.name}" represents custom 2D coordinate board whiteboard card.</p>
                </div>
              </div>
              <button
                onClick={() => selectCanvas(selectedNode)}
                id="btn_launch_whiteboard"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg transition-colors shadow-md cursor-pointer"
              >
                Launch Whiteboard View
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Dock containing Search filters, Books, Quotas, Details */}
        <div className="lg:col-span-4 flex flex-col gap-6 max-h-[850px] lg:max-h-none overflow-y-auto pr-0 lg:pr-1 pb-10">
          
          {/* Active selection detailed side panel */}
          {selectedNode && <SidebarPanel />}
          
          {/* Search algorithms, Traversal & insights selector */}
          <SearchAndInsights />

          {/* S3 Storage controller uploads */}
          <S3StoragePanel />

        </div>
      </main>

      {/* Insert Modal for spawning new nodes */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form 
            onSubmit={handleCreateNode} 
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-md shadow-2xl relative flex flex-col gap-4 text-xs font-sans"
          >
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
            >
              <XIcon className="w-5 h-5" />
            </button>

            <h3 className="text-slate-200 font-bold text-lg leading-tight font-display">Spawn Knowledge Entity Node</h3>

            {/* Type selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Node Category (Label)</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['Note', <FileText className="w-3.5 h-3.5 mr-1" />],
                  ['Concept', <BookOpen className="w-3.5 h-3.5 mr-1" />],
                  ['Canvas', <Layout className="w-3.5 h-3.5 mr-1" />],
                  ['Person', <UserIcon className="w-3.5 h-3.5 mr-1" />]
                ] as const).map(([typeVal, icon]) => (
                  <button
                    key={typeVal}
                    type="button"
                    onClick={() => setNodeType(typeVal)}
                    id={`btn_create_type_select_${typeVal}`}
                    className={`py-2 px-1 border rounded-lg text-center flex items-center justify-center text-[11px] font-semibold cursor-pointer ${
                      nodeType === typeVal 
                        ? 'border-blue-600 bg-blue-950/20 text-blue-200 font-bold' 
                        : 'border-slate-800/80 text-slate-400 hover:bg-slate-850'
                    }`}
                  >
                    {icon} {typeVal}
                  </button>
                ))}
              </div>
            </div>

            {/* Name parameters */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Entity Name</label>
              <input
                type="text"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                id="create_node_name_input"
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 text-sm font-semibold"
                placeholder="E.g., Neural Networks Phase 4"
                required
              />
            </div>

            {/* Content description */}
            <div className="flex flex-col gap-1.5 font-sans">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Description Content / Observations</label>
              <textarea
                value={nodeContent}
                onChange={(e) => setNodeContent(e.target.value)}
                id="create_node_content_textarea"
                rows={4}
                className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-blue-500 text-sm font-light resize-none"
                placeholder="Detailed text blocks describing notes, authors properties, canvas, concepts..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="btn_create_node_confirm"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-950/30 transition-colors"
              >
                Assemble Entity Node
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

// Light inline SVG X Icon helper for modal to guarantee 0 loader failures
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
