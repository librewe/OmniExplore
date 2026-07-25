"use client";

import { Search, ArrowRight } from "lucide-react";

interface OnboardingProps {
  recentTerms: string[];
  onTermClick: (term: string) => void;
  onSubmit: (term: string) => void;
}

export function Onboarding({ recentTerms, onTermClick, onSubmit }: OnboardingProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-8">
      <div className="max-w-md w-full text-center animate-fade-in">
        <div className="text-5xl mb-4">🌳</div>
        <h1 className="text-2xl font-bold mb-1">OmniExplore</h1>
        <p className="text-muted-foreground text-sm mb-8">
          沿着概念根系递归追问
        </p>

        <div className="relative mb-6">
          <input
            type="text"
            placeholder="输入概念，按回车探索…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const value = (e.target as HTMLInputElement).value.trim();
                if (value) onSubmit(value);
              }
            }}
            className="w-full h-11 rounded-lg border border-input bg-background px-4 pr-10 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            autoFocus
          />
          <ArrowRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>

        {recentTerms.length > 0 && (
          <div className="text-left">
            <p className="text-xs text-muted-foreground mb-2">最近探索</p>
            <div className="flex flex-wrap gap-1.5">
              {recentTerms.map((term) => (
                <button
                  key={term}
                  onClick={() => onTermClick(term)}
                  className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Search className="w-3 h-3" />
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
