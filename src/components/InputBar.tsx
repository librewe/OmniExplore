"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  tagLabel: string;
  fillValue?: string;
  tagPrefix?: string;
  wide?: boolean;
  onFocus?: (text: string) => void;
  onCreateChild?: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({
  tagLabel,
  fillValue,
  tagPrefix,
  wide,
  onFocus,
  onCreateChild,
  disabled,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fillValue !== undefined && fillValue !== null) {
      setValue(fillValue);
      inputRef.current?.focus();
    }
  }, [fillValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const trimmed = value.trim();
      if (!trimmed || disabled) return;

      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onCreateChild?.(trimmed);
        setValue("");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (tagLabel) {
          onCreateChild?.(trimmed);
        } else {
          onFocus?.(trimmed);
        }
        setValue("");
      }
    },
    [value, disabled, tagLabel, onFocus, onCreateChild]
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (tagLabel) {
      onCreateChild?.(trimmed);
    } else {
      onFocus?.(trimmed);
    }
    setValue("");
  }, [value, disabled, tagLabel, onFocus, onCreateChild]);

  return (
    <div className="bg-background px-4 pt-2 pb-4">
      <div className={cn("relative mx-auto transition-[max-width] duration-300 ease-in-out", wide ? "max-w-3xl" : "max-w-2xl")}>
        {tagLabel && (
          <div className="inline-flex items-center gap-1 rounded-t-md bg-primary/10 text-primary px-2 py-0.5 text-xs mb-1">
            <CornerDownLeft className="w-3 h-3" />
            <span>{tagPrefix !== undefined ? tagPrefix : "追加到"} {tagLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={
              tagLabel
                ? "输入内容，Ctrl+回车发送…"
                : "输入概念，按回车探索…"
            }
            className="omni-input-bar flex-1 h-10 rounded-2xl border border-input bg-transparent px-5 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
