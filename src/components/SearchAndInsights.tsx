import React, { useState } from 'react';
import { useStore } from '../store.ts';
import { Node } from '../types.ts';
import { 
  Search, 
  Terminal, 
  Bookmark, 
  BarChart3, 
  HelpCircle, 
  Share2, 
  FolderGit2, 
  Compass, 
  CheckCircle,
  Clock,
  ExternalLink,
  X
} from 'lucide-react';

export default function SearchAndInsights() {
  const { 
    searchQuery, 
    searchResults, 
    executeSearch,
    cypherQuery, 
    cypherResults, 
    loadingQuery, 
    queryError, 
    executeCypher,
    shortcuts, 
    deleteShortcut,
    nodes,
    setSelectedNode,
    insightView,
    insightNodes,
    insightClusters,
    loadingInsights,
    setInsightView,
    user
  } = useStore();

  const [localCypher, setLocalCypher] = useState('');
  const [use3Hop, setUse3Hop] = useState(false);
  const [targetStartNodeId, setTargetStartNodeId] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    executeSearch(e.target.value);
  };

  const handleRunCypher = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localCypher.trim()) return;
    executeCypher(localCypher, use3Hop ? targetStartNodeId : undefined);
  };

  const applyCypherTemplate = (tmpl: string, isTraversal = false) => {
    setLocalCypher(tmpl);
    setUse3Hop(isTraversal);
    if (isTraversal && nodes.length > 0) {
      setTargetStartNodeId(nodes[0].id);
    }
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-6 shadow-2xl h-full overflow-y-auto">
      
      {/* 1. Full-text Search Bar */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Search className="w-3.5 h-3.5 text-blue-400" /> Full-text engine scanning
        </label>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            id="search_primary_input"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-600 transition-colors"
            placeholder="Search all node names, content parameters..."
          />
          <Search className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-600 pointer-events-none" />
        </div>

        {/* Search Results Display */}
        {searchQuery.trim().length > 0 && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2 max-h-[180px] overflow-y-auto flex flex-col gap-1 mt-1">
            {searchResults.length === 0 ? (
              <span className="text-xs text-slate-600 italic px-2 py-1">No keywords matched.</span>
            ) : (
              searchResults.map((found: Node) => (
                <div
                  key={found.id}
                  onClick={() => setSelectedNode(found)}
                  id={`search_res_node_${found.id}`}
                  className="px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-900 hover:text-white rounded cursor-pointer flex items-center justify-between border border-transparent hover:border-slate-800"
                >
                  <span className="font-semibold truncate">{found.name}</span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded ml-2">
                    {found.type}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 2. Shortcuts / Bookmark Panel */}
      <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-4">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Bookmark className="w-3.5 h-3.5 text-amber-500" /> Saved Shortcuts & Views
        </label>
        {shortcuts.length === 0 ? (
          <p className="text-xs text-slate-600 italic pl-1 leading-relaxed">
            No bookmarks created yet. Pin bookmarks using the node side panel to save shortcuts here.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {shortcuts.map((sc) => (
              <div
                key={sc.id}
                className="bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center justify-between gap-1 text-xs group"
              >
                <span
                  onClick={() => {
                    const matched = nodes.find(n => n.id === sc.nodeId);
                    if (matched) setSelectedNode(matched);
                  }}
                  className="font-medium text-slate-300 truncate cursor-pointer hover:text-amber-400 flex items-center gap-1.5"
                >
                  <Clock className="w-3 h-3 text-slate-500" /> {sc.label}
                </span>
                <button
                  onClick={() => deleteShortcut(sc.id)}
                  id={`btn_delete_sc_${sc.id}`}
                  className="p-1 hover:text-red-400 text-slate-600 transition-colors rounded hover:bg-slate-900"
                  title="Purge Bookmark"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Cypher-like Query input */}
      <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" /> Advanced Cypher Query
          </label>
          <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-500 px-1.5 py-0.5 rounded uppercase font-semibold">
            Personal Mode
          </span>
        </div>

        <form onSubmit={handleRunCypher} className="flex flex-col gap-2">
          <textarea
            value={localCypher}
            onChange={(e) => setLocalCypher(e.target.value)}
            id="cypher_query_textarea"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500 font-mono resize-none leading-relaxed"
            rows={3}
            placeholder="MATCH (n) WHERE n.type = 'Concept' RETURN n"
          />

          {/* Optional Traversal settings */}
          <div className="flex items-center justify-between bg-slate-950/40 p-2 rounded border border-slate-800/40 text-[11px]">
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={use3Hop}
                onChange={(e) => setUse3Hop(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950"
              />
              Execute graph traversal
            </label>
            {use3Hop && (
              <select
                value={targetStartNodeId}
                onChange={(e) => setTargetStartNodeId(e.target.value)}
                id="cypher_traversal_start_select"
                className="bg-slate-900 border border-slate-800 p-0.5 text-[10px] text-slate-300 rounded"
              >
                {nodes.map(n => (
                  <option key={n.id} value={n.id}>{n.name.slice(0, 15)}...</option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            id="btn_run_cypher"
            disabled={loadingQuery}
            className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-emerald-400 text-slate-300 rounded text-xs font-semibold font-mono tracking-wide flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {loadingQuery ? 'Running execution...' : 'EXECUTE GRAPH QUERY'}
          </button>
        </form>

        {/* Cypher Templates panel */}
        <div className="flex flex-col gap-1 mt-1">
          <span className="text-[10px] text-slate-500 tracking-wide font-semibold uppercase">Cypher Helpers</span>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            <button
              onClick={() => applyCypherTemplate("MATCH (n) WHERE n.type = 'Concept' RETURN n")}
              className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800/60 rounded text-left truncate text-slate-400 hover:text-white"
            >
              Filter Concepts
            </button>
            <button
              onClick={() => applyCypherTemplate("MATCH path = (start)-[*1..3]->(end) RETURN path", true)}
              className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800/60 rounded text-left truncate text-slate-400 hover:text-white"
            >
              3-Hop Traversal
            </button>
          </div>
        </div>

        {/* Cypher results panel */}
        {queryError && (
          <div className="p-2.5 bg-red-950/60 border border-dashed border-red-800 rounded text-xs text-red-300">
            {queryError}
          </div>
        )}

        {cypherResults && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 flex flex-col gap-2">
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Results Compiled
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="bg-slate-900 border border-slate-800 p-2 rounded">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Nodes</span>
                <strong className="text-lg font-mono text-emerald-400">{cypherResults.nodes.length}</strong>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-2 rounded">
                <span className="text-slate-500 block text-[9px] uppercase font-bold">Relationships</span>
                <strong className="text-lg font-mono text-emerald-400">{cypherResults.relationships.length}</strong>
              </div>
            </div>

            {/* List results if populated */}
            {cypherResults.nodes.length > 0 && (
              <div className="max-h-[140px] overflow-y-auto flex flex-col gap-1 border-t border-slate-800 pt-1.5 mt-1">
                {cypherResults.nodes.slice(0, 5).map(node => (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className="flex justify-between items-center text-[11px] p-1.5 hover:bg-slate-900 rounded cursor-pointer text-slate-300 hover:text-white"
                  >
                    <span>{node.name}</span>
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                  </div>
                ))}
                {cypherResults.nodes.length > 5 && (
                  <span className="text-[10px] text-slate-500 italic pl-1.5">And {cypherResults.nodes.length - 5} other items on graph.</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Built-in dynamic Insights Selector */}
      <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-4">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> Network Insights Panel
        </label>
        
        {/* Buttons layout */}
        <div className="grid grid-cols-2 gap-1.5">
          {([
            ['most-connected', 'Most Connected'],
            ['orphans', 'Orphans (Degree 0)'],
            ['top-level', 'Top Level Sources'],
            ['concept-clusters', 'Concept Clusters']
          ] as const).map(([viewKey, title]) => (
            <button
              key={viewKey}
              onClick={() => setInsightView(insightView === viewKey ? null : viewKey)}
              id={`btn_insight_${viewKey}`}
              className={`p-2 rounded-lg border text-left flex flex-col justify-between h-[65px] transition-all cursor-pointer ${
                insightView === viewKey
                  ? 'bg-purple-950/50 border-purple-800 text-purple-200 shadow-inner'
                  : 'bg-slate-950 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
              }`}
            >
              <span className="text-xs font-bold leading-tight">{title}</span>
              <span className="text-[9px] text-slate-500 uppercase tracking-wide">Analysis</span>
            </button>
          ))}
        </div>

        {/* Dynamic feedback panel */}
        {insightView && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 mt-1 flex flex-col gap-2 relative">
            <button
              onClick={() => setInsightView(null)}
              className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-200"
              title="Close panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {insightView.replace('-', ' ')} results
            </span>

            {loadingInsights ? (
              <span className="text-xs text-slate-500 italic">Performing Cypher computations...</span>
            ) : (
              <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1.5 mt-1">
                
                {/* Orphans and top-level viewer */}
                {(insightView === 'orphans' || insightView === 'top-level') && (
                  insightNodes.length === 0 ? (
                    <span className="text-xs text-slate-600 italic">0 nodes matching criteria inside network.</span>
                  ) : (
                    insightNodes.map(node => (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className="p-2 border border-slate-800/60 hover:bg-slate-900 rounded text-xs font-semibold cursor-pointer text-slate-300 hover:text-white flex justify-between items-center bg-slate-950/60"
                      >
                        <span className="truncate">{node.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 bg-slate-900 rounded text-slate-500 uppercase">{node.type}</span>
                      </div>
                    ))
                  )
                )}

                {/* Most Connected nodes rating viewer */}
                {insightView === 'most-connected' && (
                  insightNodes.length === 0 ? (
                    <span className="text-xs text-slate-600 italic">0 relationships configured.</span>
                  ) : (
                    insightNodes.slice(0, 10).map((item, idx) => (
                      <div
                        key={item.node.id}
                        onClick={() => setSelectedNode(item.node)}
                        className="p-2 bg-[#0a0f1d] border border-slate-800 rounded flex flex-col gap-1 cursor-pointer hover:border-slate-700"
                      >
                        <div className="flex justify-between text-xs font-semibold text-slate-300">
                          <span className="truncate">{idx + 1}. {item.node.name}</span>
                          <span className="text-[10px] text-purple-400 font-mono">{item.degree} edges</span>
                        </div>
                        {/* Styled visual bar graph rating */}
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-purple-600 h-full rounded-full" 
                            style={{ width: `${Math.min(100, (item.degree / Math.max(...insightNodes.map(i => i.degree))) * 100)}%` }} 
                          />
                        </div>
                      </div>
                    ))
                  )
                )}

                {/* Concept Clusters components graph */}
                {insightView === 'concept-clusters' && (
                  insightClusters.length === 0 ? (
                    <span className="text-xs text-slate-600 italic">Cannot detect dense clusters. Connect more nodes first.</span>
                  ) : (
                    insightClusters.map((cl, idx) => (
                      <div key={cl.clusterId} className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-lg text-xs flex flex-col gap-1.5">
                        <span className="font-bold text-amber-400 flex items-center gap-1">
                          <FolderGit2 className="w-3.5 h-3.5" /> Core Research Cluster {idx + 1}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {cl.nodes.map((n: any) => (
                            <span
                              key={n.id}
                              onClick={() => setSelectedNode(n)}
                              className="px-2 py-0.5 bg-slate-950 border border-slate-800/80 hover:border-slate-600 rounded text-[10px] text-slate-400 hover:text-white cursor-pointer truncate max-w-[120px]"
                            >
                              {n.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )
                )}

              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
