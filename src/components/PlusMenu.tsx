"use client";

import { Plus } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { PlusMenuItem } from "@/types";

interface PlusMenuProps {
  items: PlusMenuItem[];
  onSelect: (item: PlusMenuItem) => void;
  onCreateEmpty: () => void;
}

export function PlusMenu({ items, onSelect, onCreateEmpty }: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // 点在 + 按钮或菜单自身（portal 在 body 下）时不关闭，避免 click 无法派发到菜单项
      if (ref.current && ref.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    }
    // 树容器滚动时关闭，避免 fixed 菜单位置错位
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    cancelClose();
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setAnchor({ left: rect.left, top: rect.bottom });
    }
    setOpen(true);
  };

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setAnchor({ left: rect.left, top: rect.bottom });
    }
    setOpen(true);
  };

  return (
    <>
      <button
        ref={ref}
        onClick={toggle}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      {open && anchor && createPortal(
        <div
          ref={menuRef}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="fixed z-[100] mt-1 min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 origin-top-left"
          style={{ left: Math.min(anchor.left, window.innerWidth - 220), top: anchor.top }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateEmpty();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Plus className="w-4 h-4" />
            <span>新增上下文</span>
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
        </div>,
        document.body
      )}
    </>
  );
}
