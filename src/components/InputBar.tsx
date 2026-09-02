"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  tagLabel: string;
  fillValue?: string;
  tagPrefix?: string;
  placeholder?: string;
  /** 无 tag 时仍走 onCreateChild（而非 onFocus）——外层目录隐藏 tag 但输入仍是创建会话 */
  forceCreate?: boolean;
  wide?: boolean;
  onFocus?: (text: string) => void;
  onCreateChild?: (text: string) => void;
  disabled?: boolean;
}

export function InputBar({
  tagLabel,
  fillValue,
  tagPrefix,
  placeholder,
  forceCreate,
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
        if (tagLabel || forceCreate) {
          onCreateChild?.(trimmed);
        } else {
          onFocus?.(trimmed);
        }
        setValue("");
      }
    },
    [value, disabled, tagLabel, forceCreate, onFocus, onCreateChild]
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (tagLabel || forceCreate) {
      onCreateChild?.(trimmed);
    } else {
      onFocus?.(trimmed);
    }
    setValue("");
  }, [value, disabled, tagLabel, forceCreate, onFocus, onCreateChild]);

  return (
    <div className="bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-2 pb-6">
      <div className={cn("relative mx-auto transition-[max-width] duration-300 ease-in-out", wide ? "max-w-3xl" : "max-w-2xl")}>
        {tagLabel && (
          <div className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground mb-1.5">
            <CornerDownLeft className="w-3 h-3" />
            <span>{tagPrefix !== undefined ? tagPrefix : "追加到"} {tagLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl border border-input bg-card/90 shadow-lg backdrop-blur-sm pl-4 pr-1.5 py-1 transition-colors focus-within:ring-1 focus-within:ring-ring">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder ?? (tagLabel
              ? "输入内容，Ctrl+回车发送…"
              : "输入概念，按回车探索…")}
            className="omni-input-bar flex-1 h-9 bg-transparent text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
