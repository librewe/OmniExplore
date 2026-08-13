"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
  onFileLink?: (filename: string) => void;
}

function InlineP({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

function BlockP({ children, ...props }: Record<string, unknown>) {
  return <p className="mb-1 last:mb-0" {...props}>{children as React.ReactNode}</p>;
}

function CodeBlock({ className: codeClass, children, ...props }: Record<string, unknown>) {
  const isInline = !codeClass;
  if (isInline) {
    return <code className="bg-muted rounded px-1 py-0.5 text-xs" {...props}>{children as React.ReactNode}</code>;
  }
  return <code className={codeClass as string} {...props}>{children as React.ReactNode}</code>;
}

export function MarkdownRenderer({ content, className, inline, onFileLink }: MarkdownRendererProps) {
  const comps: Record<string, React.ComponentType<Record<string, unknown>>> = {
    code: CodeBlock,
    p: inline ? InlineP : BlockP,
    h1: ({ children, ...p }: Record<string, unknown>) => <h1 className="text-lg font-bold mt-3 mb-1" {...p}>{children as React.ReactNode}</h1>,
    h2: ({ children, ...p }: Record<string, unknown>) => <h2 className="text-base font-bold mt-2 mb-1" {...p}>{children as React.ReactNode}</h2>,
    h3: ({ children, ...p }: Record<string, unknown>) => <h3 className="text-sm font-bold mt-2 mb-0.5" {...p}>{children as React.ReactNode}</h3>,
    table: ({ children, ...p }: Record<string, unknown>) => <div className="overflow-x-auto my-2"><table className="min-w-full border-collapse border border-border text-xs" {...p}>{children as React.ReactNode}</table></div>,
    thead: ({ children, ...p }: Record<string, unknown>) => <thead className="bg-muted/50" {...p}>{children as React.ReactNode}</thead>,
    th: ({ children, ...p }: Record<string, unknown>) => <th className="border border-border px-2 py-1 text-left font-medium" {...p}>{children as React.ReactNode}</th>,
    td: ({ children, ...p }: Record<string, unknown>) => <td className="border border-border px-2 py-1" {...p}>{children as React.ReactNode}</td>,
    a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => {
      if (href?.startsWith("./files/")) {
        return (
          <span className="text-primary underline cursor-pointer" onClick={(e) => { e.preventDefault(); onFileLink?.(href.replace("./files/", "")); }}>
            {children}
          </span>
        );
      }
      return <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline" {...props}>{children}</a>;
    },
  };

  return (
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={comps as unknown as Record<string, React.ComponentType<Record<string, unknown>>>}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}
