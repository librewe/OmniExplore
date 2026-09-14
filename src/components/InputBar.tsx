"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Send, CornerDownLeft, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** 多行输入最大高度（px），超过后内部滚动 */
const MAX_INPUT_HEIGHT = 180;

export type InputStartMode = "ask" | "scratch";

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
  showModeSwitch?: boolean;
  modelLabel?: string;
  notePlaceholder?: string;
  onCreateNote?: (text: string) => void;
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
  showModeSwitch,
  modelLabel,
  notePlaceholder,
  onCreateNote,
}: InputBarProps) {
  const [value, setValue] = useState("");
  const [startMode, setStartMode] = useState<InputStartMode>("ask");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modeAnchor, setModeAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);

  const isScratch = !!showModeSwitch && startMode === "scratch";

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, []);

  // 程序化填充（划词追问/加号预设等）才回填并聚焦；目标切换清空草稿由父层 key remount 承担
  useEffect(() => {
    if (fillValue) {
      setValue(fillValue);
      inputRef.current?.focus();
    }
  }, [fillValue]);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (modeBtnRef.current?.contains(target)) return;
      if (modeMenuRef.current?.contains(target)) return;
      setModeMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModeMenuOpen(false);
    }
    function handleScroll() {
      setModeMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [modeMenuOpen]);

  const toggleModeMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (modeMenuOpen) {
        setModeMenuOpen(false);
        return;
      }
      const rect = modeBtnRef.current?.getBoundingClientRect();
      if (rect) setModeAnchor({ left: rect.left, bottom: window.innerHeight - rect.top });
      setModeMenuOpen(true);
    },
    [modeMenuOpen]
  );

  const selectMode = useCallback((mode: InputStartMode) => {
    setStartMode(mode);
    setModeMenuOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      if (e.nativeEvent.isComposing) return;
      // Shift+Enter：插入换行（保留默认行为）
      if (e.shiftKey) return;
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || disabled) return;
      if (isScratch) {
        onCreateNote?.(trimmed);
      } else if (e.ctrlKey || e.metaKey || tagLabel || forceCreate) {
        onCreateChild?.(trimmed);
      } else {
        onFocus?.(trimmed);
      }
      setValue("");
    },
    [value, disabled, isScratch, onCreateNote, tagLabel, forceCreate, onFocus, onCreateChild]
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    if (isScratch) {
      onCreateNote?.(trimmed);
    } else if (tagLabel || forceCreate) {
      onCreateChild?.(trimmed);
    } else {
      onFocus?.(trimmed);
    }
    setValue("");
  }, [value, disabled, isScratch, onCreateNote, tagLabel, forceCreate, onFocus, onCreateChild]);

  const resolvedPlaceholder = isScratch
    ? notePlaceholder ?? "写下一条笔记…"
    : placeholder ?? (tagLabel ? "输入内容，Shift+Enter 换行…" : "输入概念，按回车探索…");

  return (
    <div className="bg-gradient-to-t from-background via-background/75 to-transparent px-4 pt-2 pb-6">
      <div className={cn("relative mx-auto transition-[max-width] duration-300 ease-in-out", wide ? "max-w-3xl" : "max-w-2xl")}>
        {tagLabel && (
          <div className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground mb-1.5">
            <CornerDownLeft className="w-3 h-3" />
            <span>{tagPrefix !== undefined ? tagPrefix : "追加到"} {tagLabel}</span>
          </div>
        )}
        <div className="rounded-[20px] border border-input bg-card/90 shadow-lg backdrop-blur-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
          <textarea
            ref={inputRef}
            rows={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={resolvedPlaceholder}
            className="omni-input-bar block w-full resize-none overflow-y-auto bg-transparent px-4 pt-3 pb-1 text-base leading-snug placeholder:text-muted-foreground focus-visible:outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between px-3 pb-2">
            {showModeSwitch ? (
              <button
                ref={modeBtnRef}
                onClick={toggleModeMenu}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <span className="max-w-[180px] truncate">{isScratch ? "From scratch" : modelLabel || "Ask"}</span>
                <ChevronDown className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <span className="text-sm text-muted-foreground select-none">Placeholder · Press</span>
            )}
            <button
              onClick={handleSend}
              disabled={disabled || !value.trim()}
              className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {showModeSwitch && modeMenuOpen && modeAnchor && createPortal(
        <div
          ref={modeMenuRef}
          className="fixed z-[100] mb-1 min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 origin-bottom-left"
          style={{ left: modeAnchor.left, bottom: modeAnchor.bottom }}
        >
          <button
            onClick={() => selectMode("ask")}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
              !isScratch && "bg-accent/60"
            )}
          >
            <span className="truncate">{modelLabel || "Ask"}</span>
            {!isScratch && <Check className="w-3.5 h-3.5 shrink-0" />}
          </button>
          <button
            onClick={() => selectMode("scratch")}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
              isScratch && "bg-accent/60"
            )}
          >
            <span>new session from scratch</span>
            {isScratch && <Check className="w-3.5 h-3.5 shrink-0" />}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
