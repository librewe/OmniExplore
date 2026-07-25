"use client";

import { ChevronRight, Footprints } from "lucide-react";
import type { CognitionPath } from "@/types";
import { cn } from "@/lib/utils";

interface FootprintPanelProps {
  path: CognitionPath;
  onNavigate: (index: number) => void;
}

export function FootprintPanel({ path, onNavigate }: FootprintPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Footprints className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">认知足迹</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {path.nodes.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-4 text-center">
            在此追踪你的认知路径
          </p>
        ) : (
          <div className="space-y-0.5">
            {path.nodes.map((node, i) => {
              const isActive = i === path.current_index;
              const isPast = i < path.current_index;
              return (
                <button
                  key={`${node.node_id}-${i}`}
                  onClick={() => onNavigate(i)}
                  className={cn(
                    "flex items-center gap-1 w-full rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : isPast
                      ? "text-muted-foreground hover:bg-accent"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="truncate flex-1">{node.term}</span>
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
