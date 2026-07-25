"use client";

import { ExternalLink } from "lucide-react";
import { TermText } from "./TermText";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  termName: string;
  content: string | null;
  onTermDoubleClick?: (term: string) => void;
  onTermContextMenu?: (e: React.MouseEvent, term: string) => void;
}

export function PreviewPanel({
  termName,
  content,
  onTermDoubleClick,
  onTermContextMenu,
}: PreviewPanelProps) {
  return (
    <div className={cn("w-72 shrink-0 border-l bg-background flex flex-col")}>
      <div className="flex items-center px-4 py-2 border-b">
        <div className="flex items-center gap-1.5 min-w-0">
          <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-base font-medium">预览面板</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 whitespace-pre-wrap">
        {termName && (
          <p className="text-sm font-semibold text-primary mb-2">{termName}</p>
        )}
        {content ? (
          <TermText
            content={content}
            onTermDoubleClick={onTermDoubleClick}
            onTermContextMenu={onTermContextMenu}
            className="text-sm"
          />
        ) : (
            <p className="text-sm text-muted-foreground text-center pt-8">
              按 Esc 进入导图视图，点击节点 📋 图标查看详情
            </p>
        )}
      </div>
    </div>
  );
}
