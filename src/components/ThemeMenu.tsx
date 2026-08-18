"use client";

import { useState, useEffect, useRef } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

const OPTIONS: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "light", label: "亮色", icon: <Sun className="w-4 h-4" /> },
  { mode: "dark", label: "深色", icon: <Moon className="w-4 h-4" /> },
  { mode: "system", label: "跟随系统", icon: <Monitor className="w-4 h-4" /> },
];

export function ThemeMenu() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "system";
    const saved = localStorage.getItem("theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const dark = themeMode === "dark" || (themeMode === "system" && systemDark);
    const root = document.documentElement;
    const prevDark = root.classList.contains("dark");
    localStorage.setItem("theme", themeMode);
    if (prevDark === dark) return;
    root.classList.add("theme-transition-disable");
    const overlay = document.createElement("div");
    overlay.className = "theme-fade-overlay";
    overlay.style.cssText = `position:fixed;inset:0;z-index:9999;pointer-events:none;background-color:${getComputedStyle(document.body).backgroundColor};opacity:1;transition:opacity 0.5s ease;`;
    document.body.appendChild(overlay);
    root.classList.toggle("dark", dark);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove("theme-transition-disable");
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 550);
    }));
  }, [themeMode, systemDark]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const dark = themeMode === "dark" || (themeMode === "system" && systemDark);

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="主题"
      >
        {mounted && dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          {OPTIONS.map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => { setThemeMode(mode); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                themeMode === mode ? "bg-accent text-foreground font-medium" : "hover:bg-accent"
              )}
            >
              {icon}
              <span className="flex-1 text-left">{label}</span>
              {themeMode === mode && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
