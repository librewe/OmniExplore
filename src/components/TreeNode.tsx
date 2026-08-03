"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronRight, Loader2, AlertCircle, GripVertical,
} from "lucide-react";
import type { TreeNodeData, NodeStatus } from "@/types";
import { TermText } from "./TermText";
import { PlusMenu } from "./PlusMenu";
import { ContextMenuContent, nodeMenuItems, rootMenuItems } from "./ContextMenu";
import { cn } from "@/lib/utils";

interface TreeNodeProps {
  node: TreeNodeData;
  depth: number;
  selectedNodeId: string | null;
  onToggleExpand: (nodeId: string) => void;
  onSelect: (nodeId: string | null) => void;
  onNodeContextMenu: (e: React.MouseEvent, nodeId: string) => void;
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, nodeId: string) => void;
  onTermDoubleClick: (term: string) => void;
  onTermContextMenu: (e: React.MouseEvent, term: string) => void;
  onTermHover: (e: React.MouseEvent, term: string) => void;
  onTermLeave: () => void;
  onPlusSelect: (parentId: string, prompt: string) => void;
  onCreateEmptyChild: (parentId: string) => void;
  onEditContent: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onRename: (nodeId: string) => void;
  contextNodeId: string | null;
  contextPos: { x: number; y: number };
  onCloseContext: () => void;
  plusItems: Array<{ id: string; label: string; prompt: string }>;
  editingNodeId: string | null;
  renamingNodeId: string | null;
  onEditingChange: (nodeId: string, value: string) => void;
  onEditSubmit: (nodeId: string) => void;
  onRenameSubmit: (nodeId: string, title: string) => void;
  dropIndicator?: { type: "inside"; nodeId: string } | { type: "between"; neighborId: string; before: boolean } | null;
  registerNodeRect?: (id: string, el: HTMLElement | null) => void;
}

const STATUS_ICONS: Record<NodeStatus, React.ReactNode> = {
  idle: <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />,
  loading: <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />,
  streaming: <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />,
  done: null,
  error: <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
};

function StatusContent({
  status,
  content,
  errorMessage,
  onRetry,
}: {
  status: NodeStatus;
  content: string | null;
  errorMessage?: string;
  onRetry?: () => void;
}) {
  if (status === "idle" && !content) {
    return <span className="text-sm text-muted-foreground italic">点击展开以探索 →</span>;
  }
  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.2s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-dot [animation-delay:0.4s]" />
        </span>
        正在思考…
      </div>
    );
  }
  if (status === "streaming" && content) {
    return (
      <span className="text-sm leading-relaxed whitespace-pre-wrap">
        {content}
        <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-sm">
        <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-destructive">{errorMessage || "生成失败"}</span>
        {onRetry && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="text-primary underline text-xs hover:no-underline"
          >
            点击重试
          </button>
        )}
      </div>
    );
  }
  if (content) {
    return <span className="text-base leading-relaxed whitespace-pre-wrap">{content}</span>;
  }
  return null;
}

export function TreeNode({
  node,
  depth,
  selectedNodeId,
  onToggleExpand,
  onSelect,
  onNodeContextMenu,
  onSelectionContextMenu,
  onTermDoubleClick,
  onTermContextMenu,
  onTermHover,
  onTermLeave,
  onPlusSelect,
  onCreateEmptyChild,
  onEditContent,
  onDelete,
  onRename,
  contextNodeId,
  contextPos,
  onCloseContext,
  plusItems,
  editingNodeId,
  renamingNodeId,
  onEditingChange,
  onEditSubmit,
  onRenameSubmit,
  dropIndicator,
  registerNodeRect,
}: TreeNodeProps) {
  const isSelected = selectedNodeId === node.id;
  const isRoot = node.type === "root";
  const isEditing = editingNodeId === node.id;
  const hasContextMenu = contextNodeId === node.id;
  const contextRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onNodeContextMenu(e, node.id);
    },
    [node.id, onNodeContextMenu]
  );

  useEffect(() => {
    if (!hasContextMenu) return;
    function handleClick(e: MouseEvent) {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        onCloseContext();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [hasContextMenu, onCloseContext]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [isEditing]);

  const isDraggable = node.type === "inquiry" || node.type === "reference";
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: node.id, disabled: !isDraggable,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: node.id });
  const handleRef = useCallback((el: HTMLDivElement | null) => {
    setDropRef(el);
    registerNodeRect?.(node.id, el);
  }, [node.id, setDropRef, registerNodeRect]);
  const isDropTarget = dropIndicator && (
    (dropIndicator.type === "inside" && dropIndicator.nodeId === node.id) ||
    (dropIndicator.type === "between" && dropIndicator.neighborId === node.id)
  );
  const isDropInside = dropIndicator?.type === "inside" && dropIndicator.nodeId === node.id;
  const isDropBefore = dropIndicator?.type === "between" && dropIndicator.neighborId === node.id && dropIndicator.before;
  const isDropAfter = dropIndicator?.type === "between" && dropIndicator.neighborId === node.id && !dropIndicator.before;
  const dragStyle = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const showContent = node.expanded && (node.content !== null || isEditing);

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(node.id);
  }, [node.id, onSelect]);

  return (
    <div className="select-none" style={{ paddingLeft: depth * 20 }}>
      <div
        ref={handleRef}
        className={cn(
          "tree-node-row group flex items-start gap-1 py-0.5 rounded-md transition-colors cursor-default relative",
          isSelected && "tree-node-selected",
          isOver && "ring-1 ring-primary/30 bg-accent/30",
          isDropInside && "ring-2 ring-primary bg-primary/5"
        )}
        style={dragStyle}
        onClick={handleClick}
        onContextMenu={(e) => {
          onSelect(node.id);
          handleContextMenu(e);
        }}
      >
        {isDropBefore && (
          <div className="absolute -top-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
        )}
        {isDropAfter && (
          <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 bg-primary rounded-full" />
        )}
        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
          {isDraggable ? (
            <div ref={setDragRef} {...listeners} {...attributes} className="drag-handle shrink-0 cursor-grab active:cursor-grabbing mt-0.5 touch-none">
              <GripVertical className="w-3 h-3 text-muted-foreground" />
            </div>
          ) : (
            <div className="shrink-0 w-3 mt-0.5" />
          )}

          {node.children.length > 0 || node.content !== null || node.type === "preset" ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors"
            >
              {node.expanded ? (
                <svg className="w-3.5 h-3.5 text-muted-foreground rotate-90 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              ) : STATUS_ICONS[node.status] || (
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="w-[22px] shrink-0" />
          )}

          <div className="flex items-center gap-1 min-w-0">
            {renamingNodeId === node.id ? (
              <input
                defaultValue={node.title}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onRenameSubmit(node.id, (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") onRenameSubmit(node.id, node.title);
                }}
                onBlur={(e) => onRenameSubmit(node.id, e.target.value)}
                className="h-6 rounded border border-input bg-background px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring shrink-0"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span
                className={cn(
                  "text-base font-medium truncate shrink-0",
                  isRoot ? "text-primary font-semibold" : "text-foreground"
                )}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!isRoot) onEditContent(node.id);
                }}
              >
                {node.title}
              </span>
            )}

            <div className={cn(
              "transition-opacity shrink-0",
              isRoot
                ? "opacity-0 group-hover:opacity-100"
                : "opacity-0 group-hover:opacity-100"
            )}>
              <PlusMenu
                items={plusItems}
                onSelect={(item) => {
                  onPlusSelect(node.id, item.prompt);
                }}
                onCreateEmpty={() => onCreateEmptyChild(node.id)}
              />
            </div>
          </div>
        </div>
      </div>

      {showContent && (
        <div
          className="ml-0 pl-0 py-1 select-text"
          onContextMenu={(e) => {
            const sel = window.getSelection()?.toString().trim();
            if (sel) {
              e.preventDefault();
              e.stopPropagation();
              onSelectionContextMenu(e, sel, node.id);
            }
          }}
          style={{ paddingLeft: 28 }}
        >
          {isEditing ? (
            <div className="space-y-1">
              <textarea
                ref={textareaRef}
                value={editingNodeId === node.id ? (node.content || "") : ""}
                onChange={(e) => onEditingChange(node.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onEditSubmit(node.id);
                  }
                }}
                onBlur={() => onEditSubmit(node.id)}
                className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                placeholder="输入内容…"
              />
              <p className="text-xs text-muted-foreground">点击外部区域保存，Esc 取消</p>
            </div>
          ) : (node.status === "done" || node.status === "streaming") && node.content ? (
            <TermText
              content={node.content}
              onTermDoubleClick={onTermDoubleClick}
              onTermContextMenu={onTermContextMenu}
              onTermHover={onTermHover}
              onTermLeave={onTermLeave}
              className="text-muted-foreground"
            />
          ) : (
            <StatusContent
              status={node.status}
              content={node.content}
              errorMessage={node.errorMessage}
              onRetry={() => onToggleExpand(node.id)}
            />
          )}
        </div>
      )}

      {node.expanded &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedNodeId={selectedNodeId}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onTermDoubleClick={onTermDoubleClick}
            onTermContextMenu={onTermContextMenu}
            onTermHover={onTermHover}
            onTermLeave={onTermLeave}
            onPlusSelect={onPlusSelect}
            onCreateEmptyChild={onCreateEmptyChild}
            onEditContent={onEditContent}
            onDelete={onDelete}
            onRename={onRename}
            contextNodeId={contextNodeId}
            contextPos={contextPos}
            onCloseContext={onCloseContext}
            plusItems={plusItems}
            editingNodeId={editingNodeId}
            renamingNodeId={renamingNodeId}
            onEditingChange={onEditingChange}
            onEditSubmit={onEditSubmit}
            onRenameSubmit={onRenameSubmit}
            dropIndicator={dropIndicator}
            registerNodeRect={registerNodeRect}
          />
        ))}

      {hasContextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50"
          style={{ top: contextPos.y, left: contextPos.x }}
        >
          <ContextMenuContent
            onClose={onCloseContext}
            items={
              isRoot
                ? rootMenuItems(
                    () => onRename(node.id),
                    () => onCreateEmptyChild(node.id)
                  )
                : nodeMenuItems(
                    node.expanded,
                    () => onEditContent(node.id),
                    () => onToggleExpand(node.id),
                    () => onCreateEmptyChild(node.id),
                    () => onDelete(node.id)
                  )
            }
          />
        </div>
      )}
    </div>
  );
}
