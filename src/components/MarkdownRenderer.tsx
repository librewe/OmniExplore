"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
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
  const comps = {
    code: CodeBlock,
    p: inline ? InlineP : BlockP,
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
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={comps as unknown as Record<string, React.ComponentType<Record<string, unknown>>>}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}
