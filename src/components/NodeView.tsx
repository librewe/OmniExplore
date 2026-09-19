"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronRight, Loader2, AlertCircle, GitBranch, Pencil, RefreshCw, Copy, Undo2 } from "lucide-react";
import type { Node, Session, Entry, NodeStatus, PlusMenuItem } from "@/types";
import { TermText } from "./TermText";
import { PlusMenu } from "./PlusMenu";
import { cn } from "@/lib/utils";
import { rememberEntryScroll, readEntryScroll } from "@/services/scrollMemory";

/** 吸顶行统一层叠级：DOM 靠后（更深）的标签盖住更浅的标签 */
const STICKY_Z = 20;
const EDITOR_MAX_H = 360;

function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, EDITOR_MAX_H)}px`;
  el.style.overflowY = el.scrollHeight > EDITOR_MAX_H ? "auto" : "hidden";
}

interface EntryRowProps {
  entry: Entry;
  session: Session;
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
  entry, session, isSelected, isEditing, isEditable, children,
  onToggleExpand, onSelect, onContextMenu, onFork,
  onEditEntry, onCopyEntry, onEditSubmit, onEditingChange,
  onSelectionContextMenu, onTermClick, onTermHover, onTermLeave, onFileLink,
  onEditSummary, onRegenerateSummary,
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

  const toggleable = entry.assistantOutput !== null || entry.type === "note" || isSummary || isStreaming;
  const showEditor = isEditing || (isSummary && editingSummary);
  const showStatus = isStreaming || entry.status === "error";
  const questionRef = useRef<HTMLDivElement>(null);
  const [questionExpanded, setQuestionExpanded] = useState(false);
  const [questionOverflow, setQuestionOverflow] = useState(false);
  const isQa = !isSummary && entry.type !== "note";
  const qaExpanded = isQa && isExpanded && !showEditor;

  useEffect(() => {
    const el = questionRef.current;
    if (!qaExpanded || !el) {
      setQuestionOverflow(false);
      return;
    }
    const measure = () => {
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      setQuestionOverflow((prev) => (prev === overflowing ? prev : overflowing));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [qaExpanded, entry, questionExpanded]);

  const handleSelectionMouseUp = (e: React.MouseEvent) => {
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
  };

  return (
    <div className="relative select-none">
      <div
        className={cn(
          "group relative cursor-default",
          isSelected && "tree-node-selected"
        )}
        onClick={(e) => { e.stopPropagation(); onSelect(entry); }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest(".term-underline")) return;
          if (!entry.expanded) onToggleExpand(session, entry);
          if (isSummary && !summaryLoading) setEditingSummary(true);
          else if (isEditable) onEditEntry(session, entry);
        }}
        onContextMenu={(e) => { onSelect(entry); onContextMenu(e, session, entry); }}
      >
        {toggleable && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(session, entry); }}
            className={cn(
              "absolute left-0 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:bg-accent",
              showStatus ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          >
            {isExpanded
              ? <svg className="w-3.5 h-3.5 rotate-90 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              : STATUS_ICONS[entry.status || "idle"] || <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
        )}

        <div className="relative">
        <div className="absolute left-0 top-2 bottom-0 w-px pointer-events-none" style={{ backgroundColor: "hsl(var(--border))" }} />

        {isQa && !showEditor && (
          <div style={{ paddingLeft: 20, paddingRight: 20 }} onMouseUp={handleSelectionMouseUp}>
            <div ref={questionRef} className={!isExpanded ? "line-clamp-2" : questionExpanded ? "" : "max-h-[7.5rem] overflow-hidden"}>
              <div className="rounded-lg bg-muted/50 px-3 py-1">
                <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
              </div>
            </div>
            {isExpanded && (questionOverflow || questionExpanded) && (
              <button
                onClick={(e) => { e.stopPropagation(); setQuestionExpanded((v) => !v); }}
                className="mt-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {questionExpanded ? "收起" : "展开"}
              </button>
            )}
          </div>
        )}

        {(!isQa || isExpanded || showEditor) && (
        <div ref={scrollBoxRef}
          className={cn("py-1 select-text", scrollCapped && "overflow-y-auto max-h-[60vh]", scrollCapped && boxOverflow && "entry-fade-mask")}
          style={{ paddingLeft: 20, paddingRight: 20 }}
          onScroll={scrollCapped ? (e) => rememberEntryScroll(entry, e.currentTarget.scrollTop) : undefined}
          onMouseUp={handleSelectionMouseUp}
        >
          {showEditor ? (
            isEditing ? (
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
            )
          ) : !isExpanded ? (
            isSummary ? (
              entry.summaryStatus === "error" ? (
                <div className="flex items-start gap-1.5 text-sm text-destructive">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{entry.errorMessage || "摘要生成失败"}</span>
                </div>
              ) : entry.userInput ? (
                <div className="line-clamp-2">
                  <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-muted-foreground" />
                </div>
              ) : summaryLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span>正在总结…</span>
                </div>
              ) : (
                <div className="text-sm italic text-muted-foreground">（空摘要）</div>
              )
            ) : entry.userInput ? (
              <div className="line-clamp-2">
                <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">(双击或右键编辑)</span>
            )
          ) : (
            <>
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
                entry.summaryStatus === "error" ? (
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
                entry.userInput ? (
                  <TermText content={entry.userInput} onTermClick={onTermClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-base text-foreground" />
                ) : (
                  <span className="text-sm text-muted-foreground italic">(双击或右键编辑)</span>
                )
              ) : <span className="text-sm text-muted-foreground italic">点击展开以探索 →</span>}
              {entry.status === "error" && entry.errorMessage && <div className="text-xs text-destructive mt-1">{entry.errorMessage}</div>}
            </>
          )}
        </div>
        )}
        </div>
        {(!isSummary || !summaryLoading) && (
          <div className="flex h-[28.8px] items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ paddingLeft: 20, paddingRight: 20 }}>
            {!isSummary && !isStreaming && (
              <button onClick={(e) => { e.stopPropagation(); onEditEntry(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent transition-colors" title="撤回（复原输入重新提交）"><Undo2 className="w-3.5 h-3.5" /></button>
            )}
            {!isSummary && (
              <button onClick={(e) => { e.stopPropagation(); onCopyEntry(entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent transition-colors" title="复制"><Copy className="w-3.5 h-3.5" /></button>
            )}
            {isSummary && !summaryLoading && (
              <>
                <button onClick={(e) => { e.stopPropagation(); setEditingSummary(true); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent transition-colors" title="编辑摘要"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={(e) => { e.stopPropagation(); onRegenerateSummary?.(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent transition-colors" title="重新生成"><RefreshCw className="w-3.5 h-3.5" /></button>
              </>
            )}
            {!isSummary && (
              <button onClick={(e) => { e.stopPropagation(); onFork(session, entry); }} className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent transition-colors" title="从此处分支"><GitBranch className="w-3.5 h-3.5" /></button>
            )}
          </div>
        )}
      </div>

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
}

interface SessionViewProps extends SharedHandlers {
  session: Session;
  depth: number;
  nodeTitle: string;
  label?: string;
}

function SessionView({ session, depth, nodeTitle, label, ...rest }: SessionViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isRootSession = depth === 1;
  const isSelectedSession = rest.selectedSession === session && !rest.selectedEntry;
  const appendRowRef = useRef<HTMLDivElement>(null);
  const [scrollNonce, setScrollNonce] = useState(0);

  // 标签点击后把该 Session 的追加行滚入视野（展开/选中为异步渲染，故用非零 nonce 触发提交后滚动）
  useEffect(() => {
    if (scrollNonce === 0) return;
    appendRowRef.current?.scrollIntoView({ block: "end" });
  }, [scrollNonce]);

  const handleLabelClick = () => {
    if (collapsed) setCollapsed(false);
    rest.onSelectSession(session);
    setScrollNonce((n) => n + 1);
  };

  return (
    <div className="select-none" style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      {label && (
        <div className="sticky" style={{ top: 0, zIndex: STICKY_Z, height: 0 }}>
          <div className="group absolute -left-10 top-2 flex h-5 items-center">
            <button
              onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
              className="relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
            >
              <svg className={cn("w-3.5 h-3.5 transition-transform", !collapsed && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
            </button>
            {rest.renamingNodeId === session.id ? (
              <input defaultValue={session.title}
                onKeyDown={(e) => { if (e.key === "Enter") rest.onNodeRenameSubmit(session.id, (e.target as HTMLInputElement).value); if (e.key === "Escape") rest.onNodeRenameSubmit(session.id, session.title); }}
                onBlur={(e) => rest.onNodeRenameSubmit(session.id, e.target.value)}
                className="relative z-10 h-6 shrink-0 rounded border border-input bg-background px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" autoFocus onClick={(e) => e.stopPropagation()} />
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); handleLabelClick(); }}
                onContextMenu={(e) => { e.preventDefault(); rest.onSelectSession(session); rest.onSessionContextMenu(e, session); }}
                className={cn(
                  "relative z-10 shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground transition-colors",
                  isSelectedSession && "tree-node-selected"
                )}
              >
                {label}
              </button>
            )}
          </div>
        </div>
      )}

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
            <EntryRow entry={entry} session={session}
              isSelected={rest.selectedEntry === entry} isAncestor={entry.children.some((c) => c === rest.selectedSession || subtreeContains(c, rest.selectedSession, rest.selectedEntry))} isEditing={rest.editingEntry === entry} isEditable={isEditable}
              onToggleExpand={rest.onToggleExpand} onSelect={rest.onSelect}
              onContextMenu={rest.onEntryContextMenu} onFork={rest.onForkEntry}
              onEditEntry={rest.onEditEntry} onCopyEntry={rest.onCopyEntry} onEditSubmit={rest.onEditSubmit} onEditingChange={rest.onEditingChange}
              onSelectionContextMenu={rest.onSelectionContextMenu}
              onTermClick={rest.onTermClick} onTermHover={rest.onTermHover} onTermLeave={rest.onTermLeave} onFileLink={rest.onFileLink}
              onEditSummary={rest.onEditSummary} onRegenerateSummary={rest.onRegenerateSummary}
            >
              {entry.expanded && nextSummary && (
                <EntryRow entry={nextSummary} session={session}
                  isSelected={rest.selectedEntry === nextSummary} isAncestor={false} isEditing={rest.editingEntry === nextSummary} isEditable={false}
                  onToggleExpand={rest.onToggleExpand} onSelect={rest.onSelect}
                  onContextMenu={rest.onEntryContextMenu} onFork={rest.onForkEntry}
                  onEditEntry={rest.onEditEntry} onCopyEntry={rest.onCopyEntry} onEditSubmit={rest.onEditSubmit} onEditingChange={rest.onEditingChange}
                  onSelectionContextMenu={rest.onSelectionContextMenu}
                  onTermClick={rest.onTermClick} onTermHover={rest.onTermHover} onTermLeave={rest.onTermLeave} onFileLink={rest.onFileLink}
                  onEditSummary={rest.onEditSummary} onRegenerateSummary={rest.onRegenerateSummary}
                />
              )}
              {entry.expanded && entry.children.map((cs, i) => (
                <SessionView key={cs.id} session={cs} depth={depth + 1} nodeTitle={nodeTitle} label={`#${i + 1}`} {...rest} />
              ))}
            </EntryRow>
          </div>
        );
      })}
      {/* 选中态提示线：明确当前追加目标（该 Session 末尾），无 entries 时也显示；加号并入同一行 */}
      {rest.selectedSession === session && !collapsed && (
        <div ref={appendRowRef} className="flex items-center gap-2 mt-1" style={{ paddingLeft: 20 }}>
          <div className="h-px flex-1" style={{ backgroundColor: "hsl(var(--primary) / 0.35)" }} />
          <PlusMenu items={isRootSession ? rest.rootPlusItems : rest.plusItems}
            onSelect={(item) => { rest.onNodeFocus(session, session.title); rest.onPlusSelect(item, nodeTitle); }}
            onCreateEmpty={() => { rest.onNodeFocus(session, session.title); rest.onCreateEmptyEntry(); }} />
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
      <SessionView key={focusedSession.id} session={focusedSession} depth={1} nodeTitle={node.title} label="root" {...rest} />
    </div>
  );
}
