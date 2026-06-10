import React, { useState, useRef } from 'react';
import { useStore } from '../store.ts';
import { HardDrive, Upload } from 'lucide-react';

export default function S3StoragePanel() {
  const { user, uploadFileNode } = useStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  // Convert Byte values into human readable MB/GB limits
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // File limit safeguard
    if (file.size > 100 * 1024 * 1024) {
      alert('S3 Cloud sandbox error: Single file upload limit is capped at 100MB.');
      return;
    }

    try {
      setUploading(true);
      await uploadFileNode(file);
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-2xl">
      
      {/* Space Usage Quota indicators */}
      <div className="flex flex-col gap-1.5 sub-card">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-4 h-4 text-sky-400" /> S3 cloud storage
          </span>
          <span className="text-[10px] font-mono text-slate-500">Unlimited scale</span>
        </label>
        
        <div className="flex justify-between items-center text-xs mt-1 text-slate-300 font-medium font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-850">
          <span>Total consumed</span>
          <span className="text-sky-400 font-bold">{formatBytes(user.storageUsed || 0)}</span>
        </div>
      </div>

      {/* Cloud S3 drag/drop manual uploader */}
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={handleSelectFile}
        id="file_drag_uploader"
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-all ${
          isDragging 
            ? 'border-blue-500 bg-blue-950/10' 
            : 'border-slate-800 hover:border-slate-700 hover:bg-slate-950/40 bg-slate-950/10'
        }`}
      >
        <input 
          type="file"
          ref={fileInputRef}
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
          id="hidden_input_file_selector"
        />

        <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800">
          <Upload className={`w-5 h-5 ${uploading ? 'animate-bounce text-blue-500' : 'text-slate-500'}`} />
        </div>

        <div className="flex flex-col gap-1 text-xs text-center">
          <span className="font-semibold text-slate-300">
            {uploading ? 'Processing cloud stream...' : 'Upload research file'}
          </span>
          <span className="text-[10px] text-slate-500">
            Drag here or click to choose PDF, DOCX (Max 100MB)
          </span>
        </div>
      </div>

    </div>
  );
}
