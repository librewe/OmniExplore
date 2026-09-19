"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronRight, Loader2, AlertCircle, GitBranch, Pencil, RefreshCw, Copy, Undo2 } from "lucide-react";
import type { Node, Session, Entry, NodeStatus, PlusMenuItem } from "@/types";
import { TermText } from "./TermText";
import { PlusMenu } from "./PlusMenu";
import { cn } from "@/lib/utils";
import { rememberEntryScroll, readEntryScroll } from "@/services/scrollMemory";

/** 层级粘滞滚动：行秩连续计数（Node=0 → 根 Session=1 → 其 entry=2 → 子 Session=3 …），sticky top = 行秩 × ROW_H。ROW_H 与实测行高一致（约 30px），粘滞时行间紧贴、互不遮挡、无缝隙透出 */
const ROW_H = 30;
/** 吸顶行统一层叠级：DOM 靠后的行盖住前行投下的行底阴影，阴影只落在内容上、不落在行间 */
const STICKY_Z = 20;
const STICKY_BG_SELECTED = "hsl(var(--accent))";
/** 父链弱高亮背景：不透明极淡蓝（95% 背景色 + 5% primary，亮度高于选中行的 accent 底色），避免粘滞滚动时半透明透底 */
const STICKY_BG_ANCESTOR = "color-mix(in srgb, hsl(var(--background)) 95%, hsl(var(--primary)) 5%)";
const EDITOR_MAX_H = 360;

function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, EDITOR_MAX_H)}px`;
  el.style.overflowY = el.scrollHeight > EDITOR_MAX_H ? "auto" : "hidden";
}

interface EntryRowProps {
  entry: Entry;
  session: Session;
  depth: number;
  isSelected: boolean;
  isAncestor: boolean;
  children?: React.ReactNode;
  isEditing: boolean;
  isEditable: boolean;
  onToggleExpand: (session: Session, entry: Entry) => void;
  onSelect: (entry: Entry | null) => void;
  onContextMenu: (e: React.MouseEvent, session: Session, entry: Entry) => void;
  onFork: (session: Session, entry: Entry) => void;
  onEditEntry: (session: Session, entry: Entry) => void;
  onCopyEntry: (entry: Entry) => void;
  onEditSubmit: (session: Session, entry: Entry) => void;
  onEditingChange: (session: Session, entry: Entry, value: string) => void;
  onSelectionContextMenu: (selectedText: string, entry: Entry, rect: { left: number; bottom: number }) => void;
  onTermClick: (term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onFileLink?: (filename: string) => void;
  onEditSummary?: (session: Session, entry: Entry, text: string) => void;
  onRegenerateSummary?: (session: Session, entry: Entry) => void;
  /** 粘滞行秩偏移：内层模式（无 Node 顶行）传 1，所有 sticky top 计算减去该行秩 */
  stickyRankOffset?: number;
}

const STATUS_ICONS: Record<NodeStatus, React.ReactNode> = {
  idle: <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />,
  loading: <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />,
  streaming: <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />,
  done: null,
  error: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
};

/** 判断 targetSession/targetEntry 是否位于 session 的子树中（含直接子 Session / 直接 entry） */
function subtreeContains(session: Session, targetSession: Session | null, targetEntry: Entry | null): boolean {
  if (!targetSession && !targetEntry) return false;
  if (targetEntry && session.entries.includes(targetEntry)) return true;
  if (targetSession && session.entries.some((e) => e.children.includes(targetSession))) return true;
  return session.entries.some((e) => e.children.some((c) => subtreeContains(c, targetSession, targetEntry)));
}

function EntryRow({
  entry, session, depth, isSelected, isAncestor, isEditing, isEditable, children,
  onToggleExpand, onSelect, onContextMenu, onFork,
  onEditEntry, onCopyEntry, onEditSubmit, onEditingChange,
  onSelectionContextMenu, onTermClick, onTermHover, onTermLeave, onFileLink,
  onEditSummary, onRegenerateSummary, stickyRankOffset,
}: EntryRowProps) {
  const isSummary = entry.type === "summary";
  const summaryLoading = isSummary && (entry.summaryStatus === "loading" || entry.summaryStatus === "streaming");
  // 段摘要：生成中（loading/streaming）强制展开确保可见；已有内容时尊重用户手动折叠/展开
  const isExpanded = entry.expanded || summaryLoading || (isSummary && entry.summaryStatus === "error");
  const isStreaming = entry.status === "streaming" || entry.status === "loading";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  // 长内容滚动盒：done 才限高；由流式转完成时锚到顶部，其余挂载恢复该 entry 的记忆 scrollTop
  const scrollBoxRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(isStreaming);
  const scrollCapped =
    isExpanded && !isSummary && !isEditing && !isStreaming && (entry.type === "note" || !!entry.assistantOutput);

  // 内容溢出（出现内滚）时才启用底缘淡出 mask
  const [boxOverflow, setBoxOverflow] = useState(false);
  useEffect(() => {
    const el = scrollBoxRef.current;
    if (!scrollCapped || !el) {
      setBoxOverflow(false);
      return;
    }
    const measure = () => {
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      setBoxOverflow((prev) => (prev === overflowing ? prev : overflowing));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollCapped, entry, isExpanded]);

  useLayoutEffect(() => {
    const el = scrollBoxRef.current;
    if (!el) return;
    if (!scrollCapped) {
      prevStreamingRef.current = isStreaming;
      return;
    }
    if (prevStreamingRef.current && !isStreaming) {
      el.scrollTop = 0;
      rememberEntryScroll(entry, el.scrollTop);
    } else {
      el.scrollTop = readEntryScroll(entry);
    }
    prevStreamingRef.current = isStreaming;
  }, [scrollCapped, isStreaming, entry, isExpanded]);

  // 进入编辑态时把编辑框按内容增高并滚入视野（如新增上下文自动编辑）
  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (el) autoGrowTextarea(el);
    el?.scrollIntoView({ block: "nearest" });
  }, [isEditing]);

  const rowRank = depth * 2 - (stickyRankOffset ?? 0);
  // 段摘要属于 fork entry 的内容附属行：不参与粘滞，避免与所属 entry 同 rank 同 top 吸顶时盖在 entry 粘滞行之上
  const rowStyle: React.CSSProperties = isSummary
    ? { backgroundColor: isSelected ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : undefined),
        boxShadow: "0 2px 5px -3px hsl(var(--foreground) / 0.18)",
      }
    : {
        position: "sticky",
        top: rowRank * ROW_H,
        zIndex: STICKY_Z,
        backgroundColor: isSelected ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : undefined),
        boxShadow: "0 2px 5px -2px hsl(var(--foreground) / 0.18)",
      };

  const firstLine = entry.userInput.split("\n")[0];
  const truncatedTitle = isSummary
    ? "段摘要"
    : entry.type === "note" && !entry.userInput
      ? "(双击或右键编辑)"
      : firstLine.slice(0, 30) + (firstLine.length > 30 ? "…" : "");

  return (
    <div className="relative select-none">
      {/* entry 左侧引导线：贴行左缘，从行中点（15px）开始向下延伸到子内容底部；zIndex 低于 sticky 行（行背景盖住行上部分，行上不显示），内容区域可见。统一浅灰色，不随选中变色 */}
      <div
        className="absolute left-0 top-[15px] bottom-0 w-px pointer-events-none"
        style={{ zIndex: 1, backgroundColor: "hsl(var(--border))" }}
      />
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", isSummary ? "hover:bg-muted/50" : "tree-row-sticky-surface", isSelected && "tree-node-selected")}
        style={rowStyle}
        onClick={(e) => { e.stopPropagation(); onSelect(entry); }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(".term-underline")) return;
          if (!entry.expanded) onToggleExpand(session, entry);
          if (isSummary && !summaryLoading) setEditingSummary(true);
          else if (isEditable) onEditEntry(session, entry);
        }}
        onContextMenu={(e) => { onSelect(entry); onContextMenu(e, session, entry); }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <div className="shrink-0 w-3 mt-0.5" />
          {(entry.assistantOutput !== null || entry.type === "note" || isSummary || isStreaming) ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors">
              {isExpanded ? (
                <svg className="w-3.5 h-3.5 text-muted-foreground rotate-90 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              ) : STATUS_ICONS[entry.status || "idle"] || <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : <span className="w-[22px] shrink-0" />}
          <span className={cn("text-base truncate shrink-0", isSelected && "text-primary")}>{(entry.type === "note" || entry.type === "summary") ? "📝" : "💬"} {truncatedTitle}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 flex items-center gap-0.5">
            {!isSummary && !isStreaming && (
              <button onClick={(e) => { e.stopPropagation(); onEditEntry(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors" title="撤回（复原输入重新提交）"><Undo2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
            )}
            {!isSummary && (
              <button onClick={(e) => { e.stopPropagation(); onCopyEntry(entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors" title="复制"><Copy className="w-3.5 h-3.5 text-muted-foreground" /></button>
            )}
            {isSummary && !summaryLoading && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setEditingSummary(true); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors" title="编辑摘要"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRegenerateSummary?.(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors" title="重新生成"><RefreshCw className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </>
            )}
            {!isSummary && (
              <button onClick={(e) => { e.stopPropagation(); onFork(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm hover:bg-accent transition-colors" title="从此处分支"><GitBranch className="w-3.5 h-3.5 text-muted-foreground" /></button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (entry.assistantOutput || entry.type === "note" || isSummary || isStreaming) && (
        <div ref={scrollBoxRef}
          className={cn("ml-0 py-1 select-text", scrollCapped && "overflow-y-auto max-h-[60vh]", scrollCapped && boxOverflow && "entry-fade-mask")}
          style={{ paddingLeft: 20, paddingRight: 20 }}
          onScroll={scrollCapped ? (e) => rememberEntryScroll(entry, e.currentTarget.scrollTop) : undefined}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest(".term-underline")) return;
            if (isSummary && !summaryLoading) { setEditingSummary(true); return; }
            if (isEditable) onEditEntry(session, entry);
          }}
          onMouseUp={(e) => {
            if (e.button !== 0) return;
            if (e.detail >= 2 && (isEditable || isSummary)) return;
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
              const range = window.getSelection()?.getRangeAt(0);
              const rect = range?.getBoundingClientRect();
              if (rect && (rect.width > 0 || rect.height > 0)) {
                onSelectionContextMenu(sel, entry, { left: rect.left, bottom: rect.bottom });
              }
            }
          }}
        >
          {isEditing ? (
            <div className="space-y-1">
              <textarea ref={textareaRef} defaultValue={entry.userInput}
                onKeyDown={(e) => {
                  const el = e.target as HTMLTextAreaElement;
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { onEditingChange(session, entry, el.value); onEditSubmit(session, entry); }
                  if (e.key === "Escape") { onEditingChange(session, entry, entry.userInput); onEditSubmit(session, entry); }
                }}
                onFocus={(e) => { const el = e.target as HTMLTextAreaElement; el.setSelectionRange(el.value.length, el.value.length); }}
                onInput={(e) => autoGrowTextarea(e.currentTarget)}
                onBlur={(e) => { onEditingChange(session, entry, e.target.value); onEditSubmit(session, entry); }}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden" placeholder="输入内容…" autoFocus />
              <p className="text-xs text-muted-foreground">Ctrl+Enter 保存，Esc 取消</p>
            </div>
          ) : (
            <>
              {entry.type !== "note" && entry.type !== "summary" && (
                <div className="mb-1 rounded-lg bg-muted/50 px-3 py-1">
                  <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
                </div>
              )}
              {entry.reasoning ? (
                <div className="mb-2">
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <svg className={cn("w-3.5 h-3.5 transition-transform", showReasoning && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                    <span>思考过程</span>
                    {isStreaming && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                  </button>
                  {showReasoning && (
                    <div className="mt-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <TermText content={entry.reasoning} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-sm text-muted-foreground" />
                    </div>
                  )}
                </div>
              ) : null}
              {isSummary ? (
                editingSummary ? (
                  <div className="space-y-1">
                    <textarea defaultValue={entry.userInput}
                      onKeyDown={(e) => {
                        const el = e.target as HTMLTextAreaElement;
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { onEditSummary?.(session, entry, el.value); setEditingSummary(false); }
                        if (e.key === "Escape") setEditingSummary(false);
                      }}
                      onBlur={(e) => { onEditSummary?.(session, entry, e.target.value); setEditingSummary(false); }}
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y" placeholder="输入摘要…" autoFocus />
                    <p className="text-xs text-muted-foreground">Ctrl+Enter 保存，Esc 取消</p>
                  </div>
                ) : entry.summaryStatus === "error" ? (
                  <div className="flex items-start gap-1.5 text-sm text-destructive">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{entry.errorMessage || "摘要生成失败"}</span>
                  </div>
                ) : entry.userInput ? (
                  <div className="flex items-start gap-1.5">
                    <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-muted-foreground" />
                    {summaryLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0 mt-0.5" />}
                  </div>
                ) : summaryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                    <span>正在总结…</span>
                  </div>
                ) : (
                  <div className="text-sm italic text-muted-foreground">（空摘要）</div>
                )
              ) : entry.assistantOutput ? (
                <TermText content={entry.assistantOutput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
              ) : isStreaming ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.4s]" /></span>正在思考…</div>
              ) : entry.type === "note" ? (
                <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
              ) : <span className="text-sm text-muted-foreground italic">点击展开以探索 →</span>}
              {entry.status === "error" && entry.errorMessage && <div className="text-xs text-destructive mt-1">{entry.errorMessage}</div>}
            </>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

interface SharedHandlers {
  selectedEntry: Entry | null;
  selectedSession: Session | null;
  onSelectSession: (session: Session | null) => void;
  onToggleExpand: (session: Session, entry: Entry) => void;
  onSelect: (entry: Entry | null) => void;
  onSessionContextMenu: (e: React.MouseEvent, session: Session) => void;
  onEntryContextMenu: (e: React.MouseEvent, session: Session, entry: Entry) => void;
  onSelectionContextMenu: (selectedText: string, entry: Entry, rect: { left: number; bottom: number }) => void;
  onTermClick: (term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onFileLink?: (filename: string) => void;
  onPlusSelect: (item: PlusMenuItem, nodeTitle: string) => void;
  onCreateEmptyEntry: () => void;
  onNodeFocus: (session: Session, title: string) => void;
  onEditEntry: (session: Session, entry: Entry) => void;
  onCopyEntry: (entry: Entry) => void;
  onDeleteEntry: (session: Session, entry: Entry) => void;
  onForkEntry: (session: Session, entry: Entry) => void;
  onRenameSession: (session: Session) => void;
  onDeleteNode: (sessionId: string) => void;
  plusItems: PlusMenuItem[];
  rootPlusItems: PlusMenuItem[];
  editingEntry: Entry | null;
  renamingNodeId: string | null;
  onEditingChange: (session: Session, entry: Entry, value: string) => void;
  onEditSubmit: (session: Session, entry: Entry) => void;
  onNodeRenameSubmit: (id: string, title: string) => void;
  onEditSummary?: (session: Session, entry: Entry, text: string) => void;
  onRegenerateSummary?: (session: Session, entry: Entry) => void;
  /** 粘滞行秩偏移：内层模式（无 Node 顶行）传 1，所有 sticky top 计算减去该行秩；外层树默认 0 */
  stickyRankOffset?: number;
}

interface SessionViewProps extends SharedHandlers {
  session: Session;
  depth: number;
  nodeTitle: string;
}

function SessionView({ session, depth, nodeTitle, ...rest }: SessionViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isRootSession = depth === 1;
  const isRenaming = rest.renamingNodeId === session.id;
  const isAncestor = subtreeContains(session, rest.selectedSession, rest.selectedEntry);
  // 内层模式（stickyRankOffset>0）：根 Session 行改为普通流（其标题常驻顶栏），不再参与粘滞楼梯，
  // 故后代行秩由 NodeView 传 offset=2 重新从 0 起算
  const isInnerRoot = (rest.stickyRankOffset ?? 0) > 0 && depth === 1;
  const stickyRank = depth * 2 - 1 - (rest.stickyRankOffset ?? 0);
  const rowStyle: React.CSSProperties = isInnerRoot
    ? { backgroundColor: rest.selectedSession === session && !rest.selectedEntry ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : undefined) }
    : {
        position: "sticky",
        top: stickyRank * ROW_H,
        zIndex: STICKY_Z,
        backgroundColor: rest.selectedSession === session && !rest.selectedEntry ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : undefined),
        boxShadow: "0 2px 5px -2px hsl(var(--foreground) / 0.18)",
      };

  return (
    <div className="select-none" style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", isInnerRoot ? "hover:bg-muted/50" : "tree-row-sticky-surface", rest.selectedSession === session && !rest.selectedEntry && "tree-node-selected")}
        style={rowStyle}
        onClick={(e) => { e.stopPropagation(); rest.onSelectSession(session); }}
        onContextMenu={(e) => { e.preventDefault(); rest.onSelectSession(session); rest.onSessionContextMenu(e, session); }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <div className="shrink-0 w-3 mt-0.5" />
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
            <svg className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <div className="flex items-center gap-1 min-w-0">
            {isRenaming ? (
              <input defaultValue={session.title}
                onKeyDown={(e) => { if (e.key === "Enter") rest.onNodeRenameSubmit(session.id, (e.target as HTMLInputElement).value); if (e.key === "Escape") rest.onNodeRenameSubmit(session.id, session.title); }}
                onBlur={(e) => rest.onNodeRenameSubmit(session.id, e.target.value)}
                className="h-6 rounded border border-input bg-background px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0" autoFocus onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className={cn("text-base font-medium truncate shrink-0", rest.selectedSession === session && !rest.selectedEntry && "text-primary")}
                onDoubleClick={(e) => { e.stopPropagation(); rest.onRenameSession(session); }}>{session.title}</span>
            )}
            <div className="shrink-0">
              <PlusMenu items={isRootSession ? rest.rootPlusItems : rest.plusItems}
                onSelect={(item) => { rest.onNodeFocus(session, session.title); rest.onPlusSelect(item, nodeTitle); }}
                onCreateEmpty={() => { rest.onNodeFocus(session, session.title); rest.onCreateEmptyEntry(); }} />
            </div>
          </div>
        </div>
      </div>

        {!collapsed && session.entries.map((entry, idx) => {
          // summary 已作为 fork entry 的 nextSummary 提前渲染（子 Session 前），此处跳过避免重复
          if (entry.type === "summary") return null;
          const isEditable = entry.type === "note";
          // 段摘要紧跟 fork entry（数据层 splice(forkIdx+1)），渲染在子 Session 之前（一个段多个 fork 共用）
          const nextSummary = entry.children.length > 0 && session.entries[idx + 1]?.type === "summary"
            ? session.entries[idx + 1]
            : null;
          return (
        <div key={idx} style={{ paddingLeft: 20 }}>
          <EntryRow entry={entry} session={session} depth={depth}
            isSelected={rest.selectedEntry === entry} isAncestor={entry.children.some((c) => c === rest.selectedSession || subtreeContains(c, rest.selectedSession, rest.selectedEntry))} isEditing={rest.editingEntry === entry} isEditable={isEditable}
            stickyRankOffset={rest.stickyRankOffset}
            onToggleExpand={rest.onToggleExpand} onSelect={rest.onSelect}
            onContextMenu={rest.onEntryContextMenu} onFork={rest.onForkEntry}
            onEditEntry={rest.onEditEntry} onCopyEntry={rest.onCopyEntry} onEditSubmit={rest.onEditSubmit} onEditingChange={rest.onEditingChange}
            onSelectionContextMenu={rest.onSelectionContextMenu}
            onTermClick={rest.onTermClick} onTermHover={rest.onTermHover} onTermLeave={rest.onTermLeave} onFileLink={rest.onFileLink}
            onEditSummary={rest.onEditSummary} onRegenerateSummary={rest.onRegenerateSummary}
          >
            {entry.expanded && nextSummary && (
              <EntryRow entry={nextSummary} session={session} depth={depth}
                isSelected={rest.selectedEntry === nextSummary} isAncestor={false} isEditing={rest.editingEntry === nextSummary} isEditable={false}
                stickyRankOffset={rest.stickyRankOffset}
                onToggleExpand={rest.onToggleExpand} onSelect={rest.onSelect}
                onContextMenu={rest.onEntryContextMenu} onFork={rest.onForkEntry}
                onEditEntry={rest.onEditEntry} onCopyEntry={rest.onCopyEntry} onEditSubmit={rest.onEditSubmit} onEditingChange={rest.onEditingChange}
                onSelectionContextMenu={rest.onSelectionContextMenu}
                onTermClick={rest.onTermClick} onTermHover={rest.onTermHover} onTermLeave={rest.onTermLeave} onFileLink={rest.onFileLink}
                onEditSummary={rest.onEditSummary} onRegenerateSummary={rest.onRegenerateSummary}
              />
            )}
            {entry.expanded && entry.children.map((cs) => (
              <SessionView key={cs.id} session={cs} depth={depth + 1} nodeTitle={nodeTitle} {...rest} />
            ))}
          </EntryRow>
        </div>
          );
        })}
        {/* 选中态提示线：明确当前追加目标（该 Session 末尾），无 entries 时也显示 */}
        {rest.selectedSession === session && !collapsed && (
          <div className="flex items-center gap-2 mt-1" style={{ paddingLeft: 20 }}>
            <div className="h-px flex-1" style={{ backgroundColor: "hsl(var(--primary) / 0.35)" }} />
            <span className="text-xs text-muted-foreground shrink-0 select-none">将追加到这里</span>
          </div>
        )}
    </div>
  );
}

interface NodeViewProps extends SharedHandlers {
  node: Node;
  focusedSessionId?: string | null;
}

export function NodeView({ node, focusedSessionId, ...rest }: NodeViewProps) {
  const focusedSession = focusedSessionId ? node.sessions.find((s) => s.id === focusedSessionId) : undefined;
  if (!focusedSession) return <div className="select-none" />;
  return (
    <div className="select-none">
      <SessionView key={focusedSession.id} session={focusedSession} depth={1} nodeTitle={node.title} stickyRankOffset={2} {...rest} />
    </div>
  );
}
