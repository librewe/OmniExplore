"use client";

import { Plus } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import type { PlusMenuItem } from "@/types";

interface PlusMenuProps {
  items: PlusMenuItem[];
  onSelect: (item: PlusMenuItem) => void;
  onCreateEmpty: () => void;
}

export function PlusMenu({ items, onSelect, onCreateEmpty }: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 origin-top-left">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateEmpty();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Plus className="w-4 h-4" />
            <span>创建空子节点</span>
          </button>
          <div className="my-1 h-px bg-border" />
          {items.map((item) => (
            <button
              key={item.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
