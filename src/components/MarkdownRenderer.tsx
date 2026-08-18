"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "@/lib/utils";
import { TERM_EXPLICIT_START, TERM_EXPLICIT_END, TERM_FREE_START, TERM_FREE_END } from "@/services/termParser";

export interface TermHandlers {
  onTermDoubleClick?: (term: string) => void;
  onTermContextMenu?: (e: React.MouseEvent, term: string) => void;
  onTermHover?: (e: React.MouseEvent, term: string) => void;
  onTermLeave?: () => void;
}

interface MarkdownRendererProps extends TermHandlers {
  content: string;
  className?: string;
  inline?: boolean;
  onFileLink?: (filename: string) => void;
}

const TOKEN_RE = /[\uE000\uE002]([^\uE000\uE001\uE002\uE003]+)[\uE001\uE003]/g;

function InlineP({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

function BlockP({ children, ...props }: Record<string, unknown>) {
  return <p className="mb-1 last:mb-0" {...props}>{children as React.ReactNode}</p>;
}

function decodeSegment(text: string, handlers: TermHandlers, isCode: boolean): React.ReactNode {
  if (!text.includes(TERM_EXPLICIT_START) && !text.includes(TERM_FREE_START)) return text;
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const term = m[1];
    const isExplicit = m[0][0] === TERM_EXPLICIT_START;
    if (isCode) {
      out.push(isExplicit ? `[[${term}]]` : term);
    } else {
      out.push(
        <span
          key={key++}
          className="term-underline"
          onDoubleClick={(e) => { e.stopPropagation(); handlers.onTermDoubleClick?.(term); }}
          onClick={(e) => { if (e.ctrlKey || e.metaKey) { e.stopPropagation(); handlers.onTermDoubleClick?.(term); } }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); handlers.onTermContextMenu?.(e, term); }}
          onMouseEnter={(e) => handlers.onTermHover?.(e, term)}
          onMouseLeave={() => handlers.onTermLeave?.()}
        >
          {term}
        </span>
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  if (out.length === 1 && typeof out[0] === "string") return out[0];
  return out;
}

function decorateChildren(children: React.ReactNode, handlers: TermHandlers, isCode: boolean): React.ReactNode {
  if (typeof children === "string") return decodeSegment(children, handlers, isCode);
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <React.Fragment key={i}>{decorateChildren(child, handlers, isCode)}</React.Fragment>
    ));
  }
  if (React.isValidElement(children)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode; node?: { tagName?: string } }>;
    const childIsCode = isCode || el.props.node?.tagName === "code" || el.props.node?.tagName === "pre";
    if (el.props.children != null) {
      return React.cloneElement(el, { children: decorateChildren(el.props.children, handlers, childIsCode) });
    }
    return el;
  }
  return children;
}

export function MarkdownRenderer({
  content, className, inline, onFileLink,
  onTermDoubleClick, onTermContextMenu, onTermHover, onTermLeave,
}: MarkdownRendererProps) {
  const handlers = useMemo<TermHandlers>(
    () => ({ onTermDoubleClick, onTermContextMenu, onTermHover, onTermLeave }),
    [onTermDoubleClick, onTermContextMenu, onTermHover, onTermLeave]
  );

  const comps = useMemo(() => {
    const leaf = (tag: string, cls?: string): React.ComponentType<Record<string, unknown>> =>
      ({ children, ...props }: Record<string, unknown>) =>
        React.createElement(tag, { className: cls, ...props }, decorateChildren(children as React.ReactNode, handlers, false));

    return {
      code: ({ className: codeClass, children, ...props }: Record<string, unknown>) => {
        const isInline = !codeClass;
        return React.createElement(
          "code",
          { className: isInline ? "bg-muted rounded px-1 py-0.5 text-xs" : codeClass, ...props },
          decorateChildren(children as React.ReactNode, handlers, true)
        );
      },
      p: ({ children, ...props }: Record<string, unknown>) =>
        inline
          ? React.createElement(InlineP, props, decorateChildren(children as React.ReactNode, handlers, false))
          : React.createElement(BlockP, props, decorateChildren(children as React.ReactNode, handlers, false)),
      h1: leaf("h1", "text-lg font-bold mt-3 mb-1"),
      h2: leaf("h2", "text-base font-bold mt-2 mb-1"),
      h3: leaf("h3", "text-sm font-bold mt-2 mb-0.5"),
      h4: leaf("h4", "text-sm font-bold mt-2 mb-0.5"),
      h5: leaf("h5", "text-sm font-bold mt-1 mb-0.5"),
      h6: leaf("h6", "text-xs font-bold mt-1 mb-0.5"),
      li: leaf("li"),
      ul: leaf("ul", "list-disc pl-5 my-1"),
      ol: leaf("ol", "list-decimal pl-5 my-1"),
      blockquote: leaf("blockquote", "border-l-2 border-muted pl-3 my-1 text-muted-foreground"),
      strong: ({ children, ...props }: Record<string, unknown>) =>
        React.createElement("strong", props, decorateChildren(children as React.ReactNode, handlers, false)),
      em: ({ children, ...props }: Record<string, unknown>) =>
        React.createElement("em", props, decorateChildren(children as React.ReactNode, handlers, false)),
      del: ({ children, ...props }: Record<string, unknown>) =>
        React.createElement("del", props, decorateChildren(children as React.ReactNode, handlers, false)),
      a: ({ href, children, ...props }: { href?: string; children?: React.ReactNode }) => {
        if (href?.startsWith("./files/")) {
          return (
            <span className="text-primary underline cursor-pointer" onClick={(e) => { e.preventDefault(); onFileLink?.(href.replace("./files/", "")); }}>
              {decorateChildren(children, handlers, false)}
            </span>
          );
        }
        return React.createElement("a", { href, target: "_blank", rel: "noopener noreferrer", className: "text-primary underline", ...props },
          decorateChildren(children, handlers, false));
      },
      table: ({ children, ...props }: Record<string, unknown>) =>
        React.createElement(
          "div",
          { className: "overflow-x-auto my-2" },
          React.createElement("table", { className: "min-w-full border-collapse border border-border text-xs", ...props },
            decorateChildren(children as React.ReactNode, handlers, false))
        ),
      thead: leaf("thead", "bg-muted/50"),
      tbody: leaf("tbody"),
      tr: leaf("tr"),
      th: leaf("th", "border border-border px-2 py-1 text-left font-medium"),
      td: leaf("td", "border border-border px-2 py-1"),
      pre: ({ children, ...props }: Record<string, unknown>) =>
        React.createElement("pre", props, decorateChildren(children as React.ReactNode, handlers, true)),
    };
  }, [inline, onFileLink, handlers]);

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
