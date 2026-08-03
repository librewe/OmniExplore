"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, File, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoredFile } from "@/types";

interface FilesListProps {
  files: StoredFile[];
  onUpload: (file: StoredFile) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onFileClick?: (file: StoredFile) => void;
  search?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesList({ files, onUpload, onDelete, onFileClick, search }: FilesListProps) {
  const filtered = search ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())) : files;
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (f: File) => {
      setUploading(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const stored: StoredFile = {
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          type: f.type,
          data: (reader.result as string).split(",")[1],
          created_at: Date.now(),
        };
        await onUpload(stored);
        setUploading(false);
      };
      reader.onerror = () => setUploading(false);
      reader.readAsDataURL(f);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <div className="flex flex-col h-full">
      <div
        className={cn(
          "m-2 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1 py-4 cursor-pointer transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-muted-foreground/60"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="w-5 h-5 text-muted-foreground" />
        )}
        <span className="text-xs text-muted-foreground">拖入文件或点击上传</span>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="flex-1 overflow-auto px-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">{search ? "未找到" : "暂无文件"}</p>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              onClick={() => onFileClick?.(f)}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent group text-sm cursor-pointer"
            >
              <File className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">{formatSize(f.size)}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}
                className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
