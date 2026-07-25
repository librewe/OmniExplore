"use client";

import { Switch } from "@/components/ui/switch";
import type { ViewMode } from "@/types";

interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export function ViewToggle({ mode, onChange }: ViewToggleProps) {
  const isMacro = mode === "macro";

  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs font-medium transition-colors ${!isMacro ? "text-primary" : "text-muted-foreground"}`}>
        微观
      </span>
      <Switch
        checked={isMacro}
        onCheckedChange={(checked) => onChange(checked ? "macro" : "micro")}
      />
      <span className={`text-xs font-medium transition-colors ${isMacro ? "text-primary" : "text-muted-foreground"}`}>
        宏观
      </span>
    </div>
  );
}
