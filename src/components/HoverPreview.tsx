"use client";

import { useEffect, useState, useRef } from "react";

interface HoverPreviewProps {
  term: string;
  preview: string | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HoverPreview({ term, preview, anchorRect, onClose, onMouseEnter, onMouseLeave }: HoverPreviewProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timerRef.current);
  }, [term]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [visible, onClose]);

  if (!visible || !anchorRect) return null;

  const display = preview || "双击跳转查看";

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(anchorRect.left, window.innerWidth - 280),
    top: anchorRect.bottom + 8,
    zIndex: 60,
    maxWidth: 260,
  };

  return (
    <div
      ref={ref}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="pointer-events-none animate-fade-in rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
    >
      {preview ? (
        <div className="text-muted-foreground text-xs line-clamp-1">{display}</div>
      ) : (
        <div className="text-muted-foreground text-xs">{display}</div>
      )}
    </div>
  );
}
