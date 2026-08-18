"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, Loader2, AlertCircle, GitBranch, Plus } from "lucide-react";
import type { Node, Session, Entry, NodeStatus, PlusMenuItem } from "@/types";
import { TermText } from "./TermText";
import { PlusMenu } from "./PlusMenu";
import { cn } from "@/lib/utils";

/** 层级粘滞滚动：行秩连续计数（Node=0 → 根 Session=1 → 其 entry=2 → 子 Session=3 …），sticky top = 行秩 × ROW_H。ROW_H 与实测行高一致（约 30px），粘滞时行间紧贴、互不遮挡、无缝隙透出 */
const ROW_H = 30;
const STICKY_BG = "hsl(var(--background))";
const STICKY_BG_SELECTED = "hsl(var(--accent))";
/** 父链弱高亮背景：不透明极淡蓝（95% 背景色 + 5% primary，亮度高于选中行的 accent 底色），避免粘滞滚动时半透明透底 */
const STICKY_BG_ANCESTOR = "color-mix(in srgb, hsl(var(--background)) 95%, hsl(var(--primary)) 5%)";

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
  onEditSubmit: (session: Session, entry: Entry) => void;
  onEditingChange: (session: Session, entry: Entry, value: string) => void;
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, entry: Entry) => void;
  onTermDoubleClick: (term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onFileLink?: (filename: string) => void;
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
  onEditEntry, onEditSubmit, onEditingChange,
  onSelectionContextMenu, onTermDoubleClick, onTermHover, onTermLeave, onFileLink,
}: EntryRowProps) {
  const isExpanded = entry.expanded;
  const isStreaming = entry.status === "streaming" || entry.status === "loading";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 进入编辑态时把编辑框滚入视野（如新增上下文自动编辑）
  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isEditing]);

  const rowRank = depth * 2;

  const firstLine = entry.userInput.split("\n")[0];
  const truncatedTitle = entry.type === "note" && !entry.userInput
    ? "(双击或右键编辑)"
    : firstLine.slice(0, 30) + (firstLine.length > 30 ? "…" : "");

  return (
    <div className="relative select-none">
      {/* entry 左侧引导线：贴行左缘，从行中点（15px）开始向下延伸到子内容底部；zIndex 低于 sticky 行（行背景盖住行上部分，行上不显示），内容区域可见。统一浅灰色，不随选中变色 */}
      <div
        className="absolute left-0 top-[15px] bottom-0 w-px pointer-events-none"
        style={{ zIndex: 1, backgroundColor: "hsl(var(--border))" }}
      />
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", isSelected && "tree-node-selected")}
        style={{
          position: "sticky",
          top: rowRank * ROW_H,
          zIndex: Math.max(10, 40 - rowRank),
          backgroundColor: isSelected ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : STICKY_BG),
        }}
        onClick={(e) => { e.stopPropagation(); onSelect(entry); }}
        onDoubleClick={() => {
          if (!entry.expanded) onToggleExpand(session, entry);
          if (isEditable) onEditEntry(session, entry);
        }}
        onContextMenu={(e) => { onSelect(entry); onContextMenu(e, session, entry); }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <div className="shrink-0 w-3 mt-0.5" />
          {(entry.assistantOutput !== null || entry.type === "note" || isStreaming) ? (
            <button onClick={(e) => { e.stopPropagation(); onToggleExpand(session, entry); }} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
              {isExpanded ? (
                <svg className="w-3.5 h-3.5 text-muted-foreground rotate-90 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
              ) : STATUS_ICONS[entry.status || "idle"] || <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : <span className="w-[22px] shrink-0" />}
          <span className={cn("text-base font-medium truncate shrink-0", isSelected && "text-primary")}>{entry.type === "note" ? "📝" : "💬"} {truncatedTitle}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onFork(session, entry); }} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors" title="从此处分支"><GitBranch className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
        </div>
      </div>

      {isExpanded && (entry.assistantOutput || entry.type === "note" || isStreaming) && (
        <div className="ml-0 py-1 select-text" style={{ paddingLeft: 20 }}
          onContextMenu={(e) => {
            const sel = window.getSelection()?.toString().trim();
            if (sel) { e.preventDefault(); e.stopPropagation(); onSelectionContextMenu(e, sel, entry); }
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
                onBlur={(e) => { onEditingChange(session, entry, e.target.value); onEditSubmit(session, entry); }}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y" placeholder="输入内容…" autoFocus />
              <p className="text-xs text-muted-foreground">Ctrl+Enter 保存，Esc 取消</p>
            </div>
          ) : (
            <>
              {entry.type !== "note" && <div className="text-sm text-muted-foreground mb-1">🧑 {entry.userInput}</div>}
              {entry.assistantOutput ? (
                <TermText content={"🤖 " + entry.assistantOutput} onTermDoubleClick={onTermDoubleClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-sm text-muted-foreground" />
              ) : isStreaming ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" /><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.4s]" /></span>正在思考…</div>
              ) : entry.type === "note" ? (
                <TermText content={entry.userInput} onTermDoubleClick={onTermDoubleClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-sm text-muted-foreground" />
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
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, entry: Entry) => void;
  onTermDoubleClick: (term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onFileLink?: (filename: string) => void;
  onPlusSelect: (item: PlusMenuItem, nodeTitle: string) => void;
  onCreateEmptyEntry: () => void;
  onNodeFocus: (session: Session, title: string) => void;
  onEditEntry: (session: Session, entry: Entry) => void;
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

  return (
    <div className="select-none" style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", rest.selectedSession === session && "tree-node-selected")}
        style={{
          position: "sticky",
          top: (depth * 2 - 1) * ROW_H,
          zIndex: Math.max(10, 40 - (depth * 2 - 1)),
          backgroundColor: rest.selectedSession === session ? STICKY_BG_SELECTED : (isAncestor ? STICKY_BG_ANCESTOR : STICKY_BG),
        }}
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
              <span className={cn("text-base font-medium truncate shrink-0", rest.selectedSession === session ? "text-primary" : "text-foreground")}
                onDoubleClick={(e) => { e.stopPropagation(); rest.onRenameSession(session); }}>{session.title}</span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <PlusMenu items={isRootSession ? rest.rootPlusItems : rest.plusItems}
                onSelect={(item) => { rest.onNodeFocus(session, session.title); rest.onPlusSelect(item, nodeTitle); }}
                onCreateEmpty={() => { rest.onNodeFocus(session, session.title); rest.onCreateEmptyEntry(); }} />
            </div>
          </div>
        </div>
      </div>

      {!collapsed && session.entries.map((entry, idx) => {
          const isLast = idx === session.entries.length - 1;
          const isEditable = isLast && !entry.assistantOutput;
          return (
        <div key={idx} style={{ paddingLeft: 20 }}>
          <EntryRow entry={entry} session={session} depth={depth}
            isSelected={rest.selectedEntry === entry} isAncestor={entry.children.some((c) => c === rest.selectedSession || subtreeContains(c, rest.selectedSession, rest.selectedEntry))} isEditing={rest.editingEntry === entry} isEditable={isEditable}
            onToggleExpand={rest.onToggleExpand} onSelect={rest.onSelect}
            onContextMenu={rest.onEntryContextMenu} onFork={rest.onForkEntry}
            onEditEntry={rest.onEditEntry} onEditSubmit={rest.onEditSubmit} onEditingChange={rest.onEditingChange}
            onSelectionContextMenu={rest.onSelectionContextMenu}
            onTermDoubleClick={rest.onTermDoubleClick} onTermHover={rest.onTermHover} onTermLeave={rest.onTermLeave} onFileLink={rest.onFileLink}
          >
            {entry.expanded && entry.children.map((cs) => (
              <SessionView key={cs.id} session={cs} depth={depth + 1} nodeTitle={nodeTitle} {...rest} />
            ))}
          </EntryRow>
        </div>
          );
        })}
    </div>
  );
}

interface NodeViewProps extends SharedHandlers {
  node: Node;
  onSelectNode: () => void;
  onNodeContextMenu: (e: React.MouseEvent, node: Node) => void;
  onCreateRootSession: () => void;
  onRenameNode: (node: Node) => void;
}

export function NodeView({ node, onSelectNode, onNodeContextMenu, onCreateRootSession, onRenameNode, ...rest }: NodeViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isRenamingNode = rest.renamingNodeId === node.id;
  const isAncestor = node.sessions.some((s) => s === rest.selectedSession || subtreeContains(s, rest.selectedSession, rest.selectedEntry));

  return (
    <div className="select-none">
      <div className="tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default"
        style={{ position: "sticky", top: 0, zIndex: 40, backgroundColor: isAncestor ? STICKY_BG_ANCESTOR : STICKY_BG }}
        onClick={(e) => { e.stopPropagation(); onSelectNode(); }}
        onContextMenu={(e) => { e.preventDefault(); onSelectNode(); onNodeContextMenu(e, node); }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <div className="shrink-0 w-3 mt-0.5" />
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
            <svg className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <div className="flex items-center gap-1 min-w-0">
            {isRenamingNode ? (
              <input defaultValue={node.title}
                onKeyDown={(e) => { if (e.key === "Enter") rest.onNodeRenameSubmit(node.id, (e.target as HTMLInputElement).value); if (e.key === "Escape") rest.onNodeRenameSubmit(node.id, node.title); }}
                onBlur={(e) => rest.onNodeRenameSubmit(node.id, e.target.value)}
                className="h-6 rounded border border-input bg-background px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0" autoFocus onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className="text-base font-medium truncate shrink-0 text-primary font-semibold"
                onDoubleClick={(e) => { e.stopPropagation(); onRenameNode(node); }}>{node.title}</span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setCollapsed(false); onCreateRootSession(); }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                title="新建根会话"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {!collapsed && node.sessions.map((s) => (
        <SessionView key={s.id} session={s} depth={1} nodeTitle={node.title} {...rest} />
      ))}
    </div>
  );
}
