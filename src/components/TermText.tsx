"use client";

import { memo, useCallback } from "react";
import { parseTerms } from "@/services/termParser";
import { cn } from "@/lib/utils";

interface TermTextProps {
  content: string;
  onTermDoubleClick?: (term: string) => void;
  onTermContextMenu?: (e: React.MouseEvent, term: string) => void;
  onTermHover?: (e: React.MouseEvent, term: string) => void;
  onTermLeave?: () => void;
  className?: string;
}

export const TermText = memo(function TermText({
  content,
  onTermDoubleClick,
  onTermContextMenu,
  onTermHover,
  onTermLeave,
  className,
}: TermTextProps) {
  const segments = parseTerms(content);

  const handleDoubleClick = useCallback(
    (term: string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      onTermDoubleClick?.(term);
    },
    [onTermDoubleClick]
  );

  const handleContextMenu = useCallback(
    (term: string) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onTermContextMenu?.(e, term);
    },
    [onTermContextMenu]
  );

  const handleMouseEnter = useCallback(
    (term: string) => (e: React.MouseEvent) => {
      onTermHover?.(e, term);
    },
    [onTermHover]
  );

  return (
    <span className={cn("text-sm leading-relaxed", className)}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.content}</span>;
        }
        return (
          <span
            key={i}
            className={cn(
              "term-underline",
              onTermDoubleClick && "cursor-pointer"
            )}
            onDoubleClick={handleDoubleClick(seg.content)}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.stopPropagation();
                onTermDoubleClick?.(seg.content);
              }
            }}
            onContextMenu={handleContextMenu(seg.content)}
            onMouseEnter={handleMouseEnter(seg.content)}
            onMouseLeave={onTermLeave}
          >
            {seg.content}
          </span>
        );
      })}
    </span>
  );
});
