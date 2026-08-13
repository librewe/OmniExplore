"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, Loader2, AlertCircle, GitBranch } from "lucide-react";
import type { Session, Entry, NodeStatus, PlusMenuItem } from "@/types";
import { TermText } from "./TermText";
import { PlusMenu } from "./PlusMenu";
import { cn } from "@/lib/utils";

/** 层级粘滞滚动：行秩交替计数 session/entry（根 Session=0 → 其 entry=1 → 子 Session=2 …），sticky top = 行秩 × ROW_H。ROW_H 须小于实际行高（约 30px），让上层行覆盖下层行顶边，避免阶梯缝隙透出内容 */
const ROW_H = 28;
const STICKY_BG = "hsl(var(--background))";
const STICKY_BG_SELECTED = "hsl(var(--accent))";

interface EntryRowProps {
  entry: Entry;
  session: Session;
  depth: number;
  isSelected: boolean;
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

function EntryRow({
  entry, session, depth, isSelected, isEditing, isEditable, children,
  onToggleExpand, onSelect, onContextMenu, onFork,
  onEditEntry, onEditSubmit, onEditingChange,
  onSelectionContextMenu, onTermDoubleClick, onTermHover, onTermLeave, onFileLink,
}: EntryRowProps) {
  const isExpanded = entry.expanded;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const snapshotRef = useRef(entry.userInput);
  const [editValue, setEditValue] = useState("");
  const isStreaming = entry.status === "streaming" || entry.status === "loading";

  const rowRank = depth * 2 + 1;

  useEffect(() => {
    if (isEditing) {
      const val = entry.userInput;
      snapshotRef.current = val;
      setEditValue(val);
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(val.length, val.length);
      }
    }
  }, [isEditing]);

  const firstLine = entry.userInput.split("\n")[0];
  const truncatedTitle = entry.type === "note" && !entry.userInput
    ? "(双击或右键编辑)"
    : firstLine.slice(0, 30) + (firstLine.length > 30 ? "…" : "");

  return (
    <div className="select-none">
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", isSelected && "tree-node-selected")}
        style={{
          position: "sticky",
          top: rowRank * ROW_H,
          zIndex: Math.max(10, 40 - rowRank),
          backgroundColor: isSelected ? STICKY_BG_SELECTED : STICKY_BG,
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
          <span className="text-base font-medium truncate shrink-0">{truncatedTitle}</span>
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
              <textarea ref={textareaRef} value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { entry.userInput = editValue; onEditSubmit(session, entry); }
                  if (e.key === "Escape") { entry.userInput = snapshotRef.current; onEditSubmit(session, entry); }
                }}
                onBlur={() => { entry.userInput = editValue; onEditSubmit(session, entry); }}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y" placeholder="输入内容…" />
              <p className="text-xs text-muted-foreground">Ctrl+Enter 保存，Esc 取消</p>
            </div>
          ) : (
            <>
              {entry.type !== "note" && <div className="text-xs text-muted-foreground mb-1">🧑 {entry.userInput}</div>}
              {entry.assistantOutput ? (
                <TermText content={"🤖 " + entry.assistantOutput} onTermDoubleClick={onTermDoubleClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink} className="text-xs text-muted-foreground" />
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

interface NodeViewProps {
  session: Session;
  depth: number;
  selectedEntry: Entry | null;
  selectedSession: Session | null;
  onSelectSession: (session: Session | null) => void;
  onToggleExpand: (session: Session, entry: Entry) => void;
  onSelect: (entry: Entry | null) => void;
  onNodeContextMenu: (e: React.MouseEvent, session: Session) => void;
  onEntryContextMenu: (e: React.MouseEvent, session: Session, entry: Entry) => void;
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, entry: Entry) => void;
  onTermDoubleClick: (term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onFileLink?: (filename: string) => void;
  onPlusSelect: (item: PlusMenuItem, sessionTitle: string) => void;
  onCreateEmptyEntry: () => void;
  onNodeFocus: (session: Session, title: string) => void;
  onEditEntry: (session: Session, entry: Entry) => void;
  onDeleteEntry: (session: Session, entry: Entry) => void;
  onForkEntry: (session: Session, entry: Entry) => void;
  onRenameNode: (session: Session) => void;
  onDeleteNode: (sessionId: string) => void;
  contextTarget: { type: "session"; id: string } | { type: "entry"; entry: Entry } | null;
  contextPos: { x: number; y: number };
  onCloseContext: () => void;
  plusItems: PlusMenuItem[];
  rootPlusItems: PlusMenuItem[];
  editingEntry: Entry | null;
  renamingNodeId: string | null;
  onEditingChange: (session: Session, entry: Entry, value: string) => void;
  onEditSubmit: (session: Session, entry: Entry) => void;
  onNodeRenameSubmit: (sessionId: string, title: string) => void;
}

export function NodeView({
  session, depth, selectedEntry, selectedSession, onSelectSession,
  onToggleExpand, onSelect,
  onNodeContextMenu, onEntryContextMenu, onSelectionContextMenu,
  onTermDoubleClick, onTermHover, onTermLeave, onFileLink,
  onPlusSelect, onCreateEmptyEntry, onNodeFocus,
  onEditEntry, onDeleteEntry, onForkEntry,
  onRenameNode, onDeleteNode,
  contextTarget, contextPos, onCloseContext,
  plusItems, rootPlusItems, editingEntry, renamingNodeId,
  onEditingChange, onEditSubmit, onNodeRenameSubmit,
}: NodeViewProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isRoot = depth === 0;
  const isRenaming = renamingNodeId === session.id;

  return (
    <div className={cn("select-none", isRoot && selectedSession === session && "bg-primary/10 rounded-md")} style={{ paddingLeft: depth > 0 ? 20 : 0 }}>
      <div className={cn("tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default", selectedSession === session && "tree-node-selected")}
        style={{
          position: "sticky",
          top: depth * 2 * ROW_H,
          zIndex: Math.max(10, 40 - depth * 2),
          backgroundColor: selectedSession === session ? STICKY_BG_SELECTED : STICKY_BG,
        }}
        onClick={(e) => { e.stopPropagation(); onSelectSession(session); }}
        onContextMenu={(e) => { e.preventDefault(); onSelectSession(session); onNodeContextMenu(e, session); }}
      >
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          <div className="shrink-0 w-3 mt-0.5" />
          <button onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
            <svg className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", !collapsed && "rotate-90")} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <div className="flex items-center gap-1 min-w-0">
            {isRenaming ? (
              <input defaultValue={session.title}
                onKeyDown={(e) => { if (e.key === "Enter") onNodeRenameSubmit(session.id, (e.target as HTMLInputElement).value); if (e.key === "Escape") onNodeRenameSubmit(session.id, session.title); }}
                onBlur={(e) => onNodeRenameSubmit(session.id, e.target.value)}
                className="h-6 rounded border border-input bg-background px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0" autoFocus onClick={(e) => e.stopPropagation()} />
            ) : (
              <span className={cn("text-base font-medium truncate shrink-0", isRoot ? "text-primary font-semibold" : "text-foreground")}
                onDoubleClick={(e) => { e.stopPropagation(); onRenameNode(session); }}>{session.title}</span>
            )}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <PlusMenu items={isRoot ? rootPlusItems : plusItems}
                onSelect={(item) => { onNodeFocus(session, session.title); onPlusSelect(item, session.title); }}
                onCreateEmpty={() => { onNodeFocus(session, session.title); onCreateEmptyEntry(); }} />
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
            isSelected={selectedEntry === entry} isEditing={editingEntry === entry} isEditable={isEditable}
            onToggleExpand={onToggleExpand} onSelect={onSelect}
            onContextMenu={onEntryContextMenu} onFork={onForkEntry}
            onEditEntry={onEditEntry} onEditSubmit={onEditSubmit} onEditingChange={onEditingChange}
            onSelectionContextMenu={onSelectionContextMenu}
            onTermDoubleClick={onTermDoubleClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink}
          >
            {entry.expanded && entry.children.map((cs) => (
              <NodeView key={cs.id} session={cs} depth={depth + 1}
                selectedEntry={selectedEntry} selectedSession={selectedSession} onSelectSession={onSelectSession} onToggleExpand={onToggleExpand} onSelect={onSelect}
                onNodeContextMenu={onNodeContextMenu} onEntryContextMenu={onEntryContextMenu}
                onSelectionContextMenu={onSelectionContextMenu}
                onTermDoubleClick={onTermDoubleClick} onTermHover={onTermHover} onTermLeave={onTermLeave} onFileLink={onFileLink}
                onPlusSelect={onPlusSelect} onCreateEmptyEntry={onCreateEmptyEntry} onNodeFocus={onNodeFocus}
                onEditEntry={onEditEntry} onDeleteEntry={onDeleteEntry} onForkEntry={onForkEntry}
                onRenameNode={onRenameNode} onDeleteNode={onDeleteNode}
                contextTarget={contextTarget} contextPos={contextPos} onCloseContext={onCloseContext}
                plusItems={plusItems} rootPlusItems={rootPlusItems} editingEntry={editingEntry} renamingNodeId={renamingNodeId}
                onEditingChange={onEditingChange} onEditSubmit={onEditSubmit} onNodeRenameSubmit={onNodeRenameSubmit}
              />
            ))}
          </EntryRow>
        </div>
          );
        })}
    </div>
  );
}
