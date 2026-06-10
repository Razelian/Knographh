import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Rect, Text as KonvaText, Group, Line, Image as KonvaImage } from 'react-konva';
import { useStore } from '../store.ts';
import { CanvasChild } from '../types.ts';
import { 
  Type, 
  Image as ImageIcon, 
  PenTool, 
  FileText, 
  ArrowLeft, 
  Plus, 
  X, 
  Save, 
  Trash2,
  Lock,
  Compass
} from 'lucide-react';

export default function CanvasSpace() {
  const { activeCanvasNode, activeCanvasChildren, selectCanvas, addCanvasChild, updateCanvasChild, deleteCanvasChild } = useStore();
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [activeTool, setActiveTool] = useState<'select' | 'text' | 'image' | 'drawing' | 'file'>('select');
  
  // Interactive entry controls
  const [showAddModal, setShowAddModal] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [fileLabel, setFileLabel] = useState('');

  const stageRef = useRef<any>(null);

  if (!activeCanvasNode) return null;

  // Handle zooming using layout wheels
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const scaleBy = 1.05;
    const stage = stageRef.current;
    if (!stage) return;
    
    const oldScale = stage.scaleX();
    const mousePointTo = {
      x: (stage.getPointerPosition().x - stage.x()) / oldScale,
      y: (stage.getPointerPosition().y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    const clampedScale = Math.max(0.1, Math.min(newScale, 5));

    setStageScale(clampedScale);
    setStagePos({
      x: stage.getPointerPosition().x - mousePointTo.x * clampedScale,
      y: stage.getPointerPosition().y - mousePointTo.y * clampedScale,
    });
  };

  const handleDragEndChild = (childId: string, e: any) => {
    const node = e.target;
    updateCanvasChild(activeCanvasNode.id, childId, node.x(), node.y());
  };

  const handleSubmitChild = async () => {
    let content = '';
    if (activeTool === 'text') content = textInput || 'Text card content';
    else if (activeTool === 'image') content = imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500';
    else if (activeTool === 'file') content = fileLabel || 'Attachment_Specifications.pdf';
    else if (activeTool === 'drawing') content = 'M0,0 L100,0 L50,100 Z'; // standard SVG path representation 

    // Find center point coordinates in current pan view
    const stage = stageRef.current;
    const posX = stage ? (-stage.x() + 300) / stageScale : 150;
    const posY = stage ? (-stage.y() + 200) / stageScale : 150;

    await addCanvasChild(activeCanvasNode.id, activeTool as any, posX, posY, content);
    
    // Reset properties
    setTextInput('');
    setImageUrl('');
    setFileLabel('');
    setShowAddModal(false);
    setActiveTool('select');
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case 'text': return <Type className="w-4 h-4 text-blue-400" />;
      case 'image': return <ImageIcon className="w-4 h-4 text-emerald-400" />;
      case 'drawing': return <PenTool className="w-4 h-4 text-purple-400" />;
      default: return <FileText className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
      {/* Workspace Sub Header Controls */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between z-10">
        <button
          onClick={() => selectCanvas(null)}
          id="btn_back_to_graph"
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Graph Space
        </button>

        <span className="text-slate-200 font-semibold text-sm truncate max-w-sm">
          Whiteboard: <strong className="text-amber-500">{activeCanvasNode.name}</strong>
        </span>

        {/* Dynamic Whitespace Toolkits */}
        <div className="flex gap-1 bg-slate-950/80 p-1 border border-slate-800 rounded-lg">
          {(['text', 'image', 'drawing', 'file'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setActiveTool(t);
                setShowAddModal(true);
              }}
              id={`btn_canvas_add_${t}`}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Infinite Area 2D Canvas space */}
      <div className="flex-1 w-full relative group">
        <Stage
          ref={stageRef}
          width={800}
          height={600}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable
          onWheel={handleWheel}
          className="bg-slate-950 absolute inset-0 cursor-grab active:cursor-grabbing"
          id="canvas_whiteboard_stage"
        >
          <Layer>
            {/* Grid references background */}
            {Array.from({ length: 40 }).map((_, i) => (
              <Line
                key={`grid_h_${i}`}
                points={[-2000, i * 80 - 1000, 4000, i * 80 - 1000]}
                stroke="#1e293b"
                strokeWidth={0.5}
                opacity={0.3}
              />
            ))}
            {Array.from({ length: 40 }).map((_, i) => (
              <Line
                key={`grid_v_${i}`}
                points={[i * 80 - 1000, -2000, i * 80 - 1000, 4000]}
                stroke="#1e293b"
                strokeWidth={0.5}
                opacity={0.3}
              />
            ))}

            {activeCanvasChildren.map((child: CanvasChild) => {
              const cardWidth = child.type === 'text' ? 220 : child.type === 'image' ? 180 : 160;
              const cardHeight = child.type === 'text' ? 130 : child.type === 'image' ? 120 : 70;

              return (
                <Group
                  key={child.id}
                  x={child.posX}
                  y={child.posY}
                  draggable
                  onDragEnd={(e) => handleDragEndChild(child.id, e)}
                  id={`canvas_child_group_${child.id}`}
                >
                  {/* Card Background Plate */}
                  <Rect
                    width={cardWidth}
                    height={cardHeight}
                    fill="#0f172a"
                    stroke={child.type === 'image' ? '#10b981' : child.type === 'drawing' ? '#8b5cf6' : '#2563eb'}
                    strokeWidth={1.5}
                    cornerRadius={8}
                    shadowBlur={8}
                    shadowColor="#000"
                    shadowOpacity={0.4}
                  />

                  {/* Top Bar Area */}
                  <Rect
                    width={cardWidth}
                    height={25}
                    fill="#1e293b"
                    cornerRadius={[8, 8, 0, 0]}
                  />

                  {/* Type identifier icon */}
                  <KonvaText
                    x={10}
                    y={6}
                    text={child.type.toUpperCase()}
                    fontSize={8}
                    fontFamily="JetBrains Mono, SFMono-Regular, monospace"
                    fill="#94a3b8"
                    fontStyle="bold"
                  />

                  {/* Interactive content description */}
                  {child.type === 'text' && (
                    <KonvaText
                      x={12}
                      y={36}
                      width={cardWidth - 24}
                      height={70}
                      text={child.content}
                      fontSize={11}
                      fontFamily="Inter, sans-serif"
                      fill="#f1f5f9"
                      wrap="char"
                    />
                  )}

                  {child.type === 'image' && (
                    <KonvaText
                      x={12}
                      y={36}
                      width={cardWidth - 24}
                      text={`Image link:`}
                      fontSize={10}
                      fontFamily="Inter"
                      fill="#64748b"
                    />
                  )}
                  {child.type === 'image' && (
                    <KonvaText
                      x={12}
                      y={50}
                      width={cardWidth - 24}
                      text={child.content.length > 30 ? child.content.slice(0, 27) + '...' : child.content}
                      fontSize={10}
                      fontFamily="JetBrains Mono"
                      fill="#10b981"
                      wrap="char"
                    />
                  )}

                  {child.type === 'drawing' && (
                    <KonvaText
                      x={12}
                      y={36}
                      width={cardWidth - 24}
                      text={`Vector path details. Custom SVG elements pinned dynamically.`}
                      fontSize={10}
                      fontFamily="Inter"
                      fill="#94a3b8"
                      wrap="char"
                    />
                  )}

                  {child.type === 'file' && (
                    <KonvaText
                      x={12}
                      y={36}
                      width={cardWidth - 24}
                      text={`File: ${child.content}`}
                      fontSize={11}
                      fontFamily="Inter"
                      fill="#f59e0b"
                      fontStyle="bold"
                      wrap="char"
                    />
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>

        {/* Whiteboard Interactive Instructions overlay */}
        <div className="absolute top-4 left-4 bg-slate-900/95 border border-slate-800 p-3 rounded-lg flex flex-col gap-1 text-xs text-slate-400 z-10 backdrop-blur pointer-events-none">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-amber-400" /> Interactive controls
          </span>
          <span>• Mouse wheel inside: Zoom view</span>
          <span>• Drag and drop cards to organize</span>
          <span>• Drag empty background areas to pan</span>
        </div>

        {/* Manual items deletion panel */}
        {activeCanvasChildren.length > 0 && (
          <div className="absolute bottom-4 right-4 bg-slate-900 border border-slate-800 rounded-lg p-2 flex flex-col gap-1.5 shadow-lg z-10 max-h-[160px] overflow-y-auto w-[220px]">
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase px-2 mb-1">Canvas Elements</span>
            {activeCanvasChildren.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-1.5 px-2 py-1 text-xs hover:bg-slate-800 hover:text-slate-100 rounded text-slate-400 group/item">
                <div className="flex items-center gap-1 truncate max-w-[130px]">
                  {renderIcon(c.type)}
                  <span className="truncate">{c.content}</span>
                </div>
                <button
                  onClick={() => deleteCanvasChild(activeCanvasNode.id, c.id)}
                  id={`btn_delete_card_${c.id}`}
                  className="p-1 hover:text-red-400 transition-colors rounded hover:bg-slate-950"
                  title="Purge Card"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input Modal for drawing whiteboards child */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl w-full max-w-md shadow-2xl relative">
            <button
              onClick={() => {
                setShowAddModal(false);
                setActiveTool('select');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-slate-200 font-semibold text-lg flex items-center gap-2 mb-4">
              {renderIcon(activeTool)} Add {activeTool} block to Board
            </h3>

            {activeTool === 'text' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">Content Text</label>
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  id="canvas_text_content"
                  rows={4}
                  className="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Enter content details or observations..."
                />
              </div>
            )}

            {activeTool === 'image' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">Source Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  id="canvas_img_content"
                  className="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                  placeholder="https://images.unsplash.com/... or relative path"
                />
              </div>
            )}

            {activeTool === 'file' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-400">Label of Attachment</label>
                <input
                  type="text"
                  value={fileLabel}
                  onChange={(e) => setFileLabel(e.target.value)}
                  id="canvas_file_content"
                  className="bg-slate-950 border border-slate-800 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
                  placeholder="Specs_Overview_Draft.docx"
                />
              </div>
            )}

            {activeTool === 'drawing' && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded text-xs text-slate-400 leading-relaxed mb-4">
                Creating drawing vector on whiteboard bounds. We translate standard 2D drawings into scalable coordinate shapes. Click apply to commit layout.
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setActiveTool('select');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitChild}
                id="btn_confirm_add_child"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold transition-colors flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" /> Add card
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
