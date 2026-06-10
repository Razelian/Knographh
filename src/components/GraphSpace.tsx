import React, { useEffect, useRef, useState } from 'react';
import cytoscape from 'cytoscape';
import { useStore } from '../store.ts';
import { Node, Relationship } from '../types.ts';
import { ZoomIn, ZoomOut, RefreshCw, LayoutTemplate } from 'lucide-react';

interface GraphSpaceProps {
  onNodeClick: (node: Node) => void;
}

export default function GraphSpace({ onNodeClick }: GraphSpaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const { 
    nodes, 
    relationships, 
    selectedNode,
    deleteNode,
    createShortcut,
    setSelectedNode,
    selectCanvas
  } = useStore();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    node: Node;
  } | null>(null);

  // Keep a ref of nodes to prevent stale closures in cytoscape callbacks
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Click outside menu closes it
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Function to map nodes/relationships to cytoscape formats
  const getElements = () => {
    const cyNodes = nodes.map(n => ({
      data: {
        id: n.id,
        label: n.name.length > 22 ? n.name.slice(0, 20) + '...' : n.name,
        fullName: n.name,
        type: n.type,
      }
    }));

    const cyEdges = relationships.map(r => ({
      data: {
        id: r.id,
        source: r.source,
        target: r.target,
        label: r.type,
      }
    }));

    return [...cyNodes, ...cyEdges];
  };

  // Node Color Mapper based on specification
  const getNodeColor = (type: string) => {
    switch (type) {
      case 'Concept': return '#f97316'; // Orange
      case 'Note': return '#3b82f6'; // Cosmic Blue
      case 'File': return '#a855f7'; // Purple
      case 'Person': return '#14b8a6'; // Teal
      case 'Canvas': return '#f59e0b'; // Amber Whiteboard
      default: return '#94a3b8';
    }
  };

  const getNodeShape = (type: string) => {
    switch (type) {
      case 'Concept': return 'ellipse';
      case 'Canvas': return 'round-rectangle';
      case 'File': return 'diamond';
      case 'Person': return 'barrel';
      default: return 'ellipse';
    }
  };

  const reLayout = () => {
    if (cyRef.current) {
      const layout = cyRef.current.layout({
        name: 'cose',
        animate: true,
        animationDuration: 600,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 50,
        randomize: false,
        componentSpacing: 100,
        nodeRepulsion: () => 4500,
        edgeElasticity: () => 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      } as any);
      layout.run();
    }
  };

  // Zoom utilities
  const zoomIn = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 1.2);
  const zoomOut = () => cyRef.current && cyRef.current.zoom(cyRef.current.zoom() * 0.8);
  const fitGraph = () => cyRef.current && cyRef.current.fit();

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: getElements(),
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'font-family': 'Inter, sans-serif',
            'font-size': '10px',
            'font-weight': 'normal',
            'color': '#f8fafc', // Soft light text
            'text-valign': 'center',
            'text-halign': 'center',
            'background-color': (ele: any) => getNodeColor(ele.data('type')),
            'shape': (ele: any) => getNodeShape(ele.data('type')),
            'width': (ele: any) => ele.data('type') === 'Concept' ? '50px' : ele.data('type') === 'Canvas' ? '55px' : '40px',
            'height': (ele: any) => ele.data('type') === 'Concept' ? '50px' : ele.data('type') === 'Canvas' ? '40px' : '40px',
            'text-outline-color': '#0f172a',
            'text-outline-width': '2px',
            'border-width': '2px',
            'border-opacity': 0.8,
            'border-color': '#1e293b',
            'transition-property': 'background-color, border-color, border-width',
            'transition-duration': 0.2
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#334155', // Slate
            'target-arrow-color': '#475569',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'font-family': 'JetBrains Mono, SFMono-Regular, monospace',
            'color': '#94a3b8',
            'text-rotation': 'autorotate',
            'text-outline-color': '#0f172a',
            'text-outline-width': '1px'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ef4444', // Red border selection
            'border-width': '4px',
            'background-color': '#1e293b'
          }
        }
      ],
      layout: {
        name: 'cose',
        fit: true,
        padding: 50,
      } as any
    });

    cyRef.current = cy;

    // Attach click triggers
    cy.on('tap', 'node', (evt) => {
      const nodeData = evt.target.data();
      const matchedNode = nodesRef.current.find(n => n.id === nodeData.id);
      if (matchedNode) {
        onNodeClick(matchedNode);
      }
    });

    // Attach right click context menu trigger
    cy.on('cxttap', 'node', (evt) => {
      const origEvent = evt.originalEvent;
      if (origEvent) {
        origEvent.preventDefault();
        origEvent.stopPropagation();

        const nodeData = evt.target.data();
        const matchedNode = nodesRef.current.find(n => n.id === nodeData.id);
        if (matchedNode) {
          setContextMenu({
            x: origEvent.clientX,
            y: origEvent.clientY,
            node: matchedNode
          });
        }
      }
    });

    // Handle container contextmenu to prevent standard browser menu
    const handleContainerContext = (e: MouseEvent) => {
      e.preventDefault();
    };
    containerRef.current?.addEventListener('contextmenu', handleContainerContext);

    // Zoom and pan adjustments
    cy.on('resize', () => {
      cy.invalidateDimensions();
    });

    // Run first layout
    reLayout();

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      containerRef.current?.removeEventListener('contextmenu', handleContainerContext);
    };
  }, []);

  // Sync elements when nodes or relationships update
  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;
    
    // Smooth element synchronization to prevent redraw flickering
    const currentElements = cy.elements();
    const updatedModel = getElements();
    
    const elementsToRemove = currentElements.filter(ele => {
      return !updatedModel.some(m => m.data.id === ele.id());
    });
    
    cy.remove(elementsToRemove);

    updatedModel.forEach(m => {
      const exists = cy.getElementById(m.data.id);
      if (exists.length > 0) {
        // Update label or name if changed
        exists.data(m.data);
      } else {
        cy.add(m);
      }
    });

    // Trigger cose layout only if node count changes considerably
    if (elementsToRemove.length > 0 || updatedModel.length > currentElements.length) {
      reLayout();
    }
  }, [nodes, relationships]);

  // Sync selection panel highlighter
  useEffect(() => {
    if (!cyRef.current) return;
    cyRef.current.nodes().unselect();
    if (selectedNode) {
      const matched = cyRef.current.getElementById(selectedNode.id);
      if (matched.length > 0) {
        matched.select();
        cyRef.current.center(matched);
      }
    }
  }, [selectedNode]);

  return (
    <div className="relative w-full h-[600px] md:h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Canvas container */}
      <div ref={containerRef} className="w-full h-full" id="cytoscape_graph_canvas" />

      {/* Floating Toolbar */}
      <div className="absolute bottom-4 left-4 flex gap-2 bg-slate-900/90 border border-slate-800 p-2 rounded-lg shadow-lg z-10 backdrop-blur-md">
        <button
          onClick={zoomIn}
          id="btn_zoom_in"
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors rounded"
          title="Zoom In"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={zoomOut}
          id="btn_zoom_out"
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors rounded"
          title="Zoom Out"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
        <button
          onClick={fitGraph}
          id="btn_fit"
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors rounded"
          title="Center Fit"
        >
          <LayoutTemplate className="w-5 h-5" />
        </button>
        <button
          onClick={reLayout}
          id="btn_relayout"
          className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors rounded border-l border-slate-800 pl-2"
          title="Recalculate Layout"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Aesthetic Legend indicators */}
      <div className="absolute top-4 right-4 bg-slate-900/80 border border-slate-800/80 p-3 rounded-lg flex flex-col gap-1.5 text-xs z-10 backdrop-blur-md shadow-md">
        <span className="font-semibold text-slate-400 mb-1">Graph Legend</span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="text-slate-300">Concept</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-slate-300">Note</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded bg-amber-500" />
          <span className="text-slate-300">Canvas</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rotate-45 bg-purple-500" />
          <span className="text-slate-300">File</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-3 bg-teal-500 rounded" />
          <span className="text-slate-300">Person</span>
        </div>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-[100] w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 text-slate-200 text-xs"
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-slate-800 bg-slate-950/45 font-semibold text-slate-400 select-none truncate">
            {contextMenu.node.name}
          </div>

          <button
            onClick={() => {
              onNodeClick(contextMenu.node);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-slate-850 flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
          >
            Edit Details
          </button>

          <button
            onClick={async () => {
              const node = contextMenu.node;
              if (confirm(`Are you absolutely sure you want to delete "${node.name}"? This will also disconnect all its graph links.`)) {
                await deleteNode(node.id);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-red-950/40 text-red-100 hover:text-red-200 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            Delete Node
          </button>

          <button
            onClick={async () => {
              const node = contextMenu.node;
              const label = prompt(`Bookmark label for "${node.name}":`, node.name);
              if (label) {
                await createShortcut(node.id, label);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-2 hover:bg-slate-850 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            Bookmark Node
          </button>

          {contextMenu.node.type === 'Canvas' && (
            <button
              onClick={() => {
                selectCanvas(contextMenu.node);
                setSelectedNode(null);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-2 hover:bg-slate-850 hover:text-amber-300 text-amber-400 font-medium flex items-center gap-1.5 border-t border-slate-800 transition-colors cursor-pointer"
            >
              Open Canvas Whiteboard
            </button>
          )}
        </div>
      )}
    </div>
  );
}
