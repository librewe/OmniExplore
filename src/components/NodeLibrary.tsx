"use client";

import { X, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface NodeLibraryProps {
  nodeTitles: string[];
  currentNodeTitle: string;
  onNodeClick: (title: string) => void;
  onNodeDelete: (title: string) => void;
  onNodeRename: (oldTitle: string, newTitle: string) => void;
  showGuideMap?: boolean;
  onAddToGuideMap?: (title: string) => void;
  search?: string;
}

export function NodeLibrary({ nodeTitles, currentNodeTitle, onNodeClick, onNodeDelete, onNodeRename, showGuideMap, onAddToGuideMap, search }: NodeLibraryProps) {
  const [renamingNode, setRenamingNode] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = search
    ? nodeTitles.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : nodeTitles;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto py-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {search ? "未找到" : "暂无节点"}
          </p>
        ) : (
          filtered.map((title) => {
            const isActive = title.toLowerCase() === currentNodeTitle.toLowerCase();
            const isRenaming = renamingNode === title;
            return (
              <div
                key={title}
                onClick={() => onNodeClick(title)}
                className={cn(
                  "flex items-center w-full px-3 py-1.5 text-sm transition-colors group cursor-pointer",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-accent"
                )}
              >
                {isRenaming ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onNodeRename(title, renameValue.trim());
                        setRenamingNode(null);
                      }
                      if (e.key === "Escape") setRenamingNode(null);
                    }}
                    onBlur={() => {
                      if (renameValue.trim()) onNodeRename(title, renameValue.trim());
                      setRenamingNode(null);
                    }}
                    className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                ) : (
                  <button className="truncate flex-1 text-left pointer-events-none">
                    {title}
                  </button>
                )}
                {!isRenaming && (
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {showGuideMap && onAddToGuideMap && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToGuideMap(title);
                        }}
                        className="p-0.5 rounded hover:bg-accent"
                        title="添加到当前导图层"
                      >
                        <Plus className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingNode(title);
                        setRenameValue(title);
                      }}
                      className="p-0.5 rounded hover:bg-accent"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除节点"${title}"？`)) onNodeDelete(title);
                      }}
                      className="p-0.5 rounded hover:bg-destructive/10"
                    >
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
