"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Loader2, AlertCircle, Pencil, RefreshCw } from "lucide-react";
import type { Node, Session, Entry } from "@/types";
import { cn } from "@/lib/utils";

/**
 * 外层目录（Session TOC）：根 Session 列表，可展开递归显示段摘要。
 * 段摘要 = 紧随 fork entry 之后的 summary entry（数据层由 segments.ts 闭合段时生成）。
 * 点击根 Session 标题 / 段摘要行 → 回内层（onSelectSession / onEnterSummary）。
 * 视觉先不做：极简列表，仅折叠展开 + hover 高亮。
 */
interface SessionTOCProps {
  node: Node;
  /** 点击根 Session 标题 → 回内层该 Session */
  onSelectSession: (sessionId: string, title: string) => void;
  /** 点击段摘要行 → 回内层该段 */
  onEnterSummary?: (sessionId: string, entry: Entry) => void;
  /** 编辑段摘要 → 就地更新该 summary entry */
  onEditSummary?: (sessionId: string, entry: Entry, text: string) => void;
  /** 重新生成段摘要 → 复用该 summary entry 重新调用摘要生成 */
  onRegenerateSummary?: (sessionId: string, entry: Entry) => void;
}

/** 段级保底文本：段 = entries[0..end]（从上一个 fork entry 之后开始）。取段内最后一个带模型回复的 qa；无则取段内最后一个非 summary entry 的内容 */
function segmentFallbackText(session: Session, end: number): string {
  let start = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (session.entries[i].children.length > 0) {
      start = i + 1;
      break;
    }
  }
  for (let i = end; i >= start; i--) {
    const e = session.entries[i];
    if (e.type === "qa" && e.assistantOutput?.trim()) return e.assistantOutput.trim();
  }
  for (let i = end; i >= start; i--) {
    const e = session.entries[i];
    if (e.type === "summary") continue;
    const content = e.assistantOutput?.trim() || e.userInput?.trim();
    if (content) return content;
  }
  return "";
}

function SummaryLine({
  entry,
  sessionId,
  depth,
  fallback,
  onEnterSummary,
  onEditSummary,
  onRegenerateSummary,
}: {
  entry: Entry;
  sessionId: string;
  depth: number;
  fallback: string;
  onEnterSummary?: (sessionId: string, entry: Entry) => void;
  onEditSummary?: (sessionId: string, entry: Entry, text: string) => void;
  onRegenerateSummary?: (sessionId: string, entry: Entry) => void;
}) {
  const status = entry.summaryStatus;
  const streaming = status === "loading" || status === "streaming";
  const error = status === "error";
  const display = entry.userInput?.trim() || fallback;
  const label = streaming ? "正在总结…" : error ? display || "生成失败" : display || "（空摘要）";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(entry.userInput);

  const save = () => {
    const next = value.trim();
    if (next) onEditSummary?.(sessionId, entry, next);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="py-1 pr-2" style={{ paddingLeft: depth * 16 + 8 }}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
          className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div
      className="group flex w-full items-start gap-1.5 rounded-md py-1 pr-2 text-left text-sm leading-relaxed text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      style={{ paddingLeft: depth * 16 + 8 }}
      title={!streaming && !error && display ? display : undefined}
    >
      <button onClick={() => onEnterSummary?.(sessionId, entry)} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
        {streaming ? (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : error ? (
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <span className="shrink-0">📝</span>
        )}
        <span className="min-w-0 flex-1 leading-snug line-clamp-2">{label}</span>
      </button>
      {!streaming && (
        <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!error && (
            <button
              onClick={(e) => { e.stopPropagation(); setValue(entry.userInput); setEditing(true); }}
              className="p-0.5 rounded hover:bg-accent"
              title="编辑摘要"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onRegenerateSummary?.(sessionId, entry); }}
            className="p-0.5 rounded hover:bg-accent"
            title="重新生成"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

/** 无 summary entry 的 session 兜底行：展示保底文本，点击回内层该 session（无编辑/重新生成，因为没有对应 entry） */
function FallbackSummaryLine({ text, depth, onClick }: { text: string; depth: number; onClick: () => void }) {
  return (
    <div
      className="flex w-full items-start gap-1.5 rounded-md py-1 pr-2 text-left text-sm leading-relaxed text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      style={{ paddingLeft: depth * 16 + 8 }}
      title={text}
    >
      <button onClick={onClick} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
        <span className="shrink-0">📝</span>
        <span className="min-w-0 flex-1 leading-snug line-clamp-2">{text}</span>
      </button>
    </div>
  );
}

function SessionTOCNode({
  session,
  depth,
  expandedIds,
  onToggle,
  onSelectSession,
  onEnterSummary,
  onEditSummary,
  onRegenerateSummary,
}: {
  session: Session;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectSession: (sessionId: string, title: string) => void;
  onEnterSummary?: (sessionId: string, entry: Entry) => void;
  onEditSummary?: (sessionId: string, entry: Entry, text: string) => void;
  onRegenerateSummary?: (sessionId: string, entry: Entry) => void;
}) {
  const isExpanded = expandedIds.has(session.id);

  const body: ReactNode[] = [];
  for (let i = 0; i < session.entries.length; i++) {
    const entry = session.entries[i];
    if (entry.type === "summary") {
      body.push(
        <SummaryLine
          key={`summary-${session.id}-${i}`}
          entry={entry}
          sessionId={session.id}
          depth={depth + 1}
          fallback={segmentFallbackText(session, i)}
          onEnterSummary={onEnterSummary}
          onEditSummary={onEditSummary}
          onRegenerateSummary={onRegenerateSummary}
        />
      );
      continue;
    }
    if (entry.children.length > 0) {
      // fork 点：段摘要紧随其后（同一 session 下一索引），先渲染摘要再渲染子 Session
      const next = session.entries[i + 1];
      if (next && next.type === "summary") {
        body.push(
          <SummaryLine
            key={`summary-${session.id}-${i}-next`}
            entry={next}
            sessionId={session.id}
            depth={depth + 1}
            fallback={segmentFallbackText(session, i)}
            onEnterSummary={onEnterSummary}
            onEditSummary={onEditSummary}
            onRegenerateSummary={onRegenerateSummary}
          />
        );
        i++;
      } else {
        // 旧数据无 summary entry：用该段保底文本渲染摘要行（点击回内层 session）
        const fb = segmentFallbackText(session, i);
        if (fb) {
          body.push(
            <FallbackSummaryLine
              key={`fallback-${session.id}-${i}`}
              text={fb}
              depth={depth + 1}
              onClick={() => onSelectSession(session.id, session.title)}
            />
          );
        }
      }
      for (const child of entry.children) {
        body.push(
          <SessionTOCNode
            key={child.id}
            session={child}
            depth={depth + 1}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onSelectSession={onSelectSession}
            onEnterSummary={onEnterSummary}
            onEditSummary={onEditSummary}
            onRegenerateSummary={onRegenerateSummary}
          />
        );
      }
    }
  }

  // 无 summary entry 也无子会话时，用保底文本兜底显示一行，避免展开后空白
  if (body.length === 0) {
    const fb = segmentFallbackText(session, session.entries.length - 1);
    if (fb) {
      body.push(
        <FallbackSummaryLine
          key={`fallback-${session.id}`}
          text={fb}
          depth={depth + 1}
          onClick={() => onSelectSession(session.id, session.title)}
        />
      );
    }
  }

  return (
    <div className={depth === 0 ? "mb-2 rounded-lg border bg-card/40 p-2 transition-colors hover:border-primary/30" : ""}>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md transition-colors",
          depth === 0 ? "py-0.5 pr-2" : "py-0.5 pr-2 hover:bg-accent"
        )}
        style={{ paddingLeft: depth === 0 ? 0 : depth * 16 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(session.id);
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent"
          title={isExpanded ? "折叠" : "展开"}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
        </button>
        <button
          onClick={() => onSelectSession(session.id, session.title)}
          className={cn(
            "min-w-0 flex-1 truncate rounded px-1.5 py-0.5 text-left transition-colors",
            depth === 0 ? "text-base font-semibold" : "text-sm font-medium",
            "hover:bg-accent"
          )}
          title={session.title}
        >
          {session.title}
        </button>
      </div>
      {isExpanded && body.length > 0 && <div className={depth === 0 ? "mt-1 pb-0.5" : "pb-0.5"}>{body}</div>}
    </div>
  );
}

export function SessionTOC({ node, onSelectSession, onEnterSummary, onEditSummary, onRegenerateSummary }: SessionTOCProps) {
  // 默认展开所有根 Session 卡片的第一层（depth=0 → 显示段摘要），子分支保持折叠
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(node.sessions.map((s) => s.id))
  );

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="select-none">
      {node.sessions.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted-foreground">
          暂无会话，输入以创建第一个分支。
        </p>
      ) : (
        node.sessions.map((session) => (
          <SessionTOCNode
            key={session.id}
            session={session}
            depth={0}
            expandedIds={expandedIds}
            onToggle={toggle}
            onSelectSession={onSelectSession}
            onEnterSummary={onEnterSummary}
            onEditSummary={onEditSummary}
            onRegenerateSummary={onRegenerateSummary}
          />
        ))
      )}
    </div>
  );
}
