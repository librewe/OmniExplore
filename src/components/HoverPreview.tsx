"use client";

import { useEffect, useState, useRef } from "react";
import { HOVER_PREVIEW_DELAY_MS } from "@/lib/constants";

interface HoverPreviewProps {
  term: string;
  preview: string | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
}

export function HoverPreview({ term, preview, anchorRect, onClose }: HoverPreviewProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!preview) return;
    timerRef.current = setTimeout(() => setVisible(true), HOVER_PREVIEW_DELAY_MS);
    return () => clearTimeout(timerRef.current);
  }, [preview, term]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = () => onClose();
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [visible, onClose]);

  if (!visible || !preview || !anchorRect) return null;

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
      className="animate-fade-in rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg"
    >
      <div className="font-medium text-primary mb-0.5">{term}</div>
      <div className="text-muted-foreground text-xs line-clamp-2">{preview}</div>
    </div>
  );
}
