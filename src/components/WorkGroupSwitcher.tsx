"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, Plus, Folder } from "lucide-react";
import type { WorkGroup } from "@/types";
import { cn } from "@/lib/utils";

interface WorkGroupSwitcherProps {
  groups: WorkGroup[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
  onCreate: (name: string) => void;
}

export function WorkGroupSwitcher({
  groups,
  activeGroupId,
  onSelect,
  onCreate,
}: WorkGroupSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleCreate = useCallback(() => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName("");
    setCreating(false);
  }, [newName, onCreate]);

  return (
    <div ref={ref} className="relative px-4 py-2 border-b">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-sm hover:bg-accent rounded-md px-2 py-0.5 transition-colors"
      >
        <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-left font-medium">
          {activeGroup?.name || "选择工作组"}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-4 right-4 top-full z-50 mt-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => {
                onSelect(group.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                group.id === activeGroupId
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-accent"
              )}
            >
              <Folder className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{group.name}</span>
            </button>
          ))}

          <div className="my-1 h-px bg-border" />

          {creating ? (
            <div className="flex gap-1 px-1 py-1">
              <input
                ref={inputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="工作组名称"
                className="flex-1 h-7 rounded border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <button
                onClick={handleCreate}
                className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded bg-primary text-primary-foreground text-xs"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                setCreating(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建工作组</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
