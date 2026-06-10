import React, { useState, useEffect } from 'react';
import { useStore } from '../store.ts';
import { Node, NodeType, Relationship } from '../types.ts';
import { 
  X, 
  Trash2, 
  Save, 
  Database, 
  User as UserIcon, 
  BookOpen, 
  FileText, 
  HelpCircle,
  Plus, 
  Bookmark,
  Share2
} from 'lucide-react';

export default function SidebarPanel() {
  const { 
    selectedNode, 
    setSelectedNode, 
    nodes, 
    relationships, 
    createRelationship, 
    deleteRelationship, 
    updateNode, 
    deleteNode,
    createShortcut,
    shortcuts,
    deleteShortcut
  } = useStore();

  const [editedName, setEditedName] = useState('');
  const [editedContent, setEditedContent] = useState('');
  const [showSavedMsg, setShowSavedMsg] = useState(false);
  
  // Custom relationship drawing controls
  const [targetNodeId, setTargetNodeId] = useState('');
  const [relType, setRelType] = useState('CONTAINS');
  const [customType, setCustomType] = useState('');

  if (!selectedNode) return null;

  // Sync state whenever selected node changes
  useEffect(() => {
    setEditedName(selectedNode.name);
    setEditedContent(selectedNode.content);
    setShowSavedMsg(false);
  }, [selectedNode.id]);

  const handleAutoSave = async (updatedName: string, updatedContent: string) => {
    if (updatedName === selectedNode.name && updatedContent === selectedNode.content) return;
    if (!updatedName.trim()) return; // Prevent saving empty node name

    await updateNode(selectedNode.id, {
      name: updatedName,
      content: updatedContent
    });

    setShowSavedMsg(true);
    setTimeout(() => {
      setShowSavedMsg(false);
    }, 1000);
  };

  const handleDelete = async () => {
    if (confirm(`Are you absolutely sure you want to delete "${selectedNode.name}"? This will also disconnect all its graph links.`)) {
      await deleteNode(selectedNode.id);
    }
  };

  // Get matching relationships
  const outgoing = relationships.filter(r => r.source === selectedNode.id);
  const incoming = relationships.filter(r => r.target === selectedNode.id);

  const getTargetNodeName = (id: string) => {
    const found = nodes.find(n => n.id === id);
    return found ? found.name : 'Unknown Node';
  };

  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetNodeId) return;

    const finalType = relType === 'CUSTOM' ? (customType || 'ASSOCIATED') : relType;
    await createRelationship(selectedNode.id, targetNodeId, finalType);
    
    setTargetNodeId('');
    setCustomType('');
  };

  const handleCreateShortcut = () => {
    createShortcut(selectedNode.id, selectedNode.name);
  };

  const shortcutItem = shortcuts.find(s => s.nodeId === selectedNode.id);

  const renderTypeIcon = (type: NodeType) => {
    switch (type) {
      case 'Concept': return <BookOpen className="w-4 h-4 text-orange-500" />;
      case 'Note': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'File': return <Database className="w-4 h-4 text-purple-500" />;
      case 'Person': return <UserIcon className="w-4 h-4 text-teal-400" />;
      default: return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="w-full lg:w-[400px] bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5 shadow-2xl h-full overflow-y-auto">
      {/* Header controls */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          {renderTypeIcon(selectedNode.type)}
          <span className="text-xs font-semibold text-slate-400 font-mono tracking-wider uppercase">
            {selectedNode.type} Information
          </span>
        </div>
        <div className="flex gap-1">
          {shortcutItem ? (
            <button
              onClick={() => deleteShortcut(shortcutItem.id)}
              className="p-1 hover:bg-slate-800 text-amber-500 rounded"
              title="Remove Blueprint Bookmark"
            >
              <Bookmark className="w-4 h-4 fill-amber-500" />
            </button>
          ) : (
            <button
              onClick={handleCreateShortcut}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
              title="Add Bookmark"
            >
              <Bookmark className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setSelectedNode(null)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Details View */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex justify-between items-center">
            <span>Entity Name</span>
            {showSavedMsg && (
              <span className="text-emerald-400 font-medium normal-case font-mono animate-pulse">
                ✓ Saved
              </span>
            )}
          </label>
          <input
            type="text"
            value={editedName}
            onChange={(e) => setEditedName(e.target.value)}
            onBlur={() => handleAutoSave(editedName, editedContent)}
            id="sidebar_name_editable"
            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500/80 rounded-lg p-2.5 text-slate-100 font-bold text-base leading-snug focus:outline-none transition-all placeholder-slate-700 font-sans"
            placeholder="Untitled Node"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Content / Description
          </label>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            onBlur={() => handleAutoSave(editedName, editedContent)}
            id="sidebar_content_editable"
            rows={5}
            className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700/80 focus:border-indigo-500/80 rounded-lg p-2.5 text-slate-300 text-xs focus:outline-none transition-all resize-none leading-relaxed font-sans"
            placeholder="Type content, details, or metadata here..."
          />
        </div>

        {/* Node Custom metadata details if present */}
        {selectedNode.type === 'File' && selectedNode.properties.sizeBytes && (
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs flex flex-col gap-1.5 text-slate-400 font-mono col-span-1">
            <span className="text-slate-500 border-b border-slate-800 pb-1 uppercase font-bold tracking-wider text-[9px]">File Properties</span>
            <span>• Type: {selectedNode.properties.mimeType || 'unknown'}</span>
            <span>• Size: {Math.round((selectedNode.properties.sizeBytes || 0) / 1024)} KB</span>
            <span>• Path: {selectedNode.properties.s3Key || 'Local Fallback'}</span>
          </div>
        )}

        {selectedNode.type === 'Person' && selectedNode.properties.email && (
          <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs flex flex-col gap-1 text-slate-400 font-mono">
            <span className="text-slate-500 border-b border-slate-800 pb-1 uppercase font-bold tracking-wider text-[9px]">Contact Details</span>
            <span>• Email: <span className="text-teal-400">{selectedNode.properties.email}</span></span>
          </div>
        )}

        <div>
          <button
            onClick={handleDelete}
            id="btn_sidebar_delete_node"
            className="w-full py-2 bg-red-950/40 hover:bg-red-900/30 border border-red-900 text-red-400 hover:text-red-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            title="Delete node & relations"
          >
            <Trash2 className="w-3.5 h-3.5" /> Purge and Delete Entity
          </button>
        </div>
      </div>

      {/* Relationships and connections mapping list */}
      <div className="flex flex-col gap-4 border-t border-slate-800 pt-4">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Active Graph Connections
        </label>
        
        {/* Outgoing connections source -> target */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-indigo-400">Outgoing Mappings (Source)</span>
          {outgoing.length === 0 ? (
            <span className="text-slate-600 text-xs italic pl-1">0 active outgoing edges.</span>
          ) : (
            outgoing.map(org => (
              <div key={org.id} className="bg-slate-950 border border-slate-800 px-3 py-2 rounded flex items-center justify-between text-xs group">
                <div className="truncate max-w-[260px] text-slate-300">
                  <span className="bg-slate-800 text-slate-400 font-mono text-[9px] px-1.5 py-0.5 rounded mr-1.5 font-semibold">
                    {org.type}
                  </span>
                  → <span className="font-semibold text-sky-400 cursor-pointer hover:underline" onClick={() => setSelectedNode(nodes.find(n => n.id === org.target) || null)}>
                    {getTargetNodeName(org.target)}
                  </span>
                </div>
                <button
                  onClick={() => deleteRelationship(org.id)}
                  id={`btn_delete_rel_${org.id}`}
                  className="p-1 hover:text-red-400 text-slate-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove Directional Link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Incoming connections target <- source */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wide font-bold text-orange-400">Incoming Mappings (Target)</span>
          {incoming.length === 0 ? (
            <span className="text-slate-600 text-xs italic pl-1">0 active incoming edges.</span>
          ) : (
            incoming.map(inc => (
              <div key={inc.id} className="bg-slate-950 border border-slate-800 px-3 py-2 rounded flex items-center justify-between text-xs group">
                <div className="truncate max-w-[260px] text-slate-300">
                  <span className="font-semibold text-orange-400 cursor-pointer hover:underline animate-pulse" onClick={() => setSelectedNode(nodes.find(n => n.id === inc.source) || null)}>
                    {getTargetNodeName(inc.source)}
                  </span>
                  {' '}references node with type <span className="bg-slate-800 text-slate-400 font-mono text-[9px] px-1.5 py-0.5 rounded font-semibold ml-1">
                    {inc.type}
                  </span>
                </div>
                <button
                  onClick={() => deleteRelationship(inc.id)}
                  id={`btn_delete_rel_inc_${inc.id}`}
                  className="p-1 hover:text-red-400 text-slate-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove Directional Link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create custom edge mapper forms */}
      <form onSubmit={handleAddRelationship} className="bg-slate-950 p-4 border border-slate-800/80 rounded-xl flex flex-col gap-3">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Share2 className="w-3.5 h-3.5 text-blue-400" /> Draw Directional Mapping
        </label>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-500">Target Entity</label>
          <select
            value={targetNodeId}
            onChange={(e) => setTargetNodeId(e.target.value)}
            id="sidebar_target_node_select"
            className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-300 focus:outline-none"
            required
          >
            <option value="">-- Choose node --</option>
            {nodes
              .filter(n => n.id !== selectedNode.id)
              .map(n => (
                <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] text-slate-500">Relationship Type</label>
          <select
            value={relType}
            onChange={(e) => setRelType(e.target.value)}
            id="sidebar_rel_type_select"
            className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="CONTAINS">Contains</option>
            <option value="RELATES_TO">Relates to</option>
            <option value="REFERENCES">References</option>
            <option value="IS_PART_OF">Is part of</option>
            <option value="AUTHORED_BY">Authored by</option>
            <option value="CUSTOM">Custom edge...</option>
          </select>
        </div>

        {relType === 'CUSTOM' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] text-slate-500">Custom label string</label>
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              id="sidebar_custom_rel_input"
              className="bg-slate-900 border border-slate-800 rounded p-1.5 text-xs text-slate-300 focus:outline-none"
              placeholder="E.g., EVOLVED_INTO"
              required
            />
          </div>
        )}

        <button
          type="submit"
          id="btn_add_rel_confirm"
          className="w-full mt-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Establish Link
        </button>
      </form>
    </div>
  );
}
