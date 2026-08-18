"use client";

import { memo } from "react";
import { encodeTerms, encodeWithTermList } from "@/services/termParser";
import { useNodeList } from "@/lib/NodeListContext";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { cn } from "@/lib/utils";

interface TermTextProps {
  content: string;
  onTermDoubleClick?: (term: string) => void;
  onTermContextMenu?: (e: React.MouseEvent, term: string) => void;
  onTermHover?: (e: React.MouseEvent, term: string) => void;
  onTermLeave?: () => void;
  onFileLink?: (filename: string) => void;
  className?: string;
}

export const TermText = memo(function TermText({
  content,
  onTermDoubleClick,
  onTermContextMenu,
  onTermHover,
  onTermLeave,
  onFileLink,
  className,
}: TermTextProps) {
  const termList = useNodeList();
  const encoded = termList.length ? encodeWithTermList(content, termList) : encodeTerms(content);

  return (
    <span className={cn("text-sm leading-relaxed", className)}>
      <MarkdownRenderer
        content={encoded}
        inline
        onFileLink={onFileLink}
        onTermDoubleClick={onTermDoubleClick}
        onTermContextMenu={onTermContextMenu}
        onTermHover={onTermHover}
        onTermLeave={onTermLeave}
      />
    </span>
  );
});
