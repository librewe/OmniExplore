"use client";

import { useRef, useEffect } from "react";

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function ContextMenuContent({ items, onClose }: { items: MenuItem[]; onClose?: () => void }) {
  return (
    <div className="min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
      {items.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose?.();
          }}
          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
            item.disabled
              ? "opacity-50 cursor-not-allowed"
              : item.danger
              ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
              : "hover:bg-accent focus:bg-accent"
          }`}
        >
          <span className="w-4 h-4 shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-50" style={{ left: x, top: y }}>
      <ContextMenuContent items={items} />
    </div>
  );
}
