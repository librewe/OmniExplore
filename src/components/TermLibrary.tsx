"use client";

import { Search, X, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TermLibraryProps {
  terms: string[];
  currentTerm: string;
  onTermClick: (term: string) => void;
  onTermDelete: (term: string) => void;
  onTermRename: (oldTerm: string, newTerm: string) => void;
  onNewTerm: () => void;
}

export function TermLibrary({ terms, currentTerm, onTermClick, onTermDelete, onTermRename, onNewTerm }: TermLibraryProps) {
  const [search, setSearch] = useState("");
  const [renamingTerm, setRenamingTerm] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filtered = search
    ? terms.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : terms;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索术语…"
            className="w-full h-8 rounded-md border border-input bg-transparent pl-8 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <button
          onClick={onNewTerm}
          className="mt-1.5 w-full flex items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground/30 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建术语</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {search ? "未找到" : "暂无术语"}
          </p>
        ) : (
          filtered.map((term) => {
            const isActive = term.toLowerCase() === currentTerm.toLowerCase();
            const isRenaming = renamingTerm === term;
            return (
              <div
                key={term}
                onClick={() => onTermClick(term)}
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
                        onTermRename(term, renameValue.trim());
                        setRenamingTerm(null);
                      }
                      if (e.key === "Escape") setRenamingTerm(null);
                    }}
                    onBlur={() => {
                      if (renameValue.trim()) onTermRename(term, renameValue.trim());
                      setRenamingTerm(null);
                    }}
                    className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    autoFocus
                  />
                ) : (
                  <button
                    className="truncate flex-1 text-left pointer-events-none"
                  >
                    {term}
                  </button>
                )}
                {!isRenaming && (
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingTerm(term);
                        setRenameValue(term);
                      }}
                      className="p-0.5 rounded hover:bg-accent"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`确定删除术语"${term}"？`)) onTermDelete(term);
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
