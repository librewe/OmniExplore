"use client";

import { memo } from "react";
import { encodeTerms, encodeWithTermList } from "@/services/termParser";
import { useNodeList } from "@/lib/NodeListContext";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { cn } from "@/lib/utils";

interface TermTextProps {
  content: string;
  onTermClick?: (term: string) => void;
  onTermHover?: (e: React.MouseEvent, term: string) => void;
  onTermLeave?: () => void;
  onFileLink?: (filename: string) => void;
  className?: string;
}

export const TermText = memo(function TermText({
  content,
  onTermClick,
  onTermHover,
  onTermLeave,
  onFileLink,
  className,
}: TermTextProps) {
  const termList = useNodeList();
  const encoded = termList.length ? encodeWithTermList(content, termList) : encodeTerms(content);

  return (
    <span className={cn("text-base", className, "leading-[1.8]")}>
      <MarkdownRenderer
        content={encoded}
        inline
        onFileLink={onFileLink}
        onTermClick={onTermClick}
        onTermHover={onTermHover}
        onTermLeave={onTermLeave}
      />
    </span>
  );
});
