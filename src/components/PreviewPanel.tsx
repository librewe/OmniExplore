"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewPanelProps {
  nodeName: string;
  content: string | null;
}

export function PreviewPanel({ nodeName, content }: PreviewPanelProps) {
  return (
    <div className={cn("shrink-0 border-l bg-background flex flex-col h-full")}>
      <div className="flex items-center px-4 h-10 border-b">
        <div className="flex items-center gap-1.5 min-w-0">
          <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">预览面板</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 whitespace-pre-wrap">
        {nodeName && (
          <p className="text-sm font-semibold text-primary mb-2">{nodeName}</p>
        )}
        {content ? (
          <p className="text-sm leading-relaxed">{content}</p>
        ) : (
          <p className="text-sm text-muted-foreground text-center pt-8">
            按 Esc 进入组合视图，点击节点 📋 图标查看详情
          </p>
        )}
      </div>
    </div>
  );
}
